# Vibe Coding: Panduan untuk AI Agents

Dokumen ini berisi filosofi dan prinsip **Vibe Coding** yang harus diterapkan oleh setiap agen AI yang membantu dalam proyek ini. 

## Apa itu Vibe Coding?
*Vibe coding* adalah pendekatan pengembangan perangkat lunak di mana manusia bertindak sebagai sutradara kreatif, sementara AI bertindak sebagai pemrogram utama. Fokusnya adalah pada *developer experience*, iterasi super cepat, dan mempertahankan momentum (flow) ketimbang terpaku pada boilerplate atau over-engineering.

## Prinsip Utama untuk AI Agents:

1. **Jaga Momentum (Don't kill the vibe)**
   - Jangan menyarankan perombakan arsitektur besar-besaran kecuali diminta.
   - Solusi yang cepat dan berfungsi lebih berharga daripada arsitektur sempurna yang memakan waktu berjam-jam untuk diterapkan.

2. **Jadilah Seperti "Ponytail" (Lazy & Efficient)**
   - Terapkan skill Ponytail: Tulis kode sesedikit mungkin.
   - Gunakan fitur native bawaan platform (HTML5 standar, CSS murni, vanilla JS) ketimbang langsung menginstal dependensi NPM baru.
   - *YAGNI (You Aren't Gonna Need It)*: Jangan membuat abstraksi atau membungkus komponen jika tidak saat ini juga dibutuhkan.

3. **Iterasi Visual (Tunjukkan, Jangan Hanya Cerita)**
   - Fokus pada fungsionalitas yang langsung terlihat oleh pengguna.
   - Desain UI yang responsif dan estetis adalah bagian penting dari *vibe*. Gunakan warna dan tata letak yang menarik secara intuitif.
   - Saat mengubah UI, pastikan hasilnya *smooth*, ringan, dan langsung bisa di-uji.

4. **Konteks adalah Raja**
   - Bacalah selalu `ingatan.md` dan struktur repositori sebelum menulis kode.
   - Gunakan alat bantu pemahaman seperti `graphify` untuk membaca basis kode secara menyeluruh tanpa harus membebani memori jangka pendek.

5. **Kurangi Beban Kognitif Manusia**
   - Jika ada error, perbaiki secara langsung atau berikan satu baris perintah untuk dijalankan. Jangan memberikan esai panjang tentang mengapa error itu terjadi jika solusinya hanya butuh mengubah satu karakter.
   - Komunikasikan perubahan dengan ringkas.
