/**
 * GrowthMachine Studio AI Assistant Frontend Client
 * Interacts with /api/chat powered by Cloudflare Worker + OpenRouter
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'gms_chat_session_id';
  const HISTORY_STORAGE_KEY = 'gms_chat_history_cache';

  function getSessionId() {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }

  function getCachedHistory() {
    try {
      const data = localStorage.getItem(HISTORY_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  function saveMessageToCache(role, content) {
    try {
      const history = getCachedHistory();
      history.push({ role, content, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
      if (history.length > 30) history.shift();
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
      console.warn('Cache write failed:', e);
    }
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatBotMessage(text) {
    let clean = escapeHTML(text);
    // Convert bullet points
    clean = clean.replace(/(?:^|\n)[•\-*]\s+(.+)/g, '<br>• $1');
    // Convert bold text **word**
    clean = clean.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Convert URLs into clickable links
    clean = clean.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:#ffaa00;text-decoration:underline;">$1</a>');
    return clean;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('chat-widget-toggle');
    const panel = document.getElementById('chat-panel');
    const closeBtn = document.getElementById('chat-close-btn');
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');
    const messagesContainer = document.getElementById('chat-messages');
    const typingIndicator = document.getElementById('chat-typing');
    const sendBtn = document.getElementById('chat-send-btn');
    const chips = document.querySelectorAll('.chat-chip');
    const unreadBadge = document.getElementById('chat-unread-badge');

    if (!toggleBtn || !panel || !form || !input || !messagesContainer) return;

    let isOpen = false;

    // Toggle Chat Panel
    function toggleChat() {
      isOpen = !isOpen;
      if (isOpen) {
        panel.classList.add('active');
        if (unreadBadge) unreadBadge.style.display = 'none';
        setTimeout(() => input.focus(), 150);
        scrollToBottom();
      } else {
        panel.classList.remove('active');
      }
    }

    toggleBtn.addEventListener('click', toggleChat);
    if (closeBtn) closeBtn.addEventListener('click', toggleChat);

    // Render message into DOM
    function renderMessage(role, text, time) {
      const msgDiv = document.createElement('div');
      msgDiv.className = `chat-msg ${role}`;
      
      const formattedText = role === 'bot' ? formatBotMessage(text) : escapeHTML(text);
      const displayTime = time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      msgDiv.innerHTML = `
        <div class="chat-bubble">${formattedText}</div>
        <span class="chat-timestamp">${displayTime}</span>
      `;
      messagesContainer.appendChild(msgDiv);
      scrollToBottom();
    }

    function scrollToBottom() {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function showTyping() {
      if (typingIndicator) {
        typingIndicator.style.display = 'flex';
        scrollToBottom();
      }
      if (sendBtn) sendBtn.disabled = true;
    }

    function hideTyping() {
      if (typingIndicator) {
        typingIndicator.style.display = 'none';
      }
      if (sendBtn) sendBtn.disabled = false;
    }

    // Restore cached history on load
    const cached = getCachedHistory();
    if (cached && cached.length > 0) {
      cached.forEach(m => renderMessage(m.role, m.content, m.time));
    } else {
      // Default welcome message
      renderMessage(
        'bot',
        "👋 Hi! I'm your GrowthMachine Studio AI consultant. Ask me about our websites, custom pricing, or how we can help your business get more clients online!"
      );
    }

    // Quick chip suggestion clicks
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const text = chip.getAttribute('data-prompt') || chip.textContent.trim();
        input.value = text;
        form.dispatchEvent(new Event('submit', { cancelable: true }));
      });
    });

    // Send user message
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const messageText = input.value.trim();
      if (!messageText) return;

      // Add user message to UI
      renderMessage('user', messageText);
      saveMessageToCache('user', messageText);
      input.value = '';
      showTyping();

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: messageText,
            session_id: getSessionId(),
          }),
        });

        const data = await res.json();
        hideTyping();

        const botReply = data.reply || "Thanks for your inquiry! Our team is available on WhatsApp at +91 75575 75514 for rapid custom quotes.";
        renderMessage('bot', botReply);
        saveMessageToCache('bot', botReply);
      } catch (err) {
        console.error('Chat error:', err);
        hideTyping();
        renderMessage(
          'bot',
          "I'm momentarily disconnected, but our team is active! Feel free to chat with us directly on WhatsApp at +91 75575 75514 for instant pricing and mockups."
        );
      }
    });
  });
})();
