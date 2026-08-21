# Panduan Pasang di Hosting (Rumahweb / cPanel)

Aplikasi ini sekarang berjalan di atas **PHP + MariaDB**, cocok untuk shared hosting cPanel seperti Rumahweb.

---

## Langkah pemasangan

### 1. Buat database
cPanel → **MySQL Databases**
- Buat database baru, misal `namauser_tokopanglima`
- Buat user database + sandi yang kuat
- Tambahkan user itu ke database dengan hak **ALL PRIVILEGES**
- Catat: nama database, nama user, sandi

### 2. Buat tabel
cPanel → **phpMyAdmin** → pilih database tadi → tab **Import** → unggah file `sql/schema.sql` → **Go**

### 3. Unggah file
cPanel → **File Manager** → masuk ke `public_html` → unggah semua file **kecuali**:
- `sql/` (tidak perlu ikut, sudah diimpor)
- `stitch_simple_markdown_ui/` (bahan desain saja)
- `DOKUMENTASI-FITUR.md`, `PANDUAN-HOSTING.md`

### 4. Isi konfigurasi
- Ganti nama `api/config.example.php` menjadi `api/config.php`
- Buka dan isi `db_name`, `db_user`, `db_pass` sesuai langkah 1
- Pastikan `'force_https' => true`

### 5. Aktifkan SSL
cPanel → **SSL/TLS Status** → pastikan domain punya sertifikat (Rumahweb menyediakan Let's Encrypt gratis).

### 6. Buat akun login
- Buka `https://domain-anda/setup.php`
- Tentukan username & sandi sendiri (minimal 10 karakter)
- **Setelah akun jadi, HAPUS file `setup.php`** dari File Manager

### 7. Selesai
Buka `https://domain-anda/` → akan diarahkan ke halaman login.

---

## Keamanan yang sudah diterapkan

| Ancaman | Penanganan |
|---|---|
| **SQL injection** | Semua query pakai PDO *prepared statement* dengan `EMULATE_PREPARES = false`, jadi data tidak pernah digabung langsung ke perintah SQL |
| **Sandi bocor** | Disimpan sebagai hash **bcrypt cost 12**, tidak pernah sebagai teks biasa. Tidak ada sandi bawaan di dalam file |
| **XSS (skrip disisipkan lewat isian)** | Semua data pengguna di-escape sebelum masuk HTML. Sudah diuji: tag `<script>` dan `<img onerror>` tampil sebagai teks, tidak dieksekusi |
| **CSRF (perintah dari situs lain)** | Token CSRF wajib di setiap penyimpanan + cookie `SameSite=Strict` |
| **Pencurian sesi** | Cookie `HttpOnly` (tak terbaca JavaScript), `Secure` (hanya via HTTPS), ID sesi diperbarui saat login |
| **Tebak sandi berulang** | Akun terkunci 15 menit setelah 5 percobaan gagal + jeda 0,3 detik tiap percobaan |
| **Menebak username yang valid** | Pesan error selalu sama, dan waktu respons disamakan lewat hash tiruan |
| **Sesi menganggur** | Logout otomatis setelah 8 jam tidak aktif |
| **Clickjacking** | `X-Frame-Options: DENY` + `frame-ancestors 'none'` |
| **File rahasia terbuka** | `config.php`, `bootstrap.php`, folder `sql/` diblokir lewat `.htaccess` |
| **Koneksi tidak terenkripsi** | Paksa HTTPS di `.htaccess` dan di PHP + HSTS |
| **Data tersimpan setengah jalan** | Semua penyimpanan dibungkus **satu transaksi**; kalau gagal, seluruhnya dibatalkan |
| **Jejak perubahan** | Tabel `log_aktivitas` mencatat login, logout, dan penyimpanan beserta IP |

---

## Catatan penting

**Backend sudah diuji.** Seluruh alur sudah dijalankan sungguhan dengan PHP 8.3: login benar & salah, penguncian setelah 5 kali gagal, penolakan tanpa token CSRF, simpan ke database, muat ulang, dan logout. Pengujian memakai SQLite di komputer lokal; **sintaks SQL-nya sudah disiapkan untuk kedua driver**, tinggal ganti `db_driver` ke `mysql`.

Yang belum bisa dipastikan dari sini hanyalah hal khas server Rumahweb: versi PHP, modul Apache (`mod_headers`, `mod_rewrite`), dan izin folder. Kalau ada error saat langkah 6–7, kirimkan pesan errornya.

Pastikan versi PHP di cPanel **8.0 ke atas** (cPanel → *Select PHP Version*).

### Menjalankan di komputer sendiri (opsional)
Konfigurasi bawaan `api/config.php` memakai SQLite supaya bisa dicoba tanpa server database:
```
php -S localhost:8000 -t .
```
lalu buka `http://localhost:8000/`. Untuk hosting, ubah `db_driver` menjadi `mysql`.

**Mode demo.** Kalau aplikasi dibuka tanpa PHP (misal dari `file://` atau server statis), ia otomatis jatuh ke penyimpanan browser dan menampilkan label kuning *"Mode demo — data hanya di browser ini"*. Di hosting sungguhan label ini tidak akan muncul; kalau ia muncul di hosting, artinya PHP/koneksi database bermasalah.

**Backup.** cPanel Rumahweb punya menu *Backup*. Jadwalkan backup database rutin — ini satu-satunya salinan data toko.
