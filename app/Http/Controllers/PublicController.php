<?php

namespace App\Http\Controllers;

use App\Services\CrmService;
use App\Services\PropertyService;
use App\Services\R2Storage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

class PublicController extends Controller
{
    private const ASSETS = ['css' => '/assets/main.css', 'js' => '/assets/main.js'];

    public function __construct(
        private readonly PropertyService $properties,
        private readonly CrmService $crm,
        private readonly R2Storage $storage,
    ) {}

    public function home(Request $request)
    {
        return view('home', $this->pageData(
            'Imóveis em Belo Horizonte e região | Gisley Nunes',
            'Encontre imóveis para comprar ou alugar em Belo Horizonte e região. Veja a seleção e fale com a Gisley Nunes.',
            '/'
        ));
    }

    public function imoveis(Request $request)
    {
        return view('imoveis', $this->pageData(
            'Imóveis para comprar ou alugar em Belo Horizonte | Gisley Nunes',
            'Explore imóveis para comprar ou alugar em Belo Horizonte e região. Filtre por bairro, tipo, quartos e faixa de preço.',
            '/imoveis'
        ));
    }

    public function servicos(Request $request)
    {
        $data = $this->pageData(
            'Comprar, alugar ou anunciar imóveis | Gisley Nunes',
            'Veja como a Gisley Nunes pode ajudar você a comprar, alugar ou anunciar um imóvel em Belo Horizonte e região.',
            '/servicos'
        );
        $data['pageLd'] = $this->jsonLd([
            '@context' => 'https://schema.org',
            '@type' => 'BreadcrumbList',
            'itemListElement' => [
                ['@type' => 'ListItem', 'position' => 1, 'name' => 'Início', 'item' => $this->origin().'/'],
                ['@type' => 'ListItem', 'position' => 2, 'name' => 'Serviços'],
            ],
        ]);
        return view('servicos', $data);
    }

    public function bairros(Request $request)
    {
        $items = array_map(
            fn (array $row): array => $this->properties->publicProperty($row),
            $this->properties->listProperties(true)
        );
        $data = $this->pageData(
            'Bairros com imóveis em Belo Horizonte | Gisley Nunes',
            'Explore bairros com imóveis publicados em Belo Horizonte e região. Encontre opções por localização e fale com a equipe.',
            '/bairros'
        );
        $data['neighborhoods'] = $this->properties->neighborhoods($items);
        return view('bairros', $data);
    }

    public function bairro(Request $request, string $slug)
    {
        $items = array_map(
            fn (array $row): array => $this->properties->publicProperty($row),
            $this->properties->listProperties(true)
        );
        $neighborhood = collect($this->properties->neighborhoods($items))
            ->firstWhere('slug', Str::slug($slug));

        if (! $neighborhood) {
            return response()->view('404', $this->pageData(
                'Bairro não encontrado | Gisley Nunes Imóveis',
                'O bairro procurado não está disponível. Veja outros bairros e imóveis publicados.',
                '/'.ltrim($request->path(), '/'),
                robots: 'noindex,nofollow'
            ), 404);
        }

        $data = $this->pageData(
            'Imóveis em '.$neighborhood['name'].', Belo Horizonte | Gisley Nunes',
            'Veja imóveis publicados em '.$neighborhood['name'].', Belo Horizonte, para comprar ou alugar com a Gisley Nunes.',
            '/bairros/'.$neighborhood['slug']
        );
        $data['neighborhood'] = $neighborhood;
        return view('bairro', $data);
    }

    public function sobre(Request $request)
    {
        return view('sobre', $this->pageData(
            'Sobre | Gisley Nunes Imóveis',
            'Conheça a Gisley Nunes e sua forma de trabalhar com imóveis em Belo Horizonte e região.',
            '/sobre'
        ));
    }

    public function contato(Request $request)
    {
        return view('contato', $this->pageData(
            'Contato | Gisley Nunes Imóveis',
            'Fale com a Gisley Nunes por WhatsApp, e-mail ou formulário sobre comprar, alugar ou anunciar um imóvel.',
            '/contato'
        ));
    }

    public function privacidade(Request $request)
    {
        return view('privacidade', $this->pageData(
            'Política de privacidade | Gisley Nunes Imóveis',
            'Política de privacidade da Gisley Nunes Imóveis, em conformidade com a LGPD.',
            '/privacidade'
        ));
    }

    public function imovel(Request $request, string $slug)
    {
        $row = $this->properties->getPropertyBySlug($slug);
        if (! $row) {
            return response()->view('404', $this->pageData(
                'Imóvel não encontrado | Gisley Nunes Imóveis',
                'O imóvel procurado não está disponível. Veja outros imóveis publicados pela Gisley Nunes.',
                '/'.ltrim($request->path(), '/'),
                robots: 'noindex,nofollow'
            ), 404);
        }

        $property = $this->properties->publicProperty($row);
        $data = $this->pageData(
            $property['title'].' | Gisley Nunes Imóveis',
            $property['description'] ?: 'Conheça '.$property['title'].' em '.$property['location'].'.',
            '/imoveis/'.$property['slug'],
            $property['cover_url'] ?: null,
            'article'
        );
        $data['property'] = $property;
        $data['propertyJson'] = json_encode(
            $property,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
        ) ?: '{}';
        $data['pageLd'] = $this->jsonLd([
            '@context' => 'https://schema.org',
            '@type' => 'Offer',
            'name' => $property['title'],
            'url' => $data['page']['canonical'],
            'description' => $property['description'],
            'price' => $property['price'],
            'priceCurrency' => 'BRL',
            'image' => array_values(array_filter(array_map(
                fn (array $photo): ?string => $photo['url'] ?: null,
                $property['photos']
            ))),
            'itemOffered' => [
                '@type' => 'Accommodation',
                'name' => $property['title'],
                'address' => $property['location'],
                'floorSize' => [
                    '@type' => 'QuantitativeValue',
                    'value' => $property['area_m2'],
                    'unitCode' => 'MTK',
                ],
            ],
        ]);

        return view('imovel', $data);
    }

    public function properties(): JsonResponse
    {
        $rows = $this->properties->listProperties(true);
        return response()->json([
            'properties' => array_map(
                fn (array $row): array => $this->properties->publicProperty($row),
                $rows
            ),
        ])->header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    }

    public function property(string $slug): JsonResponse
    {
        $row = $this->properties->getPropertyBySlug($slug);
        if (! $row) return response()->json(['error' => 'NOT_FOUND'], 404);

        return response()->json([
            'property' => $this->properties->publicProperty($row),
        ])->header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    }

    public function site(): JsonResponse
    {
        return response()->json([
            'site' => $this->crm->getSiteInfo(),
            'testimonials' => $this->crm->listTestimonials(),
        ])->header('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
    }

    public function contact(Request $request): JsonResponse
    {
        if (trim((string) $request->input('website', '')) !== '') {
            return response()->json(['ok' => true], 201);
        }

        $id = $this->crm->createContactLead($request->all());
        return response()->json(['ok' => true, 'id' => $id], 201);
    }

    public function media(string $path): RedirectResponse|JsonResponse
    {
        $key = rawurldecode($path);
        if (! $this->properties->findPublishedPhotoByStoragePath($key)) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        return redirect()->away($this->storage->presignGet($key), 307)
            ->header('Cache-Control', 'no-store');
    }

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
        $properties = array_map(
            fn (array $row): array => $this->properties->publicProperty($row),
            $this->properties->listProperties(true)
        );
        $entries = [
            ['path'=>'/','priority'=>'1.0','changefreq'=>'weekly'],
            ['path'=>'/imoveis','priority'=>'0.9','changefreq'=>'daily'],
            ['path'=>'/sobre','priority'=>'0.5','changefreq'=>'monthly'],
            ['path'=>'/contato','priority'=>'0.5','changefreq'=>'monthly'],
            ['path'=>'/servicos','priority'=>'0.7','changefreq'=>'monthly'],
            ['path'=>'/bairros','priority'=>'0.7','changefreq'=>'weekly'],
            ['path'=>'/privacidade','priority'=>'0.1','changefreq'=>'yearly'],
        ];

        foreach ($this->properties->neighborhoods($properties) as $n) {
            $entries[] = ['path'=>'/bairros/'.$n['slug'],'priority'=>'0.7','changefreq'=>'weekly'];
        }
        foreach ($properties as $property) {
            $entries[] = [
                'path'=>'/imoveis/'.$property['slug'],
                'priority'=>'0.8',
                'changefreq'=>'weekly',
                'lastmod'=>$property['updated_at'] ? date('Y-m-d', strtotime((string) $property['updated_at'])) : null,
            ];
        }

        $xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
        foreach ($entries as $entry) {
            $xml .= '  <url><loc>'.htmlspecialchars($this->origin().$entry['path'], ENT_XML1).'</loc>';
            if (!empty($entry['lastmod'])) $xml .= '<lastmod>'.$entry['lastmod'].'</lastmod>';
            $xml .= '<changefreq>'.$entry['changefreq'].'</changefreq><priority>'.$entry['priority']."</priority></url>\n";
        }
        $xml .= '</urlset>';

        return response($xml, 200)->header('Content-Type', 'application/xml; charset=utf-8');
    }

    public function llms(): Response
    {
        $properties = array_map(
            fn (array $row): array => $this->properties->publicProperty($row),
            $this->properties->listProperties(true)
        );
        $lines = [
            '# Gisley Nunes Imóveis','',
            '> Imóveis para comprar e alugar em Belo Horizonte e região. Consulte o catálogo e entre em contato.','',
            '## Páginas',
            '- [Início]('.$this->origin().'/): apresentação e imóveis em destaque.',
            '- [Imóveis]('.$this->origin().'/imoveis): catálogo completo com filtros.',
            '- [Sobre]('.$this->origin().'/sobre): história e valores.',
            '- [Contato]('.$this->origin().'/contato): canais de atendimento.',
            '- [Serviços]('.$this->origin().'/servicos): caminhos para comprar, alugar ou anunciar um imóvel.',
            '- [Bairros]('.$this->origin().'/bairros): imóveis agrupados por localização.',
            '- [Privacidade]('.$this->origin().'/privacidade): política de privacidade.','','## Imóveis',
        ];
        foreach ($this->properties->neighborhoods($properties) as $n) {
            $lines[] = '- Bairro '.$n['name'].': '.$n['count'].' imóveis. '.$this->origin().'/bairros/'.$n['slug'];
        }
        foreach ($properties as $p) {
            $lines[] = '- '.$p['title'].': '.$p['location'].', '.($p['price_label'] ?: 'consulte').'. '.$this->origin().'/imoveis/'.$p['slug'];
        }

        return response(implode("\n", $lines), 200)->header('Content-Type', 'text/plain; charset=utf-8');
    }

    public function notFound(Request $request)
    {
        if ($request->is('api/*')) return response()->json(['error'=>'NOT_FOUND'], 404);

        return response()->view('404', $this->pageData(
            'Página não encontrada | Gisley Nunes Imóveis',
            'A página procurada não foi encontrada. Volte ao catálogo e continue a busca por um imóvel.',
            '/'.ltrim($request->path(), '/'),
            robots: 'noindex,nofollow'
        ), 404);
    }

    private function pageData(
        string $title,
        string $description,
        string $path,
        ?string $ogImage = null,
        string $ogType = 'website',
        string $robots = 'index,follow,max-image-preview:large',
    ): array {
        $site = $this->crm->getSiteInfo();
        return [
            'assets'=>self::ASSETS,
            'site'=>$site,
            'testimonials'=>$this->crm->listTestimonials(),
            'page'=>[
                'title'=>$title,
                'description'=>$description,
                'canonical'=>$this->origin().$path,
                'ogImage'=>$ogImage ?: $this->origin().'/images/gisley-nunes-imoveis-logo.jpeg',
                'ogImageAlt'=>$title,
                'ogType'=>$ogType,
                'robots'=>$robots,
            ],
            'siteLd'=>$this->jsonLd([
                '@context'=>'https://schema.org','@type'=>'RealEstateAgent',
                'name'=>$site['name'],'url'=>$this->origin(),'email'=>$site['email'],
                'telephone'=>$site['phoneDisplay'],'areaServed'=>$site['area'],
            ]),
            'websiteLd'=>$this->jsonLd([
                '@context'=>'https://schema.org','@type'=>'WebSite','name'=>$site['name'],'url'=>$this->origin(),
            ]),
            'pageLd'=>null,
        ];
    }

    private function origin(): string
    {
        return rtrim((string) config('app.url'), '/');
    }

    private function jsonLd(array $value): string
    {
        return json_encode(
            $value,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP
        ) ?: '{}';
    }
}
