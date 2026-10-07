<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function respondJson(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function rejectError(string $provider, string $errorCode, string $message, array $extra = [], int $httpStatus = 200): void {
    respondJson(array_merge([
        'success' => false,
        'provider' => $provider,
        'errorCode' => $errorCode,
        'message' => $message
    ], $extra), $httpStatus);
}

// 1. Read input (Support both GET and POST JSON)
$input = [];
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $rawInput = file_get_contents('php://input');
    if (!empty($rawInput)) {
        $decoded = json_decode($rawInput, true);
        if (is_array($decoded)) {
            $input = $decoded;
        }
    }
}
if (empty($input)) {
    $input = $_GET;
}

$productId = trim((string)($input['productId'] ?? $input['id'] ?? ''));
$name = trim((string)($input['name'] ?? $input['productName'] ?? $input['asset'] ?? ''));
$isin = trim((string)($input['isin'] ?? ''));
$schemeCode = trim((string)($input['schemeCode'] ?? ''));
$manager = trim((string)($input['manager'] ?? ''));
$requestedProvider = strtolower(trim((string)($input['provider'] ?? 'auto')));

// Read backend configuration
$configFile = __DIR__ . '/config.php';
$config = is_file($configFile) ? (require $configFile) : [];
$timeout = max(3, min(15, (int)($config['timeout_seconds'] ?? 8)));

// 2. Validate product identifier
if ($productId === '' && $name === '' && $isin === '' && $schemeCode === '') {
    rejectError($requestedProvider, 'INVALID_IDENTIFIER', 'Identifier produk reksadana (productId, isin, schemeCode, atau nama produk) wajib diisi.');
}

// 3. Security: Provider Whitelist (Prevent SSRF / arbitrary proxy abuse)
$allowedProviders = ['auto', 'bareksa_public', 'ojk_official', 'custom_feed', 'sandbox', 'test', 'fallback'];
if (!in_array($requestedProvider, $allowedProviders, true)) {
    rejectError('security', 'INVALID_PROVIDER', 'Provider tidak dikenal atau tidak masuk dalam daftar whitelist yang diizinkan.');
}

// 4. Test / Sandbox Mode Handler
// Strictly used for deterministic testing & verification; never default in production
$isTestRequest = (
    $requestedProvider === 'sandbox' ||
    $requestedProvider === 'test' ||
    str_starts_with($productId, 'test') ||
    str_starts_with($schemeCode, 'TEST') ||
    !empty($input['isTest'])
);

if ($isTestRequest) {
    $testNav = isset($input['mockNav']) ? (float)$input['mockNav'] : 1900.0;
    $testDate = !empty($input['mockDate']) ? (string)$input['mockDate'] : date('Y-m-d');
    $currency = (string)($input['currency'] ?? 'IDR');

    // Validation checks for test simulator
    if ($testNav <= 0 || !is_finite($testNav)) {
        rejectError('sandbox', 'INVALID_NAV_VALUE', 'Nilai NAB harus lebih besar dari 0 dan berupa angka valid.');
    }
    if ($currency !== 'IDR') {
        rejectError('sandbox', 'UNSUPPORTED_CURRENCY', 'Mata uang tidak didukung. Budgetin hanya menerima IDR untuk reksadana.');
    }

    respondJson([
        'success' => true,
        'provider' => 'sandbox',
        'productName' => $name !== '' ? $name : ($productId !== '' ? $productId : 'Test Mutual Fund'),
        'productId' => $productId !== '' ? $productId : 'IDN-TEST-001',
        'isin' => $isin !== '' ? $isin : 'IDN000000001',
        'schemeCode' => $schemeCode !== '' ? $schemeCode : 'TEST_SCHEME',
        'nav' => $testNav,
        'navDate' => $testDate,
        'currency' => 'IDR',
        'sourceUrl' => 'https://sandbox.budgetin.test/nav',
        'fetchedAt' => date('c'),
        'confidence' => 'high'
    ]);
}

// 5. Bareksa Public Investigation Adapter
if ($requestedProvider === 'bareksa_public') {
    // Bareksa public download / data inspection
    // As confirmed by HTTP probing:
    // https://www.bareksa.com/id/mutualfund/download/reksadana requires member login
    // https://www.bareksa.com/id/data/reksadana only provides Investment Manager directory
    // In accordance with Section 4 and Critical Rule: No reverse engineering private mobile APIs
    rejectError(
        'bareksa_public',
        'AUTH_REQUIRED_OR_UNAVAILABLE',
        'Fitur unduh data Bareksa memerlukan login akun berbayar dan tidak menyediakan REST API publik terbuka tanpa otentikasi.',
        [
            'sourceUrl' => 'https://www.bareksa.com/id/mutualfund/download/reksadana',
            'requiresAuth' => true
        ]
    );
}

// 6. OJK / KSEI Official Investigation Adapter
if ($requestedProvider === 'ojk_official') {
    rejectError(
        'ojk_official',
        'NO_PUBLIC_REST_API',
        'OJK / KSEI tidak menyediakan REST API publik gratis untuk pengembang pihak ketiga. Data resmi didistribusikan melalui sistem tertutup S-INVEST (APERD/Bank Kustodian) atau vendor data berbayar.',
        [
            'sourceUrl' => 'https://data.ojk.go.id/',
            'requiresLicense' => true
        ]
    );
}

// 7. Custom Feed Provider (Configured in config.php)
$customFeedUrl = trim((string)($config['mutual_fund_feed_url'] ?? ''));
if (($requestedProvider === 'custom_feed' || $requestedProvider === 'auto') && $customFeedUrl !== '') {
    if (!filter_var($customFeedUrl, FILTER_VALIDATE_URL) || !str_starts_with(strtolower($customFeedUrl), 'https://')) {
        rejectError('custom_feed', 'INSECURE_FEED_URL', 'URL feed eksternal harus menggunakan protokol HTTPS yang aman.');
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "User-Agent: Budgetin/1.2 (Mutual Fund Real NAV Fetcher)\r\nAccept: application/json\r\n",
            'timeout' => $timeout,
            'ignore_errors' => true
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true
        ]
    ]);

    $queryUrl = $customFeedUrl . (str_contains($customFeedUrl, '?') ? '&' : '?') . http_build_query([
        'productId' => $productId,
        'name' => $name,
        'isin' => $isin,
        'schemeCode' => $schemeCode,
        'manager' => $manager
    ]);

    $raw = @file_get_contents($queryUrl, false, $context);
    if ($raw !== false && strlen($raw) > 0) {
        $feedData = json_decode($raw, true);
        if (is_array($feedData) && !empty($feedData['success']) && isset($feedData['nav'])) {
            $parsedNav = (float)$feedData['nav'];
            $parsedDate = (string)($feedData['navDate'] ?? $feedData['date'] ?? date('Y-m-d'));
            $parsedCurrency = (string)($feedData['currency'] ?? 'IDR');

            // Validate response fields
            if ($parsedNav <= 0 || !is_finite($parsedNav)) {
                rejectError('custom_feed', 'INVALID_NAV_VALUE', 'Nilai NAB dari provider tidak valid.');
            }
            if ($parsedCurrency !== 'IDR') {
                rejectError('custom_feed', 'UNSUPPORTED_CURRENCY', 'Mata uang dari provider bukan IDR.');
            }

            respondJson([
                'success' => true,
                'provider' => (string)($feedData['provider'] ?? 'custom_feed'),
                'productName' => (string)($feedData['productName'] ?? $feedData['name'] ?? $name),
                'productId' => (string)($feedData['productId'] ?? $productId),
                'nav' => $parsedNav,
                'navDate' => $parsedDate,
                'currency' => 'IDR',
                'sourceUrl' => (string)($feedData['sourceUrl'] ?? $customFeedUrl),
                'fetchedAt' => date('c'),
                'confidence' => (string)($feedData['confidence'] ?? 'high')
            ]);
        }
    }
}

// 8. Default Legitimate Fallback
// In strict accordance with Section 19 of prompt:
// "Jika tidak ditemukan public NAB API/feed yang legitimate: JANGAN MEMAKSA.
// Lebih baik UI mengatakan: 🟡 Sumber NAB otomatis publik belum tersedia. Portofolio tetap menggunakan NAB terakhir."
rejectError(
    'fallback',
    'NAV_UNAVAILABLE',
    'Sumber data NAB publik resmi belum tersedia untuk produk ini. Portofolio tetap aman menggunakan data NAB terakhir.',
    [
        'productId' => $productId,
        'productName' => $name,
        'confidence' => 'none'
    ]
);
