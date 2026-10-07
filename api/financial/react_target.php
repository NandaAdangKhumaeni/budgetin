<?php
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../telegram.php';

try {
    $pdo = getDbConnection();
    $userId = $_SERVER['HTTP_X_USER_ID'] ?? null;
    
    // Fallback if no header
    if (!$userId) {
        $stmt = $pdo->query('SELECT id FROM users ORDER BY id DESC LIMIT 1');
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user) $userId = $user['id'];
    }
    
    if(!$userId) {
        echo json_encode(['success' => false, 'message' => 'No user found']);
        exit;
    }
    
    // Get user email
    $stmtEmail = $pdo->prepare("SELECT email FROM users WHERE id = :uid");
    $stmtEmail->execute(['uid' => $userId]);
    $userRow = $stmtEmail->fetch(PDO::FETCH_ASSOC);
    $userEmail = $userRow ? $userRow['email'] : '';

    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET' && isset($_GET['pending_invites'])) {
        $stmt = $pdo->prepare("
            SELECT t.*, u.name as inviter_name 
            FROM targets t 
            JOIN users u ON t.user_id = u.id 
            WHERE t.shared_with_email = :email AND t.share_status = 'pending'
            ORDER BY t.id DESC
        ");
        $stmt->execute(['email' => $userEmail]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $data]);
        exit;
    }

    if ($method === 'GET') {
        $stmt = $pdo->prepare("
            SELECT * FROM targets 
            WHERE user_id = :uid 
               OR (shared_with_email = :email AND share_status = 'accepted') 
            ORDER BY id DESC
        ");
        $stmt->execute(['uid' => $userId, 'email' => $userEmail]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $data]);
        exit;
    }

    if ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);
        
        $sharedEmail = isset($data['shared_with_email']) && $data['shared_with_email'] ? $data['shared_with_email'] : null;
        $shareStatus = $sharedEmail ? 'pending' : 'none';

        $stmt = $pdo->prepare('INSERT INTO targets (user_id, name, target_amount, current_amount, target_date, history, image_url, shared_with_email, share_status) VALUES (:uid, :name, :target_amount, :current_amount, :target_date, :history, :image_url, :shared_email, :share_status)');
        $stmt->execute([
            'uid' => $userId,
            'name' => $data['name'],
            'target_amount' => $data['target_amount'] ?? 0,
            'current_amount' => $data['current_amount'] ?? 0,
            'target_date' => $data['target_date'] ?? date('Y-m-d'),
            'history' => $data['history'] ?? '[]',
            'image_url' => $data['image_url'] ?? '',
            'shared_email' => $sharedEmail,
            'share_status' => $shareStatus
        ]);
        echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
        exit;
    }

    if ($method === 'PUT' && isset($_GET['accept_invite'])) {
        $id = $_GET['id'] ?? null;
        if ($id) {
            $stmt = $pdo->prepare("UPDATE targets SET share_status = 'accepted' WHERE id = :id AND shared_with_email = :email");
            $stmt->execute(['id' => $id, 'email' => $userEmail]);
            echo json_encode(['success' => true]);
        }
        exit;
    }
    if ($method === 'PUT' && isset($_GET['reject_invite'])) {
        $id = $_GET['id'] ?? null;
        if ($id) {
            $stmt = $pdo->prepare("UPDATE targets SET share_status = 'rejected', shared_with_email = NULL WHERE id = :id AND shared_with_email = :email");
            $stmt->execute(['id' => $id, 'email' => $userEmail]);
            echo json_encode(['success' => true]);
        }
        exit;
    }

    if ($method === 'PUT') {
        $id = $_GET['id'] ?? null;
        if (!$id) {
            echo json_encode(['success' => false, 'message' => 'Missing ID']);
            exit;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        
        $fields = [];
        $params = ['id' => $id];
        
        if (isset($data['name'])) { $fields[] = 'name = :name'; $params['name'] = $data['name']; }
        if (isset($data['target_amount'])) { $fields[] = 'target_amount = :target_amount'; $params['target_amount'] = $data['target_amount']; }
        if (isset($data['current_amount'])) { $fields[] = 'current_amount = :current_amount'; $params['current_amount'] = $data['current_amount']; }
        if (isset($data['target_date'])) { $fields[] = 'target_date = :target_date'; $params['target_date'] = $data['target_date']; }
        if (isset($data['history'])) { $fields[] = 'history = :history'; $params['history'] = $data['history']; }
        if (isset($data['image_url'])) { $fields[] = 'image_url = :image_url'; $params['image_url'] = $data['image_url']; }
        if (isset($data['shared_with_email'])) { $fields[] = 'shared_with_email = :shared_with_email'; $params['shared_with_email'] = $data['shared_with_email']; }
        if (isset($data['share_status'])) { $fields[] = 'share_status = :share_status'; $params['share_status'] = $data['share_status']; }

        
        if (!empty($fields)) {
            // 🎉 SELEBRASI TARGET TABUNGAN
            $checkStmt = $pdo->prepare('SELECT name, current_amount, target_amount, user_id FROM targets WHERE id = :id');
            $checkStmt->execute(['id' => $id]);
            $oldTarget = $checkStmt->fetch(PDO::FETCH_ASSOC);

            $sql = 'UPDATE targets SET ' . implode(', ', $fields) . ' WHERE id = :id AND (user_id = :uid OR (shared_with_email = :uemail AND share_status = \'accepted\'))';
            $params['uid'] = $userId;
            $params['uemail'] = $userEmail;
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            // If updated and current_amount changed
            if (isset($data['current_amount']) && $oldTarget && $oldTarget['current_amount'] < $oldTarget['target_amount']) {
                $newCurrent = (float)$data['current_amount'];
                $targetAmt = (float)$oldTarget['target_amount'];
                
                if ($newCurrent >= $targetAmt) {
                    $ownerId = $oldTarget['user_id'];
                    $tStmt = $pdo->prepare('SELECT telegram_chat_id, telegram_enabled FROM users WHERE id = :id');
                    $tStmt->execute(['id' => $ownerId]);
                    $uSet = $tStmt->fetch(PDO::FETCH_ASSOC);

                    if ($uSet && $uSet['telegram_enabled'] && $uSet['telegram_chat_id']) {
                        $fmtTarget = number_format($targetAmt, 0, ',', '.');
                        $msg = "🎉 <b>SELAMAT! TARGET TERCAPAI!</b> 🎉

";
                        $msg .= "Target tabungan <b>{$oldTarget['name']}</b> akhirnya mencapai 100%!
";
                        $msg .= "Total terkumpul: Rp {$fmtTarget}

";
                        $msg .= "<i>Kerja bagus bos! Silakan nikmati hasil jerih payahmu! 🥳</i>";
                        sendTelegramMessage($msg, $uSet['telegram_chat_id']);
                    }
                }
            }
        }
        
        echo json_encode(['success' => true]);
        exit;
    }

    if ($method === 'DELETE') {
        $id = $_GET['id'] ?? null;
        if ($id) {
            $stmt = $pdo->prepare('DELETE FROM targets WHERE id = :id AND user_id = :uid');
            $stmt->execute(['id' => $id, 'uid' => $userId]);
        }
        echo json_encode(['success' => true]);
        exit;
    }

} catch(Exception $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}