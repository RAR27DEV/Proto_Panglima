/* ============================================================
   Halaman login — mengirim kredensial ke api/login.php

   Kalau backend PHP tidak tersedia (mis. dipasang di hosting statis
   seperti Vercel untuk keperluan demo), form login diganti tombol
   "Lihat Demo" supaya halaman ini tidak jadi jalan buntu.
   ============================================================ */
'use strict';

(function () {
  const form   = document.getElementById('login-form');
  const btn    = document.getElementById('btn-login');
  const alertB = document.getElementById('alert');
  const alertM = document.getElementById('alert-msg');
  const demoB  = document.getElementById('demo-note');
  const btnDemo = document.getElementById('btn-demo');

  function tampilError(pesan) {
    alertM.textContent = pesan;
    alertB.classList.add('show');
  }

  /* ── Apakah backend PHP benar-benar ada di server ini? ──
        401  = backend ada, hanya belum login
        JSON = backend ada
        lain = tidak ada PHP (404 / halaman HTML) → mode demo          */
  async function backendTersedia() {
    try {
      const res = await fetch('api/data.php', {
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' },
      });
      if (res.status === 401) return true;
      return (res.headers.get('content-type') || '').includes('application/json');
    } catch (err) {
      return false;
    }
  }

  function pakaiModeDemo() {
    form.hidden = true;
    document.querySelector('.login-card .lead').textContent =
      'Backend tidak aktif di server ini.';
    demoB.classList.add('show');
    btnDemo.hidden = false;
    btnDemo.addEventListener('click', () => {
      window.location.replace('index.html');
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertB.classList.remove('show');

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    if (!username || !password) return;

    btn.disabled = true;
    btn.textContent = 'Memeriksa…';

    try {
      const res = await fetch('api/login.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        window.location.replace('index.html');
        return;
      }
      tampilError(data.error || 'Gagal masuk. Coba lagi.');
    } catch (err) {
      tampilError('Tidak bisa menghubungi server. Periksa koneksi internet.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Masuk';
      document.getElementById('password').value = '';
    }
  });

  backendTersedia().then((ada) => { if (!ada) pakaiModeDemo(); });
})();
