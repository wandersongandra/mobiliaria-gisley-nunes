<?php

namespace App\Support;

/**
 * Fonte única de tokens aleatórios para convites administrativos e state OAuth.
 */
final class Tokens
{
    /**
     * Base64url sem padding. O comprimento é parte do contrato: N bytes geram
     * 4 * ceil(N / 3) caracteres menos o padding, então 32 bytes rendem 43
     * caracteres — exatamente o que /^[A-Za-z0-9_-]{43}$/ valida em
     * AuthController::login() para o token de convite.
     */
    public static function random(int $bytes): string
    {
        return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
    }

    private function __construct() {}
}
