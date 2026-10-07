<?php
/**
 * BUDGETIN - Goals Financial Endpoint
 * GET / POST / PUT / DELETE api/financial/goals.php
 */

declare(strict_types=1);

require_once __DIR__ . '/financial_helper.php';

try {
    $pdo = getDbConnection();
    $user = getAuthenticatedFinancialUser($pdo);
    $userId = (string)$user['id'];
    $rawToken = (string)$user['raw_token'];

    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    // 1. GET: List or retrieve single goal
    if ($method === 'GET') {
        if (isset($_GET['id'])) {
            $goal = assertEntityOwnership($pdo, 'goals', $_GET['id'], $userId);
            sendFinancialSuccess($goal);
        }

        $stmt = $pdo->prepare("SELECT * FROM goals WHERE user_id = :user_id ORDER BY target_date ASC, id DESC");
        $stmt->execute(['user_id' => $userId]);
        $goals = $stmt->fetchAll(PDO::FETCH_ASSOC);

        sendFinancialSuccess($goals);
    }

    requireCsrfForMutation($userId, $rawToken);
    $input = getJsonRequestBody();
    if (empty($input)) {
        $input = $_POST;
    }

    // 2. POST: Create Goal
    if ($method === 'POST') {
        $legacyId = isset($input['legacy_id']) ? trim((string)$input['legacy_id']) : null;

        if ($legacyId !== null && $legacyId !== '') {
            $checkStmt = $pdo->prepare("SELECT * FROM goals WHERE user_id = :user_id AND legacy_id = :legacy_id LIMIT 1");
            $checkStmt->execute(['user_id' => $userId, 'legacy_id' => $legacyId]);
            $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
            if ($existing) {
                sendFinancialSuccess($existing, 200, ['idempotent' => true]);
            }
        }

        $name = trim((string)($input['name'] ?? ''));
        if ($name === '') {
            sendFinancialError('VALIDATION_ERROR', 'Nama target impian wajib diisi.');
        }

        $targetAmount = parseDecimal($input['target_amount'] ?? ($input['target'] ?? null), 2, false);
        $currentAmount = parseDecimal($input['current_amount'] ?? ($input['current'] ?? '0'), 2, false);
        $monthlyContribution = parseDecimal($input['monthly_contribution'] ?? ($input['monthly'] ?? '0'), 2, false);
        $targetDate = !empty($input['target_date']) ? (string)$input['target_date'] : (!empty($input['targetDate']) ? (string)$input['targetDate'] : date('Y-m-d', strtotime('+1 year')));

        $bankId = resolveEntityId($pdo, 'banks', $input['bank_id'] ?? ($input['bankId'] ?? null), $userId);
        if ($bankId) {
            assertEntityOwnership($pdo, 'banks', $bankId, $userId);
        }

        $insertSql = "
            INSERT INTO goals (
                user_id, legacy_id, bank_id, name, target_amount, current_amount,
                target_date, monthly_contribution, created_at, updated_at
            ) VALUES (
                :user_id, :legacy_id, :bank_id, :name, :target_amount, :current_amount,
                :target_date, :monthly_contribution, NOW(), NOW()
            )
        ";
        $stmt = $pdo->prepare($insertSql);
        $stmt->execute([
            'user_id' => $userId,
            'legacy_id' => $legacyId,
            'bank_id' => $bankId,
            'name' => $name,
            'target_amount' => $targetAmount,
            'current_amount' => $currentAmount,
            'target_date' => $targetDate,
            'monthly_contribution' => $monthlyContribution
        ]);

        $goalId = (int)$pdo->lastInsertId();
        $created = assertEntityOwnership($pdo, 'goals', $goalId, $userId);
        sendFinancialSuccess($created, 201);
    }

    // 3. PUT: Update Goal
    if ($method === 'PUT') {
        $id = $input['id'] ?? $_GET['id'] ?? null;
        if (!$id) {
            sendFinancialError('VALIDATION_ERROR', 'ID target impian wajib disediakan.');
        }

        $existing = assertEntityOwnership($pdo, 'goals', $id, $userId);
        $realId = (int)$existing['id'];

        $name = isset($input['name']) ? trim((string)$input['name']) : (string)$existing['name'];
        $targetAmount = isset($input['target_amount']) ? parseDecimal($input['target_amount'], 2, false) : (isset($input['target']) ? parseDecimal($input['target'], 2, false) : (string)$existing['target_amount']);
        $currentAmount = isset($input['current_amount']) ? parseDecimal($input['current_amount'], 2, false) : (isset($input['current']) ? parseDecimal($input['current'], 2, false) : (string)$existing['current_amount']);
        $monthlyContribution = isset($input['monthly_contribution']) ? parseDecimal($input['monthly_contribution'], 2, false) : (isset($input['monthly']) ? parseDecimal($input['monthly'], 2, false) : (string)$existing['monthly_contribution']);
        $targetDate = !empty($input['target_date']) ? (string)$input['target_date'] : (!empty($input['targetDate']) ? (string)$input['targetDate'] : (string)$existing['target_date']);

        $stmt = $pdo->prepare("
            UPDATE goals
            SET name = :name, target_amount = :target_amount, current_amount = :current_amount,
                monthly_contribution = :monthly_contribution, target_date = :target_date, updated_at = NOW()
            WHERE id = :id AND user_id = :user_id
        ");
        $stmt->execute([
            'name' => $name,
            'target_amount' => $targetAmount,
            'current_amount' => $currentAmount,
            'monthly_contribution' => $monthlyContribution,
            'target_date' => $targetDate,
            'id' => $realId,
            'user_id' => $userId
        ]);

        $updated = assertEntityOwnership($pdo, 'goals', $realId, $userId);
        sendFinancialSuccess($updated);
    }

    // 4. DELETE: Delete Goal
    if ($method === 'DELETE') {
        $id = $input['id'] ?? $_GET['id'] ?? null;
        if (!$id) {
            sendFinancialError('VALIDATION_ERROR', 'ID target impian wajib disediakan.');
        }

        $existing = assertEntityOwnership($pdo, 'goals', $id, $userId);
        $realId = (int)$existing['id'];

        $stmt = $pdo->prepare("DELETE FROM goals WHERE id = :id AND user_id = :user_id");
        $stmt->execute(['id' => $realId, 'user_id' => $userId]);

        sendFinancialSuccess(['id' => $realId, 'deleted' => true]);
    }

    sendFinancialError('METHOD_NOT_ALLOWED', 'Method tidak didukung.', 405);

} catch (InvalidArgumentException $e) {
    sendFinancialError('VALIDATION_ERROR', $e->getMessage(), 400);
} catch (Throwable $e) {
    error_log('[GOALS ERROR] ' . $e->getMessage());
    sendFinancialError('SERVER_ERROR', 'Terjadi kesalahan sistem saat memproses target impian.', 500);
}
