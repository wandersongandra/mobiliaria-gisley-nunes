<?php

return [
    'default' => env('FILESYSTEM_DISK', 'local'),

    'disks' => [
        // Fotos do catálogo ficam somente no R2. O upload passa pelo backend
        // para não depender de CORS administrativo no bucket.
        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'serve' => false,
            'throw' => false,
            'report' => false,
        ],
    ],

    'links' => [],
];
