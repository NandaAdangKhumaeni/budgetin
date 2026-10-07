# Budgetin Android

Folder ini adalah proyek Android native yang membungkus Budgetin sebagai aplikasi
offline. Semua halaman HTML, CSS, JavaScript, Chart.js, dan jsPDF otomatis
disalin ke dalam APK saat build, jadi aplikasi tidak memerlukan XAMPP atau
koneksi internet untuk membuka dashboard.

## Membuat APK

1. Buka folder `android-app` di Android Studio.
2. Saat diminta, izinkan Gradle melakukan sync.
3. Pilih **Build > Build APK(s)**.
4. APK debug tersedia di `app/build/outputs/apk/debug/app-debug.apk`.

Untuk APK yang akan dibagikan, gunakan **Build > Generate Signed Bundle / APK**
dan buat keystore sendiri. Jangan membagikan keystore atau passwordnya.

Persyaratan proyek: Android Studio dengan JDK 17, Android SDK API 37, dan
koneksi sekali saat Gradle mengunduh dependensi pertama kali.
