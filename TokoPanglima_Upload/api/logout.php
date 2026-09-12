<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
requireMethod('POST');

if (!empty($_SESSION['uid'])) {
    catatLog((int)$_SESSION['uid'], 'logout', (string)($_SESSION['uname'] ?? ''));
}

$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires'  => time() - 42000,
        'path'     => $p['path'],
        'domain'   => $p['domain'],
        'secure'   => $p['secure'],
        'httponly' => $p['httponly'],
        'samesite' => $p['samesite'] ?? 'Strict',
    ]);
}
session_destroy();

jsonOut(['ok' => true]);
