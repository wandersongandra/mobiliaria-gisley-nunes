<?php

use Illuminate\Support\Str;

$mysqlConnectionOptions = [];
if (extension_loaded('pdo_mysql')) {
    $sslCaAttribute = defined('Pdo\\Mysql::ATTR_SSL_CA')
        ? (int) constant('Pdo\\Mysql::ATTR_SSL_CA')
        : PDO::MYSQL_ATTR_SSL_CA;
    $sslVerifyAttribute = defined('Pdo\\Mysql::ATTR_SSL_VERIFY_SERVER_CERT')
        ? (int) constant('Pdo\\Mysql::ATTR_SSL_VERIFY_SERVER_CERT')
        : PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT;

    $mysqlConnectionOptions = array_filter([
        PDO::ATTR_TIMEOUT => 10,
        $sslCaAttribute => env('MYSQL_ATTR_SSL_CA'),
        $sslVerifyAttribute => env('MYSQL_ATTR_SSL_CA') ? env('DB_SSL_VERIFY', true) : null,
    ], static fn ($value) => $value !== null && $value !== '');
}

return [
    'default' => env('DB_CONNECTION', 'mysql'),

    'connections' => [
        'sqlite' => [
            'driver' => 'sqlite',
            'url' => env('DB_URL'),
            'database' => env('DB_DATABASE', database_path('database.sqlite')),
            'prefix' => '',
            'foreign_key_constraints' => env('DB_FOREIGN_KEYS', true),
            'busy_timeout' => null,
            'journal_mode' => null,
            'synchronous' => null,
        ],

        'mysql' => [
            'driver' => 'mysql',
            'url' => env('DATABASE_URL'),
            'host' => env('DB_HOST', '127.0.0.1'),
            'port' => env('DB_PORT', '3306'),
            'database' => env('DB_DATABASE', 'gisley_nunes'),
            'username' => env('DB_USERNAME', 'root'),
            'password' => env('DB_PASSWORD', ''),
            'unix_socket' => env('DB_SOCKET', ''),
            'charset' => env('DB_CHARSET', 'utf8mb4'),
            'collation' => env('DB_COLLATION', 'utf8mb4_unicode_ci'),
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => 'InnoDB',
            'options' => $mysqlConnectionOptions,
        ],
    ],

    'migrations' => [
        'table' => 'migrations',
        'update_date_on_publish' => true,
    ],

    'redis' => [
        'client' => env('REDIS_CLIENT', 'phpredis'),
        'options' => [
            'cluster' => env('REDIS_CLUSTER', 'redis'),
            'prefix' => env('REDIS_PREFIX', Str::slug((string) env('APP_NAME', 'gisley-nunes')).'-database-'),
        ],
    ],
];
