<?php

return [
    'google_oauth' => [
        'provider' => 'google',
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect_path' => env('GOOGLE_OAUTH_CALLBACK_PATH', '/oauth/google/return'),
        'authorization_url' => 'https://accounts.google.com/o/oauth2/v2/auth',
        'token_url' => 'https://oauth2.googleapis.com/token',
        'userinfo_url' => 'https://openidconnect.googleapis.com/v1/userinfo',
    ],

    'r2' => [
        'account_id' => env('R2_ACCOUNT_ID'),
        'bucket' => env('R2_BUCKET', 'gisley-nunes-imoveis'),
        'access_key_id' => env('R2_ACCESS_KEY_ID'),
        'secret_access_key' => env('R2_SECRET_ACCESS_KEY'),
        'upload_expires' => (int) env('R2_UPLOAD_EXPIRES_SECONDS', 600),
    ],
];
