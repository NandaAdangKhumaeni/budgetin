<?php
/**
 * BUDGETIN - User Logout Endpoint
 * POST /api/auth/logout.php
 */

declare(strict_types=1);

require_once __DIR__ . '/auth_helper.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJsonResponse([
        'success' => false,
        'error' => 'METHOD_NOT_ALLOWED',
        'message' => 'Hanya method POST yang diperbolehkan.'
    ], 405);
}

try {
    $rawToken = getRawSessionToken();

    if ($rawToken) {
        $pdo = getDbConnection();
        $tokenHash = hashSessionToken($rawToken);

        // Delete session record from database
        $stmt = $pdo->prepare("DELETE FROM user_sessions WHERE token_hash = :token_hash");
        $stmt->execute(['token_hash' => $tokenHash]);
    }

    startBudgetinSession();
    $_SESSION = [];
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_destroy();
    }

    // Clear session cookie regardless of database presence
    clearSessionCookie();

    sendJsonResponse([
        'success' => true,
        'message' => 'Logout berhasil.'
    ], 200);

} catch (Throwable $e) {
    error_log('[BUDGETIN LOGOUT ERROR] ' . $e->getMessage());
    // Ensure cookie is cleared even on internal failure
    clearSessionCookie();
    sendJsonResponse([
        'success' => true,
        'message' => 'Logout berhasil.'
    ], 200);
}
