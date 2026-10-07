<?php
/**
 * BUDGETIN - Phase 3B Test Helper
 * Dedicated endpoints to support test_migration.html
 */

declare(strict_types=1);

require_once __DIR__ . '/migration_helper.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';

try {
    $pdo = getDbConnection();

    switch ($action) {
        case 'clean_test_migration':
            // Clean all test users created for migration testing and their cascading data
            $pdo->exec("
                DELETE FROM users
                WHERE email LIKE 'test_mig_%'
                   OR email LIKE 'test_p3b_%'
            ");
            sendJsonResponse(['success' => true, 'cleaned' => true]);
            break;

        case 'get_migration_runs':
            $user = getAuthenticatedFinancialUser($pdo);
            $stmt = $pdo->prepare("SELECT * FROM migration_runs WHERE user_id = :uid ORDER BY id DESC");
            $stmt->execute(['uid' => $user['id']]);
            $runs = $stmt->fetchAll(PDO::FETCH_ASSOC);
            sendJsonResponse(['success' => true, 'runs' => $runs]);
            break;

        case 'count_user_records':
            $user = getAuthenticatedFinancialUser($pdo);
            $uid = (string)$user['id'];
            $tables = [
                'banks' => 'banks',
                'goals' => 'goals',
                'investments' => 'investments',
                'bills' => 'bills',
                'category_budgets' => 'category_budgets',
                'recurring_transactions' => 'recurring_transactions',
                'transactions' => 'transactions',
                'investment_transactions' => 'investment_transactions',
                'goal_deposits' => 'goal_deposits'
            ];
            $counts = [];
            foreach ($tables as $key => $table) {
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM `$table` WHERE user_id = :uid");
                $stmt->execute(['uid' => $uid]);
                $counts[$key] = (int)$stmt->fetchColumn();
            }
            sendJsonResponse(['success' => true, 'counts' => $counts]);
            break;

        default:
            sendJsonResponse(['success' => false, 'error' => 'UNKNOWN_ACTION'], 400);
    }
} catch (Throwable $e) {
    sendJsonResponse([
        'success' => false,
        'error' => 'TEST_HELPER_ERROR',
        'message' => $e->getMessage()
    ], 500);
}
