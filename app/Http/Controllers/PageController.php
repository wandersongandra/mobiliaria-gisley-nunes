<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesPublicOrigin;
use App\Services\CrmService;
use App\Services\PropertyService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Todas as páginas HTML públicas (SSR por causa de SEO) e o fallback 404, que
 * responde HTML fora de /api/* e JSON dentro dele.
 */
class PageController extends Controller
{
    use ResolvesPublicOrigin;

    private const ASSETS = ['css' => '/assets/main.css', 'js' => '/assets/main.js'];

    private const MIN_INDEXABLE_NEIGHBORHOOD_PROPERTIES = 3;

    public function __construct(
        private readonly PropertyService $properties,
        private readonly CrmService $crm,
    ) {}

    public function home(Request $request)
    {
        if ($this->isAdminOriginRequest($request)) {
            return redirect('/admin/', 302);
        }

        $data = $this->pageData(
            'Imóveis em Belo Horizonte e região | Gisley Nunes',
            'Encontre imóveis para comprar ou alugar em Belo Horizonte e região. Veja a seleção e fale com a Gisley Nunes.',
            '/'
        );
        $catalog = $this->properties->paginatePublicProperties(1, 6);
        $data['initialProperties'] = array_map(
            fn (array $property): array => $this->properties->publicProperty($property),
            $catalog->items()
        );
        $data['initialCatalogTotal'] = $catalog->total();

        return view('home', $data);
    }

    private function isAdminOriginRequest(Request $request): bool
    {
        $publicHost = parse_url((string) config('app.url'), PHP_URL_HOST);
        $adminHost = parse_url((string) config('app.admin_url'), PHP_URL_HOST);

        return is_string($publicHost)
            && is_string($adminHost)
            && strcasecmp($publicHost, $adminHost) !== 0
            && strcasecmp($request->getHost(), $adminHost) === 0;
    }

    public function imoveis(Request $request)
    {
        $data = $this->pageData(
            'Imóveis para comprar ou alugar em Belo Horizonte | Gisley Nunes',
            'Explore imóveis para comprar ou alugar em Belo Horizonte e região. Filtre por bairro, tipo, quartos e faixa de preço.',
            '/imoveis'
        );
        $catalog = $this->properties->paginatePublicProperties(1, 20);
        $data['initialProperties'] = array_map(
            fn (array $property): array => $this->properties->publicProperty($property),
            $catalog->items()
        );
        $data['initialCatalogTotal'] = $catalog->total();
        $data['pageLd'] = $this->collectionPageLd(
            'Imóveis para comprar ou alugar em Belo Horizonte',
            $data['page']['canonical'],
            $data['initialProperties'],
            $data['initialCatalogTotal']
        );

        return view('imoveis', $data);
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
        $data = $this->pageData(
            'Bairros com imóveis em Belo Horizonte | Gisley Nunes',
            'Explore bairros com imóveis publicados em Belo Horizonte e região. Encontre opções por localização e fale com a equipe.',
            '/bairros'
        );
        $data['neighborhoods'] = $this->properties->neighborhoods($this->properties->publicCatalog());
        $data['pageLd'] = $this->jsonLd([
            '@context' => 'https://schema.org',
            '@type' => 'CollectionPage',
            'name' => 'Bairros com imóveis publicados',
            'url' => $data['page']['canonical'],
            'mainEntity' => [
                '@type' => 'ItemList',
                'numberOfItems' => count($data['neighborhoods']),
                'itemListElement' => array_map(
                    fn (array $neighborhood, int $index): array => [
                        '@type' => 'ListItem',
                        'position' => $index + 1,
                        'name' => $neighborhood['name'],
                        'url' => $this->origin().'/bairros/'.$neighborhood['slug'],
                    ],
                    $data['neighborhoods'],
                    array_keys($data['neighborhoods'])
                ),
            ],
        ]);

        return view('bairros', $data);
    }

    public function bairro(Request $request, string $slug)
    {
        $neighborhood = collect($this->properties->neighborhoods($this->properties->publicCatalog()))
            ->firstWhere('slug', Str::slug($slug));

        if (! $neighborhood) {
            return response()->view('404', $this->pageData(
                'Bairro não encontrado | Gisley Nunes Imóveis',
                'O bairro procurado não está disponível. Veja outros bairros e imóveis publicados.',
                '/'.ltrim($request->path(), '/'),
                robots: 'noindex,nofollow'
            ), 404);
        }

        $robots = $neighborhood['count'] >= self::MIN_INDEXABLE_NEIGHBORHOOD_PROPERTIES
            ? 'index,follow,max-image-preview:large'
            : 'noindex,follow';
        $data = $this->pageData(
            'Imóveis em '.$neighborhood['name'].', Belo Horizonte | Gisley Nunes',
            'Veja imóveis publicados em '.$neighborhood['name'].', Belo Horizonte, para comprar ou alugar com a Gisley Nunes.',
            '/bairros/'.$neighborhood['slug'],
            robots: $robots
        );
        $data['neighborhood'] = $neighborhood;
        $data['pageLd'] = $this->jsonLd([
            '@context' => 'https://schema.org',
            '@graph' => [
                [
                    '@type' => 'BreadcrumbList',
                    'itemListElement' => [
                        ['@type' => 'ListItem', 'position' => 1, 'name' => 'Início', 'item' => $this->origin().'/'],
                        ['@type' => 'ListItem', 'position' => 2, 'name' => 'Bairros', 'item' => $this->origin().'/bairros'],
                        ['@type' => 'ListItem', 'position' => 3, 'name' => $neighborhood['name']],
                    ],
                ],
                [
                    '@type' => 'CollectionPage',
                    'name' => 'Imóveis em '.$neighborhood['name'].', Belo Horizonte',
                    'url' => $data['page']['canonical'],
                    'mainEntity' => [
                        '@type' => 'ItemList',
                        'numberOfItems' => $neighborhood['count'],
                        'itemListElement' => array_map(
                            fn (array $property, int $index): array => [
                                '@type' => 'ListItem',
                                'position' => $index + 1,
                                'name' => $property['title'],
                                'url' => $this->origin().'/imoveis/'.$property['slug'],
                            ],
                            $neighborhood['properties'],
                            array_keys($neighborhood['properties'])
                        ),
                    ],
                ],
            ],
        ]);

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
            '/privacidade',
            robots: 'noindex,follow'
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

    public function legacyForSale()
    {
        return redirect('/imoveis?purpose=Comprar', 301);
    }

    public function legacyForRent()
    {
        return redirect('/imoveis?purpose=Alugar', 301);
    }

    public function legacyPrivacy()
    {
        return redirect('/privacidade', 301);
    }

    public function legacyAdvertise()
    {
        return redirect('/servicos', 301);
    }

    public function legacyProperty(Request $request, string $legacyPropertySlug)
    {
        $property = $this->properties->getPropertyBySlug($legacyPropertySlug);
        if ($property) {
            return redirect('/imoveis/'.$property['slug'], 301);
        }

        return $this->notFound($request);
    }

    public function notFound(Request $request)
    {
        if ($request->is('api/*')) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        return response()->view('404', $this->pageData(
            'Página não encontrada | Gisley Nunes Imóveis',
            'A página procurada não foi encontrada. Volte ao catálogo e continue a busca por um imóvel.',
            '/'.ltrim($request->path(), '/'),
            robots: 'noindex,nofollow'
        ), 404);
    }

    /**
     * @return array<string, mixed>
     */
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
            'assets' => self::ASSETS,
            'site' => $site,
            'testimonials' => $this->crm->listTestimonials(),
            'page' => [
                'title' => $title,
                'description' => $description,
                'canonical' => $this->origin().$path,
                'ogImage' => $ogImage ?: $this->origin().'/images/gisley-nunes-imoveis-logo.jpeg',
                'ogImageAlt' => $title,
                'ogType' => $ogType,
                'robots' => $robots,
            ],
            'siteLd' => $this->jsonLd($this->realEstateAgentLd($site)),
            'websiteLd' => $this->jsonLd([
                '@context' => 'https://schema.org', '@type' => 'WebSite', 'name' => $site['name'], 'url' => $this->origin(),
            ]),
            'pageLd' => null,
        ];
    }

    /**
     * @param  array<string, mixed>  $site
     * @return array<string, mixed>
     */
    private function realEstateAgentLd(array $site): array
    {
        $agent = [
            '@context' => 'https://schema.org',
            '@type' => 'RealEstateAgent',
            'name' => $site['name'],
            'url' => $this->origin(),
            'email' => $site['email'],
            'telephone' => $site['phoneDisplay'],
            'areaServed' => $site['area'],
        ];

        if (! empty($site['address'])) {
            $agent['address'] = $site['address'];
        }
        if (! empty($site['crci'])) {
            $agent['identifier'] = [
                '@type' => 'PropertyValue',
                'propertyID' => 'CRECI-MG',
                'value' => $site['crci'],
            ];
        }
        if (! empty($site['instagramUrl'])) {
            $agent['sameAs'] = [$site['instagramUrl']];
        }

        return $agent;
    }

    /**
     * @param  array<int, array<string, mixed>>  $properties
     */
    private function collectionPageLd(string $name, string $url, array $properties, int $total): string
    {
        return $this->jsonLd([
            '@context' => 'https://schema.org',
            '@type' => 'CollectionPage',
            'name' => $name,
            'url' => $url,
            'mainEntity' => [
                '@type' => 'ItemList',
                'numberOfItems' => $total,
                'itemListElement' => array_map(
                    fn (array $property, int $index): array => [
                        '@type' => 'ListItem',
                        'position' => $index + 1,
                        'name' => $property['title'],
                        'url' => $this->origin().'/imoveis/'.$property['slug'],
                    ],
                    $properties,
                    array_keys($properties)
                ),
            ],
        ]);
    }

    /**
     * @param  array<string, mixed>  $value
     */
    private function jsonLd(array $value): string
    {
        return json_encode(
            $value,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP
        ) ?: '{}';
    }
}
