<?php
// D:\laragon\www\BUDGETIN\api\telegram.php

function sendTelegramMessage($text, $chatId = null) {
    $botToken = '8539028083:AAGUAroMeIwUtOzXkUpsQmeqnZdZj_npLjo';
    if (!$chatId) {
        $chatId = '1157084096'; // default
    }

    if (empty($botToken)) {
        return false;
    }

    $url = "https://api.telegram.org/bot{$botToken}/sendMessage";
    $data = [
        'chat_id' => $chatId,
        'text' => $text,
        'parse_mode' => 'HTML'
    ];

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data));
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); 
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);

    $result = curl_exec($ch);
    curl_close($ch);

    return $result;
}
