<?php
/**
 * Bootstrap bersama: konfigurasi, header keamanan, sesi, koneksi DB, helper.
 * Semua endpoint API memuat file ini lebih dulu.
 */

declare(strict_types=1);

// Jangan tampilkan detail error ke pengunjung (bisa membocorkan struktur sistem).
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

// ---------------------------------------------------------------
// Konfigurasi
// ---------------------------------------------------------------
$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'Konfigurasi belum dibuat. Salin api/config.example.php menjadi api/config.php.']);
    exit;
}
$CONFIG = require $configFile;

// ---------------------------------------------------------------
// Paksa HTTPS
// ---------------------------------------------------------------
$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
    || (($_SERVER['SERVER_PORT'] ?? '') === '443');

if (!empty($CONFIG['force_https']) && !$isHttps && PHP_SAPI !== 'cli') {
    $to = 'https://' . ($_SERVER['HTTP_HOST'] ?? '') . ($_SERVER['REQUEST_URI'] ?? '/');
    header('Location: ' . $to, true, 301);
    exit;
}

// ---------------------------------------------------------------
// Header keamanan
// ---------------------------------------------------------------
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');                       // cegah clickjacking
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: geolocation=(), microphone=(), camera=()');
if ($isHttps) {
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
}

// ---------------------------------------------------------------
// Sesi aman
// ---------------------------------------------------------------
if (session_status() === PHP_SESSION_NONE) {
    session_name($CONFIG['session_name'] ?? 'TPSESS');
    session_set_cookie_params([
        'lifetime' => 0,          // hilang saat browser ditutup
        'path'     => '/',
        'secure'   => $isHttps,   // hanya dikirim lewat HTTPS
        'httponly' => true,       // tidak bisa dibaca JavaScript (anti pencurian sesi via XSS)
        'samesite' => 'Strict',   // tidak ikut terkirim dari situs lain (anti CSRF)
    ]);
    session_start();
}

// Auto-logout kalau menganggur terlalu lama
$idleMax = (int)($CONFIG['session_idle_timeout'] ?? 28800);
if (isset($_SESSION['last_seen']) && (time() - (int)$_SESSION['last_seen']) > $idleMax) {
    session_unset();
    session_destroy();
    session_start();
}
$_SESSION['last_seen'] = time();

// ---------------------------------------------------------------
// Koneksi database (PDO + prepared statement = anti SQL injection)
// ---------------------------------------------------------------
function dbDriver(): string
{
    global $CONFIG;
    return ($CONFIG['db_driver'] ?? 'mysql') === 'sqlite' ? 'sqlite' : 'mysql';
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    global $CONFIG;
    $opts = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,   // prepared statement asli, bukan tiruan
        PDO::ATTR_STRINGIFY_FETCHES  => false,
    ];

    try {
        if (dbDriver() === 'sqlite') {
            // Hanya untuk uji coba di komputer sendiri.
            $pdo = new PDO('sqlite:' . $CONFIG['db_file'], null, null, $opts);
            $pdo->exec('PRAGMA foreign_keys = ON');
        } else {
            // Produksi (Rumahweb / cPanel)
            $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $CONFIG['db_host'], $CONFIG['db_name']);
            $pdo = new PDO($dsn, $CONFIG['db_user'], $CONFIG['db_pass'], $opts);
        }
    } catch (Throwable $e) {
        error_log('DB connect gagal: ' . $e->getMessage());
        jsonOut(['ok' => false, 'error' => 'Tidak bisa terhubung ke database.'], 500);
    }
    return $pdo;
}

// ---------------------------------------------------------------
// Helper
// ---------------------------------------------------------------
function jsonOut(array $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function jsonBody(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if (strlen($raw) > 8 * 1024 * 1024) {           // batas 8 MB
        jsonOut(['ok' => false, 'error' => 'Data terlalu besar.'], 413);
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/** Token CSRF — mencegah situs lain mengirim perintah atas nama pengguna. */
function csrfToken(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function requireCsrf(): void
{
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (empty($_SESSION['csrf']) || !is_string($sent) || !hash_equals($_SESSION['csrf'], $sent)) {
        jsonOut(['ok' => false, 'error' => 'Token keamanan tidak valid. Muat ulang halaman.'], 419);
    }
}

function requireLogin(): int
{
    if (empty($_SESSION['uid'])) {
        jsonOut(['ok' => false, 'error' => 'Belum login.', 'auth' => false], 401);
    }
    return (int)$_SESSION['uid'];
}

function requireMethod(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
        jsonOut(['ok' => false, 'error' => 'Metode tidak diizinkan.'], 405);
    }
}

function clientIp(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}

function catatLog(?int $uid, string $aksi, string $ket = ''): void
{
    try {
        db()->prepare('INSERT INTO log_aktivitas (pengguna_id, aksi, keterangan, ip) VALUES (?,?,?,?)')
            ->execute([$uid, substr($aksi, 0, 60), substr($ket, 0, 255), clientIp()]);
    } catch (Throwable $e) {
        error_log('Gagal catat log: ' . $e->getMessage());
    }
}
