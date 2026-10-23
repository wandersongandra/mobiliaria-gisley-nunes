<?php

$mediaRoot = trim((string) env('MEDIA_ROOT', storage_path('app/private/media')));
if ($mediaRoot !== '' && preg_match('~^(?:[A-Za-z]:[\\\\/]|[\\\\/]{1,2})~', $mediaRoot) !== 1) {
    $mediaRoot = base_path($mediaRoot);
}

return [
    'default' => env('FILESYSTEM_DISK', 'local'),

    'disks' => [
        // O disco privado é usado pela camada LocalMediaStorage. A aplicação
        // entrega os arquivos por controllers que validam o registro no banco.
        'local' => [
            'driver' => 'local',
            'root' => $mediaRoot,
            'serve' => false,
            'throw' => false,
            'report' => false,
        ],
    ],

    'links' => [],
];
