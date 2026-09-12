<?php
/**
 * Contoh konfigurasi.
 * Salin file ini menjadi  config.php  lalu isi sesuai data dari cPanel Rumahweb.
 * File config.php TIDAK boleh ikut masuk ke GitHub (sudah masuk .gitignore).
 */

return [
    // 'mysql' untuk hosting Rumahweb. ('sqlite' hanya dipakai saat uji lokal.)
    'db_driver' => 'mysql',

    // --- Database MariaDB (lihat cPanel > MySQL Databases) ---
    'db_host' => 'localhost',
    'db_name' => 'namauser_tokopanglima',
    'db_user' => 'namauser_admin',
    'db_pass' => 'SANDI_DATABASE_DI_SINI',

    // --- Keamanan ---
    // Wajib true kalau domain sudah pakai HTTPS (Rumahweb menyediakan SSL gratis).
    'force_https' => true,

    // Nama cookie sesi.
    'session_name' => 'TPSESS',

    // Sesi otomatis logout setelah tidak aktif sekian detik (default 8 jam).
    'session_idle_timeout' => 8 * 60 * 60,

    // Batas percobaan login gagal sebelum akun dikunci sementara.
    'max_login_attempts' => 5,
    'lockout_minutes'    => 15,
];
