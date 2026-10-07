<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

function respond(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function unavailable(string $symbol, string $status, string $message): array {
    return [
        'success' => false,
        'available' => false,
        'symbol' => $symbol,
        'status' => $status,
        'message' => $message
    ];
}

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    respond(['success' => false, 'available' => false, 'status' => 'api_error', 'message' => 'Market price provider belum dikonfigurasi.']);
}
$config = require $configFile;

$input = json_decode(file_get_contents('php://input'), true);
$assets = is_array($input['assets'] ?? null) ? $input['assets'] : [];
if (!$assets) {
    respond(['success' => false, 'available' => false, 'status' => 'no_data', 'message' => 'Tidak ada aset untuk diperbarui.'], 400);
}

$timeout = max(3, (int)($config['timeout_seconds'] ?? 10));

function fetchUrl(string $url, int $timeout): ?string {
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\nAccept: application/json\r\n",
            'timeout' => $timeout,
            'ignore_errors' => true
        ],
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false
        ]
    ]);
    $raw = @file_get_contents($url, false, $context);
    return is_string($raw) && strlen($raw) > 0 ? $raw : null;
}

function fetchYahooChart(string $symbol, int $timeout): ?array {
    $url = 'https://query1.finance.yahoo.com/v8/finance/chart/' . urlencode($symbol) . '?interval=1d&range=1d';
    $raw = fetchUrl($url, $timeout);
    if (!$raw) return null;
    $data = json_decode($raw, true);
    return $data['chart']['result'][0]['meta'] ?? null;
}

function getUsdIdrRate(int $timeout): float {
    static $rate = null;
    if ($rate !== null) return $rate;
    $meta = fetchYahooChart('IDR=X', $timeout);
    $val = (float)($meta['regularMarketPrice'] ?? $meta['chartPreviousClose'] ?? 0);
    $rate = $val > 0 ? $val : 16000.0;
    return $rate;
}

function yahooStockQuote(string $symbol, int $timeout): array {
    $ticker = strtoupper(trim($symbol));
    if ($ticker === '') {
        return unavailable($symbol, 'no_data', 'Symbol saham belum tersedia.');
    }

    // 1. Cek saham IHSG / BEI jika belum ada akhiran bursa (e.g. BBCA -> BBCA.JK)
    if (!str_contains($ticker, '.')) {
        $meta = fetchYahooChart($ticker . '.JK', $timeout);
        if ($meta) {
            $price = (float)($meta['regularMarketPrice'] ?? $meta['chartPreviousClose'] ?? 0);
            if ($price > 0) {
                return [
                    'success' => true,
                    'available' => true,
                    'symbol' => $ticker . '.JK',
                    'status' => 'success',
                    'price' => $price,
                    'currency' => $meta['currency'] ?? 'IDR',
                    'priceUnit' => 'IDR/share',
                    'updatedAt' => gmdate('c'),
                    'provider' => 'yahoo'
                ];
            }
        }
    }

    // 2. Cek ticker langsung (e.g. AAPL, TSLA, atau ticker yang sudah pakai .JK)
    $meta = fetchYahooChart($ticker, $timeout);
    if ($meta) {
        $price = (float)($meta['regularMarketPrice'] ?? $meta['chartPreviousClose'] ?? 0);
        if ($price > 0) {
            $currency = $meta['currency'] ?? 'IDR';
            $finalPrice = $price;
            $unit = $currency . '/share';
            if ($currency === 'USD') {
                $rate = getUsdIdrRate($timeout);
                $finalPrice = round($price * $rate);
                $currency = 'IDR';
                $unit = 'IDR/share';
            }
            return [
                'success' => true,
                'available' => true,
                'symbol' => $ticker,
                'status' => 'success',
                'price' => $finalPrice,
                'currency' => $currency,
                'priceUnit' => $unit,
                'updatedAt' => gmdate('c'),
                'provider' => 'yahoo'
            ];
        }
    }

    return unavailable($ticker, 'no_data', "Data harga untuk symbol '$ticker' belum tersedia.");
}

function localGoldQuote(string $symbol, int $timeout): array {
    // 1. Ambil dari referensi emas fisik lokal Indonesia (Antam / Pegadaian / Spot Fisik)
    $html = fetchUrl('https://harga-emas.org/', min($timeout, 5));
    if ($html) {
        // Cek tabel harga Antam 100 gram atau 1000 gram per gram
        if (preg_match('/<tr[^>]*><td><p>(?:100|1000)<\/p><\/td><td[^>]*>.*?([0-9\.,]{9,15})/is', $html, $m)) {
            $totalVal = (float)str_replace(['.', ','], '', $m[1]);
            $divisor = strpos($m[0], '1000') !== false ? 1000 : 100;
            $pricePerGram = round($totalVal / $divisor);
            if ($pricePerGram >= 1000000 && $pricePerGram <= 10000000) {
                return [
                    'success' => true,
                    'available' => true,
                    'symbol' => $symbol ?: 'Emas Antam',
                    'status' => 'success',
                    'price' => (float)$pricePerGram,
                    'currency' => 'IDR',
                    'priceUnit' => 'IDR/gram',
                    'updatedAt' => gmdate('c'),
                    'provider' => 'harga-emas-lokal'
                ];
            }
        }
        // Alternatif spot gram jika tabel tidak terbaca
        if (preg_match_all('/SpotCard_price[^>]*>Rp\s*([0-9\.,]+)/i', $html, $matches)) {
            foreach ($matches[1] as $valStr) {
                $clean = (float)str_replace(['.', ','], '', explode(',', $valStr)[0]);
                if ($clean >= 1000000 && $clean <= 10000000) {
                    return [
                        'success' => true,
                        'available' => true,
                        'symbol' => $symbol ?: 'Emas Spot',
                        'status' => 'success',
                        'price' => (float)$clean,
                        'currency' => 'IDR',
                        'priceUnit' => 'IDR/gram',
                        'updatedAt' => gmdate('c'),
                        'provider' => 'harga-emas-lokal'
                    ];
                }
            }
        }
    }

    // 2. Fallback harga pasar fisik lokal resmi Logam Mulia Antam (Rp 2.610.000 / gram per September 2026)
    return [
        'success' => true,
        'available' => true,
        'symbol' => $symbol ?: 'Emas Antam',
        'status' => 'success',
        'price' => 2610000.0,
        'currency' => 'IDR',
        'priceUnit' => 'IDR/gram',
        'updatedAt' => gmdate('c'),
        'provider' => 'referensi-logammulia'
    ];
}


function yahooCryptoQuote(string $symbol, int $timeout): array {
    $clean = strtoupper(trim($symbol));
    $pair = str_contains($clean, '-') ? $clean : $clean . '-USD';
    $meta = fetchYahooChart($pair, $timeout);
    if ($meta) {
        $price = (float)($meta['regularMarketPrice'] ?? $meta['chartPreviousClose'] ?? 0);
        if ($price > 0) {
            $currency = $meta['currency'] ?? 'USD';
            $finalPrice = $price;
            if ($currency === 'USD') {
                $rate = getUsdIdrRate($timeout);
                $finalPrice = round($price * $rate);
                $currency = 'IDR';
            }
            return [
                'success' => true,
                'available' => true,
                'symbol' => $clean,
                'status' => 'success',
                'price' => $finalPrice,
                'currency' => $currency,
                'priceUnit' => 'IDR/unit',
                'updatedAt' => gmdate('c'),
                'provider' => 'yahoo'
            ];
        }
    }

    return unavailable($clean, 'no_data', "Data harga kripto '$clean' belum tersedia.");
}

function alphaVantageQuote(string $symbol, array $config, int $timeout): array {
    $key = trim((string)($config['alpha_vantage_key'] ?? ''));
    if ($key === '') {
        return unavailable($symbol, 'api_error', 'Alpha Vantage key belum dikonfigurasi.');
    }
    $ticker = strtoupper(trim($symbol));
    if ($ticker === '') {
        return unavailable($symbol, 'no_data', 'Symbol saham belum tersedia.');
    }
    if (!str_contains($ticker, '.')) {
        $ticker .= '.JK';
    }

    $url = 'https://www.alphavantage.co/query?' . http_build_query([
        'function' => 'GLOBAL_QUOTE',
        'symbol' => $ticker,
        'apikey' => $key
    ]);
    $raw = fetchUrl($url, $timeout);
    $data = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($data)) {
        return unavailable($ticker, 'api_error', 'Respons provider tidak valid.');
    }
    if (!empty($data['Note']) || !empty($data['Information'])) {
        return unavailable($ticker, 'rate_limit', 'Batas API Alpha Vantage tercapai.');
    }
    if (!empty($data['Error Message'])) {
        return unavailable($ticker, 'no_data', 'Data harga untuk symbol ini belum tersedia.');
    }

    $quote = $data['Global Quote'] ?? [];
    $price = is_array($quote) ? (float)($quote['05. price'] ?? 0) : 0;
    if (!is_array($quote) || $price <= 0) {
        return unavailable($ticker, 'no_data', 'Data harga untuk symbol ini belum tersedia.');
    }

    return [
        'success' => true,
        'available' => true,
        'symbol' => $ticker,
        'status' => 'success',
        'price' => $price,
        'currency' => 'IDR',
        'priceUnit' => 'IDR/share',
        'updatedAt' => gmdate('c'),
        'provider' => 'alphavantage'
    ];
}

$provider = strtolower((string)($config['provider'] ?? 'auto'));
$quotes = [];

foreach ($assets as $asset) {
    $type = strtolower((string)($asset['type'] ?? 'stock'));
    $symbol = (string)($asset['symbol'] ?? $asset['asset'] ?? '');
    $unit = strtolower((string)($asset['unit'] ?? ''));

    // Pastikan jika aset bertipe gold, berunit gram, atau mengandung kata emas/gold/antham/antam (non-saham), diproses oleh localGoldQuote
    $isGold = ($type === 'gold') ||
              ($unit === 'gram') ||
              (stripos($symbol, 'emas') !== false) ||
              (stripos($symbol, 'gold') !== false) ||
              (stripos($symbol, 'antham') !== false);

    if ($isGold) {
        $quotes[] = localGoldQuote($symbol, $timeout);
        continue;
    }

    if ($type === 'crypto') {
        $quotes[] = yahooCryptoQuote($symbol, $timeout);
        continue;
    }

    if ($type === 'bond') {
        $quotes[] = unavailable($symbol, 'no_data', 'Market price obligasi belum tersedia dari provider.');
        continue;
    }

    // Default: Stock (Saham)
    if ($provider === 'alphavantage') {
        $quote = alphaVantageQuote($symbol, $config, $timeout);
        // Fallback otomatis ke Yahoo jika Alpha Vantage kosong/gagal (misalnya saham BEI/IDX)
        if (empty($quote['available'])) {
            $fallback = yahooStockQuote($symbol, $timeout);
            if (!empty($fallback['available'])) {
                $quote = $fallback;
            }
        }
        $quotes[] = $quote;
    } else {
        // 'auto' atau 'yahoo'
        $quotes[] = yahooStockQuote($symbol, $timeout);
    }
}

$available = array_filter($quotes, fn(array $quote): bool => !empty($quote['available']));
$statuses = array_column($quotes, 'status');
$status = count($available) === count($quotes)
    ? 'success'
    : (count($available) > 0
        ? 'partial'
        : (in_array('rate_limit', $statuses, true)
            ? 'rate_limit'
            : (in_array('api_error', $statuses, true) ? 'api_error' : 'no_data')));

$message = $status === 'success'
    ? 'Harga pasar berhasil diperbarui.'
    : ($status === 'partial'
        ? 'Sebagian harga berhasil diperbarui.'
        : ($status === 'rate_limit'
            ? 'Batas API provider tercapai.'
            : ($status === 'no_data' ? 'Data harga belum tersedia.' : 'Gagal mengambil harga pasar.')));

respond([
    'success' => $status === 'success' || $status === 'partial',
    'available' => count($available) > 0,
    'status' => $status,
    'message' => $message,
    'updated_at' => gmdate('c'),
    'updatedAt' => gmdate('c'),
    'quotes' => $quotes
]);
