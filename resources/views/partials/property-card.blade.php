<article class="listing-card listing-card-server">
  <a href="/imoveis/{{ rawurlencode($property['slug']) }}" class="listing-image">
    @if(!empty($property['cover_url']))
      <img src="{{ $property['cover_url'] }}" alt="{{ $property['title'] }}, {{ $property['location'] }}" width="1200" height="800" sizes="(max-width: 600px) calc(100vw - 32px), (max-width: 980px) 50vw, 33vw" loading="{{ $imageLoading ?? 'lazy' }}" decoding="async" />
    @else
      <span class="listing-image-placeholder" aria-hidden="true">GN</span>
    @endif
    <span class="listing-tag">{{ $property['is_featured'] ? 'destaque' : strtolower($property['purpose']) }}</span>
    <span class="listing-arrow" aria-hidden="true">↗</span>
    <span class="listing-image-shade" aria-hidden="true"></span>
  </a>
  <div class="listing-info">
    <div><p class="listing-location">{{ $property['location'] }}</p><h3>{{ $property['title'] }}</h3></div>
    <strong class="listing-price">{{ $property['price_label'] ?: 'Consulte' }}</strong>
  </div>
  <div class="listing-meta">
    @if(!empty($property['bedrooms']))<span>{{ $property['bedrooms'] }} {{ $property['bedrooms'] === 1 ? 'quarto' : 'quartos' }}</span>@endif
    @if(!empty($property['bathrooms']))<span>{{ $property['bathrooms'] }} {{ $property['bathrooms'] === 1 ? 'banheiro' : 'banheiros' }}</span>@endif
    @if(!empty($property['area_m2']))<span>{{ $property['area_m2'] }} m²</span>@endif
  </div>
</article>
