<?php
/**
 * BUDGETIN - Authentication Test Support Endpoint
 * Exclusively for test_auth.html test suite verification
 */

declare(strict_types=1);

require_once __DIR__ . '/auth_helper.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';

try {
    $pdo = getDbConnection();

    switch ($action) {
        case 'test_db':
            sendJsonResponse([
                'success' => true,
                'alive' => true,
                'database' => $pdo->query("SELECT DATABASE()")->fetchColumn()
            ]);
            break;

        case 'clean_test_data':
            $pdo->exec("DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test_auth_%' OR email LIKE 'audit_%')");
            $pdo->exec("DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test_auth_%' OR email LIKE 'audit_%')");
            $pdo->exec("DELETE FROM users WHERE email LIKE 'test_auth_%' OR email LIKE 'audit_%'");
            // Clear rate limit files
            $ip = getClientIp();
            foreach (glob(sys_get_temp_dir() . '/budgetin_auth_limit_*.json') as $f) {
                @unlink($f);
            }
            sendJsonResponse(['success' => true, 'cleaned' => true]);
            break;

        case 'inspect_reset_token':
            $email = strtolower(trim((string)($_GET['email'] ?? '')));
            $stmt = $pdo->prepare("SELECT r.id, r.user_id, r.token_hash, r.expires_at, r.used_at, r.created_at
                                   FROM password_reset_tokens r
                                   INNER JOIN users u ON u.id = r.user_id
                                   WHERE u.email = :email
                                   ORDER BY r.created_at DESC LIMIT 1");
            $stmt->execute(['email' => $email]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                sendJsonResponse(['success' => false, 'hasToken' => false], 200);
            }
            sendJsonResponse([
                'success' => true,
                'hasToken' => true,
                'tokenId' => (string)$row['id'],
                'isHashed' => strlen((string)$row['token_hash']) === 64,
                'isUsed' => !empty($row['used_at']),
                'isNotExpired' => strtotime((string)$row['expires_at']) > time(),
                'expiresAt' => (string)$row['expires_at'],
                'usedAt' => $row['used_at'] ? (string)$row['used_at'] : null
            ]);
            break;

        case 'expire_reset_token':
            $email = strtolower(trim((string)($_POST['email'] ?? $_GET['email'] ?? '')));
            $stmt = $pdo->prepare("UPDATE password_reset_tokens SET expires_at = '2000-01-01 00:00:00'
                                   WHERE user_id IN (SELECT id FROM users WHERE email = :email)");
            $stmt->execute(['email' => $email]);
            sendJsonResponse(['success' => true, 'expired' => true]);
            break;

        case 'check_password_hash':
            $email = strtolower(trim((string)($_GET['email'] ?? '')));
            $rawTestPassword = (string)($_GET['password'] ?? '');
            $stmt = $pdo->prepare("SELECT id, email, password_hash, algorithm FROM users WHERE email = :email LIMIT 1");
            $stmt->execute(['email' => $email]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user) {
                sendJsonResponse(['success' => false, 'error' => 'NOT_FOUND'], 404);
            }

            $hash = (string)$user['password_hash'];
            $isHashed = !empty($hash) && $hash !== $rawTestPassword && (str_starts_with($hash, '$argon2id$') || str_starts_with($hash, '$2y$'));
            $verifyPasses = password_verify($rawTestPassword, $hash);

            sendJsonResponse([
                'success' => true,
                'isHashed' => $isHashed,
                'algorithm' => $user['algorithm'],
                'hashLength' => strlen($hash),
                'verifyPasses' => $verifyPasses
            ]);
            break;

        case 'check_session_record':
            $email = strtolower(trim((string)($_GET['email'] ?? '')));
            $stmt = $pdo->prepare("SELECT s.id, s.user_id, s.token_hash, s.expires_at, s.created_at
                                   FROM user_sessions s
                                   INNER JOIN users u ON u.id = s.user_id
                                   WHERE u.email = :email
                                   ORDER BY s.created_at DESC LIMIT 1");
            $stmt->execute(['email' => $email]);
            $sess = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$sess) {
                sendJsonResponse(['success' => false, 'hasSession' => false], 200);
            }

            $isSha256 = strlen((string)$sess['token_hash']) === 64;
            $isNotExpired = strtotime((string)$sess['expires_at']) > time();

            sendJsonResponse([
                'success' => true,
                'hasSession' => true,
                'sessionId' => (string)$sess['id'],
                'isTokenHashed' => $isSha256,
                'isNotExpired' => $isNotExpired,
                'expiresAt' => (string)$sess['expires_at']
            ]);
            break;

        case 'expire_session':
            $email = strtolower(trim((string)($_POST['email'] ?? $_GET['email'] ?? '')));
            $stmt = $pdo->prepare("UPDATE user_sessions SET expires_at = '2000-01-01 00:00:00'
                                   WHERE user_id IN (SELECT id FROM users WHERE email = :email)");
            $stmt->execute(['email' => $email]);
            sendJsonResponse(['success' => true, 'expired' => true]);
            break;

        case 'verify_csrf_mutation':
            $user = getSessionUser($pdo);
            if (!$user) {
                sendJsonResponse(['success' => false, 'error' => 'UNAUTHENTICATED'], 401);
            }

            $csrfHeader = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_POST['csrf_token'] ?? null;
            $isValidCsrf = validateCsrfToken($csrfHeader, $user['id'], (string)$user['raw_token']);

            if (!$isValidCsrf) {
                sendJsonResponse([
                    'success' => false,
                    'error' => 'CSRF_VALIDATION_FAILED',
                    'message' => 'Token CSRF tidak valid.'
                ], 403);
            }

            sendJsonResponse(['success' => true, 'csrfPassed' => true]);
            break;

        default:
            sendJsonResponse(['success' => false, 'error' => 'UNKNOWN_ACTION'], 400);
    }

} catch (Throwable $e) {
    sendJsonResponse([
        'success' => false,
        'error' => 'SERVER_ERROR',
        'message' => $e->getMessage()
    ], 500);
}
