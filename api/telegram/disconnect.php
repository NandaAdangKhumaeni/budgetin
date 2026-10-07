<?php
/**
 * BUDGETIN - Telegram Disconnect Endpoint
 * POST /api/telegram/disconnect.php
 *
 * Auth: Logged in user
 * Action: Putuskan koneksi Telegram milik user tersebut
 */

declare(strict_types=1);

require_once __DIR__ . '/../financial/financial_helper.php';
require_once __DIR__ . '/telegram_helper.php';

try {
    $pdo = getDbConnection();
    $user = getAuthenticatedFinancialUser($pdo);
    $userId = (string)$user['id'];
    $rawToken = (string)$user['raw_token'];

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        sendJsonResponse([
            'success' => false,
            'error' => 'METHOD_NOT_ALLOWED',
            'message' => 'Hanya method POST yang diperbolehkan.'
        ], 405);
    }

    requireCsrfForMutation($userId, $rawToken);

    // Optional notification to Telegram before disconnect
    TelegramService::sendToUser(
        $pdo,
        $userId,
        "⚠️ <b>Koneksi Budgetin Diputuskan</b>\n\nAkun Telegram Anda telah berhasil diputuskan dari akun Budgetin. Anda tidak akan lagi menerima notifikasi tagihan ke akun ini."
    );

    $ok = TelegramService::disconnectUser($pdo, $userId);

    sendJsonResponse([
        'success' => true,
        'message' => 'Koneksi Telegram berhasil diputuskan.',
        'data' => [
            'user_id' => $userId,
            'is_connected' => false,
            'status' => 'disconnected'
        ]
    ]);

} catch (Throwable $e) {
    sendJsonResponse([
        'success' => false,
        'error' => 'SERVER_ERROR',
        'message' => $e->getMessage()
    ], 500);
}
