<?php
/**
 * BUDGETIN - Telegram Bill Reminder Processor / Worker
 * Handles H-1 and Hari H bill reminders.
 * Can be run via CLI (Task Scheduler / Cron) or invoked via GET / POST api/telegram/remind_bills.php.
 */

declare(strict_types=1);

require_once __DIR__ . '/../financial/financial_helper.php';
require_once __DIR__ . '/telegram_helper.php';

function runBillReminders(PDO $pdo, ?string $targetUserId = null): array
{
    $results = [
        'processed' => 0,
        'sent' => 0,
        'skipped_duplicate' => 0,
        'failed' => 0,
        'details' => []
    ];

    if (!TelegramService::isConfigured()) {
        return array_merge($results, ['error' => 'Telegram belum dikonfigurasi di api/config.php']);
    }

    $todayStr = date('Y-m-d');
    $tomorrowStr = date('Y-m-d', strtotime('+1 day'));

    // Fetch unpaid bills due today or tomorrow
    $sql = "SELECT b.id, b.user_id, b.name, b.category, b.amount, b.due_date, b.frequency,
                   u.name AS user_name, u.email AS user_email
            FROM bills b
            LEFT JOIN users u ON u.id = b.user_id
            WHERE b.status = 'unpaid'
              AND (b.due_date = :today OR b.due_date = :tomorrow)";

    $params = [
        'today' => $todayStr,
        'tomorrow' => $tomorrowStr,
    ];

    if ($targetUserId !== null && $targetUserId !== '') {
        $sql .= " AND b.user_id = :target_user";
        $params['target_user'] = $targetUserId;
    }

    $sql .= " ORDER BY b.due_date ASC, b.id ASC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $bills = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Cache active user connections to avoid repeated queries
    $userChatMap = [];

    foreach ($bills as $bill) {
        $results['processed']++;
        $billId = (string)$bill['id'];
        $billUserId = (string)$bill['user_id'];
        $billName = htmlspecialchars((string)$bill['name'], ENT_QUOTES, 'UTF-8');
        $billCategory = htmlspecialchars((string)($bill['category'] ?: 'Tagihan'), ENT_QUOTES, 'UTF-8');
        $billDueDate = (string)$bill['due_date'];
        $amountFmt = 'Rp ' . number_format((float)$bill['amount'], 0, ',', '.');
        $userName = !empty($bill['user_name']) ? htmlspecialchars((string)$bill['user_name'], ENT_QUOTES, 'UTF-8') : 'Pengguna Budgetin';

        $isToday = ($billDueDate === $todayStr);
        $notificationType = $isToday ? 'bill_due_date' : 'bill_h_minus_1';
        $refKey = "{$billId}_{$billDueDate}";

        // 1. Resolve user's isolated Telegram chat_id
        if (!array_key_exists($billUserId, $userChatMap)) {
            $conn = TelegramService::getUserConnection($pdo, $billUserId);
            $userChatMap[$billUserId] = $conn ? (string)$conn['chat_id'] : null;
        }

        $userChatId = $userChatMap[$billUserId];
        if (empty($userChatId)) {
            // User hasn't connected Telegram; skip silently to preserve isolation
            $results['details'][] = [
                'bill_id' => $billId,
                'name' => $bill['name'],
                'user_id' => $billUserId,
                'status' => 'skipped_no_telegram_connection'
            ];
            continue;
        }

        // 2. Check duplicate prevention per user & bill reference
        if (TelegramService::hasNotificationBeenSent($pdo, $billUserId, $notificationType, $refKey)) {
            $results['skipped_duplicate']++;
            $results['details'][] = [
                'bill_id' => $billId,
                'name' => $bill['name'],
                'user_id' => $billUserId,
                'type' => $notificationType,
                'status' => 'skipped_duplicate'
            ];
            continue;
        }

        // 3. Format message
        if ($isToday) {
            $msg = "⏰ <b>PENGINGAT TAGIHAN (HARI INI)</b>\n"
                 . "Halo <b>{$userName}</b>,\n\n"
                 . "Tagihan berikut <b>jatuh tempo HARI INI</b>:\n"
                 . "🧾 <b>Tagihan:</b> {$billName}\n"
                 . "🏷️ <b>Kategori:</b> {$billCategory}\n"
                 . "💰 <b>Jumlah:</b> <code>{$amountFmt}</code>\n"
                 . "📅 <b>Jatuh Tempo:</b> <b>{$billDueDate}</b>\n\n"
                 . "<i>Mohon segera selesaikan pembayaran dan tandai lunas di Budgetin.</i> ✅";
        } else {
            $msg = "⏳ <b>PENGINGAT TAGIHAN (H-1 BESOK)</b>\n"
                 . "Halo <b>{$userName}</b>,\n\n"
                 . "Tagihan berikut akan <b>jatuh tempo BESOK</b>:\n"
                 . "🧾 <b>Tagihan:</b> {$billName}\n"
                 . "🏷️ <b>Kategori:</b> {$billCategory}\n"
                 . "💰 <b>Jumlah:</b> <code>{$amountFmt}</code>\n"
                 . "📅 <b>Jatuh Tempo:</b> <b>{$billDueDate}</b>\n\n"
                 . "<i>Siapkan dana sebelum tanggal jatuh tempo.</i> 💡";
        }

        // 4. Send message strictly to user's registered chat_id
        $sendRes = TelegramService::sendMessage($msg, $userChatId);

        // 5. Record to database log
        TelegramService::logNotification(
            $pdo,
            $billUserId,
            $notificationType,
            $refKey,
            $msg,
            $sendRes['success'],
            $sendRes['error']
        );

        if ($sendRes['success']) {
            $results['sent']++;
            $results['details'][] = [
                'bill_id' => $billId,
                'name' => $bill['name'],
                'user_id' => $billUserId,
                'type' => $notificationType,
                'status' => 'sent'
            ];
        } else {
            $results['failed']++;
            $results['details'][] = [
                'bill_id' => $billId,
                'name' => $bill['name'],
                'user_id' => $billUserId,
                'type' => $notificationType,
                'status' => 'failed',
                'error' => $sendRes['error']
            ];
        }
    }

    return $results;
}

// Direct HTTP or CLI invocation
if (php_sapi_name() === 'cli' && basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    $pdo = getDbConnection();
    echo "Running Bill Reminders at " . date('Y-m-d H:i:s') . "...\n";
    $res = runBillReminders($pdo);
    echo json_encode($res, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";
} else if (php_sapi_name() !== 'cli' && basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    // Web invocation
    try {
        $pdo = getDbConnection();
        $user = getSessionUser($pdo);
        $userId = $user['id'] ?? null;

        // If authenticated user calls it, they can check/trigger their own bills reminder
        $res = runBillReminders($pdo, $userId ? (string)$userId : null);
        sendJsonResponse([
            'success' => true,
            'data' => $res
        ]);
    } catch (Throwable $e) {
        sendJsonResponse([
            'success' => false,
            'error' => $e->getMessage()
        ], 500);
    }
}
