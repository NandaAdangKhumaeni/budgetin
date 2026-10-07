<?php
/**
 * BUDGETIN - Telegram Connection Status Endpoint
 * GET /api/telegram/status.php
 *
 * Auth: Logged in user
 * Return: Status koneksi Telegram milik user tersebut & pairing token jika belum terhubung
 */

declare(strict_types=1);

require_once __DIR__ . '/../financial/financial_helper.php';
require_once __DIR__ . '/telegram_helper.php';

try {
    $pdo = getDbConnection();
    $user = getAuthenticatedFinancialUser($pdo);
    $userId = (string)$user['id'];

    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        sendJsonResponse([
            'success' => false,
            'error' => 'METHOD_NOT_ALLOWED',
            'message' => 'Hanya method GET yang diperbolehkan.'
        ], 405);
    }

    $conn = TelegramService::getUserConnection($pdo, $userId);
    $cfg = TelegramService::getConfig();

    // If not connected, generate/get a valid pairing token so user can connect easily
    $pairingToken = null;
    if (!$conn) {
        $pairingToken = TelegramService::createPairingToken($pdo, $userId);
    }

    sendJsonResponse([
        'success' => true,
        'data' => [
            'user_id' => $userId,
            'is_configured' => TelegramService::isConfigured(),
            'is_connected' => ($conn !== null && $conn['status'] === 'connected'),
            'connection' => $conn ? [
                'chat_id' => (string)$conn['chat_id'],
                'telegram_username' => $conn['telegram_username'],
                'status' => $conn['status'],
                'connected_at' => $conn['connected_at'],
                'updated_at' => $conn['updated_at'],
            ] : null,
            'pairing_token' => $pairingToken,
            'bot_username' => 'BudgetinBot', // Bot handler display name
        ]
    ]);

} catch (Throwable $e) {
    sendJsonResponse([
        'success' => false,
        'error' => 'SERVER_ERROR',
        'message' => $e->getMessage()
    ], 500);
}
