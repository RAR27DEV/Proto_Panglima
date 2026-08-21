/* ============================================================
   Halaman login — mengirim kredensial ke api/login.php
   ============================================================ */
'use strict';

(function () {
  const form   = document.getElementById('login-form');
  const btn    = document.getElementById('btn-login');
  const alertB = document.getElementById('alert');
  const alertM = document.getElementById('alert-msg');

  function tampilError(pesan) {
    alertM.textContent = pesan;
    alertB.classList.add('show');
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
})();
