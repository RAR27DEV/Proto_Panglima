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
/* Material Symbols icon helper */
const ico = (name, size) =>
  `<span class="material-symbols-outlined"${size ? ` style="font-size:${size}px"` : ''}>${name}</span>`;

/* Amankan teks dari pengguna sebelum disisipkan ke HTML.
   Tanpa ini, nama barang/toko yang berisi tag HTML bisa dieksekusi
   sebagai skrip (XSS) — berbahaya begitu data dipakai bersama di hosting. */
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}
/* alias pendek supaya template tetap enak dibaca */
const e = escapeHtml;
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
  if (!sat1 || sat1 === sat2 || konversi <= 1) return `${fmtNum(stokKecil)} ${sat2}`;
  const qty1 = Math.floor(stokKecil / konversi);
  const qty2 = stokKecil % konversi;
  let res = [];
  if (qty1 > 0) res.push(`${fmtNum(qty1)} ${sat1}`);
  if (qty2 > 0 || qty1 === 0) res.push(`${fmtNum(qty2)} ${sat2}`);
  return res.join(' ');
}

function statusBadgeCell(key, item) {
  const isLunas = item.status === 'Lunas';
  return `<td>
    <span class="badge ${isLunas ? 'badge-green' : 'badge-orange'}" data-aksi="lunas" data-key="${key}" data-id="${item.id}" title="Klik untuk ubah status">
      ${isLunas ? '&#10003; Lunas' : 'Belum Lunas'}
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

/* Mode penyimpanan:
   'server' = tersimpan di database hosting (mode sesungguhnya)
   'lokal'  = fallback ke browser, dipakai saat mencoba tampilan tanpa PHP  */
let storageMode = 'server';
let csrfToken   = '';

function loadStoreLokal() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (err) {}
  if (!s) return defaultStore();
  return Object.assign(defaultStore(), s);
}

function saveStoreLokal() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (err) {}
}

/* ── Simpan ke server (ditunda sesaat supaya beberapa perubahan
      beruntun cukup satu kali kirim) ── */
let _saveTimer = null;
let _savePending = false;

function saveStore() {
  if (storageMode === 'lokal') { saveStoreLokal(); return; }
  _savePending = true;
  setSaveStatus('menyimpan');
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(kirimKeServer, 400);
}

async function kirimKeServer() {
  if (!_savePending) return;
  _savePending = false;
  try {
    const res = await fetch('api/save.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      credentials: 'same-origin',
      body: JSON.stringify({ store }),
    });
    if (res.status === 401) { window.location.replace('login.html'); return; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menyimpan.');
    setSaveStatus('tersimpan');
  } catch (err) {
    setSaveStatus('gagal');
    showToast('Gagal menyimpan ke server. Perubahan terakhir belum tersimpan.', 'error');
  }
}

/* Peringatan kalau menutup tab saat masih ada yang belum tersimpan */
window.addEventListener('beforeunload', (ev) => {
  if (_savePending || saveStatusEl?.dataset.state === 'menyimpan') {
    ev.preventDefault();
    ev.returnValue = '';
  }
});

let saveStatusEl = null;
function setSaveStatus(state) {
  saveStatusEl = saveStatusEl || document.getElementById('save-status');
  if (!saveStatusEl) return;
  saveStatusEl.dataset.state = state;
  const map = {
    menyimpan: ['sync', 'Menyimpan…'],
    tersimpan: ['cloud_done', 'Tersimpan'],
    gagal:     ['cloud_off', 'Gagal simpan'],
    lokal:     ['warning', 'Mode demo — data hanya di browser ini'],
  };
  const [icon, text] = map[state] || map.tersimpan;
  saveStatusEl.innerHTML = `${ico(icon, 16)}<span>${escapeHtml(text)}</span>`;
  if (state === 'tersimpan') {
    clearTimeout(saveStatusEl._t);
    saveStatusEl._t = setTimeout(() => {
      if (saveStatusEl.dataset.state === 'tersimpan') saveStatusEl.dataset.state = 'idle';
    }, 2200);
  }
}

function defaultStore() {
  return {
    ruteList:      [
      { id: 'rute-bengkulu', nama: 'Bengkulu' },
      { id: 'rute-jambi',    nama: 'Jambi' },
      { id: 'rute-riau',     nama: 'Riau' },
      { id: 'rute-medan',    nama: 'Medan' },
    ],
    stokToko:      [],
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

/* Diisi saat aplikasi mulai — dari database (mode server)
   atau dari browser (mode demo tanpa PHP). */
let store = defaultStore();

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
    // BARANG MASUK RUTE (Luar Kota)
    { id: uid(), ruteId: 'rute-bengkulu', perjalananId: 'pj-bengkulu-1', tanggal: '2026-05-13', supplier: 'Kapusi', nama: 'Meter Hitam 5M', jumlah1: 25, satuan1: 'Pcs', hargaModal: 24000, hargaJual1: 32000 },
    { id: uid(), ruteId: 'rute-bengkulu', perjalananId: 'pj-bengkulu-1', tanggal: '2026-05-13', supplier: 'Jotasindo', nama: 'Cat Samurai Campur Warna', jumlah1: 5, satuan1: 'Lusin', hargaModal: 448000, hargaJual1: 550000 },
    { id: uid(), ruteId: 'rute-bengkulu', perjalananId: 'pj-bengkulu-2', tanggal: '2026-06-14', supplier: 'Buyaris', nama: 'Kawat Hijau', jumlah1: 20, satuan1: 'Rol', hargaModal: 55000, hargaJual1: 70000 },
    { id: uid(), ruteId: 'rute-jambi',    perjalananId: 'pj-jambi-1',    tanggal: '2026-05-14', supplier: 'Kapusi', nama: 'Gergaji Kayu Kapusi', jumlah1: 15, satuan1: 'Pcs', hargaModal: 30000, hargaJual1: 40000 },
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
    { id: uid(), perjalananId: 'pd-2026-05', tanggal: '2026-05-10', keterangan: 'Bayar listrik toko',   jumlah: 400000 },
    { id: uid(), perjalananId: 'pd-2026-05', tanggal: '2026-05-13', keterangan: 'Gaji karyawan bulan Mei',    jumlah: 3000000 },
    { id: uid(), perjalananId: 'pd-2026-06', tanggal: '2026-06-09', keterangan: 'Bayar listrik toko',   jumlah: 420000 },
    { id: uid(), perjalananId: 'pd-2026-06', tanggal: '2026-06-13', keterangan: 'Gaji karyawan bulan Juni',   jumlah: 3000000 },
    { id: uid(), perjalananId: 'pd-2026-07', tanggal: '2026-07-10', keterangan: 'Bayar listrik toko',   jumlah: 430000 },
    { id: uid(), perjalananId: 'pd-2026-07', tanggal: '2026-07-13', keterangan: 'Gaji karyawan bulan Juli',   jumlah: 3000000 },
    { id: uid(), perjalananId: 'pd-2026-07', tanggal: '2026-07-22', keterangan: 'Servis motor pengiriman', jumlah: 350000 },
    { id: uid(), perjalananId: 'pd-2026-08', tanggal: '2026-08-11', keterangan: 'Bayar listrik toko',   jumlah: 450000 },
    { id: uid(), perjalananId: 'pd-2026-08', tanggal: '2026-08-13', keterangan: 'Gaji karyawan bulan Agustus', jumlah: 3000000 },
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
    // Periode Toko Utama (tanpa ruteId) — mengelompokkan Uang Keluar
    { id: 'pd-2026-05', tanggalMulai: '2026-05-01', tanggalSelesai: '2026-05-31' },
    { id: 'pd-2026-06', tanggalMulai: '2026-06-01', tanggalSelesai: '2026-06-30' },
    { id: 'pd-2026-07', tanggalMulai: '2026-07-01', tanggalSelesai: '2026-07-31' },
    { id: 'pd-2026-08', tanggalMulai: '2026-08-01', tanggalSelesai: '2026-08-31' },
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

/* ========================
   ROUTER
   ======================== */
const pageMap = {
  'dashboard':       renderDashboard,
  'barang-masuk':    () => renderList('barangMasuk'),
  'utang':           () => renderList('utang'),
  'piutang':         () => renderList('piutang'),
  'uang-keluar':       () => renderCategoryTripList(null, 'uangKeluar'),
  'uang-keluar-semua': () => renderList('uangKeluar'),
  'barang-terjual':  () => renderList('barangTerjual'),
  'rekap-piutang':   () => renderList('rekapPiutang'),
  'tagihan':         () => renderList('tagihan'),
  'uang-keluar-lk':  () => renderList('uangKeluarLK'),
  'uang-masuk':      () => renderList('uangMasuk'),
  'pj-barang-masuk':   () => renderCategoryTripList(currentRuteId, 'barangMasuk'),
  'pj-barang-terjual': () => renderCategoryTripList(currentRuteId, 'barangTerjual'),
  'pj-rekap-piutang':  () => renderCategoryTripList(currentRuteId, 'rekapPiutang'),
  'pj-tagihan':        () => renderCategoryTripList(currentRuteId, 'tagihan'),
  'pj-uang-keluar':    () => renderCategoryTripList(currentRuteId, 'uangKeluarLK'),
  'pj-uang-masuk':     () => renderCategoryTripList(currentRuteId, 'uangMasuk'),
  'pj-keuntungan':     () => renderKeuntunganRute(currentRuteId),
  'rekap-semua-rute':  renderRekapSemuaRute,
  'rekap-per-bulan':   renderRekapPerBulan,
  'backup-data':       renderBackupPage,
  'stok-toko':       renderStok,
  'laporan-keuangan':renderLaporan,
  'penjelasan-laporan': renderPenjelasanLaporan,
  'pengaturan-rute': () => renderList('ruteList'),
};

const pageTitles = {
  'dashboard':       'Dashboard',
  'barang-masuk':    'Barang Masuk',
  'utang':           'Utang',
  'piutang':         'Piutang',
  'uang-keluar':       'Uang Keluar',
  'uang-keluar-semua': 'Uang Keluar (Semua Data)',
  'barang-terjual':  'Barang Terjual (Rute)',
  'rekap-piutang':   'Rekap Piutang (Rute)',
  'tagihan':         'Tagihan (Rute)',
  'uang-keluar-lk':  'Uang Keluar (Rute)',
  'uang-masuk':      'Uang Masuk (Rute)',
  'pj-barang-masuk':   'Barang Masuk',
  'pj-barang-terjual': 'Barang Terjual',
  'pj-rekap-piutang':  'Rekap Piutang',
  'pj-tagihan':        'Tagihan',
  'pj-uang-keluar':    'Uang Keluar',
  'pj-uang-masuk':     'Uang Masuk',
  'pj-keuntungan':     'Keuntungan Rute',
  'rekap-semua-rute':  'Rekap Keuntungan Semua Rute',
  'rekap-per-bulan':   'Rekap Per Bulan',
  'backup-data':       'Backup & Restore Data Toko',
  'stok-toko':       'Stok Toko',
  'laporan-keuangan':'Laporan Keuangan',
  'penjelasan-laporan': 'Penjelasan Laporan Keuangan',
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
  } else if (!currentRuteId && (key === 'barangMasuk' || key === 'uangKeluar')) {
    data = data.filter(x => !x.ruteId);
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

window.addEventListener('popstate', (ev) => {
  navDepth = Math.max(0, navDepth - 1);
  updateBackButton();
  const state = ev.state;
  if (!state || state.type === 'page') {
    navigate(state ? state.page : 'dashboard', state ? state.ruteId : null, { fromHistory: true });
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
  bukaSubmenuAktif();

  let title = pageTitles[page] || page;
  if (ruteId) {
    const r = store.ruteList.find(x => x.id === ruteId);
    if (r) title += ` - ${e(r.nama)}`;
  }
  document.getElementById('topbar-title').textContent = title;

  const content = document.getElementById('content');
  content.innerHTML = '';

  const fn = pageMap[page];
  if (fn) fn();

  // kata kunci bawaan dari pencarian global
  if (opts.cari) {
    const kotak = content.querySelector('#search-stok, .search-bar input');
    if (kotak) {
      kotak.value = opts.cari;
      kotak.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // close sidebar on mobile
  setSidebar(false);

  pushNavState({ type: 'page', page, ruteId }, opts);
}

function renderRuteSidebar() {
  const container = document.getElementById('dynamic-rute-sidebar');
  if (!container) return;

  let html = `
    <a class="nav-item" data-page="rekap-semua-rute" id="nav-rute-rekap-semua" style="margin-bottom:6px;border-left:3px solid var(--brand);background:rgba(15,118,110,0.06);">
      <span class="nav-icon" style="color:var(--brand);">${ico('query_stats')}</span>
      <span style="font-weight:700;color:var(--brand);">Rekap Semua Rute</span>
    </a>
  `;
  store.ruteList.forEach(rute => {
    html += `
      <div class="nav-section-label collapsible" data-submenu="submenu-rute-${rute.id}">
        <span style="display:flex;align-items:center;gap:7px;">${ico('local_shipping', 17)}${e(rute.nama)}</span>
        <span class="chevron" id="chevron-rute-${rute.id}">▼</span>
      </div>
      <div class="submenu" id="submenu-rute-${rute.id}">
        <a class="nav-item" data-page="pj-keuntungan" data-rute="${rute.id}">
          <span class="nav-icon">${ico('trending_up')}</span><span>Keuntungan Rute</span>
        </a>
        <a class="nav-item" data-page="pj-barang-masuk" data-rute="${rute.id}">
          <span class="nav-icon">${ico('inventory_2')}</span><span>Barang Masuk</span>
        </a>
        <a class="nav-item" data-page="pj-barang-terjual" data-rute="${rute.id}">
          <span class="nav-icon">${ico('local_shipping')}</span><span>Barang Terjual</span>
        </a>
        <a class="nav-item" data-page="pj-rekap-piutang" data-rute="${rute.id}">
          <span class="nav-icon">${ico('receipt_long')}</span><span>Daftar Piutang Rute</span>
        </a>
        <a class="nav-item" data-page="pj-uang-keluar" data-rute="${rute.id}">
          <span class="nav-icon">${ico('payments')}</span><span>Uang Keluar</span>
        </a>
        <a class="nav-item" data-page="pj-uang-masuk" data-rute="${rute.id}">
          <span class="nav-icon">${ico('savings')}</span><span>Uang Masuk</span>
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
function setSidebar(open) {
  const sb = document.getElementById('sidebar');
  const bd = document.getElementById('sidebar-backdrop');
  sb.classList.toggle('open', open);
  if (bd) {
    bd.hidden = !open;
    // beri jeda satu frame supaya transisi opacity sempat berjalan
    if (open) requestAnimationFrame(() => bd.classList.add('show'));
    else bd.classList.remove('show');
  }
  // kunci gulir halaman di belakang menu
  document.body.style.overflow = open ? 'hidden' : '';
}

document.getElementById('sidebar-toggle').addEventListener('click', () => {
  setSidebar(!document.getElementById('sidebar').classList.contains('open'));
});

document.getElementById('sidebar-backdrop')?.addEventListener('click', () => setSidebar(false));

// Esc menutup menu
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && document.getElementById('sidebar').classList.contains('open')) {
    setSidebar(false);
  }
});

// kalau layar dilebarkan kembali, pastikan status menu bersih
window.addEventListener('resize', () => {
  if (window.innerWidth > 1024) setSidebar(false);
});

/* Ukuran kanvas grafik berbeda antara layar sempit dan lebar,
   jadi Dashboard digambar ulang saat melewati ambang itu
   (mis. ponsel diputar ke posisi mendatar). */
let _sempitTerakhir = window.innerWidth <= 700;
let _resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    const sempit = window.innerWidth <= 700;
    if (sempit !== _sempitTerakhir) {
      _sempitTerakhir = sempit;
      if (currentPage === 'dashboard') renderDashboard();
    }
  }, 200);
});

/* ========================
   NAV ITEMS DELEGATION
   ======================== */
document.querySelector('.sidebar-nav').addEventListener('click', (ev) => {
  const item = ev.target.closest('.nav-item');
  if (item && item.dataset.page) {
    navigate(item.dataset.page, item.dataset.rute);
    return;
  }
  // Judul seksi yang bisa dilipat (Toko Utama, tiap rute)
  const kepala = ev.target.closest('.nav-section-label[data-submenu]');
  if (kepala) {
    const sub = document.getElementById(kepala.dataset.submenu);
    setSubmenuOpen(sub, !sub.classList.contains('open'));
  }
});

/* Buka/tutup satu submenu beserta tanda panah dan judul seksinya. */
function setSubmenuOpen(el, open) {
  if (!el) return;
  el.classList.toggle('open', open);
  const chev = document.getElementById(el.id.replace('submenu', 'chevron'));
  if (!chev) return;
  chev.classList.toggle('open', open);
  // tandai judul seksinya supaya jelas sedang terbuka
  chev.closest('.nav-section-label')?.classList.toggle('is-open', open);
}

/* Submenu yang memuat menu aktif ikut terbuka sendiri. Dipanggil dari
   navigate(), jadi juga berlaku saat pindah halaman lewat pencarian. */
function bukaSubmenuAktif() {
  document.querySelectorAll('.submenu').forEach(sub => {
    if (sub.querySelector('.nav-item.active')) setSubmenuOpen(sub, true);
  });
}

/* ========================
   AKSI LEWAT DELEGASI
   ========================
   Tombol dan sel yang bisa diklik menandai dirinya dengan atribut
   `data-aksi`, bukan `onclick=` di HTML. Satu penangan di `document` yang
   membacanya, jadi markup yang digambar ulang (tabel, isi modal, sidebar
   rute) tidak perlu dipasangi listener lagi — dan Content-Security-Policy
   boleh tetap melarang skrip inline. */
const AKSI_KLIK = {
  'tutup-modal':      ()   => tryCloseModal(),
  'lunas':            (el) => toggleLunas(el.dataset.key, el.dataset.id),
  'ubah':             (el) => openEditModal(el.dataset.key, el.dataset.id),
  'hapus':            (el) => deleteItem(el.dataset.key, el.dataset.id),
  'buka-perjalanan':  (el) => openPerjalananCategory(el.dataset.rute || null, el.dataset.pj, el.dataset.key),
  'ubah-perjalanan':  (el) => openEditPerjalanan(el.dataset.pj, el.dataset.key),
  'hapus-perjalanan': (el) => deletePerjalanan(el.dataset.pj, el.dataset.rute || null, el.dataset.key),
  'hapus-baris-bm':   (el) => bmRemoveRow(el.dataset.idx || el.dataset.rid),
  'duplikat-baris-bm':(el) => bmDuplicateRow(el.dataset.idx || el.dataset.rid),
  'hapus-baris-bt':   (el) => btRemoveRow(el.dataset.rid),
  'duplikat-baris-bt':(el) => btDuplicateRow(el.dataset.rid),
  'edit-stok':        (el) => editStokModal(el.dataset.nama),
  'hapus-stok':       (el) => hapusStok(el.dataset.nama),
  'buka-keuntungan-rute': (el) => navigate('pj-keuntungan', el.dataset.rute),
  // Dari Rekap Per Bulan: buka Keuntungan Rute langsung di perjalanan (atau rentang tanggal) yang diklik
  'buka-keuntungan-trip': (el) => {
    filterKeuntungan.startDate    = el.dataset.mulai || '';
    filterKeuntungan.endDate      = el.dataset.selesai || '';
    filterKeuntungan.perjalananId = el.dataset.pj || '';
    navigate('pj-keuntungan', el.dataset.rute);
  },
  // Dari Rekap Per Bulan: buka modal detail transaksi satu perjalanan langsung (tidak pindah halaman)
  'rbp-detail-perjalanan': (el) => {
    const ruteId   = el.dataset.rute;
    const pjIds    = (el.dataset.pjIds || el.dataset.pj || '').split(',').filter(Boolean);
    const label    = el.dataset.label || '';
    const namaRute = el.dataset.namaRute || '';
    bukaModalDetailPerjalanan(ruteId, pjIds, namaRute, label);
  },
};

document.addEventListener('click', (ev) => {
  const t = ev.target;
  if (!t || !t.closest) return;

  const tujuan = t.closest('[data-nav]');
  if (tujuan) { navigate(tujuan.dataset.nav, tujuan.dataset.rute); return; }

  const el = t.closest('[data-aksi]');
  const jalankan = el && AKSI_KLIK[el.dataset.aksi];
  if (jalankan) jalankan(el);
});

/* Pilih barang dari stok -> isi satuan & harga otomatis */
document.addEventListener('change', (ev) => {
  const el = ev.target.closest?.('[data-aksi="pilih-stok"]');
  if (el) handleStockSelection(el);
  const elBm = ev.target.closest?.('[data-aksi="pilih-stok-bm"]');
  if (elBm) handleStockSelectionBM(elBm);
});

/* Jumlah / harga diubah -> hitung ulang total baris */
document.addEventListener('input', (ev) => {
  const el = ev.target.closest?.('[data-aksi="hitung-baris-bt"]');
  if (el) btCalcRow(el.dataset.rid);
  const elBm = ev.target.closest?.('[data-aksi="hitung-baris-bm"]');
  if (elBm) bmCalcRow(elBm.dataset.rid);
});

/* ========================
   MODAL HELPERS
   ======================== */
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle   = document.getElementById('modal-title');
const modalBody    = document.getElementById('modal-body');
const modalBox     = document.getElementById('modal');

/* Beberapa formulir (barang masuk/terjual banyak baris) butuh modal lebih
   lebar. Lebarnya selalu dikembalikan ke bawaan oleh closeModal(), jadi
   pemanggilnya tidak perlu meresetnya sendiri. */
function setLebarModal(lebar) {
  modalBox.style.maxWidth = lebar || '';
}

function openModal(title, bodyHTML, onSubmit) {
  // judul boleh berisi ikon (HTML) — isinya selalu dari template internal, bukan input pengguna
  modalTitle.innerHTML = title;
  modalBody.innerHTML = bodyHTML;
  modalOverlay.classList.add('open');

  modalBody.querySelectorAll('select[data-aksi="pilih-stok"]').forEach(sel => {
    if (sel.value === '__MANUAL__') handleStockSelection(sel);
  });
  modalBody.querySelectorAll('select[data-aksi="pilih-stok-bm"]').forEach(sel => {
    if (sel.value === '__MANUAL__') handleStockSelectionBM(sel);
  });

  const form = modalBody.querySelector('form');
  if (form && onSubmit) {
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      onSubmit(form);
    });
  }
}

function isModalFormDirty() {
  if (!modalBody) return false;
  // Periksa apakah pengguna sudah mengetik atau memasukkan data
  const inputs = modalBody.querySelectorAll('input:not([type="hidden"]), select, textarea');
  for (const inp of inputs) {
    if (inp.id === 'bm-tanggal' || inp.id === 'bt-tanggal' || inp.name === 'tanggal') continue;
    if (inp.type === 'number' && Number(inp.value) > 0) return true;
    if ((inp.type === 'text' || inp.tagName === 'TEXTAREA') && inp.value.trim().length > 0) return true;
    if (inp.dataset && (inp.dataset.field === 'nama' || inp.dataset.field === 'pelanggan' || inp.dataset.field === 'supplier') && inp.value && inp.value !== '__MANUAL__') return true;
  }
  const multiRows = modalBody.querySelectorAll('#bm-rows tr, #bt-rows tr');
  if (multiRows.length > 1) return true;
  return false;
}

function tryCloseModal() {
  if (isModalFormDirty()) {
    if (!confirm('Perhatian: Data yang sedang Anda isi belum disimpan.\n\nYakin ingin membatalkan dan menutup form? (Draf ketikan Anda tetap tersimpan)')) {
      return;
    }
  }
  closeModal();
}

function closeModal() {
  modalOverlay.classList.remove('open');
  // dibereskan setelah animasi tutup selesai, supaya modal tidak mengkerut dulu
  setTimeout(() => { modalBody.innerHTML = ''; setLebarModal(''); }, 300);
}

document.getElementById('modal-close').addEventListener('click', tryCloseModal);

// PENTING: JANGAN tutup modal hanya karena kursor mouse keluar atau mengklik overlay latar belakang!
// Menjawab komplain klien: "tiap den ma arahan kursor mouse ko kalua dari menu ko malah ta batalan"
modalOverlay.addEventListener('click', (ev) => {
  if (ev.target === modalOverlay) {
    // Animasi responsif lembut jika klik di luar agar user tahu modal tetap aktif dan aman
    if (modalBox) {
      modalBox.style.transform = 'scale(1.012)';
      setTimeout(() => { if (modalBox) modalBox.style.transform = ''; }, 140);
    }
  }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && modalOverlay.classList.contains('open')) {
    tryCloseModal();
  }
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

/** Hitung total modal satu baris Barang Masuk setelah diskon persen (opsional). */
function bmItemTotal(b) {
  const qty    = Number(b.jumlah1 || b.jumlah || 0);
  const harga  = Number(b.hargaModal || 0);
  const diskon = Math.max(0, Math.min(100, Number(b.diskon || 0)));
  return qty * harga * (1 - diskon / 100);
}

function hitungTotalUangKey(key, rows) {
  if (!rows || !rows.length) return 0;
  if (key === 'barangMasuk') {
    return rows.reduce((s, b) => s + bmItemTotal(b), 0);
  }
  if (key === 'barangTerjual') {
    return rows.reduce((s, b) => s + Number(b.jumlah || 0) * Number(b.hargaJual || 0), 0);
  }
  if (key === 'uangKeluar' || key === 'uangKeluarLK' || key === 'uangMasuk' || key === 'tagihan' || key === 'rekapPiutang' || key === 'utang' || key === 'piutang') {
    return rows.reduce((s, x) => s + Number(x.jumlah || 0), 0);
  }
  return 0;
}

/* ========================
   DASHBOARD
   ======================== */

/* Sparkline putih untuk kartu utama untung/rugi — tanpa sumbu, murni bentuk tren. */
function sparklineLaba(data, w = 300, h = 92) {
  if (data.length < 2) return '';
  const pad = 8;
  const vals = data.map(d => d.laba);
  const max = Math.max(...vals), min = Math.min(...vals);
  const span = Math.max(max - min, 1);
  const xOf = i => pad + (i / (data.length - 1)) * (w - pad * 2);
  const yOf = v => h - pad - ((v - min) / span) * (h - pad * 2);
  const pts = data.map((d, i) => [xOf(i), yOf(d.laba)]);

  /* kurva halus supaya garisnya tidak patah-patah */
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` C${cx.toFixed(1)} ${y0.toFixed(1)} ${cx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  const area = `${d} L${pts[pts.length - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`;
  const uidSp = 'sp' + Math.random().toString(36).slice(2, 7);
  const lx = pts[pts.length - 1][0], ly = pts[pts.length - 1][1];

  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Tren untung rugi beberapa bulan terakhir">
    <defs>
      <linearGradient id="${uidSp}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(255,255,255,.28)" />
        <stop offset="100%" stop-color="rgba(255,255,255,0)" />
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#${uidSp})" />
    <path d="${d}" fill="none" stroke="rgba(255,255,255,.95)" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4" fill="#fff" />
  </svg>`;
}

/* "Masuk hari ini" / "3 hari lalu" — lebih mudah dibaca daripada tanggal penuh */
function jarakHari(iso) {
  if (!iso) return '';
  const a = new Date(iso + 'T00:00:00');
  const b = new Date(today() + 'T00:00:00');
  const hari = Math.round((b - a) / 86400000);
  if (hari <= 0) return 'Masuk hari ini';
  if (hari === 1) return 'Kemarin';
  if (hari < 30) return hari + ' hari lalu';
  return formatDate(iso);
}

/* Warna kotak inisial — tetap sama untuk nama yang sama */
const WARNA_INISIAL = ['#0F172A', '#0D9488', '#2563EB', '#7C3AED', '#B45309', '#BE123C'];
function warnaInisial(nama) {
  let n = 0;
  for (let i = 0; i < (nama || '').length; i++) n = (n + nama.charCodeAt(i)) % 997;
  return WARNA_INISIAL[n % WARNA_INISIAL.length];
}
function inisialDari(nama) {
  return (nama || '?').split(/\s+/).filter(Boolean).slice(0, 2)
    .map(x => x[0].toUpperCase()).join('') || '?';
}

function persenBeda(sekarang, sebelum) {
  if (!sebelum) return null;
  return ((sekarang - sebelum) / Math.abs(sebelum)) * 100;
}
function chipDelta(persen, naikItuBaik = true) {
  if (persen === null || !isFinite(persen)) {
    return `<div class="nx-kpi-delta">Belum ada pembanding bulan lalu</div>`;
  }
  const naik = persen >= 0;
  const baik = naik === naikItuBaik;
  return `<div class="nx-kpi-delta ${baik ? 'naik' : 'turun'}">
    ${ico(naik ? 'arrow_upward' : 'arrow_downward', 15)}${Math.abs(persen).toFixed(1)}% vs bulan lalu
  </div>`;
}

function renderDashboard() {
  const stok = getStokToko();
  const now  = new Date();
  const m = now.getMonth(), y = now.getFullYear();
  const pm = m === 0 ? 11 : m - 1, py = m === 0 ? y - 1 : y;

  const lp   = buildLaporan(m, y);
  const lalu = buildLaporan(pm, py);

  const uangKeluarTotal     = lp.uangKeluarUtama + lp.uangKeluarLK;
  const uangKeluarTotalLalu = lalu.uangKeluarUtama + lalu.uangKeluarLK;

  const labaPos = lp.labaBersih >= 0;
  const seri = seriesLabaBulanan();

  /* Rute yang menyumbang penjualan bulan ini */
  const ruteAktif = [...new Set(
    store.barangTerjual
      .filter(b => { const g = getMonthYear(b.tanggal); return g.m === m && g.y === y; })
      .map(b => (store.ruteList.find(r => r.id === b.ruteId) || {}).nama)
      .filter(Boolean)
  )];

  const piutangBelum = [
    ...store.piutang.filter(x => x.status !== 'Lunas'),
    ...store.rekapPiutang.filter(x => x.status !== 'Lunas'),
  ];
  const utangBelum = store.utang.filter(x => x.status !== 'Lunas');

  /* Peringatan */
  const stokMenipis = stok.items
    .filter(x => x.stokKecil <= 5)
    .sort((a, b) => a.stokKecil - b.stokKecil)
    .slice(0, 4)
    .map(x => ({ nama: x.nama, sisa: x.stokKecil, txt: formatStock(x.stokKecil, x.konversi, x.satuan1, x.satuan2) }));

  const batas30 = new Date(); batas30.setDate(batas30.getDate() - 30);
  const utangTempo = utangBelum
    .filter(u => new Date(u.tanggal) <= batas30)
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal))
    .slice(0, 3);

  const barangTerbaru = store.barangMasuk.slice().sort((a, b) => b.tanggal.localeCompare(a.tanggal)).slice(0, 5);
  const piutangTerbesar = piutangBelum.slice().sort((a, b) => Number(b.jumlah) - Number(a.jumlah)).slice(0, 4);

  const html = `
  <div class="page-anim">
    <div class="page-header">
      <div>
        <div class="page-title">Dashboard</div>
        <div class="page-subtitle"><span class="live-dot"></span>Ringkasan kondisi toko bulan ${MONTHS[m]} ${y}</div>
      </div>
    </div>

    <!-- Tiga angka utama bulan berjalan -->
    <div class="nx-kpi-grid">
      <div class="nx-kpi is-masuk">
        <div class="nx-kpi-top">
          <span class="nx-kpi-judul">${ico('trending_up',19)} Uang Masuk</span>
          <span class="nx-chip">Bulan Ini</span>
        </div>
        <div class="nx-kpi-nilai">${fmt(lp.totalUangMasuk)}</div>
        ${chipDelta(persenBeda(lp.totalUangMasuk, lalu.totalUangMasuk), true)}
      </div>

      <div class="nx-kpi is-keluar">
        <div class="nx-kpi-top">
          <span class="nx-kpi-judul">${ico('trending_down',19)} Uang Keluar</span>
          <span class="nx-chip">Bulan Ini</span>
        </div>
        <div class="nx-kpi-nilai">${fmt(uangKeluarTotal)}</div>
        ${chipDelta(persenBeda(uangKeluarTotal, uangKeluarTotalLalu), false)}
      </div>

      <div class="nx-kpi gelap">
        <div class="nx-kpi-top">
          <span class="nx-kpi-judul">${ico('local_shipping',19)} Luar Kota</span>
          <span class="nx-chip">Penjualan</span>
        </div>
        <div class="nx-kpi-nilai">${fmt(lp.totalPenjualan)}</div>
        <div class="nx-kpi-delta">${ico('route',15)}${ruteAktif.length ? e(ruteAktif.join(' & ')) : 'Belum ada penjualan rute'}</div>
      </div>
    </div>

    <!-- Tiga angka pendukung -->
    <div class="nx-mini-grid">
      <div class="nx-mini">
        <div class="nx-mini-label">${ico('credit_card',17)} Total Piutang Aktif</div>
        <div class="nx-mini-nilai">${fmt(lp.saldoPiutang)}</div>
        <div class="nx-mini-ket">${piutangBelum.length} catatan belum lunas</div>
      </div>
      <div class="nx-mini">
        <div class="nx-mini-label">${ico('assignment',17)} Total Utang</div>
        <div class="nx-mini-nilai">${fmt(lp.saldoUtang)}</div>
        <div class="nx-mini-ket ${utangBelum.length ? 'perhatian' : ''}">${utangBelum.length} catatan menunggu pembayaran</div>
      </div>
      <div class="nx-mini">
        <div class="nx-mini-label">${ico('shelves',17)} Nilai Stok Toko</div>
        <div class="nx-mini-nilai">${fmt(stok.totalModal)}</div>
        <div class="nx-mini-ket">Berdasarkan harga modal terakhir</div>
        <div class="nx-mini-hias">${ico('inventory_2',56)}</div>
      </div>
    </div>

    <!-- Kolom utama + kolom peringatan -->
    <div class="nx-dua-kolom">
      <div>
        <div class="nx-hero ${labaPos ? '' : 'is-rugi'}">
          <div class="nx-hero-kiri">
            <div class="nx-hero-label">Estimasi ${labaPos ? 'Untung' : 'Rugi'}</div>
            <div class="nx-hero-nilai">${fmt(Math.abs(lp.labaBersih))}</div>
            <div class="nx-hero-ket">${ico('info',15)}Bulan ${MONTHS[m]} ${y} sampai ${formatDate(today())}, dari transaksi yang sudah tercatat</div>
          </div>
          <div class="nx-hero-grafik">${sparklineLaba(seri.slice(-6))}</div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">${ico('shelves')} Stok Toko Saat Ini (Real-Time)</div>
            <button class="nx-lihat" data-nav="stok-toko">Lihat Stok Toko ${ico('arrow_forward',16)}</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Nama Barang</th><th>Sisa Stok</th><th>Harga Modal</th><th>Harga Jual</th><th style="text-align:right">Status</th></tr></thead>
              <tbody>
                ${stok.items.length ? stok.items.slice(0, 6).map(s => {
                  const sisaTxt = formatStock(s.stokKecil, s.konversi, s.satuan1, s.satuan2);
                  const st = stokStatus(s);
                  return `<tr>
                    <td class="primary">
                      ${e(s.nama)}
                      <div class="nx-daftar-sub">Satuan: ${e(s.satuan1)}${s.satuan2 && s.satuan2 !== s.satuan1 ? ' / ' + e(s.satuan2) : ''}</div>
                    </td>
                    <td><strong>${sisaTxt}</strong></td>
                    <td>${fmt(s.hargaModal)}</td>
                    <td>${fmt(s.hargaJual1)}</td>
                    <td style="text-align:right"><span class="badge ${st.cls}">${e(st.label)}</span></td>
                  </tr>`;
                }).join('') : `<tr><td colspan="5" style="padding:34px;text-align:center;color:var(--muted)">Belum ada data stok toko</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div>
        <div class="nx-alert">
          <div class="nx-alert-judul">${ico('warning',19)} Perhatian</div>

          <div class="nx-alert-grup">Stok Menipis (&le; 5)</div>
          ${stokMenipis.length ? stokMenipis.map(s => `
            <div class="nx-alert-baris">
              <div style="min-width:0">
                <div class="nx-alert-nama">${e(s.nama)}</div>
                ${s.sisa <= 0 ? '<div class="nx-alert-sub">Sudah habis</div>' : ''}
              </div>
              <span class="nx-pill-merah">${e(s.txt)}</span>
            </div>`).join('')
            : `<div class="nx-alert-aman">${ico('check_circle',18)}Semua stok masih aman</div>`}

          <div class="nx-alert-grup">Utang Lewat 30 Hari</div>
          ${utangTempo.length ? utangTempo.map(u => `
            <div class="nx-alert-baris">
              <div style="min-width:0">
                <div class="nx-alert-nama">${e(u.keterangan)}</div>
                <div class="nx-alert-sub">Dicatat ${formatDate(u.tanggal)}</div>
              </div>
              <span class="nx-alert-nilai">${fmt(u.jumlah)}</span>
            </div>`).join('')
            : `<div class="nx-alert-aman">${ico('check_circle',18)}Tidak ada utang yang tertunda lama</div>`}
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">${ico('credit_card')} Piutang Aktif Terbesar</div>
          </div>
          <div class="nx-daftar">
            ${piutangTerbesar.length ? piutangTerbesar.map(p => {
              const nama = p.nama || p.keterangan || '—';
              const rute = p.ruteId ? (store.ruteList.find(r => r.id === p.ruteId) || {}).nama : null;
              return `<div class="nx-daftar-baris">
                <span class="nx-inisial" style="background:${warnaInisial(nama)}">${e(inisialDari(nama))}</span>
                <span class="nx-daftar-teks">
                  <span class="nx-daftar-nama">${e(nama)}${rute ? ` <span style="color:var(--muted);font-weight:400">(${e(rute)})</span>` : ''}</span>
                  <span class="nx-daftar-sub">${e(p.noFaktur || formatDate(p.tanggal))}</span>
                </span>
                <span class="nx-daftar-kanan">
                  <span class="nx-daftar-nilai">${fmt(p.jumlah)}</span>
                  <div><span class="badge badge-yellow">Belum Lunas</span></div>
                </span>
              </div>`;
            }).join('') : `<div class="empty-state-sub">Tidak ada piutang aktif</div>`}
          </div>
        </div>
      </div>
    </div>

    <!-- Panduan Cepat — Aksi yang paling sering dilakukan -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header">
        <div class="card-title">${ico('rocket_launch')} Aksi Cepat</div>
        <span style="font-size:12px;color:var(--muted);">Klik untuk langsung ke halaman</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;">
        <button class="btn-aksi-cepat" data-nav="rekap-per-bulan">
          ${ico('calendar_month',28)}
          <span>Rekap Bulan Ini</span>
          <small>Lihat ringkasan per bulan</small>
        </button>
        <button class="btn-aksi-cepat" data-nav="stok-toko">
          ${ico('shelves',28)}
          <span>Cek Stok</span>
          <small>Lihat stok barang toko</small>
        </button>
        <button class="btn-aksi-cepat" data-nav="laporan-keuangan">
          ${ico('bar_chart',28)}
          <span>Laporan Keuangan</span>
          <small>Ringkasan keuangan toko</small>
        </button>
        <button class="btn-aksi-cepat" data-nav="rekap-semua-rute">
          ${ico('query_stats',28)}
          <span>Rekap Semua Rute</span>
          <small>Perbandingan antar rute</small>
        </button>
      </div>
    </div>

    ${buildGrafikGarisLaba(seri)}
  </div>`;

  document.getElementById('content').innerHTML = html;
  wireGrafikGaris();
}

/* ========================
   GENERIC LIST CONFIG
   ======================== */
const listConfig = {
  barangMasuk: {
    title: 'Barang Masuk',
    subtitle: 'Pencatatan barang masuk ke toko utama',
    icon: ico('inventory_2'),
    addLabel: '+ Tambah Barang Masuk',
    columns: ['No','Nama Barang','Isi (Besar)','Isi (Ecer)','Harga Modal','Harga Jual','Aksi'],
    grouped: true,
    groupKeyFn: b => `${e(b.supplier)}__${b.tanggal}`,
    groupTitleFn: g => ({ nama: g.rows[0].supplier || '(Tanpa supplier)', sub: formatDate(g.rows[0].tanggal) }),
    groupBadgeFn: g => `<span class="grup-badge netral">${g.rows.length} jenis barang</span>`,
    /* Satuan kedua (ecer) tidak selalu ada — kalau kosong jangan diisi ulang
       dengan angka satuan pertama, cukup tampilkan tanda strip. */
    itemCellsFn: b => {
      const sat1  = b.satuan1 || b.satuan || '';
      const adaEcer = b.jumlah2 && b.satuan2;
      const jual2 = b.hargaJual2;
      const diskon = Math.max(0, Math.min(100, Number(b.diskon || 0)));
      return `
      <td class="primary">${e(b.nama)}</td>
      <td>${fmtNum(b.jumlah1 || b.jumlah)} <span class="badge badge-blue">${e(sat1)}</span></td>
      <td>${adaEcer ? `${fmtNum(b.jumlah2)} <span class="badge badge-orange">${e(b.satuan2)}</span>` : '<span class="text-muted">—</span>'}</td>
      <td>
        ${fmt(b.hargaModal)}<br><small class="text-muted">/ ${e(sat1)}</small>
        ${diskon > 0 ? `<br><span class="badge badge-orange" style="margin-top:3px;">Diskon ${diskon}% · Total ${fmt(bmItemTotal(b))}</span>` : ''}
      </td>
      <td>
        ${(b.hargaJual1 || b.hargaJual) ? `${fmt(b.hargaJual1 || b.hargaJual)} <small class="text-muted">/ ${e(sat1)}</small>` : '<span class="text-muted">—</span>'}
        ${adaEcer && jual2 ? `<br>${fmt(jual2)} <small class="text-muted">/ ${e(b.satuan2)}</small>` : ''}
      </td>`;
    },
    subtotalRowFn: (rows, nama) => {
      const totalBesar = rows.reduce((s2, b) => s2 + Number(b.jumlah1 || b.jumlah || 0), 0);
      const totalEcer  = rows.reduce((s2, b) => s2 + Number(b.jumlah2 || 0), 0);
      const totalModal = rows.reduce((s2, b) => s2 + bmItemTotal(b), 0);
      return `<td></td>
        <td class="subtotal-label">Subtotal ${e(nama)}</td>
        <td class="subtotal-val">${fmtNum(totalBesar)} item</td>
        <td class="subtotal-val">${totalEcer ? fmtNum(totalEcer) + ' pcs' : '—'}</td>
        <td class="subtotal-val">${fmt(totalModal)}</td>
        <td></td><td></td>`;
    },
    formFn: formBarangMasuk,
    searchFn: (b, q) => `${e(b.nama)} ${e(b.supplier)}`.toLowerCase().includes(q),
  },
  utang: {
    title: 'Utang',
    subtitle: 'Catatan utang toko utama',
    icon: ico('assignment'),
    addLabel: '+ Tambah Utang',
    columns: ['No','Tanggal','Keterangan','Jumlah','Status','Aksi'],
    grouped: false,
    rowFn: (x) => `<td>${formatDate(x.tanggal)}</td><td class="primary">${e(x.keterangan)}</td><td class="amount-negative">${fmt(x.jumlah)}</td>${statusBadgeCell('utang', x)}`,
    formFn: formUtang,
    searchFn: (x, q) => x.keterangan.toLowerCase().includes(q),
  },
  piutang: {
    title: 'Piutang',
    subtitle: 'Catatan piutang toko utama',
    icon: ico('credit_card'),
    addLabel: '+ Tambah Piutang',
    columns: ['No','Tanggal','No Faktur','Jumlah','Status','Aksi'],
    grouped: true,
    groupKeyFn: x => x.nama,
    groupTitleFn: g => ({ nama: g.rows[0].nama || '(Tanpa nama)', sub: `${g.rows.length} faktur` }),
    groupBadgeFn: badgeLunasGrup,
    itemCellsFn: x => `
      <td>${formatDate(x.tanggal)}</td>
      <td>${e(x.noFaktur || '-')}</td>
      <td class="amount-positive">${fmt(x.jumlah)}</td>
      ${statusBadgeCell('piutang', x)}`,
    subtotalRowFn: (rows, nama) => `<td></td>
      <td class="subtotal-label" colspan="2">Subtotal ${e(nama)}</td>
      <td class="subtotal-val">${fmt(rows.reduce((s2,x) => s2 + Number(x.jumlah || 0), 0))}</td>
      <td></td><td></td>`,
    formFn: formPiutang,
    searchFn: (x, q) => `${e(x.nama)} ${e(x.noFaktur)}`.toLowerCase().includes(q),
  },
  uangKeluar: {
    title: 'Uang Keluar',
    subtitle: 'Pengeluaran toko utama',
    icon: ico('payments'),
    addLabel: '+ Tambah Uang Keluar',
    columns: ['No','Tanggal','Keterangan','Jumlah','Aksi'],
    grouped: false,
    rowFn: (x) => `<td>${formatDate(x.tanggal)}</td><td class="primary">${e(x.keterangan)}</td><td class="amount-negative">-${fmt(x.jumlah)}</td>`,
    formFn: formSimple(['keterangan:Keterangan','jumlah:Jumlah (Rp)']),
    searchFn: (x, q) => x.keterangan.toLowerCase().includes(q),
  },
  barangTerjual: {
    title: 'Barang Terjual (Luar Kota)',
    subtitle: 'Pencatatan penjualan rute luar kota',
    icon: ico('local_shipping'),
    addLabel: '+ Tambah Barang Terjual',
    columns: ['No','Nama Barang','Qty','Harga','Jumlah','Aksi'],
    grouped: true,
    groupKeyFn: b => `${e(b.pelanggan)}__${e(b.noFaktur || '')}__${b.tanggal}`,
    groupTitleFn: g => ({
      nama: g.rows[0].pelanggan || '(Tanpa nama toko)',
      sub: `No PM ${g.rows[0].noFaktur || '-'} \u00b7 ${formatDate(g.rows[0].tanggal)}`,
    }),
    groupBadgeFn: g => `<span class="grup-badge netral">${g.rows.length} jenis barang</span>`,
    itemCellsFn: b => `
      <td class="primary">${e(b.nama)}</td>
      <td>${fmtNum(b.jumlah)} ${e(b.satuan)}</td>
      <td>${fmt(b.hargaJual)}</td>
      <td class="amount-positive">${fmt(b.jumlah * b.hargaJual)}</td>`,
    subtotalRowFn: (rows, nama) => `<td></td>
      <td class="subtotal-label" colspan="3">Subtotal ${e(nama)}</td>
      <td class="subtotal-val">${fmt(rows.reduce((s2,b) => s2 + Number(b.jumlah || 0) * Number(b.hargaJual || 0), 0))}</td>
      <td></td>`,
    formFn: formBarangTerjual,
    searchFn: (b, q) => `${e(b.nama)} ${e(b.pelanggan)}`.toLowerCase().includes(q),
  },
  rekapPiutang: {
    title: 'Rekap Piutang (Luar Kota)',
    subtitle: 'Piutang dari rute luar kota',
    icon: ico('receipt_long'),
    addLabel: '+ Tambah Rekap Piutang',
    columns: ['No','Tanggal','No Faktur','Jumlah','Status','Aksi'],
    grouped: true,
    groupKeyFn: x => x.nama,
    groupTitleFn: g => ({ nama: g.rows[0].nama || '(Tanpa nama)', sub: `${g.rows.length} faktur` }),
    groupBadgeFn: badgeLunasGrup,
    itemCellsFn: x => `
      <td>${formatDate(x.tanggal)}</td>
      <td>${e(x.noFaktur || '-')}</td>
      <td class="amount-positive">${fmt(x.jumlah)}</td>
      ${statusBadgeCell('rekapPiutang', x)}`,
    subtotalRowFn: (rows, nama) => `<td></td>
      <td class="subtotal-label" colspan="2">Subtotal ${e(nama)}</td>
      <td class="subtotal-val">${fmt(rows.reduce((s2,x) => s2 + Number(x.jumlah || 0), 0))}</td>
      <td></td><td></td>`,
    formFn: formRekapPiutang,
    searchFn: (x, q) => `${e(x.nama)} ${e(x.noFaktur)}`.toLowerCase().includes(q),
  },
  tagihan: {
    title: 'Tagihan (Luar Kota)',
    subtitle: 'Tagihan dari rute luar kota',
    icon: ico('request_quote'),
    addLabel: '+ Tambah Tagihan',
    columns: ['No','Keterangan','Jumlah','Aksi'],
    grouped: true,
    groupKeyFn: x => `${e(x.nama)}__${x.tanggal}`,
    groupTitleFn: g => ({ nama: g.rows[0].nama || '(Tanpa nama)', sub: formatDate(g.rows[0].tanggal) }),
    groupBadgeFn: g => `<span class="grup-badge netral">${g.rows.length} tagihan</span>`,
    itemCellsFn: x => `<td class="primary">${e(x.keterangan)}</td><td>${fmt(x.jumlah)}</td>`,
    subtotalRowFn: (rows, nama) => `<td></td>
      <td class="subtotal-label">Subtotal ${e(nama)}</td>
      <td class="subtotal-val">${fmt(rows.reduce((s2,x) => s2 + Number(x.jumlah || 0), 0))}</td>
      <td></td>`,
    formFn: formSimple(['nama:Nama','keterangan:Keterangan','jumlah:Jumlah (Rp)']),
    searchFn: (x, q) => `${e(x.nama)} ${e(x.keterangan)}`.toLowerCase().includes(q),
  },
  uangKeluarLK: {
    title: 'Uang Keluar (Luar Kota)',
    subtitle: 'Pengeluaran selama rute luar kota',
    icon: ico('payments'),
    addLabel: '+ Tambah Uang Keluar',
    columns: ['No','Tanggal','Keterangan','Jumlah','Aksi'],
    grouped: false,
    rowFn: (x) => `<td>${formatDate(x.tanggal)}</td><td class="primary">${e(x.keterangan)}</td><td class="amount-negative">-${fmt(x.jumlah)}</td>`,
    formFn: formSimple(['keterangan:Keterangan','jumlah:Jumlah (Rp)']),
    searchFn: (x, q) => x.keterangan.toLowerCase().includes(q),
  },
  uangMasuk: {
    title: 'Uang Masuk (Luar Kota)',
    subtitle: 'Penerimaan uang rute luar kota',
    icon: ico('savings'),
    addLabel: '+ Tambah Uang Masuk',
    columns: ['No','Tanggal','Keterangan','Jumlah','Aksi'],
    grouped: false,
    rowFn: (x) => `<td>${formatDate(x.tanggal)}</td><td class="primary">${e(x.keterangan)}</td><td class="amount-positive">${fmt(x.jumlah)}</td>`,
    formFn: formSimple(['keterangan:Keterangan','jumlah:Jumlah (Rp)']),
    searchFn: (x, q) => x.keterangan.toLowerCase().includes(q),
  },
  ruteList: {
    title: 'Manajemen Rute',
    subtitle: 'Kelola daftar rute luar kota',
    icon: ico('map'),
    addLabel: '+ Tambah Rute',
    columns: ['No', 'Nama Rute', 'Aksi'],
    grouped: false,
    rowFn: (x) => `<td class="primary">${e(x.nama)}</td>`,
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
      <button type="button" class="btn btn-ghost" data-aksi="tutup-modal">Batal</button>
      <button type="submit" class="btn btn-primary">${ico('save',17)} Simpan</button>
    </div>
  </form>`;
}

function openAddPerjalanan(ruteId, key) {
  openModal('Tambah ' + istilahGrup(ruteId), formPerjalanan(), (form) => {
    const fd = Object.fromEntries(new FormData(form));
    fd.id = uid();
    if (ruteId) fd.ruteId = ruteId;      // periode Toko Utama tidak terikat rute
    store.perjalananList.push(fd);
    saveStore();
    closeModal();
    renderCategoryTripList(ruteId, key);
    showToast('Perjalanan berhasil ditambahkan!', 'success');
  });
}

function openEditPerjalanan(id, key) {
  const item = store.perjalananList.find(x => x.id === id);
  if (!item) return;
  openModal('Edit ' + istilahGrup(item.ruteId), formPerjalanan(item), (form) => {
    const fd = Object.fromEntries(new FormData(form));
    const idx = store.perjalananList.findIndex(x => x.id === id);
    store.perjalananList[idx] = { ...item, ...fd };
    saveStore();
    closeModal();
    renderCategoryTripList(item.ruteId, key);
    showToast('Perjalanan berhasil diperbarui!', 'success');
  });
}

function deletePerjalanan(id, ruteId, key) {
  const html = `
    <div style="padding:10px 0 20px;text-align:center">
      <p style="margin-bottom:8px;font-size:15px;color:var(--ink-variant)">Yakin ingin menghapus <b>Periode ${ruteId ? 'Perjalanan' : 'Toko'}</b> ini?</p>
      <p style="margin-bottom:20px;font-size:13px;color:var(--red);font-weight:600;">PENTING: Periode ini dipakai BERSAMA oleh Barang Masuk, Barang Terjual, Rekap Piutang, Uang Masuk, & Uang Keluar!</p>
      <p style="margin-bottom:20px;font-size:13px;color:var(--muted)">Data transaksi yang sudah Anda isi memang tidak akan hilang (masih ada di "Lihat Semua"), tapi akan terlepas dari kelompok ini di SEMUA menu.</p>
      <div style="display:flex;justify-content:center;gap:12px">
        <button type="button" class="btn btn-ghost" data-aksi="tutup-modal">Batal</button>
        <button type="button" class="btn btn-danger" id="btn-confirm-del-pj">Ya, Hapus</button>
      </div>
    </div>
  `;
  setLebarModal('400px');
  openModal('Konfirmasi Hapus', html, null);

  document.getElementById('btn-confirm-del-pj').addEventListener('click', () => {
    store.perjalananList = store.perjalananList.filter(x => x.id !== id);
    saveStore();
    closeModal();
    renderCategoryTripList(ruteId, key);
    showToast('Perjalanan berhasil dihapus.', 'info');
  });
}

function perjalananLabel(pj) {
  return `${formatDate(pj.tanggalMulai)} — ${formatDate(pj.tanggalSelesai)}`;
}

const LEGACY_PAGE_FOR_KEY = {
  barangMasuk: 'barang-masuk',
  barangTerjual: 'barang-terjual', rekapPiutang: 'rekap-piutang', tagihan: 'tagihan',
  uangKeluarLK: 'uang-keluar-lk', uangMasuk: 'uang-masuk',
  uangKeluar: 'uang-keluar-semua',
};
const PJ_PAGE_FOR_KEY = {
  barangMasuk: 'pj-barang-masuk',
  barangTerjual: 'pj-barang-terjual', rekapPiutang: 'pj-rekap-piutang', tagihan: 'pj-tagihan',
  uangKeluarLK: 'pj-uang-keluar', uangMasuk: 'pj-uang-masuk',
  uangKeluar: 'uang-keluar',
};

/* Uang Keluar Toko Utama memakai mesin pengelompokan yang sama dengan rute.
   Bedanya hanya: catatan rute punya ruteId, catatan Toko Utama tidak (ruteId kosong).
   Istilahnya pun disesuaikan — "Perjalanan" untuk rute, "Periode" untuk Toko Utama. */
const istilahGrup = (ruteId) => (ruteId ? 'Perjalanan' : 'Periode');

/** Cocokkan satu catatan dengan lingkup rute (kosong = milik Toko Utama). */
function cocokRute(x, ruteId) {
  return ruteId ? x.ruteId === ruteId : !x.ruteId;
}

/* ── Batas tanggal saat mengisi di dalam sebuah perjalanan/periode ──
   Kalau admin sudah menetapkan rentang tanggal, isian di dalamnya
   tidak boleh keluar dari rentang itu. */
function batasTanggalGrup() {
  // Sesuai permintaan klien: Bebaskan tanggal agar bisa diubah sesuka hari tanpa batas periode
  return null;
}

/** Atribut untuk <input type="date">: nilai awal masuk akal + batas min/max. */
function attrTanggal(nilaiSaatIni) {
  const b = batasTanggalGrup();
  if (!b) return { value: nilaiSaatIni || today(), attrs: '' };
  const t = today();
  // kalau hari ini di luar rentang, mulai dari tanggal awal periode
  const value = nilaiSaatIni || ((t >= b.min && t <= b.max) ? t : b.min);
  return { value, attrs: ` min="${b.min}" max="${b.max}"` };
}

/** Keterangan kecil di bawah isian tanggal, biar admin tahu batasnya. */
function petunjukTanggal() {
  const b = batasTanggalGrup();
  if (!b) return '';
  return `<div class="field-hint">${ico('event', 14)}Hanya boleh antara
    <b>${formatDate(b.min)}</b> dan <b>${formatDate(b.max)}</b></div>`;
}

/** Pengaman terakhir sebelum simpan (kalau batas di input berhasil dilewati). */
function tanggalDiLuarGrup(tgl) {
  const b = batasTanggalGrup();
  if (!b || !tgl) return null;
  if (tgl < b.min || tgl > b.max) {
    return `Tanggal harus antara ${formatDate(b.min)} dan ${formatDate(b.max)}, sesuai periode yang dipilih.`;
  }
  return null;
}

function renderCategoryTripList(ruteId, key) {
  const content = document.getElementById('content');
  const rute = store.ruteList.find(x => x.id === ruteId);
  const cfg = listConfig[key];
  const G = istilahGrup(ruteId);                    // "Perjalanan" atau "Periode"
  const lingkup = ruteId ? `Rute ${e(rute ? rute.nama : '')}` : 'Toko Utama';
  const trips = store.perjalananList
    .filter(x => cocokRute(x, ruteId))
    .slice()
    .sort((a, b) => b.tanggalMulai.localeCompare(a.tanggalMulai));

  const grandTotalUang = trips.reduce((sum, pj) => {
    const itemsPj = store[key].filter(x => cocokRute(x, ruteId) && x.perjalananId === pj.id);
    return sum + hitungTotalUangKey(key, itemsPj);
  }, 0);

  const grandTotalData = trips.reduce((sum, pj) => {
    return sum + store[key].filter(x => cocokRute(x, ruteId) && x.perjalananId === pj.id).length;
  }, 0);

  const warnaUang = (key === 'uangKeluar' || key === 'uangKeluarLK') ? 'color:var(--red);'
                  : (key === 'uangMasuk' || key === 'barangTerjual' ? 'color:var(--green);' : 'color:var(--ink);');
  const tandaMin = (key === 'uangKeluar' || key === 'uangKeluarLK') ? '-' : '';

  const html = `
  <div class="page-anim">
    <div class="page-header">
      <div>
        <div class="page-title">${cfg.icon} ${cfg.title}</div>
        <div class="page-subtitle">${lingkup} — dikelompokkan per ${G.toLowerCase()}${ruteId ? ' (sekali jalan)' : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        ${ruteId ? `<button class="btn btn-ghost" data-aksi="buka-keuntungan-rute" data-rute="${ruteId}">${ico('trending_up',17)} Keuntungan Rute</button>` : ''}
        <button class="btn btn-primary" id="btn-add-perjalanan">+ Tambah ${G}</button>
      </div>
    </div>

    <div class="nx-mini-grid" style="margin-bottom:20px;">
      <div class="nx-mini">
        <div class="nx-mini-label">${ico('calendar_month',17)} Total ${G}</div>
        <div class="nx-mini-nilai">${trips.length} ${G}</div>
        <div class="nx-mini-ket">${ruteId ? `Rute ${e(rute ? rute.nama : '')}` : 'Toko Utama'}</div>
      </div>
      <div class="nx-mini">
        <div class="nx-mini-label">${ico('receipt_long',17)} Total Transaksi / Data</div>
        <div class="nx-mini-nilai">${fmtNum(grandTotalData)} data</div>
        <div class="nx-mini-ket">Di seluruh ${G.toLowerCase()}</div>
      </div>
      <div class="nx-mini">
        <div class="nx-mini-label">${ico('payments',17)} Total Nilai Uang</div>
        <div class="nx-mini-nilai" style="${warnaUang}">${tandaMin}${fmt(grandTotalUang)}</div>
        <div class="nx-mini-ket">Semua rangkap ${G.toLowerCase()}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">Daftar ${G} (${cfg.title})</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:44px;text-align:center;">No</th>
              <th>${ruteId ? 'Periode Perjalanan' : 'Periode'}</th>
              <th>Jumlah Data</th>
              <th style="text-align:right;">Total Uang</th>
              <th style="text-align:center;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${trips.length ? trips.map((pj, i) => {
              const itemsPj = store[key].filter(x => cocokRute(x, ruteId) && x.perjalananId === pj.id);
              const count = itemsPj.length;
              const totalUang = hitungTotalUangKey(key, itemsPj);
              return `
              <tr>
                <td class="group-no-cell" style="width:44px;text-align:center;color:var(--muted);">${i + 1}</td>
                <td class="primary" data-aksi="buka-perjalanan" data-rute="${ruteId || ''}" data-pj="${pj.id}" data-key="${key}" style="cursor:pointer;font-weight:600;">
                  ${perjalananLabel(pj)}
                </td>
                <td><span class="badge badge-blue">${count} data</span></td>
                <td style="text-align:right;font-weight:700;font-size:14px;white-space:nowrap;${warnaUang}">
                  ${tandaMin}${fmt(totalUang)}
                </td>
                <td style="text-align:center;">
                  <div class="actions" style="justify-content:center;">
                    <button class="btn btn-primary btn-sm" data-aksi="buka-perjalanan" data-rute="${ruteId || ''}" data-pj="${pj.id}" data-key="${key}">${ico('description',16)} Lihat & Cetak</button>
                    <button class="btn btn-ghost btn-sm" data-aksi="ubah-perjalanan" data-pj="${pj.id}" data-key="${key}">${ico('edit',16)} Edit</button>
                    <button class="btn btn-danger btn-sm" data-aksi="hapus-perjalanan" data-rute="${ruteId || ''}" data-pj="${pj.id}" data-key="${key}">${ico('delete',16)}</button>
                  </div>
                </td>
              </tr>`;
            }).join('') : barisKosong(5, `Belum ada ${G.toLowerCase()}`,
                  `Klik "+ Tambah ${G}" untuk membuat periode yang akan menampung data ${cfg.title.toLowerCase()} perjalanan ini.`)}
          </tbody>
          ${trips.length ? `
          <tfoot>
            <tr style="background:var(--surface-hover);font-weight:700;">
              <td colspan="2" style="text-align:right;padding:12px 16px;">Total Keseluruhan:</td>
              <td style="padding:12px 16px;"><span class="badge badge-dark">${fmtNum(grandTotalData)} data</span></td>
              <td style="text-align:right;padding:12px 16px;font-size:15px;white-space:nowrap;${warnaUang}">${tandaMin}${fmt(grandTotalUang)}</td>
              <td></td>
            </tr>
          </tfoot>` : ''}
        </table>
      </div>
    </div>

    <div style="margin-top:16px; font-size:13px; color:var(--muted);">
      Lihat riwayat lengkap ${cfg.title.toLowerCase()} (semua data, termasuk yang belum dikelompokkan ke ${G.toLowerCase()}):
      <a href="#" id="pj-legacy-link" style="color:var(--teal);font-weight:600;">Lihat Semua</a>
    </div>
  </div>`;

  content.innerHTML = html;
  document.getElementById('btn-add-perjalanan').addEventListener('click', () => openAddPerjalanan(ruteId, key));
  document.getElementById('pj-legacy-link').addEventListener('click', (ev) => {
    ev.preventDefault();
    navigate(LEGACY_PAGE_FOR_KEY[key], ruteId);
  });
}

function openPerjalananCategory(ruteId, perjalananId, key, opts = {}) {
  currentRuteId = ruteId;
  currentPerjalananId = perjalananId;
  const rute = store.ruteList.find(x => x.id === ruteId);
  const pj = store.perjalananList.find(x => x.id === perjalananId);
  const cfg = listConfig[key];
  document.querySelectorAll('.nav-item').forEach(el => {
    // Toko Utama tidak punya data-rute, jadi keduanya disamakan ke null dulu
    el.classList.toggle('active',
      el.dataset.page === PJ_PAGE_FOR_KEY[key] && (el.dataset.rute || null) === (ruteId || null));
  });
  document.getElementById('topbar-title').textContent =
    `${cfg.title} - ${rute ? rute.nama : 'Toko Utama'} (${pj ? perjalananLabel(pj) : ''})`;
  renderPerjalananCategoryPage(ruteId, perjalananId, key);
  pushNavState({ type: 'pjCategory', ruteId, perjalananId, key }, opts);
}

function renderPerjalananCategoryPage(ruteId, perjalananId, key) {
  const content = document.getElementById('content');
  const rute = store.ruteList.find(x => x.id === ruteId);
  const pj = store.perjalananList.find(x => x.id === perjalananId);
  const cfg = listConfig[key];
  if (!pj || !cfg) { renderCategoryTripList(ruteId, key); return; }

  const rows = store[key].filter(x => cocokRute(x, ruteId) && x.perjalananId === perjalananId);
  const totalPj = hitungTotalUangKey(key, rows);
  const warnaUangPj = (key === 'uangKeluar' || key === 'uangKeluarLK') ? 'color:var(--red);'
                    : (key === 'uangMasuk' || key === 'barangTerjual' ? 'color:var(--green);' : 'color:var(--brand);');
  const tandaMinPj = (key === 'uangKeluar' || key === 'uangKeluarLK') ? '-' : '';

  content.innerHTML = `
  <div class="page-anim">
    <div class="print-header" id="print-header-pj-${key}"></div>
    <div class="page-header nx-head" style="align-items:center;">
      <div class="no-print">
        <div class="page-title">${cfg.icon} ${cfg.title}</div>
        <div class="page-subtitle">${ruteId ? 'Rute ' + e(rute ? rute.nama : '') : 'Toko Utama'} — ${istilahGrup(ruteId)} ${perjalananLabel(pj)}</div>
      </div>
      <div class="no-print nx-head-aksi" style="display:flex;align-items:center;gap:10px;">
        ${ruteId ? `<button class="btn btn-ghost" data-aksi="buka-keuntungan-rute" data-rute="${ruteId}">${ico('trending_up',17)} Keuntungan Rute</button>` : ''}
        <div class="nx-chip" style="font-size:13.5px;font-weight:700;padding:6px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;">
          Total Nilai: <span style="${warnaUangPj}">${tandaMinPj}${fmt(totalPj)}</span>
        </div>
        <button class="btn btn-ghost" id="btn-print-pj-${key}">${ico('print',17)} Cetak</button>
        <button class="btn btn-dark" id="btn-add-pj-${key}">${ico('add',17)}${cfg.addLabel.replace(/^\+\s*/, '')}</button>
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

  document.getElementById(`btn-add-pj-${key}`).addEventListener('click', () => openAddModal(key));
  document.getElementById(`btn-print-pj-${key}`).addEventListener('click', () => {
    const el = document.getElementById(`print-header-pj-${key}`);
    if (el) {
      el.innerHTML = `
        <div class="print-title">Toko Panglima Bangunan — ${cfg.title.toUpperCase()}</div>
        <div class="print-subtitle">${ruteId ? 'Rute ' + e(rute ? rute.nama : '') : 'Toko Utama'} — ${istilahGrup(ruteId)} ${perjalananLabel(pj)} · Total: ${tandaMinPj}${fmt(totalPj)}</div>
        <div class="print-subtitle">Dicetak: ${formatDate(today())}</div>`;
    }
    window.print();
  });
}

/* ========================
   KEUNTUNGAN RUTE (Laba / Rugi Per Rute & Filter Tanggal)
   ======================== */
const filterKeuntungan = {
  startDate: '',
  endDate: '',
  perjalananId: ''
};

function hitungKeuntunganRute(ruteId, startDate = null, endDate = null, perjalananId = null) {
  const matchFilter = (x) => {
    if (ruteId && x.ruteId !== ruteId) return false;
    if (perjalananId && x.perjalananId !== perjalananId) return false;
    if (startDate && x.tanggal && x.tanggal < startDate) return false;
    if (endDate && x.tanggal && x.tanggal > endDate) return false;
    return true;
  };

  // 1. Barang Terjual (+)
  const terjualList = (store.barangTerjual || []).filter(matchFilter);
  const totalBarangTerjual = terjualList.reduce((s, b) => s + (Number(b.jumlah || 0) * Number(b.hargaJual || 0)), 0);

  // 2. Barang Masuk (-)
  const masukList = (store.barangMasuk || []).filter(matchFilter);
  const totalBarangMasuk = masukList.reduce((s, b) => s + bmItemTotal(b), 0);

  // 3. Uang Keluar (-) (baik uangKeluarLK maupun uangKeluar rute)
  const keluarLKList = (store.uangKeluarLK || []).filter(matchFilter);
  const keluarNormList = (store.uangKeluar || []).filter(x => x.ruteId && matchFilter(x));
  const keluarList = [...keluarLKList, ...keluarNormList];
  const totalUangKeluar = keluarList.reduce((s, x) => s + Number(x.jumlah || 0), 0);

  // 4. Uang Masuk (+)
  const uangMasukList = (store.uangMasuk || []).filter(matchFilter);
  const totalUangMasuk = uangMasukList.reduce((s, x) => s + Number(x.jumlah || 0), 0);

  // 5. Keuntungan Bersih = Barang Terjual - Barang Masuk - Uang Keluar + Uang Masuk
  const keuntungan = totalBarangTerjual - totalBarangMasuk - totalUangKeluar + totalUangMasuk;

  return {
    totalBarangTerjual,
    totalBarangMasuk,
    totalUangKeluar,
    totalUangMasuk,
    keuntungan,
    counts: {
      terjual: terjualList.length,
      masuk: masukList.length,
      keluar: keluarList.length,
      uangMasuk: uangMasukList.length,
    },
    lists: {
      terjual: terjualList,
      masuk: masukList,
      keluar: keluarList,
      uangMasuk: uangMasukList,
    }
  };
}

function renderKeuntunganRute(ruteId) {
  if (!ruteId && store.ruteList && store.ruteList.length) {
    ruteId = store.ruteList[0].id;
  }
  currentRuteId = ruteId;
  const content = document.getElementById('content');
  const rute = store.ruteList.find(x => x.id === ruteId);
  if (!rute) {
    content.innerHTML = `<div class="empty-state"><div class="empty-state-title">Rute tidak ditemukan</div></div>`;
    return;
  }

  const trips = (store.perjalananList || [])
    .filter(x => x.ruteId === ruteId)
    .slice()
    .sort((a, b) => b.tanggalMulai.localeCompare(a.tanggalMulai));

  const html = `
  <div class="page-anim">
    <div class="print-header" id="print-header-keuntungan"></div>

    <div class="page-header nx-head no-print" style="align-items:center;">
      <div>
        <div class="page-title">${ico('trending_up')} Keuntungan Rute: ${e(rute.nama)}</div>
        <div class="page-subtitle">Laba Bersih = <b>Barang Terjual</b> – <b>Barang Masuk</b> – <b>Uang Keluar</b> + <b>Uang Masuk</b></div>
      </div>
      <div class="no-print" style="display:flex;align-items:center;gap:10px;">
        <button class="btn btn-ghost" id="btn-print-keuntungan">${ico('print',17)} Cetak Laporan</button>
        <button class="btn btn-primary" data-nav="pj-barang-terjual" data-rute="${rute.id}">${ico('visibility',17)} Lihat Transaksi Rute</button>
      </div>
    </div>

    <!-- Filter Rentang Tanggal & Perjalanan -->
    <div class="card no-print" style="margin-bottom:20px;padding:16px 20px;">
      <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:12px;display:flex;align-items:center;gap:7px;">
        ${ico('tune',18)} Filter Rentang Tanggal &amp; Periode
      </div>
      <div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px;">
        <div class="form-group" style="margin:0;min-width:160px;flex:1;">
          <label class="form-label" style="font-size:12px;font-weight:600;margin-bottom:6px;">
            Dari Tanggal
          </label>
          <input type="date" class="form-input" id="kt-tgl-mulai" value="${filterKeuntungan.startDate || ''}" />
        </div>
        <div class="form-group" style="margin:0;min-width:160px;flex:1;">
          <label class="form-label" style="font-size:12px;font-weight:600;margin-bottom:6px;">
            Sampai Tanggal
          </label>
          <input type="date" class="form-input" id="kt-tgl-selesai" value="${filterKeuntungan.endDate || ''}" />
        </div>
        <div class="form-group" style="margin:0;min-width:220px;flex:1.2;">
          <label class="form-label" style="font-size:12px;font-weight:600;margin-bottom:6px;">
            Pilih Perjalanan (Opsional)
          </label>
          <select class="form-select" id="kt-filter-pj">
            <option value="">-- Semua Periode / Bebas --</option>
            ${trips.map(pj => `<option value="${pj.id}" ${filterKeuntungan.perjalananId === pj.id ? 'selected' : ''}>${perjalananLabel(pj)}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:1px;">
          <button class="btn btn-primary" id="kt-btn-terapkan">${ico('filter_alt',16)} Terapkan</button>
          <button class="btn btn-ghost" id="kt-btn-reset">${ico('restart_alt',16)} Reset</button>
        </div>
      </div>
      <!-- Preset Cepat -->
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border);">
        <span style="font-size:11.5px;color:var(--muted);font-weight:600;">Pintas Cepat:</span>
        <button type="button" class="btn btn-sm btn-ghost kt-preset" data-preset="all">Semua Tanggal</button>
        <button type="button" class="btn btn-sm btn-ghost kt-preset" data-preset="this-month">Bulan Ini</button>
        <button type="button" class="btn btn-sm btn-ghost kt-preset" data-preset="last-month">Bulan Lalu</button>
        <button type="button" class="btn btn-sm btn-ghost kt-preset" data-preset="this-year">Tahun Ini</button>
      </div>
    </div>

    <!-- Kontainer Dinamis Hasil Perhitungan -->
    <div id="kt-dinamis-container"></div>
  </div>`;

  content.innerHTML = html;

  function refreshKeuntunganView() {
    const sDate = filterKeuntungan.startDate;
    const eDate = filterKeuntungan.endDate;
    const pjId = filterKeuntungan.perjalananId;
    const res = hitungKeuntunganRute(ruteId, sDate, eDate, pjId);
    const isUntung = res.keuntungan >= 0;
    const wadah = document.getElementById('kt-dinamis-container');
    if (!wadah) return;

    let infoPeriode = 'Semua Periode Tercatat';
    if (sDate && eDate) {
      infoPeriode = `${formatDate(sDate)} s/d ${formatDate(eDate)}`;
    } else if (sDate) {
      infoPeriode = `Mulai ${formatDate(sDate)}`;
    } else if (eDate) {
      infoPeriode = `Sampai ${formatDate(eDate)}`;
    }
    if (pjId) {
      const pjObj = store.perjalananList.find(p => p.id === pjId);
      if (pjObj) infoPeriode += ` (Perjalanan ${perjalananLabel(pjObj)})`;
    }

    wadah.innerHTML = `
      <!-- Hero KPI Keuntungan Bersih -->
      <div class="card" style="margin-bottom:20px;padding:24px;border-left:6px solid ${isUntung ? 'var(--green)' : 'var(--red)'};background:linear-gradient(to right, ${isUntung ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)'}, var(--surface));">
        <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;">
          <div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
              <span class="badge ${isUntung ? 'badge-green' : 'badge-red'}" style="font-size:12.5px;padding:5px 12px;font-weight:700;">
                ${isUntung ? '&#10003; UNTUNG (Laba Bersih)' : '&#9888; RUGI (Defisit Operasional)'}
              </span>
              <span style="font-size:13px;color:var(--muted);font-weight:600;">Periode: ${infoPeriode}</span>
            </div>
            <div style="font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">
              Total Keuntungan Bersih Rute ${e(rute.nama)}
            </div>
            <div style="font-size:36px;font-weight:900;color:${isUntung ? 'var(--green)' : 'var(--red)'};letter-spacing:-0.03em;line-height:1.1;">
              ${isUntung ? '' : '-'}${fmt(Math.abs(res.keuntungan))}
            </div>
          </div>
          <div style="text-align:right;max-width:420px;font-size:12.5px;color:var(--ink-variant);line-height:1.6;background:var(--surface);padding:14px 18px;border-radius:var(--r-md);border:1px solid var(--border);">
            <div style="font-weight:700;margin-bottom:4px;color:var(--ink);">Kalkulasi Rumus Klien:</div>
            <div>+ Barang Terjual: <b>${fmt(res.totalBarangTerjual)}</b></div>
            <div>- Barang Masuk: <b style="color:var(--red)">-${fmt(res.totalBarangMasuk)}</b></div>
            <div>- Uang Keluar: <b style="color:var(--red)">-${fmt(res.totalUangKeluar)}</b></div>
            <div>+ Uang Masuk: <b style="color:var(--green)">+${fmt(res.totalUangMasuk)}</b></div>
          </div>
        </div>
      </div>

      <!-- 4 Mini Cards -->
      <div class="nx-mini-grid" style="margin-bottom:24px;">
        <div class="nx-mini">
          <div class="nx-mini-label">${ico('local_shipping',17)} 1. Barang Terjual (+)</div>
          <div class="nx-mini-nilai" style="color:var(--green);">${fmt(res.totalBarangTerjual)}</div>
          <div class="nx-mini-ket">${res.counts.terjual} jenis barang terjual</div>
        </div>
        <div class="nx-mini">
          <div class="nx-mini-label">${ico('inventory_2',17)} 2. Barang Masuk (-)</div>
          <div class="nx-mini-nilai" style="color:var(--red);">${fmt(res.totalBarangMasuk)}</div>
          <div class="nx-mini-ket">${res.counts.masuk} jenis barang masuk</div>
        </div>
        <div class="nx-mini">
          <div class="nx-mini-label">${ico('payments',17)} 3. Uang Keluar (-)</div>
          <div class="nx-mini-nilai" style="color:var(--red);">${fmt(res.totalUangKeluar)}</div>
          <div class="nx-mini-ket">${res.counts.keluar} pengeluaran jalan</div>
        </div>
        <div class="nx-mini">
          <div class="nx-mini-label">${ico('savings',17)} 4. Uang Masuk (+)</div>
          <div class="nx-mini-nilai" style="color:var(--green);">${fmt(res.totalUangMasuk)}</div>
          <div class="nx-mini-ket">${res.counts.uangMasuk} penerimaan kas</div>
        </div>
      </div>

      <!-- Ringkasan Keuntungan Per Perjalanan -->
      <div class="card" style="margin-bottom:24px;">
        <div class="card-header" style="justify-content:space-between;align-items:center;">
          <div>
            <div class="card-title">${ico('calendar_month')} Ringkasan Keuntungan Per Perjalanan</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">Rincian laba rugi tiap sekali jalan di Rute ${e(rute.nama)}</div>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:44px;text-align:center">No</th>
                <th>Perjalanan / Periode</th>
                <th style="text-align:right">Barang Terjual (+)</th>
                <th style="text-align:right">Barang Masuk (-)</th>
                <th style="text-align:right">Uang Keluar (-)</th>
                <th style="text-align:right">Uang Masuk (+)</th>
                <th style="text-align:right">Keuntungan Bersih</th>
                <th style="text-align:center">Status</th>
                <th class="no-print" style="text-align:center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${trips.length ? trips.map((pj, idx) => {
                const tripRes = hitungKeuntunganRute(ruteId, null, null, pj.id);
                const tripUntung = tripRes.keuntungan >= 0;
                return `
                <tr>
                  <td style="text-align:center;color:var(--muted);">${idx + 1}</td>
                  <td class="primary" style="font-weight:600;">${perjalananLabel(pj)}</td>
                  <td style="text-align:right;color:var(--green);font-weight:600;">${fmt(tripRes.totalBarangTerjual)}</td>
                  <td style="text-align:right;color:var(--red);">${fmt(tripRes.totalBarangMasuk)}</td>
                  <td style="text-align:right;color:var(--red);">${fmt(tripRes.totalUangKeluar)}</td>
                  <td style="text-align:right;color:var(--green);">${fmt(tripRes.totalUangMasuk)}</td>
                  <td style="text-align:right;font-weight:800;font-size:14px;color:${tripUntung ? 'var(--green)' : 'var(--red)'};">
                    ${tripUntung ? '' : '-'}${fmt(Math.abs(tripRes.keuntungan))}
                  </td>
                  <td style="text-align:center">
                    <span class="badge ${tripUntung ? 'badge-green' : 'badge-red'}">
                      ${tripUntung ? 'Untung' : 'Rugi'}
                    </span>
                  </td>
                  <td class="no-print" style="text-align:center">
                    <button class="btn btn-ghost btn-sm kt-btn-filter-trip" data-mulai="${pj.tanggalMulai}" data-selesai="${pj.tanggalSelesai}" data-pjid="${pj.id}">
                      ${ico('filter_alt',14)} Filter Periode Ini
                    </button>
                  </td>
                </tr>`;
              }).join('') : barisKosong(9, 'Belum ada perjalanan', 'Tambahkan perjalanan terlebih dahulu di menu rute ini')}
            </tbody>
            ${trips.length ? `
            <tfoot>
              <tr style="background:var(--surface-hover);font-weight:800;border-top:2px solid var(--border);">
                <td colspan="2" style="text-align:right;padding:12px 14px;">Total Semua Perjalanan:</td>
                <td style="text-align:right;padding:12px 14px;color:var(--green);">${fmt(trips.reduce((s, pj) => s + hitungKeuntunganRute(ruteId, null, null, pj.id).totalBarangTerjual, 0))}</td>
                <td style="text-align:right;padding:12px 14px;color:var(--red);">${fmt(trips.reduce((s, pj) => s + hitungKeuntunganRute(ruteId, null, null, pj.id).totalBarangMasuk, 0))}</td>
                <td style="text-align:right;padding:12px 14px;color:var(--red);">${fmt(trips.reduce((s, pj) => s + hitungKeuntunganRute(ruteId, null, null, pj.id).totalUangKeluar, 0))}</td>
                <td style="text-align:right;padding:12px 14px;color:var(--green);">${fmt(trips.reduce((s, pj) => s + hitungKeuntunganRute(ruteId, null, null, pj.id).totalUangMasuk, 0))}</td>
                <td style="text-align:right;padding:12px 14px;font-size:15px;color:${hitungKeuntunganRute(ruteId).keuntungan >= 0 ? 'var(--green)' : 'var(--red)'};">
                  ${hitungKeuntunganRute(ruteId).keuntungan >= 0 ? '' : '-'}${fmt(Math.abs(hitungKeuntunganRute(ruteId).keuntungan))}
                </td>
                <td colspan="2"></td>
              </tr>
            </tfoot>` : ''}
          </table>
        </div>
      </div>

      <!-- Detail Transaksi Transparan (Tabs) -->
      <div class="card no-print">
        <div class="card-header">
          <div class="card-title">${ico('receipt_long')} Rincian Transaksi Pada Periode Ini</div>
        </div>
        <div style="padding:14px 20px 0;display:flex;gap:10px;border-bottom:1px solid var(--border);overflow-x:auto;">
          <button class="btn btn-sm kt-tab-btn active" data-tab="terjual">Barang Terjual (${res.counts.terjual})</button>
          <button class="btn btn-sm kt-tab-btn btn-ghost" data-tab="masuk">Barang Masuk (${res.counts.masuk})</button>
          <button class="btn btn-sm kt-tab-btn btn-ghost" data-tab="keluar">Uang Keluar (${res.counts.keluar})</button>
          <button class="btn btn-sm kt-tab-btn btn-ghost" data-tab="uangmasuk">Uang Masuk (${res.counts.uangMasuk})</button>
        </div>
        <div style="padding:16px 20px;" id="kt-tab-content">
          ${renderTabContent('terjual', res)}
        </div>
      </div>
    `;

    // Event listener for trip filter buttons
    wadah.querySelectorAll('.kt-btn-filter-trip').forEach(btn => {
      btn.addEventListener('click', () => {
        const mulai = btn.dataset.mulai;
        const selesai = btn.dataset.selesai;
        const pjid = btn.dataset.pjid;
        document.getElementById('kt-tgl-mulai').value = mulai;
        document.getElementById('kt-tgl-selesai').value = selesai;
        document.getElementById('kt-filter-pj').value = pjid;
        filterKeuntungan.startDate = mulai;
        filterKeuntungan.endDate = selesai;
        filterKeuntungan.perjalananId = pjid;
        refreshKeuntunganView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    // Tab buttons
    wadah.querySelectorAll('.kt-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        wadah.querySelectorAll('.kt-tab-btn').forEach(b => {
          b.classList.remove('active');
          b.classList.add('btn-ghost');
        });
        btn.classList.add('active');
        btn.classList.remove('btn-ghost');
        document.getElementById('kt-tab-content').innerHTML = renderTabContent(btn.dataset.tab, res);
      });
    });
  }

  function renderTabContent(tab, res) {
    if (tab === 'terjual') {
      const items = res.lists.terjual;
      if (!items.length) return `<div class="empty-state"><div class="empty-state-sub">Tidak ada barang terjual di periode ini</div></div>`;
      return `<div class="table-wrap"><table>
        <thead><tr><th>No</th><th>Tanggal</th><th>Toko / Pelanggan</th><th>No PM</th><th>Nama Barang</th><th>Qty</th><th>Harga</th><th>Total</th></tr></thead>
        <tbody>${items.map((x, i) => `<tr>
          <td>${i + 1}</td>
          <td>${formatDate(x.tanggal)}</td>
          <td class="primary">${e(x.pelanggan || '—')}</td>
          <td>${e(x.noFaktur || '—')}</td>
          <td>${e(x.nama)}</td>
          <td>${fmtNum(x.jumlah)} ${e(x.satuan || '')}</td>
          <td>${fmt(x.hargaJual)}</td>
          <td class="amount-positive" style="font-weight:700;">${fmt(x.jumlah * x.hargaJual)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
    }
    if (tab === 'masuk') {
      const items = res.lists.masuk;
      if (!items.length) return `<div class="empty-state"><div class="empty-state-sub">Tidak ada barang masuk di periode ini</div></div>`;
      return `<div class="table-wrap"><table>
        <thead><tr><th>No</th><th>Tanggal</th><th>Supplier</th><th>Nama Barang</th><th>Isi Besar</th><th>Harga Modal</th><th>Diskon</th><th>Harga Jual</th><th>Total Modal</th></tr></thead>
        <tbody>${items.map((x, i) => `<tr>
          <td>${i + 1}</td>
          <td>${formatDate(x.tanggal)}</td>
          <td class="primary">${e(x.supplier || '—')}</td>
          <td>${e(x.nama)}</td>
          <td>${fmtNum(x.jumlah1 || x.jumlah)} ${e(x.satuan1 || x.satuan || '')}</td>
          <td>${fmt(x.hargaModal)}</td>
          <td>${Number(x.diskon || 0) > 0 ? `<span class="badge badge-orange">${Number(x.diskon)}%</span>` : '<span class="text-muted">—</span>'}</td>
          <td>${fmt(x.hargaJual1 || x.hargaJual)}</td>
          <td class="amount-negative" style="font-weight:700;">${fmt(bmItemTotal(x))}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
    }
    if (tab === 'keluar') {
      const items = res.lists.keluar;
      if (!items.length) return `<div class="empty-state"><div class="empty-state-sub">Tidak ada uang keluar di periode ini</div></div>`;
      return `<div class="table-wrap"><table>
        <thead><tr><th>No</th><th>Tanggal</th><th>Keterangan</th><th>Jumlah</th></tr></thead>
        <tbody>${items.map((x, i) => `<tr>
          <td>${i + 1}</td>
          <td>${formatDate(x.tanggal)}</td>
          <td class="primary">${e(x.keterangan || '—')}</td>
          <td class="amount-negative" style="font-weight:700;">-${fmt(x.jumlah)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
    }
    if (tab === 'uangmasuk') {
      const items = res.lists.uangMasuk;
      if (!items.length) return `<div class="empty-state"><div class="empty-state-sub">Tidak ada uang masuk di periode ini</div></div>`;
      return `<div class="table-wrap"><table>
        <thead><tr><th>No</th><th>Tanggal</th><th>Keterangan</th><th>Jumlah</th></tr></thead>
        <tbody>${items.map((x, i) => `<tr>
          <td>${i + 1}</td>
          <td>${formatDate(x.tanggal)}</td>
          <td class="primary">${e(x.keterangan || '—')}</td>
          <td class="amount-positive" style="font-weight:700;">+${fmt(x.jumlah)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
    }
    return '';
  }

  // Terapkan filter
  document.getElementById('kt-btn-terapkan').addEventListener('click', () => {
    filterKeuntungan.startDate = document.getElementById('kt-tgl-mulai').value;
    filterKeuntungan.endDate = document.getElementById('kt-tgl-selesai').value;
    filterKeuntungan.perjalananId = document.getElementById('kt-filter-pj').value;
    refreshKeuntunganView();
  });

  // Reset filter
  document.getElementById('kt-btn-reset').addEventListener('click', () => {
    document.getElementById('kt-tgl-mulai').value = '';
    document.getElementById('kt-tgl-selesai').value = '';
    document.getElementById('kt-filter-pj').value = '';
    filterKeuntungan.startDate = '';
    filterKeuntungan.endDate = '';
    filterKeuntungan.perjalananId = '';
    refreshKeuntunganView();
  });

  // Perjalanan dropdown auto change
  document.getElementById('kt-filter-pj').addEventListener('change', (ev) => {
    const val = ev.target.value;
    if (val) {
      const pj = store.perjalananList.find(p => p.id === val);
      if (pj) {
        document.getElementById('kt-tgl-mulai').value = pj.tanggalMulai;
        document.getElementById('kt-tgl-selesai').value = pj.tanggalSelesai;
        filterKeuntungan.startDate = pj.tanggalMulai;
        filterKeuntungan.endDate = pj.tanggalSelesai;
      }
    }
    filterKeuntungan.perjalananId = val;
    refreshKeuntunganView();
  });

  // Preset buttons
  document.querySelectorAll('.kt-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const pr = btn.dataset.preset;
      const t = new Date();
      if (pr === 'all') {
        filterKeuntungan.startDate = '';
        filterKeuntungan.endDate = '';
        filterKeuntungan.perjalananId = '';
      } else if (pr === 'this-month') {
        const y = t.getFullYear(), m = t.getMonth();
        const d1 = new Date(y, m, 1).toISOString().slice(0, 10);
        const d2 = new Date(y, m + 1, 0).toISOString().slice(0, 10);
        filterKeuntungan.startDate = d1;
        filterKeuntungan.endDate = d2;
        filterKeuntungan.perjalananId = '';
      } else if (pr === 'last-month') {
        const y = t.getFullYear(), m = t.getMonth() - 1;
        const d1 = new Date(y, m, 1).toISOString().slice(0, 10);
        const d2 = new Date(y, m + 1, 0).toISOString().slice(0, 10);
        filterKeuntungan.startDate = d1;
        filterKeuntungan.endDate = d2;
        filterKeuntungan.perjalananId = '';
      } else if (pr === 'this-year') {
        const y = t.getFullYear();
        filterKeuntungan.startDate = `${y}-01-01`;
        filterKeuntungan.endDate = `${y}-12-31`;
        filterKeuntungan.perjalananId = '';
      }
      document.getElementById('kt-tgl-mulai').value = filterKeuntungan.startDate;
      document.getElementById('kt-tgl-selesai').value = filterKeuntungan.endDate;
      document.getElementById('kt-filter-pj').value = filterKeuntungan.perjalananId;
      refreshKeuntunganView();
    });
  });

  // Print button
  document.getElementById('btn-print-keuntungan').addEventListener('click', () => {
    let pLabel = 'Semua Periode';
    if (filterKeuntungan.startDate && filterKeuntungan.endDate) {
      pLabel = `${formatDate(filterKeuntungan.startDate)} — ${formatDate(filterKeuntungan.endDate)}`;
    }
    document.getElementById('print-header-keuntungan').innerHTML = `
      <div class="print-title">TOKO PANGLIMA BANGUNAN — LAPORAN KEUNTUNGAN RUTE ${e(rute.nama.toUpperCase())}</div>
      <div class="print-subtitle">Rumus: Barang Terjual - Barang Masuk - Uang Keluar + Uang Masuk</div>
      <div class="print-subtitle">Periode: ${pLabel} &nbsp;|&nbsp; Dicetak: ${formatDate(today())}</div>
    `;
    window.print();
  });

  // Initial render
  refreshKeuntunganView();
}

/* ========================
   REKAP SEMUA RUTE (GABUNGAN BULANAN & TAHUNAN)
   ======================== */
const filterRekapSemua = {
  mode: 'bulan', // 'bulan' | 'tahun'
  tahun: new Date().getFullYear(),
  bulan: new Date().getMonth(),
  ruteId: '',
};

function renderRekapSemuaRute() {
  const content = document.getElementById('content');
  if (!content) return;

  // Dapatkan daftar tahun dari data
  const tahunSet = new Set([new Date().getFullYear()]);
  const extractYears = (arr) => {
    (arr || []).forEach(x => {
      if (x && x.tanggal) {
        const y = parseInt(String(x.tanggal).slice(0, 4), 10);
        if (!isNaN(y) && y > 2000 && y < 2100) tahunSet.add(y);
      }
    });
  };
  extractYears(store.barangTerjual);
  extractYears(store.barangMasuk);
  extractYears(store.uangKeluarLK);
  extractYears(store.uangMasuk);
  extractYears(store.rekapPiutang);
  (store.perjalananList || []).forEach(p => {
    if (p && p.tanggalMulai) {
      const y = parseInt(String(p.tanggalMulai).slice(0, 4), 10);
      if (!isNaN(y)) tahunSet.add(y);
    }
  });

  const availableYears = Array.from(tahunSet).sort((a, b) => b - a);
  if (!filterRekapSemua.tahun && availableYears.length) {
    filterRekapSemua.tahun = availableYears[0];
  }

  const html = `
  <div class="page-anim">
    <div class="print-header" id="print-header-rekap-semua"></div>

    <div class="page-header nx-head no-print" style="align-items:center;">
      <div>
        <div class="page-title">${ico('query_stats')} Rekap Semua Rute (Bulanan &amp; Tahunan)</div>
        <div class="page-subtitle">Rekapitulasi gabungan seluruh rute operasional Toko Panglima &bull; Rumus: <b>Barang Terjual</b> – <b>Barang Masuk</b> – <b>Uang Keluar</b> + <b>Uang Masuk</b></div>
      </div>
      <div class="no-print" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-ghost" id="btn-copy-rekap-semua">${ico('content_copy',17)} Salin untuk WA / Excel</button>
        <button class="btn btn-ghost" id="btn-print-rekap-semua">${ico('print',17)} Cetak Rekap</button>
      </div>
    </div>

    <!-- Filter Mode & Periode -->
    <div class="card no-print" style="margin-bottom:20px;padding:16px 20px;">
      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border);">
        <div style="font-size:13px;font-weight:700;color:var(--ink);display:flex;align-items:center;gap:7px;">
          ${ico('tune',18)} Pilihan Mode Tampilan
        </div>
        <div style="display:flex;gap:8px;">
          <button type="button" class="btn btn-sm ${filterRekapSemua.mode === 'bulan' ? 'btn-primary' : 'btn-ghost'}" id="btn-mode-bulan">
            ${ico('calendar_month',15)} Rekap Bulanan
          </button>
          <button type="button" class="btn btn-sm ${filterRekapSemua.mode === 'tahun' ? 'btn-primary' : 'btn-ghost'}" id="btn-mode-tahun">
            ${ico('calendar_today',15)} Rekap Tahunan
          </button>
        </div>
      </div>

      <div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px;">
        <div class="form-group" style="margin:0;min-width:140px;flex:1;">
          <label class="form-label" style="font-size:12px;font-weight:600;margin-bottom:6px;">Tahun</label>
          <select class="form-select" id="rekap-tahun">
            ${availableYears.map(y => `<option value="${y}" ${filterRekapSemua.tahun === y ? 'selected' : ''}>Tahun ${y}</option>`).join('')}
          </select>
        </div>

        <div class="form-group" style="margin:0;min-width:160px;flex:1.2;display:${filterRekapSemua.mode === 'bulan' ? 'block' : 'none'};" id="box-filter-bulan">
          <label class="form-label" style="font-size:12px;font-weight:600;margin-bottom:6px;">Bulan</label>
          <select class="form-select" id="rekap-bulan">
            ${MONTHS.map((mName, idx) => `<option value="${idx}" ${filterRekapSemua.bulan === idx ? 'selected' : ''}>${mName}</option>`).join('')}
          </select>
        </div>

        <div class="form-group" style="margin:0;min-width:180px;flex:1.4;">
          <label class="form-label" style="font-size:12px;font-weight:600;margin-bottom:6px;">Filter Rute (Opsional)</label>
          <select class="form-select" id="rekap-filter-rute">
            <option value="">-- Semua Rute Digabung --</option>
            ${(store.ruteList || []).map(r => `<option value="${r.id}" ${filterRekapSemua.ruteId === r.id ? 'selected' : ''}>${e(r.nama)}</option>`).join('')}
          </select>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:1px;">
          <button class="btn btn-primary" id="rekap-btn-terapkan">${ico('filter_alt',16)} Terapkan</button>
        </div>
      </div>

      <!-- Preset Cepat -->
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border);">
        <span style="font-size:11.5px;color:var(--muted);font-weight:600;">Pintas Cepat:</span>
        <button type="button" class="btn btn-sm btn-ghost rekap-preset" data-preset="this-month">Bulan Ini</button>
        <button type="button" class="btn btn-sm btn-ghost rekap-preset" data-preset="last-month">Bulan Lalu</button>
        <button type="button" class="btn btn-sm btn-ghost rekap-preset" data-preset="this-year">Tahun Ini</button>
      </div>
    </div>

    <!-- Kontainer Dinamis Hasil Rekap -->
    <div id="rekap-semua-container"></div>
  </div>`;

  content.innerHTML = html;

  function refreshRekapView() {
    const container = document.getElementById('rekap-semua-container');
    if (!container) return;

    const mode = filterRekapSemua.mode;
    const y = filterRekapSemua.tahun;
    const m = filterRekapSemua.bulan;
    const ruteFilter = filterRekapSemua.ruteId;

    let startDate, endDate, labelPeriode;
    if (mode === 'bulan') {
      const lastDay = new Date(y, m + 1, 0).getDate();
      startDate = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      endDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      labelPeriode = `${MONTHS[m]} ${y}`;
    } else {
      startDate = `${y}-01-01`;
      endDate = `${y}-12-31`;
      labelPeriode = `Tahun ${y} (1 Januari — 31 Desember ${y})`;
    }

    const ruteList = (store.ruteList || []).filter(r => !ruteFilter || r.id === ruteFilter);

    // Hitung per rute
    let grandTerjual = 0;
    let grandMasuk = 0;
    let grandPiutang = 0;
    let grandKeluar = 0;
    let grandUangMasuk = 0;
    let grandKeuntungan = 0;

    const routeData = ruteList.map(r => {
      const res = hitungKeuntunganRute(r.id, startDate, endDate);
      const piutangList = (store.rekapPiutang || []).filter(x => x.ruteId === r.id && (!x.tanggal || (x.tanggal >= startDate && x.tanggal <= endDate)));
      const piutangNominal = piutangList.reduce((s, x) => s + Number(x.jumlah || 0), 0);

      grandTerjual += res.totalBarangTerjual;
      grandMasuk += res.totalBarangMasuk;
      grandPiutang += piutangNominal;
      grandKeluar += res.totalUangKeluar;
      grandUangMasuk += res.totalUangMasuk;
      grandKeuntungan += res.keuntungan;

      return {
        id: r.id,
        nama: r.nama,
        terjual: res.totalBarangTerjual,
        masuk: res.totalBarangMasuk,
        piutang: piutangNominal,
        keluar: res.totalUangKeluar,
        uangMasuk: res.totalUangMasuk,
        keuntungan: res.keuntungan,
        isUntung: res.keuntungan >= 0,
        tripsCount: (store.perjalananList || []).filter(p => p.ruteId === r.id && (!p.tanggalMulai || (p.tanggalMulai >= startDate && p.tanggalMulai <= endDate))).length,
      };
    });

    const isGrandUntung = grandKeuntungan >= 0;

    // Rincian 12 Bulan (Progression)
    const monthlyProgression = [];
    for (let mo = 0; mo < 12; mo++) {
      const mStart = `${y}-${String(mo + 1).padStart(2, '0')}-01`;
      const mEnd = `${y}-${String(mo + 1).padStart(2, '0')}-${String(new Date(y, mo + 1, 0).getDate()).padStart(2, '0')}`;
      const mRes = hitungKeuntunganRute(ruteFilter || null, mStart, mEnd);
      const mPiutang = (store.rekapPiutang || []).filter(x => (!ruteFilter || x.ruteId === ruteFilter) && (!x.tanggal || (x.tanggal >= mStart && x.tanggal <= mEnd)))
        .reduce((s, x) => s + Number(x.jumlah || 0), 0);
      monthlyProgression.push({
        bulanIdx: mo,
        bulanNama: MONTHS[mo],
        terjual: mRes.totalBarangTerjual,
        masuk: mRes.totalBarangMasuk,
        piutang: mPiutang,
        keluar: mRes.totalUangKeluar,
        uangMasuk: mRes.totalUangMasuk,
        keuntungan: mRes.keuntungan,
        isUntung: mRes.keuntungan >= 0,
      });
    }

    // Bangun HTML Tampilan
    container.innerHTML = `
      <!-- Hero KPI Banner -->
      <div class="card" style="margin-bottom:20px;padding:24px;border-left:6px solid ${isGrandUntung ? 'var(--green)' : 'var(--red)'};background:linear-gradient(to right, ${isGrandUntung ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)'}, var(--surface));">
        <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;">
          <div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
              <span class="badge ${isGrandUntung ? 'badge-green' : 'badge-red'}" style="font-size:12.5px;padding:5px 12px;font-weight:700;">
                ${isGrandUntung ? '&#10003; UNTUNG (Laba Bersih)' : '&#9888; DEFISIT (Rugi Operasional)'}
              </span>
              <span style="font-size:13px;color:var(--muted);font-weight:600;">Periode: ${labelPeriode} ${ruteFilter ? `&bull; Rute ${e(routeData[0]?.nama || '')}` : '&bull; Semua Rute Digabung'}</span>
            </div>
            <div style="font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">
              Total Keuntungan Bersih Gabungan (${labelPeriode})
            </div>
            <div style="font-size:36px;font-weight:900;color:${isGrandUntung ? 'var(--green)' : 'var(--red)'};letter-spacing:-0.03em;line-height:1.1;">
              ${isGrandUntung ? '' : '-'}${fmt(Math.abs(grandKeuntungan))}
            </div>
          </div>
          <div style="text-align:right;max-width:440px;font-size:12.5px;color:var(--ink-variant);line-height:1.6;background:var(--surface);padding:14px 18px;border-radius:var(--r-md);border:1px solid var(--border);">
            <div style="font-weight:700;margin-bottom:4px;color:var(--ink);">Kalkulasi Keuntungan Bersih Semua Rute:</div>
            <div>+ Barang Terjual: <b style="color:var(--green)">${fmt(grandTerjual)}</b></div>
            <div>- Barang Masuk (Modal): <b style="color:var(--red)">-${fmt(grandMasuk)}</b></div>
            <div>- Uang Keluar (Operasional): <b style="color:var(--red)">-${fmt(grandKeluar)}</b></div>
            <div>+ Uang Masuk: <b style="color:var(--green)">+${fmt(grandUangMasuk)}</b></div>
          </div>
        </div>
      </div>

      <!-- 4 Mini Cards -->
      <div class="nx-mini-grid" style="margin-bottom:24px;">
        <div class="nx-mini">
          <div class="nx-mini-label">${ico('local_shipping',17)} 1. Total Barang Terjual (+)</div>
          <div class="nx-mini-nilai" style="color:var(--green);">${fmt(grandTerjual)}</div>
          <div class="nx-mini-ket">Penjualan gabungan seluruh rute</div>
        </div>
        <div class="nx-mini">
          <div class="nx-mini-label">${ico('inventory_2',17)} 2. Total Barang Masuk (-)</div>
          <div class="nx-mini-nilai" style="color:var(--red);">${fmt(grandMasuk)}</div>
          <div class="nx-mini-ket">Modal pembelian barang</div>
        </div>
        <div class="nx-mini">
          <div class="nx-mini-label">${ico('payments',17)} 3. Total Uang Keluar (-)</div>
          <div class="nx-mini-nilai" style="color:var(--red);">${fmt(grandKeluar)}</div>
          <div class="nx-mini-ket">Biaya jalan &amp; operasional rute</div>
        </div>
        <div class="nx-mini">
          <div class="nx-mini-label">${ico('savings',17)} 4. Total Uang Masuk (+)</div>
          <div class="nx-mini-nilai" style="color:var(--green);">${fmt(grandUangMasuk)}</div>
          <div class="nx-mini-ket">Penerimaan kas &amp; pelunasan piutang</div>
        </div>
      </div>

      <!-- TABEL UTAMA: REKAP SEMUA RUTE (Persis format screenshot klien) -->
      <div class="card" style="margin-bottom:24px;">
        <div class="card-header" style="justify-content:space-between;align-items:center;">
          <div>
            <div class="card-title">${ico('table_chart')} Tabel Rekap Semua Rute (${labelPeriode})</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">Rincian laba bersih per rute dan total akumulasi keseluruhan</div>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:44px;text-align:center">No</th>
                <th>Periode / Rute</th>
                <th style="text-align:right">Barang Terjual (+)</th>
                <th style="text-align:right">Barang Masuk (-)</th>
                <th style="text-align:right">Rekap Piutang</th>
                <th style="text-align:right">Uang Keluar (-)</th>
                <th style="text-align:right">Uang Masuk (+)</th>
                <th style="text-align:right">Keuntungan Bersih</th>
                <th style="text-align:center">Status</th>
                <th class="no-print" style="text-align:center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${routeData.length ? routeData.map((rd, idx) => `
                <tr>
                  <td style="text-align:center;color:var(--muted);">${idx + 1}</td>
                  <td class="primary" style="font-weight:700;">
                    <div style="display:flex;align-items:center;gap:6px;">
                      ${ico('local_shipping',16)}
                      <span>Rute ${e(rd.nama)}</span>
                    </div>
                  </td>
                  <td style="text-align:right;color:var(--green);font-weight:600;">${fmt(rd.terjual)}</td>
                  <td style="text-align:right;color:var(--red);">${fmt(rd.masuk)}</td>
                  <td style="text-align:right;color:var(--ink-variant);">${fmt(rd.piutang)}</td>
                  <td style="text-align:right;color:var(--red);">${fmt(rd.keluar)}</td>
                  <td style="text-align:right;color:var(--green);">${fmt(rd.uangMasuk)}</td>
                  <td style="text-align:right;font-weight:800;font-size:14px;color:${rd.isUntung ? 'var(--green)' : 'var(--red)'};">
                    ${rd.isUntung ? '' : '-'}${fmt(Math.abs(rd.keuntungan))}
                  </td>
                  <td style="text-align:center">
                    <span class="badge ${rd.isUntung ? 'badge-green' : 'badge-red'}">
                      ${rd.isUntung ? 'Untung' : 'Rugi'}
                    </span>
                  </td>
                  <td class="no-print" style="text-align:center">
                    <button class="btn btn-ghost btn-sm" data-aksi="buka-keuntungan-rute" data-rute="${rd.id}">
                      ${ico('visibility',14)} Lihat Detail
                    </button>
                  </td>
                </tr>
              `).join('') : barisKosong(10, 'Belum ada rute', 'Tambahkan rute pada menu Manajemen Rute')}
            </tbody>
            <tfoot>
              <tr style="background:var(--surface-hover);font-weight:800;border-top:2px solid var(--border);">
                <td colspan="2" style="text-align:right;padding:12px 14px;font-size:13px;letter-spacing:0.02em;">
                  TOTAL SEMUA RUTE GABUNGAN:
                </td>
                <td style="text-align:right;padding:12px 14px;color:var(--green);font-size:14px;">${fmt(grandTerjual)}</td>
                <td style="text-align:right;padding:12px 14px;color:var(--red);font-size:14px;">${fmt(grandMasuk)}</td>
                <td style="text-align:right;padding:12px 14px;color:var(--ink-variant);font-size:14px;">${fmt(grandPiutang)}</td>
                <td style="text-align:right;padding:12px 14px;color:var(--red);font-size:14px;">${fmt(grandKeluar)}</td>
                <td style="text-align:right;padding:12px 14px;color:var(--green);font-size:14px;">${fmt(grandUangMasuk)}</td>
                <td style="text-align:right;padding:12px 14px;font-size:16px;color:${isGrandUntung ? 'var(--green)' : 'var(--red)'};">
                  ${isGrandUntung ? '' : '-'}${fmt(Math.abs(grandKeuntungan))}
                </td>
                <td style="text-align:center;padding:12px 14px;">
                  <span class="badge ${isGrandUntung ? 'badge-green' : 'badge-red'}" style="font-weight:800;">
                    ${isGrandUntung ? 'Untung' : 'Rugi'}
                  </span>
                </td>
                <td class="no-print"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- TABEL PERKEMBANGAN 12 BULAN DALAM TAHUN TERPILIH -->
      <div class="card" style="margin-bottom:24px;">
        <div class="card-header" style="justify-content:space-between;align-items:center;">
          <div>
            <div class="card-title">${ico('calendar_month')} Perkembangan Rekap Semua Rute Per Bulan (Tahun ${y})</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">Rekapitulasi kumulatif per bulan dari Januari sampai Desember ${y}</div>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:44px;text-align:center">No</th>
                <th>Bulan</th>
                <th style="text-align:right">Barang Terjual (+)</th>
                <th style="text-align:right">Barang Masuk (-)</th>
                <th style="text-align:right">Rekap Piutang</th>
                <th style="text-align:right">Uang Keluar (-)</th>
                <th style="text-align:right">Uang Masuk (+)</th>
                <th style="text-align:right">Keuntungan Bersih</th>
                <th style="text-align:center">Status</th>
                <th class="no-print" style="text-align:center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${monthlyProgression.map((mp, idx) => {
                const isSelectedMonth = mode === 'bulan' && mp.bulanIdx === m;
                return `
                <tr style="${isSelectedMonth ? 'background:rgba(15,118,110,0.06);font-weight:600;' : ''}">
                  <td style="text-align:center;color:var(--muted);">${idx + 1}</td>
                  <td class="primary" style="font-weight:700;">
                    ${mp.bulanNama} ${y}
                    ${isSelectedMonth ? `<span class="badge badge-primary" style="margin-left:6px;font-size:10px;padding:2px 6px;">Dipilih</span>` : ''}
                  </td>
                  <td style="text-align:right;color:var(--green);font-weight:600;">${fmt(mp.terjual)}</td>
                  <td style="text-align:right;color:var(--red);">${fmt(mp.masuk)}</td>
                  <td style="text-align:right;color:var(--ink-variant);">${fmt(mp.piutang)}</td>
                  <td style="text-align:right;color:var(--red);">${fmt(mp.keluar)}</td>
                  <td style="text-align:right;color:var(--green);">${fmt(mp.uangMasuk)}</td>
                  <td style="text-align:right;font-weight:800;font-size:14px;color:${mp.isUntung ? 'var(--green)' : 'var(--red)'};">
                    ${mp.isUntung ? '' : '-'}${fmt(Math.abs(mp.keuntungan))}
                  </td>
                  <td style="text-align:center">
                    <span class="badge ${mp.isUntung ? 'badge-green' : 'badge-red'}">
                      ${mp.isUntung ? 'Untung' : 'Rugi'}
                    </span>
                  </td>
                  <td class="no-print" style="text-align:center">
                    <button class="btn btn-ghost btn-sm rekap-pilih-bulan-btn" data-bulan="${mp.bulanIdx}">
                      ${ico('filter_alt',14)} Tampilkan Bulan Ini
                    </button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
            <tfoot>
              <tr style="background:var(--surface-hover);font-weight:800;border-top:2px solid var(--border);">
                <td colspan="2" style="text-align:right;padding:12px 14px;">TOTAL SETAHUN (${y}):</td>
                <td style="text-align:right;padding:12px 14px;color:var(--green);">${fmt(monthlyProgression.reduce((s, x) => s + x.terjual, 0))}</td>
                <td style="text-align:right;padding:12px 14px;color:var(--red);">${fmt(monthlyProgression.reduce((s, x) => s + x.masuk, 0))}</td>
                <td style="text-align:right;padding:12px 14px;color:var(--ink-variant);">${fmt(monthlyProgression.reduce((s, x) => s + x.piutang, 0))}</td>
                <td style="text-align:right;padding:12px 14px;color:var(--red);">${fmt(monthlyProgression.reduce((s, x) => s + x.keluar, 0))}</td>
                <td style="text-align:right;padding:12px 14px;color:var(--green);">${fmt(monthlyProgression.reduce((s, x) => s + x.uangMasuk, 0))}</td>
                <td style="text-align:right;padding:12px 14px;font-size:15px;color:${monthlyProgression.reduce((s, x) => s + x.keuntungan, 0) >= 0 ? 'var(--green)' : 'var(--red)'};">
                  ${monthlyProgression.reduce((s, x) => s + x.keuntungan, 0) >= 0 ? '' : '-'}${fmt(Math.abs(monthlyProgression.reduce((s, x) => s + x.keuntungan, 0)))}
                </td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;

    // Pasang tombol pilih bulan dari tabel bulanan
    container.querySelectorAll('.rekap-pilih-bulan-btn').forEach(b => {
      b.addEventListener('click', () => {
        filterRekapSemua.mode = 'bulan';
        filterRekapSemua.bulan = parseInt(b.dataset.bulan, 10);
        document.getElementById('rekap-bulan').value = filterRekapSemua.bulan;
        document.getElementById('btn-mode-bulan').classList.add('btn-primary');
        document.getElementById('btn-mode-bulan').classList.remove('btn-ghost');
        document.getElementById('btn-mode-tahun').classList.remove('btn-primary');
        document.getElementById('btn-mode-tahun').classList.add('btn-ghost');
        document.getElementById('box-filter-bulan').style.display = 'block';
        refreshRekapView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    // Fitur Salin ke WhatsApp / Excel
    const btnCopy = document.getElementById('btn-copy-rekap-semua');
    if (btnCopy) {
      btnCopy.onclick = () => {
        let text = `*REKAP KEUNTUNGAN SEMUA RUTE — TOKO PANGLIMA BANGUNAN*\n`;
        text += `Periode: ${labelPeriode}\n`;
        text += `Dicetak/Dibuat: ${formatDate(today())}\n`;
        text += `========================================\n\n`;
        text += `RINCIAN PER RUTE:\n`;
        routeData.forEach((rd, i) => {
          text += `${i + 1}. Rute ${rd.nama.toUpperCase()}\n`;
          text += `   - Barang Terjual (+) : ${fmt(rd.terjual)}\n`;
          text += `   - Barang Masuk (-)   : ${fmt(rd.masuk)}\n`;
          text += `   - Uang Keluar (-)    : ${fmt(rd.keluar)}\n`;
          text += `   - Uang Masuk (+)     : ${fmt(rd.uangMasuk)}\n`;
          text += `   - Keuntungan Bersih  : ${rd.isUntung ? '' : '-'}${fmt(Math.abs(rd.keuntungan))} (${rd.isUntung ? 'Untung' : 'Rugi'})\n\n`;
        });
        text += `========================================\n`;
        text += `TOTAL SEMUA RUTE GABUNGAN:\n`;
        text += `- Total Barang Terjual (+) : ${fmt(grandTerjual)}\n`;
        text += `- Total Modal Masuk (-)    : ${fmt(grandMasuk)}\n`;
        text += `- Total Uang Keluar (-)    : ${fmt(grandKeluar)}\n`;
        text += `- Total Uang Masuk (+)     : ${fmt(grandUangMasuk)}\n`;
        text += `👉 *KEUNTUNGAN BERSIH GABUNGAN* : *${isGrandUntung ? '' : '-'}${fmt(Math.abs(grandKeuntungan))}* (${isGrandUntung ? 'UNTUNG' : 'RUGI'})\n`;
        text += `========================================\n`;

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => {
            showToast('Data rekap berhasil disalin ke clipboard! Siap di-paste ke WhatsApp atau Excel.', 'success');
          }).catch(() => {
            showToast('Gagal menyalin otomatis, silakan salin manual.', 'error');
          });
        } else {
          showToast('Clipboard API tidak didukung di browser ini.', 'error');
        }
      };
    }

    // Fitur Cetak Rekap
    const btnPrint = document.getElementById('btn-print-rekap-semua');
    if (btnPrint) {
      btnPrint.onclick = () => {
        document.getElementById('print-header-rekap-semua').innerHTML = `
          <div class="print-title">TOKO PANGLIMA BANGUNAN — REKAP KEUNTUNGAN SEMUA RUTE</div>
          <div class="print-subtitle">Rumus: Barang Terjual - Barang Masuk - Uang Keluar + Uang Masuk</div>
          <div class="print-subtitle">Periode: ${labelPeriode} &nbsp;|&nbsp; Dicetak: ${formatDate(today())}</div>
        `;
        window.print();
      };
    }
  }

  // Event handler filter
  document.getElementById('btn-mode-bulan').addEventListener('click', () => {
    filterRekapSemua.mode = 'bulan';
    document.getElementById('btn-mode-bulan').classList.add('btn-primary');
    document.getElementById('btn-mode-bulan').classList.remove('btn-ghost');
    document.getElementById('btn-mode-tahun').classList.remove('btn-primary');
    document.getElementById('btn-mode-tahun').classList.add('btn-ghost');
    document.getElementById('box-filter-bulan').style.display = 'block';
    refreshRekapView();
  });

  document.getElementById('btn-mode-tahun').addEventListener('click', () => {
    filterRekapSemua.mode = 'tahun';
    document.getElementById('btn-mode-tahun').classList.add('btn-primary');
    document.getElementById('btn-mode-tahun').classList.remove('btn-ghost');
    document.getElementById('btn-mode-bulan').classList.remove('btn-primary');
    document.getElementById('btn-mode-bulan').classList.add('btn-ghost');
    document.getElementById('box-filter-bulan').style.display = 'none';
    refreshRekapView();
  });

  document.getElementById('rekap-btn-terapkan').addEventListener('click', () => {
    filterRekapSemua.tahun = parseInt(document.getElementById('rekap-tahun').value, 10);
    filterRekapSemua.bulan = parseInt(document.getElementById('rekap-bulan').value, 10);
    filterRekapSemua.ruteId = document.getElementById('rekap-filter-rute').value;
    refreshRekapView();
  });

  // Pintas Cepat
  document.querySelectorAll('.rekap-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.preset;
      const t = new Date();
      if (p === 'this-month') {
        filterRekapSemua.mode = 'bulan';
        filterRekapSemua.tahun = t.getFullYear();
        filterRekapSemua.bulan = t.getMonth();
      } else if (p === 'last-month') {
        filterRekapSemua.mode = 'bulan';
        const lm = new Date(t.getFullYear(), t.getMonth() - 1, 1);
        filterRekapSemua.tahun = lm.getFullYear();
        filterRekapSemua.bulan = lm.getMonth();
      } else if (p === 'this-year') {
        filterRekapSemua.mode = 'tahun';
        filterRekapSemua.tahun = t.getFullYear();
      }
      document.getElementById('rekap-tahun').value = filterRekapSemua.tahun;
      document.getElementById('rekap-bulan').value = filterRekapSemua.bulan;
      if (filterRekapSemua.mode === 'bulan') {
        document.getElementById('btn-mode-bulan').classList.add('btn-primary');
        document.getElementById('btn-mode-bulan').classList.remove('btn-ghost');
        document.getElementById('btn-mode-tahun').classList.remove('btn-primary');
        document.getElementById('btn-mode-tahun').classList.add('btn-ghost');
        document.getElementById('box-filter-bulan').style.display = 'block';
      } else {
        document.getElementById('btn-mode-tahun').classList.add('btn-primary');
        document.getElementById('btn-mode-tahun').classList.remove('btn-ghost');
        document.getElementById('btn-mode-bulan').classList.remove('btn-primary');
        document.getElementById('btn-mode-bulan').classList.add('btn-ghost');
        document.getElementById('box-filter-bulan').style.display = 'none';
      }
      refreshRekapView();
    });
  });

  refreshRekapView();
}

/* ========================
   HALAMAN REKAP PER BULAN (Rute Aktif Tiap Bulan)
   ======================== */

/* Modal detail transaksi satu perjalanan — dipanggil dari tombol Detail di Rekap Per Bulan */
function bukaModalDetailPerjalanan(ruteId, pjIds, namaRute, labelPj) {
  // pjIds bisa array atau string tunggal — gabungkan hasil semua perjalanan
  const ids = Array.isArray(pjIds) ? pjIds : (pjIds ? [pjIds] : []);
  // Debug: log ke konsol supaya mudah troubleshoot jika modal kosong
  console.log('[Detail] ruteId:', ruteId, '| pjIds:', ids, '| BM total:', (store.barangMasuk||[]).filter(x => x.ruteId === ruteId).length,
              '| BT total:', (store.barangTerjual||[]).filter(x => x.ruteId === ruteId).length);

  // Hitung total gabungan semua perjalanan
  let res;
  if (ids.length === 0) {
    res = hitungKeuntunganRute(ruteId, null, null, null);
  } else if (ids.length === 1) {
    res = hitungKeuntunganRute(ruteId, null, null, ids[0]);
    // Fallback: kalau tidak ada data dengan perjalananId itu, tampilkan semua data rute
    if (res.counts.masuk + res.counts.terjual + res.counts.keluar + res.counts.uangMasuk === 0) {
      console.log('[Detail] Tidak ada data untuk pjId', ids[0], '— fallback ke semua data rute');
      res = hitungKeuntunganRute(ruteId, null, null, null);
    }
  } else {
    // Gabungkan hasil semua perjalanan
    const semua = ids.map(id => hitungKeuntunganRute(ruteId, null, null, id));
    res = {
      totalBarangMasuk:   semua.reduce((s, r) => s + r.totalBarangMasuk,   0),
      totalBarangTerjual: semua.reduce((s, r) => s + r.totalBarangTerjual, 0),
      totalUangKeluar:    semua.reduce((s, r) => s + r.totalUangKeluar,    0),
      totalUangMasuk:     semua.reduce((s, r) => s + r.totalUangMasuk,     0),
      keuntungan:         semua.reduce((s, r) => s + r.keuntungan,         0),
      counts: {
        masuk:     semua.reduce((s, r) => s + r.counts.masuk,     0),
        terjual:   semua.reduce((s, r) => s + r.counts.terjual,   0),
        keluar:    semua.reduce((s, r) => s + r.counts.keluar,     0),
        uangMasuk: semua.reduce((s, r) => s + r.counts.uangMasuk, 0),
      },
      lists: {
        masuk:     semua.flatMap(r => r.lists.masuk),
        terjual:   semua.flatMap(r => r.lists.terjual),
        keluar:    semua.flatMap(r => r.lists.keluar),
        uangMasuk: semua.flatMap(r => r.lists.uangMasuk),
      }
    };
    // Fallback: kalau gabungan semua juga kosong, tampilkan semua data rute itu
    if (res.counts.masuk + res.counts.terjual + res.counts.keluar + res.counts.uangMasuk === 0) {
      console.log('[Detail] Tidak ada data untuk semua pjIds', ids, '— fallback ke semua data rute');
      res = hitungKeuntunganRute(ruteId, null, null, null);
    }
  }

  const isUntung = res.keuntungan >= 0;

  // Helper buat tabel daftar item
  const tblBM = res.lists.masuk.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:14px;">Tidak ada barang masuk</td></tr>`
    : res.lists.masuk.map(b => {
        const total = bmItemTotal(b);
        const diskon = Number(b.diskon || 0);
        return `<tr>
          <td style="padding:7px 10px;">${e(b.nama || '-')}</td>
          <td style="text-align:right;padding:7px 10px;">${fmtNum(b.jumlah || 0)}</td>
          <td style="text-align:center;padding:7px 10px;">${e(b.satuan || '')}</td>
          <td style="text-align:right;padding:7px 10px;">${fmt(b.hargaModal || 0)}${diskon > 0 ? ` <span style="color:var(--orange);font-size:11px">−${diskon}%</span>` : ''}</td>
          <td style="text-align:right;padding:7px 10px;font-weight:600;color:var(--red);">${fmt(total)}</td>
        </tr>`;
      }).join('');

  const tblBT = res.lists.terjual.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:14px;">Tidak ada barang terjual</td></tr>`
    : res.lists.terjual.map(b => {
        const total = Number(b.jumlah || 0) * Number(b.hargaJual || 0);
        return `<tr>
          <td style="padding:7px 10px;">${e(b.nama || '-')}</td>
          <td style="text-align:right;padding:7px 10px;">${fmtNum(b.jumlah || 0)}</td>
          <td style="text-align:center;padding:7px 10px;">${e(b.satuan || '')}</td>
          <td style="text-align:right;padding:7px 10px;">${fmt(b.hargaJual || 0)}</td>
          <td style="text-align:right;padding:7px 10px;font-weight:600;color:var(--green);">${fmt(total)}</td>
        </tr>`;
      }).join('');

  const tblKeluar = res.lists.keluar.length === 0
    ? `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:14px;">Tidak ada uang keluar</td></tr>`
    : res.lists.keluar.map(x => `<tr>
        <td style="padding:7px 10px;">${e(x.keterangan || x.nama || '-')}</td>
        <td style="text-align:center;padding:7px 10px;">${x.tanggal ? formatDate(x.tanggal) : '-'}</td>
        <td style="text-align:right;padding:7px 10px;font-weight:600;color:var(--red);">${fmt(x.jumlah || 0)}</td>
      </tr>`).join('');

  const tblUangMsk = res.lists.uangMasuk.length === 0
    ? `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:14px;">Tidak ada uang masuk</td></tr>`
    : res.lists.uangMasuk.map(x => `<tr>
        <td style="padding:7px 10px;">${e(x.keterangan || x.nama || '-')}</td>
        <td style="text-align:center;padding:7px 10px;">${x.tanggal ? formatDate(x.tanggal) : '-'}</td>
        <td style="text-align:right;padding:7px 10px;font-weight:600;color:var(--green);">${fmt(x.jumlah || 0)}</td>
      </tr>`).join('');

  const thStyle = 'padding:8px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);border-bottom:1px solid var(--border);';
  const secStyle = 'margin-bottom:20px;border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;';
  const secHead = (ico_name, label, jumlah, warna) =>
    `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface-hover);border-bottom:1px solid var(--border);">
       <div style="font-size:13px;font-weight:700;display:flex;align-items:center;gap:7px;">${ico(ico_name,16)} ${label}</div>
       <div style="font-size:14px;font-weight:800;color:${warna};">${fmt(jumlah)}</div>
     </div>`;

  const html = `
    <div style="padding:4px 0;">
      <!-- Ringkasan Keuntungan -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:20px;">
        <div style="background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);border-radius:var(--r-md);padding:12px 14px;">
          <div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;margin-bottom:4px;">Brg Masuk (−)</div>
          <div style="font-size:16px;font-weight:800;color:var(--red);">${fmt(res.totalBarangMasuk)}</div>
        </div>
        <div style="background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.2);border-radius:var(--r-md);padding:12px 14px;">
          <div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;margin-bottom:4px;">Brg Terjual (+)</div>
          <div style="font-size:16px;font-weight:800;color:var(--green);">${fmt(res.totalBarangTerjual)}</div>
        </div>
        <div style="background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);border-radius:var(--r-md);padding:12px 14px;">
          <div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;margin-bottom:4px;">Uang Keluar (−)</div>
          <div style="font-size:16px;font-weight:800;color:var(--red);">${fmt(res.totalUangKeluar)}</div>
        </div>
        <div style="background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.2);border-radius:var(--r-md);padding:12px 14px;">
          <div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;margin-bottom:4px;">Uang Masuk (+)</div>
          <div style="font-size:16px;font-weight:800;color:var(--green);">${fmt(res.totalUangMasuk)}</div>
        </div>
        <div style="background:${isUntung ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)'};border:2px solid ${isUntung ? 'rgba(16,185,129,.4)' : 'rgba(239,68,68,.4)'};border-radius:var(--r-md);padding:12px 14px;">
          <div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;margin-bottom:4px;">Untung Bersih</div>
          <div style="font-size:18px;font-weight:900;color:${isUntung ? 'var(--green)' : 'var(--red)'};">${isUntung ? '' : '-'}${fmt(Math.abs(res.keuntungan))}</div>
        </div>
      </div>

      <!-- Barang Masuk -->
      <div style="${secStyle}">
        ${secHead('inventory_2', 'Barang Masuk', res.totalBarangMasuk, 'var(--red)')}
        <div style="overflow-x:auto;"><table style="width:100%;font-size:12.5px;">
          <thead><tr>
            <th style="${thStyle}">Nama Barang</th>
            <th style="${thStyle}text-align:right;">Jumlah</th>
            <th style="${thStyle}text-align:center;">Satuan</th>
            <th style="${thStyle}text-align:right;">Harga Modal</th>
            <th style="${thStyle}text-align:right;">Total Modal</th>
          </tr></thead>
          <tbody>${tblBM}</tbody>
        </table></div>
      </div>

      <!-- Barang Terjual -->
      <div style="${secStyle}">
        ${secHead('local_shipping', 'Barang Terjual', res.totalBarangTerjual, 'var(--green)')}
        <div style="overflow-x:auto;"><table style="width:100%;font-size:12.5px;">
          <thead><tr>
            <th style="${thStyle}">Nama Barang</th>
            <th style="${thStyle}text-align:right;">Jumlah</th>
            <th style="${thStyle}text-align:center;">Satuan</th>
            <th style="${thStyle}text-align:right;">Harga Jual</th>
            <th style="${thStyle}text-align:right;">Total</th>
          </tr></thead>
          <tbody>${tblBT}</tbody>
        </table></div>
      </div>

      <!-- Uang Keluar -->
      <div style="${secStyle}">
        ${secHead('payments', 'Uang Keluar', res.totalUangKeluar, 'var(--red)')}
        <div style="overflow-x:auto;"><table style="width:100%;font-size:12.5px;">
          <thead><tr>
            <th style="${thStyle}">Keterangan</th>
            <th style="${thStyle}text-align:center;">Tanggal</th>
            <th style="${thStyle}text-align:right;">Jumlah</th>
          </tr></thead>
          <tbody>${tblKeluar}</tbody>
        </table></div>
      </div>

      <!-- Uang Masuk -->
      <div style="${secStyle}margin-bottom:4px;">
        ${secHead('account_balance_wallet', 'Uang Masuk', res.totalUangMasuk, 'var(--green)')}
        <div style="overflow-x:auto;"><table style="width:100%;font-size:12.5px;">
          <thead><tr>
            <th style="${thStyle}">Keterangan</th>
            <th style="${thStyle}text-align:center;">Tanggal</th>
            <th style="${thStyle}text-align:right;">Jumlah</th>
          </tr></thead>
          <tbody>${tblUangMsk}</tbody>
        </table></div>
      </div>
    </div>`;

  setLebarModal('860px');
  openModal(`${ico('analytics',18)} Detail Perjalanan: ${namaRute} — ${labelPj}`, html, null);
}

function renderRekapPerBulan() {
  const content = document.getElementById('content');
  if (!content) return;

  const now = new Date();
  let selTahun = now.getFullYear();
  let selBulan = now.getMonth(); // 0-indexed

  // Dapatkan semua tahun dari perjalanan dan transaksi
  const tahunSet = new Set([now.getFullYear()]);
  const extractTahun = (arr, field = 'tanggal') => {
    (arr || []).forEach(p => {
      if (p && p[field]) {
        const y = parseInt(String(p[field]).slice(0, 4), 10);
        if (!isNaN(y) && y > 2000 && y < 2100) tahunSet.add(y);
      }
    });
  };
  extractTahun(store.perjalananList, 'tanggalMulai');
  extractTahun(store.barangMasuk);
  extractTahun(store.barangTerjual);
  extractTahun(store.uangKeluarLK);
  extractTahun(store.uangMasuk);
  const availableTahun = Array.from(tahunSet).sort((a, b) => b - a);

  function buildHTML() {
    const lastDay = new Date(selTahun, selBulan + 1, 0).getDate();
    const startDate = `${selTahun}-${String(selBulan + 1).padStart(2, '0')}-01`;
    const endDate   = `${selTahun}-${String(selBulan + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const labelBulan = `${MONTHS[selBulan]} ${selTahun}`;

    // ── Satu baris = satu RUTE (gabungan semua perjalanan rute itu di bulan terpilih) ──────────
    // Sesuai permintaan klien: "kalau bisa digabungkan saja semua rute-rute itu"
    // Angka total dihitung dari semua perjalanan rute yang berangkat di bulan ini,
    // sehingga 1 rute = 1 baris meski ada 2–3 kali perjalanan di bulan yang sama.
    const rows = [];
    const selisihHari = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
    // Periode penampung jangka panjang (> 62 hari) bukan "sekali jalan"
    const isPenampung = (pj) => !!(pj.tanggalMulai && pj.tanggalSelesai && selisihHari(pj.tanggalMulai, pj.tanggalSelesai) > 62);
    const jumlahBaris = (res) => res.counts.masuk + res.counts.terjual + res.counts.keluar + res.counts.uangMasuk;

    (store.ruteList || []).forEach(rute => {
      const ruteId = rute.id;
      const tripsNyata = (store.perjalananList || []).filter(pj => pj.ruteId === ruteId && !isPenampung(pj));

      // Ambil semua perjalanan rute ini yang SUDAH berangkat di bulan terpilih
      // pj.tanggalMulai <= today() = sudah berangkat (bukan rencana masa depan)
      const hariIni = today();
      const tripsBulanIni = tripsNyata
        .filter(pj =>
          pj.tanggalMulai &&
          pj.tanggalMulai >= startDate &&
          pj.tanggalMulai <= endDate &&
          pj.tanggalMulai <= hariIni   // ← hanya yang SUDAH berangkat
        )
        .sort((x, y) => x.tanggalMulai.localeCompare(y.tanggalMulai));

      if (tripsBulanIni.length === 0) return; // rute ini tidak berangkat bulan ini

      // Hitung total gabungan semua perjalanan rute ini di bulan terpilih
      let totalMasuk = 0, totalTerjual = 0, totalKeluar = 0, totalUangMasuk = 0, totalData = 0;
      const pjIds = []; // simpan semua pjId untuk modal Detail
      tripsBulanIni.forEach(pj => {
        const res = hitungKeuntunganRute(ruteId, null, null, pj.id);
        totalMasuk     += res.totalBarangMasuk;
        totalTerjual   += res.totalBarangTerjual;
        totalKeluar    += res.totalUangKeluar;
        totalUangMasuk += res.totalUangMasuk;
        totalData      += jumlahBaris(res);
        pjIds.push(pj.id);
      });

      // Label: jika 1 perjalanan tampilkan rentangnya, jika >1 tampilkan jumlahnya
      const labelGabung = tripsBulanIni.length === 1
        ? perjalananLabel(tripsBulanIni[0])
        : `${tripsBulanIni.length} perjalanan`;

      // berlanjut: salah satu perjalanan melewati akhir bulan
      const adaBerlanjut = tripsBulanIni.some(pj => pj.tanggalSelesai && pj.tanggalSelesai > endDate);

      rows.push({
        ruteId,
        namaRute:    rute.nama,
        label:       labelGabung,
        jumlahPj:    tripsBulanIni.length,
        pjIds:       pjIds.join(','),       // untuk modal Detail
        jumlahData:  totalData,
        berlanjut:   adaBerlanjut,
        terjual:     totalTerjual,
        masuk:       totalMasuk,
        keluar:      totalKeluar,
        uangMasuk:   totalUangMasuk,
        keuntungan:  totalTerjual - totalMasuk - totalKeluar + totalUangMasuk
      });
    });

    // ── Data yatim (perjalananId null atau tidak valid) per rute di bulan ini ──
    (store.ruteList || []).forEach(rute => {
      const ruteId = rute.id;
      const pjIds = (store.perjalananList || []).map(p => p.id);

      // Filter barang masuk yatim
      const bmYatim = (store.barangMasuk || []).filter(b =>
        b.ruteId === ruteId &&
        b.tanggal >= startDate &&
        b.tanggal <= endDate &&
        (!b.perjalananId || !pjIds.includes(b.perjalananId))
      );
      const btYatim = (store.barangTerjual || []).filter(b =>
        b.ruteId === ruteId &&
        b.tanggal >= startDate &&
        b.tanggal <= endDate &&
        (!b.perjalananId || !pjIds.includes(b.perjalananId))
      );

      if (bmYatim.length === 0 && btYatim.length === 0) return;

      const totalMasukYatim = bmYatim.reduce((s, b) => s + bmItemTotal(b), 0);
      const totalTerjualYatim = btYatim.reduce((s, b) => s + Number(b.jumlah || 0) * Number(b.hargaJual || 0), 0);
      const totalData = bmYatim.length + btYatim.length;

      rows.push({
        ruteId,
        namaRute: rute.nama,
        label: `⚠ Data tidak terpasang ke perjalanan`,
        isYatim: true,
        jumlahPj: 0,
        pjIds: '',
        jumlahData: totalData,
        berlanjut: false,
        terjual: totalTerjualYatim,
        masuk: totalMasukYatim,
        keluar: 0,
        uangMasuk: 0,
        keuntungan: totalTerjualYatim - totalMasukYatim,
      });
    });

    const jumlahRuteAktif = rows.length;
    const grandTerjual    = rows.reduce((s, r) => s + r.terjual, 0);
    const grandMasuk      = rows.reduce((s, r) => s + r.masuk, 0);
    const grandKeluar     = rows.reduce((s, r) => s + r.keluar, 0);
    const grandUangMasuk  = rows.reduce((s, r) => s + r.uangMasuk, 0);
    const grandKeuntungan = rows.reduce((s, r) => s + r.keuntungan, 0);

    const rowsHTML = rows.length === 0
      ? `<tr><td colspan="9" style="text-align:center;padding:28px;color:var(--muted);">Tidak ada perjalanan yang berangkat pada ${labelBulan}</td></tr>`
      : rows.map((r, i) => r.isYatim ? `
          <tr style="background:rgba(234,179,8,0.08);border-left:3px solid #ca8a04;">
            <td style="text-align:center;color:var(--muted);padding:10px 8px;">${i + 1}</td>
            <td class="primary" style="font-weight:700;padding:10px 8px;white-space:nowrap;">
              <div style="display:flex;align-items:center;gap:6px;">
                ${ico('local_shipping', 16)}
                <span>${e(r.namaRute)}</span>
              </div>
            </td>
            <td style="font-size:12px;padding:10px 8px;">
              <div style="font-weight:600;color:#92400e;white-space:nowrap;">${r.label}</div>
              <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">
                <span class="badge badge-yellow">⚠ Data lepas</span>
                <span class="badge">${r.jumlahData} data</span>
              </div>
            </td>
            <td style="text-align:right;color:var(--red);font-weight:600;padding:10px 8px;white-space:nowrap;">${fmt(r.masuk)}</td>
            <td style="text-align:right;color:var(--green);font-weight:600;padding:10px 8px;white-space:nowrap;">${fmt(r.terjual)}</td>
            <td style="text-align:right;color:var(--red);font-weight:600;padding:10px 8px;white-space:nowrap;">${fmt(r.keluar)}</td>
            <td style="text-align:right;color:var(--green);font-weight:600;padding:10px 8px;white-space:nowrap;">${fmt(r.uangMasuk)}</td>
            <td style="text-align:right;font-weight:800;padding:10px 8px;white-space:nowrap;color:${r.keuntungan >= 0 ? 'var(--green)' : 'var(--red)'}">${r.keuntungan >= 0 ? '' : '-'}${fmt(Math.abs(r.keuntungan))}</td>
            <td class="no-print" style="text-align:center;padding:10px 8px;white-space:nowrap;">
              <button class="btn btn-sm" style="background:#fef3c7;color:#92400e;border:1px solid #d97706;border-radius:7px;" data-aksi="rbp-perbaiki-yatim" data-rute="${r.ruteId}" data-nama-rute="${e(r.namaRute)}">${ico('build', 14)} Perbaiki</button>
            </td>
          </tr>` : `
          <tr>
            <td style="text-align:center;color:var(--muted);padding:10px 8px;">${i + 1}</td>
            <td class="primary" style="font-weight:700;padding:10px 8px;white-space:nowrap;">
              <div style="display:flex;align-items:center;gap:6px;">
                ${ico('local_shipping', 16)}
                <span>${e(r.namaRute)}</span>
              </div>
            </td>
            <td style="font-size:12px;padding:10px 8px;">
              <div style="font-weight:600;color:var(--ink);white-space:nowrap;">${r.label}</div>
              <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">
                <span class="badge badge-blue">${r.jumlahPj} perjalanan</span>
                <span class="badge">${r.jumlahData} data</span>
                ${r.berlanjut ? '<span class="badge badge-orange">ada yg berlanjut ke bulan berikutnya</span>' : ''}
              </div>
            </td>
            <td style="text-align:right;color:var(--red);font-weight:600;padding:10px 8px;white-space:nowrap;">${fmt(r.masuk)}</td>
            <td style="text-align:right;color:var(--green);font-weight:600;padding:10px 8px;white-space:nowrap;">${fmt(r.terjual)}</td>
            <td style="text-align:right;color:var(--red);font-weight:600;padding:10px 8px;white-space:nowrap;">${fmt(r.keluar)}</td>
            <td style="text-align:right;color:var(--green);font-weight:600;padding:10px 8px;white-space:nowrap;">${fmt(r.uangMasuk)}</td>
            <td style="text-align:right;font-weight:800;padding:10px 8px;white-space:nowrap;color:${r.keuntungan >= 0 ? 'var(--green)' : 'var(--red)'}">${r.keuntungan >= 0 ? '' : '-'}${fmt(Math.abs(r.keuntungan))}</td>
            <td class="no-print" style="text-align:center;padding:10px 8px;white-space:nowrap;">
              <button class="btn btn-ghost btn-sm" data-aksi="rbp-detail-perjalanan" data-rute="${r.ruteId}" data-pj-ids="${e(r.pjIds)}" data-label="${e(r.label)}" data-nama-rute="${e(r.namaRute)}">${ico('visibility', 14)} Detail</button>
            </td>
          </tr>`).join('');

    return `
    <div class="page-anim">
      <div class="print-header" id="print-header-rbp"></div>
      <div class="page-header nx-head no-print" style="align-items:center;">
        <div>
          <div class="page-title">${ico('calendar_month')} Rekap Per Bulan</div>
          <div class="page-subtitle">Setiap rute yang berangkat di bulan terpilih, ditampilkan satu baris dengan total gabungan semua perjalanannya</div>
        </div>
        <div class="no-print" style="display:flex;align-items:center;gap:10px;">
          <button class="btn btn-ghost" id="rbp-btn-print">${ico('print', 17)} Cetak Rekap</button>
        </div>
      </div>

      <!-- Filter Bulan & Tahun -->
      <div class="card no-print" style="margin-bottom:20px;padding:16px 20px;">
        <div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px;">
          <div class="form-group" style="margin:0;min-width:140px;">
            <label class="form-label" style="font-size:12px;font-weight:600;">Tahun</label>
            <select class="form-select" id="rbp-sel-tahun">
              ${availableTahun.map(y => `<option value="${y}" ${selTahun === y ? 'selected' : ''}>Tahun ${y}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0;min-width:160px;">
            <label class="form-label" style="font-size:12px;font-weight:600;">Bulan</label>
            <select class="form-select" id="rbp-sel-bulan">
              ${MONTHS.map((mName, idx) => `<option value="${idx}" ${selBulan === idx ? 'selected' : ''}>${mName}</option>`).join('')}
            </select>
          </div>
          <div style="margin-bottom:1px;">
            <button class="btn btn-primary" id="rbp-btn-terapkan">${ico('filter_alt', 16)} Terapkan</button>
          </div>
          <div style="margin-bottom:1px;display:flex;gap:8px;">
            <button type="button" class="btn btn-sm btn-ghost" id="rbp-preset-bulan-ini">Bulan Ini</button>
            <button type="button" class="btn btn-sm btn-ghost" id="rbp-preset-bulan-lalu">Bulan Lalu</button>
          </div>
        </div>
      </div>

      <!-- Hasil Rekap -->
      <div class="card" style="margin-bottom:20px;overflow:hidden;">
        <div style="padding:14px 18px;background:var(--brand-light,#f0faf8);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:14px;font-weight:700;color:var(--brand);">
            ${ico('calendar_month', 17)} Rekap Per Rute — ${labelBulan}
          </div>
          <div style="font-size:12px;color:var(--muted);">${jumlahRuteAktif} rute aktif</div>
        </div>
        <div class="table-wrap">
          <table style="font-size:13px;">
            <thead>
              <tr>
                <th style="text-align:center;width:36px;padding:10px 8px;">No</th>
                <th style="padding:10px 8px;">Rute</th>
                <th style="padding:10px 8px;">Perjalanan</th>
                <th style="text-align:right;padding:10px 8px;white-space:nowrap;">Brg Masuk (−)</th>
                <th style="text-align:right;padding:10px 8px;white-space:nowrap;">Brg Terjual (+)</th>
                <th style="text-align:right;padding:10px 8px;white-space:nowrap;">Uang Keluar (−)</th>
                <th style="text-align:right;padding:10px 8px;white-space:nowrap;">Uang Masuk (+)</th>
                <th style="text-align:right;padding:10px 8px;white-space:nowrap;">Untung Bersih</th>
                <th class="no-print" style="text-align:center;padding:10px 8px;">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHTML}
            </tbody>
            ${rows.length ? `
            <tfoot>
              <tr style="background:var(--surface-hover);font-weight:800;border-top:2px solid var(--border);">
                <td colspan="3" style="padding:11px 8px;text-align:right;">TOTAL ${labelBulan.toUpperCase()}:</td>
                <td style="padding:11px 8px;text-align:right;color:var(--red);white-space:nowrap;">${fmt(grandMasuk)}</td>
                <td style="padding:11px 8px;text-align:right;color:var(--green);white-space:nowrap;">${fmt(grandTerjual)}</td>
                <td style="padding:11px 8px;text-align:right;color:var(--red);white-space:nowrap;">${fmt(grandKeluar)}</td>
                <td style="padding:11px 8px;text-align:right;color:var(--green);white-space:nowrap;">${fmt(grandUangMasuk)}</td>
                <td style="padding:11px 8px;text-align:right;font-size:14px;white-space:nowrap;color:${grandKeuntungan >= 0 ? 'var(--green)' : 'var(--red)'};">${grandKeuntungan >= 0 ? '' : '-'}${fmt(Math.abs(grandKeuntungan))}</td>
                <td class="no-print" style="padding:11px 8px;"></td>
              </tr>
            </tfoot>` : ''}
          </table>
        </div>
        <div style="padding:10px 18px;border-top:1px solid var(--border);font-size:11.5px;color:var(--muted);line-height:1.6;">
          Angka tiap baris mencakup <b>seluruh transaksi milik perjalanan tersebut</b> (sama dengan angka di Daftar Perjalanan dan Keuntungan Rute).
          Perjalanan dihitung pada bulan keberangkatannya, sehingga perjalanan yang melewati pergantian bulan tidak terhitung dua kali.
          Untung Bersih = Brg Terjual − Brg Masuk − Uang Keluar + Uang Masuk.
        </div>
      </div>
    </div>`;
  }

  function render() {
    content.innerHTML = buildHTML();
    bindEvents();
  }

  function bindEvents() {
    document.getElementById('rbp-btn-terapkan')?.addEventListener('click', () => {
      selTahun = Number(document.getElementById('rbp-sel-tahun')?.value || selTahun);
      selBulan = Number(document.getElementById('rbp-sel-bulan')?.value ?? selBulan);
      render();
    });
    document.getElementById('rbp-preset-bulan-ini')?.addEventListener('click', () => {
      const n = new Date();
      selTahun = n.getFullYear();
      selBulan = n.getMonth();
      render();
    });
    document.getElementById('rbp-preset-bulan-lalu')?.addEventListener('click', () => {
      const n = new Date();
      let m = n.getMonth() - 1;
      let y = n.getFullYear();
      if (m < 0) { m = 11; y--; }
      selTahun = y;
      selBulan = m;
      render();
    });
    document.getElementById('rbp-btn-print')?.addEventListener('click', () => {
      const ph = document.getElementById('print-header-rbp');
      if (ph) {
        ph.innerHTML = `
          <div class="print-title">Toko Panglima Bangunan — Rekap Rute Per Bulan</div>
          <div class="print-subtitle">Periode: ${MONTHS[selBulan]} ${selTahun} &bull; Dicetak: ${formatDate(today())}</div>`;
      }
      window.print();
    });

    // Handler tombol Perbaiki untuk data yatim
    document.querySelectorAll('[data-aksi="rbp-perbaiki-yatim"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const namaRute = btn.dataset.namaRute || '';
        openModal(
          `${ico('warning', 18)} Data Lepas — Rute ${e(namaRute)}`,
          `<div style="padding:8px 0;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding:14px;background:#fef3c7;border-radius:10px;border:1px solid #d97706;">
              ${ico('warning', 22)}
              <div>
                <div style="font-weight:700;color:#92400e;font-size:14px;">Data ini tidak terpasang ke perjalanan manapun</div>
                <div style="font-size:12px;color:#78350f;margin-top:4px;">Data barang masuk atau barang terjual milik rute ini tidak memiliki perjalanan yang terdaftar.</div>
              </div>
            </div>
            <div style="font-size:13px;color:var(--ink);line-height:1.7;">
              <b>Cara memperbaiki:</b>
              <ol style="margin:8px 0 0 18px;padding:0;">
                <li>Buka halaman <b>Barang Masuk</b> atau <b>Barang Terjual</b> di rute <b>${e(namaRute)}</b>.</li>
                <li>Cari data yang tidak memiliki perjalanan, lalu edit dan pilih perjalanan yang sesuai.</li>
                <li>Setelah disimpan, data ini tidak akan muncul lagi di sini.</li>
              </ol>
            </div>
          </div>`,
          null
        );
      });
    });
  }

  render();
}

/* ========================
   HALAMAN BACKUP & RESTORE DATA
   ======================== */
function renderBackupPage() {
  const content = document.getElementById('content');
  if (!content) return;

  // Cek apakah ada draf yang tersimpan di localStorage
  const activeDrafts = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('tp_draft_')) {
        const val = JSON.parse(localStorage.getItem(key));
        activeDrafts.push({ key, val });
      }
    }
  } catch (err) {}

  const html = `
  <div class="page-anim">
    <div class="page-header nx-head" style="align-items:center;">
      <div>
        <div class="page-title">${ico('cloud_sync')} Backup &amp; Restore Data Toko</div>
        <div class="page-subtitle">Cadangkan seluruh data Toko Panglima ke komputer Anda atau pulihkan data dari file cadangan kapan saja</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:20px;margin-bottom:24px;">
      <!-- Kartu 1: Unduh Backup -->
      <div class="card" style="padding:24px;display:flex;flex-direction:column;justify-content:space-between;">
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div style="background:rgba(15,118,110,0.1);color:var(--brand);padding:10px;border-radius:var(--r-md);display:inline-flex;">
              ${ico('cloud_download',28)}
            </div>
            <div>
              <div style="font-size:16px;font-weight:700;color:var(--ink);">Cadangkan Data (Backup)</div>
              <div style="font-size:12px;color:var(--muted);">Simpan ke file JSON di komputer / flashdisk</div>
            </div>
          </div>
          <p style="font-size:13px;color:var(--ink-variant);line-height:1.6;margin-bottom:16px;">
            Unduh seluruh rekaman transaksi barang masuk, barang terjual, utang, piutang, kas, rute, dan stok barang ke dalam sebuah file cadangan (.json). File ini dapat Anda simpan sebagai arsip atau dipindahkan ke komputer lain.
          </p>
          <div style="background:var(--surface-hover);padding:12px 14px;border-radius:var(--r-sm);font-size:12px;color:var(--ink);line-height:1.7;margin-bottom:20px;">
            <div>&bull; <b>${(store.barangMasuk || []).length}</b> transaksi Barang Masuk</div>
            <div>&bull; <b>${(store.barangTerjual || []).length}</b> transaksi Barang Terjual</div>
            <div>&bull; <b>${(store.ruteList || []).length}</b> rute perjalanan luar kota</div>
            <div>&bull; <b>${(store.utang || []).length + (store.piutang || []).length}</b> catatan Utang &amp; Piutang</div>
            <div>&bull; <b>${(store.uangKeluar || []).length + (store.uangKeluarLK || []).length + (store.uangMasuk || []).length}</b> catatan Kas</div>
          </div>
        </div>
        <button class="btn btn-primary" id="btn-unduh-backup" style="width:100%;justify-content:center;padding:12px;">
          ${ico('download',18)} Unduh Cadangan Lengkap (.json)
        </button>
      </div>

      <!-- Kartu 2: Pulihkan Data (Restore) -->
      <div class="card" style="padding:24px;display:flex;flex-direction:column;justify-content:space-between;border-top:3px solid var(--brand);">
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div style="background:rgba(239,68,68,0.1);color:var(--red);padding:10px;border-radius:var(--r-md);display:inline-flex;">
              ${ico('cloud_upload',28)}
            </div>
            <div>
              <div style="font-size:16px;font-weight:700;color:var(--ink);">Pulihkan Data (Restore)</div>
              <div style="font-size:12px;color:var(--muted);">Kembalikan data dari file cadangan sebelumnya</div>
            </div>
          </div>
          <p style="font-size:13px;color:var(--ink-variant);line-height:1.6;margin-bottom:16px;">
            Pilih file cadangan JSON yang pernah Anda unduh untuk mengembalikan data transaksi dan stok. Data saat ini akan diperbarui sesuai isi file cadangan.
          </p>
          <div class="form-group" style="margin-bottom:16px;">
            <label class="form-label" style="font-size:12px;font-weight:600;">Pilih File Cadangan (.json)</label>
            <input type="file" id="input-restore-file" accept=".json,application/json" class="form-input" style="padding:8px;" />
          </div>
          <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);padding:10px 12px;border-radius:var(--r-sm);font-size:11.5px;color:var(--red);line-height:1.5;margin-bottom:20px;">
            ${ico('warning',14)} <b>Perhatian:</b> Memulihkan data akan menggantikan data yang sedang aktif. Disarankan untuk mengunduh cadangan terbaru terlebih dahulu.
          </div>
        </div>
        <button class="btn btn-danger" id="btn-proses-restore" style="width:100%;justify-content:center;padding:12px;">
          ${ico('restore',18)} Pulihkan Data Sekarang
        </button>
      </div>
    </div>

    <!-- Kartu 3: Status Draf Formulir Auto-Save -->
    <div class="card" style="padding:20px 24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:8px;">
          ${ico('history',20)}
          <span style="font-size:14px;font-weight:700;color:var(--ink);">Perlindungan Draf Input Otomatis (Auto-Save)</span>
        </div>
        ${activeDrafts.length > 0 ? `
          <button class="btn btn-sm btn-ghost" id="btn-bersihkan-semua-draf" style="color:var(--red);font-weight:600;">
            ${ico('delete',15)} Bersihkan Semua Draf
          </button>
        ` : ''}
      </div>
      <p style="font-size:12.5px;color:var(--muted);line-height:1.6;margin-bottom:14px;">
        Sistem secara otomatis mengamankan ketikan Anda setiap detik saat mengisi formulir multi-baris (Barang Masuk &amp; Barang Terjual). Jadi jika Anda tidak sengaja mengarahkan kursor keluar atau browser tertutup, data Anda tidak akan hilang.
      </p>
      ${activeDrafts.length > 0 ? `
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${activeDrafts.map(d => `
            <div style="background:var(--surface-hover);padding:10px 14px;border-radius:var(--r-sm);display:flex;align-items:center;justify-content:space-between;font-size:12px;">
              <div>
                <b>${d.key.includes('bm') ? 'Draf Barang Masuk' : 'Draf Barang Terjual'}</b> &bull; ${d.val?.rows?.length || 0} baris tersimpan
                ${d.val?.supplier ? ` (Supplier: ${e(d.val.supplier)})` : ''}
                ${d.val?.pelanggan ? ` (Pelanggan: ${e(d.val.pelanggan)})` : ''}
              </div>
              <span class="badge badge-green" style="font-size:11px;">Tersimpan Aman</span>
            </div>
          `).join('')}
        </div>
      ` : `
        <div style="font-size:12px;color:var(--green);display:flex;align-items:center;gap:6px;">
          ${ico('check_circle',16)} Semua ketikan form Anda dalam kondisi bersih dan tersimpan ke database.
        </div>
      `}
    </div>
  </div>`;

  content.innerHTML = html;

  // Handler Unduh Backup
  document.getElementById('btn-unduh-backup')?.addEventListener('click', () => {
    try {
      const payload = {
        aplikasi: "Toko Panglima Bangunan",
        versi: "2.0",
        tanggalBackup: new Date().toISOString(),
        store: store
      };
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `Backup_TokoPanglima_${today()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('Cadangan berhasil diunduh ke komputer Anda!', 'success');
    } catch (err) {
      showToast('Gagal mengunduh file cadangan: ' + err.message, 'error');
    }
  });

  // Handler Restore Backup
  document.getElementById('btn-proses-restore')?.addEventListener('click', () => {
    const fileInput = document.getElementById('input-restore-file');
    const file = fileInput?.files?.[0];
    if (!file) {
      showToast('Pilih file cadangan (.json) terlebih dahulu!', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const parsed = JSON.parse(e.target.result);
        const dataStore = parsed.store || parsed;

        if (!dataStore.ruteList && !dataStore.barangMasuk && !dataStore.stokToko) {
          showToast('File tidak valid: Format cadangan Toko Panglima tidak ditemukan.', 'error');
          return;
        }

        if (!confirm('PERHATIAN PENTING:\n\nSeluruh data toko yang ada saat ini akan digantikan dengan data dari file cadangan ini.\n\nApakah Anda yakin ingin melanjutkan proses pemulihan?')) {
          return;
        }

        // Salin semua properti ke store
        Object.keys(dataStore).forEach(k => {
          store[k] = dataStore[k];
        });

        saveStore();
        showToast('Data toko berhasil dipulihkan dari cadangan!', 'success');
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } catch (err) {
        showToast('Gagal memproses file cadangan: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  });

  // Bersihkan draf
  document.getElementById('btn-bersihkan-semua-draf')?.addEventListener('click', () => {
    if (!confirm('Hapus seluruh draf formulir yang belum disimpan?')) return;
    try {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('tp_draft_')) toRemove.push(key);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
      showToast('Seluruh draf berhasil dibersihkan.', 'success');
      renderBackupPage();
    } catch (err) {}
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
    <div class="page-header nx-head">
      <div class="no-print">
        <div class="page-title">${cfg.icon} ${cfg.title}</div>
        <div class="page-subtitle">${ico('info',15)}${cfg.subtitle}</div>
      </div>
      <div class="no-print nx-head-aksi">
        ${hasDateFilter ? `<div class="nx-filter-pill" id="filter-inputs-${key}">
          ${ico('calendar_month',17)}${dateFilterInputsHtml(key)}
        </div>` : ''}
        <button class="btn btn-ghost" id="btn-print-${key}">${ico('print',17)} Cetak</button>
        <button class="btn btn-dark" id="btn-add-${key}">${ico('add',17)}${cfg.addLabel.replace(/^\+\s*/, '')}</button>
      </div>
    </div>

    <div class="card">
      <div class="nx-toolbar no-print">
        <div class="search-bar lebar">
          ${ico('search')}
          <input type="text" id="search-${key}" placeholder="Cari ${cfg.title.toLowerCase()}..." />
        </div>
      </div>
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
  document.getElementById(`search-${key}`).addEventListener('input', () => {
    refreshTableBody(key);
  });
  document.getElementById(`btn-print-${key}`).addEventListener('click', () => {
    printCurrentPage(cfg.title, key);
  });

  if (hasDateFilter) {
    document.getElementById(`filter-bulan-${key}`).addEventListener('change', (ev) => {
      listFilters[key].bulan = ev.target.value;
      refreshTableBody(key);
    });
    document.getElementById(`filter-tahun-${key}`).addEventListener('change', (ev) => {
      listFilters[key].tahun = ev.target.value;
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
  const subtitle = rute ? `Rute ${e(rute.nama)} — Periode: ${periode}` : `Periode: ${periode}`;
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
  } else if (!currentRuteId && (key === 'barangMasuk' || key === 'uangKeluar')) {
    data = data.filter(x => !x.ruteId);
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

/* Satu baris tabel "tidak ada isinya", dipakai di beberapa tabel. */
function barisKosong(colspan, judul, sub) {
  return `<tr><td colspan="${colspan}" style="padding:40px;text-align:center;color:var(--muted)">
    <div class="empty-state-icon">${ico('inbox')}</div>
    <div class="empty-state-title">${e(judul)}</div>
    <div class="empty-state-sub">${sub}</div>
  </td></tr>`;
}

function renderEmptyTbody(tbody, colspan, sub) {
  tbody.innerHTML = barisKosong(colspan, 'Tidak ada data', sub);
}

// baris yang tanggalnya di luar rentang periode (mis. periode dipersempit belakangan)
function tandaiBarisLuar(item) {
  const pesan = tanggalDiLuarGrup(item && item.tanggal);
  if (!pesan) return { cls: '', attr: '' };
  return { cls: ' row-luar-periode', attr: ` title="${e(pesan)}"` };
}

function renderRowsIntoTbody(key, filtered, tbody) {
  const cfg = listConfig[key];
  const items = filtered.slice().reverse();

  if (cfg.grouped) {
    renderGroupedBody(key, items, tbody, cfg);
  } else {
    // Simple numbered list
    const totalUangNonGrouped = hitungTotalUangKey(key, items);
    const hasTotal = ['uangKeluar', 'uangKeluarLK', 'uangMasuk', 'tagihan', 'utang'].includes(key);
    const warna = key === 'uangMasuk' ? 'color:var(--green);' : (key === 'uangKeluar' || key === 'uangKeluarLK' ? 'color:var(--red);' : '');
    const tandaMin = (key === 'uangKeluar' || key === 'uangKeluarLK') ? '-' : '';

    tbody.innerHTML = items.map((item, idx) => `
      <tr class="${tandaiBarisLuar(item).cls.trim()}"${tandaiBarisLuar(item).attr}>
        <td class="group-no-cell" style="width:44px;font-weight:700;color:var(--muted);text-align:center">${idx + 1}</td>
        ${cfg.rowFn(item)}
        <td>
          <div class="actions">
            <button class="btn btn-ghost btn-sm" data-aksi="ubah" data-key="${key}" data-id="${item.id}">${ico('edit',16)} Edit</button>
            <button class="btn btn-danger btn-sm" data-aksi="hapus" data-key="${key}" data-id="${item.id}">${ico('delete',16)}</button>
          </div>
        </td>
      </tr>
    `).join('') + (hasTotal && items.length ? `
      <tr class="subtotal-row" style="background:var(--surface-hover);font-weight:700;">
        <td colspan="3" style="text-align:right;padding:12px 14px;">Total (${items.length} data):</td>
        <td style="padding:12px 14px;font-size:14px;font-weight:700;white-space:nowrap;${warna}">${tandaMin}${fmt(totalUangNonGrouped)}</td>
        ${cfg.columns.length > 5 ? `<td colspan="${cfg.columns.length - 4}"></td>` : `<td></td>`}
      </tr>
    ` : '');
  }
}

/* ========================
   GENERIC GROUPED TABLE RENDERER
   ======================== */
/* Badge status pelunasan untuk satu kelompok piutang. */
function badgeLunasGrup(g) {
  const belum = g.rows.filter(x => x.status !== 'Lunas').length;
  if (!belum) return `<span class="grup-badge lunas">Lunas semua</span>`;
  return `<span class="grup-badge belum">${belum} belum lunas</span>`;
}

/* Tabel berkelompok gaya baru: satu baris kepala per kelompok,
   nomor urut berjalan di dalam kelompok, lalu satu baris subtotal. */
function renderGroupedBody(key, items, tbody, cfg) {
  const groups = [];
  const groupMap = {};
  items.forEach(item => {
    const k = cfg.groupKeyFn(item);
    if (!groupMap[k]) { groupMap[k] = { rows: [] }; groups.push(groupMap[k]); }
    groupMap[k].rows.push(item);
  });

  const lebar = cfg.columns.length;
  let html = '';

  groups.forEach((group, gi) => {
    const judul = cfg.groupTitleFn
      ? cfg.groupTitleFn(group)
      : { nama: '', sub: '' };
    const badge = cfg.groupBadgeFn ? cfg.groupBadgeFn(group) : '';

    html += `<tr class="grup-kepala">
      <td colspan="${lebar}">
        <div class="grup-kepala-isi">
          <span class="grup-dot"></span>
          <span class="grup-nama">${e(judul.nama)}</span>
          ${judul.sub ? `<span class="grup-sub">${e(judul.sub)}</span>` : ''}
          <span class="grup-spacer"></span>
          ${badge}
        </div>
      </td>
    </tr>`;

    group.rows.forEach((item, ri) => {
      const tanda = tandaiBarisLuar(item);
      html += `<tr class="grup-isi${tanda.cls}"${tanda.attr}>`;
      html += `<td class="group-no-cell">${ri + 1}</td>`;
      html += cfg.itemCellsFn(item);
      html += `<td>
        <div class="actions">
          <button class="btn btn-ghost btn-sm" data-aksi="ubah" data-key="${key}" data-id="${item.id}">${ico('edit',16)} Edit</button>
          <button class="btn btn-danger btn-sm" data-aksi="hapus" data-key="${key}" data-id="${item.id}">${ico('delete',16)}</button>
        </div></td>
      </tr>`;
    });

    if (cfg.subtotalRowFn) {
      html += `<tr class="subtotal-row">${cfg.subtotalRowFn(group.rows, judul.nama)}</tr>`;
    }
  });

  if (groups.length > 1 && cfg.subtotalRowFn) {
    const totalSemuaUang = hitungTotalUangKey(key, items);
    if (key === 'barangMasuk') {
      const totalBesar = items.reduce((s2, b) => s2 + Number(b.jumlah1 || b.jumlah || 0), 0);
      const totalEcer  = items.reduce((s2, b) => s2 + Number(b.jumlah2 || 0), 0);
      html += `<tr class="subtotal-row" style="background:var(--surface-hover);font-weight:800;border-top:2px solid var(--border);">
        <td></td>
        <td class="subtotal-label" style="font-weight:800;">Total Keseluruhan (${items.length} item)</td>
        <td class="subtotal-val" style="font-weight:800;">${fmtNum(totalBesar)} item</td>
        <td class="subtotal-val" style="font-weight:800;">${totalEcer ? fmtNum(totalEcer) + ' pcs' : '—'}</td>
        <td class="subtotal-val" style="font-weight:800;color:var(--brand);">${fmt(totalSemuaUang)}</td>
        <td></td><td></td>
      </tr>`;
    } else if (key === 'barangTerjual') {
      html += `<tr class="subtotal-row" style="background:var(--surface-hover);font-weight:800;border-top:2px solid var(--border);">
        <td></td>
        <td class="subtotal-label" colspan="3" style="font-weight:800;">Total Keseluruhan (${items.length} jenis barang)</td>
        <td class="subtotal-val amount-positive" style="font-weight:800;">${fmt(totalSemuaUang)}</td>
        <td></td>
      </tr>`;
    } else if (key === 'rekapPiutang') {
      html += `<tr class="subtotal-row" style="background:var(--surface-hover);font-weight:800;border-top:2px solid var(--border);">
        <td></td>
        <td class="subtotal-label" colspan="2" style="font-weight:800;">Total Keseluruhan (${items.length} faktur)</td>
        <td class="subtotal-val amount-positive" style="font-weight:800;">${fmt(totalSemuaUang)}</td>
        <td></td><td></td>
      </tr>`;
    }
  }

  tbody.innerHTML = html;
}

/* ========================
   FORM BUILDERS
   ======================== */
/* ── HELPER STOK DROPDOWN ── (fungsi formatStock sudah dideklarasikan di atas) */

function getAvailableStock() {
  return getStokToko().items
    .filter(x => x.stokKecil > 0)
    .sort((a,b) => a.nama.localeCompare(b.nama, 'id', {sensitivity: 'base'}));
}

function stockDropdownOptions(selectedNama = '') {
  const stocks = getAvailableStock();
  let html = '';
  const isManualDefault = !selectedNama;
  html += `<option value="__MANUAL__" style="color:var(--brand);font-weight:600" ${isManualDefault ? 'selected' : ''}>+ Isi Barang Manual</option>`;
  html += `<option value="" disabled>-- Pilih dari Stok --</option>`;
  if (stocks.length === 0) {
    html += '<option value="" disabled>-- Stok Kosong --</option>';
  } else {
    stocks.forEach(s => {
      const sel = selectedNama === s.nama ? 'selected' : '';
      const dataObj = encodeURIComponent(JSON.stringify(s));
      const sisaTxt = formatStock(s.stokKecil, s.konversi, s.satuan1, s.satuan2);
      html += `<option value="${s.nama}" ${sel} data-stock="${dataObj}">${s.nama} (Sisa: ${sisaTxt})</option>`;
    });
  }
  return html;
}

/* ── form SINGLE edit (dipakai saat edit satu baris) ── */
function formBarangMasuk(data = {}) {
  const sat1 = data.satuan1 || data.satuan || 'Pcs';
  const sat2 = data.satuan2 || data.satuan || 'Pcs';
  return `<form id="modal-form">
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Tanggal</label>
        <input type="date" class="form-input" name="tanggal" value="${attrTanggal(data.tanggal).value}"${attrTanggal(data.tanggal).attrs} required />
        ${petunjukTanggal()}
      </div>
      <div class="form-group">
        <label class="form-label">Nama Supplier</label>
        <input type="text" class="form-input" name="supplier" value="${e(data.supplier || '')}" placeholder="Nama supplier" required />
      </div>
      <div class="form-group form-full">
        <label class="form-label">Nama Barang</label>
        <input type="text" class="form-input" name="nama" value="${e(data.nama || '')}" placeholder="Nama barang" required />
      </div>

      <div class="form-group">
        <label class="form-label">Jml (Besar)</label>
        <input type="number" class="form-input" name="jumlah1" value="${data.jumlah1 || data.jumlah || ''}" min="1" placeholder="0" required />
      </div>
      <div class="form-group">
        <label class="form-label">Satuan (Besar)</label>
        <select class="form-select" name="satuan1">
          ${satuanOptions(sat1)}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Jml (Kecil/Ecer)</label>
        <input type="number" class="form-input" name="jumlah2" value="${data.jumlah2 || ''}" min="0" placeholder="(Opsional)" />
      </div>
      <div class="form-group">
        <label class="form-label">Satuan (Kecil/Ecer)</label>
        <select class="form-select" name="satuan2">
          ${satuanOptions(sat2)}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Harga Modal (Total per Satuan Besar)</label>
        <input type="number" class="form-input" name="hargaModal" value="${data.hargaModal !== undefined ? data.hargaModal : ''}" placeholder="0" required />
      </div>
      <div class="form-group">
        <label class="form-label">Diskon (%) <small class="text-muted">(Opsional)</small></label>
        <input type="number" class="form-input" name="diskon" value="${data.diskon || ''}" min="0" max="100" step="0.1" placeholder="0" />
      </div>

      <div class="form-group">
        <label class="form-label">Harga Jual (Besar) <small class="text-muted">(Opsional)</small></label>
        <input type="number" class="form-input" name="hargaJual1" value="${data.hargaJual1 || data.hargaJual || ''}" placeholder="(Opsional)" />
      </div>
      <div class="form-group">
        <label class="form-label">Harga Jual (Kecil/Ecer) <small class="text-muted">(Opsional)</small></label>
        <input type="number" class="form-input" name="hargaJual2" value="${data.hargaJual2 || ''}" placeholder="(Opsional)" />
      </div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-ghost" data-aksi="tutup-modal">Batal</button>
      <button type="submit" class="btn btn-primary">${ico('save',17)} Simpan</button>
    </div>
  </form>`;
}

/* ── SATUAN options helper ── */
// Diperbarui sesuai permintaan klien: hapus Sak, Meter, Ton, Buah, Karung, Balok; tambahkan Bungkus, Roll
const SATUAN_OPTS = ['Pcs', 'Dus', 'Lusin', 'Bungkus', 'Roll', 'Batang', 'Kaleng', 'Lembar', 'Kg', 'Kotak', 'Set', 'Sat'];

document.addEventListener('change', (e) => {
  if (e.target && e.target.classList.contains('ecer-toggle')) {
    const row = e.target.closest('tr');
    if (row) {
      row.querySelectorAll('.ecer-field').forEach(el => {
        el.style.display = e.target.checked ? 'block' : 'none';
        if (!e.target.checked && el.tagName === 'INPUT') el.value = '';
      });
    }
  }
});

function satuanOptions(sel = '') {
  let opts = [...SATUAN_OPTS];
  if (sel && !opts.includes(sel)) {
    // Pertahankan satuan lama jika ada data lawas
    opts.push(sel);
  }
  return opts.map(s => `<option value="${s}" ${sel === s ? 'selected' : ''}>${s}</option>`).join('');
}

/* ── HELPER STOK DROPDOWN BARANG MASUK ── */
function stockDropdownOptionsBM(selectedNama = '') {
  const stocks = getStokToko().items
    .slice()
    .sort((a,b) => a.nama.localeCompare(b.nama, 'id', {sensitivity: 'base'}));
  let html = '';
  const isManualDefault = !selectedNama;
  html += `<option value="__MANUAL__" style="color:var(--brand);font-weight:600" ${isManualDefault ? 'selected' : ''}>+ Isi Barang Baru (Manual)</option>`;
  html += `<option value="" disabled>-- Pilih dari Master Stok --</option>`;
  if (stocks.length === 0) {
    html += '<option value="" disabled>-- Stok Kosong --</option>';
  } else {
    stocks.forEach(s => {
      const sel = selectedNama === s.nama ? 'selected' : '';
      const dataObj = encodeURIComponent(JSON.stringify(s));
      const sisaTxt = formatStock(s.stokKecil, s.konversi, s.satuan1, s.satuan2);
      html += `<option value="${s.nama}" ${sel} data-stock="${dataObj}">${s.nama} (Stok: ${sisaTxt})</option>`;
    });
  }
  return html;
}

function handleStockSelectionBM(selectEl) {
  const option = selectEl.options[selectEl.selectedIndex];
  if (!option || !option.value) return;

  if (option.value === '__MANUAL__') {
    const parent = selectEl.parentNode;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-input';
    input.style.width = '100%';
    if (selectEl.name) input.name = selectEl.name;
    if (selectEl.dataset.field) input.dataset.field = selectEl.dataset.field;
    input.placeholder = 'Ketik nama barang baru...';
    input.required = true;
    parent.replaceChild(input, selectEl);
    input.focus();
    return;
  }

  let data;
  try { data = JSON.parse(decodeURIComponent(option.dataset.stock)); }
  catch (err) { return; }

  const container = selectEl.closest('tr') || selectEl.closest('.form-grid');
  if (!container) return;

  const satuanEl     = container.querySelector('[name="satuan1"], [data-field="satuan1"], [name="satuan"]');
  const hargaModalEl = container.querySelector('[name="hargaModal"], [data-field="hargaModal"]');

  if (satuanEl && data.satuan1) {
    satuanEl.value = data.satuan1;
  }
  if (hargaModalEl && data.hargaModal !== undefined) {
    hargaModalEl.value = data.hargaModal;
  }
  if (data.hargaJual1 !== undefined || data.hargaJual !== undefined) {
    container.dataset.hargaJual = data.hargaJual1 !== undefined ? data.hargaJual1 : data.hargaJual;
  }

  if (container.tagName === 'TR') {
    const match = container.id.match(/bm-row-(\d+)/);
    if (match) bmCalcRow(match[1]);
  }
}

function bmCalcRow(rid) {
  const tr = document.getElementById(`bm-row-${rid}`);
  if (!tr) return;
  const qty = Number(tr.querySelector('[data-field="jumlah1"]')?.value || 0);
  const harga = Number(tr.querySelector('[data-field="hargaModal"]')?.value || 0);
  const diskon = Math.max(0, Math.min(100, Number(tr.querySelector('[data-field="diskon"]')?.value || 0)));
  const total = qty * harga * (1 - diskon / 100);
  const span = document.getElementById(`bm-total-${rid}`);
  if (span) span.textContent = fmt(total);

  hitungTotalGrandBM();
}

/* ========================
   FITUR COPY PASTE / TEMPEL TEKS & DRAF OTOMATIS (BARANG MASUK)
   ======================== */
function parsePastedRows(rawText) {
  if (!rawText || !rawText.trim()) return [];
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results = [];

  for (const line of lines) {
    let parts = [];
    if (line.includes('\t')) {
      parts = line.split('\t').map(s => s.trim()).filter(Boolean);
    } else if (line.includes(';')) {
      parts = line.split(';').map(s => s.trim()).filter(Boolean);
    } else if (line.includes(',')) {
      parts = line.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      parts = line.split(/\s{2,}|\s+/).map(s => s.trim()).filter(Boolean);
    }

    if (parts.length === 0) continue;

    let nama = '', jumlah = 1, satuan = 'Pcs', harga = 0, diskon = 0;

    if (parts.length >= 4) {
      nama = parts[0];
      jumlah = parseFloat(parts[1].replace(/[^0-9.]/g, '')) || 1;
      satuan = parts[2];
      harga = parseFloat(parts[3].replace(/[^0-9]/g, '')) || 0;
      if (parts.length >= 5) {
        diskon = Math.max(0, Math.min(100, parseFloat(parts[4].replace(/[^0-9.]/g, '')) || 0));
      }
    } else if (parts.length === 3) {
      nama = parts[0];
      const p1Num = parseFloat(parts[1].replace(/[^0-9.]/g, ''));
      const p2Num = parseFloat(parts[2].replace(/[^0-9]/g, ''));
      if (!isNaN(p1Num) && !isNaN(p2Num)) {
        jumlah = p1Num;
        harga = p2Num;
      } else if (!isNaN(p1Num)) {
        jumlah = p1Num;
        satuan = parts[2];
      } else {
        satuan = parts[1];
        harga = p2Num || 0;
      }
    } else if (parts.length === 2) {
      nama = parts[0];
      const p1Num = parseFloat(parts[1].replace(/[^0-9]/g, ''));
      if (p1Num > 500) {
        harga = p1Num;
      } else {
        jumlah = p1Num || 1;
      }
    } else {
      nama = parts[0];
    }

    // Normalisasi satuan ke SATUAN_OPTS
    const matched = SATUAN_OPTS.find(s => s.toLowerCase() === satuan.toLowerCase());
    if (matched) {
      satuan = matched;
    } else if (/^rol/i.test(satuan)) {
      satuan = 'Roll';
    } else if (/^bgk|^bungkus/i.test(satuan)) {
      satuan = 'Bungkus';
    } else if (/^btg|^batang/i.test(satuan)) {
      satuan = 'Batang';
    } else {
      satuan = 'Pcs';
    }

    results.push({ nama, jumlah, satuan, harga, diskon });
  }
  return results;
}

const DRAFT_KEY_BM = () => `tp_draft_bm_${currentRuteId || 'toko'}_${currentPerjalananId || 'semua'}`;

function saveDraftBM() {
  try {
    const tanggal = document.getElementById('bm-tanggal')?.value || '';
    const supplier = document.getElementById('bm-supplier')?.value || '';
    const tbody = document.getElementById('bm-rows');
    if (!tbody) return;
    const rows = [];
    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
      const nama = tr.querySelector('[data-field="nama"]')?.value || '';
      const jumlah1 = tr.querySelector('[data-field="jumlah1"]')?.value || '';
      const satuan1 = tr.querySelector('[data-field="satuan1"]')?.value || 'Pcs';
      const hargaModal = tr.querySelector('[data-field="hargaModal"]')?.value || '';
      const diskon = tr.querySelector('[data-field="diskon"]')?.value || '';
      if (nama || jumlah1 || hargaModal) {
        rows.push({ nama, jumlah1, satuan1, hargaModal, diskon });
      }
    });
    if (rows.length > 0 || supplier) {
      localStorage.setItem(DRAFT_KEY_BM(), JSON.stringify({ tanggal, supplier, rows, savedAt: Date.now() }));
    } else {
      localStorage.removeItem(DRAFT_KEY_BM());
    }
  } catch (err) {}
}

function clearDraftBM() {
  try { localStorage.removeItem(DRAFT_KEY_BM()); } catch (err) {}
}

function getDraftBM() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY_BM());
    return raw ? JSON.parse(raw) : null;
  } catch (err) { return null; }
}

function hitungTotalGrandBM() {
  const tbody = document.getElementById('bm-rows');
  if (tbody) {
    let grand = 0;
    Array.from(tbody.querySelectorAll('tr')).forEach(row => {
      const q = Number(row.querySelector('[data-field="jumlah1"]')?.value || 0);
      const h = Number(row.querySelector('[data-field="hargaModal"]')?.value || 0);
      const d = Math.max(0, Math.min(100, Number(row.querySelector('[data-field="diskon"]')?.value || 0)));
      grand += q * h * (1 - d / 100);
    });
    const gt = document.getElementById('bm-grand-total');
    if (gt) gt.textContent = fmt(grand);
  }
}

/* ── form MULTI-ITEM untuk Tambah Barang Masuk ── */
function buildMultiBarangMasukForm() {
  return `
  <div id="bm-draft-container"></div>

  <div style="margin-bottom:16px">
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Tanggal</label>
        <input type="date" class="form-input" id="bm-tanggal" value="${attrTanggal().value}"${attrTanggal().attrs} required />
        ${petunjukTanggal()}
      </div>
      <div class="form-group">
        <label class="form-label">Nama Supplier</label>
        <input type="text" class="form-input" id="bm-supplier" placeholder="Contoh: PT Semen Padang / Distributor" required />
      </div>
    </div>
  </div>

  <div style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
    <span style="font-size:13px;font-weight:700;color:var(--ink)">Daftar Barang Masuk (Modal Pembelian)</span>
    <div style="display:flex;align-items:center;gap:8px;">
      <button type="button" class="btn btn-ghost btn-sm" id="bm-btn-paste" style="color:var(--brand);font-weight:600;">
        ${ico('content_paste',16)} Tempel dari Excel / WA
      </button>
      <button type="button" class="btn btn-ghost btn-sm" id="bm-add-row">${ico('add',16)} Tambah Baris</button>
    </div>
  </div>

  <!-- Kotak Tempel / Paste Cepat -->
  <div id="bm-paste-box" style="display:none;background:var(--surface-hover);border:1.5px dashed var(--brand);border-radius:var(--r-md);padding:14px;margin-bottom:14px;">
    <div style="font-size:12.5px;font-weight:700;color:var(--ink);margin-bottom:4px;display:flex;align-items:center;gap:6px;">
      ${ico('content_paste',17)} Tempel / Paste Data Cepat dari Excel atau WhatsApp
    </div>
    <div style="font-size:11.5px;color:var(--muted);margin-bottom:8px;">
      Copy beberapa baris dari Excel / WhatsApp lalu tempel (Ctrl+V) di kotak ini. Format otomatis terdeteksi:<br>
      <code>Nama Barang [Tab atau Koma] Jumlah [Tab] Satuan [Tab] Harga Modal</code>
    </div>
    <textarea id="bm-paste-input" class="form-input" rows="4" style="width:100%;font-family:monospace;font-size:12px;margin-bottom:10px;" placeholder="Contoh format teks:&#10;Cat Samurai Campur Warna	5	Lusin	448000&#10;Kawat Hijau	20	Roll	55000&#10;Paku Seng MMK Jeruk	8	Dus	75000"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button type="button" class="btn btn-ghost btn-sm" id="bm-paste-batal">Batal</button>
      <button type="button" class="btn btn-primary btn-sm" id="bm-paste-proses">${ico('download',16)} Masukkan ke Tabel</button>
    </div>
  </div>

  <div class="bm-table-wrap">
    <table class="bm-table">
      <thead>
        <tr>
          <th style="width:33%">Nama Barang</th>
          <th style="width:10%">Jumlah</th>
          <th style="width:14%">Satuan</th>
          <th style="width:14%">Harga Modal</th>
          <th style="width:8%">Diskon (%)</th>
          <th style="width:13%">Total Modal</th>
          <th style="width:8%;text-align:center">Aksi</th>
        </tr>
      </thead>
      <tbody id="bm-rows"></tbody>
      <tfoot>
        <tr style="background:var(--surface-hover);font-weight:700;">
          <td colspan="5" style="text-align:right;padding:10px 14px;">Total Belanja Modal:</td>
          <td id="bm-grand-total" style="padding:10px 14px;color:var(--brand);font-size:14px;font-weight:800;">Rp 0</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div class="form-actions" style="margin-top:16px">
    <button type="button" class="btn btn-ghost" data-aksi="tutup-modal">Batal</button>
    <button type="button" class="btn btn-primary" id="bm-simpan">${ico('save',17)} Simpan Semua</button>
  </div>`;
}

let _bmRowCount = 0;

function bmRowHTML(idx) {
  const rid = idx;
  return `<tr id="bm-row-${rid}">
    <td>
      <select class="form-select" style="width:100%" data-field="nama" data-aksi="pilih-stok-bm" required>
        ${stockDropdownOptionsBM()}
      </select>
    </td>
    <td>
      <input type="number" class="form-input" style="width:100%" placeholder="0" min="1" data-field="jumlah1" data-aksi="hitung-baris-bm" data-rid="${rid}" required />
    </td>
    <td>
      <select class="form-select" style="width:100%" data-field="satuan1">${satuanOptions()}</select>
    </td>
    <td>
      <input type="number" class="form-input" style="width:100%" placeholder="0" min="0" data-field="hargaModal" data-aksi="hitung-baris-bm" data-rid="${rid}" required />
    </td>
    <td>
      <input type="number" class="form-input" style="width:100%" placeholder="0" min="0" max="100" step="0.1" data-field="diskon" data-aksi="hitung-baris-bm" data-rid="${rid}" title="Diskon opsional, dalam persen (%)" />
    </td>
    <td>
      <span class="bm-total" id="bm-total-${rid}" style="font-size:12px;color:var(--brand);font-weight:700">Rp 0</span>
    </td>
    <td style="text-align:center;white-space:nowrap;">
      <button type="button" class="btn btn-ghost btn-sm" data-aksi="duplikat-baris-bm" data-idx="${rid}" title="Duplikat / Salin baris ini" style="padding:4px 6px;">${ico('content_copy',15)}</button>
      <button type="button" class="btn btn-danger btn-sm" data-aksi="hapus-baris-bm" data-idx="${rid}" title="Hapus baris" style="padding:4px 6px;">${ico('delete',15)}</button>
    </td>
  </tr>`;
}

function bmAddRow() {
  _bmRowCount++;
  const tbody = document.getElementById('bm-rows');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.id = `bm-row-${_bmRowCount}`;
  tr.innerHTML = bmRowHTML(_bmRowCount).replace(/<tr[^>]*>/, '').replace(/<\/tr>/, '');
  tbody.appendChild(tr);
  const select = tr.querySelector('[data-field="nama"]');
  if (select && select.value === '__MANUAL__') {
    handleStockSelectionBM(select);
  } else if (select) {
    select.focus();
  }
  saveDraftBM();
}

function bmAddRowWithData(nama = '', jumlah = 1, satuan = 'Pcs', harga = 0, diskon = 0) {
  _bmRowCount++;
  const tbody = document.getElementById('bm-rows');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.id = `bm-row-${_bmRowCount}`;
  tr.innerHTML = bmRowHTML(_bmRowCount).replace(/<tr[^>]*>/, '').replace(/<\/tr>/, '');
  tbody.appendChild(tr);

  const selNama = tr.querySelector('[data-field="nama"]');
  if (selNama) {
    let found = false;
    if (nama) {
      for (let i = 0; i < selNama.options.length; i++) {
        if (selNama.options[i].value && selNama.options[i].value.toLowerCase() === nama.toLowerCase()) {
          selNama.selectedIndex = i;
          found = true;
          break;
        }
      }
    }
    if (!found) {
      selNama.value = '__MANUAL__';
      handleStockSelectionBM(selNama);
      const txtInp = tr.querySelector('input[data-field="nama"]');
      if (txtInp && nama) txtInp.value = nama;
    }
  }

  const inpJml = tr.querySelector('[data-field="jumlah1"]');
  if (inpJml && jumlah) inpJml.value = jumlah;

  const selSat = tr.querySelector('[data-field="satuan1"]');
  if (selSat && satuan) selSat.value = satuan;

  const inpHrg = tr.querySelector('[data-field="hargaModal"]');
  if (inpHrg && harga !== undefined) inpHrg.value = harga;

  const inpDiskon = tr.querySelector('[data-field="diskon"]');
  const clampedDiskon = Math.max(0, Math.min(100, Number(diskon) || 0));
  if (inpDiskon && clampedDiskon) inpDiskon.value = clampedDiskon;

  const spTotal = tr.querySelector('.bm-total');
  if (spTotal) spTotal.textContent = fmt((Number(jumlah) || 0) * (Number(harga) || 0) * (1 - clampedDiskon / 100));
}

function bmDuplicateRow(idx) {
  const row = document.getElementById(`bm-row-${idx}`);
  if (!row) return;
  const nama = row.querySelector('[data-field="nama"]')?.value || '';
  const jumlah1 = row.querySelector('[data-field="jumlah1"]')?.value || '1';
  const satuan1 = row.querySelector('[data-field="satuan1"]')?.value || 'Pcs';
  const hargaModal = row.querySelector('[data-field="hargaModal"]')?.value || '0';
  const diskon = row.querySelector('[data-field="diskon"]')?.value || '0';
  bmAddRowWithData(nama, jumlah1, satuan1, hargaModal, diskon);
  hitungTotalGrandBM();
  saveDraftBM();
  showToast('Baris berhasil diduplikat!', 'success');
}

function bmRemoveRow(idx) {
  const row = document.getElementById(`bm-row-${idx}`);
  const tbody = document.getElementById('bm-rows');
  if (row && tbody && tbody.rows.length > 1) {
    row.remove();
    hitungTotalGrandBM();
    saveDraftBM();
  } else if (tbody && tbody.rows.length === 1) {
    showToast('Minimal harus ada 1 baris barang.', 'error');
  }
}

function openMultiBarangMasukModal() {
  _bmRowCount = 0;
  setLebarModal('920px');
  const ruteObj = currentRuteId ? store.ruteList.find(r => r.id === currentRuteId) : null;
  const pjObj = currentPerjalananId ? store.perjalananList.find(p => p.id === currentPerjalananId) : null;
  const judulSub = ruteObj ? `Rute ${e(ruteObj.nama)}${pjObj ? ` — ${perjalananLabel(pjObj)}` : ''}` : 'Toko Utama';
  openModal(`Tambah Barang Masuk (${judulSub})`, buildMultiBarangMasukForm(), null);

  // Periksa apakah ada draf yang belum tersimpan
  const savedDraft = getDraftBM();
  if (savedDraft && savedDraft.rows && savedDraft.rows.length > 0) {
    const dCont = document.getElementById('bm-draft-container');
    if (dCont) {
      dCont.innerHTML = `
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:var(--r-md);padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="font-size:12.5px;color:#92400e;display:flex;align-items:center;gap:8px;">
            ${ico('history',18)}
            <span><b>Draf Ditemukan (${savedDraft.rows.length} barang).</b> Ketikan Anda otomatis dipulihkan agar tidak hilang saat jendela tertutup.</span>
          </div>
          <button type="button" class="btn btn-sm btn-ghost" id="bm-clear-draft-btn" style="color:#b45309;font-weight:700;font-size:12px;">Buang Draf</button>
        </div>
      `;
      document.getElementById('bm-clear-draft-btn')?.addEventListener('click', () => {
        clearDraftBM();
        dCont.innerHTML = '';
        const tb = document.getElementById('bm-rows');
        if (tb) tb.innerHTML = '';
        _bmRowCount = 0;
        bmAddRow();
        hitungTotalGrandBM();
        showToast('Draf dibuang.', 'info');
      });
    }
    if (savedDraft.supplier) {
      const supEl = document.getElementById('bm-supplier');
      if (supEl) supEl.value = savedDraft.supplier;
    }
    if (savedDraft.tanggal) {
      const tglEl = document.getElementById('bm-tanggal');
      if (tglEl) tglEl.value = savedDraft.tanggal;
    }
    savedDraft.rows.forEach(r => {
      bmAddRowWithData(r.nama, r.jumlah1, r.satuan1, r.hargaModal, r.diskon || 0);
    });
    hitungTotalGrandBM();
  } else {
    bmAddRow();
  }

  document.getElementById('bm-add-row').addEventListener('click', bmAddRow);

  // Fitur Tempel / Paste dari Excel atau WA
  const btnPaste = document.getElementById('bm-btn-paste');
  const pasteBox = document.getElementById('bm-paste-box');
  const btnPasteBatal = document.getElementById('bm-paste-batal');
  const btnPasteProses = document.getElementById('bm-paste-proses');

  if (btnPaste && pasteBox) {
    btnPaste.addEventListener('click', () => {
      pasteBox.style.display = pasteBox.style.display === 'none' ? 'block' : 'none';
      if (pasteBox.style.display === 'block') {
        document.getElementById('bm-paste-input')?.focus();
      }
    });
    btnPasteBatal?.addEventListener('click', () => {
      pasteBox.style.display = 'none';
    });
    btnPasteProses?.addEventListener('click', () => {
      const text = document.getElementById('bm-paste-input')?.value || '';
      const parsed = parsePastedRows(text);
      if (!parsed.length) {
        showToast('Format teks belum dikenali. Pastikan ada nama barang!', 'error');
        return;
      }
      parsed.forEach(item => {
        bmAddRowWithData(item.nama, item.jumlah, item.satuan, item.harga, item.diskon || 0);
      });
      document.getElementById('bm-paste-input').value = '';
      pasteBox.style.display = 'none';
      hitungTotalGrandBM();
      saveDraftBM();
      showToast(`${parsed.length} baris barang berhasil ditambahkan!`, 'success');
    });
  }

  // Auto-save draft saat ada perubahan ketikan di modal
  const formBox = modalBody.querySelector('.bm-table-wrap')?.parentNode;
  if (formBox) {
    formBox.addEventListener('input', () => {
      saveDraftBM();
    });
    formBox.addEventListener('change', () => {
      saveDraftBM();
    });
  }

  document.getElementById('bm-simpan').addEventListener('click', () => {
    const tanggal  = document.getElementById('bm-tanggal').value.trim();
    const salahTgl = tanggalDiLuarGrup(tanggal);
    if (salahTgl) { showToast(salahTgl, 'error'); return; }
    const supplier = document.getElementById('bm-supplier').value.trim();

    if (!tanggal) { showToast('Tanggal wajib diisi!', 'error'); return; }
    if (!supplier) { showToast('Nama supplier wajib diisi!', 'error'); return; }
    // Validasi: jika sedang di halaman rute, perjalanan harus dipilih dulu
    if (currentRuteId && !currentPerjalananId) {
      showToast('Pilih perjalanan terlebih dahulu sebelum menyimpan', 'error');
      return;
    }

    const tbody = document.getElementById('bm-rows');
    const rows  = Array.from(tbody.querySelectorAll('tr'));
    const items = [];
    let hasError = false;

    rows.forEach((tr) => {
      const namaEl = tr.querySelector('[data-field="nama"]');
      const nama = namaEl ? namaEl.value.trim() : '';
      const jumlah1 = Number(tr.querySelector('[data-field="jumlah1"]')?.value || 0);
      const satuan1 = tr.querySelector('[data-field="satuan1"]')?.value || 'Pcs';
      const hargaModalVal = tr.querySelector('[data-field="hargaModal"]')?.value;
      const hargaModal = Number(hargaModalVal || 0);
      const diskon = Math.max(0, Math.min(100, Number(tr.querySelector('[data-field="diskon"]')?.value || 0)));
      const hargaJual1 = Number(tr.dataset.hargaJual || 0);

      if (!nama || !jumlah1 || hargaModalVal === undefined || hargaModalVal === '' || isNaN(hargaModal)) {
        tr.style.outline = '2px solid var(--red)';
        hasError = true;
        return;
      }
      tr.style.outline = '';
      items.push({
        id: uid(),
        ruteId: currentRuteId || null,
        perjalananId: currentPerjalananId || null,
        tanggal,
        supplier,
        nama,
        jumlah: jumlah1,
        jumlah1: jumlah1,
        satuan: satuan1,
        satuan1: satuan1,
        hargaModal,
        diskon: diskon || 0,
        hargaJual: hargaJual1,
        hargaJual1: hargaJual1
      });
    });

    if (hasError) { showToast('Lengkapi nama barang, jumlah, dan harga modal pada semua baris!', 'error'); return; }
    if (!items.length) { showToast('Tidak ada barang untuk disimpan.', 'error'); return; }

    store.barangMasuk.push(...items);
    saveStore();
    clearDraftBM(); // Hapus draf setelah berhasil disimpan
    closeModal();
    refreshAfterListChange('barangMasuk');
    showToast(`${items.length} barang dari ${e(supplier)} berhasil disimpan!`, 'success');
  });
}

function formBarangTerjual(data = {}) {
  return `<form id="modal-form">
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Tanggal</label>
        <input type="date" class="form-input" name="tanggal" value="${attrTanggal(data.tanggal).value}"${attrTanggal(data.tanggal).attrs} required />
        ${petunjukTanggal()}
      </div>
      <div class="form-group">
        <label class="form-label">Nama Pelanggan / Proyek</label>
        <input type="text" class="form-input" name="pelanggan" value="${e(data.pelanggan || '')}" placeholder="Nama pelanggan" required />
      </div>
      <div class="form-group form-full">
        <label class="form-label">No PM / Faktur</label>
        <input type="text" class="form-input" name="noFaktur" value="${e(data.noFaktur || '')}" placeholder="Misal: 0829" />
      </div>
      <div class="form-group form-full">
        <label class="form-label">Nama Barang (Dari Stok)</label>
        <select class="form-select" name="nama" data-aksi="pilih-stok" required>
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
          ${['Kotak','Set'].map(s =>
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
      <button type="button" class="btn btn-ghost" data-aksi="tutup-modal">Batal</button>
      <button type="submit" class="btn btn-primary">${ico('save',17)} Simpan</button>
    </div>
  </form>`;
}

function formPiutang(data = {}) {
  return `<form id="modal-form">
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Tanggal</label>
        <input type="date" class="form-input" name="tanggal" value="${attrTanggal(data.tanggal).value}"${attrTanggal(data.tanggal).attrs} required />
        ${petunjukTanggal()}
      </div>
      <div class="form-group">
        <label class="form-label">Nama Toko</label>
        <input type="text" class="form-input" name="nama" value="${e(data.nama || '')}" placeholder="Nama Toko" required />
      </div>
      <div class="form-group form-full">
        <label class="form-label">No Faktur</label>
        <input type="text" class="form-input" name="noFaktur" value="${e(data.noFaktur || '')}" placeholder="Misal: PM - 0469" required />
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
      <button type="button" class="btn btn-ghost" data-aksi="tutup-modal">Batal</button>
      <button type="submit" class="btn btn-primary">${ico('save',17)} Simpan</button>
    </div>
  </form>`;
}

function formRekapPiutang(data = {}) {
  return `<form id="modal-form">
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Tanggal</label>
        <input type="date" class="form-input" name="tanggal" value="${attrTanggal(data.tanggal).value}"${attrTanggal(data.tanggal).attrs} required />
        ${petunjukTanggal()}
      </div>
      <div class="form-group">
        <label class="form-label">Nama Toko</label>
        <input type="text" class="form-input" name="nama" value="${e(data.nama || '')}" placeholder="Nama Toko" required />
      </div>
      <div class="form-group form-full">
        <label class="form-label">No Faktur</label>
        <input type="text" class="form-input" name="noFaktur" value="${e(data.noFaktur || '')}" placeholder="Misal: PM - 0469" required />
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
      <button type="button" class="btn btn-ghost" data-aksi="tutup-modal">Batal</button>
      <button type="submit" class="btn btn-primary">${ico('save',17)} Simpan</button>
    </div>
  </form>`;
}

function formUtang(data = {}) {
  return `<form id="modal-form">
    <div class="form-group form-full">
      <label class="form-label">Tanggal</label>
      <input type="date" class="form-input" name="tanggal" value="${attrTanggal(data.tanggal).value}"${attrTanggal(data.tanggal).attrs} required />
        ${petunjukTanggal()}
    </div>
    <div class="form-group form-full">
      <label class="form-label">Keterangan</label>
      <input type="text" class="form-input" name="keterangan" value="${e(data.keterangan || '')}" placeholder="Keterangan" required />
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
      <button type="button" class="btn btn-ghost" data-aksi="tutup-modal">Batal</button>
      <button type="submit" class="btn btn-primary">${ico('save',17)} Simpan</button>
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
        <input type="date" class="form-input" name="tanggal" value="${attrTanggal(data.tanggal).value}"${attrTanggal(data.tanggal).attrs} required />
        ${petunjukTanggal()}
      </div>
      ${rows.join('')}
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-aksi="tutup-modal">Batal</button>
        <button type="submit" class="btn btn-primary">${ico('save',17)} Simpan</button>
      </div>
    </form>`;
  };
}

/* ========================
   MULTI-ITEM BARANG TERJUAL (DRAF & PASTE OTOMATIS)
   ======================== */
const DRAFT_KEY_BT = () => `tp_draft_bt_${currentRuteId || 'toko'}_${currentPerjalananId || 'semua'}`;

function saveDraftBT() {
  try {
    const tanggal = document.getElementById('bt-tanggal')?.value || '';
    const pelanggan = document.getElementById('bt-pelanggan')?.value || '';
    const noFaktur = document.getElementById('bt-nofaktur')?.value || '';
    const tbody = document.getElementById('bt-rows');
    if (!tbody) return;
    const rows = [];
    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
      const nama = tr.querySelector('[data-field="nama"]')?.value || '';
      const jumlah = tr.querySelector('[data-field="jumlah"]')?.value || '';
      const satuan = tr.querySelector('[data-field="satuan"]')?.value || 'Pcs';
      const hargaJual = tr.querySelector('[data-field="hargaJual"]')?.value || '';
      if (nama || jumlah || hargaJual) {
        rows.push({ nama, jumlah, satuan, hargaJual });
      }
    });
    if (rows.length > 0 || pelanggan) {
      localStorage.setItem(DRAFT_KEY_BT(), JSON.stringify({ tanggal, pelanggan, noFaktur, rows, savedAt: Date.now() }));
    } else {
      localStorage.removeItem(DRAFT_KEY_BT());
    }
  } catch (err) {}
}

function clearDraftBT() {
  try { localStorage.removeItem(DRAFT_KEY_BT()); } catch (err) {}
}

function getDraftBT() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY_BT());
    return raw ? JSON.parse(raw) : null;
  } catch (err) { return null; }
}

function buildMultiBarangTerjualForm() {
  return `
  <div id="bt-draft-container"></div>

  <div style="margin-bottom:16px">
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Tanggal</label>
        <input type="date" class="form-input" id="bt-tanggal" value="${attrTanggal().value}"${attrTanggal().attrs} required />
        ${petunjukTanggal()}
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

  <div style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
    <span style="font-size:13px;font-weight:700;color:var(--ink)">Daftar Barang Terjual</span>
    <div style="display:flex;align-items:center;gap:8px;">
      <button type="button" class="btn btn-ghost btn-sm" id="bt-btn-paste" style="color:var(--brand);font-weight:600;">
        ${ico('content_paste',16)} Tempel dari Excel / WA
      </button>
      <button type="button" class="btn btn-ghost btn-sm" id="bt-add-row">${ico('add',16)} Tambah Baris</button>
    </div>
  </div>

  <!-- Kotak Tempel Cepat BT -->
  <div id="bt-paste-box" style="display:none;background:var(--surface-hover);border:1.5px dashed var(--brand);border-radius:var(--r-md);padding:14px;margin-bottom:14px;">
    <div style="font-size:12.5px;font-weight:700;color:var(--ink);margin-bottom:4px;display:flex;align-items:center;gap:6px;">
      ${ico('content_paste',17)} Tempel / Paste Data Cepat dari Excel atau WhatsApp
    </div>
    <div style="font-size:11.5px;color:var(--muted);margin-bottom:8px;">
      Copy baris dari Excel / WhatsApp lalu tempel (Ctrl+V) di sini. Format otomatis terdeteksi:<br>
      <code>Nama Barang [Tab atau Koma] Qty [Tab] Satuan [Tab] Harga Jual</code>
    </div>
    <textarea id="bt-paste-input" class="form-input" rows="4" style="width:100%;font-family:monospace;font-size:12px;margin-bottom:10px;" placeholder="Contoh:&#10;Kawat Hijau	15	Roll	70000&#10;Cat Samurai Campur Warna	4	Lusin	550000"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button type="button" class="btn btn-ghost btn-sm" id="bt-paste-batal">Batal</button>
      <button type="button" class="btn btn-primary btn-sm" id="bt-paste-proses">${ico('download',16)} Masukkan ke Tabel</button>
    </div>
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
          <th style="width:8%;text-align:center">Aksi</th>
        </tr>
      </thead>
      <tbody id="bt-rows"></tbody>
    </table>
  </div>

  <div class="form-actions" style="margin-top:16px">
    <button type="button" class="btn btn-ghost" data-aksi="tutup-modal">Batal</button>
    <button type="button" class="btn btn-primary" id="bt-simpan">${ico('save',17)} Simpan Semua</button>
  </div>`;
}

let _btRowCount = 0;

function btRowHTML(idx) {
  const rid = idx;
  return `<tr id="bt-row-${rid}">
    <td>
      <select class="form-select" style="width:100%" data-field="nama" data-aksi="pilih-stok" required>
        ${stockDropdownOptions()}
      </select>
    </td>
    <td><input type="number" class="form-input" style="width:100%" placeholder="0" min="1" data-field="jumlah" data-aksi="hitung-baris-bt" data-rid="${rid}" /></td>
    <td><select class="form-select" style="width:100%" data-field="satuan">${satuanOptions()}</select></td>
    <td><input type="number" class="form-input" style="width:100%" placeholder="0" min="0" data-field="hargaJual" data-aksi="hitung-baris-bt" data-rid="${rid}" /></td>
    <td><span class="bt-total" id="bt-total-${rid}" style="font-size:12px;color:var(--green);font-weight:700">Rp 0</span></td>
    <td style="text-align:center;white-space:nowrap;">
      <button type="button" class="btn btn-ghost btn-sm" data-aksi="duplikat-baris-bt" data-rid="${rid}" title="Duplikat baris" style="padding:4px 6px;">${ico('content_copy',15)}</button>
      <button type="button" class="btn btn-danger btn-sm" data-aksi="hapus-baris-bt" data-rid="${rid}" title="Hapus baris" style="padding:4px 6px;">${ico('delete',15)}</button>
    </td>
  </tr>`;
}

function btAddRow() {
  _btRowCount++;
  const tbody = document.getElementById('bt-rows');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.id = `bt-row-${_btRowCount}`;
  const rid = _btRowCount;
  tr.innerHTML = btRowHTML(rid).replace(/<tr[^>]*>/, '').replace(/<\/tr>/, '');
  tbody.appendChild(tr);
  const select = tr.querySelector('[data-field="nama"]');
  if (select && select.value === '__MANUAL__') {
    handleStockSelection(select);
  } else if (select) {
    select.focus();
  }
  saveDraftBT();
}

function btAddRowWithData(nama = '', jumlah = 1, satuan = 'Pcs', harga = 0) {
  _btRowCount++;
  const tbody = document.getElementById('bt-rows');
  if (!tbody) return;
  const tr = document.createElement('tr');
  const rid = _btRowCount;
  tr.id = `bt-row-${rid}`;
  tr.innerHTML = btRowHTML(rid).replace(/<tr[^>]*>/, '').replace(/<\/tr>/, '');
  tbody.appendChild(tr);

  const selNama = tr.querySelector('[data-field="nama"]');
  if (selNama) {
    let found = false;
    if (nama) {
      for (let i = 0; i < selNama.options.length; i++) {
        if (selNama.options[i].value && selNama.options[i].value.toLowerCase() === nama.toLowerCase()) {
          selNama.selectedIndex = i;
          found = true;
          break;
        }
      }
    }
    if (!found) {
      selNama.value = '__MANUAL__';
      handleStockSelection(selNama);
      const txtInp = tr.querySelector('input[data-field="nama"]');
      if (txtInp && nama) txtInp.value = nama;
    }
  }

  const inpJml = tr.querySelector('[data-field="jumlah"]');
  if (inpJml && jumlah) inpJml.value = jumlah;

  const selSat = tr.querySelector('[data-field="satuan"]');
  if (selSat && satuan) selSat.value = satuan;

  const inpHrg = tr.querySelector('[data-field="hargaJual"]');
  if (inpHrg && harga !== undefined) inpHrg.value = harga;

  const spTotal = tr.querySelector('.bt-total');
  if (spTotal) spTotal.textContent = fmt((Number(jumlah) || 0) * (Number(harga) || 0));
}

function btDuplicateRow(idx) {
  const row = document.getElementById(`bt-row-${idx}`);
  if (!row) return;
  const nama = row.querySelector('[data-field="nama"]')?.value || '';
  const jumlah = row.querySelector('[data-field="jumlah"]')?.value || '1';
  const satuan = row.querySelector('[data-field="satuan"]')?.value || 'Pcs';
  const hargaJual = row.querySelector('[data-field="hargaJual"]')?.value || '0';
  btAddRowWithData(nama, jumlah, satuan, hargaJual);
  saveDraftBT();
  showToast('Baris berhasil diduplikat!', 'success');
}

function btCalcRow(idx) {
  const tr  = document.getElementById(`bt-row-${idx}`);
  if (!tr) return;
  const qty   = Number(tr.querySelector('[data-field="jumlah"]').value) || 0;
  const harga = Number(tr.querySelector('[data-field="hargaJual"]').value) || 0;
  const span  = document.getElementById(`bt-total-${idx}`);
  if (span) span.textContent = fmt(qty * harga);
}

function btRemoveRow(idx) {
  const row   = document.getElementById(`bt-row-${idx}`);
  const tbody = document.getElementById('bt-rows');
  if (row && tbody && tbody.rows.length > 1) {
    row.remove();
    saveDraftBT();
  } else {
    showToast('Minimal harus ada 1 baris barang.', 'error');
  }
}

function handleStockSelection(selectEl) {
  const option = selectEl.options[selectEl.selectedIndex];
  if (!option || !option.value) return;

  if (option.value === '__MANUAL__') {
    const parent = selectEl.parentNode;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-input';
    input.style.width = '100%';
    if (selectEl.name) input.name = selectEl.name;
    if (selectEl.dataset.field) input.dataset.field = selectEl.dataset.field;
    input.placeholder = 'Ketik nama barang...';
    input.required = true;
    parent.replaceChild(input, selectEl);
    input.focus();

    const container = input.closest('tr') || input.closest('.form-grid');
    if (container) {
      const satuanEl = container.querySelector('[name="satuan"], [data-field="satuan"]');
      if (satuanEl) {
        satuanEl.innerHTML = satuanOptions();
        satuanEl.onchange = null;
      }
      const hargaEl = container.querySelector('[name="hargaJual"], [data-field="hargaJual"]');
      if (hargaEl) hargaEl.value = '';
    }
    return;
  }

  let data;
  try { data = JSON.parse(decodeURIComponent(option.dataset.stock)); }
  catch (err) { return; }

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

function openMultiBarangTerjualModal() {
  _btRowCount = 0;
  setLebarModal('880px');
  openModal('Tambah Barang Terjual', buildMultiBarangTerjualForm(), null);

  // Periksa draf Barang Terjual
  const savedDraft = getDraftBT();
  if (savedDraft && savedDraft.rows && savedDraft.rows.length > 0) {
    const dCont = document.getElementById('bt-draft-container');
    if (dCont) {
      dCont.innerHTML = `
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:var(--r-md);padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="font-size:12.5px;color:#92400e;display:flex;align-items:center;gap:8px;">
            ${ico('history',18)}
            <span><b>Draf Ditemukan (${savedDraft.rows.length} barang).</b> Ketikan penjualan dipulihkan otomatis agar tidak hilang.</span>
          </div>
          <button type="button" class="btn btn-sm btn-ghost" id="bt-clear-draft-btn" style="color:#b45309;font-weight:700;font-size:12px;">Buang Draf</button>
        </div>
      `;
      document.getElementById('bt-clear-draft-btn')?.addEventListener('click', () => {
        clearDraftBT();
        dCont.innerHTML = '';
        const tb = document.getElementById('bt-rows');
        if (tb) tb.innerHTML = '';
        _btRowCount = 0;
        btAddRow();
        showToast('Draf dibuang.', 'info');
      });
    }
    if (savedDraft.pelanggan) {
      const pelEl = document.getElementById('bt-pelanggan');
      if (pelEl) pelEl.value = savedDraft.pelanggan;
    }
    if (savedDraft.noFaktur) {
      const fakEl = document.getElementById('bt-nofaktur');
      if (fakEl) fakEl.value = savedDraft.noFaktur;
    }
    if (savedDraft.tanggal) {
      const tglEl = document.getElementById('bt-tanggal');
      if (tglEl) tglEl.value = savedDraft.tanggal;
    }
    savedDraft.rows.forEach(r => {
      btAddRowWithData(r.nama, r.jumlah, r.satuan, r.hargaJual);
    });
  } else {
    btAddRow();
  }

  document.getElementById('bt-add-row').addEventListener('click', btAddRow);

  // Paste cepat BT
  const btnPaste = document.getElementById('bt-btn-paste');
  const pasteBox = document.getElementById('bt-paste-box');
  const btnPasteBatal = document.getElementById('bt-paste-batal');
  const btnPasteProses = document.getElementById('bt-paste-proses');

  if (btnPaste && pasteBox) {
    btnPaste.addEventListener('click', () => {
      pasteBox.style.display = pasteBox.style.display === 'none' ? 'block' : 'none';
      if (pasteBox.style.display === 'block') {
        document.getElementById('bt-paste-input')?.focus();
      }
    });
    btnPasteBatal?.addEventListener('click', () => {
      pasteBox.style.display = 'none';
    });
    btnPasteProses?.addEventListener('click', () => {
      const text = document.getElementById('bt-paste-input')?.value || '';
      const parsed = parsePastedRows(text);
      if (!parsed.length) {
        showToast('Format teks belum dikenali. Pastikan ada nama barang!', 'error');
        return;
      }
      parsed.forEach(item => {
        btAddRowWithData(item.nama, item.jumlah, item.satuan, item.harga);
      });
      document.getElementById('bt-paste-input').value = '';
      pasteBox.style.display = 'none';
      saveDraftBT();
      showToast(`${parsed.length} baris barang berhasil ditambahkan!`, 'success');
    });
  }

  // Live save draft
  const formBox = modalBody.querySelector('.bm-table-wrap')?.parentNode;
  if (formBox) {
    formBox.addEventListener('input', () => { saveDraftBT(); });
    formBox.addEventListener('change', () => { saveDraftBT(); });
  }

  document.getElementById('bt-simpan').addEventListener('click', () => {
    const tanggal   = document.getElementById('bt-tanggal').value.trim();
    const salahTgl  = tanggalDiLuarGrup(tanggal);
    if (salahTgl) { showToast(salahTgl, 'error'); return; }
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
    clearDraftBT(); // Hapus draf setelah berhasil disimpan
    closeModal();
    refreshAfterListChange('barangTerjual');
    showToast(`${items.length} barang terjual ke ${e(pelanggan)} berhasil disimpan!`, 'success');
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
    const salahTgl = tanggalDiLuarGrup(fd.tanggal);
    if (salahTgl) { showToast(salahTgl, 'error'); return false; }
    const NUM_FIELDS = ['jumlah','hargaModal','diskon','hargaJual','hargaJual1','hargaJual2','jumlah1','jumlah2'];
    NUM_FIELDS.forEach(f => { if (fd[f] !== undefined && fd[f] !== '') fd[f] = Number(fd[f]); });
    if (fd.diskon === '') fd.diskon = 0;
    if (fd.diskon !== undefined) fd.diskon = Math.max(0, Math.min(100, Number(fd.diskon || 0)));
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
  openModal( `Edit ${cfg.title}`, cfg.formFn(item), (form) => {
    const fd = Object.fromEntries(new FormData(form));
    const salahTgl = tanggalDiLuarGrup(fd.tanggal);
    if (salahTgl) { showToast(salahTgl, 'error'); return false; }
    const NUM_FIELDS = ['jumlah','hargaModal','diskon','hargaJual','hargaJual1','hargaJual2','jumlah1','jumlah2'];
    NUM_FIELDS.forEach(f => { if (fd[f] !== undefined && fd[f] !== '') fd[f] = Number(fd[f]); });
    if (fd.diskon === '') fd.diskon = 0;
    if (fd.diskon !== undefined) fd.diskon = Math.max(0, Math.min(100, Number(fd.diskon || 0)));
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
      <p style="margin-bottom:20px;font-size:15px;color:var(--ink-variant)">Yakin ingin menghapus data ini? Tindakan ini tidak dapat dibatalkan.</p>
      <div style="display:flex;justify-content:center;gap:12px">
        <button type="button" class="btn btn-ghost" data-aksi="tutup-modal">Batal</button>
        <button type="button" class="btn btn-danger" id="btn-confirm-del">Ya, Hapus</button>
      </div>
    </div>
  `;
  setLebarModal('400px');
  openModal('Konfirmasi Hapus', html, null);

  document.getElementById('btn-confirm-del').addEventListener('click', () => {
    store[key] = store[key].filter(x => x.id !== id);
    if (key === 'ruteList') renderRuteSidebar();
    saveStore();
    closeModal();
    refreshAfterListChange(key);
    showToast('Data berhasil dihapus.', 'info');
  });
}

/* ========================
   STOK TOKO
   ======================== */
function getStokToko() {
  const map = {};
  
  store.stokToko.forEach(b => {
    const key = b.nama;
    if (!map[key]) {
      map[key] = {
        id: b.id,
        nama: b.nama,
        satuan1: b.satuan,
        satuan2: b.satuan,
        konversi: 1,
        stokKecil: Number(b.jumlah || 0),
        hargaModal: Number(b.hargaModal || 0),
        hargaJual1: Number(b.hargaJual || 0),
        hargaJual2: Number(b.hargaJual || 0),
        supplier: ''
      };
    } else {
      map[key].stokKecil += Number(b.jumlah || 0);
    }
  });

  store.barangTerjual.forEach(b => {
    const key = b.nama;
    if (map[key]) {
      map[key].stokKecil -= Number(b.jumlah || 0);
    }
  });

  const items = Object.values(map).sort((a, b) =>
    a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' })
  );

  const totalModal = items.reduce((s,x) => s + x.stokKecil * x.hargaModal, 0);
  const totalJual  = items.reduce((s,x) => s + x.stokKecil * x.hargaJual1, 0);

  return { items, totalModal, totalJual };
}

function stokStatus(item) {
  if (item.stokKecil <= 0) return { label: 'Habis',   cls: 'badge-red',    baris: 'is-habis',   grup: 'Habis' };
  if (item.stokKecil <= 5) return { label: 'Menipis', cls: 'badge-orange', baris: 'is-menipis', grup: 'Stok Menipis' };
  return { label: 'Aman', cls: 'badge-green', baris: '', grup: 'Stok Aman' };
}

function stokRowHtml(item) {
  const qtyBesar   = item.stokKecil / item.konversi;
  const sisaTxt    = formatStock(item.stokKecil, item.konversi, item.satuan1, item.satuan2);
  const nilaiModal = qtyBesar * item.hargaModal;
  const nilaiJual  = qtyBesar * item.hargaJual1;
  const untung     = nilaiJual - nilaiModal;
  const status     = stokStatus(item);
  return `
  <tr class="stok-baris ${status.baris}">
    <td>
      <div class="stok-item">
        <span class="stok-ikon">${ico('inventory_2',18)}</span>
        <span class="stok-item-teks">
          <span class="stok-nama">${e(item.nama)}</span>
          <span class="stok-sub">Satuan: ${e(item.satuan1)}${item.satuan2 && item.satuan2 !== item.satuan1 ? ' / ' + e(item.satuan2) : ''}</span>
        </span>
      </div>
    </td>
    <td>
      <strong>${sisaTxt}</strong>
      <span class="badge ${status.cls}" style="margin-left:8px;">${e(status.label)}</span>
    </td>
    <td>${fmt(item.hargaModal)} <small class="text-muted">/ ${e(item.satuan1)}</small></td>
    <td>${fmt(item.hargaJual1)} <small class="text-muted">/ ${e(item.satuan1)}</small></td>
    <td>${fmt(nilaiModal)}</td>
    <td class="${untung >= 0 ? 'amount-positive' : 'amount-negative'}">${fmt(untung)}</td>
    <td class="no-print" style="text-align:right">
      <button class="btn btn-ghost btn-sm" data-aksi="edit-stok" data-nama="${e(item.nama)}" title="Edit stok">${ico('edit',16)}</button>
      <button class="btn btn-danger btn-sm" data-aksi="hapus-stok" data-nama="${e(item.nama)}" title="Hapus seluruh riwayat barang ini">${ico('delete',16)}</button>
    </td>
  </tr>`;
}

function sortStokItems(items, sortBy) {
  const list = items.slice();
  if (sortBy === 'stok-terendah') list.sort((a, b) => (a.stokKecil / a.konversi) - (b.stokKecil / b.konversi));
  else if (sortBy === 'modal-tertinggi') list.sort((a, b) => (b.stokKecil / b.konversi) * b.hargaModal - (a.stokKecil / a.konversi) * a.hargaModal);
  else list.sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
  return list;
}

/* Kelompok baris stok.
   Aplikasi ini tidak menyimpan kategori barang, jadi pengelompokannya memakai
   data yang memang ada: status ketersediaan atau supplier terakhir. */
function kelompokStok(items, mode) {
  if (mode === 'tanpa') return [{ judul: '', rows: items }];

  const peta = new Map();
  items.forEach(x => {
    const k = mode === 'supplier'
      ? (x.supplier || '(Tanpa supplier)')
      : stokStatus(x).grup;
    if (!peta.has(k)) peta.set(k, []);
    peta.get(k).push(x);
  });

  let kunci = [...peta.keys()];
  if (mode === 'status') {
    const urut = ['Habis', 'Stok Menipis', 'Stok Aman'];
    kunci.sort((a, b) => urut.indexOf(a) - urut.indexOf(b));
  } else {
    kunci.sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }));
  }
  return kunci.map(k => ({ judul: k, rows: peta.get(k) }));
}

const STOK_PER_HALAMAN = 25;

function hapusStok(nama) {
  if (!confirm(`Yakin ingin menghapus seluruh riwayat barang "${e(nama)}" dari sistem?\nSemua riwayat pembelian dan penjualan barang ini akan hilang.`)) return;
  store.stokToko = store.stokToko.filter(b => b.nama !== nama);
  store.barangTerjual = store.barangTerjual.filter(b => b.nama !== nama);
  saveStore();
  renderStok();
  showToast(`Semua riwayat stok "${e(nama)}" berhasil dihapus.`, 'success');
}

function editStokModal(nama) {
  const stokMap = getStokToko().items;
  const item = stokMap.find(x => x.nama === nama);
  if (!item) return;

  const qtyFisik = item.stokKecil;
  
  const html = `<form id="modal-form">
    <div class="form-grid">
      <div class="form-group form-full">
        <label class="form-label">Nama Barang</label>
        <input type="text" class="form-input" name="namaBaru" value="${e(item.nama)}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Sisa Fisik Stok (Jml)</label>
        <input type="number" step="0.01" class="form-input" name="sisaBaru" value="${qtyFisik}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Satuan Utama</label>
        <select class="form-select" name="satuanBaru">${satuanOptions(item.satuan1)}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Harga Modal (Total per Satuan)</label>
        <input type="number" class="form-input" name="modalBaru" value="${item.hargaModal}" min="0" required />
      </div>
      <div class="form-group">
        <label class="form-label">Harga Jual (per Satuan)</label>
        <input type="number" class="form-input" name="jualBaru" value="${item.hargaJual1}" min="0" required />
      </div>
    </div>
    <div class="form-actions" style="margin-top:20px">
      <button type="button" class="btn btn-ghost" data-aksi="tutup-modal">Batal</button>
      <button type="submit" class="btn btn-primary">${ico('save',17)} Simpan Perubahan</button>
    </div>
  </form>`;

  openModal('Edit Stok & Harga', html, (form) => {
    const data = Object.fromEntries(new FormData(form).entries());
    const newNama = data.namaBaru.trim();
    if (!newNama) { showToast('Nama tidak boleh kosong.', 'error'); return; }

    const tItem = store.stokToko.find(b => b.nama === nama);
    if (!tItem) return;

    if (newNama !== nama) {
      store.stokToko.forEach(b => { if (b.nama === nama) b.nama = newNama; });
      store.barangTerjual.forEach(b => { if (b.nama === nama) b.nama = newNama; });
    }

    tItem.hargaModal = Number(data.modalBaru);
    tItem.hargaJual = Number(data.jualBaru);
    tItem.satuan = data.satuanBaru;
    
    const terjualSum = store.barangTerjual.reduce((s, x) => x.nama === newNama ? s + Number(x.jumlah||0) : s, 0);
    tItem.jumlah = Number(data.sisaBaru) + terjualSum;

    store.barangTerjual.forEach(b => {
      if (b.nama === newNama) {
        b.satuan = data.satuanBaru;
      }
    });

    saveStore();
    closeModal();
    renderStok();
    showToast('Data stok berhasil diperbarui.', 'success');
  });
}

function openStokAwalModal() {
  const html = `<form id="modal-form">
    <div class="form-grid">
      <div class="form-group form-full">
        <label class="form-label">Nama Barang</label>
        <input type="text" class="form-input" name="nama" placeholder="Contoh: Semen Padang" required />
      </div>
      <div class="form-group">
        <label class="form-label">Jumlah Stok</label>
        <input type="number" class="form-input" name="jumlah1" min="1" placeholder="0" required />
      </div>
      <div class="form-group">
        <label class="form-label">Satuan</label>
        <select class="form-select" name="satuan1">${satuanOptions()}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Harga Modal (Total per Satuan)</label>
        <input type="number" class="form-input" name="hargaModal" min="0" placeholder="0" required />
      </div>
      <div class="form-group">
        <label class="form-label">Harga Jual (per Satuan)</label>
        <input type="number" class="form-input" name="hargaJual1" min="0" placeholder="0" required />
      </div>
    </div>
    <div class="form-actions" style="margin-top:20px">
      <button type="button" class="btn btn-ghost" data-aksi="tutup-modal">Batal</button>
      <button type="submit" class="btn btn-primary">${ico('save',17)} Simpan Stok Awal</button>
    </div>
  </form>`;

  openModal('Input Stok Awal', html, (form) => {
    const data = Object.fromEntries(new FormData(form).entries());
    
    if (!data.nama.trim() || !data.jumlah1 || !data.hargaModal || !data.hargaJual1) {
      showToast('Harap lengkapi semua isian.', 'error');
      return;
    }

    const existing = store.stokToko.find(x => x.nama.toLowerCase() === data.nama.trim().toLowerCase());
    if (existing) {
      showToast('Barang ini sudah ada di Stok Toko! Silakan gunakan fitur Edit di tabel stok.', 'error');
      return;
    }
    
    const newItem = {
      id: uid(),
      nama: data.nama.trim(),
      jumlah: Number(data.jumlah1),
      satuan: data.satuan1,
      hargaModal: Number(data.hargaModal),
      hargaJual: Number(data.hargaJual1)
    };
    
    store.stokToko.push(newItem);
    saveStore();
    closeModal();
    renderStok();
    showToast('Stok awal berhasil ditambahkan.', 'success');
  });
}

function renderStok() {
  const content = document.getElementById('content');
  const stok = getStokToko();
  const { items, totalModal, totalJual } = stok;
  const totalUntung  = totalJual - totalModal;
  const habisCount   = items.filter(x => x.stokKecil <= 0).length;
  const menipisCount = items.filter(x => x.stokKecil > 0 && x.stokKecil <= 5).length;
  const perluRestock = habisCount + menipisCount;

  let halaman = 1;

  const html = `
  <div class="page-anim">
    <div class="print-header" id="print-header-stok"></div>
    <div class="page-header nx-head">
      <div class="no-print">
        <div class="page-title">${ico('shelves',26)} Stok Toko</div>
        <div class="page-subtitle">${ico('info',15)}Dihitung otomatis dari Barang Masuk dikurangi Barang Terjual</div>
      </div>
      <div class="no-print nx-head-aksi">
        <button class="btn btn-ghost" id="btn-cetak-stok">${ico('print',17)} Cetak</button>
        <button class="btn btn-dark" id="btn-input-stok-awal">${ico('add',17)}Input Stok Awal</button>
      </div>
    </div>

    <div class="nx-kpi-grid" style="margin-bottom:20px">
      <div class="nx-mini">
        <div class="nx-mini-label">${ico('inventory_2',17)} Total Jenis Barang</div>
        <div class="nx-mini-nilai">${fmtNum(items.length)}</div>
        <div class="nx-mini-ket">Jenis barang yang pernah tercatat masuk</div>
      </div>
      <div class="nx-mini">
        <div class="nx-mini-label">${ico('warning',17)} Stok Menipis / Habis</div>
        <div class="nx-mini-nilai">${menipisCount} <span style="color:var(--muted);font-weight:600">/</span> ${habisCount}</div>
        <div class="nx-mini-ket ${perluRestock ? 'perhatian' : ''}">
          ${perluRestock ? `${perluRestock} barang perlu segera ditambah` : 'Semua stok masih aman'}
        </div>
      </div>
      <div class="nx-mini">
        <div class="nx-mini-label">${ico('account_balance_wallet',17)} Total Nilai Modal</div>
        <div class="nx-mini-nilai">${fmt(totalModal)}</div>
        <div class="nx-mini-ket">Modal yang masih tertahan di barang</div>
      </div>
      <div class="nx-kpi gelap" style="padding:16px 18px">
        <div class="nx-kpi-top" style="margin-bottom:8px">
          <span class="nx-kpi-judul" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">
            ${ico('monitoring',17)} Estimasi Untung
          </span>
        </div>
        <div class="nx-kpi-nilai" style="font-size:22px">${fmt(totalUntung)}</div>
        <div class="nx-kpi-delta">${ico('trending_up',15)}Jika seluruh stok saat ini terjual</div>
      </div>
    </div>

    <div class="card">
      <div class="nx-toolbar no-print">
        <div class="search-bar lebar">
          ${ico('search')}
          <input type="text" id="search-stok" placeholder="Cari nama barang..." />
        </div>
        <select class="form-select" id="grup-stok" style="width:200px;">
          <option value="status">Kelompok: Status Stok</option>
          <option value="supplier">Kelompok: Supplier</option>
          <option value="tanpa">Tanpa Kelompok</option>
        </select>
        <select class="form-select" id="sort-stok" style="width:210px;">
          <option value="nama">Urutkan: Nama (A-Z)</option>
          <option value="stok-terendah">Urutkan: Stok Tersedikit</option>
          <option value="modal-tertinggi">Urutkan: Nilai Modal Tertinggi</option>
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nama Barang</th>
              <th>Sisa Stok</th>
              <th>Harga Modal</th>
              <th>Harga Jual</th>
              <th>Nilai Modal</th>
              <th>Est. Untung</th>
              <th class="no-print" style="width:100px;text-align:right">Aksi</th>
            </tr>
          </thead>
          <tbody id="tbody-stok"></tbody>
        </table>
      </div>
      <div class="nx-pagination no-print" id="stok-pagination"></div>
    </div>
  </div>`;

  content.innerHTML = html;

  function terpilih() {
    const q      = document.getElementById('search-stok').value.toLowerCase().trim();
    const sortBy = document.getElementById('sort-stok').value;
    const mode   = document.getElementById('grup-stok').value;
    const cocok  = sortStokItems(items.filter(x => x.nama.toLowerCase().includes(q)), sortBy);
    return { cocok, mode };
  }

  function refresh() {
    const { cocok, mode } = terpilih();
    const tbody = document.getElementById('tbody-stok');
    const total = cocok.length;
    const maksHalaman = Math.max(1, Math.ceil(total / STOK_PER_HALAMAN));
    if (halaman > maksHalaman) halaman = maksHalaman;

    const mulai = (halaman - 1) * STOK_PER_HALAMAN;
    const potong = cocok.slice(mulai, mulai + STOK_PER_HALAMAN);

    if (!total) {
      tbody.innerHTML = barisKosong(6, 'Tidak ditemukan',
        'Coba kata kunci lain, atau tambahkan data di menu Barang Masuk');
    } else {
      tbody.innerHTML = kelompokStok(potong, mode).map(g => {
        const kepala = g.judul ? `<tr class="grup-kepala"><td colspan="6">
          <div class="grup-kepala-isi">
            <span class="grup-dot"></span>
            <span class="grup-nama">${e(g.judul)}</span>
            <span class="grup-spacer"></span>
            <span class="grup-badge netral">${g.rows.length} barang</span>
          </div></td></tr>` : '';
        return kepala + g.rows.map(stokRowHtml).join('');
      }).join('');
    }

    const akhir = Math.min(mulai + STOK_PER_HALAMAN, total);
    const nav = document.getElementById('stok-pagination');
    nav.innerHTML = `
      <span class="nx-pagination-info">
        ${total ? `Menampilkan ${mulai + 1}–${akhir} dari ${fmtNum(total)} barang` : 'Tidak ada barang untuk ditampilkan'}
      </span>
      ${maksHalaman > 1 ? `<span class="nx-pagination-nav">
        <button class="nx-page-btn" data-go="prev" ${halaman === 1 ? 'disabled' : ''} aria-label="Halaman sebelumnya">${ico('chevron_left',18)}</button>
        ${Array.from({ length: maksHalaman }, (_, i) => i + 1).map(n =>
          `<button class="nx-page-btn ${n === halaman ? 'aktif' : ''}" data-go="${n}">${n}</button>`).join('')}
        <button class="nx-page-btn" data-go="next" ${halaman === maksHalaman ? 'disabled' : ''} aria-label="Halaman berikutnya">${ico('chevron_right',18)}</button>
      </span>` : ''}`;

    nav.querySelectorAll('.nx-page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const go = btn.dataset.go;
        if (go === 'prev') halaman--;
        else if (go === 'next') halaman++;
        else halaman = Number(go);
        refresh();
      });
    });
  }

  refresh();

  const ulangDariAwal = () => { halaman = 1; refresh(); };
  document.getElementById('search-stok').addEventListener('input', ulangDariAwal);
  document.getElementById('sort-stok').addEventListener('change', ulangDariAwal);
  document.getElementById('grup-stok').addEventListener('change', ulangDariAwal);

  document.getElementById('btn-input-stok-awal').addEventListener('click', () => {
    openStokAwalModal();
  });
  document.getElementById('btn-cetak-stok').addEventListener('click', () => {
    const el = document.getElementById('print-header-stok');
    if (el) {
      el.innerHTML = `
        <div class="print-title">Toko Panglima Bangunan — STOK TOKO</div>
        <div class="print-subtitle">${items.length} jenis barang · nilai modal ${fmt(totalModal)}</div>
        <div class="print-subtitle">Dicetak: ${formatDate(today())}</div>`;
    }
    window.print();
  });
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

/* Perhitungan laba/rugi satu bulan.
   Sengaja global: Dashboard dan Laporan Keuangan memakai fungsi yang sama,
   supaya angkanya tidak mungkin berbeda. */
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
      (s, b) => s + bmItemTotal(b), 0
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

/* ========================
   GRAFIK GARIS UNTUNG / RUGI (Dashboard)
   ======================== */
function buildGrafikGarisLaba(data, kompak = false) {
  if (!data.length) {
    return `<div class="card" style="margin-bottom:20px;">
      <div class="card-header"><div class="card-title">${ico('show_chart')} Tren Untung / Rugi</div></div>
      <div style="padding:34px;text-align:center;color:var(--muted)">Belum ada transaksi untuk ditampilkan grafiknya</div>
    </div>`;
  }

  /* Di layar sempit, SVG ikut mengecil sehingga teks jadi tak terbaca.
     Karena itu kanvasnya dibuat lebih "ramping & tinggi" supaya
     ukuran huruf relatifnya membesar. */
  /* `kompak` dipakai saat grafik diletakkan di kolom sempit (Laporan Keuangan):
     kanvasnya dipersempit supaya ukuran huruf relatifnya tetap terbaca. */
  const sempit = window.innerWidth <= 700;
  const w = sempit ? 440 : (kompak ? 620 : 900);
  const h = sempit ? 330 : (kompak ? 330 : 300);
  const fsAxis  = sempit ? 15 : (kompak ? 14 : 11);
  const rTitik  = sempit ? 6.5 : 5.5;
  const padTop    = sempit ? 20 : 22;
  const padBottom = sempit ? 46 : 40;
  const padLeft   = sempit ? 62 : 68;
  const padRight  = sempit ? 18 : 22;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  const vals   = data.map(d => d.laba);
  const rawMax = Math.max(0, ...vals);
  const rawMin = Math.min(0, ...vals);
  const span   = Math.max(rawMax - rawMin, 1);
  const step   = Math.pow(10, Math.floor(Math.log10(span))) / 2;
  const top    = Math.ceil(rawMax / step) * step;
  const bottom = Math.floor(rawMin / step) * step;
  const range  = Math.max(top - bottom, 1);

  const n     = data.length;
  const xOf   = i => padLeft + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yOf   = v => padTop + plotH - ((v - bottom) / range) * plotH;
  const zeroY = yOf(0);

  // garis bantu + label sumbu
  const ticks = [];
  for (let v = bottom; v <= top + 1e-6; v += step) ticks.push(v);
  if (ticks.length > 7) ticks.splice(0, ticks.length, bottom, bottom + range / 2, top);

  const grid = ticks.map(v => {
    const y = yOf(v), nol = Math.abs(v) < 1e-6;
    return `<line x1="${padLeft}" y1="${y}" x2="${w - padRight}" y2="${y}"
        stroke="${nol ? 'var(--border-strong)' : 'var(--border)'}" stroke-width="1"
        ${nol ? '' : 'stroke-dasharray="3 4"'} />
      <text x="${padLeft - 11}" y="${y + 4}" text-anchor="end" font-size="${fsAxis}"
        font-family="Inter, sans-serif" fill="var(--muted)">${v === 0 ? '0' : (v < 0 ? '-' : '') + fmtShort(Math.abs(v))}</text>`;
  }).join('');

  const pts      = data.map((d, i) => [xOf(i), yOf(d.laba)]);
  const garis    = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const areaAtas = `${garis} L${pts[n - 1][0].toFixed(1)} ${zeroY} L${pts[0][0].toFixed(1)} ${zeroY} Z`;

  const uid2 = 'g' + Math.random().toString(36).slice(2, 8);

  // Titik data: bulat, dibedakan warna sesuai untung/rugi,
  // dan diberi cincin putih supaya tetap terbaca saat bertumpuk garis.
  const titik = data.map((d, i) => {
    const [x, y] = pts[i];
    const pos = d.laba >= 0;
    const col = pos ? 'var(--chart-profit)' : 'var(--chart-loss)';
    return `<g class="line-pt" data-i="${i}" data-label="${e(MONTHS[d.m] + ' ' + d.y)}" data-val="${d.laba}">
        <rect x="${(x - plotW / (n * 2) - 2).toFixed(1)}" y="${padTop}"
              width="${(plotW / n + 4).toFixed(1)}" height="${plotH}" fill="transparent" />
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rTitik}" fill="${col}" stroke="#fff" stroke-width="2" />
      </g>`;
  }).join('');

  // Label pertama & terakhir dirapatkan ke dalam supaya tidak terpotong tepi kanvas.
  const label = data.map((d, i) => {
    const anchor = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
    const x = i === 0 ? padLeft : (i === n - 1 ? w - padRight : pts[i][0]);
    return `<text x="${Number(x).toFixed(1)}" y="${h - 16}" text-anchor="${anchor}" font-size="${fsAxis}"
       font-family="Inter, sans-serif" fill="var(--muted)">${MONTHS[d.m].slice(0, 3)} ${String(d.y).slice(2)}</text>`;
  }).join('');

  const terakhir = data[n - 1];

  return `
  <div class="card" style="margin-bottom:20px;">
    <div class="card-header">
      <div>
        <div class="card-title">${ico('show_chart')} Tren Untung / Rugi</div>
        <div style="color:var(--muted); font-size:12px; margin-top:4px;">
          Perkembangan laba bersih tiap bulan. Di atas garis 0 = untung, di bawah = rugi.
        </div>
      </div>
      <div class="chart-legend">
        <span><i style="background:var(--chart-profit)"></i>Untung</span>
        <span><i style="background:var(--chart-loss)"></i>Rugi</span>
      </div>
    </div>
    <div class="chart-wrap">
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img"
           aria-label="Grafik garis tren untung rugi per bulan. Bulan terakhir ${e(MONTHS[terakhir.m])} ${terakhir.y}: ${terakhir.laba >= 0 ? 'untung' : 'rugi'} ${fmt(Math.abs(terakhir.laba))}."
           style="width:100%; height:auto; display:block;">
        <defs>
          <linearGradient id="${uid2}-up" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="var(--chart-profit)" stop-opacity=".28" />
            <stop offset="100%" stop-color="var(--chart-profit)" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="${uid2}-dn" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%"   stop-color="var(--chart-loss)" stop-opacity=".28" />
            <stop offset="100%" stop-color="var(--chart-loss)" stop-opacity="0" />
          </linearGradient>
          <clipPath id="${uid2}-atas"><rect x="0" y="${padTop}" width="${w}" height="${Math.max(0, zeroY - padTop)}" /></clipPath>
          <clipPath id="${uid2}-bawah"><rect x="0" y="${zeroY}" width="${w}" height="${Math.max(0, padTop + plotH - zeroY)}" /></clipPath>
        </defs>

        ${grid}

        <!-- area diwarnai sesuai posisi terhadap garis nol -->
        <path class="chart-area-anim" d="${areaAtas}" fill="url(#${uid2}-up)" clip-path="url(#${uid2}-atas)" />
        <path class="chart-area-anim" d="${areaAtas}" fill="url(#${uid2}-dn)" clip-path="url(#${uid2}-bawah)" />

        <!-- garis utama, dipotong dua warna oleh garis nol -->
        <path class="garis-laba" d="${garis}" fill="none" stroke="var(--chart-profit)" stroke-width="2.5"
              stroke-linejoin="round" stroke-linecap="round" clip-path="url(#${uid2}-atas)" />
        <path class="garis-laba" d="${garis}" fill="none" stroke="var(--chart-loss)" stroke-width="2.5"
              stroke-linejoin="round" stroke-linecap="round" clip-path="url(#${uid2}-bawah)" />

        ${titik}
        ${label}
      </svg>
      <div class="chart-tooltip" id="garis-tooltip" hidden></div>
    </div>
  </div>`;
}

function wireGrafikGaris() {
  const kurangiGerak = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Garis digambar dari kiri ke kanan.
     Panjang tepatnya diambil dari path-nya sendiri supaya kecepatannya pas
     berapa pun jumlah bulannya. */
  if (!kurangiGerak) {
    document.querySelectorAll('.garis-laba').forEach(path => {
      const len = path.getTotalLength();
      if (!len) return;
      path.style.strokeDasharray  = len;
      path.style.strokeDashoffset = len;
      path.classList.add('chart-line-anim');
    });
    document.querySelectorAll('.line-pt').forEach((g, i) => {
      const c = g.querySelector('circle');
      if (c) c.style.animationDelay = (0.55 + i * 0.07) + 's';
      g.classList.add('pt-anim');
    });
  }

  const tip  = document.getElementById('garis-tooltip');
  const wrap = tip ? tip.parentElement : null;
  if (!tip || !wrap) return;

  document.querySelectorAll('.line-pt').forEach(el => {
    const tampil = (ev) => {
      const val = Number(el.dataset.val);
      const pos = val >= 0;
      tip.innerHTML =
        `<div class="tt-label">${el.dataset.label}</div>` +
        `<div class="tt-val" style="color:${pos ? 'var(--chart-profit)' : 'var(--chart-loss)'}">` +
        `${pos ? 'Untung' : 'Rugi'} ${fmt(Math.abs(val))}</div>`;
      tip.hidden = false;
      const r = wrap.getBoundingClientRect();
      const p = ev.touches ? ev.touches[0] : ev;
      const x = p.clientX - r.left, y = p.clientY - r.top;
      tip.style.left = Math.max(8, Math.min(x, r.width - tip.offsetWidth - 8)) + 'px';
      tip.style.top  = Math.max(4, y - tip.offsetHeight - 14) + 'px';
    };
    el.addEventListener('mousemove', tampil);
    el.addEventListener('touchstart', tampil, { passive: true });
    el.addEventListener('mouseleave', () => { tip.hidden = true; });
  });
  // sentuh di luar titik -> tutup tooltip
  wrap.addEventListener('touchend', () => setTimeout(() => { tip.hidden = true; }, 2200), { passive: true });
}

/* Deret laba/rugi seluruh bulan yang ada datanya — dipakai grafik. */
function seriesLabaBulanan() {
  return getLaporanMonths()
    .map(({ m, y }) => {
      const lp = buildLaporan(m, y);
      return { m, y, laba: lp.labaBersih, pendapatan: lp.totalPendapatan, pengeluaran: lp.totalPengeluaran };
    })
    .filter(d => d.pendapatan !== 0 || d.pengeluaran !== 0);
}

function renderLaporan() {
  const now = new Date();
  const content = document.getElementById('content');

  /* Rincian pendapatan & pengeluaran, masing-masing dengan asal datanya. */
  function rincianPendapatan(lp) {
    return [
      { label: 'Penjualan Luar Kota', sub: 'Dari menu Barang Terjual di tiap rute', nilai: lp.totalPenjualan },
      { label: 'Uang Masuk (Lainnya)', sub: 'Dari menu Uang Masuk di tiap rute',    nilai: lp.totalUangMasuk },
    ].filter(x => x.nilai !== 0).sort((a, b) => b.nilai - a.nilai);
  }
  function rincianPengeluaran(lp) {
    return [
      { label: 'Pembelian Barang (Modal Stok)', sub: 'Dari menu Barang Masuk',        nilai: lp.totalBelanjaBarang },
      { label: 'Uang Keluar Toko Utama',        sub: 'Operasional toko',              nilai: lp.uangKeluarUtama },
      { label: 'Uang Keluar Luar Kota',         sub: 'Biaya selama perjalanan rute',  nilai: lp.uangKeluarLK },
    ].filter(x => x.nilai !== 0).sort((a, b) => b.nilai - a.nilai);
  }

  function kartuRincian(judul, ikon, baris, total, positif) {
    const warna = positif ? 'var(--chart-profit)' : 'var(--chart-loss)';
    return `
      <div class="card">
        <div class="card-header">
          <div class="card-title">${ico(ikon)} ${judul}</div>
        </div>
        <div class="lk-rincian">
          ${baris.length ? baris.map(r => {
            const persen = total ? Math.round((r.nilai / total) * 100) : 0;
            return `<div class="lk-rincian-baris">
              <span class="lk-dot" style="background:${warna}"></span>
              <span class="lk-rincian-teks">
                <span class="lk-rincian-label">${e(r.label)}</span>
                <span class="lk-rincian-sub">${e(r.sub)}</span>
              </span>
              <span class="lk-rincian-kanan">
                <span class="lk-rincian-nilai" style="color:${warna}">${fmt(r.nilai)}</span>
                <span class="lk-rincian-persen">${persen}% dari total</span>
              </span>
            </div>`;
          }).join('') : `<div class="empty-state"><div class="empty-state-sub">Tidak ada transaksi bulan ini</div></div>`}
        </div>
      </div>`;
  }

  function renderLaporanContent(m, y) {
    const lp = buildLaporan(m, y);
    const pm = m === 0 ? 11 : m - 1, py = m === 0 ? y - 1 : y;
    const lalu = buildLaporan(pm, py);
    const labaPos = lp.labaBersih >= 0;
    const wadah = document.getElementById('laporan-content');
    if (!wadah) return;

    wadah.innerHTML = `
      <div class="lk-atas">
        <div class="lk-kolom-kiri">
          <div class="lk-laba ${labaPos ? 'is-untung' : 'is-rugi'}">
            <div class="lk-laba-ikon">${ico(labaPos ? 'trending_up' : 'trending_down', 20)}</div>
            <div class="lk-laba-label">Estimasi ${labaPos ? 'Laba Bersih' : 'Rugi Bersih'}</div>
            <div class="lk-laba-nilai">${fmt(Math.abs(lp.labaBersih))}</div>
            ${chipDelta(persenBeda(lp.labaBersih, lalu.labaBersih), true)}
          </div>

          <div class="lk-dua-kecil">
            <div class="nx-mini">
              <div class="nx-mini-label">Total Pendapatan</div>
              <div class="nx-mini-nilai" style="font-size:19px">${fmt(lp.totalPendapatan)}</div>
              ${chipDelta(persenBeda(lp.totalPendapatan, lalu.totalPendapatan), true)}
            </div>
            <div class="nx-mini">
              <div class="nx-mini-label">Total Pengeluaran</div>
              <div class="nx-mini-nilai" style="font-size:19px">${fmt(lp.totalPengeluaran)}</div>
              ${chipDelta(persenBeda(lp.totalPengeluaran, lalu.totalPengeluaran), false)}
            </div>
          </div>
        </div>

        <div class="lk-kolom-kanan" id="laporan-chart"></div>
      </div>

      <div class="lk-dua-rincian">
        ${kartuRincian('Rincian Pendapatan', 'south_west', rincianPendapatan(lp), lp.totalPendapatan, true)}
        ${kartuRincian('Rincian Pengeluaran', 'north_east', rincianPengeluaran(lp), lp.totalPengeluaran, false)}
      </div>

      <div class="card" style="margin-bottom:24px;">
        <div class="card-header">
          <div>
            <div class="card-title">${ico('menu_book')} Utang &amp; Piutang</div>
            <div style="color:var(--muted); font-size:12px; margin-top:4px;">Catatan baru bulan ${MONTHS[m]} ${y}, dan sisa saldo yang belum lunas sampai sekarang</div>
          </div>
        </div>
        <div class="table-wrap">
          <table class="lk-tabel-saldo">
            <tbody>
              <tr><td colspan="2" style="background:var(--surface-low);font-weight:700;font-size:12px;color:var(--muted)">TERCATAT BARU BULAN ${MONTHS[m].toUpperCase()} ${y}</td></tr>
              <tr><td class="primary">Piutang Baru (Toko Utama)</td><td class="amount-positive">${fmt(lp.totalPiutang)}</td></tr>
              <tr><td class="primary">Piutang Baru (Luar Kota)</td><td class="amount-positive">${fmt(lp.totalRekapPiutang)}</td></tr>
              <tr><td class="primary">Utang Baru</td><td class="amount-negative">${fmt(lp.totalUtang)}</td></tr>
              <tr><td class="primary">Tagihan (Luar Kota)</td><td class="amount-negative">${fmt(lp.totalTagihan)}</td></tr>

              <tr><td colspan="2" style="background:var(--surface-low);font-weight:700;font-size:12px;color:var(--muted)">SISA SALDO BELUM LUNAS (SAAT INI)</td></tr>
              <tr><td class="primary">Piutang Belum Lunas</td><td class="amount-positive">${fmt(lp.saldoPiutang)}</td></tr>
              <tr><td class="primary">Utang Belum Lunas</td><td class="amount-negative">${fmt(lp.saldoUtang)}</td></tr>
              <tr>
                <td colspan="2" style="font-size:11px; color:var(--muted); padding-top:4px;">
                  Angka ini sama dengan Dashboard, dan berubah otomatis begitu status piutang/utang ditandai "Lunas" di halaman pencatatan.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>`;
  }

  /* Grafik garis dipakai bersama dengan Dashboard; di sini titiknya bisa diklik
     untuk berpindah bulan. */
  function wireKlikTitik(chartData, selM, selY) {
    document.querySelectorAll('#laporan-chart .line-pt').forEach(el => {
      const i = Number(el.dataset.i);
      const d = chartData[i];
      if (!d) return;
      el.style.cursor = 'pointer';
      if (d.m === selM && d.y === selY) el.classList.add('is-terpilih');
      el.addEventListener('click', () => {
        document.getElementById('laporan-bulan').value = d.m;
        document.getElementById('laporan-tahun').value = d.y;
        renderAll(d.m, d.y);
      });
    });
  }

  function renderAll(m, y) {
    renderLaporanContent(m, y);
    document.getElementById('laporan-chart').innerHTML = buildGrafikGarisLaba(chartData, true);
    wireGrafikGaris();
    wireKlikTitik(chartData, m, y);
  }

  const allMonths = getLaporanMonths();
  const chartData = seriesLabaBulanan();

  let selM = now.getMonth(), selY = now.getFullYear();
  if (!allMonths.some(x => x.m === selM && x.y === selY)) {
    const last = allMonths[allMonths.length - 1];
    if (last) { selM = last.m; selY = last.y; }
  }
  const bulanOptions = [...new Set(allMonths.map(x => x.m))].sort((a, b) => a - b);
  const tahunOptions = [...new Set(allMonths.map(x => x.y))].sort((a, b) => a - b);

  content.innerHTML = `
  <div class="page-anim">
    <div class="print-header" id="print-header-laporan"></div>
    <div class="page-header nx-head">
      <div class="no-print">
        <div class="page-title">${ico('analytics',26)} Laporan Keuangan</div>
        <div class="page-subtitle">${ico('info',15)}Ringkasan performa keuangan dan arus kas operasional</div>
      </div>
      <div class="no-print nx-head-aksi">
        <div class="nx-filter-pill">
          ${ico('calendar_month',17)}
          <select class="form-select" id="laporan-bulan">
            ${bulanOptions.map(m => `<option value="${m}" ${m === selM ? 'selected' : ''}>${MONTHS[m]}</option>`).join('')}
          </select>
          <select class="form-select" id="laporan-tahun">
            ${tahunOptions.map(y => `<option value="${y}" ${y === selY ? 'selected' : ''}>${y}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-ghost" id="btn-penjelasan">${ico('help_center',17)} Penjelasan</button>
        <button class="btn btn-primary" id="btn-unduh-laporan">${ico('download',17)} Unduh PDF</button>
      </div>
    </div>
    <div id="laporan-content"></div>
  </div>`;

  renderAll(selM, selY);

  const ulang = () => renderAll(
    Number(document.getElementById('laporan-bulan').value),
    Number(document.getElementById('laporan-tahun').value)
  );
  document.getElementById('laporan-bulan').addEventListener('change', ulang);
  document.getElementById('laporan-tahun').addEventListener('change', ulang);
  document.getElementById('btn-penjelasan').addEventListener('click', () => navigate('penjelasan-laporan'));
  document.getElementById('btn-unduh-laporan').addEventListener('click', () => {
    const m = Number(document.getElementById('laporan-bulan').value);
    const y = Number(document.getElementById('laporan-tahun').value);
    const el = document.getElementById('print-header-laporan');
    if (el) {
      el.innerHTML = `
        <div class="print-title">Toko Panglima Bangunan — LAPORAN KEUANGAN</div>
        <div class="print-subtitle">Periode: ${MONTHS[m]} ${y}</div>
        <div class="print-subtitle">Dicetak: ${formatDate(today())}</div>`;
    }
    window.print();
  });
}

/* ========================
   PENJELASAN LAPORAN KEUANGAN — halaman terpisah, dirancang untuk dicetak
   ======================== */

/* Satu entri per baris angka di kartu "Laporan Laba / Rugi".
   Fungsi `hitung` sengaja menyalin rumus di buildLaporan() persis apa adanya,
   supaya halaman ini menjelaskan perhitungan yang benar-benar dipakai. */
const ASAL_LABA_RUGI = [
  { sisi: 'masuk', baris: 'Penjualan Luar Kota', key: 'barangTerjual',
    menu: 'Rute → <i>nama rute</i> → Barang Terjual → <i>pilih perjalanan</i>',
    kolom: 'Jumlah, Harga Jual',
    rumus: 'Jumlah × Harga Jual pada setiap baris barang, lalu semuanya dijumlahkan',
    hitung: (r) => r.reduce((s, b) => s + Number(b.jumlah || 0) * Number(b.hargaJual || 0), 0) },

  { sisi: 'masuk', baris: 'Uang Masuk (Lainnya)', key: 'uangMasuk',
    menu: 'Rute → <i>nama rute</i> → Uang Masuk → <i>pilih perjalanan</i>',
    kolom: 'Jumlah',
    rumus: 'Kolom Jumlah dijumlahkan apa adanya',
    hitung: (r) => sumField(r, 'jumlah') },

  { sisi: 'keluar', baris: 'Uang Keluar (Toko Utama)', key: 'uangKeluar',
    menu: 'Toko Utama → Uang Keluar → <i>pilih periode</i>',
    kolom: 'Jumlah',
    rumus: 'Kolom Jumlah dijumlahkan apa adanya',
    hitung: (r) => sumField(r, 'jumlah') },

  { sisi: 'keluar', baris: 'Uang Keluar (Luar Kota)', key: 'uangKeluarLK',
    menu: 'Rute → <i>nama rute</i> → Uang Keluar → <i>pilih perjalanan</i>',
    kolom: 'Jumlah',
    rumus: 'Kolom Jumlah dijumlahkan apa adanya',
    hitung: (r) => sumField(r, 'jumlah') },

  { sisi: 'keluar', baris: 'Pembelian Barang Masuk (Modal Stok)', key: 'barangMasuk',
    menu: 'Toko Utama → Barang Masuk',
    kolom: 'Jumlah, Harga Modal, Diskon',
    rumus: 'Jumlah (satuan utama) × Harga Modal × (1 − Diskon%) pada setiap baris barang, lalu dijumlahkan',
    hitung: (r) => r.reduce((s, b) => s + bmItemTotal(b), 0) },
];

/* Baris di kartu "Utang & Piutang". Semuanya di luar hitungan laba/rugi. */
const ASAL_UTANG_PIUTANG = [
  { baris: 'Piutang Baru (Toko Utama)', key: 'piutang', arah: 'plus',
    menu: 'Toko Utama → Piutang', arti: 'Uang toko yang masih dipegang pembeli' },
  { baris: 'Piutang Baru (Luar Kota)', key: 'rekapPiutang', arah: 'plus',
    menu: 'Rute → <i>nama rute</i> → Rekap Piutang → <i>pilih perjalanan</i>',
    arti: 'Uang toko yang masih dipegang pelanggan rute' },
  { baris: 'Utang Baru', key: 'utang', arah: 'minus',
    menu: 'Toko Utama → Utang', arti: 'Kewajiban toko ke supplier' },
  { baris: 'Tagihan (Luar Kota)', key: 'tagihan', arah: 'minus',
    menu: 'Rute → <i>nama rute</i> → Tagihan → <i>pilih perjalanan</i>',
    arti: 'Tagihan yang muncul selama perjalanan rute' },
];

function renderPenjelasanLaporan() {
  const content = document.getElementById('content');
  const now = new Date();

  const inBulan = (arr, m, y) => arr.filter(x => {
    const g = getMonthYear(x.tanggal);
    return g.m === m && g.y === y;
  });

  /* baris transaksi terbesar bulan itu — supaya angkanya bisa ditelusuri ke catatan nyata */
  function contohTerbesar(key, rows) {
    if (!rows.length) return '—';
    const nilai = (b) => key === 'barangTerjual' ? Number(b.jumlah || 0) * Number(b.hargaJual || 0)
                 : key === 'barangMasuk'  ? bmItemTotal(b)
                 : Number(b.jumlah || 0);
    const top = rows.slice().sort((a, b) => nilai(b) - nilai(a))[0];
    const nama = top.keterangan || top.nama || top.pelanggan || top.supplier || '(tanpa keterangan)';
    return `${formatDate(top.tanggal)} — ${e(nama)} — <b>${fmt(nilai(top))}</b>`;
  }

  function isiPenjelasan(m, y) {
    const wadah = document.getElementById('penjelasan-isi');
    if (!wadah) return;

    const lp   = buildLaporan(m, y);
    const nama = `${MONTHS[m]} ${y}`;

    const rowsOf = (key) => inBulan(store[key] || [], m, y);

    const masuk  = ASAL_LABA_RUGI.filter(x => x.sisi === 'masuk');
    const keluar = ASAL_LABA_RUGI.filter(x => x.sisi === 'keluar');

    const barisTabel = (x, i) => {
      const rows = rowsOf(x.key);
      const nilai = x.hitung(rows);
      const pos = x.sisi === 'masuk';
      return `
        <tr>
          <td class="pj-no">${i + 1}</td>
          <td class="pj-baris">
            <span class="pj-dot ${pos ? 'is-plus' : 'is-minus'}"></span>${e(x.baris)}
          </td>
          <td class="pj-menu">${x.menu}</td>
          <td class="pj-rumus">${e(x.rumus)}<div class="pj-kolom">kolom dipakai: ${e(x.kolom)}</div></td>
          <td class="pj-jml">${rows.length}</td>
          <td class="pj-nilai ${pos ? 'amount-positive' : 'amount-negative'}">${pos ? '+' : '−'}${fmt(nilai)}</td>
        </tr>
        <tr class="pj-contoh-row">
          <td></td>
          <td colspan="5" class="pj-contoh">Transaksi terbesar bulan ini: ${contohTerbesar(x.key, rows)}</td>
        </tr>`;
    };

    const barisUP = (x, i) => {
      const rows = rowsOf(x.key);
      const nilai = sumField(rows, 'jumlah');
      return `
        <tr>
          <td class="pj-no">${i + 1}</td>
          <td class="pj-baris">${e(x.baris)}<div class="pj-kolom">${e(x.arti)}</div></td>
          <td class="pj-menu">${x.menu}</td>
          <td class="pj-rumus">Kolom Jumlah dijumlahkan apa adanya</td>
          <td class="pj-jml">${rows.length}</td>
          <td class="pj-nilai">${fmt(nilai)}</td>
        </tr>`;
    };

    const labaPos = lp.labaBersih >= 0;

    wadah.innerHTML = `
      <div class="print-header">
        <div class="print-title">Toko Panglima Bangunan — PENJELASAN LAPORAN KEUANGAN</div>
        <div class="print-subtitle">Sumber data setiap angka pada laporan bulan ${e(nama)}</div>
        <div class="print-subtitle">Dicetak: ${formatDate(today())}</div>
      </div>

      <!-- ====== 1. ALUR ====== -->
      <div class="card pj-card">
        <div class="card-header">
          <div>
            <div class="card-title">${ico('account_tree')} 1. Alur Perhitungan Laba / Rugi</div>
            <div class="pj-sub">Hanya lima jenis catatan yang memengaruhi untung-rugi. Selain kelima ini, tidak ada yang ikut dihitung.</div>
          </div>
        </div>
        <div class="pj-alur">
          <div class="pj-kolom-alur">
            <div class="pj-grup-head is-plus">${ico('south_west',16)} PENDAPATAN</div>
            ${masuk.map(x => `<div class="pj-node is-plus">
                <div class="pj-node-nama">${e(x.baris)}</div>
                <div class="pj-node-nilai">${fmt(x.hitung(rowsOf(x.key)))}</div>
              </div>`).join('')}
            <div class="pj-total is-plus">Total Pendapatan <b>${fmt(lp.totalPendapatan)}</b></div>
          </div>

          <div class="pj-operator">
            <div class="pj-op-simbol">−</div>
            <div class="pj-op-teks">dikurangi</div>
          </div>

          <div class="pj-kolom-alur">
            <div class="pj-grup-head is-minus">${ico('north_east',16)} PENGELUARAN</div>
            ${keluar.map(x => `<div class="pj-node is-minus">
                <div class="pj-node-nama">${e(x.baris)}</div>
                <div class="pj-node-nilai">${fmt(x.hitung(rowsOf(x.key)))}</div>
              </div>`).join('')}
            <div class="pj-total is-minus">Total Pengeluaran <b>${fmt(lp.totalPengeluaran)}</b></div>
          </div>

          <div class="pj-operator pj-op-sama">
            <div class="pj-op-simbol">=</div>
            <div class="pj-op-teks">hasilnya</div>
          </div>

          <div class="pj-hasil ${labaPos ? 'is-plus' : 'is-minus'}">
            <div class="pj-hasil-label">${labaPos ? 'UNTUNG' : 'RUGI'} BULAN ${MONTHS[m].toUpperCase()} ${y}</div>
            <div class="pj-hasil-nilai">${fmt(Math.abs(lp.labaBersih))}</div>
            <div class="pj-hasil-rumus">${fmt(lp.totalPendapatan)} − ${fmt(lp.totalPengeluaran)}</div>
          </div>
        </div>
      </div>

      <!-- ====== 2. ASAL DATA LABA RUGI ====== -->
      <div class="card pj-card">
        <div class="card-header">
          <div>
            <div class="card-title">${ico('table_view')} 2. Asal Setiap Angka di Laporan Laba / Rugi</div>
            <div class="pj-sub">Angka pada kolom terakhir adalah nilai bulan ${e(nama)}. Buka menu yang tertulis untuk melihat catatan aslinya.</div>
          </div>
        </div>
        <div class="table-wrap">
          <table class="pj-tabel">
            <thead>
              <tr>
                <th style="width:34px">No</th>
                <th>Baris di Laporan</th>
                <th>Diambil dari Menu</th>
                <th>Cara Dihitung</th>
                <th style="width:70px">Jml<br>Catatan</th>
                <th style="width:130px">Nilai ${e(MONTHS[m])}</th>
              </tr>
            </thead>
            <tbody>
              ${ASAL_LABA_RUGI.map(barisTabel).join('')}
              <tr class="pj-baris-total">
                <td></td>
                <td colspan="4">${labaPos ? 'Estimasi Keuntungan' : 'Estimasi Kerugian'} Bersih ${e(nama)}</td>
                <td class="pj-nilai ${labaPos ? 'amount-positive' : 'amount-negative'}">${fmt(Math.abs(lp.labaBersih))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ====== 3. UTANG PIUTANG ====== -->
      <div class="card pj-card">
        <div class="card-header">
          <div>
            <div class="card-title">${ico('menu_book')} 3. Asal Angka Utang &amp; Piutang</div>
            <div class="pj-sub">Keempat angka ini <b>tidak</b> ikut menambah atau mengurangi untung-rugi. Sifatnya catatan janji bayar, bukan uang yang sudah berpindah.</div>
          </div>
        </div>
        <div class="table-wrap">
          <table class="pj-tabel">
            <thead>
              <tr>
                <th style="width:34px">No</th>
                <th>Baris di Laporan</th>
                <th>Diambil dari Menu</th>
                <th>Cara Dihitung</th>
                <th style="width:70px">Jml<br>Catatan</th>
                <th style="width:130px">Nilai ${e(MONTHS[m])}</th>
              </tr>
            </thead>
            <tbody>${ASAL_UTANG_PIUTANG.map(barisUP).join('')}</tbody>
          </table>
        </div>
      </div>

      <!-- ====== 4. SALDO BELUM LUNAS ====== -->
      <div class="card pj-card">
        <div class="card-header">
          <div>
            <div class="card-title">${ico('savings')} 4. Sisa Saldo Belum Lunas</div>
            <div class="pj-sub">Berbeda dengan seluruh angka di atas, dua angka ini <b>tidak terikat bulan mana pun</b>.</div>
          </div>
        </div>
        <div class="pj-saldo">
          <div class="pj-saldo-item">
            <div class="pj-saldo-nama">Piutang Belum Lunas</div>
            <div class="pj-saldo-nilai amount-positive">${fmt(lp.saldoPiutang)}</div>
            <div class="pj-saldo-ket">
              Seluruh catatan di <b>Toko Utama → Piutang</b> dan <b>Rute → Rekap Piutang</b>,
              dari tanggal berapa pun, yang statusnya <b>belum</b> "Lunas".
              Angkanya turun sendiri begitu status catatan diubah jadi "Lunas".
            </div>
          </div>
          <div class="pj-saldo-item">
            <div class="pj-saldo-nama">Utang Belum Lunas</div>
            <div class="pj-saldo-nilai amount-negative">${fmt(lp.saldoUtang)}</div>
            <div class="pj-saldo-ket">
              Seluruh catatan di <b>Toko Utama → Utang</b>, dari tanggal berapa pun,
              yang statusnya <b>belum</b> "Lunas".
              Catatan <b>Tagihan (Luar Kota)</b> tidak ikut dijumlahkan di sini.
            </div>
          </div>
        </div>
      </div>

      <!-- ====== 5. ATURAN & CATATAN PENTING ====== -->
      <div class="card pj-card">
        <div class="card-header">
          <div>
            <div class="card-title">${ico('rule')} 5. Aturan yang Perlu Diketahui</div>
            <div class="pj-sub">Hal-hal yang paling sering menimbulkan salah paham saat membaca laporan.</div>
          </div>
        </div>
        <ol class="pj-aturan">
          <li>
            <b>Yang menentukan bulan adalah kolom Tanggal pada catatan itu sendiri</b> — bukan tanggal
            catatan diinput, dan bukan rentang periode/perjalanannya. Jadi satu perjalanan
            tanggal 28 Mei – 3 Juni akan terbagi ke dua laporan bulanan: yang bertanggal Mei masuk
            laporan Mei, yang bertanggal Juni masuk laporan Juni.
          </li>
          <li>
            <b>Barang Masuk dihitung penuh sebagai pengeluaran di bulan barang itu dibeli</b>,
            bukan di bulan barang itu laku. Akibatnya, bulan dengan belanja stok besar bisa terlihat
            rugi walaupun barangnya masih utuh di gudang. Nilai stok yang tersisa dapat dilihat di
            menu <b>Stok Toko</b>.
          </li>
          <li>
            <b>Penjualan dihitung saat barang keluar</b>, baik dibayar tunai maupun kredit.
            Karena itu, kalau nanti pelanggan melunasi utangnya, <u>jangan</u> dicatat lagi sebagai
            Uang Masuk — cukup ubah status piutangnya menjadi "Lunas". Kalau dicatat dua kali,
            uang yang sama akan terhitung dua kali sebagai pendapatan.
            Menu <b>Uang Masuk</b> dipakai untuk penerimaan di luar penjualan barang, misalnya DP proyek
            atau pelunasan piutang lama yang penjualannya belum pernah tercatat di aplikasi ini.
          </li>
          <li>
            <b>Utang, Piutang, dan Tagihan tidak memengaruhi laba/rugi.</b> Ketiganya baru berpengaruh
            ke uang toko saat benar-benar dibayar, dan pembayaran itulah yang dicatat di menu
            Uang Masuk atau Uang Keluar.
          </li>
          <li>
            <b>Semua angka dihitung ulang dari catatan mentah setiap kali halaman dibuka.</b>
            Tidak ada angka yang disimpan terpisah. Begitu satu catatan diperbaiki, dihapus, atau
            ditambah, laporan bulan itu langsung ikut berubah — tidak perlu menghitung ulang manual.
          </li>
          <li>
            <b>Angka di Dashboard dan di Laporan Keuangan memakai rumus yang sama persis</b>,
            sehingga keduanya tidak akan pernah berbeda untuk bulan yang sama.
          </li>
        </ol>
      </div>

      <div class="pj-footer">
        Dicetak dari aplikasi Toko Panglima Bangunan &middot; Penjelasan Laporan Keuangan bulan ${e(nama)}
      </div>`;
  }

  const allMonths = getLaporanMonths();
  let selM = now.getMonth(), selY = now.getFullYear();
  if (!allMonths.some(x => x.m === selM && x.y === selY)) {
    const last = allMonths[allMonths.length - 1];
    if (last) { selM = last.m; selY = last.y; }
  }
  const bulanOptions = [...new Set(allMonths.map(x => x.m))].sort((a, b) => a - b);
  const tahunOptions = [...new Set(allMonths.map(x => x.y))].sort((a, b) => a - b);

  content.innerHTML = `
  <div class="page-anim">
    <div class="page-header no-print" style="align-items:center;">
      <div>
        <div class="page-title">${ico('help_center',26)} Penjelasan Laporan Keuangan</div>
        <div class="page-subtitle">Dari mana setiap angka di Laporan Keuangan berasal</div>
      </div>
      <div class="filter-bar no-print" style="display:flex; align-items:center; gap:8px;">
        <label style="font-size:13px; color:var(--muted); font-weight:600;">Bulan:</label>
        <select class="form-select" id="pj-bulan" style="width:150px;">
          ${bulanOptions.map(m => `<option value="${m}" ${m === selM ? 'selected' : ''}>${MONTHS[m]}</option>`).join('')}
        </select>
        <select class="form-select" id="pj-tahun" style="width:100px;">
          ${tahunOptions.map(y => `<option value="${y}" ${y === selY ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
        <button class="btn btn-ghost" id="pj-cetak">${ico('print',17)} Cetak</button>
      </div>
    </div>
    <div id="penjelasan-isi"></div>
  </div>`;

  isiPenjelasan(selM, selY);

  const ulang = () => isiPenjelasan(
    Number(document.getElementById('pj-bulan').value),
    Number(document.getElementById('pj-tahun').value)
  );
  document.getElementById('pj-bulan').addEventListener('change', ulang);
  document.getElementById('pj-tahun').addEventListener('change', ulang);
  document.getElementById('pj-cetak').addEventListener('click', () => window.print());
}

/* ========================
   INIT
   ======================== */
async function muatDataAwal() {
  try {
    const res = await fetch('api/data.php', {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
    });

    // Belum login → ke halaman masuk
    if (res.status === 401) { window.location.replace('login.html'); return false; }

    // Bukan respons JSON (mis. server tanpa PHP) → mode demo
    const tipe = res.headers.get('content-type') || '';
    if (!res.ok || !tipe.includes('application/json')) throw new Error('API tidak tersedia');

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Gagal memuat data');

    store     = Object.assign(defaultStore(), data.store || {});
    csrfToken = data.csrf || '';
    storageMode = 'server';

    const namaEl = document.getElementById('user-nama');
    if (namaEl && data.user) {
      namaEl.textContent = data.user.nama || 'Admin';
      // di layar sempit namanya disembunyikan, jadi disimpan juga sebagai tooltip
      const chip = document.getElementById('user-chip');
      if (chip) chip.title = (data.user.nama || 'Admin') + ' — Super Admin';
    }
    return true;

  } catch (err) {
    // Fallback: jalan tanpa backend (untuk mencoba tampilan di komputer sendiri).
    storageMode = 'lokal';
    store = loadStoreLokal();
    if (!store.barangMasuk || !store.barangMasuk.length) {
      seedData();          // isi data contoh sekali saja
    }
    return true;
  }
}

/* ========================
   PENCARIAN GLOBAL (topbar)
   ======================== */
function cariGlobal(kata) {
  const q = kata.trim().toLowerCase();
  if (q.length < 2) return [];
  const cocok = (v) => v && String(v).toLowerCase().includes(q);
  const namaRute = (id) => (store.ruteList.find(r => r.id === id) || {}).nama || 'Luar Kota';
  const hasil = [];

  // Barang — digabung per nama supaya tidak berulang
  const barang = new Map();
  (store.barangMasuk || []).forEach(b => {
    if (cocok(b.nama) && !barang.has(b.nama)) barang.set(b.nama, b);
  });
  [...barang.values()].slice(0, 5).forEach(b => hasil.push({
    grup: 'Barang', ikon: 'inventory_2', nama: b.nama,
    ket: `Supplier ${b.supplier || '—'} · ${formatDate(b.tanggal)}`,
    nilai: fmt(Number(b.hargaJual || b.hargaJual1 || 0)),
    aksi: () => navigate('stok-toko', null, { cari: b.nama }),
  }));

  // Rute
  (store.ruteList || []).filter(r => cocok(r.nama)).slice(0, 4).forEach(r => hasil.push({
    grup: 'Rute', ikon: 'local_shipping', nama: `Rute ${r.nama}`,
    ket: `${(store.perjalananList || []).filter(p => p.ruteId === r.id).length} perjalanan tercatat`,
    nilai: '', aksi: () => navigate('pj-barang-terjual', r.id),
  }));

  // Faktur / pelanggan pada piutang, rekap piutang, dan penjualan
  const sumber = [
    { key: 'piutang',      label: 'Piutang',       ikon: 'credit_card',  page: 'piutang' },
    { key: 'rekapPiutang', label: 'Rekap Piutang', ikon: 'credit_card',  page: 'rekap-piutang' },
    { key: 'barangTerjual',label: 'Penjualan',     ikon: 'receipt_long', page: 'barang-terjual' },
  ];
  sumber.forEach(s => {
    (store[s.key] || [])
      .filter(x => cocok(x.noFaktur) || cocok(x.nama) || cocok(x.pelanggan))
      .slice(-4).reverse()
      .forEach(x => hasil.push({
        grup: s.label, ikon: s.ikon,
        nama: x.noFaktur ? `${x.noFaktur} — ${x.nama || x.pelanggan || ''}` : (x.nama || x.pelanggan || '—'),
        ket: `${formatDate(x.tanggal)}${x.ruteId ? ' · ' + namaRute(x.ruteId) : ''}`,
        nilai: fmt(s.key === 'barangTerjual'
                   ? Number(x.jumlah || 0) * Number(x.hargaJual || 0)
                   : Number(x.jumlah || 0)),
        aksi: () => navigate(s.page, x.ruteId || null),
      }));
  });

  return hasil.slice(0, 12);
}

function wireCariGlobal() {
  const input = document.getElementById('cari-global');
  const box   = document.getElementById('cari-hasil');
  if (!input || !box) return;

  const tutup = () => { box.hidden = true; box.innerHTML = ''; };

  const tampilkan = () => {
    const hasil = cariGlobal(input.value);
    if (!input.value.trim() || input.value.trim().length < 2) return tutup();

    if (!hasil.length) {
      box.innerHTML = `<div class="cari-kosong">Tidak ada yang cocok dengan “${e(input.value.trim())}”</div>`;
      box.hidden = false;
      return;
    }

    let html = '', grupTerakhir = '';
    hasil.forEach((h, i) => {
      if (h.grup !== grupTerakhir) { html += `<div class="cari-grup">${e(h.grup)}</div>`; grupTerakhir = h.grup; }
      html += `<button class="cari-item" data-i="${i}">
        ${ico(h.ikon, 18)}
        <span class="cari-item-teks">
          <span class="cari-item-nama">${e(h.nama)}</span>
          <span class="cari-item-ket">${e(h.ket)}</span>
        </span>
        ${h.nilai ? `<span class="cari-item-nilai">${h.nilai}</span>` : ''}
      </button>`;
    });
    box.innerHTML = html;
    box.hidden = false;
    box.querySelectorAll('.cari-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const h = hasil[Number(btn.dataset.i)];
        tutup(); input.value = '';
        if (h && h.aksi) h.aksi();
      });
    });
  };

  input.addEventListener('input', tampilkan);
  input.addEventListener('focus', tampilkan);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { input.value = ''; tutup(); input.blur(); }
    if (ev.key === 'ArrowDown') {
      const p = box.querySelector('.cari-item');
      if (p) { ev.preventDefault(); p.focus(); }
    }
  });
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('#topbar-search')) tutup();
  });
}

(async function mulai() {
  const siap = await muatDataAwal();
  if (!siap) return;

  updateDate();
  wireCariGlobal();
  renderRuteSidebar();
  navigate('dashboard', null, { replace: true });
  if (storageMode === 'lokal') setSaveStatus('lokal');

  document.getElementById('btn-global-back').addEventListener('click', () => {
    if (navDepth > 0) history.back();
  });

  const btnKeluar = document.getElementById('btn-logout');
  if (btnKeluar) {
    btnKeluar.addEventListener('click', async () => {
      // Mode demo tidak punya sesi server, jadi "keluar" berarti
      // membersihkan data contoh di browser ini.
      if (storageMode === 'lokal') {
        if (!confirm('Mulai ulang demo? Data yang kamu isi di browser ini akan dihapus.')) return;
        try { localStorage.removeItem(STORE_KEY); } catch (err) {}
        window.location.reload();
        return;
      }

      if (!confirm('Keluar dari aplikasi?')) return;
      try {
        await fetch('api/logout.php', { method: 'POST', credentials: 'same-origin' });
      } catch (err) { /* tetap arahkan ke login */ }
      window.location.replace('login.html');
    });
  }
})();
