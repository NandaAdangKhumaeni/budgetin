<?php
/**
 * BUDGETIN - User Login Endpoint
 * POST /api/auth/login.php
 */

declare(strict_types=1);

require_once __DIR__ . '/auth_helper.php';

$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }


if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJsonResponse([
        'success' => false,
        'error' => 'METHOD_NOT_ALLOWED',
        'message' => 'Hanya method POST yang diperbolehkan.'
    ], 405);
}

$input = getJsonRequestBody();
if (empty($input)) {
    $input = $_POST;
}

$email = strtolower(trim((string)($input['email'] ?? '')));
$password = (string)($input['password'] ?? '');
$clientIp = getClientIp();

// 1. Basic validation
if ($email === '' || $password === '') {
    sendJsonResponse([
        'success' => false,
        'error' => 'AUTHENTICATION_FAILED',
        'message' => 'Email atau password salah.'
    ], 401);
}

// 2. Brute-force rate limiting check (Section 13)
if (isLoginRateLimited($clientIp, $email)) {
    sendJsonResponse([
        'success' => false,
        'error' => 'TOO_MANY_REQUESTS',
        'message' => 'Terlalu banyak percobaan login yang gagal. Akun sementara dibatasi untuk keamanan. Silakan coba lagi dalam 15 menit.'
    ], 429);
}

try {
    $pdo = getDbConnection();

    // 3. User Lookup
    $stmt = $pdo->prepare("SELECT id, name, email, password_hash, algorithm FROM users WHERE email = :email LIMIT 1");
    $stmt->execute(['email' => $email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    // 4. Verify Password
    $isValid = false;
    if ($user && is_string($user['password_hash'])) {
        $isValid = password_verify($password, $user['password_hash']);
    }

    if (!$isValid) {
        // Record failed attempt
        recordLoginAttempt($clientIp, $email, false);

        // Generic error message to prevent enumeration (Section 5 & 14)
        sendJsonResponse([
            'success' => false,
            'error' => 'AUTHENTICATION_FAILED',
            'message' => 'Email atau password salah.'
        ], 401);
    }

    // 5. Success - Reset failed attempts
    recordLoginAttempt($clientIp, $email, true);

    // 6. Create Server Session (Section 6 & 7)
    $rawToken = generateSessionToken();
    $tokenHash = hashSessionToken($rawToken);
    $sessionId = generateSecureId('sess_');
    $expiresTimestamp = time() + SESSION_LIFETIME_SECONDS;
    $expiresAt = date('Y-m-d H:i:s', $expiresTimestamp);
    $now = date('Y-m-d H:i:s');

    // Clean up expired sessions for maintenance
    $cleanOldSess = $pdo->prepare("DELETE FROM user_sessions WHERE expires_at <= NOW()");
    $cleanOldSess->execute();

    $sessionSql = "INSERT INTO user_sessions (id, user_id, token_hash, expires_at, created_at)
                   VALUES (:id, :user_id, :token_hash, :expires_at, :created_at)";
    $sessStmt = $pdo->prepare($sessionSql);
    $sessStmt->execute([
        'id' => $sessionId,
        'user_id' => (string)$user['id'],
        'token_hash' => $tokenHash,
        'expires_at' => $expiresAt,
        'created_at' => $now
    ]);

    // 7. Set PHP native session & HttpOnly Cookie (Section 4 & 6)
    startBudgetinSession($rawToken);
    $_SESSION['user_id'] = (string)$user['id'];
    $_SESSION['name'] = (string)$user['name'];
    $_SESSION['email'] = (string)$user['email'];
    $_SESSION['session_id'] = $sessionId;
    $_SESSION['raw_token'] = $rawToken;

    // Explicitly emit HttpOnly cookie with rawToken to guarantee persistence across browser requests
    setSessionCookie($rawToken, $expiresTimestamp);

    // 8. Generate CSRF Token for state mutations (Section 11)
    $csrfToken = generateCsrfToken((string)$user['id'], $rawToken);

    // 9. Sanitized Response (Zero password/hash exposure)
    sendJsonResponse([
        'success' => true,
        'user' => [
            'id' => (string)$user['id'],
            'name' => (string)$user['name'],
            'email' => (string)$user['email']
        ],
        'csrfToken' => $csrfToken,
        'diagnostic' => [
            'token_length' => strlen($rawToken),
            'token_format' => (preg_match('/^[a-f0-9]{64}$/i', $rawToken) ? '64_hex' : 'non_hex'),
            'session_id_length' => strlen(session_id()),
            'session_id_format' => (preg_match('/^[a-f0-9]{64}$/i', session_id()) ? '64_hex' : 'non_hex'),
            'set_cookie_name' => SESSION_COOKIE_NAME,
            'cookie_sent' => true
        ]
    ], 200);

} catch (Throwable $e) {
    error_log('[BUDGETIN LOGIN ERROR] ' . $e->getMessage());
    sendJsonResponse([
        'success' => false,
        'error' => 'SERVER_ERROR',
        'message' => 'Terjadi kesalahan sistem saat memproses login.'
    ], 500);
}
