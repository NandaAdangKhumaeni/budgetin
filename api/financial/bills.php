<?php
/**
 * BUDGETIN - Bills Financial Endpoint
 * GET / POST / PUT / DELETE api/financial/bills.php
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
        if (isset($_GET['id'])) {
            $bill = assertEntityOwnership($pdo, 'bills', $_GET['id'], $userId);
            sendFinancialSuccess($bill);
        }

        $where = ["user_id = :user_id"];
        $params = ['user_id' => $userId];

        if (!empty($_GET['status'])) {
            $where[] = "status = :status";
            $params['status'] = (string)$_GET['status'];
        }

        $whereClause = implode(" AND ", $where);
        $stmt = $pdo->prepare("SELECT * FROM bills WHERE $whereClause ORDER BY due_date ASC, id DESC");
        $stmt->execute($params);
        $bills = $stmt->fetchAll(PDO::FETCH_ASSOC);

        sendFinancialSuccess($bills);
    }

    requireCsrfForMutation($userId, $rawToken);
    $input = getJsonRequestBody();
    if (empty($input)) {
        $input = $_POST;
    }

    // 2. POST: Create Bill
    if ($method === 'POST') {
        $legacyId = isset($input['legacy_id']) ? trim((string)$input['legacy_id']) : null;

        if ($legacyId !== null && $legacyId !== '') {
            $checkStmt = $pdo->prepare("SELECT * FROM bills WHERE user_id = :user_id AND legacy_id = :legacy_id LIMIT 1");
            $checkStmt->execute(['user_id' => $userId, 'legacy_id' => $legacyId]);
            $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
            if ($existing) {
                sendFinancialSuccess($existing, 200, ['idempotent' => true]);
            }
        }

        $name = trim((string)($input['name'] ?? ''));
        if ($name === '') {
            sendFinancialError('VALIDATION_ERROR', 'Nama tagihan wajib diisi.');
        }

        $category = trim((string)($input['category'] ?? 'Tagihan'));
        $amount = parseDecimal($input['amount'] ?? null, 2, false);
        $dueDate = !empty($input['due_date']) ? (string)$input['due_date'] : (!empty($input['dueDate']) ? (string)$input['dueDate'] : date('Y-m-d'));
        $frequency = in_array($input['frequency'] ?? '', ['once', 'monthly', 'yearly'], true) ? (string)$input['frequency'] : 'monthly';
        $isRecurring = isset($input['is_recurring']) ? (int)(bool)$input['is_recurring'] : (isset($input['isRecurring']) ? (int)(bool)$input['isRecurring'] : 1);
        $status = in_array($input['status'] ?? '', ['unpaid', 'paid', 'overdue'], true) ? (string)$input['status'] : 'unpaid';
        $notes = isset($input['notes']) ? (string)$input['notes'] : null;

        $bankId = resolveEntityId($pdo, 'banks', $input['bank_id'] ?? ($input['bankId'] ?? null), $userId);
        if ($bankId) {
            assertEntityOwnership($pdo, 'banks', $bankId, $userId);
        }

        $insertSql = "
            INSERT INTO bills (
                user_id, legacy_id, bank_id, name, category, amount, due_date,
                frequency, is_recurring, status, notes, created_at, updated_at
            ) VALUES (
                :user_id, :legacy_id, :bank_id, :name, :category, :amount, :due_date,
                :frequency, :is_recurring, :status, :notes, NOW(), NOW()
            )
        ";
        $stmt = $pdo->prepare($insertSql);
        $stmt->execute([
            'user_id' => $userId,
            'legacy_id' => $legacyId,
            'bank_id' => $bankId,
            'name' => $name,
            'category' => $category,
            'amount' => $amount,
            'due_date' => $dueDate,
            'frequency' => $frequency,
            'is_recurring' => $isRecurring,
            'status' => $status,
            'notes' => $notes
        ]);

        $billId = (int)$pdo->lastInsertId();
        $created = assertEntityOwnership($pdo, 'bills', $billId, $userId);
        sendFinancialSuccess($created, 201);
    }

    // 3. PUT: Update Bill / Pay
    if ($method === 'PUT') {
        $id = $input['id'] ?? $_GET['id'] ?? null;
        if (!$id) {
            sendFinancialError('VALIDATION_ERROR', 'ID tagihan wajib disediakan.');
        }

        $existing = assertEntityOwnership($pdo, 'bills', $id, $userId);
        $realId = (int)$existing['id'];

        $name = isset($input['name']) ? trim((string)$input['name']) : (string)$existing['name'];
        $category = isset($input['category']) ? trim((string)$input['category']) : (string)($existing['category'] ?? 'Tagihan');
        $amount = isset($input['amount']) ? parseDecimal($input['amount'], 2, false) : (string)$existing['amount'];
        $status = isset($input['status']) && in_array($input['status'], ['unpaid', 'paid', 'overdue'], true) ? (string)$input['status'] : (string)$existing['status'];
        $dueDate = !empty($input['due_date']) ? (string)$input['due_date'] : (!empty($input['dueDate']) ? (string)$input['dueDate'] : (string)$existing['due_date']);
        $frequency = in_array($input['frequency'] ?? '', ['once', 'monthly', 'yearly'], true) ? (string)$input['frequency'] : (string)($existing['frequency'] ?? 'once');
        $isRecurring = isset($input['is_recurring']) ? (int)(bool)$input['is_recurring'] : (isset($input['isRecurring']) ? (int)(bool)$input['isRecurring'] : (int)($existing['is_recurring'] ?? 0));
        $notes = array_key_exists('notes', $input) ? ($input['notes'] !== null ? (string)$input['notes'] : null) : $existing['notes'];

        $rawBankId = $input['bank_id'] ?? ($input['bankId'] ?? null);
        $bankId = ($rawBankId !== null && $rawBankId !== '') ? resolveEntityId($pdo, 'banks', $rawBankId, $userId) : (array_key_exists('bank_id', $input) || array_key_exists('bankId', $input) ? null : ($existing['bank_id'] ? (int)$existing['bank_id'] : null));
        if ($bankId) {
            assertEntityOwnership($pdo, 'banks', $bankId, $userId);
        }

        $paidDate = isset($input['paid_date']) ? (string)$input['paid_date'] : (isset($input['paidDate']) ? (string)$input['paidDate'] : $existing['paid_date']);
        $paidAt = ($status === 'paid' && empty($existing['paid_at'])) ? date('Y-m-d H:i:s') : ($status !== 'paid' ? null : $existing['paid_at']);

        $stmt = $pdo->prepare("
            UPDATE bills
            SET name = :name, category = :category, amount = :amount, status = :status, due_date = :due_date,
                frequency = :frequency, is_recurring = :is_recurring, notes = :notes, bank_id = :bank_id,
                paid_date = :paid_date, paid_at = :paid_at, updated_at = NOW()
            WHERE id = :id AND user_id = :user_id
        ");
        $stmt->execute([
            'name' => $name,
            'category' => $category,
            'amount' => $amount,
            'status' => $status,
            'due_date' => $dueDate,
            'frequency' => $frequency,
            'is_recurring' => $isRecurring,
            'notes' => $notes,
            'bank_id' => $bankId,
            'paid_date' => $paidDate,
            'paid_at' => $paidAt,
            'id' => $realId,
            'user_id' => $userId
        ]);

        $updated = assertEntityOwnership($pdo, 'bills', $realId, $userId);
        sendFinancialSuccess($updated);
    }

    // 4. DELETE: Delete Bill
    if ($method === 'DELETE') {
        $id = $input['id'] ?? $_GET['id'] ?? null;
        if (!$id) {
            sendFinancialError('VALIDATION_ERROR', 'ID tagihan wajib disediakan.');
        }

        $existing = assertEntityOwnership($pdo, 'bills', $id, $userId);
        $realId = (int)$existing['id'];

        $stmt = $pdo->prepare("DELETE FROM bills WHERE id = :id AND user_id = :user_id");
        $stmt->execute(['id' => $realId, 'user_id' => $userId]);

        sendFinancialSuccess(['id' => $realId, 'deleted' => true]);
    }

    sendFinancialError('METHOD_NOT_ALLOWED', 'Method tidak didukung.', 405);

} catch (InvalidArgumentException $e) {
    sendFinancialError('VALIDATION_ERROR', $e->getMessage(), 400);
} catch (Throwable $e) {
    error_log('[BILLS ERROR] ' . $e->getMessage());
    sendFinancialError('SERVER_ERROR', 'Terjadi kesalahan sistem saat memproses tagihan.', 500);
}
