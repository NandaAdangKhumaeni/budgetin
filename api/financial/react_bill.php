<?php
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
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
    
    if ($method === 'GET') {
        $stmt = $pdo->prepare('SELECT * FROM bills WHERE user_id = :uid ORDER BY id DESC');
        $stmt->execute(['uid' => $userId]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $data]);
        exit;
    }
    
    if ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);
        $ins = $pdo->prepare('INSERT INTO bills (user_id, type, name, amount, due_date, is_paid) VALUES (:uid, :type, :name, :amount, :due, :paid)');
        $ins->execute([
            'uid' => $userId,
            'type' => $data['type'] ?? 'Monthly',
            'name' => $data['name'],
            'amount' => $data['amount'],
            'due' => $data['due_date'],
            'paid' => 0
        ]);
        echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
        exit;
    }
    
    if ($method === 'PUT') {
        $id = $_GET['id'] ?? null;
        $data = json_decode(file_get_contents('php://input'), true);
        $fields = [];
        $params = ['id' => $id, 'uid' => $userId];
        
        if (isset($data['is_paid'])) { $fields[] = 'is_paid = :paid'; $params['paid'] = $data['is_paid']; }
        if (isset($data['paid_date'])) { $fields[] = 'paid_date = :pd'; $params['pd'] = $data['paid_date']; }
        if (isset($data['amount'])) { $fields[] = 'amount = :amt'; $params['amt'] = $data['amount']; }
        if (isset($data['due_date'])) { $fields[] = 'due_date = :dd'; $params['dd'] = $data['due_date']; }
        if (isset($data['name'])) { $fields[] = 'name = :name'; $params['name'] = $data['name']; }
        if (isset($data['type'])) { $fields[] = 'type = :type'; $params['type'] = $data['type']; }
        if (isset($data['last_paid_month'])) { $fields[] = 'last_paid_month = :lpm'; $params['lpm'] = $data['last_paid_month']; }
        if (isset($data['current_tenor'])) { $fields[] = 'current_tenor = :ct'; $params['ct'] = $data['current_tenor']; }
        if (isset($data['is_completed'])) { $fields[] = 'is_completed = :ic'; $params['ic'] = $data['is_completed']; }

        if (!empty($fields) && $id) {
            $sql = 'UPDATE bills SET ' . implode(', ', $fields) . ' WHERE id = :id AND user_id = :uid';
            $pdo->prepare($sql)->execute($params);
        }
        echo json_encode(['success' => true]);
        exit;
    }
    
    if ($method === 'DELETE') {
        $id = $_GET['id'] ?? null;
        if ($id) {
            $stmt = $pdo->prepare('DELETE FROM bills WHERE id = :id AND user_id = :uid');
            $stmt->execute(['id' => $id, 'uid' => $userId]);
        }
        echo json_encode(['success' => true]);
        exit;
    }

} catch(Exception $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}