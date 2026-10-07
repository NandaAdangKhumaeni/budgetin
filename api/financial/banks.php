<?php
/**
 * BUDGETIN - Banks Financial Endpoint
 * GET / POST / PUT / DELETE api/financial/banks.php
 */

declare(strict_types=1);

require_once __DIR__ . '/financial_helper.php';

try {
    $pdo = getDbConnection();
    $user = getAuthenticatedFinancialUser($pdo);
    $userId = (string)$user['id'];
    $rawToken = (string)$user['raw_token'];

    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    // 1. GET: List or retrieve single bank
    if ($method === 'GET') {
        if (isset($_GET['id'])) {
            $bank = assertEntityOwnership($pdo, 'banks', $_GET['id'], $userId);
            sendFinancialSuccess($bank);
        }

        $stmt = $pdo->prepare("SELECT * FROM banks WHERE user_id = :user_id ORDER BY is_active DESC, name ASC");
        $stmt->execute(['user_id' => $userId]);
        $banks = $stmt->fetchAll(PDO::FETCH_ASSOC);

        sendFinancialSuccess($banks);
    }

    // Mutating methods require CSRF validation
    requireCsrfForMutation($userId, $rawToken);
    $input = getJsonRequestBody();
    if (empty($input)) {
        $input = $_POST;
    }

    // 2. POST: Create Bank
    if ($method === 'POST') {
        $name = trim((string)($input['name'] ?? ''));
        if ($name === '') {
            sendFinancialError('VALIDATION_ERROR', 'Nama rekening / bank wajib diisi.');
        }

        $balance = parseDecimal($input['balance'] ?? '0', 2, true);
        $isActive = isset($input['is_active']) ? (int)(bool)$input['is_active'] : 1;
        $legacyId = isset($input['legacy_id']) ? trim((string)$input['legacy_id']) : null;

        if ($legacyId !== null && $legacyId !== '') {
            $checkStmt = $pdo->prepare("SELECT * FROM banks WHERE user_id = :user_id AND legacy_id = :legacy_id LIMIT 1");
            $checkStmt->execute(['user_id' => $userId, 'legacy_id' => $legacyId]);
            $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
            if ($existing) {
                // Idempotent update
                $stmt = $pdo->prepare("
                    UPDATE banks SET name = :name, balance = :balance, is_active = :is_active, updated_at = NOW()
                    WHERE id = :id AND user_id = :user_id
                ");
                $stmt->execute([
                    'name' => $name,
                    'balance' => $balance,
                    'is_active' => $isActive,
                    'id' => $existing['id'],
                    'user_id' => $userId
                ]);
                $updated = assertEntityOwnership($pdo, 'banks', $existing['id'], $userId);
                sendFinancialSuccess($updated, 200, ['idempotent' => true]);
            }
        }

        $stmt = $pdo->prepare("
            INSERT INTO banks (user_id, legacy_id, name, balance, is_active, created_at, updated_at)
            VALUES (:user_id, :legacy_id, :name, :balance, :is_active, NOW(), NOW())
        ");
        $stmt->execute([
            'user_id' => $userId,
            'legacy_id' => $legacyId,
            'name' => $name,
            'balance' => $balance,
            'is_active' => $isActive
        ]);

        $bankId = (int)$pdo->lastInsertId();
        $createdBank = assertEntityOwnership($pdo, 'banks', $bankId, $userId);

        sendFinancialSuccess($createdBank, 201);
    }

    // 3. PUT: Update Bank
    if ($method === 'PUT') {
        $id = $input['id'] ?? $_GET['id'] ?? null;
        if (!$id) {
            sendFinancialError('VALIDATION_ERROR', 'ID rekening wajib disediakan.');
        }

        $existing = assertEntityOwnership($pdo, 'banks', $id, $userId);
        $realId = (int)$existing['id'];

        $name = isset($input['name']) ? trim((string)$input['name']) : (string)$existing['name'];
        if ($name === '') {
            sendFinancialError('VALIDATION_ERROR', 'Nama rekening / bank tidak boleh kosong.');
        }

        $balance = isset($input['balance']) ? parseDecimal($input['balance'], 2, true) : (string)$existing['balance'];
        $isActive = isset($input['is_active']) ? (int)(bool)$input['is_active'] : (int)$existing['is_active'];

        $stmt = $pdo->prepare("
            UPDATE banks
            SET name = :name, balance = :balance, is_active = :is_active, updated_at = NOW()
            WHERE id = :id AND user_id = :user_id
        ");
        $stmt->execute([
            'name' => $name,
            'balance' => $balance,
            'is_active' => $isActive,
            'id' => $realId,
            'user_id' => $userId
        ]);

        $updatedBank = assertEntityOwnership($pdo, 'banks', $realId, $userId);
        sendFinancialSuccess($updatedBank);
    }

    // 4. DELETE: Delete Bank
    if ($method === 'DELETE') {
        $id = $input['id'] ?? $_GET['id'] ?? null;
        if (!$id) {
            sendFinancialError('VALIDATION_ERROR', 'ID rekening wajib disediakan.');
        }

        $existing = assertEntityOwnership($pdo, 'banks', $id, $userId);
        $realId = (int)$existing['id'];

        $stmt = $pdo->prepare("DELETE FROM banks WHERE id = :id AND user_id = :user_id");
        $stmt->execute([
            'id' => $realId,
            'user_id' => $userId
        ]);

        sendFinancialSuccess(['id' => $realId, 'deleted' => true]);
    }

    sendFinancialError('METHOD_NOT_ALLOWED', 'Method tidak didukung.', 405);

} catch (InvalidArgumentException $e) {
    sendFinancialError('VALIDATION_ERROR', $e->getMessage(), 400);
} catch (Throwable $e) {
    error_log('[BANKS ERROR] ' . $e->getMessage());
    sendFinancialError('SERVER_ERROR', 'Terjadi kesalahan sistem saat memproses data rekening.', 500);
}
