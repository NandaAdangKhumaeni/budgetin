<?php
/**
 * Budgetin Gemini API Proxy
 * Mengambil base64 image dan prompt dari frontend dan memanggil Google Gemini REST API.
 */
declare(strict_types=1);

require_once __DIR__ . '/../auth/auth_helper.php';
require_once __DIR__ . '/../db.php';

header('Content-Type: application/json');

// Handle CORS OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$user = checkAuthOrExit();
$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['base64Data']) || !isset($input['mimeType']) || !isset($input['prompt'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing data']);
    exit;
}

$configFile = __DIR__ . '/../config.php';
$config = file_exists($configFile) ? (require $configFile) : [];
$geminiApiKey = $config['gemini_api_key'] ?? getenv('GEMINI_API_KEY');

if (empty($geminiApiKey)) {
    http_response_code(500);
    echo json_encode(['error' => 'Gemini API Key is not configured on the server.']);
    exit;
}

$base64Data = $input['base64Data'];
$mimeType = $input['mimeType'];
$promptText = $input['prompt'];

$url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" . $geminiApiKey;

$payload = [
    "contents" => [
        [
            "role" => "user",
            "parts" => [
                [
                    "inlineData" => [
                        "data" => $base64Data,
                        "mimeType" => $mimeType
                    ]
                ],
                [
                    "text" => $promptText
                ]
            ]
        ]
    ],
    "generationConfig" => [
        "temperature" => 0.1,
        "responseMimeType" => "application/json"
    ]
];

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json'
]);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(500);
    echo json_encode(['error' => 'Curl Error: ' . $curlError]);
    exit;
}

if ($httpCode !== 200) {
    http_response_code($httpCode);
    $decoded = json_decode($response, true);
    echo json_encode(['error' => 'Gemini API Error', 'details' => $decoded]);
    exit;
}

$responseData = json_decode($response, true);
$extractedText = $responseData['candidates'][0]['content']['parts'][0]['text'] ?? '[]';

// Clean the response from markdown block if any
$extractedText = preg_replace('/^```json\s*/m', '', $extractedText);
$extractedText = preg_replace('/```$/m', '', $extractedText);
$extractedText = trim($extractedText);

// Validate it is JSON
$parsed = json_decode($extractedText, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(500);
    echo json_encode(['error' => 'Invalid JSON returned from Gemini']);
    exit;
}

echo json_encode(['result' => $parsed]);
