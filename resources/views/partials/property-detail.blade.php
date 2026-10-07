@php
  $photos = array_values(array_filter($property['photos'] ?? [], static fn (array $photo): bool => ! empty($photo['url'])));
  $primaryIndex = 0;
  foreach ($photos as $index => $photo) {
      if (! empty($photo['is_cover'])) {
          $primaryIndex = $index;
          break;
      }
  }
  $primaryPhoto = $photos[$primaryIndex] ?? null;
  $featureItems = [
      ['label' => 'Quartos', 'value' => (string) ($property['bedrooms'] ?? 0)],
      ['label' => 'Suítes', 'value' => (string) ($property['suites'] ?? 0), 'show' => (int) ($property['suites'] ?? 0) > 0],
      ['label' => 'Banheiros', 'value' => (string) ($property['bathrooms'] ?? 0)],
      ['label' => 'Vagas', 'value' => (string) ($property['parking_spots'] ?? 0), 'show' => (int) ($property['parking_spots'] ?? 0) > 0],
      ['label' => 'Área privativa', 'value' => ($property['area_m2'] ?? 0).' m²'],
      ['label' => 'Condomínio', 'value' => 'R$ '.number_format((float) ($property['condo_fee'] ?? 0), 0, ',', '.'), 'show' => (float) ($property['condo_fee'] ?? 0) > 0],
      ['label' => 'IPTU / ano', 'value' => 'R$ '.number_format((float) ($property['iptu'] ?? 0), 0, ',', '.'), 'show' => (float) ($property['iptu'] ?? 0) > 0],
      ['label' => 'Tipo', 'value' => (string) ($property['type'] ?? '')],
  ];
@endphp

<nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Início</a><span aria-hidden="true">›</span><a href="/imoveis">Imóveis</a><span aria-hidden="true">›</span><span aria-current="page">{{ $property['title'] }}</span></nav>
<section class="property-hero">
  <div class="property-gallery">
    @if($primaryPhoto)
      <div class="gallery-main">
        <img src="{{ $primaryPhoto['url'] }}" alt="{{ $primaryPhoto['alt_text'] ?: $property['title'] }}" width="1600" height="1067" sizes="(max-width: 820px) 100vw, 65vw" fetchpriority="high" decoding="async" />
        <div class="gallery-main-overlay">
          <span class="gallery-count"><strong data-gallery-current>{{ str_pad((string) ($primaryIndex + 1), 2, '0', STR_PAD_LEFT) }}</strong> / {{ str_pad((string) count($photos), 2, '0', STR_PAD_LEFT) }}</span>
          <div class="gallery-controls"><button class="gallery-lightbox-trigger" type="button" data-gallery-open aria-label="Abrir galeria em tela cheia">⤢</button>@if(count($photos) > 1)<button type="button" data-gallery-prev aria-label="Foto anterior">←</button><button type="button" data-gallery-next aria-label="Próxima foto">→</button>@endif</div>
        </div>
        <span class="sr-only" data-gallery-status aria-live="polite"></span>
      </div>
      @if(count($photos) > 1)
        <div class="gallery-thumbs" aria-label="Galeria de fotos">
          @foreach($photos as $index => $photo)
            <button class="gallery-thumb{{ $index === $primaryIndex ? ' is-active' : '' }}" type="button" data-index="{{ $index }}" data-image="{{ $photo['url'] }}" data-alt="{{ $photo['alt_text'] ?: $property['title'] }}" aria-label="Ver foto {{ $index + 1 }} de {{ count($photos) }}"><img src="{{ $photo['url'] }}" alt="" loading="lazy" decoding="async" /><span>{{ str_pad((string) ($index + 1), 2, '0', STR_PAD_LEFT) }}</span></button>
          @endforeach
        </div>
      @endif
    @endif
  </div>
  <div class="property-summary">
    <div class="property-summary-topline"><span>{{ $property['purpose'] }}</span><span>{{ $property['type'] }}</span></div>
    <h1>{{ $property['title'] }}</h1>
    <p class="property-location">{{ $property['location'] }}</p>
    <strong class="property-price">{{ $property['price_label'] }}</strong>
    <div class="property-summary-divider"></div>
    <p class="property-section-label">Detalhes do imóvel</p>
    <div class="property-features">
      @foreach($featureItems as $feature)
        @if($feature['show'] ?? true)<div class="property-feature"><span>{{ $feature['label'] }}</span><strong>{{ $feature['value'] }}</strong></div>@endif
      @endforeach
    </div>
    <div class="property-actions"><a class="button button-primary" href="#contato">Tenho interesse <span aria-hidden="true">↗</span></a><a class="property-back-link" href="/imoveis">← Ver outros imóveis</a></div>
  </div>
</section>
<a class="property-mobile-cta" href="#contato" aria-label="Demonstrar interesse por este imóvel"><span>Tenho interesse</span><span aria-hidden="true">↗</span></a>
<section class="property-description">
  <div><p class="eyebrow">descrição</p><span class="property-description-index">01</span></div>
  <p class="property-description-copy">{{ $property['description'] }}</p>
</section>
<dialog class="gallery-lightbox" data-gallery-lightbox aria-label="Galeria de {{ $property['title'] }}">
  <button class="gallery-lightbox-close" type="button" data-gallery-lightbox-close aria-label="Fechar galeria">×</button>
  <button class="gallery-lightbox-control gallery-lightbox-prev" type="button" data-gallery-lightbox-prev aria-label="Foto anterior">←</button>
  <figure><img data-gallery-lightbox-image alt="" decoding="async" /><figcaption><span data-gallery-lightbox-current>01</span> / {{ str_pad((string) count($photos), 2, '0', STR_PAD_LEFT) }}</figcaption></figure>
  <button class="gallery-lightbox-control gallery-lightbox-next" type="button" data-gallery-lightbox-next aria-label="Próxima foto">→</button>
</dialog>
