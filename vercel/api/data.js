// GET /api/data — ambil semua data toko
// Vercel Serverless Function (Node.js)
import { createClient } from '@supabase/supabase-js';
import { verifySession, jsonErr } from '../_lib/auth.js';
import { SCHEMA_MAP } from '../_lib/schema_map.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return jsonErr(res, 405, 'Metode tidak diizinkan.');

  const session = await verifySession(req, res);
  if (!session) return; // verifySession sudah kirim 401

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  try {
    const store = {};

    for (const [koleksi, def] of Object.entries(SCHEMA_MAP)) {
      const cols = Object.entries(def.kolom)
        .map(([js, db]) => `${db}:${js}`) // alias: db_col:jsName
        .join(',');

      let q = supabase.from(def.tabel).select(cols);
      if (koleksi === 'ruteList') q = q.order('urutan').order('nama');
      else if (def.kolom.tanggal) q = q.order('tanggal').order('id');

      const { data, error } = await q;
      if (error) throw error;

      // Rapikan tipe angka
      store[koleksi] = (data || []).map(row => {
        const r = { ...row };
        for (const f of def.angka) {
          if (r[f] !== null && r[f] !== undefined) r[f] = Number(r[f]);
        }
        return r;
      });
    }

    return res.status(200).json({
      ok: true,
      store,
      user: { nama: session.nama_tampilan, username: session.username },
      csrf: session.token, // pakai token sesi sebagai CSRF
    });
  } catch (e) {
    console.error('data.js error:', e);
    return jsonErr(res, 500, 'Gagal memuat data.');
  }
}

