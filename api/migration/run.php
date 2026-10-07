<?php
/**
 * BUDGETIN - Migration Execution Engine
 * POST api/migration/run.php
 */

declare(strict_types=1);

require_once __DIR__ . '/migration_helper.php';

if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    sendFinancialError('METHOD_NOT_ALLOWED', 'Method tidak didukung.', 405);
}

$startTime = microtime(true);

try {
    $pdo = getDbConnection();
    $user = getAuthenticatedFinancialUser($pdo);
    $userId = (string)$user['id'];
    $serverEmail = strtolower(trim((string)$user['email']));
    $rawToken = (string)$user['raw_token'];

    // 1. Anti-CSRF enforcement
    requireCsrfForMutation($userId, $rawToken);

    $snapshot = getJsonRequestBody();
    if (empty($snapshot)) {
        $snapshot = $_POST;
    }

    // 2. Email matching validation
    $localEmail = strtolower(trim((string)($snapshot['budgetin_user_email'] ?? $snapshot['user_email'] ?? $snapshot['email'] ?? '')));
    if ($localEmail !== '' && $localEmail !== $serverEmail) {
        sendJsonResponse([
            'success' => false,
            'error' => 'EMAIL_MISMATCH',
            'message' => "Email LocalStorage ($localEmail) tidak cocok dengan akun server ($serverEmail). Migrasi dibatalkan demi keamanan data."
        ], 400);
    }

    // 3. Extract entities
    $entities = extractEntitySnapshots($snapshot);

    // 4. Duplicate legacy ID validation
    $duplicates = checkSnapshotDuplicateLegacyIds($entities);
    if (!empty($duplicates)) {
        sendJsonResponse([
            'success' => false,
            'error' => 'DUPLICATE_LEGACY_IDS',
            'message' => 'Ditemukan duplikasi legacy ID dalam snapshot LocalStorage. Periksa data sebelum melanjutkan.',
            'duplicates' => $duplicates
        ], 400);
    }

    $sourceHash = calculateDeterministicFinancialHash($entities);

    // Initial audit log
    $pdo->prepare("
        INSERT INTO migration_runs (user_id, status, source_version, started_at, source_hash)
        VALUES (:user_id, 'running', '1.0', NOW(), :source_hash)
    ")->execute(['user_id' => $userId, 'source_hash' => $sourceHash]);
    $migrationRunId = (int)$pdo->lastInsertId();

    // Begin single atomic PDO transaction
    $pdo->beginTransaction();

    $insertedCounts = [];
    $skippedCounts = [];

    // Relational mapping dictionaries: local legacy ID -> MySQL auto-increment ID
    $bankMap = [];
    $goalMap = [];
    $invMap = [];
    $billMap = [];
    $recMap = [];

    // Helper to get or insert
    // STEP 1: BANKS
    $insertedBanks = 0; $skippedBanks = 0;
    foreach ($entities['banks'] as $idx => $b) {
        $localId = (string)($b['id'] ?? $b['legacy_id'] ?? $idx);
        $name = trim((string)($b['name'] ?? 'Rekening'));
        $balance = parseDecimal($b['balance'] ?? 0, 2, true);
        $isActive = isset($b['active']) ? (int)(bool)$b['active'] : (isset($b['is_active']) ? (int)(bool)$b['is_active'] : 1);

        // Check if exists by legacy_id
        $chk = $pdo->prepare("SELECT id FROM banks WHERE user_id = :uid AND legacy_id = :lid LIMIT 1");
        $chk->execute(['uid' => $userId, 'lid' => $localId]);
        $existingId = $chk->fetchColumn();

        if ($existingId) {
            $bankMap[$localId] = (int)$existingId;
            $skippedBanks++;
        } else {
            $ins = $pdo->prepare("
                INSERT INTO banks (user_id, legacy_id, name, balance, is_active, created_at, updated_at)
                VALUES (:uid, :lid, :name, :balance, :is_active, NOW(), NOW())
            ");
            $ins->execute([
                'uid' => $userId,
                'lid' => $localId,
                'name' => $name,
                'balance' => $balance,
                'is_active' => $isActive
            ]);
            $newId = (int)$pdo->lastInsertId();
            $bankMap[$localId] = $newId;
            $insertedBanks++;
        }
    }
    $insertedCounts['banks'] = $insertedBanks;
    $skippedCounts['banks'] = $skippedBanks;

    // Fallback bank ID if any relationship is missing
    $firstBankId = !empty($bankMap) ? reset($bankMap) : null;

    // STEP 2: GOALS
    $insertedGoals = 0; $skippedGoals = 0;
    foreach ($entities['goals'] as $idx => $g) {
        $localId = (string)($g['id'] ?? $g['legacy_id'] ?? $idx);
        $name = trim((string)($g['name'] ?? 'Target'));
        $target = parseDecimal($g['target_amount'] ?? $g['target'] ?? 0, 2, false);
        $current = parseDecimal($g['current_amount'] ?? $g['current'] ?? 0, 2, false);
        $monthly = parseDecimal($g['monthly_contribution'] ?? $g['monthlyContribution'] ?? 0, 2, false);
        $targetDateVal = $g['target_date'] ?? $g['targetDate'] ?? $g['deadline'] ?? null;
        $targetDate = !empty($targetDateVal) ? substr((string)$targetDateVal, 0, 10) : date('Y-m-d', strtotime('+1 year'));
        $bankId = isset($g['bankId']) && isset($bankMap[$g['bankId']]) ? $bankMap[$g['bankId']] : null;

        $chk = $pdo->prepare("SELECT id FROM goals WHERE user_id = :uid AND legacy_id = :lid LIMIT 1");
        $chk->execute(['uid' => $userId, 'lid' => $localId]);
        $existingId = $chk->fetchColumn();

        if ($existingId) {
            $goalMap[$localId] = (int)$existingId;
            $skippedGoals++;
        } else {
            $ins = $pdo->prepare("
                INSERT INTO goals (user_id, legacy_id, bank_id, name, target_amount, current_amount, target_date, monthly_contribution, created_at, updated_at)
                VALUES (:uid, :lid, :bid, :name, :target, :current, :target_date, :monthly, NOW(), NOW())
            ");
            $ins->execute([
                'uid' => $userId,
                'lid' => $localId,
                'bid' => $bankId,
                'name' => $name,
                'target' => $target,
                'current' => $current,
                'target_date' => $targetDate,
                'monthly' => $monthly
            ]);
            $newId = (int)$pdo->lastInsertId();
            $goalMap[$localId] = $newId;
            $insertedGoals++;
        }
    }
    $insertedCounts['goals'] = $insertedGoals;
    $skippedCounts['goals'] = $skippedGoals;

    // STEP 3: INVESTMENTS
    $insertedInv = 0; $skippedInv = 0;
    foreach ($entities['investments'] as $idx => $inv) {
        $localId = (string)($inv['id'] ?? $inv['legacy_id'] ?? $idx);
        $type = normalizeInvestmentType((string)($inv['type'] ?? 'other'));
        $sym = trim((string)($inv['asset_symbol'] ?? $inv['asset'] ?? $inv['name'] ?? 'ASSET'));
        $name = trim((string)($inv['asset_name'] ?? $inv['name'] ?? $sym));
        $qty = parseDecimal($inv['quantity'] ?? $inv['units'] ?? 0, 4, false);
        $buyPrice = parseDecimal($inv['buy_price'] ?? $inv['buyPrice'] ?? $inv['nav'] ?? 0, 2, false);
        $costBasis = parseDecimal($inv['cost_basis'] ?? $inv['costBasis'] ?? $inv['investedCapital'] ?? ($buyPrice * (float)$qty), 2, false);
        $remCostBasis = parseDecimal($inv['remaining_cost_basis'] ?? $inv['remainingCostBasis'] ?? $costBasis, 2, false);
        $curPrice = parseDecimal($inv['current_price'] ?? $inv['currentPrice'] ?? $inv['nav'] ?? $buyPrice, 2, false);
        $buyDateVal = $inv['buy_date'] ?? $inv['buyDate'] ?? null;
        $buyDate = !empty($buyDateVal) ? substr((string)$buyDateVal, 0, 10) : date('Y-m-d');
        $bankId = isset($inv['bankId']) && isset($bankMap[$inv['bankId']]) ? $bankMap[$inv['bankId']] : $firstBankId;

        // Bond specific
        $bondCode = $inv['bond_code'] ?? $inv['bondCode'] ?? null;
        $bondType = $inv['bond_type'] ?? $inv['bondType'] ?? null;
        $nominal = isset($inv['nominal']) ? parseDecimal($inv['nominal'], 2, false) : null;
        $couponRate = ($inv['coupon_rate'] ?? $inv['couponRate'] ?? null) !== null ? parseDecimal($inv['coupon_rate'] ?? $inv['couponRate'], 2, false) : null;
        $couponFreq = in_array($inv['coupon_frequency'] ?? $inv['couponFrequency'] ?? '', ['monthly','quarterly','semi_annual','annual'], true) ? (string)($inv['coupon_frequency'] ?? $inv['couponFrequency']) : null;
        $matVal = $inv['maturity_date'] ?? $inv['maturityDate'] ?? null;
        $maturityDate = !empty($matVal) ? substr((string)$matVal, 0, 10) : null;

        $chk = $pdo->prepare("SELECT id FROM investments WHERE user_id = :uid AND legacy_id = :lid LIMIT 1");
        $chk->execute(['uid' => $userId, 'lid' => $localId]);
        $existingId = $chk->fetchColumn();

        if ($existingId) {
            $invMap[$localId] = (int)$existingId;
            $skippedInv++;
        } else {
            $manager = isset($inv['manager']) ? trim((string)$inv['manager']) : null;
            $category = isset($inv['category']) ? trim((string)$inv['category']) : null;

            $ins = $pdo->prepare("
                INSERT INTO investments (
                    user_id, legacy_id, bank_id, type, asset_symbol, asset_name, manager, category,
                    quantity, unit, buy_price, cost_basis, remaining_cost_basis, current_price,
                    bond_code, bond_type, nominal, coupon_rate, coupon_frequency, buy_date, maturity_date,
                    created_at, updated_at
                ) VALUES (
                    :uid, :lid, :bid, :type, :sym, :name, :mgr, :cat,
                    :qty, :unit, :buy_price, :cost_basis, :rem_cost, :cur_price,
                    :bond_code, :bond_type, :nominal, :coupon_rate, :coupon_freq, :buy_date, :maturity_date,
                    NOW(), NOW()
                )
            ");
            $ins->execute([
                'uid' => $userId,
                'lid' => $localId,
                'bid' => $bankId,
                'type' => $type,
                'sym' => $sym,
                'name' => $name,
                'mgr' => $manager,
                'cat' => $category,
                'qty' => $qty,
                'unit' => trim((string)($inv['unit'] ?? 'unit')),
                'buy_price' => $buyPrice,
                'cost_basis' => $costBasis,
                'rem_cost' => $remCostBasis,
                'cur_price' => $curPrice,
                'bond_code' => $bondCode,
                'bond_type' => $bondType,
                'nominal' => $nominal,
                'coupon_rate' => $couponRate,
                'coupon_freq' => $couponFreq,
                'buy_date' => $buyDate,
                'maturity_date' => $maturityDate
            ]);
            $newId = (int)$pdo->lastInsertId();
            $invMap[$localId] = $newId;
            $insertedInv++;
        }
    }
    $insertedCounts['investments'] = $insertedInv;
    $skippedCounts['investments'] = $skippedInv;

    // STEP 4: BILLS
    $insertedBills = 0; $skippedBills = 0;
    foreach ($entities['bills'] as $idx => $bill) {
        $localId = (string)($bill['id'] ?? $bill['legacy_id'] ?? $idx);
        $name = trim((string)($bill['name'] ?? 'Tagihan'));
        $cat = trim((string)($bill['category'] ?? 'Tagihan'));
        $amount = parseDecimal($bill['amount'] ?? 0, 2, false);
        $dueDateVal = $bill['due_date'] ?? $bill['dueDate'] ?? null;
        $dueDate = !empty($dueDateVal) ? substr((string)$dueDateVal, 0, 10) : date('Y-m-d');
        $freq = in_array($bill['frequency'] ?? '', ['once', 'monthly', 'yearly'], true) ? (string)$bill['frequency'] : 'monthly';
        $isRec = ($bill['is_recurring'] ?? $bill['isRecurring'] ?? null) !== null ? (int)(bool)($bill['is_recurring'] ?? $bill['isRecurring']) : 1;
        $status = in_array($bill['status'] ?? '', ['unpaid', 'paid', 'overdue'], true) ? (string)$bill['status'] : 'unpaid';
        $notes = isset($bill['notes']) ? (string)$bill['notes'] : null;
        $paidDateVal = $bill['paid_date'] ?? $bill['paidDate'] ?? null;
        $paidDate = !empty($paidDateVal) ? substr((string)$paidDateVal, 0, 10) : null;
        $paidAtVal = $bill['paid_at'] ?? $bill['paidAt'] ?? null;
        $paidAt = !empty($paidAtVal) ? (string)$paidAtVal : ($status === 'paid' ? date('Y-m-d H:i:s') : null);
        $bankId = isset($bill['bankId']) && isset($bankMap[$bill['bankId']]) ? $bankMap[$bill['bankId']] : null;

        $chk = $pdo->prepare("SELECT id FROM bills WHERE user_id = :uid AND legacy_id = :lid LIMIT 1");
        $chk->execute(['uid' => $userId, 'lid' => $localId]);
        $existingId = $chk->fetchColumn();

        if ($existingId) {
            $billMap[$localId] = (int)$existingId;
            $skippedBills++;
        } else {
            $ins = $pdo->prepare("
                INSERT INTO bills (
                    user_id, legacy_id, bank_id, name, category, amount, due_date,
                    frequency, is_recurring, status, notes, paid_date, paid_at, created_at, updated_at
                ) VALUES (
                    :uid, :lid, :bid, :name, :cat, :amount, :due_date,
                    :freq, :is_rec, :status, :notes, :paid_date, :paid_at, NOW(), NOW()
                )
            ");
            $ins->execute([
                'uid' => $userId,
                'lid' => $localId,
                'bid' => $bankId,
                'name' => $name,
                'cat' => $cat,
                'amount' => $amount,
                'due_date' => $dueDate,
                'freq' => $freq,
                'is_rec' => $isRec,
                'status' => $status,
                'notes' => $notes,
                'paid_date' => $paidDate,
                'paid_at' => $paidAt
            ]);
            $newId = (int)$pdo->lastInsertId();
            $billMap[$localId] = $newId;
            $insertedBills++;
        }
    }
    $insertedCounts['bills'] = $insertedBills;
    $skippedCounts['bills'] = $skippedBills;

    // STEP 5: CATEGORY BUDGETS
    $insertedBudgets = 0; $skippedBudgets = 0;
    foreach ($entities['category_budgets'] as $idx => $bg) {
        $cat = trim((string)($bg['category'] ?? ''));
        if ($cat === '') continue;
        $limit = parseDecimal($bg['monthly_limit'] ?? $bg['limit'] ?? $bg['amount'] ?? 0, 2, false);
        $localId = (string)($bg['id'] ?? $bg['legacy_id'] ?? $cat);

        $chk = $pdo->prepare("SELECT id FROM category_budgets WHERE user_id = :uid AND (category = :cat OR legacy_id = :lid) LIMIT 1");
        $chk->execute(['uid' => $userId, 'cat' => $cat, 'lid' => $localId]);
        $existingId = $chk->fetchColumn();

        if ($existingId) {
            $skippedBudgets++;
        } else {
            $ins = $pdo->prepare("
                INSERT INTO category_budgets (user_id, legacy_id, category, monthly_limit, created_at)
                VALUES (:uid, :lid, :cat, :limit, NOW())
            ");
            $ins->execute(['uid' => $userId, 'lid' => $localId, 'cat' => $cat, 'limit' => $limit]);
            $insertedBudgets++;
        }
    }
    $insertedCounts['category_budgets'] = $insertedBudgets;
    $skippedCounts['category_budgets'] = $skippedBudgets;

    // STEP 6: RECURRING TRANSACTIONS
    $insertedRec = 0; $skippedRec = 0;
    foreach ($entities['recurring_transactions'] as $idx => $rec) {
        $localId = (string)($rec['id'] ?? $rec['legacy_id'] ?? $idx);
        $name = trim((string)($rec['name'] ?? 'Transaksi Rutin'));
        $type = in_array($rec['type'] ?? '', ['income', 'expense'], true) ? (string)$rec['type'] : 'expense';
        $cat = trim((string)($rec['category'] ?? ''));
        $amount = parseDecimal($rec['amount'] ?? 0, 2, false);
        $freq = in_array($rec['frequency'] ?? '', ['daily', 'weekly', 'monthly', 'yearly'], true) ? (string)$rec['frequency'] : 'monthly';
        $nextDateVal = $rec['next_date'] ?? $rec['nextDate'] ?? null;
        $nextDate = !empty($nextDateVal) ? substr((string)$nextDateVal, 0, 10) : date('Y-m-d');
        $isActive = isset($rec['active']) ? (int)(bool)$rec['active'] : (isset($rec['is_active']) ? (int)(bool)$rec['is_active'] : 1);
        $bankId = isset($rec['bankId']) && isset($bankMap[$rec['bankId']]) ? $bankMap[$rec['bankId']] : $firstBankId;

        $chk = $pdo->prepare("SELECT id FROM recurring_transactions WHERE user_id = :uid AND legacy_id = :lid LIMIT 1");
        $chk->execute(['uid' => $userId, 'lid' => $localId]);
        $existingId = $chk->fetchColumn();

        if ($existingId) {
            $recMap[$localId] = (int)$existingId;
            $skippedRec++;
        } else {
            $ins = $pdo->prepare("
                INSERT INTO recurring_transactions (
                    user_id, legacy_id, bank_id, name, type, category,
                    amount, frequency, next_date, is_active, created_at
                ) VALUES (
                    :uid, :lid, :bid, :name, :type, :cat,
                    :amount, :freq, :next_date, :is_active, NOW()
                )
            ");
            $ins->execute([
                'uid' => $userId,
                'lid' => $localId,
                'bid' => $bankId,
                'name' => $name,
                'type' => $type,
                'cat' => $cat,
                'amount' => $amount,
                'freq' => $freq,
                'next_date' => $nextDate,
                'is_active' => $isActive
            ]);
            $newId = (int)$pdo->lastInsertId();
            $recMap[$localId] = $newId;
            $insertedRec++;
        }
    }
    $insertedCounts['recurring_transactions'] = $insertedRec;
    $skippedCounts['recurring_transactions'] = $skippedRec;

    // STEP 7: TRANSACTIONS (Direct Snapshot Insert - No balance side-effects)
    $insertedTx = 0; $skippedTx = 0;
    foreach ($entities['transactions'] as $idx => $tx) {
        $localId = (string)($tx['id'] ?? $tx['legacy_id'] ?? $idx);
        $type = in_array($tx['type'] ?? '', ['income', 'expense', 'transfer', 'investment_buy', 'investment_sell'], true) ? (string)$tx['type'] : 'expense';
        $amount = parseDecimal($tx['amount'] ?? 0, 2, false);
        $cat = trim((string)($tx['category'] ?? ''));
        $desc = trim((string)($tx['description'] ?? ''));
        $dateVal = $tx['transaction_date'] ?? $tx['date'] ?? null;
        $date = !empty($dateVal) ? substr((string)$dateVal, 0, 10) : date('Y-m-d');
        $note = isset($tx['note']) ? (string)$tx['note'] : null;
        $payMethod = ($tx['payment_method'] ?? $tx['paymentMethod'] ?? null) !== null ? (string)($tx['payment_method'] ?? $tx['paymentMethod']) : null;
        $source = in_array($tx['source'] ?? '', ['manual', 'bill', 'recurring'], true) ? (string)$tx['source'] : 'manual';
        $adminFee = parseDecimal($tx['admin_fee'] ?? $tx['adminFee'] ?? 0, 2, false);

        // Relational Mapping
        $bankKey = $tx['bank_id'] ?? $tx['bankId'] ?? $tx['bank'] ?? null;
        $bankId = ($bankKey !== null && isset($bankMap[$bankKey])) ? $bankMap[$bankKey] : $firstBankId;

        $srcKey = $tx['source_bank_id'] ?? $tx['sourceBankId'] ?? $tx['sourceBank'] ?? null;
        $srcBankId = ($srcKey !== null && isset($bankMap[$srcKey])) ? $bankMap[$srcKey] : null;

        $dstKey = $tx['destination_bank_id'] ?? $tx['destinationBankId'] ?? $tx['destinationBank'] ?? null;
        $dstBankId = ($dstKey !== null && isset($bankMap[$dstKey])) ? $bankMap[$dstKey] : null;

        $billKey = $tx['bill_id'] ?? $tx['billId'] ?? $tx['bill'] ?? null;
        $billId = ($billKey !== null && isset($billMap[$billKey])) ? $billMap[$billKey] : null;

        $recKey = $tx['recurring_id'] ?? $tx['recurringId'] ?? $tx['recurring'] ?? null;
        $recurringId = ($recKey !== null && isset($recMap[$recKey])) ? $recMap[$recKey] : null;

        $chk = $pdo->prepare("SELECT id FROM transactions WHERE user_id = :uid AND legacy_id = :lid LIMIT 1");
        $chk->execute(['uid' => $userId, 'lid' => $localId]);
        $existingId = $chk->fetchColumn();

        if ($existingId) {
            $skippedTx++;
        } else {
            $ins = $pdo->prepare("
                INSERT INTO transactions (
                    user_id, legacy_id, bank_id, source_bank_id, destination_bank_id,
                    admin_fee, type, category, description, amount,
                    transaction_date, note, payment_method, source, bill_id, recurring_id, created_at
                ) VALUES (
                    :uid, :lid, :bid, :sbid, :dbid,
                    :admin_fee, :type, :cat, :desc, :amount,
                    :date, :note, :pay_method, :source, :bill_id, :rec_id, NOW()
                )
            ");
            $ins->execute([
                'uid' => $userId,
                'lid' => $localId,
                'bid' => $bankId,
                'sbid' => $srcBankId,
                'dbid' => $dstBankId,
                'admin_fee' => $adminFee,
                'type' => $type,
                'cat' => $cat,
                'desc' => $desc,
                'amount' => $amount,
                'date' => $date,
                'note' => $note,
                'pay_method' => $payMethod,
                'source' => $source,
                'bill_id' => $billId,
                'rec_id' => $recurringId
            ]);
            $insertedTx++;
        }
    }
    $insertedCounts['transactions'] = $insertedTx;
    $skippedCounts['transactions'] = $skippedTx;

    // STEP 8: INVESTMENT TRANSACTIONS
    $insertedInvTx = 0; $skippedInvTx = 0;
    foreach ($entities['investment_transactions'] as $idx => $it) {
        $localId = (string)($it['id'] ?? $it['legacy_id'] ?? $idx);
        $type = strtolower((string)($it['type'] ?? 'buy'));
        if (!in_array($type, ['buy', 'sell'], true)) $type = 'buy';
        $qty = parseDecimal($it['quantity'] ?? $it['units'] ?? 0, 4, false);
        $unit = trim((string)($it['unit'] ?? 'unit'));
        $price = parseDecimal($it['price'] ?? 0, 2, false);
        $totalAmt = parseDecimal($it['total_amount'] ?? $it['totalAmount'] ?? $it['amount'] ?? ($price * (float)$qty), 2, false);
        $costBasis = parseDecimal($it['cost_basis'] ?? $it['costBasis'] ?? 0, 2, false);
        $realizedPnl = parseDecimal($it['realized_pnl'] ?? $it['realizedPnl'] ?? 0, 2, true);
        $txDateVal = $it['transaction_date'] ?? $it['date'] ?? null;
        $txDate = !empty($txDateVal) ? (string)$txDateVal : date('Y-m-d H:i:s');

        $invId = isset($it['investmentId']) && isset($invMap[$it['investmentId']]) ? $invMap[$it['investmentId']] : null;
        $bankId = isset($it['bankId']) && isset($bankMap[$it['bankId']]) ? $bankMap[$it['bankId']] : $firstBankId;

        $sym = trim((string)($it['asset_symbol'] ?? $it['symbol'] ?? ''));
        if ($sym === '' && $invId) {
            $symStmt = $pdo->prepare("SELECT asset_symbol FROM investments WHERE id = :id");
            $symStmt->execute(['id' => $invId]);
            $sym = (string)($symStmt->fetchColumn() ?: 'ASSET');
        }

        $chk = $pdo->prepare("SELECT id FROM investment_transactions WHERE user_id = :uid AND legacy_id = :lid LIMIT 1");
        $chk->execute(['uid' => $userId, 'lid' => $localId]);
        $existingId = $chk->fetchColumn();

        if ($existingId) {
            $skippedInvTx++;
        } else {
            $ins = $pdo->prepare("
                INSERT INTO investment_transactions (
                    user_id, legacy_id, investment_id, bank_id, type, asset_symbol,
                    quantity, unit, price, total_amount, cost_basis, realized_pnl,
                    transaction_date, created_at
                ) VALUES (
                    :uid, :lid, :invid, :bid, :type, :sym,
                    :qty, :unit, :price, :total_amt, :cost_basis, :realized_pnl,
                    :tx_date, NOW()
                )
            ");
            $ins->execute([
                'uid' => $userId,
                'lid' => $localId,
                'invid' => $invId,
                'bid' => $bankId,
                'type' => $type,
                'sym' => $sym,
                'qty' => $qty,
                'unit' => $unit,
                'price' => $price,
                'total_amt' => $totalAmt,
                'cost_basis' => $costBasis,
                'realized_pnl' => $realizedPnl,
                'tx_date' => $txDate
            ]);
            $insertedInvTx++;
        }
    }
    $insertedCounts['investment_transactions'] = $insertedInvTx;
    $skippedCounts['investment_transactions'] = $skippedInvTx;

    // STEP 9: GOAL DEPOSITS
    $insertedGoalDeps = 0; $skippedGoalDeps = 0;
    foreach ($entities['goal_deposits'] as $idx => $dep) {
        $localId = (string)($dep['id'] ?? $dep['legacy_id'] ?? $idx);
        $amount = parseDecimal($dep['amount'] ?? 0, 2, false);
        $depDateVal = $dep['deposit_date'] ?? $dep['date'] ?? null;
        $depDate = !empty($depDateVal) ? substr((string)$depDateVal, 0, 10) : date('Y-m-d');
        $note = isset($dep['note']) ? (string)$dep['note'] : null;

        $parentLocalGoalId = (string)($dep['goal_id'] ?? $dep['goalId'] ?? '');
        $goalId = isset($goalMap[$parentLocalGoalId]) ? $goalMap[$parentLocalGoalId] : null;

        if (!$goalId) continue; // Skip deposit without valid parent goal

        $chk = $pdo->prepare("SELECT id FROM goal_deposits WHERE user_id = :uid AND legacy_id = :lid LIMIT 1");
        $chk->execute(['uid' => $userId, 'lid' => $localId]);
        $existingId = $chk->fetchColumn();

        if ($existingId) {
            $skippedGoalDeps++;
        } else {
            $ins = $pdo->prepare("
                INSERT INTO goal_deposits (goal_id, user_id, legacy_id, amount, deposit_date, note, created_at)
                VALUES (:gid, :uid, :lid, :amount, :date, :note, NOW())
            ");
            $ins->execute([
                'gid' => $goalId,
                'uid' => $userId,
                'lid' => $localId,
                'amount' => $amount,
                'date' => $depDate,
                'note' => $note
            ]);
            $insertedGoalDeps++;
        }
    }
    $insertedCounts['goal_deposits'] = $insertedGoalDeps;
    $skippedCounts['goal_deposits'] = $skippedGoalDeps;

    // Perform database reconciliation check BEFORE committing
    $reconciliation = calculateReconciliationMetrics($entities, $pdo, $userId);
    $targetHash = calculateDatabaseEntityHash($pdo, $userId);

    // If counts don't match, rollback
    if ($reconciliation['status'] !== 'PASS') {
        throw new RuntimeException("Reconciliation verification failed: Some entity counts or balances mismatched.");
    }

    if (!empty($snapshot['__simulate_rollback'])) {
        throw new RuntimeException("Simulated mid-transaction failure for rollback testing.");
    }

    // Commit single transaction
    $pdo->commit();

    $durationMs = (int)round((microtime(true) - $startTime) * 1000);

    // Update audit run record
    $pdo->prepare("
        UPDATE migration_runs
        SET status = 'success', completed_at = NOW(), duration_ms = :dur,
            source_counts_json = :src_counts, target_counts_json = :tgt_counts,
            reconciliation_json = :recon, target_hash = :tgt_hash
        WHERE id = :id
    ")->execute([
        'dur' => $durationMs,
        'src_counts' => json_encode(array_map('count', $entities)),
        'tgt_counts' => json_encode($insertedCounts),
        'recon' => json_encode($reconciliation),
        'tgt_hash' => $targetHash,
        'id' => $migrationRunId
    ]);

    sendJsonResponse([
        'success' => true,
        'migrationRunId' => $migrationRunId,
        'inserted' => $insertedCounts,
        'skipped' => $skippedCounts,
        'conflicts' => [],
        'errors' => [],
        'durationMs' => $durationMs,
        'sourceHash' => $sourceHash,
        'targetHash' => $targetHash,
        'hashesMatch' => ($sourceHash === $targetHash),
        'reconciliation' => $reconciliation
    ], 200);

} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    $durationMs = (int)round((microtime(true) - $startTime) * 1000);
    if (isset($pdo) && isset($migrationRunId)) {
        try {
            $pdo->prepare("
                UPDATE migration_runs
                SET status = 'rolled_back', completed_at = NOW(), duration_ms = :dur, error_message = :err
                WHERE id = :id
            ")->execute(['dur' => $durationMs, 'err' => $e->getMessage(), 'id' => $migrationRunId]);
        } catch (Throwable $ignored) {}
    }

    error_log('[MIGRATION RUN ERROR] ' . $e->getMessage());
    sendJsonResponse([
        'success' => false,
        'error' => 'MIGRATION_EXECUTION_FAILED',
        'message' => 'Migrasi dibatalkan dan di-rollback: ' . $e->getMessage()
    ], 500);
}
