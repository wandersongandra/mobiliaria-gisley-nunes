<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#123C46" />
    <meta name="description" content="{{ $page['description'] }}" />
    <meta name="robots" content="{{ $page['robots'] ?? 'index,follow,max-image-preview:large' }}" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:type" content="{{ $page['ogType'] }}" />
    <meta property="og:title" content="{{ $page['title'] }}" />
    <meta property="og:description" content="{{ $page['description'] }}" />
    <meta property="og:image" content="{{ $page['ogImage'] }}" />
    <meta property="og:image:alt" content="{{ $page['ogImageAlt'] ?? $page['title'] }}" />
    <meta property="og:url" content="{{ $page['canonical'] }}" />
    <meta property="og:site_name" content="{{ $site['name'] }}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{{ $page['title'] }}" />
    <meta name="twitter:description" content="{{ $page['description'] }}" />
    <meta name="twitter:image" content="{{ $page['ogImage'] }}" />
    <meta name="twitter:image:alt" content="{{ $page['ogImageAlt'] ?? $page['title'] }}" />
    <meta name="twitter:url" content="{{ $page['canonical'] }}" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <meta name="format-detection" content="telephone=no" />
    <link rel="canonical" href="{{ $page['canonical'] }}" />
    <link rel="icon" href="/images/gisley-nunes-imoveis-logo.jpeg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="preconnect" href="https://images.unsplash.com" />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    <script nonce="{{ cspNonce }}" type="application/ld+json">{!! $siteLd !!}</script>
    @if(!empty($websiteLd))<script nonce="{{ cspNonce }}" type="application/ld+json">{!! $websiteLd !!}</script>@endif
    @if(!empty($pageLd))<script nonce="{{ cspNonce }}" type="application/ld+json">{!! $pageLd !!}</script>@endif
    @if(!empty($assets['css']))<link rel="stylesheet" href="{{ $assets['css'] }}" />@endif
    <title>{{ $page['title'] }}</title>
  </head>
