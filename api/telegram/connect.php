<?php
/**
 * BUDGETIN - Telegram Connect Endpoint
 * POST /api/telegram/connect.php
 *
 * Auth: Logged in user (session or bearer)
 * Input:
 *   - token: pairing token from Telegram bot (/start <token>)
 *     OR
 *   - chat_id + telegram_username (if directly pairing or programmatic)
 *
 * Security:
 *   - Strictly rejects if chat_id already bound to another active user
 *   - Never trusts arbitrary user_id from client; always binds to authenticated user
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

    $input = getJsonRequestBody();
    if (empty($input)) {
        $input = $_POST;
    }

    $pairingToken = isset($input['token']) ? trim((string)$input['token']) : '';
    $chatId = isset($input['chat_id']) ? trim((string)$input['chat_id']) : '';
    $telegramUsername = isset($input['telegram_username']) ? trim((string)$input['telegram_username']) : null;

    if (empty($pairingToken) && empty($chatId)) {
        sendJsonResponse([
            'success' => false,
            'error' => 'INVALID_INPUT',
            'message' => 'Parameter token pairing atau chat_id wajib disertakan.'
        ], 400);
    }

    // Path A: Pairing via token (e.g. user entered pairing token or completed web flow)
    if (!empty($pairingToken)) {
        try {
            $conn = TelegramService::redeemPairingToken($pdo, $pairingToken, $userId, !empty($chatId) ? $chatId : null, $telegramUsername);
            
            // Send welcome confirmation to Telegram
            TelegramService::sendToUser(
                $pdo,
                $userId,
                "✅ <b>Akun Budgetin Berhasil Terhubung!</b>\n\nHalo <b>" . htmlspecialchars($user['name'], ENT_QUOTES, 'UTF-8') . "</b>,\nAkun Telegram Anda sekarang sudah terhubung dengan aman ke akun Budgetin.\nPengingat tagihan H-1 & Hari H akan otomatis dikirim ke sini."
            );

            sendJsonResponse([
                'success' => true,
                'message' => 'Koneksi Telegram berhasil disimpan.',
                'data' => [
                    'user_id' => $userId,
                    'chat_id' => $conn['chat_id'],
                    'telegram_username' => $conn['telegram_username'],
                    'status' => $conn['status'],
                    'connected_at' => $conn['connected_at'] ?? date('Y-m-d H:i:s'),
                ]
            ]);
        } catch (RuntimeException $e) {
            sendJsonResponse([
                'success' => false,
                'error' => 'PAIRING_FAILED',
                'message' => $e->getMessage()
            ], 400);
        }
    }

    // Path B: Direct chat_id registration (e.g. user manually provided their numeric Telegram Chat ID)
    try {
        $conn = TelegramService::connectUser($pdo, $userId, $chatId, $telegramUsername);

        // Send welcome test
        TelegramService::sendToUser(
            $pdo,
            $userId,
            "✅ <b>Akun Budgetin Berhasil Terhubung!</b>\n\nHalo <b>" . htmlspecialchars($user['name'], ENT_QUOTES, 'UTF-8') . "</b>,\nKoneksi Telegram Anda telah diverifikasi dan aktif."
        );

        sendJsonResponse([
            'success' => true,
            'message' => 'Koneksi Telegram berhasil disimpan.',
            'data' => [
                'user_id' => $userId,
                'chat_id' => $conn['chat_id'],
                'telegram_username' => $conn['telegram_username'],
                'status' => $conn['status'],
                'connected_at' => $conn['connected_at'] ?? date('Y-m-d H:i:s'),
            ]
        ]);
    } catch (RuntimeException $e) {
        // Chat ID already owned by another user or invalid
        sendJsonResponse([
            'success' => false,
            'error' => 'CHAT_ID_CONFLICT',
            'message' => $e->getMessage()
        ], 409);
    }

} catch (Throwable $e) {
    sendJsonResponse([
        'success' => false,
        'error' => 'SERVER_ERROR',
        'message' => $e->getMessage()
    ], 500);
}
