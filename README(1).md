# Toko Panglima Bangunan
## Sistem Pencatatan Keuangan Berbasis Web

### 1. Gambaran Umum

Toko Panglima Bangunan membutuhkan aplikasi berbasis web untuk membantu pencatatan transaksi dan kondisi keuangan toko secara terstruktur.

Aplikasi ditujukan untuk pemilik dan karyawan toko yang tidak harus memahami istilah akuntansi. Karena itu, seluruh tampilan dan istilah di dalam aplikasi dibuat sederhana dan mudah dipahami.

Tahap awal pengembangan adalah membuat **prototipe** yang akan dipresentasikan kepada klien untuk memberikan gambaran mengenai bentuk dan alur aplikasi sebelum masuk ke tahap pengembangan penuh.

---

## 2. Tujuan Aplikasi

- Memudahkan karyawan mencatat transaksi toko secara manual.
- Memisahkan pencatatan antara **Toko Utama** dan **Rute Luar Kota**.
- Mengumpulkan seluruh transaksi agar dapat dihitung menjadi laporan keuangan.
- Menampilkan kondisi stok toko berdasarkan barang yang masuk.
- Memudahkan pemilik melihat keuntungan dan kerugian setiap bulan.
- Memungkinkan data transaksi diperbaiki apabila terjadi kesalahan pencatatan.
- Menyediakan sistem berbasis web yang nantinya dapat digunakan secara online melalui web hosting.

---

## 3. Struktur Menu Utama

Aplikasi memiliki dua bagian utama:

1. **Toko Utama**
2. **Rute Luar Kota**

Selain itu terdapat menu umum untuk melihat stok dan laporan keuangan.

---

# 4. Toko Utama

Menu Toko Utama digunakan untuk mencatat aktivitas keuangan dan barang pada toko utama.

### Data yang perlu dicatat

- Utang
- Uang Keluar
- Piutang
- Pembelian Utang
- Barang Masuk

Setiap pencatatan dilakukan secara manual oleh karyawan toko.

---

## 4.1 Barang Masuk

Menu Barang Masuk digunakan untuk mencatat barang yang masuk ke toko.

Data yang perlu tersedia:

- Nama supplier
- Nama barang
- Jumlah barang
- Satuan barang
- Harga modal
- Harga jual

### Satuan Barang

Karena jenis barang dapat memiliki satuan yang berbeda, sistem harus memungkinkan pencatatan satuan seperti:

- Dus
- Lusin
- Pcs
- Satuan lain sesuai kebutuhan toko

Data barang masuk akan menjadi salah satu sumber data untuk menentukan stok toko.

---

# 5. Rute Luar Kota

Menu Rute Luar Kota digunakan untuk mencatat transaksi ketika toko melakukan perjalanan atau penjualan ke luar kota.

### Data yang perlu dicatat

- Barang Terjual
- Rekap Piutang
- Tagihan
- Uang Keluar
- Uang Masuk

Pencatatan Rute Luar Kota harus terpisah dari Toko Utama agar transaksi dari kedua aktivitas tidak tercampur.

---

# 6. Stok Toko

Menu **Stok Toko** menampilkan persediaan barang berdasarkan data dari Barang Masuk.

Informasi yang ditampilkan:

| Data | Keterangan |
|---|---|
| Nama Barang | Nama barang yang tersedia |
| Stok | Jumlah stok saat ini |
| Harga Modal | Harga pembelian/modal barang |
| Harga Jual | Harga jual barang |

Tujuan halaman ini adalah memberikan gambaran stok secara cepat tanpa mengharuskan pengguna membuka kembali catatan Barang Masuk.

---

# 7. Laporan Keuangan

Istilah **Buku Besar** atau istilah akuntansi lainnya tidak digunakan pada tampilan utama karena target pengguna merupakan orang awam.

Nama menu yang digunakan:

> **Laporan Keuangan**

Laporan Keuangan digunakan untuk melihat kondisi keuangan toko berdasarkan periode tertentu.

### Laporan berdasarkan bulan

Pengguna dapat memilih bulan yang ingin dilihat, misalnya:

- Januari
- Februari
- Maret
- dan seterusnya

Setiap bulan dapat menampilkan ringkasan:

- Total uang masuk
- Total uang keluar
- Total penjualan
- Total piutang
- Total utang
- Total pembelian
- Perkiraan keuntungan
- Kerugian

Sistem akan mengumpulkan data dari berbagai pencatatan transaksi dan menghitung ringkasannya.

---

# 8. Edit Data

Setiap halaman pencatatan wajib memiliki fitur **Edit**.

Contoh:

- Edit transaksi Toko Utama
- Edit transaksi Rute Luar Kota
- Edit Barang Masuk
- Edit data lainnya yang telah dicatat

Ketika data transaksi diubah, laporan keuangan juga harus ikut diperbarui berdasarkan data terbaru.

### Contoh

Jika sebelumnya:

- Uang keluar = Rp1.000.000

Kemudian transaksi tersebut diedit menjadi:

- Uang keluar = Rp750.000

Maka perhitungan pada **Laporan Keuangan** juga harus otomatis menggunakan nilai Rp750.000.

---

# 9. Alur Data Sederhana

```text
                 ┌───────────────────┐
                 │   Toko Utama      │
                 └─────────┬─────────┘
                           │
                           ├── Utang
                           ├── Uang Keluar
                           ├── Piutang
                           ├── Pembelian Utang
                           └── Barang Masuk
                                      │
                                      ▼
                              ┌──────────────┐
                              │  Stok Toko   │
                              └──────────────┘


                 ┌───────────────────┐
                 │  Rute Luar Kota   │
                 └─────────┬─────────┘
                           │
                           ├── Barang Terjual
                           ├── Rekap Piutang
                           ├── Tagihan
                           ├── Uang Keluar
                           └── Uang Masuk
                                      │
                                      ▼
                         ┌────────────────────┐
                         │  Laporan Keuangan  │
                         └────────────────────┘
```

---

# 10. Dashboard

Sebagai tambahan untuk prototipe, disarankan terdapat halaman **Dashboard** sebagai halaman utama.

Dashboard dapat menampilkan ringkasan kondisi toko secara cepat, seperti:

- Total penjualan bulan berjalan
- Total uang masuk
- Total uang keluar
- Total piutang
- Total utang
- Estimasi keuntungan
- Nilai stok barang

Dashboard tidak digunakan untuk melakukan pencatatan utama. Fungsinya adalah memberikan ringkasan agar pemilik toko tidak perlu membuka banyak menu untuk mengetahui kondisi usaha.

---

# 11. Prinsip Penggunaan

Karena aplikasi digunakan oleh karyawan dan pemilik toko, desain sistem harus mengutamakan:

- Sederhana
- Mudah dipahami
- Tidak menggunakan istilah akuntansi yang rumit
- Pencatatan manual
- Form input yang jelas
- Data mudah diedit
- Laporan otomatis diperbarui
- Tampilan nyaman digunakan melalui komputer maupun perangkat lain

---

# 12. Tahap Pengembangan

### Tahap 1 — Prototipe

Fokus awal adalah membuat tampilan dan alur aplikasi untuk dipresentasikan kepada klien.

Prototipe minimal mencakup:

- Dashboard
- Toko Utama
- Rute Luar Kota
- Barang Masuk
- Stok Toko
- Laporan Keuangan
- Form tambah data
- Form edit data

Pada tahap ini fokus utama adalah **alur penggunaan dan tampilan**, bukan implementasi sistem secara penuh.

### Tahap 2 — Pengembangan Sistem

Setelah prototipe disetujui klien, sistem dapat dikembangkan menjadi aplikasi sebenarnya dengan:

- Database
- Login pengguna
- Penyimpanan transaksi
- Perhitungan laporan otomatis
- Manajemen stok
- Hak akses pengguna
- Backup data
- Deployment ke web hosting

---

# 13. Catatan Pengembangan

Sistem harus dirancang agar setiap transaksi memiliki hubungan yang jelas dengan sumber datanya.

Perubahan pada transaksi harus memengaruhi data turunan yang berkaitan, terutama:

**Transaksi → Stok / Rekap → Laporan Keuangan**

Dengan demikian, pengguna cukup melakukan pencatatan dan koreksi pada data transaksi, sedangkan sistem bertugas mengolah dan merangkum data tersebut.

---

## 14. Fitur Tambahan yang Dapat Dipertimbangkan

Fitur berikut belum menjadi kebutuhan utama dan dapat dibahas kembali bersama klien:

- Pencarian transaksi
- Filter berdasarkan tanggal
- Filter berdasarkan bulan
- Riwayat perubahan data
- Export laporan ke PDF/Excel
- Cetak laporan
- Login pemilik dan karyawan
- Hak akses berbeda antara pemilik dan karyawan
- Backup database
- Notifikasi stok menipis
- Rekap transaksi berdasarkan supplier
- Rekap penjualan berdasarkan barang

Fitur tambahan sebaiknya diprioritaskan setelah kebutuhan utama klien disepakati.

---

## 15. Kesimpulan

**Toko Panglima Bangunan** merupakan aplikasi web untuk membantu proses pencatatan aktivitas toko secara sederhana.

Sistem memisahkan aktivitas menjadi **Toko Utama** dan **Rute Luar Kota**, menyediakan pencatatan Barang Masuk dan Stok Toko, serta mengolah seluruh transaksi menjadi **Laporan Keuangan** berdasarkan bulan.

Tahap pertama pengembangan adalah membuat prototipe yang mudah dipahami oleh klien sehingga klien dapat melihat gambaran aplikasi sebelum sistem dikembangkan secara penuh.
