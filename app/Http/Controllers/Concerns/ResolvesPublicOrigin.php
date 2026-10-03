<?php

namespace App\Http\Controllers\Concerns;

trait ResolvesPublicOrigin
{
    /**
     * Origem pública absoluta, sem barra final, usada em canonical, robots,
     * sitemap, llms.txt e no JSON-LD.
     */
    protected function origin(): string
    {
        return rtrim((string) config('app.url'), '/');
    }
}
