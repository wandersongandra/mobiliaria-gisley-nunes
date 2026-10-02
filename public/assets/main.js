function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[char]);
}

function priceBand(price, purpose = 'Comprar') {
  const value = Number(price || 0);
  if (purpose === 'Alugar') {
    if (value <= 5000) return 1;
    if (value <= 10000) return 2;
    return 3;
  }
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
    priceValue: priceBand(item.price, String(item.purpose || 'Comprar')),
    bedrooms,
    meta: [
      bedrooms > 0 ? `${bedrooms} ${bedrooms === 1 ? 'quarto' : 'quartos'}` : null,
      bathrooms > 0 ? `${bathrooms} ${bathrooms === 1 ? 'banheiro' : 'banheiros'}` : null,
      areaM2 > 0 ? `${areaM2} m²` : null
    ].filter(Boolean),
    image: String(item.cover_url ?? item.coverUrl ?? ''),
    tag: item.is_featured ? 'destaque' : String(item.purpose || 'Comprar').toLowerCase()
  };
}

function listingCard(item, index = 0) {
  const href = item.slug ? `/imoveis/${encodeURIComponent(item.slug)}` : '/contato';
  const delayClass = `listing-delay-${Math.min(Math.max(Number(index) || 0, 0), 7)}`;
  return `<article class="listing-card listing-card-enter ${delayClass}" data-listing-card>
    <a href="${href}" class="listing-image">
      <img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.title)}, ${escapeHTML(item.location)}" loading="lazy" decoding="async" />
      <span class="listing-tag">${escapeHTML(item.tag)}</span>
      <span class="listing-arrow" aria-hidden="true">↗</span>
      <span class="listing-image-shade" aria-hidden="true"></span>
    </a>
    <div class="listing-info">
      <div><p class="listing-location">${escapeHTML(item.location)}</p><h3>${escapeHTML(item.title)}</h3></div>
      <strong class="listing-price">${escapeHTML(item.price)}</strong>
    </div>
    <div class="listing-meta">${item.meta.map((meta) => `<span>${escapeHTML(meta)}</span>`).join('')}</div>
  </article>`;
}

function listingSkeletons(count = 6) {
  return Array.from({ length: count }, (_, index) => `<article class="listing-card listing-skeleton listing-delay-${Math.min(index, 7)}" aria-hidden="true"><div class="skeleton-image"></div><div class="skeleton-line skeleton-line-short"></div><div class="skeleton-line"></div><div class="skeleton-meta"></div></article>`).join('');
}

function activateListingCards(grid) {
  requestAnimationFrame(() => {
    grid.querySelectorAll('[data-listing-card]').forEach((card) => card.classList.add('is-visible'));
  });
  grid.querySelectorAll('.listing-image img').forEach((image) => {
    const markLoaded = () => image.classList.add('is-loaded');
    if (image.complete) markLoaded();
    else image.addEventListener('load', markLoaded, { once: true });
  });
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

  const links = [...mobileNav.querySelectorAll('a')];

  const close = ({ restoreFocus = false } = {}) => {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menu');
    mobileNav.setAttribute('aria-hidden', 'true');
    mobileNav.classList.remove('is-open');
    document.body.classList.remove('menu-open');
    if (restoreFocus) toggle.focus();
  };

  const open = () => {
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Fechar menu');
    mobileNav.setAttribute('aria-hidden', 'false');
    mobileNav.classList.add('is-open');
    document.body.classList.add('menu-open');
    requestAnimationFrame(() => links[0]?.focus());
  };

  toggle.addEventListener('click', () => {
    if (toggle.getAttribute('aria-expanded') === 'true') close();
    else open();
  });

  mobileNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => close()));

  document.addEventListener('keydown', (event) => {
    if (toggle.getAttribute('aria-expanded') !== 'true') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close({ restoreFocus: true });
      return;
    }
    if (event.key !== 'Tab' || links.length < 2) return;
    const first = links[0];
    const last = links[links.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.matchMedia('(min-width: 901px)').addEventListener?.('change', (event) => {
    if (event.matches) close();
  });

  close();
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
      : `<span><strong>${resultCount}</strong> imóveis disponíveis</span>`;

    document.querySelector('#clear-filters-inline')?.addEventListener('click', clearFilters);
  }

  function renderListings(items = catalog) {
    grid.innerHTML = items.map((item, index) => listingCard(item, index)).join('');
    activateListingCards(grid);
    if (count) count.textContent = String(items.length).padStart(2, '0');
    if (empty) empty.hidden = items.length > 0;
    renderFilterSummary(items.length);
    form?.classList.remove('has-pending-filters');
  }

  function clearFilters() {
    Object.values(filters).forEach((filter) => { if (filter) filter.value = 'all'; });
    updatePriceOptions();
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

  function updatePriceOptions() {
    const select = filters.price;
    if (!select) return;
    const purpose = filters.purpose?.value || 'all';
    if (purpose === 'all') {
      select.innerHTML = '<option value="all">Escolha comprar ou alugar</option>';
      select.value = 'all';
      select.disabled = true;
      return;
    }

    select.disabled = false;
    const options = purpose === 'Alugar'
      ? [
          ['all', 'Qualquer valor'],
          ['1', 'Até R$ 5 mil/mês'],
          ['2', 'R$ 5 mil a R$ 10 mil/mês'],
          ['3', 'Acima de R$ 10 mil/mês']
        ]
      : [
          ['all', 'Qualquer valor'],
          ['1', 'Até R$ 1,5 mi'],
          ['2', 'R$ 1,5 mi a R$ 3 mi'],
          ['3', 'Acima de R$ 3 mi']
        ];
    select.innerHTML = options.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    select.value = 'all';
  }

  function applyUrlFilters() {
    const params = new URLSearchParams(window.location.search);
    const requestedPurpose = params.get('purpose');
    if (requestedPurpose && [...filters.purpose.options].some((option) => option.value === requestedPurpose)) {
      filters.purpose.value = requestedPurpose;
      updatePriceOptions();
    }
    for (const [key, filter] of Object.entries(filters)) {
      if (!filter || key === 'purpose' || key === 'price') continue;
      const value = params.get(key);
      if (value && [...filter.options].some((option) => option.value === value)) filter.value = value;
    }
    const requestedPrice = params.get('price');
    if (requestedPrice && [...filters.price.options].some((option) => option.value === requestedPrice)) filters.price.value = requestedPrice;
  }

  Object.values(filters).forEach((filter) => filter?.addEventListener('change', () => form?.classList.add('has-pending-filters')));
  filters.purpose?.addEventListener('change', updatePriceOptions);

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
      grid.innerHTML = listingSkeletons(document.body.dataset.page === 'home' ? 6 : 6);
      const response = await fetch('/api/properties', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('LOAD_FAILED');
      const payload = await response.json();
      catalog = Array.isArray(payload?.properties) ? payload.properties.map(normalizeProperty) : [];
      populateFilterOptions();
      updatePriceOptions();
      applyUrlFilters();
      renderListings(catalog);
    } catch {
      grid.innerHTML = '';
      if (count) count.textContent = '00';
      if (empty) empty.hidden = true;
      if (filterSummary) {
        filterSummary.innerHTML = '<span>Não foi possível carregar os imóveis.</span><button type="button" id="retry-properties">Tentar novamente</button>';
        filterSummary.querySelector('#retry-properties')?.addEventListener('click', loadProperties, { once: true });
      }
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
      button.classList.add('is-loading');
      button.textContent = 'Enviando';
    }
    form.dataset.state = 'sending';
    if (status) {
      status.dataset.state = 'sending';
      status.textContent = 'Enviando sua mensagem';
    }

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          interest: data.interest,
          message: data.message,
          propertyPath: window.location.pathname,
          website: data.website
        })
      });

      if (!response.ok) throw new Error('CONTACT_FAILED');
      form.reset();
      form.dataset.state = 'success';
      if (status) {
        status.dataset.state = 'success';
        status.textContent = 'Mensagem enviada. Retornaremos em breve.';
      }
    } catch {
      const fallbackText = `Olá! Meu nome é ${String(data.name || '').trim()}. ${String(data.message || '').trim()}`.slice(0, 1200);
      const whatsapp = await buildWhatsAppFallback(fallbackText);
      form.dataset.state = 'error';
      if (status) {
        status.dataset.state = 'error';
        status.textContent = 'Não foi possível registrar a mensagem. ';
        if (whatsapp) {
          const link = document.createElement('a');
          link.href = whatsapp;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = 'Tentar pelo WhatsApp.';
          status.append(link);
        } else {
          status.append('Tente novamente em alguns instantes.');
        }
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.classList.remove('is-loading');
        button.innerHTML = originalText;
      }
    }
  });
}

function renderPropertyDetail(property) {
  const photos = Array.isArray(property.photos) && property.photos.length
    ? property.photos
    : (property.cover_url ? [{ url: property.cover_url, alt_text: property.title, is_cover: 1 }] : []);
  const primaryIndex = Math.max(0, photos.findIndex((photo) => photo.is_cover));
  const primary = photos[primaryIndex] || photos[0];
  const thumbs = photos.map((photo, index) => `<button class="gallery-thumb${index === primaryIndex ? ' is-active' : ''}" type="button" data-index="${index}" data-image="${escapeHTML(photo.url)}" data-alt="${escapeHTML(photo.alt_text || property.title)}" aria-label="Ver foto ${index + 1} de ${photos.length}"><img src="${escapeHTML(photo.url)}" alt="" loading="lazy" decoding="async" /><span>${String(index + 1).padStart(2, '0')}</span></button>`).join('');

  const featureItems = [
    { label: 'Quartos', value: `${property.bedrooms ?? 0}` },
    { label: 'Suítes', value: `${property.suites ?? 0}`, show: Number(property.suites ?? 0) > 0 },
    { label: 'Banheiros', value: `${property.bathrooms ?? 0}` },
    { label: 'Vagas', value: `${property.parking_spots ?? 0}`, show: Number(property.parking_spots ?? 0) > 0 },
    { label: 'Área privativa', value: `${property.area_m2 ?? 0} m²` },
    { label: 'Condomínio', value: `R$ ${Number(property.condo_fee ?? 0).toLocaleString('pt-BR')}`, show: Number(property.condo_fee ?? 0) > 0 },
    { label: 'IPTU / ano', value: `R$ ${Number(property.iptu ?? 0).toLocaleString('pt-BR')}`, show: Number(property.iptu ?? 0) > 0 },
    { label: 'Tipo', value: property.type || '' }
  ];

  const features = featureItems
    .filter((feature) => feature.show !== false)
    .map((feature) => `<div class="property-feature"><span>${escapeHTML(feature.label)}</span><strong>${escapeHTML(feature.value)}</strong></div>`)
    .join('');

  const gallery = photos.length ? `
    <div class="gallery-main">
      <img src="${escapeHTML(primary.url)}" alt="${escapeHTML(primary.alt_text || property.title)}" fetchpriority="high" decoding="async" />
      <div class="gallery-main-overlay">
        <span class="gallery-count"><strong data-gallery-current>${String(primaryIndex + 1).padStart(2, '0')}</strong> / ${String(photos.length).padStart(2, '0')}</span>
        ${photos.length > 1 ? '<div class="gallery-controls"><button type="button" data-gallery-prev aria-label="Foto anterior">←</button><button type="button" data-gallery-next aria-label="Próxima foto">→</button></div>' : ''}
      </div>
      <span class="sr-only" data-gallery-status aria-live="polite"></span>
    </div>
    ${photos.length > 1 ? `<div class="gallery-thumbs" aria-label="Galeria de fotos">${thumbs}</div>` : ''}
  ` : '';

  return `<nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Início</a><span aria-hidden="true">›</span><a href="/imoveis">Imóveis</a><span aria-hidden="true">›</span><span aria-current="page">${escapeHTML(property.title)}</span></nav>
    <section class="property-hero">
      <div class="property-gallery">${gallery}</div>
      <aside class="property-summary">
        <div class="property-summary-topline"><span>${escapeHTML(property.purpose)}</span><span>${escapeHTML(property.type)}</span></div>
        <h1>${escapeHTML(property.title)}</h1>
        <p class="property-location">${escapeHTML(property.location)}</p>
        <strong class="property-price">${escapeHTML(property.price_label)}</strong>
        <div class="property-summary-divider"></div>
        <p class="property-section-label">Detalhes do imóvel</p>
        <div class="property-features">${features}</div>
        <div class="property-actions">
          <a class="button button-primary" href="#contato">Tenho interesse <span aria-hidden="true">↗</span></a>
          <a class="property-back-link" href="/imoveis">← Ver outros imóveis</a>
        </div>
      </aside>
    </section>
    <section class="property-description">
      <div><p class="eyebrow">descrição</p><span class="property-description-index">01</span></div>
      <p class="property-description-copy">${escapeHTML(property.description || '')}</p>
    </section>`;
}

function initPropertyDetail() {
  const root = document.querySelector('#property-root');
  const dataEl = document.querySelector('#property-data');
  if (!root || !dataEl) return;

  let property = null;
  try { property = JSON.parse(dataEl.textContent); } catch {}
  if (!property) {
    root.innerHTML = '<p class="empty-state">Não foi possível carregar este imóvel.</p>';
    return;
  }

  root.innerHTML = renderPropertyDetail(property);
  const thumbs = [...root.querySelectorAll('.gallery-thumb')];
  const mainImage = root.querySelector('.gallery-main img');
  const current = root.querySelector('[data-gallery-current]');
  const galleryStatus = root.querySelector('[data-gallery-status]');
  let activeIndex = Math.max(0, thumbs.findIndex((thumb) => thumb.classList.contains('is-active')));

  const selectPhoto = (index) => {
    if (!thumbs.length || !mainImage) return;
    activeIndex = (index + thumbs.length) % thumbs.length;
    const thumb = thumbs[activeIndex];
    mainImage.classList.add('is-switching');
    const nextSrc = thumb.dataset.image;
    const nextAlt = thumb.dataset.alt || property.title;
    const preloader = new Image();
    preloader.onload = () => {
      mainImage.src = nextSrc;
      mainImage.alt = nextAlt;
      requestAnimationFrame(() => mainImage.classList.remove('is-switching'));
    };
    preloader.src = nextSrc;
    thumbs.forEach((item, i) => item.classList.toggle('is-active', i === activeIndex));
    thumb.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    if (current) current.textContent = String(activeIndex + 1).padStart(2, '0');
    if (galleryStatus) galleryStatus.textContent = `Foto ${activeIndex + 1} de ${thumbs.length}: ${nextAlt}`;
  };

  thumbs.forEach((thumb, index) => thumb.addEventListener('click', () => selectPhoto(index)));
  root.querySelector('[data-gallery-prev]')?.addEventListener('click', () => selectPhoto(activeIndex - 1));
  root.querySelector('[data-gallery-next]')?.addEventListener('click', () => selectPhoto(activeIndex + 1));

  const galleryMain = root.querySelector('.gallery-main');
  let pointerStartX = null;
  galleryMain?.addEventListener('pointerdown', (event) => { pointerStartX = event.clientX; });
  galleryMain?.addEventListener('pointerup', (event) => {
    if (pointerStartX == null || thumbs.length < 2) return;
    const delta = event.clientX - pointerStartX;
    pointerStartX = null;
    if (Math.abs(delta) > 44) selectPhoto(activeIndex + (delta < 0 ? 1 : -1));
  });
  galleryMain?.setAttribute('tabindex', '0');
  galleryMain?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') selectPhoto(activeIndex - 1);
    if (event.key === 'ArrowRight') selectPhoto(activeIndex + 1);
  });
}

function initScrollPolish() {
  const header = document.querySelector('.site-header');
  const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 18);
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  const targetGroups = [
    ['.section-heading', 'motion-rise'],
    ['.brand-statement', 'motion-rule'],
    ['.experience-intro', 'motion-drift'],
    ['.stats', 'motion-grid'],
    ['.testimonial-feature', 'motion-quote'],
    ['.contact-grid', 'motion-form'],
    ['.about-visual', 'motion-drift'],
    ['.about-values-grid', 'motion-rise'],
    ['.catalog-results-head', 'motion-rule'],
    ['.property-description', 'motion-quote']
  ];
  const targets = [];
  targetGroups.forEach(([selector, motionClass]) => {
    document.querySelectorAll(selector).forEach((target) => {
      target.classList.add('motion-target', motionClass);
      targets.push(target);
    });
  });
  if (!('IntersectionObserver' in window)) {
    targets.forEach((target) => target.classList.add('is-revealed'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -24px' });

  targets.forEach((target) => {
    target.classList.add('reveal-on-scroll');
    observer.observe(target);
  });
}

function initTestimonials() {
  const features = document.querySelectorAll('.testimonial-feature');
  if (!features.length) return;
  const prev = document.querySelector('[data-quote-prev]');
  const next = document.querySelector('[data-quote-next]');
  let index = 0;

  const show = (i, direction = 1) => {
    features.forEach((feature, j) => {
      feature.hidden = j !== i;
      if (j === i) {
        feature.dataset.direction = direction > 0 ? 'next' : 'previous';
        feature.classList.remove('is-active');
        requestAnimationFrame(() => feature.classList.add('is-active'));
      } else {
        feature.classList.remove('is-active');
      }
    });
  };

  prev?.addEventListener('click', () => { index = (index - 1 + features.length) % features.length; show(index, -1); });
  next?.addEventListener('click', () => { index = (index + 1) % features.length; show(index, 1); });
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
initScrollPolish();
