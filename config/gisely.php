<?php

return [
    'admin' => [
        'idle_timeout_minutes' => (int) env('GISELY_ADMIN_IDLE_TIMEOUT_MINUTES', 60),
        'max_sessions' => (int) env('GISELY_MAX_ADMIN_SESSIONS', 3),
    ],
];
