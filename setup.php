<?php
/**
 * Halaman setup SEKALI PAKAI — membuat akun login pertama.
 * HAPUS FILE INI setelah akun berhasil dibuat.
 */
declare(strict_types=1);
require __DIR__ . '/api/bootstrap.php';

$pesan = '';
$sukses = false;

try {
    $sudahAda = (int) db()->query('SELECT COUNT(*) FROM pengguna')->fetchColumn();
} catch (Throwable $e) {
    http_response_code(500);
    echo '<p style="font-family:sans-serif">Database belum siap. Jalankan <code>sql/schema.sql</code> dulu lewat phpMyAdmin.</p>';
    exit;
}

if ($sudahAda > 0) {
    http_response_code(403);
    echo '<p style="font-family:sans-serif;max-width:40em;margin:3em auto">'
       . 'Akun sudah pernah dibuat, jadi halaman setup dinonaktifkan.<br><br>'
       . '<strong>Silakan hapus file <code>setup.php</code> dari hosting sekarang.</strong></p>';
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    if (!hash_equals($_SESSION['csrf'] ?? '', (string)($_POST['csrf'] ?? ''))) {
        $pesan = 'Token keamanan tidak valid. Muat ulang halaman.';
    } else {
        $u  = trim((string)($_POST['username'] ?? ''));
        $p  = (string)($_POST['password'] ?? '');
        $p2 = (string)($_POST['password2'] ?? '');
        $n  = trim((string)($_POST['nama'] ?? 'Admin Toko'));

        if (!preg_match('/^[A-Za-z0-9._-]{3,50}$/', $u)) {
            $pesan = 'Username 3–50 karakter, hanya huruf/angka/titik/garis.';
        } elseif (mb_strlen($p) < 10) {
            $pesan = 'Sandi minimal 10 karakter.';
        } elseif ($p !== $p2) {
            $pesan = 'Konfirmasi sandi tidak sama.';
        } else {
            $hash = password_hash($p, PASSWORD_BCRYPT, ['cost' => 12]);
            db()->prepare('INSERT INTO pengguna (username, password_hash, nama_tampilan) VALUES (?,?,?)')
                ->execute([$u, $hash, $n !== '' ? $n : 'Admin Toko']);
            catatLog(null, 'setup_akun', $u);
            $sukses = true;
        }
    }
}
$token = csrfToken();
?>
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Setup Awal — Toko Panglima</title>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Hanken Grotesk",system-ui,sans-serif;background:#F7F9FB;color:#191C1E;
       display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
  .box{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:32px;max-width:440px;width:100%;
       box-shadow:0 1px 2px rgba(15,23,42,.04)}
  h1{font-size:22px;font-weight:700;margin-bottom:6px}
  .sub{color:#64748B;font-size:14px;margin-bottom:24px}
  label{display:block;font-family:Inter,sans-serif;font-size:12px;font-weight:600;margin:14px 0 6px}
  input{width:100%;padding:10px 12px;border:1px solid #CBD5E1;border-radius:4px;font:inherit;font-size:14px}
  input:focus{outline:none;border-color:#0D9488;box-shadow:0 0 0 3px rgba(13,148,136,.12)}
  button{width:100%;margin-top:22px;padding:12px;background:#0D9488;color:#fff;border:0;border-radius:4px;
         font:inherit;font-size:14px;font-weight:700;cursor:pointer}
  button:hover{background:#0B8177}
  .err{background:#FEE2E2;color:#B91C1C;padding:10px 12px;border-radius:4px;font-size:13.5px;margin-bottom:16px}
  .ok{background:#DCFCE7;color:#15803D;padding:14px;border-radius:4px;font-size:14px;line-height:1.6}
  .warn{background:#FEF3C7;color:#B45309;padding:12px;border-radius:4px;font-size:13px;margin-top:18px;line-height:1.55}
  code{background:#ECEEF0;padding:1px 5px;border-radius:3px;font-size:12.5px}
</style>
</head>
<body>
<div class="box">
<?php if ($sukses): ?>
  <h1>Akun berhasil dibuat</h1>
  <div class="ok">
    Sekarang kamu bisa masuk lewat halaman <a href="login.html">login</a>.
  </div>
  <div class="warn">
    <strong>Langkah wajib terakhir:</strong> hapus file <code>setup.php</code> dari hosting.
    Selama file ini masih ada, ia tetap jadi celah yang tidak perlu.
  </div>
<?php else: ?>
  <h1>Setup Awal</h1>
  <p class="sub">Buat akun login untuk Toko Panglima Bangunan. Halaman ini hanya bisa dipakai sekali.</p>
  <?php if ($pesan): ?><div class="err"><?= htmlspecialchars($pesan, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
  <form method="post" autocomplete="off">
    <input type="hidden" name="csrf" value="<?= htmlspecialchars($token, ENT_QUOTES, 'UTF-8') ?>">
    <label for="nama">Nama tampilan</label>
    <input id="nama" name="nama" value="Admin Toko" maxlength="100">
    <label for="username">Username</label>
    <input id="username" name="username" required maxlength="50" placeholder="admin">
    <label for="password">Sandi (minimal 10 karakter)</label>
    <input id="password" name="password" type="password" required minlength="10">
    <label for="password2">Ulangi sandi</label>
    <input id="password2" name="password2" type="password" required minlength="10">
    <button type="submit">Buat Akun</button>
  </form>
<?php endif; ?>
</div>
</body>
</html>
