# Market Price API (XAMPP)

1. Copy `config.example.php` to `config.php` in this folder.
2. Fill `alpha_vantage_key` with your own API key. `config.php` stays only on the local XAMPP server and is never loaded by the browser.
3. Start Apache in XAMPP, then open Budgetin through `http://localhost/BUDGETIN/` or its LAN URL.

The frontend calls `POST /BUDGETIN/api/market-price.php` with stock symbols. The default adapter converts an IDX symbol such as `ANTM` to `ANTM.JK` and returns a normalized response:

```json
{"success":true,"quotes":[{"available":true,"symbol":"ANTM.JK","price":1100,"currency":"IDR","updatedAt":"2026-09-08T03:15:00Z","provider":"alphavantage"}]}
```

If a provider does not return a quote, the endpoint responds with `available:false`; the app keeps the last cache/current purchase price and never replaces it with zero. The adapter can be replaced inside `market-price.php` without changing frontend code.
