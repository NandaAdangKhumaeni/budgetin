<?php
require_once __DIR__ . '/db.php';
$pdo = getDbConnection();
$stmt = $pdo->query("DESCRIBE bills");
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
