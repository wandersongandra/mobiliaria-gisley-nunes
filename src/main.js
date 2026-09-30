import './styles.css';

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[char]);
}

function priceBand(price) {
  const value = Number(price || 0);
  if (value < 1500000) return 1;
  if (value <= 3000000) return 2;
  return 3;
}

function normalizeProperty(item) {
  const bedrooms = Number(item.bedrooms || 0);
  const bathrooms = Number(item.bathrooms || 0);
  const areaM2 = Number(item.area_m2 ?? item.areaM2 ?? 0);
  const location = String(item.location || item.city || '');
  return {
    id: String(item.id || ''),
    slug: String(item.slug || ''),
    title: String(item.title || ''),
    location,
    neighborhood: item.neighborhood || location.split(' · ')[0],
    type: String(item.type || ''),
    purpose: String(item.purpose || 'Comprar'),
    price: String(item.price_label ?? item.priceLabel ?? ''),
    priceValue: Number(item.price_band ?? item.priceBand ?? priceBand(item.price)),
    bedrooms,
    meta: [`${bedrooms} quartos`, `${bathrooms} banheiros`, `${areaM2} m²`],
    image: String(item.cover_url ?? item.coverUrl ?? ''),
    tag: item.is_featured ? 'destaque' : 'curadoria'
  };
}

function listingCard(item) {
  const href = item.slug ? `/imoveis/${item.slug}` : '#contato';
  return `<article class="listing-card"><a href="${href}" class="listing-image"><img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.title)}, ${escapeHTML(item.location)}" loading="lazy" /><span class="listing-tag">${escapeHTML(item.tag)}</span><span class="listing-arrow" aria-hidden="true">↗</span></a><div class="listing-info"><div><p class="listing-location">${escapeHTML(item.location)}</p><h3>${escapeHTML(item.title)}</h3></div><strong class="listing-price">${escapeHTML(item.price)}</strong></div><div class="listing-meta">${item.meta.map((meta) => `<span>${escapeHTML(meta)}</span>`).join('')}</div></article>`;
}

function initMobileMenu() {
  const toggle = document.querySelector('.menu-toggle');
  const mobileNav = document.querySelector('#mobile-nav');
  if (!toggle || !mobileNav) return;
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    mobileNav.classList.toggle('is-open', !open);
  });
  mobileNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    toggle.setAttribute('aria-expanded', 'false');
    mobileNav.classList.remove('is-open');
  }));
}

function initListing() {
  const grid = document.querySelector('#listing-grid');
  if (!grid) return;
  const empty = document.querySelector('#empty-state');
  const count = document.querySelector('#listing-count');
  const form = document.querySelector('#search-form');
  const filters = { purpose: document.querySelector('#purpose'), location: document.querySelector('#location'), type: document.querySelector('#type'), price: document.querySelector('#price'), bedrooms: document.querySelector('#bedrooms') };
  const filterSummary = document.querySelector('#filter-summary');
  let catalog = [];

  function renderListings(items = catalog) {
    grid.innerHTML = items.map(listingCard).join('');
    count.textContent = String(items.length).padStart(2, '0');
    empty.hidden = items.length > 0;
    renderFilterSummary(items.length);
  }

  function renderFilterSummary(resultCount) {
    const active = [filters.purpose.value !== 'all' && filters.purpose.options[filters.purpose.selectedIndex].text, filters.location.value !== 'all' && filters.location.options[filters.location.selectedIndex].text, filters.type.value !== 'all' && filters.type.options[filters.type.selectedIndex].text, filters.price.value !== 'all' && filters.price.options[filters.price.selectedIndex].text, filters.bedrooms.value !== 'all' && filters.bedrooms.options[filters.bedrooms.selectedIndex].text].filter(Boolean);
    filterSummary.innerHTML = active.length ? `<span><strong>${resultCount}</strong> ${resultCount === 1 ? 'imóvel encontrado' : 'imóveis encontrados'}</span><div class="active-filters">${active.map((label) => `<span class="filter-chip">${escapeHTML(label)}</span>`).join('')}<button type="button" id="clear-filters-inline">Limpar filtros</button></div>` : `<span><strong>${resultCount}</strong> imóveis na curadoria Gisley Nunes</span>`;
    document.querySelector('#clear-filters-inline')?.addEventListener('click', clearFilters);
  }

  function clearFilters() {
    Object.values(filters).forEach((filter) => { filter.value = 'all'; });
    renderListings(catalog);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const filtered = catalog.filter((item) => {
      const purposeOk = filters.purpose.value === 'all' || item.purpose === filters.purpose.value;
      const locationOk = filters.location.value === 'all' || item.neighborhood === filters.location.value;
      const typeOk = filters.type.value === 'all' || item.type === filters.type.value;
      const priceOk = filters.price.value === 'all' || item.priceValue === Number(filters.price.value);
      const bedroomsOk = filters.bedrooms.value === 'all' || (filters.bedrooms.value === '4+' ? item.bedrooms >= 4 : item.bedrooms === Number(filters.bedrooms.value));
      return purposeOk && locationOk && typeOk && priceOk && bedroomsOk;
    });
    renderListings(filtered);
    document.querySelector('#imoveis').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.querySelector('#clear-filters').addEventListener('click', clearFilters);

  function fillSelect(select, values, allLabel) {
    select.innerHTML = `<option value="all">${escapeHTML(allLabel)}</option>` + values.map((value) => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join('');
    select.value = 'all';
  }

  function populateFilterOptions() {
    const neighborhoods = [...new Set(catalog.map((item) => item.neighborhood).filter(Boolean))].sort();
    const types = [...new Set(catalog.map((item) => item.type).filter(Boolean))].sort();
    fillSelect(filters.location, neighborhoods, 'Todos os bairros');
    fillSelect(filters.type, types, 'Todos os tipos');
  }

  async function loadProperties() {
    try {
      const response = await fetch('/api/properties');
      if (!response.ok) return;
      const payload = await response.json();
      if (payload?.properties?.length) { catalog = payload.properties.map(normalizeProperty); populateFilterOptions(); renderListings(catalog); }
    } catch {}
  }

  renderListings();
  loadProperties();
}

function initContactForm() {
  const form = document.querySelector('#contact-form');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const status = document.querySelector('#form-status');
    status.textContent = 'Mensagem recebida. Em breve, um especialista da Gisley Nunes fala com você.';
    event.target.reset();
  });
}

function renderPropertyDetail(property) {
  const photos = Array.isArray(property.photos) && property.photos.length ? property.photos : (property.cover_url ? [{ url: property.cover_url, alt_text: property.title, is_cover: 1 }] : []);
  const primary = photos.find((photo) => photo.is_cover) || photos[0];
  const thumbs = photos.map((photo, index) => `<button class="gallery-thumb${photo === primary ? ' is-active' : ''}" type="button" data-image="${escapeHTML(photo.url)}" aria-label="Ver foto ${index + 1}"><img src="${escapeHTML(photo.url)}" alt="" loading="lazy" /><span>${String(index + 1).padStart(2, '0')}</span></button>`).join('');
  const features = [
    { label: 'Quartos', value: `${property.bedrooms ?? 0}` },
    { label: 'Banheiros', value: `${property.bathrooms ?? 0}` },
    { label: 'Área', value: `${property.area_m2 ?? 0} m²` },
    { label: 'Tipo', value: property.type || '' },
    { label: 'Finalidade', value: property.purpose || '' }
  ].map((feature) => `<div class="property-feature"><span>${escapeHTML(feature.label)}</span><strong>${escapeHTML(feature.value)}</strong></div>`).join('');

  return `<nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Início</a><span aria-hidden="true">›</span><a href="/#imoveis">Imóveis</a><span aria-hidden="true">›</span><span aria-current="page">${escapeHTML(property.title)}</span></nav><section class="property-hero"><div class="property-gallery">${photos.length ? `<div class="gallery-main"><img src="${escapeHTML(primary.url)}" alt="${escapeHTML(primary.alt_text || property.title)}" /></div>${photos.length > 1 ? `<div class="gallery-thumbs">${thumbs}</div>` : ''}` : ''}</div><div class="property-summary"><p class="eyebrow">${escapeHTML(property.purpose)} · ${escapeHTML(property.type)}</p><h1>${escapeHTML(property.title)}</h1><p class="property-location">${escapeHTML(property.location)}</p><strong class="property-price">${escapeHTML(property.price_label)}</strong><div class="property-features">${features}</div><a class="button button-primary" href="#contato">Falar sobre este imóvel <span aria-hidden="true">↗</span></a></div></section><section class="property-description"><p class="eyebrow">sobre este imóvel</p><p class="property-description-copy">${escapeHTML(property.description || '')}</p></section>`;
}

function initPropertyDetail() {
  const root = document.querySelector('#property-root');
  const dataEl = document.querySelector('#property-data');
  if (!root || !dataEl) return;
  let property = null;
  try { property = JSON.parse(dataEl.textContent); } catch {}
  if (!property) { root.innerHTML = '<p class="empty-state">Imóvel não encontrado.</p>'; return; }
  root.innerHTML = renderPropertyDetail(property);
  root.querySelectorAll('.gallery-thumb').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      const image = thumb.dataset.image;
      const main = root.querySelector('.gallery-main img');
      if (main) main.src = image;
      root.querySelectorAll('.gallery-thumb').forEach((item) => item.classList.remove('is-active'));
      thumb.classList.add('is-active');
    });
  });
}

function initTestimonials() {
  const features = document.querySelectorAll('.testimonial-feature');
  if (!features.length) return;
  const prev = document.querySelector('[data-quote-prev]');
  const next = document.querySelector('[data-quote-next]');
  let index = 0;
  const show = (i) => { features.forEach((feature, j) => { feature.hidden = j !== i; }); };
  if (prev) prev.addEventListener('click', () => { index = (index - 1 + features.length) % features.length; show(index); });
  if (next) next.addEventListener('click', () => { index = (index + 1) % features.length; show(index); });
  show(0);
}

initMobileMenu();
initListing();
initPropertyDetail();
initContactForm();
initTestimonials();