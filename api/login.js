// POST /api/login — autentikasi pengguna
import bcrypt from 'bcryptjs';
import { getSupabase, jsonErr, createSession } from '../lib/auth.js';

const MAX_GAGAL = 5;
const KUNCI_MENIT = 15;

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonErr(res, 405, 'Metode tidak diizinkan.');

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');

  if (!username || !password) return jsonErr(res, 400, 'Username dan password wajib diisi.');

  const supabase = getSupabase();

  try {
    const { data: users, error } = await supabase
      .from('pengguna')
      .select('id,username,password_hash,nama_tampilan,gagal_login,terkunci_sampai')
      .eq('username', username.substring(0, 50))
      .limit(1);

    if (error) throw error;

    const user = users?.[0];

    // Username tidak ada — tetap compare hash dummy anti-timing-attack
    const hashDummy = '$2a$12$invalidhashsupayatidakbisaditebak123456789ABCDEF';
    const hash = user?.password_hash ?? hashDummy;

    // Cek apakah akun terkunci
    if (user?.terkunci_sampai && new Date(user.terkunci_sampai) > new Date()) {
      return jsonErr(res, 403, `Akun dikunci ${KUNCI_MENIT} menit karena terlalu banyak percobaan gagal.`);
    }

    const cocok = await bcrypt.compare(password, hash);

    if (!cocok || !user) {
      if (user) {
        const gagalBaru = (user.gagal_login ?? 0) + 1;
        const kunci = gagalBaru >= MAX_GAGAL
          ? new Date(Date.now() + KUNCI_MENIT * 60 * 1000).toISOString()
          : null;
        await supabase.from('pengguna').update({
          gagal_login: gagalBaru,
          terkunci_sampai: kunci,
        }).eq('id', user.id);
      }
      return jsonErr(res, 401, 'Username atau password salah.');
    }

    // Reset gagal login
    await supabase.from('pengguna').update({
      gagal_login: 0,
      terkunci_sampai: null,
      login_terakhir: new Date().toISOString(),
    }).eq('id', user.id);

    // Buat sesi
    const token = await createSession(supabase, user, req);

    // Set cookie sesi
    res.setHeader('Set-Cookie', [
      `TPSESS=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${8 * 3600}; Secure`,
    ]);

    return res.status(200).json({
      ok: true,
      user: { nama: user.nama_tampilan, username: user.username },
      csrf: token,
    });
  } catch (e) {
    console.error('login.js error:', e);
    return jsonErr(res, 500, 'Terjadi kesalahan server.');
  }
}
