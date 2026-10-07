<?php
/**
 * BUDGETIN - Current Authenticated User Endpoint
 * GET /api/auth/me.php
 */

declare(strict_types=1);

require_once __DIR__ . '/auth_helper.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJsonResponse([
        'authenticated' => false,
        'error' => 'METHOD_NOT_ALLOWED',
        'message' => 'Hanya method GET yang diperbolehkan.'
    ], 405);
}

try {
    $pdo = getDbConnection();
    $user = getSessionUser($pdo);

    if (!$user) {
        $diag = null;
        if (isset($_GET['diag']) && $_GET['diag'] === '1') {
            $hasCookie = !empty($_COOKIE[SESSION_COOKIE_NAME]);
            $cookieVal = $_COOKIE[SESSION_COOKIE_NAME] ?? '';
            $cookieLen = strlen($cookieVal);
            $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
            $sessId = session_id();
            $diag = [
                'has_cookie' => $hasCookie,
                'cookie_length' => $cookieLen,
                'cookie_format' => (preg_match('/^[a-f0-9]{64}$/i', $cookieVal) ? '64_hex' : (preg_match('/^[a-f0-9]{32,63}$/i', $cookieVal) ? 'hex_other' : 'non_hex_or_empty')),
                'session_id_length' => strlen($sessId),
                'session_id_format' => (preg_match('/^[a-f0-9]{64}$/i', $sessId) ? '64_hex' : (preg_match('/^[a-f0-9]{32,63}$/i', $sessId) ? 'hex_other' : 'non_hex_or_empty')),
                'has_auth_header' => !empty($authHeader),
                'session_active' => (session_status() === PHP_SESSION_ACTIVE),
                'cookies_received_keys' => array_keys($_COOKIE),
                'user_sessions_match' => false
            ];
        }

        sendJsonResponse(array_filter([
            'authenticated' => false,
            'debug' => $diag
        ], fn($v) => $v !== null), 200);
    }

    $rawToken = (string)($user['raw_token'] ?? '');
    $csrfToken = generateCsrfToken((string)$user['id'], $rawToken);

    $diag = null;
    if (isset($_GET['diag']) && $_GET['diag'] === '1') {
        $cookieVal = $_COOKIE[SESSION_COOKIE_NAME] ?? '';
        $sessId = session_id();
        $diag = [
            'has_cookie' => !empty($_COOKIE[SESSION_COOKIE_NAME]),
            'cookie_length' => strlen($cookieVal),
            'cookie_format' => (preg_match('/^[a-f0-9]{64}$/i', $cookieVal) ? '64_hex' : (preg_match('/^[a-f0-9]{32,63}$/i', $cookieVal) ? 'hex_other' : 'non_hex_or_empty')),
            'session_id_length' => strlen($sessId),
            'session_id_format' => (preg_match('/^[a-f0-9]{64}$/i', $sessId) ? '64_hex' : (preg_match('/^[a-f0-9]{32,63}$/i', $sessId) ? 'hex_other' : 'non_hex_or_empty')),
            'session_active' => (session_status() === PHP_SESSION_ACTIVE),
            'cookies_received_keys' => array_keys($_COOKIE),
            'user_sessions_match' => true
        ];
    }

    sendJsonResponse(array_filter([
        'authenticated' => true,
        'user' => [
            'id' => (string)$user['id'],
            'name' => (string)$user['name'],
            'email' => (string)$user['email']
        ],
        'csrfToken' => $csrfToken,
        'debug' => $diag
    ], fn($v) => $v !== null), 200);

} catch (Throwable $e) {
    error_log('[BUDGETIN ME ERROR] ' . $e->getMessage());
    sendJsonResponse([
        'authenticated' => false
    ], 200);
}
