// POST /api/save — simpan data toko
import { getSupabase, verifySession, verifyCsrf, jsonErr } from '../lib/auth.js';
import { SCHEMA_MAP } from '../lib/schema_map.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonErr(res, 405, 'Metode tidak diizinkan.');

  const session = await verifySession(req, res);
  if (!session) return;

  if (!verifyCsrf(req, session)) {
    return jsonErr(res, 419, 'Token keamanan tidak valid. Muat ulang halaman.');
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const input = body?.store;
  if (!input || typeof input !== 'object') {
    return jsonErr(res, 400, 'Format data tidak valid.');
  }

  const supabase = getSupabase();
  const ringkas = {};

  try {
    for (const [koleksi, def] of Object.entries(SCHEMA_MAP)) {
      const rows = Array.isArray(input[koleksi]) ? input[koleksi] : [];
      const tabel = def.tabel;
      const idsMasuk = [];

      const toUpsert = [];
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const id = String(row.id ?? '').trim();
        if (!id || !/^[A-Za-z0-9_-]{1,40}$/.test(id)) continue;
        idsMasuk.push(id);

        const dbRow = {};
        for (const [js, db] of Object.entries(def.kolom)) {
          if (js === 'id') { dbRow[db] = id; continue; }
          let val = row[js] ?? null;

          if (def.angka.includes(js)) {
            val = val === '' || val === null ? null : isNaN(Number(val)) ? null : Math.round(Number(val) * 100) / 100;
          } else if (def.tanggal.includes(js)) {
            val = val && /^\d{4}-\d{2}-\d{2}$/.test(String(val)) ? String(val) : null;
          } else if (def.enum[js]) {
            val = def.enum[js].includes(val) ? val : def.enum[js][1] ?? def.enum[js][0];
          } else {
            val = val === null ? null : String(val).substring(0, 255);
          }
          dbRow[db] = val;
        }
        toUpsert.push(dbRow);
      }

      // Upsert data baru/update
      if (toUpsert.length > 0) {
        const { error } = await supabase.from(tabel).upsert(toUpsert, { onConflict: 'id' });
        if (error) throw error;
      }

      // Hapus data yang sudah dibuang di client
      if (idsMasuk.length > 0) {
        const { error } = await supabase.from(tabel).delete().not('id', 'in', `(${idsMasuk.join(',')})`);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(tabel).delete().neq('id', '');
        if (error) throw error;
      }

      ringkas[koleksi] = idsMasuk.length;
    }

    // Catat riwayat log aktivitas
    await supabase.from('log_aktivitas').insert({
      pengguna_id: session.id,
      aksi: 'simpan_data',
      keterangan: JSON.stringify(ringkas),
      ip: req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? null,
    });

    return res.status(200).json({ ok: true, tersimpan: ringkas });
  } catch (e) {
    console.error('save.js error:', e);
    return jsonErr(res, 500, 'Gagal menyimpan data.');
  }
}
