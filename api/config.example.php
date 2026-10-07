<?php
// Konfigurasi Terpusat Budgetin (Contoh untuk Production/Development)
// Salin file ini menjadi config.php dan isi dengan credential asli Anda.
// JANGAN PERNAH MENGUPLOAD config.php ke GitHub.

return [
    // Provider Harga Pasar & Investasi
    'provider' => getenv('BUDGETIN_INVESTMENT_PROVIDER') ?: 'auto',
    'alpha_vantage_key' => getenv('BUDGETIN_ALPHAVANTAGE_KEY') ?: 'YOUR_API_KEY_HERE',
    'gemini_api_key' => getenv('GEMINI_API_KEY') ?: 'YOUR_GEMINI_KEY_HERE',
    'timeout_seconds' => 10,

    // Konfigurasi Notifikasi Telegram Bot
    'telegram' => [
        'bot_token' => getenv('TELEGRAM_BOT_TOKEN') ?: 'YOUR_TELEGRAM_BOT_TOKEN_HERE',
        'chat_id' => getenv('TELEGRAM_CHAT_ID') ?: 'YOUR_TELEGRAM_CHAT_ID_HERE',
        'enabled' => true,
    ],
];
