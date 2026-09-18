// DavAI — Chat composer + message rendering.
// User messages are saved to Firebase. AI responses arrive in Step 10
// via backend — no fake assistant content is written here.

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { ref, onValue, off, get } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";
import { appendMessage, getConversation, updateConversationMeta } from "./conversations.js";

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
  bubble.textContent = m.content == null ? "" : m.content;
  wrap.appendChild(bubble);
  return wrap;
}

function renderMessages(list) {
  messagesEl.innerHTML = "";
  statusEl = null;
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

/* ---------- AI hook (Step 10 wires backend) ---------- */
async function requestAIResponse() {
  // No fake assistant message is written to Firebase.
  showStatus("AI backend not connected yet.");
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
