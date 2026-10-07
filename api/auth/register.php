<?php
/**
 * BUDGETIN - User Registration Endpoint
 * POST /api/auth/register.php
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

$name = trim((string)($input['name'] ?? ''));
$email = strtolower(trim((string)($input['email'] ?? '')));
$password = (string)($input['password'] ?? '');

// 1. Validation
if ($name === '') {
    sendJsonResponse([
        'success' => false,
        'error' => 'VALIDATION_ERROR',
        'message' => 'Nama lengkap wajib diisi.'
    ], 400);
}

if (mb_strlen($name) > 100) {
    sendJsonResponse([
        'success' => false,
        'error' => 'VALIDATION_ERROR',
        'message' => 'Nama maksimal 100 karakter.'
    ], 400);
}

if ($email === '') {
    sendJsonResponse([
        'success' => false,
        'error' => 'VALIDATION_ERROR',
        'message' => 'Email wajib diisi.'
    ], 400);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 150) {
    sendJsonResponse([
        'success' => false,
        'error' => 'VALIDATION_ERROR',
        'message' => 'Format email tidak valid.'
    ], 400);
}

if (mb_strlen($password) < 8) {
    sendJsonResponse([
        'success' => false,
        'error' => 'VALIDATION_ERROR',
        'message' => 'Password minimal harus 8 karakter.'
    ], 400);
}

try {
    $pdo = getDbConnection();

    // 2. Check duplicate email
    $checkStmt = $pdo->prepare("SELECT id FROM users WHERE email = :email LIMIT 1");
    $checkStmt->execute(['email' => $email]);
    if ($checkStmt->fetch()) {
        sendJsonResponse([
            'success' => false,
            'error' => 'DUPLICATE_EMAIL',
            'message' => 'Email sudah terdaftar. Silakan gunakan email lain atau masuk.'
        ], 409);
    }

    // 3. Password Hashing (Argon2id with Bcrypt fallback)
    $algorithm = 'argon2id';
    $hashAlgo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
    if ($hashAlgo === PASSWORD_BCRYPT) {
        $algorithm = 'bcrypt';
    }

    $passwordHash = password_hash($password, $hashAlgo);
    if ($passwordHash === false) {
        throw new RuntimeException('Gagal melakukan enkripsi password.');
    }

    // 4. Generate secure ID & Insert
    $userId = generateSecureId('usr_');
    $now = date('Y-m-d H:i:s');

    $insertSql = "INSERT INTO users (id, name, email, password_hash, algorithm, created_at, updated_at)
                  VALUES (:id, :name, :email, :password_hash, :algorithm, :created_at, :updated_at)";
    
    $stmt = $pdo->prepare($insertSql);
    $stmt->execute([
        'id' => $userId,
        'name' => $name,
        'email' => $email,
        'password_hash' => $passwordHash,
        'algorithm' => $algorithm,
        'created_at' => $now,
        'updated_at' => $now
    ]);

    // 5. Sanitized success response
    sendJsonResponse([
        'success' => true,
        'user' => [
            'id' => $userId,
            'name' => $name,
            'email' => $email
        ]
    ], 201);

} catch (Throwable $e) {
    error_log('[BUDGETIN REGISTER ERROR] ' . $e->getMessage());
    sendJsonResponse([
        'success' => false,
        'error' => 'SERVER_ERROR',
        'message' => 'Terjadi kesalahan pada server saat memproses pendaftaran.'
    ], 500);
}
