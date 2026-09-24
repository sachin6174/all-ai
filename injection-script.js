/**
 * OmniAI Chat - Webview Prompt Injection Script
 * Optimized for React, ProseMirror, Lexical, and other modern frontend frameworks.
 */
(function(promptText) {
  console.log("OmniAI: Starting prompt injection...", promptText);

  // Helper to trigger events
  function triggerEvents(element) {
    const events = ['input', 'change', 'blur'];
    events.forEach(eventName => {
      const event = new Event(eventName, { bubbles: true, cancelable: true });
      element.dispatchEvent(event);
    });
  }

  // Helper to click a button with full mouse simulation
  function clickButton(btn) {
    if (!btn) return false;
    btn.focus();
    
    const mouseEvents = ['mouseenter', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    mouseEvents.forEach(evtType => {
      const evt = new MouseEvent(evtType, { bubbles: true, cancelable: true, view: window, buttons: 1 });
      btn.dispatchEvent(evt);
    });
    
    console.log("OmniAI: Clicked button successfully", btn);
    return true;
  }

  // Hostname match helper: exact domain or any subdomain of it. Plain
  // substring checks on the URL (e.g. 'pi.ai', 'z.ai') matched unrelated sites.
  const host = window.location.hostname;
  function onHost(...domains) {
    return domains.some(d => host === d || host.endsWith('.' + d));
  }

  function isVisible(el) {
    return !!el && el.offsetWidth > 0 && el.offsetHeight > 0;
  }

  function firstVisible(selector) {
    return Array.from(document.querySelectorAll(selector)).find(isVisible) || null;
  }

  // Function to find and click "New Chat" button
  function clickNewChat() {
    let newChatBtn = null;

    if (onHost('chatgpt.com')) newChatBtn = document.querySelector('[data-testid="create-new-chat-button"]') || document.querySelector('[data-testid="sidebar-new-chat-button"]') || document.querySelector('a[href="/"]');
    else if (onHost('claude.ai')) newChatBtn = document.querySelector('a[href="/new"]') || document.querySelector('a[href="/chat/new"]');
    else if (onHost('perplexity.ai')) newChatBtn = document.querySelector('button[aria-label="New Thread"]');
    else if (onHost('gemini.google.com')) newChatBtn = document.querySelector('a[href="/app"]');
    else if (onHost('deepseek.com')) newChatBtn = document.querySelector('div[role="button"][aria-label*="New"]');
    else if (onHost('pi.ai')) newChatBtn = document.querySelector('button[aria-label*="new thread" i]');

    if (!newChatBtn) {
      const linksAndBtns = Array.from(document.querySelectorAll('a, button, div[role="button"]'));
      newChatBtn = linksAndBtns.find(el => {
        const text = (el.textContent || '').trim().toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        return text.length < 40 &&
               (text.includes('new chat') || text.includes('new thread') || aria.includes('new chat') || aria.includes('new thread'))
               && isVisible(el);
      });
    }

    if (newChatBtn && isVisible(newChatBtn)) {
      console.log("OmniAI: Clicking New Chat button...", newChatBtn);
      clickButton(newChatBtn);
      return true;
    }
    return false;
  }

  // Site-specific input selectors (tried in order; first visible match wins)
  const INPUT_SELECTORS = [
    [['chatgpt.com'], ['#prompt-textarea', 'div[contenteditable="true"]', 'textarea']],
    [['gemini.google.com'], ['rich-textarea div[contenteditable="true"]', 'div[contenteditable="true"]']],
    [['claude.ai'], ['div[contenteditable="true"].ProseMirror', 'div[contenteditable="true"]']],
    [['deepseek.com'], ['#chat-input', 'textarea']],
    [['grok.com'], ['textarea', 'div[contenteditable="true"]']],
    [['perplexity.ai'], ['#ask-input', 'textarea', 'div[contenteditable="true"]']],
    [['copilot.microsoft.com'], ['#userInput', 'textarea', '#searchbar']],
    [['duckduckgo.com', 'duck.ai'], ['textarea[name="user-prompt"]', 'textarea', 'input[type="text"]']],
    [['google.com'], ['textarea[name="q"]', 'textarea', 'div[contenteditable="true"]']],
    [['pi.ai'], ['textarea', 'input[type="text"]']],
    [['character.ai', 'poe.com', 'huggingface.co', 'phind.com', 'chat.mistral.ai', 'qwen.ai', 'qwenlm.ai'], ['textarea', 'div[contenteditable="true"]']],
  ];

  // Find the text input area based on specific site heuristics
  function findInput() {
    for (const [domains, selectors] of INPUT_SELECTORS) {
      if (!onHost(...domains)) continue;
      for (const selector of selectors) {
        const el = firstVisible(selector);
        if (el) return el;
      }
    }

    // Generic fallback: visible contenteditable, then the largest visible textarea
    const editable = firstVisible('div[contenteditable="true"], [contenteditable="plaintext-only"]');
    if (editable) return editable;

    const textarea = Array.from(document.querySelectorAll('textarea'))
      .filter(isVisible)
      .sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight))[0];
    if (textarea) return textarea;

    return firstVisible('input[type="text"], input:not([type])');
  }

  // Find the send button
  function findSendButton(inputElement) {
    let btn = null;
    if (onHost('chatgpt.com')) btn = document.querySelector('[data-testid="send-button"]') || document.querySelector('#composer-submit-button');
    else if (onHost('gemini.google.com')) btn = document.querySelector('button[aria-label="Send message"]') || document.querySelector('.send-button');
    else if (onHost('claude.ai')) btn = document.querySelector('button[aria-label="Send message"]') || document.querySelector('button[aria-label="Send Message"]');
    else if (onHost('perplexity.ai')) btn = document.querySelector('button[aria-label="Submit"]') || document.querySelector('button[data-testid="submit-button"]');
    if (btn) return btn;

    if (inputElement) {
      let parent = inputElement.parentElement;
      for (let i = 0; i < 6 && parent; i++) {
        const candidate = parent.querySelector(
          'button[type="submit"], button[aria-label*="send" i], button[aria-label*="submit" i], ' +
          'button[data-testid*="send" i], button[title*="send" i]'
        );
        if (candidate && candidate !== inputElement) return candidate;
        parent = parent.parentElement;
      }
    }
    return null;
  }

  function isButtonDisabled(btn) {
    return btn.disabled || btn.getAttribute('aria-disabled') === 'true';
  }

  // Main input setting function
  function inputPrompt(input, text) {
    input.focus();

    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      try {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        if (input.tagName === 'TEXTAREA') {
          nativeTextAreaValueSetter.call(input, text);
        } else {
          nativeInputValueSetter.call(input, text);
        }
      } catch (err) {
        input.value = text;
      }
      
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } else if (input.isContentEditable || input.tagName === 'RICH-TEXTAREA') {
      // Select existing content and replace it via insertText; wiping innerHTML
      // first corrupts editor state in ProseMirror/Lexical based inputs
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(input);
        selection.removeAllRanges();
        selection.addRange(range);
        
        if (document.execCommand('insertText', false, text)) {
          triggerEvents(input);
          return true;
        }
      } catch (err) {}

      input.textContent = text;
      triggerEvents(input);
      return true;
    }
    return false;
  }

  // Attempt Execution
  const didClickNewChat = clickNewChat();
  
  // Wait for the UI to settle (especially if New Chat was clicked and React needs to re-render)
  setTimeout(() => {
    const inputEl = findInput();
    if (!inputEl) {
      console.error("OmniAI: Could not find prompt input field!");
      return;
    }

    const success = inputPrompt(inputEl, promptText);
    if (!success) {
      return;
    }

    // Wait for react/framework state to enable the send button, then submit.
    // Polls instead of a single fixed delay: fast sites submit immediately,
    // slow ones still get up to ~2.5s.
    let attempts = 0;
    const trySubmit = () => {
      const sendBtn = findSendButton(inputEl);
      if (sendBtn && !isButtonDisabled(sendBtn)) {
        clickButton(sendBtn);
        console.log("OmniAI: Prompt submitted via send button click.");
        return;
      }
      // Wait for a found-but-disabled button up to ~2.5s; give up on a
      // missing button sooner (~0.5s) and fall back to Enter
      attempts++;
      if (attempts < (sendBtn ? 25 : 5)) {
        setTimeout(trySubmit, 100);
        return;
      }
      // Fallback: Dispatch comprehensive Enter keypress on the input element
      console.log("OmniAI: Send button not found or disabled. Simulating Enter keypress.");
      const init = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
      inputEl.focus();
      const handledBySite = !inputEl.dispatchEvent(new KeyboardEvent('keydown', init));
      inputEl.dispatchEvent(new KeyboardEvent('keypress', init));
      inputEl.dispatchEvent(new KeyboardEvent('keyup', init));
      // Only submit the form directly if the page didn't already handle Enter
      if (!handledBySite && inputEl.form && typeof inputEl.form.requestSubmit === 'function') {
        try { inputEl.form.requestSubmit(); } catch (e) {}
      }
    };
    setTimeout(trySubmit, 150);
  }, didClickNewChat ? 1500 : 100);

})
