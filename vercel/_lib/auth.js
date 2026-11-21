// Helper: autentikasi & sesi (dipakai semua endpoint)
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export function jsonErr(res, status, msg) {
  return res.status(status).json({ ok: false, error: msg });
}

/** Buat token sesi baru dan simpan ke DB. */
export async function createSession(supabase, user, req) {
  const token = crypto.randomBytes(32).toString('hex');
  await supabase.from('sesi').insert({
    token,
    pengguna_id: user.id,
    ip: req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? null,
  });
  return token;
}

/** Verifikasi cookie sesi — kembalikan data pengguna atau null. */
export async function verifySession(req, res) {
  const cookie = req.headers.cookie ?? '';
  const token = cookie.match(/TPSESS=([^;]+)/)?.[1];

  if (!token) {
    jsonErr(res, 401, 'Belum login.');
    return null;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // Cek sesi & idle timeout (8 jam)
  const { data: sesiRows } = await supabase
    .from('sesi')
    .select('pengguna_id, terakhir_aktif')
    .eq('token', token)
    .limit(1);

  const sesi = sesiRows?.[0];
  if (!sesi) {
    jsonErr(res, 401, 'Sesi tidak valid. Silakan login kembali.');
    return null;
  }

  const idleMax = 8 * 60 * 60 * 1000; // 8 jam
  if (Date.now() - new Date(sesi.terakhir_aktif).getTime() > idleMax) {
    await supabase.from('sesi').delete().eq('token', token);
    jsonErr(res, 401, 'Sesi habis. Silakan login kembali.');
    return null;
  }

  // Perbarui waktu aktif
  await supabase.from('sesi').update({ terakhir_aktif: new Date().toISOString() }).eq('token', token);

  // Ambil data pengguna
  const { data: users } = await supabase
    .from('pengguna')
    .select('id, username, nama_tampilan')
    .eq('id', sesi.pengguna_id)
    .limit(1);

  const user = users?.[0];
  if (!user) {
    jsonErr(res, 401, 'Pengguna tidak ditemukan.');
    return null;
  }

  return { ...user, token }; // token dipakai sebagai CSRF
}

/** Verifikasi CSRF token dari header X-CSRF-Token. */
export function verifyCsrf(req, session) {
  const sent = req.headers['x-csrf-token'] ?? '';
  return sent && session.token && sent === session.token;
}
