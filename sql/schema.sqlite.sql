-- ============================================================
--  Skema SQLite — HANYA untuk uji coba di komputer sendiri.
--  Yang dipakai di hosting Rumahweb adalah schema.sql (MariaDB).
-- ============================================================
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pengguna (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  username        TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  nama_tampilan   TEXT NOT NULL DEFAULT 'Admin Toko',
  gagal_login     INTEGER NOT NULL DEFAULT 0,
  terkunci_sampai TEXT,
  login_terakhir  TEXT,
  dibuat_pada     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rute (
  id     TEXT PRIMARY KEY,
  nama   TEXT NOT NULL,
  urutan INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS perjalanan (
  id              TEXT PRIMARY KEY,
  rute_id         TEXT REFERENCES rute(id) ON DELETE CASCADE,   -- NULL = periode Toko Utama
  tanggal_mulai   TEXT NOT NULL,
  tanggal_selesai TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS barang_masuk (
  id          TEXT PRIMARY KEY,
  tanggal     TEXT NOT NULL,
  supplier    TEXT NOT NULL DEFAULT '',
  nama        TEXT NOT NULL DEFAULT '',
  jumlah1     REAL, satuan1 TEXT,
  jumlah2     REAL, satuan2 TEXT,
  jumlah      REAL, satuan  TEXT,
  harga_modal REAL NOT NULL DEFAULT 0,
  harga_jual  REAL, harga_jual1 REAL, harga_jual2 REAL
);

CREATE TABLE IF NOT EXISTS utang (
  id         TEXT PRIMARY KEY,
  tanggal    TEXT NOT NULL,
  keterangan TEXT NOT NULL DEFAULT '',
  jumlah     REAL NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'Belum Lunas'
);

CREATE TABLE IF NOT EXISTS piutang (
  id         TEXT PRIMARY KEY,
  tanggal    TEXT NOT NULL,
  nama       TEXT NOT NULL DEFAULT '',
  keterangan TEXT NOT NULL DEFAULT '',
  no_faktur  TEXT,
  jumlah     REAL NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'Belum Lunas'
);

CREATE TABLE IF NOT EXISTS uang_keluar (
  id            TEXT PRIMARY KEY,
  perjalanan_id TEXT REFERENCES perjalanan(id) ON DELETE SET NULL,
  tanggal       TEXT NOT NULL,
  keterangan    TEXT NOT NULL DEFAULT '',
  jumlah        REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS barang_terjual (
  id            TEXT PRIMARY KEY,
  rute_id       TEXT REFERENCES rute(id) ON DELETE SET NULL,
  perjalanan_id TEXT REFERENCES perjalanan(id) ON DELETE SET NULL,
  tanggal       TEXT NOT NULL,
  pelanggan     TEXT NOT NULL DEFAULT '',
  no_faktur     TEXT,
  nama          TEXT NOT NULL DEFAULT '',
  jumlah        REAL NOT NULL DEFAULT 0,
  satuan        TEXT,
  harga_jual    REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rekap_piutang (
  id            TEXT PRIMARY KEY,
  rute_id       TEXT REFERENCES rute(id) ON DELETE SET NULL,
  perjalanan_id TEXT REFERENCES perjalanan(id) ON DELETE SET NULL,
  tanggal       TEXT NOT NULL,
  nama          TEXT NOT NULL DEFAULT '',
  no_faktur     TEXT,
  jumlah        REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'Belum Lunas'
);

CREATE TABLE IF NOT EXISTS tagihan (
  id            TEXT PRIMARY KEY,
  rute_id       TEXT REFERENCES rute(id) ON DELETE SET NULL,
  perjalanan_id TEXT REFERENCES perjalanan(id) ON DELETE SET NULL,
  tanggal       TEXT NOT NULL,
  nama          TEXT NOT NULL DEFAULT '',
  keterangan    TEXT NOT NULL DEFAULT '',
  jumlah        REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS uang_keluar_lk (
  id            TEXT PRIMARY KEY,
  rute_id       TEXT REFERENCES rute(id) ON DELETE SET NULL,
  perjalanan_id TEXT REFERENCES perjalanan(id) ON DELETE SET NULL,
  tanggal       TEXT NOT NULL,
  keterangan    TEXT NOT NULL DEFAULT '',
  jumlah        REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS uang_masuk (
  id            TEXT PRIMARY KEY,
  rute_id       TEXT REFERENCES rute(id) ON DELETE SET NULL,
  perjalanan_id TEXT REFERENCES perjalanan(id) ON DELETE SET NULL,
  tanggal       TEXT NOT NULL,
  keterangan    TEXT NOT NULL DEFAULT '',
  jumlah        REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS log_aktivitas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pengguna_id INTEGER,
  aksi        TEXT NOT NULL,
  keterangan  TEXT NOT NULL DEFAULT '',
  ip          TEXT,
  waktu       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO rute (id, nama, urutan) VALUES
  ('rute-bengkulu','Bengkulu',1),
  ('rute-jambi','Jambi',2),
  ('rute-riau','Riau',3),
  ('rute-medan','Medan',4);
