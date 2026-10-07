<?php
require_once __DIR__ . '/db.php';
$pdo = getDbConnection();
$pdo->exec("ALTER TABLE targets CHANGE icon_id image_url TEXT");
echo "Table updated";
