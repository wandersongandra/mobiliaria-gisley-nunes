import './styles.css';

const state = { user: null, properties: [], editing: null, pendingFiles: [], search: '' };
const $ = (selector) => document.querySelector(selector);
const loginScreen = $('#login-screen');
const dashboard = $('#dashboard');
const dialog = $('#property-dialog');
const form = $('#property-form');

function escapeHTML(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[char]); }
function formatDate(value) { return value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(value)) : 'agora'; }
function toast(message, tone = 'success') { const status = $('#editor-status'); status.textContent = message; status.dataset.tone = tone; }

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (response.status === 401) { showLogin(); throw new Error('AUTH_REQUIRED'); }
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'REQUEST_FAILED'); }
  return response.status === 204 ? null : response.json();
}

function showLogin() { dashboard.hidden = true; loginScreen.hidden = false; $('#login-button').href = `/api/auth/login?origin=${encodeURIComponent(window.location.origin)}`; }
function showDashboard() { loginScreen.hidden = true; dashboard.hidden = false; $('#user-name').textContent = state.user?.name?.split(' ')[0] || 'equipe'; }

function renderProperties() {
  const published = state.properties.filter((item) => item.status === 'published').length;
  const drafts = state.properties.filter((item) => item.status === 'draft').length;
  $('#metric-total').textContent = String(state.properties.length).padStart(2, '0');
  $('#metric-published').textContent = String(published).padStart(2, '0');
  $('#metric-draft').textContent = String(drafts).padStart(2, '0');
  const query = String(state.search || '').trim().toLowerCase();
  const items = query ? state.properties.filter((item) => `${item.title} ${item.location} ${item.type}`.toLowerCase().includes(query)) : state.properties;
  $('#side-count').textContent = state.properties.length;
  $('#property-list').innerHTML = items.length ? items.map((item) => `<article class="property-row"><div class="property-identity"><div class="property-thumb">${item.cover_url ? `<img src="${escapeHTML(item.cover_url)}" alt="" />` : '<span>⌂</span>'}</div><div><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.location)} · ${escapeHTML(item.type)}</small></div></div><span class="status-pill ${item.status}"><i></i>${item.status === 'published' ? 'Publicado' : item.status === 'archived' ? 'Arquivado' : 'Rascunho'}</span><span class="updated-date">${formatDate(item.updated_at)}</span><button class="row-action" data-edit="${item.id}" type="button" aria-label="Editar ${escapeHTML(item.title)}">Editar <span>↗</span></button></article>`).join('') : (query ? '<div class="empty-properties"><span>⌕</span><h4>Nenhum resultado.</h4><p>Tente outro termo de busca.</p></div>' : '<div class="empty-properties"><span>✦</span><h4>Seu portfólio começa aqui.</h4><p>Cadastre o primeiro imóvel para começar a construir a vitrine da Gisley Nunes.</p><button class="outline-button" data-empty-new type="button">Cadastrar primeiro imóvel <span>＋</span></button></div>');
  document.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => openEditor(state.properties.find((item) => item.id === button.dataset.edit))));
  $('[data-empty-new]')?.addEventListener('click', () => openEditor());
}

function fillForm(property = {}) {
  for (const [key, value] of Object.entries({ title: property.title || '', location: property.location || '', city: property.city || 'Belo Horizonte', purpose: property.purpose || 'Comprar', type: property.type || 'Apartamento', price: property.price || '', priceLabel: property.price_label || '', bedrooms: property.bedrooms ?? 2, bathrooms: property.bathrooms ?? 2, areaM2: property.area_m2 ?? 80, suites: property.suites ?? 0, parkingSpots: property.parking_spots ?? 0, condoFee: property.condo_fee ?? 0, iptu: property.iptu ?? 0, description: property.description || '' })) { if (form.elements[key]) form.elements[key].value = value; }
  form.elements.published.checked = property.status !== 'draft' && property.status !== 'archived';
  form.elements.featured.checked = Boolean(property.is_featured);
}
function renderPhotos(photos = []) { $('#photo-grid').innerHTML = photos.length ? photos.map((photo, index) => `<div class="photo-tile${photo.is_cover ? ' is-cover' : ''}"><img src="${escapeHTML(photo.url)}" alt="${escapeHTML(photo.alt_text)}" /><span>${photo.is_cover ? 'capa' : String(index + 1).padStart(2, '0')}</span><div class="photo-tile-actions"><button data-photo-cover="${photo.id}" type="button" aria-label="Definir como capa" title="Definir como capa">★</button><button data-photo-up="${photo.id}" type="button" aria-label="Mover para cima" ${index === 0 ? 'disabled' : ''}>↑</button><button data-photo-down="${photo.id}" type="button" aria-label="Mover para baixo" ${index === photos.length - 1 ? 'disabled' : ''}>↓</button><button data-photo-remove="${photo.id}" type="button" aria-label="Remover foto">×</button></div></div>`).join('') : '<div class="photo-empty"><span>＋</span><p>Adicione fotos para<br />dar vida ao imóvel.</p></div>'; document.querySelectorAll('[data-photo-remove]').forEach((button) => button.addEventListener('click', () => removePhoto(button.dataset.photoRemove))); document.querySelectorAll('[data-photo-cover]').forEach((button) => button.addEventListener('click', () => makeCover(button.dataset.photoCover))); document.querySelectorAll('[data-photo-up]').forEach((button) => button.addEventListener('click', () => movePhoto(button.dataset.photoUp, -1))); document.querySelectorAll('[data-photo-down]').forEach((button) => button.addEventListener('click', () => movePhoto(button.dataset.photoDown, 1))); }
function openEditor(property = null) { state.editing = property; state.pendingFiles = []; $('#dialog-title').textContent = property ? 'Editar imóvel' : 'Novo imóvel'; fillForm(property || {}); renderPhotos(property?.photos || []); $('#editor-status').textContent = ''; dialog.showModal(); }

async function saveProperty(event) { if (event.submitter?.value === 'cancel') return; event.preventDefault(); const button = $('#save-property'); button.disabled = true; toast('Salvando alterações…'); const data = Object.fromEntries(new FormData(form)); data.published = form.elements.published.checked; data.featured = form.elements.featured.checked; data.status = data.published ? 'published' : 'draft'; try { const result = await request(state.editing ? `/api/admin/properties/${state.editing.id}` : '/api/admin/properties', { method: state.editing ? 'PUT' : 'POST', body: JSON.stringify(data) }); const property = result.property; await uploadPendingFiles(property.id); state.properties = (await request('/api/admin/properties')).properties; renderProperties(); dialog.close(); } catch (error) { toast(error.message === 'AUTH_REQUIRED' ? 'Sua sessão expirou.' : 'Não foi possível salvar. Tente novamente.', 'error'); } finally { button.disabled = false; } }

async function uploadPendingFiles(propertyId) { for (let index = 0; index < state.pendingFiles.length; index += 1) { const file = state.pendingFiles[index]; toast(`Enviando foto ${index + 1} de ${state.pendingFiles.length}…`); const presign = await request('/api/admin/uploads/presign', { method: 'POST', body: JSON.stringify({ propertyId, fileName: file.name, contentType: file.type, size: file.size }) }); const upload = await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file }); if (!upload.ok) throw new Error('UPLOAD_FAILED'); await request(`/api/admin/properties/${propertyId}/photos`, { method: 'POST', body: JSON.stringify({ storagePath: presign.storagePath, assetUrl: presign.assetUrl, altText: file.name.replace(/\.[^.]+$/, ''), sortOrder: index, isCover: index === 0 }) }); } }
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
let siteLoaded = false;

function siteNotify(message, tone = 'success') { const status = $('#site-status'); status.textContent = message; status.dataset.tone = tone; }

function switchView(name) {
  document.querySelectorAll('.admin-view').forEach((view) => { view.hidden = view.id !== name; });
  document.querySelectorAll('.side-nav a[data-view]').forEach((link) => { link.classList.toggle('active', link.dataset.view === name); });
  if (name === 'site-view' && !siteLoaded) { siteLoaded = true; loadSite(); }
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

async function init() { try { const session = await request('/api/admin/session'); if (!session.authenticated) return showLogin(); state.user = session.user; showDashboard(); state.properties = (await request('/api/admin/properties')).properties; renderProperties(); } catch (error) { if (error.message !== 'AUTH_REQUIRED') showLogin(); } }

$('#new-property')?.addEventListener('click', () => openEditor());
$('#new-property-top')?.addEventListener('click', () => openEditor());
$('#logout-button').addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST' }); showLogin(); });
form.addEventListener('submit', saveProperty);
$('#photo-input').addEventListener('change', (event) => { state.pendingFiles = [...state.pendingFiles, ...Array.from(event.target.files)]; $('#photo-grid').innerHTML = state.pendingFiles.map((file, index) => `<div class="photo-tile pending"><img src="${URL.createObjectURL(file)}" alt="${escapeHTML(file.name)}" /><span>${index === 0 ? 'nova capa' : 'nova'}</span></div>`).join(''); });
dialog.addEventListener('close', () => { state.pendingFiles = []; });
document.querySelectorAll('.side-nav a[data-view]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); switchView(link.dataset.view); }));
siteForm.addEventListener('submit', saveSite);
testimonialForm.addEventListener('submit', addTestimonial);
$('#property-search')?.addEventListener('input', (event) => { state.search = event.target.value; renderProperties(); });
init();
