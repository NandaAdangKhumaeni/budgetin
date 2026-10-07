<?php
/**
 * BUDGETIN - Telegram Test Connection Endpoint
 * POST api/telegram/test.php
 * Sends:
 * 🔔 BUDGETIN
 * Telegram berhasil terhubung! ✅
 */

declare(strict_types=1);

require_once __DIR__ . '/../financial/financial_helper.php';
require_once __DIR__ . '/telegram_helper.php';

try {
    $pdo = getDbConnection();
    $user = getAuthenticatedFinancialUser($pdo);
    $userId = (string)$user['id'];
    $rawToken = (string)$user['raw_token'];

    // Require CSRF token for security
    requireCsrfForMutation($userId, $rawToken);

    // Check configuration
    $cfg = TelegramService::getConfig();
    if (empty($cfg['bot_token'])) {
        sendJsonResponse([
            'success' => false,
            'error' => 'NOT_CONFIGURED',
            'message' => 'Telegram Bot Token belum diatur di api/config.php.',
        ], 400);
    }

    // Check user connection
    $conn = TelegramService::getUserConnection($pdo, $userId);
    $targetChatId = $conn ? (string)$conn['chat_id'] : ($cfg['chat_id'] ?? null);

    if (empty($targetChatId)) {
        sendJsonResponse([
            'success' => false,
            'error' => 'NO_CHAT_CONNECTED',
            'message' => 'Akun Telegram Anda belum terhubung. Silakan hubungkan Telegram terlebih dahulu.',
        ], 400);
    }

    $userName = htmlspecialchars($user['name'] ?? 'Pengguna Budgetin', ENT_QUOTES, 'UTF-8');
    $testMessage = "🔔 <b>BUDGETIN</b>\nHalo <b>{$userName}</b>,\nTelegram berhasil terhubung! ✅\n\n<i>Waktu: " . date('Y-m-d H:i:s') . "</i>";
    $result = TelegramService::sendMessage($testMessage, $targetChatId);

    // Log the notification
    TelegramService::logNotification(
        $pdo,
        $userId,
        'test',
        'test_' . time(),
        $testMessage,
        $result['success'],
        $result['error']
    );

    if ($result['success']) {
        sendJsonResponse([
            'success' => true,
            'message' => 'Pesan Telegram berhasil dikirim! Silakan periksa chat bot Anda.',
            'message_id' => $result['message_id'],
            'telegram_status' => $result['http_code'] ?? 200,
        ]);
    } else {
        // Return clear error and telegram http status without leaking bot token
        sendJsonResponse([
            'success' => false,
            'error' => 'TELEGRAM_SEND_FAILED',
            'message' => 'Gagal mengirim pesan ke Telegram: ' . $result['error'],
            'telegram_status' => $result['http_code'] ?? 0,
        ], 502);
    }

} catch (Throwable $e) {
    sendJsonResponse([
        'success' => false,
        'error' => 'INTERNAL_ERROR',
        'message' => 'Terjadi kesalahan sistem: ' . $e->getMessage()
    ], 500);
}
