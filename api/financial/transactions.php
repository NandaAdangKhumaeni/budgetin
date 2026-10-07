<?php
/**
 * BUDGETIN - Transactions Financial Endpoint
 * GET / POST / PUT / DELETE api/financial/transactions.php
 */

declare(strict_types=1);

require_once __DIR__ . '/financial_helper.php';

try {
    $pdo = getDbConnection();
    $user = getAuthenticatedFinancialUser($pdo);
    $userId = (string)$user['id'];
    $rawToken = (string)$user['raw_token'];

    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    // 1. GET: List or retrieve single transaction
    if ($method === 'GET') {
        if (isset($_GET['id'])) {
            $tx = assertEntityOwnership($pdo, 'transactions', $_GET['id'], $userId);
            sendFinancialSuccess($tx);
        }

        $pagination = getPaginationParams(50, 200);
        $where = ["user_id = :user_id"];
        $params = ['user_id' => $userId];

        if (!empty($_GET['type'])) {
            $where[] = "type = :type";
            $params['type'] = (string)$_GET['type'];
        }

        if (!empty($_GET['category'])) {
            $where[] = "category = :category";
            $params['category'] = (string)$_GET['category'];
        }

        if (!empty($_GET['bank_id'])) {
            $where[] = "bank_id = :bank_id";
            $params['bank_id'] = resolveEntityId($pdo, 'banks', $_GET['bank_id'], $userId) ?? (int)$_GET['bank_id'];
        }

        if (!empty($_GET['start_date'])) {
            $where[] = "transaction_date >= :start_date";
            $params['start_date'] = (string)$_GET['start_date'];
        }

        if (!empty($_GET['end_date'])) {
            $where[] = "transaction_date <= :end_date";
            $params['end_date'] = (string)$_GET['end_date'];
        }

        $whereClause = implode(" AND ", $where);

        // Count total
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM transactions WHERE $whereClause");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        // Fetch page
        $sql = "SELECT transactions.*, (SELECT name FROM banks WHERE banks.id = transactions.bank_id LIMIT 1) AS bank_name FROM transactions WHERE $whereClause ORDER BY transaction_date DESC, id DESC LIMIT :limit OFFSET :offset";
        $stmt = $pdo->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue(":$k", $v);
        }
        $stmt->bindValue(':limit', $pagination['limit'], PDO::PARAM_INT);
        $stmt->bindValue(':offset', $pagination['offset'], PDO::PARAM_INT);
        $stmt->execute();
        $transactions = $stmt->fetchAll(PDO::FETCH_ASSOC);

        sendFinancialSuccess($transactions, 200, [
            'pagination' => [
                'total' => $total,
                'page' => $pagination['page'],
                'limit' => $pagination['limit']
            ]
        ]);
    }

    // Mutating methods require CSRF validation
    requireCsrfForMutation($userId, $rawToken);
    $input = getJsonRequestBody();
    if (empty($input)) {
        $input = $_POST;
    }

    // 2. POST: Create Transaction
    if ($method === 'POST') {
        $type = (string)($input['type'] ?? '');
        $allowedTypes = ['income', 'expense', 'transfer', 'investment_buy', 'investment_sell'];
        if (!in_array($type, $allowedTypes, true)) {
            sendFinancialError('VALIDATION_ERROR', 'Tipe transaksi tidak valid.');
        }

        $amount = parseDecimal($input['amount'] ?? null, 2, false);
        if ((float)$amount <= 0) {
            sendFinancialError('VALIDATION_ERROR', 'Nominal transaksi harus lebih dari 0.');
        }

        $category = trim((string)($input['category'] ?? ''));
        $description = trim((string)($input['description'] ?? ''));
        $transactionDate = !empty($input['transaction_date']) ? (string)$input['transaction_date'] : (!empty($input['date']) ? substr((string)$input['date'], 0, 10) : date('Y-m-d'));
        $note = isset($input['note']) ? (string)$input['note'] : null;
        $paymentMethod = $input['payment_method'] ?? $input['paymentMethod'] ?? null;
        $source = in_array($input['source'] ?? '', ['manual', 'bill', 'recurring'], true) ? (string)$input['source'] : 'manual';
        $billId = !empty($input['bill_id']) ? (int)$input['bill_id'] : null;
        $recurringId = !empty($input['recurring_id']) ? (int)$input['recurring_id'] : null;
        $legacyId = isset($input['legacy_id']) ? trim((string)$input['legacy_id']) : null;

        // Idempotency: If transaction with legacy_id already exists, return it without repeating balance deduction
        if ($legacyId !== null && $legacyId !== '') {
            $checkStmt = $pdo->prepare("SELECT * FROM transactions WHERE user_id = :user_id AND legacy_id = :legacy_id LIMIT 1");
            $checkStmt->execute(['user_id' => $userId, 'legacy_id' => $legacyId]);
            $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
            if ($existing) {
                sendFinancialSuccess($existing, 200, ['idempotent' => true]);
            }
        }

        $pdo->beginTransaction();

        try {
            if ($type === 'transfer') {
                $rawSource = $input['source_bank_id'] ?? $input['sourceBankId'] ?? null;
                $rawDest = $input['destination_bank_id'] ?? $input['destinationBankId'] ?? null;
                $sourceBankId = resolveEntityId($pdo, 'banks', $rawSource, $userId);
                $destBankId = resolveEntityId($pdo, 'banks', $rawDest, $userId);
                $adminFee = parseDecimal($input['admin_fee'] ?? '0', 2, false);

                if (!$sourceBankId && $rawSource !== null && $rawSource !== '') {
                    $srcName = trim((string)($input['source_bank_name'] ?? ('Rekening ' . $rawSource)));
                    $insBank = $pdo->prepare("INSERT INTO banks (user_id, legacy_id, name, balance, is_active, created_at, updated_at) VALUES (:user_id, :legacy_id, :name, 0.00, 1, NOW(), NOW())");
                    $insBank->execute(['user_id' => $userId, 'legacy_id' => (string)$rawSource, 'name' => $srcName]);
                    $sourceBankId = (int)$pdo->lastInsertId();
                }

                if (!$destBankId && $rawDest !== null && $rawDest !== '') {
                    $dstName = trim((string)($input['destination_bank_name'] ?? ('Rekening ' . $rawDest)));
                    $insBank = $pdo->prepare("INSERT INTO banks (user_id, legacy_id, name, balance, is_active, created_at, updated_at) VALUES (:user_id, :legacy_id, :name, 0.00, 1, NOW(), NOW())");
                    $insBank->execute(['user_id' => $userId, 'legacy_id' => (string)$rawDest, 'name' => $dstName]);
                    $destBankId = (int)$pdo->lastInsertId();
                }

                if (!$sourceBankId || !$destBankId) {
                    throw new InvalidArgumentException('Rekening asal dan tujuan wajib disediakan untuk transfer.');
                }
                if ($sourceBankId === $destBankId) {
                    throw new InvalidArgumentException('Rekening asal dan tujuan tidak boleh sama.');
                }

                // Verify and lock both banks
                $bankStmt = $pdo->prepare("SELECT id, balance FROM banks WHERE id IN (:src, :dst) AND user_id = :user_id FOR UPDATE");
                $bankStmt->execute(['src' => $sourceBankId, 'dst' => $destBankId, 'user_id' => $userId]);
                $lockedBanks = $bankStmt->fetchAll(PDO::FETCH_KEY_PAIR);

                if (!isset($lockedBanks[$sourceBankId]) || !isset($lockedBanks[$destBankId])) {
                    throw new InvalidArgumentException('Salah satu rekening tidak ditemukan atau bukan milik Anda.');
                }

                $totalDeduction = (float)$amount + (float)$adminFee;
                if ((float)$lockedBanks[$sourceBankId] < $totalDeduction) {
                    throw new InvalidArgumentException('Saldo rekening asal tidak mencukupi untuk transfer.');
                }

                // Update source bank balance
                $pdo->prepare("UPDATE banks SET balance = balance - :deduction, updated_at = NOW() WHERE id = :id AND user_id = :user_id")
                    ->execute(['deduction' => $totalDeduction, 'id' => $sourceBankId, 'user_id' => $userId]);

                // Update destination bank balance
                $pdo->prepare("UPDATE banks SET balance = balance + :amount, updated_at = NOW() WHERE id = :id AND user_id = :user_id")
                    ->execute(['amount' => $amount, 'id' => $destBankId, 'user_id' => $userId]);

                $bankId = $sourceBankId;
            } else {
                $rawBankId = $input['bank_id'] ?? $input['bankId'] ?? null;
                $bankId = resolveEntityId($pdo, 'banks', $rawBankId, $userId);
                if (!$bankId && $rawBankId !== null && $rawBankId !== '') {
                    $bankName = trim((string)($input['bank_name'] ?? $input['bankName'] ?? ''));
                    if ($bankName === '') {
                        $bankName = 'Rekening ' . $rawBankId;
                    }
                    $insBank = $pdo->prepare("
                        INSERT INTO banks (user_id, legacy_id, name, balance, is_active, created_at, updated_at)
                        VALUES (:user_id, :legacy_id, :name, 0.00, 1, NOW(), NOW())
                    ");
                    $insBank->execute([
                        'user_id' => $userId,
                        'legacy_id' => (string)$rawBankId,
                        'name' => $bankName
                    ]);
                    $bankId = (int)$pdo->lastInsertId();
                }

                if (!$bankId) {
                    throw new InvalidArgumentException('Rekening / bank wajib dipilih.');
                }

                // Lock bank
                $bankStmt = $pdo->prepare("SELECT id, balance FROM banks WHERE id = :id AND user_id = :user_id FOR UPDATE");
                $bankStmt->execute(['id' => $bankId, 'user_id' => $userId]);
                $bank = $bankStmt->fetch(PDO::FETCH_ASSOC);

                if (!$bank) {
                    throw new InvalidArgumentException('Rekening tidak ditemukan atau bukan milik Anda.');
                }

                $sourceBankId = null;
                $destBankId = null;
                $adminFee = '0.00';


                // Balance impact
                if ($type === 'income' || $type === 'investment_sell') {
                    $pdo->prepare("UPDATE banks SET balance = balance + :amount, updated_at = NOW() WHERE id = :id AND user_id = :user_id")
                        ->execute(['amount' => $amount, 'id' => $bankId, 'user_id' => $userId]);
                } elseif ($type === 'expense' || $type === 'investment_buy') {
                    $pdo->prepare("UPDATE banks SET balance = balance - :amount, updated_at = NOW() WHERE id = :id AND user_id = :user_id")
                        ->execute(['amount' => $amount, 'id' => $bankId, 'user_id' => $userId]);
                }
            }

            // Insert transaction record
            $insertSql = "
                INSERT INTO transactions (
                    user_id, legacy_id, bank_id, source_bank_id, destination_bank_id,
                    admin_fee, type, category, description, amount,
                    transaction_date, note, payment_method, source, bill_id, recurring_id, created_at
                ) VALUES (
                    :user_id, :legacy_id, :bank_id, :source_bank_id, :destination_bank_id,
                    :admin_fee, :type, :category, :description, :amount,
                    :transaction_date, :note, :payment_method, :source, :bill_id, :recurring_id, NOW()
                )
            ";
            $insStmt = $pdo->prepare($insertSql);
            $insStmt->execute([
                'user_id' => $userId,
                'legacy_id' => $legacyId,
                'bank_id' => $bankId,
                'source_bank_id' => $sourceBankId,
                'destination_bank_id' => $destBankId,
                'admin_fee' => $adminFee,
                'type' => $type,
                'category' => $category,
                'description' => $description,
                'amount' => $amount,
                'transaction_date' => $transactionDate,
                'note' => $note,
                'payment_method' => $paymentMethod,
                'source' => $source,
                'bill_id' => $billId,
                'recurring_id' => $recurringId
            ]);

            $txId = (int)$pdo->lastInsertId();
            $pdo->commit();

            $createdTx = assertEntityOwnership($pdo, 'transactions', $txId, $userId);
            sendFinancialSuccess($createdTx, 201);

        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    // 3. PUT: Update Transaction details (non-balance altering fields)
    if ($method === 'PUT') {
        $id = $input['id'] ?? $_GET['id'] ?? null;
        if (!$id) {
            sendFinancialError('VALIDATION_ERROR', 'ID transaksi wajib disediakan.');
        }

        $existing = assertEntityOwnership($pdo, 'transactions', $id, $userId);
        $realId = (int)$existing['id'];

        $category = isset($input['category']) ? trim((string)$input['category']) : (string)$existing['category'];
        $description = isset($input['description']) ? trim((string)$input['description']) : (string)$existing['description'];
        $note = isset($input['note']) ? (string)$input['note'] : (string)$existing['note'];
        $transactionDate = !empty($input['transaction_date']) ? (string)$input['transaction_date'] : (!empty($input['date']) ? substr((string)$input['date'], 0, 10) : (string)$existing['transaction_date']);

        $stmt = $pdo->prepare("
            UPDATE transactions
            SET category = :category, description = :description, note = :note, transaction_date = :transaction_date
            WHERE id = :id AND user_id = :user_id
        ");
        $stmt->execute([
            'category' => $category,
            'description' => $description,
            'note' => $note,
            'transaction_date' => $transactionDate,
            'id' => $realId,
            'user_id' => $userId
        ]);

        $updatedTx = assertEntityOwnership($pdo, 'transactions', $realId, $userId);
        sendFinancialSuccess($updatedTx);
    }

    // 4. DELETE: Delete Transaction with atomic balance reversal
    if ($method === 'DELETE') {
        $id = $input['id'] ?? $_GET['id'] ?? null;
        if (!$id) {
            sendFinancialError('VALIDATION_ERROR', 'ID transaksi wajib disediakan.');
        }

        $pdo->beginTransaction();
        try {
            $tx = assertEntityOwnership($pdo, 'transactions', $id, $userId);
            $realId = (int)$tx['id'];
            $type = (string)$tx['type'];
            $amount = (float)$tx['amount'];
            $adminFee = (float)$tx['admin_fee'];

            if ($type === 'transfer') {
                $srcId = $tx['source_bank_id'];
                $dstId = $tx['destination_bank_id'];

                if ($srcId) {
                    $pdo->prepare("UPDATE banks SET balance = balance + :refund, updated_at = NOW() WHERE id = :id AND user_id = :user_id")
                        ->execute(['refund' => $amount + $adminFee, 'id' => $srcId, 'user_id' => $userId]);
                }
                if ($dstId) {
                    $pdo->prepare("UPDATE banks SET balance = balance - :deduct, updated_at = NOW() WHERE id = :id AND user_id = :user_id")
                        ->execute(['deduct' => $amount, 'id' => $dstId, 'user_id' => $userId]);
                }
            } elseif ($type === 'income' || $type === 'investment_sell') {
                $pdo->prepare("UPDATE banks SET balance = balance - :amount, updated_at = NOW() WHERE id = :id AND user_id = :user_id")
                    ->execute(['amount' => $amount, 'id' => $tx['bank_id'], 'user_id' => $userId]);
            } elseif ($type === 'expense' || $type === 'investment_buy') {
                $pdo->prepare("UPDATE banks SET balance = balance + :amount, updated_at = NOW() WHERE id = :id AND user_id = :user_id")
                    ->execute(['amount' => $amount, 'id' => $tx['bank_id'], 'user_id' => $userId]);
            }

            $delStmt = $pdo->prepare("DELETE FROM transactions WHERE id = :id AND user_id = :user_id");
            $delStmt->execute(['id' => $realId, 'user_id' => $userId]);

            $pdo->commit();
            sendFinancialSuccess(['id' => $realId, 'deleted' => true]);


        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    sendFinancialError('METHOD_NOT_ALLOWED', 'Method tidak didukung.', 405);

} catch (InvalidArgumentException $e) {
    sendFinancialError('VALIDATION_ERROR', $e->getMessage(), 400);
} catch (Throwable $e) {
    error_log('[TRANSACTIONS ERROR] ' . $e->getMessage());
    sendFinancialError('SERVER_ERROR', 'Terjadi kesalahan sistem saat memproses transaksi.', 500);
}
