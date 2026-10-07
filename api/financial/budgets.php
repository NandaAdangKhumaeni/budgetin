<?php
/**
 * BUDGETIN - Category Budgets Financial Endpoint
 * GET / POST / PUT / DELETE api/financial/budgets.php
 */

declare(strict_types=1);

require_once __DIR__ . '/financial_helper.php';

try {
    $pdo = getDbConnection();
    $user = getAuthenticatedFinancialUser($pdo);
    $userId = (string)$user['id'];
    $rawToken = (string)$user['raw_token'];

    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    // 1. GET: List or retrieve single budget
    if ($method === 'GET') {
        if (isset($_GET['id'])) {
            $budget = assertEntityOwnership($pdo, 'category_budgets', $_GET['id'], $userId);
            sendFinancialSuccess($budget);
        }

        $stmt = $pdo->prepare("SELECT *, monthly_limit AS amount FROM category_budgets WHERE user_id = :user_id ORDER BY category ASC");
        $stmt->execute(['user_id' => $userId]);
        $budgets = $stmt->fetchAll(PDO::FETCH_ASSOC);

        sendFinancialSuccess($budgets);
    }

    requireCsrfForMutation($userId, $rawToken);
    $input = getJsonRequestBody();
    if (empty($input)) {
        $input = $_POST;
    }

    // 2. POST: Create or upsert Category Budget
    if ($method === 'POST') {
        $category = trim((string)($input['category'] ?? ''));
        if ($category === '') {
            sendFinancialError('VALIDATION_ERROR', 'Kategori anggaran wajib diisi.');
        }

        $monthlyLimit = parseDecimal($input['monthly_limit'] ?? ($input['limit'] ?? null), 2, false);
        $legacyId = isset($input['legacy_id']) ? trim((string)$input['legacy_id']) : null;

        // Upsert on duplicate key (user_id, category)
        $sql = "
            INSERT INTO category_budgets (user_id, legacy_id, category, monthly_limit, created_at)
            VALUES (:user_id, :legacy_id, :category, :monthly_limit, NOW())
            ON DUPLICATE KEY UPDATE monthly_limit = VALUES(monthly_limit)
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            'user_id' => $userId,
            'legacy_id' => $legacyId,
            'category' => $category,
            'monthly_limit' => $monthlyLimit
        ]);

        $checkStmt = $pdo->prepare("SELECT * FROM category_budgets WHERE user_id = :user_id AND category = :category LIMIT 1");
        $checkStmt->execute(['user_id' => $userId, 'category' => $category]);
        $saved = $checkStmt->fetch(PDO::FETCH_ASSOC);

        sendFinancialSuccess($saved, 201);
    }

    // 3. PUT: Update Category Budget
    if ($method === 'PUT') {
        $id = $input['id'] ?? $_GET['id'] ?? null;
        if (!$id) {
            sendFinancialError('VALIDATION_ERROR', 'ID anggaran wajib disediakan.');
        }

        $existing = assertEntityOwnership($pdo, 'category_budgets', $id, $userId);
        $realId = (int)$existing['id'];

        $monthlyLimit = parseDecimal($input['monthly_limit'] ?? ($input['limit'] ?? null), 2, false);

        $stmt = $pdo->prepare("
            UPDATE category_budgets
            SET monthly_limit = :monthly_limit
            WHERE id = :id AND user_id = :user_id
        ");
        $stmt->execute([
            'monthly_limit' => $monthlyLimit,
            'id' => $realId,
            'user_id' => $userId
        ]);

        $updated = assertEntityOwnership($pdo, 'category_budgets', $realId, $userId);
        sendFinancialSuccess($updated);
    }

    // 4. DELETE: Delete Category Budget
    if ($method === 'DELETE') {
        $id = $input['id'] ?? $_GET['id'] ?? null;
        if (!$id) {
            sendFinancialError('VALIDATION_ERROR', 'ID anggaran wajib disediakan.');
        }

        $existing = assertEntityOwnership($pdo, 'category_budgets', $id, $userId);
        $realId = (int)$existing['id'];

        $stmt = $pdo->prepare("DELETE FROM category_budgets WHERE id = :id AND user_id = :user_id");
        $stmt->execute(['id' => $realId, 'user_id' => $userId]);

        sendFinancialSuccess(['id' => $realId, 'deleted' => true]);
    }

    sendFinancialError('METHOD_NOT_ALLOWED', 'Method tidak didukung.', 405);

} catch (InvalidArgumentException $e) {
    sendFinancialError('VALIDATION_ERROR', $e->getMessage(), 400);
} catch (Throwable $e) {
    error_log('[BUDGETS ERROR] ' . $e->getMessage());
    sendFinancialError('SERVER_ERROR', 'Terjadi kesalahan sistem saat memproses anggaran.', 500);
}
