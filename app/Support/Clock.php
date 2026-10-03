<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/**
 * Fonte única de "agora" em milissegundos Unix.
 *
 * O código anterior usava microtime(true) diretamente, o que tornava impossível
 * avançar o tempo em testes: a expiração de sessão, de convite e de challenge
 * OAuth não podia ser exercitada. Carbon::now() respeita Carbon::setTestNow().
 *
 * A aritmética é inteira e trunca os microssegundos, preservando a semântica de
 * floor() que os dez pontos de chamada anteriores tinham.
 */
final class Clock
{
    public static function nowMs(): int
    {
        $now = Carbon::now();

        return $now->getTimestamp() * 1000 + intdiv($now->micro, 1000);
    }

    private function __construct() {}
}
