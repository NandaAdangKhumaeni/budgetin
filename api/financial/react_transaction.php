<?php
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
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
        $stmt = $pdo->prepare('SELECT t.*, b.name AS wallet_name FROM transactions t LEFT JOIN banks b ON t.bank_id = b.id WHERE t.user_id = :uid ORDER BY t.transaction_date DESC, t.id DESC');
        $stmt->execute(['uid' => $userId]);
        echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
        exit;
    }
    
    if ($method === 'DELETE') {
        $id = $_GET['id'] ?? 0;
        $pdo->beginTransaction();
        
        $sel = $pdo->prepare('SELECT bank_id, amount, type FROM transactions WHERE id = :id AND user_id = :uid');
        $sel->execute(['id' => $id, 'uid' => $userId]);
        $tx = $sel->fetch(PDO::FETCH_ASSOC);
        
        if ($tx) {
            $operator = $tx['type'] === 'expense' ? '+' : '-';
            $upd = $pdo->prepare("UPDATE banks SET balance = balance {$operator} :amount WHERE id = :bid");
            $upd->execute(['amount' => $tx['amount'], 'bid' => $tx['bank_id']]);
            
            $stmt = $pdo->prepare('DELETE FROM transactions WHERE id = :id AND user_id = :uid');
            $stmt->execute(['id' => $id, 'uid' => $userId]);
        }
        
        $pdo->commit();
        echo json_encode(['success' => true, 'message' => 'Deleted']);
        exit;
    }
    
    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
        $amount = (float)($input['amount'] ?? 0);
        $type = $input['type'] ?? 'expense';
        $category = $input['category'] ?? 'other';
        $wallet = $input['wallet'] ?? 'BCA Utama';
        $note = $input['note'] ?? '';
        
        if ($amount <= 0) {
            echo json_encode(['success' => false, 'message' => 'Nominal > 0']);
            exit;
        }
        
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('SELECT id, balance FROM banks WHERE user_id = :uid AND name = :name LIMIT 1');
        $stmt->execute(['uid' => $userId, 'name' => $wallet]);
        $bank = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($bank) {
            $bankId = $bank['id'];
            if ($type === 'expense' && $bank['balance'] < $amount) {
                echo json_encode(['success' => false, 'message' => 'Saldo rekening ' . $wallet . ' tidak mencukupi!']);
                exit;
            }
        } else {
            if ($type === 'expense') {
                echo json_encode(['success' => false, 'message' => 'Saldo rekening ' . $wallet . ' tidak mencukupi (Rekening baru dibuat dengan saldo 0)!']);
                exit;
            }
            $ins = $pdo->prepare('INSERT INTO banks (user_id, legacy_id, name, balance, is_active, created_at, updated_at) VALUES (:uid, :legacy, :name, 0, 1, NOW(), NOW())');
            $ins->execute(['uid' => $userId, 'legacy' => strtolower(str_replace(' ', '_', $wallet)), 'name' => $wallet]);
            $bankId = $pdo->lastInsertId();
        }
        
        $operator = $type === 'expense' ? '-' : '+';
        $pdo->prepare("UPDATE banks SET balance = balance {$operator} :amount WHERE id = :bid")->execute(['amount' => $amount, 'bid' => $bankId]);
        
        $insTx = $pdo->prepare("INSERT INTO transactions (user_id, bank_id, type, category, amount, transaction_date, note, source, created_at) VALUES (:uid, :bid, :type, :cat, :amount, CURDATE(), :note, 'manual', NOW())");
        $insTx->execute(['uid' => $userId, 'bid' => $bankId, 'type' => $type, 'cat' => $category, 'amount' => $amount, 'note' => $note]);
        
        $pdo->commit();

        // 🚨 SATPAM PENGELUARAN (Expense Alert)
        if ($type === 'expense' && $amount >= 1000000) {
            $tStmt = $pdo->prepare('SELECT telegram_chat_id, telegram_enabled FROM users WHERE id = :id');
            $tStmt->execute(['id' => $userId]);
            $uSet = $tStmt->fetch(PDO::FETCH_ASSOC);

            if ($uSet && $uSet['telegram_enabled'] && $uSet['telegram_chat_id']) {
                $fmtAmount = number_format($amount, 0, ',', '.');
                $msg = "🚨 <b>SATPAM PENGELUARAN!</b>\n\n";
                $msg .= "Terdeteksi pengeluaran besar!\n";
                $msg .= "<b>Nominal:</b> Rp {$fmtAmount}\n";
                $msg .= "<b>Kategori:</b> {$category}\n";
                $msg .= "<b>Dompet:</b> {$wallet}\n";
                if (!empty($note)) {
                    $msg .= "<b>Catatan:</b> {$note}\n";
                }
                $msg .= "\n<i>Tolong dihemat ya bos!</i>";
                sendTelegramMessage($msg, $uSet['telegram_chat_id']);
            }
        }

        echo json_encode(['success' => true, 'message' => 'Berhasil disimpan ke Database']);
    }
} catch(Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}