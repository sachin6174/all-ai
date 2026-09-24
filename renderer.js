const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// ===================================================================
// Sites Configuration (loaded from sites.json via IPC)
// ===================================================================
let sitesConfig = []; // Populated at startup from sites.json

// State Management
let currentState = {
  activeTab: 'dashboard',
  layout: '2x3',
  geminiAuthUser: '0', // Current active Google account index for Gemini
  themeAccent: '#5b5df8',
  themeGlow: 'rgba(91, 93, 248, 0.35)',
  broadcastHistory: [],
  promptsHistory: [],
  enabledModels: {}
};

let historyIndex = -1;

// DOM References
const sidebarNav = document.querySelector('.sidebar-nav');
const webviewContainer = document.getElementById('webview-container');
const settingsPane = document.getElementById('settings-pane');
const broadcastPanel = document.getElementById('broadcast-panel');
const broadcastInput = document.getElementById('broadcast-input');
const broadcastSendBtn = document.getElementById('broadcast-send-btn');
const broadcastStatus = document.getElementById('broadcast-status');
const activeIndicatorsTray = document.getElementById('active-indicators-tray');
const mainWorkspace = document.querySelector('.main-workspace');
const geminiAuthUserSelect = document.getElementById('select-gemini-authuser');


// ===================================================================
// Dynamic UI Generation from sites.json
// ===================================================================

// Build all dynamic DOM elements from the sites config array
function buildDynamicUI(sites) {
  buildSidebarNav(sites);
  buildWebviewCards(sites);
  buildSettingsToggles(sites);
  buildSessionResets(sites);
  buildTrayBadges(sites);
}

// 1. Build sidebar nav items
function buildSidebarNav(sites) {
  const aiContainer = document.getElementById('dynamic-nav-items');
  const utilContainer = document.getElementById('dynamic-utility-nav-items');
  if (aiContainer) aiContainer.innerHTML = '';
  if (utilContainer) utilContainer.innerHTML = '';

  sites.forEach(site => {
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.setAttribute('data-tab', site.id);
    btn.title = site.name;
    btn.innerHTML = `
      <span class="nav-icon" style="color: ${safeColor(site.color)}; font-size: 18px; width: 20px; text-align: center;">${escapeHtml(site.icon)}</span>
      <span class="nav-label">${escapeHtml(site.name)}</span>
      <span class="nav-status-dot" id="dot-${escapeHtml(site.id)}"></span>
    `;

    // Add sidebar toggle checkbox for AI sites (not utilities)
    if (site.category === 'ai') {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'sidebar-toggle-check';
      checkbox.title = 'Show/hide on Dashboard';
      checkbox.checked = currentState.enabledModels[site.id] !== false;
      
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      checkbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        toggleModelEnabled(site.id, isChecked);
      });

      btn.appendChild(checkbox);
    }

    // Click to switch tab
    btn.addEventListener('click', () => {
      switchTab(site.id);
    });

    if (site.category === 'utility') {
      if (utilContainer) utilContainer.appendChild(btn);
    } else {
      if (aiContainer) aiContainer.appendChild(btn);
    }
  });
}

// Resolve the src URL for a site (handles Gemini's authuser special case)
function getSiteSrcUrl(site) {
  if (site.id === 'gemini') {
    return `https://gemini.google.com/app?authuser=${encodeURIComponent(currentState.geminiAuthUser)}`;
  }
  return site.url;
}

/* =================================================================
   FEATURE: Lazy + Staggered Webview Loading
   Webview elements (and their guest renderer processes) are only created
   when a site is actually needed. Enabled channels are loaded a couple at a
   time at startup instead of all at once, so the first channels become
   usable much faster and the machine isn't flooded with parallel page loads.
================================================================= */
const LOAD_CONCURRENCY = 2;
const LOAD_SLOT_TIMEOUT_MS = 8000;
const loadQueue = [];
let activeLoads = 0;
const pendingInjections = {}; // siteId -> code to run once the guest is dom-ready
const webviewZoomLevels = {};  // siteId -> zoom factor

function getWebview(siteId) {
  return document.getElementById(`wv-${siteId}`);
}

function isWebviewReady(webview) {
  return !!webview && webview.dataset.ready === 'true';
}

// Create the <webview> for a site (if missing) and start navigating it.
function ensureWebviewLoaded(siteId) {
  const queued = loadQueue.indexOf(siteId);
  if (queued > -1) loadQueue.splice(queued, 1);
  if (getWebview(siteId)) return getWebview(siteId);

  const site = sitesConfig.find(s => s.id === siteId);
  const card = document.getElementById(`card-${siteId}`);
  if (!site || !card) return null;

  const wrapper = card.querySelector('.webview-wrapper');
  const loader = card.querySelector('.loader-overlay');
  if (loader) {
    loader.classList.remove('hidden');
    const loaderText = loader.querySelector('span');
    if (loaderText) loaderText.textContent = `Connecting to ${site.name}...`;
  }

  const webview = document.createElement('webview');
  webview.id = `wv-${siteId}`;
  webview.setAttribute('allowpopups', '');
  webview.setAttribute('partition', 'persist:omniai_session');
  attachWebviewEvents(site, webview, card);
  webview.setAttribute('src', getSiteSrcUrl(site));
  wrapper.insertBefore(webview, loader);
  return webview;
}

// Queue a site for background loading (used for startup)
function scheduleWebviewLoad(siteId) {
  if (getWebview(siteId) || loadQueue.includes(siteId)) return;
  loadQueue.push(siteId);
  pumpLoadQueue();
}

function pumpLoadQueue() {
  while (activeLoads < LOAD_CONCURRENCY && loadQueue.length > 0) {
    const siteId = loadQueue.shift();
    if (currentState.enabledModels[siteId] === false || getWebview(siteId)) continue;
    const webview = ensureWebviewLoaded(siteId);
    if (!webview) continue;

    activeLoads++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      activeLoads--;
      pumpLoadQueue();
    };
    webview.addEventListener('dom-ready', release, { once: true });
    webview.addEventListener('destroyed', release, { once: true });
    setTimeout(release, LOAD_SLOT_TIMEOUT_MS);
  }
}

// Remove a webview entirely - this destroys its guest process and frees all
// of its memory, rather than just hiding it with CSS.
function unloadWebview(siteId) {
  const queued = loadQueue.indexOf(siteId);
  if (queued > -1) loadQueue.splice(queued, 1);
  delete pendingInjections[siteId];

  const webview = getWebview(siteId);
  if (!webview) return;
  webview.dispatchEvent(new Event('destroyed'));
  webview.remove();

  const dot = document.getElementById(`dot-${siteId}`);
  if (dot) dot.className = 'nav-status-dot';
  const card = document.getElementById(`card-${siteId}`);
  const loader = card ? card.querySelector('.loader-overlay') : null;
  if (loader) loader.classList.remove('hidden');
}

// 2. Build webview cards
function buildWebviewCards(sites) {
  // Preserve the Workspace Monitor widget
  const widgetCard = document.getElementById('card-workspace-monitor');

  // Remove all existing dynamic cards (everything except the widget)
  const existingCards = webviewContainer.querySelectorAll('.webview-card:not(#card-workspace-monitor)');
  existingCards.forEach(card => card.remove());

  sites.forEach(site => {
    const card = document.createElement('div');
    card.className = `webview-card active${site.category === 'utility' ? ' card-utility' : ''}`;
    card.id = `card-${site.id}`;
    card.setAttribute('data-model', site.id);

    // Card header with action buttons
    const actionButtons = `
      <button class="action-btn btn-back" title="Back"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
      <button class="action-btn btn-forward" title="Forward"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
      <button class="action-btn btn-reload" title="Reload"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg></button>
      <button class="action-btn btn-focus" title="Focus Single Tab"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path></svg></button>
      <button class="action-btn btn-zoom-in" title="Zoom In"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg></button>
      <button class="action-btn btn-zoom-out" title="Zoom Out"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg></button>
    `;

    // The <webview> itself is created lazily by ensureWebviewLoaded() - see
    // FEATURE: Lazy + Staggered Webview Loading.
    card.innerHTML = `
      <div class="card-header">
        <div class="model-info"><span class="status-indicator"></span><span class="model-name">${escapeHtml(site.name)}</span></div>
        <div class="card-actions">${actionButtons}</div>
      </div>
      <div class="webview-wrapper">
        <div class="loader-overlay"><div class="spinner"></div><span>Waiting to connect to ${escapeHtml(site.name)}...</span></div>
      </div>
    `;
    attachCardControls(site, card);

    // Insert before the widget card (so widget stays at end)
    if (widgetCard) {
      webviewContainer.insertBefore(card, widgetCard);
    } else {
      webviewContainer.appendChild(card);
    }
  });
}

// 3. Build settings toggles
function buildSettingsToggles(sites) {
  const container = document.getElementById('dynamic-service-toggles');
  if (!container) return;
  container.innerHTML = '';

  // Only AI sites get toggles
  sites.filter(s => s.category === 'ai').forEach(site => {
    const label = document.createElement('label');
    label.className = 'toggle-control';
    label.innerHTML = `
      <input type="checkbox" id="toggle-${escapeHtml(site.id)}" ${currentState.enabledModels[site.id] !== false ? 'checked' : ''}>
      <span class="toggle-label">${escapeHtml(site.name)}</span>
    `;
    
    const checkbox = label.querySelector('input');
    checkbox.addEventListener('change', (e) => {
      toggleModelEnabled(site.id, e.target.checked);
    });

    container.appendChild(label);
  });
}

// 4. Build session reset buttons
function buildSessionResets(sites) {
  const container = document.getElementById('dynamic-session-resets');
  if (!container) return;
  container.innerHTML = '';

  sites.forEach(site => {
    const row = document.createElement('div');
    row.className = 'session-row';

    // Extract origin from URL
    let origin = '';
    try {
      const u = new URL(site.url);
      origin = u.origin;
    } catch (e) {
      origin = site.url;
    }

    row.innerHTML = `
      <span>${escapeHtml(site.name)}</span>
      <button class="btn btn-danger" data-clear="${escapeHtml(site.id)}" data-origin="${escapeHtml(origin)}">Reset ${escapeHtml(site.name)}</button>
    `;
    container.appendChild(row);
  });

  // Add "Reset All" row
  const allRow = document.createElement('div');
  allRow.className = 'session-row';
  allRow.innerHTML = `
    <span><strong>Reset All Sessions</strong></span>
    <button class="btn btn-danger" data-clear="all">Reset All Sessions</button>
  `;
  container.appendChild(allRow);

  // Attach event listeners to the newly created buttons
  container.querySelectorAll('.btn-danger[data-clear]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const clearTarget = btn.getAttribute('data-clear');
      const origin = btn.getAttribute('data-origin');
      const originalText = btn.textContent;
      
      let confirmMsg = '';
      if (clearTarget === 'all') {
        confirmMsg = 'Are you sure you want to reset ALL sessions and caches? This logs you out of everything.';
      } else {
        confirmMsg = `Are you sure you want to clear storage and log out of ${originalText.replace('Reset ', '')}?`;
      }

      const confirmReset = confirm(confirmMsg);
      if (confirmReset) {
        btn.disabled = true;
        btn.textContent = 'Clearing...';
        
        let result;
        if (clearTarget === 'all') {
          result = await ipcRenderer.invoke('clear-session', { partition: 'persist:omniai_session' });
        } else {
          result = await ipcRenderer.invoke('clear-session', { 
            partition: 'persist:omniai_session', 
            origin: origin 
          });
        }
        
        if (result && result.success) {
          alert(`Session cleared successfully. Reloading view...`);
          if (clearTarget === 'all') {
            // Only reload webviews that actually have content loaded
            document.querySelectorAll('webview').forEach(wv => wv.reload());
          } else {
            const wv = getWebview(clearTarget);
            if (wv) wv.reload();
          }
        } else {
          alert(`Failed to clear session: ${result.error || 'Unknown error'}`);
        }
        
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });
}

// 5. Build broadcast tray badges
function buildTrayBadges(sites) {
  if (!activeIndicatorsTray) return;
  activeIndicatorsTray.innerHTML = '';

  // Only AI sites get badges
  sites.filter(s => s.category === 'ai').forEach(site => {
    const badge = document.createElement('span');
    badge.className = `tray-badge${currentState.enabledModels[site.id] !== false ? ' active' : ''}`;
    badge.setAttribute('data-indicator', site.id);
    badge.textContent = site.trayLabel;
    activeIndicatorsTray.appendChild(badge);
  });
}


// ===================================================================
// Unified toggle for enabling/disabling a model
// ===================================================================
function toggleModelEnabled(modelId, isEnabled) {
  currentState.enabledModels[modelId] = isEnabled;

  // MEMORY OPTIMIZATION: actually load/unload the webview's content, not just
  // hide it with CSS - this is what makes disabling a model reclaim memory.
  if (isEnabled) {
    ensureWebviewLoaded(modelId);
  } else {
    unloadWebview(modelId);
  }

  // Update Card visibility (the focused card stays visible in single-focus view)
  const card = document.getElementById(`card-${modelId}`);
  if (card && !card.classList.contains('card-utility')) {
    card.classList.toggle('card-disabled', !isEnabled && currentState.activeTab !== modelId);
  }

  // Update Nav status dot
  const dot = document.getElementById(`dot-${modelId}`);
  const navBtn = document.querySelector(`.nav-item[data-tab="${modelId}"]`);
  const sidebarCheck = navBtn ? navBtn.querySelector('.sidebar-toggle-check') : null;

  if (isEnabled) {
    if (dot) dot.classList.add('active');
    if (navBtn) navBtn.style.opacity = '1';
    if (sidebarCheck) sidebarCheck.checked = true;
  } else {
    if (dot) dot.classList.remove('active');
    if (navBtn) navBtn.style.opacity = '0.5';
    if (sidebarCheck) sidebarCheck.checked = false;
  }

  // Update Settings toggle
  const settingsCheckbox = document.getElementById(`toggle-${modelId}`);
  if (settingsCheckbox) settingsCheckbox.checked = isEnabled;

  // Update Tray Badge
  const trayBadge = document.querySelector(`.tray-badge[data-indicator="${modelId}"]`);
  if (trayBadge) {
    if (isEnabled) trayBadge.classList.add('active');
    else trayBadge.classList.remove('active');
  }

  saveConfig();
  updateWorkspaceWidget();
}


// ===================================================================
// Config persistence
// ===================================================================

// Load configurations from local storage
function loadConfig() {
  const savedState = localStorage.getItem('omni_ai_state');
  if (savedState) {
    try {
      const parsed = JSON.parse(savedState);
      
      // Merge enabledModels object to prevent newly added models from being missing/undefined
      const loadedEnabledModels = parsed.enabledModels || {};
      delete parsed.enabledModels;
      
      currentState = { ...currentState, ...parsed };
      currentState.enabledModels = { ...currentState.enabledModels, ...loadedEnabledModels };
      
      if (!Array.isArray(currentState.promptsHistory)) currentState.promptsHistory = [];
      if (!Array.isArray(currentState.broadcastHistory)) currentState.broadcastHistory = [];
    } catch (e) {
      console.error('Error loading config:', e);
    }
  }
}

// Save configurations to local storage
function saveConfig() {
  localStorage.setItem('omni_ai_state', JSON.stringify({
    layout: currentState.layout,
    geminiAuthUser: currentState.geminiAuthUser,
    themeAccent: currentState.themeAccent,
    themeGlow: currentState.themeGlow,
    broadcastHistory: currentState.broadcastHistory,
    promptsHistory: currentState.promptsHistory,
    enabledModels: currentState.enabledModels
  }));
}

// Populate the default enabledModels from sites config
function initEnabledModelsFromSites(sites) {
  // Create defaults from sites.json for any model not yet in saved state
  sites.forEach(site => {
    if (currentState.enabledModels[site.id] === undefined) {
      currentState.enabledModels[site.id] = site.enabled;
    }
  });

  // Legacy: 'you' used to be force-enabled for the Workspace Monitor widget,
  // which collided with the You.com site id. Drop it (You.com is now 'youcom').
  delete currentState.enabledModels['you'];
}


// ===================================================================
// Initialize the application UI based on current configurations
// ===================================================================
function initUI() {
  // 0. Apply Theme Accent & Glow
  document.documentElement.style.setProperty('--accent-color', currentState.themeAccent);
  document.documentElement.style.setProperty('--accent-glow', currentState.themeGlow);
  
  // Highlight active theme color button in settings
  document.querySelectorAll('.accent-color-btn').forEach(btn => {
    if (btn.getAttribute('data-accent') === currentState.themeAccent) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // 1. Setup Layout
  updateLayoutClass(currentState.layout);
  
  // Highlight active layout button in settings
  document.querySelectorAll('.layout-btn').forEach(btn => {
    if (btn.getAttribute('data-layout') === currentState.layout) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // 2. Setup Gemini authuser select (webview src is already set correctly by
  // buildWebviewCards() using currentState.geminiAuthUser - no need to redo it here)
  if (geminiAuthUserSelect) {
    geminiAuthUserSelect.value = currentState.geminiAuthUser;
  }

  // 3. Apply enabled/disabled state to all dynamically created elements
  sitesConfig.forEach(site => {
    const isEnabled = currentState.enabledModels[site.id] !== false;
    
    // Card visibility
    const card = document.getElementById(`card-${site.id}`);
    if (card && !card.classList.contains('card-utility')) {
      if (isEnabled) card.classList.remove('card-disabled');
      else card.classList.add('card-disabled');
    }

    // Nav dot and opacity
    const navBtn = document.querySelector(`.nav-item[data-tab="${site.id}"]`);
    const dot = document.getElementById(`dot-${site.id}`);
    if (isEnabled) {
      if (dot) dot.classList.add('active');
      if (navBtn) navBtn.style.opacity = '1';
    } else {
      if (dot) dot.classList.remove('active');
      if (navBtn) navBtn.style.opacity = '0.5';
    }
  });

  // 4. Setup active tab
  switchTab(currentState.activeTab);

  // 5. Start loading enabled AI channels in the background, a few at a time,
  // in sidebar (popularity) order
  sitesConfig.forEach(site => {
    if (site.category === 'ai' && currentState.enabledModels[site.id] !== false) {
      scheduleWebviewLoad(site.id);
    }
  });

  // 6. Update workspace monitor widget
  updateWorkspaceWidget();
}


// Switch navigation tabs (Dashboard, Google, Gemini, ChatGPT, etc.)
function switchTab(tabId) {
  currentState.activeTab = tabId;
  
  // Update sidebar active states
  document.querySelectorAll('.nav-item').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Reset workspace focus states (and re-hide disabled models that were
  // temporarily shown while focused)
  mainWorkspace.classList.remove('single-focus-active');
  document.querySelectorAll('.webview-card').forEach(card => {
    card.classList.remove('focus-target');
    const model = card.getAttribute('data-model');
    if (model && sitesConfig.some(s => s.id === model && s.category === 'ai')) {
      card.classList.toggle('card-disabled', currentState.enabledModels[model] === false);
    }
  });

  const promptsHistoryPane = document.getElementById('prompts-history-pane');

  if (tabId === 'dashboard') {
    // Show Dashboard view
    webviewContainer.classList.remove('hidden');
    settingsPane.classList.add('hidden');
    if (promptsHistoryPane) promptsHistoryPane.classList.add('hidden');
    broadcastPanel.classList.remove('hidden');
    
    // Reset layout configuration grid classes
    updateLayoutClass(currentState.layout);
  } else if (tabId === 'settings') {
    // Show Settings view
    webviewContainer.classList.add('hidden');
    settingsPane.classList.remove('hidden');
    if (promptsHistoryPane) promptsHistoryPane.classList.add('hidden');
    broadcastPanel.classList.add('hidden');
  } else if (tabId === 'prompts-history') {
    // Show Prompts History view
    webviewContainer.classList.add('hidden');
    settingsPane.classList.add('hidden');
    if (promptsHistoryPane) promptsHistoryPane.classList.remove('hidden');
    broadcastPanel.classList.add('hidden');
    renderPromptsHistory();
  } else {
    // Single Focused Tab (e.g. Gemini, Google Account Manager, etc.)
    webviewContainer.classList.remove('hidden');
    settingsPane.classList.add('hidden');
    if (promptsHistoryPane) promptsHistoryPane.classList.add('hidden');
    broadcastPanel.classList.add('hidden'); // Hide broadcast during single focus

    // Focus target card
    mainWorkspace.classList.add('single-focus-active');
    const targetCard = document.getElementById(`card-${tabId}`);
    if (targetCard) {
      targetCard.classList.add('focus-target');
      // Ensure target is not hidden by dashboard toggles
      targetCard.classList.remove('card-disabled');
      // Load it right away if it hasn't been loaded yet (utility site, disabled
      // model, or still waiting in the startup queue)
      if (tabId !== 'workspace-monitor') ensureWebviewLoaded(tabId);
    }
  }
}

// Update dashboard layout class names
function updateLayoutClass(layoutName) {
  webviewContainer.className = 'dashboard-grid'; // Reset
  
  switch(layoutName) {
    case '2x3':
      webviewContainer.classList.add('layout-2x3');
      break;
    case '2x2':
      webviewContainer.classList.add('layout-2x2');
      break;
    case 'col-3':
      webviewContainer.classList.add('layout-col-3');
      break;
    case 'col-2':
      webviewContainer.classList.add('layout-col-2');
      break;
    case 'col-1':
      webviewContainer.classList.add('layout-col-1');
      break;
    default:
      webviewContainer.classList.add('layout-2x3');
  }
}

// Card header controls (back/forward/reload/focus/zoom). They look up the
// webview at click time because it is created lazily.
function attachCardControls(site, card) {
  const withWebview = (fn) => () => {
    const webview = getWebview(site.id);
    if (isWebviewReady(webview)) fn(webview);
  };

  card.querySelector('.btn-back')?.addEventListener('click', withWebview(wv => {
    if (wv.canGoBack()) wv.goBack();
  }));
  card.querySelector('.btn-forward')?.addEventListener('click', withWebview(wv => {
    if (wv.canGoForward()) wv.goForward();
  }));
  card.querySelector('.btn-reload')?.addEventListener('click', () => {
    const webview = getWebview(site.id);
    if (webview) webview.reload();
    else ensureWebviewLoaded(site.id);
  });
  card.querySelector('.btn-focus')?.addEventListener('click', () => {
    switchTab(currentState.activeTab === site.id ? 'dashboard' : site.id);
  });

  const applyZoom = (delta) => withWebview(wv => {
    webviewZoomLevels[site.id] = Math.min(3.0, Math.max(0.3, (webviewZoomLevels[site.id] || 1.0) + delta));
    wv.setZoomFactor(webviewZoomLevels[site.id]);
  })();
  card.querySelector('.btn-zoom-in')?.addEventListener('click', (e) => { e.stopPropagation(); applyZoom(0.1); });
  card.querySelector('.btn-zoom-out')?.addEventListener('click', (e) => { e.stopPropagation(); applyZoom(-0.1); });
}

// Lifecycle events for a freshly created webview
function attachWebviewEvents(site, webview, card) {
  const loader = card.querySelector('.loader-overlay');
  const loaderText = loader ? loader.querySelector('span') : null;
  const statusIndicator = card.querySelector('.status-indicator');
  const dot = document.getElementById(`dot-${site.id}`);

  const setStatus = (state) => {
    if (dot) dot.className = `nav-status-dot ${state}`;
    if (statusIndicator) statusIndicator.className = `status-indicator ${state === 'active' ? 'ready' : state}`;
  };

  webview.addEventListener('did-start-loading', () => setStatus('loading'));

  webview.addEventListener('did-stop-loading', () => {
    if (loader) loader.classList.add('hidden');
    setStatus('active');
  });

  webview.addEventListener('dom-ready', () => {
    webview.dataset.ready = 'true';
    if (loader) loader.classList.add('hidden');
    setStatus('active');

    if (webviewZoomLevels[site.id]) webview.setZoomFactor(webviewZoomLevels[site.id]);

    // Inject text monitor script if not a utility card (like Google Sign-in)
    if (site.category !== 'utility') {
      webview.executeJavaScript(guestMonitorScript)
        .catch(err => console.error(`[${site.id}] Monitor injection failed:`, err));
    }

    // Deliver a broadcast that arrived before this channel finished loading
    const pending = pendingInjections[site.id];
    if (pending) {
      delete pendingInjections[site.id];
      // Give SPA frameworks a moment to hydrate their input components
      setTimeout(() => {
        webview.executeJavaScript(pending)
          .catch(err => console.error(`Failed to inject into ${site.id}:`, err));
      }, 1500);
    }
  });

  // Handle incoming prompts from console messages
  if (site.category !== 'utility') {
    webview.addEventListener('console-message', (e) => {
      const msg = e.message;
      if (msg && msg.startsWith('OMNIAI_PROMPT_SUBMIT:')) {
        const promptText = msg.substring('OMNIAI_PROMPT_SUBMIT:'.length).trim();
        if (promptText) addPromptToHistory(promptText, site.name);
      }
    });
  }

  // Load failed. Ignore sub-frame failures (ads, trackers, iframes) and
  // ERR_ABORTED (-3), which fires on ordinary redirects / SPA navigations.
  webview.addEventListener('did-fail-load', (e) => {
    if (!e.isMainFrame || e.errorCode === -3) return;
    console.error(`Webview load failed for ${site.id}:`, e.errorCode, e.errorDescription);
    setStatus('');
    if (loader) loader.classList.remove('hidden');
    if (loaderText) {
      loaderText.innerHTML = `Connection failed (${escapeHtml(e.errorDescription || String(e.errorCode))}).<br><button class="btn" style="margin-top:8px;padding:4px 8px;font-size:11px;">Retry</button>`;
      loaderText.querySelector('button').addEventListener('click', () => {
        loaderText.textContent = `Connecting to ${site.name}...`;
        webview.reload();
      });
    }
  });
}

// Injection script is read from disk once and cached (it never changes at runtime)
let cachedInjectionScript = null;
function getInjectionScript() {
  if (cachedInjectionScript === null) {
    cachedInjectionScript = fs.readFileSync(path.join(__dirname, 'injection-script.js'), 'utf8');
  }
  return cachedInjectionScript;
}

// Broadcast prompt execution (excludes utility windows like google)
function executeBroadcast() {
  const prompt = broadcastInput.value.trim();
  if (!prompt || broadcastSendBtn.disabled) return;

  let injectionScript;
  try {
    injectionScript = getInjectionScript();
  } catch (err) {
    console.error('Failed to read injection-script.js:', err);
    broadcastStatus.textContent = 'Error: Cannot load injection script.';
    broadcastStatus.className = 'broadcast-status-message danger';
    return;
  }

  // Add to history (most recent first, no duplicates)
  const existing = currentState.broadcastHistory.indexOf(prompt);
  if (existing > -1) currentState.broadcastHistory.splice(existing, 1);
  currentState.broadcastHistory.unshift(prompt);
  if (currentState.broadcastHistory.length > 15) currentState.broadcastHistory.length = 15;
  addPromptToHistory(prompt, 'Broadcast'); // also persists config
  historyIndex = -1; // Reset cycling index

  // Update Status UI
  broadcastStatus.textContent = 'Injecting prompts into active AIs...';
  broadcastStatus.className = 'broadcast-status-message working';

  // Disable controls temporarily
  broadcastInput.disabled = true;
  broadcastSendBtn.disabled = true;
  broadcastSendBtn.style.opacity = '0.5';

  const codeToRun = `(${injectionScript})(${JSON.stringify(prompt)});`;
  let sentCount = 0;
  let queuedCount = 0;

  sitesConfig.forEach(site => {
    if (site.category === 'utility') return;
    if (currentState.enabledModels[site.id] === false) return;

    const webview = getWebview(site.id);
    if (isWebviewReady(webview)) {
      sentCount++;
      webview.executeJavaScript(codeToRun)
        .catch(err => console.error(`Failed to inject into ${site.id}:`, err));
    } else {
      // Channel still loading (or queued) - deliver as soon as it is ready
      queuedCount++;
      pendingInjections[site.id] = codeToRun;
      ensureWebviewLoaded(site.id);
    }
  });

  setTimeout(() => {
    broadcastInput.value = '';
    broadcastInput.disabled = false;
    broadcastSendBtn.disabled = false;
    broadcastSendBtn.style.opacity = '1';
    broadcastInput.focus();

    const total = sentCount + queuedCount;
    if (total === 0) {
      broadcastStatus.textContent = 'No active AI channels - enable some in Settings.';
      broadcastStatus.className = 'broadcast-status-message danger';
      return;
    }
    broadcastStatus.textContent = queuedCount > 0
      ? `Broadcasted to ${sentCount} AI channels (${queuedCount} more once they finish loading).`
      : `Successfully broadcasted to ${sentCount} active AI channels!`;
    broadcastStatus.className = 'broadcast-status-message success';
    notifyBroadcastDone();

    const doneText = broadcastStatus.textContent;
    setTimeout(() => {
      if (broadcastStatus.textContent === doneText) {
        broadcastStatus.textContent = 'Ready to broadcast';
        broadcastStatus.className = 'broadcast-status-message';
      }
    }, 4000);
  }, 400);
}

// Event Listeners Setup
function setupListeners() {
  // 1. Sidebar Nav - structural items only (dynamic items have their own listeners)
  document.querySelectorAll('.sidebar-nav > .nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      if (tabId) switchTab(tabId);
    });
  });

  // Settings tab button in footer
  const settingsBtn = document.querySelector('.sidebar-footer .nav-item[data-tab="settings"]');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => switchTab('settings'));
  }

  // 2. Settings Layout Buttons
  document.querySelectorAll('.layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const layout = btn.getAttribute('data-layout');
      currentState.layout = layout;
      updateLayoutClass(layout);
      
      // Update UI selection
      document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      saveConfig();
    });
  });

  // 3. Settings Gemini AuthUser Account Select dropdown
  if (geminiAuthUserSelect) {
    geminiAuthUserSelect.addEventListener('change', (e) => {
      const value = e.target.value;
      currentState.geminiAuthUser = value;

      // Update webview src dynamically (only if Gemini is actually loaded/enabled -
      // setAttribute already triggers navigation, no need to also call .reload())
      const wvGemini = getWebview('gemini');
      if (wvGemini) {
        wvGemini.setAttribute('src', `https://gemini.google.com/app?authuser=${encodeURIComponent(value)}`);
      }

      saveConfig();
    });
  }

  // 4. Broadcast Input Keys (Ctrl/Cmd + Enter to send, Up/Down to cycle history)
  broadcastInput.addEventListener('keydown', (e) => {
    const isMac = (typeof process !== 'undefined' && process.platform === 'darwin');
    const hasModifier = isMac ? e.metaKey : e.ctrlKey;
    if (e.key === 'Enter' && hasModifier) {
      e.preventDefault();
      executeBroadcast();
    } else if (e.key === 'ArrowUp') {
      if (currentState.broadcastHistory.length > 0) {
        const isCursorAtStart = broadcastInput.selectionStart === 0 && broadcastInput.selectionEnd === 0;
        if (broadcastInput.value.trim() === '' || isCursorAtStart) {
          e.preventDefault();
          if (historyIndex < currentState.broadcastHistory.length - 1) {
            historyIndex++;
            broadcastInput.value = currentState.broadcastHistory[historyIndex];
            setTimeout(() => {
              broadcastInput.selectionStart = broadcastInput.selectionEnd = broadcastInput.value.length;
            }, 0);
          }
        }
      }
    } else if (e.key === 'ArrowDown') {
      if (currentState.broadcastHistory.length > 0) {
        const isCursorAtEnd = broadcastInput.selectionStart === broadcastInput.value.length;
        if (broadcastInput.value.trim() === '' || isCursorAtEnd) {
          e.preventDefault();
          if (historyIndex > 0) {
            historyIndex--;
            broadcastInput.value = currentState.broadcastHistory[historyIndex];
          } else if (historyIndex === 0) {
            historyIndex = -1;
            broadcastInput.value = '';
          }
        }
      }
    }
  });

  // 5. Broadcast Send Button
  broadcastSendBtn.addEventListener('click', executeBroadcast);

  // 6. Theme Accent Buttons
  document.querySelectorAll('.accent-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const accent = btn.getAttribute('data-accent');
      const glow = btn.getAttribute('data-glow');
      
      currentState.themeAccent = accent;
      currentState.themeGlow = glow;
      
      document.documentElement.style.setProperty('--accent-color', accent);
      document.documentElement.style.setProperty('--accent-glow', glow);
      
      document.querySelectorAll('.accent-color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      saveConfig();
    });
  });

  // 7. Window Navigation Hotkeys (Cmd on Mac, Ctrl on Win/Linux)
  window.addEventListener('keydown', (e) => {
    // Skip if writing in a text input/textarea (checkboxes/radios should not block hotkeys)
    const activeEl = document.activeElement;
    if (!activeEl) return;
    const isTextInput = activeEl.tagName === 'TEXTAREA' ||
      (activeEl.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(activeEl.type)) ||
      activeEl.getAttribute('contenteditable') === 'true';
    if (isTextInput) {
      return;
    }

    const isMac = (typeof process !== 'undefined' && process.platform === 'darwin');
    const hasModifier = isMac ? e.metaKey : e.ctrlKey;

    if (hasModifier) {
      if (e.key.toLowerCase() === 'd') {
        e.preventDefault();
        switchTab('dashboard');
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        switchTab('settings');
      } else if (e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        // Use AI sites from config for keyboard shortcuts
        const aiSites = sitesConfig.filter(s => s.category === 'ai');
        if (index < aiSites.length) {
          switchTab(aiSites[index].id);
        }
      }
    }
  });

  // 8. Prompt History Search and Clear
  const historySearch = document.getElementById('history-search');
  if (historySearch) {
    historySearch.addEventListener('input', renderPromptsHistory);
  }

  const clearHistoryBtn = document.getElementById('clear-history-btn');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear your prompt history? Pinned prompts will also be deleted.')) {
        currentState.promptsHistory = [];
        saveConfig();
        updateWorkspaceWidget();
        renderPromptsHistory();
      }
    });
  }

  // 9. Workspace Monitor Widget Quick Actions
  const widgetPaletteBtn = document.getElementById('widget-btn-palette');
  if (widgetPaletteBtn) {
    widgetPaletteBtn.addEventListener('click', openCmdPalette);
  }

  const widgetTemplatesBtn = document.getElementById('widget-btn-templates');
  if (widgetTemplatesBtn) {
    widgetTemplatesBtn.addEventListener('click', openTemplatesModal);
  }
}


// ===================================================================
// App Initialization (async - loads sites config first)
// ===================================================================
window.addEventListener('DOMContentLoaded', async () => {
  // Load sites configuration from main process
  try {
    const result = await ipcRenderer.invoke('read-sites-config');
    if (result.success) {
      sitesConfig = result.data.sites;
    } else {
      console.error('Failed to load sites config:', result.error);
      sitesConfig = [];
    }
  } catch (e) {
    console.error('IPC error loading sites config:', e);
    sitesConfig = [];
  }

  // Load user preferences from localStorage
  loadConfig();

  // Initialize enabledModels defaults from sites config
  initEnabledModelsFromSites(sitesConfig);

  // Build all dynamic UI elements
  buildDynamicUI(sitesConfig);

  // Initialize the app
  initUI();
  setupListeners();
  initWorkspaceMonitorCard();
  initSidebarCollapse();
  initSidebarSearch();
  initCmdPalette();
  initTemplates();
  initAlwaysOnTop();
  initSitesEditor();
  initMacPlatformReplacements();
});


/* =================================================================
   FEATURE: Sidebar Collapse
================================================================= */
let sidebarCollapsed = safeParseJSON(localStorage.getItem('omniai_sidebar_collapsed'), false) === true;
const sidebar = document.querySelector('.sidebar');

function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  sidebar.classList.toggle('collapsed', sidebarCollapsed);
  localStorage.setItem('omniai_sidebar_collapsed', JSON.stringify(sidebarCollapsed));
}

function initSidebarCollapse() {
  if (sidebarCollapsed) sidebar.classList.add('collapsed');
  document.getElementById('sidebar-collapse-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSidebar();
  });
}


/* =================================================================
   FEATURE: Sidebar Search Filter
================================================================= */
function initSidebarSearch() {
  const searchInput = document.getElementById('sidebar-search');
  if (!searchInput) return;
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    document.querySelectorAll('.sidebar-nav .nav-item[data-tab]').forEach(item => {
      const tab = item.getAttribute('data-tab');
      if (tab === 'dashboard' || tab === 'settings') return;
      const label = item.querySelector('.nav-label');
      if (!label) return;
      const match = !q || label.textContent.toLowerCase().includes(q);
      item.style.display = match ? '' : 'none';
    });
  });
}


/* =================================================================
   FEATURE: Command Palette (dynamically built from sitesConfig)
================================================================= */
let cmdHighlightIndex = 0;
let currentCmdItems = [];

function buildCmdItems() {
  const staticItems = [
    { label: 'Dashboard',        badge: 'Ctrl+D', icon: '⊞', action: () => switchTab('dashboard') },
    { label: 'Settings',         badge: 'Ctrl+S', icon: '⚙',  action: () => switchTab('settings') },
    { label: 'Toggle Sidebar',   badge: 'Ctrl+B', icon: '◧',  action: () => toggleSidebar() },
    { label: 'Always on Top',    badge: '',       icon: '📌',  action: () => toggleAlwaysOnTop() },
    { label: 'Open Templates',   badge: '',       icon: '📄',  action: () => openTemplatesModal() },
    { label: 'Broadcast',        badge: 'Ctrl+↵', icon: '📡',  action: () => document.getElementById('broadcast-send-btn').click() },
  ];

  const isMac = (typeof process !== 'undefined' && process.platform === 'darwin');
  const mod = isMac ? '⌘' : 'Ctrl+';
  const aiIds = sitesConfig.filter(s => s.category === 'ai').map(s => s.id);
  const siteItems = sitesConfig.map(site => {
    const aiIndex = aiIds.indexOf(site.id);
    return {
      label: site.name,
      badge: aiIndex > -1 && aiIndex < 9 ? `${mod}${aiIndex + 1}` : '',
      icon: site.icon,
      action: () => switchTab(site.id)
    };
  });

  return [...staticItems, ...siteItems];
}

function openCmdPalette() {
  const overlay = document.getElementById('cmd-palette-overlay');
  overlay.classList.remove('hidden');
  const input = document.getElementById('cmd-search-input');
  input.value = '';
  renderCmdResults('');
  setTimeout(() => input.focus(), 50);
}

function closeCmdPalette() {
  document.getElementById('cmd-palette-overlay').classList.add('hidden');
}

function renderCmdResults(query) {
  const CMD_ITEMS = buildCmdItems();
  const q = query.toLowerCase();
  currentCmdItems = q ? CMD_ITEMS.filter(i => i.label.toLowerCase().includes(q)) : CMD_ITEMS;
  cmdHighlightIndex = 0;
  const container = document.getElementById('cmd-results');
  container.innerHTML = '';
  currentCmdItems.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = 'cmd-item' + (idx === 0 ? ' highlighted' : '');
    el.innerHTML = `<span>${escapeHtml(item.icon)}</span><span>${escapeHtml(item.label)}</span>${item.badge ? `<span class="cmd-item-badge">${escapeHtml(item.badge)}</span>` : ''}`;
    el.addEventListener('click', () => { item.action(); closeCmdPalette(); });
    container.appendChild(el);
  });
}

function initCmdPalette() {
  const overlay = document.getElementById('cmd-palette-overlay');
  const input = document.getElementById('cmd-search-input');

  document.getElementById('cmd-palette-btn').addEventListener('click', openCmdPalette);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeCmdPalette(); });

  input.addEventListener('input', () => renderCmdResults(input.value));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeCmdPalette(); return; }
    const items = document.querySelectorAll('.cmd-item');
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[cmdHighlightIndex]?.classList.remove('highlighted');
      cmdHighlightIndex = (cmdHighlightIndex + 1) % items.length;
      items[cmdHighlightIndex]?.classList.add('highlighted');
      items[cmdHighlightIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[cmdHighlightIndex]?.classList.remove('highlighted');
      cmdHighlightIndex = (cmdHighlightIndex - 1 + items.length) % items.length;
      items[cmdHighlightIndex]?.classList.add('highlighted');
      items[cmdHighlightIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentCmdItems[cmdHighlightIndex]) {
        currentCmdItems[cmdHighlightIndex].action();
        closeCmdPalette();
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    const isMac = (typeof process !== 'undefined' && process.platform === 'darwin');
    const hasModifier = isMac ? e.metaKey : e.ctrlKey;
    if (hasModifier && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (overlay.classList.contains('hidden')) openCmdPalette();
      else closeCmdPalette();
    }
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeCmdPalette();
  });
}


/* =================================================================
   FEATURE: Prompt Templates
================================================================= */
let promptTemplates = safeParseJSON(localStorage.getItem('omniai_templates'), []);

function saveTemplates() {
  localStorage.setItem('omniai_templates', JSON.stringify(promptTemplates));
}

function openTemplatesModal() {
  renderTemplatesList();
  document.getElementById('templates-overlay').classList.remove('hidden');
}

function closeTemplatesModal() {
  document.getElementById('templates-overlay').classList.add('hidden');
}

function renderTemplatesList() {
  const list = document.getElementById('templates-list');
  list.innerHTML = '';
  if (promptTemplates.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dark);font-size:12px;">No templates yet. Add one above!</div>';
    return;
  }
  promptTemplates.forEach((tpl, idx) => {
    const el = document.createElement('div');
    el.className = 'template-item';
    el.innerHTML = `
      <span class="template-item-name" title="${escapeHtml(tpl.name)}">${escapeHtml(tpl.name)}</span>
      <span class="template-item-preview" title="${escapeHtml(tpl.body)}">${escapeHtml(tpl.body)}</span>
      <button class="template-item-delete" title="Delete">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6l-1 14H6L5 6"></path>
          <path d="M10 11v6M14 11v6"></path>
        </svg>
      </button>`;
    el.querySelector('.template-item-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      promptTemplates.splice(idx, 1);
      saveTemplates();
      renderTemplatesList();
    });
    el.addEventListener('click', (e) => {
      if (e.target.closest('.template-item-delete')) return;
      const input = document.getElementById('broadcast-input');
      input.value = tpl.body;
      input.dispatchEvent(new Event('input'));
      closeTemplatesModal();
    });
    list.appendChild(el);
  });
}

function initTemplates() {
  document.getElementById('templates-open-btn').addEventListener('click', openTemplatesModal);
  document.getElementById('templates-close-btn').addEventListener('click', closeTemplatesModal);
  document.getElementById('templates-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('templates-overlay')) closeTemplatesModal();
  });
  document.getElementById('template-save-btn').addEventListener('click', () => {
    const name = document.getElementById('template-name-input').value.trim();
    const body = document.getElementById('template-body-input').value.trim();
    if (!name || !body) { return; }
    promptTemplates.unshift({ name, body });
    saveTemplates();
    document.getElementById('template-name-input').value = '';
    document.getElementById('template-body-input').value = '';
    renderTemplatesList();
  });
}


/* =================================================================
   FEATURE: Always On Top
================================================================= */
let isAlwaysOnTop = false;

async function toggleAlwaysOnTop() {
  isAlwaysOnTop = !isAlwaysOnTop;
  await ipcRenderer.invoke('set-always-on-top', isAlwaysOnTop);
  const btn = document.getElementById('always-on-top-btn');
  btn.classList.toggle('active', isAlwaysOnTop);
  btn.title = isAlwaysOnTop ? 'Always on Top (ON)' : 'Always on Top';
}

function initAlwaysOnTop() {
  document.getElementById('always-on-top-btn').addEventListener('click', toggleAlwaysOnTop);
  ipcRenderer.invoke('get-always-on-top').then(({ alwaysOnTop }) => {
    isAlwaysOnTop = !!alwaysOnTop;
    const btn = document.getElementById('always-on-top-btn');
    btn.classList.toggle('active', isAlwaysOnTop);
  }).catch(() => {});
}


/* =================================================================
   FEATURE: Broadcast Sound + Flash Notification
================================================================= */
let broadcastAudioCtx = null;
function playBroadcastDoneSound() {
  try {
    // Reuse one AudioContext - browsers cap how many can exist at once
    if (!broadcastAudioCtx) broadcastAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = broadcastAudioCtx;
    const times = [0, 0.12, 0.24];
    const freqs = [523, 659, 784]; // C5, E5, G5 major chord arpeggio
    times.forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freqs[i];
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.18, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.25);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.3);
    });
  } catch (e) { /* audio not available */ }
}

function notifyBroadcastDone() {
  playBroadcastDoneSound();
  broadcastPanel.classList.add('flash');
  setTimeout(() => broadcastPanel.classList.remove('flash'), 800);
}

/* =================================================================
   FEATURE: macOS Tooltip and String Localizations
================================================================= */
function initMacPlatformReplacements() {
  const isMac = (typeof process !== 'undefined' && process.platform === 'darwin');
  if (isMac) {
    // 1. Sidebar collapse button tooltip
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    if (collapseBtn) collapseBtn.setAttribute('title', 'Collapse Sidebar (⌘B)');

    // 2. Command palette button tooltip
    const cmdPaletteBtn = document.getElementById('cmd-palette-btn');
    if (cmdPaletteBtn) cmdPaletteBtn.setAttribute('title', 'Command Palette (⌘K)');

    // 3. Broadcast input placeholder
    const broadcastInput = document.getElementById('broadcast-input');
    if (broadcastInput) broadcastInput.setAttribute('placeholder', 'Enter prompt to execute across all active AIs... (⌘Enter to send)');

    // 4. Broadcast send button tooltip
    const broadcastSendBtn = document.getElementById('broadcast-send-btn');
    if (broadcastSendBtn) broadcastSendBtn.setAttribute('title', 'Broadcast prompt (⌘Enter)');

    // 5. Help card text update
    const infoCards = document.querySelectorAll('.info-card p');
    infoCards.forEach(p => {
      if (p.innerHTML.includes('Ctrl + Enter')) {
        p.innerHTML = p.innerHTML.replace('Ctrl + Enter', '⌘ + Enter');
      }
    });
  }
}

/* =================================================================
   FEATURE: Webview guest monitor injection script
================================================================= */
const guestMonitorScript = `
  (function() {
    if (window.__omniai_monitor_active) return;
    window.__omniai_monitor_active = true;

    let lastTypedText = '';
    let lastReported = '';
    let lastReportedAt = 0;

    const report = () => {
      const text = lastTypedText.trim();
      if (!text) return;
      // Enter + send-button click for the same submit would otherwise double-log
      const now = Date.now();
      if (text === lastReported && now - lastReportedAt < 2000) return;
      lastReported = text;
      lastReportedAt = now;
      lastTypedText = '';
      console.log("OMNIAI_PROMPT_SUBMIT:" + text);
    };

    // Monitor inputs and updates on textareas/editable divs
    document.addEventListener('input', (e) => {
      const el = e.target;
      if (!el || !el.tagName) return;
      if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search'))) {
        lastTypedText = el.value;
      } else if (el.isContentEditable) {
        lastTypedText = el.innerText;
      }
    }, true);

    // Listen to Enter key submissions (ignore IME composition)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) report();
    }, true);

    // Listen to Send button clicks
    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('button, [role="button"]');
      if (!btn) return;
      const hint = [
        btn.getAttribute('aria-label'),
        btn.getAttribute('data-testid'),
        btn.getAttribute('title'),
        btn.getAttribute('type') === 'submit' ? 'submit' : '',
        typeof btn.className === 'string' ? btn.className : ''
      ].join(' ').toLowerCase();
      if (/send|submit/.test(hint)) report();
    }, true);
  })();
`;

/* =================================================================
   FEATURE: Prompt History Helpers & Rendering
================================================================= */
function addPromptToHistory(text, source) {
  if (!currentState.promptsHistory) {
    currentState.promptsHistory = [];
  }
  
  // Clean text
  const cleanText = text.trim();
  if (!cleanText) return;
  
  // Check if the exact prompt already exists in history
  const existingIndex = currentState.promptsHistory.findIndex(item => item.text.trim() === cleanText);
  
  if (existingIndex > -1) {
    // If it exists, update its timestamp and source, and move it to the top (unless pinned)
    const existingItem = currentState.promptsHistory.splice(existingIndex, 1)[0];
    existingItem.timestamp = Date.now();
    existingItem.source = source;
    currentState.promptsHistory.unshift(existingItem);
  } else {
    // Add new item
    currentState.promptsHistory.unshift({
      id: Date.now() + Math.random(),
      text: cleanText,
      timestamp: Date.now(),
      pinned: false,
      source: source
    });
  }
  
  // Keep max 100 entries - evict the oldest *unpinned* prompt(s)
  while (currentState.promptsHistory.length > 100) {
    const history = currentState.promptsHistory;
    let idx = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (!history[i].pinned) { idx = i; break; }
    }
    if (idx === -1) break;
    history.splice(idx, 1);
  }
  
  saveConfig();
  updateWorkspaceWidget();
  if (currentState.activeTab === 'prompts-history') {
    renderPromptsHistory();
  }
}

function renderPromptsHistory() {
  const searchInput = document.getElementById('history-search');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  
  const pinnedList = document.getElementById('pinned-history-list');
  const recentList = document.getElementById('recent-history-list');
  
  if (!pinnedList || !recentList) return;
  
  pinnedList.innerHTML = '';
  recentList.innerHTML = '';
  
  const history = currentState.promptsHistory || [];
  const filtered = query ? history.filter(item => item.text.toLowerCase().includes(query)) : history;
  
  const pinnedItems = filtered.filter(item => item.pinned);
  const recentItems = filtered.filter(item => !item.pinned);
  
  if (pinnedItems.length === 0) {
    pinnedList.innerHTML = '<div class="no-history-msg">No pinned prompts. Pin important prompts to keep them at the top!</div>';
  } else {
    pinnedItems.forEach(item => {
      pinnedList.appendChild(createHistoryItemElement(item));
    });
  }
  
  if (recentItems.length === 0) {
    recentList.innerHTML = '<div class="no-history-msg">No recent prompts found.</div>';
  } else {
    recentItems.forEach(item => {
      recentList.appendChild(createHistoryItemElement(item));
    });
  }
}

function createHistoryItemElement(item) {
  const el = document.createElement('div');
  el.className = `history-item ${item.pinned ? 'pinned' : ''}`;
  
  // Format timestamp
  const date = new Date(item.timestamp);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' - ' + date.toLocaleDateString();
  
  // Find color from sitesConfig for badge, fallback to accent
  const source = String(item.source || 'Unknown');
  const site = sitesConfig.find(s => s.name.toLowerCase() === source.toLowerCase());
  const badgeColor = source === 'Broadcast' ? 'var(--accent-color)' : (site ? safeColor(site.color) : 'var(--text-dark)');

  el.innerHTML = `
    <div class="history-item-header">
      <span class="history-badge" style="background-color: ${badgeColor};">${escapeHtml(source)}</span>
      <span class="history-time">${timeStr}</span>
    </div>
    <div class="history-item-body">${escapeHtml(item.text)}</div>
    <div class="history-item-actions">
      <button class="history-action-btn btn-pin ${item.pinned ? 'active' : ''}" title="${item.pinned ? 'Unpin prompt' : 'Pin prompt'}">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
      </button>
      <button class="history-action-btn btn-copy" title="Copy to clipboard">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
      <button class="history-action-btn btn-use" title="Load into Broadcast bar">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    </div>
  `;
  
  // Attach listeners
  el.querySelector('.btn-pin').addEventListener('click', (e) => {
    e.stopPropagation();
    item.pinned = !item.pinned;
    saveConfig();
    updateWorkspaceWidget();
    renderPromptsHistory();
  });
  
  el.querySelector('.btn-copy').addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(item.text).catch(err => console.error('Copy failed:', err));
    
    const copyBtn = el.querySelector('.btn-copy');
    copyBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--success-color)" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
    setTimeout(() => {
      copyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      `;
    }, 1500);
  });
  
  el.querySelector('.btn-use').addEventListener('click', (e) => {
    e.stopPropagation();
    switchTab('dashboard');
    const input = document.getElementById('broadcast-input');
    if (input) {
      input.value = item.text;
      input.focus();
      input.dispatchEvent(new Event('input'));
    }
  });
  
  // Clicking the item body loads it into the broadcast bar
  el.querySelector('.history-item-body').addEventListener('click', () => {
    switchTab('dashboard');
    const input = document.getElementById('broadcast-input');
    if (input) {
      input.value = item.text;
      input.focus();
      input.dispatchEvent(new Event('input'));
    }
  });
  
  return el;
}

// Parse JSON from storage without letting a corrupted value break startup
function safeParseJSON(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

// Only allow plain CSS color values from sites.json into style attributes
function safeColor(color) {
  return /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\))$/i.test(String(color || '').trim())
    ? String(color).trim()
    : 'var(--text-muted)';
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  text = String(text);
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

/* =================================================================
   FEATURE: Workspace Monitor Widget card
================================================================= */
function initWorkspaceMonitorCard() {
  const card = document.getElementById('card-workspace-monitor');
  if (!card) return;
  card.querySelector('.btn-focus')?.addEventListener('click', () => {
    switchTab(currentState.activeTab === 'workspace-monitor' ? 'dashboard' : 'workspace-monitor');
  });
}

/* =================================================================
   FEATURE: Workspace Monitor Widget updater
================================================================= */
function updateWorkspaceWidget() {
  const activeAisEl = document.getElementById('widget-active-ais');
  const totalPromptsEl = document.getElementById('widget-total-prompts');
  const pinnedListEl = document.getElementById('widget-pinned-list');
  
  if (!activeAisEl && !totalPromptsEl && !pinnedListEl) return;
  
  // Calculate active AI count from sitesConfig (exclude utilities like google)
  const aiSites = sitesConfig.filter(s => s.category === 'ai');
  const activeCount = aiSites.filter(s => currentState.enabledModels[s.id] !== false).length;
  
  if (activeAisEl) {
    activeAisEl.textContent = `${activeCount} / ${aiSites.length}`;
  }
  
  const history = currentState.promptsHistory || [];
  if (totalPromptsEl) {
    totalPromptsEl.textContent = history.length;
  }
  
  if (pinnedListEl) {
    pinnedListEl.innerHTML = '';
    const pinnedItems = history.filter(item => item.pinned).slice(0, 3);
    
    if (pinnedItems.length === 0) {
      pinnedListEl.innerHTML = '<div style="font-size: 11px; color: var(--text-dark); font-style: italic;">No pinned prompts yet.</div>';
    } else {
      pinnedItems.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.style.display = 'flex';
        itemEl.style.justifyContent = 'space-between';
        itemEl.style.alignItems = 'center';
        itemEl.style.background = 'rgba(255,255,255,0.01)';
        itemEl.style.border = '1px solid rgba(255,255,255,0.03)';
        itemEl.style.padding = '5px 8px';
        itemEl.style.borderRadius = '6px';
        itemEl.style.cursor = 'pointer';
        itemEl.style.transition = 'background 0.12s';
        
        const textPreview = item.text.length > 30 ? item.text.substring(0, 30) + '...' : item.text;
        
        itemEl.innerHTML = `
          <span style="font-size: 11.5px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;" title="${escapeHtml(item.text)}">${escapeHtml(textPreview)}</span>
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="var(--text-dark)" stroke-width="2.5" style="margin-left: 6px;"><polyline points="9 18 15 12 9 6"></polyline></svg>
        `;
        
        itemEl.addEventListener('click', () => {
          switchTab('dashboard');
          const input = document.getElementById('broadcast-input');
          if (input) {
            input.value = item.text;
            input.focus();
            input.dispatchEvent(new Event('input'));
          }
        });
        
        // Hover effects in JS
        itemEl.addEventListener('mouseenter', () => {
          itemEl.style.background = 'rgba(255,255,255,0.04)';
          itemEl.querySelector('svg').style.stroke = 'var(--accent-color)';
        });
        itemEl.addEventListener('mouseleave', () => {
          itemEl.style.background = 'rgba(255,255,255,0.01)';
          itemEl.querySelector('svg').style.stroke = 'var(--text-dark)';
        });
        
        pinnedListEl.appendChild(itemEl);
      });
    }
  }
}


/* =================================================================
   FEATURE: Sites JSON Editor in Settings
================================================================= */
function initSitesEditor() {
  const editor = document.getElementById('sites-json-editor');
  const statusEl = document.getElementById('sites-json-status');
  const applyBtn = document.getElementById('sites-json-apply-btn');
  const resetBtn = document.getElementById('sites-json-reset-btn');

  if (!editor || !applyBtn || !resetBtn) return;

  // Populate editor with current sites config
  editor.value = JSON.stringify({ sites: sitesConfig }, null, 2);

  // Handle Tab key in textarea for indentation
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + 2;
    }
  });

  // Validate & Apply button
  applyBtn.addEventListener('click', async () => {
    const jsonString = editor.value;
    
    // Local pre-check
    try {
      JSON.parse(jsonString);
    } catch (e) {
      statusEl.textContent = `❌ Invalid JSON: ${e.message}`;
      statusEl.className = 'sites-json-status error';
      return;
    }

    applyBtn.disabled = true;
    applyBtn.textContent = 'Saving...';

    const result = await ipcRenderer.invoke('write-sites-config', jsonString);
    
    if (result.success) {
      statusEl.textContent = '✅ Saved successfully! Reloading app to apply changes...';
      statusEl.className = 'sites-json-status success';

      // Reload the app after a short delay so user sees the success message
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } else {
      statusEl.textContent = `❌ Validation error: ${result.error}`;
      statusEl.className = 'sites-json-status error';
      applyBtn.disabled = false;
      applyBtn.textContent = 'Validate & Apply';
    }
  });

  // Reset to defaults button
  resetBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to reset to default sites configuration? Your custom changes will be lost.')) return;

    resetBtn.disabled = true;
    resetBtn.textContent = 'Resetting...';

    const result = await ipcRenderer.invoke('reset-sites-config');
    
    if (result.success) {
      statusEl.textContent = '✅ Reset to defaults! Reloading app...';
      statusEl.className = 'sites-json-status success';

      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } else {
      statusEl.textContent = `❌ Reset failed: ${result.error}`;
      statusEl.className = 'sites-json-status error';
      resetBtn.disabled = false;
      resetBtn.textContent = 'Reset to Defaults';
    }
  });
}
