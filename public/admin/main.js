function ensureAdminStyles() {
  for (const href of ['/admin/styles.css', '/admin/refinements.css']) {
    if (document.querySelector(`link[href="${href}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.append(link);
  }
}

ensureAdminStyles();


const state = { user: null, csrfToken: '', properties: [], leads: [], leadPagination: null, leadFilters: { status: '', date_from: '', date_to: '', page: 1, per_page: 20 }, team: [], invitations: [], audit: [], editing: null, pendingFiles: [], pendingPreviewGeneration: 0, search: '' };
const $ = (selector) => document.querySelector(selector);
const loginScreen = $('#login-screen');
const dashboard = $('#dashboard');
const dialog = $('#property-dialog');
const form = $('#property-form');

function escapeHTML(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[char]); }
function formatDate(value) { return value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(value)) : 'agora'; }
function toast(message, tone = 'success') { const status = $('#editor-status'); status.textContent = message; status.dataset.tone = tone; }

async function request(url, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  const method = String(options.method || 'GET').toUpperCase();
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && state.csrfToken) {
    headers['X-CSRF-Token'] = state.csrfToken;
  }
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  if (response.status === 401) { showLogin(); throw new Error('AUTH_REQUIRED'); }
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'REQUEST_FAILED'); }
  return response.status === 204 ? null : response.json();
}

function clearSensitiveState() {
  state.user = null;
  state.csrfToken = '';
  state.properties = [];
  state.leads = [];
  state.leadPagination = null;
  state.leadFilters = { status: '', date_from: '', date_to: '', page: 1, per_page: 20 };
  state.team = [];
  state.invitations = [];
  state.audit = [];
  state.editing = null;
  state.search = '';
  clearPendingFiles();
  if (dialog?.open) dialog.close();
  const propertyList = $('#property-list');
  const leadList = $('#lead-list');
  const teamList = $('#team-list');
  const invitationList = $('#team-invitations');
  const invitationResult = $('#team-invite-result');
  const auditList = $('#audit-list');
  if (propertyList) propertyList.innerHTML = '';
  if (leadList) leadList.innerHTML = '';
  if (teamList) teamList.innerHTML = '';
  if (invitationList) invitationList.innerHTML = '';
  if (invitationResult) invitationResult.hidden = true;
  if (auditList) auditList.innerHTML = '';
}

function invitationTokenFromUrl() {
  const value = new URLSearchParams(window.location.search).get('invite');
  return /^[A-Za-z0-9_-]{43}$/.test(value || '') ? value : '';
}

function loginUrl() {
  const token = invitationTokenFromUrl();
  return token ? `/api/auth/login?invite=${encodeURIComponent(token)}` : '/api/auth/login';
}

function showLogin() {
  clearSensitiveState();
  dashboard.hidden = true;
  loginScreen.hidden = false;
  $('#login-button').href = loginUrl();
}

function sessionStatus(message = '', tone = '') {
  const element = $('#session-status');
  if (!element) return;
  element.textContent = message;
  element.dataset.tone = tone;
}

async function performLogout({ all = false } = {}) {
  const currentButton = all ? $('#logout-all-button') : $('#logout-button');
  const otherButton = all ? $('#logout-button') : $('#logout-all-button');
  if (currentButton) currentButton.disabled = true;
  if (otherButton) otherButton.disabled = true;
  sessionStatus(all ? 'Encerrando todas as sessões…' : 'Encerrando sessão…');

  try {
    const response = await fetch(all ? '/api/auth/logout-all' : '/api/auth/logout', {
      method: 'POST',
      headers: { Accept: 'application/json', ...(state.csrfToken ? { 'X-CSRF-Token': state.csrfToken } : {}) },
      credentials: 'same-origin'
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok !== true) {
      if (body?.localLoggedOut) {
        showLogin();
        return;
      }
      throw new Error(body?.error || 'LOGOUT_FAILED');
    }
    showLogin();
  } catch {
    sessionStatus(
      all
        ? 'Não foi possível revogar todas as sessões. Tente novamente.'
        : 'Não foi possível confirmar a revogação da sessão. Tente novamente.',
      'error'
    );
  } finally {
    if (currentButton) currentButton.disabled = false;
    if (otherButton) otherButton.disabled = false;
  }
}
function showDashboard() {
  loginScreen.hidden = true;
  dashboard.hidden = false;
  $('#user-name').textContent = state.user?.name?.split(' ')[0] || 'equipe';
  const manager = state.user?.role === 'manager';
  document.querySelectorAll('[data-manager-only]').forEach((element) => { element.hidden = !manager; });
  const roleChip = $('#user-role');
  if (roleChip) {
    roleChip.textContent = manager ? 'Gestor' : 'Corretor / Editor';
    roleChip.dataset.role = manager ? 'manager' : 'editor';
  }
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const title = $('#page-title');
  if (title?.childNodes?.[0]) title.childNodes[0].textContent = `${greeting}, `;
  const kicker = document.querySelector('.admin-topbar .admin-kicker');
  if (kicker) kicker.textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date());
}

function renderProperties() {
  const published = state.properties.filter((item) => item.status === 'published').length;
  const drafts = state.properties.filter((item) => item.status === 'draft').length;
  const active = state.properties.filter((item) => item.status !== 'archived').length;
  $('#metric-total').textContent = String(active).padStart(2, '0');
  $('#metric-published').textContent = String(published).padStart(2, '0');
  $('#metric-draft').textContent = String(drafts).padStart(2, '0');
  const query = String(state.search || '').trim().toLowerCase();
  const items = query ? state.properties.filter((item) => `${item.title} ${item.location} ${item.type}`.toLowerCase().includes(query)) : state.properties;
  $('#side-count').textContent = state.properties.length;
  $('#property-list').innerHTML = items.length ? items.map((item) => {
    const canEdit = state.user?.role === 'manager' || item.status === 'draft';
    const action = canEdit
      ? `<button class="row-action" data-edit="${item.id}" type="button" aria-label="Editar ${escapeHTML(item.title)}">Editar <span>↗</span></button>`
      : '<span class="row-locked" title="Somente Gestor pode alterar imóvel publicado ou arquivado">Somente Gestor</span>';
    return `<article class="property-row"><div class="property-identity"><div class="property-thumb">${item.cover_url ? `<img src="${escapeHTML(item.cover_url)}" alt="" />` : '<span>⌂</span>'}</div><div><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.location)} · ${escapeHTML(item.type)}</small></div></div><span class="status-pill ${item.status}"><i></i>${item.status === 'published' ? 'Publicado' : item.status === 'archived' ? 'Arquivado' : 'Rascunho'}</span><span class="updated-date">${formatDate(item.updated_at)}</span>${action}</article>`;
  }).join('') : (query ? '<div class="empty-properties"><span>⌕</span><h4>Nenhum resultado.</h4><p>Tente outro termo de busca.</p></div>' : '<div class="empty-properties"><span>✦</span><h4>Seu portfólio começa aqui.</h4><p>Cadastre o primeiro imóvel para começar a construir a vitrine da Gisley Nunes.</p><button class="outline-button" data-empty-new type="button">Cadastrar primeiro imóvel <span>＋</span></button></div>');
  document.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => openEditor(state.properties.find((item) => item.id === button.dataset.edit))));
  $('[data-empty-new]')?.addEventListener('click', () => openEditor());
}

function fillForm(property = {}) {
  for (const [key, value] of Object.entries({ title: property.title || '', location: property.location || '', city: property.city || 'Belo Horizonte', purpose: property.purpose || 'Comprar', type: property.type || 'Apartamento', price: property.price || '', priceLabel: property.price_label || '', bedrooms: property.bedrooms ?? 2, bathrooms: property.bathrooms ?? 2, areaM2: property.area_m2 ?? 80, suites: property.suites ?? 0, parkingSpots: property.parking_spots ?? 0, condoFee: property.condo_fee ?? 0, iptu: property.iptu ?? 0, description: property.description || '' })) { if (form.elements[key]) form.elements[key].value = value; }
  form.elements.published.checked = property.status !== 'draft' && property.status !== 'archived';
  form.elements.featured.checked = Boolean(property.is_featured);
}
function renderPhotos(photos = []) { $('#photo-grid').innerHTML = photos.length ? photos.map((photo, index) => `<div class="photo-tile${photo.is_cover ? ' is-cover' : ''}"><img src="${escapeHTML(photo.url)}" alt="${escapeHTML(photo.alt_text)}" /><span>${photo.is_cover ? 'capa' : String(index + 1).padStart(2, '0')}</span><div class="photo-tile-actions"><button data-photo-cover="${photo.id}" type="button" aria-label="Definir como capa" title="Definir como capa">★</button><button data-photo-up="${photo.id}" type="button" aria-label="Mover para cima" ${index === 0 ? 'disabled' : ''}>↑</button><button data-photo-down="${photo.id}" type="button" aria-label="Mover para baixo" ${index === photos.length - 1 ? 'disabled' : ''}>↓</button><button data-photo-remove="${photo.id}" type="button" aria-label="Remover foto">×</button></div></div>`).join('') : '<div class="photo-empty"><span>＋</span><p>Adicione fotos para<br />dar vida ao imóvel.</p></div>'; document.querySelectorAll('[data-photo-remove]').forEach((button) => button.addEventListener('click', () => removePhoto(button.dataset.photoRemove))); document.querySelectorAll('[data-photo-cover]').forEach((button) => button.addEventListener('click', () => makeCover(button.dataset.photoCover))); document.querySelectorAll('[data-photo-up]').forEach((button) => button.addEventListener('click', () => movePhoto(button.dataset.photoUp, -1))); document.querySelectorAll('[data-photo-down]').forEach((button) => button.addEventListener('click', () => movePhoto(button.dataset.photoDown, 1))); }

function clearPendingPreviews() {
  state.pendingPreviewGeneration += 1;
}

function clearPendingFiles() {
  clearPendingPreviews();
  state.pendingFiles = [];
  const input = $('#photo-input');
  if (input) input.value = '';
}

function renderEditorPhotos() {
  renderPhotos(state.editing?.photos || []);
  if (!state.pendingFiles.length) return;

  clearPendingPreviews();
  const previewGeneration = state.pendingPreviewGeneration;
  const grid = $('#photo-grid');
  const existingPhotoCount = state.editing?.photos?.length || 0;
  const pendingPhotos = document.createDocumentFragment();
  state.pendingFiles.forEach((file, index) => {
    const becomesCover = existingPhotoCount === 0 && index === 0;
    const tile = document.createElement('div');
    tile.className = 'photo-tile pending';

    const preview = document.createElement('canvas');
    preview.width = 1;
    preview.height = 1;
    preview.setAttribute('role', 'img');
    preview.setAttribute('aria-label', 'Pré-visualização da foto pendente');
    preview.style.width = '100%';
    preview.style.height = '100%';
    preview.style.objectFit = 'cover';
    preview.style.display = 'block';
    void createImageBitmap(file).then((bitmap) => {
      try {
        if (previewGeneration !== state.pendingPreviewGeneration) return;
        const scale = Math.min(1, 640 / bitmap.width, 640 / bitmap.height);
        preview.width = Math.max(1, Math.round(bitmap.width * scale));
        preview.height = Math.max(1, Math.round(bitmap.height * scale));
        preview.getContext('2d')?.drawImage(bitmap, 0, 0, preview.width, preview.height);
      } finally {
        bitmap.close();
      }
    }).catch(() => {
      if (previewGeneration === state.pendingPreviewGeneration) {
        preview.setAttribute('aria-label', 'Pré-visualização indisponível');
      }
    });
    tile.append(preview);

    const label = document.createElement('span');
    label.textContent = becomesCover ? 'nova capa' : 'nova';
    tile.append(label);

    const actions = document.createElement('div');
    actions.className = 'photo-tile-actions';
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.setAttribute('aria-label', 'Remover foto pendente');
    removeButton.textContent = '×';
    removeButton.addEventListener('click', () => {
      state.pendingFiles.splice(index, 1);
      renderEditorPhotos();
    });
    actions.append(removeButton);
    tile.append(actions);
    pendingPhotos.append(tile);
  });

  if (existingPhotoCount === 0) grid.replaceChildren(pendingPhotos);
  else grid.append(pendingPhotos);
}
function openEditor(property = null) {
  const isManager = state.user?.role === 'manager';
  if (property && !isManager && property.status !== 'draft') {
    toast('Somente Gestor pode alterar imóvel publicado ou arquivado.', 'error');
    return;
  }

  state.editing = property;
  clearPendingFiles();
  $('#dialog-title').textContent = property ? 'Editar imóvel' : 'Novo imóvel';
  fillForm(property || {});
  renderEditorPhotos();
  $('#editor-status').textContent = '';
  const archiveButton = $('#archive-property');
  if (archiveButton) archiveButton.hidden = !isManager || !property || property.status === 'archived';

  const publishedInput = form.elements.published;
  const featuredInput = form.elements.featured;
  if (publishedInput) {
    publishedInput.disabled = !isManager;
    if (!isManager) publishedInput.checked = false;
  }
  if (featuredInput) {
    featuredInput.disabled = !isManager;
    if (!isManager) featuredInput.checked = false;
  }

  dialog.showModal();
}

async function saveProperty(event) {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();

  const button = $('#save-property');
  button.disabled = true;
  toast('Salvando alterações…');

  const data = Object.fromEntries(new FormData(form));
  const isManager = state.user?.role === 'manager';
  data.published = isManager && form.elements.published.checked;
  data.featured = isManager && form.elements.featured.checked;
  data.status = data.published ? 'published' : 'draft';

  let propertySaved = false;
  const publishAfterUpload = data.status === 'published'
    && state.pendingFiles.length > 0
    && !state.editing?.photos?.some((photo) => photo.is_cover);
  try {
    const initialData = publishAfterUpload
      ? { ...data, status: 'draft', published: false, featured: false }
      : data;
    const result = await request(
      state.editing ? `/api/admin/properties/${state.editing.id}` : '/api/admin/properties',
      { method: state.editing ? 'PUT' : 'POST', body: JSON.stringify(initialData) }
    );

    state.editing = result.property;
    propertySaved = true;
    await uploadPendingFiles(result.property.id);
    if (publishAfterUpload) {
      const published = await request(`/api/admin/properties/${result.property.id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      state.editing = published.property;
    }

    state.properties = (await request('/api/admin/properties')).properties;
    renderProperties();
    dialog.close();
  } catch (error) {
    if (error.message === 'AUTH_REQUIRED') {
      toast('Sua sessão expirou.', 'error');
    } else if (propertySaved) {
      state.properties = (await request('/api/admin/properties').catch(() => ({ properties: state.properties }))).properties;
      renderProperties();
      renderEditorPhotos();
      toast(state.pendingFiles.length
        ? 'Imóvel salvo. Algumas fotos ficaram pendentes; tente enviá-las novamente.'
        : data.status === 'published'
          ? 'Imóvel salvo como rascunho. Confira a capa e tente publicar novamente.'
          : 'Imóvel salvo, mas não foi possível concluir a atualização. Tente novamente.', 'error');
    } else {
      const message = error.message === 'SLUG_CONFLICT'
        ? 'Já existe um imóvel com esse endereço de URL.'
        : error.message === 'COVER_REQUIRED'
          ? 'Adicione uma foto de capa antes de publicar.'
          : 'Não foi possível salvar. Confira os dados e tente novamente.';
      toast(message, 'error');
    }
  } finally {
    button.disabled = false;
  }
}


async function archiveProperty() {
  if (!state.editing) return;
  const confirmed = window.confirm(`Arquivar "${state.editing.title}"? Ele deixará de aparecer no site público.`);
  if (!confirmed) return;
  const button = $('#archive-property');
  if (button) button.disabled = true;
  toast('Arquivando imóvel…');
  try {
    await request(`/api/admin/properties/${state.editing.id}`, { method: 'DELETE' });
    state.properties = (await request('/api/admin/properties')).properties;
    renderProperties();
    dialog.close();
  } catch {
    toast('Não foi possível arquivar este imóvel.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function imageDimensions(file) {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dimensions);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('INVALID_IMAGE'));
    };
    image.src = url;
  });
}

async function uploadPendingFiles(propertyId) {
  let uploadedCount = 0;

  while (state.pendingFiles.length) {
    const file = state.pendingFiles[0];
    const existingPhotoCount = state.editing?.photos?.length || 0;
    toast(`Enviando foto ${uploadedCount + 1}…`);

    const dimensions = await imageDimensions(file);
    const presign = await request('/api/admin/uploads/presign', {
      method: 'POST',
      body: JSON.stringify({
        propertyId,
        fileName: file.name,
        contentType: file.type,
        size: file.size
      })
    });

    const upload = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: presign.uploadHeaders || { 'Content-Type': file.type },
      body: file
    });
    if (!upload.ok) throw new Error('UPLOAD_FAILED');

    const result = await request(`/api/admin/properties/${propertyId}/photos`, {
      method: 'POST',
      body: JSON.stringify({
        storagePath: presign.storagePath,
        altText: file.name.replace(/\.[^.]+$/, ''),
        sortOrder: existingPhotoCount,
        isCover: !state.editing?.photos?.some((photo) => photo.is_cover),
        contentType: file.type,
        size: file.size,
        width: dimensions.width,
        height: dimensions.height
      })
    });

    state.editing = { ...state.editing, photos: result.photos };
    state.pendingFiles.shift();
    uploadedCount += 1;
    renderEditorPhotos();
  }

  clearPendingFiles();
}

async function removePhoto(id) { if (!state.editing) return; try { await request(`/api/admin/photos/${id}`, { method: 'DELETE' }); const result = await request(`/api/admin/properties/${state.editing.id}`); state.editing = result.property; renderPhotos(state.editing.photos); } catch { toast('Não foi possível remover esta foto.', 'error'); } }

async function movePhoto(id, direction) {
  if (!state.editing) return;
  const photos = [...state.editing.photos];
  const index = photos.findIndex((photo) => photo.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= photos.length) return;
  [photos[index], photos[target]] = [photos[target], photos[index]];
  state.editing.photos = photos;
  renderPhotos(photos);
  try {
    const result = await request(`/api/admin/properties/${state.editing.id}/photos/order`, { method: 'PUT', body: JSON.stringify({ photoIds: photos.map((photo) => photo.id) }) });
    state.editing.photos = result.photos;
    renderPhotos(result.photos);
  } catch { toast('Não foi possível reordenar.', 'error'); }
}

async function makeCover(id) {
  if (!state.editing) return;
  try {
    const result = await request(`/api/admin/photos/${id}/cover`, { method: 'PUT' });
    state.editing.photos = result.photos;
    renderPhotos(result.photos);
  } catch { toast('Não foi possível definir a capa.', 'error'); }
}

const siteForm = $('#site-settings-form');
const testimonialForm = $('#testimonial-form');
const teamForm = $('#team-form');
let siteLoaded = false;
let teamLoaded = false;
let auditLoaded = false;

function siteNotify(message, tone = 'success') { const status = $('#site-status'); status.textContent = message; status.dataset.tone = tone; }

function switchView(name) {
  document.querySelectorAll('.admin-view').forEach((view) => { view.hidden = view.id !== name; });
  document.querySelectorAll('.side-nav a[data-view]').forEach((link) => { link.classList.toggle('active', link.dataset.view === name); });
  if (name === 'site-view' && !siteLoaded) { siteLoaded = true; loadSite(); }
  if (name === 'team-view' && state.user?.role === 'manager' && !teamLoaded) { teamLoaded = true; loadTeam(); }
  if (name === 'audit-view' && state.user?.role === 'manager' && !auditLoaded) { auditLoaded = true; loadAudit(); }
}

function renderTestimonials(items = []) {
  const list = $('#testimonial-list');
  list.innerHTML = items.length ? items.map((item) => `<article class="testimonial-row"><div><strong>${escapeHTML(item.author)}</strong><p>${escapeHTML(item.quote)}</p><small>${escapeHTML(item.location || '')}${item.year ? ' · ' + escapeHTML(item.year) : ''}</small></div><button data-testimonial-remove="${item.id}" type="button" aria-label="Remover depoimento">×</button></article>`).join('') : '<div class="photo-empty"><span>✦</span><p>Nenhum depoimento ainda.</p></div>';
  list.querySelectorAll('[data-testimonial-remove]').forEach((button) => button.addEventListener('click', () => removeTestimonial(button.dataset.testimonialRemove)));
}

async function loadSite() {
  try {
    const data = await request('/api/admin/site');
    const values = { whatsapp: data.site.whatsapp, phoneDisplay: data.site.phoneDisplay, email: data.site.email, address: data.site.address, crci: data.site.crci, area: data.site.area, instagramUrl: data.site.instagramUrl, instagramDisplay: data.site.instagramDisplay };
    for (const [key, value] of Object.entries(values)) { if (siteForm.elements[key]) siteForm.elements[key].value = value ?? ''; }
    renderTestimonials(data.testimonials);
  } catch { siteNotify('Não foi possível carregar os dados do site.', 'error'); }
}

async function saveSite(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(siteForm));
  try {
    await request('/api/admin/site', { method: 'PUT', body: JSON.stringify(data) });
    siteNotify('Dados do site salvos com sucesso.');
  } catch { siteNotify('Não foi possível salvar. Tente novamente.', 'error'); }
}

async function addTestimonial(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(testimonialForm));
  if (!data.author || !data.quote) { siteNotify('Preencha nome e depoimento.', 'error'); return; }
  try {
    const result = await request('/api/admin/testimonials', { method: 'POST', body: JSON.stringify({ author: data.author, quote: data.quote, location: data.location, year: data.year, sortOrder: 0 }) });
    renderTestimonials(result.testimonials);
    testimonialForm.reset();
    siteNotify('Depoimento adicionado.');
  } catch { siteNotify('Não foi possível adicionar o depoimento.', 'error'); }
}

async function removeTestimonial(id) {
  try {
    await request(`/api/admin/testimonials/${id}`, { method: 'DELETE' });
    const data = await request('/api/admin/site');
    renderTestimonials(data.testimonials);
    siteNotify('Depoimento removido.');
  } catch { siteNotify('Não foi possível remover o depoimento.', 'error'); }
}

const auditLabels = {
  'property.create': 'Imóvel criado',
  'property.update': 'Imóvel atualizado',
  'property.archive': 'Imóvel arquivado',
  'photo.add': 'Foto adicionada',
  'photo.remove': 'Foto removida',
  'photo.reorder': 'Galeria reordenada',
  'photo.cover': 'Capa alterada',
  'site.update': 'Dados do site atualizados',
  'testimonial.create': 'Depoimento adicionado',
  'testimonial.remove': 'Depoimento removido',
  'lead.status': 'Status do contato alterado',
  'lead.delete': 'Dados de contato apagados',
  'team.create': 'Acesso de equipe criado',
  'team.invite': 'Convite de equipe gerado',
  'team.invite.revoke': 'Convite de equipe revogado',
  'team.update': 'Acesso de equipe atualizado',
  'team.remove': 'Acesso de equipe removido'
};

function renderAudit() {
  const list = $('#audit-list');
  if (!list) return;
  list.innerHTML = state.audit.length ? state.audit.map((entry) => {
    const label = auditLabels[entry.action] || entry.action;
    const when = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.created_at));
    return `<article class="audit-row"><div><strong>${escapeHTML(label)}</strong><span>${escapeHTML(entry.entity_type)}${entry.entity_id ? ' · ' + escapeHTML(entry.entity_id) : ''}</span></div><div><span>${escapeHTML(entry.actor_email)}</span><time datetime="${escapeHTML(entry.created_at)}">${escapeHTML(when)}</time></div></article>`;
  }).join('') : '<div class="empty-properties compact"><span>◷</span><h4>Nenhuma atividade registrada.</h4><p>As ações críticas do CRM aparecerão aqui.</p></div>';
}

async function loadAudit() {
  const status = $('#audit-status');
  try {
    state.audit = (await request('/api/admin/audit?limit=100')).audit || [];
    renderAudit();
    if (status) status.textContent = '';
  } catch {
    if (status) {
      status.textContent = 'Não foi possível carregar o histórico agora.';
      status.dataset.tone = 'error';
    }
  }
}

function teamNotify(message, tone = 'success') {
  const status = $('#team-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function renderTeam() {
  const list = $('#team-list');
  if (!list) return;
  list.innerHTML = state.team.length ? state.team.map((member) => {
    const isSelf = Boolean(member.is_self);
    const isBootstrap = Boolean(member.is_bootstrap);
    const roleLabel = member.role === 'manager' ? 'Gestor' : 'Corretor / Editor';
    return `<article class="team-row">
      <div class="team-person"><span class="team-avatar">${escapeHTML((member.name || member.email || '?').charAt(0).toUpperCase())}</span><div><strong>${escapeHTML(member.name)}</strong><a href="mailto:${escapeHTML(member.email)}">${escapeHTML(member.email)}</a></div></div>
      <div class="team-permission"><span class="role-pill ${member.role}">${roleLabel}</span>${isSelf ? '<small>você</small>' : ''}${isBootstrap ? '<small>principal</small>' : ''}</div>
      <div class="team-actions">
        ${!isSelf && !isBootstrap ? `<button type="button" data-team-role="${escapeHTML(member.email)}" data-next-role="${member.role === 'manager' ? 'editor' : 'manager'}">${member.role === 'manager' ? 'Tornar editor' : 'Tornar gestor'}</button><button class="danger" type="button" data-team-remove="${escapeHTML(member.email)}">Remover</button>` : ''}
      </div>
    </article>`;
  }).join('') : '<div class="empty-properties compact"><span>◎</span><h4>Nenhum acesso adicional.</h4><p>Adicione um corretor ou outro gestor para começar.</p></div>';

  list.querySelectorAll('[data-team-role]').forEach((button) => button.addEventListener('click', async () => {
    try {
      const email = button.dataset.teamRole;
      await request(`/api/admin/team/${encodeURIComponent(email)}`, { method: 'PATCH', body: JSON.stringify({ role: button.dataset.nextRole }) });
      await loadTeam();
      teamNotify('Permissão atualizada.');
    } catch (error) {
      teamNotify(error.message === 'BOOTSTRAP_MANAGER_PROTECTED' ? 'O gestor principal não pode ser rebaixado.' : 'Não foi possível alterar a permissão.', 'error');
    }
  }));

  list.querySelectorAll('[data-team-remove]').forEach((button) => button.addEventListener('click', async () => {
    try {
      await request(`/api/admin/team/${encodeURIComponent(button.dataset.teamRemove)}`, { method: 'DELETE' });
      await loadTeam();
      teamNotify('Acesso removido.');
    } catch (error) {
      teamNotify(error.message === 'BOOTSTRAP_MANAGER_PROTECTED' ? 'O gestor principal não pode ser removido.' : 'Não foi possível remover o acesso.', 'error');
    }
  }));
}

function renderTeamInvitations() {
  const list = $('#team-invitations');
  if (!list) return;
  list.innerHTML = state.invitations.length ? state.invitations.map((invitation) => {
    const roleLabel = invitation.role === 'manager' ? 'Gestor' : 'Corretor / Editor';
    const expires = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(invitation.expires_at_ms));
    return `<article class="team-invitation-row"><div><strong>${escapeHTML(invitation.name)}</strong><span>${escapeHTML(invitation.email)} · ${roleLabel} · expira ${escapeHTML(expires)}</span></div><button class="danger" type="button" data-team-invite-revoke="${escapeHTML(invitation.email)}">Revogar</button></article>`;
  }).join('') : '<div class="empty-properties compact"><p>Nenhum convite pendente.</p></div>';

  list.querySelectorAll('[data-team-invite-revoke]').forEach((button) => button.addEventListener('click', async () => {
    try {
      await request(`/api/admin/team/invitations/${encodeURIComponent(button.dataset.teamInviteRevoke)}`, { method: 'DELETE' });
      await loadTeam();
      teamNotify('Convite revogado.');
    } catch {
      teamNotify('Não foi possível revogar este convite.', 'error');
    }
  }));
}

async function loadTeam() {
  try {
    state.team = (await request('/api/admin/team')).team || [];
    state.invitations = (await request('/api/admin/team/invitations')).invitations || [];
    renderTeam();
    renderTeamInvitations();
  } catch {
    const list = $('#team-list');
    if (list) list.innerHTML = '<div class="empty-properties compact"><p>Não foi possível carregar a equipe agora.</p></div>';
    const invitations = $('#team-invitations');
    if (invitations) invitations.innerHTML = '';
  }
}

async function createTeamInvitation(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(teamForm));
  try {
    const result = await request('/api/admin/team/invitations', { method: 'POST', body: JSON.stringify(data) });
    teamForm.reset();
    const invitation = result.invitation;
    const resultBox = $('#team-invite-result');
    const urlInput = $('#team-invite-url');
    const expiry = $('#team-invite-expiry');
    if (resultBox && urlInput && expiry) {
      urlInput.value = invitation.url;
      expiry.textContent = `Válido até ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(invitation.expiresAtMs))}.`;
      resultBox.hidden = false;
    }
    await loadTeam();
    teamNotify('Convite gerado. Copie o link e envie somente à pessoa convidada.');
  } catch (error) {
    teamNotify(
      error.message === 'INVALID_INVITATION'
        ? 'Confira nome, e-mail e permissão.'
          : error.message === 'TEAM_MEMBER_EXISTS'
            ? 'Esse e-mail ou identidade já está vinculado a outro acesso.'
          : error.message === 'INVITATION_EXISTS'
            ? 'Não foi possível gerar outro convite agora. Tente novamente.'
          : 'Não foi possível adicionar este acesso.',
      'error'
    );
  }
}

function ensureLeadsPanel() {
  if ($('#leads-panel')) return $('#leads-panel');
  const metrics = document.querySelector('.metrics-grid');
  if (!metrics) return null;
  const panel = document.createElement('section');
  panel.id = 'leads-panel';
  panel.className = 'leads-panel';
  panel.innerHTML = '<div class="leads-panel-head"><div><p class="admin-kicker">relacionamento</p><h3>Contatos recebidos pelo site.</h3><p id="lead-status" class="lead-status" role="status" aria-live="polite"></p></div><span id="lead-total" class="lead-total">0 novos</span></div><form id="lead-filters" class="lead-filters"><label>Status<select name="status"><option value="">Todos</option><option value="new">Novo</option><option value="em_contato">Em contato</option><option value="fechado">Fechado</option><option value="perdido">Perdido</option></select></label><label>De<input name="date_from" type="date" /></label><label>Até<input name="date_to" type="date" /></label><label>Por página<select name="per_page"><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></label><button class="outline-button" type="submit">Filtrar</button><a class="outline-button lead-export" data-lead-export="csv" href="/api/admin/leads/export?format=csv">Exportar CSV</a><a class="outline-button lead-export" data-lead-export="json" href="/api/admin/leads/export?format=json">Exportar JSON</a></form><div id="lead-list" class="lead-list" aria-live="polite"></div><div class="lead-pagination"><span id="lead-page-summary"></span><div><button class="outline-button" type="button" data-lead-page="previous">Anterior</button><button class="outline-button" type="button" data-lead-page="next">Próxima</button></div></div>';
  metrics.insertAdjacentElement('afterend', panel);
  $('#lead-filters').addEventListener('submit', (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    state.leadFilters = {
      ...state.leadFilters,
      status: String(values.get('status') || ''),
      date_from: String(values.get('date_from') || ''),
      date_to: String(values.get('date_to') || ''),
      per_page: Number(values.get('per_page')) || 20,
      page: 1
    };
    void loadLeads();
  });
  panel.querySelectorAll('[data-lead-page]').forEach((button) => button.addEventListener('click', () => {
    const current = state.leadPagination?.current_page || 1;
    const last = state.leadPagination?.last_page || 1;
    state.leadFilters.page = button.dataset.leadPage === 'next' ? Math.min(last, current + 1) : Math.max(1, current - 1);
    void loadLeads();
  }));
  return panel;
}

function renderLeads() {
  const panel = ensureLeadsPanel();
  if (!panel) return;
  const list = $('#lead-list');
  const newCount = state.leads.filter((lead) => lead.status === 'new').length;
  $('#lead-total').textContent = `${newCount} ${newCount === 1 ? 'novo' : 'novos'}`;
  const accent = document.querySelector('.metric-accent');
  if (accent) accent.innerHTML = `<span class="metric-label">contatos novos</span><strong>${String(newCount).padStart(2, '0')}</strong><small>recebidos pelo site</small>`;

  const items = state.leads;
  const filters = $('#lead-filters');
  filters.elements.status.value = state.leadFilters.status;
  filters.elements.date_from.value = state.leadFilters.date_from;
  filters.elements.date_to.value = state.leadFilters.date_to;
  filters.elements.per_page.value = String(state.leadFilters.per_page);
  const exportParams = new URLSearchParams();
  for (const key of ['status', 'date_from', 'date_to']) {
    if (state.leadFilters[key]) exportParams.set(key, state.leadFilters[key]);
  }
  panel.querySelectorAll('[data-lead-export]').forEach((link) => {
    const params = new URLSearchParams(exportParams);
    params.set('format', link.dataset.leadExport);
    link.href = `/api/admin/leads/export?${params.toString()}`;
  });
  const pagination = state.leadPagination;
  $('#lead-page-summary').textContent = pagination?.total ? `Exibindo ${pagination.from}–${pagination.to} de ${pagination.total}` : 'Nenhum contato encontrado';
  panel.querySelector('[data-lead-page="previous"]').disabled = !pagination || pagination.current_page <= 1;
  panel.querySelector('[data-lead-page="next"]').disabled = !pagination || pagination.current_page >= pagination.last_page;
  list.innerHTML = items.length ? items.map((lead) => {
    const propertyLink = String(lead.property_path || '').startsWith('/imoveis/')
      ? `<a class="lead-property" href="${escapeHTML(lead.property_path)}" target="_blank" rel="noopener">Ver imóvel ↗</a>` : '';
    const statusOptions = [['new', 'Novo'], ['em_contato', 'Em contato'], ['fechado', 'Fechado'], ['perdido', 'Perdido']];
    return `<article class="lead-row" data-status="${escapeHTML(lead.status)}"><div class="lead-main"><div class="lead-title"><strong>${escapeHTML(lead.name)}</strong><span>${formatDate(lead.created_at)}</span></div><a href="mailto:${escapeHTML(lead.email)}">${escapeHTML(lead.email)}</a><p>${escapeHTML(lead.message)}</p><small>${escapeHTML(lead.interest)} ${propertyLink}</small></div><div class="lead-actions"><label class="lead-status-control"><span class="sr-only">Status de ${escapeHTML(lead.name)}</span><select data-lead-status="${escapeHTML(lead.id)}">${statusOptions.map(([value, label]) => `<option value="${value}" ${lead.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button type="button" data-lead-save="${escapeHTML(lead.id)}">Salvar status</button>${state.user?.role === 'manager' ? `<button class="danger" type="button" data-lead-delete="${escapeHTML(lead.id)}">Apagar dados</button>` : ''}</div></article>`;
  }).join('') : '<div class="empty-properties compact"><span>✓</span><h4>Nenhum contato encontrado.</h4><p>Ajuste os filtros ou aguarde novos contatos pelo site.</p></div>';

  list.querySelectorAll('[data-lead-delete]').forEach((button) => button.addEventListener('click', async () => {
    const lead = state.leads.find((item) => item.id === button.dataset.leadDelete);
    const confirmed = window.confirm(`Apagar permanentemente os dados de ${lead?.name || 'este contato'}? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    try {
      await request(`/api/admin/leads/${button.dataset.leadDelete}`, { method: 'DELETE' });
      await loadLeads();
      const status = $('#lead-status');
      if (status) {
        status.textContent = 'Dados pessoais apagados permanentemente.';
        status.dataset.tone = 'success';
      }
    } catch {
      const status = $('#lead-status');
      if (status) {
        status.textContent = 'Não foi possível apagar os dados deste contato.';
        status.dataset.tone = 'error';
      }
    }
  }));

  list.querySelectorAll('[data-lead-save]').forEach((button) => button.addEventListener('click', async () => {
    const statusInput = list.querySelector(`[data-lead-status="${CSS.escape(button.dataset.leadSave)}"]`);
    if (!(statusInput instanceof HTMLSelectElement)) return;
    button.disabled = true;
    try {
      await request(`/api/admin/leads/${button.dataset.leadSave}`, { method: 'PATCH', body: JSON.stringify({ status: statusInput.value }) });
      await loadLeads();
      const status = $('#lead-status');
      if (status) {
        status.textContent = 'Contato atualizado.';
        status.dataset.tone = 'success';
      }
    } catch {
      button.disabled = false;
      const status = $('#lead-status');
      if (status) {
        status.textContent = 'Não foi possível atualizar este contato. Tente novamente.';
        status.dataset.tone = 'error';
      }
    }
  }));
}

async function loadLeads() {
  const list = ensureLeadsPanel()?.querySelector('#lead-list');
  if (list) list.innerHTML = '<div class="empty-properties compact" role="status">Carregando contatos…</div>';
  try {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(state.leadFilters)) {
      if (value !== '' && value !== null && value !== undefined) params.set(key, String(value));
    }
    const result = await request(`/api/admin/leads?${params.toString()}`);
    state.leads = result.leads || [];
    state.leadPagination = result.pagination || null;
    renderLeads();
  } catch {
    ensureLeadsPanel();
    if ($('#lead-list')) $('#lead-list').innerHTML = '<div class="empty-properties compact" role="alert"><p>Não foi possível carregar os contatos agora.</p></div>';
  }
}

async function init() {
  try {
    const session = await request('/api/admin/session');
    state.csrfToken = String(session.csrfToken || '');
    if (!session.authenticated) return showLogin();
    state.user = session.user;
    showDashboard();
    const [properties] = await Promise.all([request('/api/admin/properties'), loadLeads()]);
    state.properties = properties.properties;
    renderProperties();
  } catch (error) {
    if (error.message !== 'AUTH_REQUIRED') showLogin();
  }
}

$('#new-property')?.addEventListener('click', () => openEditor());
$('#new-property-top')?.addEventListener('click', () => openEditor());
$('#archive-property')?.addEventListener('click', archiveProperty);
$('#logout-button')?.addEventListener('click', () => { void performLogout(); });
$('#logout-all-button')?.addEventListener('click', () => { void performLogout({ all: true }); });
form.addEventListener('submit', saveProperty);
$('#photo-input').addEventListener('change', (event) => {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
  const incoming = Array.from(event.target.files || []);
  const valid = incoming.filter((file) => allowed.has(file.type) && file.size > 0 && file.size <= 12 * 1024 * 1024);
  const available = Math.max(0, 40 - ((state.editing?.photos?.length || 0) + state.pendingFiles.length));
  state.pendingFiles.push(...valid.slice(0, available));

  if (valid.length !== incoming.length) toast('Algumas fotos foram ignoradas por formato ou tamanho inválido.', 'error');
  else if (valid.length > available) toast('O imóvel pode ter no máximo 40 fotos.', 'error');

  event.target.value = '';
  renderEditorPhotos();
});
dialog.addEventListener('close', clearPendingFiles);
document.querySelectorAll('.side-nav a[data-view]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); switchView(link.dataset.view); }));
siteForm?.addEventListener('submit', saveSite);
testimonialForm?.addEventListener('submit', addTestimonial);
teamForm?.addEventListener('submit', createTeamInvitation);
$('#copy-team-invite')?.addEventListener('click', async () => {
  const input = $('#team-invite-url');
  if (!input?.value) return;
  try {
    await navigator.clipboard.writeText(input.value);
    teamNotify('Link copiado. Envie-o somente à pessoa convidada.');
  } catch {
    input.focus();
    input.select();
    teamNotify('Selecione e copie o link manualmente.', 'error');
  }
});
$('#refresh-audit')?.addEventListener('click', loadAudit);
$('#property-search')?.addEventListener('input', (event) => { state.search = event.target.value; renderProperties(); });
init();
