<?php

return [
    // Hospedagem compartilhada não mantém workers persistentes. Jobs deste
    // projeto executam síncronos por padrão; "database" exige cron externo.
    'default' => env('QUEUE_CONNECTION', 'sync'),

    'connections' => [
        'sync' => [
            'driver' => 'sync',
        ],

        'database' => [
            'driver' => 'database',
            'table' => 'jobs',
            'queue' => 'default',
            'retry_after' => 90,
            'after_commit' => false,
        ],
    ],
];
