import './styles.css';
import './refinements.css';

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
  const href = item.slug ? `/imoveis/${encodeURIComponent(item.slug)}` : '/contato';
  return `<article class="listing-card"><a href="${href}" class="listing-image"><img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.title)}, ${escapeHTML(item.location)}" loading="lazy" decoding="async" /><span class="listing-tag">${escapeHTML(item.tag)}</span><span class="listing-arrow" aria-hidden="true">↗</span></a><div class="listing-info"><div><p class="listing-location">${escapeHTML(item.location)}</p><h3>${escapeHTML(item.title)}</h3></div><strong class="listing-price">${escapeHTML(item.price)}</strong></div><div class="listing-meta">${item.meta.map((meta) => `<span>${escapeHTML(meta)}</span>`).join('')}</div></article>`;
}

function markCurrentNavigation() {
  const current = window.location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.desktop-nav a, .mobile-nav a').forEach((link) => {
    const target = new URL(link.href, window.location.origin).pathname.replace(/\/$/, '') || '/';
    if (target === current && !link.href.includes('#')) link.setAttribute('aria-current', 'page');
  });
}

function initMobileMenu() {
  const toggle = document.querySelector('.menu-toggle');
  const mobileNav = document.querySelector('#mobile-nav');
  if (!toggle || !mobileNav) return;

  const close = () => {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menu');
    mobileNav.classList.remove('is-open');
    document.body.classList.remove('menu-open');
  };

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    toggle.setAttribute('aria-label', open ? 'Abrir menu' : 'Fechar menu');
    mobileNav.classList.toggle('is-open', !open);
    document.body.classList.toggle('menu-open', !open);
  });

  mobileNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', close));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
}

function initListing() {
  const grid = document.querySelector('#listing-grid');
  if (!grid) return;

  const empty = document.querySelector('#empty-state');
  const count = document.querySelector('#listing-count');
  const form = document.querySelector('#search-form');
  const filterSummary = document.querySelector('#filter-summary');
  const filters = {
    purpose: document.querySelector('#purpose'),
    location: document.querySelector('#location'),
    type: document.querySelector('#type'),
    price: document.querySelector('#price'),
    bedrooms: document.querySelector('#bedrooms')
  };
  let catalog = [];

  function renderFilterSummary(resultCount) {
    if (!filterSummary) return;
    const active = [
      filters.purpose.value !== 'all' && filters.purpose.options[filters.purpose.selectedIndex].text,
      filters.location.value !== 'all' && filters.location.options[filters.location.selectedIndex].text,
      filters.type.value !== 'all' && filters.type.options[filters.type.selectedIndex].text,
      filters.price.value !== 'all' && filters.price.options[filters.price.selectedIndex].text,
      filters.bedrooms.value !== 'all' && filters.bedrooms.options[filters.bedrooms.selectedIndex].text
    ].filter(Boolean);

    filterSummary.innerHTML = active.length
      ? `<span><strong>${resultCount}</strong> ${resultCount === 1 ? 'imóvel encontrado' : 'imóveis encontrados'}</span><div class="active-filters">${active.map((label) => `<span class="filter-chip">${escapeHTML(label)}</span>`).join('')}<button type="button" id="clear-filters-inline">Limpar filtros</button></div>`
      : `<span><strong>${resultCount}</strong> imóveis na curadoria Gisley Nunes</span>`;

    document.querySelector('#clear-filters-inline')?.addEventListener('click', clearFilters);
  }

  function renderListings(items = catalog) {
    grid.innerHTML = items.map(listingCard).join('');
    if (count) count.textContent = String(items.length).padStart(2, '0');
    if (empty) empty.hidden = items.length > 0;
    renderFilterSummary(items.length);
  }

  function clearFilters() {
    Object.values(filters).forEach((filter) => { if (filter) filter.value = 'all'; });
    renderListings(catalog);
  }

  function fillSelect(select, values, allLabel) {
    if (!select) return;
    select.innerHTML = `<option value="all">${escapeHTML(allLabel)}</option>` + values.map((value) => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join('');
    select.value = 'all';
  }

  function populateFilterOptions() {
    const neighborhoods = [...new Set(catalog.map((item) => item.neighborhood).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const types = [...new Set(catalog.map((item) => item.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    fillSelect(filters.location, neighborhoods, 'Todos os bairros');
    fillSelect(filters.type, types, 'Todos os tipos');
  }

  form?.addEventListener('submit', (event) => {
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
    document.querySelector('#imoveis')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.querySelector('#clear-filters')?.addEventListener('click', clearFilters);

  async function loadProperties() {
    try {
      grid.setAttribute('aria-busy', 'true');
      const response = await fetch('/api/properties', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('LOAD_FAILED');
      const payload = await response.json();
      catalog = Array.isArray(payload?.properties) ? payload.properties.map(normalizeProperty) : [];
      populateFilterOptions();
      renderListings(catalog);
    } catch {
      if (filterSummary) filterSummary.textContent = 'Não foi possível carregar os imóveis agora. Tente novamente em instantes.';
    } finally {
      grid.removeAttribute('aria-busy');
    }
  }

  renderListings();
  loadProperties();
}

async function buildWhatsAppFallback(message) {
  try {
    const response = await fetch('/api/site', { headers: { Accept: 'application/json' } });
    const payload = await response.json();
    const number = String(payload?.site?.whatsapp || '').replace(/\D/g, '');
    if (!number) return null;
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  } catch {
    return null;
  }
}

function initContactForm() {
  const form = document.querySelector('#contact-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('#form-status');
    const button = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form));
    const originalText = button?.innerHTML;

    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Enviando…';
    }
    if (status) status.textContent = 'Enviando sua mensagem com segurança…';

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          interest: data.interest,
          message: data.message,
          propertyPath: window.location.pathname
        })
      });

      if (!response.ok) throw new Error('CONTACT_FAILED');
      form.reset();
      if (status) status.textContent = 'Mensagem enviada. A equipe Gisley Nunes recebeu seu contato e retornará em breve.';
    } catch {
      const fallbackText = `Olá! Meu nome é ${String(data.name || '').trim()}. ${String(data.message || '').trim()}`.slice(0, 1200);
      const whatsapp = await buildWhatsAppFallback(fallbackText);
      if (status) {
        status.textContent = 'Não foi possível registrar a mensagem agora. ';
        if (whatsapp) {
          const link = document.createElement('a');
          link.href = whatsapp;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = 'Fale conosco pelo WhatsApp.';
          status.append(link);
        } else {
          status.append('Tente novamente em alguns instantes.');
        }
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.innerHTML = originalText;
      }
    }
  });
}

function renderPropertyDetail(property) {
  const photos = Array.isArray(property.photos) && property.photos.length
    ? property.photos
    : (property.cover_url ? [{ url: property.cover_url, alt_text: property.title, is_cover: 1 }] : []);
  const primary = photos.find((photo) => photo.is_cover) || photos[0];
  const thumbs = photos.map((photo, index) => `<button class="gallery-thumb${photo === primary ? ' is-active' : ''}" type="button" data-image="${escapeHTML(photo.url)}" data-alt="${escapeHTML(photo.alt_text || property.title)}" aria-label="Ver foto ${index + 1}"><img src="${escapeHTML(photo.url)}" alt="" loading="lazy" decoding="async" /><span>${String(index + 1).padStart(2, '0')}</span></button>`).join('');

  const featureItems = [
    { label: 'Quartos', value: `${property.bedrooms ?? 0}` },
    { label: 'Suítes', value: `${property.suites ?? 0}`, show: Number(property.suites ?? 0) > 0 },
    { label: 'Banheiros', value: `${property.bathrooms ?? 0}` },
    { label: 'Vagas', value: `${property.parking_spots ?? 0}`, show: Number(property.parking_spots ?? 0) > 0 },
    { label: 'Área', value: `${property.area_m2 ?? 0} m²` },
    { label: 'Condomínio', value: `R$ ${Number(property.condo_fee ?? 0).toLocaleString('pt-BR')}`, show: Number(property.condo_fee ?? 0) > 0 },
    { label: 'IPTU/ano', value: `R$ ${Number(property.iptu ?? 0).toLocaleString('pt-BR')}`, show: Number(property.iptu ?? 0) > 0 },
    { label: 'Tipo', value: property.type || '' },
    { label: 'Finalidade', value: property.purpose || '' }
  ];

  const features = featureItems
    .filter((feature) => feature.show !== false)
    .map((feature) => `<div class="property-feature"><span>${escapeHTML(feature.label)}</span><strong>${escapeHTML(feature.value)}</strong></div>`)
    .join('');

  return `<nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Início</a><span aria-hidden="true">›</span><a href="/imoveis">Imóveis</a><span aria-hidden="true">›</span><span aria-current="page">${escapeHTML(property.title)}</span></nav><section class="property-hero"><div class="property-gallery">${photos.length ? `<div class="gallery-main"><img src="${escapeHTML(primary.url)}" alt="${escapeHTML(primary.alt_text || property.title)}" fetchpriority="high" decoding="async" /></div>${photos.length > 1 ? `<div class="gallery-thumbs">${thumbs}</div>` : ''}` : ''}</div><div class="property-summary"><p class="eyebrow">${escapeHTML(property.purpose)} · ${escapeHTML(property.type)}</p><h1>${escapeHTML(property.title)}</h1><p class="property-location">${escapeHTML(property.location)}</p><strong class="property-price">${escapeHTML(property.price_label)}</strong><div class="property-features">${features}</div><a class="button button-primary" href="#contato">Agendar uma conversa <span aria-hidden="true">↗</span></a></div></section><section class="property-description"><p class="eyebrow">sobre este imóvel</p><p class="property-description-copy">${escapeHTML(property.description || '')}</p></section>`;
}

function initPropertyDetail() {
  const root = document.querySelector('#property-root');
  const dataEl = document.querySelector('#property-data');
  if (!root || !dataEl) return;

  let property = null;
  try { property = JSON.parse(dataEl.textContent); } catch {}
  if (!property) {
    root.innerHTML = '<p class="empty-state">Imóvel não encontrado.</p>';
    return;
  }

  root.innerHTML = renderPropertyDetail(property);
  root.querySelectorAll('.gallery-thumb').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      const main = root.querySelector('.gallery-main img');
      if (main) {
        main.src = thumb.dataset.image;
        main.alt = thumb.dataset.alt || property.title;
      }
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

  const show = (i) => {
    features.forEach((feature, j) => { feature.hidden = j !== i; });
  };

  prev?.addEventListener('click', () => { index = (index - 1 + features.length) % features.length; show(index); });
  next?.addEventListener('click', () => { index = (index + 1) % features.length; show(index); });
  show(0);
}

async function initWhatsAppShortcut() {
  if (document.querySelector('.whatsapp-float')) return;
  try {
    const response = await fetch('/api/site', { headers: { Accept: 'application/json' } });
    if (!response.ok) return;
    const payload = await response.json();
    const number = String(payload?.site?.whatsapp || '').replace(/\D/g, '');
    if (!number) return;

    const link = document.createElement('a');
    link.className = 'whatsapp-float';
    link.href = `https://wa.me/${number}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', 'Falar com a Gisley Nunes pelo WhatsApp');
    link.innerHTML = '<span aria-hidden="true">↗</span><strong>WhatsApp</strong>';
    document.body.append(link);
  } catch {}
}

markCurrentNavigation();
initMobileMenu();
initListing();
initPropertyDetail();
initContactForm();
initTestimonials();
initWhatsAppShortcut();
