# Implementation Plan — TASK #11.2 BUDGETIN BILLING UI

Membangun UI halaman "Tagihan" (`bill.html`) berbasis `window.BudgetinBills`, mengintegrasikan navigasi menu di sidebar seluruh halaman, menampilkan summary cards, filter, daftar tagihan interaktif dengan countdown, modal tambah & edit, penanganan aksi pelunasan via `BudgetinBills.markAsPaid()`, empty state, dan pengujian responsif serta dark mode.

## Proposed Changes

### 1. Navigation & Sidebar Integration
- Update sidebar di seluruh halaman:
  - [index.html](file:///c:/xampp/htdocs/BUDGETIN/index.html)
  - [transaction.html](file:///c:/xampp/htdocs/BUDGETIN/transaction.html)
  - [target.html](file:///c:/xampp/htdocs/BUDGETIN/target.html)
  - [bank.html](file:///c:/xampp/htdocs/BUDGETIN/bank.html)
  - [investment.html](file:///c:/xampp/htdocs/BUDGETIN/investment.html)
  - [report.html](file:///c:/xampp/htdocs/BUDGETIN/report.html)
- Menambahkan item menu `Tagihan` dengan icon `🧾`, subtitle `Pengingat & rutin`, tooltip `data-tooltip="Tagihan"`.

### 2. Buat Halaman Baru `bill.html`
- Memanfaatkan arsitektur layout Budgetin (`.app`, `.sidebar`, `.page-header`, `main`, `.bottom-nav`).
- Header konsisten dengan hamburger toggle `☰`, greeting `Pengingat Pembayaran 🧾`, judul `Tagihan`, theme toggle `☀/☾`, dan profile.
- **Top Actions**: Tombol "+ Tambah Tagihan".
- **Summary Cards**:
  - Total Tagihan Bulan Ini (Rp)
  - Belum Dibayar (Rp + counter)
  - Sudah Dibayar (Rp + counter)
  - Terlambat (Rp + counter)
  - Data bersumber dari `window.BudgetinBills.calculateMonthlyTotal()`.
- **Filter Tabs**:
  - Semua
  - Belum Dibayar (`unpaid`)
  - Jatuh Tempo (`upcoming`)
  - Terlambat (`overdue`)
  - Lunas (`paid`)
  - Filter kategori dropdown dinamis.
- **Daftar Tagihan (Bill Cards & List)**:
  - Nama, Kategori, Nominal (Rupiah), Jatuh Tempo (tanggal lokal aman).
  - Countdown dinamis: "Hari ini", "Besok", "X hari lagi", atau "Terlambat X hari".
  - Status Badge:
    - 🟢 Lunas (`badge-success`)
    - 🟡 Belum Dibayar (`badge-warning`)
    - 🔴 Terlambat (`badge-danger`)
  - Tombol Aksi:
    - Bayar (memanggil `window.BudgetinBills.markAsPaid()`)
    - Edit (membuka modal edit dengan `window.BudgetinBills.update()`)
    - Hapus (konfirmasi lalu panggil `window.BudgetinBills.remove()`)
- **Empty State**:
  - Ilustrasi & teks: "Belum ada tagihan", "Tambahkan tagihan rutin agar Budgetin bisa membantu mengingatkan pembayaran.", tombol "+ Tambah Tagihan".
- **Modal Form Tambah & Edit Tagihan**:
  - Field: Nama Tagihan, Kategori, Nominal, Jatuh Tempo, Rekening (dinamis dari `budgetin_banks`), Frekuensi (Sekali, Bulanan, Tahunan), Catatan.
  - Validasi: nama wajib, nominal > 0, tanggal valid.
  - Terkoneksi ke `BudgetinBills.add()` dan `BudgetinBills.update()`.

### 3. Styling & Dark Mode Optimization
- Tambahkan CSS pendukung di [style.css](file:///c:/xampp/htdocs/BUDGETIN/style.css) atau styling terstandar untuk billing cards, countdown badges, status tags, dan responsive layout (320px hingga desktop 1366px+).
- Pastikan teks, kontras, dan input terbaca jelas di Light Mode dan Dark Mode.

## Verification Plan

### Automated Tests
1. **Unit & Integration Test Suite (`test_bill_ui.html`)**:
   - Validasi loading halaman `bill.html` tanpa console error.
   - Validasi rendering summary cards dengan angka yang tepat dari `calculateMonthlyTotal()`.
   - Validasi rendering list tagihan dengan countdown dan status badge.
   - Validasi interaksi Tambah Tagihan via modal -> storage bertambah -> UI ter-render ulang.
   - Validasi Edit Tagihan -> data terupdate.
   - Validasi Hapus Tagihan -> item terhapus.
   - Validasi Pelunasan ("Bayar") -> status berubah jadi Lunas, saldo rekening terpotong dan transaksi tercatat.
   - Validasi Filter (Semua, Belum Dibayar, Terlambat, Lunas, Kategori).
   - Validasi Empty state saat data kosong.
   - Validasi responsive layout (320px, 375px, 390px, 430px, 768px, 1024px, 1366px) tanpa horizontal overflow.
   - Validasi kontras di Dark Mode (`html[data-theme="dark"]`).
2. **Regression Test Suite**:
   - `test_bond.html` (38/38 passed).
   - `test_bills.html` (38/38 passed).
