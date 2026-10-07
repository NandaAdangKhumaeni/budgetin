<?php
/**
 * BUDGETIN - Migration Preview Endpoint
 * POST api/migration/preview.php
 */

declare(strict_types=1);

require_once __DIR__ . '/migration_helper.php';

if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    sendFinancialError('METHOD_NOT_ALLOWED', 'Method tidak didukung.', 405);
}

try {
    $pdo = getDbConnection();
    $user = getAuthenticatedFinancialUser($pdo);
    $userId = (string)$user['id'];
    $serverEmail = strtolower(trim((string)$user['email']));

    $snapshot = getJsonRequestBody();
    if (empty($snapshot)) {
        $snapshot = $_POST;
    }

    // 1. Email matching validation
    $localEmail = strtolower(trim((string)($snapshot['budgetin_user_email'] ?? $snapshot['user_email'] ?? $snapshot['email'] ?? '')));
    $emailMatch = ($localEmail === '' || $localEmail === $serverEmail);

    $warnings = [];
    if (!$emailMatch) {
        $warnings[] = "Email LocalStorage ($localEmail) tidak cocok dengan akun server terotentikasi ($serverEmail).";
    }

    // 2. Extract standardized entities
    $entities = extractEntitySnapshots($snapshot);

    // 3. Check duplicate legacy IDs within snapshot
    $duplicates = checkSnapshotDuplicateLegacyIds($entities);
    if (!empty($duplicates)) {
        $warnings[] = "Ditemukan duplikasi legacy ID di dalam snapshot LocalStorage.";
    }

    // 4. Check existing records in MySQL for each entity (idempotency check)
    $breakdown = [];
    $conflicts = [];

    $tableMap = [
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

    foreach ($entities as $entityKey => $items) {
        $tbl = $tableMap[$entityKey] ?? $entityKey;
        $totalItems = count($items);

        if ($totalItems === 0) {
            $breakdown[$entityKey] = ['total' => 0, 'new' => 0, 'existing' => 0, 'skipped' => 0];
            continue;
        }

        // Fetch existing legacy IDs for this user
        $stmt = $pdo->prepare("SELECT legacy_id FROM `$tbl` WHERE user_id = :user_id AND legacy_id IS NOT NULL");
        $stmt->execute(['user_id' => $userId]);
        $existingLegacyIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
        $existingMap = array_flip(array_map('strval', $existingLegacyIds));

        $newCount = 0;
        $existingCount = 0;

        foreach ($items as $item) {
            $id = (string)($item['id'] ?? $item['legacy_id'] ?? $item['category'] ?? '');
            if ($id !== '' && isset($existingMap[$id])) {
                $existingCount++;
            } else {
                $newCount++;
            }
        }

        $breakdown[$entityKey] = [
            'total' => $totalItems,
            'new' => $newCount,
            'existing' => $existingCount,
            'skipped' => $existingCount // Existing items are safely skipped on rerun
        ];
    }

    // 5. Compute source deterministic hash
    $sourceHash = calculateDeterministicFinancialHash($entities);

    $canMigrate = $emailMatch && empty($duplicates);

    sendJsonResponse([
        'success' => true,
        'authenticated' => true,
        'serverEmail' => $serverEmail,
        'localEmail' => $localEmail,
        'emailMatch' => $emailMatch,
        'entities' => $breakdown,
        'conflicts' => $conflicts,
        'duplicates' => $duplicates,
        'warnings' => $warnings,
        'sourceHash' => $sourceHash,
        'canMigrate' => $canMigrate
    ], 200);

} catch (Throwable $e) {
    error_log('[MIGRATION PREVIEW ERROR] ' . $e->getMessage());
    sendFinancialError('PREVIEW_ERROR', 'Gagal membuat preview migrasi: ' . $e->getMessage(), 500);
}
