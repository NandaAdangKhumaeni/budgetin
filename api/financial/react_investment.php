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
    if (!$userId) {
        $stmt = $pdo->query('SELECT id FROM users ORDER BY id DESC LIMIT 1');
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user) $userId = $user['id'];
    }
    if(!$userId) {
        echo json_encode(['success' => false, 'message' => 'No user found']);
        exit;
    }
    
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        $stmt = $pdo->prepare('SELECT * FROM investments WHERE user_id = :uid ORDER BY id DESC');
        $stmt->execute(['uid' => $userId]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $data]);
        exit;
    }

    if ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);
        
        // check if asset already exists to merge them
        $stmt = $pdo->prepare("SELECT * FROM investments WHERE user_id = :uid AND name = :name AND type = :type LIMIT 1");
        $stmt->execute(['uid' => $userId, 'name' => $data['name'], 'type' => $data['type']]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($existing) {
            $newUnits = $existing['total_units'] + $data['total_units'];
            $newAvg = (($existing['total_units'] * $existing['avg_price']) + ($data['total_units'] * $data['avg_price'])) / $newUnits;
            
            $upd = $pdo->prepare("UPDATE investments SET total_units = :tu, avg_price = :avg, current_price = :cp WHERE id = :id");
            $upd->execute(['tu' => $newUnits, 'avg' => $newAvg, 'cp' => $data['current_price'], 'id' => $existing['id']]);
            echo json_encode(['success' => true, 'id' => $existing['id']]);
        } else {
            $ins = $pdo->prepare('INSERT INTO investments (user_id, type, name, total_units, avg_price, current_price) VALUES (:uid, :type, :name, :tu, :avg, :cp)');
            $ins->execute([
                'uid' => $userId,
                'type' => $data['type'],
                'name' => $data['name'],
                'tu' => $data['total_units'],
                'avg' => $data['avg_price'],
                'cp' => $data['current_price']
            ]);
            echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
        }
        // 📈 LOG INVESTASI TELEGRAM
        $tStmt = $pdo->prepare('SELECT telegram_chat_id, telegram_enabled FROM users WHERE id = :id');
        $tStmt->execute(['id' => $userId]);
        $uSet = $tStmt->fetch(PDO::FETCH_ASSOC);

        if ($uSet && $uSet['telegram_enabled'] && $uSet['telegram_chat_id']) {
            $totalCost = $data['total_units'] * $data['avg_price'];
            $fmtCost = number_format($totalCost, 0, ',', '.');
            $msg = "📈 <b>PEMBELIAN ASET INVESTASI</b>

";
            $msg .= "<b>Aset:</b> {$data['name']} ({$data['type']})
";
            $msg .= "<b>Jumlah:</b> {$data['total_units']} unit/lot
";
            $msg .= "<b>Total Dana:</b> Rp {$fmtCost}

";
            $msg .= "<i>Semoga cuan bos! 🚀</i>";
            sendTelegramMessage($msg, $uSet['telegram_chat_id']);
        }

        exit;
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
        $params = ['id' => $id, 'uid' => $userId];
        
        if (isset($data['total_units'])) { $fields[] = 'total_units = :tu'; $params['tu'] = $data['total_units']; }
        if (isset($data['current_price'])) { 
            $fields[] = 'current_price = :cp'; 
            $params['cp'] = $data['current_price']; 

            // 🚀 CUAN ALERT LOGIC
            $checkStmt = $pdo->prepare('SELECT * FROM investments WHERE id = :id AND user_id = :uid');
            $checkStmt->execute(['id' => $id, 'uid' => $userId]);
            $inv = $checkStmt->fetch(PDO::FETCH_ASSOC);

            if ($inv && $inv['avg_price'] > 0) {
                $profitPct = (($data['current_price'] - $inv['avg_price']) / $inv['avg_price']) * 100;
                
                $milestone = 0;
                if ($profitPct >= 200) $milestone = 200;
                elseif ($profitPct >= 100) $milestone = 100;
                elseif ($profitPct >= 50) $milestone = 50;
                elseif ($profitPct >= 20) $milestone = 20;
                elseif ($profitPct >= 10) $milestone = 10;
                elseif ($profitPct >= 5) $milestone = 5;

                $lastNotified = (int)($inv['last_notified_profit'] ?? 0);

                if ($milestone > 0 && $milestone > $lastNotified) {
                    $fields[] = 'last_notified_profit = :lnp';
                    $params['lnp'] = $milestone;

                    $tStmt = $pdo->prepare('SELECT telegram_chat_id, telegram_enabled FROM users WHERE id = :id');
                    $tStmt->execute(['id' => $userId]);
                    $uSet = $tStmt->fetch(PDO::FETCH_ASSOC);

                    if ($uSet && $uSet['telegram_enabled'] && $uSet['telegram_chat_id']) {
                        $profitRupiah = ($data['current_price'] - $inv['avg_price']) * $inv['total_units'];
                        $fmtProfit = number_format($profitRupiah, 0, ',', '.');
                        $fmtAvg = number_format($inv['avg_price'], 0, ',', '.');
                        $fmtCurr = number_format($data['current_price'], 0, ',', '.');
                        
                        $msg = "🚀 <b>CUAN ALERT: {$inv['name']} ({$inv['type']})</b>\n\n";
                        $msg .= "Modal Awal: Rp {$fmtAvg} / unit\n";
                        $msg .= "Harga Skrg: Rp {$fmtCurr} / unit\n\n";
                        $msg .= "✅ <b>Profit: +" . number_format($profitPct, 1) . "%</b> (Untung Rp {$fmtProfit})\n\n";
                        $msg .= "<i>Keren bos! Mau di-hold atau take profit nih?</i>";
                        
                        sendTelegramMessage($msg, $uSet['telegram_chat_id']);
                    }
                }
            }
        }

        if (!empty($fields)) {
            $sql = 'UPDATE investments SET ' . implode(', ', $fields) . ' WHERE id = :id AND user_id = :uid';
            $pdo->prepare($sql)->execute($params);
        }
        
        echo json_encode(['success' => true]);
        exit;
    }

    if ($method === 'DELETE') {
        $id = $_GET['id'] ?? null;
        if ($id) {
            $stmt = $pdo->prepare('DELETE FROM investments WHERE id = :id AND user_id = :uid');
            $stmt->execute(['id' => $id, 'uid' => $userId]);
        }
        echo json_encode(['success' => true]);
        exit;
    }

} catch(Exception $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}