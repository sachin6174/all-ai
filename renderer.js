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
  promptsHistory: [],
  enabledModels: {
    gemini: true,
    chatgpt: true,
    zai: true,
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
      currentState = { ...currentState, ...parsed };
      if (!currentState.promptsHistory) {
        currentState.promptsHistory = [];
      }
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

  // Inject sidebar toggles dynamically
  injectSidebarToggles();

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
    }
  });

  // 4. Setup active tab
  switchTab(currentState.activeTab);

  // 5. Update workspace monitor widget
  updateWorkspaceWidget();
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
      updateWorkspaceWidget();
    });

    navBtn.appendChild(checkbox);
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

// Attach lifecycle events to all webviews in the app
function setupWebviewEvents() {
  const models = [
    'gemini', 'chatgpt', 'zai', 'claude', 'grok', 'deepseek', 'qwen', 
    'copilot', 'perplexity', 'lechat', 'pi', 'you', 'poe', 
    'characterai', 'metaai', 'kimi', 'jasper', 
    'phind', 'huggingchat', 'duckchat', 'groq', 'blackbox', 
    'cohere', 'openrouter', 'google'
  ];
  
  models.forEach(model => {
    const webview = document.getElementById(`wv-${model}`);
    const card = document.getElementById(`card-${model}`);
    const loader = card.querySelector('.loader-overlay');
    const dot = document.getElementById(`dot-${model}`);

    if (!webview) return;

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
      
      // Inject text monitor script if not the Google Sign-in helper card
      if (model !== 'google') {
        webview.executeJavaScript(guestMonitorScript)
          .catch(err => console.error(`[${model}] Monitor injection failed:`, err));
      }
    });

    // Handle incoming prompts from console messages
    if (model !== 'google') {
      webview.addEventListener('console-message', (e) => {
        const msg = e.message;
        if (msg && msg.startsWith('OMNIAI_PROMPT_SUBMIT:')) {
          const promptText = msg.substring('OMNIAI_PROMPT_SUBMIT:'.length).trim();
          if (promptText) {
            // Capitalize model name for clean display badge
            const prettySource = model.charAt(0).toUpperCase() + model.slice(1);
            addPromptToHistory(promptText, prettySource);
          }
        }
      });
    }

    // Load failed
    webview.addEventListener('did-fail-load', (e) => {
      console.error(`Webview load failed for ${model}:`, e);
      loader.classList.remove('hidden');
      const loaderText = loader.querySelector('span');
      if (loaderText) {
        loaderText.innerHTML = `Connection failed.<br><button class="btn" style="margin-top:8px;padding:4px 8px;font-size:11px;" onclick="document.getElementById('wv-${model}').reload()">Retry</button>`;
      }
    });

    // (The new-window event listener was removed so 'allowpopups' works natively)

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
  addPromptToHistory(prompt, 'Broadcast');
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
        updateWorkspaceWidget();
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
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.getAttribute('contenteditable') === 'true') {
      return;
    }

    if (e.ctrlKey) {
      if (e.key.toLowerCase() === 'd') {
        e.preventDefault();
        switchTab('dashboard');
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        switchTab('settings');
      } else if (e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openCmdPalette();
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

  // 10. Prompt History Search and Clear
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

  // 11. Workspace Monitor Widget Quick Actions
  const widgetPaletteBtn = document.getElementById('widget-btn-palette');
  if (widgetPaletteBtn) {
    widgetPaletteBtn.addEventListener('click', openCmdPalette);
  }

  const widgetTemplatesBtn = document.getElementById('widget-btn-templates');
  if (widgetTemplatesBtn) {
    widgetTemplatesBtn.addEventListener('click', openTemplatesModal);
  }
}

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  initUI();
  setupWebviewEvents();
  setupListeners();
  initSidebarCollapse();
  initSidebarSearch();
  initCmdPalette();
  initTemplates();
  initZoomControls();
  initAlwaysOnTop();
  initBroadcastEnhancements();
});


/* =================================================================
   FEATURE: Sidebar Collapse
================================================================= */
let sidebarCollapsed = JSON.parse(localStorage.getItem('omniai_sidebar_collapsed') || 'false');
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
   FEATURE: Command Palette
================================================================= */
const CMD_ITEMS = [
  { label: 'Dashboard',        badge: 'Ctrl+D', icon: '⊞', action: () => switchTab('dashboard') },
  { label: 'Settings',         badge: 'Ctrl+S', icon: '⚙',  action: () => switchTab('settings') },
  { label: 'Toggle Sidebar',   badge: 'Ctrl+B', icon: '◧',  action: () => toggleSidebar() },
  { label: 'Always on Top',    badge: '',       icon: '📌',  action: () => toggleAlwaysOnTop() },
  { label: 'Open Templates',   badge: '',       icon: '📄',  action: () => openTemplatesModal() },
  { label: 'Broadcast',        badge: 'Ctrl+↵', icon: '📡',  action: () => document.getElementById('broadcast-send-btn').click() },
  ...['gemini','chatgpt','zai','claude','grok','deepseek','qwen','copilot','perplexity',
      'lechat','pi','you','poe','characterai','metaai','kimi','jasper',
      'phind','huggingchat','duckchat','groq','blackbox','cohere','openrouter'].map((id, i) => ({
    label: (document.querySelector(`.nav-item[data-tab="${id}"] .nav-label`)?.textContent || id),
    badge: i < 9 ? `Ctrl+${i+1}` : '',
    icon: '🤖',
    action: () => switchTab(id)
  }))
];

let cmdHighlightIndex = 0;
let currentCmdItems = [];

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
  const q = query.toLowerCase();
  currentCmdItems = q ? CMD_ITEMS.filter(i => i.label.toLowerCase().includes(q)) : CMD_ITEMS;
  cmdHighlightIndex = 0;
  const container = document.getElementById('cmd-results');
  container.innerHTML = '';
  currentCmdItems.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = 'cmd-item' + (idx === 0 ? ' highlighted' : '');
    el.innerHTML = `<span>${item.icon}</span><span>${item.label}</span>${item.badge ? `<span class="cmd-item-badge">${item.badge}</span>` : ''}`;
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
    if (e.ctrlKey && e.key.toLowerCase() === 'k') {
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
let promptTemplates = JSON.parse(localStorage.getItem('omniai_templates') || '[]');

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
      <span class="template-item-name" title="${tpl.name}">${tpl.name}</span>
      <span class="template-item-preview" title="${tpl.body}">${tpl.body}</span>
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
   FEATURE: Per-Webview Zoom Controls
================================================================= */
const webviewZoomLevels = {};

function initZoomControls() {
  document.querySelectorAll('.webview-card').forEach(card => {
    const wv = card.querySelector('webview');
    if (!wv) return;
    const wvId = wv.id;
    webviewZoomLevels[wvId] = 1.0;

    card.querySelector('.btn-zoom-in')?.addEventListener('click', (e) => {
      e.stopPropagation();
      webviewZoomLevels[wvId] = Math.min(3.0, (webviewZoomLevels[wvId] || 1.0) + 0.1);
      wv.setZoomFactor(webviewZoomLevels[wvId]);
    });

    card.querySelector('.btn-zoom-out')?.addEventListener('click', (e) => {
      e.stopPropagation();
      webviewZoomLevels[wvId] = Math.max(0.3, (webviewZoomLevels[wvId] || 1.0) - 0.1);
      wv.setZoomFactor(webviewZoomLevels[wvId]);
    });
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
}


/* =================================================================
   FEATURE: Broadcast Sound + Flash Notification
================================================================= */
function playBroadcastDoneSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
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

function initBroadcastEnhancements() {
  // Observe broadcast status changes to trigger sound + flash
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(m => {
      if (m.type === 'characterData' || m.type === 'childList') {
        const text = broadcastStatus.textContent || '';
        if (text.toLowerCase().includes('done') || text.toLowerCase().includes('complete') || text.toLowerCase().includes('sent')) {
          playBroadcastDoneSound();
          const panel = document.getElementById('broadcast-panel');
          panel.classList.add('flash');
          setTimeout(() => panel.classList.remove('flash'), 800);
        }
      }
    });
  });
  if (broadcastStatus) {
    observer.observe(broadcastStatus, { characterData: true, childList: true, subtree: true });
  }
}

/* =================================================================
   FEATURE: Webview guest monitor injection script
================================================================= */
const guestMonitorScript = `
  (function() {
    if (window.hasOwnProperty('__omniai_monitor_active')) return;
    window.__omniai_monitor_active = true;
    
    let lastTypedText = '';
    
    // Monitor inputs and updates on textareas/editable divs
    document.addEventListener('input', (e) => {
      const el = e.target;
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        lastTypedText = el.value;
      } else if (el.getAttribute('contenteditable') === 'true') {
        lastTypedText = el.innerText;
      }
    }, true);
    
    // Listen to Enter key submissions
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        const text = lastTypedText.trim();
        if (text) {
          console.log("OMNIAI_PROMPT_SUBMIT:" + text);
        }
      }
    }, true);
    
    // Listen to Send button clicks
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button, [role="button"], a');
      if (btn) {
        const isSendBtn = btn.querySelector('svg') || 
                         btn.getAttribute('aria-label')?.toLowerCase().includes('send') ||
                         btn.getAttribute('aria-label')?.toLowerCase().includes('submit') ||
                         btn.className?.toLowerCase().includes('send') ||
                         btn.className?.toLowerCase().includes('submit') ||
                         btn.textContent?.toLowerCase().includes('send') ||
                         btn.getAttribute('data-testid')?.toLowerCase().includes('send');
        if (isSendBtn) {
          const text = lastTypedText.trim();
          if (text) {
            console.log("OMNIAI_PROMPT_SUBMIT:" + text);
          }
        }
      }
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
  
  // Keep max 100 entries
  if (currentState.promptsHistory.length > 100) {
    currentState.promptsHistory.pop();
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
  
  // Source color styling classes or badges
  const sourceClass = item.source.toLowerCase().replace('.', '').replace(' ', '');
  
  el.innerHTML = `
    <div class="history-item-header">
      <span class="history-badge ${sourceClass}-color-bg">${item.source}</span>
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
    navigator.clipboard.writeText(item.text);
    
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

function escapeHtml(text) {
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
   FEATURE: Workspace Monitor Widget updater
================================================================= */
function updateWorkspaceWidget() {
  const activeAisEl = document.getElementById('widget-active-ais');
  const totalPromptsEl = document.getElementById('widget-total-prompts');
  const pinnedListEl = document.getElementById('widget-pinned-list');
  
  if (!activeAisEl && !totalPromptsEl && !pinnedListEl) return;
  
  // Calculate active AI count (excluding utility tabs like google or you widget itself)
  const models = Object.keys(currentState.enabledModels).filter(m => m !== 'google' && m !== 'you');
  const activeCount = models.filter(m => currentState.enabledModels[m]).length;
  
  if (activeAisEl) {
    activeAisEl.textContent = `${activeCount} / ${models.length}`;
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

