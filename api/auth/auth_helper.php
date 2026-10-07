<?php
/**
 * BUDGETIN - Server-Side Authentication Helper Library
 * Phase 2: Server-Side Authentication & Session Foundation
 */

declare(strict_types=1);

require_once __DIR__ . '/../db.php';

const SESSION_COOKIE_NAME = 'budgetin_session';
const SESSION_LIFETIME_SECONDS = 7 * 86400; // 7 days
const RESET_TOKEN_LIFETIME_SECONDS = 3600; // 1 hour
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_SECONDS = 15 * 60; // 15 minutes
const CSRF_SECRET = 'budgetin_csrf_secret_v2_2026_salt';

/**
 * Send JSON response and terminate script execution.
 */
function sendJsonResponse(array $data, int $statusCode = 200): void
{
    if (!headers_sent()) {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Generate cryptographically secure identifier (e.g. usr_..., sess_...).
 */
function generateSecureId(string $prefix = 'usr_'): string
{
    return $prefix . bin2hex(random_bytes(16));
}

/**
 * Generate cryptographically secure session token.
 */
function generateSessionToken(): string
{
    return bin2hex(random_bytes(32));
}

/**
 * Hash raw session token before persisting in database.
 */
function hashSessionToken(string $token): string
{
    return hash('sha256', $token);
}

/**
 * Generate cryptographically secure password reset token (64 hex chars).
 */
function generateResetToken(): string
{
    return bin2hex(random_bytes(32));
}

/**
 * Hash raw password reset token before persisting in database.
 */
function hashResetToken(string $token): string
{
    return hash('sha256', $token);
}

/**
 * Check if the current request is running over HTTPS.
 */
function isHttpsRequest(): bool
{
    if (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    if (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443) {
        return true;
    }
    if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string)$_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https') {
        return true;
    }
    return false;
}

/**
 * Start and configure PHP native session using consistent budgetin_session cookie.
 * If $explicitToken is passed, use it as session ID directly before session_start.
 */
function startBudgetinSession(?string $explicitToken = null): void
{
    // If a session is already active:
    if (session_status() === PHP_SESSION_ACTIVE) {
        if ($explicitToken !== null && session_id() !== $explicitToken) {
            // Restart session with the explicit token
            session_write_close();
        } else {
            return;
        }
    }

    if (!headers_sent()) {
        $savePath = session_save_path();
        if (empty($savePath) || !is_dir($savePath) || !is_writable($savePath)) {
            $fallback = sys_get_temp_dir();
            if (is_dir($fallback) && is_writable($fallback)) {
                session_save_path($fallback);
            }
        }

        ini_set('session.use_cookies', '1');
        ini_set('session.use_only_cookies', '1');

        session_name(SESSION_COOKIE_NAME);

        // If explicit token or client provided a session token (cookie or bearer), adopt it as PHP session ID
        $tokenToUse = $explicitToken;
        if (!$tokenToUse) {
            $tokenToUse = getRawSessionToken();
        }
        if ($tokenToUse && preg_match('/^[a-f0-9]{64}$/i', $tokenToUse)) {
            session_id($tokenToUse);
        }

        $options = [
            'lifetime' => SESSION_LIFETIME_SECONDS,
            'path' => '/',
            'domain' => '',
            'secure' => isHttpsRequest(),
            'httponly' => true,
            'samesite' => 'Lax'
        ];
        session_set_cookie_params($options);

        @session_start();
    }
}

/**
 * Set secure HttpOnly session cookie.
 */
function setSessionCookie(string $rawToken, int $expiresTimestamp): void
{
    $options = [
        'expires' => $expiresTimestamp,
        'path' => '/',
        'domain' => '',
        'secure' => isHttpsRequest(),
        'httponly' => true,
        'samesite' => 'Lax'
    ];
    setcookie(SESSION_COOKIE_NAME, $rawToken, $options);
}

/**
 * Clear session cookie.
 */
function clearSessionCookie(): void
{
    $options = [
        'expires' => time() - 3600,
        'path' => '/',
        'domain' => '',
        'secure' => isHttpsRequest(),
        'httponly' => true,
        'samesite' => 'Lax'
    ];
    setcookie(SESSION_COOKIE_NAME, '', $options);
    if (isset($_COOKIE[SESSION_COOKIE_NAME])) {
        unset($_COOKIE[SESSION_COOKIE_NAME]);
    }
}

/**
 * Extract raw session token from cookie or Authorization header.
 */
function getRawSessionToken(): ?string
{
    if (!empty($_COOKIE[SESSION_COOKIE_NAME]) && is_string($_COOKIE[SESSION_COOKIE_NAME])) {
        $val = trim($_COOKIE[SESSION_COOKIE_NAME]);
        if (preg_match('/^[a-f0-9]{64}$/i', $val)) {
            return $val;
        }
    }

    // Fallback support for programmatic API clients / test runner
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+([a-f0-9]{64})$/i', $authHeader, $matches)) {
        return $matches[1];
    }

    return null;
}

/**
 * Authenticate request and retrieve current user from PHP session or session table.
 */
function getSessionUser(PDO $pdo): ?array
{
    startBudgetinSession();

    // 1. Extract raw session token (cookie or bearer header)
    $rawToken = getRawSessionToken();
    if (!$rawToken && session_status() === PHP_SESSION_ACTIVE && session_id() !== '') {
        $sid = session_id();
        if (preg_match('/^[a-f0-9]{64}$/i', $sid)) {
            $rawToken = $sid;
        }
    }

    if ($rawToken) {
        $tokenHash = hashSessionToken($rawToken);

        $sql = "SELECT s.id AS session_id, s.user_id, s.expires_at,
                       u.id, u.name, u.email, u.created_at, u.updated_at
                FROM user_sessions s
                INNER JOIN users u ON u.id = s.user_id
                WHERE s.token_hash = :token_hash";

        $stmt = $pdo->prepare($sql);
        $stmt->execute(['token_hash' => $tokenHash]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($row) {
            $expiresAt = strtotime($row['expires_at']);
            if ($expiresAt === false || $expiresAt <= time()) {
                $delStmt = $pdo->prepare("DELETE FROM user_sessions WHERE token_hash = :token_hash");
                $delStmt->execute(['token_hash' => $tokenHash]);
                if (session_status() === PHP_SESSION_ACTIVE) {
                    $_SESSION = [];
                }
                return null;
            }

            // Sync into $_SESSION for current request scope
            $_SESSION['user_id'] = (string)$row['id'];
            $_SESSION['name'] = (string)$row['name'];
            $_SESSION['email'] = (string)$row['email'];
            $_SESSION['session_id'] = (string)$row['session_id'];
            $_SESSION['raw_token'] = $rawToken;

            return [
                'id' => (string)$row['id'],
                'name' => (string)$row['name'],
                'email' => (string)$row['email'],
                'session_id' => (string)$row['session_id'],
                'expires_at' => (string)$row['expires_at'],
                'raw_token' => $rawToken
            ];
        }
    }

    // 2. If token is invalid or missing in user_sessions, clear any stale native $_SESSION
    if (session_status() === PHP_SESSION_ACTIVE && !empty($_SESSION)) {
        $_SESSION = [];
    }
    return null;
}

/**
 * Generate CSRF token tied to active user and session.
 */
function generateCsrfToken(string $userId, string $rawToken): string
{
    return hash_hmac('sha256', $userId . ':' . $rawToken, CSRF_SECRET);
}

/**
 * Validate CSRF token.
 */
function validateCsrfToken(?string $token, string $userId, string $rawToken): bool
{
    if (empty($token) || !is_string($token)) {
        return false;
    }
    $expected = generateCsrfToken($userId, $rawToken);
    return hash_equals($expected, $token);
}

/**
 * Get client IP address safely.
 */
function getClientIp(): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '127.0.0.1';
}

/**
 * Rate limit tracker file path.
 */
function getRateLimitFilePath(string $ip, string $email): string
{
    $key = md5($ip . '_' . strtolower(trim($email)));
    return sys_get_temp_dir() . '/budgetin_auth_limit_' . $key . '.json';
}

/**
 * Check if login attempts are currently rate limited.
 */
function isLoginRateLimited(string $ip, string $email): bool
{
    $file = getRateLimitFilePath($ip, $email);
    if (!file_exists($file)) {
        return false;
    }

    $raw = @file_get_contents($file);
    if (!$raw) {
        return false;
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return false;
    }

    $attempts = (int)($data['attempts'] ?? 0);
    $lastAttempt = (int)($data['last_attempt'] ?? 0);

    if (time() - $lastAttempt > LOGIN_LOCKOUT_SECONDS) {
        @unlink($file);
        return false;
    }

    return $attempts >= MAX_LOGIN_ATTEMPTS;
}

/**
 * Record a login attempt for rate limiting.
 */
function recordLoginAttempt(string $ip, string $email, bool $success): void
{
    $file = getRateLimitFilePath($ip, $email);

    if ($success) {
        if (file_exists($file)) {
            @unlink($file);
        }
        return;
    }

    $attempts = 0;
    if (file_exists($file)) {
        $raw = @file_get_contents($file);
        if ($raw) {
            $data = json_decode($raw, true);
            if (is_array($data)) {
                $attempts = (int)($data['attempts'] ?? 0);
            }
        }
    }

    $attempts++;
    $record = [
        'attempts' => $attempts,
        'last_attempt' => time(),
        'ip' => $ip,
        'email' => strtolower(trim($email))
    ];

    @file_put_contents($file, json_encode($record), LOCK_EX);
}

/**
 * Parse JSON request body.
 */
function getJsonRequestBody(): array
{
    $content = file_get_contents('php://input');
    if (empty($content)) {
        return [];
    }

    $data = json_decode($content, true);
    return is_array($data) ? $data : [];
}
