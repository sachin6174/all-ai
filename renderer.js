const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// State Management
let currentState = {
  activeTab: 'dashboard',
  layout: '2x3',
  geminiAuthUser: '0', // Current active Google account index for Gemini
  themeAccent: '#5b5df8',
  themeGlow: 'rgba(91, 93, 248, 0.35)',
  broadcastHistory: [],
  broadcastMutes: {}, // Track muted broadcast receivers
  enabledModels: {
    gemini: true,
    chatgpt: true,
    claude: true,
    grok: true,
    deepseek: true,
    qwen: true,
    copilot: true,
    perplexity: true,
    lechat: true,
    pi: true,
    you: true,
    poe: true,
    characterai: true,
    metaai: true,
    kimi: true,
    jasper: true,
    phind: true,
    huggingchat: true,
    duckchat: true,
    groq: true,
    blackbox: true,
    cohere: true,
    openrouter: true
  }
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

// Load configurations from local storage
function loadConfig() {
  const savedState = localStorage.getItem('omni_ai_state');
  if (savedState) {
    try {
      const parsed = JSON.parse(savedState);
      
      // Merge enabledModels key-by-key so new default models are not lost
      if (parsed.enabledModels) {
        parsed.enabledModels = { ...currentState.enabledModels, ...parsed.enabledModels };
      }
      
      currentState = { ...currentState, ...parsed };
      if (!currentState.broadcastMutes) currentState.broadcastMutes = {};
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
    broadcastMutes: currentState.broadcastMutes,
    enabledModels: currentState.enabledModels
  }));
}

// Initialize the application UI based on current configurations
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

  // Inject sidebar and megaphone controls dynamically
  injectSidebarToggles();
  injectCardMegaphones();

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

  // 2. Setup Gemini authuser source URL
  const wvGemini = document.getElementById('wv-gemini');
  if (wvGemini) {
    wvGemini.setAttribute('src', `https://gemini.google.com/app?authuser=${currentState.geminiAuthUser}`);
  }
  if (geminiAuthUserSelect) {
    geminiAuthUserSelect.value = currentState.geminiAuthUser;
  }

  // 3. Setup Enabled AI Services
  Object.keys(currentState.enabledModels).forEach(model => {
    const isEnabled = currentState.enabledModels[model];
    
    // Toggle card visibility (except for utilities like 'google')
    const card = document.getElementById(`card-${model}`);
    if (card && !card.classList.contains('card-utility')) {
      if (isEnabled) {
        card.classList.remove('card-disabled');
      } else {
        card.classList.add('card-disabled');
      }
    }

    const navBtn = document.querySelector(`.nav-item[data-tab="${model}"]`);
    const dot = document.getElementById(`dot-${model}`);
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

    // Toggle checkbox state in settings
    const checkbox = document.getElementById(`toggle-${model}`);
    if (checkbox) {
      checkbox.checked = isEnabled;
    }

    // Toggle broadcast active indicators
    const trayBadge = document.querySelector(`.tray-badge[data-indicator="${model}"]`);
    if (trayBadge) {
      if (isEnabled) {
        trayBadge.classList.add('active');
      } else {
        trayBadge.classList.remove('active');
      }

      // Sync muted state
      if (currentState.broadcastMutes[model]) {
        trayBadge.classList.add('broadcast-muted');
      } else {
        trayBadge.classList.remove('broadcast-muted');
      }
    }
  });

  // 4. Setup active tab
  switchTab(currentState.activeTab);
}

// Inject sidebar toggles dynamically on app start
function injectSidebarToggles() {
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(navBtn => {
    const tabId = navBtn.getAttribute('data-tab');
    if (!tabId || ['dashboard', 'settings', 'google'].includes(tabId)) return;

    if (navBtn.querySelector('.sidebar-toggle-check')) return;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'sidebar-toggle-check';
    checkbox.title = 'Show/hide on Dashboard';
    checkbox.checked = currentState.enabledModels[tabId] !== false;
    
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation(); // Avoid switching tabs when checking/unchecking
    });

    checkbox.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      currentState.enabledModels[tabId] = isChecked;
      
      const card = document.getElementById(`card-${tabId}`);
      if (card) {
        if (isChecked) {
          card.classList.remove('card-disabled');
        } else {
          card.classList.add('card-disabled');
        }
      }

      const dot = document.getElementById(`dot-${tabId}`);
      if (isChecked) {
        if (dot) dot.classList.add('active');
        navBtn.style.opacity = '1';
      } else {
        if (dot) dot.classList.remove('active');
        navBtn.style.opacity = '0.5';
      }

      const settingsCheckbox = document.getElementById(`toggle-${tabId}`);
      if (settingsCheckbox) settingsCheckbox.checked = isChecked;

      const trayBadge = document.querySelector(`.tray-badge[data-indicator="${tabId}"]`);
      if (trayBadge) {
        if (isChecked) trayBadge.classList.add('active');
        else trayBadge.classList.remove('active');
      }

      saveConfig();
    });

    navBtn.appendChild(checkbox);
  });
}

// Inject megaphone buttons into card headers dynamically on app start
function injectCardMegaphones() {
  document.querySelectorAll('.webview-card').forEach(card => {
    const model = card.getAttribute('data-model');
    if (!model || model === 'google') return; // Skip utility

    const actions = card.querySelector('.card-actions');
    if (!actions) return;

    if (actions.querySelector('.btn-broadcast-toggle')) return; // Avoid duplicate

    const btn = document.createElement('button');
    btn.className = 'action-btn btn-broadcast-toggle';
    btn.title = 'Toggle Broadcast Receiver';
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;

    // Toggle mute click handler
    btn.addEventListener('click', () => {
      const isMuted = !currentState.broadcastMutes[model];
      currentState.broadcastMutes[model] = isMuted;

      if (isMuted) {
        btn.classList.add('muted');
        btn.title = 'Broadcast Receiver: MUTED';
      } else {
        btn.classList.remove('muted');
        btn.title = 'Broadcast Receiver: ACTIVE';
      }

      // Sync the tray badge in the broadcast panel
      const badge = document.querySelector(`.tray-badge[data-indicator="${model}"]`);
      if (badge) {
        if (isMuted) {
          badge.classList.add('broadcast-muted');
        } else {
          badge.classList.remove('broadcast-muted');
        }
      }

      saveConfig();
    });

    // Set initial state based on config
    if (currentState.broadcastMutes[model]) {
      btn.classList.add('muted');
      btn.title = 'Broadcast Receiver: MUTED';
    }

    // Prepend to actions
    actions.insertBefore(btn, actions.firstChild);
  });
}

// Clean up styles to hide sidebars and headers for better layout inside grids
function updateCleanLayout(tabId) {
  const models = [
    'gemini', 'chatgpt', 'claude', 'grok', 'deepseek', 'qwen', 
    'copilot', 'perplexity', 'lechat', 'pi', 'you', 'poe', 
    'characterai', 'metaai', 'kimi', 'jasper', 
    'phind', 'huggingchat', 'duckchat', 'groq', 'blackbox', 
    'cohere', 'openrouter'
  ];

  models.forEach(model => {
    updateCleanLayoutForModel(model, tabId);
  });
}

// Clean layout for a single model
function updateCleanLayoutForModel(model, tabId) {
  const webview = document.getElementById(`wv-${model}`);
  if (!webview) return;

  if (typeof webview.executeJavaScript !== 'function') {
    return;
  }

  const isDashboard = tabId === 'dashboard';
  const isSingleFocus = !isDashboard && tabId === model;

  let cleanCSS = '';
  if (model === 'gemini') {
    cleanCSS = 'gmat-nav-drawer, .gb_xd, header { display: none !important; }';
  } else if (model === 'chatgpt') {
    cleanCSS = 'div[role=\"navigation\"], .hidden.md\\\\:flex { display: none !important; }';
  } else if (model === 'claude') {
    cleanCSS = 'nav, .relative.flex.h-full.w-64 { display: none !important; }';
  } else if (model === 'deepseek') {
    cleanCSS = '.chat-sidebar, .sidebar { display: none !important; }';
  } else {
    cleanCSS = 'aside, nav, [role=\"navigation\"], .sidebar, .left-panel { display: none !important; }';
  }

  webview.executeJavaScript(`
    (function() {
      let styleEl = document.getElementById('omniai-clean-layout-styles');
      if (${isSingleFocus}) {
        if (styleEl) styleEl.remove();
      } else {
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'omniai-clean-layout-styles';
          styleEl.textContent = \`${cleanCSS}\`;
          document.head.appendChild(styleEl);
        }
      }
    })()
  `).catch(err => {
    // Page load may still be pending
  });
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

  // Reset workspace focus states
  mainWorkspace.classList.remove('single-focus-active');
  document.querySelectorAll('.webview-card').forEach(card => card.classList.remove('focus-target'));

  if (tabId === 'dashboard') {
    // Show Dashboard view
    webviewContainer.classList.remove('hidden');
    settingsPane.classList.add('hidden');
    broadcastPanel.classList.remove('hidden');
    
    // Reset layout configuration grid classes
    updateLayoutClass(currentState.layout);
  } else if (tabId === 'settings') {
    // Show Settings view
    webviewContainer.classList.add('hidden');
    settingsPane.classList.remove('hidden');
    broadcastPanel.classList.add('hidden');
  } else {
    // Single Focused Tab (e.g. Gemini, Google Account Manager, etc.)
    webviewContainer.classList.remove('hidden');
    settingsPane.classList.add('hidden');
    broadcastPanel.classList.add('hidden'); // Hide broadcast during single focus

    // Focus target card
    mainWorkspace.classList.add('single-focus-active');
    const targetCard = document.getElementById(`card-${tabId}`);
    if (targetCard) {
      targetCard.classList.add('focus-target');
      // Ensure target is not hidden by dashboard toggles
    }
  }

  // Dynamic layout cleaner (collapses/restores sidebars)
  updateCleanLayout(tabId);
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

// Attach lifecycle events to all webviews in the app
function setupWebviewEvents() {
  const models = [
    'gemini', 'chatgpt', 'claude', 'grok', 'deepseek', 'qwen', 
    'copilot', 'perplexity', 'lechat', 'pi', 'you', 'poe', 
    'characterai', 'metaai', 'kimi', 'jasper', 
    'phind', 'huggingchat', 'duckchat', 'groq', 'blackbox', 
    'cohere', 'openrouter', 'google'
  ];
  
  models.forEach(model => {
    const webview = document.getElementById(`wv-${model}`);
    const card = document.getElementById(`card-${model}`);
    if (!webview || !card) return;
    
    const loader = card.querySelector('.loader-overlay');
    const dot = document.getElementById(`dot-${model}`);

    // Loading started
    webview.addEventListener('did-start-loading', () => {
      loader.classList.remove('hidden');
      if (dot) {
        dot.className = 'nav-status-dot loading';
      }
    });

    // Loading stopped
    webview.addEventListener('did-stop-loading', () => {
      loader.classList.add('hidden');
      if (dot) {
        dot.className = 'nav-status-dot active';
      }
    });

    // DOM Ready
    webview.addEventListener('dom-ready', () => {
      loader.classList.add('hidden');
      if (dot) {
        dot.className = 'nav-status-dot active';
      }
      updateCleanLayoutForModel(model, currentState.activeTab);
    });

    // Load failed
    webview.addEventListener('did-fail-load', (e) => {
      console.error(`Webview load failed for ${model}:`, e);
      loader.classList.remove('hidden');
      const loaderText = loader.querySelector('span');
      if (loaderText) {
        loaderText.innerHTML = `Connection failed.<br><button class="btn" style="margin-top:8px;padding:4px 8px;font-size:11px;" onclick="document.getElementById('wv-${model}').reload()">Retry</button>`;
      }
    });

    // Handle new-window events (Google profile choosers, OAuth redirects, target="_blank")
    webview.addEventListener('new-window', (e) => {
      e.preventDefault();
      webview.src = e.url;
      console.log(`Bypassed webview new-window event for ${model}: loading ${e.url} inside same webview.`);
    });

    // Card Header Controls Setup
    const btnBack = card.querySelector('.btn-back');
    const btnForward = card.querySelector('.btn-forward');
    const btnReload = card.querySelector('.btn-reload');
    const btnFocus = card.querySelector('.btn-focus'); // Might not exist on utility cards

    if (btnBack) {
      btnBack.addEventListener('click', () => {
        if (webview.canGoBack()) webview.goBack();
      });
    }

    if (btnForward) {
      btnForward.addEventListener('click', () => {
        if (webview.canGoForward()) webview.goForward();
      });
    }

    if (btnReload) {
      btnReload.addEventListener('click', () => {
        webview.reload();
      });
    }

    if (btnFocus) {
      btnFocus.addEventListener('click', () => {
        switchTab(model);
      });
    }
  });
}

// Broadcast prompt execution (excludes utility windows like google)
function executeBroadcast() {
  const prompt = broadcastInput.value.trim();
  if (!prompt) return;

  // Add to history
  if (!currentState.broadcastHistory.includes(prompt)) {
    currentState.broadcastHistory.unshift(prompt);
    if (currentState.broadcastHistory.length > 15) {
      currentState.broadcastHistory.pop();
    }
    saveConfig();
  }
  historyIndex = -1; // Reset cycling index

  // Read the injection script code
  let injectionScript = '';
  try {
    const scriptPath = path.join(__dirname, 'injection-script.js');
    injectionScript = fs.readFileSync(scriptPath, 'utf8');
  } catch (err) {
    console.error('Failed to read injection-script.js:', err);
    broadcastStatus.textContent = 'Error: Cannot load injection script.';
    broadcastStatus.className = 'broadcast-status-message danger';
    return;
  }

  // Update Status UI
  broadcastStatus.textContent = 'Injecting prompts into active AIs...';
  broadcastStatus.className = 'broadcast-status-message working';
  
  // Disable controls temporarily
  broadcastInput.disabled = true;
  broadcastSendBtn.disabled = true;
  broadcastSendBtn.style.opacity = '0.5';

  let activeCount = 0;

  // Loop through and inject prompt into enabled models
  Object.keys(currentState.enabledModels).forEach(model => {
    const isEnabled = currentState.enabledModels[model];
    if (!isEnabled) return;

    // Check if muted for broadcast
    if (currentState.broadcastMutes[model]) {
      console.log(`OmniAI: Skipping broadcast injection for muted model: ${model}`);
      return;
    }

    const webview = document.getElementById(`wv-${model}`);
    if (webview) {
      activeCount++;
      const codeToRun = `(${injectionScript})(${JSON.stringify(prompt)});`;
      
      webview.executeJavaScript(codeToRun)
        .then(result => {
          console.log(`Successfully injected into ${model}:`, result);
        })
        .catch(err => {
          console.error(`Failed to inject into ${model}:`, err);
        });
    }
  });

  // Finish broadcast
  setTimeout(() => {
    broadcastInput.value = '';
    broadcastInput.disabled = false;
    broadcastSendBtn.disabled = false;
    broadcastSendBtn.style.opacity = '1';
    
    broadcastStatus.textContent = `Successfully broadcasted to ${activeCount} active AI channels!`;
    broadcastStatus.className = 'broadcast-status-message success';
    
    // Clear success message after 4 seconds
    setTimeout(() => {
      if (broadcastStatus.textContent.includes('Successfully broadcasted')) {
        broadcastStatus.textContent = 'Ready to broadcast';
        broadcastStatus.className = 'broadcast-status-message';
      }
    }, 4000);
  }, 800);
}

// Event Listeners Setup
function setupListeners() {
  // 1. Sidebar Nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      if (tabId) switchTab(tabId);
    });
  });

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
      
      // Update webview src dynamically and reload
      const wvGemini = document.getElementById('wv-gemini');
      if (wvGemini) {
        wvGemini.setAttribute('src', `https://gemini.google.com/app?authuser=${value}`);
        wvGemini.reload();
        console.log(`Switched Gemini to Google account index: ${value}`);
      }
      
      saveConfig();
    });
  }

  // 4. Settings AI Toggles
  Object.keys(currentState.enabledModels).forEach(model => {
    const checkbox = document.getElementById(`toggle-${model}`);
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        currentState.enabledModels[model] = isChecked;
        
        // Update Card
        const card = document.getElementById(`card-${model}`);
        if (card) {
          if (isChecked) {
            card.classList.remove('card-disabled');
          } else {
            card.classList.add('card-disabled');
          }
        }

        // Update Nav status dot
        const dot = document.getElementById(`dot-${model}`);
        const navBtn = document.querySelector(`.nav-item[data-tab="${model}"]`);
        const sidebarCheck = navBtn ? navBtn.querySelector('.sidebar-toggle-check') : null;
        if (isChecked) {
          if (dot) dot.classList.add('active');
          if (navBtn) navBtn.style.opacity = '1';
          if (sidebarCheck) sidebarCheck.checked = true;
        } else {
          if (dot) dot.classList.remove('active');
          if (navBtn) navBtn.style.opacity = '0.5';
          if (sidebarCheck) sidebarCheck.checked = false;
        }

        // Update Tray Badge
        const trayBadge = document.querySelector(`.tray-badge[data-indicator="${model}"]`);
        if (trayBadge) {
          if (isChecked) {
            trayBadge.classList.add('active');
          } else {
            trayBadge.classList.remove('active');
          }
        }

        saveConfig();
      });
    }
  });

  // 5. Settings Session Resets (Clears specific origins inside the shared partition)
  document.querySelectorAll('.btn-danger[data-clear]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const clearTarget = btn.getAttribute('data-clear');
      const origin = btn.getAttribute('data-origin');
      
      let confirmMsg = '';
      if (clearTarget === 'all') {
        confirmMsg = 'Are you sure you want to reset ALL sessions and caches? This logs you out of everything.';
      } else {
        const modelName = btn.textContent.replace('Reset ', '');
        confirmMsg = `Are you sure you want to clear storage and log out of ${modelName}?`;
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
            document.querySelectorAll('webview').forEach(wv => wv.reload());
          } else {
            const wv = document.getElementById(`wv-${clearTarget}`);
            if (wv) wv.reload();
          }
        } else {
          alert(`Failed to clear session: ${result.error || 'Unknown error'}`);
        }
        
        btn.disabled = false;
        btn.textContent = clearTarget === 'all' ? 'Reset All Sessions' : `Reset ${btn.textContent.replace('Clearing...', '')}`;
      }
    });
  });

  // 6. Broadcast Input Keys (Ctrl + Enter to send, Up/Down to cycle history)
  broadcastInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      executeBroadcast();
    } else if (e.key === 'ArrowUp') {
      if (currentState.broadcastHistory.length > 0) {
        // If textarea is empty or we are already cycling, let's go up
        const isCursorAtStart = broadcastInput.selectionStart === 0 && broadcastInput.selectionEnd === 0;
        if (broadcastInput.value.trim() === '' || isCursorAtStart) {
          e.preventDefault();
          if (historyIndex < currentState.broadcastHistory.length - 1) {
            historyIndex++;
            broadcastInput.value = currentState.broadcastHistory[historyIndex];
            // Move cursor to end
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

  // 7. Broadcast Send Button
  broadcastSendBtn.addEventListener('click', executeBroadcast);

  // 8. Theme Accent Buttons
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

  // 9. Window Navigation Hotkeys (Ctrl + D, Ctrl + S, Ctrl + 1..9)
  window.addEventListener('keydown', (e) => {
    // Skip if writing in input or textarea
    if (!document.activeElement || document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.getAttribute('contenteditable') === 'true') {
      return;
    }

    if (e.ctrlKey) {
      if (e.key.toLowerCase() === 'd') {
        e.preventDefault();
        switchTab('dashboard');
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        switchTab('settings');
      } else if (e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        const models = [
          'gemini', 'chatgpt', 'claude', 'grok', 'deepseek', 'qwen', 
          'copilot', 'perplexity', 'lechat', 'pi', 'you', 'poe', 
          'characterai', 'metaai', 'kimi', 'jasper', 
          'phind', 'huggingchat', 'duckchat', 'groq', 'blackbox', 
          'cohere', 'openrouter'
        ];
        if (index < models.length) {
          switchTab(models[index]);
        }
      }
    }
  });

  // 10. Quick Action Template Pills
  document.querySelectorAll('.action-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const template = pill.getAttribute('data-template');
      const formatted = template.replace(/\\n/g, '\n');
      broadcastInput.value = formatted + broadcastInput.value;
      broadcastInput.focus();
      broadcastInput.selectionStart = broadcastInput.selectionEnd = broadcastInput.value.length;
    });
  });

  // 11. Sliding History Drawer Shelf
  const historyDrawer = document.getElementById('history-drawer');
  const historyBtn = document.getElementById('broadcast-history-btn');
  const closeHistoryBtn = document.getElementById('close-history-btn');
  const historyContainer = document.getElementById('history-items-container');

  function renderHistoryDrawer() {
    if (!historyContainer) return;
    historyContainer.innerHTML = '';
    if (currentState.broadcastHistory.length === 0) {
      historyContainer.innerHTML = '<div style="color:var(--text-dark); text-align:center; padding: 20px; font-size:13px;">No history available yet.</div>';
      return;
    }

    currentState.broadcastHistory.forEach((promptText, idx) => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.textContent = promptText;
      item.title = promptText;
      
      item.addEventListener('click', () => {
        broadcastInput.value = promptText;
        historyIndex = idx;
        broadcastInput.focus();
        if (historyDrawer) historyDrawer.classList.add('hidden');
        if (historyBtn) historyBtn.classList.remove('active');
      });

      historyContainer.appendChild(item);
    });
  }

  if (historyBtn && historyDrawer) {
    historyBtn.addEventListener('click', () => {
      const isHidden = historyDrawer.classList.contains('hidden');
      if (isHidden) {
        renderHistoryDrawer();
        historyDrawer.classList.remove('hidden');
        historyBtn.classList.add('active');
      } else {
        historyDrawer.classList.add('hidden');
        historyBtn.classList.remove('active');
      }
    });
  }

  if (closeHistoryBtn && historyDrawer && historyBtn) {
    closeHistoryBtn.addEventListener('click', () => {
      historyDrawer.classList.add('hidden');
      historyBtn.classList.remove('active');
    });
  }
}

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  initUI();
  setupWebviewEvents();
  setupListeners();
});
