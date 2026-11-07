function ensureAdminStyles() {
  for (const href of ['/admin/styles.css', '/admin/refinements.css']) {
    if (Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some((link) => new URL(link.href).pathname === href)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.append(link);
  }
}

ensureAdminStyles();


const state = { user: null, csrfToken: '', properties: [], propertyPagination: null, propertySummary: null, propertyFilters: { search: '', status: '', availability: '', page: 1, per_page: 20 }, leads: [], leadPagination: null, leadSummary: { new: 0 }, leadAssignees: [], leadFilters: { status: '', date_from: '', date_to: '', search: '', page: 1, per_page: 20 }, leadDetail: null, attention: null, notifications: [], notificationUnread: 0, team: [], invitations: [], forms: [], editingFormId: null, formFields: [], audit: [], editing: null, pendingFiles: [], pendingPreviewGeneration: 0 };
let attentionTimer = 0;
let attentionLoading = false;
let propertySearchTimer = 0;
let propertyLoadSequence = 0;
let leadLoadSequence = 0;
let teamLoading = false;
let teamRefreshQueued = false;
let leadsLoaded = false;
let leadAssigneesLoaded = false;
let propertyRequestController = null;
let leadRequestController = null;
let teamRequestController = null;
let teamLoadSequence = 0;
const $ = (selector) => document.querySelector(selector);
const loginScreen = $('#login-screen');
const dashboard = $('#dashboard');
const dialog = $('#property-dialog');
const confirmDialog = $('#confirm-dialog');
const form = $('#property-form');
const skipLink = document.querySelector('.skip-link');
const dashboardMain = dashboard?.querySelector('main');

loginScreen?.setAttribute('role', 'main');

const dashboardHeading = $('#page-title');
if (dashboardHeading && dashboardHeading.tagName !== 'H1') {
  const heading = document.createElement('h1');
  heading.id = dashboardHeading.id;
  heading.className = dashboardHeading.className;
  heading.innerHTML = dashboardHeading.innerHTML;
  dashboardHeading.replaceWith(heading);
}

function escapeHTML(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[char]); }
function formatDate(value) { return value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(value)) : 'agora'; }
function toast(message, tone = 'success') { const status = $('#editor-status'); status.textContent = message; status.dataset.tone = tone; }

const commercialLabels = { available: 'Disponível', reserved: 'Reservado', sold: 'Vendido', rented: 'Alugado' };
function localDay(value) { return value ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${value}T12:00:00`)) : '—'; }

function clearFieldErrors(targetForm) {
  targetForm?.querySelectorAll('[data-field-error]').forEach((node) => node.remove());
  targetForm?.querySelectorAll('[aria-invalid="true"]').forEach((field) => {
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-describedby');
  });
}

function fieldError(targetForm, name, message) {
  const input = targetForm?.elements?.[name];
  if (!input || typeof input.focus !== 'function') return false;
  const error = document.createElement('small');
  error.className = 'field-error';
  error.dataset.fieldError = name;
  error.id = `invalid-${name}`;
  error.textContent = message;
  input.closest('label')?.append(error);
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', error.id);
  input.focus();
  return true;
}

function confirmAction({ title = 'Confirmar ação', message = 'Deseja continuar?' } = {}) {
  if (!confirmDialog) return Promise.resolve(false);
  const titleNode = $('#confirm-dialog-title');
  const messageNode = $('#confirm-dialog-message');
  if (titleNode) titleNode.textContent = title;
  if (messageNode) messageNode.textContent = message;

  return new Promise((resolve) => {
    confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue === 'confirm'), { once: true });
    confirmDialog.showModal();
  });
}

function setButtonPending(button, pending, label = '') {
  if (!button) return;
  if (pending) {
    button.dataset.originalHtml ||= button.innerHTML;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = label;
    return;
  }
  if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
  button.disabled = false;
  button.removeAttribute('aria-busy');
}

function setFormPending(targetForm, pending, label = '') {
  targetForm?.setAttribute('aria-busy', String(pending));
  setButtonPending(targetForm?.querySelector('button[type="submit"]'), pending, label);
}

async function request(url, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  const method = String(options.method || 'GET').toUpperCase();
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && state.csrfToken) {
    headers['X-CSRF-Token'] = state.csrfToken;
  }
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  if (response.status === 401) { showLogin(); throw new Error('AUTH_REQUIRED'); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || (response.status === 422 ? 'VALIDATION_FAILED' : 'REQUEST_FAILED'));
  }
  return response.status === 204 ? null : response.json();
}

async function download(url, options = {}) {
  const headers = { Accept: '*/*', ...(options.headers || {}) };
  const method = String(options.method || 'GET').toUpperCase();
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && state.csrfToken) {
    headers['X-CSRF-Token'] = state.csrfToken;
  }

  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  if (response.status === 401) { showLogin(); throw new Error('AUTH_REQUIRED'); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || (response.status === 422 ? 'VALIDATION_FAILED' : 'REQUEST_FAILED'));
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const filename = disposition.match(/filename="([^"]+)"/i)?.[1] || 'leads-export';
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function clearSensitiveState() {
  propertyRequestController?.abort();
  leadRequestController?.abort();
  teamRequestController?.abort();
  teamRequestController = null;
  propertyLoadSequence += 1;
  leadLoadSequence += 1;
  teamLoadSequence += 1;
  teamLoading = false;
  teamRefreshQueued = false;
  state.user = null;
  state.csrfToken = '';
  state.properties = [];
  state.propertyPagination = null;
  state.propertySummary = null;
  state.propertyFilters = { search: '', status: '', availability: '', page: 1, per_page: 20 };
  state.leads = [];
  state.leadPagination = null;
  state.leadDetail = null;
  state.attention = null;
  state.notifications = [];
  state.notificationUnread = 0;
  clearInterval(attentionTimer);
  attentionTimer = 0;
  leadsLoaded = false;
  state.leadFilters = { status: '', date_from: '', date_to: '', page: 1, per_page: 20 };
  state.team = [];
  state.invitations = [];
  state.forms = [];
  state.editingFormId = null;
  state.formFields = [];
  state.audit = [];
  state.editing = null;
  clearTimeout(propertySearchTimer);
  clearPendingFiles();
  if (dialog?.open) dialog.close();
  const previewDialog = $('#property-preview-dialog');
  if (previewDialog?.open) {
    const image = previewDialog.querySelector('img[data-temp-url]');
    if (image) URL.revokeObjectURL(image.dataset.tempUrl);
    previewDialog.close();
  }
  const propertyList = $('#property-list');
  const leadList = $('#lead-list');
  const teamList = $('#team-list');
  const invitationList = $('#team-invitations');
  const invitationResult = $('#team-invite-result');
  const auditList = $('#audit-list');
  teamLoaded = false;
  if (propertyList) propertyList.innerHTML = '';
  if (leadList) leadList.innerHTML = '';
  if (teamList) teamList.innerHTML = '';
  if (invitationList) invitationList.innerHTML = '';
  if (invitationResult) invitationResult.hidden = true;
  if (auditList) auditList.innerHTML = '';
  const leadDetail = $('#lead-detail');
  if (leadDetail) { leadDetail.hidden = true; leadDetail.innerHTML = ''; }
  const notificationBox = $('#notification-center');
  if (notificationBox) { notificationBox.hidden = true; notificationBox.querySelector('#notification-list')?.replaceChildren(); }
  const noticeToggle = $('#notification-toggle');
  if (noticeToggle) noticeToggle.setAttribute('aria-expanded', 'false');
  if ($('#notification-count')) $('#notification-count').textContent = '0';
  for (const selector of ['#attention-counts', '#attention-agenda', '#attention-metrics', '#property-preview-content']) {
    const node = $(selector);
    if (node) node.replaceChildren();
  }
}

const invitationParams = new URLSearchParams(window.location.search);
const invitationTokens = invitationParams.getAll('invite');
const invitationToken = invitationTokens.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(invitationTokens[0])
  ? invitationTokens[0]
  : '';
if (invitationTokens.length) {
  invitationParams.delete('invite');
  const query = invitationParams.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
}

function loginUrl() {
  return invitationToken ? `/api/auth/login?invite=${encodeURIComponent(invitationToken)}` : '/api/auth/login';
}

function showLogin() {
  clearSensitiveState();
  dashboard.hidden = true;
  loginScreen.hidden = false;
  skipLink?.setAttribute('href', '#login-title');
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
  ensureManagementPanels();
  ensureOperationsPanels();
  if (dashboardMain) dashboardMain.id = 'admin-main';
  skipLink?.setAttribute('href', '#admin-main');
  $('#user-name').textContent = state.user?.name?.split(' ')[0] || 'equipe';
  $('#session-indicator').textContent = 'Sessão autenticada';
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

function ensureManagementPanels() {
  const nav = document.querySelector('.side-nav');
  if (!nav || !dashboardMain) return;

  const addNav = (id, label, icon, managerOnly = false) => {
    if (nav.querySelector(`[data-view="${id}"]`)) return;
    const link = document.createElement('a');
    link.href = `#${id}`;
    link.dataset.view = id;
    if (managerOnly) {
      link.dataset.managerOnly = 'true';
      link.hidden = state.user?.role !== 'manager';
    }
    link.innerHTML = `<span>${icon}</span> ${label}`;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      window.history.pushState(null, '', link.hash);
      switchView(link.dataset.view);
    });
    nav.insertBefore(link, nav.lastElementChild);
  };

  addNav('profile-view', 'Meu cadastro', '◎');
  addNav('leads-view', 'Atendimentos', '◷');
  if (state.user?.role === 'manager') addNav('forms-view', 'Formulários', '▤', true);

  if (!$('#leads-view')) {
    const section = document.createElement('section');
    section.id = 'leads-view';
    section.className = 'admin-view';
    section.hidden = true;
    section.innerHTML = '<div class="section-bar"><div><p class="admin-kicker">relacionamento</p><h3>Atendimentos, <em>com continuidade.</em></h3><p class="section-description">Acompanhe a origem, etapa, responsável e próximo retorno de cada contato.</p></div></div>';
    dashboardMain.append(section);
  }

  if (!$('#profile-view')) {
    const section = document.createElement('section');
    section.id = 'profile-view';
    section.className = 'admin-view';
    section.hidden = true;
    section.innerHTML = '<div class="section-bar"><div><p class="admin-kicker">cadastro profissional</p><h3>Meu cadastro, <em>sempre atualizado.</em></h3></div></div><form id="profile-form" class="site-card" style="max-width:720px"><span class="metric-label">dados do corretor</span><strong class="site-card-title">Informações pessoais</strong><p class="team-help">Esses dados ficam protegidos no painel e podem ser alterados somente pela própria pessoa autenticada.</p><div class="site-fields"><label>Nome<input name="name" readonly maxlength="255" /></label><label>E-mail<input name="email" readonly type="email" maxlength="255" /></label><div class="field-pair"><label>Data de nascimento<input name="birthDate" type="date" /></label><label>Função<input name="role" readonly /></label></div><label>Endereço<input name="address" maxlength="500" autocomplete="street-address" placeholder="Rua, número, complemento, cidade e estado" /></label></div><button class="admin-button admin-button-primary" type="submit">Salvar cadastro <span>↗</span></button><p id="profile-status" role="status"></p></form>';
    dashboardMain.append(section);
    $('#profile-form').addEventListener('submit', saveProfile);
  }

  if (state.user?.role === 'manager' && !$('#forms-view')) {
    const section = document.createElement('section');
    section.id = 'forms-view';
    section.className = 'admin-view';
    section.hidden = true;
    section.innerHTML = '<div class="section-bar"><div><p class="admin-kicker">modelos internos</p><h3>Formulários, <em>organizados.</em></h3></div></div><div class="site-layout"><form id="form-template-form" class="site-card"><span class="metric-label">novo modelo</span><strong class="site-card-title">Cadastrar formulário</strong><p class="team-help">A definição é armazenada como JSON e será usada como modelo. O conteúdo ainda não é executado como HTML ou script.</p><div class="site-fields"><label>Slug<input name="slug" required maxlength="120" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="ficha-cadastral-imovel" /></label><label>Título<input name="title" required maxlength="180" placeholder="Ficha cadastral de imóvel" /></label><label>Descrição<input name="description" maxlength="500" /></label><label>Definição JSON<textarea name="definition" required rows="12" spellcheck="false" placeholder="{\"fields\": []}"></textarea></label><label><input name="active" type="checkbox" checked /> Modelo ativo</label></div><button class="admin-button admin-button-primary" type="submit">Salvar modelo <span>↗</span></button><button id="form-template-cancel" class="outline-button" type="button" hidden>Cancelar edição</button><p id="forms-status" role="status"></p></form><div class="site-card"><span class="metric-label">modelos salvos</span><strong class="site-card-title">Biblioteca de formulários</strong><div id="form-template-list" class="testimonial-list"></div></div></div>';
    dashboardMain.append(section);
    $('#form-template-form').addEventListener('submit', saveFormTemplate);
    $('#form-template-cancel').addEventListener('click', () => resetFormTemplateForm());
  }

  if (state.user?.role === 'manager') ensureVisualFormBuilder();
}

function ensureOperationsPanels() {
  if (!form.elements.availability) {
    const commercial = document.createElement('label');
    commercial.className = 'commercial-field';
    commercial.innerHTML = '<span>Situação comercial</span><select name="availability" required><option value="available">Disponível</option><option value="reserved">Reservado</option><option value="sold">Vendido</option><option value="rented">Alugado</option></select><small>Imóveis vendidos ou alugados permanecem no painel, mas saem da vitrine pública.</small>';
    form.elements.purpose.closest('.field-pair')?.after(commercial);
    form.elements.purpose.addEventListener('change', () => {
      const availability = form.elements.availability;
      if (availability.value === 'sold' && form.elements.purpose.value !== 'Comprar') availability.value = 'available';
      if (availability.value === 'rented' && form.elements.purpose.value !== 'Alugar') availability.value = 'available';
    });
  }
  if (!$('#property-availability-filter')) {
    const label = document.createElement('label');
    label.htmlFor = 'property-availability-filter';
    label.innerHTML = 'Situação comercial<select id="property-availability-filter"><option value="">Todas</option><option value="available">Disponível</option><option value="reserved">Reservado</option><option value="sold">Vendido</option><option value="rented">Alugado</option></select>';
    $('#property-status-filter')?.closest('label')?.after(label);
    label.querySelector('select').addEventListener('change', (event) => {
      state.propertyFilters.availability = event.target.value;
      state.propertyFilters.page = 1;
      void loadProperties();
    });
  }
  if (!$('#preview-property')) {
    const previewButton = document.createElement('button');
    previewButton.id = 'preview-property';
    previewButton.type = 'button';
    previewButton.className = 'outline-button';
    previewButton.textContent = 'Prévia do anúncio';
    $('#save-property')?.before(previewButton);
    previewButton.addEventListener('click', previewProperty);
  }
  if (!$('#property-preview-dialog')) {
    const previewDialog = document.createElement('dialog');
    previewDialog.id = 'property-preview-dialog';
    previewDialog.className = 'property-preview-dialog';
    previewDialog.setAttribute('aria-labelledby', 'property-preview-title');
    previewDialog.innerHTML = '<div class="preview-dialog-head"><span class="admin-kicker">prévia interna · não publicada</span><button id="close-property-preview" type="button" class="outline-button">Fechar</button></div><div id="property-preview-content"></div>';
    document.body.append(previewDialog);
    $('#close-property-preview').addEventListener('click', () => previewDialog.close());
    previewDialog.addEventListener('close', () => {
      const image = previewDialog.querySelector('img[data-temp-url]');
      if (image) URL.revokeObjectURL(image.dataset.tempUrl);
    });
  }

  if (!$('#dashboard-attention')) {
    const panel = document.createElement('section');
    panel.id = 'dashboard-attention';
    panel.className = 'operations-layout';
    panel.innerHTML = '<article class="site-card"><div class="operations-head"><div><span class="metric-label">agenda comercial</span><strong class="site-card-title">Retornos que precisam de atenção</strong></div><button class="outline-button" id="refresh-attention" type="button">Atualizar</button></div><div id="attention-counts" class="attention-counts" role="status">Carregando agenda…</div><div id="attention-agenda" class="attention-agenda"></div></article><article class="site-card"><span class="metric-label">últimos 30 dias</span><strong class="site-card-title">Resultados dos atendimentos</strong><div id="attention-metrics" class="attention-metrics">Carregando indicadores…</div><small class="attention-note">Conversão = atendimentos marcados como fechados / total recebido. Tempo de resposta = primeira ligação, e-mail, WhatsApp ou reunião registrada.</small></article>';
    $('#dashboard-view')?.append(panel);
    $('#refresh-attention').addEventListener('click', () => { void loadAttention(); });
  }

  if (!$('#notification-toggle')) {
    const toggle = document.createElement('button');
    toggle.id = 'notification-toggle';
    toggle.type = 'button';
    toggle.className = 'outline-button notification-toggle';
    toggle.setAttribute('aria-controls', 'notification-center');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = 'Avisos <span id="notification-count" aria-live="polite">0</span>';
    $('.top-actions')?.prepend(toggle);
    const center = document.createElement('section');
    center.id = 'notification-center';
    center.className = 'notification-center site-card';
    center.hidden = true;
    center.innerHTML = '<div class="operations-head"><strong class="site-card-title">Avisos do painel</strong><button class="outline-button" id="notification-close" type="button">Fechar</button></div><div id="notification-list"></div>';
    $('.admin-topbar')?.after(center);
    toggle.addEventListener('click', () => {
      center.hidden = !center.hidden;
      toggle.setAttribute('aria-expanded', String(!center.hidden));
      if (!center.hidden) $('#notification-close')?.focus();
    });
    $('#notification-close').addEventListener('click', () => {
      center.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    });
  }
}

function previewProperty() {
  const values = Object.fromEntries(new FormData(form));
  const images = state.editing?.photos || [];
  const cover = images.find((photo) => photo.is_cover) || images[0];
  const dialog = $('#property-preview-dialog');
  const url = !cover && state.pendingFiles.length ? URL.createObjectURL(state.pendingFiles[0]) : null;
  const src = cover?.url || url;
  const safeTitle = escapeHTML(values.title?.trim() || 'Título do anúncio');
  const price = values.priceLabel?.trim() || (Number(values.price) > 0 ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(values.price)) : 'Sob consulta');
  $('#property-preview-content').innerHTML = `<div class="property-preview-image">${src ? `<img src="${escapeHTML(src)}" alt="Prévia da capa de ${safeTitle}" ${url ? `data-temp-url="${escapeHTML(url)}"` : ''}/>` : '<span>Foto de capa ainda não adicionada</span>'}</div><div class="property-preview-copy"><span class="metric-label">${escapeHTML(commercialLabels[values.availability] || 'Disponível')} · ${escapeHTML(values.purpose || 'Comprar')} · ${escapeHTML(values.type || 'Imóvel')}</span><h2 id="property-preview-title">${safeTitle}</h2><p>${escapeHTML(values.neighborhood || values.location || 'Localização a confirmar')}, ${escapeHTML(values.city || 'Belo Horizonte')}</p><strong>${escapeHTML(price)}</strong><div class="attention-counts"><span>${escapeHTML(values.bedrooms || '0')} quartos</span><span>${escapeHTML(values.bathrooms || '0')} banheiros</span><span>${escapeHTML(values.areaM2 || '0')} m²</span></div><p class="property-preview-description">${escapeHTML(values.description || 'Descrição ainda não preenchida.')}</p><small>Esta é uma simulação interna. Nada será publicado ou salvo ao visualizar.</small></div>`;
  dialog.showModal();
}

async function loadProfile() {
  const status = $('#profile-status');
  try {
    const result = await request('/api/admin/profile');
    const profile = result.profile || {};
    const profileForm = $('#profile-form');
    for (const [key, value] of Object.entries(profile)) {
      if (profileForm?.elements[key]) profileForm.elements[key].value = value ?? '';
    }
    if (status) status.textContent = '';
  } catch {
    if (status) { status.textContent = 'Não foi possível carregar seu cadastro.'; status.dataset.tone = 'error'; }
  }
}

async function saveProfile(event) {
  event.preventDefault();
  const profileForm = event.currentTarget;
  const status = $('#profile-status');
  setFormPending(profileForm, true, 'Salvando…');
  try {
    await request('/api/admin/profile', { method: 'PUT', body: JSON.stringify({ address: profileForm.elements.address.value, birthDate: profileForm.elements.birthDate.value }) });
    if (status) { status.textContent = 'Cadastro atualizado.'; status.dataset.tone = 'success'; }
  } catch (error) {
    if (status) { status.textContent = error.message === 'INVALID_PROFILE' || error.message === 'VALIDATION_FAILED' ? 'Confira a data e o endereço informado.' : 'Não foi possível salvar seu cadastro.'; status.dataset.tone = 'error'; }
  } finally {
    setFormPending(profileForm, false);
  }
}

function resetFormTemplateForm() {
  const formTemplate = $('#form-template-form');
  if (!formTemplate) return;
  formTemplate.reset();
  formTemplate.elements.active.checked = true;
  state.editingFormId = null;
  state.formFields = [];
  formTemplate.elements.definition.value = JSON.stringify({ _editor: 'visual-v1', fields: [] }, null, 2);
  renderFormBuilder();
  $('#form-template-cancel').hidden = true;
}

const formFieldTypes = { text: 'Texto', email: 'E-mail', tel: 'Telefone', number: 'Número', date: 'Data', textarea: 'Texto longo', select: 'Lista de opções', checkbox: 'Confirmação' };

function ensureVisualFormBuilder() {
  const target = $('#form-template-form');
  if (!target || $('#form-builder')) return;
  // The visual editor provides a valid default; hidden advanced JSON must not trap native validation focus.
  target.elements.definition.required = false;
  const sourceLabel = target.elements.definition.closest('label');
  const advanced = document.createElement('details');
  advanced.className = 'form-builder-advanced';
  advanced.innerHTML = '<summary>Editar definição JSON (avançado)</summary><p class="team-help">Use a edição avançada apenas se precisar manter outros campos do modelo. O editor visual preserva as demais propriedades do objeto.</p>';
  sourceLabel.before(advanced);
  advanced.append(sourceLabel);

  const builder = document.createElement('section');
  builder.id = 'form-builder';
  builder.className = 'form-builder';
  builder.innerHTML = '<div class="operations-head"><div><span class="metric-label">editor visual</span><strong class="site-card-title">Campos do formulário</strong></div><button id="form-field-add" class="outline-button" type="button">Adicionar campo ＋</button></div><div id="form-builder-fields"></div><div class="form-builder-preview"><span class="metric-label">prévia interna</span><div id="form-preview-fields" aria-label="Prévia dos campos"></div></div>';
  advanced.before(builder);

  $('#form-field-add').addEventListener('click', () => {
    let number = 1;
    while (state.formFields.some((field) => field?.name === `campo_${number}`)) number++;
    state.formFields.push({ name: `campo_${number}`, label: `Campo ${number}`, type: 'text', required: false });
    syncFormDefinition();
    renderFormBuilder();
  });
  $('#form-builder-fields').addEventListener('input', handleFormBuilderChange);
  $('#form-builder-fields').addEventListener('change', handleFormBuilderChange);
  $('#form-builder-fields').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-field]');
    if (!button) return;
    state.formFields.splice(Number(button.dataset.removeField), 1);
    syncFormDefinition();
    renderFormBuilder();
  });
  target.elements.definition.addEventListener('change', () => {
    try {
      const definition = JSON.parse(target.elements.definition.value);
      if (!definition || typeof definition !== 'object' || !Array.isArray(definition.fields)) throw new Error('INVALID_DEFINITION');
      state.formFields = definition.fields.filter((field) => field && typeof field === 'object' && !Array.isArray(field)).map((field) => ({ ...field }));
      renderFormBuilder();
    } catch {
      const status = $('#forms-status');
      if (status) { status.textContent = 'JSON inválido: informe um objeto com a lista fields.'; status.dataset.tone = 'error'; }
    }
  });
  resetFormTemplateForm();
}

function syncFormDefinition() {
  const input = $('#form-template-form')?.elements.definition;
  if (!input) return;
  let existing = {};
  try { existing = JSON.parse(input.value); } catch { /* Preserve invalid JSON until explicitly corrected. */ }
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) existing = {};
  input.value = JSON.stringify({ ...existing, _editor: 'visual-v1', fields: state.formFields }, null, 2);
}

function handleFormBuilderChange(event) {
  const control = event.target.closest('[data-field-index][data-field-property]');
  if (!control) return;
  const field = state.formFields[Number(control.dataset.fieldIndex)];
  if (!field) return;
  const key = control.dataset.fieldProperty;
  field[key] = key === 'required' ? control.checked : key === 'options' ? control.value.split(',').map((value) => value.trim()).filter(Boolean) : control.value;
  if (field.type !== 'select') delete field.options;
  if (field.type === 'select' && !Array.isArray(field.options)) field.options = [];
  syncFormDefinition();
  renderFormPreview();
  if (event.type === 'change' && key === 'type') renderFormBuilder();
}

function renderFormBuilder() {
  const list = $('#form-builder-fields');
  if (!list) return;
  list.innerHTML = state.formFields.length ? state.formFields.map((field, index) => `<fieldset class="form-field-row"><legend>Campo ${index + 1}</legend><div class="field-pair"><label>Rótulo<input data-field-index="${index}" data-field-property="label" maxlength="120" value="${escapeHTML(field.label || '')}" /></label><label>Identificador<input data-field-index="${index}" data-field-property="name" maxlength="60" pattern="[a-z][a-z0-9_]*" value="${escapeHTML(field.name || '')}" /></label></div><div class="field-pair"><label>Tipo<select data-field-index="${index}" data-field-property="type">${Object.entries(formFieldTypes).map(([type, label]) => `<option value="${type}" ${field.type === type ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="field-check"><input type="checkbox" data-field-index="${index}" data-field-property="required" ${field.required ? 'checked' : ''} /> Obrigatório</label></div>${field.type === 'select' ? `<label>Opções (separadas por vírgulas)<input data-field-index="${index}" data-field-property="options" value="${escapeHTML((field.options || []).join(', '))}" /></label>` : ''}<button type="button" class="outline-button" data-remove-field="${index}">Remover campo</button></fieldset>`).join('') : '<p class="team-help">Adicione os campos necessários. Você poderá ver a prévia antes de salvar.</p>';
  renderFormPreview();
}

function renderFormPreview() {
  const preview = $('#form-preview-fields');
  if (!preview) return;
  preview.replaceChildren();
  for (const field of state.formFields) {
    const label = document.createElement('label');
    label.textContent = `${field.label || 'Campo sem rótulo'}${field.required ? ' *' : ''}`;
    const type = Object.hasOwn(formFieldTypes, field.type) ? field.type : 'text';
    const input = document.createElement(type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input');
    if (type === 'select') {
      for (const option of field.options || []) {
        const node = document.createElement('option');
        node.textContent = option;
        input.append(node);
      }
    } else if (type !== 'textarea') {
      input.type = type;
    }
    input.disabled = true;
    label.append(input);
    preview.append(label);
  }
}

function renderFormTemplates() {
  const list = $('#form-template-list');
  if (!list) return;
  list.replaceChildren();
  if (!state.forms.length) {
    list.innerHTML = '<div class="photo-empty"><span>＋</span><p>Nenhum modelo cadastrado.<br />Aguardando os formulários da equipe.</p></div>';
    return;
  }
  state.forms.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'testimonial-row';
    row.innerHTML = `<div><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.description || 'Sem descrição')}</p><small>${escapeHTML(item.slug)} · ${item.active ? 'ativo' : 'inativo'}</small></div><div><button class="outline-button" type="button" data-form-edit="${escapeHTML(item.id)}">Editar</button><button class="danger" type="button" data-form-delete="${escapeHTML(item.id)}">Apagar</button></div>`;
    list.append(row);
  });
  list.querySelectorAll('[data-form-edit]').forEach((button) => button.addEventListener('click', () => {
    const item = state.forms.find((candidate) => candidate.id === button.dataset.formEdit);
    if (!item) return;
    const formTemplate = $('#form-template-form');
    state.editingFormId = item.id;
    for (const [key, value] of Object.entries({ slug: item.slug, title: item.title, description: item.description || '', definition: JSON.stringify(item.definition || {}, null, 2) })) formTemplate.elements[key].value = value;
    formTemplate.elements.active.checked = Boolean(item.active);
    state.formFields = Array.isArray(item.definition?.fields)
      ? item.definition.fields.filter((field) => field && typeof field === 'object' && !Array.isArray(field)).map((field) => ({ ...field }))
      : [];
    renderFormBuilder();
    $('#form-template-cancel').hidden = false;
    formTemplate.elements.title.focus();
  }));
  list.querySelectorAll('[data-form-delete]').forEach((button) => button.addEventListener('click', async () => {
    if (! await confirmAction({ title: 'Apagar modelo?', message: 'O modelo será removido da biblioteca.' })) return;
    try {
      await request(`/api/admin/forms/${button.dataset.formDelete}`, { method: 'DELETE' });
      await loadFormTemplates();
    } catch {
      const status = $('#forms-status');
      if (status) { status.textContent = 'Não foi possível apagar o modelo.'; status.dataset.tone = 'error'; }
    }
  }));
}

async function loadFormTemplates() {
  try {
    const result = await request('/api/admin/forms');
    state.forms = result.forms || [];
    renderFormTemplates();
  } catch {
    const status = $('#forms-status');
    if (status) { status.textContent = 'Não foi possível carregar os modelos.'; status.dataset.tone = 'error'; }
  }
}

async function saveFormTemplate(event) {
  event.preventDefault();
  const formTemplate = event.currentTarget;
  const status = $('#forms-status');
  clearFieldErrors(formTemplate);
  const data = Object.fromEntries(new FormData(formTemplate));
  data.active = formTemplate.elements.active.checked;
  try { data.definition = JSON.parse(String(data.definition || '')); } catch { if (status) { status.textContent = 'A definição precisa ser um JSON válido.'; status.dataset.tone = 'error'; } $('.form-builder-advanced').open = true; fieldError(formTemplate, 'definition', 'Corrija o JSON antes de salvar.'); return; }
  if (data.definition?._editor === 'visual-v1') {
    const fields = data.definition.fields;
    const seen = new Set();
    const invalid = !Array.isArray(fields) || fields.length > 40 || fields.some((field) => {
      if (!field || typeof field !== 'object' || !/^[a-z][a-z0-9_]{0,59}$/.test(String(field.name || '')) || !String(field.label || '').trim() || !Object.hasOwn(formFieldTypes, field.type) || seen.has(field.name)) return true;
      seen.add(field.name);
      return field.type === 'select' && (!Array.isArray(field.options) || !field.options.length || field.options.length > 20);
    });
    if (invalid) {
      if (status) { status.textContent = 'Revise os campos: identificadores únicos, rótulos e opções das listas são obrigatórios.'; status.dataset.tone = 'error'; }
      $('#form-builder')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
  }
  setFormPending(formTemplate, true, 'Salvando…');
  try {
    const url = state.editingFormId ? `/api/admin/forms/${state.editingFormId}` : '/api/admin/forms';
    await request(url, { method: state.editingFormId ? 'PUT' : 'POST', body: JSON.stringify(data) });
    resetFormTemplateForm();
    await loadFormTemplates();
    if (status) { status.textContent = 'Modelo salvo.'; status.dataset.tone = 'success'; }
  } catch (error) {
    if (status) { status.textContent = error.message === 'INVALID_FORM_TEMPLATE' || error.message === 'FORM_TEMPLATE_EXISTS' ? 'Revise o slug, os campos e o JSON.' : 'Não foi possível salvar o modelo.'; status.dataset.tone = 'error'; }
  } finally {
    setFormPending(formTemplate, false);
  }
}

function renderProperties() {
  document.querySelector('.properties-table-wrap')?.removeAttribute('aria-busy');
  document.querySelectorAll('.property-filters input, .property-filters select').forEach((control) => { control.disabled = false; });
  const summary = state.propertySummary || { total: 0, active: 0, published: 0, draft: 0 };
  $('#metric-total').textContent = String(summary.active).padStart(2, '0');
  $('#metric-published').textContent = String(summary.published).padStart(2, '0');
  $('#metric-draft').textContent = String(summary.draft).padStart(2, '0');
  const query = String(state.propertyFilters.search || '').trim();
  const statusFilter = state.propertyFilters.status;
  const items = state.properties;
  $('#side-count').textContent = summary.total;
  $('#property-search').value = query;
  $('#property-status-filter').value = statusFilter;
  if ($('#property-availability-filter')) $('#property-availability-filter').value = state.propertyFilters.availability || '';
  $('#property-per-page').value = String(state.propertyFilters.per_page);
  $('#property-list').innerHTML = items.length ? items.map((item) => {
    const canEdit = item.can_edit === true;
    const action = canEdit
      ? `<button class="row-action" data-edit="${item.id}" type="button" aria-label="Editar ${escapeHTML(item.title)}">Editar <span>↗</span></button>`
      : '<span class="row-locked" title="Somente Gestor pode alterar imóvel publicado ou arquivado">Somente Gestor</span>';
    return `<article class="property-row"><div class="property-identity"><div class="property-thumb">${item.cover_url ? `<img src="${escapeHTML(item.cover_url)}" alt="" />` : '<span>⌂</span>'}</div><div><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.location)} · ${escapeHTML(item.type)}</small><small class="commercial-note">${escapeHTML(commercialLabels[item.availability] || 'Disponível')}</small></div></div><span class="status-pill ${item.status}"><i></i>${item.status === 'published' ? 'Publicado' : item.status === 'archived' ? 'Arquivado' : 'Rascunho'}</span><span class="updated-date">${formatDate(item.updated_at)}</span>${action}</article>`;
  }).join('') : (summary.total > 0 && (query || statusFilter)
    ? '<div class="empty-properties"><span>⌕</span><h4>Nenhum resultado.</h4><p>Tente outro termo ou status.</p></div>'
    : summary.total > 0
      ? '<div class="empty-properties" role="status">Carregando imóveis…</div>'
      : '<div class="empty-properties"><span>✦</span><h4>Seu portfólio começa aqui.</h4><p>Cadastre o primeiro imóvel para começar a construir a vitrine da Gisley Nunes.</p><button class="outline-button" data-empty-new type="button">Cadastrar primeiro imóvel <span>＋</span></button></div>');
  const pagination = state.propertyPagination;
  $('#property-page-summary').textContent = pagination?.total
    ? `Exibindo ${pagination.from}–${pagination.to} de ${pagination.total}`
    : 'Nenhum imóvel encontrado';
  $('#property-page-previous').disabled = !pagination || pagination.current_page <= 1;
  $('#property-page-next').disabled = !pagination || pagination.current_page >= pagination.last_page;
  document.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => openEditor(state.properties.find((item) => item.id === button.dataset.edit))));
  $('[data-empty-new]')?.addEventListener('click', () => openEditor());
}

function fillForm(property = {}) {
  for (const [key, value] of Object.entries({ title: property.title || '', location: property.location || '', neighborhood: property.neighborhood || '', city: property.city || 'Belo Horizonte', purpose: property.purpose || 'Comprar', type: property.type || 'Apartamento', price: property.price || '', priceLabel: property.price_label || '', bedrooms: property.bedrooms ?? 2, bathrooms: property.bathrooms ?? 2, areaM2: property.area_m2 ?? 80, suites: property.suites ?? 0, parkingSpots: property.parking_spots ?? 0, condoFee: property.condo_fee ?? 0, iptu: property.iptu ?? 0, description: property.description || '' })) { if (form.elements[key]) form.elements[key].value = value; }
  form.elements.published.checked = property.status !== 'draft' && property.status !== 'archived';
  form.elements.featured.checked = Boolean(property.is_featured);
  if (form.elements.availability) form.elements.availability.value = property.availability || 'available';
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
    const drawPreview = async () => {
      let bitmap = null;
      let objectUrl = null;
      try {
        if (typeof createImageBitmap === 'function') {
          try {
            bitmap = await createImageBitmap(file);
          } catch {
            // Some Safari versions fail to decode AVIF/HEIC with ImageBitmap.
          }
        }
        let source = bitmap;
        if (!source) {
          objectUrl = URL.createObjectURL(file);
          source = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('INVALID_PREVIEW'));
            image.src = objectUrl;
          });
        }
        if (previewGeneration !== state.pendingPreviewGeneration) return;
        const scale = Math.min(1, 640 / source.width, 640 / source.height);
        preview.width = Math.max(1, Math.round(source.width * scale));
        preview.height = Math.max(1, Math.round(source.height * scale));
        preview.getContext('2d')?.drawImage(source, 0, 0, preview.width, preview.height);
      } catch {
        if (previewGeneration === state.pendingPreviewGeneration) {
          preview.setAttribute('aria-label', 'Pré-visualização indisponível');
        }
      } finally {
        bitmap?.close();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
    };
    void drawPreview();
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
  if (property && !isManager && property.can_edit !== true) {
    toast('Você só pode alterar imóveis em rascunho cadastrados por você.', 'error');
    return;
  }

  state.editing = property;
  clearPendingFiles();
  $('#dialog-title').textContent = property ? 'Editar imóvel' : 'Novo imóvel';
  fillForm(property || {});
  renderEditorPhotos();
  clearFieldErrors(form);
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

  clearFieldErrors(form);
  const title = form.elements.title.value.trim();
  if (!title) { fieldError(form, 'title', 'Informe o título do imóvel.'); return; }
  if (!form.elements.location.value.trim()) { fieldError(form, 'location', 'Informe a localização do imóvel.'); return; }
  if (!form.elements.city.value.trim()) { fieldError(form, 'city', 'Informe a cidade.'); return; }
  const purpose = form.elements.purpose.value;
  const availability = form.elements.availability?.value || 'available';
  if ((availability === 'sold' && purpose !== 'Comprar') || (availability === 'rented' && purpose !== 'Alugar')) {
    fieldError(form, 'availability', 'Situação comercial incompatível com a finalidade do anúncio.');
    return;
  }

  const button = $('#save-property');
  setButtonPending(button, true, 'Salvando…');
  toast('Salvando alterações…');

  const data = Object.fromEntries(new FormData(form));
  const isManager = state.user?.role === 'manager';
  data.featured = isManager && form.elements.featured.checked;
  data.status = isManager && form.elements.published.checked ? 'published' : 'draft';
  // `published` is a UI-only field; the backend contract accepts `status`.
  delete data.published;

  let propertySaved = false;
  const publishAfterUpload = data.status === 'published'
    && state.pendingFiles.length > 0
    && !state.editing?.photos?.some((photo) => photo.is_cover);
  try {
    const initialData = publishAfterUpload
      ? { ...data, status: 'draft', featured: false }
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

    await loadProperties();
    dialog.close();
  } catch (error) {
    if (error.message === 'AUTH_REQUIRED') {
      toast('Sua sessão expirou.', 'error');
    } else if (propertySaved) {
      await loadProperties();
      renderEditorPhotos();
      toast(['INVALID_IMAGE', 'INVALID_IMAGE_DIMENSIONS'].includes(error.message)
        ? 'A imagem excede as dimensões permitidas. Escolha outra foto.'
        : state.pendingFiles.length
          ? 'Imóvel salvo. Algumas fotos ficaram pendentes; tente enviá-las novamente.'
          : data.status === 'published'
            ? 'Imóvel salvo como rascunho. Confira a capa e tente publicar novamente.'
            : 'Imóvel salvo, mas não foi possível concluir a atualização. Tente novamente.', 'error');
    } else {
      const message = error.message === 'SLUG_CONFLICT'
        ? 'Já existe um imóvel com esse endereço de URL.'
        : error.message === 'COVER_REQUIRED'
          ? 'Adicione uma foto de capa antes de publicar.'
          : error.message === 'INVALID_PROPERTY_NUMBER'
            ? 'Confira os valores numéricos e os limites dos campos.'
            : error.message === 'INVALID_PROPERTY' || error.message === 'VALIDATION_FAILED'
              ? 'Revise os campos obrigatórios e tente novamente.'
              : 'Não foi possível salvar. Confira os dados e tente novamente.';
      toast(message, 'error');
      if (error.message === 'COVER_REQUIRED') $('#photo-upload-trigger')?.focus();
      else if (error.message === 'INVALID_PROPERTY_NUMBER') fieldError(form, 'price', 'Confira preço, área e demais valores numéricos.');
      else if (error.message === 'INVALID_PROPERTY' || error.message === 'VALIDATION_FAILED') fieldError(form, 'title', 'Confira os campos obrigatórios e os dados informados.');
    }
  } finally {
    setButtonPending(button, false);
  }
}


async function archiveProperty() {
  if (!state.editing) return;
  const confirmed = await confirmAction({
    title: 'Arquivar imóvel?',
    message: `"${state.editing.title}" deixará de aparecer no site público.`
  });
  if (!confirmed) return;
  const button = $('#archive-property');
  setButtonPending(button, true, 'Arquivando…');
  toast('Arquivando imóvel…');
  try {
    await request(`/api/admin/properties/${state.editing.id}`, { method: 'DELETE' });
    await loadProperties();
    dialog.close();
  } catch {
    toast('Não foi possível arquivar este imóvel.', 'error');
  } finally {
    setButtonPending(button, false);
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

    let dimensions;
    try {
      dimensions = await imageDimensions(file);
    } catch {
      throw new Error('INVALID_IMAGE');
    }
    if (!Number.isInteger(dimensions.width) || !Number.isInteger(dimensions.height)
      || dimensions.width < 1 || dimensions.height < 1
      || dimensions.width > 20000 || dimensions.height > 20000) {
      throw new Error('INVALID_IMAGE_DIMENSIONS');
    }
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('altText', file.name.replace(/\.[^.]+$/, ''));
    formData.append('sortOrder', String(existingPhotoCount));
    formData.append('isCover', String(!state.editing?.photos?.some((photo) => photo.is_cover)));

    const result = await request(`/api/admin/properties/${propertyId}/photos/upload`, {
      method: 'POST',
      body: formData
    });

    state.editing = { ...state.editing, photos: result.photos };
    state.pendingFiles.shift();
    uploadedCount += 1;
    renderEditorPhotos();
  }

  clearPendingFiles();
}

async function removePhoto(id) {
  if (!state.editing) return;
  const confirmed = await confirmAction({
    title: 'Remover foto?',
    message: 'Esta ação não pode ser desfeita.'
  });
  if (!confirmed) return;
  const button = document.querySelector(`[data-photo-remove="${CSS.escape(id)}"]`);
  setButtonPending(button, true, '…');
  try {
    await request(`/api/admin/photos/${id}`, { method: 'DELETE' });
    const result = await request(`/api/admin/properties/${state.editing.id}`);
    state.editing = result.property;
    renderPhotos(state.editing.photos);
  } catch {
    toast('Não foi possível remover esta foto.', 'error');
  } finally {
    setButtonPending(button, false);
  }
}

async function movePhoto(id, direction) {
  if (!state.editing) return;
  const previousPhotos = state.editing.photos;
  const photos = [...previousPhotos];
  const index = photos.findIndex((photo) => photo.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= photos.length) return;
  const selector = direction < 0 ? 'data-photo-up' : 'data-photo-down';
  const button = document.querySelector(`[${selector}="${CSS.escape(id)}"]`);
  setButtonPending(button, true, '…');
  [photos[index], photos[target]] = [photos[target], photos[index]];
  try {
    const result = await request(`/api/admin/properties/${state.editing.id}/photos/order`, { method: 'PUT', body: JSON.stringify({ photoIds: photos.map((photo) => photo.id) }) });
    state.editing.photos = result.photos;
    renderPhotos(result.photos);
  } catch {
    toast('Não foi possível reordenar.', 'error');
  } finally {
    setButtonPending(button, false);
  }
}

async function makeCover(id) {
  if (!state.editing) return;
  const button = document.querySelector(`[data-photo-cover="${CSS.escape(id)}"]`);
  setButtonPending(button, true, '…');
  try {
    const result = await request(`/api/admin/photos/${id}/cover`, { method: 'PUT' });
    state.editing.photos = result.photos;
    renderPhotos(result.photos);
  } catch { toast('Não foi possível definir a capa.', 'error'); }
  finally { setButtonPending(button, false); }
}

const siteForm = $('#site-settings-form');
const testimonialForm = $('#testimonial-form');
const teamForm = $('#team-form');
let siteLoaded = false;
let teamLoaded = false;
let auditLoaded = false;

function siteNotify(message, tone = 'success') { const status = $('#site-status'); status.textContent = message; status.dataset.tone = tone; }

const instagramUrlInput = siteForm?.elements.instagramUrl;
instagramUrlInput?.addEventListener('input', () => {
  const value = instagramUrlInput.value.trim();
  let valid = value === '';
  if (value !== '') {
    try {
      const url = new URL(value);
      valid = url.protocol === 'https:' && /(^|\.)instagram\.com$/i.test(url.hostname);
    } catch {
      valid = false;
    }
  }
  instagramUrlInput.setCustomValidity(valid ? '' : 'Informe um endereço HTTPS válido do Instagram.');
});

function switchView(name) {
  const views = [...document.querySelectorAll('.admin-view')];
  const links = [...document.querySelectorAll('.side-nav a[data-view]')];
  const requestedView = views.find((view) => view.id === name);
  const permittedLink = links.find((link) => link.dataset.view === name && !link.hidden);
  const activeView = requestedView && permittedLink ? requestedView : $('#dashboard-view');

  views.forEach((view) => { view.hidden = view !== activeView; });
  links.forEach((link) => {
    const isCurrent = link.dataset.view === activeView?.id;
    link.classList.toggle('active', isCurrent);
    if (isCurrent) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (activeView) {
    const heading = activeView.id === 'dashboard-view'
      ? dashboardHeading
      : activeView.querySelector('h1, h2, h3');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }
  if (activeView?.id === 'site-view' && !siteLoaded) { siteLoaded = true; loadSite(); }
  if (activeView?.id === 'leads-view') { void loadLeads(); }
  if (activeView?.id === 'team-view' && state.user?.role === 'manager' && !teamLoaded) { void loadTeam(); }
  if (activeView?.id === 'profile-view') { void loadProfile(); }
  if (activeView?.id === 'forms-view' && state.user?.role === 'manager') { void loadFormTemplates(); }
  if (activeView?.id === 'audit-view' && state.user?.role === 'manager' && !auditLoaded) { auditLoaded = true; loadAudit(); }
}

function viewFromHash() {
  const view = window.location.hash.slice(1);
  if (view === 'admin-main') {
    return document.querySelector('.admin-view:not([hidden])')?.id || 'dashboard-view';
  }
  const link = [...document.querySelectorAll('.side-nav a[data-view]')]
    .find((item) => item.dataset.view === view && !item.hidden);
  return link?.dataset.view || 'dashboard-view';
}

function renderTestimonials(items = []) {
  const list = $('#testimonial-list');
  list.innerHTML = items.length ? items.map((item) => `<article class="testimonial-row"><div><strong>${escapeHTML(item.author)}</strong><p>${escapeHTML(item.quote)}</p><small>${escapeHTML(item.location || '')}${item.year ? ' · ' + escapeHTML(item.year) : ''}</small></div><button data-testimonial-remove="${item.id}" type="button" aria-label="Remover depoimento">×</button></article>`).join('') : '<div class="photo-empty"><span>✦</span><p>Nenhum depoimento ainda.</p></div>';
  list.querySelectorAll('[data-testimonial-remove]').forEach((button) => button.addEventListener('click', () => removeTestimonial(button.dataset.testimonialRemove)));
}

async function loadSite() {
  siteNotify('Carregando os dados do site…');
  try {
    const data = await request('/api/admin/site');
    const values = { whatsapp: data.site.whatsapp, phoneDisplay: data.site.phoneDisplay, email: data.site.email, address: data.site.address, crci: data.site.crci, area: data.site.area, instagramUrl: data.site.instagramUrl, instagramDisplay: data.site.instagramDisplay };
    for (const [key, value] of Object.entries(values)) { if (siteForm.elements[key]) siteForm.elements[key].value = value ?? ''; }
    renderTestimonials(data.testimonials);
    siteNotify('');
  } catch {
    siteLoaded = false;
    siteNotify('Não foi possível carregar os dados do site. Tente novamente ao voltar a esta seção.', 'error');
  }
}

async function saveSite(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(siteForm));
  setFormPending(siteForm, true, 'Salvando…');
  siteNotify('Salvando os dados do site…');
  try {
    await request('/api/admin/site', { method: 'PUT', body: JSON.stringify(data) });
    siteNotify('Dados do site salvos com sucesso.');
  } catch (error) {
    siteNotify(error.message === 'INVALID_SITE_SETTINGS' || error.message === 'VALIDATION_FAILED'
      ? 'Confira WhatsApp, e-mail, Instagram e limites dos campos.'
      : 'Não foi possível salvar. Tente novamente.', 'error');
  } finally {
    setFormPending(siteForm, false);
  }
}

async function addTestimonial(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(testimonialForm));
  data.author = String(data.author || '').trim();
  data.quote = String(data.quote || '').trim();
  if (!data.author || !data.quote) { siteNotify('Preencha nome e depoimento.', 'error'); return; }
  setFormPending(testimonialForm, true, 'Adicionando…');
  siteNotify('Adicionando depoimento…');
  try {
    const result = await request('/api/admin/testimonials', { method: 'POST', body: JSON.stringify({ author: data.author, quote: data.quote, location: data.location, year: data.year, sortOrder: 0 }) });
    renderTestimonials(result.testimonials);
    testimonialForm.reset();
    siteNotify('Depoimento adicionado.');
  } catch (error) {
    siteNotify(error.message === 'INVALID_TESTIMONIAL' || error.message === 'VALIDATION_FAILED'
      ? 'Revise o nome, o depoimento e o ano informado.'
      : 'Não foi possível adicionar o depoimento.', 'error');
  } finally {
    setFormPending(testimonialForm, false);
  }
}

async function removeTestimonial(id) {
  const confirmed = await confirmAction({
    title: 'Remover depoimento?',
    message: 'Esta ação não pode ser desfeita.'
  });
  if (!confirmed) return;
  const button = document.querySelector(`[data-testimonial-remove="${CSS.escape(id)}"]`);
  setButtonPending(button, true, 'Removendo…');
  siteNotify('Removendo depoimento…');
  try {
    await request(`/api/admin/testimonials/${id}`, { method: 'DELETE' });
    const data = await request('/api/admin/site');
    renderTestimonials(data.testimonials);
    siteNotify('Depoimento removido.');
  } catch { siteNotify('Não foi possível remover o depoimento.', 'error'); }
  finally { setButtonPending(button, false); }
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
  'lead.update': 'Atendimento atualizado',
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
  const button = $('#refresh-audit');
  setButtonPending(button, true, 'Atualizando…');
  if (status) { status.textContent = 'Carregando histórico…'; status.dataset.tone = ''; }
  const list = $('#audit-list');
  if (list) list.innerHTML = '<div class="empty-properties compact" role="status">Carregando atividade…</div>';
  try {
    state.audit = (await request('/api/admin/audit?limit=100')).audit || [];
    renderAudit();
    if (status) status.textContent = '';
  } catch {
    if (status) {
      status.textContent = 'Não foi possível carregar o histórico agora.';
      status.dataset.tone = 'error';
    }
  } finally {
    setButtonPending(button, false);
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
  const stale = state.team.filter((member) => member.active && member.last_login_at && new Date(member.last_login_at) < new Date(Date.now() - 90 * 86400000));
  const managers = state.team.filter((member) => member.active && member.role === 'manager');
  let review = $('#team-access-review');
  if (!review) {
    review = document.createElement('div');
    review.id = 'team-access-review';
    review.className = 'team-access-review';
    list.before(review);
  }
  review.textContent = `${managers.length} gestor(es) ativo(s) · ${state.team.filter((member) => member.active).length} acessos ativos · ${stale.length} sem login há mais de 90 dias. Revise periodicamente quem realmente precisa de cada permissão; nenhum acesso será removido automaticamente.`;
  list.innerHTML = state.team.length ? state.team.map((member) => {
    const isSelf = Boolean(member.is_self);
    const isBootstrap = Boolean(member.is_bootstrap);
    const roleLabel = member.role === 'manager' ? 'Gestor' : 'Corretor / Editor';
    return `<article class="team-row${member.active ? '' : ' is-inactive'}">
      <div class="team-person"><span class="team-avatar">${escapeHTML((member.name || member.email || '?').charAt(0).toUpperCase())}</span><div><strong>${escapeHTML(member.name)}</strong><a href="mailto:${escapeHTML(member.email)}">${escapeHTML(member.email)}</a><small>Último login: ${member.last_login_at ? formatDate(member.last_login_at) : 'não registrado'}</small></div></div>
      <div class="team-permission"><span class="role-pill ${member.role}">${roleLabel}</span>${!member.active ? '<small>Acesso pausado</small>' : ''}${isSelf ? '<small>você</small>' : ''}${isBootstrap ? '<small>principal</small>' : ''}</div>
      <div class="team-actions">
        ${!isSelf && !isBootstrap ? `<button type="button" data-team-role="${escapeHTML(member.email)}" data-next-role="${member.role === 'manager' ? 'editor' : 'manager'}">${member.role === 'manager' ? 'Tornar editor' : 'Tornar gestor'}</button><button type="button" data-team-active="${escapeHTML(member.email)}" data-next-active="${member.active ? 'false' : 'true'}">${member.active ? 'Pausar acesso' : 'Reativar'}</button><button class="danger" type="button" data-team-remove="${escapeHTML(member.email)}">Remover</button>` : ''}
      </div>
    </article>`;
  }).join('') : '<div class="empty-properties compact"><span>◎</span><h4>Nenhum acesso adicional.</h4><p>Adicione um corretor ou outro gestor para começar.</p></div>';

  list.querySelectorAll('[data-team-role]').forEach((button) => button.addEventListener('click', async () => {
    const nextRole = button.dataset.nextRole === 'manager' ? 'gestor' : 'editor';
    const confirmed = await confirmAction({
      title: 'Alterar permissão?',
      message: `Este membro será tornado ${nextRole}.`
    });
    if (!confirmed) return;
    setButtonPending(button, true, 'Salvando…');
    try {
      const email = button.dataset.teamRole;
      await request(`/api/admin/team/${encodeURIComponent(email)}`, { method: 'PATCH', body: JSON.stringify({ role: button.dataset.nextRole }) });
      await loadTeam();
      teamNotify('Permissão atualizada.');
    } catch (error) {
      teamNotify(error.message === 'BOOTSTRAP_MANAGER_PROTECTED' ? 'O gestor principal não pode ser rebaixado.' : 'Não foi possível alterar a permissão.', 'error');
    } finally {
      setButtonPending(button, false);
    }
  }));

  // Revoking access should immediately revoke active backend sessions.
  list.querySelectorAll('[data-team-active]').forEach((button) => button.addEventListener('click', async () => {
    const willActivate = button.dataset.nextActive === 'true';
    const confirmed = await confirmAction({
      title: willActivate ? 'Reativar acesso?' : 'Pausar acesso?',
      message: willActivate
        ? 'A pessoa poderá entrar novamente com sua conta Google.'
        : 'As sessões atuais serão revogadas e a pessoa deixará de entrar no painel.'
    });
    if (!confirmed) return;
    setButtonPending(button, true, 'Salvando…');
    try {
      await request(`/api/admin/team/${encodeURIComponent(button.dataset.teamActive)}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: willActivate })
      });
      await loadTeam();
      teamNotify(willActivate ? 'Acesso reativado.' : 'Acesso pausado e sessões revogadas.');
    } catch {
      teamNotify('Não foi possível alterar o acesso. Tente novamente.', 'error');
      setButtonPending(button, false);
    }
  }));

  list.querySelectorAll('[data-team-remove]').forEach((button) => button.addEventListener('click', async () => {
    const confirmed = await confirmAction({
      title: 'Remover acesso?',
      message: 'A pessoa deixará de entrar no painel.'
    });
    if (!confirmed) return;
    setButtonPending(button, true, 'Removendo…');
    try {
      await request(`/api/admin/team/${encodeURIComponent(button.dataset.teamRemove)}`, { method: 'DELETE' });
      await loadTeam();
      teamNotify('Acesso removido.');
    } catch (error) {
      teamNotify(error.message === 'BOOTSTRAP_MANAGER_PROTECTED' ? 'O gestor principal não pode ser removido.' : 'Não foi possível remover o acesso.', 'error');
    } finally {
      setButtonPending(button, false);
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
    const confirmed = await confirmAction({
      title: 'Revogar convite?',
      message: 'O link deixará de funcionar.'
    });
    if (!confirmed) return;
    setButtonPending(button, true, 'Revogando…');
    try {
      await request(`/api/admin/team/invitations/${encodeURIComponent(button.dataset.teamInviteRevoke)}`, { method: 'DELETE' });
      await loadTeam();
      teamNotify('Convite revogado.');
    } catch {
      teamNotify('Não foi possível revogar este convite.', 'error');
    } finally {
      setButtonPending(button, false);
    }
  }));
}

async function loadTeam() {
  if (teamLoading) {
    teamRefreshQueued = true;
    return;
  }
  teamLoading = true;
  const controller = new AbortController();
  teamRequestController?.abort();
  teamRequestController = controller;
  const generation = ++teamLoadSequence;
  const list = $('#team-list');
  const invitations = $('#team-invitations');
  if (list) list.innerHTML = '<div class="empty-properties compact" role="status">Carregando acessos…</div>';
  if (invitations) invitations.innerHTML = '<div class="empty-properties compact" role="status">Carregando convites…</div>';
  try {
    state.team = (await request('/api/admin/team', { signal: controller.signal })).team || [];
    state.invitations = (await request('/api/admin/team/invitations', { signal: controller.signal })).invitations || [];
    if (generation !== teamLoadSequence || !state.user) return;
    renderTeam();
    renderTeamInvitations();
    teamLoaded = true;
  } catch (error) {
    if (generation !== teamLoadSequence || error?.name === 'AbortError') return;
    teamLoaded = false;
    if (list) list.innerHTML = '<div class="empty-properties compact" role="alert"><p>Não foi possível carregar a equipe.</p><button id="retry-team-load" class="outline-button" type="button">Tentar novamente</button></div>';
    if (invitations) invitations.innerHTML = '<div class="empty-properties compact" role="alert"><p>Não foi possível carregar os convites.</p></div>';
    $('#retry-team-load')?.addEventListener('click', () => { void loadTeam(); }, { once: true });
  } finally {
    if (generation === teamLoadSequence) {
      teamRequestController = null;
      teamLoading = false;
      if (teamRefreshQueued) {
        teamRefreshQueued = false;
        void loadTeam();
      }
    }
  }
}

async function createTeamInvitation(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(teamForm));
  setFormPending(teamForm, true, 'Gerando…');
  teamNotify('Gerando convite temporário…');
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
  } finally {
    setFormPending(teamForm, false);
  }
}

function ensureLeadsPanel() {
  if ($('#leads-panel')) return $('#leads-panel');
  const view = $('#leads-view');
  if (!view) return null;
  const panel = document.createElement('section');
  panel.id = 'leads-panel';
  panel.className = 'leads-panel';
  panel.innerHTML = '<div class="lead-summary" id="lead-summary" aria-label="Resumo dos atendimentos"></div><div class="leads-panel-head"><div><p id="lead-status" class="lead-status" role="status" aria-live="polite"></p></div><span id="lead-total" class="lead-total">0 novos</span></div><form id="lead-filters" class="lead-filters"><label>Buscar contato<input name="search" type="search" maxlength="100" placeholder="Nome, e-mail, telefone ou mensagem" /></label><label>Etapa<select name="status"><option value="">Todas</option><option value="new">Novo</option><option value="em_contato">Em contato</option><option value="fechado">Fechado</option><option value="perdido">Perdido</option></select></label><label>Recebido de<input name="date_from" type="date" /></label><label>Até<input name="date_to" type="date" /></label><label>Por página<select name="per_page"><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></label><button class="outline-button" type="submit">Aplicar filtros</button><button class="outline-button" type="reset">Limpar</button><button class="outline-button lead-export" data-lead-export="csv" type="button">Exportar CSV</button><button class="outline-button lead-export" data-lead-export="json" type="button">Exportar JSON</button></form><div id="lead-list" class="lead-list" aria-live="polite"></div><div class="lead-pagination"><span id="lead-page-summary" aria-live="polite"></span><div><button class="outline-button" type="button" data-lead-page="previous">Anterior</button><button class="outline-button" type="button" data-lead-page="next">Próxima</button></div></div>';
  const detail = document.createElement('section');
  detail.id = 'lead-detail';
  detail.className = 'site-card';
  detail.hidden = true;
  panel.append(detail);
  view.append(panel);
  $('#lead-filters').addEventListener('submit', (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const dateFrom = String(values.get('date_from') || '');
    const dateTo = String(values.get('date_to') || '');
    if (dateFrom && dateTo && dateFrom > dateTo) {
      const status = $('#lead-status');
      status.textContent = 'A data inicial deve ser anterior ou igual à data final.';
      status.dataset.tone = 'error';
      return;
    }
    const status = $('#lead-status');
    status.textContent = '';
    status.dataset.tone = '';
    state.leadFilters = {
      ...state.leadFilters,
      status: String(values.get('status') || ''),
      search: String(values.get('search') || '').trim(),
      date_from: dateFrom,
      date_to: dateTo,
      per_page: Number(values.get('per_page')) || 20,
      page: 1
    };
    void loadLeads();
  });
  $('#lead-filters').addEventListener('reset', (event) => {
    event.preventDefault();
    $('#lead-filters').reset();
    state.leadFilters = { status: '', date_from: '', date_to: '', search: '', page: 1, per_page: 20 };
    void loadLeads();
  });
  panel.querySelectorAll('[data-lead-page]').forEach((button) => button.addEventListener('click', () => {
    const current = state.leadPagination?.current_page || 1;
    const last = state.leadPagination?.last_page || 1;
    state.leadFilters.page = button.dataset.leadPage === 'next' ? Math.min(last, current + 1) : Math.max(1, current - 1);
    void loadLeads();
  }));
  panel.querySelectorAll('[data-lead-export]').forEach((button) => button.addEventListener('click', async () => {
    const payload = { format: button.dataset.leadExport };
    for (const key of ['status', 'date_from', 'date_to', 'search']) {
      if (state.leadFilters[key]) payload[key] = state.leadFilters[key];
    }

    button.disabled = true;
    try {
      await download('/api/admin/leads/export', { method: 'POST', body: JSON.stringify(payload) });
    } catch (error) {
      toast(error.message === 'AUTH_REQUIRED' ? 'Sua sessão expirou.' : 'Não foi possível exportar os contatos.', 'error');
    } finally {
      button.disabled = false;
    }
  }));
  return panel;
}

function renderLeads() {
  const panel = ensureLeadsPanel();
  if (!panel) return;
  panel.removeAttribute('aria-busy');
  panel.querySelectorAll('#lead-filters button, #lead-filters input, #lead-filters select')
    .forEach((control) => { control.disabled = false; });
  const list = $('#lead-list');
  const newCount = Number(state.leadSummary?.new || 0);
  $('#lead-total').textContent = `${newCount} ${newCount === 1 ? 'novo' : 'novos'}`;
  $('#metric-leads-new').textContent = String(newCount).padStart(2, '0');
  const summaryLabels = [['total', 'Total'], ['new', 'Novos'], ['em_contato', 'Em contato'], ['fechado', 'Fechados'], ['perdido', 'Perdidos']];
  $('#lead-summary').innerHTML = summaryLabels.map(([key, label]) => `<article><span>${label}</span><strong>${Number(state.leadSummary?.[key] || 0)}</strong></article>`).join('');
  panel.querySelectorAll('[data-lead-export]').forEach((button) => { button.hidden = state.user?.role !== 'manager'; });

  const items = state.leads;
  const filters = $('#lead-filters');
  // Avoid overwriting filter values while the operator is editing them.
  if (!filters.contains(document.activeElement)) {
    filters.elements.search.value = state.leadFilters.search;
    filters.elements.status.value = state.leadFilters.status;
    filters.elements.date_from.value = state.leadFilters.date_from;
    filters.elements.date_to.value = state.leadFilters.date_to;
    filters.elements.per_page.value = String(state.leadFilters.per_page);
  }
  const pagination = state.leadPagination;
  $('#lead-page-summary').textContent = pagination?.total ? `Exibindo ${pagination.from}–${pagination.to} de ${pagination.total}` : 'Nenhum contato encontrado';
  panel.querySelector('[data-lead-page="previous"]').disabled = !pagination || pagination.current_page <= 1;
  panel.querySelector('[data-lead-page="next"]').disabled = !pagination || pagination.current_page >= pagination.last_page;
  list.innerHTML = items.length ? items.map((lead) => {
    const propertyLink = String(lead.property_path || '').startsWith('/imoveis/')
      ? `<a class="lead-property" href="${escapeHTML(lead.property_path)}" target="_blank" rel="noopener">Ver imóvel ↗</a>` : '';
    const statusOptions = [['new', 'Novo'], ['em_contato', 'Em contato'], ['fechado', 'Fechado'], ['perdido', 'Perdido']];
    const phone = String(lead.phone || '').replace(/\D/g, '');
    const whatsappPhone = phone && phone.length <= 11 ? `55${phone}` : phone;
    const followUp = lead.follow_up_date ? new Date(`${lead.follow_up_date}T00:00:00`) : null;
    const overdue = followUp && followUp < new Date(new Date().toDateString()) && !['fechado', 'perdido'].includes(lead.status);
    const assigneeName = state.leadAssignees.find((user) => user.email === lead.assigned_to_email)?.name || lead.assigned_to_email || 'Não atribuído';
    return `<article class="lead-row" data-status="${escapeHTML(lead.status)}"><div class="lead-main"><div class="lead-title"><strong>${escapeHTML(lead.name)}</strong><span>${formatDate(lead.created_at)}</span></div><div class="lead-contact-links"><a href="mailto:${escapeHTML(lead.email)}">${escapeHTML(lead.email)}</a>${phone ? `<a class="lead-contact-action" href="tel:+${whatsappPhone}">Ligar ${escapeHTML(lead.phone)}</a><a class="lead-contact-action lead-whatsapp" href="https://wa.me/${whatsappPhone}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp ↗</a>` : '<span class="lead-no-phone">Telefone não informado</span>'}</div><p>${escapeHTML(lead.message)}</p><small>${escapeHTML(lead.interest)} ${propertyLink}</small><small>Responsável: ${escapeHTML(assigneeName)} · Retorno: <span class="${overdue ? 'lead-overdue' : ''}">${followUp ? new Intl.DateTimeFormat('pt-BR').format(followUp) : 'Não agendado'}${overdue ? ' · atrasado' : ''}</span></small></div><div class="lead-actions"><label class="lead-status-control"><span class="sr-only">Status de ${escapeHTML(lead.name)}</span><select data-lead-status="${escapeHTML(lead.id)}">${statusOptions.map(([value, label]) => `<option value="${value}" ${lead.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button type="button" data-lead-save="${escapeHTML(lead.id)}">Salvar status</button>${state.user?.role === 'manager' ? `<button class="danger" type="button" data-lead-delete="${escapeHTML(lead.id)}">Apagar dados</button>` : ''}</div></article>`;
  }).join('') : '<div class="empty-properties compact"><span>✓</span><h4>Nenhum contato encontrado.</h4><p>Ajuste os filtros ou aguarde novos contatos pelo site.</p></div>';

  list.querySelectorAll('.lead-actions').forEach((actions) => {
    const leadRow = actions.closest('[data-status]');
    const leadId = leadRow?.querySelector('[data-lead-save]')?.dataset.leadSave;
    if (!leadId) return;
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'outline-button';
    openButton.textContent = 'Abrir atendimento';
    openButton.addEventListener('click', () => { void loadLeadDetail(leadId); });
    actions.append(openButton);
  });

  list.querySelectorAll('[data-lead-delete]').forEach((button) => button.addEventListener('click', async () => {
    const lead = state.leads.find((item) => item.id === button.dataset.leadDelete);
    const confirmed = await confirmAction({
      title: 'Apagar dados do contato?',
      message: `Os dados de ${lead?.name || 'este contato'} serão apagados permanentemente.`
    });
    if (!confirmed) return;

    setButtonPending(button, true, 'Apagando…');
    try {
      await request(`/api/admin/leads/${button.dataset.leadDelete}`, { method: 'DELETE' });
      await loadLeads();
      const status = $('#lead-status');
      if (status) {
        status.textContent = 'Dados pessoais apagados permanentemente.';
        status.dataset.tone = 'success';
      }
    } catch {
      setButtonPending(button, false);
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
    setButtonPending(button, true, 'Salvando…');
    try {
      await request(`/api/admin/leads/${button.dataset.leadSave}`, { method: 'PATCH', body: JSON.stringify({ status: statusInput.value }) });
      await loadLeads();
      const status = $('#lead-status');
      if (status) {
        status.textContent = 'Contato atualizado.';
        status.dataset.tone = 'success';
      }
    } catch {
      setButtonPending(button, false);
      const status = $('#lead-status');
      if (status) {
        status.textContent = 'Não foi possível atualizar este contato. Tente novamente.';
        status.dataset.tone = 'error';
      }
    }
  }));
}

function openAttentionLead(id) {
  if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return;
  window.history.pushState(null, '', '#leads-view');
  switchView('leads-view');
  void loadLeadDetail(id).then(() => $('#lead-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function renderAttention() {
  const attention = state.attention;
  if (!attention) return;
  const counts = $('#attention-counts');
  const agenda = $('#attention-agenda');
  const metrics = $('#attention-metrics');
  if (counts) counts.innerHTML = `<span class="${attention.overdue ? 'attention-urgent' : ''}">${Number(attention.overdue || 0)} atrasados</span><span>${Number(attention.today || 0)} para hoje</span><span>${Number(attention.nextSevenDays || 0)} próximos 7 dias</span>`;
  if (agenda) {
    const items = attention.appointments || [];
    agenda.innerHTML = items.length ? items.map((lead) => `<article><div><strong>${escapeHTML(lead.name)}</strong><small>${escapeHTML(lead.interest)} · ${localDay(lead.followUpDate)}${lead.assignedTo ? ` · ${escapeHTML(lead.assignedTo)}` : ''}</small></div><button class="outline-button" type="button" data-attention-lead="${escapeHTML(lead.id)}">Atender</button></article>`).join('') : '<p>Sem retornos pendentes nos próximos sete dias.</p>';
    agenda.querySelectorAll('[data-attention-lead]').forEach((button) => button.addEventListener('click', () => openAttentionLead(button.dataset.attentionLead)));
  }
  if (metrics) {
    const data = attention.metrics || {};
    metrics.innerHTML = `<article><span>Contatos recebidos</span><strong>${Number(data.totalLast30Days || 0)}</strong></article><article><span>Fechados</span><strong>${Number(data.closedLast30Days || 0)}</strong></article><article><span>Taxa de fechamento</span><strong>${data.conversionPercent === null ? '—' : `${Number(data.conversionPercent).toLocaleString('pt-BR')}%`}</strong></article><article><span>Primeira resposta registrada</span><strong>${data.averageFirstResponseMinutes === null ? '—' : `${Number(data.averageFirstResponseMinutes).toLocaleString('pt-BR')} min`}</strong><small>${Number(data.responsesMeasured || 0)} atendimento(s) medidos</small></article>`;
  }
  if ($('#metric-leads-new')) $('#metric-leads-new').textContent = String(Number(attention.newCount || 0)).padStart(2, '0');
}

function renderNotifications() {
  const count = $('#notification-count');
  if (count) {
    count.textContent = String(state.notificationUnread);
    $('#notification-toggle')?.setAttribute('aria-label', `Avisos do painel: ${state.notificationUnread} não lidos`);
  }
  const list = $('#notification-list');
  if (!list) return;
  list.innerHTML = state.notifications.length ? state.notifications.map((item) => `<article class="notification-item${item.readAt ? '' : ' is-unread'}"><div><strong>${item.kind === 'new_lead' ? 'Novo contato recebido' : 'Retorno de atendimento pendente'}</strong><small>${formatDate(item.createdAt)}</small></div><div><button type="button" class="outline-button" data-notification-open="${escapeHTML(item.id)}">Abrir</button>${!item.readAt ? `<button type="button" class="outline-button" data-notification-read="${escapeHTML(item.id)}">Marcar lido</button>` : ''}</div></article>`).join('') : '<p class="team-help">Nenhum aviso por enquanto.</p>';
  list.querySelectorAll('[data-notification-open]').forEach((button) => button.addEventListener('click', async () => {
    const notification = state.notifications.find((item) => item.id === button.dataset.notificationOpen);
    if (!notification) return;
    if (!notification.readAt) await markNotificationRead(notification.id);
    $('#notification-center').hidden = true;
    $('#notification-toggle').setAttribute('aria-expanded', 'false');
    openAttentionLead(notification.leadId);
  }));
  list.querySelectorAll('[data-notification-read]').forEach((button) => button.addEventListener('click', () => { void markNotificationRead(button.dataset.notificationRead); }));
}

async function markNotificationRead(id) {
  try {
    await request(`/api/admin/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
    await loadNotifications();
  } catch {
    const list = $('#notification-list');
    if (list) list.insertAdjacentHTML('afterbegin', '<p role="alert">Não foi possível marcar o aviso como lido.</p>');
  }
}

async function loadNotifications() {
  const result = await request('/api/admin/notifications');
  if (!state.user) return;
  state.notifications = Array.isArray(result.items) ? result.items : [];
  state.notificationUnread = Number(result.unread || 0);
  renderNotifications();
}

async function loadAttention() {
  if (!state.user || attentionLoading) return;
  attentionLoading = true;
  try {
    const attention = await request('/api/admin/attention');
    if (!state.user) return;
    state.attention = attention;
    renderAttention();
    try { await loadNotifications(); } catch { /* Keep agenda usable if only the inbox request failed. */ }
  } catch (error) {
    if (error?.message === 'AUTH_REQUIRED') return;
    const agenda = $('#attention-agenda');
    if (agenda && !state.attention) agenda.innerHTML = '<p role="alert">Não foi possível carregar a agenda. Use Atualizar para tentar novamente.</p>';
  } finally {
    attentionLoading = false;
  }
}

async function loadLeadDetail(id) {
  const detail = $('#lead-detail');
  if (!detail) return;
  detail.hidden = false;
  detail.innerHTML = '<p role="status">Carregando atendimento…</p>';
  try {
    const result = await request(`/api/admin/leads/${id}`);
    const lead = result.lead;
    state.leadDetail = lead;
    const activities = Array.isArray(lead.activities) ? lead.activities : [];
    const assignedUserIsActive = state.leadAssignees.some((user) => user.email === lead.assigned_to_email);
    const inactiveAssignee = lead.assigned_to_email && !assignedUserIsActive
      ? `<option value="${escapeHTML(lead.assigned_to_email)}">${escapeHTML(lead.assigned_to_email)} · inativo</option>`
      : '';
    const assigneeOptions = state.leadAssignees.map((user) => `<option value="${escapeHTML(user.email)}">${escapeHTML(user.name)} · ${escapeHTML(user.email)}</option>`).join('');
    detail.innerHTML = `<div class="leads-panel-head"><div><p class="admin-kicker">atendimento</p><h3>${escapeHTML(lead.name)}</h3><p>${escapeHTML(lead.email)} · ${escapeHTML(lead.interest)}</p>${lead.phone ? `<p>Telefone: ${escapeHTML(lead.phone)}</p>` : ''}</div><button type="button" class="outline-button" data-close-lead>Fechar</button></div><p>${escapeHTML(lead.message)}</p><div class="site-fields lead-fields"><label>Status<select id="lead-detail-status"><option value="new">Novo</option><option value="em_contato">Em contato</option><option value="fechado">Fechado</option><option value="perdido">Perdido</option></select></label><label>Responsável<select id="lead-detail-assignee"><option value="">Sem responsável</option>${inactiveAssignee}${assigneeOptions}</select></label><label>Próximo retorno<input id="lead-detail-follow-up" type="date" /></label><button id="lead-detail-status-save" class="outline-button" type="button">Salvar atendimento</button><label>Registrar contato<textarea id="lead-detail-body" maxlength="4000" rows="4" placeholder="Descreva a ligação, mensagem, visita ou próximo passo."></textarea></label><label>Tipo<select id="lead-detail-type"><option value="note">Anotação</option><option value="call">Ligação</option><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option><option value="meeting">Reunião</option></select></label><button id="lead-detail-activity-save" class="admin-button admin-button-primary" type="button">Salvar no histórico <span>↗</span></button></div><div class="testimonial-list"><span class="metric-label">histórico de contatos</span>${activities.length ? activities.map((item) => `<article class="testimonial-row"><div><strong>${escapeHTML(item.type)}</strong><p>${escapeHTML(item.body)}</p><small>${escapeHTML(item.actorName)} · ${formatDate(item.createdAt)}</small></div></article>`).join('') : '<p>Nenhum contato registrado ainda.</p>'}</div>`;
    $('#lead-detail-status').value = lead.status;
    $('#lead-detail-assignee').value = lead.assigned_to_email || '';
    $('#lead-detail-follow-up').value = lead.follow_up_date || '';
    $('[data-close-lead]').addEventListener('click', () => { detail.hidden = true; state.leadDetail = null; });
    $('#lead-detail-status-save').addEventListener('click', async (event) => {
      setButtonPending(event.currentTarget, true, 'Salvando…');
      try { await request(`/api/admin/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ status: $('#lead-detail-status').value, assigned_to_email: $('#lead-detail-assignee').value || null, follow_up_date: $('#lead-detail-follow-up').value || null }) }); await loadLeadDetail(id); await loadLeads(); } catch { event.currentTarget.disabled = false; }
    });
    $('#lead-detail-activity-save').addEventListener('click', async (event) => {
      const body = $('#lead-detail-body').value.trim();
      if (!body) return;
      setButtonPending(event.currentTarget, true, 'Salvando…');
      try { await request(`/api/admin/leads/${id}/activities`, { method: 'POST', body: JSON.stringify({ type: $('#lead-detail-type').value, body }) }); await loadLeadDetail(id); } catch { event.currentTarget.disabled = false; }
    });
  } catch {
    detail.innerHTML = '<p role="alert">Não foi possível abrir este atendimento.</p>';
  }
}

async function loadLeads() {
  leadRequestController?.abort();
  const controller = new AbortController();
  leadRequestController = controller;
  const generation = ++leadLoadSequence;
  const panel = ensureLeadsPanel();
  const list = panel?.querySelector('#lead-list');
  panel?.setAttribute('aria-busy', 'true');
  // Keep filters usable while an old request is being cancelled or replaced.
  panel?.querySelectorAll('[data-lead-page]')
    .forEach((control) => { control.disabled = true; });
  if (list) list.innerHTML = '<div class="empty-properties compact" role="status">Carregando contatos…</div>';
  try {
    if (!leadAssigneesLoaded) {
      try {
        const assignees = await request('/api/admin/leads/assignees');
        state.leadAssignees = Array.isArray(assignees.assignees) ? assignees.assignees : [];
        leadAssigneesLoaded = true;
      } catch {
        state.leadAssignees = [];
      }
    }
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(state.leadFilters)) {
      if (value !== '' && value !== null && value !== undefined) params.set(key, String(value));
    }
    const result = await request(`/api/admin/leads?${params.toString()}`, { signal: controller.signal });
    if (generation !== leadLoadSequence || !state.user) return;
    state.leads = result.leads || [];
    state.leadPagination = result.pagination || null;
    state.leadSummary = result.summary || { new: 0, em_contato: 0, fechado: 0, perdido: 0, total: 0 };
    leadsLoaded = true;
    renderLeads();
  } catch (error) {
    if (generation !== leadLoadSequence || error?.name === 'AbortError') return;
    if (!leadsLoaded) $('#metric-leads-new').textContent = '—';
    ensureLeadsPanel();
    if ($('#lead-list')) {
      $('#lead-list').innerHTML = '<div class="empty-properties compact" role="alert"><p>Não foi possível carregar os contatos agora.</p><button id="retry-admin-leads" class="outline-button" type="button">Tentar novamente</button></div>';
      $('#retry-admin-leads')?.addEventListener('click', () => { void loadLeads(); }, { once: true });
    }
    const status = $('#lead-status');
    if (status) {
      status.textContent = error.message === 'VALIDATION_FAILED'
        ? 'Confira o intervalo de datas e os filtros.'
        : 'Não foi possível carregar os contatos agora.';
      status.dataset.tone = 'error';
    }
    if (panel) {
      panel.removeAttribute('aria-busy');
      const pagination = state.leadPagination;
      panel.querySelector('[data-lead-page="previous"]').disabled = !pagination || pagination.current_page <= 1;
      panel.querySelector('[data-lead-page="next"]').disabled = !pagination || pagination.current_page >= pagination.last_page;
      panel.querySelectorAll('#lead-filters button, #lead-filters input, #lead-filters select, [data-lead-export]')
        .forEach((control) => { control.disabled = false; });
    }
  } finally {
    if (generation === leadLoadSequence) leadRequestController = null;
  }
}

async function loadProperties() {
  propertyRequestController?.abort();
  const controller = new AbortController();
  propertyRequestController = controller;
  const generation = ++propertyLoadSequence;
  const list = $('#property-list');
  const controls = document.querySelectorAll('#property-page-previous, #property-page-next');
  controls.forEach((control) => { control.disabled = true; });
  document.querySelector('.properties-table-wrap')?.setAttribute('aria-busy', 'true');
  // Do not wipe the list or disable the text field while the manager is typing.
  if (list && !list.children.length) list.innerHTML = '<div class="empty-properties compact" role="status">Carregando imóveis…</div>';
  try {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(state.propertyFilters)) {
      if (value !== '' && value !== null && value !== undefined) params.set(key, String(value));
    }
    const result = await request(`/api/admin/properties?${params.toString()}`, { signal: controller.signal });
    if (generation !== propertyLoadSequence || !state.user) return;
    state.properties = result.properties || [];
    state.propertyPagination = result.pagination || null;
    state.propertySummary = result.summary || { total: 0, active: 0, published: 0, draft: 0 };
    if (state.propertyPagination?.last_page > 0 && state.propertyFilters.page > state.propertyPagination.last_page) {
      state.propertyFilters.page = state.propertyPagination.last_page;
      return loadProperties();
    }
    renderProperties();
  } catch (error) {
    if (generation !== propertyLoadSequence || error?.name === 'AbortError') return;
    if (state.propertySummary === null) {
      $('#metric-total').textContent = '—';
      $('#metric-published').textContent = '—';
      $('#metric-draft').textContent = '—';
    }
    if (list) list.innerHTML = '<div class="empty-properties compact" role="alert"><p>Não foi possível carregar os imóveis agora. Confira a conexão e tente novamente.</p><button id="retry-admin-properties" class="outline-button" type="button">Tentar novamente</button></div>';
    $('#retry-admin-properties')?.addEventListener('click', () => { void loadProperties(); }, { once: true });
    document.querySelector('.properties-table-wrap')?.removeAttribute('aria-busy');
    controls.forEach((control) => {
      if (control.matches('#property-page-previous')) {
        control.disabled = !state.propertyPagination || state.propertyPagination.current_page <= 1;
      } else if (control.matches('#property-page-next')) {
        control.disabled = !state.propertyPagination || state.propertyPagination.current_page >= state.propertyPagination.last_page;
      } else {
        control.disabled = false;
      }
    });
  } finally {
    if (generation === propertyLoadSequence) propertyRequestController = null;
  }
}

async function init() {
  try {
    const session = await request('/api/admin/session');
    state.csrfToken = String(session.csrfToken || '');
    if (!session.authenticated) return showLogin();
    state.user = session.user;
    showDashboard();
    switchView(viewFromHash());
    await Promise.all([loadProperties(), loadLeads(), loadAttention()]);
    clearInterval(attentionTimer);
    attentionTimer = window.setInterval(() => {
      if (state.user && !document.hidden) void loadAttention();
    }, 60000);
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
$('#photo-upload-trigger')?.addEventListener('click', () => $('#photo-input')?.click());
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
document.querySelectorAll('.side-nav a[data-view]').forEach((link) => link.addEventListener('click', (event) => {
  event.preventDefault();
  if (window.location.hash !== link.hash) window.history.pushState(null, '', link.hash);
  switchView(link.dataset.view);
}));
window.addEventListener('popstate', () => switchView(viewFromHash()));
window.addEventListener('hashchange', () => switchView(viewFromHash()));
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
$('#property-search')?.addEventListener('input', (event) => {
  state.propertyFilters.search = event.target.value;
  state.propertyFilters.page = 1;
  clearTimeout(propertySearchTimer);
  propertySearchTimer = setTimeout(() => { void loadProperties(); }, 250);
});
$('#property-status-filter')?.addEventListener('change', (event) => {
  state.propertyFilters.status = event.target.value;
  state.propertyFilters.page = 1;
  void loadProperties();
});
$('#property-per-page')?.addEventListener('change', (event) => {
  state.propertyFilters.per_page = Number(event.target.value) || 20;
  state.propertyFilters.page = 1;
  void loadProperties();
});
$('#property-page-previous')?.addEventListener('click', () => {
  state.propertyFilters.page = Math.max(1, state.propertyFilters.page - 1);
  void loadProperties();
});
$('#property-page-next')?.addEventListener('click', () => {
  state.propertyFilters.page = Math.min(state.propertyPagination?.last_page || 1, state.propertyFilters.page + 1);
  void loadProperties();
});
init();
