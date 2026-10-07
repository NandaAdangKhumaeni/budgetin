<?php
/**
 * BUDGETIN - Financial API Core Helper
 * Phase 3A: MySQL Financial Data Foundation
 *
 * Provides session authentication, anti-CSRF validation for mutations,
 * user ownership assertions, input parsing, numeric sanitization, and error handling.
 */

declare(strict_types=1);

require_once __DIR__ . '/../auth/auth_helper.php';

/**
 * Enforce authentication and return the authenticated user record.
 * Halts execution with HTTP 401 if unauthenticated.
 */
function getAuthenticatedFinancialUser(PDO $pdo): array
{
    $user = getSessionUser($pdo);
    if (!$user || empty($user['id'])) {
        sendJsonResponse([
            'success' => false,
            'error' => 'UNAUTHENTICATED',
            'message' => 'Sesi tidak valid atau telah berakhir. Silakan login kembali.'
        ], 401);
    }

    return $user;
}

/**
 * Validate CSRF token on mutating requests (POST, PUT, PATCH, DELETE).
 * Halts execution with HTTP 403 if token is missing or invalid.
 */
function requireCsrfForMutation(string $userId, string $rawToken): void
{
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if (!in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
        return;
    }

    $providedToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_POST['csrf_token'] ?? null;
    if (!$providedToken) {
        $body = getJsonRequestBody();
        $providedToken = $body['csrf_token'] ?? null;
    }

    if (!validateCsrfToken($providedToken, $userId, $rawToken)) {
        sendJsonResponse([
            'success' => false,
            'error' => 'CSRF_VALIDATION_FAILED',
            'message' => 'Token CSRF tidak valid atau telah kadaluarsa.'
        ], 403);
    }
}

/**
 * Assert that a specific financial record belongs to the authenticated user.
 * Halts execution with HTTP 404 (anti-enumeration) if not found or belongs to another user.
 */
function assertEntityOwnership(PDO $pdo, string $table, $id, string $userId): array
{
    // Restrict table names to trusted list to prevent SQL injection
    $allowedTables = [
        'banks',
        'bills',
        'goals',
        'goal_deposits',
        'investments',
        'investment_transactions',
        'recurring_transactions',
        'transactions',
        'category_budgets'
    ];

    if (!in_array($table, $allowedTables, true)) {
        throw new InvalidArgumentException("Tabel tidak valid: $table");
    }

    $stmt = $pdo->prepare("SELECT * FROM `$table` WHERE (id = :id_exact OR legacy_id = :legacy_id) AND user_id = :user_id LIMIT 1");
    $stmt->execute([
        'id_exact' => is_numeric($id) ? (int)$id : 0,
        'legacy_id' => (string)$id,
        'user_id' => $userId
    ]);

    $entity = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$entity) {
        sendJsonResponse([
            'success' => false,
            'error' => 'NOT_FOUND',
            'message' => 'Data tidak ditemukan.'
        ], 404);
    }

    return $entity;
}

/**
 * Resolve an entity's MySQL numeric ID from either its MySQL ID or its legacy_id.
 */
function resolveEntityId(PDO $pdo, string $table, $idOrLegacy, string $userId): ?int
{
    if ($idOrLegacy === null || $idOrLegacy === '') {
        return null;
    }
    $allowedTables = ['banks', 'bills', 'goals', 'goal_deposits', 'investments', 'investment_transactions', 'recurring_transactions', 'transactions', 'category_budgets'];
    if (!in_array($table, $allowedTables, true)) {
        return null;
    }

    // 1. Prioritize legacy_id
    $stmt = $pdo->prepare("SELECT id FROM `$table` WHERE legacy_id = :legacy_id AND user_id = :user_id LIMIT 1");
    $stmt->execute([
        'legacy_id' => (string)$idOrLegacy,
        'user_id' => $userId
    ]);
    $res = $stmt->fetchColumn();
    if ($res !== false) {
        return (int)$res;
    }

    // 2. Fallback to numeric MySQL ID
    if (is_numeric($idOrLegacy)) {
        $stmt2 = $pdo->prepare("SELECT id FROM `$table` WHERE id = :id AND user_id = :user_id LIMIT 1");
        $stmt2->execute([
            'id' => (int)$idOrLegacy,
            'user_id' => $userId
        ]);
        $res2 = $stmt2->fetchColumn();
        if ($res2 !== false) {
            return (int)$res2;
        }
    }

    return null;
}


/**
 * Parse and validate decimal/monetary string.
 * Strictly rejects NaN, Inf, non-numeric values, or disallowed negative amounts.
 */
function parseDecimal($val, int $scale = 2, bool $allowNegative = false): string
{
    if ($val === null || $val === '') {
        throw new InvalidArgumentException("Nilai angka tidak boleh kosong.");
    }

    if (!is_numeric($val)) {
        throw new InvalidArgumentException("Nilai harus berupa angka valid.");
    }

    $floatVal = (float)$val;
    if (is_nan($floatVal) || is_infinite($floatVal)) {
        throw new InvalidArgumentException("Nilai angka tidak valid.");
    }

    if (!$allowNegative && $floatVal < 0) {
        throw new InvalidArgumentException("Nilai tidak boleh negatif.");
    }

    return number_format($floatVal, $scale, '.', '');
}

/**
 * Get pagination parameters from query string.
 */
function getPaginationParams(int $defaultLimit = 50, int $maxLimit = 2000): array
{
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : $defaultLimit;
    if ($limit < 1) $limit = $defaultLimit;
    if ($limit > $maxLimit) $limit = $maxLimit;

    $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
    if ($page < 1) $page = 1;

    $offset = ($page - 1) * $limit;

    return [
        'limit' => $limit,
        'page' => $page,
        'offset' => $offset
    ];
}

/**
 * Standardized success response with explicit database commit contract.
 */
function sendFinancialSuccess($data = null, int $status = 200, array $extra = []): void
{
    $payload = [
        'success' => true,
        'data' => $data
    ];

    // Explicitly guarantee database commit confirmation contract
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $isMutation = in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true);

    if ($isMutation && !isset($extra['database'])) {
        $recordId = null;
        if (is_array($data) && isset($data['id'])) {
            $recordId = $data['id'];
        }
        $payload['database'] = [
            'committed' => true,
            'mutation' => $method,
            'id' => $recordId
        ];
    }

    $payload = array_merge($payload, $extra);

    sendJsonResponse($payload, $status);
}

/**
 * Standardized error response.
 */
function sendFinancialError(string $code, string $message, int $status = 400): void
{
    sendJsonResponse([
        'success' => false,
        'error' => $code,
        'message' => $message
    ], $status);
}
