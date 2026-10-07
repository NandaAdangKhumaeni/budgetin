<?php
/**
 * BUDGETIN - Investments Financial Endpoint
 * GET / POST / PUT / DELETE api/financial/investments.php
 */

declare(strict_types=1);

require_once __DIR__ . '/financial_helper.php';

try {
    $pdo = getDbConnection();
    $user = getAuthenticatedFinancialUser($pdo);
    $userId = (string)$user['id'];
    $rawToken = (string)$user['raw_token'];

    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    // 1. GET: List or retrieve single investment
    if ($method === 'GET') {
        if (isset($_GET['id'])) {
            $inv = assertEntityOwnership($pdo, 'investments', $_GET['id'], $userId);
            if (!empty($inv['bank_id'])) {
                $bStmt = $pdo->prepare("SELECT name FROM banks WHERE id = :bid");
                $bStmt->execute(['bid' => $inv['bank_id']]);
                $inv['bank_name'] = $bStmt->fetchColumn() ?: null;
            } else {
                $inv['bank_name'] = null;
            }
            $inv['units'] = $inv['quantity'];
            $inv['nav'] = $inv['current_price'];
            $inv['current_value'] = round((float)$inv['quantity'] * (float)$inv['current_price'], 2);
            $inv['profit_loss'] = round($inv['current_value'] - (float)$inv['remaining_cost_basis'], 2);
            sendFinancialSuccess($inv);
        }

        $where = ["i.user_id = :user_id"];
        $params = ['user_id' => $userId];

        if (!empty($_GET['type'])) {
            $where[] = "i.type = :type";
            $params['type'] = (string)$_GET['type'];
        }

        $whereClause = implode(" AND ", $where);
        $stmt = $pdo->prepare("
            SELECT i.*,
                   b.name AS bank_name,
                   i.quantity AS units,
                   i.current_price AS nav,
                   ROUND(i.quantity * i.current_price, 2) AS current_value,
                   ROUND((i.quantity * i.current_price) - i.remaining_cost_basis, 2) AS profit_loss
            FROM investments i
            LEFT JOIN banks b ON b.id = i.bank_id
            WHERE $whereClause
            ORDER BY i.id DESC
        ");
        $stmt->execute($params);
        $investments = $stmt->fetchAll(PDO::FETCH_ASSOC);

        sendFinancialSuccess($investments);
    }

    // Mutating methods require CSRF validation
    requireCsrfForMutation($userId, $rawToken);
    $input = getJsonRequestBody();
    if (empty($input)) {
        $input = $_POST;
    }

    // 2. POST: Create Investment or Sell Investment
    if ($method === 'POST') {
        $action = strtolower(trim((string)($input['action'] ?? 'create')));

        // =========================================================================
        // SELL INVESTMENT ACTION (ATOMIC TRANSACTION WITH FOR UPDATE)
        // =========================================================================
        if ($action === 'sell') {
            $legacyId = isset($input['legacy_id']) ? trim((string)$input['legacy_id']) : null;

            // Double submit / idempotency check
            if ($legacyId !== null && $legacyId !== '') {
                $checkStmt = $pdo->prepare("SELECT * FROM investment_transactions WHERE user_id = :user_id AND legacy_id = :legacy_id LIMIT 1");
                $checkStmt->execute(['user_id' => $userId, 'legacy_id' => $legacyId]);
                $existingTx = $checkStmt->fetch(PDO::FETCH_ASSOC);
                if ($existingTx) {
                    sendFinancialSuccess([
                        'idempotent' => true,
                        'message' => 'Transaksi penjualan sudah berhasil diproses sebelumnya.',
                        'transaction' => $existingTx
                    ], 200);
                }
            }

            // 1. Resolve Investment ID
            $rawInvId = $input['investment_id'] ?? ($input['id'] ?? null);
            if ($rawInvId === null || $rawInvId === '') {
                sendFinancialError('VALIDATION_ERROR', 'ID aset investasi yang dijual wajib disediakan.');
            }
            $invId = resolveEntityId($pdo, 'investments', $rawInvId, $userId);
            if (!$invId) {
                sendFinancialError('NOT_FOUND', 'Aset investasi tidak ditemukan atau bukan milik akun Anda.', 404);
            }

            // 2. Resolve Destination Bank ID
            $rawBankId = $input['bank_id'] ?? ($input['bankId'] ?? ($input['destination_bank_id'] ?? null));
            if ($rawBankId === null || $rawBankId === '') {
                sendFinancialError('VALIDATION_ERROR', 'Rekening bank tujuan pencairan wajib dipilih.');
            }
            $bankId = resolveEntityId($pdo, 'banks', $rawBankId, $userId);
            if (!$bankId) {
                sendFinancialError('NOT_FOUND', 'Rekening bank tujuan tidak ditemukan atau bukan milik akun Anda.', 404);
            }

            // 3. Validate Quantity & Price
            $quantityToSell = parseDecimal($input['quantity'] ?? ($input['units'] ?? null), 4, false);
            if ((float)$quantityToSell <= 0) {
                sendFinancialError('VALIDATION_ERROR', 'Jumlah unit/lot/gram yang dijual harus lebih dari 0.');
            }

            $sellPrice = parseDecimal($input['price'] ?? ($input['nav'] ?? ($input['sell_price'] ?? null)), 2, false);
            if ((float)$sellPrice <= 0) {
                sendFinancialError('VALIDATION_ERROR', 'Harga jual per unit harus lebih dari 0.');
            }

            $sellDate = !empty($input['transaction_date']) ? (string)$input['transaction_date'] : (!empty($input['date']) ? (string)$input['date'] : date('Y-m-d H:i:s'));

            // Begin Atomic Transaction
            $pdo->beginTransaction();
            try {
                // Lock investment row FOR UPDATE
                $invStmt = $pdo->prepare("SELECT * FROM investments WHERE id = :id AND user_id = :user_id FOR UPDATE");
                $invStmt->execute(['id' => $invId, 'user_id' => $userId]);
                $investment = $invStmt->fetch(PDO::FETCH_ASSOC);

                if (!$investment) {
                    throw new InvalidArgumentException("Aset investasi tidak ditemukan atau bukan milik akun Anda.");
                }

                $availableQuantity = (float)$investment['quantity'];
                if ((float)$quantityToSell > $availableQuantity + 0.00001) {
                    throw new InvalidArgumentException("Jumlah yang dijual ({$quantityToSell}) melebihi kepemilikan aset ({$availableQuantity}).");
                }

                // Lock destination bank row FOR UPDATE
                $bankStmt = $pdo->prepare("SELECT * FROM banks WHERE id = :id AND user_id = :user_id FOR UPDATE");
                $bankStmt->execute(['id' => $bankId, 'user_id' => $userId]);
                $bank = $bankStmt->fetch(PDO::FETCH_ASSOC);

                if (!$bank) {
                    throw new InvalidArgumentException("Rekening tujuan tidak ditemukan atau bukan milik akun Anda.");
                }

                // Calculations:
                // proceeds = quantity * sellPrice
                $proceeds = round((float)$quantityToSell * (float)$sellPrice, 2);
                if ($proceeds <= 0) {
                    throw new InvalidArgumentException("Nilai total penjualan harus lebih dari 0.");
                }

                // proportional_cost_basis:
                // If selling entire remaining quantity, proportional cost basis is exact remaining cost basis
                $currentRemCost = (float)$investment['remaining_cost_basis'];
                if (abs($availableQuantity - (float)$quantityToSell) <= 0.0001) {
                    $proportionalCost = round($currentRemCost, 2);
                    $newQuantity = 0.0;
                    $newRemCost = 0.0;
                } else {
                    $soldRatio = (float)$quantityToSell / $availableQuantity;
                    $proportionalCost = round($currentRemCost * $soldRatio, 2);
                    $newQuantity = round($availableQuantity - (float)$quantityToSell, 4);
                    $newRemCost = max(0.0, round($currentRemCost - $proportionalCost, 2));
                }

                // Realized P/L = proceeds - proportional_cost_basis
                $realizedPnl = round($proceeds - $proportionalCost, 2);

                // 4. Add proceeds to destination bank
                $updBank = $pdo->prepare("UPDATE banks SET balance = balance + :proceeds, updated_at = NOW() WHERE id = :id AND user_id = :user_id");
                $updBank->execute([
                    'proceeds' => $proceeds,
                    'id' => $bankId,
                    'user_id' => $userId
                ]);

                // 5. Record income transaction in transactions table
                // Clear type: 'income', category: 'Investasi', note indicates proceeds from sale
                $assetName = (string)$investment['asset_name'];
                $txLegacyId = $legacyId ? "tx_sell_{$legacyId}" : "tx_sell_" . uniqid();
                $txDesc = "Penjualan Investasi {$assetName} ({$quantityToSell} {$investment['unit']})";
                $insTx = $pdo->prepare("
                    INSERT INTO transactions (
                        user_id, legacy_id, bank_id, source_bank_id, destination_bank_id,
                        admin_fee, type, category, description, amount,
                        transaction_date, note, payment_method, source, bill_id, recurring_id, created_at
                    ) VALUES (
                        :user_id, :legacy_id, :bank_id, NULL, :dest_bank_id,
                        0.00, 'income', 'Investasi', :description, :amount,
                        :transaction_date, 'Hasil pencairan penjualan investasi', 'Transfer / Debit', 'manual', NULL, NULL, NOW()
                    )
                ");
                $insTx->execute([
                    'user_id' => $userId,
                    'legacy_id' => $txLegacyId,
                    'bank_id' => $bankId,
                    'dest_bank_id' => $bankId,
                    'description' => $txDesc,
                    'amount' => $proceeds,
                    'transaction_date' => substr($sellDate, 0, 10)
                ]);

                // 6. Record in investment_transactions table
                $itxLegacyId = $legacyId ?: "itx_sell_" . uniqid();
                $insItx = $pdo->prepare("
                    INSERT INTO investment_transactions (
                        user_id, legacy_id, investment_id, bank_id, type, asset_symbol,
                        quantity, unit, price, total_amount, cost_basis, realized_pnl,
                        transaction_date, created_at
                    ) VALUES (
                        :user_id, :legacy_id, :investment_id, :bank_id, 'sell', :asset_symbol,
                        :quantity, :unit, :price, :total_amount, :cost_basis, :realized_pnl,
                        :transaction_date, NOW()
                    )
                ");
                $insItx->execute([
                    'user_id' => $userId,
                    'legacy_id' => $itxLegacyId,
                    'investment_id' => $invId,
                    'bank_id' => $bankId,
                    'asset_symbol' => $investment['asset_symbol'],
                    'quantity' => $quantityToSell,
                    'unit' => $investment['unit'],
                    'price' => $sellPrice,
                    'total_amount' => $proceeds,
                    'cost_basis' => $proportionalCost,
                    'realized_pnl' => $realizedPnl,
                    'transaction_date' => $sellDate
                ]);

                // 7. Update or mark sold / remove investment
                // CRITICAL: investment_source_type MUST BE PRESERVED!
                if ($newQuantity <= 0.0001) {
                    $delStmt = $pdo->prepare("DELETE FROM investments WHERE id = :id AND user_id = :user_id");
                    $delStmt->execute(['id' => $invId, 'user_id' => $userId]);
                    $remainingHolding = null;
                } else {
                    $updInv = $pdo->prepare("
                        UPDATE investments
                        SET quantity = :quantity,
                            remaining_cost_basis = :rem_cost,
                            cost_basis = :cost_basis,
                            current_price = :current_price,
                            updated_at = NOW()
                        WHERE id = :id AND user_id = :user_id
                    ");
                    $updInv->execute([
                        'quantity' => $newQuantity,
                        'rem_cost' => $newRemCost,
                        'cost_basis' => $newRemCost,
                        'current_price' => $sellPrice,
                        'id' => $invId,
                        'user_id' => $userId
                    ]);

                    $remainingHolding = assertEntityOwnership($pdo, 'investments', $invId, $userId);
                }

                $pdo->commit();

                // Fetch updated destination bank balance
                $bCheck = $pdo->prepare("SELECT id, name, balance FROM banks WHERE id = :id");
                $bCheck->execute(['id' => $bankId]);
                $updatedBank = $bCheck->fetch(PDO::FETCH_ASSOC);

                sendFinancialSuccess([
                    'success' => true,
                    'sold' => true,
                    'full_exit' => ($newQuantity <= 0.0001),
                    'quantity_sold' => (float)$quantityToSell,
                    'proceeds' => $proceeds,
                    'proportional_cost_basis' => $proportionalCost,
                    'realized_pnl' => $realizedPnl,
                    'destination_bank' => $updatedBank,
                    'remaining_holding' => $remainingHolding
                ], 200);

            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                error_log('[SELL ERROR] ' . $e->getMessage() . ' on line ' . $e->getLine());
                throw new Exception($e->getMessage() . ' on line ' . $e->getLine());
            }
        }

        // =========================================================================
        // CREATE INVESTMENT ACTION
        // =========================================================================
        $legacyId = isset($input['legacy_id']) ? trim((string)$input['legacy_id']) : null;

        // Determine source type: 'opening_balance' (existing investment) or 'purchase_from_account'
        $sourceTypeRaw = strtolower(trim((string)($input['investment_source_type'] ?? ($input['source_type'] ?? ($input['investmentSourceType'] ?? '')))));
        if ($sourceTypeRaw === 'existing_investment' || $sourceTypeRaw === 'opening_balance') {
            $sourceType = 'opening_balance';
        } elseif ($sourceTypeRaw === 'purchase_from_account' || $sourceTypeRaw === 'purchase') {
            $sourceType = 'purchase_from_account';
        } else {
            // Backward compatibility: If bank_id provided, default to purchase_from_account; otherwise opening_balance
            $sourceType = (!empty($input['bank_id']) || !empty($input['bankId'])) ? 'purchase_from_account' : 'opening_balance';
        }

        // Idempotency check: return existing if legacy_id already stored
        if ($legacyId !== null && $legacyId !== '') {
            $checkStmt = $pdo->prepare("SELECT * FROM investments WHERE user_id = :user_id AND legacy_id = :legacy_id LIMIT 1");
            $checkStmt->execute(['user_id' => $userId, 'legacy_id' => $legacyId]);
            $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
            if ($existing) {
                sendFinancialSuccess($existing, 200, ['idempotent' => true]);
            }
        }

        // Validation: Type
        $typeRaw = strtolower(trim((string)($input['type'] ?? '')));
        $typeMap = [
            'saham' => 'stock',
            'emas' => 'gold',
            'obligasi' => 'bond',
            'reksadana' => 'reksadana',
            'stock' => 'stock',
            'gold' => 'gold',
            'bond' => 'bond',
            'crypto' => 'crypto',
            'other' => 'other'
        ];
        $type = $typeMap[$typeRaw] ?? $typeRaw;
        $allowedTypes = ['stock', 'gold', 'bond', 'reksadana', 'crypto', 'other'];
        if (!in_array($type, $allowedTypes, true)) {
            sendFinancialError('VALIDATION_ERROR', 'Tipe investasi tidak valid.');
        }

        // Validation: Asset symbol & name
        $assetSymbol = trim((string)($input['asset_symbol'] ?? ($input['code'] ?? ($input['symbol'] ?? ''))));
        $assetName = trim((string)($input['asset_name'] ?? ($input['name'] ?? ($input['asset'] ?? ''))));
        if ($assetSymbol === '' && $assetName !== '') {
            $assetSymbol = strtoupper(substr(preg_replace('/[^a-zA-Z0-9]/', '', $assetName), 0, 10));
        }
        if ($assetName === '' && $assetSymbol !== '') {
            $assetName = $assetSymbol;
        }
        if ($assetSymbol === '' || $assetName === '') {
            sendFinancialError('VALIDATION_ERROR', 'Simbol dan nama aset investasi wajib diisi.');
        }

        // Validation: Quantity & Prices
        $quantity = parseDecimal($input['quantity'] ?? ($input['units'] ?? null), 4, false);
        if ((float)$quantity <= 0) {
            sendFinancialError('VALIDATION_ERROR', 'Jumlah unit/quantity investasi harus lebih dari 0.');
        }

        $unit = trim((string)($input['unit'] ?? 'unit'));
        $buyPrice = parseDecimal($input['buy_price'] ?? ($input['avgPrice'] ?? ($input['price'] ?? ($input['nav'] ?? null))), 2, false);
        if ((float)$buyPrice <= 0) {
            sendFinancialError('VALIDATION_ERROR', 'Harga beli per unit harus lebih dari 0.');
        }

        $calculatedCost = (float)$buyPrice * (float)$quantity;
        $costBasis = parseDecimal($input['cost_basis'] ?? ($input['investedCapital'] ?? $calculatedCost), 2, false);
        if ((float)$costBasis <= 0) {
            sendFinancialError('VALIDATION_ERROR', 'Total modal investasi harus lebih dari 0.');
        }

        $remainingCostBasis = parseDecimal($input['remaining_cost_basis'] ?? $costBasis, 2, false);
        $currentPrice = parseDecimal($input['current_price'] ?? ($input['currentPrice'] ?? ($input['nav'] ?? $buyPrice)), 2, false);
        $buyDate = !empty($input['buy_date']) ? (string)$input['buy_date'] : (!empty($input['buyDate']) ? (string)$input['buyDate'] : date('Y-m-d'));

        // Bond & Reksadana specific optional fields
        $bondCode = isset($input['bond_code']) ? trim((string)$input['bond_code']) : (isset($input['bondCode']) ? trim((string)$input['bondCode']) : null);
        $bondType = isset($input['bond_type']) ? trim((string)$input['bond_type']) : (isset($input['bondType']) ? trim((string)$input['bondType']) : null);
        $nominal = isset($input['nominal']) ? parseDecimal($input['nominal'], 2, false) : null;
        $couponRate = isset($input['coupon_rate']) ? parseDecimal($input['coupon_rate'], 2, false) : (isset($input['couponRate']) ? parseDecimal($input['couponRate'], 2, false) : null);
        $couponFreq = isset($input['coupon_frequency']) ? (string)$input['coupon_frequency'] : (isset($input['couponFrequency']) ? (string)$input['couponFrequency'] : null);
        $maturityDate = isset($input['maturity_date']) ? (string)$input['maturity_date'] : (isset($input['maturityDate']) ? (string)$input['maturityDate'] : null);
        $manager = isset($input['manager']) ? trim((string)$input['manager']) : null;
        $category = isset($input['category']) ? trim((string)$input['category']) : null;

        $bankId = null;

        // ATOMIC TRANSACTION EXECUTION
        $pdo->beginTransaction();

        try {
            if ($sourceType === 'purchase_from_account') {
                $rawBank = $input['bank_id'] ?? ($input['bankId'] ?? null);
                if ($rawBank === null || $rawBank === '') {
                    throw new InvalidArgumentException('Rekening sumber dana wajib dipilih untuk pembelian investasi.');
                }

                $bankId = resolveEntityId($pdo, 'banks', $rawBank, $userId);
                if (!$bankId) {
                    throw new InvalidArgumentException('Rekening sumber tidak ditemukan.');
                }

                // Lock bank and assert ownership
                $bankStmt = $pdo->prepare("SELECT id, name, balance FROM banks WHERE id = :id AND user_id = :user_id FOR UPDATE");
                $bankStmt->execute(['id' => $bankId, 'user_id' => $userId]);
                $bank = $bankStmt->fetch(PDO::FETCH_ASSOC);

                if (!$bank) {
                    throw new InvalidArgumentException('Rekening sumber tidak ditemukan atau bukan milik Anda.');
                }

                $currentBal = (float)$bank['balance'];
                $requiredAmt = (float)$costBasis;

                if ($currentBal < $requiredAmt) {
                    throw new InvalidArgumentException("Saldo rekening {$bank['name']} tidak mencukupi untuk pembelian investasi. Saldo saat ini: Rp " . number_format($currentBal, 0, ',', '.') . ", Dibutuhkan: Rp " . number_format($requiredAmt, 0, ',', '.'));
                }

                // 1. Deduct bank balance
                $updBank = $pdo->prepare("UPDATE banks SET balance = balance - :amt, updated_at = NOW() WHERE id = :id AND user_id = :user_id");
                $updBank->execute(['amt' => $costBasis, 'id' => $bankId, 'user_id' => $userId]);

                // 2. Insert into transactions table as expense/investment_buy
                $txLegacyId = $legacyId ? "tx_inv_{$legacyId}" : null;
                $txDesc = "Beli Investasi {$assetName}";
                $insTx = $pdo->prepare("
                    INSERT INTO transactions (
                        user_id, legacy_id, bank_id, source_bank_id, destination_bank_id,
                        admin_fee, type, category, description, amount,
                        transaction_date, note, payment_method, source, bill_id, recurring_id, created_at
                    ) VALUES (
                        :user_id, :legacy_id, :bank_id, NULL, NULL,
                        0.00, 'expense', 'Investasi', :description, :amount,
                        :transaction_date, 'Pembelian investasi dari rekening', 'Transfer / Debit', 'manual', NULL, NULL, NOW()
                    )
                ");
                $insTx->execute([
                    'user_id' => $userId,
                    'legacy_id' => $txLegacyId,
                    'bank_id' => $bankId,
                    'description' => $txDesc,
                    'amount' => $costBasis,
                    'transaction_date' => $buyDate
                ]);

            } else {
                // Opening balance / existing investment mode:
                // No deduction, bank_id is optional / NULL
                $rawBank = $input['bank_id'] ?? ($input['bankId'] ?? null);
                if ($rawBank !== null && $rawBank !== '') {
                    $resolved = resolveEntityId($pdo, 'banks', $rawBank, $userId);
                    if ($resolved) {
                        $bankId = $resolved;
                    }
                }
            }

            // Insert Investment
            $insertSql = "
                INSERT INTO investments (
                    user_id, investment_source_type, legacy_id, bank_id, type, asset_symbol, asset_name,
                    quantity, unit, buy_price, cost_basis, remaining_cost_basis, current_price,
                    bond_code, bond_type, nominal, coupon_rate, coupon_frequency, buy_date, maturity_date,
                    manager, category, created_at, updated_at
                ) VALUES (
                    :user_id, :source_type, :legacy_id, :bank_id, :type, :asset_symbol, :asset_name,
                    :quantity, :unit, :buy_price, :cost_basis, :remaining_cost_basis, :current_price,
                    :bond_code, :bond_type, :nominal, :coupon_rate, :coupon_frequency, :buy_date, :maturity_date,
                    :manager, :category, NOW(), NOW()
                )
            ";
            $stmt = $pdo->prepare($insertSql);
            $stmt->execute([
                'user_id' => $userId,
                'source_type' => $sourceType,
                'legacy_id' => $legacyId,
                'bank_id' => $bankId,
                'type' => $type,
                'asset_symbol' => $assetSymbol,
                'asset_name' => $assetName,
                'quantity' => $quantity,
                'unit' => $unit,
                'buy_price' => $buyPrice,
                'cost_basis' => $costBasis,
                'remaining_cost_basis' => $remainingCostBasis,
                'current_price' => $currentPrice,
                'bond_code' => $bondCode,
                'bond_type' => $bondType,
                'nominal' => $nominal,
                'coupon_rate' => $couponRate,
                'coupon_frequency' => $couponFreq,
                'buy_date' => $buyDate,
                'maturity_date' => $maturityDate,
                'manager' => $manager,
                'category' => $category
            ]);

            $invId = (int)$pdo->lastInsertId();

            // Insert investment_transaction record for history
            $itxLegacyId = $legacyId ? "itx_{$legacyId}" : null;
            $insItx = $pdo->prepare("
                INSERT INTO investment_transactions (
                    user_id, legacy_id, investment_id, bank_id, type, asset_symbol,
                    quantity, unit, price, total_amount, cost_basis, realized_pnl,
                    transaction_date, created_at
                ) VALUES (
                    :user_id, :legacy_id, :investment_id, :bank_id, 'buy', :asset_symbol,
                    :quantity, :unit, :price, :total_amount, :cost_basis, 0.00,
                    :transaction_date, NOW()
                )
            ");
            $insItx->execute([
                'user_id' => $userId,
                'legacy_id' => $itxLegacyId,
                'investment_id' => $invId,
                'bank_id' => $bankId,
                'asset_symbol' => $assetSymbol,
                'quantity' => $quantity,
                'unit' => $unit,
                'price' => $buyPrice,
                'total_amount' => $costBasis,
                'cost_basis' => $costBasis,
                'transaction_date' => $buyDate . ' ' . date('H:i:s')
            ]);

            $pdo->commit();

            $createdInv = assertEntityOwnership($pdo, 'investments', $invId, $userId);
            sendFinancialSuccess($createdInv, 201);

        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    // 3. PUT: Update Investment
    if ($method === 'PUT') {
        $id = $input['id'] ?? $_GET['id'] ?? null;
        if (!$id) {
            sendFinancialError('VALIDATION_ERROR', 'ID investasi wajib disediakan.');
        }

        $existing = assertEntityOwnership($pdo, 'investments', $id, $userId);
        $realId = (int)$existing['id'];

        $assetName = isset($input['asset_name']) ? trim((string)$input['asset_name']) : (string)$existing['asset_name'];
        $currentPrice = isset($input['current_price']) ? parseDecimal($input['current_price'], 2, false) : (isset($input['nav']) ? parseDecimal($input['nav'], 2, false) : (string)$existing['current_price']);
        $quantity = isset($input['quantity']) ? parseDecimal($input['quantity'], 4, false) : (string)$existing['quantity'];
        $costBasis = isset($input['cost_basis']) ? parseDecimal($input['cost_basis'], 2, false) : (string)$existing['cost_basis'];
        $remainingCostBasis = isset($input['remaining_cost_basis']) ? parseDecimal($input['remaining_cost_basis'], 2, false) : (string)$existing['remaining_cost_basis'];

        $stmt = $pdo->prepare("
            UPDATE investments
            SET asset_name = :asset_name, current_price = :current_price, quantity = :quantity,
                cost_basis = :cost_basis, remaining_cost_basis = :remaining_cost_basis, updated_at = NOW()
            WHERE id = :id AND user_id = :user_id
        ");
        $stmt->execute([
            'asset_name' => $assetName,
            'current_price' => $currentPrice,
            'quantity' => $quantity,
            'cost_basis' => $costBasis,
            'remaining_cost_basis' => $remainingCostBasis,
            'id' => $realId,
            'user_id' => $userId
        ]);

        $updated = assertEntityOwnership($pdo, 'investments', $realId, $userId);
        sendFinancialSuccess($updated);
    }

    // 4. DELETE: Delete Investment
    if ($method === 'DELETE') {
        $id = $input['id'] ?? $_GET['id'] ?? null;
        if (!$id) {
            sendFinancialError('VALIDATION_ERROR', 'ID investasi wajib disediakan.');
        }

        $existing = assertEntityOwnership($pdo, 'investments', $id, $userId);
        $realId = (int)$existing['id'];

        $stmt = $pdo->prepare("DELETE FROM investments WHERE id = :id AND user_id = :user_id");
        $stmt->execute(['id' => $realId, 'user_id' => $userId]);

        sendFinancialSuccess(['id' => $realId, 'deleted' => true]);
    }

    sendFinancialError('METHOD_NOT_ALLOWED', 'Method tidak didukung.', 405);

} catch (InvalidArgumentException $e) {
    sendFinancialError('VALIDATION_ERROR', $e->getMessage(), 400);
} catch (Throwable $e) {
    error_log('[INVESTMENTS ERROR] ' . $e->getMessage());
    sendFinancialError('SERVER_ERROR', 'Terjadi kesalahan sistem saat memproses investasi: ' . $e->getMessage(), 500);
}
