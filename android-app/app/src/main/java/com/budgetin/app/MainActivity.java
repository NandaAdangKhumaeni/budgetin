package com.budgetin.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.Manifest;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.widget.Toast;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final int REQUEST_RECEIPT_IMAGE = 410;
    private static final int REQUEST_RECEIPT_CAMERA = 411;
    private static final int REQUEST_CAMERA_PERMISSION = 412;
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        applySystemBarTheme(false);

        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setSupportZoom(false);
        webView.getSettings().setBuiltInZoomControls(false);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new ThemeBridge(), "BudgetinNative");

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(
                WebView view,
                WebResourceRequest request
            ) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        setContentView(webView);
        webView.loadUrl("https://appassets.androidplatform.net/assets/budgetin/login.html");
    }

    private void applySystemBarTheme(boolean dark) {
        getWindow().setStatusBarColor(dark ? Color.rgb(11, 18, 32) : Color.WHITE);
        getWindow().setNavigationBarColor(dark ? Color.rgb(18, 28, 45) : Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(dark
            ? 0
            : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
    }

    private class ThemeBridge {
        @JavascriptInterface
        public void setDark(final boolean dark) {
            runOnUiThread(() -> applySystemBarTheme(dark));
        }

        @JavascriptInterface
        public void scanReceipt() {
            runOnUiThread(() -> {
                new AlertDialog.Builder(MainActivity.this)
                    .setTitle("Scan Bukti Transaksi")
                    .setItems(new String[] { "Ambil Foto", "Pilih dari Galeri" }, (dialog, which) -> {
                        if (which == 0) {
                            openReceiptCamera();
                        } else {
                            openReceiptGallery();
                        }
                    })
                    .setNegativeButton("Batal", null)
                    .show();
            });
        }

        private void openReceiptGallery() {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("image/*");
            startActivityForResult(intent, REQUEST_RECEIPT_IMAGE);
        }

        private void openReceiptCamera() {
            if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[] { Manifest.permission.CAMERA }, REQUEST_CAMERA_PERMISSION);
                return;
            }

            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            if (intent.resolveActivity(getPackageManager()) == null) {
                sendReceiptResult("receiveReceiptError", "Kamera tidak dapat digunakan.");
                return;
            }
            startActivityForResult(intent, REQUEST_RECEIPT_CAMERA);
        }

        @JavascriptInterface
        public void savePdf(String filename, String dataUri) {
            try {
                int separator = dataUri.indexOf(',');
                if (separator < 0) throw new IllegalArgumentException("PDF tidak valid");

                byte[] pdfBytes = Base64.decode(dataUri.substring(separator + 1), Base64.DEFAULT);
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
                values.put(MediaStore.Downloads.RELATIVE_PATH,
                    Environment.DIRECTORY_DOWNLOADS + "/Budgetin");

                android.net.Uri uri = getContentResolver().insert(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("Folder Download tidak tersedia");

                try (OutputStream stream = getContentResolver().openOutputStream(uri)) {
                    if (stream == null) throw new IllegalStateException("File tidak dapat dibuat");
                    stream.write(pdfBytes);
                }

                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                    "Laporan tersimpan di Download/Budgetin", Toast.LENGTH_LONG).show());
            } catch (Exception error) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                    "Gagal menyimpan laporan PDF", Toast.LENGTH_LONG).show());
            }
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if ((requestCode != REQUEST_RECEIPT_IMAGE && requestCode != REQUEST_RECEIPT_CAMERA) ||
            resultCode != RESULT_OK || data == null) {
            return;
        }

        try {
            InputImage image;
            if (requestCode == REQUEST_RECEIPT_CAMERA) {
                Bitmap photo = data.getExtras() == null ? null
                    : (Bitmap) data.getExtras().get("data");
                if (photo == null) {
                    sendReceiptResult("receiveReceiptError", "Foto kamera tidak dapat digunakan.");
                    return;
                }
                image = InputImage.fromBitmap(photo, 0);
            } else {
                if (data.getData() == null) return;
                image = InputImage.fromFilePath(this, data.getData());
            }
            TextRecognizer recognizer = TextRecognition.getClient(
                TextRecognizerOptions.DEFAULT_OPTIONS
            );

            recognizer.process(image)
                .addOnSuccessListener(result -> {
                    sendReceiptResult("receiveReceiptText", result.getText());
                    recognizer.close();
                })
                .addOnFailureListener(error -> {
                    sendReceiptResult("receiveReceiptError", "Struk tidak dapat dibaca. Coba gunakan foto yang lebih jelas.");
                    recognizer.close();
                });
        } catch (Exception error) {
            sendReceiptResult("receiveReceiptError", "Gambar tidak dapat dibuka.");
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_CAMERA_PERMISSION) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                if (intent.resolveActivity(getPackageManager()) == null) {
                    sendReceiptResult("receiveReceiptError", "Kamera tidak dapat digunakan.");
                    return;
                }
                startActivityForResult(intent, REQUEST_RECEIPT_CAMERA);
            } else {
                sendReceiptResult("receiveReceiptError", "Izin kamera diperlukan untuk mengambil foto bukti.");
            }
        }
    }

    private void sendReceiptResult(String functionName, String message) {
        if (webView == null) return;

        String script = "window." + functionName + "(" + JSONObject.quote(message) + ");";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
