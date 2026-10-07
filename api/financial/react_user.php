<?php
$origin = $_SERVER["HTTP_ORIGIN"] ?? "*";
header("Access-Control-Allow-Origin: " . $origin);
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") { exit(0); }

require_once __DIR__ . "/../db.php";

try {
    $pdo = getDbConnection();
    $userId = $_SERVER['HTTP_X_USER_ID'] ?? null;
    if ($userId) {
        $stmt = $pdo->prepare("SELECT name, email FROM users WHERE id = ?");
        $stmt->execute([$userId]);
    } else {
        $stmt = $pdo->query("SELECT name, email FROM users ORDER BY id DESC LIMIT 1");
    }
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if($user) {
        echo json_encode(["success" => true, "data" => $user]);
    } else {
        echo json_encode(["success" => false, "message" => "No user found"]);
    }
} catch(Exception $e) {
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

