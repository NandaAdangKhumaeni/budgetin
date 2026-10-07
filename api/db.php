<?php
/**
 * BUDGETIN Database Connection Handler (PDO)
 * Phase 1: MySQL Foundation
 */

declare(strict_types=1);

// Ensure standardized Asia/Jakarta timezone matching MySQL server and local environment
date_default_timezone_set('Asia/Jakarta');

if (!function_exists('getDbConnection')) {
    /**
     * Get or initialize reusable PDO connection.
     *
     * @throws PDOException if connection fails
     * @return PDO
     */
    function getDbConnection(): PDO
    {
        static $pdo = null;

        if ($pdo instanceof PDO) {
            return $pdo;
        }

        // Environment-safe configuration with Laragon MySQL defaults
        $host = getenv('BUDGETIN_DB_HOST') ?: '127.0.0.1';
        $port = getenv('BUDGETIN_DB_PORT') ?: '3306';
        $dbname = getenv('BUDGETIN_DB_NAME') ?: 'budgetin_db';
        $user = getenv('BUDGETIN_DB_USER') ?: 'root';
        $pass = getenv('BUDGETIN_DB_PASS') !== false ? getenv('BUDGETIN_DB_PASS') : '';

        $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4";

        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci; SET time_zone = '+07:00';", 
            PDO::ATTR_PERSISTENT => false,
        ];

        try {
            $pdo = new PDO($dsn, $user, $pass, $options);
            return $pdo;
        } catch (PDOException $e) {
            // Log real error for debugging without leaking credentials to public output
            error_log('[BUDGETIN DB ERROR] Connection failed: ' . $e->getMessage());
            throw new PDOException('Database connection failed: ' . $e->getMessage(), (int)$e->getCode());
        }
    }
}

if (!function_exists('testDbConnection')) {
    /**
     * Quick health check test for database connection.
     *
     * @return array
     */
    function testDbConnection(): array
    {
        try {
            $pdo = getDbConnection();
            $stmt = $pdo->query("SELECT 1 AS alive, DATABASE() AS current_db, VERSION() AS mysql_version");
            $info = $stmt->fetch();
            
            $tablesStmt = $pdo->query("SHOW TABLES");
            $tables = $tablesStmt->fetchAll(PDO::FETCH_COLUMN);

            return [
                'status' => 'success',
                'database' => $info['current_db'] ?? 'unknown',
                'mysql_version' => $info['mysql_version'] ?? 'unknown',
                'tables_count' => count($tables),
                'tables' => $tables,
            ];
        } catch (Throwable $e) {
            return [
                'status' => 'error',
                'message' => $e->getMessage(),
            ];
        }
    }
}

// CLI or Direct Healthcheck invocation
if (php_sapi_name() === 'cli' && isset($argv[0]) && realpath($argv[0]) === __FILE__) {
    echo "Testing BUDGETIN Database Connection...\n";
    $result = testDbConnection();
    echo json_encode($result, JSON_PRETTY_PRINT) . "\n";
    exit($result['status'] === 'success' ? 0 : 1);
}
