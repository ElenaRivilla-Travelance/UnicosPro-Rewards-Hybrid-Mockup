const DEFAULT_CONFIG = {
  storage: {
    npointUrl: ''
  },
  branding: {
    partnerName: '',
    colors: {
      primary: '',
      secondary: '',
      footer: ''
    },
    logo: '',
    footerLogo: '',
    banner: '',
    loginBackground: ''
  },
  user: {
    displayName: '',
    agencyStatus: '',
    welcomeName: '',
    profile: {
      firstName: '',
      lastName1: '',
      lastName2: '',
      country: '',
      province: '',
      city: '',
      postalCode: '',
      taxId: '',
      birthDate: '',
      email: '',
      phone: '',
      agency: '',
      gender: ''
    }
  },
  rewards: {
    agentPoints: 0,
    rewardMinPoints: 0,
    withholdingRatePct: 0
  }
};

let appConfig = cloneData(DEFAULT_CONFIG);
let storageConfig = { ...DEFAULT_CONFIG.storage };
let editingUnlocked = false;
let changingPassword = false;
let suspendAutoSave = false;
let currentBrandName = DEFAULT_CONFIG.branding.partnerName;
let currentLogoValue = DEFAULT_CONFIG.branding.logo;
let currentFooterLogoValue = DEFAULT_CONFIG.branding.footerLogo;
let currentBannerValue = DEFAULT_CONFIG.branding.banner;
let currentLoginBgValue = DEFAULT_CONFIG.branding.loginBackground;
let mockAgentPoints = DEFAULT_CONFIG.rewards.agentPoints;
let mockRewardMinPoints = DEFAULT_CONFIG.rewards.rewardMinPoints;
let withholdingRatePct = DEFAULT_CONFIG.rewards.withholdingRatePct;
let persistedState = { branding: null, user: null, rewards: null, passwordHash: '' };
let editLauncherVisible = true;

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function mergeConfig(base, override) {
  if (!override || typeof override !== 'object') return cloneData(base);

  const result = Array.isArray(base) ? [...base] : { ...base };
  Object.keys(override).forEach((key) => {
    const baseValue = result[key];
    const overrideValue = override[key];

    if (
      baseValue &&
      typeof baseValue === 'object' &&
      !Array.isArray(baseValue) &&
      overrideValue &&
      typeof overrideValue === 'object' &&
      !Array.isArray(overrideValue)
    ) {
      result[key] = mergeConfig(baseValue, overrideValue);
      return;
    }

    result[key] = overrideValue;
  });

  return result;
}

async function loadAppConfig() {
  try {
    const response = await fetch('./config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo cargar config.json');
    const config = await response.json();
    return {
      storage: mergeConfig(DEFAULT_CONFIG.storage, config.storage || {}),
      branding: mergeConfig(DEFAULT_CONFIG.branding, normalizeBrandingConfig(config.branding || config.config || null) || {}),
      user: mergeConfig(DEFAULT_CONFIG.user, config.user || {}),
      rewards: mergeConfig(DEFAULT_CONFIG.rewards, config.rewards || {})
    };
  } catch (error) {
    console.warn('No se pudo cargar config.json. Se usará la estructura base vacía.', error);
    return cloneData(DEFAULT_CONFIG);
  }
}

function hasRemotePersistence() {
  return !!storageConfig.npointUrl;
}

function normalizeBrandingConfig(brandingConfig) {
  if (!brandingConfig || typeof brandingConfig !== 'object') {
    return null;
  }

  const normalizedColors = {
    primary: brandingConfig.colors?.primary || brandingConfig.primaryColor || DEFAULT_CONFIG.branding.colors.primary,
    secondary: brandingConfig.colors?.secondary || brandingConfig.secondaryColor || DEFAULT_CONFIG.branding.colors.secondary,
    footer: brandingConfig.colors?.footer || brandingConfig.footerColor || DEFAULT_CONFIG.branding.colors.footer
  };

  return {
    ...brandingConfig,
    loginBackground: brandingConfig.loginBackground || brandingConfig.loginBg || '',
    colors: normalizedColors
  };
}

function serializeBrandingConfig(brandingConfig) {
  const normalizedBranding = normalizeBrandingConfig(brandingConfig) || cloneData(DEFAULT_CONFIG.branding);

  return {
    partnerName: normalizedBranding.partnerName || DEFAULT_CONFIG.branding.partnerName,
    primaryColor: normalizedBranding.colors.primary,
    secondaryColor: normalizedBranding.colors.secondary,
    footerColor: normalizedBranding.colors.footer,
    logo: normalizedBranding.logo || '',
    footerLogo: normalizedBranding.footerLogo || '',
    banner: normalizedBranding.banner || '',
    loginBg: normalizedBranding.loginBackground || ''
  };
}

function mergeRemoteStateIntoAppConfig(remoteState) {
  if (!remoteState) {
    return appConfig;
  }

  return {
    ...appConfig,
    branding: mergeConfig(appConfig.branding, normalizeBrandingConfig(remoteState.branding) || {}),
    user: mergeConfig(appConfig.user, remoteState.user || {}),
    rewards: mergeConfig(appConfig.rewards, remoteState.rewards || {})
  };
}

async function loadPersistedState() {
  if (!hasRemotePersistence()) {
    persistedState = { branding: null, user: null, rewards: null, passwordHash: '' };
    return persistedState;
  }

  try {
    const response = await fetch(storageConfig.npointUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo leer npoint');
    const data = await response.json();
    const remoteBranding = data.branding || data.config || null;
    persistedState = {
      branding: normalizeBrandingConfig(remoteBranding),
      user: data.user || null,
      rewards: data.rewards || null,
      passwordHash: data.passwordHash || ''
    };
  } catch (error) {
    console.warn('No se pudo leer npoint.', error);
    persistedState = { branding: null, user: null, rewards: null, passwordHash: '' };
  }

  return persistedState;
}

async function savePersistedState(nextState) {
  persistedState = { ...persistedState, ...nextState };

  if (!hasRemotePersistence()) {
    return false;
  }

  try {
    const response = await fetch(storageConfig.npointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: serializeBrandingConfig(persistedState.branding),
        user: persistedState.user,
        rewards: persistedState.rewards,
        passwordHash: persistedState.passwordHash
      })
    });
    return response.ok;
  } catch (error) {
    console.warn('No se pudo guardar en npoint.', error);
    return false;
  }
}

function setInputValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value ?? '';
}

function setTextContent(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value ?? '';
}

// --- Banner slider ---
const banners = document.querySelectorAll('.banner');
const indicators = document.querySelectorAll('.indicator');
let currentBanner = 0;

function showBanner(i) {
  banners.forEach((b, idx) => b.classList.toggle('active', idx === i));
  indicators.forEach((ind, idx) => ind.classList.toggle('selected', idx === i));
  currentBanner = i;
}
function nextBanner() { showBanner((currentBanner + 1) % banners.length); }
function prevBanner() { showBanner((currentBanner - 1 + banners.length) % banners.length); }
function selectBanner(i) { showBanner(i); }

// --- Toast falso ---
let toastTimer;
function fakeToast(msg) {
  const toast = document.getElementById('fakeToast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

async function hashText(text) {
  try {
    if (window.crypto && window.crypto.subtle) {
      const enc = new TextEncoder().encode(text);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) { }
  // Fallback simple si crypto.subtle no está disponible (p.ej. abriendo el archivo local sin https)
  let h = 0;
  for (let i = 0; i < text.length; i++) { h = (h << 5) - h + text.charCodeAt(i); h |= 0; }
  return 'fb-' + Math.abs(h).toString(16);
}

async function requestEditAccess() {
  if (document.getElementById('editPanel').classList.contains('open')) {
    togglePanel();
    return;
  }
  if (editingUnlocked) {
    togglePanel();
    return;
  }
  await openPasswordFlow();
}

async function openPasswordFlow() {
  const state = await loadPersistedState();
  const existingHash = state.passwordHash;

  if (!hasRemotePersistence()) {
    fakeToast('Configura la URL de npoint en config.json para habilitar la edición compartida');
    return;
  }

  document.getElementById('passwordError').style.display = 'none';
  document.getElementById('newPasswordInput').value = '';
  document.getElementById('newPasswordConfirmInput').value = '';
  document.getElementById('verifyPasswordInput').value = '';

  if (existingHash) {
    document.getElementById('passwordSetupView').style.display = 'none';
    document.getElementById('passwordVerifyView').style.display = '';
  } else {
    document.getElementById('passwordSetupView').style.display = '';
    document.getElementById('passwordVerifyView').style.display = 'none';
  }
  document.getElementById('passwordModal').classList.add('show');
}

function closePasswordModal() {
  document.getElementById('passwordModal').classList.remove('show');
  changingPassword = false;
}

function setEditLauncherVisibility(visible) {
  editLauncherVisible = visible;
  document.getElementById('mockToolbar').classList.toggle('toolbar-hidden', !visible);
}

async function handlePasswordSetup(event) {
  event.preventDefault();
  const pass = document.getElementById('newPasswordInput').value;
  const confirm = document.getElementById('newPasswordConfirmInput').value;
  if (!pass || pass.length < 4) {
    fakeToast('La contraseña debe tener al menos 4 caracteres');
    return false;
  }
  if (pass !== confirm) {
    fakeToast('Las contraseñas no coinciden');
    return false;
  }
  const hash = await hashText(pass);
  const ok = await savePersistedState({ passwordHash: hash });
  if (!ok) {
    fakeToast('No se pudo guardar la contraseña en npoint');
    return false;
  }
  editingUnlocked = true;
  closePasswordModal();
  const wasChanging = changingPassword;
  changingPassword = false;
  fakeToast(wasChanging ? 'Contraseña actualizada' : 'Contraseña creada — edición desbloqueada');
  if (!document.getElementById('editPanel').classList.contains('open')) togglePanel();
  return false;
}

async function handlePasswordVerify(event) {
  event.preventDefault();
  const pass = document.getElementById('verifyPasswordInput').value;
  const hash = await hashText(pass);
  const state = await loadPersistedState();
  const storedHash = state.passwordHash;

  if (storedHash && hash === storedHash) {
    editingUnlocked = true;
    closePasswordModal();
    if (changingPassword) {
      changingPassword = false;
      document.getElementById('passwordSetupView').style.display = '';
      document.getElementById('passwordVerifyView').style.display = 'none';
      document.getElementById('passwordModal').classList.add('show');
    } else if (!document.getElementById('editPanel').classList.contains('open')) {
      togglePanel();
    }
  } else {
    document.getElementById('passwordError').style.display = 'block';
    document.getElementById('verifyPasswordInput').value = '';
  }
  return false;
}

async function startPasswordChange() {
  changingPassword = true;
  const state = await loadPersistedState();
  const existingHash = state.passwordHash;
  if (!hasRemotePersistence()) {
    fakeToast('Configura la URL de npoint en config.json para habilitar la edición compartida');
    return;
  }
  document.getElementById('passwordError').style.display = 'none';
  document.getElementById('verifyPasswordInput').value = '';
  if (existingHash) {
    // pide la contraseña actual antes de permitir cambiarla
    document.getElementById('passwordSetupView').style.display = 'none';
    document.getElementById('passwordVerifyView').style.display = '';
  } else {
    document.getElementById('passwordSetupView').style.display = '';
    document.getElementById('passwordVerifyView').style.display = 'none';
  }
  document.getElementById('passwordModal').classList.add('show');
}

function togglePanel() {
  const panel = document.getElementById('editPanel');
  const open = panel.classList.toggle('open');
  document.body.classList.toggle('panel-open', open);
  if (open) {
    setEditLauncherVisibility(false);
    return;
  }

  flushPendingSave();
  setEditLauncherVisibility(false);
}
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    const panel = document.getElementById('editPanel');
    if (panel.classList.contains('open')) {
      panel.classList.remove('open');
      document.body.classList.remove('panel-open');
      flushPendingSave();
    }
    setEditLauncherVisibility(!editLauncherVisible);
  }
  if (e.key === 'Escape') {
    const panel = document.getElementById('editPanel');
    if (panel.classList.contains('open')) togglePanel();
  }
});
const colorVarMap = {
  primary: ['--color-primary-club'],
  secondary: ['--color-secondary-club'],
  footer: ['--color-footer-bg']
};
const HEX_RE = /^#([0-9A-Fa-f]{6})$/;

function syncColorFromPicker(key, value) {
  document.getElementById(key + 'ColorHex').value = value;
  document.getElementById(key + 'ColorHex').classList.remove('invalid');
  updateColor(colorVarMap[key], value);
}
function syncColorFromHex(key, value) {
  const hexField = document.getElementById(key + 'ColorHex');
  let v = value.trim();
  if (v && !v.startsWith('#')) v = '#' + v;
  if (HEX_RE.test(v)) {
    hexField.classList.remove('invalid');
    document.getElementById(key + 'ColorInput').value = v;
    updateColor(colorVarMap[key], v);
  } else {
    hexField.classList.add('invalid');
  }
}
function updateColor(varNames, value) {
  const names = Array.isArray(varNames) ? varNames : [varNames];
  names.forEach(n => document.documentElement.style.setProperty(n, value));
  scheduleSave();
}

function handleLogoFile(file) {
  if (!file) return;
  const nameLabel = document.getElementById('logoFileName');
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('logoUrlInput').value = '';
    updateLogo(e.target.result);
    nameLabel.textContent = `✓ ${file.name}`;
  };
  reader.onerror = () => { nameLabel.textContent = '⚠ No se pudo leer el archivo'; };
  reader.readAsDataURL(file);
}
function handleFooterLogoFile(file) {
  if (!file) return;
  const nameLabel = document.getElementById('footerLogoFileName');
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('footerLogoUrlInput').value = '';
    updateFooterLogo(e.target.result);
    nameLabel.textContent = `✓ ${file.name}`;
  };
  reader.onerror = () => { nameLabel.textContent = '⚠ No se pudo leer el archivo'; };
  reader.readAsDataURL(file);
}
function handleBannerFile(file) {
  if (!file) return;
  const nameLabel = document.getElementById('bannerFileName');
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('bannerUrlInput').value = '';
    updateBanner(e.target.result);
    nameLabel.textContent = `✓ ${file.name}`;
  };
  reader.onerror = () => { nameLabel.textContent = '⚠ No se pudo leer el archivo'; };
  reader.readAsDataURL(file);
}
function renderLogoIntoElement(container, value, maxSizeStyle, fallbackClass) {
  if (!container) return;
  if (!value) {
    container.innerHTML = `<span class="${fallbackClass}">${currentBrandName.toUpperCase()}</span>`;
    return;
  }
  if (/^<\?xml|^<svg/i.test(value)) {
    container.innerHTML = value;
    const svgEl = container.querySelector('svg');
    if (svgEl) {
      svgEl.setAttribute('style', maxSizeStyle);
    } else {
      container.innerHTML = `<span class="${fallbackClass}">⚠ SVG no válido</span>`;
    }
    return;
  }
  container.innerHTML = `<img src="${value}" alt="Logo partner" style="${maxSizeStyle}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'${fallbackClass}',textContent:'⚠ No se pudo cargar el logo'}))">`;
}
function renderLogoInto(containerId, value, maxSizeStyle, fallbackClass) {
  renderLogoIntoElement(document.getElementById(containerId), value, maxSizeStyle, fallbackClass);
}
function renderLogoIntoAll(className, value, maxSizeStyle, fallbackClass) {
  document.querySelectorAll('.' + className).forEach(el => renderLogoIntoElement(el, value, maxSizeStyle, fallbackClass));
}
// Logo del header: independiente del logo del footer (que suele ser una versión en negativo/blanco)
function updateLogo(input) {
  const value = (input || '').trim();
  currentLogoValue = value;
  renderLogoInto('logoContent', value, 'height:36px;width:auto;max-width:260px;display:block;object-position:left center;', 'logo-fallback');
  renderLogoInto('loginLogoContent', value, 'width:220px;height:56px;max-width:100%;object-fit:contain;object-position:left center;display:block;', 'login-logo-fallback');
  renderLogoInto('signupLogoContent', value, 'width:200px;height:52px;max-width:100%;object-fit:contain;object-position:left center;display:block;', 'login-logo-fallback');
  renderLogoInto('agencyLogoContent', value, 'width:150px;height:40px;max-width:100%;object-fit:contain;object-position:left center;display:block;', 'login-logo-fallback');
  renderLogoIntoAll('provider-logo-content', value, 'height:32px;width:auto;max-width:110px;object-fit:contain;object-position:left center;display:block;', 'logo-fallback');
  scheduleSave();
}
function updateFooterLogo(input) {
  const value = (input || '').trim();
  currentFooterLogoValue = value;
  renderLogoInto('footerLogoContent', value, 'width:200px;height:auto;max-width:200px;display:block;object-position:left center;', 'footer-logo-fallback');
  scheduleSave();
}
function updatePartnerName(name) {
  currentBrandName = (name && name.trim()) ? name.trim() : '';
  document.querySelectorAll('.brand-name').forEach(el => el.textContent = currentBrandName);
  document.title = currentBrandName ? `${currentBrandName} Rewards — Mockup` : 'Rewards — Mockup';
  // si no hay logo personalizado, refresca el texto de fallback con la nueva marca
  if (!currentLogoValue) updateLogo('');
  if (!currentFooterLogoValue) updateFooterLogo('');
  scheduleSave();
}
// El fondo se comparte entre login y sign up (mismo campo del panel)
function updateLoginBg(url) {
  currentLoginBgValue = url || '';
  ['loginBg', 'signupBg'].forEach(id => {
    const bg = document.getElementById(id);
    bg.style.backgroundImage = url ? `url('${url}')` : '';
    bg.style.backgroundSize = 'cover';
    bg.style.backgroundPosition = 'center';
  });
  scheduleSave();
}
function handleLoginBgFile(file) {
  if (!file) return;
  const nameLabel = document.getElementById('loginBgFileName');
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('loginBgUrlInput').value = '';
    updateLoginBg(e.target.result);
    nameLabel.textContent = `✓ ${file.name}`;
  };
  reader.onerror = () => { nameLabel.textContent = '⚠ No se pudo leer el archivo'; };
  reader.readAsDataURL(file);
}

function setSelectedGender(gender) {
  document.getElementById('gender-h').checked = gender === 'H';
  document.getElementById('gender-m').checked = gender === 'M';
  document.getElementById('gender-otro').checked = gender === 'otro';
}

function applyUserConfig() {
  const userConfig = mergeConfig(DEFAULT_CONFIG.user, appConfig.user || {});
  const profile = userConfig.profile || {};

  setTextContent('userChipName', userConfig.displayName);
  setTextContent('userChipSub', userConfig.agencyStatus);
  setInputValue('profileFirstName', profile.firstName);
  setInputValue('profileLastName1', profile.lastName1);
  setInputValue('profileLastName2', profile.lastName2);
  setInputValue('profileCountry', profile.country);
  setInputValue('profileProvince', profile.province);
  setInputValue('profileCity', profile.city);
  setInputValue('profilePostalCode', profile.postalCode);
  setInputValue('profileTaxId', profile.taxId);
  setInputValue('profileBirthDate', profile.birthDate);
  setInputValue('profileEmail', profile.email);
  setInputValue('profilePhone', profile.phone);
  setInputValue('profileAgency', profile.agency);
  setSelectedGender(profile.gender);
}

function applyBrandingConfig(brandingConfig) {
  const branding = mergeConfig(DEFAULT_CONFIG.branding, normalizeBrandingConfig(brandingConfig) || {});

  suspendAutoSave = true;
  setInputValue('partnerNameInput', branding.partnerName || '');
  setInputValue('primaryColorInput', branding.colors.primary);
  setInputValue('primaryColorHex', branding.colors.primary);
  setInputValue('secondaryColorInput', branding.colors.secondary);
  setInputValue('secondaryColorHex', branding.colors.secondary);
  setInputValue('footerColorInput', branding.colors.footer);
  setInputValue('footerColorHex', branding.colors.footer);
  setInputValue('logoUrlInput', branding.logo && !branding.logo.startsWith('data:') && !/^<\?xml|^<svg/i.test(branding.logo) ? branding.logo : '');
  setInputValue('footerLogoUrlInput', branding.footerLogo && !branding.footerLogo.startsWith('data:') && !/^<\?xml|^<svg/i.test(branding.footerLogo) ? branding.footerLogo : '');
  setInputValue('bannerUrlInput', branding.banner && !branding.banner.startsWith('data:') ? branding.banner : '');
  setInputValue('loginBgUrlInput', branding.loginBackground && !branding.loginBackground.startsWith('data:') ? branding.loginBackground : '');

  updateColor(colorVarMap.primary, branding.colors.primary);
  updateColor(colorVarMap.secondary, branding.colors.secondary);
  updateColor(colorVarMap.footer, branding.colors.footer);
  updatePartnerName(branding.partnerName || DEFAULT_CONFIG.branding.partnerName);
  updateLogo(branding.logo || '');
  updateFooterLogo(branding.footerLogo || '');
  updateBanner(branding.banner || '');
  updateLoginBg(branding.loginBackground || '');
  suspendAutoSave = false;
}

function applyRewardsConfig() {
  const rewardsConfig = mergeConfig(DEFAULT_CONFIG.rewards, appConfig.rewards || {});
  mockAgentPoints = Number(rewardsConfig.agentPoints) || 0;
  mockRewardMinPoints = Number.isFinite(Number(rewardsConfig.rewardMinPoints)) ? Number(rewardsConfig.rewardMinPoints) : 0;
  withholdingRatePct = Number.isFinite(Number(rewardsConfig.withholdingRatePct)) ? Number(rewardsConfig.withholdingRatePct) : 0;
  refreshBalanceDisplay();
}

// --- Login (simulado) ---
function openLogin() {
  document.getElementById('loginScreen').classList.add('open');
}
function closeLogin() {
  document.getElementById('loginScreen').classList.remove('open');
}
function handleLoginSubmit(event) {
  event.preventDefault();
  const btn = document.getElementById('loginSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Iniciando sesión...';
  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = 'Iniciar sesión';
    closeLogin();
    simulateLogin();
  }, 700);
  return false;
}

// --- Sign up (solo visual, sin registro real) ---
function openSignup() {
  closeLogin();
  document.getElementById('signupFormView').style.display = '';
  document.getElementById('signupSuccessView').style.display = 'none';
  document.getElementById('signupScreen').classList.add('open');
}
function closeSignup() {
  document.getElementById('signupScreen').classList.remove('open');
}
function showSpinner() { document.getElementById('submitSpinner').classList.add('open'); }
function hideSpinner() { document.getElementById('submitSpinner').classList.remove('open'); }
function handleSignupSubmit(event) {
  event.preventDefault();
  showSpinner();
  setTimeout(() => {
    hideSpinner();
    document.getElementById('signupFormView').style.display = 'none';
    document.getElementById('signupSuccessView').style.display = 'flex';
  }, 900);
  return false;
}

// --- Alta de agencia (diálogo, solo visual) ---
function openAgencyDialog() {
  document.getElementById('agencyFormView').style.display = '';
  document.getElementById('agencySuccessView').style.display = 'none';
  document.getElementById('agencyDialogOverlay').classList.add('open');
}
function closeAgencyDialog() {
  document.getElementById('agencyDialogOverlay').classList.remove('open');
}
function handleAgencySubmit(event) {
  event.preventDefault();
  showSpinner();
  setTimeout(() => {
    hideSpinner();
    document.getElementById('agencyFormView').style.display = 'none';
    document.getElementById('agencySuccessView').style.display = 'flex';
  }, 900);
  return false;
}
function simulateLogin() {
  document.getElementById('headerGuest').style.display = 'none';
  document.getElementById('headerLogged').style.display = 'flex';
  document.getElementById('footerNavGuest').style.display = 'none';
  document.getElementById('footerNavLogged').style.display = '';
  document.getElementById('copyrightGuest').style.display = 'none';
  document.getElementById('copyrightLogged').style.display = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  fakeToast(`Sesión iniciada (mockup) — bienvenida, ${appConfig.user.welcomeName}`);
}
function simulateLogout() {
  document.getElementById('userMenu').classList.remove('open');
  document.getElementById('headerLogged').style.display = 'none';
  document.getElementById('headerGuest').style.display = 'flex';
  document.getElementById('footerNavLogged').style.display = 'none';
  document.getElementById('footerNavGuest').style.display = '';
  document.getElementById('copyrightLogged').style.display = 'none';
  document.getElementById('copyrightGuest').style.display = '';
  showView('home');
  fakeToast('Sesión cerrada');
}
function toggleUserMenu() {
  document.getElementById('userMenu').classList.toggle('open');
}

// --- Rewards (solo visual, con simulación de canje) ---

function formatNumberEs(n) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: true }).format(n);
}
function formatCurrencyEs(n) {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(n);
}
function refreshBalanceDisplay() {
  document.getElementById('agentPointsDisplay').textContent = formatNumberEs(mockAgentPoints);
  const bookingsDisplay = document.getElementById('bookingsPointsDisplay');
  if (bookingsDisplay) bookingsDisplay.textContent = formatNumberEs(mockAgentPoints);
}
function openRewardModal() {
  if (mockAgentPoints < mockRewardMinPoints) {
    document.getElementById('rewardErrorModal').classList.add('show');
    return;
  }
  const gross = mockAgentPoints / 100;
  const withholding = Math.round(gross * withholdingRatePct * 100) / 100;
  const net = Math.round((gross - withholding) * 100) / 100;
  document.getElementById('modalPoints').textContent = formatNumberEs(mockAgentPoints);
  document.getElementById('modalGross').textContent = formatCurrencyEs(gross) + ' €.';
  document.getElementById('modalWithholding').textContent = formatCurrencyEs(withholding) + ' €';
  document.getElementById('modalNet').textContent = formatCurrencyEs(net) + ' €.';
  document.getElementById('rewardModal').classList.add('show');
}
function closeRewardModal() {
  document.getElementById('rewardModal').classList.remove('show');
}
function closeErrorModal() {
  document.getElementById('rewardErrorModal').classList.remove('show');
}
function toggleWithholdingTooltip() {
  document.getElementById('withholdingBackdrop').classList.add('show');
  document.getElementById('withholdingTooltip').classList.add('show');
}
function closeWithholdingTooltip() {
  document.getElementById('withholdingBackdrop').classList.remove('show');
  document.getElementById('withholdingTooltip').classList.remove('show');
}
function addRedemptionRow(points) {
  const tbody = document.getElementById('rewardsTableBody');
  const tr = document.createElement('tr');
  const today = new Date();
  const dateStr = String(today.getDate()).padStart(2, '0') + '/' + String(today.getMonth() + 1).padStart(2, '0') + '/' + today.getFullYear();
  tr.innerHTML = `<td data-label="Tipo de recompensa">Tarjeta amazon</td><td data-label="Solicitud">${dateStr}</td><td data-label="Estado"><span class="incidence-tag">Pendiente de validación</span></td><td data-label="Travels canjeados">${formatCurrencyEs(points)}</td>`;
  tbody.prepend(tr);
  rewardsPageIndex = 0;
  renderRewardsPagination();
}
let rewardsPageIndex = 0;
const REWARDS_PAGE_SIZE = 4;
function renderRewardsPagination() {
  const tbody = document.getElementById('rewardsTableBody');
  const rows = [...tbody.querySelectorAll('tr:not(.empty-row)')];
  tbody.querySelectorAll('.empty-row').forEach(r => r.remove());

  if (rows.length === 0) {
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    tr.innerHTML = '<td colspan="4">No hay recompensas canjeadas</td>';
    tbody.appendChild(tr);
    document.getElementById('rewardsPaginator').style.display = 'none';
    return;
  }
  document.getElementById('rewardsPaginator').style.display = '';

  const totalPages = Math.max(1, Math.ceil(rows.length / REWARDS_PAGE_SIZE));
  if (rewardsPageIndex >= totalPages) rewardsPageIndex = totalPages - 1;
  const start = rewardsPageIndex * REWARDS_PAGE_SIZE;
  const end = start + REWARDS_PAGE_SIZE;
  rows.forEach((row, i) => { row.style.display = (i >= start && i < end) ? '' : 'none'; });

  document.getElementById('rewardsPageInfo').textContent = `${rewardsPageIndex + 1} de ${totalPages}`;
  document.getElementById('rewardsPrevBtn').disabled = rewardsPageIndex === 0;
  document.getElementById('rewardsNextBtn').disabled = rewardsPageIndex >= totalPages - 1;
}
function changeRewardsPage(delta) {
  rewardsPageIndex += delta;
  renderRewardsPagination();
}
function confirmRedemption() {
  const btn = document.getElementById('confirmRedeemBtn');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = 'Procesando...';
  showSpinner();
  setTimeout(() => {
    hideSpinner();
    btn.disabled = false;
    btn.textContent = 'Confirmar';
    closeRewardModal();
    addRedemptionRow(mockAgentPoints);
    mockAgentPoints = 0;
    refreshBalanceDisplay();
    fakeToast('Recompensa canjeada correctamente (mockup)');
  }, 900);
}

// --- Reservas (solo visual) ---
let bookingsPageIndex = 0;
let bookingsPageSize = 5;
function applyBookingFilters() {
  const type = document.getElementById('filterType').value;
  const status = document.getElementById('filterStatus').value;
  document.querySelectorAll('#bookingsTableBody tr').forEach(tr => {
    const matchesType = type === 'all' || tr.dataset.type === type;
    const matchesStatus = !status || tr.dataset.status === status;
    tr.dataset.matches = (matchesType && matchesStatus) ? '1' : '0';
  });
  bookingsPageIndex = 0;
  renderBookingsPagination();
}
function renderBookingsPagination() {
  const tbody = document.getElementById('bookingsTableBody');
  const allRows = [...tbody.querySelectorAll('tr')];
  const matching = allRows.filter(tr => tr.dataset.matches !== '0');

  const totalPages = Math.max(1, Math.ceil(matching.length / bookingsPageSize));
  if (bookingsPageIndex >= totalPages) bookingsPageIndex = totalPages - 1;
  const start = bookingsPageIndex * bookingsPageSize;
  const end = start + bookingsPageSize;

  allRows.forEach(tr => { tr.style.display = 'none'; });
  matching.forEach((tr, i) => { tr.style.display = (i >= start && i < end) ? '' : 'none'; });

  document.getElementById('bookingsPageInfo').textContent = `${matching.length === 0 ? 0 : bookingsPageIndex + 1} de ${totalPages}`;
  document.getElementById('bookingsPrevBtn').disabled = bookingsPageIndex === 0;
  document.getElementById('bookingsNextBtn').disabled = bookingsPageIndex >= totalPages - 1;
}
function changeBookingsPage(delta) {
  bookingsPageIndex += delta;
  renderBookingsPagination();
}
function changeBookingsPageSize(value) {
  bookingsPageSize = parseInt(value, 10);
  bookingsPageIndex = 0;
  renderBookingsPagination();
}
function openBookingFormModal() {
  document.getElementById('bookingForm').reset();
  document.getElementById('policyFieldGroup').style.display = 'none';
  document.getElementById('bookingFormModal').classList.add('show');
}
function closeBookingFormModal() {
  document.getElementById('bookingFormModal').classList.remove('show');
}
function onProviderChange() {
  const provider = document.getElementById('bookingProvider').value;
  document.getElementById('policyFieldGroup').style.display = provider === 'Intermundial' ? 'flex' : 'none';
}
function handleBookingSubmit(event) {
  event.preventDefault();
  const provider = document.getElementById('bookingProvider').value;
  const locator = document.getElementById('bookingLocatorInput').value.trim();
  const policy = document.getElementById('bookingPolicy').value.trim();

  if (!provider || !locator) {
    fakeToast('Por favor, introduce el proveedor y el localizador.');
    return false;
  }
  if (provider === 'Intermundial' && !policy) {
    fakeToast('Por favor, introduce una póliza.');
    return false;
  }

  const providerLogos = {
    'Intermundial': 'data:image/png;base64,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',
    'dimensiones CLUB': 'data:image/png;base64,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'
  };
  let providerCell;
  if (provider === 'Soltour Rewards') {
    providerCell = '<span class="provider-logo-content"></span>';
  } else if (providerLogos[provider]) {
    providerCell = `<img class="provider-logo-img" src="${providerLogos[provider]}" alt="${provider}">`;
  } else {
    providerCell = provider;
  }

  const tbody = document.getElementById('bookingsTableBody');
  const tr = document.createElement('tr');
  tr.dataset.type = 'booking';
  tr.dataset.status = 'No aplica';
  tr.innerHTML = `<td>${locator.toUpperCase()}</td><td>${providerCell}</td><td>--</td><td>--</td><td>--</td><td><span class="neutral-tag">No aplica</span></td><td>--</td><td>--</td><td>--</td>`;
  tbody.prepend(tr);
  if (provider === 'Soltour Rewards') {
    const logoUrl = document.getElementById('logoUrlInput').value;
    renderLogoIntoElement(tr.querySelector('.provider-logo-content'), logoUrl, 'height:32px;width:auto;max-width:110px;object-fit:contain;display:block;', 'logo-fallback');
  }
  applyBookingFilters();
  closeBookingFormModal();
  fakeToast('Reserva añadida correctamente (mockup)');
  return false;
}
function openTitleTooltip() {
  document.getElementById('titleTooltipBackdrop').classList.add('show');
  document.getElementById('titleTooltipWrapper').classList.add('show');
}
function closeTitleTooltip() {
  document.getElementById('titleTooltipBackdrop').classList.remove('show');
  document.getElementById('titleTooltipWrapper').classList.remove('show');
}

function showView(view) {
  document.getElementById('homeView').style.display = view === 'home' ? '' : 'none';
  document.getElementById('rewardsView').style.display = view === 'rewards' ? '' : 'none';
  document.getElementById('reservationsView').style.display = view === 'reservations' ? '' : 'none';
  document.getElementById('consultasView').style.display = view === 'consultas' ? '' : 'none';
  document.getElementById('profileView').style.display = view === 'profile' ? '' : 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.getElementById('userMenu')?.classList.remove('open');
}
// --- Perfil de usuario (solo visual) ---
function updateProfileCompletion() {
  const fields = document.querySelectorAll('.profile-required');
  const filled = [...fields].filter(f => f.value && f.value.trim().length > 0).length;
  const pct = Math.round((filled / fields.length) * 100);
  document.getElementById('avatarRing').style.setProperty('--pct', pct);
  document.getElementById('completionText').textContent = pct + '%';
  document.getElementById('sideProgressText').textContent = pct + '%';
  document.getElementById('sideProgressFill').style.width = pct + '%';
  const msg = document.getElementById('profileMsg');
  if (pct === 100) {
    msg.innerHTML = '<i class="pi pi-check-circle"></i> Todos los campos obligatorios están completos';
    msg.classList.add('msg-ok');
  } else {
    msg.innerHTML = '<i class="pi pi-exclamation-triangle"></i> Rellena los campos obligatorios para guardar';
    msg.classList.remove('msg-ok');
  }
  renderInlineIcons();
}
function scrollToProfileSection(event, sectionId) {
  event.preventDefault();
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function handleProfileSubmit(event) {
  event.preventDefault();
  const fields = document.querySelectorAll('.profile-required');
  const allFilled = [...fields].every(f => f.value && f.value.trim().length > 0);
  if (!allFilled) {
    fakeToast('Rellena los campos obligatorios para guardar');
    return false;
  }
  const btn = document.getElementById('profileSaveBtn');
  btn.disabled = true;
  showSpinner();
  setTimeout(() => {
    hideSpinner();
    btn.disabled = false;
    fakeToast('Datos guardados correctamente (mockup)');
  }, 700);
  return false;
}
function toggleFaqCategory(btn) {
  const card = btn.closest('.faq-card');
  const open = card.classList.toggle('faq-card--open');
  btn.setAttribute('aria-expanded', open);
}
function toggleFaqItem(btn) {
  btn.closest('.faq-item').classList.toggle('faq-item--open');
}
document.addEventListener('click', (e) => {
  const chip = document.querySelector('.user-chip');
  if (chip && !chip.contains(e.target)) {
    document.getElementById('userMenu')?.classList.remove('open');
  }
});
function updateBanner(url) {
  currentBannerValue = url || '';
  const slide = document.getElementById('bannerSlide1');
  if (url) {
    slide.style.backgroundImage = `url('${url}')`;
    slide.style.backgroundSize = 'cover';
    slide.style.backgroundPosition = 'center';
    slide.textContent = '';
  } else {
    slide.style.backgroundImage = '';
    slide.textContent = 'Banner promocional 1';
  }
  scheduleSave();
}
async function resetDefaults() {
  document.getElementById('logoFileInput').value = '';
  document.getElementById('footerLogoFileInput').value = '';
  document.getElementById('bannerFileInput').value = '';
  document.getElementById('loginBgFileInput').value = '';
  document.getElementById('logoFileName').textContent = '';
  document.getElementById('footerLogoFileName').textContent = '';
  document.getElementById('bannerFileName').textContent = '';
  document.getElementById('loginBgFileName').textContent = '';
  if (!hasRemotePersistence()) {
    applyBrandingConfig(appConfig.branding);
    fakeToast('Configura la URL de npoint en config.json para poder guardar cambios compartidos');
    return;
  }
  await savePersistedState({ branding: null });
  applyBrandingConfig(appConfig.branding);
  fakeToast('Valores restablecidos en npoint');
}

// --- Persistencia de la personalización (remota por npoint) ---
let saveTimer;
function scheduleSave() {
  if (suspendAutoSave) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveConfigToStorage(); }, 700);
}
function flushPendingSave() {
  if (suspendAutoSave) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  void saveConfigToStorage();
}
async function saveConfigToStorage() {
  const cfg = {
    partnerName: document.getElementById('partnerNameInput').value || '',
    colors: {
      primary: document.getElementById('primaryColorHex').value || appConfig.branding?.colors?.primary || '',
      secondary: document.getElementById('secondaryColorHex').value || appConfig.branding?.colors?.secondary || '',
      footer: document.getElementById('footerColorHex').value || appConfig.branding?.colors?.footer || ''
    },
    logo: currentLogoValue,
    footerLogo: currentFooterLogoValue,
    banner: currentBannerValue,
    loginBackground: currentLoginBgValue
  };

  if (!hasRemotePersistence()) {
    return;
  }

  const ok = await savePersistedState({ branding: cfg });
  if (!ok) {
    fakeToast('No se pudo guardar la personalización en npoint');
  }
}
async function loadConfigFromStorage(state = null) {
  const activeState = state || await loadPersistedState();
  const storedBranding = activeState.branding;
  const activeBranding = storedBranding && Object.keys(storedBranding).length > 0
    ? mergeConfig(appConfig.branding, storedBranding)
    : appConfig.branding;

  applyBrandingConfig(activeBranding);
}

function setFooterYears() {
  const year = new Date().getFullYear();
  document.getElementById('footerYear').textContent = year;
  document.getElementById('footerYearLogged').textContent = year;
}
// --- Iconos SVG inline (sin depender de ningún CDN externo) ---
const ICONS = {
  'pi-info-circle': '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.5"/><circle cx="12" cy="7.5" r="0.9" fill="currentColor" stroke="none"/>',
  'pi-chevron-down': '<polyline points="5,8.5 12,15.5 19,8.5"/>',
  'pi-book': '<path d="M4 5.5c2-1 5-1.2 8 0v13c-3-1.2-6-1-8 0z"/><path d="M20 5.5c-2-1-5-1.2-8 0v13c3-1.2 6-1 8 0z"/>',
  'pi-pencil': '<path d="M4 20l1-4.5L16 4.5a2 2 0 0 1 3 3L8 18.5z"/><line x1="14" y1="6.5" x2="17.5" y2="10"/>',
  'pi-check-circle': '<circle cx="12" cy="12" r="9"/><polyline points="8,12.5 11,15.5 16.5,9"/>',
  'pi-gift': '<rect x="4" y="10" width="16" height="10" rx="1"/><line x1="4" y1="14.5" x2="20" y2="14.5"/><line x1="12" y1="10" x2="12" y2="20"/><path d="M12 10C10 6 5 6.5 6 9.5c.6 1.6 4 1.3 6 .5"/><path d="M12 10c2-4 7-3.5 6-.5-.6 1.6-4 1.3-6 .5"/>',
  'pi-calendar': '<rect x="4" y="5.5" width="16" height="15" rx="1.5"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="8" y1="3.5" x2="8" y2="7.5"/><line x1="16" y1="3.5" x2="16" y2="7.5"/>',
  'pi-users': '<circle cx="8.5" cy="8.5" r="3"/><path d="M2.8 19c.6-3.4 3-5 5.7-5s5.1 1.6 5.7 5"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M15 14.2c2.2.2 4 1.6 4.5 4.3"/>',
  'pi-user': '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1-4.2 4-6.2 7.5-6.2s6.5 2 7.5 6.2"/>',
  'pi-id-card': '<rect x="3" y="5.5" width="18" height="13" rx="1.5"/><circle cx="8.5" cy="11" r="1.8"/><path d="M5.7 15.3c.4-1.6 1.6-2.4 2.8-2.4s2.4.8 2.8 2.4"/><line x1="14" y1="9.5" x2="18" y2="9.5"/><line x1="14" y1="13" x2="18" y2="13"/>',
  'pi-phone': '<path d="M6 4.5c1.5-.4 2 0 2.4.8l1 2.2c.3.7.1 1.3-.4 1.8l-1 1c1 2.3 2.4 3.7 4.7 4.7l1-1c.5-.5 1.1-.7 1.8-.4l2.2 1c.8.4 1.2.9.8 2.4-.4 1.6-1.5 2.3-3 2.1-5-.7-9.6-5.3-10.3-10.3-.2-1.5.5-2.6 2.1-3z"/>',
  'pi-briefcase': '<rect x="3" y="8" width="18" height="11" rx="1.5"/><path d="M8.5 8V6a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 6v2"/><line x1="3" y1="13" x2="21" y2="13"/><line x1="11.3" y1="13" x2="12.7" y2="13"/>',
  'pi-exclamation-triangle': '<path d="M12 4.5 21 19.5H3z"/><line x1="12" y1="10" x2="12" y2="14.5"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/>',
  'pi-sign-out': '<path d="M13 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H13"/><line x1="10" y1="12" x2="20" y2="12"/><polyline points="16.5,8.5 20,12 16.5,15.5"/>',
  'pi-send': '<line x1="21" y1="3" x2="10.5" y2="13.5"/><path d="M21 3 14.5 21 10.5 13.5 3 9.5Z"/>'
};
function renderInlineIcons() {
  document.querySelectorAll('i.pi').forEach(el => {
    if (el.querySelector('svg')) return;
    const iconClass = [...el.classList].find(c => ICONS[c]);
    if (!iconClass) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '1em');
    svg.setAttribute('height', '1em');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.style.verticalAlign = '-0.125em';
    svg.style.flexShrink = '0';
    svg.innerHTML = ICONS[iconClass];
    el.appendChild(svg);
  });
}

// --- Catálogo de recompensas ---
const CDN_CLUB = 'https://cdn.rewards.lastcalltour.com/production/';
const CARD_LOGOS = {
  elCorteIngles: 'fd8b54cc-f14f-421c-86aa-074cff5688b0.png',
  moeve: 'c04f7b80-1b36-4f17-a774-10b54a6ad043.png',
  decathlon: '19afb5d7-9207-42da-99c7-6c0570fc9010.png',
  netflix: '3c40a13c-7c7b-458b-9f24-26339238ae8d.png',
  carrefour: 'e0ca47ef-657b-4ddd-b7da-62170dce99c7.png',
  ikea: 'b7ad3570-ea2f-45b6-8a2e-f203641f83ec.png',
  primark: '34d2b946-9eba-4e8f-a271-c478ec08885e.png',
  nike: 'b3c64ed3-b88d-4543-95f4-50d5f244ef3f.png',
  cinesa: '7c087e3a-c5fc-461e-9450-c81089784f3e.png',
  ticketmaster: 'f7224443-5968-46b3-98b2-e46de166a35d.png',
  uber: 'a8360140-0ba8-4d2f-864e-f0be23faacd2.png',
  theFork: '31fdec23-2156-4b5e-a64e-34aa62754ba5.png',
  mediaMarkt: 'b1efa492-9c83-437e-83a2-74e6f9f40203.png',
  apple: 'cdd1617e-3718-418c-8108-68dfb83f24e1.png',
  spotify: 'b6479830-5a07-4678-9c28-01142967f60e.png',
  disney: '9f90f92d-de6e-42b0-9ac4-84e76e843e6f.png',
  amazon: '1e4a2673-03c0-4228-a757-f14142e54894.png'
};
function logoUrl(key) { return CDN_CLUB + CARD_LOGOS[key]; }
const REWARD_CATEGORIES = [
  {
    id: 'todo', label: 'Todos',
    rewards: [
      { name: 'Amazon', label: 'Compras', imageUrl: logoUrl('amazon') },
      { name: 'moeve', label: 'Gasolineras', imageUrl: logoUrl('moeve') },
      { name: 'Carrefour', label: 'Supermercados', imageUrl: logoUrl('carrefour') },
      { name: 'Decathlon', label: 'Deporte', imageUrl: logoUrl('decathlon') },
      { name: 'Netflix', label: 'Streaming', imageUrl: logoUrl('netflix') }
    ]
  },
  {
    id: 'compras-familia', label: 'Compras y familia',
    rewards: [
      { name: 'El Corte Inglés', label: 'Compras', imageUrl: logoUrl('elCorteIngles') },
      { name: 'moeve', label: 'Gasolineras', imageUrl: logoUrl('moeve') },
      { name: 'IKEA', label: 'Hogar', imageUrl: logoUrl('ikea') },
      { name: 'Primark', label: 'Moda', imageUrl: logoUrl('primark') },
      { name: 'Nike', label: 'Deporte y moda', imageUrl: logoUrl('nike') }
    ]
  },
  {
    id: 'ocio', label: 'Ocio',
    rewards: [
      { name: 'Decathlon', label: 'Deporte', imageUrl: logoUrl('decathlon') },
      { name: 'Cinesa', label: 'Cine', imageUrl: logoUrl('cinesa') },
      { name: 'Ticketmaster', label: 'Espectáculos', imageUrl: logoUrl('ticketmaster') },
      { name: 'Uber', label: 'Movilidad', imageUrl: logoUrl('uber') },
      { name: 'TheFork', label: 'Restaurantes', imageUrl: logoUrl('theFork') }
    ]
  },
  {
    id: 'tecnologia-streaming', label: 'Tecnología y streaming',
    rewards: [
      { name: 'MediaMarkt', label: 'Tecnología', imageUrl: logoUrl('mediaMarkt') },
      { name: 'Netflix', label: 'Streaming', imageUrl: logoUrl('netflix') },
      { name: 'Apple', label: 'Tecnología', imageUrl: logoUrl('apple') },
      { name: 'Spotify', label: 'Música', imageUrl: logoUrl('spotify') },
      { name: 'Disney', label: 'Streaming', imageUrl: logoUrl('disney') }
    ]
  }
];
let selectedCatalogCategory = REWARD_CATEGORIES[0];

function renderCatalogFilters() {
  const container = document.getElementById('catalogFilters');
  container.innerHTML = REWARD_CATEGORIES.map(cat =>
    `<button type="button" class="chip${cat.id === selectedCatalogCategory.id ? ' is-active' : ''}" data-cat="${cat.id}" aria-pressed="${cat.id === selectedCatalogCategory.id}">${cat.label}</button>`
  ).join('');
  container.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => selectCatalogCategory(btn.dataset.cat));
  });
}
function renderCatalogGrid() {
  const grid = document.getElementById('catalogGrid');
  const cardsHtml = selectedCatalogCategory.rewards.map(r =>
    `<li class="reward-card"><img src="${r.imageUrl}" alt="${r.name}" class="reward-image"><span class="reward-label">${r.label}</span></li>`
  ).join('');
  grid.innerHTML = cardsHtml + `
      <li class="reward-card reward-card--all">
        <a class="reward-link" href="https://cdn.rewards.lastcalltour.com/production/f55d15ea-0fa1-4180-b401-7d87e59bd7a9.pdf" target="_blank" rel="noopener noreferrer">
          <svg class="reward-pdf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
          <span class="reward-name">+50 comercios</span>
          <span class="reward-label">Y seguimos sumando</span>
        </a>
      </li>`;
  document.getElementById('catalogSrStatus').textContent = `Mostrando ${selectedCatalogCategory.rewards.length} marcas de ${selectedCatalogCategory.label}.`;
}
function selectCatalogCategory(id) {
  const cat = REWARD_CATEGORIES.find(c => c.id === id);
  if (!cat) return;
  selectedCatalogCategory = cat;
  renderCatalogFilters();
  renderCatalogGrid();
}

async function initializeApp() {
  appConfig = await loadAppConfig();
  storageConfig = mergeConfig(DEFAULT_CONFIG.storage, appConfig.storage || {});
  const remoteState = await loadPersistedState();
  appConfig = mergeRemoteStateIntoAppConfig(remoteState);
  applyUserConfig();
  applyRewardsConfig();
  await loadConfigFromStorage(remoteState);
  setFooterYears();
  renderInlineIcons();
  updateProfileCompletion();
  renderCatalogFilters();
  renderCatalogGrid();
  renderRewardsPagination();
  applyBookingFilters();
}

initializeApp();

// cerrar modal al clicar fuera
document.getElementById('loginScreen').addEventListener('click', (e) => {
  if (e.target.id === 'loginScreen') closeLogin();
});
document.getElementById('signupScreen').addEventListener('click', (e) => {
  if (e.target.id === 'signupScreen') closeSignup();
});
document.getElementById('agencyDialogOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'agencyDialogOverlay') closeAgencyDialog();
});
document.getElementById('rewardModal').addEventListener('click', (e) => {
  if (e.target.id === 'rewardModal') closeRewardModal();
});
document.getElementById('rewardErrorModal').addEventListener('click', (e) => {
  if (e.target.id === 'rewardErrorModal') closeErrorModal();
});
document.getElementById('bookingFormModal').addEventListener('click', (e) => {
  if (e.target.id === 'bookingFormModal') closeBookingFormModal();
});
document.getElementById('passwordModal').addEventListener('click', (e) => {
  if (e.target.id === 'passwordModal') closePasswordModal();
});