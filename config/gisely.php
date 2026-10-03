<?php

return [
    'admin' => [
        'bootstrap_open_ids' => array_values(array_filter(array_map('trim', explode(',', (string) env('GISELY_ADMIN_OPEN_IDS', ''))))),
        'idle_timeout_minutes' => (int) env('GISELY_ADMIN_IDLE_TIMEOUT_MINUTES', 60),
        'max_sessions' => (int) env('GISELY_MAX_ADMIN_SESSIONS', 3),
    ],
];
