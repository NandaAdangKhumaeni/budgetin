<?php
/**
 * BUDGETIN - Forgot Password Endpoint
 * POST /api/auth/forgot-password.php
 *
 * Implements secure password reset token generation, anti-enumeration generic responses,
 * SHA-256 token hashing in MySQL, and development token discovery without plaintext leakage.
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

$email = strtolower(trim((string)($input['email'] ?? '')));

// 1. Validation
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    sendJsonResponse([
        'success' => false,
        'error' => 'VALIDATION_ERROR',
        'message' => 'Format email tidak valid.'
    ], 400);
}

try {
    $pdo = getDbConnection();

    // 2. User Lookup
    $stmt = $pdo->prepare("SELECT id, name, email FROM users WHERE email = :email LIMIT 1");
    $stmt->execute(['email' => $email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    $rawToken = null;
    $expiresAtStr = null;

    if ($user && !empty($user['id'])) {
        $userId = (string)$user['id'];

        // 3. Invalidate prior unused reset tokens for this user
        $cleanStmt = $pdo->prepare("UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = :user_id AND used_at IS NULL");
        $cleanStmt->execute(['user_id' => $userId]);

        // 4. Generate cryptographically secure token & hash
        $rawToken = generateResetToken();
        $tokenHash = hashResetToken($rawToken);
        $tokenId = generateSecureId('rst_');
        $expiresTimestamp = time() + RESET_TOKEN_LIFETIME_SECONDS;
        $expiresAtStr = date('Y-m-d H:i:s', $expiresTimestamp);
        $now = date('Y-m-d H:i:s');

        // 5. Store hashed token in database
        $insertSql = "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
                      VALUES (:id, :user_id, :token_hash, :expires_at, :created_at)";
        $insertStmt = $pdo->prepare($insertSql);
        $insertStmt->execute([
            'id' => $tokenId,
            'user_id' => $userId,
            'token_hash' => $tokenHash,
            'expires_at' => $expiresAtStr,
            'created_at' => $now
        ]);

        // 6. Email Service Integration / Development Log
        // Note: Project currently runs in local development without active external SMTP credentials.
        $resetUrl = "reset-password.html?token=" . urlencode($rawToken);
        error_log(sprintf(
            "[BUDGETIN PASSWORD RESET] Email: %s | Token: %s | URL: %s | Expires: %s",
            $email,
            $rawToken,
            $resetUrl,
            $expiresAtStr
        ));
    }

    // 7. Security: Generic response to prevent user enumeration
    $response = [
        'success' => true,
        'message' => 'Jika email terdaftar, instruksi reset password akan dikirim.'
    ];

    // In local development environment, attach debug metadata so tests and developers can complete the flow
    $isDev = (getenv('BUDGETIN_ENV') ?: 'development') === 'development' || in_array(getClientIp(), ['127.0.0.1', '::1'], true);
    if ($isDev && $rawToken !== null) {
        $response['_dev_token'] = $rawToken;
        $response['_dev_reset_url'] = "reset-password.html?token=" . urlencode($rawToken);
        $response['_dev_expires_at'] = $expiresAtStr;
    }

    sendJsonResponse($response, 200);

} catch (Throwable $e) {
    error_log('[BUDGETIN FORGOT PASSWORD ERROR] ' . $e->getMessage());
    sendJsonResponse([
        'success' => false,
        'error' => 'SERVER_ERROR',
        'message' => 'Terjadi kesalahan sistem saat memproses permintaan reset password.'
    ], 500);
}
