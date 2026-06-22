export const WIDGET_JS = `
(function () {
  'use strict';

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  var script = document.currentScript || (function () {
    var tags = document.querySelectorAll('script[data-bot-id]');
    return tags[tags.length - 1];
  })();

  var BOT_ID = script && script.getAttribute('data-bot-id');
  if (!BOT_ID) { console.warn('[Webchat] data-bot-id no especificado'); return; }

  var API_BASE = (function () {
    try { return new URL(script.src).origin; } catch (_) { return ''; }
  })();

  var SESSION_KEY = '_wcs_' + BOT_ID;
  var VISITOR_KEY = '_wcv';

  // ── Visitor fingerprint ──────────────────────────────────────────────────────
  var visitorId = localStorage.getItem(VISITOR_KEY);
  if (!visitorId) {
    visitorId = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    localStorage.setItem(VISITOR_KEY, visitorId);
  }

  // ── State ────────────────────────────────────────────────────────────────────
  var cfg = null;
  var sessionId = localStorage.getItem(SESSION_KEY);
  var isOpen = false;
  var sending = false;
  var host = null, shadow = null, btn = null, panel = null, msgList = null, input = null;

  // ── Fetch helpers ─────────────────────────────────────────────────────────────
  function api(method, path, body) {
    var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return fetch(API_BASE + '/webchat/' + path, opts).then(function (r) {
      // fetch does NOT reject on HTTP errors — guard so a 404/500 body never gets
      // treated as a valid config (which rendered an "undefined" broken widget).
      if (!r.ok) { return Promise.reject(new Error('HTTP ' + r.status)); }
      return r.json();
    });
  }

  // ── Render helpers ────────────────────────────────────────────────────────────
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'style' && typeof attrs[k] === 'object') {
        Object.assign(e.style, attrs[k]);
      } else {
        e.setAttribute(k, attrs[k]);
      }
    });
    if (children) {
      if (typeof children === 'string') e.textContent = children;
      else children.forEach(function (c) { if (c) e.appendChild(c); });
    }
    return e;
  }

  function esc(t) {
    return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');
  }

  function appendMsg(body, direction) {
    var isBot = direction !== 'inbound';
    var bubble = el('div', {
      style: {
        display: 'flex',
        justifyContent: isBot ? 'flex-start' : 'flex-end',
        marginBottom: '10px',
      },
    });
    var text = el('div', {
      style: {
        maxWidth: '78%',
        padding: '9px 13px',
        borderRadius: isBot ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
        background: isBot ? '#f0f0f0' : cfg.color,
        color: isBot ? '#1a1a1a' : '#fff',
        fontSize: '14px',
        lineHeight: '1.45',
        wordBreak: 'break-word',
      },
    });
    text.innerHTML = esc(body);
    bubble.appendChild(text);
    msgList.appendChild(bubble);
    msgList.scrollTop = msgList.scrollHeight;
    return bubble;
  }

  function showTyping() {
    var d = el('div', {
      class: '_wc_typing',
      style: {
        display: 'flex',
        justifyContent: 'flex-start',
        marginBottom: '10px',
      },
    });
    var inner = el('div', {
      style: {
        background: '#f0f0f0',
        borderRadius: '4px 16px 16px 16px',
        padding: '10px 14px',
        display: 'flex',
        gap: '5px',
        alignItems: 'center',
      },
    });
    for (var i = 0; i < 3; i++) {
      var dot = el('span', {
        style: {
          width: '7px', height: '7px',
          borderRadius: '50%',
          background: '#aaa',
          display: 'inline-block',
          animation: 'wc_bounce 1.2s ' + (i * 0.2) + 's infinite ease-in-out both',
        },
      });
      inner.appendChild(dot);
    }
    d.appendChild(inner);
    msgList.appendChild(d);
    msgList.scrollTop = msgList.scrollHeight;
    return d;
  }

  function removeTyping() {
    var t = shadow.querySelector('._wc_typing');
    if (t) t.parentNode.removeChild(t);
  }

  // ── Build UI ──────────────────────────────────────────────────────────────────
  function buildUI() {
    host = document.createElement('div');
    host.id = '_webchat_host';
    document.body.appendChild(host);
    shadow = host.attachShadow({ mode: 'open' });

    // CSS keyframes (injected into shadow)
    var style = document.createElement('style');
    style.textContent = [
      '@keyframes wc_bounce {',
      '  0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)}',
      '}',
      '@keyframes wc_fadein {',
      '  from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)}',
      '}',
    ].join('');
    shadow.appendChild(style);

    // Toggle button
    btn = el('div', {
      style: {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        background: cfg.color,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
        zIndex: '2147483647',
        transition: 'transform 0.2s',
        userSelect: 'none',
      },
    });
    btn.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    btn.addEventListener('mouseover', function () { btn.style.transform = 'scale(1.08)'; });
    btn.addEventListener('mouseout',  function () { btn.style.transform = 'scale(1)'; });
    btn.addEventListener('click', togglePanel);
    shadow.appendChild(btn);

    // Chat panel
    panel = el('div', {
      style: {
        position: 'fixed',
        bottom: '92px',
        right: '24px',
        width: '360px',
        maxWidth: 'calc(100vw - 48px)',
        height: '520px',
        maxHeight: 'calc(100vh - 120px)',
        background: '#fff',
        borderRadius: '16px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        display: 'none',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: '2147483646',
        fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        animation: 'wc_fadein 0.22s ease',
      },
    });

    // Header
    var header = el('div', {
      style: {
        background: cfg.color,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      },
    });
    var avatar = el('div', {
      style: {
        width: '36px', height: '36px',
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: '0',
      },
    });
    if (cfg.avatar) {
      avatar.style.fontSize = '20px';
      avatar.textContent = cfg.avatar;
    } else {
      avatar.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a5 5 0 1 0 0 10A5 5 0 0 0 12 2z"/><path d="M2 21a10 10 0 0 1 20 0"/></svg>';
    }
    var titleBlock = el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { style: { color: '#fff', fontWeight: '600', fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, cfg.title),
      el('div', { style: { color: 'rgba(255,255,255,0.8)', fontSize: '12px' } }, cfg.subtitle),
    ]);
    var closeBtn = el('button', {
      style: {
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#fff', padding: '4px', lineHeight: '1', opacity: '0.85',
      },
    });
    closeBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    closeBtn.addEventListener('click', togglePanel);
    header.appendChild(avatar);
    header.appendChild(titleBlock);
    header.appendChild(closeBtn);

    // Message list
    msgList = el('div', {
      style: {
        flex: '1',
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '0',
      },
    });

    // Input area
    var inputArea = el('div', {
      style: {
        padding: '12px 14px',
        borderTop: '1px solid #efefef',
        display: 'flex',
        alignItems: 'flex-end',
        gap: '8px',
        background: '#fafafa',
      },
    });
    input = el('textarea', {
      placeholder: cfg.placeholder,
      rows: '1',
      style: {
        flex: '1',
        border: '1px solid #e0e0e0',
        borderRadius: '20px',
        padding: '9px 14px',
        fontSize: '14px',
        outline: 'none',
        resize: 'none',
        fontFamily: 'inherit',
        lineHeight: '1.4',
        maxHeight: '80px',
        overflowY: 'auto',
        background: '#fff',
      },
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });
    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 80) + 'px';
    });

    var sendBtn = el('button', {
      style: {
        width: '38px', height: '38px',
        background: cfg.color,
        border: 'none', borderRadius: '50%',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: '0',
        transition: 'opacity 0.15s',
      },
    });
    sendBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    sendBtn.addEventListener('click', doSend);

    inputArea.appendChild(input);
    inputArea.appendChild(sendBtn);

    // Powered by
    var powered = el('div', {
      style: {
        textAlign: 'center', fontSize: '11px', color: '#bbb',
        padding: '5px 0 8px',
        background: '#fafafa',
      },
    }, 'Powered by AutoMarkIQ');

    panel.appendChild(header);
    panel.appendChild(msgList);
    panel.appendChild(inputArea);
    panel.appendChild(powered);

    shadow.appendChild(panel);
  }

  // ── Toggle ─────────────────────────────────────────────────────────────────────
  function togglePanel() {
    isOpen = !isOpen;
    panel.style.display = isOpen ? 'flex' : 'none';
    if (isOpen) {
      panel.style.animation = 'wc_fadein 0.22s ease';
      input.focus();
    }
  }

  // ── Send ───────────────────────────────────────────────────────────────────────
  function doSend() {
    var text = input.value.trim();
    if (!text || sending) return;
    sending = true;
    input.value = '';
    input.style.height = 'auto';

    appendMsg(text, 'inbound');
    var typing = showTyping();

    api('POST', 'session/' + sessionId + '/message', { message: text })
      .then(function (data) {
        removeTyping();
        if (data && data.reply) appendMsg(data.reply, 'outbound');
      })
      .catch(function () {
        removeTyping();
        appendMsg('Error al enviar el mensaje. Inténtalo de nuevo.', 'outbound');
      })
      .finally(function () { sending = false; });
  }

  // ── Init ───────────────────────────────────────────────────────────────────────
  function loadHistory(messages) {
    if (!messages || !messages.length) return;
    messages.forEach(function (m) { appendMsg(m.body, m.direction); });
  }

  function start() {
    api('GET', BOT_ID + '/config')
      .then(function (data) {
        // Only render when we got a real config (active bot + webchat enabled)
        if (!data || !data.botId) {
          console.warn('[Webchat] Config inválida — el bot debe estar activo y el webchat habilitado.');
          return;
        }
        cfg = data;
        cfg.color = cfg.color || '#6366f1';
        cfg.title = cfg.title || 'Asistente';
        cfg.subtitle = cfg.subtitle || '';
        cfg.placeholder = cfg.placeholder || 'Escribe un mensaje...';
        buildUI();

        api('POST', BOT_ID + '/session', {
          visitorId: visitorId,
        }).then(function (sess) {
          sessionId = sess.sessionId;
          localStorage.setItem(SESSION_KEY, sessionId);
          loadHistory(sess.messages);
        }).catch(function (e) { console.warn('[Webchat] session init failed', e); });
      })
      .catch(function () {
        console.warn('[Webchat] Bot no disponible o webchat no activado para bot:', BOT_ID);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
`;
