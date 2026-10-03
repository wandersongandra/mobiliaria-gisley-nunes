<?php

/*
 * O nome do arquivo foi corrigido de gisely.php para gisley.php, mas as
 * variáveis de ambiente continuam GISELY_* de propósito: elas já estão no .env
 * implantado na HostGator e nos dois workflows de CI. Renomear o env seria uma
 * quebra de deploy silenciosa (os valores voltariam aos defaults sem nenhum
 * erro). Se um dia os env forem renomeados, atualizar aqui, .env.example,
 * phpunit.xml e os dois workflows de uma só vez.
 */

return [
    'admin' => [
        'bootstrap_open_ids' => array_values(array_filter(array_map('trim', explode(',', (string) env('GISELY_ADMIN_OPEN_IDS', ''))))),
        'idle_timeout_minutes' => (int) env('GISELY_ADMIN_IDLE_TIMEOUT_MINUTES', 60),
        'max_sessions' => (int) env('GISELY_MAX_ADMIN_SESSIONS', 3),
    ],
];
