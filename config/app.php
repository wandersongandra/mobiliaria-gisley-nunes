<?php

return [
    'name' => env('APP_NAME', 'Gisley Nunes Imóveis'),
    'env' => env('APP_ENV', 'production'),
    'debug' => (bool) env('APP_DEBUG', false),
    'url' => env('APP_URL', 'https://www.gisleynunesimoveis.com.br'),
    'admin_url' => env('ADMIN_ORIGIN', env('APP_URL')),
    'timezone' => 'America/Sao_Paulo',
    'locale' => 'pt_BR',
    'fallback_locale' => 'pt_BR',
    'faker_locale' => 'pt_BR',
    'key' => env('APP_KEY'),
    'cipher' => 'AES-256-CBC',
];
