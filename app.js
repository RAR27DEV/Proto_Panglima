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
  'pj-barang-terjual': () => renderCategoryTripList(currentRuteId, 'barangTerjual'),
  'pj-rekap-piutang':  () => renderCategoryTripList(currentRuteId, 'rekapPiutang'),
  'pj-tagihan':        () => renderCategoryTripList(currentRuteId, 'tagihan'),
  'pj-uang-keluar':    () => renderCategoryTripList(currentRuteId, 'uangKeluarLK'),
  'pj-uang-masuk':     () => renderCategoryTripList(currentRuteId, 'uangMasuk'),
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
  'pj-barang-terjual': 'Barang Terjual',
  'pj-rekap-piutang':  'Rekap Piutang',
  'pj-tagihan':        'Tagihan',
  'pj-uang-keluar':    'Uang Keluar',
  'pj-uang-masuk':     'Uang Masuk',
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

  let html = '';
  store.ruteList.forEach(rute => {
    html += `
      <div class="nav-section-label collapsible" data-submenu="submenu-rute-${rute.id}">
        <span style="display:flex;align-items:center;gap:7px;">${ico('local_shipping', 17)}${e(rute.nama)}</span>
        <span class="chevron" id="chevron-rute-${rute.id}">▼</span>
      </div>
      <div class="submenu" id="submenu-rute-${rute.id}">
        <a class="nav-item" data-page="pj-barang-terjual" data-rute="${rute.id}">
          <span class="nav-icon">${ico('local_shipping')}</span><span>Barang Terjual</span>
        </a>
        <a class="nav-item" data-page="pj-rekap-piutang" data-rute="${rute.id}">
          <span class="nav-icon">${ico('receipt_long')}</span><span>Rekap Piutang</span>
        </a>
        <a class="nav-item" data-page="pj-tagihan" data-rute="${rute.id}">
          <span class="nav-icon">${ico('request_quote')}</span><span>Tagihan</span>
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
  'tutup-modal':      ()   => closeModal(),
  'lunas':            (el) => toggleLunas(el.dataset.key, el.dataset.id),
  'ubah':             (el) => openEditModal(el.dataset.key, el.dataset.id),
  'hapus':            (el) => deleteItem(el.dataset.key, el.dataset.id),
  'buka-perjalanan':  (el) => openPerjalananCategory(el.dataset.rute || null, el.dataset.pj, el.dataset.key),
  'ubah-perjalanan':  (el) => openEditPerjalanan(el.dataset.pj, el.dataset.key),
  'hapus-perjalanan': (el) => deletePerjalanan(el.dataset.pj, el.dataset.rute || null, el.dataset.key),
  'hapus-baris-bm':   (el) => bmRemoveRow(el.dataset.idx),
  'hapus-baris-bt':   (el) => btRemoveRow(el.dataset.rid),
  'edit-stok':        (el) => editStokModal(el.dataset.nama),
  'hapus-stok':       (el) => hapusStok(el.dataset.nama),
};

document.addEventListener('click', (ev) => {
  const t = ev.target;
  if (!t || !t.closest) return;

  const tujuan = t.closest('[data-nav]');
  if (tujuan) { navigate(tujuan.dataset.nav); return; }

  const el = t.closest('[data-aksi]');
  const jalankan = el && AKSI_KLIK[el.dataset.aksi];
  if (jalankan) jalankan(el);
});

/* Pilih barang dari stok -> isi satuan & harga otomatis */
document.addEventListener('change', (ev) => {
  const el = ev.target.closest?.('[data-aksi="pilih-stok"]');
  if (el) handleStockSelection(el);
});

/* Jumlah / harga diubah -> hitung ulang total baris */
document.addEventListener('input', (ev) => {
  const el = ev.target.closest?.('[data-aksi="hitung-baris-bt"]');
  if (el) btCalcRow(el.dataset.rid);
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

  const form = modalBody.querySelector('form');
  if (form && onSubmit) {
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      onSubmit(form);
    });
  }
}

function closeModal() {
  modalOverlay.classList.remove('open');
  // dibereskan setelah animasi tutup selesai, supaya modal tidak mengkerut dulu
  setTimeout(() => { modalBody.innerHTML = ''; setLebarModal(''); }, 300);
}

document.getElementById('modal-close').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (ev) => {
  if (ev.target === modalOverlay) closeModal();
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
            <div class="card-title">${ico('inventory_2')} Stok Masuk Terbaru</div>
            <button class="nx-lihat" data-nav="barang-masuk">Lihat Semua ${ico('arrow_forward',16)}</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Item</th><th>Supplier</th><th>Qty</th><th style="text-align:right">Total (Rp)</th></tr></thead>
              <tbody>
                ${barangTerbaru.length ? barangTerbaru.map(b => {
                  const qty = Number(b.jumlah1 || b.jumlah || 0);
                  const sat = e(b.satuan1 || b.satuan || '');
                  return `<tr>
                    <td class="primary">${e(b.nama)}<div class="nx-daftar-sub">${e(jarakHari(b.tanggal))}</div></td>
                    <td>${e(b.supplier || '—')}</td>
                    <td>${fmtNum(qty)} ${sat}</td>
                    <td style="text-align:right;font-weight:700;white-space:nowrap">${fmt(qty * Number(b.hargaModal || 0))}</td>
                  </tr>`;
                }).join('') : `<tr><td colspan="4" style="padding:34px;text-align:center;color:var(--muted)">Belum ada barang masuk</td></tr>`}
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
      return `
      <td class="primary">${e(b.nama)}</td>
      <td>${fmtNum(b.jumlah1 || b.jumlah)} <span class="badge badge-blue">${e(sat1)}</span></td>
      <td>${adaEcer ? `${fmtNum(b.jumlah2)} <span class="badge badge-orange">${e(b.satuan2)}</span>` : '<span class="text-muted">—</span>'}</td>
      <td>${fmt(b.hargaModal)}<br><small class="text-muted">/ ${e(sat1)}</small></td>
      <td>
        ${fmt(b.hargaJual1 || b.hargaJual)} <small class="text-muted">/ ${e(sat1)}</small>
        ${adaEcer && jual2 ? `<br>${fmt(jual2)} <small class="text-muted">/ ${e(b.satuan2)}</small>` : ''}
      </td>`;
    },
    subtotalRowFn: (rows, nama) => {
      const totalBesar = rows.reduce((s2, b) => s2 + Number(b.jumlah1 || b.jumlah || 0), 0);
      const totalEcer  = rows.reduce((s2, b) => s2 + Number(b.jumlah2 || 0), 0);
      const totalModal = rows.reduce((s2, b) => s2 + Number(b.jumlah1 || b.jumlah || 0) * Number(b.hargaModal || 0), 0);
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
      <p style="margin-bottom:8px;font-size:15px;color:var(--ink-variant)">Yakin ingin menghapus perjalanan ini?</p>
      <p style="margin-bottom:20px;font-size:13px;color:var(--muted)">Data transaksi yang sudah tercatat di dalamnya tidak akan terhapus, tapi tidak akan muncul di perjalanan manapun.</p>
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
  barangTerjual: 'barang-terjual', rekapPiutang: 'rekap-piutang', tagihan: 'tagihan',
  uangKeluarLK: 'uang-keluar-lk', uangMasuk: 'uang-masuk',
  uangKeluar: 'uang-keluar-semua',
};
const PJ_PAGE_FOR_KEY = {
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
  if (!currentPerjalananId) return null;
  const pj = store.perjalananList.find(x => x.id === currentPerjalananId);
  if (!pj || !pj.tanggalMulai || !pj.tanggalSelesai) return null;
  return { min: pj.tanggalMulai, max: pj.tanggalSelesai, pj };
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

  const html = `
  <div class="page-anim">
    <div class="page-header">
      <div>
        <div class="page-title">${cfg.icon} ${cfg.title}</div>
        <div class="page-subtitle">${lingkup} — dikelompokkan per ${G.toLowerCase()}${ruteId ? ' (sekali jalan)' : ''}</div>
      </div>
      <button class="btn btn-primary" id="btn-add-perjalanan">+ Tambah ${G}</button>
    </div>
    <div class="card">
      <div class="card-header">
        <div class="card-title">Daftar ${G}</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>No</th><th>${ruteId ? 'Periode Perjalanan' : 'Periode'}</th><th>Jumlah Data ${cfg.title}</th><th>Aksi</th></tr></thead>
          <tbody>
            ${trips.length ? trips.map((pj, i) => {
              const count = store[key].filter(x => cocokRute(x, ruteId) && x.perjalananId === pj.id).length;
              return `
              <tr>
                <td class="group-no-cell" style="width:44px;text-align:center;color:var(--muted);">${i + 1}</td>
                <td class="primary" data-aksi="buka-perjalanan" data-rute="${ruteId || ''}" data-pj="${pj.id}" data-key="${key}">${perjalananLabel(pj)}</td>
                <td>${count} data</td>
                <td>
                  <div class="actions">
                    <button class="btn btn-primary btn-sm" data-aksi="buka-perjalanan" data-rute="${ruteId || ''}" data-pj="${pj.id}" data-key="${key}">${ico('description',16)} Lihat & Cetak</button>
                    <button class="btn btn-ghost btn-sm" data-aksi="ubah-perjalanan" data-pj="${pj.id}" data-key="${key}">${ico('edit',16)} Edit</button>
                    <button class="btn btn-danger btn-sm" data-aksi="hapus-perjalanan" data-rute="${ruteId || ''}" data-pj="${pj.id}" data-key="${key}">${ico('delete',16)}</button>
                  </div>
                </td>
              </tr>`;
            }).join('') : barisKosong(4, `Belum ada ${G.toLowerCase()}`,
                  `Klik "+ Tambah ${G}" untuk mencatat ${G.toLowerCase()} pertama`)}
          </tbody>
        </table>
      </div>
    </div>

    <div style="margin-top:16px; font-size:13px; color:var(--muted);">
      Lihat riwayat lengkap ${cfg.title.toLowerCase()} (semua data, termasuk yang belum dikelompokkan ke ${G.toLowerCase()}):
      <a href="#" id="pj-legacy-link" style="color:var(--teal);">Lihat Semua</a>
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

  content.innerHTML = `
  <div class="page-anim">
    <div class="print-header" id="print-header-pj-${key}"></div>
    <div class="page-header nx-head" style="align-items:center;">
      <div class="no-print">
        <div class="page-title">${cfg.icon} ${cfg.title}</div>
        <div class="page-subtitle">${ruteId ? 'Rute ' + e(rute ? rute.nama : '') : 'Toko Utama'} — ${istilahGrup(ruteId)} ${perjalananLabel(pj)}</div>
      </div>
      <div class="no-print nx-head-aksi">
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
        <div class="print-subtitle">${ruteId ? 'Rute ' + e(rute ? rute.nama : '') : 'Toko Utama'} — ${istilahGrup(ruteId)} ${perjalananLabel(pj)}</div>
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
    `).join('');
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
  const satuanOpts = ['Kotak','Set'];
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
          ${satuanOpts.map(s => `<option value="${s}" ${(data.satuan1 || data.satuan) === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Jml (Kecil/Ecer)</label>
        <input type="number" class="form-input" name="jumlah2" value="${data.jumlah2 || data.jumlah || ''}" min="0" placeholder="(Opsional)" />
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
        <input type="number" class="form-input" name="hargaJual2" value="${data.hargaJual2 || data.hargaJual || ''}" placeholder="(Opsional)" />
      </div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-ghost" data-aksi="tutup-modal">Batal</button>
      <button type="submit" class="btn btn-primary">${ico('save',17)} Simpan</button>
    </div>
  </form>`;
}

/* ── SATUAN options helper ── */
const SATUAN_OPTS = ['Sak','Batang','Dus','Lusin','Pcs','Kaleng','Lembar','Meter','Kg','Ton','Buah','Karung','Balok','Kotak','Sat','Set'];

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
  return SATUAN_OPTS.map(s => `<option value="${s}" ${sel === s ? 'selected' : ''}>${s}</option>`).join('');
}

/* ── form MULTI-ITEM untuk Tambah Barang Masuk ── */
function buildMultiBarangMasukForm() {
  return `
  <div style="margin-bottom:16px">
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Tanggal</label>
        <input type="date" class="form-input" id="bm-tanggal" value="${attrTanggal().value}"${attrTanggal().attrs} required />
        ${petunjukTanggal()}
      </div>
      <div class="form-group">
        <label class="form-label">Nama Supplier</label>
        <input type="text" class="form-input" id="bm-supplier" placeholder="Contoh: Pak Mamat" required />
      </div>
    </div>
  </div>

  <div style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
    <span style="font-size:13px;font-weight:700;color:var(--ink)">Daftar Barang</span>
    <button type="button" class="btn btn-ghost btn-sm" id="bm-add-row">${ico('add',16)} Tambah Baris</button>
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
    <button type="button" class="btn btn-ghost" data-aksi="tutup-modal">Batal</button>
    <button type="button" class="btn btn-primary" id="bm-simpan">${ico('save',17)} Simpan Semua</button>
  </div>`;
}

function bmRowHTML(idx) {
  return `<tr id="bm-row-${idx}">
    <td style="vertical-align:top"><input type="text" class="form-input" style="width:100%" placeholder="Nama barang" data-field="nama" /></td>
    <td style="vertical-align:top">
      <input type="number" class="form-input" style="width:100%;margin-bottom:4px" placeholder="Jml" min="1" data-field="jumlah1" />
      <select class="form-select" style="width:100%" data-field="satuan1">${satuanOptions()}</select>
      <div style="margin-top:8px">
        <label style="font-size:12px; cursor:pointer;"><input type="checkbox" class="ecer-toggle" /> + Eceran?</label>
      </div>
    </td>
    <td style="vertical-align:top">
      <div class="ecer-field" style="display:none">
        <input type="number" class="form-input" style="width:100%;margin-bottom:4px" placeholder="Jml" min="0" data-field="jumlah2" />
        <select class="form-select" style="width:100%" data-field="satuan2">${satuanOptions()}</select>
      </div>
    </td>
    <td style="vertical-align:top"><input type="number" class="form-input" style="width:100%" placeholder="0" min="0" data-field="hargaModal" /></td>
    <td style="vertical-align:top">
      <input type="number" class="form-input" style="width:100%;margin-bottom:4px" placeholder="Besar" min="0" data-field="hargaJual1" />
      <input type="number" class="form-input ecer-field" style="width:100%; display:none;" placeholder="Ecer" min="0" data-field="hargaJual2" />
    </td>
    <td style="text-align:center;vertical-align:top">
      <button type="button" class="btn btn-danger btn-sm" data-aksi="hapus-baris-bm" data-idx="${idx}" title="Hapus baris">${ico('delete',16)}</button>
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

function bmRemoveRow(idx) {
  const row = document.getElementById(`bm-row-${idx}`);
  const tbody = document.getElementById('bm-rows');
  if (row && tbody && tbody.rows.length > 1) {
    row.remove();
  } else if (tbody && tbody.rows.length === 1) {
    showToast('Minimal harus ada 1 baris barang.', 'error');
  }
}

function openMultiBarangMasukModal() {
  _bmRowCount = 0;
  setLebarModal('920px');
  openModal('Tambah Barang Masuk', buildMultiBarangMasukForm(), null);

  bmAddRow();
  document.getElementById('bm-add-row').addEventListener('click', bmAddRow);

  document.getElementById('bm-simpan').addEventListener('click', () => {
    const tanggal  = document.getElementById('bm-tanggal').value.trim();
    const salahTgl = tanggalDiLuarGrup(tanggal);
    if (salahTgl) { showToast(salahTgl, 'error'); return; }
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

      if (!nama || !jumlah1 || !hargaModal || !hargaJual1) {
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
    renderList('barangMasuk');
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
   MULTI-ITEM BARANG TERJUAL
   ======================== */
function buildMultiBarangTerjualForm() {
  return `
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

  <div style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
    <span style="font-size:13px;font-weight:700;color:var(--ink)">Daftar Barang Terjual</span>
    <button type="button" class="btn btn-ghost btn-sm" id="bt-add-row">${ico('add',16)} Tambah Baris</button>
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
    <button type="button" class="btn btn-ghost" data-aksi="tutup-modal">Batal</button>
    <button type="button" class="btn btn-primary" id="bt-simpan">${ico('save',17)} Simpan Semua</button>
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
      <select class="form-select" style="width:100%" data-field="nama" data-aksi="pilih-stok" required>
        ${stockDropdownOptions()}
      </select>
    </td>
    <td><input type="number" class="form-input" style="width:100%" placeholder="0" min="1" data-field="jumlah" data-aksi="hitung-baris-bt" data-rid="${rid}" /></td>
    <td><select class="form-select" style="width:100%" data-field="satuan">${satuanOptions()}</select></td>
    <td><input type="number" class="form-input" style="width:100%" placeholder="0" min="0" data-field="hargaJual" data-aksi="hitung-baris-bt" data-rid="${rid}" /></td>
    <td><span class="bt-total" id="bt-total-${rid}" style="font-size:12px;color:var(--green);font-weight:700">Rp 0</span></td>
    <td style="text-align:center">
      <button type="button" class="btn btn-danger btn-sm" data-aksi="hapus-baris-bt" data-rid="${rid}">${ico('delete',16)}</button>
    </td>`;
  tbody.appendChild(tr);
  const select = tr.querySelector('[data-field="nama"]');
  if (select && select.value === '__MANUAL__') {
    handleStockSelection(select);
  } else if (select) {
    select.focus();
  }
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
  if (row && tbody && tbody.rows.length > 1) row.remove();
  else showToast('Minimal harus ada 1 baris barang.', 'error');
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
  setLebarModal('840px');
  openModal('Tambah Barang Terjual', buildMultiBarangTerjualForm(), null);
  btAddRow();
  document.getElementById('bt-add-row').addEventListener('click', btAddRow);
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
  openModal( `Edit ${cfg.title}`, cfg.formFn(item), (form) => {
    const fd = Object.fromEntries(new FormData(form));
    const salahTgl = tanggalDiLuarGrup(fd.tanggal);
    if (salahTgl) { showToast(salahTgl, 'error'); return false; }
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
    kolom: 'Jumlah, Harga Modal',
    rumus: 'Jumlah (satuan utama) × Harga Modal pada setiap baris barang, lalu dijumlahkan',
    hitung: (r) => r.reduce((s, b) => s + Number(b.jumlah1 || b.jumlah || 0) * Number(b.hargaModal || 0), 0) },
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
                 : key === 'barangMasuk'  ? Number(b.jumlah1 || b.jumlah || 0) * Number(b.hargaModal || 0)
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
