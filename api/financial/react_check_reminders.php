<?php
// D:\laragon\www\BUDGETIN\api\financial\react_check_reminders.php

$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../telegram.php';

try {
    $pdo = getDbConnection();
    $userId = $_SERVER['HTTP_X_USER_ID'] ?? null;
    if (!$userId) {
        $stmt = $pdo->query('SELECT id FROM users ORDER BY id DESC LIMIT 1');
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user) $userId = $user['id'];
    }

    if (!$userId) {
        echo json_encode(['success' => false, 'message' => 'No user found']);
        exit;
    }

    // Get user's telegram settings
    $stmt = $pdo->prepare('SELECT telegram_chat_id, telegram_enabled, telegram_reminder_days FROM users WHERE id = :id');
    $stmt->execute(['id' => $userId]);
    $userSettings = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$userSettings || !$userSettings['telegram_enabled'] || !$userSettings['telegram_chat_id']) {
        echo json_encode(['success' => true, 'message' => 'Telegram not configured or disabled for this user']);
        exit;
    }

    $chatId = $userSettings['telegram_chat_id'];
    $reminderDays = (int)$userSettings['telegram_reminder_days'];

    $today = date('Y-m-d');
    
    // Check if we already sent reminders today for this user
    $flagFile = sys_get_temp_dir() . "/budgetin_reminder_{$userId}_{$today}.flag";
    
    // For debugging, we can skip the flag check by adding ?force=1
    $force = isset($_GET['force']);

    if (file_exists($flagFile) && !$force) {
        echo json_encode(['success' => true, 'message' => 'Sudah dicek hari ini']);
        exit;
    }

    // Get bills that are NOT paid
    $stmt = $pdo->prepare('SELECT * FROM bills WHERE user_id = :uid AND is_paid = 0');
    $stmt->execute(['uid' => $userId]);
    $bills = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $remindersSent = 0;

    foreach ($bills as $bill) {
        $billDay = (int)$bill['due_date'];
        $todayDay = (int)date('d');
        
        $diffDays = $billDay - $todayDay;
        
        if ($diffDays <= $reminderDays) {
            // Need to remind!
            $amount = number_format($bill['amount'], 0, ',', '.');
            
            if ($diffDays < 0) {
                $status = "🚨 <b>TERLEWAT " . abs($diffDays) . " HARI!</b>";
            } elseif ($diffDays == 0) {
                $status = "⚠️ <b>JATUH TEMPO HARI INI!</b>";
            } else {
                $status = "⏳ <b>Jatuh tempo dalam $diffDays hari</b>";
            }

            $message = "🧾 <b>PENGINGAT TAGIHAN</b>\n\n";
            $message .= "<b>Nama:</b> {$bill['name']}\n";
            $message .= "<b>Tipe:</b> {$bill['type']}\n";
            $message .= "<b>Nominal:</b> Rp {$amount}\n";
            $message .= "<b>Jatuh Tempo:</b> Setiap Tgl {$billDay}\n\n";
            $message .= "{$status}\n\n";
            $message .= "<i>Segera lunasi agar tidak kena denda!</i>";

            sendTelegramMessage($message, $chatId);
            $remindersSent++;
        }
    }

    // Mark as checked today
    file_put_contents($flagFile, 'checked');

    echo json_encode(['success' => true, 'reminders_sent' => $remindersSent]);
} catch(Exception $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
