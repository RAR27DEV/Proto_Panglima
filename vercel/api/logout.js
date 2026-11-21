// POST /api/logout
import { createClient } from '@supabase/supabase-js';
import { jsonErr } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonErr(res, 405, 'Metode tidak diizinkan.');

  const cookie = req.headers.cookie ?? '';
  const token = cookie.match(/TPSESS=([^;]+)/)?.[1];

  if (token) {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    await supabase.from('sesi').delete().eq('token', token).catch(() => {});
  }

  res.setHeader('Set-Cookie', 'TPSESS=; Path=/; HttpOnly; Max-Age=0; SameSite=Strict');
  return res.status(200).json({ ok: true });
}
