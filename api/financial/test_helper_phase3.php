<?php
/**
 * BUDGETIN - Phase 3A Test Helper
 * Dedicated endpoints to support test_mysql_financial_foundation.html
 */

declare(strict_types=1);

require_once __DIR__ . '/financial_helper.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';

try {
    $pdo = getDbConnection();

    switch ($action) {
        case 'clean_test_financial':
            // Clean test users and all their cascading data
            $pdo->exec("
                DELETE FROM users
                WHERE email LIKE 'test_p3_%'
                   OR email LIKE 'test_user_phase3%'
                   OR email LIKE 'test_p3c_%'
                   OR email LIKE 'test_dw_%'
            ");
            sendJsonResponse(['success' => true, 'cleaned' => true]);
            break;

        case 'simulate_server_error':
            // For testing network/server failure handling
            http_response_code(500);
            sendJsonResponse(['success' => false, 'error' => 'SIMULATED_500_ERROR', 'message' => 'Simulated internal server error'], 500);
            break;

        case 'test_concurrent_balance':
            // Tests concurrency protection with SELECT ... FOR UPDATE
            $user = getAuthenticatedFinancialUser($pdo);
            $userId = (string)$user['id'];
            $bankId = (int)($_POST['bank_id'] ?? $_GET['bank_id'] ?? 0);
            $deductA = (float)($_POST['deduct_a'] ?? 700000);
            $deductB = (float)($_POST['deduct_b'] ?? 500000);

            // Attempt two sequential updates simulating concurrent transactions
            // Initial balance should be 1,000,000. Second deduction (500k) should fail if balance becomes negative!
            $tx1_success = false;
            $tx2_success = false;

            // Transaction 1
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare("SELECT balance FROM banks WHERE id = :id AND user_id = :uid FOR UPDATE");
                $stmt->execute(['id' => $bankId, 'uid' => $userId]);
                $bal = (float)$stmt->fetchColumn();
                if ($bal >= $deductA) {
                    $pdo->prepare("UPDATE banks SET balance = balance - :d WHERE id = :id")->execute(['d' => $deductA, 'id' => $bankId]);
                    $pdo->commit();
                    $tx1_success = true;
                } else {
                    $pdo->rollBack();
                }
            } catch (Throwable $e) {
                $pdo->rollBack();
            }

            // Transaction 2 (concurrent request)
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare("SELECT balance FROM banks WHERE id = :id AND user_id = :uid FOR UPDATE");
                $stmt->execute(['id' => $bankId, 'uid' => $userId]);
                $bal = (float)$stmt->fetchColumn();
                if ($bal >= $deductB) {
                    $pdo->prepare("UPDATE banks SET balance = balance - :d WHERE id = :id")->execute(['d' => $deductB, 'id' => $bankId]);
                    $pdo->commit();
                    $tx2_success = true;
                } else {
                    $pdo->rollBack();
                }
            } catch (Throwable $e) {
                $pdo->rollBack();
            }

            $finalBal = (float)$pdo->query("SELECT balance FROM banks WHERE id = $bankId")->fetchColumn();
            sendJsonResponse([
                'success' => true,
                'tx1_success' => $tx1_success,
                'tx2_success' => $tx2_success,
                'final_balance' => $finalBal,
                'prevented_negative' => ($finalBal >= 0 && (!$tx1_success || !$tx2_success))
            ]);
            break;

        case 'test_rollback_simulation':
            // Test that PDO transactions roll back completely when an error occurs midway
            $user = getAuthenticatedFinancialUser($pdo);
            $userId = (string)$user['id'];

            // 1. Create a test bank
            $pdo->exec("INSERT INTO banks (user_id, name, balance, is_active, created_at, updated_at) VALUES ('$userId', 'Rollback Test Bank', 500000.00, 1, NOW(), NOW())");
            $testBankId = (int)$pdo->lastInsertId();

            $rolledBack = false;
            $pdo->beginTransaction();
            try {
                // Step A: Deduct 100,000
                $pdo->exec("UPDATE banks SET balance = balance - 100000.00 WHERE id = $testBankId AND user_id = '$userId'");

                // Step B: Deliberate failure (invalid SQL or exception)
                throw new RuntimeException("Simulated mid-transaction failure");

                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                $rolledBack = true;
            }

            // Verify balance remained exactly 500,000
            $chk = $pdo->query("SELECT balance FROM banks WHERE id = $testBankId")->fetchColumn();
            $balanceIntact = ((float)$chk === 500000.00);

            // Cleanup
            $pdo->exec("DELETE FROM banks WHERE id = $testBankId");

            sendJsonResponse([
                'success' => true,
                'rolledBack' => $rolledBack,
                'balanceIntact' => $balanceIntact,
                'recordedBalance' => (float)$chk
            ]);
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
