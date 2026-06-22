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
    
    // Simulate full mouse interaction sequence
    const mouseEvents = ['mouseenter', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    mouseEvents.forEach(evtType => {
      const evt = new MouseEvent(evtType, {
        bubbles: true,
        cancelable: true,
        view: window,
        buttons: 1
      });
      btn.dispatchEvent(evt);
    });
    
    console.log("OmniAI: Clicked button successfully", btn);
    return true;
  }

  // Find the text input area based on specific site heuristics
  function findInput() {
    const url = window.location.href;

    if (url.includes('chatgpt.com')) {
      return document.querySelector('#prompt-textarea');
    }
    if (url.includes('gemini.google.com')) {
      return document.querySelector('div[contenteditable="true"]');
    }
    if (url.includes('claude.ai')) {
      return document.querySelector('div[contenteditable="true"]');
    }
    if (url.includes('grok.com')) {
      return document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
    }
    if (url.includes('deepseek.com')) {
      return document.querySelector('#chat-input') || document.querySelector('textarea');
    }
    if (url.includes('qwenlm.ai')) {
      return document.querySelector('textarea');
    }
    if (url.includes('copilot.microsoft.com')) {
      return document.querySelector('textarea') || document.querySelector('#searchbar');
    }
    if (url.includes('perplexity.ai')) {
      return document.querySelector('textarea');
    }
    if (url.includes('chat.mistral.ai')) {
      return document.querySelector('textarea');
    }
    if (url.includes('pi.ai')) {
      return document.querySelector('textarea') || document.querySelector('input');
    }
    if (url.includes('you.com')) {
      return document.querySelector('textarea');
    }
    if (url.includes('poe.com')) {
      return document.querySelector('textarea');
    }
    if (url.includes('character.ai')) {
      return document.querySelector('textarea');
    }
    if (url.includes('meta.ai')) {
      return document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
    }
    if (url.includes('kimi.moonshot.cn')) {
      return document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
    }
    if (url.includes('jasper.ai')) {
      return document.querySelector('textarea');
    }
    if (url.includes('groq.com')) {
      return document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
    }
    if (url.includes('blackbox.ai')) {
      return document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
    }
    if (url.includes('cohere.com')) {
      return document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
    }
    if (url.includes('openrouter.ai')) {
      return document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
    }

    // Heuristics fallback: find the main chat textbox
    // 1. Contenteditable divs (common in Slate, ProseMirror, Lexical, DraftJS)
    const contentEditables = Array.from(document.querySelectorAll('div[contenteditable="true"]'));
    if (contentEditables.length > 0) {
      const visible = contentEditables.find(el => el.offsetWidth > 0 && el.offsetHeight > 0);
      if (visible) return visible;
    }

    // 2. Textareas
    const textareas = Array.from(document.querySelectorAll('textarea'));
    if (textareas.length > 0) {
      const visible = textareas
        .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0)
        .sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight))[0];
      if (visible) return visible;
    }

    // 3. Text inputs
    return document.querySelector('input[type="text"]');
  }

  // Find the send button based on specific site heuristics or fallbacks
  function findSendButton(inputElement) {
    const url = window.location.href;

    if (url.includes('chatgpt.com')) {
      return document.querySelector('[data-testid="send-button"]') || 
             document.querySelector('button[aria-label="Send prompt"]') ||
             document.querySelector('button.mb-1');
    }
    if (url.includes('gemini.google.com')) {
      return document.querySelector('button[aria-label="Send message"]') || 
             document.querySelector('.send-button') ||
             document.querySelector('button.send-button-large');
    }
    if (url.includes('claude.ai')) {
      return document.querySelector('button[aria-label="Send Message"]') || 
             document.querySelector('button.bg-accent');
    }
    if (url.includes('deepseek.com')) {
      return document.querySelector('div[role="button"]') || 
             document.querySelector('button[aria-label="Send Message"]') ||
             document.querySelector('.send-btn') || 
             (inputElement && inputElement.parentElement.querySelector('button'));
    }

    // General fallback: search buttons with SVG symbols (like paper plane / arrow up)
    const buttons = Array.from(document.querySelectorAll('button'));
    
    // Look for buttons near the input field first
    if (inputElement) {
      let parent = inputElement.parentElement;
      for (let i = 0; i < 4 && parent; i++) {
        const btn = parent.querySelector('button');
        if (btn && btn !== inputElement) return btn;
        parent = parent.parentElement;
      }
    }

    // Filter by text/aria attributes
    const candidateBtn = buttons.find(btn => {
      const text = (btn.textContent || '').toLowerCase();
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      return label.includes('send') || label.includes('submit') || text.includes('send') || text.includes('submit');
    });
    if (candidateBtn) return candidateBtn;

    // Filter by icon SVGs (paper plane, arrows)
    const svgBtn = buttons.find(btn => {
      const html = btn.innerHTML.toLowerCase();
      return html.includes('svg') && (
        html.includes('arrow') || 
        html.includes('send') || 
        html.includes('plane') || 
        html.includes('submit') ||
        html.includes('path')
      );
    });
    return svgBtn || null;
  }

  // Main input setting function
  function inputPrompt(input, text) {
    input.focus();

    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      try {
        const prototype = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
        nativeSetter.call(input, text);
      } catch (err) {
        console.warn("OmniAI: React value setter bypass failed, using standard value assignment.", err);
        input.value = text;
      }
      
      triggerEvents(input);
      return true;
    } else if (input.getAttribute('contenteditable') === 'true') {
      input.innerHTML = '';
      
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(input);
        selection.removeAllRanges();
        selection.addRange(range);
        
        if (document.execCommand('insertText', false, text)) {
          console.log("OmniAI: InsertText command ran successfully.");
          triggerEvents(input);
          return true;
        }
      } catch (err) {
        console.warn("OmniAI: execCommand insertText failed, falling back to textContent", err);
      }

      // Fallback
      input.textContent = text;
      triggerEvents(input);
      return true;
    }
    return false;
  }

  // Attempt execution
  const inputEl = findInput();
  if (!inputEl) {
    console.error("OmniAI: Could not find prompt input field!");
    return "Input field not found";
  }

  const success = inputPrompt(inputEl, promptText);
  if (!success) {
    console.error("OmniAI: Failed to set value in input field!");
    return "Failed to set input value";
  }

  // Wait briefly for react/framework states to synchronize before submit
  setTimeout(() => {
    const sendBtn = findSendButton(inputEl);
    if (sendBtn && clickButton(sendBtn)) {
      console.log("OmniAI: Prompt submitted via send button click.");
    } else {
      // Fallback: Dispatch Enter keypress on the input element
      console.log("OmniAI: Send button not found or click failed. Simulating Enter keypress.");
      const enterDown = new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
      });
      const enterUp = new KeyboardEvent('keyup', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
      });
      inputEl.dispatchEvent(enterDown);
      inputEl.dispatchEvent(enterUp);
    }
  }, 150);

  return "Success";
})
