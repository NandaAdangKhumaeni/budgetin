<?php
/**
 * BUDGETIN - Investment Transactions Financial Endpoint
 * GET / POST api/financial/investment_transactions.php
 */

declare(strict_types=1);

require_once __DIR__ . '/financial_helper.php';

try {
    $pdo = getDbConnection();
    $user = getAuthenticatedFinancialUser($pdo);
    $userId = (string)$user['id'];
    $rawToken = (string)$user['raw_token'];

    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    // 1. GET: List
    if ($method === 'GET') {
        $where = ["user_id = :user_id"];
        $params = ['user_id' => $userId];

        if (!empty($_GET['investment_id'])) {
            $where[] = "investment_id = :investment_id";
            $params['investment_id'] = (int)$_GET['investment_id'];
        }

        $whereClause = implode(" AND ", $where);
        $stmt = $pdo->prepare("
            SELECT *,
                   quantity AS units,
                   total_amount AS amount
            FROM investment_transactions
            WHERE $whereClause
            ORDER BY transaction_date DESC, id DESC
        ");
        $stmt->execute($params);
        $records = $stmt->fetchAll(PDO::FETCH_ASSOC);

        sendFinancialSuccess($records);
    }

    requireCsrfForMutation($userId, $rawToken);
    $input = getJsonRequestBody();
    if (empty($input)) {
        $input = $_POST;
    }

    // 2. POST: Create Investment Transaction
    if ($method === 'POST') {
        $legacyId = isset($input['legacy_id']) ? trim((string)$input['legacy_id']) : null;

        if ($legacyId !== null && $legacyId !== '') {
            $checkStmt = $pdo->prepare("SELECT * FROM investment_transactions WHERE user_id = :user_id AND legacy_id = :legacy_id LIMIT 1");
            $checkStmt->execute(['user_id' => $userId, 'legacy_id' => $legacyId]);
            $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
            if ($existing) {
                sendFinancialSuccess($existing, 200, ['idempotent' => true]);
            }
        }

        $bankId = resolveEntityId($pdo, 'banks', $input['bank_id'] ?? null, $userId);
        if (!$bankId) {
            sendFinancialError('VALIDATION_ERROR', 'Rekening bank wajib dipilih.');
        }
        assertEntityOwnership($pdo, 'banks', $bankId, $userId);

        $investmentId = resolveEntityId($pdo, 'investments', $input['investment_id'] ?? null, $userId);
        if ($investmentId) {
            assertEntityOwnership($pdo, 'investments', $investmentId, $userId);
        }

        $type = strtolower(trim((string)($input['type'] ?? '')));
        if (!in_array($type, ['buy', 'sell'], true)) {
            sendFinancialError('VALIDATION_ERROR', 'Tipe transaksi investasi harus buy atau sell.');
        }

        $assetSymbol = trim((string)($input['asset_symbol'] ?? ($input['symbol'] ?? ($input['code'] ?? ''))));
        if ($assetSymbol === '' && !empty($input['name'])) {
            $assetSymbol = strtoupper(substr(preg_replace('/[^a-zA-Z0-9]/', '', (string)$input['name']), 0, 10));
        }

        $quantity = parseDecimal($input['quantity'] ?? ($input['units'] ?? null), 4, false);
        $unit = trim((string)($input['unit'] ?? 'unit'));
        $price = parseDecimal($input['price'] ?? ($input['nav'] ?? null), 2, false);
        $totalAmount = parseDecimal($input['total_amount'] ?? ($input['amount'] ?? ($price * (float)$quantity)), 2, false);
        $costBasis = parseDecimal($input['cost_basis'] ?? '0', 2, false);
        $realizedPnl = parseDecimal($input['realized_pnl'] ?? ($input['realizedPnl'] ?? '0'), 2, true); // can be negative
        $txDate = !empty($input['transaction_date']) ? (string)$input['transaction_date'] : (!empty($input['date']) ? (string)$input['date'] : date('Y-m-d H:i:s'));

        $insertSql = "
            INSERT INTO investment_transactions (
                user_id, legacy_id, investment_id, bank_id, type, asset_symbol,
                quantity, unit, price, total_amount, cost_basis, realized_pnl,
                transaction_date, created_at
            ) VALUES (
                :user_id, :legacy_id, :investment_id, :bank_id, :type, :asset_symbol,
                :quantity, :unit, :price, :total_amount, :cost_basis, :realized_pnl,
                :transaction_date, NOW()
            )
        ";
        $stmt = $pdo->prepare($insertSql);
        $stmt->execute([
            'user_id' => $userId,
            'legacy_id' => $legacyId,
            'investment_id' => $investmentId,
            'bank_id' => $bankId,
            'type' => $type,
            'asset_symbol' => $assetSymbol,
            'quantity' => $quantity,
            'unit' => $unit,
            'price' => $price,
            'total_amount' => $totalAmount,
            'cost_basis' => $costBasis,
            'realized_pnl' => $realizedPnl,
            'transaction_date' => $txDate
        ]);

        $createdId = (int)$pdo->lastInsertId();
        $created = assertEntityOwnership($pdo, 'investment_transactions', $createdId, $userId);
        sendFinancialSuccess($created, 201);
    }

    // 3. DELETE: Delete Investment Transaction
    if ($method === 'DELETE') {
        $id = $input['id'] ?? $_GET['id'] ?? null;
        if (!$id) {
            sendFinancialError('VALIDATION_ERROR', 'ID transaksi investasi wajib disediakan.');
        }

        $existing = assertEntityOwnership($pdo, 'investment_transactions', $id, $userId);
        $realId = (int)$existing['id'];

        $stmt = $pdo->prepare("DELETE FROM investment_transactions WHERE id = :id AND user_id = :user_id");
        $stmt->execute(['id' => $realId, 'user_id' => $userId]);

        sendFinancialSuccess(['id' => $realId, 'deleted' => true]);
    }

    sendFinancialError('METHOD_NOT_ALLOWED', 'Method tidak didukung.', 405);

} catch (InvalidArgumentException $e) {
    sendFinancialError('VALIDATION_ERROR', $e->getMessage(), 400);
} catch (Throwable $e) {
    error_log('[INV_TX ERROR] ' . $e->getMessage());
    sendFinancialError('SERVER_ERROR', 'Terjadi kesalahan sistem saat memproses transaksi investasi.', 500);
}
