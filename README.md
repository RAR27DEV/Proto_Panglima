# Sistem Informasi Keuangan & Inventaris (Toko Panglima)

Sistem pencatatan keuangan dan manajemen stok barang (SPA) yang dibangun khusus untuk operasional toko bangunan. Aplikasi ini mengintegrasikan pencatatan transaksi toko utama dengan manajemen rute pengiriman luar kota secara terpusat, memberikan laporan keuangan *real-time* yang akurat.

## 🌟 Fitur Utama

*   **Manajemen Multi-Rute:** Pencatatan terpisah dan detail untuk pengiriman luar kota (Bengkulu, Jambi, Riau, Medan) mencakup barang terjual, piutang, tagihan, serta pengeluaran operasional di perjalanan.
*   **Single-Page Application (SPA) Cepat:** Antarmuka dibangun 100% menggunakan Vanilla JavaScript (tanpa framework berat) yang memberikan pengalaman pengguna secepat kilat dengan sistem *routing* mandiri.
*   **Sistem Inventaris Otomatis:** Perhitungan sisa stok secara *real-time* berdasarkan akumulasi Barang Masuk dikurangi Barang Terjual, lengkap dengan indikator batas aman stok.
*   **Laporan Keuangan Dinamis:** Generator laporan laba/rugi bulanan otomatis dengan grafik visual dan rincian faktor penyumbang keuntungan/kerugian terbesar.
*   **Offline-Ready (Demo Mode):** Mekanisme *fallback* cerdas yang otomatis menggunakan `localStorage` browser jika koneksi ke backend/database terputus (sangat berguna untuk demonstrasi tanpa server).
*   **Fitur Cetak (Print):** Semua tabel data dikonfigurasi untuk siap cetak (*print-ready*), secara otomatis menghilangkan elemen antarmuka (tombol, sidebar) saat menekan Ctrl+P.

## 🛠️ Stack Teknologi & Arsitektur

Proyek ini sengaja didesain ringan, *maintainable*, dan optimal untuk di-deploy ke layanan *Shared Hosting* konvensional tanpa memerlukan *Node.js daemon* atau konfigurasi *build* yang rumit.

*   **Frontend:** HTML5, Vanilla CSS3 (Custom Design System), Vanilla JavaScript (ES6+).
*   **Backend API:** PHP 8.x (RESTful-like endpoints).
*   **Database:** MariaDB / MySQL (via PDO).

## 🔒 Keamanan (Security-First)

Mengingat sifat aplikasi yang mengelola data finansial, keamanan menjadi prioritas dalam arsitektur backend:

*   **SQL Injection Prevention:** Seluruh query ke database dieksekusi menggunakan PDO *Prepared Statements* (`EMULATE_PREPARES = false`).
*   **Password Hashing:** Sandi pengguna disimpan menggunakan algoritma **Bcrypt** (Cost 12), tidak pernah dalam *plain-text*.
*   **Anti-XSS (Cross-Site Scripting):** Implementasi sanitasi input ketat dan *escaping* khusus pada fungsi render HTML di JavaScript (`escapeHtml`).
*   **Proteksi CSRF & Sesi:** Menggunakan token Anti-CSRF pada setiap form submission, serta konfigurasi cookie sesi yang ketat (`HttpOnly`, `Secure`, `SameSite=Strict`).
*   **Brute-Force Mitigation:** Mekanisme penguncian akun (15 menit) setelah 5 kali percobaan *login* yang gagal berturut-turut, lengkap dengan penyeragaman waktu respons *server*.

## 🚀 Panduan Instalasi (Lokal / Development)

Proyek ini dapat langsung dijalankan di komputer lokal tanpa memerlukan server web berat (seperti XAMPP) berkat dukungan SQLite.

1.  **Clone Repository:**
    ```bash
    git clone https://github.com/USERNAME_ANDA/namarepoanda.git
    cd namarepoanda
    ```
2.  **Jalankan PHP Development Server:**
    Buka terminal di dalam folder proyek, lalu jalankan:
    ```bash
    php -S localhost:8000 -t .
    ```
3.  **Akses Aplikasi:**
    Buka `http://localhost:8000` di browser. Aplikasi akan menggunakan database SQLite (`data/tokopanglima.sqlite`) dan langsung siap digunakan.

*(Catatan: Untuk panduan instalasi ke Production/Shared Hosting menggunakan MariaDB, silakan rujuk ke internal dokumentasi).*

## 📸 Tangkapan Layar (Screenshots)

> 💡 **Tip untuk Portofolio:** Tambahkan 3-4 screenshot tampilan aplikasi di sini.
> Contoh:
> *   `![Dashboard](link-gambar-dashboard)`
> *   `![Laporan Keuangan](link-gambar-laporan)`
> *   `![Manajemen Rute](link-gambar-rute)`

---
*Dibuat untuk memecahkan masalah operasional nyata pada bisnis ritel skala menengah.*
