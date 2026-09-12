-- ============================================================
--  TOKO PANGLIMA BANGUNAN — Skema Database (MariaDB / MySQL)
--  Jalankan sekali lewat phpMyAdmin di cPanel Rumahweb.
-- ============================================================
SET NAMES utf8mb4;
SET time_zone = '+07:00';

-- ------------------------------------------------------------
--  Pengguna (login)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pengguna (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,           -- bcrypt, JANGAN pernah simpan sandi asli
  nama_tampilan VARCHAR(100) NOT NULL DEFAULT 'Admin Toko',
  gagal_login   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  terkunci_sampai DATETIME NULL,                 -- rem otomatis saat brute force
  login_terakhir  DATETIME NULL,
  dibuat_pada   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  Master: Rute & Perjalanan
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rute (
  id   VARCHAR(40) NOT NULL,
  nama VARCHAR(100) NOT NULL,
  urutan INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS perjalanan (
  id              VARCHAR(40) NOT NULL,
  -- NULL = periode milik Toko Utama (bukan perjalanan rute)
  rute_id         VARCHAR(40) NULL,
  tanggal_mulai   DATE NOT NULL,
  tanggal_selesai DATE NOT NULL,
  PRIMARY KEY (id),
  KEY idx_perjalanan_rute (rute_id),
  CONSTRAINT fk_perjalanan_rute FOREIGN KEY (rute_id)
    REFERENCES rute (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  TOKO UTAMA
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS barang_masuk (
  id           VARCHAR(40) NOT NULL,
  tanggal      DATE NOT NULL,
  supplier     VARCHAR(150) NOT NULL DEFAULT '',
  nama         VARCHAR(200) NOT NULL DEFAULT '',
  jumlah1      DECIMAL(14,2) NULL,      -- isi satuan besar
  satuan1      VARCHAR(30)  NULL,
  jumlah2      DECIMAL(14,2) NULL,      -- isi satuan ecer
  satuan2      VARCHAR(30)  NULL,
  jumlah       DECIMAL(14,2) NULL,      -- kompatibilitas data lama
  satuan       VARCHAR(30)  NULL,
  harga_modal  DECIMAL(14,2) NOT NULL DEFAULT 0,
  harga_jual   DECIMAL(14,2) NULL,
  harga_jual1  DECIMAL(14,2) NULL,
  harga_jual2  DECIMAL(14,2) NULL,
  PRIMARY KEY (id),
  KEY idx_bm_tanggal (tanggal),
  KEY idx_bm_nama (nama)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stok_toko (
  id VARCHAR(40) NOT NULL,
  nama VARCHAR(200) NOT NULL DEFAULT '',
  jumlah DECIMAL(14,2) NOT NULL DEFAULT 0,
  satuan VARCHAR(30) NULL,
  harga_modal DECIMAL(14,2) NOT NULL DEFAULT 0,
  harga_jual DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_stok_nama (nama)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS utang (
  id         VARCHAR(40) NOT NULL,
  tanggal    DATE NOT NULL,
  keterangan VARCHAR(255) NOT NULL DEFAULT '',
  jumlah     DECIMAL(14,2) NOT NULL DEFAULT 0,
  status     ENUM('Lunas','Belum Lunas') NOT NULL DEFAULT 'Belum Lunas',
  PRIMARY KEY (id),
  KEY idx_utang_tanggal (tanggal),
  KEY idx_utang_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS piutang (
  id         VARCHAR(40) NOT NULL,
  tanggal    DATE NOT NULL,
  nama       VARCHAR(150) NOT NULL DEFAULT '',
  keterangan VARCHAR(255) NOT NULL DEFAULT '',
  no_faktur  VARCHAR(60)  NULL,
  jumlah     DECIMAL(14,2) NOT NULL DEFAULT 0,
  status     ENUM('Lunas','Belum Lunas') NOT NULL DEFAULT 'Belum Lunas',
  PRIMARY KEY (id),
  KEY idx_piutang_tanggal (tanggal),
  KEY idx_piutang_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS uang_keluar (
  id            VARCHAR(40) NOT NULL,
  perjalanan_id VARCHAR(40) NULL,          -- periode pengelompokan (opsional)
  tanggal       DATE NOT NULL,
  keterangan    VARCHAR(255) NOT NULL DEFAULT '',
  jumlah        DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_uk_tanggal (tanggal),
  KEY idx_uk_periode (perjalanan_id),
  CONSTRAINT fk_uk_periode FOREIGN KEY (perjalanan_id)
    REFERENCES perjalanan (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  RUTE LUAR KOTA
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS barang_terjual (
  id            VARCHAR(40) NOT NULL,
  rute_id       VARCHAR(40) NULL,
  perjalanan_id VARCHAR(40) NULL,
  tanggal       DATE NOT NULL,
  pelanggan     VARCHAR(150) NOT NULL DEFAULT '',
  no_faktur     VARCHAR(60)  NULL,
  nama          VARCHAR(200) NOT NULL DEFAULT '',
  jumlah        DECIMAL(14,2) NOT NULL DEFAULT 0,
  satuan        VARCHAR(30) NULL,
  harga_jual    DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_bt_rute (rute_id),
  KEY idx_bt_perjalanan (perjalanan_id),
  KEY idx_bt_tanggal (tanggal),
  CONSTRAINT fk_bt_rute FOREIGN KEY (rute_id)
    REFERENCES rute (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_bt_perjalanan FOREIGN KEY (perjalanan_id)
    REFERENCES perjalanan (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rekap_piutang (
  id            VARCHAR(40) NOT NULL,
  rute_id       VARCHAR(40) NULL,
  perjalanan_id VARCHAR(40) NULL,
  tanggal       DATE NOT NULL,
  nama          VARCHAR(150) NOT NULL DEFAULT '',
  no_faktur     VARCHAR(60) NULL,
  jumlah        DECIMAL(14,2) NOT NULL DEFAULT 0,
  status        ENUM('Lunas','Belum Lunas') NOT NULL DEFAULT 'Belum Lunas',
  PRIMARY KEY (id),
  KEY idx_rp_rute (rute_id),
  KEY idx_rp_perjalanan (perjalanan_id),
  CONSTRAINT fk_rp_rute FOREIGN KEY (rute_id)
    REFERENCES rute (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_rp_perjalanan FOREIGN KEY (perjalanan_id)
    REFERENCES perjalanan (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tagihan (
  id            VARCHAR(40) NOT NULL,
  rute_id       VARCHAR(40) NULL,
  perjalanan_id VARCHAR(40) NULL,
  tanggal       DATE NOT NULL,
  nama          VARCHAR(150) NOT NULL DEFAULT '',
  keterangan    VARCHAR(255) NOT NULL DEFAULT '',
  jumlah        DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_tg_rute (rute_id),
  KEY idx_tg_perjalanan (perjalanan_id),
  CONSTRAINT fk_tg_rute FOREIGN KEY (rute_id)
    REFERENCES rute (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_tg_perjalanan FOREIGN KEY (perjalanan_id)
    REFERENCES perjalanan (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS uang_keluar_lk (
  id            VARCHAR(40) NOT NULL,
  rute_id       VARCHAR(40) NULL,
  perjalanan_id VARCHAR(40) NULL,
  tanggal       DATE NOT NULL,
  keterangan    VARCHAR(255) NOT NULL DEFAULT '',
  jumlah        DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_uklk_rute (rute_id),
  KEY idx_uklk_perjalanan (perjalanan_id),
  CONSTRAINT fk_uklk_rute FOREIGN KEY (rute_id)
    REFERENCES rute (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_uklk_perjalanan FOREIGN KEY (perjalanan_id)
    REFERENCES perjalanan (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS uang_masuk (
  id            VARCHAR(40) NOT NULL,
  rute_id       VARCHAR(40) NULL,
  perjalanan_id VARCHAR(40) NULL,
  tanggal       DATE NOT NULL,
  keterangan    VARCHAR(255) NOT NULL DEFAULT '',
  jumlah        DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_um_rute (rute_id),
  KEY idx_um_perjalanan (perjalanan_id),
  CONSTRAINT fk_um_rute FOREIGN KEY (rute_id)
    REFERENCES rute (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_um_perjalanan FOREIGN KEY (perjalanan_id)
    REFERENCES perjalanan (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  Jejak aktivitas (siapa menyimpan apa, kapan)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS log_aktivitas (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  pengguna_id INT UNSIGNED NULL,
  aksi        VARCHAR(60) NOT NULL,
  keterangan  VARCHAR(255) NOT NULL DEFAULT '',
  ip          VARCHAR(45) NULL,
  waktu       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_log_waktu (waktu)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  Rute bawaan
-- ------------------------------------------------------------
INSERT INTO rute (id, nama, urutan) VALUES
  ('rute-bengkulu', 'Bengkulu', 1),
  ('rute-jambi',    'Jambi',    2),
  ('rute-riau',     'Riau',     3),
  ('rute-medan',    'Medan',    4)
ON DUPLICATE KEY UPDATE nama = VALUES(nama);

-- ------------------------------------------------------------
--  Akun login TIDAK dibuat di sini dengan sengaja.
--
--  Sandi bawaan yang tertulis di dalam file SQL akan ikut tersimpan
--  di riwayat/backup dan gampang bocor. Jadi akun pertama dibuat lewat
--  halaman setup sekali-pakai:
--
--     1. Buka  https://domain-anda/setup.php
--     2. Tentukan username & sandi sendiri (minimal 10 karakter)
--     3. HAPUS file setup.php setelah akun jadi
--
--  Sandi disimpan sebagai hash bcrypt, tidak pernah sebagai teks biasa.
-- ------------------------------------------------------------
