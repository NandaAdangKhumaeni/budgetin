<?php
/**
 * BUDGETIN - Reset Password Endpoint
 * POST /api/auth/reset-password.php
 *
 * Validates reset token, checks expiration and one-time-use, updates password_hash,
 * marks token as used, and invalidates all active user sessions.
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

$input = getJsonRequestBody();
if (empty($input)) {
    $input = $_POST;
}

$token = trim((string)($input['token'] ?? ''));
$password = (string)($input['password'] ?? '');
$passwordConfirmation = (string)($input['password_confirmation'] ?? $input['confirmPassword'] ?? '');

// 1. Validation
if ($token === '') {
    sendJsonResponse([
        'success' => false,
        'error' => 'VALIDATION_ERROR',
        'message' => 'Token reset password tidak boleh kosong.'
    ], 400);
}

if ($password === '') {
    sendJsonResponse([
        'success' => false,
        'error' => 'VALIDATION_ERROR',
        'message' => 'Password baru wajib diisi.'
    ], 400);
}

if (mb_strlen($password) < 8) {
    sendJsonResponse([
        'success' => false,
        'error' => 'VALIDATION_ERROR',
        'message' => 'Password minimal harus 8 karakter.'
    ], 400);
}

if ($password !== $passwordConfirmation) {
    sendJsonResponse([
        'success' => false,
        'error' => 'VALIDATION_ERROR',
        'message' => 'Konfirmasi password baru tidak cocok.'
    ], 400);
}

try {
    $pdo = getDbConnection();

    // 2. Hash token for lookup
    $tokenHash = hashResetToken($token);

    // 3. Lookup token in password_reset_tokens
    $stmt = $pdo->prepare("SELECT id, user_id, token_hash, expires_at, used_at FROM password_reset_tokens WHERE token_hash = :token_hash LIMIT 1");
    $stmt->execute(['token_hash' => $tokenHash]);
    $resetRow = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$resetRow) {
        sendJsonResponse([
            'success' => false,
            'error' => 'INVALID_TOKEN',
            'message' => 'Token reset password tidak valid atau tidak ditemukan.'
        ], 400);
    }

    // 4. Check if token already used
    if (!empty($resetRow['used_at'])) {
        sendJsonResponse([
            'success' => false,
            'error' => 'TOKEN_USED',
            'message' => 'Token reset password ini sudah pernah digunakan. Silakan ajukan permohonan baru.'
        ], 400);
    }

    // 5. Check if token expired
    $expiresAt = strtotime((string)$resetRow['expires_at']);
    if ($expiresAt === false || $expiresAt <= time()) {
        sendJsonResponse([
            'success' => false,
            'error' => 'TOKEN_EXPIRED',
            'message' => 'Token reset password telah kadaluarsa. Silakan ajukan permohonan baru.'
        ], 400);
    }

    $userId = (string)$resetRow['user_id'];

    // 6. Verify user exists
    $userStmt = $pdo->prepare("SELECT id, email, name FROM users WHERE id = :id LIMIT 1");
    $userStmt->execute(['id' => $userId]);
    $user = $userStmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        sendJsonResponse([
            'success' => false,
            'error' => 'USER_NOT_FOUND',
            'message' => 'Pengguna tidak ditemukan.'
        ], 404);
    }

    // 7. Hash new password securely (Argon2id with Bcrypt fallback)
    $algorithm = 'argon2id';
    $hashAlgo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
    if ($hashAlgo === PASSWORD_BCRYPT) {
        $algorithm = 'bcrypt';
    }

    $newPasswordHash = password_hash($password, $hashAlgo);
    if ($newPasswordHash === false) {
        throw new RuntimeException('Gagal melakukan hashing password.');
    }

    // 8. Execute update in transaction: update password, mark token used, invalidate sessions
    $pdo->beginTransaction();

    try {
        // Update user's password
        $updateUser = $pdo->prepare("UPDATE users SET password_hash = :hash, algorithm = :algo, updated_at = NOW() WHERE id = :id");
        $updateUser->execute([
            'hash' => $newPasswordHash,
            'algo' => $algorithm,
            'id' => $userId
        ]);

        // Mark reset token as used
        $markToken = $pdo->prepare("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = :id");
        $markToken->execute(['id' => (string)$resetRow['id']]);

        // Invalidate ALL previous server sessions for this user (Security Requirement 7)
        $cleanSessions = $pdo->prepare("DELETE FROM user_sessions WHERE user_id = :user_id");
        $cleanSessions->execute(['user_id' => $userId]);

        $pdo->commit();
    } catch (Throwable $txErr) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $txErr;
    }

    // 9. Destroy current PHP session if active & clear cookie
    if (session_status() === PHP_SESSION_ACTIVE) {
        $_SESSION = [];
        @session_destroy();
    }
    clearSessionCookie();

    // 10. Success response
    sendJsonResponse([
        'success' => true,
        'message' => 'Password berhasil diubah. Silakan login kembali dengan password baru Anda.'
    ], 200);

} catch (Throwable $e) {
    error_log('[BUDGETIN RESET PASSWORD ERROR] ' . $e->getMessage());
    sendJsonResponse([
        'success' => false,
        'error' => 'SERVER_ERROR',
        'message' => 'Terjadi kesalahan sistem saat memproses reset password.'
    ], 500);
}
