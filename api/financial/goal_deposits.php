<?php
/**
 * BUDGETIN - Goal Deposits Financial Endpoint
 * GET / POST api/financial/goal_deposits.php
 */

declare(strict_types=1);

require_once __DIR__ . '/financial_helper.php';

try {
    $pdo = getDbConnection();
    $user = getAuthenticatedFinancialUser($pdo);
    $userId = (string)$user['id'];
    $rawToken = (string)$user['raw_token'];

    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    // 1. GET: List deposits for a goal or all deposits of authenticated user
    if ($method === 'GET') {
        $goalIdParam = $_GET['goal_id'] ?? null;
        if ($goalIdParam !== null && $goalIdParam !== '') {
            $goalId = resolveEntityId($pdo, 'goals', $goalIdParam, $userId) ?? (is_numeric($goalIdParam) ? (int)$goalIdParam : 0);
            assertEntityOwnership($pdo, 'goals', $goalId, $userId);

            $stmt = $pdo->prepare("SELECT * FROM goal_deposits WHERE goal_id = :goal_id AND user_id = :user_id ORDER BY deposit_date DESC, id DESC");
            $stmt->execute(['goal_id' => $goalId, 'user_id' => $userId]);
        } else {
            $stmt = $pdo->prepare("SELECT * FROM goal_deposits WHERE user_id = :user_id ORDER BY deposit_date DESC, id DESC");
            $stmt->execute(['user_id' => $userId]);
        }
        $deposits = $stmt->fetchAll(PDO::FETCH_ASSOC);

        sendFinancialSuccess($deposits);
    }

    requireCsrfForMutation($userId, $rawToken);
    $input = getJsonRequestBody();
    if (empty($input)) {
        $input = $_POST;
    }

    // 2. POST: Record Goal Deposit
    if ($method === 'POST') {
        $legacyId = isset($input['legacy_id']) ? trim((string)$input['legacy_id']) : null;

        if ($legacyId !== null && $legacyId !== '') {
            $checkStmt = $pdo->prepare("SELECT * FROM goal_deposits WHERE user_id = :user_id AND legacy_id = :legacy_id LIMIT 1");
            $checkStmt->execute(['user_id' => $userId, 'legacy_id' => $legacyId]);
            $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
            if ($existing) {
                sendFinancialSuccess($existing, 200, ['idempotent' => true]);
            }
        }

        $goalId = resolveEntityId($pdo, 'goals', $input['goal_id'] ?? ($input['goalId'] ?? null), $userId);
        if (!$goalId) {
            sendFinancialError('VALIDATION_ERROR', 'ID target impian (goal_id) wajib ditentukan.');
        }

        $amount = parseDecimal($input['amount'] ?? null, 2, false);
        if ((float)$amount <= 0) {
            sendFinancialError('VALIDATION_ERROR', 'Nominal setoran harus lebih dari 0.');
        }

        $depositDate = !empty($input['deposit_date']) ? (string)$input['deposit_date'] : (!empty($input['date']) ? (string)$input['date'] : date('Y-m-d'));
        $note = isset($input['note']) ? (string)$input['note'] : null;

        $pdo->beginTransaction();

        try {
            // Lock and verify ownership of parent goal
            $stmt = $pdo->prepare("SELECT id, current_amount, target_amount FROM goals WHERE id = :id AND user_id = :user_id FOR UPDATE");
            $stmt->execute(['id' => $goalId, 'user_id' => $userId]);
            $goal = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$goal) {
                throw new InvalidArgumentException('Target impian tidak ditemukan atau bukan milik Anda.');
            }

            // Insert deposit record
            $insStmt = $pdo->prepare("
                INSERT INTO goal_deposits (goal_id, user_id, legacy_id, amount, deposit_date, note, created_at)
                VALUES (:goal_id, :user_id, :legacy_id, :amount, :deposit_date, :note, NOW())
            ");
            $insStmt->execute([
                'goal_id' => $goalId,
                'user_id' => $userId,
                'legacy_id' => $legacyId,
                'amount' => $amount,
                'deposit_date' => $depositDate,
                'note' => $note
            ]);

            $depId = (int)$pdo->lastInsertId();

            // Increment goal current_amount
            $updGoal = $pdo->prepare("UPDATE goals SET current_amount = current_amount + :amount, updated_at = NOW() WHERE id = :id AND user_id = :user_id");
            $updGoal->execute(['amount' => $amount, 'id' => $goalId, 'user_id' => $userId]);

            $pdo->commit();

            $createdDeposit = assertEntityOwnership($pdo, 'goal_deposits', $depId, $userId);
            sendFinancialSuccess($createdDeposit, 201);

        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    // 3. DELETE: Delete Goal Deposit with atomic amount decrement
    if ($method === 'DELETE') {
        $id = $input['id'] ?? $_GET['id'] ?? null;
        if (!$id) {
            sendFinancialError('VALIDATION_ERROR', 'ID setoran wajib disediakan.');
        }

        $pdo->beginTransaction();
        try {
            $deposit = assertEntityOwnership($pdo, 'goal_deposits', $id, $userId);
            $realId = (int)$deposit['id'];
            $goalId = (int)$deposit['goal_id'];
            $amount = (float)$deposit['amount'];

            // Decrement goal current_amount
            $updGoal = $pdo->prepare("UPDATE goals SET current_amount = GREATEST(0, current_amount - :amount), updated_at = NOW() WHERE id = :id AND user_id = :user_id");
            $updGoal->execute(['amount' => $amount, 'id' => $goalId, 'user_id' => $userId]);

            $delStmt = $pdo->prepare("DELETE FROM goal_deposits WHERE id = :id AND user_id = :user_id");
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
    error_log('[GOAL_DEPOSITS ERROR] ' . $e->getMessage());
    sendFinancialError('SERVER_ERROR', 'Terjadi kesalahan sistem saat memproses setoran impian.', 500);
}
