<?php
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

require_once __DIR__ . '/../db.php';

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

    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (isset($input['action']) && $input['action'] === 'toggle') {
            // Toggle Is Active
            $id = $input['id'] ?? 0;
            $isActive = $input['is_active'] ? 1 : 0;
            $upd = $pdo->prepare('UPDATE banks SET is_active = :act WHERE id = :id AND user_id = :uid');
            $upd->execute(['act' => $isActive, 'id' => $id, 'uid' => $userId]);
            echo json_encode(['success' => true, 'message' => 'Status updated']);
            exit;
        } else {
            // Create New Bank
            $name = $input['name'] ?? 'Dompet';
            $balance = $input['balance'] ?? 0;
            
            // Check if exists
            $chk = $pdo->prepare('SELECT id FROM banks WHERE name = :name AND user_id = :uid LIMIT 1');
            $chk->execute(['name' => $name, 'uid' => $userId]);
            if ($chk->fetch()) {
                echo json_encode(['success' => false, 'message' => 'Rekening dengan nama ini sudah ada']);
                exit;
            }
            
            $ins = $pdo->prepare('INSERT INTO banks (user_id, legacy_id, name, balance, is_active, created_at, updated_at) VALUES (:uid, :lid, :name, :balance, 1, NOW(), NOW())');
            $ins->execute([
                'uid' => $userId,
                'lid' => 'bank_' . time(),
                'name' => $name,
                'balance' => $balance
            ]);
            
            echo json_encode(['success' => true, 'message' => 'Rekening berhasil disimpan']);
            exit;
        }
    }
    
    if ($method === 'DELETE') {
        $id = $_GET['id'] ?? 0;
        
        // Cek apakah ada transaksi dengan bank_id ini
        $chk = $pdo->prepare('SELECT id FROM transactions WHERE bank_id = :id AND user_id = :uid LIMIT 1');
        $chk->execute(['id' => $id, 'uid' => $userId]);
        if ($chk->fetch()) {
            echo json_encode(['success' => false, 'message' => 'Gagal menghapus: Rekening ini sudah digunakan di transaksi!']);
            exit;
        }
        
        $stmt = $pdo->prepare('DELETE FROM banks WHERE id = :id AND user_id = :uid');
        $stmt->execute(['id' => $id, 'uid' => $userId]);
        echo json_encode(['success' => true, 'message' => 'Deleted']);
        exit;
    }

    // GET
    $stmt = $pdo->prepare('SELECT * FROM banks WHERE user_id = :uid ORDER BY is_active DESC, id DESC');
    $stmt->execute(['uid' => $userId]);
    $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['success' => true, 'data' => $data]);
} catch(Exception $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}