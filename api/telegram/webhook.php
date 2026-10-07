<?php
/**
 * BUDGETIN - Telegram Webhook Receiver Endpoint
 * POST /api/telegram/webhook.php
 *
 * Requirements:
 * - Terima update dari Telegram Bot API
 * - Identifikasi user berdasarkan `chat_id`
 * - JANGAN PERNAH mempercayai `user_id` dari request client
 *
 * Supported Commands:
 * - /start <token> : Menghubungkan akun secara instan dengan pairing token
 * - /status        : Memeriksa akun Budgetin yang terhubung
 * - /bills         : Menampilkan daftar tagihan aktif jatuh tempo terdekat
 * - /disconnect    : Memutuskan koneksi bot dari akun Budgetin
 * - /help          : Bantuan penggunaan bot
 */

declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/telegram_helper.php';

// Optional secret header validation from Telegram Webhook setup: X-Telegram-Bot-Api-Secret-Token
$cfg = TelegramService::getConfig();
$secretHeader = $_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? null;
if (!empty($cfg['webhook_secret']) && $secretHeader !== $cfg['webhook_secret']) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Invalid webhook secret']);
    exit;
}

$rawInput = file_get_contents('php://input');
if (empty($rawInput)) {
    http_response_code(200);
    echo json_encode(['ok' => true, 'message' => 'Budgetin Telegram Webhook alive']);
    exit;
}

$update = json_decode($rawInput, true);
if (!is_array($update)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
}

try {
    $pdo = getDbConnection();

    // Extract message details
    $message = $update['message'] ?? $update['edited_message'] ?? null;
    if (!$message) {
        // Callback queries or other updates can be safely acknowledged
        echo json_encode(['ok' => true]);
        exit;
    }

    $chatId = isset($message['chat']['id']) ? (string)$message['chat']['id'] : null;
    $text = trim((string)($message['text'] ?? ''));
    $from = $message['from'] ?? [];
    $username = $from['username'] ?? ($from['first_name'] ?? 'User');

    if (empty($chatId) || empty($text)) {
        echo json_encode(['ok' => true]);
        exit;
    }

    // 1. Identify connected user strictly from database via chat_id
    // NEVER TRUST client-supplied user_id!
    $existingConnection = TelegramService::getConnectionByChatId($pdo, $chatId);
    $connectedUserId = $existingConnection ? (string)$existingConnection['user_id'] : null;

    // 2. Command dispatching
    $parts = explode(' ', $text, 2);
    $command = strtolower($parts[0]);
    $param = isset($parts[1]) ? trim($parts[1]) : '';

    // Remove bot username suffix if present e.g. /start@BudgetinBot -> /start
    if (strpos($command, '@') !== false) {
        $command = explode('@', $command)[0];
    }

    // Command: /start or /start <token>
    if ($command === '/start') {
        if (!empty($param)) {
            // Pairing attempt via token!
            try {
                $conn = TelegramService::processBotStartCommand($pdo, $param, $chatId, (string)$username);
                
                // Get paired user details
                $uStmt = $pdo->prepare("SELECT name, email FROM users WHERE id = :user_id LIMIT 1");
                $uStmt->execute(['user_id' => $conn['user_id']]);
                $uInfo = $uStmt->fetch(PDO::FETCH_ASSOC);
                $userName = $uInfo['name'] ?? 'Pengguna Budgetin';

                $reply = "🎉 <b>Berhasil Terhubung ke Budgetin!</b>\n\n"
                       . "Halo <b>" . htmlspecialchars($userName, ENT_QUOTES, 'UTF-8') . "</b>,\n"
                       . "Akun Telegram Anda sekarang telah terhubung dengan email <code>" . htmlspecialchars($uInfo['email'] ?? '', ENT_QUOTES, 'UTF-8') . "</code>.\n\n"
                       . "🔔 Anda akan menerima pengingat otomatis untuk tagihan H-1 dan Hari H jatuh tempo.\n\n"
                       . "Ketik /bills untuk melihat daftar tagihan yang belum lunas.\n"
                       . "Ketik /status untuk melihat status akun.";
            } catch (Throwable $e) {
                $reply = "❌ <b>Gagal Menghubungkan Akun:</b>\n" . htmlspecialchars($e->getMessage(), ENT_QUOTES, 'UTF-8') . "\n\nSilakan buka halaman Profil di Budgetin untuk membuat kode pairing baru.";
            }
        } else {
            // /start without token
            if ($connectedUserId) {
                $reply = "👋 <b>Halo!</b> Akun Telegram Anda sudah terhubung ke Budgetin.\n\nGunakan perintah berikut:\n"
                       . "• /bills - Daftar tagihan aktif\n"
                       . "• /status - Status koneksi akun\n"
                       . "• /disconnect - Putuskan koneksi akun";
            } else {
                $reply = "👋 <b>Selamat Datang di Budgetin Bot!</b>\n\n"
                       . "Bot ini membantu Anda menerima pengingat tagihan keuangan harian secara tepat waktu.\n\n"
                       . "Untuk menghubungkan akun Anda:\n"
                       . "1. Buka <b>Budgetin Web</b> > Menu <b>Profil</b>\n"
                       . "2. Temukan bagian <b>Telegram Bot Integration</b>\n"
                       . "3. Klik tombol hubungkan atau gunakan kode pairing Anda.\n"
                       . "Contoh: <code>/start BGTXXXXXX</code>";
            }
        }

        TelegramService::sendMessage($reply, $chatId);
        echo json_encode(['ok' => true]);
        exit;
    }

    // If user is NOT connected yet, block user-specific commands
    if (!$connectedUserId) {
        $reply = "🔒 <b>Akun Belum Terhubung</b>\n\n"
               . "Telegram Anda belum terhubung ke akun Budgetin manapun.\n"
               . "Silakan login ke web Budgetin dan kirimkan kode pairing dengan format <code>/start KODE_PAIRING</code>.";
        TelegramService::sendMessage($reply, $chatId);
        echo json_encode(['ok' => true]);
        exit;
    }

    // Command: /status
    if ($command === '/status') {
        $uStmt = $pdo->prepare("SELECT name, email, created_at FROM users WHERE id = :user_id LIMIT 1");
        $uStmt->execute(['user_id' => $connectedUserId]);
        $u = $uStmt->fetch(PDO::FETCH_ASSOC);

        $reply = "📊 <b>STATUS KONEKSI BUDGETIN</b>\n\n"
               . "👤 <b>Nama:</b> " . htmlspecialchars($u['name'] ?? '-', ENT_QUOTES, 'UTF-8') . "\n"
               . "📧 <b>Email:</b> " . htmlspecialchars($u['email'] ?? '-', ENT_QUOTES, 'UTF-8') . "\n"
               . "🔗 <b>Status:</b> ✅ Terhubung & Aktif\n"
               . "📅 <b>Terhubung Sejak:</b> " . ($existingConnection['connected_at'] ?? '-') . "\n\n"
               . "<i>Notifikasi tagihan akan dikirimkan secara otomatis setiap hari.</i>";

        TelegramService::sendMessage($reply, $chatId);
        echo json_encode(['ok' => true]);
        exit;
    }

    // Command: /bills
    if ($command === '/bills') {
        $bStmt = $pdo->prepare("SELECT name, category, amount, due_date 
                                FROM bills 
                                WHERE user_id = :user_id AND status = 'unpaid' 
                                ORDER BY due_date ASC LIMIT 10");
        $bStmt->execute(['user_id' => $connectedUserId]);
        $bills = $bStmt->fetchAll(PDO::FETCH_ASSOC);

        if (empty($bills)) {
            $reply = "🎉 <b>Semua Tagihan Sudah Lunas!</b>\n\nTidak ada tagihan yang belum dibayar saat ini.";
        } else {
            $reply = "🧾 <b>DAFTAR TAGIHAN BELUM LUNAS:</b>\n\n";
            foreach ($bills as $idx => $b) {
                $num = $idx + 1;
                $amt = 'Rp ' . number_format((float)$b['amount'], 0, ',', '.');
                $reply .= "{$num}. <b>" . htmlspecialchars($b['name'], ENT_QUOTES, 'UTF-8') . "</b>\n"
                       . "   💰 {$amt} | 📅 Jatuh Tempo: <b>{$b['due_date']}</b>\n";
            }
            $reply .= "\n<i>Tandai lunas melalui web Budgetin setelah melakukan pembayaran.</i>";
        }

        TelegramService::sendMessage($reply, $chatId);
        echo json_encode(['ok' => true]);
        exit;
    }

    // Command: /disconnect
    if ($command === '/disconnect') {
        TelegramService::disconnectUser($pdo, $connectedUserId);
        $reply = "⚠️ <b>Koneksi Berhasil Diputuskan</b>\n\nAkun Telegram ini telah diputuskan dari Budgetin. Anda tidak akan lagi menerima notifikasi pengingat.";
        TelegramService::sendMessage($reply, $chatId);
        echo json_encode(['ok' => true]);
        exit;
    }

    // Default Help / Fallback
    $reply = "🤖 <b>Budgetin Bot Menu</b>\n\n"
           . "Perintah yang tersedia:\n"
           . "• /bills - Periksa tagihan belum lunas\n"
           . "• /status - Info koneksi akun Budgetin\n"
           . "• /disconnect - Putuskan koneksi akun\n"
           . "• /help - Bantuan";
    TelegramService::sendMessage($reply, $chatId);
    echo json_encode(['ok' => true]);

} catch (Throwable $e) {
    error_log("[Telegram Webhook Error] " . $e->getMessage());
    http_response_code(200); // Always 200 to Telegram Bot API so it doesn't repeatedly retry on logic errors
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
