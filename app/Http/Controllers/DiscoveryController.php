<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesPublicOrigin;
use App\Services\PropertyService;
use Illuminate\Http\Response;

/**
 * Arquivos de descoberta consumidos por máquinas: crawlers, motores de busca e
 * agentes de IA. Não renderizam Blade nem retornam JSON.
 */
class DiscoveryController extends Controller
{
    use ResolvesPublicOrigin;

    public function __construct(
        private readonly PropertyService $properties,
    ) {}

    public function robots(): Response
    {
        $body = implode("\n", [
            'User-agent: *',
            'Allow: /',
            'Disallow: /api/',
            'Disallow: /admin',
            'Disallow: /_app/',
            'Sitemap: '.$this->origin().'/sitemap.xml',
        ]);

        return response($body, 200)->header('Content-Type', 'text/plain; charset=utf-8');
    }

    public function sitemap(): Response
    {
        $properties = $this->publicItems();
        $entries = [
            ['path' => '/', 'priority' => '1.0', 'changefreq' => 'weekly'],
            ['path' => '/imoveis', 'priority' => '0.9', 'changefreq' => 'daily'],
            ['path' => '/sobre', 'priority' => '0.5', 'changefreq' => 'monthly'],
            ['path' => '/contato', 'priority' => '0.5', 'changefreq' => 'monthly'],
            ['path' => '/servicos', 'priority' => '0.7', 'changefreq' => 'monthly'],
            ['path' => '/bairros', 'priority' => '0.7', 'changefreq' => 'weekly'],
            ['path' => '/privacidade', 'priority' => '0.1', 'changefreq' => 'yearly'],
        ];

        foreach ($this->properties->neighborhoods($properties) as $n) {
            $entries[] = ['path' => '/bairros/'.$n['slug'], 'priority' => '0.7', 'changefreq' => 'weekly'];
        }
        foreach ($properties as $property) {
            $entries[] = [
                'path' => '/imoveis/'.$property['slug'],
                'priority' => '0.8',
                'changefreq' => 'weekly',
                'lastmod' => $property['updated_at'] ? date('Y-m-d', strtotime((string) $property['updated_at'])) : null,
            ];
        }

        $xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
        foreach ($entries as $entry) {
            $xml .= '  <url><loc>'.htmlspecialchars($this->origin().$entry['path'], ENT_XML1).'</loc>';
            if (! empty($entry['lastmod'])) {
                $xml .= '<lastmod>'.$entry['lastmod'].'</lastmod>';
            }
            $xml .= '<changefreq>'.$entry['changefreq'].'</changefreq><priority>'.$entry['priority']."</priority></url>\n";
        }
        $xml .= '</urlset>';

        return response($xml, 200)->header('Content-Type', 'application/xml; charset=utf-8');
    }

    public function llms(): Response
    {
        $properties = $this->publicItems();
        $lines = [
            '# Gisley Nunes Imóveis', '',
            '> Imóveis para comprar e alugar em Belo Horizonte e região. Consulte o catálogo e entre em contato.', '',
            '## Páginas',
            '- [Início]('.$this->origin().'/): apresentação e imóveis em destaque.',
            '- [Imóveis]('.$this->origin().'/imoveis): catálogo completo com filtros.',
            '- [Sobre]('.$this->origin().'/sobre): história e valores.',
            '- [Contato]('.$this->origin().'/contato): canais de atendimento.',
            '- [Serviços]('.$this->origin().'/servicos): caminhos para comprar, alugar ou anunciar um imóvel.',
            '- [Bairros]('.$this->origin().'/bairros): imóveis agrupados por localização.',
            '- [Privacidade]('.$this->origin().'/privacidade): política de privacidade.', '', '## Imóveis',
        ];
        foreach ($this->properties->neighborhoods($properties) as $n) {
            $lines[] = '- Bairro '.$n['name'].': '.$n['count'].' imóveis. '.$this->origin().'/bairros/'.$n['slug'];
        }
        foreach ($properties as $p) {
            $lines[] = '- '.$p['title'].': '.$p['location'].', '.($p['price_label'] ?: 'consulte').'. '.$this->origin().'/imoveis/'.$p['slug'];
        }

        return response(implode("\n", $lines), 200)->header('Content-Type', 'text/plain; charset=utf-8');
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function publicItems(): array
    {
        return array_map(
            fn (array $row): array => $this->properties->publicProperty($row),
            $this->properties->listProperties(true)
        );
    }
}
