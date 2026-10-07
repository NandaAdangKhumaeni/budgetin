<?php
/**
 * BUDGETIN - CSRF Token Endpoint
 * GET /api/auth/csrf.php
 */

declare(strict_types=1);

require_once __DIR__ . '/auth_helper.php';

try {
    $pdo = getDbConnection();
    $user = getSessionUser($pdo);

    if (!$user) {
        sendJsonResponse([
            'success' => false,
            'error' => 'UNAUTHENTICATED',
            'message' => 'Silakan login terlebih dahulu untuk mendapatkan token CSRF.'
        ], 401);
    }

    $rawToken = (string)($user['raw_token'] ?? '');
    $csrfToken = generateCsrfToken((string)$user['id'], $rawToken);

    sendJsonResponse([
        'success' => true,
        'csrfToken' => $csrfToken
    ], 200);

} catch (Throwable $e) {
    error_log('[BUDGETIN CSRF ERROR] ' . $e->getMessage());
    sendJsonResponse([
        'success' => false,
        'error' => 'SERVER_ERROR',
        'message' => 'Gagal membuat token CSRF.'
    ], 500);
}
