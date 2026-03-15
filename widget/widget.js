(function () {
  const script = document.currentScript;
  const WORKSPACE_ID = script.getAttribute("data-workspace") || "demo";
  const API_BASE = script.getAttribute("data-api") || "http://localhost:8000";
  const DATA_SOUND = script.getAttribute("data-sound") !== "false";

  // Defaults (overridden by backend config, then by data-attributes)
  const DEFAULTS = {
    brand_color: "#6366F1",
    position: "bottom-right",
    theme: "light",
    greeting: "Привіт! Чим можу допомогти?",
    collect_email: true,
    auto_open_delay: null,
    quick_actions: [],
  };

  // State
  let isOpen = false;
  let conversationId = null;
  let customerEmail = null;
  let emailCollected = false;
  let ws = null;
  let wsMode = false;
  let wsRetries = 0;
  const MAX_WS_RETRIES = 3;
  let pendingFiles = [];
  const toolCards = {};

  // Storage key
  const STORAGE_KEY = `sai_chat_${WORKSPACE_ID}`;

  // --- Boot: fetch config then init ---
  (async function boot() {
    let serverConfig = {};
    try {
      const res = await fetch(`${API_BASE}/api/workspaces/${WORKSPACE_ID}`);
      if (res.ok) {
        const data = await res.json();
        serverConfig = data.widget_config || {};
      }
    } catch (_) {}

    // Merge: defaults < server config < data-attributes
    const cfg = { ...DEFAULTS, ...serverConfig };
    if (script.getAttribute("data-color")) cfg.brand_color = script.getAttribute("data-color");
    if (script.getAttribute("data-position")) cfg.position = script.getAttribute("data-position");
    if (script.getAttribute("data-theme")) cfg.theme = script.getAttribute("data-theme");

    initWidget(cfg);
  })();

  function initWidget(cfg) {
    const C = cfg.brand_color;
    const pos = cfg.position;
    const dark = cfg.theme === "dark";
    const bg = dark ? "#1f2937" : "#ffffff";
    const fg = dark ? "#f3f4f6" : "#111827";
    const muted = dark ? "#9ca3af" : "#6b7280";
    const bubbleBg = dark ? "#374151" : "#f3f4f6";
    const border = dark ? "#374151" : "#e5e7eb";
    const inputBg = dark ? "#374151" : "#fff";
    const inputBorder = dark ? "#4b5563" : "#d1d5db";
    const isLeft = pos === "bottom-left";

    // --- Styles ---
    const styles = document.createElement("style");
    styles.textContent = `
      #sai-widget-btn {
        position: fixed;
        ${isLeft ? "left: 20px" : "right: 20px"};
        bottom: 20px;
        width: 60px; height: 60px;
        border-radius: 50%;
        background: ${C};
        border: none; cursor: pointer;
        box-shadow: 0 4px 16px rgba(0,0,0,0.18);
        display: flex; align-items: center; justify-content: center;
        transition: transform 0.2s;
        z-index: 99999;
      }
      #sai-widget-btn:hover { transform: scale(1.08); }
      #sai-widget-btn svg { width: 28px; height: 28px; fill: white; }

      #sai-widget-chat {
        position: fixed;
        ${isLeft ? "left: 20px" : "right: 20px"};
        bottom: 90px;
        width: 380px; max-width: calc(100vw - 40px);
        height: 520px; max-height: calc(100vh - 120px);
        border-radius: 16px;
        background: ${bg};
        box-shadow: 0 8px 40px rgba(0,0,0,0.18);
        display: none; flex-direction: column;
        overflow: hidden; z-index: 99999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: ${fg};
      }
      #sai-widget-chat[role="dialog"] { outline: none; }
      #sai-widget-chat.open { display: flex; }

      .sai-header {
        padding: 16px;
        background: ${C}; color: white;
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; min-height: 56px;
      }
      .sai-header-left { display: flex; align-items: center; gap: 8px; }
      .sai-header h3 { margin: 0; font-size: 15px; font-weight: 600; }
      .sai-ws-dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: #4ade80; display: none;
        flex-shrink: 0;
      }
      .sai-ws-dot.connected { display: inline-block; }
      .sai-header-actions { display: flex; gap: 4px; }
      .sai-hdr-btn {
        background: rgba(255,255,255,0.2); border: none; color: white;
        width: 32px; height: 32px; border-radius: 8px;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        font-size: 16px; transition: background 0.15s;
      }
      .sai-hdr-btn:hover { background: rgba(255,255,255,0.35); }

      .sai-messages {
        flex: 1; overflow-y: auto; padding: 16px;
        display: flex; flex-direction: column; gap: 8px;
      }

      .sai-msg-wrap { display: flex; flex-direction: column; gap: 2px; }
      .sai-msg-wrap.customer { align-items: flex-end; }
      .sai-msg-wrap.ai { align-items: flex-start; }

      .sai-msg {
        max-width: 85%; padding: 10px 14px;
        border-radius: 16px; font-size: 14px;
        line-height: 1.5; word-break: break-word;
      }
      .sai-msg.customer {
        background: ${C}; color: white;
        border-bottom-right-radius: 4px;
        white-space: pre-wrap;
      }
      .sai-msg.ai {
        background: ${bubbleBg};
        border-bottom-left-radius: 4px;
      }
      .sai-msg.ai p { margin: 0 0 4px 0; }
      .sai-msg.ai p:last-child { margin-bottom: 0; }
      .sai-msg.ai br { display: block; content: ""; margin: 4px 0; }
      .sai-msg.ai ul { margin: 4px 0; padding-left: 18px; }
      .sai-msg.ai li { margin: 2px 0; }
      .sai-msg.ai strong { font-weight: 600; }
      .sai-msg.ai code {
        background: rgba(0,0,0,0.06); padding: 1px 4px;
        border-radius: 4px; font-size: 13px;
      }
      .sai-msg-time {
        font-size: 10px; opacity: 0.5; padding: 0 4px;
      }
      .sai-msg-images { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px; }
      .sai-msg-images img {
        width: 120px; height: 80px; object-fit: cover;
        border-radius: 8px; cursor: pointer;
      }

      /* Typing indicator */
      .sai-typing { display: flex; align-items: center; gap: 4px; padding: 10px 14px; }
      .sai-typing-dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: ${muted}; animation: sai-bounce 1.4s infinite ease-in-out both;
      }
      .sai-typing-dot:nth-child(1) { animation-delay: -0.32s; }
      .sai-typing-dot:nth-child(2) { animation-delay: -0.16s; }
      @keyframes sai-bounce {
        0%, 80%, 100% { transform: scale(0); }
        40% { transform: scale(1); }
      }

      /* Tool cards */
      .sai-tool-card {
        align-self: flex-start; max-width: 85%;
        padding: 10px 14px; border-radius: 12px;
        font-size: 13px; display: flex; flex-direction: column; gap: 6px;
        border: 1px solid; margin: 2px 0;
      }
      .sai-tool-card.processing { background: ${dark ? "#1e293b" : "#eff6ff"}; border-color: ${dark ? "#1e40af" : "#93c5fd"}; }
      .sai-tool-card.pending { background: ${dark ? "#292524" : "#fffbeb"}; border-color: ${dark ? "#92400e" : "#fcd34d"}; }
      .sai-tool-card.completed { background: ${dark ? "#1e3a2f" : "#ecfdf5"}; border-color: ${dark ? "#065f46" : "#a7f3d0"}; }
      .sai-tool-card.rejected { background: ${dark ? "#2d1b1b" : "#fef2f2"}; border-color: ${dark ? "#991b1b" : "#fca5a5"}; }
      .sai-tool-card.failed { background: ${dark ? "#2d1b1b" : "#fef2f2"}; border-color: ${dark ? "#991b1b" : "#fca5a5"}; }
      .sai-tool-header { display: flex; align-items: center; gap: 6px; font-weight: 600; }
      .sai-tool-badge {
        font-size: 11px; padding: 2px 8px; border-radius: 10px;
        font-weight: 500; display: inline-flex; align-items: center; gap: 4px;
      }
      .sai-tool-badge.processing { background: ${dark ? "#1e40af" : "#dbeafe"}; color: ${dark ? "#93c5fd" : "#1d4ed8"}; }
      .sai-tool-badge.pending { background: ${dark ? "#92400e" : "#fef3c7"}; color: ${dark ? "#fbbf24" : "#b45309"}; }
      .sai-tool-badge.completed { background: ${dark ? "#065f46" : "#d1fae5"}; color: ${dark ? "#6ee7b7" : "#047857"}; }
      .sai-tool-badge.rejected { background: ${dark ? "#991b1b" : "#fee2e2"}; color: ${dark ? "#fca5a5" : "#b91c1c"}; }
      .sai-tool-badge.failed { background: ${dark ? "#991b1b" : "#fee2e2"}; color: ${dark ? "#fca5a5" : "#b91c1c"}; }
      .sai-pulse { width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: sai-pulse-anim 1.5s infinite; }
      @keyframes sai-pulse-anim { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      .sai-tool-params { font-size: 12px; opacity: 0.8; }
      .sai-tool-params span { display: block; }

      /* Quick actions */
      .sai-quick-actions {
        display: flex; gap: 6px; padding: 8px 16px; overflow-x: auto;
        border-top: 1px solid ${border};
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }
      .sai-quick-actions::-webkit-scrollbar { display: none; }
      .sai-qa-btn {
        white-space: nowrap; padding: 6px 14px;
        border-radius: 20px; font-size: 13px;
        border: 1px solid ${C}; color: ${C};
        background: transparent; cursor: pointer;
        transition: background 0.15s, color 0.15s;
        flex-shrink: 0;
      }
      .sai-qa-btn:hover { background: ${C}; color: white; }

      /* Input area */
      .sai-input-area {
        padding: 12px 16px;
        border-top: 1px solid ${border};
        display: flex; gap: 8px; align-items: flex-end;
      }
      .sai-attach-btn {
        width: 36px; height: 36px; border-radius: 50%;
        background: none; border: 1px solid ${inputBorder};
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        flex-shrink: 0; color: ${muted}; transition: border-color 0.15s;
      }
      .sai-attach-btn:hover { border-color: ${C}; color: ${C}; }
      .sai-attach-btn svg { width: 18px; height: 18px; }
      .sai-input-area input {
        flex: 1;
        border: 1px solid ${inputBorder};
        border-radius: 24px;
        padding: 8px 16px;
        font-size: 14px; outline: none;
        background: ${inputBg}; color: ${fg};
        min-width: 0;
      }
      .sai-input-area input:focus { border-color: ${C}; }
      .sai-send {
        width: 36px; height: 36px; border-radius: 50%;
        background: ${C}; border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .sai-send svg { width: 16px; height: 16px; fill: white; }

      /* Preview strip */
      .sai-preview-strip {
        display: flex; gap: 6px; padding: 6px 16px;
        overflow-x: auto; border-top: 1px solid ${border};
      }
      .sai-preview-strip:empty { display: none; padding: 0; border: none; }
      .sai-preview-item {
        position: relative; width: 60px; height: 60px;
        border-radius: 8px; overflow: hidden; flex-shrink: 0;
        border: 1px solid ${border};
      }
      .sai-preview-item img { width: 100%; height: 100%; object-fit: cover; }
      .sai-preview-item .sai-preview-name {
        position: absolute; bottom: 0; left: 0; right: 0;
        background: rgba(0,0,0,0.6); color: white;
        font-size: 9px; padding: 2px 4px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .sai-preview-remove {
        position: absolute; top: 2px; right: 2px;
        width: 18px; height: 18px; border-radius: 50%;
        background: rgba(0,0,0,0.6); color: white;
        border: none; cursor: pointer;
        font-size: 12px; line-height: 1;
        display: flex; align-items: center; justify-content: center;
      }

      /* Drag overlay */
      .sai-drop-overlay {
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(99,102,241,0.12);
        border: 2px dashed ${C};
        border-radius: 16px;
        display: none; align-items: center; justify-content: center;
        font-size: 16px; color: ${C}; font-weight: 600;
        z-index: 10; pointer-events: none;
      }
      .sai-drop-overlay.active { display: flex; }

      /* Email form */
      .sai-email-form {
        padding: 24px; text-align: center;
      }
      .sai-email-form p { margin-bottom: 12px; font-size: 14px; color: ${muted}; }
      .sai-email-form input {
        width: 100%;
        border: 1px solid ${inputBorder};
        border-radius: 8px; padding: 10px 14px;
        font-size: 14px; margin-bottom: 10px;
        background: ${inputBg}; color: ${fg};
      }
      .sai-email-form button {
        width: 100%;
        background: ${C}; color: white;
        border: none; border-radius: 8px;
        padding: 10px; font-size: 14px; cursor: pointer;
      }

      /* Mobile full-screen */
      @media (max-width: 480px) {
        #sai-widget-chat.open {
          top: 0; left: 0; right: 0; bottom: 0;
          width: 100vw; height: 100vh;
          max-width: 100vw; max-height: 100vh;
          border-radius: 0;
          padding-top: env(safe-area-inset-top);
          padding-bottom: env(safe-area-inset-bottom);
        }
        #sai-widget-chat.open ~ #sai-widget-btn { display: none; }
        .sai-input-area input { font-size: 16px; }
        .sai-hdr-btn, .sai-send, .sai-attach-btn { min-width: 44px; min-height: 44px; }
      }
    `;
    document.head.appendChild(styles);

    // --- Button ---
    const btn = document.createElement("button");
    btn.id = "sai-widget-btn";
    btn.setAttribute("aria-label", "Відкрити чат підтримки");
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>';
    btn.onclick = toggle;
    document.body.appendChild(btn);

    // --- Chat window ---
    const chat = document.createElement("div");
    chat.id = "sai-widget-chat";
    chat.setAttribute("role", "dialog");
    chat.setAttribute("aria-label", "Чат підтримки");
    chat.innerHTML = `
      <div class="sai-header">
        <div class="sai-header-left">
          <h3>Підтримка</h3>
          <span class="sai-ws-dot" id="sai-ws-dot"></span>
        </div>
        <div class="sai-header-actions">
          <button class="sai-hdr-btn" id="sai-new-chat" title="Нова розмова">&#x21bb;</button>
          <button class="sai-hdr-btn" id="sai-close" title="Закрити">&times;</button>
        </div>
      </div>
      <div class="sai-messages" id="sai-messages" aria-live="polite"></div>
      <div class="sai-drop-overlay" id="sai-drop-overlay">Перетягніть файли сюди</div>
      <div class="sai-email-form" id="sai-email-form" style="display:none">
        <p>Введіть ваш email для початку</p>
        <input type="email" id="sai-email-input" placeholder="your@email.com" />
        <button id="sai-email-submit">Розпочати чат</button>
      </div>
      <div id="sai-quick-actions-container"></div>
      <div class="sai-preview-strip" id="sai-preview-strip"></div>
      <div class="sai-input-area" id="sai-input-area">
        <button class="sai-attach-btn" id="sai-attach" title="Прикріпити файл">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.49"/></svg>
        </button>
        <input type="file" id="sai-file-input" accept="image/*,.pdf" multiple style="display:none" />
        <input type="text" id="sai-input" placeholder="Напишіть повідомлення..." />
        <button class="sai-send" id="sai-send">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    `;
    document.body.appendChild(chat);

    // Greeting
    const container = document.getElementById("sai-messages");
    addMessage("ai", cfg.greeting);

    // Quick actions
    if (cfg.quick_actions && cfg.quick_actions.length > 0) {
      const qaContainer = document.getElementById("sai-quick-actions-container");
      const qaDiv = document.createElement("div");
      qaDiv.className = "sai-quick-actions";
      cfg.quick_actions.forEach((action) => {
        const b = document.createElement("button");
        b.className = "sai-qa-btn";
        b.textContent = action;
        b.onclick = () => {
          document.getElementById("sai-input").value = action;
          sendMessage();
        };
        qaDiv.appendChild(b);
      });
      qaContainer.appendChild(qaDiv);
    }

    // Email collection
    if (cfg.collect_email) {
      document.getElementById("sai-email-form").style.display = "block";
      document.getElementById("sai-input-area").style.display = "none";
      document.getElementById("sai-email-submit").onclick = () => {
        const email = document.getElementById("sai-email-input").value.trim();
        if (email) {
          customerEmail = email;
          emailCollected = true;
          document.getElementById("sai-email-form").style.display = "none";
          document.getElementById("sai-input-area").style.display = "flex";
          saveState();
        }
      };
      document.getElementById("sai-email-input").onkeydown = (e) => {
        if (e.key === "Enter") document.getElementById("sai-email-submit").click();
      };
    }

    // Events
    document.getElementById("sai-send").onclick = sendMessage;
    document.getElementById("sai-input").onkeydown = (e) => {
      if (e.key === "Enter") sendMessage();
    };
    document.getElementById("sai-close").onclick = () => {
      isOpen = false;
      chat.classList.remove("open");
    };
    document.getElementById("sai-new-chat").onclick = newConversation;

    // Keyboard: Escape to close
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen) {
        isOpen = false;
        chat.classList.remove("open");
      }
    });

    // File upload events
    const fileInput = document.getElementById("sai-file-input");
    document.getElementById("sai-attach").onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
      addFiles(Array.from(e.target.files));
      fileInput.value = "";
    };

    // Drag and drop
    const messagesEl = document.getElementById("sai-messages");
    const dropOverlay = document.getElementById("sai-drop-overlay");
    let dragCounter = 0;

    chat.addEventListener("dragenter", (e) => {
      e.preventDefault();
      dragCounter++;
      dropOverlay.classList.add("active");
    });
    chat.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        dropOverlay.classList.remove("active");
      }
    });
    chat.addEventListener("dragover", (e) => e.preventDefault());
    chat.addEventListener("drop", (e) => {
      e.preventDefault();
      dragCounter = 0;
      dropOverlay.classList.remove("active");
      if (e.dataTransfer.files.length) {
        addFiles(Array.from(e.dataTransfer.files));
      }
    });

    // Auto-open
    if (cfg.auto_open_delay && cfg.auto_open_delay > 0) {
      setTimeout(() => {
        if (!isOpen) toggle();
      }, cfg.auto_open_delay * 1000);
    }

    // Restore from localStorage
    restoreState(cfg);
  }

  // --- Toggle ---
  function toggle() {
    isOpen = !isOpen;
    const chat = document.getElementById("sai-widget-chat");
    chat.classList.toggle("open", isOpen);
    if (isOpen) {
      const input = document.getElementById("sai-input");
      if (input && input.offsetParent) input.focus();
    }
  }

  // --- Time helper ---
  function timeStr() {
    const now = new Date();
    return now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0");
  }

  // --- Lightweight markdown renderer ---
  function renderMarkdown(text) {
    // Escape HTML entities first to prevent XSS
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Split into lines for block-level processing
    const lines = html.split("\n");
    const result = [];
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Unordered list items: - item or * item
      const listMatch = line.match(/^(\s*)[*-]\s+(.+)/);
      if (listMatch) {
        if (!inList) { result.push("<ul>"); inList = true; }
        result.push("<li>" + inlineMarkdown(listMatch[2]) + "</li>");
        continue;
      }

      // Close list if we were in one
      if (inList) { result.push("</ul>"); inList = false; }

      // Empty line → spacing
      if (line.trim() === "") {
        result.push("<br>");
        continue;
      }

      // Regular line
      result.push("<p>" + inlineMarkdown(line) + "</p>");
    }
    if (inList) result.push("</ul>");

    return result.join("");
  }

  function inlineMarkdown(text) {
    return text
      // Bold: **text**
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // Italic: *text* (but not inside bold)
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")
      // Inline code: `code`
      .replace(/`(.+?)`/g, "<code>$1</code>");
  }

  // --- Add message ---
  function addMessage(role, text, attachments) {
    const container = document.getElementById("sai-messages");
    const wrap = document.createElement("div");
    wrap.className = `sai-msg-wrap ${role}`;

    // Image thumbnails for customer messages with attachments
    if (attachments && attachments.length > 0) {
      const imgContainer = document.createElement("div");
      imgContainer.className = "sai-msg-images";
      attachments.forEach((att) => {
        if (att.content_type && att.content_type.startsWith("image/")) {
          const img = document.createElement("img");
          img.src = `${API_BASE}${att.url}`;
          img.alt = att.filename || "image";
          img.onclick = () => window.open(img.src, "_blank");
          imgContainer.appendChild(img);
        }
      });
      if (imgContainer.children.length > 0) wrap.appendChild(imgContainer);
    }

    const div = document.createElement("div");
    div.className = `sai-msg ${role}`;
    if (role === "ai") {
      div.innerHTML = renderMarkdown(text);
    } else {
      div.textContent = text;
    }
    wrap.appendChild(div);

    const time = document.createElement("div");
    time.className = "sai-msg-time";
    time.textContent = timeStr();
    wrap.appendChild(time);

    container.appendChild(wrap);
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    return wrap;
  }

  // --- Tool card ---
  const STATUS_LABELS = {
    processing: "Обробка...",
    pending: "Очікує підтвердження",
    completed: "Виконано",
    rejected: "Відхилено",
    failed: "Помилка",
  };

  const STATUS_ICONS = {
    processing: "⚙️",
    pending: "⏳",
    completed: "✅",
    rejected: "❌",
    failed: "⚠️",
  };

  function addToolCard(data, status) {
    const container = document.getElementById("sai-messages");
    const card = document.createElement("div");
    card.className = `sai-tool-card ${status}`;

    const toolName = (data.tool_name || data.name || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const showPulse = status === "processing" || status === "pending";

    card.innerHTML = `
      <div class="sai-tool-header">
        <span>${STATUS_ICONS[status] || "⚙️"}</span>
        <span>${toolName}</span>
        <span class="sai-tool-badge ${status}">
          ${showPulse ? '<span class="sai-pulse"></span>' : ""}
          ${STATUS_LABELS[status] || status}
        </span>
      </div>
    `;

    // Show up to 3 params
    const input = data.input || data.input_data || {};
    const keys = Object.keys(input).slice(0, 3);
    if (keys.length > 0) {
      const params = document.createElement("div");
      params.className = "sai-tool-params";
      keys.forEach((k) => {
        const span = document.createElement("span");
        span.textContent = `${k}: ${input[k]}`;
        params.appendChild(span);
      });
      card.appendChild(params);
    }

    container.appendChild(card);
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });

    // Store reference for updates
    if (data.execution_id) {
      toolCards[data.execution_id] = card;
    }
    return card;
  }

  function updateToolCard(executionId, newStatus) {
    const card = toolCards[executionId];
    if (!card) return;
    card.className = `sai-tool-card ${newStatus}`;
    const badge = card.querySelector(".sai-tool-badge");
    if (badge) {
      badge.className = `sai-tool-badge ${newStatus}`;
      const showPulse = newStatus === "processing" || newStatus === "pending";
      badge.innerHTML = `
        ${showPulse ? '<span class="sai-pulse"></span>' : ""}
        ${STATUS_LABELS[newStatus] || newStatus}
      `;
    }
    const icon = card.querySelector(".sai-tool-header > span:first-child");
    if (icon) icon.textContent = STATUS_ICONS[newStatus] || "⚙️";
  }

  // --- Typing indicator ---
  function showTyping() {
    removeTyping();
    const container = document.getElementById("sai-messages");
    const wrap = document.createElement("div");
    wrap.className = "sai-msg-wrap ai";
    wrap.id = "sai-typing";
    const div = document.createElement("div");
    div.className = "sai-typing";
    div.innerHTML = '<div class="sai-typing-dot"></div><div class="sai-typing-dot"></div><div class="sai-typing-dot"></div>';
    wrap.appendChild(div);
    container.appendChild(wrap);
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }

  function removeTyping() {
    document.getElementById("sai-typing")?.remove();
  }

  // --- File handling ---
  function addFiles(files) {
    const allowed = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"];
    files.forEach((f) => {
      if (!allowed.includes(f.type)) return;
      if (f.size > 10 * 1024 * 1024) return;
      pendingFiles.push(f);
    });
    renderPreviews();
  }

  function renderPreviews() {
    const strip = document.getElementById("sai-preview-strip");
    strip.innerHTML = "";
    pendingFiles.forEach((f, i) => {
      const item = document.createElement("div");
      item.className = "sai-preview-item";

      if (f.type.startsWith("image/")) {
        const img = document.createElement("img");
        img.src = URL.createObjectURL(f);
        item.appendChild(img);
      } else {
        const name = document.createElement("div");
        name.className = "sai-preview-name";
        name.textContent = f.name;
        name.style.top = "0";
        name.style.bottom = "0";
        name.style.display = "flex";
        name.style.alignItems = "center";
        name.style.justifyContent = "center";
        name.style.fontSize = "10px";
        item.appendChild(name);
      }

      const removeBtn = document.createElement("button");
      removeBtn.className = "sai-preview-remove";
      removeBtn.textContent = "×";
      removeBtn.onclick = () => {
        pendingFiles.splice(i, 1);
        renderPreviews();
      };
      item.appendChild(removeBtn);
      strip.appendChild(item);
    });
  }

  async function uploadFiles() {
    if (pendingFiles.length === 0) return [];
    const uploaded = [];
    for (const f of pendingFiles) {
      const formData = new FormData();
      formData.append("file", f);
      try {
        const res = await fetch(`${API_BASE}/api/uploads/${WORKSPACE_ID}`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          uploaded.push(await res.json());
        }
      } catch (_) {}
    }
    pendingFiles = [];
    renderPreviews();
    return uploaded;
  }

  // --- WebSocket ---
  function connectWS() {
    if (wsRetries >= MAX_WS_RETRIES) return;
    try {
      const wsUrl = API_BASE.replace(/^http/, "ws") + `/api/ws/chat/${WORKSPACE_ID}`;
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        wsMode = true;
        wsRetries = 0;
        const dot = document.getElementById("sai-ws-dot");
        if (dot) dot.classList.add("connected");
        // Restore conversation context on reconnect
        if (conversationId) {
          ws.send(JSON.stringify({ type: "restore", conversation_id: conversationId }));
        }
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWSMessage(data);
        } catch (_) {}
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        wsMode = false;
        const dot = document.getElementById("sai-ws-dot");
        if (dot) dot.classList.remove("connected");
        if (wsRetries < MAX_WS_RETRIES) {
          wsRetries++;
          const delay = Math.min(1000 * Math.pow(2, wsRetries), 8000);
          setTimeout(connectWS, delay);
        }
      };
    } catch (_) {
      wsMode = false;
    }
  }

  function handleWSMessage(data) {
    // Handle error messages from server
    if (data.error) {
      removeTyping();
      addMessage("ai", "Виникла помилка. Спробуйте ще раз.");
      return;
    }

    // Handle restore confirmation — re-render conversation if messages included
    if (data.type === "restored") {
      if (data.messages && data.messages.length > 0) {
        const container = document.getElementById("sai-messages");
        container.innerHTML = "";
        data.messages.forEach((m) => {
          const role = m.role === "agent" || m.role === "ai" ? "ai" : m.role;
          addMessage(role, m.content);
        });
        saveState();
      }
      return;
    }

    // Handle agent message (admin reply reaching the customer)
    if (data.type === "agent_message") {
      addMessage("ai", data.response);
      playBeep();
      saveState();
      return;
    }

    if (data.type === "tool_update") {
      // Update tool card status
      if (data.execution_id) {
        const statusMap = { executed: "completed" };
        updateToolCard(data.execution_id, statusMap[data.status] || data.status);
      }
      // Append AI follow-up
      if (data.response) {
        addMessage("ai", data.response);
        playBeep();
        saveState();
      }
      return;
    }

    // Regular chat response from WS
    removeTyping();
    if (data.conversation_id) conversationId = data.conversation_id;
    if (data.response) {
      addMessage("ai", data.response);
      playBeep();
    }
    if (data.pending_approval) {
      addToolCard(data.pending_approval, "pending");
    } else if (data.tool_call && data.tool_call.name !== "escalate_to_human") {
      addToolCard(data.tool_call, "processing");
    }
    saveState();
  }

  // --- Send message ---
  async function sendMessage() {
    const input = document.getElementById("sai-input");
    const text = input.value.trim();
    if (!text && pendingFiles.length === 0) return;

    input.value = "";

    // Upload files first
    const attachments = await uploadFiles();

    // Show customer message
    addMessage("customer", text || "(файл)", attachments.length > 0 ? attachments : undefined);
    showTyping();

    // Lazy-connect WS on first send if not already connected
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      connectWS();
    }

    if (wsMode && ws && ws.readyState === WebSocket.OPEN) {
      // Send via WebSocket
      ws.send(JSON.stringify({
        content: text || "(файл)",
        customer_email: customerEmail,
        conversation_id: conversationId,
        attachments: attachments.length > 0 ? attachments : undefined,
      }));
    } else {
      // REST fallback
      try {
        const url = `${API_BASE}/api/chat/${WORKSPACE_ID}${conversationId ? `?conversation_id=${conversationId}` : ""}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: text || "(файл)",
            customer_email: customerEmail,
            attachments: attachments.length > 0 ? attachments : undefined,
          }),
        });
        const data = await res.json();
        removeTyping();
        conversationId = data.conversation_id;
        if (data.response) {
          addMessage("ai", data.response);
          playBeep();
        }
        if (data.pending_approval) {
          addToolCard(data.pending_approval, "pending");
        } else if (data.tool_call && data.tool_call.name !== "escalate_to_human") {
          addToolCard(data.tool_call, "processing");
        }
      } catch (err) {
        removeTyping();
        addMessage("ai", "Виникла помилка. Спробуйте ще раз.");
      }
    }
    saveState();
  }

  // --- Sound ---
  function playBeep() {
    if (!DATA_SOUND || isOpen) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.value = 0.1;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (_) {}
  }

  // --- LocalStorage persistence ---
  function saveState() {
    try {
      const msgs = [];
      document.querySelectorAll("#sai-messages .sai-msg-wrap").forEach((wrap) => {
        const msgEl = wrap.querySelector(".sai-msg");
        const timeEl = wrap.querySelector(".sai-msg-time");
        if (!msgEl) return;
        const role = wrap.classList.contains("customer") ? "customer" : "ai";
        msgs.push({ role, text: msgEl.textContent, time: timeEl?.textContent || "" });
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        conversationId,
        customerEmail,
        emailCollected,
        messages: msgs,
        savedAt: Date.now(),
      }));
    } catch (_) {}
  }

  function restoreState(cfg) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw);
      // Expire after 24h
      if (Date.now() - state.savedAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      if (state.conversationId) conversationId = state.conversationId;
      if (state.customerEmail) {
        customerEmail = state.customerEmail;
        emailCollected = true;
        document.getElementById("sai-email-form").style.display = "none";
        document.getElementById("sai-input-area").style.display = "flex";
      }
      if (state.messages && state.messages.length > 0) {
        // Clear default greeting
        const container = document.getElementById("sai-messages");
        container.innerHTML = "";
        state.messages.forEach((m) => addMessage(m.role, m.text));
      }
    } catch (_) {}
  }

  function newConversation() {
    conversationId = null;
    customerEmail = null;
    emailCollected = false;
    pendingFiles = [];
    localStorage.removeItem(STORAGE_KEY);
    const container = document.getElementById("sai-messages");
    container.innerHTML = "";
    renderPreviews();
    // Reset to greeting
    addMessage("ai", "Привіт! Чим можу допомогти?");
    // Reconnect WS for new conversation
    if (ws) {
      try { ws.close(); } catch (_) {}
    }
    wsMode = false;
    wsRetries = 0;
    connectWS();
  }
})();
