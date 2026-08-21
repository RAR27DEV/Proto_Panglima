<?php
/**
 * POST /api/save.php — simpan seluruh data toko.
 *
 * Seluruh penulisan dibungkus SATU transaksi: kalau ada satu baris yang gagal,
 * semuanya dibatalkan. Jadi data tidak pernah tersimpan setengah jalan.
 *
 * Baris yang hilang dari kiriman akan dihapus, yang ada akan di-upsert.
 * ID baris bersifat tetap, sehingga relasi antar tabel tidak putus.
 */
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
requireMethod('POST');
$uid = requireLogin();
requireCsrf();

$map  = require __DIR__ . '/schema_map.php';
$body = jsonBody();
$in   = $body['store'] ?? null;

if (!is_array($in)) {
    jsonOut(['ok' => false, 'error' => 'Format data tidak valid.'], 400);
}

/** Bersihkan & validasi satu nilai sesuai definisi kolom. */
function bersihkan($nilai, string $field, array $def) {
    if (in_array($field, $def['angka'], true)) {
        if ($nilai === '' || $nilai === null) return null;
        if (!is_numeric($nilai)) return null;
        return round((float)$nilai, 2);
    }
    if (in_array($field, $def['tanggal'], true)) {
        $s = trim((string)$nilai);
        // hanya terima YYYY-MM-DD dan tanggal yang benar-benar ada
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m)) return null;
        if (!checkdate((int)$m[2], (int)$m[3], (int)$m[1])) return null;
        return $s;
    }
    if (isset($def['enum'][$field])) {
        return in_array($nilai, $def['enum'][$field], true) ? $nilai : $def['enum'][$field][1] ?? $def['enum'][$field][0];
    }
    if ($nilai === null) return null;
    // potong agar tidak melebihi panjang kolom
    return mb_substr(trim((string)$nilai), 0, 255);
}

try {
    $pdo    = db();
    $sqlite = dbDriver() === 'sqlite';

    // Matikan sementara pengecekan relasi supaya urutan hapus/tulis tidak bentrok.
    // (SQLite hanya menerima PRAGMA ini di luar transaksi.)
    $pdo->exec($sqlite ? 'PRAGMA foreign_keys = OFF' : 'SET FOREIGN_KEY_CHECKS = 0');
    $pdo->beginTransaction();

    $ringkas = [];

    foreach ($map as $koleksi => $def) {
        $rows = isset($in[$koleksi]) && is_array($in[$koleksi]) ? $in[$koleksi] : [];
        $tabel = $def['tabel'];
        $idsMasuk = [];

        // --- Upsert setiap baris ---
        $jsFields  = array_keys($def['kolom']);
        $dbCols    = array_values($def['kolom']);
        $place   = implode(', ', array_fill(0, count($dbCols), '?'));
        $colList = '`' . implode('`, `', $dbCols) . '`';

        if ($sqlite) {
            $set = implode(', ', array_map(fn($c) => "`{$c}` = excluded.`{$c}`", $dbCols));
            $sql = "INSERT INTO `{$tabel}` ({$colList}) VALUES ({$place})
                    ON CONFLICT(`id`) DO UPDATE SET {$set}";
        } else {
            $set = implode(', ', array_map(fn($c) => "`{$c}` = VALUES(`{$c}`)", $dbCols));
            $sql = "INSERT INTO `{$tabel}` ({$colList}) VALUES ({$place})
                    ON DUPLICATE KEY UPDATE {$set}";
        }
        $stmt = $pdo->prepare($sql);

        foreach ($rows as $row) {
            if (!is_array($row)) continue;

            $id = trim((string)($row['id'] ?? ''));
            // ID dibuat aplikasi; batasi ke karakter aman saja
            if ($id === '' || !preg_match('/^[A-Za-z0-9_-]{1,40}$/', $id)) continue;
            $idsMasuk[] = $id;

            $vals = [];
            foreach ($jsFields as $f) {
                $vals[] = $f === 'id' ? $id : bersihkan($row[$f] ?? null, $f, $def);
            }
            $stmt->execute($vals);
        }

        // --- Hapus baris yang sudah tidak ada di aplikasi ---
        if ($idsMasuk) {
            $q = implode(',', array_fill(0, count($idsMasuk), '?'));
            $pdo->prepare("DELETE FROM `{$tabel}` WHERE `id` NOT IN ({$q})")->execute($idsMasuk);
        } else {
            $pdo->exec("DELETE FROM `{$tabel}`");
        }

        $ringkas[$koleksi] = count($idsMasuk);
    }

    $pdo->commit();
    $pdo->exec($sqlite ? 'PRAGMA foreign_keys = ON' : 'SET FOREIGN_KEY_CHECKS = 1');

    catatLog($uid, 'simpan_data', json_encode($ringkas, JSON_UNESCAPED_UNICODE) ?: '');
    jsonOut(['ok' => true, 'tersimpan' => $ringkas]);

} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    if (isset($pdo)) {
        try {
            $pdo->exec(($sqlite ?? false) ? 'PRAGMA foreign_keys = ON' : 'SET FOREIGN_KEY_CHECKS = 1');
        } catch (Throwable $ignore) {}
    }
    error_log('save.php: ' . $e->getMessage());
    jsonOut(['ok' => false, 'error' => 'Gagal menyimpan data. Perubahan terakhir dibatalkan.'], 500);
}
