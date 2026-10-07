<?php
/**
 * BUDGETIN - Migration Helper Core
 * Phase 3B: LocalStorage to MySQL Migration Engine & Reconciliation
 */

declare(strict_types=1);

require_once __DIR__ . '/../financial/financial_helper.php';

/**
 * Standardize and extract entity lists from raw LocalStorage snapshot.
 */
function extractEntitySnapshots(array $snapshot): array
{
    $banks = $snapshot['budgetin_banks'] ?? $snapshot['banks'] ?? [];
    $transactions = $snapshot['budgetin_transactions'] ?? $snapshot['transactions'] ?? [];
    $investments = $snapshot['budgetin_investments'] ?? $snapshot['investments'] ?? [];
    $investmentTransactions = $snapshot['budgetin_investment_transactions'] ?? $snapshot['investment_transactions'] ?? [];
    $bills = $snapshot['budgetin_bills'] ?? $snapshot['bills'] ?? [];
    $goals = $snapshot['budgetin_goals'] ?? $snapshot['goals'] ?? [];
    $budgets = $snapshot['budgetin_category_budgets'] ?? $snapshot['category_budgets'] ?? $snapshot['budgets'] ?? [];
    $recurring = $snapshot['budgetin_recurring_transactions'] ?? $snapshot['recurring_transactions'] ?? $snapshot['recurring'] ?? [];

    // Extract goal deposits from dedicated key OR embedded goal.deposits array
    $goalDeposits = $snapshot['budgetin_goal_deposits'] ?? $snapshot['goal_deposits'] ?? [];
    if (is_array($goals)) {
        foreach ($goals as $g) {
            if (!empty($g['deposits']) && is_array($g['deposits'])) {
                $parentGoalId = (string)($g['id'] ?? '');
                foreach ($g['deposits'] as $idx => $dep) {
                    $depId = (string)($dep['id'] ?? ($parentGoalId . '_dep_' . $idx));
                    // Avoid duplicate if already in goalDeposits
                    $exists = false;
                    foreach ($goalDeposits as $existingDep) {
                        if ((string)($existingDep['id'] ?? '') === $depId) {
                            $exists = true;
                            break;
                        }
                    }
                    if (!$exists) {
                        $goalDeposits[] = array_merge($dep, [
                            'id' => $depId,
                            'goal_id' => $dep['goal_id'] ?? $dep['goalId'] ?? $parentGoalId
                        ]);
                    }
                }
            }
        }
    }

    return [
        'banks' => is_array($banks) ? $banks : [],
        'goals' => is_array($goals) ? $goals : [],
        'investments' => is_array($investments) ? $investments : [],
        'bills' => is_array($bills) ? $bills : [],
        'category_budgets' => is_array($budgets) ? $budgets : [],
        'recurring_transactions' => is_array($recurring) ? $recurring : [],
        'transactions' => is_array($transactions) ? $transactions : [],
        'investment_transactions' => is_array($investmentTransactions) ? $investmentTransactions : [],
        'goal_deposits' => is_array($goalDeposits) ? $goalDeposits : []
    ];
}

/**
 * Check for duplicate legacy IDs within the same entity in the snapshot.
 */
function checkSnapshotDuplicateLegacyIds(array $entities): array
{
    $duplicates = [];
    foreach ($entities as $entityName => $items) {
        $seen = [];
        foreach ($items as $idx => $item) {
            $id = (string)($item['id'] ?? $item['legacy_id'] ?? $item['category'] ?? $idx);
            if (isset($seen[$id])) {
                if (!isset($duplicates[$entityName])) {
                    $duplicates[$entityName] = [];
                }
                $duplicates[$entityName][] = $id;
            }
            $seen[$id] = true;
        }
    }
    return $duplicates;
}

/**
 * Normalize investment type to canonical database enum values.
 */
function normalizeInvestmentType(string $type): string
{
    $t = strtolower(trim($type));
    if ($t === 'saham') return 'stock';
    if ($t === 'emas') return 'gold';
    if ($t === 'obligasi') return 'bond';
    if ($t === 'mutual_fund') return 'reksadana';
    if (in_array($t, ['stock', 'gold', 'bond', 'reksadana', 'crypto', 'other'], true)) {
        return $t;
    }
    return 'other';
}

/**
 * Compute deterministic cryptographic hash from normalized canonical entity representations.
 */
function calculateDeterministicFinancialHash(array $entities): string
{
    $lines = [];

    // 1. Banks
    $banks = $entities['banks'] ?? [];
    usort($banks, fn($a, $b) => strcmp((string)($a['id'] ?? ''), (string)($b['id'] ?? '')));
    foreach ($banks as $b) {
        $id = (string)($b['id'] ?? $b['legacy_id'] ?? '');
        $name = trim((string)($b['name'] ?? ''));
        $balance = number_format((float)($b['balance'] ?? 0), 2, '.', '');
        $lines[] = "BANK|$id|$name|$balance";
    }

    // 2. Goals
    $goals = $entities['goals'] ?? [];
    usort($goals, fn($a, $b) => strcmp((string)($a['id'] ?? ''), (string)($b['id'] ?? '')));
    foreach ($goals as $g) {
        $id = (string)($g['id'] ?? $g['legacy_id'] ?? '');
        $name = trim((string)($g['name'] ?? ''));
        $target = number_format((float)($g['target_amount'] ?? $g['target'] ?? 0), 2, '.', '');
        $current = number_format((float)($g['current_amount'] ?? $g['current'] ?? 0), 2, '.', '');
        $lines[] = "GOAL|$id|$name|$target|$current";
    }

    // 3. Investments
    $investments = $entities['investments'] ?? [];
    usort($investments, fn($a, $b) => strcmp((string)($a['id'] ?? ''), (string)($b['id'] ?? '')));
    foreach ($investments as $inv) {
        $id = (string)($inv['id'] ?? $inv['legacy_id'] ?? '');
        $type = normalizeInvestmentType((string)($inv['type'] ?? 'other'));
        $sym = trim((string)($inv['asset_symbol'] ?? $inv['asset'] ?? $inv['name'] ?? ''));
        $qty = number_format((float)($inv['quantity'] ?? $inv['units'] ?? 0), 4, '.', '');
        $buyPrice = number_format((float)($inv['buy_price'] ?? $inv['buyPrice'] ?? $inv['nav'] ?? 0), 2, '.', '');
        $costBasis = number_format((float)($inv['cost_basis'] ?? $inv['costBasis'] ?? $inv['investedCapital'] ?? 0), 2, '.', '');
        $lines[] = "INV|$id|$type|$sym|$qty|$buyPrice|$costBasis";
    }

    // 4. Bills
    $bills = $entities['bills'] ?? [];
    usort($bills, fn($a, $b) => strcmp((string)($a['id'] ?? ''), (string)($b['id'] ?? '')));
    foreach ($bills as $bill) {
        $id = (string)($bill['id'] ?? $bill['legacy_id'] ?? '');
        $name = trim((string)($bill['name'] ?? ''));
        $amount = number_format((float)($bill['amount'] ?? 0), 2, '.', '');
        $dueDate = (string)($bill['due_date'] ?? $bill['dueDate'] ?? '');
        $status = (string)($bill['status'] ?? 'unpaid');
        $lines[] = "BILL|$id|$name|$amount|$dueDate|$status";
    }

    // 5. Category Budgets
    $budgets = $entities['category_budgets'] ?? [];
    usort($budgets, fn($a, $b) => strcmp((string)($a['category'] ?? ''), (string)($b['category'] ?? '')));
    foreach ($budgets as $bg) {
        $cat = trim((string)($bg['category'] ?? ''));
        $limit = number_format((float)($bg['monthly_limit'] ?? $bg['limit'] ?? $bg['amount'] ?? 0), 2, '.', '');
        $lines[] = "BUDGET|$cat|$limit";
    }

    // 6. Recurring
    $recurring = $entities['recurring_transactions'] ?? [];
    usort($recurring, fn($a, $b) => strcmp((string)($a['id'] ?? ''), (string)($b['id'] ?? '')));
    foreach ($recurring as $rec) {
        $id = (string)($rec['id'] ?? $rec['legacy_id'] ?? '');
        $name = trim((string)($rec['name'] ?? ''));
        $type = strtolower((string)($rec['type'] ?? 'expense'));
        $amount = number_format((float)($rec['amount'] ?? 0), 2, '.', '');
        $freq = (string)($rec['frequency'] ?? $rec['interval'] ?? 'monthly');
        $lines[] = "REC|$id|$name|$type|$amount|$freq";
    }

    // 7. Transactions
    $transactions = $entities['transactions'] ?? [];
    usort($transactions, fn($a, $b) => strcmp((string)($a['id'] ?? ''), (string)($b['id'] ?? '')));
    foreach ($transactions as $tx) {
        $id = (string)($tx['id'] ?? $tx['legacy_id'] ?? '');
        $type = strtolower((string)($tx['type'] ?? 'expense'));
        $amount = number_format((float)($tx['amount'] ?? 0), 2, '.', '');
        $cat = trim((string)($tx['category'] ?? ''));
        $date = substr((string)($tx['transaction_date'] ?? $tx['date'] ?? ''), 0, 10);
        $lines[] = "TX|$id|$type|$amount|$cat|$date";
    }

    // 8. Investment Transactions
    $invTx = $entities['investment_transactions'] ?? [];
    usort($invTx, fn($a, $b) => strcmp((string)($a['id'] ?? ''), (string)($b['id'] ?? '')));
    foreach ($invTx as $it) {
        $id = (string)($it['id'] ?? $it['legacy_id'] ?? '');
        $type = strtolower((string)($it['type'] ?? 'buy'));
        $qty = number_format((float)($it['quantity'] ?? $it['units'] ?? 0), 4, '.', '');
        $amt = number_format((float)($it['total_amount'] ?? $it['totalAmount'] ?? $it['amount'] ?? 0), 2, '.', '');
        $lines[] = "INVTX|$id|$type|$qty|$amt";
    }

    // 9. Goal Deposits
    $goalDeps = $entities['goal_deposits'] ?? [];
    usort($goalDeps, fn($a, $b) => strcmp((string)($a['id'] ?? ''), (string)($b['id'] ?? '')));
    foreach ($goalDeps as $gd) {
        $id = (string)($gd['id'] ?? $gd['legacy_id'] ?? '');
        $amt = number_format((float)($gd['amount'] ?? 0), 2, '.', '');
        $date = substr((string)($gd['deposit_date'] ?? $gd['date'] ?? ''), 0, 10);
        $lines[] = "GOALDEP|$id|$amt|$date";
    }

    $canonicalString = implode("\n", $lines);
    return hash('sha256', $canonicalString);
}

/**
 * Compute deterministic hash directly from MySQL database records for a user.
 */
function calculateDatabaseEntityHash(PDO $pdo, string $userId): string
{
    $entities = [
        'banks' => $pdo->query("SELECT id, legacy_id, name, balance FROM banks WHERE user_id = '$userId'")->fetchAll(PDO::FETCH_ASSOC),
        'goals' => $pdo->query("SELECT id, legacy_id, name, target_amount, current_amount FROM goals WHERE user_id = '$userId'")->fetchAll(PDO::FETCH_ASSOC),
        'investments' => $pdo->query("SELECT id, legacy_id, type, asset_symbol, quantity, buy_price, cost_basis FROM investments WHERE user_id = '$userId'")->fetchAll(PDO::FETCH_ASSOC),
        'bills' => $pdo->query("SELECT id, legacy_id, name, amount, due_date, status FROM bills WHERE user_id = '$userId'")->fetchAll(PDO::FETCH_ASSOC),
        'category_budgets' => $pdo->query("SELECT id, legacy_id, category, monthly_limit FROM category_budgets WHERE user_id = '$userId'")->fetchAll(PDO::FETCH_ASSOC),
        'recurring_transactions' => $pdo->query("SELECT id, legacy_id, name, type, amount, frequency FROM recurring_transactions WHERE user_id = '$userId'")->fetchAll(PDO::FETCH_ASSOC),
        'transactions' => $pdo->query("SELECT id, legacy_id, type, amount, category, transaction_date FROM transactions WHERE user_id = '$userId'")->fetchAll(PDO::FETCH_ASSOC),
        'investment_transactions' => $pdo->query("SELECT id, legacy_id, type, asset_symbol, quantity, total_amount FROM investment_transactions WHERE user_id = '$userId'")->fetchAll(PDO::FETCH_ASSOC),
        'goal_deposits' => $pdo->query("SELECT id, legacy_id, amount, deposit_date FROM goal_deposits WHERE user_id = '$userId'")->fetchAll(PDO::FETCH_ASSOC),
    ];

    // For hash parity, use legacy_id if present
    foreach ($entities as $k => &$items) {
        foreach ($items as &$item) {
            if (!empty($item['legacy_id'])) {
                $item['id'] = $item['legacy_id'];
            }
        }
    }

    return calculateDeterministicFinancialHash($entities);
}

/**
 * Perform comprehensive reconciliation between LocalStorage snapshot and MySQL records.
 */
function calculateReconciliationMetrics(array $sourceEntities, PDO $pdo, string $userId): array
{
    // 1. Source Calculations
    $srcBanks = $sourceEntities['banks'] ?? [];
    $srcTx = $sourceEntities['transactions'] ?? [];
    $srcInv = $sourceEntities['investments'] ?? [];
    $srcBills = $sourceEntities['bills'] ?? [];
    $srcGoals = $sourceEntities['goals'] ?? [];
    $srcGoalDeps = $sourceEntities['goal_deposits'] ?? [];
    $srcBudgets = $sourceEntities['category_budgets'] ?? [];
    $srcRecurring = $sourceEntities['recurring_transactions'] ?? [];

    $srcTotalBankBalance = array_reduce($srcBanks, fn($s, $b) => $s + (float)($b['balance'] ?? 0), 0.0);
    $srcIncome = array_reduce($srcTx, fn($s, $t) => ($t['type'] ?? '') === 'income' ? $s + (float)($t['amount'] ?? 0) : $s, 0.0);
    $srcExpense = array_reduce($srcTx, fn($s, $t) => ($t['type'] ?? '') === 'expense' ? $s + (float)($t['amount'] ?? 0) : $s, 0.0);
    $srcInvBuy = array_reduce($srcTx, fn($s, $t) => ($t['type'] ?? '') === 'investment_buy' ? $s + (float)($t['amount'] ?? 0) : $s, 0.0);
    $srcInvSell = array_reduce($srcTx, fn($s, $t) => ($t['type'] ?? '') === 'investment_sell' ? $s + (float)($t['amount'] ?? 0) : $s, 0.0);
    $srcNetCashFlow = ($srcIncome + $srcInvSell) - ($srcExpense + $srcInvBuy);

    $srcTotalInvested = array_reduce($srcInv, fn($s, $i) => $s + (float)($i['cost_basis'] ?? $i['costBasis'] ?? $i['investedCapital'] ?? 0), 0.0);
    $srcTotalUnits = array_reduce($srcInv, fn($s, $i) => $s + (float)($i['quantity'] ?? $i['units'] ?? 0), 0.0);
    $srcCurrentPortfolioVal = array_reduce($srcInv, fn($s, $i) => $s + ((float)($i['quantity'] ?? $i['units'] ?? 0) * (float)($i['current_price'] ?? $i['currentPrice'] ?? $i['nav'] ?? $i['buy_price'] ?? 0)), 0.0);

    $srcTotalBillAmount = array_reduce($srcBills, fn($s, $b) => $s + (float)($b['amount'] ?? 0), 0.0);
    $srcTotalTargetAmount = array_reduce($srcGoals, fn($s, $g) => $s + (float)($g['target_amount'] ?? $g['target'] ?? 0), 0.0);
    $srcTotalCurrentAmount = array_reduce($srcGoals, fn($s, $g) => $s + (float)($g['current_amount'] ?? $g['current'] ?? 0), 0.0);
    $srcTotalDepositAmount = array_reduce($srcGoalDeps, fn($s, $d) => $s + (float)($d['amount'] ?? 0), 0.0);
    $srcTotalBudgetAmount = array_reduce($srcBudgets, fn($s, $b) => $s + (float)($b['monthly_limit'] ?? $b['limit'] ?? $b['amount'] ?? 0), 0.0);

    // 2. Database Calculations
    $dbBankRow = $pdo->query("SELECT COUNT(*) AS c, COALESCE(SUM(balance), 0) AS total FROM banks WHERE user_id = '$userId'")->fetch(PDO::FETCH_ASSOC);
    $dbTxCounts = $pdo->query("
        SELECT
            COUNT(*) AS total_count,
            COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense,
            COALESCE(SUM(CASE WHEN type = 'investment_buy' THEN amount ELSE 0 END), 0) AS total_inv_buy,
            COALESCE(SUM(CASE WHEN type = 'investment_sell' THEN amount ELSE 0 END), 0) AS total_inv_sell
        FROM transactions WHERE user_id = '$userId'
    ")->fetch(PDO::FETCH_ASSOC);

    $dbInvRow = $pdo->query("
        SELECT
            COUNT(*) AS c,
            COALESCE(SUM(cost_basis), 0) AS total_cost,
            COALESCE(SUM(quantity), 0) AS total_qty,
            COALESCE(SUM(quantity * current_price), 0) AS total_val
        FROM investments WHERE user_id = '$userId'
    ")->fetch(PDO::FETCH_ASSOC);

    $dbBillRow = $pdo->query("SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS total FROM bills WHERE user_id = '$userId'")->fetch(PDO::FETCH_ASSOC);
    $dbGoalRow = $pdo->query("SELECT COUNT(*) AS c, COALESCE(SUM(target_amount), 0) AS target_tot, COALESCE(SUM(current_amount), 0) AS current_tot FROM goals WHERE user_id = '$userId'")->fetch(PDO::FETCH_ASSOC);
    $dbGoalDepRow = $pdo->query("SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS total FROM goal_deposits WHERE user_id = '$userId'")->fetch(PDO::FETCH_ASSOC);
    $dbBudgetRow = $pdo->query("SELECT COUNT(*) AS c, COALESCE(SUM(monthly_limit), 0) AS total FROM category_budgets WHERE user_id = '$userId'")->fetch(PDO::FETCH_ASSOC);
    $dbRecRow = $pdo->query("SELECT COUNT(*) AS c FROM recurring_transactions WHERE user_id = '$userId'")->fetch(PDO::FETCH_ASSOC);
    $dbInvTxRow = $pdo->query("SELECT COUNT(*) AS c FROM investment_transactions WHERE user_id = '$userId'")->fetch(PDO::FETCH_ASSOC);

    $dbNetCashFlow = ((float)$dbTxCounts['total_income'] + (float)$dbTxCounts['total_inv_sell']) - ((float)$dbTxCounts['total_expense'] + (float)$dbTxCounts['total_inv_buy']);

    // Build comparison metrics
    $metrics = [
        'banks_count' => ['expected' => count($srcBanks), 'actual' => (int)$dbBankRow['c']],
        'banks_total_balance' => ['expected' => $srcTotalBankBalance, 'actual' => (float)$dbBankRow['total']],
        'transactions_count' => ['expected' => count($srcTx), 'actual' => (int)$dbTxCounts['total_count']],
        'transactions_income' => ['expected' => $srcIncome, 'actual' => (float)$dbTxCounts['total_income']],
        'transactions_expense' => ['expected' => $srcExpense, 'actual' => (float)$dbTxCounts['total_expense']],
        'transactions_net_cash_flow' => ['expected' => $srcNetCashFlow, 'actual' => $dbNetCashFlow],
        'investments_count' => ['expected' => count($srcInv), 'actual' => (int)$dbInvRow['c']],
        'investments_invested_capital' => ['expected' => $srcTotalInvested, 'actual' => (float)$dbInvRow['total_cost']],
        'investments_units' => ['expected' => $srcTotalUnits, 'actual' => (float)$dbInvRow['total_qty']],
        'investments_portfolio_value' => ['expected' => $srcCurrentPortfolioVal, 'actual' => (float)$dbInvRow['total_val']],
        'investment_transactions_count' => ['expected' => count($sourceEntities['investment_transactions'] ?? []), 'actual' => (int)$dbInvTxRow['c']],
        'bills_count' => ['expected' => count($srcBills), 'actual' => (int)$dbBillRow['c']],
        'bills_total_amount' => ['expected' => $srcTotalBillAmount, 'actual' => (float)$dbBillRow['total']],
        'goals_count' => ['expected' => count($srcGoals), 'actual' => (int)$dbGoalRow['c']],
        'goals_target_amount' => ['expected' => $srcTotalTargetAmount, 'actual' => (float)$dbGoalRow['target_tot']],
        'goals_current_amount' => ['expected' => $srcTotalCurrentAmount, 'actual' => (float)$dbGoalRow['current_tot']],
        'goal_deposits_count' => ['expected' => count($srcGoalDeps), 'actual' => (int)$dbGoalDepRow['c']],
        'goal_deposits_total_amount' => ['expected' => $srcTotalDepositAmount, 'actual' => (float)$dbGoalDepRow['total']],
        'category_budgets_count' => ['expected' => count($srcBudgets), 'actual' => (int)$dbBudgetRow['c']],
        'recurring_count' => ['expected' => count($srcRecurring), 'actual' => (int)$dbRecRow['c']]
    ];

    $allPass = true;
    foreach ($metrics as $name => &$m) {
        $diff = round((float)$m['actual'] - (float)$m['expected'], 4);
        $m['difference'] = $diff;
        $m['pass'] = ($diff == 0.0);
        if (!$m['pass']) {
            $allPass = false;
        }
    }

    return [
        'status' => $allPass ? 'PASS' : 'FAIL',
        'metrics' => $metrics
    ];
}
