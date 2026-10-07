<?php
/**
 * BUDGETIN - Telegram Bot Service & Notification Helper
 * Handles Telegram API requests, logging, and duplicate prevention.
 */

declare(strict_types=1);

require_once __DIR__ . '/../db.php';

class TelegramService
{
    private static ?array $config = null;

    /**
     * Retrieve telegram configuration securely.
     */
    public static function getConfig(): array
    {
        if (self::$config !== null) {
            return self::$config;
        }

        $configFile = __DIR__ . '/../config.php';
        $fullConfig = file_exists($configFile) ? (require $configFile) : [];
        $tgConfig = $fullConfig['telegram'] ?? [];

        $rawToken = trim((string)($tgConfig['bot_token'] ?? getenv('TELEGRAM_BOT_TOKEN') ?: ''));
        $rawChatId = trim((string)($tgConfig['chat_id'] ?? getenv('TELEGRAM_CHAT_ID') ?: ''));

        // Smart cleanup in case user pastes full Telegram URL e.g. https://api.telegram.org/bot<TOKEN>/getUpdates
        $cleanToken = self::cleanBotToken($rawToken);
        $cleanChatId = self::cleanChatId($rawChatId);

        self::$config = [
            'bot_token' => $cleanToken,
            'chat_id' => $cleanChatId,
            'enabled' => (bool)($tgConfig['enabled'] ?? true),
            'raw_token_len' => strlen($rawToken),
            'raw_chat_id_len' => strlen($rawChatId),
            'is_valid' => (!empty($cleanToken) && !empty($cleanChatId)),
        ];

        return self::$config;
    }

    /**
     * Extract pure bot token if pasted with URL or prefix.
     */
    public static function cleanBotToken(string $input): string
    {
        $input = trim($input);
        if ($input === '') return '';

        // If user pasted something like getenv(...) or full URL
        if (preg_match('/([0-9]{8,12}:[a-zA-Z0-9_-]{30,40})/', $input, $m)) {
            return $m[1];
        }

        return $input;
    }

    /**
     * Extract pure numeric or string chat_id.
     */
    public static function cleanChatId(string $input): string
    {
        $input = trim($input);
        if ($input === '') return '';

        // Strip non-digit characters if negative or positive telegram chat ID
        if (preg_match('/(-?[0-9]{5,20})/', $input, $m)) {
            return $m[1];
        }

        return $input;
    }

    /**
     * Mask token so it is never displayed or leaked in logs or error messages.
     */
    public static function maskToken(string $token): string
    {
        if (strlen($token) <= 8) {
            return '***';
        }
        return substr($token, 0, 4) . '***' . substr($token, -4);
    }

    /**
     * Check whether telegram bot token is configured in system.
     */
    public static function isConfigured(): bool
    {
        $cfg = self::getConfig();
        return !empty($cfg['bot_token']);
    }

    /**
     * Get active connection record for a specific user_id.
     * Returns null if user has no connected chat.
     */
    public static function getUserConnection(PDO $pdo, string $userId): ?array
    {
        $stmt = $pdo->prepare("SELECT * FROM telegram_connections WHERE user_id = :user_id AND status = 'connected' LIMIT 1");
        $stmt->execute(['user_id' => $userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /**
     * Find active connection record by chat_id.
     */
    public static function getConnectionByChatId(PDO $pdo, string $chatId): ?array
    {
        $cleanChatId = self::cleanChatId($chatId);
        $stmt = $pdo->prepare("SELECT * FROM telegram_connections WHERE chat_id = :chat_id AND status = 'connected' LIMIT 1");
        $stmt->execute(['chat_id' => $cleanChatId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /**
     * Connect or update a user's Telegram chat connection.
     * Strictly rejects if chat_id is already bound to another active user.
     *
     * @throws RuntimeException if chat_id belongs to another user
     */
    public static function connectUser(
        PDO $pdo,
        string $userId,
        string $chatId,
        ?string $telegramUsername = null
    ): array {
        $cleanChat = self::cleanChatId($chatId);
        if (empty($cleanChat)) {
            throw new InvalidArgumentException("Chat ID tidak valid.");
        }

        // Check if chat_id is already owned by another user
        $checkStmt = $pdo->prepare("SELECT user_id, status FROM telegram_connections WHERE chat_id = :chat_id LIMIT 1");
        $checkStmt->execute(['chat_id' => $cleanChat]);
        $existingChat = $checkStmt->fetch(PDO::FETCH_ASSOC);

        if ($existingChat && $existingChat['user_id'] !== $userId && $existingChat['status'] === 'connected') {
            throw new RuntimeException("Chat ID ini sudah terhubung dengan akun Budgetin lain.");
        }

        // Upsert connection for this user_id
        $sql = "INSERT INTO telegram_connections (user_id, chat_id, telegram_username, status, connected_at)
                VALUES (:user_id, :chat_id, :username, 'connected', NOW())
                ON DUPLICATE KEY UPDATE
                    chat_id = VALUES(chat_id),
                    telegram_username = VALUES(telegram_username),
                    status = 'connected',
                    connected_at = NOW(),
                    updated_at = NOW()";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            'user_id' => $userId,
            'chat_id' => $cleanChat,
            'username' => $telegramUsername !== null ? trim($telegramUsername) : null
        ]);

        return self::getUserConnection($pdo, $userId) ?? [
            'user_id' => $userId,
            'chat_id' => $cleanChat,
            'telegram_username' => $telegramUsername,
            'status' => 'connected'
        ];
    }

    /**
     * Disconnect a user's Telegram connection.
     */
    public static function disconnectUser(PDO $pdo, string $userId): bool
    {
        $stmt = $pdo->prepare("UPDATE telegram_connections 
                               SET status = 'disconnected', updated_at = NOW() 
                               WHERE user_id = :user_id");
        $stmt->execute(['user_id' => $userId]);
        return $stmt->rowCount() > 0;
    }

    /**
     * Create or retrieve an active pairing token for a user.
     * Tokens expire in 15 minutes.
     */
    public static function createPairingToken(PDO $pdo, string $userId): string
    {
        // Check for an existing valid pending token for this user
        $stmt = $pdo->prepare("SELECT token FROM telegram_pairing_tokens 
                               WHERE user_id = :user_id 
                                 AND status = 'pending' 
                                 AND expires_at > NOW() 
                               ORDER BY id DESC LIMIT 1");
        $stmt->execute(['user_id' => $userId]);
        $existing = $stmt->fetchColumn();
        if ($existing) {
            return (string)$existing;
        }

        // Generate a new clean 8-character uppercase alphanumeric code or hex code
        // e.g. BGT-XXXXXX or 6-digit random token
        $token = 'BGT' . strtoupper(bin2hex(random_bytes(3))); // 9 chars e.g. BGT4A9F21
        $expiresAt = date('Y-m-d H:i:s', time() + (15 * 60));

        $ins = $pdo->prepare("INSERT INTO telegram_pairing_tokens (user_id, token, status, expires_at) 
                              VALUES (:user_id, :token, 'pending', :expires_at)");
        $ins->execute([
            'user_id' => $userId,
            'token' => $token,
            'expires_at' => $expiresAt
        ]);

        return $token;
    }

    /**
     * Verify a pairing token and pair user_id with chat_id.
     * Can be invoked either via webhook (/start <token>) or via POST /api/telegram/connect.
     */
    public static function redeemPairingToken(
        PDO $pdo,
        string $token,
        ?string $currentUserId = null,
        ?string $chatId = null,
        ?string $telegramUsername = null
    ): array {
        $cleanToken = strtoupper(trim($token));
        if (empty($cleanToken)) {
            throw new InvalidArgumentException("Token pairing tidak boleh kosong.");
        }

        $stmt = $pdo->prepare("SELECT * FROM telegram_pairing_tokens WHERE token = :token LIMIT 1");
        $stmt->execute(['token' => $cleanToken]);
        $pairing = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$pairing) {
            throw new RuntimeException("Token pairing tidak ditemukan.");
        }

        if ($pairing['status'] === 'used') {
            throw new RuntimeException("Token pairing sudah pernah digunakan.");
        }

        if (strtotime($pairing['expires_at']) < time() || $pairing['status'] === 'expired') {
            throw new RuntimeException("Token pairing telah kadaluarsa. Silakan buat token baru.");
        }

        $targetUserId = (string)$pairing['user_id'];

        // If authenticated user is calling connect, ensure they match the user who generated it
        if ($currentUserId !== null && $currentUserId !== $targetUserId) {
            throw new RuntimeException("Token pairing ini milik akun lain.");
        }

        // Determine chat_id: either passed from webhook or previously recorded on token
        $finalChatId = !empty($chatId) ? $chatId : ($pairing['chat_id'] ?? null);
        $finalUsername = !empty($telegramUsername) ? $telegramUsername : ($pairing['telegram_username'] ?? null);

        if (empty($finalChatId)) {
            throw new InvalidArgumentException("Chat ID tidak ditemukan. Kirim /start {$cleanToken} ke bot Telegram terlebih dahulu.");
        }

        // Connect user
        $conn = self::connectUser($pdo, $targetUserId, (string)$finalChatId, $finalUsername);

        // Mark token as used
        $upd = $pdo->prepare("UPDATE telegram_pairing_tokens 
                              SET status = 'used', chat_id = :chat_id, telegram_username = :username, updated_at = NOW() 
                              WHERE id = :id");
        $upd->execute([
            'chat_id' => $finalChatId,
            'username' => $finalUsername,
            'id' => $pairing['id']
        ]);

        return $conn;
    }

    /**
     * Stage a chat_id with a pairing token (invoked when user sends /start <token> to Telegram bot).
     * Automatically completes connection!
     */
    public static function processBotStartCommand(
        PDO $pdo,
        string $token,
        string $chatId,
        ?string $telegramUsername = null
    ): array {
        $cleanToken = strtoupper(trim($token));
        $cleanChat = self::cleanChatId($chatId);

        // Redeem directly!
        $conn = self::redeemPairingToken($pdo, $cleanToken, null, $cleanChat, $telegramUsername);
        return $conn;
    }

    /**
     * Send a notification message directly to a specific user using their own telegram_connections chat_id.
     * Enforces user isolation: will not send if the user has no connected chat.
     */
    public static function sendToUser(PDO $pdo, string $userId, string $message, string $parseMode = 'HTML'): array
    {
        $conn = self::getUserConnection($pdo, $userId);
        if (!$conn || empty($conn['chat_id'])) {
            return [
                'success' => false,
                'message_id' => null,
                'error' => "User {$userId} belum menghubungkan Telegram bot."
            ];
        }

        return self::sendMessage($message, (string)$conn['chat_id'], $parseMode);
    }

    /**
     * Send a message to Telegram using Bot API.
     * 
     * @param string $message
     * @param string|null $customChatId
     * @param string $parseMode
     * @return array [ 'success' => bool, 'message_id' => int|null, 'error' => string|null ]
     */
    public static function sendMessage(string $message, ?string $customChatId = null, string $parseMode = 'HTML'): array
    {
        $cfg = self::getConfig();
        $botToken = $cfg['bot_token'];
        $chatId = !empty($customChatId) ? trim($customChatId) : $cfg['chat_id'];

        if (empty($botToken)) {
            return [
                'success' => false,
                'message_id' => null,
                'error' => 'Bot Token belum diatur di api/config.php.'
            ];
        }

        if (empty($chatId)) {
            return [
                'success' => false,
                'message_id' => null,
                'error' => 'Chat ID belum diatur di api/config.php.'
            ];
        }

        $url = "https://api.telegram.org/bot{$botToken}/sendMessage";
        $payload = [
            'chat_id' => $chatId,
            'text' => $message,
            'parse_mode' => $parseMode,
            'disable_web_page_preview' => true,
        ];

        $postData = json_encode($payload, JSON_UNESCAPED_UNICODE);

        // Attempt via cURL first if available
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json; charset=utf-8',
                'Accept: application/json',
            ]);
            curl_setopt($ch, CURLOPT_TIMEOUT, 12);
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 6);
            // Handle local dev environments without certbundle
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

            $rawResponse = curl_exec($ch);
            $curlError = curl_error($ch);
            $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($rawResponse === false || !empty($curlError)) {
                return [
                    'success' => false,
                    'message_id' => null,
                    'error' => 'Gagal terhubung ke Telegram API: ' . $curlError,
                ];
            }
        } else {
            // Fallback via stream_context
            $opts = [
                'http' => [
                    'method' => 'POST',
                    'header' => "Content-Type: application/json; charset=utf-8\r\nAccept: application/json\r\n",
                    'content' => $postData,
                    'timeout' => 12,
                    'ignore_errors' => true,
                ],
                'ssl' => [
                    'verify_peer' => false,
                    'verify_peer_name' => false,
                ],
            ];
            $context = stream_context_create($opts);
            $rawResponse = @file_get_contents($url, false, $context);
            if ($rawResponse === false) {
                return [
                    'success' => false,
                    'message_id' => null,
                    'error' => 'Gagal terhubung ke Telegram API via HTTP stream.',
                ];
            }
        }

        $decoded = json_decode((string)$rawResponse, true);
        if (is_array($decoded) && !empty($decoded['ok'])) {
            return [
                'success' => true,
                'message_id' => $decoded['result']['message_id'] ?? null,
                'http_code' => $httpCode ?? 200,
                'error' => null,
            ];
        }

        $apiErrorDescription = $decoded['description'] ?? 'Telegram API mengembalikan error';
        return [
            'success' => false,
            'message_id' => null,
            'http_code' => $httpCode ?? 0,
            'error' => $apiErrorDescription,
        ];
    }

    /**
     * Check if a notification has already been successfully sent for a given reference.
     */
    public static function hasNotificationBeenSent(
        PDO $pdo,
        ?string $userId,
        string $notificationType,
        string $referenceId
    ): bool {
        $sql = "SELECT id FROM telegram_notifications 
                WHERE notification_type = :type 
                  AND reference_id = :ref_id 
                  AND status = 'success'
                LIMIT 1";
        
        $params = [
            'type' => $notificationType,
            'ref_id' => $referenceId,
        ];

        // If userId is provided, we can optionally bind it or check both
        if ($userId !== null && $userId !== '') {
            $sql = "SELECT id FROM telegram_notifications 
                    WHERE user_id = :user_id 
                      AND notification_type = :type 
                      AND reference_id = :ref_id 
                      AND status = 'success'
                    LIMIT 1";
            $params['user_id'] = $userId;
        }

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return (bool)$stmt->fetchColumn();
    }

    /**
     * Log a sent notification into database.
     */
    public static function logNotification(
        PDO $pdo,
        ?string $userId,
        string $notificationType,
        ?string $referenceId,
        string $message,
        bool $success,
        ?string $errorMessage = null
    ): int {
        try {
            $sql = "INSERT INTO telegram_notifications 
                    (user_id, notification_type, reference_id, message, status, error_message, sent_at)
                    VALUES 
                    (:user_id, :type, :ref_id, :msg, :status, :err, NOW())";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                'user_id' => $userId,
                'type' => $notificationType,
                'ref_id' => $referenceId,
                'msg' => $message,
                'status' => $success ? 'success' : 'failed',
                'err' => $errorMessage !== null ? substr($errorMessage, 0, 500) : null,
            ]);

            return (int)$pdo->lastInsertId();
        } catch (Throwable $e) {
            error_log("[TelegramService::logNotification Error] " . $e->getMessage());
            return 0;
        }
    }
}
