<?php
/**
 * Peta antara nama field di aplikasi (JavaScript) dan kolom di database.
 * Dipakai bersama oleh data.php (baca) dan save.php (tulis) supaya
 * keduanya tidak pernah beda pemahaman.
 *
 * Kunci array luar  = nama koleksi di objek `store` pada app.js
 * 'tabel'           = nama tabel MariaDB
 * 'kolom'           = [ namaFieldJS => namaKolomDB ]
 * 'angka'           = field yang harus disimpan sebagai angka
 * 'tanggal'         = field tanggal (divalidasi format YYYY-MM-DD)
 * 'enum'            = field dengan nilai terbatas
 */

return [
    'ruteList' => [
        'tabel'  => 'rute',
        'kolom'  => ['id' => 'id', 'nama' => 'nama'],
        'angka'  => [],
        'tanggal'=> [],
        'enum'   => [],
    ],
    'perjalananList' => [
        'tabel'  => 'perjalanan',
        'kolom'  => [
            'id' => 'id', 'ruteId' => 'rute_id',
            'tanggalMulai' => 'tanggal_mulai', 'tanggalSelesai' => 'tanggal_selesai',
        ],
        'angka'  => [],
        'tanggal'=> ['tanggalMulai', 'tanggalSelesai'],
        'enum'   => [],
    ],
    'barangMasuk' => [
        'tabel'  => 'barang_masuk',
        'kolom'  => [
            'id' => 'id', 'tanggal' => 'tanggal', 'supplier' => 'supplier', 'nama' => 'nama',
            'jumlah1' => 'jumlah1', 'satuan1' => 'satuan1',
            'jumlah2' => 'jumlah2', 'satuan2' => 'satuan2',
            'jumlah'  => 'jumlah',  'satuan'  => 'satuan',
            'hargaModal' => 'harga_modal', 'hargaJual' => 'harga_jual',
            'hargaJual1' => 'harga_jual1', 'hargaJual2' => 'harga_jual2',
        ],
        'angka'  => ['jumlah1','jumlah2','jumlah','hargaModal','hargaJual','hargaJual1','hargaJual2'],
        'tanggal'=> ['tanggal'],
        'enum'   => [],
    ],
    'utang' => [
        'tabel'  => 'utang',
        'kolom'  => ['id'=>'id','tanggal'=>'tanggal','keterangan'=>'keterangan','jumlah'=>'jumlah','status'=>'status'],
        'angka'  => ['jumlah'],
        'tanggal'=> ['tanggal'],
        'enum'   => ['status' => ['Lunas','Belum Lunas']],
    ],
    'piutang' => [
        'tabel'  => 'piutang',
        'kolom'  => ['id'=>'id','tanggal'=>'tanggal','nama'=>'nama','keterangan'=>'keterangan',
                     'noFaktur'=>'no_faktur','jumlah'=>'jumlah','status'=>'status'],
        'angka'  => ['jumlah'],
        'tanggal'=> ['tanggal'],
        'enum'   => ['status' => ['Lunas','Belum Lunas']],
    ],
    'uangKeluar' => [
        'tabel'  => 'uang_keluar',
        // perjalananId di sini berarti "periode" Toko Utama (lihat catatan di app.js)
        'kolom'  => ['id'=>'id','perjalananId'=>'perjalanan_id','tanggal'=>'tanggal',
                     'keterangan'=>'keterangan','jumlah'=>'jumlah'],
        'angka'  => ['jumlah'],
        'tanggal'=> ['tanggal'],
        'enum'   => [],
    ],
    'barangTerjual' => [
        'tabel'  => 'barang_terjual',
        'kolom'  => ['id'=>'id','ruteId'=>'rute_id','perjalananId'=>'perjalanan_id','tanggal'=>'tanggal',
                     'pelanggan'=>'pelanggan','noFaktur'=>'no_faktur','nama'=>'nama',
                     'jumlah'=>'jumlah','satuan'=>'satuan','hargaJual'=>'harga_jual'],
        'angka'  => ['jumlah','hargaJual'],
        'tanggal'=> ['tanggal'],
        'enum'   => [],
    ],
    'rekapPiutang' => [
        'tabel'  => 'rekap_piutang',
        'kolom'  => ['id'=>'id','ruteId'=>'rute_id','perjalananId'=>'perjalanan_id','tanggal'=>'tanggal',
                     'nama'=>'nama','noFaktur'=>'no_faktur','jumlah'=>'jumlah','status'=>'status'],
        'angka'  => ['jumlah'],
        'tanggal'=> ['tanggal'],
        'enum'   => ['status' => ['Lunas','Belum Lunas']],
    ],
    'tagihan' => [
        'tabel'  => 'tagihan',
        'kolom'  => ['id'=>'id','ruteId'=>'rute_id','perjalananId'=>'perjalanan_id','tanggal'=>'tanggal',
                     'nama'=>'nama','keterangan'=>'keterangan','jumlah'=>'jumlah'],
        'angka'  => ['jumlah'],
        'tanggal'=> ['tanggal'],
        'enum'   => [],
    ],
    'uangKeluarLK' => [
        'tabel'  => 'uang_keluar_lk',
        'kolom'  => ['id'=>'id','ruteId'=>'rute_id','perjalananId'=>'perjalanan_id','tanggal'=>'tanggal',
                     'keterangan'=>'keterangan','jumlah'=>'jumlah'],
        'angka'  => ['jumlah'],
        'tanggal'=> ['tanggal'],
        'enum'   => [],
    ],
    'uangMasuk' => [
        'tabel'  => 'uang_masuk',
        'kolom'  => ['id'=>'id','ruteId'=>'rute_id','perjalananId'=>'perjalanan_id','tanggal'=>'tanggal',
                     'keterangan'=>'keterangan','jumlah'=>'jumlah'],
        'angka'  => ['jumlah'],
        'tanggal'=> ['tanggal'],
        'enum'   => [],
    ],
];
