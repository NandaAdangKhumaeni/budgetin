<?php
require_once __DIR__ . '/db.php';
$pdo = getDbConnection();

// Create Investments Table
$pdo->exec("CREATE TABLE IF NOT EXISTS investments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    total_units DECIMAL(15,4) NOT NULL DEFAULT 0,
    avg_price DECIMAL(15,2) NOT NULL DEFAULT 0,
    current_price DECIMAL(15,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)");

// Create Bills Table
$pdo->exec("CREATE TABLE IF NOT EXISTS bills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'rutin',
    name VARCHAR(100) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    due_date INT NOT NULL,
    icon_id VARCHAR(50),
    is_paid TINYINT(1) DEFAULT 0,
    last_paid_month VARCHAR(10),
    is_installment TINYINT(1) DEFAULT 0,
    current_tenor INT DEFAULT null,
    total_tenor INT DEFAULT null,
    is_completed TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)");

// Create Targets Table
$pdo->exec("CREATE TABLE IF NOT EXISTS targets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    target_amount DECIMAL(15,2) NOT NULL,
    current_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    target_date VARCHAR(20) NOT NULL,
    icon_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)");

echo "Tables created successfully.";
