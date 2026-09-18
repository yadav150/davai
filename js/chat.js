// DavAI — Chat composer + message rendering + streaming AI responses.

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { ref, onValue, off, get } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";
import { appendMessage, getConversation, updateConversationMeta } from "./conversations.js";
import { renderMarkdown, enhanceCodeBlocks } from "./markdown.js";
import { askAIStream, isBackendConfigured } from "./backend.js";

const $ = (id) => document.getElementById(id);

const messagesEl   = $("messages");
const emptyStateEl = $("emptyState");
const composerEl   = $("composer");
const inputEl      = $("composerInput");
const sendBtn      = $("sendBtn");
const stopBtn      = $("stopBtn");

let currentUid = null;
let currentCid = null;
let unsubscribeMessages = null;
let sending = false;
let statusEl = null;
let streamHandle = null;
let liveBubble = null;
let liveText = "";

/* ---------- Composer: autosize ---------- */
function autosize() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + "px";
}
inputEl.addEventListener("input", autosize);

/* ---------- Enter to send, Shift+Enter newline ---------- */
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendCurrentMessage();
  }
});
composerEl.addEventListener("submit", (e) => {
  e.preventDefault();
  sendCurrentMessage();
});

/* ---------- Message rendering ---------- */
function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function buildMessageEl(m) {
  const wrap = document.createElement("div");
  wrap.className = "msg " + (m.role === "user" ? "msg-user" : "msg-assistant");
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  if (m.role === "user") {
    bubble.textContent = m.content == null ? "" : m.content;
  } else {
    bubble.classList.add("md");
    bubble.innerHTML = renderMarkdown(m.content == null ? "" : m.content);
    enhanceCodeBlocks(bubble);
  }

  wrap.appendChild(bubble);
  return wrap;
}

function renderMessages(list) {
  messagesEl.innerHTML = "";
  statusEl = null;
  liveBubble = null;
  liveText = "";
  if (!list || !list.length) {
    emptyStateEl.classList.remove("is-hidden");
    return;
  }
  emptyStateEl.classList.add("is-hidden");
  const frag = document.createDocumentFragment();
  list.forEach((m) => { frag.appendChild(buildMessageEl(m)); });
  messagesEl.appendChild(frag);
  scrollToBottom();
}

function showStatus(text) {
  if (!statusEl) {
    statusEl = document.createElement("div");
    statusEl.className = "msg-status";
    messagesEl.appendChild(statusEl);
  }
  statusEl.textContent = text;
  scrollToBottom();
}

function clearStatus() {
  if (statusEl && statusEl.parentNode) statusEl.parentNode.removeChild(statusEl);
  statusEl = null;
}

/* ---------- Live assistant bubble ---------- */
function beginAssistantBubble() {
  emptyStateEl.classList.add("is-hidden");
  clearStatus();

  const wrap = document.createElement("div");
  wrap.className = "msg msg-assistant";
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble md";
  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);

  liveBubble = bubble;
  liveText = "";
  scrollToBottom();
  return bubble;
}

function appendToLiveBubble(text) {
  if (!liveBubble) return;
  liveText += text;
  liveBubble.innerHTML = renderMarkdown(liveText);
  enhanceCodeBlocks(liveBubble);
  scrollToBottom();
}

function finalizeLiveBubble(sources) {
  if (!liveBubble) return;
  if (Array.isArray(sources) && sources.length) {
    window.dispatchEvent(new CustomEvent("davai:sources", {
      detail: { cid: currentCid, messageId: null, sources }
    }));
  }
  liveBubble = null;
  liveText = "";
}

/* ---------- Open conversation ---------- */
async function openConversation(cid) {
  if (!currentUid || !cid) return;
  currentCid = cid;

  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  const conv = await getConversation(currentUid, cid);
  if (!conv) {
    messagesEl.innerHTML = "";
    emptyStateEl.classList.remove("is-hidden");
    return;
  }
  renderMessages(conv.messages);

  const msgRef = ref(db, `conversations/${currentUid}/${cid}/messages`);
  const handler = onValue(msgRef, (snap) => {
    if (liveBubble) return; // streaming in progress — don't clobber the DOM
    const rows = [];
    if (snap.exists()) {
      snap.forEach((c) => { rows.push({ id: c.key, ...c.val() }); });
      rows.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    }
    renderMessages(rows);
  }, (err) => {
    console.error("messages listener error", err);
  });

  unsubscribeMessages = () => { off(msgRef, "value", handler); };
}

/* ---------- AI request via backend ---------- */
async function requestAIResponse(userText) {
  if (!currentUid || !currentCid) return;

  if (!isBackendConfigured()) {
    showStatus("AI backend is not connected yet.");
    return;
  }

  const conv = await getConversation(currentUid, currentCid, { messageLimit: 20 });
  const history = (conv && conv.messages ? conv.messages : []).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content || ""
  }));

  if (!history.length || history[history.length - 1].content !== userText) {
    history.push({ role: "user", content: userText });
  }

  beginAssistantBubble();
  stopBtn.classList.remove("is-hidden");
  sendBtn.classList.add("is-hidden");

  streamHandle = askAIStream(
    { messages: history, search: "auto" },
    {
      onDelta: (t) => { appendToLiveBubble(t); },
      onDone: async (meta) => {
        stopBtn.classList.add("is-hidden");
        sendBtn.classList.remove("is-hidden");
        streamHandle = null;

        const finalText = (meta && meta.content) ? meta.content : liveText;
        finalizeLiveBubble(meta && meta.sources);

        if (!finalText) {
          showStatus("No response received.");
          return;
        }

        try {
          await appendMessage(currentUid, currentCid, {
            role: "assistant",
            content: finalText,
            sources: meta && meta.sources ? meta.sources : [],
            model: meta && meta.model ? meta.model : undefined,
            tokens: meta && typeof meta.tokens === "number" ? meta.tokens : undefined
          });

          const metaSnap = await get(ref(db, `conversations/${currentUid}/${currentCid}/metadata`));
          const existing = metaSnap.exists() ? metaSnap.val() : {};
          const prevCount = typeof existing.messageCount === "number" ? existing.messageCount : 0;

          await updateConversationMeta(currentUid, currentCid, {
            lastMessage: finalText.slice(0, 80),
            messageCount: prevCount + 1
          });
        } catch (err) {
          console.error("failed to persist assistant message", err);
          showStatus("Could not save response. It may be lost on refresh.");
        }
      },
      onError: (err) => {
        stopBtn.classList.add("is-hidden");
        sendBtn.classList.remove("is-hidden");
        streamHandle = null;
        const msg = err && err.message ? err.message : "Request failed.";
        showStatus(msg);
      }
    }
  );
}

/* ---------- Stop button ---------- */
stopBtn.addEventListener("click", () => {
  if (streamHandle && typeof streamHandle.abort === "function") {
    streamHandle.abort();
    streamHandle = null;
  }
  stopBtn.classList.add("is-hidden");
  sendBtn.classList.remove("is-hidden");
  if (liveBubble) {
    const partial = liveText;
    finalizeLiveBubble([]);
    if (partial && currentUid && currentCid) {
      appendMessage(currentUid, currentCid, { role: "assistant", content: partial })
        .catch((e) => console.error("save partial failed", e));
    }
  }
});

/* ---------- Send ---------- */
async function sendCurrentMessage() {
  if (!currentUid || sending) return;
  const text = inputEl.value.trim();
  if (!text) return;

  if (!currentCid) {
    try {
      const uiConv = await import("./ui-conversations.js");
      const cid = await uiConv.startNewConversation();
      if (!cid) return;
      currentCid = cid;
    } catch (err) {
      console.error("could not start new conversation", err);
      return;
    }
  }

  sending = true;
  sendBtn.disabled = true;
  inputEl.value = "";
  autosize();

  try {
    await appendMessage(currentUid, currentCid, { role: "user", content: text });

    const metaRef = ref(db, `conversations/${currentUid}/${currentCid}/metadata`);
    const metaSnap = await get(metaRef);
    const existing = metaSnap.exists() ? metaSnap.val() : {};
    const prevCount = typeof existing.messageCount === "number" ? existing.messageCount : 0;

    const patch = {
      lastMessage: text.slice(0, 80),
      messageCount: prevCount + 1
    };
    if (!existing.title || existing.title === "New chat") {
      patch.title = text.slice(0, 40);
    }
    await updateConversationMeta(currentUid, currentCid, patch);

    await requestAIResponse(text);
  } catch (err) {
    console.error("send failed", err);
  } finally {
    sending = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

/* ---------- Event from ui-conversations ---------- */
window.addEventListener("davai:open-conversation", (e) => {
  openConversation(e.detail.cid).catch((err) => console.error("openConversation failed", err));
});

/* ---------- Auth binding ---------- */
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUid = user.uid;
  } else {
    currentUid = null;
    currentCid = null;
    if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
    messagesEl.innerHTML = "";
    emptyStateEl.classList.remove("is-hidden");
  }
});
