<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
requireMethod('POST');

$body     = jsonBody();
$username = trim((string)($body['username'] ?? ''));
$password = (string)($body['password'] ?? '');

if ($username === '' || $password === '') {
    jsonOut(['ok' => false, 'error' => 'Username dan sandi wajib diisi.'], 400);
}

$maxTry   = (int)($CONFIG['max_login_attempts'] ?? 5);
$lockMins = (int)($CONFIG['lockout_minutes'] ?? 15);

try {
    $st = db()->prepare('SELECT id, username, password_hash, nama_tampilan, gagal_login, terkunci_sampai
                         FROM pengguna WHERE username = ? LIMIT 1');
    $st->execute([$username]);
    $user = $st->fetch();

    // Akun terkunci sementara?
    if ($user && !empty($user['terkunci_sampai']) && strtotime((string)$user['terkunci_sampai']) > time()) {
        $sisa = (int)ceil((strtotime((string)$user['terkunci_sampai']) - time()) / 60);
        catatLog((int)$user['id'], 'login_terkunci', $username);
        jsonOut(['ok' => false, 'error' => "Terlalu banyak percobaan gagal. Coba lagi dalam {$sisa} menit."], 429);
    }

    // password_verify aman terhadap timing attack.
    // Kalau user tidak ada, tetap jalankan hash palsu supaya waktu responsnya mirip
    // (kalau tidak, penyerang bisa menebak username mana yang valid dari kecepatan balasan).
    $valid = $user
        ? password_verify($password, (string)$user['password_hash'])
        : password_verify($password, '$2y$12$usesomesillystringforeseeadlwGqDkTThOHtR1nD/lYbNvAyHFV.O');

    if (!$valid) {
        if ($user) {
            $gagal = (int)$user['gagal_login'] + 1;
            $kunci = $gagal >= $maxTry
                ? date('Y-m-d H:i:s', time() + $lockMins * 60)
                : null;
            db()->prepare('UPDATE pengguna SET gagal_login = ?, terkunci_sampai = ? WHERE id = ?')
                ->execute([$gagal, $kunci, $user['id']]);
            catatLog((int)$user['id'], 'login_gagal', $username);
        } else {
            catatLog(null, 'login_gagal', $username . ' (user tidak ada)');
        }
        // Pesan sengaja disamakan: jangan beri tahu mana yang salah (username atau sandi).
        usleep(300000); // 0,3 detik — memperlambat serangan tebak beruntun
        jsonOut(['ok' => false, 'error' => 'Username atau sandi salah.'], 401);
    }

    // --- Berhasil ---
    session_regenerate_id(true);      // cegah session fixation
    $_SESSION['uid']       = (int)$user['id'];
    $_SESSION['uname']     = (string)$user['username'];
    $_SESSION['nama']      = (string)$user['nama_tampilan'];
    $_SESSION['last_seen'] = time();
    unset($_SESSION['csrf']);         // token baru untuk sesi baru

    // CURRENT_TIMESTAMP berlaku di MySQL/MariaDB maupun SQLite (NOW() hanya MySQL)
    db()->prepare('UPDATE pengguna SET gagal_login = 0, terkunci_sampai = NULL, login_terakhir = CURRENT_TIMESTAMP WHERE id = ?')
        ->execute([$user['id']]);
    catatLog((int)$user['id'], 'login_sukses', $username);

    jsonOut([
        'ok'    => true,
        'user'  => ['nama' => $user['nama_tampilan'], 'username' => $user['username']],
        'csrf'  => csrfToken(),
    ]);
} catch (Throwable $e) {
    error_log('login.php: ' . $e->getMessage());
    jsonOut(['ok' => false, 'error' => 'Terjadi kesalahan pada server.'], 500);
}
