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

  // Function to find and click "New Chat" button
  function clickNewChat() {
    const url = window.location.href;
    let newChatBtn = null;

    if (url.includes('chatgpt.com')) newChatBtn = document.querySelector('a[href="/"]') || document.querySelector('[data-testid="sidebar-new-chat-button"]');
    else if (url.includes('claude.ai')) newChatBtn = document.querySelector('a[href="/new"]') || document.querySelector('a[href="/chat/new"]');
    else if (url.includes('perplexity.ai')) newChatBtn = document.querySelector('button[aria-label="New Thread"]');
    else if (url.includes('gemini.google.com')) newChatBtn = document.querySelector('a[href="/app"]');
    else if (url.includes('deepseek.com')) newChatBtn = document.querySelector('div[role="button"][aria-label*="New"]');
    else if (url.includes('pi.ai')) newChatBtn = document.querySelector('button[aria-label*="new thread" i]');

    if (!newChatBtn) {
      const linksAndBtns = Array.from(document.querySelectorAll('a, button, div[role="button"]'));
      newChatBtn = linksAndBtns.find(el => {
        const text = (el.textContent || '').toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        return (text.includes('new chat') || text.includes('new thread') || aria.includes('new chat') || aria.includes('new thread')) 
               && el.offsetHeight > 0 && el.offsetWidth > 0;
      });
    }

    if (newChatBtn) {
      console.log("OmniAI: Clicking New Chat button...", newChatBtn);
      clickButton(newChatBtn);
      return true;
    }
    return false;
  }

  // Find the text input area based on specific site heuristics
  function findInput() {
    const url = window.location.href;

    if (url.includes('chatgpt.com')) return document.querySelector('#prompt-textarea');
    if (url.includes('gemini.google.com')) return document.querySelector('div[contenteditable="true"]') || document.querySelector('rich-textarea');
    if (url.includes('claude.ai')) return document.querySelector('div[contenteditable="true"]');
    if (url.includes('grok.com')) return document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
    if (url.includes('deepseek.com')) return document.querySelector('#chat-input') || document.querySelector('textarea');
    if (url.includes('qwenlm.ai')) return document.querySelector('textarea');
    if (url.includes('copilot.microsoft.com')) return document.querySelector('textarea') || document.querySelector('#searchbar');
    if (url.includes('perplexity.ai')) return document.querySelector('textarea');
    if (url.includes('chat.mistral.ai')) return document.querySelector('textarea');
    if (url.includes('pi.ai')) return document.querySelector('textarea') || document.querySelector('input');
    if (url.includes('you.com')) return document.querySelector('textarea');
    if (url.includes('poe.com')) return document.querySelector('textarea');
    if (url.includes('character.ai')) return document.querySelector('textarea');
    if (url.includes('meta.ai')) return document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
    if (url.includes('kimi.moonshot.cn')) return document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
    if (url.includes('jasper.ai')) return document.querySelector('textarea');
    if (url.includes('groq.com')) return document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
    if (url.includes('blackbox.ai')) return document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
    if (url.includes('cohere.com')) return document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
    if (url.includes('openrouter.ai')) return document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
    if (url.includes('phind.com')) return document.querySelector('textarea');
    if (url.includes('huggingface.co')) return document.querySelector('textarea');
    if (url.includes('duckduckgo.com')) return document.querySelector('input[type="text"]') || document.querySelector('textarea');
    if (url.includes('z.ai')) return document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');

    const contentEditables = Array.from(document.querySelectorAll('div[contenteditable="true"]'));
    if (contentEditables.length > 0) {
      const visible = contentEditables.find(el => el.offsetWidth > 0 && el.offsetHeight > 0);
      if (visible) return visible;
    }

    const textareas = Array.from(document.querySelectorAll('textarea'));
    if (textareas.length > 0) {
      const visible = textareas
        .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0)
        .sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight))[0];
      if (visible) return visible;
    }

    return document.querySelector('input[type="text"]');
  }

  // Find the send button
  function findSendButton(inputElement) {
    const url = window.location.href;

    if (url.includes('chatgpt.com')) return document.querySelector('[data-testid="send-button"]') || document.querySelector('button.mb-1');
    if (url.includes('gemini.google.com')) return document.querySelector('button[aria-label="Send message"]') || document.querySelector('.send-button');
    if (url.includes('claude.ai')) return document.querySelector('button[aria-label="Send Message"]') || document.querySelector('button.bg-accent');
    if (url.includes('deepseek.com')) return document.querySelector('div[role="button"]') || document.querySelector('button[aria-label="Send Message"]');
    if (url.includes('phind.com')) return document.querySelector('button[type="submit"]');
    if (url.includes('huggingface.co')) return document.querySelector('button[type="submit"]');
    if (url.includes('duckduckgo.com')) return document.querySelector('button[type="submit"]');

    if (inputElement) {
      let parent = inputElement.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        const btn = parent.querySelector('button[type="submit"], button[aria-label*="send" i], button[aria-label*="submit" i]');
        if (btn && btn !== inputElement && !btn.disabled) return btn;
        parent = parent.parentElement;
      }
    }
    return null;
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
    } else if (input.getAttribute('contenteditable') === 'true' || input.tagName === 'RICH-TEXTAREA') {
      input.innerHTML = '';
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

    // Wait briefly for react/framework states to synchronize before submit
    setTimeout(() => {
      const sendBtn = findSendButton(inputEl);
      if (sendBtn && !sendBtn.disabled && clickButton(sendBtn)) {
        console.log("OmniAI: Prompt submitted via send button click.");
      } else {
        // Fallback: Dispatch comprehensive Enter keypress on the input element
        console.log("OmniAI: Send button not found or click failed. Simulating Enter keypress.");
        const enterDown = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
        const enterPress = new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
        const enterUp = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
        
        if (inputEl.form) {
          inputEl.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
        
        inputEl.dispatchEvent(enterDown);
        inputEl.dispatchEvent(enterPress);
        inputEl.dispatchEvent(enterUp);
      }
    }, 250);
  }, didClickNewChat ? 1500 : 100);

})
