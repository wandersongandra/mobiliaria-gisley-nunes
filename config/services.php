<?php

return [
    'manus_oauth' => [
        'portal_url' => env('MANUS_OAUTH_PORTAL_URL'),
        'api_url' => env('MANUS_OAUTH_API_URL'),
        'project_id' => env('MANUS_PROJECT_ID'),
    ],

    'r2' => [
        'account_id' => env('R2_ACCOUNT_ID'),
        'bucket' => env('R2_BUCKET', 'gisley-nunes-imoveis'),
        'access_key_id' => env('R2_ACCESS_KEY_ID'),
        'secret_access_key' => env('R2_SECRET_ACCESS_KEY'),
        'upload_expires' => (int) env('R2_UPLOAD_EXPIRES_SECONDS', 600),
    ],
];
