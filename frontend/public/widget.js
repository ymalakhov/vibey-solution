(function () {
  const script = document.currentScript;
  const workspaceId = script.getAttribute("data-workspace") || "demo";
  const position = script.getAttribute("data-position") || "bottom-right";
  const color = script.getAttribute("data-color") || "#6366F1";
  const theme = script.getAttribute("data-theme") || "light";

  const API_BASE = script.getAttribute("data-api") || "http://localhost:8000";
  const EXTERNAL_EMAIL = script.getAttribute("data-customer-email") || null;

  // State
  let isOpen = false;
  let conversationId = null;
  let customerEmail = EXTERNAL_EMAIL;
  let messages = [];
  let emailCollected = !!EXTERNAL_EMAIL;

  // Styles
  const styles = document.createElement("style");
  styles.textContent = `
    #sai-widget-btn {
      position: fixed;
      ${position === "bottom-left" ? "left: 20px" : "right: 20px"};
      bottom: 20px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: ${color};
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,0.18);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s;
      z-index: 99999;
    }
    #sai-widget-btn:hover { transform: scale(1.08); }
    #sai-widget-btn svg { width: 28px; height: 28px; fill: white; }

    #sai-widget-chat {
      position: fixed;
      ${position === "bottom-left" ? "left: 20px" : "right: 20px"};
      bottom: 90px;
      width: 380px;
      height: 520px;
      border-radius: 16px;
      background: ${theme === "dark" ? "#1f2937" : "#ffffff"};
      box-shadow: 0 8px 40px rgba(0,0,0,0.18);
      display: none;
      flex-direction: column;
      overflow: hidden;
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: ${theme === "dark" ? "#f3f4f6" : "#111827"};
    }
    #sai-widget-chat.open { display: flex; }

    .sai-header {
      padding: 16px;
      background: ${color};
      color: white;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .sai-header h3 { margin: 0; font-size: 15px; font-weight: 600; }
    .sai-close { background: none; border: none; color: white; font-size: 20px; cursor: pointer; padding: 4px; }

    .sai-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .sai-msg {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .sai-msg.customer {
      align-self: flex-end;
      background: ${color};
      color: white;
      border-bottom-right-radius: 4px;
    }
    .sai-msg.ai {
      align-self: flex-start;
      background: ${theme === "dark" ? "#374151" : "#f3f4f6"};
      border-bottom-left-radius: 4px;
    }
    .sai-msg.typing {
      align-self: flex-start;
      background: ${theme === "dark" ? "#374151" : "#f3f4f6"};
      border-bottom-left-radius: 4px;
      color: #9ca3af;
    }
    .sai-action-card {
      align-self: flex-start;
      background: ${theme === "dark" ? "#1e3a2f" : "#ecfdf5"};
      border: 1px solid ${theme === "dark" ? "#065f46" : "#a7f3d0"};
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 13px;
      max-width: 85%;
    }
    .sai-action-card.escalated {
      background: ${theme === "dark" ? "#1e293b" : "#eff6ff"};
      border: 1px solid ${theme === "dark" ? "#1e40af" : "#93c5fd"};
    }

    .sai-input-area {
      padding: 12px 16px;
      border-top: 1px solid ${theme === "dark" ? "#374151" : "#e5e7eb"};
      display: flex;
      gap: 8px;
    }
    .sai-input-area input {
      flex: 1;
      border: 1px solid ${theme === "dark" ? "#4b5563" : "#d1d5db"};
      border-radius: 24px;
      padding: 8px 16px;
      font-size: 14px;
      outline: none;
      background: ${theme === "dark" ? "#374151" : "#fff"};
      color: ${theme === "dark" ? "#f3f4f6" : "#111827"};
    }
    .sai-input-area input:focus { border-color: ${color}; }
    .sai-send {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: ${color};
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .sai-send svg { width: 16px; height: 16px; fill: white; }

    .sai-email-form {
      padding: 24px;
      text-align: center;
    }
    .sai-email-form p { margin-bottom: 12px; font-size: 14px; color: #6b7280; }
    .sai-email-form input {
      width: 100%;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 14px;
      margin-bottom: 10px;
      background: ${theme === "dark" ? "#374151" : "#fff"};
      color: ${theme === "dark" ? "#f3f4f6" : "#111827"};
    }
    .sai-email-form button {
      width: 100%;
      background: ${color};
      color: white;
      border: none;
      border-radius: 8px;
      padding: 10px;
      font-size: 14px;
      cursor: pointer;
    }
  `;
  document.head.appendChild(styles);

  // Button
  const btn = document.createElement("button");
  btn.id = "sai-widget-btn";
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>';
  btn.onclick = toggle;
  document.body.appendChild(btn);

  // Chat window
  const chat = document.createElement("div");
  chat.id = "sai-widget-chat";
  chat.innerHTML = `
    <div class="sai-header">
      <h3>Support</h3>
      <button class="sai-close" onclick="document.getElementById('sai-widget-chat').classList.remove('open')">&times;</button>
    </div>
    <div class="sai-messages" id="sai-messages">
      <div class="sai-msg ai">Привіт! Чим можу допомогти?</div>
    </div>
    <div class="sai-email-form" id="sai-email-form" style="display:none">
      <p>Введіть ваш email для початку</p>
      <input type="email" id="sai-email-input" placeholder="your@email.com" />
      <button id="sai-email-submit">Start Chat</button>
    </div>
    <div class="sai-input-area" id="sai-input-area">
      <input type="text" id="sai-input" placeholder="Напишіть повідомлення..." />
      <button class="sai-send" id="sai-send">
        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </div>
  `;
  document.body.appendChild(chat);

  // Events
  document.getElementById("sai-send").onclick = sendMessage;
  document.getElementById("sai-input").onkeydown = (e) => {
    if (e.key === "Enter") sendMessage();
  };
  if (EXTERNAL_EMAIL) {
    document.getElementById("sai-email-form").style.display = "none";
    document.getElementById("sai-input-area").style.display = "flex";
  } else {
    document.getElementById("sai-email-submit").onclick = () => {
      const email = document.getElementById("sai-email-input").value;
      if (email) {
        customerEmail = email;
        emailCollected = true;
        document.getElementById("sai-email-form").style.display = "none";
        document.getElementById("sai-input-area").style.display = "flex";
      }
    };
  }

  function toggle() {
    isOpen = !isOpen;
    chat.classList.toggle("open", isOpen);
  }

  function addMessage(role, text) {
    const container = document.getElementById("sai-messages");
    const div = document.createElement("div");
    div.className = `sai-msg ${role}`;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function addActionCard(text, isEscalated) {
    const container = document.getElementById("sai-messages");
    const div = document.createElement("div");
    div.className = "sai-action-card" + (isEscalated ? " escalated" : "");
    div.innerHTML = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  async function sendMessage() {
    const input = document.getElementById("sai-input");
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    addMessage("customer", text);

    // Show typing
    const typing = document.createElement("div");
    typing.className = "sai-msg typing";
    typing.textContent = "...";
    typing.id = "sai-typing";
    document.getElementById("sai-messages").appendChild(typing);

    try {
      const url = `${API_BASE}/api/chat/${workspaceId}${conversationId ? `?conversation_id=${conversationId}` : ""}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          customer_email: customerEmail,
        }),
      });
      const data = await res.json();

      // Remove typing
      document.getElementById("sai-typing")?.remove();

      conversationId = data.conversation_id;

      if (data.response) {
        addMessage("ai", data.response);
      }

      if (data.escalated) {
        addActionCard(
          `<strong>Connecting you with a support agent</strong><br/>` +
          `<small>A human agent will be with you shortly</small>`,
          true
        );
      } else if (data.action_pending) {
        addActionCard(
          `<strong>Action:</strong> ${data.action_pending.tool_name}<br/>` +
          `<small>Waiting for confirmation...</small>`
        );
      }
    } catch (err) {
      document.getElementById("sai-typing")?.remove();
      addMessage("ai", "Sorry, something went wrong. Please try again.");
    }
  }
})();
