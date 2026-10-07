<?php
/**
 * BUDGETIN - Migration Reconciliation Endpoint
 * POST api/migration/reconcile.php
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

    $snapshot = getJsonRequestBody();
    if (empty($snapshot)) {
        $snapshot = $_POST;
    }

    $entities = extractEntitySnapshots($snapshot);
    $sourceHash = calculateDeterministicFinancialHash($entities);
    $targetHash = calculateDatabaseEntityHash($pdo, $userId);
    $reconciliation = calculateReconciliationMetrics($entities, $pdo, $userId);

    sendJsonResponse([
        'success' => true,
        'userId' => $userId,
        'sourceHash' => $sourceHash,
        'targetHash' => $targetHash,
        'hashesMatch' => ($sourceHash === $targetHash),
        'status' => $reconciliation['status'],
        'metrics' => $reconciliation['metrics'],
        'reconciliation' => $reconciliation
    ], 200);

} catch (Throwable $e) {
    error_log('[RECONCILIATION ERROR] ' . $e->getMessage());
    sendFinancialError('RECONCILIATION_ERROR', 'Gagal memproses rekonsiliasi: ' . $e->getMessage(), 500);
}
