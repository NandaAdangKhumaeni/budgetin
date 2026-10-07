<?php
require_once __DIR__ . '/db.php';
$pdo = getDbConnection();
$pdo->exec("ALTER TABLE targets ADD COLUMN history TEXT");
echo "History column added";
