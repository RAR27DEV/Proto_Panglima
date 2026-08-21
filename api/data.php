<?php
/**
 * GET /api/data.php — ambil seluruh data toko untuk dimuat ke aplikasi.
 */
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
requireMethod('GET');
requireLogin();

$map = require __DIR__ . '/schema_map.php';

try {
    $store = [];

    foreach ($map as $koleksi => $def) {
        // Nama tabel & kolom berasal dari peta internal (bukan input pengguna),
        // jadi aman untuk disusun langsung ke dalam query.
        $pilih = [];
        foreach ($def['kolom'] as $js => $col) {
            $pilih[] = "`{$col}` AS `{$js}`";
        }
        $order = $koleksi === 'ruteList' ? 'ORDER BY `urutan`, `nama`'
               : (in_array('tanggal', array_keys($def['kolom']), true) ? 'ORDER BY `tanggal`, `id`' : '');

        $sql  = 'SELECT ' . implode(', ', $pilih) . " FROM `{$def['tabel']}` {$order}";
        $rows = db()->query($sql)->fetchAll();

        // Rapikan tipe data supaya sama persis seperti yang diharapkan app.js
        foreach ($rows as &$r) {
            foreach ($def['angka'] as $f) {
                if (array_key_exists($f, $r)) {
                    $r[$f] = $r[$f] === null ? null : (float)$r[$f];
                }
            }
            foreach ($r as $k => $v) {
                if ($v === null && !in_array($k, $def['angka'], true)) {
                    $r[$k] = null;
                }
            }
        }
        unset($r);

        $store[$koleksi] = $rows;
    }

    jsonOut([
        'ok'    => true,
        'store' => $store,
        'user'  => ['nama' => $_SESSION['nama'] ?? 'Admin', 'username' => $_SESSION['uname'] ?? ''],
        'csrf'  => csrfToken(),
    ]);
} catch (Throwable $e) {
    error_log('data.php: ' . $e->getMessage());
    jsonOut(['ok' => false, 'error' => 'Gagal memuat data.'], 500);
}
