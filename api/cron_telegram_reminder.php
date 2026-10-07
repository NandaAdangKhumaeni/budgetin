<?php
/**
 * ==========================================================
 * BUDGETIN TELEGRAM REMINDER SCHEDULER
 * ==========================================================
 * File ini bertugas sebagai eksekutor (scheduler).
 * File ini HARUS dijalankan oleh Windows Task Scheduler atau Cron Job
 * setiap hari (misalnya jam 08:00 pagi).
 * 
 * Cara eksekusi via Command Line (CLI):
 * php D:\laragon\www\BUDGETIN\api\cron_telegram_reminder.php
 */

header('Content-Type: application/json');

// --- SIMULASI KONEKSI DATABASE ---
// Di aplikasi asli Anda, panggil koneksi DB Anda (misal: include 'db.php')
// $conn = new mysqli("localhost", "root", "", "budgetin_db");

// Simulasi Data Pengaturan User dari Database
$user_settings = [
    'telegram_enabled' => true,
    'telegram_chat_id' => '123456789', // ID pengguna
    'reminder_days' => 3 // H-3
];

// Simulasi Data Tagihan (Bills) yang mendekati jatuh tempo
$upcoming_bills = [
    [
        'name' => 'Tagihan Listrik PLN',
        'amount' => 550000,
        'due_date' => date('Y-m-d', strtotime('+3 days')), // Jatuh tempo 3 hari lagi
        'status' => 'unpaid'
    ]
];

// 1. Cek apakah fitur Telegram Notif aktif
if (!$user_settings['telegram_enabled'] || empty($user_settings['telegram_chat_id'])) {
    die(json_encode(['status' => 'skipped', 'message' => 'Notifikasi Telegram dinonaktifkan oleh pengguna.']));
}

$bot_token = "KODE_BOT_TELEGRAM_ANDA"; // Ganti dengan Token Bot asli Anda dari BotFather

$messages_sent = 0;

// 2. Cek setiap tagihan
foreach ($upcoming_bills as $bill) {
    // Hitung sisa hari
    $due_date = new DateTime($bill['due_date']);
    $today = new DateTime(date('Y-m-d'));
    $diff = $today->diff($due_date)->days;

    // Jika sisa hari sama dengan pengaturan (misal H-3)
    if ($diff == $user_settings['reminder_days'] && $bill['status'] == 'unpaid') {
        
        // Siapkan Teks Pesan (Format HTML Telegram)
        $text = "🔔 *PENGINGAT TAGIHAN BUDGETIN*\n\n";
        $text .= "Halo! Jangan lupa ada tagihan yang harus dibayar:\n";
        $text .= "🧾 *Tagihan:* " . $bill['name'] . "\n";
        $text .= "💰 *Nominal:* Rp " . number_format($bill['amount'], 0, ',', '.') . "\n";
        $text .= "📅 *Jatuh Tempo:* " . date('d M Y', strtotime($bill['due_date'])) . " (H-" . $diff . ")\n\n";
        $text .= "_Pesan ini dikirim otomatis oleh Sistem Budgetin._";

        // 3. Kirim ke API Telegram (Gunakan cURL)
        /*
        $url = "https://api.telegram.org/bot" . $bot_token . "/sendMessage";
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
            'chat_id' => $user_settings['telegram_chat_id'],
            'text' => $text,
            'parse_mode' => 'Markdown'
        ]));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        $response = curl_exec($ch);
        curl_close($ch);
        */
        
        // Simulasi berhasil kirim
        $messages_sent++;
    }
}

echo json_encode([
    'status' => 'success',
    'message' => "Scheduler berhasil dijalankan. $messages_sent notifikasi dikirim ke Telegram.",
    'timestamp' => date('Y-m-d H:i:s')
]);
?>
