# Toko Panglima - Point of Sales & Inventory Management System

Aplikasi berbasis web untuk manajemen stok gudang (Inventory) dan kasir (Point of Sales) yang didesain khusus untuk mendukung operasional distribusi dan rute penjualan.

## 🚀 Fitur Utama
- **Manajemen Stok Terpisah (Decoupled Inventory):** Pemisahan arsitektur antara buku pengeluaran belanja (Barang Masuk) dan fisik gudang (Stok Toko) untuk akurasi data aset.
- **Sistem Kasir Rute:** Pencatatan penjualan yang dapat dilacak berdasarkan rute perjalanan atau *salesman*.
- **Manajemen Piutang & Utang:** Pencatatan dan pelacakan arus utang dan piutang pelanggan secara interaktif.
- **Dashboard Laporan Keuangan:** Kalkulasi otomatis Laba/Rugi bulanan berdasarkan arus kas masuk dan pengeluaran.
- **Offline-First / Local Storage Support:** Aplikasi dirancang untuk bisa berjalan secara lokal melalui memori peramban (*browser*) selama tahap pengembangan.

## 💻 Tech Stack (Teknologi yang Digunakan)
- **Frontend:** Vanilla HTML, CSS, & Modern JavaScript (ES6+).
- **Backend:** PHP (Native)
- **Database:** MySQL
- **Konsep Arsitektur:** Single Page Application (SPA) dengan AJAX API Call.

## 🌐 Cara Instalasi di Shared Hosting (cPanel)
Aplikasi ini sangat ringan dan sangat cocok untuk di- *deploy* di *shared hosting* seperti Hostinger, RumahWeb, Niagahoster, dll.
1. Buat **Database MySQL** di cPanel Anda.
2. *Import* file `sql/schema.sql` ke dalam database yang baru dibuat melalui **phpMyAdmin**.
3. Upload seluruh file dari *project* ini ke dalam folder `public_html` di File Manager cPanel.
4. Buka folder `api/`, buat salinan (*copy*) dari file `db_config.example.php` menjadi `db_config.php`.
5. Edit `db_config.php` dengan mengisi nama database, *username*, dan *password* dari langkah 1.
6. Selesai! Website Toko Panglima Anda sudah bisa diakses secara online.

---
*Proyek ini dibangun untuk mendemonstrasikan kemampuan pengembangan aplikasi manajemen bisnis mulai dari perancangan arsitektur database, desain antarmuka, hingga logika backend.*
