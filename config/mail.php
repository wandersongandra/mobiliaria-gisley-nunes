<?php

return [
    // Delivery is opt-in. Never silently send real estate client data via a mail transport.
    'default' => env('MAIL_MAILER', 'log'),
    'mailers' => [
        'smtp' => [
            'transport' => 'smtp',
            'scheme' => env('MAIL_SCHEME'),
            'host' => env('MAIL_HOST', '127.0.0.1'),
            'port' => env('MAIL_PORT', 587),
            'username' => env('MAIL_USERNAME'),
            'password' => env('MAIL_PASSWORD'),
            'timeout' => 10,
        ],
        'log' => ['transport' => 'log'],
    ],
    'from' => [
        'address' => env('MAIL_FROM_ADDRESS', 'no-reply@localhost.invalid'),
        'name' => env('MAIL_FROM_NAME', 'Gisley Nunes Imóveis'),
    ],
];
