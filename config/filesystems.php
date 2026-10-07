<?php

return [
    'default' => env('FILESYSTEM_DISK', 'local'),

    'disks' => [
        // Fotos do catálogo ficam somente no R2. Não expor uma rota Laravel
        // para o disco local privado evita criar um segundo canal de arquivos.
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
