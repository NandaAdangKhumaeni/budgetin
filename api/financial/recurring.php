<?php
/**
 * BUDGETIN - Recurring Transactions Financial Endpoint
 * GET / POST / PUT / DELETE api/financial/recurring.php
 */

declare(strict_types=1);

require_once __DIR__ . '/financial_helper.php';

try {
    $pdo = getDbConnection();
    $user = getAuthenticatedFinancialUser($pdo);
    $userId = (string)$user['id'];
    $rawToken = (string)$user['raw_token'];

    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    // 1. GET: List or retrieve single recurring definition
    if ($method === 'GET') {
        if (isset($_GET['id'])) {
            $rec = assertEntityOwnership($pdo, 'recurring_transactions', $_GET['id'], $userId);
            sendFinancialSuccess($rec);
        }

        $stmt = $pdo->prepare("SELECT *, frequency AS `interval` FROM recurring_transactions WHERE user_id = :user_id ORDER BY next_date ASC, id DESC");
        $stmt->execute(['user_id' => $userId]);
        $recurring = $stmt->fetchAll(PDO::FETCH_ASSOC);

        sendFinancialSuccess($recurring);
    }

    requireCsrfForMutation($userId, $rawToken);
    $input = getJsonRequestBody();
    if (empty($input)) {
        $input = $_POST;
    }

    // 2. POST: Create Recurring Transaction
    if ($method === 'POST') {
        $legacyId = isset($input['legacy_id']) ? trim((string)$input['legacy_id']) : null;

        if ($legacyId !== null && $legacyId !== '') {
            $checkStmt = $pdo->prepare("SELECT * FROM recurring_transactions WHERE user_id = :user_id AND legacy_id = :legacy_id LIMIT 1");
            $checkStmt->execute(['user_id' => $userId, 'legacy_id' => $legacyId]);
            $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
            if ($existing) {
                sendFinancialSuccess($existing, 200, ['idempotent' => true]);
            }
        }

        $bankId = resolveEntityId($pdo, 'banks', $input['bank_id'] ?? ($input['bankId'] ?? null), $userId);
        if (!$bankId) {
            sendFinancialError('VALIDATION_ERROR', 'Rekening bank wajib dipilih.');
        }
        assertEntityOwnership($pdo, 'banks', $bankId, $userId);

        $name = trim((string)($input['name'] ?? ''));
        if ($name === '') {
            sendFinancialError('VALIDATION_ERROR', 'Nama transaksi rutin wajib diisi.');
        }

        $type = (string)($input['type'] ?? '');
        if (!in_array($type, ['income', 'expense'], true)) {
            sendFinancialError('VALIDATION_ERROR', 'Tipe transaksi rutin harus income atau expense.');
        }

        $category = trim((string)($input['category'] ?? ''));
        $amount = parseDecimal($input['amount'] ?? null, 2, false);
        $frequency = in_array($input['frequency'] ?? '', ['daily', 'weekly', 'monthly', 'yearly'], true) ? (string)$input['frequency'] : 'monthly';
        $nextDate = !empty($input['next_date']) ? (string)$input['next_date'] : (!empty($input['nextOccurrence']) ? (string)$input['nextOccurrence'] : date('Y-m-d'));
        $isActive = isset($input['is_active']) ? (int)(bool)$input['is_active'] : (isset($input['active']) ? (int)(bool)$input['active'] : 1);

        $insertSql = "
            INSERT INTO recurring_transactions (
                user_id, legacy_id, bank_id, name, type, category,
                amount, frequency, next_date, is_active, created_at
            ) VALUES (
                :user_id, :legacy_id, :bank_id, :name, :type, :category,
                :amount, :frequency, :next_date, :is_active, NOW()
            )
        ";
        $stmt = $pdo->prepare($insertSql);
        $stmt->execute([
            'user_id' => $userId,
            'legacy_id' => $legacyId,
            'bank_id' => $bankId,
            'name' => $name,
            'type' => $type,
            'category' => $category,
            'amount' => $amount,
            'frequency' => $frequency,
            'next_date' => $nextDate,
            'is_active' => $isActive
        ]);

        $recId = (int)$pdo->lastInsertId();
        $created = assertEntityOwnership($pdo, 'recurring_transactions', $recId, $userId);
        sendFinancialSuccess($created, 201);
    }

    // 3. PUT: Update Recurring Transaction
    if ($method === 'PUT') {
        $id = $input['id'] ?? $_GET['id'] ?? null;
        if (!$id) {
            sendFinancialError('VALIDATION_ERROR', 'ID transaksi rutin wajib disediakan.');
        }

        $existing = assertEntityOwnership($pdo, 'recurring_transactions', $id, $userId);
        $realId = (int)$existing['id'];

        $name = isset($input['name']) ? trim((string)$input['name']) : (string)$existing['name'];
        $amount = isset($input['amount']) ? parseDecimal($input['amount'], 2, false) : (string)$existing['amount'];
        $nextDate = !empty($input['next_date']) ? (string)$input['next_date'] : (!empty($input['nextOccurrence']) ? (string)$input['nextOccurrence'] : (string)$existing['next_date']);
        $isActive = isset($input['is_active']) ? (int)(bool)$input['is_active'] : (isset($input['active']) ? (int)(bool)$input['active'] : (int)$existing['is_active']);

        $stmt = $pdo->prepare("
            UPDATE recurring_transactions
            SET name = :name, amount = :amount, next_date = :next_date, is_active = :is_active
            WHERE id = :id AND user_id = :user_id
        ");
        $stmt->execute([
            'name' => $name,
            'amount' => $amount,
            'next_date' => $nextDate,
            'is_active' => $isActive,
            'id' => $realId,
            'user_id' => $userId
        ]);

        $updated = assertEntityOwnership($pdo, 'recurring_transactions', $realId, $userId);
        sendFinancialSuccess($updated);
    }

    // 4. DELETE: Delete Recurring Transaction
    if ($method === 'DELETE') {
        $id = $input['id'] ?? $_GET['id'] ?? null;
        if (!$id) {
            sendFinancialError('VALIDATION_ERROR', 'ID transaksi rutin wajib disediakan.');
        }

        $existing = assertEntityOwnership($pdo, 'recurring_transactions', $id, $userId);
        $realId = (int)$existing['id'];

        $stmt = $pdo->prepare("DELETE FROM recurring_transactions WHERE id = :id AND user_id = :user_id");
        $stmt->execute(['id' => $realId, 'user_id' => $userId]);

        sendFinancialSuccess(['id' => $realId, 'deleted' => true]);
    }

    sendFinancialError('METHOD_NOT_ALLOWED', 'Method tidak didukung.', 405);

} catch (InvalidArgumentException $e) {
    sendFinancialError('VALIDATION_ERROR', $e->getMessage(), 400);
} catch (Throwable $e) {
    error_log('[RECURRING ERROR] ' . $e->getMessage());
    sendFinancialError('SERVER_ERROR', 'Terjadi kesalahan sistem saat memproses transaksi rutin.', 500);
}
