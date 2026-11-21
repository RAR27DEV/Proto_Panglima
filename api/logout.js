// POST /api/logout — keluar dari sesi
import { getSupabase, jsonErr } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonErr(res, 405, 'Metode tidak diizinkan.');

  const cookie = req.headers.cookie ?? '';
  const token = cookie.match(/TPSESS=([^;]+)/)?.[1];

  if (token) {
    try {
      const supabase = getSupabase();
      await supabase.from('sesi').delete().eq('token', token);
    } catch (e) {
      // ignore
    }
  }

  res.setHeader('Set-Cookie', 'TPSESS=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax; Secure');
  return res.status(200).json({ ok: true });
}
