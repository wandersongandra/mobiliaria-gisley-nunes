<?php

$mediaRoot = trim((string) env('MEDIA_ROOT', storage_path('app/private/media')));
if ($mediaRoot !== '' && preg_match('~^(?:[A-Za-z]:[\\\\/]|[\\\\/]{1,2})~', $mediaRoot) !== 1) {
    $mediaRoot = base_path($mediaRoot);
}

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

    'media' => [
        'root' => $mediaRoot,
        'max_size' => 12 * 1024 * 1024,
    ],

];
