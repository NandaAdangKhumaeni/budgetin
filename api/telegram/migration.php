<?php
/**
 * BUDGETIN - Telegram Notifications Database Migration
 * Creates `telegram_notifications` table if it does not exist.
 */

declare(strict_types=1);

require_once __DIR__ . '/../db.php';

function migrateTelegramTable(PDO $pdo): bool
{
    // 1. Existing telegram_notifications table
    $sqlNotif = "CREATE TABLE IF NOT EXISTS `telegram_notifications` (
        `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        `user_id` VARCHAR(64) NULL,
        `notification_type` VARCHAR(32) NOT NULL,
        `reference_id` VARCHAR(128) NULL,
        `message` TEXT NOT NULL,
        `status` ENUM('success', 'failed') NOT NULL,
        `error_message` TEXT NULL,
        `sent_at` DATETIME NOT NULL,
        `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX `idx_user_type_ref` (`user_id`, `notification_type`, `reference_id`),
        INDEX `idx_sent_at` (`sent_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $pdo->exec($sqlNotif);

    // 2. telegram_connections table for multi-user isolation
    // Matches requirements:
    // id BIGINT PRIMARY KEY AUTO_INCREMENT
    // user_id VARCHAR(64) (matching users.id) NOT NULL UNIQUE
    // chat_id VARCHAR(64) NOT NULL UNIQUE
    // telegram_username VARCHAR(255) NULL
    // status ENUM('connected','disconnected') DEFAULT 'connected'
    // connected_at DATETIME NULL
    // created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    // updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    // Foreign key user_id -> users.id, and indexes on user_id, chat_id, status
    $sqlConn = "CREATE TABLE IF NOT EXISTS `telegram_connections` (
        `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
        `user_id` VARCHAR(64) NOT NULL,
        `chat_id` VARCHAR(64) NOT NULL,
        `telegram_username` VARCHAR(255) NULL,
        `status` ENUM('connected', 'disconnected') DEFAULT 'connected',
        `connected_at` DATETIME NULL,
        `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
        `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY `uniq_user_id` (`user_id`),
        UNIQUE KEY `uniq_chat_id` (`chat_id`),
        INDEX `idx_status` (`status`),
        CONSTRAINT `fk_telegram_connections_user_id`
            FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
            ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $pdo->exec($sqlConn);

    // 3. telegram_pairing_tokens table for secure token-based pairing between Telegram Bot and Web app
    $sqlTokens = "CREATE TABLE IF NOT EXISTS `telegram_pairing_tokens` (
        `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
        `user_id` VARCHAR(64) NOT NULL,
        `token` VARCHAR(64) NOT NULL,
        `chat_id` VARCHAR(64) NULL,
        `telegram_username` VARCHAR(255) NULL,
        `status` ENUM('pending', 'verified', 'expired', 'used') DEFAULT 'pending',
        `expires_at` DATETIME NOT NULL,
        `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
        `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY `uniq_pairing_token` (`token`),
        INDEX `idx_pairing_user_status` (`user_id`, `status`),
        INDEX `idx_pairing_chat` (`chat_id`),
        CONSTRAINT `fk_pairing_tokens_user_id`
            FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
            ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $pdo->exec($sqlTokens);

    return true;
}

if (php_sapi_name() === 'cli' || basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    try {
        $pdo = getDbConnection();
        migrateTelegramTable($pdo);
        if (php_sapi_name() === 'cli') {
            echo "Table telegram_notifications verified/created successfully.\n";
        } else {
            header('Content-Type: application/json');
            echo json_encode(['success' => true, 'message' => 'Table telegram_notifications verified/created.']);
        }
    } catch (Throwable $e) {
        if (php_sapi_name() === 'cli') {
            echo "Error migrating telegram_notifications: " . $e->getMessage() . "\n";
            exit(1);
        } else {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            exit;
        }
    }
}
