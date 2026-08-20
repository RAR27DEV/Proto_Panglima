/* ============================================================
   TOKO PANGLIMA — app.js
   Single-page app: routing, data store, all page renderers
   ============================================================ */

'use strict';

/* ========================
   HELPERS
   ======================== */
const fmt = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const fmtNum = (n) => Number(n || 0).toLocaleString('id-ID');
const fmtShort = (n) => {
  n = Number(n || 0);
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'jt';
  if (n >= 1000) return Math.round(n / 1000) + 'rb';
  return String(Math.round(n));
};
const today = () => new Date().toISOString().slice(0, 10);
const uid  = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni',
                'Juli','Agustus','September','Oktober','November','Desember'];

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function getMonthYear(iso) {
  if (!iso) return { m: 0, y: 0 };
  const d = new Date(iso);
  return { m: d.getMonth(), y: d.getFullYear() };
}

function formatStock(stokKecil, konversi, sat1, sat2) {
  if (sat1 === sat2 || konversi <= 1) return `${stokKecil} ${sat2}`;
  const qty1 = Math.floor(stokKecil / konversi);
  const qty2 = stokKecil % konversi;
  let res = [];
  if (qty1 > 0) res.push(`${qty1} ${sat1}`);
  if (qty2 > 0 || qty1 === 0) res.push(`${qty2} ${sat2}`);
  return res.join(' ');
}

function statusBadgeCell(key, item) {
  const isLunas = item.status === 'Lunas';
  return `<td>
    <span class="badge ${isLunas ? 'badge-green' : 'badge-orange'}" style="cursor:pointer" onclick="toggleLunas('${key}','${item.id}')" title="Klik untuk ubah status">
      ${isLunas ? '✔ Lunas' : '⏳ Belum Lunas'}
    </span>
  </td>`;
}

function toggleLunas(key, id) {
  const item = (store[key] || []).find(x => x.id === id);
  if (!item) return;
  item.status = item.status === 'Lunas' ? 'Belum Lunas' : 'Lunas';
  saveStore();
  if (currentPerjalananId && currentRuteId) {
    renderPerjalananCategoryPage(currentRuteId, currentPerjalananId, key);
  } else {
    const searchInput = document.getElementById(`search-${key}`);
    renderTableBody(key, searchInput ? searchInput.value.toLowerCase().trim() : '');
  }
  showToast(`Status ditandai ${item.status}`, 'success');
}

/* ========================
   LOCAL STORAGE STORE
   ======================== */
const STORE_KEY = 'toko_panglima_v5';

function loadStore() {
  let s = null;
  try {
    s = JSON.parse(localStorage.getItem(STORE_KEY));
  } catch(e) {}
  if (!s) s = defaultStore();
  
  // Backwards compatibility injections
  if (!s.ruteList) {
    s.ruteList = [{ id: 'rute-default', nama: 'Rute Luar Kota' }];
    // Migrate existing rute data to this default rute
    ['barangTerjual','rekapPiutang','tagihan','uangKeluarLK','uangMasuk'].forEach(key => {
      if (s[key]) s[key].forEach(item => { if(!item.ruteId) item.ruteId = 'rute-default'; });
    });
    saveStore(); // Save migration
  }
  return s;
}

function saveStore() {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function defaultStore() {
  return {
    ruteList:      [
      { id: 'rute-bengkulu', nama: 'Bengkulu' },
      { id: 'rute-jambi',    nama: 'Jambi' },
      { id: 'rute-riau',     nama: 'Riau' },
      { id: 'rute-medan',    nama: 'Medan' },
    ],
    barangMasuk:   [],
    utang:         [],
    piutang:       [],
    uangKeluar:    [],
    perjalananList:[],
    barangTerjual: [],
    rekapPiutang:  [],
    tagihan:       [],
    uangKeluarLK:  [],
    uangMasuk:     [],
  };
}

let store = loadStore();

/* seed sample data if empty */
function seedData() {
  if (store.barangMasuk.length) return;
  store.barangMasuk = [
    // MEI
    { id: uid(), tanggal: '2026-05-04', supplier: 'Kapusi',      nama: 'Meter Hitam 5M',           jumlah: 40, satuan: 'Pcs',   hargaModal: 24000,  hargaJual: 32000 },
    { id: uid(), tanggal: '2026-05-04', supplier: 'Kapusi',      nama: 'Gergaji Kayu Kapusi',      jumlah: 25, satuan: 'Pcs',   hargaModal: 30000,  hargaJual: 40000 },
    { id: uid(), tanggal: '2026-05-06', supplier: 'Buyaris',     nama: 'Kawat Hijau',              jumlah: 48, satuan: 'Rol',   hargaModal: 55000,  hargaJual: 70000 },
    { id: uid(), tanggal: '2026-05-07', supplier: 'Jotasindo',   nama: 'Cat Samurai Campur Warna', jumlah: 16, satuan: 'Lusin', hargaModal: 448000, hargaJual: 550000 },
    { id: uid(), tanggal: '2026-05-08', supplier: 'SMS',         nama: 'Sarung Tangan Bintik',     jumlah: 32, satuan: 'Lusin', hargaModal: 25000,  hargaJual: 35000 },
    { id: uid(), tanggal: '2026-05-09', supplier: 'Buyaris',     nama: 'Pompa Amper Kodai',        jumlah: 15, satuan: 'Buah',  hargaModal: 36000,  hargaJual: 48000 },
    // JUNI
    { id: uid(), tanggal: '2026-06-02', supplier: 'Kapusi',      nama: 'Meter Hitam 7.5M',         jumlah: 25, satuan: 'Pcs',   hargaModal: 30750,  hargaJual: 40000 },
    { id: uid(), tanggal: '2026-06-04', supplier: 'Kapusi',      nama: 'Mesin Gerinda 710W',       jumlah: 6,  satuan: 'Pcs',   hargaModal: 285000, hargaJual: 350000 },
    { id: uid(), tanggal: '2026-06-05', supplier: 'Karya Prima', nama: 'Tiner Cobra Merah',        jumlah: 24, satuan: 'Kaleng',hargaModal: 18000,  hargaJual: 25000 },
    { id: uid(), tanggal: '2026-06-07', supplier: 'Buyaris',     nama: 'Sendok Semen Rush',        jumlah: 10, satuan: 'Lusin', hargaModal: 215000, hargaJual: 260000 },
    { id: uid(), tanggal: '2026-06-10', supplier: 'Kapusi',      nama: 'Tang Kombinasi 7',         jumlah: 30, satuan: 'Pcs',   hargaModal: 28000,  hargaJual: 38000 },
    // JULI
    { id: uid(), tanggal: '2026-07-05', supplier: 'Buyaris',     nama: 'Paku Seng MMK Jeruk',      jumlah: 8,  satuan: 'Dus',   hargaModal: 75000,  hargaJual: 95000 },
    // AGUSTUS
    { id: uid(), tanggal: '2026-08-04', supplier: 'Kapusi',      nama: 'Meter Hitam 5M',           jumlah: 15, satuan: 'Pcs',   hargaModal: 24000,  hargaJual: 32000 },
    { id: uid(), tanggal: '2026-08-06', supplier: 'SMS',         nama: 'Sarung Tangan Bintik',     jumlah: 8,  satuan: 'Lusin', hargaModal: 25000,  hargaJual: 35000 },
    { id: uid(), tanggal: '2026-08-09', supplier: 'Jotasindo',   nama: 'Cat Samurai Campur Warna', jumlah: 10, satuan: 'Lusin', hargaModal: 448000, hargaJual: 550000 },
    { id: uid(), tanggal: '2026-08-12', supplier: 'Buyaris',     nama: 'Kawat Hijau',              jumlah: 10, satuan: 'Rol',   hargaModal: 55000,  hargaJual: 70000 },
  ];
  store.utang = [
    { id: uid(), tanggal: '2026-05-04', keterangan: 'Hutang barang ke Kapusi (meteran & gergaji)', jumlah: 1710000, status: 'Lunas' },
    { id: uid(), tanggal: '2026-05-06', keterangan: 'Hutang kawat ke Buyaris',                     jumlah: 2640000, status: 'Belum Lunas' },
    { id: uid(), tanggal: '2026-06-02', keterangan: 'Hutang barang ke Kapusi (meteran & gerinda)', jumlah: 2478750, status: 'Lunas' },
    { id: uid(), tanggal: '2026-07-05', keterangan: 'Hutang paku seng ke Buyaris',                 jumlah: 600000,  status: 'Belum Lunas' },
    { id: uid(), tanggal: '2026-08-09', keterangan: 'Hutang cat samurai ke Jotasindo',              jumlah: 4480000, status: 'Belum Lunas' },
  ];
  store.piutang = [
    { id: uid(), tanggal: '2026-05-11', nama: 'Pak Herman', keterangan: 'Beli tang & gergaji kredit', jumlah: 150000, status: 'Lunas' },
    { id: uid(), tanggal: '2026-06-13', nama: 'Bu Wati',    keterangan: 'Beli sarung tangan & tiner kredit', jumlah: 200000, status: 'Belum Lunas' },
    { id: uid(), tanggal: '2026-07-09', nama: 'Pak Herman', keterangan: 'Beli meteran kredit', jumlah: 96000, status: 'Lunas' },
    { id: uid(), tanggal: '2026-08-07', nama: 'Bu Wati',    keterangan: 'Beli cat samurai kredit', jumlah: 550000, status: 'Belum Lunas' },
  ];
  store.uangKeluar = [
    { id: uid(), tanggal: '2026-05-10', keterangan: 'Bayar listrik toko',   jumlah: 400000 },
    { id: uid(), tanggal: '2026-05-13', keterangan: 'Gaji karyawan bulan Mei',    jumlah: 3000000 },
    { id: uid(), tanggal: '2026-06-09', keterangan: 'Bayar listrik toko',   jumlah: 420000 },
    { id: uid(), tanggal: '2026-06-13', keterangan: 'Gaji karyawan bulan Juni',   jumlah: 3000000 },
    { id: uid(), tanggal: '2026-07-10', keterangan: 'Bayar listrik toko',   jumlah: 430000 },
    { id: uid(), tanggal: '2026-07-13', keterangan: 'Gaji karyawan bulan Juli',   jumlah: 3000000 },
    { id: uid(), tanggal: '2026-07-22', keterangan: 'Servis motor pengiriman', jumlah: 350000 },
    { id: uid(), tanggal: '2026-08-11', keterangan: 'Bayar listrik toko',   jumlah: 450000 },
    { id: uid(), tanggal: '2026-08-13', keterangan: 'Gaji karyawan bulan Agustus', jumlah: 3000000 },
  ];
  store.barangTerjual = [
    // BENGKULU
    { id: uid(), ruteId: 'rute-bengkulu', perjalananId: 'pj-bengkulu-1', noFaktur: '0801', tanggal: '2026-05-13', pelanggan: 'Sutra Jaya',     nama: 'Meter Hitam 5M', jumlah: 20, satuan: 'Pcs', hargaJual: 32000 },
    { id: uid(), ruteId: 'rute-bengkulu', perjalananId: 'pj-bengkulu-1', noFaktur: '0801', tanggal: '2026-05-13', pelanggan: 'Sutra Jaya',     nama: 'Cat Samurai Campur Warna', jumlah: 4, satuan: 'Lusin', hargaJual: 550000 },
    { id: uid(), ruteId: 'rute-bengkulu', perjalananId: 'pj-bengkulu-2', noFaktur: '0802', tanggal: '2026-06-14', pelanggan: 'Citra',          nama: 'Kawat Hijau', jumlah: 15, satuan: 'Rol', hargaJual: 70000 },
    { id: uid(), ruteId: 'rute-bengkulu', perjalananId: 'pj-bengkulu-3', noFaktur: '0803', tanggal: '2026-07-15', pelanggan: 'Amanah',         nama: 'Sendok Semen Rush', jumlah: 2, satuan: 'Lusin', hargaJual: 260000 },
    { id: uid(), ruteId: 'rute-bengkulu', perjalananId: 'pj-bengkulu-3', noFaktur: '0803', tanggal: '2026-07-15', pelanggan: 'Amanah',         nama: 'Sarung Tangan Bintik', jumlah: 10, satuan: 'Lusin', hargaJual: 35000 },
    { id: uid(), ruteId: 'rute-bengkulu', perjalananId: 'pj-bengkulu-4', noFaktur: '0804', tanggal: '2026-08-16', pelanggan: 'Alvin Brother',  nama: 'Tang Kombinasi 7', jumlah: 12, satuan: 'Pcs', hargaJual: 38000 },
    { id: uid(), ruteId: 'rute-bengkulu', perjalananId: 'pj-bengkulu-4', noFaktur: '0804', tanggal: '2026-08-16', pelanggan: 'Alvin Brother',  nama: 'Tiner Cobra Merah', jumlah: 10, satuan: 'Kaleng', hargaJual: 25000 },
    // JAMBI
    { id: uid(), ruteId: 'rute-jambi', perjalananId: 'pj-jambi-1', noFaktur: '0805', tanggal: '2026-05-14', pelanggan: 'Berkat Jaya',       nama: 'Gergaji Kayu Kapusi', jumlah: 10, satuan: 'Pcs', hargaJual: 40000 },
    { id: uid(), ruteId: 'rute-jambi', perjalananId: 'pj-jambi-2', noFaktur: '0806', tanggal: '2026-06-16', pelanggan: 'Cahaya Abadi',      nama: 'Meter Hitam 7.5M', jumlah: 8, satuan: 'Pcs', hargaJual: 40000 },
    { id: uid(), ruteId: 'rute-jambi', perjalananId: 'pj-jambi-2', noFaktur: '0806', tanggal: '2026-06-16', pelanggan: 'Cahaya Abadi',      nama: 'Kawat Hijau', jumlah: 10, satuan: 'Rol', hargaJual: 70000 },
    { id: uid(), ruteId: 'rute-jambi', perjalananId: 'pj-jambi-3', noFaktur: '0807', tanggal: '2026-07-17', pelanggan: 'Toko Melati Jambi', nama: 'Sarung Tangan Bintik', jumlah: 10, satuan: 'Lusin', hargaJual: 35000 },
    { id: uid(), ruteId: 'rute-jambi', perjalananId: 'pj-jambi-4', noFaktur: '0808', tanggal: '2026-08-18', pelanggan: 'Sumber Rejeki',     nama: 'Cat Samurai Campur Warna', jumlah: 5, satuan: 'Lusin', hargaJual: 550000 },
    // RIAU
    { id: uid(), ruteId: 'rute-riau', perjalananId: 'pj-riau-1', noFaktur: '0809', tanggal: '2026-05-15', pelanggan: 'Riau Makmur',        nama: 'Pompa Amper Kodai', jumlah: 3, satuan: 'Buah', hargaJual: 48000 },
    { id: uid(), ruteId: 'rute-riau', perjalananId: 'pj-riau-2', noFaktur: '0810', tanggal: '2026-06-17', pelanggan: 'Sinar Pratama',      nama: 'Mesin Gerinda 710W', jumlah: 1, satuan: 'Pcs', hargaJual: 350000 },
    { id: uid(), ruteId: 'rute-riau', perjalananId: 'pj-riau-2', noFaktur: '0810', tanggal: '2026-06-17', pelanggan: 'Sinar Pratama',      nama: 'Meter Hitam 5M', jumlah: 15, satuan: 'Pcs', hargaJual: 32000 },
    { id: uid(), ruteId: 'rute-riau', perjalananId: 'pj-riau-3', noFaktur: '0811', tanggal: '2026-07-18', pelanggan: 'Usaha Baru',         nama: 'Kawat Hijau', jumlah: 15, satuan: 'Rol', hargaJual: 70000 },
    { id: uid(), ruteId: 'rute-riau', perjalananId: 'pj-riau-4', noFaktur: '0812', tanggal: '2026-08-19', pelanggan: 'Karya Mandiri',      nama: 'Tang Kombinasi 7', jumlah: 8, satuan: 'Pcs', hargaJual: 38000 },
    { id: uid(), ruteId: 'rute-riau', perjalananId: 'pj-riau-4', noFaktur: '0812', tanggal: '2026-08-19', pelanggan: 'Karya Mandiri',      nama: 'Paku Seng MMK Jeruk', jumlah: 3, satuan: 'Dus', hargaJual: 95000 },
    // MEDAN
    { id: uid(), ruteId: 'rute-medan', perjalananId: 'pj-medan-1', noFaktur: '0813', tanggal: '2026-05-16', pelanggan: 'Toko Barokah',      nama: 'Sarung Tangan Bintik', jumlah: 8, satuan: 'Lusin', hargaJual: 35000 },
    { id: uid(), ruteId: 'rute-medan', perjalananId: 'pj-medan-2', noFaktur: '0814', tanggal: '2026-06-19', pelanggan: 'Medan Sentosa',     nama: 'Gergaji Kayu Kapusi', jumlah: 8, satuan: 'Pcs', hargaJual: 40000 },
    { id: uid(), ruteId: 'rute-medan', perjalananId: 'pj-medan-2', noFaktur: '0814', tanggal: '2026-06-19', pelanggan: 'Medan Sentosa',     nama: 'Tiner Cobra Merah', jumlah: 8, satuan: 'Kaleng', hargaJual: 25000 },
    { id: uid(), ruteId: 'rute-medan', perjalananId: 'pj-medan-3', noFaktur: '0815', tanggal: '2026-07-19', pelanggan: 'Mitra Utama',       nama: 'Meter Hitam 7.5M', jumlah: 6, satuan: 'Pcs', hargaJual: 40000 },
    { id: uid(), ruteId: 'rute-medan', perjalananId: 'pj-medan-4', noFaktur: '0816', tanggal: '2026-08-20', pelanggan: 'Sari Bumi',         nama: 'Pompa Amper Kodai', jumlah: 4, satuan: 'Buah', hargaJual: 48000 },
    { id: uid(), ruteId: 'rute-medan', perjalananId: 'pj-medan-4', noFaktur: '0816', tanggal: '2026-08-20', pelanggan: 'Sari Bumi',         nama: 'Sendok Semen Rush', jumlah: 2, satuan: 'Lusin', hargaJual: 260000 },
  ];
  store.perjalananList = [
    { id: 'pj-bengkulu-1', ruteId: 'rute-bengkulu', tanggalMulai: '2026-05-13', tanggalSelesai: '2026-05-18' },
    { id: 'pj-bengkulu-2', ruteId: 'rute-bengkulu', tanggalMulai: '2026-06-14', tanggalSelesai: '2026-06-24' },
    { id: 'pj-bengkulu-3', ruteId: 'rute-bengkulu', tanggalMulai: '2026-07-15', tanggalSelesai: '2026-07-18' },
    { id: 'pj-bengkulu-4', ruteId: 'rute-bengkulu', tanggalMulai: '2026-08-09', tanggalSelesai: '2026-08-19' },
    { id: 'pj-jambi-1', ruteId: 'rute-jambi', tanggalMulai: '2026-05-14', tanggalSelesai: '2026-05-19' },
    { id: 'pj-jambi-2', ruteId: 'rute-jambi', tanggalMulai: '2026-06-16', tanggalSelesai: '2026-06-19' },
    { id: 'pj-jambi-3', ruteId: 'rute-jambi', tanggalMulai: '2026-07-17', tanggalSelesai: '2026-07-24' },
    { id: 'pj-jambi-4', ruteId: 'rute-jambi', tanggalMulai: '2026-08-10', tanggalSelesai: '2026-08-20' },
    { id: 'pj-riau-1', ruteId: 'rute-riau', tanggalMulai: '2026-05-15', tanggalSelesai: '2026-05-22' },
    { id: 'pj-riau-2', ruteId: 'rute-riau', tanggalMulai: '2026-06-17', tanggalSelesai: '2026-06-20' },
    { id: 'pj-riau-3', ruteId: 'rute-riau', tanggalMulai: '2026-07-18', tanggalSelesai: '2026-07-26' },
    { id: 'pj-riau-4', ruteId: 'rute-riau', tanggalMulai: '2026-08-19', tanggalSelesai: '2026-08-20' },
    { id: 'pj-medan-1', ruteId: 'rute-medan', tanggalMulai: '2026-05-16', tanggalSelesai: '2026-05-21' },
    { id: 'pj-medan-2', ruteId: 'rute-medan', tanggalMulai: '2026-06-19', tanggalSelesai: '2026-06-25' },
    { id: 'pj-medan-3', ruteId: 'rute-medan', tanggalMulai: '2026-07-19', tanggalSelesai: '2026-07-21' },
    { id: 'pj-medan-4', ruteId: 'rute-medan', tanggalMulai: '2026-08-11', tanggalSelesai: '2026-08-20' },
  ];
  store.rekapPiutang = [
    // BENGKULU (data asli "Rekap Piutang Pesisir Bengkulu")
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-01-08', nama: 'Slagan Tani',  noFaktur: 'PM - 0469', jumlah: 872000,  status: 'Belum Lunas' },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-02-25', nama: 'Naira',        noFaktur: 'PM - 0481', jumlah: 745000,  status: 'Lunas' },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-03-15', nama: 'Dua Putri',    noFaktur: 'PM - 0822', jumlah: 637000,  status: 'Belum Lunas' },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-02-24', nama: 'Syakira',      noFaktur: 'PM - 0480', jumlah: 1169000, status: 'Belum Lunas' },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-02-17', nama: 'Pak Edi',      noFaktur: 'PM - 0278', jumlah: 4641000, status: 'Lunas' },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-03-10', nama: 'Pak Edi',      noFaktur: 'PM - 0802', jumlah: 1332000, status: 'Belum Lunas' },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-01-27', nama: 'Saudara Jaya', noFaktur: 'PM - 0275', jumlah: 735000,  status: 'Lunas' },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-02-25', nama: 'Sumber',       noFaktur: 'PM - 0482', jumlah: 1130000, status: 'Lunas' },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-03-10', nama: 'Sumber',       noFaktur: 'PM - 0804', jumlah: 3286000, status: 'Belum Lunas' },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-01-27', nama: 'Bangun Tani',  noFaktur: 'PM - 0964', jumlah: 674000,  status: 'Belum Lunas' },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-03-15', nama: 'Eka Putri',    noFaktur: 'PM - 0827', jumlah: 2330000, status: 'Belum Lunas' },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2025-12-31', nama: 'Citra',        noFaktur: 'PM - 0044', jumlah: 2618000, status: 'Lunas' },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-03-10', nama: 'Citra',        noFaktur: 'PM - 0803', jumlah: 2385000, status: 'Belum Lunas' },
    // JAMBI
    { id: uid(), ruteId: 'rute-jambi', tanggal: '2026-02-10', nama: 'Toko Melati Jambi', noFaktur: 'PJ - 1001', jumlah: 450000, status: 'Belum Lunas' },
    { id: uid(), ruteId: 'rute-jambi', tanggal: '2026-03-05', nama: 'Cahaya Abadi',      noFaktur: 'PJ - 1015', jumlah: 620000, status: 'Lunas' },
    { id: uid(), ruteId: 'rute-jambi', tanggal: '2026-03-20', nama: 'Berkat Jaya',       noFaktur: 'PJ - 1030', jumlah: 980000, status: 'Belum Lunas' },
    // RIAU
    { id: uid(), ruteId: 'rute-riau', tanggal: '2026-02-12', nama: 'Riau Makmur',   noFaktur: 'PR - 2001', jumlah: 710000,  status: 'Lunas' },
    { id: uid(), ruteId: 'rute-riau', tanggal: '2026-03-08', nama: 'Sinar Pratama', noFaktur: 'PR - 2018', jumlah: 1240000, status: 'Belum Lunas' },
    { id: uid(), ruteId: 'rute-riau', tanggal: '2026-03-22', nama: 'Usaha Baru',    noFaktur: 'PR - 2033', jumlah: 890000,  status: 'Belum Lunas' },
    // MEDAN
    { id: uid(), ruteId: 'rute-medan', tanggal: '2026-02-14', nama: 'Toko Barokah',  noFaktur: 'PD - 3001', jumlah: 560000,  status: 'Lunas' },
    { id: uid(), ruteId: 'rute-medan', tanggal: '2026-03-10', nama: 'Medan Sentosa', noFaktur: 'PD - 3020', jumlah: 1480000, status: 'Belum Lunas' },
    { id: uid(), ruteId: 'rute-medan', tanggal: '2026-03-25', nama: 'Mitra Utama',   noFaktur: 'PD - 3035', jumlah: 925000,  status: 'Belum Lunas' },
  ];
  store.tagihan = [
    // BENGKULU (data asli "Tagihan Pesisir Bengkulu 2026")
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-04-10', nama: 'Lencana 2',       keterangan: 'Tagihan pengiriman', jumlah: 1545000 },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-04-10', nama: 'Sinar Timbulun',  keterangan: 'Tagihan pengiriman', jumlah: 638000 },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-04-10', nama: 'Sutra Jaya',      keterangan: 'Tagihan pengiriman', jumlah: 3000000 },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-04-10', nama: 'Citra',           keterangan: 'Tagihan pengiriman', jumlah: 2618000 },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-04-10', nama: 'Saudara Jaya',    keterangan: 'Tagihan pengiriman', jumlah: 735000 },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-04-10', nama: 'Sumber',          keterangan: 'Tagihan pengiriman', jumlah: 1130000 },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-04-10', nama: 'Amanah',          keterangan: 'Tagihan pengiriman', jumlah: 1238000 },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-04-10', nama: 'Lencana 1',       keterangan: 'Tagihan pengiriman', jumlah: 400000 },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-04-10', nama: 'Alvin Brother',   keterangan: 'Tagihan pengiriman', jumlah: 2625000 },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-04-10', nama: 'Alisha',          keterangan: 'Tagihan pengiriman', jumlah: 1055000 },
    { id: uid(), ruteId: 'rute-bengkulu', tanggal: '2026-04-10', nama: 'Chaniago',        keterangan: 'Tagihan pengiriman', jumlah: 1050000 },
    // JAMBI
    { id: uid(), ruteId: 'rute-jambi', tanggal: '2026-04-10', nama: 'Sumber Rejeki',     keterangan: 'Tagihan pengiriman', jumlah: 300000 },
    { id: uid(), ruteId: 'rute-jambi', tanggal: '2026-04-10', nama: 'Toko Melati Jambi', keterangan: 'Tagihan pengiriman', jumlah: 250000 },
    // RIAU
    { id: uid(), ruteId: 'rute-riau', tanggal: '2026-04-10', nama: 'Karya Mandiri', keterangan: 'Tagihan pengiriman', jumlah: 280000 },
    { id: uid(), ruteId: 'rute-riau', tanggal: '2026-04-10', nama: 'Riau Makmur',   keterangan: 'Tagihan pengiriman', jumlah: 320000 },
    // MEDAN
    { id: uid(), ruteId: 'rute-medan', tanggal: '2026-04-10', nama: 'Sari Bumi',      keterangan: 'Tagihan pengiriman', jumlah: 260000 },
    { id: uid(), ruteId: 'rute-medan', tanggal: '2026-04-10', nama: 'Medan Sentosa', keterangan: 'Tagihan pengiriman', jumlah: 340000 },
  ];
  store.uangKeluarLK = [
    { id: uid(), ruteId: 'rute-bengkulu', perjalananId: 'pj-bengkulu-1', tanggal: '2026-05-18', keterangan: 'Biaya BBM pengiriman', jumlah: 150000 },
    { id: uid(), ruteId: 'rute-jambi',    perjalananId: 'pj-jambi-1',    tanggal: '2026-05-19', keterangan: 'Biaya BBM pengiriman', jumlah: 180000 },
    { id: uid(), ruteId: 'rute-riau',     perjalananId: 'pj-riau-1',     tanggal: '2026-05-20', keterangan: 'Biaya BBM pengiriman', jumlah: 200000 },
    { id: uid(), ruteId: 'rute-medan',    perjalananId: 'pj-medan-1',    tanggal: '2026-05-21', keterangan: 'Biaya BBM pengiriman', jumlah: 220000 },
    { id: uid(), ruteId: 'rute-bengkulu', perjalananId: 'pj-bengkulu-2', tanggal: '2026-06-18', keterangan: 'Biaya BBM pengiriman', jumlah: 120000 },
    { id: uid(), ruteId: 'rute-jambi',    perjalananId: 'pj-jambi-2',    tanggal: '2026-06-19', keterangan: 'Biaya BBM pengiriman', jumlah: 160000 },
    { id: uid(), ruteId: 'rute-riau',     perjalananId: 'pj-riau-2',     tanggal: '2026-06-20', keterangan: 'Biaya BBM pengiriman', jumlah: 190000 },
    { id: uid(), ruteId: 'rute-medan',    perjalananId: 'pj-medan-2',    tanggal: '2026-06-21', keterangan: 'Biaya BBM pengiriman', jumlah: 210000 },
    { id: uid(), ruteId: 'rute-bengkulu', perjalananId: 'pj-bengkulu-3', tanggal: '2026-07-18', keterangan: 'Biaya BBM pengiriman', jumlah: 130000 },
    { id: uid(), ruteId: 'rute-jambi',    perjalananId: 'pj-jambi-3',    tanggal: '2026-07-19', keterangan: 'Biaya BBM pengiriman', jumlah: 150000 },
    { id: uid(), ruteId: 'rute-riau',     perjalananId: 'pj-riau-3',     tanggal: '2026-07-20', keterangan: 'Biaya BBM pengiriman', jumlah: 180000 },
    { id: uid(), ruteId: 'rute-medan',    perjalananId: 'pj-medan-3',    tanggal: '2026-07-21', keterangan: 'Biaya BBM pengiriman', jumlah: 200000 },
    { id: uid(), ruteId: 'rute-bengkulu', perjalananId: 'pj-bengkulu-4', tanggal: '2026-08-19', keterangan: 'Biaya BBM pengiriman', jumlah: 140000 },
    { id: uid(), ruteId: 'rute-jambi',    perjalananId: 'pj-jambi-4',    tanggal: '2026-08-20', keterangan: 'Biaya BBM pengiriman', jumlah: 170000 },
    { id: uid(), ruteId: 'rute-riau',     perjalananId: 'pj-riau-4',     tanggal: '2026-08-20', keterangan: 'Biaya BBM pengiriman', jumlah: 210000 },
    { id: uid(), ruteId: 'rute-medan',    perjalananId: 'pj-medan-4',    tanggal: '2026-08-20', keterangan: 'Biaya BBM pengiriman', jumlah: 230000 },
  ];
  store.uangMasuk = [
    { id: uid(), ruteId: 'rute-riau',     perjalananId: 'pj-riau-1',     tanggal: '2026-05-22', keterangan: 'DP proyek Riau Makmur', jumlah: 500000 },
    { id: uid(), ruteId: 'rute-bengkulu', perjalananId: 'pj-bengkulu-2', tanggal: '2026-06-24', keterangan: 'Pelunasan piutang & tagihan Saudara Jaya', jumlah: 1500000 },
    { id: uid(), ruteId: 'rute-medan',    perjalananId: 'pj-medan-2',    tanggal: '2026-06-25', keterangan: 'Pelunasan piutang Toko Barokah', jumlah: 1000000 },
    { id: uid(), ruteId: 'rute-jambi',    perjalananId: 'pj-jambi-3',    tanggal: '2026-07-24', keterangan: 'Pelunasan piutang Berkat Jaya', jumlah: 1200000 },
    { id: uid(), ruteId: 'rute-riau',     perjalananId: 'pj-riau-3',     tanggal: '2026-07-26', keterangan: 'DP proyek Usaha Baru', jumlah: 1400000 },
    { id: uid(), ruteId: 'rute-bengkulu', perjalananId: 'pj-bengkulu-4', tanggal: '2026-08-09', keterangan: 'Pelunasan piutang Sumber (sebagian)', jumlah: 2500000 },
    { id: uid(), ruteId: 'rute-jambi',    perjalananId: 'pj-jambi-4',    tanggal: '2026-08-10', keterangan: 'Pelunasan piutang Sumber Rejeki', jumlah: 1800000 },
    { id: uid(), ruteId: 'rute-medan',    perjalananId: 'pj-medan-4',    tanggal: '2026-08-11', keterangan: 'Pelunasan piutang Mitra Utama', jumlah: 1500000 },
  ];
  saveStore();
}
seedData();

/* ========================
   ROUTER
   ======================== */
const pageMap = {
  'dashboard':       renderDashboard,
  'barang-masuk':    () => renderList('barangMasuk'),
  'utang':           () => renderList('utang'),
  'piutang':         () => renderList('piutang'),
  'uang-keluar':     () => renderList('uangKeluar'),
  'barang-terjual':  () => renderList('barangTerjual'),
  'rekap-piutang':   () => renderList('rekapPiutang'),
  'tagihan':         () => renderList('tagihan'),
  'uang-keluar-lk':  () => renderList('uangKeluarLK'),
  'uang-masuk':      () => renderList('uangMasuk'),
  'perjalanan-list': () => renderPerjalananList(currentRuteId),
  'stok-toko':       renderStok,
  'laporan-keuangan':renderLaporan,
  'pengaturan-rute': () => renderList('ruteList'),
};

const pageTitles = {
  'dashboard':       'Dashboard',
  'barang-masuk':    'Barang Masuk',
  'utang':           'Utang',
  'piutang':         'Piutang',
  'uang-keluar':     'Uang Keluar',
  'barang-terjual':  'Barang Terjual (Rute)',
  'rekap-piutang':   'Rekap Piutang (Rute)',
  'tagihan':         'Tagihan (Rute)',
  'uang-keluar-lk':  'Uang Keluar (Rute)',
  'uang-masuk':      'Uang Masuk (Rute)',
  'perjalanan-list': 'Daftar Perjalanan',
  'stok-toko':       'Stok Toko',
  'laporan-keuangan':'Laporan Keuangan',
  'pengaturan-rute': 'Manajemen Rute',
};

let currentPage = 'dashboard';
let currentRuteId = null;
let currentPerjalananId = null;

/* ========================
   DATE FILTER (tabel-tabel pencatatan)
   ======================== */
const listFilters = {};

function getAvailableMonthYears(key) {
  let data = store[key] || [];
  if (currentRuteId && key !== 'ruteList') {
    data = data.filter(x => x.ruteId === currentRuteId);
  }
  const months = new Set(), years = new Set();
  data.forEach(x => {
    if (!x.tanggal) return;
    const { m, y } = getMonthYear(x.tanggal);
    months.add(m);
    years.add(y);
  });
  return {
    months: [...months].sort((a, b) => a - b),
    years: [...years].sort((a, b) => a - b),
  };
}

function applyDateFilter(items, key) {
  const f = listFilters[key];
  if (!f || (f.bulan === '' && f.tahun === '')) return items;
  return items.filter(x => {
    if (!x.tanggal) return false;
    const { m, y } = getMonthYear(x.tanggal);
    if (f.bulan !== '' && m !== Number(f.bulan)) return false;
    if (f.tahun !== '' && y !== Number(f.tahun)) return false;
    return true;
  });
}

function dateFilterInputsHtml(key) {
  const f = listFilters[key];
  const avail = getAvailableMonthYears(key);
  const bulanOptions = avail.months.map(m =>
    `<option value="${m}" ${String(f.bulan) === String(m) ? 'selected' : ''}>${MONTHS[m]}</option>`).join('');
  const tahunOptions = avail.years.map(y =>
    `<option value="${y}" ${String(f.tahun) === String(y) ? 'selected' : ''}>${y}</option>`).join('');
  return `
    <select class="form-select" id="filter-bulan-${key}" style="width:150px;">
      <option value="">Semua Bulan</option>
      ${bulanOptions}
    </select>
    <select class="form-select" id="filter-tahun-${key}" style="width:110px;">
      <option value="">Semua Tahun</option>
      ${tahunOptions}
    </select>`;
}

function refreshTableBody(key) {
  const searchInput = document.getElementById(`search-${key}`);
  renderTableBody(key, searchInput ? searchInput.value.toLowerCase().trim() : '');
}

/* ========================
   NAVIGATION HISTORY (tombol Kembali)
   ======================== */
let navDepth = 0;

function updateBackButton() {
  const btn = document.getElementById('btn-global-back');
  if (btn) btn.disabled = navDepth <= 0;
}

function pushNavState(state, opts = {}) {
  if (opts.fromHistory) return;
  if (opts.replace) {
    history.replaceState(state, '', '');
  } else {
    navDepth++;
    history.pushState(state, '', '');
  }
  updateBackButton();
}

window.addEventListener('popstate', (e) => {
  navDepth = Math.max(0, navDepth - 1);
  updateBackButton();
  const state = e.state;
  if (!state || state.type === 'page') {
    navigate(state ? state.page : 'dashboard', state ? state.ruteId : null, { fromHistory: true });
  } else if (state.type === 'pjMenu') {
    openPerjalananMenu(state.ruteId, state.perjalananId, { fromHistory: true });
  } else if (state.type === 'pjCategory') {
    openPerjalananCategory(state.ruteId, state.perjalananId, state.key, { fromHistory: true });
  }
});

function navigate(page, ruteId = null, opts = {}) {
  currentPage = page;
  currentRuteId = ruteId;
  currentPerjalananId = null;

  document.querySelectorAll('.nav-item').forEach(el => {
    const matchPage = el.dataset.page === page;
    if (el.dataset.rute) {
      el.classList.toggle('active', matchPage && el.dataset.rute === ruteId);
    } else {
      el.classList.toggle('active', matchPage);
    }
  });

  let title = pageTitles[page] || page;
  if (ruteId) {
    const r = store.ruteList.find(x => x.id === ruteId);
    if (r) title += ` - ${r.nama}`;
  }
  document.getElementById('topbar-title').textContent = title;

  const content = document.getElementById('content');
  content.innerHTML = '';

  const fn = pageMap[page];
  if (fn) fn();

  // close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');

  pushNavState({ type: 'page', page, ruteId }, opts);
}

function renderRuteSidebar() {
  const container = document.getElementById('dynamic-rute-sidebar');
  if (!container) return;
  
  let html = '';
  store.ruteList.forEach(rute => {
    html += `
      <div class="nav-section-label collapsible" onclick="toggleSubmenu('submenu-rute-${rute.id}')">
        <span>📁 ${rute.nama}</span>
        <span class="chevron" id="chevron-rute-${rute.id}">▼</span>
      </div>
      <div class="submenu" id="submenu-rute-${rute.id}">
        <a class="nav-item" data-page="perjalanan-list" data-rute="${rute.id}">
          <span class="nav-icon">🚚</span><span>Daftar Perjalanan</span>
        </a>
      </div>
    `;
  });
  container.innerHTML = html;
}

/* ========================
   TOPBAR DATE
   ======================== */
function updateDate() {
  const d = new Date();
  document.getElementById('date-display').textContent =
    `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/* ========================
   SIDEBAR TOGGLE (mobile)
   ======================== */
document.getElementById('sidebar-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

/* ========================
   NAV ITEMS DELEGATION
   ======================== */
document.querySelector('.sidebar-nav').addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (item && item.dataset.page) {
    navigate(item.dataset.page, item.dataset.rute);
  }
});

/* ========================
   MODAL HELPERS
   ======================== */
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle   = document.getElementById('modal-title');
const modalBody    = document.getElementById('modal-body');

function openModal(title, bodyHTML, onSubmit) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHTML;
  modalOverlay.classList.add('open');
  const form = modalBody.querySelector('form');
  if (form && onSubmit) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      onSubmit(form);
    });
  }
}

function closeModal() {
  modalOverlay.classList.remove('open');
  setTimeout(() => { modalBody.innerHTML = ''; }, 300);
}

document.getElementById('modal-close').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

/* ========================
   TOAST
   ======================== */
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

/* ========================
   GENERIC SUM HELPERS
   ======================== */
function sumField(arr, field) {
  return arr.reduce((s, x) => s + Number(x[field] || 0), 0);
}

function filterCurrentMonth(arr, field = 'tanggal') {
  const now = new Date();
  return arr.filter(x => {
    const { m, y } = getMonthYear(x[field]);
    return m === now.getMonth() && y === now.getFullYear();
  });
}

function getStokToko() {
  const map = {};
  store.barangMasuk.forEach(b => {
    const key = b.nama;
    if (!map[key]) {
      const jml1 = Number(b.jumlah1 || b.jumlah || 1);
      const jml2 = Number(b.jumlah2 || b.jumlah || 1);
      const konversi = Math.max(1, Math.floor(jml2 / jml1));
      map[key] = {
        nama: b.nama,
        satuan1: b.satuan1 || b.satuan,
        satuan2: b.satuan2 || b.satuan,
        konversi: konversi,
        stokKecil: 0,
        hargaModal: b.hargaModal || 0,
        hargaJual1: b.hargaJual1 || b.hargaJual || 0,
        hargaJual2: b.hargaJual2 || b.hargaJual || 0
      };
    }
    map[key].stokKecil += Number(b.jumlah2 || b.jumlah || 0);
    map[key].hargaModal = b.hargaModal || 0; // use latest
    map[key].hargaJual1 = b.hargaJual1 || b.hargaJual || 0;
    map[key].hargaJual2 = b.hargaJual2 || b.hargaJual || 0;
  });

  store.barangTerjual.forEach(b => {
    const key = b.nama;
    if (map[key]) {
      if (b.satuan === map[key].satuan1 && map[key].satuan1 !== map[key].satuan2) {
        map[key].stokKecil -= Number(b.jumlah || 0) * map[key].konversi;
      } else {
        map[key].stokKecil -= Number(b.jumlah || 0);
      }
    }
  });

  const items = Object.values(map).sort((a, b) =>
    a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' })
  );

  const totalModal = items.reduce((s,x) => s + (x.stokKecil / x.konversi) * x.hargaModal, 0);
  const totalJual = items.reduce((s,x) => s + (x.stokKecil / x.konversi) * (x.hargaJual2 || x.hargaJual1), 0);
  
  return { items, totalModal, totalJual };
}

/* ========================
   DASHBOARD
   ======================== */
function renderDashboard() {
  const stok = getStokToko();

  const lowStocks = stok.items
    .filter(x => x.stokKecil <= 5)
    .map(x => ({ 
      nama: x.nama, 
      sisa: x.stokKecil, 
      sisaTxt: formatStock(x.stokKecil, x.konversi, x.satuan1, x.satuan2) 
    }));

  // totals (all time for cards, current month for report)
  const cur = {
    uangMasuk:     sumField(filterCurrentMonth(store.uangMasuk), 'jumlah') +
                   sumField(filterCurrentMonth(store.barangTerjual).map(b => ({ j: b.jumlah * b.hargaJual })), 'j'),
    uangKeluar:    sumField(filterCurrentMonth(store.uangKeluar), 'jumlah') +
                   sumField(filterCurrentMonth(store.uangKeluarLK), 'jumlah'),
    belanjaBarang: filterCurrentMonth(store.barangMasuk).reduce((s, b) => s + Number(b.jumlah1 || b.jumlah || 0) * Number(b.hargaModal || 0), 0),
    piutang:       sumField(store.piutang.filter(x => x.status !== 'Lunas'), 'jumlah') +
                   sumField(store.rekapPiutang.filter(x => x.status !== 'Lunas'), 'jumlah'),
    utang:         sumField(store.utang.filter(x => x.status !== 'Lunas'), 'jumlah'),
    penjualan:     sumField(filterCurrentMonth(store.barangTerjual).map(b => ({ j: b.jumlah * b.hargaJual })), 'j'),
    stokNilai:     stok.totalModal,
  };
  const laba = cur.uangMasuk - cur.uangKeluar - cur.belanjaBarang;
  const labaPos = laba >= 0;

  // Cek Utang Jatuh Tempo (Asumsi 30 Hari)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const utangOverdue = store.utang.filter(u => u.status !== 'Lunas' && new Date(u.tanggal) <= thirtyDaysAgo);

  let alertsHtml = '';
  if (lowStocks.length > 0) {
    alertsHtml += `
      <div style="background: var(--bg-card); border-left: 4px solid var(--red); padding: 16px; border-radius: 8px; margin-bottom: 24px; display: flex; gap: 16px; align-items: flex-start;">
        <div style="font-size: 24px;">⚠️</div>
        <div>
          <h4 style="color: var(--text-primary); margin: 0 0 8px 0;">Peringatan Stok Habis / Menipis</h4>
          <ul style="margin:0; padding-left:20px; color:var(--text-secondary); font-size:14px;">
            ${lowStocks.map(s => `<li style="color:${s.sisa <= 0 ? 'var(--red)' : 'var(--orange)'}">${s.nama}: <strong>${s.sisaTxt}</strong> ${s.sisa <= 0 ? '(HABIS)' : '(Sisa Sedikit)'}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  }
  
  if (utangOverdue.length > 0) {
    alertsHtml += `
      <div style="background: var(--bg-card); border-left: 4px solid var(--orange); padding: 16px; border-radius: 8px; margin-bottom: 24px; display: flex; gap: 16px; align-items: flex-start;">
        <div style="font-size: 24px;">🔔</div>
        <div>
          <h4 style="color: var(--text-primary); margin: 0 0 8px 0;">Peringatan Utang Jatuh Tempo (>30 Hari)</h4>
          <ul style="margin:0; padding-left:20px; color:var(--text-secondary); font-size:14px;">
            ${utangOverdue.map(u => `<li>${formatDate(u.tanggal)} - ${u.keterangan}: <strong class="amount-negative">${fmt(u.jumlah)}</strong></li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  const html = `
  <div class="page-anim">
    <div class="page-header">
      <div>
        <div class="page-title">Dashboard</div>
        <div class="page-subtitle"><span class="live-dot"></span>Ringkasan kondisi toko bulan ini</div>
      </div>
    </div>
    
    ${alertsHtml}

    <div class="profit-card">
      <div class="profit-card-left">
        <h3>Estimasi ${labaPos ? 'Keuntungan' : 'Kerugian'} Bulan Ini</h3>
        <div class="big-val">${fmt(Math.abs(laba))}</div>
      </div>
      <div class="profit-icon">${labaPos ? '📈' : '📉'}</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card green">
        <div class="stat-icon green">💰</div>
        <div class="stat-label">Uang Masuk (Bulan Ini)</div>
        <div class="stat-value">${fmt(cur.uangMasuk)}</div>
      </div>
      <div class="stat-card red">
        <div class="stat-icon red">💸</div>
        <div class="stat-label">Uang Keluar (Bulan Ini)</div>
        <div class="stat-value">${fmt(cur.uangKeluar)}</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-icon blue">🚛</div>
        <div class="stat-label">Penjualan Luar Kota</div>
        <div class="stat-value">${fmt(cur.penjualan)}</div>
      </div>
      <div class="stat-card yellow">
        <div class="stat-icon yellow">💳</div>
        <div class="stat-label">Total Piutang Aktif</div>
        <div class="stat-value">${fmt(cur.piutang)}</div>
      </div>
      <div class="stat-card red">
        <div class="stat-icon red">📋</div>
        <div class="stat-label">Total Utang</div>
        <div class="stat-value">${fmt(cur.utang)}</div>
      </div>
      <div class="stat-card purple">
        <div class="stat-icon purple">🏪</div>
        <div class="stat-label">Nilai Stok Toko</div>
        <div class="stat-value">${fmt(cur.stokNilai)}</div>
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="card">
        <div class="card-header">
          <div class="card-title">📦 Stok Barang (Real-Time)</div>
        </div>
        <div class="recent-list">
          ${(function() {
            const recentNames = [...new Set(store.barangMasuk.slice().reverse().map(b => b.nama))].slice(0, 5);
            const recentItems = recentNames.map(name => stok.items.find(x => x.nama === name)).filter(Boolean);
            return recentItems.map(item => {
              const sisaTxt = formatStock(item.stokKecil, item.konversi, item.satuan1, item.satuan2);
              return `
              <div class="recent-item">
                <div class="recent-item-left">
                  <span class="recent-item-name">${item.nama}</span>
                  <span class="recent-item-date">Stok saat ini</span>
                </div>
                <span class="badge badge-blue">${sisaTxt}</span>
              </div>
              `;
            }).join('') || '<div class="empty-state"><div class="empty-state-sub">Belum ada data</div></div>';
          })()}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">💳 Piutang Aktif</div>
        </div>
        <div class="recent-list">
          ${store.piutang.filter(x => x.status !== 'Lunas').slice(-5).reverse().map(p => `
            <div class="recent-item">
              <div class="recent-item-left">
                <span class="recent-item-name">${p.nama}</span>
                <span class="recent-item-date">${formatDate(p.tanggal)}</span>
              </div>
              <span class="recent-item-amount amount-positive">${fmt(p.jumlah)}</span>
            </div>
          `).join('') || '<div class="empty-state"><div class="empty-state-sub">Tidak ada piutang aktif</div></div>'}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">💸 Uang Keluar Terbaru</div>
      </div>
      <div class="recent-list">
        ${[...store.uangKeluar, ...store.uangKeluarLK].sort((a,b)=>b.tanggal.localeCompare(a.tanggal)).slice(0,6).map(k => `
          <div class="recent-item">
            <div class="recent-item-left">
              <span class="recent-item-name">${k.keterangan}</span>
              <span class="recent-item-date">${formatDate(k.tanggal)}</span>
            </div>
            <span class="recent-item-amount amount-negative">-${fmt(k.jumlah)}</span>
          </div>
        `).join('') || '<div class="empty-state"><div class="empty-state-sub">Belum ada data</div></div>'}
      </div>
    </div>
  </div>`;

  document.getElementById('content').innerHTML = html;
}

/* ========================
   GENERIC LIST CONFIG
   ======================== */
const listConfig = {
  barangMasuk: {
    title: 'Barang Masuk',
    subtitle: 'Pencatatan barang masuk ke toko utama',
    icon: '📦',
    addLabel: '+ Tambah Barang Masuk',
    columns: ['No','Supplier / Tanggal','Nama Barang','Isi (Besar)','Isi (Ecer)','Harga Modal','Harga Jual','Aksi'],
    grouped: true,
    groupKeyFn: b => `${b.supplier}__${b.tanggal}`,
    groupHeaderFn: (group) => `<td class="supplier-cell" rowspan="__ROWSPAN__">
      <div class="supplier-cell-inner">
        <div class="supplier-name">${group.rows[0].supplier}</div>
        <div class="supplier-date">${formatDate(group.rows[0].tanggal)}</div>
      </div></td>`,
    itemCellsFn: b => `
      <td class="primary">${b.nama}</td>
      <td>${fmtNum(b.jumlah1 || b.jumlah)} <span class="badge badge-blue">${b.satuan1 || b.satuan}</span></td>
      <td>${fmtNum(b.jumlah2 || b.jumlah)} <span class="badge badge-orange">${b.satuan2 || b.satuan}</span></td>
      <td>${fmt(b.hargaModal)}<br><small class="text-muted">/ ${b.satuan1 || b.satuan}</small></td>
      <td>
        ${fmt(b.hargaJual1 || b.hargaJual)} <small class="text-muted">/ ${b.satuan1 || b.satuan}</small><br>
        ${fmt(b.hargaJual2 || b.hargaJual)} <small class="text-muted">/ ${b.satuan2 || b.satuan}</small>
      </td>`,
    subtotalFn: null,
    formFn: formBarangMasuk,
    searchFn: (b, q) => `${b.nama} ${b.supplier}`.toLowerCase().includes(q),
  },
  utang: {
    title: 'Utang',
    subtitle: 'Catatan utang toko utama',
    icon: '📋',
    addLabel: '+ Tambah Utang',
    columns: ['No','Tanggal','Keterangan','Jumlah','Status','Aksi'],
    grouped: false,
    rowFn: (x) => `<td>${formatDate(x.tanggal)}</td><td class="primary">${x.keterangan}</td><td class="amount-negative">${fmt(x.jumlah)}</td>${statusBadgeCell('utang', x)}`,
    formFn: formUtang,
    searchFn: (x, q) => x.keterangan.toLowerCase().includes(q),
  },
  piutang: {
    title: 'Piutang',
    subtitle: 'Catatan piutang toko utama',
    icon: '💳',
    addLabel: '+ Tambah Piutang',
    columns: ['No','Nama Toko','Tanggal','No Faktur','Jumlah','Status','Aksi'],
    grouped: true,
    groupKeyFn: x => x.nama,
    groupHeaderFn: (group) => `<td class="supplier-cell" rowspan="__ROWSPAN__">
      <div class="supplier-cell-inner">
        <div class="supplier-name">${group.rows[0].nama}</div>
      </div></td>`,
    itemCellsFn: x => `
      <td>${formatDate(x.tanggal)}</td>
      <td>${x.noFaktur || '-'}</td>
      <td class="amount-positive">${fmt(x.jumlah)}</td>
      ${statusBadgeCell('piutang', x)}`,
    subtotalFn: rows => rows.reduce((s,x) => s + Number(x.jumlah || 0), 0),
    subtotalCols: 3,
    formFn: formPiutang,
    searchFn: (x, q) => `${x.nama} ${x.noFaktur}`.toLowerCase().includes(q),
  },
  uangKeluar: {
    title: 'Uang Keluar',
    subtitle: 'Pengeluaran toko utama',
    icon: '💸',
    addLabel: '+ Tambah Uang Keluar',
    columns: ['No','Tanggal','Keterangan','Jumlah','Aksi'],
    grouped: false,
    rowFn: (x) => `<td>${formatDate(x.tanggal)}</td><td class="primary">${x.keterangan}</td><td class="amount-negative">-${fmt(x.jumlah)}</td>`,
    formFn: formSimple(['keterangan:Keterangan','jumlah:Jumlah (Rp)']),
    searchFn: (x, q) => x.keterangan.toLowerCase().includes(q),
  },
  barangTerjual: {
    title: 'Barang Terjual (Luar Kota)',
    subtitle: 'Pencatatan penjualan rute luar kota',
    icon: '🚛',
    addLabel: '+ Tambah Barang Terjual',
    columns: ['No','Nama Toko','No PM','Tanggal','Nama Barang','Qty','Harga','Jumlah','Aksi'],
    grouped: true,
    groupKeyFn: b => `${b.pelanggan}__${b.noFaktur || ''}__${b.tanggal}`,
    groupHeaderFn: (group) => `
      <td class="supplier-cell" rowspan="__ROWSPAN__"><div class="supplier-name">${group.rows[0].pelanggan}</div></td>
      <td rowspan="__ROWSPAN__">${group.rows[0].noFaktur || '-'}</td>
      <td rowspan="__ROWSPAN__">${formatDate(group.rows[0].tanggal)}</td>`,
    itemCellsFn: b => `
      <td class="primary">${b.nama}</td>
      <td>${fmtNum(b.jumlah)} ${b.satuan}</td>
      <td>${fmt(b.hargaJual)}</td>
      <td class="amount-positive">${fmt(b.jumlah * b.hargaJual)}</td>`,
    subtotalFn: rows => rows.reduce((s,b) => s + b.jumlah * b.hargaJual, 0),
    subtotalCols: 5,
    formFn: formBarangTerjual,
    searchFn: (b, q) => `${b.nama} ${b.pelanggan}`.toLowerCase().includes(q),
  },
  rekapPiutang: {
    title: 'Rekap Piutang (Luar Kota)',
    subtitle: 'Piutang dari rute luar kota',
    icon: '📑',
    addLabel: '+ Tambah Rekap Piutang',
    columns: ['No','Nama Toko','Tanggal','No Faktur','Jumlah','Status','Aksi'],
    grouped: true,
    groupKeyFn: x => x.nama,
    groupHeaderFn: (group) => `<td class="supplier-cell" rowspan="__ROWSPAN__">
      <div class="supplier-cell-inner">
        <div class="supplier-name">${group.rows[0].nama}</div>
      </div></td>`,
    itemCellsFn: x => `
      <td>${formatDate(x.tanggal)}</td>
      <td>${x.noFaktur || '-'}</td>
      <td class="amount-positive">${fmt(x.jumlah)}</td>
      ${statusBadgeCell('rekapPiutang', x)}`,
    subtotalFn: rows => rows.reduce((s,x) => s + Number(x.jumlah || 0), 0),
    subtotalCols: 3,
    formFn: formRekapPiutang,
    searchFn: (x, q) => `${x.nama} ${x.noFaktur}`.toLowerCase().includes(q),
  },
  tagihan: {
    title: 'Tagihan (Luar Kota)',
    subtitle: 'Tagihan dari rute luar kota',
    icon: '🧾',
    addLabel: '+ Tambah Tagihan',
    columns: ['No','Nama / Tanggal','Keterangan','Jumlah','Aksi'],
    grouped: true,
    groupKeyFn: x => `${x.nama}__${x.tanggal}`,
    groupHeaderFn: (group) => `<td class="supplier-cell" rowspan="__ROWSPAN__">
      <div class="supplier-cell-inner">
        <div class="supplier-name">${group.rows[0].nama}</div>
        <div class="supplier-date">${formatDate(group.rows[0].tanggal)}</div>
      </div></td>`,
    itemCellsFn: x => `<td class="primary">${x.keterangan}</td><td>${fmt(x.jumlah)}</td>`,
    subtotalFn: rows => rows.reduce((s,x) => s + Number(x.jumlah || 0), 0),
    subtotalCols: 2,
    formFn: formSimple(['nama:Nama','keterangan:Keterangan','jumlah:Jumlah (Rp)']),
    searchFn: (x, q) => `${x.nama} ${x.keterangan}`.toLowerCase().includes(q),
  },
  uangKeluarLK: {
    title: 'Uang Keluar (Luar Kota)',
    subtitle: 'Pengeluaran selama rute luar kota',
    icon: '💸',
    addLabel: '+ Tambah Uang Keluar',
    columns: ['No','Tanggal','Keterangan','Jumlah','Aksi'],
    grouped: false,
    rowFn: (x) => `<td>${formatDate(x.tanggal)}</td><td class="primary">${x.keterangan}</td><td class="amount-negative">-${fmt(x.jumlah)}</td>`,
    formFn: formSimple(['keterangan:Keterangan','jumlah:Jumlah (Rp)']),
    searchFn: (x, q) => x.keterangan.toLowerCase().includes(q),
  },
  uangMasuk: {
    title: 'Uang Masuk (Luar Kota)',
    subtitle: 'Penerimaan uang rute luar kota',
    icon: '💰',
    addLabel: '+ Tambah Uang Masuk',
    columns: ['No','Tanggal','Keterangan','Jumlah','Aksi'],
    grouped: false,
    rowFn: (x) => `<td>${formatDate(x.tanggal)}</td><td class="primary">${x.keterangan}</td><td class="amount-positive">${fmt(x.jumlah)}</td>`,
    formFn: formSimple(['keterangan:Keterangan','jumlah:Jumlah (Rp)']),
    searchFn: (x, q) => x.keterangan.toLowerCase().includes(q),
  },
  ruteList: {
    title: 'Manajemen Rute',
    subtitle: 'Kelola daftar rute luar kota',
    icon: '⚙️',
    addLabel: '+ Tambah Rute',
    columns: ['No', 'Nama Rute', 'Aksi'],
    grouped: false,
    rowFn: (x) => `<td class="primary">${x.nama}</td>`,
    formFn: formSimple(['nama:Nama Rute']),
    searchFn: (x, q) => x.nama.toLowerCase().includes(q),
  }
};

/* ========================
   PERJALANAN (per-trip grouping for rute data)
   ======================== */
function formPerjalanan(data = {}) {
  return `<form id="modal-form">
    <div class="form-group form-full">
      <label class="form-label">Tanggal Mulai</label>
      <input type="date" class="form-input" name="tanggalMulai" value="${data.tanggalMulai || today()}" required />
    </div>
    <div class="form-group form-full">
      <label class="form-label">Tanggal Selesai</label>
      <input type="date" class="form-input" name="tanggalSelesai" value="${data.tanggalSelesai || today()}" required />
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Batal</button>
      <button type="submit" class="btn btn-primary">💾 Simpan</button>
    </div>
  </form>`;
}

function openAddPerjalanan(ruteId) {
  openModal('🚚 Tambah Perjalanan', formPerjalanan(), (form) => {
    const fd = Object.fromEntries(new FormData(form));
    fd.id = uid();
    fd.ruteId = ruteId;
    store.perjalananList.push(fd);
    saveStore();
    closeModal();
    renderPerjalananList(ruteId);
    showToast('Perjalanan berhasil ditambahkan!', 'success');
  });
}

function openEditPerjalanan(id) {
  const item = store.perjalananList.find(x => x.id === id);
  if (!item) return;
  openModal('✏️ Edit Perjalanan', formPerjalanan(item), (form) => {
    const fd = Object.fromEntries(new FormData(form));
    const idx = store.perjalananList.findIndex(x => x.id === id);
    store.perjalananList[idx] = { ...item, ...fd };
    saveStore();
    closeModal();
    renderPerjalananList(item.ruteId);
    showToast('Perjalanan berhasil diperbarui!', 'success');
  });
}

function deletePerjalanan(id, ruteId) {
  const html = `
    <div style="padding:10px 0 20px;text-align:center">
      <p style="margin-bottom:8px;font-size:15px;color:var(--text-secondary)">Yakin ingin menghapus perjalanan ini?</p>
      <p style="margin-bottom:20px;font-size:13px;color:var(--text-muted)">Data transaksi yang sudah tercatat di dalamnya tidak akan terhapus, tapi tidak akan muncul di perjalanan manapun.</p>
      <div style="display:flex;justify-content:center;gap:12px">
        <button type="button" class="btn btn-ghost" onclick="closeModal(); document.getElementById('modal').style.maxWidth = '';">Batal</button>
        <button type="button" class="btn btn-danger" id="btn-confirm-del-pj">Ya, Hapus</button>
      </div>
    </div>
  `;
  document.getElementById('modal').style.maxWidth = '400px';
  openModal('⚠️ Konfirmasi Hapus', html, null);

  document.getElementById('btn-confirm-del-pj').addEventListener('click', () => {
    store.perjalananList = store.perjalananList.filter(x => x.id !== id);
    saveStore();
    closeModal();
    document.getElementById('modal').style.maxWidth = '';
    renderPerjalananList(ruteId);
    showToast('Perjalanan berhasil dihapus.', 'info');
  });
}

function perjalananLabel(pj) {
  return `${formatDate(pj.tanggalMulai)} — ${formatDate(pj.tanggalSelesai)}`;
}

function renderPerjalananList(ruteId) {
  const content = document.getElementById('content');
  const rute = store.ruteList.find(x => x.id === ruteId);
  const trips = store.perjalananList
    .filter(x => x.ruteId === ruteId)
    .slice()
    .sort((a, b) => b.tanggalMulai.localeCompare(a.tanggalMulai));

  function countRecords(pj) {
    const keys = ['barangTerjual', 'rekapPiutang', 'tagihan', 'uangKeluarLK', 'uangMasuk'];
    return keys.reduce((s, k) => s + store[k].filter(x => x.perjalananId === pj.id).length, 0);
  }

  const html = `
  <div class="page-anim">
    <div class="page-header">
      <div>
        <div class="page-title">🚚 Daftar Perjalanan</div>
        <div class="page-subtitle">Setiap perjalanan (sekali jalan) untuk rute ${rute ? rute.nama : ''} punya laporannya sendiri</div>
      </div>
      <button class="btn btn-primary" id="btn-add-perjalanan">+ Tambah Perjalanan</button>
    </div>
    <div class="card">
      <div class="card-header">
        <div class="card-title">Perjalanan Rute ${rute ? rute.nama : ''}</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>No</th><th>Periode Perjalanan</th><th>Jumlah Transaksi</th><th>Aksi</th></tr></thead>
          <tbody>
            ${trips.length ? trips.map((pj, i) => `
              <tr>
                <td class="group-no-cell" style="width:44px;text-align:center;color:var(--text-muted);">${i + 1}</td>
                <td class="primary" style="cursor:pointer;" onclick="openPerjalananMenu('${ruteId}','${pj.id}')">${perjalananLabel(pj)}</td>
                <td>${countRecords(pj)} data</td>
                <td>
                  <div class="actions">
                    <button class="btn btn-primary btn-sm" onclick="openPerjalananMenu('${ruteId}','${pj.id}')">📄 Lihat Laporan</button>
                    <button class="btn btn-ghost btn-sm" onclick="openEditPerjalanan('${pj.id}')">✏️ Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deletePerjalanan('${pj.id}','${ruteId}')">🗑️</button>
                  </div>
                </td>
              </tr>`).join('') : `<tr><td colspan="4" style="padding:40px;text-align:center;color:var(--text-muted)">
                <div class="empty-state-icon">📭</div>
                <div class="empty-state-title">Belum ada perjalanan</div>
                <div class="empty-state-sub">Klik "+ Tambah Perjalanan" untuk mencatat perjalanan pertama</div>
              </td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <div style="margin-top:16px; font-size:13px; color:var(--text-muted);">
      Lihat riwayat lengkap rute ini (semua data, termasuk yang belum dikelompokkan ke perjalanan):
      <a href="#" class="pj-legacy-link" data-page="barang-terjual" style="color:var(--accent);">Barang Terjual</a>,
      <a href="#" class="pj-legacy-link" data-page="rekap-piutang" style="color:var(--accent);">Rekap Piutang</a>,
      <a href="#" class="pj-legacy-link" data-page="tagihan" style="color:var(--accent);">Tagihan</a>,
      <a href="#" class="pj-legacy-link" data-page="uang-keluar-lk" style="color:var(--accent);">Uang Keluar</a>,
      <a href="#" class="pj-legacy-link" data-page="uang-masuk" style="color:var(--accent);">Uang Masuk</a>
    </div>
  </div>`;

  content.innerHTML = html;
  document.getElementById('btn-add-perjalanan').addEventListener('click', () => openAddPerjalanan(ruteId));
  document.querySelectorAll('.pj-legacy-link').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(a.dataset.page, ruteId);
    });
  });
}

const PERJALANAN_KEYS = ['barangTerjual', 'rekapPiutang', 'tagihan', 'uangKeluarLK', 'uangMasuk'];

function openPerjalananMenu(ruteId, perjalananId, opts = {}) {
  currentPage = 'perjalanan-list';
  currentRuteId = ruteId;
  currentPerjalananId = perjalananId;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === 'perjalanan-list' && el.dataset.rute === ruteId);
  });
  const rute = store.ruteList.find(x => x.id === ruteId);
  const pj = store.perjalananList.find(x => x.id === perjalananId);
  document.getElementById('topbar-title').textContent =
    `Perjalanan - ${rute ? rute.nama : ''} (${pj ? perjalananLabel(pj) : ''})`;
  renderPerjalananMenu(ruteId, perjalananId);
  document.getElementById('sidebar').classList.remove('open');
  pushNavState({ type: 'pjMenu', ruteId, perjalananId }, opts);
}

function renderPerjalananMenu(ruteId, perjalananId) {
  const content = document.getElementById('content');
  const rute = store.ruteList.find(x => x.id === ruteId);
  const pj = store.perjalananList.find(x => x.id === perjalananId);
  if (!pj) { renderPerjalananList(ruteId); return; }

  const penjualan = store.barangTerjual.filter(x => x.perjalananId === perjalananId)
    .reduce((s, b) => s + b.jumlah * b.hargaJual, 0);
  const masuk = store.uangMasuk.filter(x => x.perjalananId === perjalananId)
    .reduce((s, x) => s + Number(x.jumlah || 0), 0);
  const keluar = store.uangKeluarLK.filter(x => x.perjalananId === perjalananId)
    .reduce((s, x) => s + Number(x.jumlah || 0), 0);
  const hasil = penjualan + masuk - keluar;

  const cardsHtml = PERJALANAN_KEYS.map(key => {
    const cfg = listConfig[key];
    const count = store[key].filter(x => x.ruteId === ruteId && x.perjalananId === perjalananId).length;
    return `
      <div class="card" style="cursor:pointer;" onclick="openPerjalananCategory('${ruteId}','${perjalananId}','${key}')">
        <div style="padding:24px; display:flex; align-items:center; gap:16px;">
          <div style="font-size:32px;">${cfg.icon}</div>
          <div style="flex:1;">
            <div style="font-weight:700; font-size:15px; color:var(--text-primary);">${cfg.title}</div>
            <div style="font-size:13px; color:var(--text-muted); margin-top:2px;">${count} data tercatat</div>
          </div>
          <div style="color:var(--text-muted);">›</div>
        </div>
      </div>`;
  }).join('');

  content.innerHTML = `
  <div class="page-anim">
    <div class="page-header" style="align-items:center;">
      <div>
        <a href="#" id="pj-back-link" style="font-size:13px;color:var(--text-muted);text-decoration:none;">← Kembali ke Daftar Perjalanan</a>
        <div class="page-title" style="margin-top:6px;">🚚 Perjalanan ${rute ? rute.nama : ''}</div>
        <div class="page-subtitle">Periode: ${perjalananLabel(pj)} — pilih kategori data untuk melihat & mencetak</div>
      </div>
    </div>

    <div class="profit-card" style="margin-bottom:24px; background: var(--bg-card); border-left: 4px solid ${hasil >= 0 ? 'var(--green)' : 'var(--red)'}">
      <div class="profit-card-left">
        <h3 style="color:var(--text-secondary)">Hasil Perjalanan Ini (Penjualan + Uang Masuk − Uang Keluar)</h3>
        <div class="big-val" style="color: ${hasil >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(Math.abs(hasil))}</div>
      </div>
      <div class="profit-icon">${hasil >= 0 ? '📈' : '📉'}</div>
    </div>

    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px;">
      ${cardsHtml}
    </div>
  </div>`;

  document.getElementById('pj-back-link').addEventListener('click', (e) => {
    e.preventDefault();
    if (navDepth > 0) { history.back(); return; }
    currentPerjalananId = null;
    renderPerjalananList(ruteId);
  });
}

function openPerjalananCategory(ruteId, perjalananId, key, opts = {}) {
  currentRuteId = ruteId;
  currentPerjalananId = perjalananId;
  const rute = store.ruteList.find(x => x.id === ruteId);
  const pj = store.perjalananList.find(x => x.id === perjalananId);
  const cfg = listConfig[key];
  document.getElementById('topbar-title').textContent =
    `${cfg.title} - ${rute ? rute.nama : ''} (${pj ? perjalananLabel(pj) : ''})`;
  renderPerjalananCategoryPage(ruteId, perjalananId, key);
  pushNavState({ type: 'pjCategory', ruteId, perjalananId, key }, opts);
}

function renderPerjalananCategoryPage(ruteId, perjalananId, key) {
  const content = document.getElementById('content');
  const rute = store.ruteList.find(x => x.id === ruteId);
  const pj = store.perjalananList.find(x => x.id === perjalananId);
  const cfg = listConfig[key];
  if (!pj || !cfg) { renderPerjalananList(ruteId); return; }

  const rows = store[key].filter(x => x.ruteId === ruteId && x.perjalananId === perjalananId);

  content.innerHTML = `
  <div class="page-anim">
    <div class="print-header" id="print-header-pj-${key}"></div>
    <div class="page-header" style="align-items:center;">
      <div class="no-print">
        <a href="#" id="pj-cat-back-link" style="font-size:13px;color:var(--text-muted);text-decoration:none;">← Kembali ke Menu Perjalanan</a>
        <div class="page-title" style="margin-top:6px;">${cfg.icon} ${cfg.title}</div>
        <div class="page-subtitle">Rute ${rute ? rute.nama : ''} — Perjalanan ${perjalananLabel(pj)}</div>
      </div>
      <div class="no-print" style="display:flex; gap:10px;">
        <button class="btn btn-ghost" id="btn-print-pj-${key}">🖨️ Cetak</button>
        <button class="btn btn-primary" id="btn-add-pj-${key}">${cfg.addLabel}</button>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr>${cfg.columns.map(c => `<th>${c}</th>`).join('')}</tr></thead>
          <tbody id="pj-tbody-${key}"></tbody>
        </table>
      </div>
    </div>
  </div>`;

  const tbody = document.getElementById(`pj-tbody-${key}`);
  if (!rows.length) {
    renderEmptyTbody(tbody, cfg.columns.length, `Klik "+ Tambah" untuk mencatat ${cfg.title.toLowerCase()} perjalanan ini`);
  } else {
    renderRowsIntoTbody(key, rows, tbody);
  }

  document.getElementById('pj-cat-back-link').addEventListener('click', (e) => {
    e.preventDefault();
    if (navDepth > 0) { history.back(); return; }
    openPerjalananMenu(ruteId, perjalananId);
  });
  document.getElementById(`btn-add-pj-${key}`).addEventListener('click', () => openAddModal(key));
  document.getElementById(`btn-print-pj-${key}`).addEventListener('click', () => {
    const el = document.getElementById(`print-header-pj-${key}`);
    if (el) {
      el.innerHTML = `
        <div class="print-title">Toko Panglima Bangunan — ${cfg.title.toUpperCase()}</div>
        <div class="print-subtitle">Rute ${rute ? rute.nama : ''} — Perjalanan ${perjalananLabel(pj)}</div>
        <div class="print-subtitle">Dicetak: ${formatDate(today())}</div>`;
    }
    window.print();
  });
}

/* ========================
   GENERIC LIST RENDERER
   ======================== */
function renderList(key) {
  const cfg = listConfig[key];
  const data = store[key];
  const content = document.getElementById('content');
  const hasDateFilter = key !== 'ruteList';

  listFilters[key] = { bulan: '', tahun: '' };

  const html = `
  <div class="page-anim">
    <div class="print-header" id="print-header-${key}"></div>
    <div class="page-header">
      <div class="no-print">
        <div class="page-title">${cfg.icon} ${cfg.title}</div>
        <div class="page-subtitle">${cfg.subtitle}</div>
      </div>
      <div class="no-print" style="display:flex; gap:10px;">
        <button class="btn btn-ghost" id="btn-print-${key}">🖨️ Cetak</button>
        <button class="btn btn-primary" id="btn-add-${key}">${cfg.addLabel}</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header no-print" style="flex-wrap:wrap; row-gap:12px;">
        <div class="card-title">Data ${cfg.title}</div>
        <div class="search-bar">
          <span>🔍</span>
          <input type="text" id="search-${key}" placeholder="Cari..." />
        </div>
      </div>
      ${hasDateFilter ? `
      <div class="card-header no-print" style="flex-wrap:wrap; row-gap:12px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <label style="font-size:13px; color:var(--text-muted); font-weight:600;">Filter:</label>
          <div style="display:flex; align-items:center; gap:8px;" id="filter-inputs-${key}">${dateFilterInputsHtml(key)}</div>
        </div>
      </div>` : ''}
      <div class="table-wrap">
        <table id="table-${key}">
          <thead><tr>${cfg.columns.map(c => `<th>${c}</th>`).join('')}</tr></thead>
          <tbody id="tbody-${key}"></tbody>
        </table>
      </div>
    </div>
  </div>`;

  content.innerHTML = html;
  renderTableBody(key);

  document.getElementById(`btn-add-${key}`).addEventListener('click', () => openAddModal(key));
  document.getElementById(`search-${key}`).addEventListener('input', (e) => {
    refreshTableBody(key);
  });
  document.getElementById(`btn-print-${key}`).addEventListener('click', () => {
    printCurrentPage(cfg.title, key);
  });

  if (hasDateFilter) {
    document.getElementById(`filter-bulan-${key}`).addEventListener('change', (e) => {
      listFilters[key].bulan = e.target.value;
      refreshTableBody(key);
    });
    document.getElementById(`filter-tahun-${key}`).addEventListener('change', (e) => {
      listFilters[key].tahun = e.target.value;
      refreshTableBody(key);
    });
  }
}

function printCurrentPage(title, key) {
  let periode = 'Semua Data';
  const f = listFilters[key];
  if (f && (f.bulan !== '' || f.tahun !== '')) {
    const bulanTxt = f.bulan !== '' ? MONTHS[Number(f.bulan)] : 'Semua Bulan';
    const tahunTxt = f.tahun !== '' ? f.tahun : 'Semua Tahun';
    periode = `${bulanTxt} ${tahunTxt}`;
  }
  const rute = currentRuteId ? store.ruteList.find(r => r.id === currentRuteId) : null;
  const subtitle = rute ? `Rute ${rute.nama} — Periode: ${periode}` : `Periode: ${periode}`;
  const el = document.getElementById(`print-header-${key}`);
  if (el) {
    el.innerHTML = `
      <div class="print-title">Toko Panglima Bangunan — ${title.toUpperCase()}</div>
      <div class="print-subtitle">${subtitle}</div>
      <div class="print-subtitle">Dicetak: ${formatDate(today())}</div>`;
  }
  window.print();
}

function renderTableBody(key, query = '') {
  const cfg = listConfig[key];
  let data = store[key] || [];
  if (currentRuteId && key !== 'ruteList') {
    data = data.filter(x => x.ruteId === currentRuteId);
  }
  data = applyDateFilter(data, key);
  const filtered = query ? data.filter(x => cfg.searchFn(x, query)) : data;
  const tbody = document.getElementById(`tbody-${key}`);
  if (!tbody) return;

  if (!filtered.length) {
    const filterActive = listFilters[key] && (listFilters[key].bulan !== '' || listFilters[key].tahun !== '');
    let sub = 'Klik tombol tambah untuk mulai mencatat';
    if (query) sub = 'Coba kata kunci lain';
    else if (filterActive) sub = 'Tidak ada data pada periode yang dipilih — coba ubah filter tanggal';
    renderEmptyTbody(tbody, cfg.columns.length, sub);
    return;
  }

  renderRowsIntoTbody(key, filtered, tbody);
}

function renderEmptyTbody(tbody, colspan, sub) {
  tbody.innerHTML = `<tr><td colspan="${colspan}" style="padding:40px;text-align:center;color:var(--text-muted)">
    <div class="empty-state-icon">📭</div>
    <div class="empty-state-title">Tidak ada data</div>
    <div class="empty-state-sub">${sub}</div>
  </td></tr>`;
}

function renderRowsIntoTbody(key, filtered, tbody) {
  const cfg = listConfig[key];
  const items = filtered.slice().reverse();

  if (cfg.grouped) {
    renderGroupedBody(key, items, tbody, cfg);
  } else {
    // Simple numbered list
    tbody.innerHTML = items.map((item, idx) => `
      <tr>
        <td class="group-no-cell" style="width:44px;font-weight:700;color:var(--text-muted);text-align:center">${idx + 1}</td>
        ${cfg.rowFn(item)}
        <td>
          <div class="actions">
            <button class="btn btn-ghost btn-sm" onclick="openEditModal('${key}','${item.id}')">✏️ Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteItem('${key}','${item.id}')">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');
  }
}

/* ========================
   GENERIC GROUPED TABLE RENDERER
   ======================== */
function renderGroupedBody(key, items, tbody, cfg) {
  // Build groups
  const groups = [];
  const groupMap = {};
  items.forEach(item => {
    const k = cfg.groupKeyFn(item);
    if (!groupMap[k]) { groupMap[k] = { rows: [] }; groups.push(groupMap[k]); }
    groupMap[k].rows.push(item);
  });

  let html = '';
  groups.forEach((group, gi) => {
    const rowCount = group.rows.length;
    const sepStyle = gi > 0 ? 'border-top: 2px solid var(--border-light);' : '';

    // build header cell with correct rowspan
    const headerCell = cfg.groupHeaderFn(group, gi).replace(/__ROWSPAN__/g, rowCount);

    group.rows.forEach((item, ri) => {
      const isFirst = ri === 0;
      const bandClass = `group-band-${gi % 2}`;
      html += `<tr class="${bandClass}"${isFirst && gi > 0 ? ` style="${sepStyle}"` : ''}>`;
      if (isFirst) {
        // NO cell
        html += `<td class="group-no-cell" rowspan="${rowCount}">${gi + 1}</td>`;
        // group header cell(s)
        html += headerCell;
      }
      // item cells
      html += cfg.itemCellsFn(item);
      // actions
      html += `<td>
        <div class="actions">
          <button class="btn btn-ghost btn-sm" onclick="openEditModal('${key}','${item.id}')">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteItem('${key}','${item.id}')">🗑️</button>
        </div></td>
      </tr>`;
    });

    // Subtotal row
    if (cfg.subtotalFn) {
      const total = cfg.subtotalFn(group.rows);
      const skip  = cfg.subtotalCols || 2;
      html += `<tr class="subtotal-row group-band-${gi % 2}">
        <td colspan="${skip + 2}" class="subtotal-label">Total</td>
        <td class="subtotal-val">${fmt(total)}</td>
        <td></td>
      </tr>`;
    }
  });

  tbody.innerHTML = html;
}

/* ========================
   FORM BUILDERS
   ======================== */
/* ── HELPER STOK DROPDOWN ── */
function formatStock(stokKecil, konversi, sat1, sat2) {
  if (!sat1 || sat1 === sat2 || konversi <= 1) {
    return `${fmtNum(stokKecil)} ${sat2}`;
  }
  const s1 = Math.floor(stokKecil / konversi);
  const s2 = stokKecil % konversi;
  let res = [];
  if (s1 > 0) res.push(`${fmtNum(s1)} ${sat1}`);
  if (s2 > 0) res.push(`${fmtNum(s2)} ${sat2}`);
  return res.length > 0 ? res.join(' ') : `0 ${sat2}`;
}

function getAvailableStock() {
  const map = {};
  store.barangMasuk.forEach(b => {
    const key = b.nama; // group by nama now
    if (!map[key]) {
      const jml1 = Number(b.jumlah1 || b.jumlah || 1);
      const jml2 = Number(b.jumlah2 || b.jumlah || 1);
      const konversi = Math.max(1, Math.floor(jml2 / jml1));
      map[key] = {
        nama: b.nama,
        satuan1: b.satuan1 || b.satuan,
        satuan2: b.satuan2 || b.satuan,
        konversi: konversi,
        stokKecil: 0,
        hargaJual1: b.hargaJual1 || b.hargaJual,
        hargaJual2: b.hargaJual2 || b.hargaJual
      };
    }
    map[key].stokKecil += Number(b.jumlah2 || b.jumlah || 0);
    map[key].hargaJual1 = b.hargaJual1 || b.hargaJual;
    map[key].hargaJual2 = b.hargaJual2 || b.hargaJual;
  });

  store.barangTerjual.forEach(b => {
    const key = b.nama;
    if (map[key]) {
      // deduct based on unit
      if (b.satuan === map[key].satuan1 && map[key].satuan1 !== map[key].satuan2) {
        map[key].stokKecil -= Number(b.jumlah || 0) * map[key].konversi;
      } else {
        map[key].stokKecil -= Number(b.jumlah || 0);
      }
    }
  });

  return Object.values(map)
    .filter(x => x.stokKecil > 0)
    .sort((a,b) => a.nama.localeCompare(b.nama, 'id', {sensitivity: 'base'}));
}

function stockDropdownOptions(selectedNama = '') {
  const stocks = getAvailableStock();
  if (stocks.length === 0) return '<option value="">-- Stok Kosong --</option>';
  let html = '<option value="">-- Pilih Barang dari Stok --</option>';
  stocks.forEach(s => {
    const sel = selectedNama === s.nama ? 'selected' : '';
    const dataObj = encodeURIComponent(JSON.stringify(s));
    const sisaTxt = formatStock(s.stokKecil, s.konversi, s.satuan1, s.satuan2);
    html += `<option value="${s.nama}" data-stock="${dataObj}" ${sel}>${s.nama} - Sisa: ${sisaTxt}</option>`;
  });
  return html;
}

/* ── form SINGLE edit (dipakai saat edit satu baris) ── */
function formBarangMasuk(data = {}) {
  const satuanOpts = ['Sak','Batang','Dus','Lusin','Pcs','Kaleng','Lembar','Meter','Kg','Ton','Buah','Karung','Balok'];
  return `<form id="modal-form">
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Tanggal</label>
        <input type="date" class="form-input" name="tanggal" value="${data.tanggal || today()}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Nama Supplier</label>
        <input type="text" class="form-input" name="supplier" value="${data.supplier || ''}" placeholder="Nama supplier" required />
      </div>
      <div class="form-group form-full">
        <label class="form-label">Nama Barang</label>
        <input type="text" class="form-input" name="nama" value="${data.nama || ''}" placeholder="Nama barang" required />
      </div>
      
      <div class="form-group">
        <label class="form-label">Jml (Besar)</label>
        <input type="number" class="form-input" name="jumlah1" value="${data.jumlah1 || data.jumlah || ''}" min="1" placeholder="0" required />
      </div>
      <div class="form-group">
        <label class="form-label">Satuan (Besar)</label>
        <select class="form-select" name="satuan1">
          ${satuanOpts.map(s => `<option value="${s}" ${(data.satuan1 || data.satuan) === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Jml (Kecil/Ecer)</label>
        <input type="number" class="form-input" name="jumlah2" value="${data.jumlah2 || data.jumlah || ''}" min="1" placeholder="0" required />
      </div>
      <div class="form-group">
        <label class="form-label">Satuan (Kecil/Ecer)</label>
        <select class="form-select" name="satuan2">
          ${satuanOpts.map(s => `<option value="${s}" ${(data.satuan2 || data.satuan) === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>

      <div class="form-group form-full">
        <label class="form-label">Harga Modal (Total per Satuan Besar)</label>
        <input type="number" class="form-input" name="hargaModal" value="${data.hargaModal || ''}" placeholder="0" required />
      </div>

      <div class="form-group">
        <label class="form-label">Harga Jual (Besar)</label>
        <input type="number" class="form-input" name="hargaJual1" value="${data.hargaJual1 || data.hargaJual || ''}" placeholder="0" required />
      </div>
      <div class="form-group">
        <label class="form-label">Harga Jual (Kecil/Ecer)</label>
        <input type="number" class="form-input" name="hargaJual2" value="${data.hargaJual2 || data.hargaJual || ''}" placeholder="0" required />
      </div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Batal</button>
      <button type="submit" class="btn btn-primary">💾 Simpan</button>
    </div>
  </form>`;
}

/* ── SATUAN options helper ── */
const SATUAN_OPTS = ['Sak','Batang','Dus','Lusin','Pcs','Kaleng','Lembar','Meter','Kg','Ton','Buah','Karung','Balok'];
function satuanOptions(sel = '') {
  return SATUAN_OPTS.map(s => `<option value="${s}" ${sel === s ? 'selected' : ''}>${s}</option>`).join('');
}

/* ── form MULTI-ITEM untuk Tambah Barang Masuk ── */
function buildMultiBarangMasukForm() {
  return `
  <div style="margin-bottom:16px">
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Tanggal</label>
        <input type="date" class="form-input" id="bm-tanggal" value="${today()}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Nama Supplier</label>
        <input type="text" class="form-input" id="bm-supplier" placeholder="Contoh: Pak Mamat" required />
      </div>
    </div>
  </div>

  <div style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
    <span style="font-size:13px;font-weight:700;color:var(--text-primary)">📦 Daftar Barang</span>
    <button type="button" class="btn btn-ghost btn-sm" id="bm-add-row">＋ Tambah Baris</button>
  </div>

  <div class="bm-table-wrap">
    <table class="bm-table">
      <thead>
        <tr>
          <th style="width:25%">Nama Barang</th>
          <th style="width:15%">Isi Besar<br><small>(Jml & Satuan)</small></th>
          <th style="width:15%">Isi Ecer<br><small>(Jml & Satuan)</small></th>
          <th style="width:15%">Hrg Modal<br><small>(Total /Besar)</small></th>
          <th style="width:22%">Hrg Jual<br><small>(Atas: Besar, Bawah: Ecer)</small></th>
          <th style="width:8%"></th>
        </tr>
      </thead>
      <tbody id="bm-rows"></tbody>
    </table>
  </div>

  <div class="form-actions" style="margin-top:16px">
    <button type="button" class="btn btn-ghost" onclick="closeModal()">Batal</button>
    <button type="button" class="btn btn-primary" id="bm-simpan">💾 Simpan Semua</button>
  </div>`;
}

function bmRowHTML(idx) {
  return `<tr id="bm-row-${idx}">
    <td style="vertical-align:top"><input type="text" class="form-input" style="width:100%" placeholder="Nama barang" data-field="nama" /></td>
    <td style="vertical-align:top">
      <input type="number" class="form-input" style="width:100%;margin-bottom:4px" placeholder="Jml" min="1" data-field="jumlah1" />
      <select class="form-select" style="width:100%" data-field="satuan1">${satuanOptions()}</select>
    </td>
    <td style="vertical-align:top">
      <input type="number" class="form-input" style="width:100%;margin-bottom:4px" placeholder="Jml" min="1" data-field="jumlah2" />
      <select class="form-select" style="width:100%" data-field="satuan2">${satuanOptions()}</select>
    </td>
    <td style="vertical-align:top"><input type="number" class="form-input" style="width:100%" placeholder="0" min="0" data-field="hargaModal" /></td>
    <td style="vertical-align:top">
      <input type="number" class="form-input" style="width:100%;margin-bottom:4px" placeholder="0" min="0" data-field="hargaJual1" />
      <input type="number" class="form-input" style="width:100%" placeholder="0" min="0" data-field="hargaJual2" />
    </td>
    <td style="text-align:center;vertical-align:top">
      <button type="button" class="btn btn-danger btn-sm" onclick="bmRemoveRow(${idx})" title="Hapus baris">🗑️</button>
    </td>
  </tr>`;
}

let _bmRowCount = 0;

function bmAddRow() {
  _bmRowCount++;
  const tbody = document.getElementById('bm-rows');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.id = `bm-row-${_bmRowCount}`;
  tr.innerHTML = bmRowHTML(_bmRowCount).replace(/<tr[^>]*>/, '').replace(/<\/tr>/, '');
  tbody.appendChild(tr);
  tr.querySelector('[data-field="nama"]').focus();
}
window.bmAddRow = bmAddRow;

function bmRemoveRow(idx) {
  const row = document.getElementById(`bm-row-${idx}`);
  const tbody = document.getElementById('bm-rows');
  if (row && tbody && tbody.rows.length > 1) {
    row.remove();
  } else if (tbody && tbody.rows.length === 1) {
    showToast('Minimal harus ada 1 baris barang.', 'error');
  }
}
window.bmRemoveRow = bmRemoveRow;

function openMultiBarangMasukModal() {
  _bmRowCount = 0;
  document.getElementById('modal').style.maxWidth = '920px';
  openModal('📦 Tambah Barang Masuk', buildMultiBarangMasukForm(), null);

  bmAddRow();
  document.getElementById('bm-add-row').addEventListener('click', bmAddRow);

  document.getElementById('bm-simpan').addEventListener('click', () => {
    const tanggal  = document.getElementById('bm-tanggal').value.trim();
    const supplier = document.getElementById('bm-supplier').value.trim();

    if (!tanggal) { showToast('Tanggal wajib diisi!', 'error'); return; }
    if (!supplier) { showToast('Nama supplier wajib diisi!', 'error'); return; }

    const tbody = document.getElementById('bm-rows');
    const rows  = Array.from(tbody.querySelectorAll('tr'));
    const items = [];
    let hasError = false;

    rows.forEach((tr, i) => {
      const nama      = tr.querySelector('[data-field="nama"]').value.trim();
      const jumlah1   = Number(tr.querySelector('[data-field="jumlah1"]').value);
      const satuan1   = tr.querySelector('[data-field="satuan1"]').value;
      const jumlah2   = Number(tr.querySelector('[data-field="jumlah2"]').value);
      const satuan2   = tr.querySelector('[data-field="satuan2"]').value;
      const hargaModal= Number(tr.querySelector('[data-field="hargaModal"]').value);
      const hargaJual1= Number(tr.querySelector('[data-field="hargaJual1"]').value);
      const hargaJual2= Number(tr.querySelector('[data-field="hargaJual2"]').value);

      if (!nama || !jumlah1 || !jumlah2 || !hargaModal || !hargaJual1 || !hargaJual2) {
        tr.style.outline = '2px solid var(--red)';
        hasError = true;
        return;
      }
      tr.style.outline = '';
      items.push({ id: uid(), tanggal, supplier, nama, jumlah1, satuan1, jumlah2, satuan2, hargaModal, hargaJual1, hargaJual2 });
    });

    if (hasError) { showToast('Lengkapi semua baris barang terlebih dahulu!', 'error'); return; }
    if (!items.length) { showToast('Tidak ada barang untuk disimpan.', 'error'); return; }

    store.barangMasuk.push(...items);
    saveStore();
    closeModal();
    document.getElementById('modal').style.maxWidth = '';
    renderList('barangMasuk');
    showToast(`✅ ${items.length} barang dari ${supplier} berhasil disimpan!`, 'success');
  });
}

function formBarangTerjual(data = {}) {
  return `<form id="modal-form">
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Tanggal</label>
        <input type="date" class="form-input" name="tanggal" value="${data.tanggal || today()}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Nama Pelanggan / Proyek</label>
        <input type="text" class="form-input" name="pelanggan" value="${data.pelanggan || ''}" placeholder="Nama pelanggan" required />
      </div>
      <div class="form-group form-full">
        <label class="form-label">No PM / Faktur</label>
        <input type="text" class="form-input" name="noFaktur" value="${data.noFaktur || ''}" placeholder="Misal: 0829" />
      </div>
      <div class="form-group form-full">
        <label class="form-label">Nama Barang (Dari Stok)</label>
        <select class="form-select" name="nama" onchange="handleStockSelection(this)" required>
          ${stockDropdownOptions(data.nama)}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Jumlah</label>
        <input type="number" class="form-input" name="jumlah" value="${data.jumlah || ''}" min="1" placeholder="0" required />
      </div>
      <div class="form-group">
        <label class="form-label">Satuan</label>
        <select class="form-select" name="satuan">
          ${['Sak','Batang','Dus','Lusin','Pcs','Kaleng','Lembar','Meter','Kg','Ton','Buah','Karung','Balok'].map(s =>
            `<option value="${s}" ${data.satuan === s ? 'selected' : ''}>${s}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Harga Jual (Rp)</label>
        <input type="number" class="form-input" name="hargaJual" value="${data.hargaJual || ''}" placeholder="0" required />
      </div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Batal</button>
      <button type="submit" class="btn btn-primary">💾 Simpan</button>
    </div>
  </form>`;
}

function formPiutang(data = {}) {
  return `<form id="modal-form">
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Tanggal</label>
        <input type="date" class="form-input" name="tanggal" value="${data.tanggal || today()}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Nama Toko</label>
        <input type="text" class="form-input" name="nama" value="${data.nama || ''}" placeholder="Nama Toko" required />
      </div>
      <div class="form-group form-full">
        <label class="form-label">No Faktur</label>
        <input type="text" class="form-input" name="noFaktur" value="${data.noFaktur || ''}" placeholder="Misal: PM - 0469" required />
      </div>
      <div class="form-group form-full">
        <label class="form-label">Jumlah (Rp)</label>
        <input type="number" class="form-input" name="jumlah" value="${data.jumlah || ''}" placeholder="0" required />
      </div>
      <div class="form-group form-full">
        <label class="form-label">Status Pembayaran</label>
        <select class="form-select" style="width:100%" name="status">
          <option value="Belum Lunas" ${data.status !== 'Lunas' ? 'selected' : ''}>Belum Lunas</option>
          <option value="Lunas" ${data.status === 'Lunas' ? 'selected' : ''}>Lunas</option>
        </select>
      </div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Batal</button>
      <button type="submit" class="btn btn-primary">💾 Simpan</button>
    </div>
  </form>`;
}

function formRekapPiutang(data = {}) {
  return `<form id="modal-form">
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Tanggal</label>
        <input type="date" class="form-input" name="tanggal" value="${data.tanggal || today()}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Nama Toko</label>
        <input type="text" class="form-input" name="nama" value="${data.nama || ''}" placeholder="Nama Toko" required />
      </div>
      <div class="form-group form-full">
        <label class="form-label">No Faktur</label>
        <input type="text" class="form-input" name="noFaktur" value="${data.noFaktur || ''}" placeholder="Misal: PM - 0469" required />
      </div>
      <div class="form-group form-full">
        <label class="form-label">Jumlah (Rp)</label>
        <input type="number" class="form-input" name="jumlah" value="${data.jumlah || ''}" placeholder="0" required />
      </div>
      <div class="form-group form-full">
        <label class="form-label">Status Pembayaran</label>
        <select class="form-select" style="width:100%" name="status">
          <option value="Belum Lunas" ${data.status !== 'Lunas' ? 'selected' : ''}>Belum Lunas</option>
          <option value="Lunas" ${data.status === 'Lunas' ? 'selected' : ''}>Lunas</option>
        </select>
      </div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Batal</button>
      <button type="submit" class="btn btn-primary">💾 Simpan</button>
    </div>
  </form>`;
}

function formUtang(data = {}) {
  return `<form id="modal-form">
    <div class="form-group form-full">
      <label class="form-label">Tanggal</label>
      <input type="date" class="form-input" name="tanggal" value="${data.tanggal || today()}" required />
    </div>
    <div class="form-group form-full">
      <label class="form-label">Keterangan</label>
      <input type="text" class="form-input" name="keterangan" value="${data.keterangan || ''}" placeholder="Keterangan" required />
    </div>
    <div class="form-group form-full">
      <label class="form-label">Jumlah (Rp)</label>
      <input type="number" class="form-input" name="jumlah" value="${data.jumlah || ''}" placeholder="0" min="0" required />
    </div>
    <div class="form-group form-full">
      <label class="form-label">Status Pembayaran</label>
      <select class="form-select" style="width:100%" name="status">
        <option value="Belum Lunas" ${data.status !== 'Lunas' ? 'selected' : ''}>Belum Lunas</option>
        <option value="Lunas" ${data.status === 'Lunas' ? 'selected' : ''}>Lunas</option>
      </select>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Batal</button>
      <button type="submit" class="btn btn-primary">💾 Simpan</button>
    </div>
  </form>`;
}

/* generic simple form builder */
function formSimple(fields) {
  return function(data = {}) {
    const rows = fields.map(f => {
      const [name, label] = f.split(':');
      const isNum = name === 'jumlah';
      return `<div class="form-group form-full">
        <label class="form-label">${label}</label>
        <input type="${isNum ? 'number' : 'text'}" class="form-input" name="${name}" 
          value="${data[name] || ''}" placeholder="${isNum ? '0' : label}" ${isNum ? 'min="0"' : ''} required />
      </div>`;
    });
    return `<form id="modal-form">
      <div class="form-group form-full">
        <label class="form-label">Tanggal</label>
        <input type="date" class="form-input" name="tanggal" value="${data.tanggal || today()}" required />
      </div>
      ${rows.join('')}
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">💾 Simpan</button>
      </div>
    </form>`;
  };
}

/* ========================
   MULTI-ITEM BARANG TERJUAL
   ======================== */
function buildMultiBarangTerjualForm() {
  return `
  <div style="margin-bottom:16px">
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Tanggal</label>
        <input type="date" class="form-input" id="bt-tanggal" value="${today()}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Nama Toko / Pelanggan</label>
        <input type="text" class="form-input" id="bt-pelanggan" placeholder="Contoh: Sinar Timbulun" required />
      </div>
      <div class="form-group form-full">
        <label class="form-label">No PM / Faktur</label>
        <input type="text" class="form-input" id="bt-nofaktur" placeholder="Misal: 0829" />
      </div>
    </div>
  </div>

  <div style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
    <span style="font-size:13px;font-weight:700;color:var(--text-primary)">📦 Daftar Barang Terjual</span>
    <button type="button" class="btn btn-ghost btn-sm" id="bt-add-row">＋ Tambah Baris</button>
  </div>

  <div class="bm-table-wrap">
    <table class="bm-table">
      <thead>
        <tr>
          <th style="width:38%">Nama Barang</th>
          <th style="width:10%">Jumlah</th>
          <th style="width:14%">Satuan</th>
          <th style="width:18%">Harga Jual</th>
          <th style="width:12%">Total</th>
          <th style="width:8%"></th>
        </tr>
      </thead>
      <tbody id="bt-rows"></tbody>
    </table>
  </div>

  <div class="form-actions" style="margin-top:16px">
    <button type="button" class="btn btn-ghost" onclick="closeModal()">Batal</button>
    <button type="button" class="btn btn-primary" id="bt-simpan">💾 Simpan Semua</button>
  </div>`;
}

let _btRowCount = 0;

function btAddRow() {
  _btRowCount++;
  const tbody = document.getElementById('bt-rows');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.id = `bt-row-${_btRowCount}`;
  const rid = _btRowCount;
  tr.innerHTML = `
    <td>
      <select class="form-select" style="width:100%" data-field="nama" onchange="handleStockSelection(this)" required>
        ${stockDropdownOptions()}
      </select>
    </td>
    <td><input type="number" class="form-input" style="width:100%" placeholder="0" min="1" data-field="jumlah" oninput="btCalcRow(${rid})" /></td>
    <td><select class="form-select" style="width:100%" data-field="satuan">${satuanOptions()}</select></td>
    <td><input type="number" class="form-input" style="width:100%" placeholder="0" min="0" data-field="hargaJual" oninput="btCalcRow(${rid})" /></td>
    <td><span class="bt-total" id="bt-total-${rid}" style="font-size:12px;color:var(--green);font-weight:700">Rp 0</span></td>
    <td style="text-align:center">
      <button type="button" class="btn btn-danger btn-sm" onclick="btRemoveRow(${rid})">🗑️</button>
    </td>`;
  tbody.appendChild(tr);
  tr.querySelector('[data-field="nama"]').focus();
}
window.btAddRow = btAddRow;

function btCalcRow(idx) {
  const tr  = document.getElementById(`bt-row-${idx}`);
  if (!tr) return;
  const qty   = Number(tr.querySelector('[data-field="jumlah"]').value) || 0;
  const harga = Number(tr.querySelector('[data-field="hargaJual"]').value) || 0;
  const span  = document.getElementById(`bt-total-${idx}`);
  if (span) span.textContent = fmt(qty * harga);
}
window.btCalcRow = btCalcRow;

function btRemoveRow(idx) {
  const row   = document.getElementById(`bt-row-${idx}`);
  const tbody = document.getElementById('bt-rows');
  if (row && tbody && tbody.rows.length > 1) row.remove();
  else showToast('Minimal harus ada 1 baris barang.', 'error');
}
window.btRemoveRow = btRemoveRow;

function handleStockSelection(selectEl) {
  const option = selectEl.options[selectEl.selectedIndex];
  if (!option || !option.value) return;
  
  let data;
  try { data = JSON.parse(decodeURIComponent(option.dataset.stock)); }
  catch(e) { return; }
  
  const container = selectEl.closest('tr') || selectEl.closest('.form-grid');
  if (!container) return;

  const satuanEl = container.querySelector('[name="satuan"], [data-field="satuan"]');
  const hargaEl  = container.querySelector('[name="hargaJual"], [data-field="hargaJual"]');
  
  if (satuanEl) {
    satuanEl.innerHTML = '';
    const opts = [];
    if (data.satuan1) opts.push({ s: data.satuan1, h: data.hargaJual1 });
    if (data.satuan2 && data.satuan2 !== data.satuan1) opts.push({ s: data.satuan2, h: data.hargaJual2 });
    
    opts.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.s;
      opt.textContent = o.s;
      opt.dataset.price = o.h;
      satuanEl.appendChild(opt);
    });
    
    satuanEl.onchange = function() {
      if (hargaEl) {
         const selectedOpt = satuanEl.options[satuanEl.selectedIndex];
         if (selectedOpt) hargaEl.value = selectedOpt.dataset.price;
      }
      if (container.tagName === 'TR') {
        const match = container.id.match(/bt-row-(\d+)/);
        if (match && typeof btCalcRow === 'function') btCalcRow(match[1]);
      }
    };
    satuanEl.onchange(); // trigger initial price
  }
}
window.handleStockSelection = handleStockSelection;

function openMultiBarangTerjualModal() {
  _btRowCount = 0;
  document.getElementById('modal').style.maxWidth = '840px';
  openModal('🚛 Tambah Barang Terjual', buildMultiBarangTerjualForm(), null);
  btAddRow();
  document.getElementById('bt-add-row').addEventListener('click', btAddRow);
  document.getElementById('bt-simpan').addEventListener('click', () => {
    const tanggal   = document.getElementById('bt-tanggal').value.trim();
    const pelanggan = document.getElementById('bt-pelanggan').value.trim();
    const noFaktur  = document.getElementById('bt-nofaktur').value.trim();
    if (!tanggal)   { showToast('Tanggal wajib diisi!', 'error'); return; }
    if (!pelanggan) { showToast('Nama toko/pelanggan wajib diisi!', 'error'); return; }

    const tbody = document.getElementById('bt-rows');
    const items = [];
    let hasError = false;

    Array.from(tbody.rows).forEach(tr => {
      const nama      = tr.querySelector('[data-field="nama"]').value;
      const jumlah    = Number(tr.querySelector('[data-field="jumlah"]').value);
      const satuan    = tr.querySelector('[data-field="satuan"]').value;
      const hargaJual = Number(tr.querySelector('[data-field="hargaJual"]').value);

      if (!nama || !jumlah || !satuan || !hargaJual) {
        tr.style.outline = '2px solid var(--red)';
        hasError = true; return;
      }
      tr.style.outline = '';
      const ruteId = currentRuteId;
      const perjalananId = currentPerjalananId;
      items.push({ id: uid(), ruteId, perjalananId, tanggal, pelanggan, noFaktur, nama, jumlah, satuan, hargaJual });
    });

    if (hasError) { showToast('Lengkapi semua baris terlebih dahulu!', 'error'); return; }
    store.barangTerjual.push(...items);
    saveStore();
    closeModal();
    document.getElementById('modal').style.maxWidth = '';
    refreshAfterListChange('barangTerjual');
    showToast(`✅ ${items.length} barang terjual ke ${pelanggan} berhasil disimpan!`, 'success');
  });
}

/* ========================
   ADD / EDIT MODAL
   ======================== */
function refreshAfterListChange(key) {
  if (currentPerjalananId && currentRuteId && key !== 'ruteList') {
    renderPerjalananCategoryPage(currentRuteId, currentPerjalananId, key);
  } else {
    renderList(key);
  }
}

function openAddModal(key) {
  if (key === 'barangMasuk') {
    openMultiBarangMasukModal();
    return;
  }
  if (key === 'barangTerjual') {
    openMultiBarangTerjualModal();
    return;
  }
  const cfg = listConfig[key];
  openModal(`${cfg.icon} Tambah ${cfg.title}`, cfg.formFn(), (form) => {
    const fd = Object.fromEntries(new FormData(form));
    // coerce number fields
    ['jumlah','hargaModal','hargaJual'].forEach(f => { if (fd[f]) fd[f] = Number(fd[f]); });
    fd.id = uid();
    if (currentRuteId && key !== 'ruteList') fd.ruteId = currentRuteId;
    if (currentPerjalananId && key !== 'ruteList') fd.perjalananId = currentPerjalananId;
    store[key].push(fd);

    // If we just added a new rute, refresh the sidebar dynamically
    if (key === 'ruteList') renderRuteSidebar();
    
    saveStore();
    closeModal();
    refreshAfterListChange(key);
    showToast(`Data ${cfg.title} berhasil ditambahkan!`, 'success');
  });
}

function openEditModal(key, id) {
  const cfg = listConfig[key];
  const item = store[key].find(x => x.id === id);
  if (!item) return;
  openModal(`✏️ Edit ${cfg.title}`, cfg.formFn(item), (form) => {
    const fd = Object.fromEntries(new FormData(form));
    ['jumlah','hargaModal','hargaJual'].forEach(f => { if (fd[f]) fd[f] = Number(fd[f]); });
    const idx = store[key].findIndex(x => x.id === id);
    store[key][idx] = { ...item, ...fd };
    
    // If we just edited a rute, refresh the sidebar dynamically
    if (key === 'ruteList') renderRuteSidebar();
    
    saveStore();
    closeModal();
    refreshAfterListChange(key);
    showToast(`Data ${cfg.title} berhasil diperbarui!`, 'success');
  });
}

function deleteItem(key, id) {
  const html = `
    <div style="padding:10px 0 20px;text-align:center">
      <p style="margin-bottom:20px;font-size:15px;color:var(--text-secondary)">Yakin ingin menghapus data ini? Tindakan ini tidak dapat dibatalkan.</p>
      <div style="display:flex;justify-content:center;gap:12px">
        <button type="button" class="btn btn-ghost" onclick="closeModal(); document.getElementById('modal').style.maxWidth = '';">Batal</button>
        <button type="button" class="btn btn-danger" id="btn-confirm-del">Ya, Hapus</button>
      </div>
    </div>
  `;
  document.getElementById('modal').style.maxWidth = '400px';
  openModal('⚠️ Konfirmasi Hapus', html, null);
  
  document.getElementById('btn-confirm-del').addEventListener('click', () => {
    store[key] = store[key].filter(x => x.id !== id);
    if (key === 'ruteList') renderRuteSidebar();
    saveStore();
    closeModal();
    document.getElementById('modal').style.maxWidth = '';
    refreshAfterListChange(key);
    showToast('Data berhasil dihapus.', 'info');
  });
}

/* make functions accessible from HTML onclick */
window.openEditModal = openEditModal;
window.deleteItem    = deleteItem;
window.closeModal    = closeModal;

/* ========================
   STOK TOKO
   ======================== */
function getStokToko() {
  const map = {};
  store.barangMasuk.forEach(b => {
    const key = b.nama;
    if (!map[key]) {
      const jml1 = Number(b.jumlah1 || b.jumlah || 1);
      const jml2 = Number(b.jumlah2 || b.jumlah || 1);
      const konversi = Math.max(1, Math.floor(jml2 / jml1));
      map[key] = {
        nama: b.nama,
        satuan1: b.satuan1 || b.satuan,
        satuan2: b.satuan2 || b.satuan,
        konversi: konversi,
        stokKecil: 0,
        hargaModal: b.hargaModal || 0,
        hargaJual1: b.hargaJual1 || b.hargaJual || 0,
        hargaJual2: b.hargaJual2 || b.hargaJual || 0
      };
    }
    map[key].stokKecil += Number(b.jumlah2 || b.jumlah || 0);
    map[key].hargaModal = b.hargaModal || 0;
    map[key].hargaJual1 = b.hargaJual1 || b.hargaJual || 0;
    map[key].hargaJual2 = b.hargaJual2 || b.hargaJual || 0;
  });

  store.barangTerjual.forEach(b => {
    const key = b.nama;
    if (map[key]) {
      if (b.satuan === map[key].satuan1 && map[key].satuan1 !== map[key].satuan2) {
        map[key].stokKecil -= Number(b.jumlah || 0) * map[key].konversi;
      } else {
        map[key].stokKecil -= Number(b.jumlah || 0);
      }
    }
  });

  const items = Object.values(map).sort((a, b) =>
    a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' })
  );

  const totalModal = items.reduce((s,x) => s + (x.stokKecil / x.konversi) * x.hargaModal, 0);
  const totalJual  = items.reduce((s,x) => s + (x.stokKecil / x.konversi) * x.hargaJual1, 0);

  return { items, totalModal, totalJual };
}

function stokStatus(item) {
  if (item.stokKecil <= 0) return { label: 'Habis', cls: 'badge-red' };
  if (item.stokKecil <= 5) return { label: 'Menipis', cls: 'badge-orange' };
  return { label: 'Aman', cls: 'badge-green' };
}

function stokRowHtml(item) {
  const qtyBesar = item.stokKecil / item.konversi;
  const sisaTxt = formatStock(item.stokKecil, item.konversi, item.satuan1, item.satuan2);
  const nilaiModal = qtyBesar * item.hargaModal;
  const nilaiJual = qtyBesar * item.hargaJual1;
  const untung = nilaiJual - nilaiModal;
  const status = stokStatus(item);
  return `
  <tr>
    <td class="primary">${item.nama}</td>
    <td>
      <strong>${sisaTxt}</strong>
      <span class="badge ${status.cls}" style="margin-left:8px;">${status.label}</span>
    </td>
    <td>${fmt(item.hargaModal)} <small class="text-muted">/ ${item.satuan1}</small></td>
    <td>${fmt(item.hargaJual1)} <small class="text-muted">/ ${item.satuan1}</small></td>
    <td>${fmt(nilaiModal)}</td>
    <td class="amount-positive">${fmt(untung)}</td>
  </tr>`;
}

function sortStokItems(items, sortBy) {
  const list = items.slice();
  if (sortBy === 'stok-terendah') list.sort((a, b) => (a.stokKecil / a.konversi) - (b.stokKecil / b.konversi));
  else if (sortBy === 'modal-tertinggi') list.sort((a, b) => (b.stokKecil / b.konversi) * b.hargaModal - (a.stokKecil / a.konversi) * a.hargaModal);
  else list.sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
  return list;
}

function renderStok() {
  const content = document.getElementById('content');
  const stok = getStokToko();
  const { items, totalModal, totalJual } = stok;
  const totalUntung = totalJual - totalModal;
  const menipisCount = items.filter(x => x.stokKecil <= 5).length;

  const html = `
  <div class="page-anim">
    <div class="page-header">
      <div>
        <div class="page-title">🏪 Stok Toko</div>
        <div class="page-subtitle">Persediaan barang berdasarkan data Barang Masuk</div>
      </div>
    </div>

    <div class="stats-grid" style="margin-bottom:24px">
      <div class="stat-card blue">
        <div class="stat-icon blue">📦</div>
        <div class="stat-label">Total Jenis Barang</div>
        <div class="stat-value">${items.length}</div>
      </div>
      <div class="stat-card ${menipisCount > 0 ? 'red' : 'green'}">
        <div class="stat-icon ${menipisCount > 0 ? 'red' : 'green'}">⚠️</div>
        <div class="stat-label">Stok Menipis / Habis</div>
        <div class="stat-value">${menipisCount}</div>
      </div>
      <div class="stat-card green">
        <div class="stat-icon green">💵</div>
        <div class="stat-label">Total Nilai Modal Stok</div>
        <div class="stat-value">${fmt(totalModal)}</div>
      </div>
      <div class="stat-card purple">
        <div class="stat-icon purple">💹</div>
        <div class="stat-label">Estimasi Untung Jika Terjual Semua</div>
        <div class="stat-value">${fmt(totalUntung)}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header" style="flex-wrap:wrap; row-gap:12px;">
        <div class="card-title">Daftar Stok Barang</div>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <select class="form-select" id="sort-stok" style="width:190px;">
            <option value="nama">Urutkan: Nama (A-Z)</option>
            <option value="stok-terendah">Urutkan: Stok Tersedikit</option>
            <option value="modal-tertinggi">Urutkan: Nilai Modal Tertinggi</option>
          </select>
          <div class="search-bar">
            <span>🔍</span>
            <input type="text" id="search-stok" placeholder="Cari barang..." />
          </div>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th rowspan="2">Nama Barang</th>
              <th rowspan="2">Sisa Stok</th>
              <th colspan="2" style="text-align:center;">Harga per Satuan</th>
              <th colspan="2" style="text-align:center;">Nilai Stok Saat Ini</th>
            </tr>
            <tr>
              <th>Modal</th>
              <th>Jual</th>
              <th>Nilai Modal</th>
              <th>Estimasi Untung</th>
            </tr>
          </thead>
          <tbody id="tbody-stok">
            ${items.length ? sortStokItems(items, 'nama').map(stokRowHtml).join('') : `<tr><td colspan="6" style="padding:40px;text-align:center;color:var(--text-muted)">
              <div class="empty-state-icon">📭</div>
              <div class="empty-state-title">Stok kosong</div>
              <div class="empty-state-sub">Tambahkan data di menu Barang Masuk</div>
            </td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;

  content.innerHTML = html;

  function refresh() {
    const q = document.getElementById('search-stok').value.toLowerCase().trim();
    const sortBy = document.getElementById('sort-stok').value;
    const tbody = document.getElementById('tbody-stok');
    const filtered = sortStokItems(items.filter(x => x.nama.toLowerCase().includes(q)), sortBy);
    tbody.innerHTML = filtered.length
      ? filtered.map(stokRowHtml).join('')
      : `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">Tidak ditemukan</td></tr>`;
  }

  document.getElementById('search-stok').addEventListener('input', refresh);
  document.getElementById('sort-stok').addEventListener('change', refresh);
}

/* ========================
   LAPORAN KEUANGAN
   ======================== */
const LAPORAN_KEYS = ['barangMasuk', 'utang', 'piutang', 'uangKeluar', 'barangTerjual', 'rekapPiutang', 'tagihan', 'uangKeluarLK', 'uangMasuk'];

function getLaporanMonths() {
  const set = new Set();
  LAPORAN_KEYS.forEach(k => (store[k] || []).forEach(x => {
    if (!x.tanggal) return;
    const { m, y } = getMonthYear(x.tanggal);
    set.add(y * 12 + m);
  }));
  return [...set].sort((a, b) => a - b).map(v => ({ m: v % 12, y: Math.floor(v / 12) }));
}

function renderLaporan() {
  const now = new Date();
  const content = document.getElementById('content');

  function buildLaporan(m, y) {
    function inMonth(arr, field = 'tanggal') {
      return arr.filter(x => {
        const { m: xm, y: xy } = getMonthYear(x[field]);
        return xm === m && xy === y;
      });
    }

    // Pendapatan (Masuk)
    const totalUangMasuk  = sumField(inMonth(store.uangMasuk), 'jumlah');
    const totalPenjualan  = inMonth(store.barangTerjual).reduce((s,b) => s + b.jumlah * b.hargaJual, 0);
    const totalPendapatan = totalUangMasuk + totalPenjualan;

    // Pengeluaran (Keluar)
    const uangKeluarUtama = sumField(inMonth(store.uangKeluar), 'jumlah');
    const uangKeluarLK    = sumField(inMonth(store.uangKeluarLK), 'jumlah');
    const totalBelanjaBarang = inMonth(store.barangMasuk).reduce(
      (s, b) => s + Number(b.jumlah1 || b.jumlah || 0) * Number(b.hargaModal || 0), 0
    );
    const totalPengeluaran= uangKeluarUtama + uangKeluarLK + totalBelanjaBarang;

    // Laba / Rugi Bersih
    const labaBersih      = totalPendapatan - totalPengeluaran;

    // Piutang & Utang baru yang tercatat di bulan yang dipilih
    const totalPiutang    = sumField(inMonth(store.piutang), 'jumlah');
    const totalRekapPiutang = sumField(inMonth(store.rekapPiutang), 'jumlah');
    const totalUtang      = sumField(inMonth(store.utang), 'jumlah');
    const totalTagihan    = sumField(inMonth(store.tagihan), 'jumlah');

    // Sisa saldo yang masih belum lunas saat ini (tidak terikat bulan yang dipilih)
    const saldoPiutang = sumField(store.piutang.filter(x => x.status !== 'Lunas'), 'jumlah') +
                         sumField(store.rekapPiutang.filter(x => x.status !== 'Lunas'), 'jumlah');
    const saldoUtang   = sumField(store.utang.filter(x => x.status !== 'Lunas'), 'jumlah');

    return {
      totalUangMasuk, totalPenjualan, totalPendapatan,
      uangKeluarUtama, uangKeluarLK, totalBelanjaBarang, totalPengeluaran, labaBersih,
      totalPiutang, totalRekapPiutang, totalUtang, totalTagihan,
      saldoPiutang, saldoUtang
    };
  }

  function laporanRincian(lp) {
    return [
      { label: 'Penjualan Luar Kota', amount: lp.totalPenjualan },
      { label: 'Uang Masuk (Lainnya)', amount: lp.totalUangMasuk },
      { label: 'Uang Keluar (Toko Utama)', amount: -lp.uangKeluarUtama },
      { label: 'Uang Keluar (Luar Kota)', amount: -lp.uangKeluarLK },
      { label: 'Pembelian Barang Masuk (Modal Stok)', amount: -lp.totalBelanjaBarang },
    ]
      .filter(x => x.amount !== 0)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }

  function renderLaporanContent(m, y) {
    const lp = buildLaporan(m, y);
    const labaPos = lp.labaBersih >= 0;
    const laporanDiv = document.getElementById('laporan-content');
    if (!laporanDiv) return;

    laporanDiv.innerHTML = `
      <div class="profit-card" style="margin-bottom:8px; background: var(--bg-card); border-left: 4px solid ${labaPos ? 'var(--green)' : 'var(--red)'}">
        <div class="profit-card-left">
          <h3 style="color:var(--text-secondary)">Estimasi ${labaPos ? 'Keuntungan' : 'Kerugian'} Bulan ${MONTHS[m]} ${y}</h3>
          <div class="big-val" style="color: ${labaPos ? 'var(--green)' : 'var(--red)'}">${fmt(Math.abs(lp.labaBersih))}</div>
        </div>
        <div class="profit-icon">${labaPos ? '📈' : '📉'}</div>
      </div>

      <div class="card" style="margin-bottom:24px;">
        <div class="card-header">
          <div>
            <div class="card-title">🔎 Rincian Penyebab Untung / Rugi</div>
            <div style="color:var(--text-muted); font-size:12px; margin-top:4px;">Semua sumber pendapatan & pengeluaran bulan ${MONTHS[m]} ${y}, diurutkan dari yang paling besar pengaruhnya</div>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <tbody>
              ${(() => {
                const rincian = laporanRincian(lp);
                if (!rincian.length) return `<tr><td style="padding:20px;text-align:center;color:var(--text-muted)">Tidak ada transaksi bulan ini</td></tr>`;
                return rincian.map(r => `
                  <tr>
                    <td style="width:24px;">${r.amount >= 0 ? '🟢' : '🔴'}</td>
                    <td class="primary">${r.label} <span style="color:var(--text-muted); font-weight:400;">(${r.amount >= 0 ? 'penambah untung' : 'penyebab rugi'})</span></td>
                    <td class="${r.amount >= 0 ? 'amount-positive' : 'amount-negative'}" style="text-align:right; font-weight:700;">${r.amount >= 0 ? '' : '-'}${fmt(Math.abs(r.amount))}</td>
                  </tr>`).join('');
              })()}
              <tr style="border-top:2px solid var(--border-light);">
                <td></td>
                <td style="font-weight:700;">${labaPos ? 'Estimasi Keuntungan' : 'Estimasi Kerugian'} Bersih</td>
                <td style="text-align:right; font-weight:700; color:${labaPos ? 'var(--green)' : 'var(--red)'}">${fmt(Math.abs(lp.labaBersih))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; margin-bottom:24px;">
        <!-- Card Laba Rugi -->
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">📊 Laporan Laba / Rugi</div>
              <div style="color:var(--text-muted); font-size:12px; margin-top:4px;">Uang yang benar-benar masuk & keluar selama bulan ${MONTHS[m]} ${y}</div>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <tbody>
                <tr><td colspan="2" style="background:var(--bg-sidebar);font-weight:700;font-size:12px;color:var(--text-muted)">PENDAPATAN</td></tr>
                <tr><td class="primary">Penjualan Luar Kota</td><td class="amount-positive">${fmt(lp.totalPenjualan)}</td></tr>
                <tr><td class="primary">Uang Masuk (Lainnya)</td><td class="amount-positive">${fmt(lp.totalUangMasuk)}</td></tr>
                <tr><td style="font-weight:700">Total Pendapatan</td><td class="amount-positive" style="font-weight:700">${fmt(lp.totalPendapatan)}</td></tr>

                <tr><td colspan="2" style="background:var(--bg-sidebar);font-weight:700;font-size:12px;color:var(--text-muted)">PENGELUARAN</td></tr>
                <tr><td class="primary">Uang Keluar (Toko Utama)</td><td class="amount-negative">-${fmt(lp.uangKeluarUtama)}</td></tr>
                <tr><td class="primary">Uang Keluar (Luar Kota)</td><td class="amount-negative">-${fmt(lp.uangKeluarLK)}</td></tr>
                <tr><td class="primary">Pembelian Barang Masuk (Modal Stok)</td><td class="amount-negative">-${fmt(lp.totalBelanjaBarang)}</td></tr>
                <tr><td style="font-weight:700">Total Pengeluaran</td><td class="amount-negative" style="font-weight:700">-${fmt(lp.totalPengeluaran)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Card Utang Piutang -->
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">📒 Utang & Piutang</div>
              <div style="color:var(--text-muted); font-size:12px; margin-top:4px;">Catatan baru bulan ${MONTHS[m]} ${y}, dan sisa saldo yang belum lunas sampai sekarang</div>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <tbody>
                <tr><td colspan="2" style="background:var(--bg-sidebar);font-weight:700;font-size:12px;color:var(--text-muted)">TERCATAT BARU BULAN ${MONTHS[m].toUpperCase()} ${y}</td></tr>
                <tr><td class="primary">Piutang Baru (Toko Utama)</td><td class="amount-positive">${fmt(lp.totalPiutang)}</td></tr>
                <tr><td class="primary">Piutang Baru (Luar Kota)</td><td class="amount-positive">${fmt(lp.totalRekapPiutang)}</td></tr>
                <tr><td class="primary">Utang Baru</td><td class="amount-negative">${fmt(lp.totalUtang)}</td></tr>
                <tr><td class="primary">Tagihan (Luar Kota)</td><td class="amount-negative">${fmt(lp.totalTagihan)}</td></tr>

                <tr><td colspan="2" style="background:var(--bg-sidebar);font-weight:700;font-size:12px;color:var(--text-muted)">SISA SALDO BELUM LUNAS (SAAT INI)</td></tr>
                <tr>
                  <td class="primary">Piutang Belum Lunas</td>
                  <td class="amount-positive">${fmt(lp.saldoPiutang)}</td>
                </tr>
                <tr>
                  <td class="primary">Utang Belum Lunas</td>
                  <td class="amount-negative">${fmt(lp.saldoUtang)}</td>
                </tr>
                <tr>
                  <td colspan="2" style="font-size:11px; color:var(--text-muted); padding-top:4px;">
                    Angka ini sama dengan Dashboard, dan berubah otomatis begitu status piutang/utang ditandai "Lunas" di halaman pencatatan.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function buildLaporanChartHtml(chartData, selM, selY) {
    if (!chartData.length) {
      return `<div class="card"><div style="padding:30px;text-align:center;color:var(--text-muted)">Belum ada transaksi untuk ditampilkan grafiknya</div></div>`;
    }
    const w = 760, h = 220, padTop = 24, padBottom = 34, padSide = 24;
    const chartH = h - padTop - padBottom;
    const barGap = 18;
    const barWidth = Math.min(64, (w - padSide * 2 - barGap * (chartData.length - 1)) / chartData.length);
    const maxAbs = Math.max(1, ...chartData.map(d => Math.abs(d.laba)));
    const zeroY = padTop + chartH / 2;
    const scale = (chartH / 2 - 14) / maxAbs;

    const bars = chartData.map((d, i) => {
      const x = padSide + i * (barWidth + barGap);
      const barH = Math.max(Math.abs(d.laba) * scale, d.laba === 0 ? 0 : 2);
      const y = d.laba >= 0 ? zeroY - barH : zeroY;
      const isPos = d.laba >= 0;
      const isSelected = d.m === selM && d.y === selY;
      const color = isPos ? 'var(--green)' : 'var(--red)';
      const labelY = isPos ? y - 8 : y + barH + 16;
      return `
        <g>
          <rect class="laba-bar" data-m="${d.m}" data-y="${d.y}" x="${x}" y="${y}" width="${barWidth}" height="${barH}"
            fill="${color}" opacity="${isSelected ? '1' : '0.5'}" rx="4"
            stroke="${color}" stroke-width="${isSelected ? 2 : 0}" style="cursor:pointer;" />
          <text x="${x + barWidth / 2}" y="${labelY}" text-anchor="middle" font-size="11" fill="${color}" font-weight="700">${isPos ? '' : '-'}${fmtShort(Math.abs(d.laba))}</text>
          <text x="${x + barWidth / 2}" y="${h - 12}" text-anchor="middle" font-size="11" fill="var(--text-muted)">${MONTHS[d.m].slice(0, 3)} ${String(d.y).slice(2)}</text>
        </g>`;
    }).join('');

    return `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">📉 Grafik Untung / Rugi per Bulan</div>
          <div style="color:var(--text-muted); font-size:12px; margin-top:4px;">Klik salah satu batang untuk melihat rincian bulan tersebut. Hijau = untung, merah = rugi.</div>
        </div>
      </div>
      <div style="padding:16px 20px;">
        <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:auto; max-height:240px; display:block;">
          <line x1="${padSide}" y1="${zeroY}" x2="${w - padSide}" y2="${zeroY}" stroke="var(--border)" stroke-width="1" />
          ${bars}
        </svg>
      </div>
    </div>`;
  }

  function wireChartBarClicks() {
    document.querySelectorAll('.laba-bar').forEach(el => {
      el.addEventListener('click', () => {
        const m = Number(el.dataset.m), y = Number(el.dataset.y);
        document.getElementById('laporan-bulan').value = m;
        document.getElementById('laporan-tahun').value = y;
        renderAll(m, y);
      });
    });
  }

  function renderAll(m, y) {
    renderLaporanContent(m, y);
    document.getElementById('laporan-chart').innerHTML = buildLaporanChartHtml(chartData, m, y);
    wireChartBarClicks();
  }

  const allMonths = getLaporanMonths();
  const chartData = allMonths
    .map(({ m, y }) => ({ m, y, lp: buildLaporan(m, y) }))
    .filter(d => d.lp.totalPendapatan !== 0 || d.lp.totalPengeluaran !== 0)
    .map(d => ({ m: d.m, y: d.y, laba: d.lp.labaBersih }));

  let selM = now.getMonth(), selY = now.getFullYear();
  if (!allMonths.some(x => x.m === selM && x.y === selY)) {
    const last = allMonths[allMonths.length - 1];
    if (last) { selM = last.m; selY = last.y; }
  }
  const bulanOptions = [...new Set(allMonths.map(x => x.m))].sort((a, b) => a - b);
  const tahunOptions = [...new Set(allMonths.map(x => x.y))].sort((a, b) => a - b);

  const html = `
  <div class="page-anim">
    <div class="page-header" style="align-items:center;">
      <div>
        <div class="page-title">📈 Laporan Keuangan</div>
        <div class="page-subtitle">Ringkasan kondisi keuangan toko</div>
      </div>
      <div class="filter-bar" style="display:flex; align-items:center; gap:8px;">
        <label style="font-size:13px; color:var(--text-muted); font-weight:600;">Bulan:</label>
        <select class="form-select" id="laporan-bulan" style="width:150px;">
          ${bulanOptions.map(m => `<option value="${m}" ${m === selM ? 'selected' : ''}>${MONTHS[m]}</option>`).join('')}
        </select>
        <label style="font-size:13px; color:var(--text-muted); font-weight:600;">Tahun:</label>
        <select class="form-select" id="laporan-tahun" style="width:100px;">
          ${tahunOptions.map(y => `<option value="${y}" ${y === selY ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="laporan-chart" style="margin-bottom:24px;"></div>
    <div id="laporan-content"></div>
  </div>`;

  content.innerHTML = html;
  renderAll(selM, selY);

  document.getElementById('laporan-bulan').addEventListener('change', () => {
    renderAll(Number(document.getElementById('laporan-bulan').value), Number(document.getElementById('laporan-tahun').value));
  });
  document.getElementById('laporan-tahun').addEventListener('change', () => {
    renderAll(Number(document.getElementById('laporan-bulan').value), Number(document.getElementById('laporan-tahun').value));
  });
}

/* ========================
   INIT
   ======================== */
updateDate();
renderRuteSidebar();
navigate('dashboard', null, { replace: true });
document.getElementById('btn-global-back').addEventListener('click', () => {
  if (navDepth > 0) history.back();
});
