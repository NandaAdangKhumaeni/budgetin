<?php
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
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

    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        $stmt = $pdo->prepare('SELECT id, name, email, telegram_chat_id, telegram_enabled, telegram_reminder_days, profile_picture FROM users WHERE id = :id');
        $stmt->execute(['id' => $userId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $user]);
        exit;
    }

    if ($method === 'POST') {
        if (isset($_FILES['profile_picture'])) {
            $file = $_FILES['profile_picture'];
            $allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            
            if (!in_array($ext, $allowedExts)) {
                echo json_encode(['success' => false, 'message' => 'Invalid file format']);
                exit;
            }
            
            $filename = 'profile_' . $userId . '_' . time() . '.' . $ext;
            $uploadPath = __DIR__ . '/../../uploads/' . $filename;
            
            if (move_uploaded_file($file['tmp_name'], $uploadPath)) {
                $fileUrl = '/BUDGETIN/uploads/' . $filename;
                
                // update db
                $stmt = $pdo->prepare('UPDATE users SET profile_picture = :pic WHERE id = :id');
                $stmt->execute(['pic' => $fileUrl, 'id' => $userId]);
                
                echo json_encode(['success' => true, 'url' => $fileUrl]);
                exit;
            } else {
                echo json_encode(['success' => false, 'message' => 'Failed to move uploaded file']);
                exit;
            }
        }
        echo json_encode(['success' => false, 'message' => 'No file uploaded']);
        exit;
    }

    if ($method === 'PUT') {
        $data = json_decode(file_get_contents('php://input'), true);
        
        $fields = [];
        $params = ['id' => $userId];

        if (isset($data['telegram_chat_id'])) {
            $fields[] = 'telegram_chat_id = :chat_id';
            $params['chat_id'] = $data['telegram_chat_id'];
        }
        if (isset($data['telegram_enabled'])) {
            $fields[] = 'telegram_enabled = :enabled';
            $params['enabled'] = $data['telegram_enabled'] ? 1 : 0;
        }
        if (isset($data['telegram_reminder_days'])) {
            $fields[] = 'telegram_reminder_days = :days';
            $params['days'] = $data['telegram_reminder_days'];
        }

        if (!empty($fields)) {
            $sql = 'UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = :id';
            $pdo->prepare($sql)->execute($params);
        }

        // Test telegram if requested
        if (isset($data['test_telegram']) && $data['test_telegram'] === true) {
            $chatId = $data['telegram_chat_id'] ?? null;
            if ($chatId) {
                sendTelegramMessage("👋 <b>Test Koneksi Budgetin</b>\nIni adalah pesan test bahwa akun Telegram Anda sudah terhubung.", $chatId);
            }
        }

        echo json_encode(['success' => true]);
        exit;
    }

} catch(Exception $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
