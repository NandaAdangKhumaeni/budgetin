<?php
/**
 * BUDGETIN - Simulation Data Reset & Seed Helper
 * Phase 4A: Clean Reset for Simulation / Testing
 */

declare(strict_types=1);

require_once __DIR__ . '/financial_helper.php';

try {
    $pdo = getDbConnection();
    $userId = null;
    $user = null;

    if (php_sapi_name() === 'cli') {
        global $argv;
        $targetEmail = $argv[1] ?? 'pmaho.sas2@gmail.com';
        $stmt = $pdo->prepare("SELECT * FROM users WHERE email = :email LIMIT 1");
        $stmt->execute(['email' => $targetEmail]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$user) {
            $stmt = $pdo->query("SELECT * FROM users ORDER BY created_at ASC LIMIT 1");
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
        }
        if (!$user) {
            echo "No user found in database.\n";
            exit(1);
        }
        $userId = (string)$user['id'];
    } else {
        $user = getAuthenticatedFinancialUser($pdo);
        $userId = (string)$user['id'];
        $rawToken = (string)$user['raw_token'];
        requireCsrfForMutation($userId, $rawToken);
    }

    // Begin atomic transaction
    $pdo->beginTransaction();

    // 1. Delete existing financial simulation records for this user only
    $pdo->prepare("DELETE FROM goal_deposits WHERE user_id = :uid")->execute(['uid' => $userId]);
    $pdo->prepare("DELETE FROM goals WHERE user_id = :uid")->execute(['uid' => $userId]);
    $pdo->prepare("DELETE FROM investment_transactions WHERE user_id = :uid")->execute(['uid' => $userId]);
    $pdo->prepare("DELETE FROM investments WHERE user_id = :uid")->execute(['uid' => $userId]);
    $pdo->prepare("DELETE FROM bills WHERE user_id = :uid")->execute(['uid' => $userId]);
    $pdo->prepare("DELETE FROM transactions WHERE user_id = :uid")->execute(['uid' => $userId]);
    $pdo->prepare("DELETE FROM recurring_transactions WHERE user_id = :uid")->execute(['uid' => $userId]);
    $pdo->prepare("DELETE FROM category_budgets WHERE user_id = :uid")->execute(['uid' => $userId]);
    $pdo->prepare("DELETE FROM banks WHERE user_id = :uid")->execute(['uid' => $userId]);

    // 2. Seed clean simulation banks
    // Bank 1: BCA Utama (10.000.000)
    $stmt = $pdo->prepare("
        INSERT INTO banks (user_id, legacy_id, name, balance, is_active, created_at, updated_at)
        VALUES (:uid, 'bank_bca_utama', 'BCA Utama', 10000000.00, 1, NOW(), NOW())
    ");
    $stmt->execute(['uid' => $userId]);
    $bcaId = (int)$pdo->lastInsertId();

    // Bank 2: BRI (5.000.000)
    $stmt = $pdo->prepare("
        INSERT INTO banks (user_id, legacy_id, name, balance, is_active, created_at, updated_at)
        VALUES (:uid, 'bank_bri', 'BRI', 5000000.00, 1, NOW(), NOW())
    ");
    $stmt->execute(['uid' => $userId]);
    $briId = (int)$pdo->lastInsertId();

    // 3. Seed clean simulation transactions
    $today = date('Y-m-d');
    // Transaction 1: Income 10.000.000
    $stmt = $pdo->prepare("
        INSERT INTO transactions (user_id, legacy_id, bank_id, type, category, description, amount, admin_fee, transaction_date, source, created_at)
        VALUES (:uid, 'tx_seed_income', :bid, 'income', 'Gaji', 'Gaji Bulanan (Simulasi)', 10000000.00, 0.00, :tdate, 'manual', NOW())
    ");
    $stmt->execute(['uid' => $userId, 'bid' => $bcaId, 'tdate' => $today]);

    // Transaction 2: Expense 1.000.000
    $stmt = $pdo->prepare("
        INSERT INTO transactions (user_id, legacy_id, bank_id, type, category, description, amount, admin_fee, transaction_date, source, created_at)
        VALUES (:uid, 'tx_seed_expense', :bid, 'expense', 'Makanan & Minuman', 'Belanja Kebutuhan (Simulasi)', 1000000.00, 0.00, :tdate, 'manual', NOW())
    ");
    $stmt->execute(['uid' => $userId, 'bid' => $bcaId, 'tdate' => $today]);

    // 4. Seed dummy investment (clearly marked as simulation, uses realistic reference NAV)
    $stmt = $pdo->prepare("
        INSERT INTO investments (user_id, legacy_id, bank_id, type, asset_symbol, asset_name, quantity, unit, buy_price, cost_basis, remaining_cost_basis, current_price, buy_date, created_at, updated_at)
        VALUES (:uid, 'inv_seed_dummy', :bid, 'stock', 'BBCA', 'BBCA (Simulasi)', 10.0000, 'lembar', 9500.00, 95000.00, 95000.00, 9500.00, :bdate, NOW(), NOW())
    ");
    $stmt->execute(['uid' => $userId, 'bid' => $bcaId, 'bdate' => $today]);
    $invId = (int)$pdo->lastInsertId();

    $stmt = $pdo->prepare("
        INSERT INTO investment_transactions (user_id, legacy_id, investment_id, bank_id, type, asset_symbol, quantity, unit, price, total_amount, cost_basis, realized_pnl, transaction_date, created_at)
        VALUES (:uid, 'itx_seed_dummy', :invid, :bid, 'buy', 'BBCA', 10.0000, 'lembar', 9500.00, 95000.00, 95000.00, 0.00, :tdate, NOW())
    ");
    $stmt->execute(['uid' => $userId, 'invid' => $invId, 'bid' => $bcaId, 'tdate' => $today]);

    // 5. Seed dummy goal
    $oneYearLater = date('Y-m-d', strtotime('+1 year'));
    $stmt = $pdo->prepare("
        INSERT INTO goals (user_id, legacy_id, bank_id, name, target_amount, current_amount, target_date, monthly_contribution, created_at, updated_at)
        VALUES (:uid, 'goal_seed_dummy', :bid, 'Dana Darurat (Simulasi)', 50000000.00, 5000000.00, :tdate, 2000000.00, NOW(), NOW())
    ");
    $stmt->execute(['uid' => $userId, 'bid' => $bcaId, 'tdate' => $oneYearLater]);
    $goalId = (int)$pdo->lastInsertId();

    // Goal deposit
    $stmt = $pdo->prepare("
        INSERT INTO goal_deposits (user_id, legacy_id, goal_id, amount, deposit_date, note, created_at)
        VALUES (:uid, 'gd_seed_dummy', :gid, 5000000.00, :tdate, 'Setoran Awal (Simulasi)', NOW())
    ");
    $stmt->execute(['uid' => $userId, 'gid' => $goalId, 'tdate' => $today]);

    // 6. Seed dummy bill
    $nextWeek = date('Y-m-d', strtotime('+7 days'));
    $stmt = $pdo->prepare("
        INSERT INTO bills (user_id, legacy_id, bank_id, name, category, amount, due_date, status, frequency, notes, created_at, updated_at)
        VALUES (:uid, 'bill_seed_dummy', :bid, 'Tagihan Listrik PLN (Simulasi)', 'Tagihan', 500000.00, :tdate, 'unpaid', 'monthly', 'Simulasi pengingat tagihan bulanan', NOW(), NOW())
    ");
    $stmt->execute(['uid' => $userId, 'bid' => $bcaId, 'tdate' => $nextWeek]);

    // 7. Seed category budget
    $stmt = $pdo->prepare("
        INSERT INTO category_budgets (user_id, legacy_id, category, monthly_limit, created_at)
        VALUES (:uid, 'bgt_seed_makanan', 'Makanan & Minuman', 3000000.00, NOW())
    ");
    $stmt->execute(['uid' => $userId]);

    // 8. Seed recurring transaction
    $nextMonth = date('Y-m-d', strtotime('+1 month'));
    $stmt = $pdo->prepare("
        INSERT INTO recurring_transactions (user_id, legacy_id, bank_id, name, type, category, amount, frequency, next_date, is_active, created_at)
        VALUES (:uid, 'rec_seed_wifi', :bid, 'Internet WiFi (Simulasi Rutin)', 'expense', 'Tagihan', 350000.00, 'monthly', :nmonth, 1, NOW())
    ");
    $stmt->execute(['uid' => $userId, 'bid' => $bcaId, 'nmonth' => $nextMonth]);

    $pdo->commit();

    $response = [
        'success' => true,
        'message' => 'Simulasi data berhasil di-reset dan di-seed ulang.',
        'user' => [
            'id' => $userId,
            'email' => $user['email'] ?? ''
        ],
        'seeded' => [
            'banks' => 2,
            'transactions' => 2,
            'investments' => 1,
            'investment_transactions' => 1,
            'goals' => 1,
            'goal_deposits' => 1,
            'bills' => 1,
            'category_budgets' => 1,
            'recurring_transactions' => 1
        ]
    ];

    if (php_sapi_name() === 'cli') {
        echo json_encode($response, JSON_PRETTY_PRINT) . "\n";
    } else {
        sendFinancialSuccess($response);
    }
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if (php_sapi_name() === 'cli') {
        echo "Error: " . $e->getMessage() . "\n";
        exit(1);
    } else {
        sendFinancialError('INTERNAL_ERROR', $e->getMessage(), 500);
    }
}
