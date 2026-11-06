<?php

declare(strict_types=1);

// One-time HostGator setup: copy the Laravel connection settings into a
// private MySQL client option file without printing the password in a shell.
if (PHP_SAPI !== 'cli' || $argc !== 2 || ! str_starts_with($argv[1], '/')) {
    fwrite(STDERR, "Usage: php scripts/setup-hostgator-local-db.php /absolute/private/mysql.cnf\n");
    exit(2);
}

$destination = $argv[1];
$applicationRoot = realpath(__DIR__.'/..');
$parent = realpath(dirname($destination));
if ($parent === false || $applicationRoot === false || str_starts_with($parent.'/', $applicationRoot.'/')
    || $parent === $applicationRoot || is_link($destination) || file_exists($destination)) {
    fwrite(STDERR, "Invalid destination: use a new file outside the application tree.\n");
    exit(1);
}

require $applicationRoot.'/vendor/autoload.php';
$app = require $applicationRoot.'/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$connection = \Illuminate\Support\Facades\DB::connection();
$config = $connection->getConfig();
if ($connection->getDriverName() !== 'mysql') {
    fwrite(STDERR, "Only the configured production MySQL connection is supported.\n");
    exit(1);
}
if (! is_string($config['username'] ?? null) || $config['username'] === ''
    || ! is_string($config['database'] ?? null) || $config['database'] === '') {
    fwrite(STDERR, "MySQL connection is not fully configured.\n");
    exit(1);
}

$quote = static function (mixed $value): string {
    $string = (string) $value;
    if (preg_match('/[\x00-\x1F\x7F]/', $string)) {
        throw new RuntimeException('Invalid control character in MySQL configuration.');
    }

    return '"'.str_replace(['\\', '"'], ['\\\\', '\\"'], $string).'"';
};

$options = [
    '[client]',
    'user='.$quote($config['username'] ?? ''),
    'password='.$quote($config['password'] ?? ''),
    'default-character-set=utf8mb4',
];
if (! empty($config['unix_socket'])) {
    $options[] = 'socket='.$quote($config['unix_socket']);
} else {
    $options[] = 'host='.$quote($config['host'] ?? '127.0.0.1');
    $options[] = 'port='.$quote($config['port'] ?? '3306');
}

umask(0077);
$stream = fopen($destination, 'x');
if ($stream === false) {
    fwrite(STDERR, "Unable to create private MySQL configuration.\n");
    exit(1);
}

try {
    if (! chmod($destination, 0600)) {
        throw new RuntimeException('Could not set private permissions.');
    }
    $contents = implode("\n", $options)."\n";
    $written = fwrite($stream, $contents);
    if ($written !== strlen($contents)) {
        throw new RuntimeException('Could not write MySQL configuration.');
    }
    fclose($stream);
} catch (Throwable $exception) {
    fclose($stream);
    unlink($destination);
    fwrite(STDERR, "Could not securely create MySQL configuration.\n");
    exit(1);
}

echo "Private MySQL backup configuration created (mode 600).\n";
