// DavAI — shell.
// Wires conversations.js into the UI: sidebar list, chat header, messages,
// composer. AI calls land in a later module.

import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  createConversation,
  subscribeConversations,
  subscribeMessages,
  addMessage,
  renameConversation,
  deleteConversation,
  touchConversation
} from "./conversations.js";
import {
  escapeHtml, formatIST, icon, toast,
  openContextMenu, confirmDialog, renameDialog, closeDrawer
} from "./ui.js";
import { renderMarkdown, enhanceCodeBlocks } from "./markdown.js";

const $ = (id) => document.getElementById(id);

let uid = null;
let activeCid = null;
let unsubConvs = null;
let unsubMsgs = null;
let convs = [];
let filterText = "";
let sending = false;

/* ---------- sidebar ---------- */

function renderConvs() {
  const list = $("convList");
  if (!list) return;

  const q = filterText.trim().toLowerCase();
  const filtered = q
    ? convs.filter((c) =>
        c.title.toLowerCase().includes(q) || (c.lastMessage || "").toLowerCase().includes(q)
      )
    : convs;

  if (filtered.length === 0) {
    list.innerHTML = `<div class="conv-empty">${
      convs.length === 0 ? "No conversations yet." : "No matches."
    }</div>`;
    return;
  }

  const html = filtered
    .map((c) => `
      <button class="conv-item${c.id === activeCid ? " is-active" : ""}" data-cid="${escapeHtml(c.id)}" type="button">
        <span class="conv-title">${escapeHtml(c.title)}</span>
        <span class="conv-more" data-more="${escapeHtml(c.id)}" role="button" aria-label="More options">${icon("more", "sm")}</span>
      </button>
    `)
    .join("");

  list.innerHTML = html;

  list.querySelectorAll(".conv-item").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (e.target.closest("[data-more]")) return;
      openConv(btn.dataset.cid);
    });
  });

  list.querySelectorAll("[data-more]").forEach((more) => {
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      const rect = more.getBoundingClientRect();
      const cid = more.dataset.more;
      openContextMenu(rect.left, rect.bottom + 4, [
        { label: "Rename", icon: "edit", onClick: () => renameConv(cid) },
        { separator: true },
        { label: "Delete", icon: "trash", onClick: () => deleteConv(cid) }
      ]);
    });
  });
}

/* ---------- messages ---------- */

function renderMessages(msgs) {
  const inner = $("messagesInner");
  const empty = $("emptyState");
  if (!inner) return;

  if (!msgs || msgs.length === 0) {
    inner.innerHTML = "";
    if (empty) empty.classList.remove("is-hidden");
    return;
  }
  if (empty) empty.classList.add("is-hidden");

  inner.innerHTML = msgs
    .map((m) => {
      const role = m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : "system";
      const time = formatIST(m.timestamp, "time");
      const body = role === "assistant"
        ? renderMarkdown(m.content)
        : escapeHtml(m.content).replace(/\n/g, "<br>");
      const actions =
        role !== "system"
          ? `<div class="msg-actions">
               <button class="icon-btn" data-copy title="Copy">${icon("copy", "sm")}</button>
             </div>`
          : "";
      return `
        <div class="msg msg-${role}">
          <div class="msg-head">
            <span class="msg-role">${role}</span>
            <span class="msg-time">${escapeHtml(time)}</span>
          </div>
          <div class="msg-body">${body}</div>
          ${actions}
        </div>
      `;
    })
    .join("");

  enhanceCodeBlocks(inner);

  inner.querySelectorAll("[data-copy-code]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const codeEl = btn.closest(".code-block")?.querySelector("pre > code");
      if (!codeEl) return;
      try {
        await navigator.clipboard.writeText(codeEl.innerText);
        btn.textContent = "Copied";
        setTimeout(() => { btn.textContent = "Copy"; }, 1200);
      } catch {
        toast("Copy failed.", { type: "error" });
      }
    });
  });

  inner.querySelectorAll(".msg").forEach((el, i) => {
    const m = msgs[i];
    const btn = el.querySelector("[data-copy]");
    if (btn && m) {
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(m.content || "");
          toast("Copied.", { type: "success", duration: 1500 });
        } catch {
          toast("Copy failed.", { type: "error" });
        }
      });
    }
  });

  const container = $("messages");
  if (container) container.scrollTop = container.scrollHeight;
}

/* ---------- conversation state ---------- */

function attachMessagesSub(cid) {
  if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; }
  unsubMsgs = subscribeMessages(uid, cid, (msgs) => {
    renderMessages(msgs);
    const sub = $("chatSubtitle");
    if (sub) sub.textContent = msgs.length
      ? `${msgs.length} message${msgs.length === 1 ? "" : "s"}`
      : "";
  });
}

function openConv(cid) {
  if (cid === activeCid) {
    if (innerWidth <= 900) closeDrawer();
    return;
  }
  activeCid = cid;
  if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; }

  const conv = convs.find((c) => c.id === cid);
  const titleEl = $("chatTitle");
  if (titleEl && conv) titleEl.textContent = conv.title;

  attachMessagesSub(cid);
  renderConvs();
  if (innerWidth <= 900) closeDrawer();
}

function newChat() {
  activeCid = null;
  if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; }
  renderMessages([]);
  const t = $("chatTitle");
  const s = $("chatSubtitle");
  if (t) t.textContent = "New chat";
  if (s) s.textContent = "";
  renderConvs();
  const input = $("composerInput");
  if (input) input.focus();
  if (innerWidth <= 900) closeDrawer();
}

async function renameConv(cid) {
  const conv = convs.find((c) => c.id === cid);
  const next = await renameDialog({ defaultValue: conv ? conv.title : "" });
  if (!next) return;
  try {
    await renameConversation(uid, cid, next);
    toast("Renamed.", { type: "success", duration: 1500 });
  } catch (e) {
    toast(e.code || e.message || "Rename failed", { type: "error" });
  }
}

async function deleteConv(cid) {
  const ok = await confirmDialog({
    title: "Delete conversation?",
    message: "This will permanently remove the conversation and all its messages.",
    confirmText: "Delete"
  });
  if (!ok) return;
  try {
    await deleteConversation(uid, cid);
    if (activeCid === cid) newChat();
    toast("Deleted.", { type: "success", duration: 1500 });
  } catch (e) {
    toast(e.code || e.message || "Delete failed", { type: "error" });
  }
}

/* ---------- composer ---------- */

function autosize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 200) + "px";
}

function updateSendBtn() {
  const input = $("composerInput");
  const btn = $("sendBtn");
  if (!input || !btn) return;
  const hasText = input.value.trim().length > 0;
  btn.disabled = !hasText || sending || !uid;
  btn.classList.toggle("is-active", hasText && !sending);
}

async function handleSend() {
  const input = $("composerInput");
  if (!input) return;
  const text = input.value.trim();
  if (!text || sending || !uid) return;

  sending = true;
  updateSendBtn();

  try {
    let cid = activeCid;
    if (!cid) {
      cid = await createConversation(uid, text.slice(0, 40));
      activeCid = cid;
      attachMessagesSub(cid);
      renderConvs();
    }

    await addMessage(uid, cid, { role: "user", content: text });
    await touchConversation(uid, cid, text.slice(0, 60));

    const conv = convs.find((c) => c.id === cid);
    if (conv && conv.title === "New chat") {
      await renameConversation(uid, cid, text.slice(0, 40));
    }

    input.value = "";
    autosize(input);
    updateSendBtn();
    // AI response lands in a later module.
  } catch (e) {
    console.error(e);
    toast(e.code || e.message || "Send failed", { type: "error" });
  } finally {
    sending = false;
    updateSendBtn();
  }
}

/* ---------- wiring ---------- */

function wire() {
  const form = $("composer");
  const input = $("composerInput");
  const search = $("convSearch");
  const newBtn = $("newChatBtn");

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      handleSend();
    });
  }

  if (input) {
    input.addEventListener("input", () => {
      autosize(input);
      updateSendBtn();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
    autosize(input);
  }

  if (search) {
    search.addEventListener("input", () => {
      filterText = search.value;
      renderConvs();
    });
  }

  if (newBtn) newBtn.addEventListener("click", newChat);
}

/* ---------- lifecycle ---------- */

function start() {
  if (unsubConvs) { unsubConvs(); unsubConvs = null; }
  unsubConvs = subscribeConversations(uid, (list) => {
    convs = list;
    renderConvs();
    if (activeCid) {
      const c = list.find((x) => x.id === activeCid);
      const t = $("chatTitle");
      if (c && t) t.textContent = c.title;
    }
  });
}

function cleanup() {
  if (unsubConvs) { unsubConvs(); unsubConvs = null; }
  if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; }
  uid = null;
  activeCid = null;
  convs = [];
  renderConvs();
  renderMessages([]);
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    uid = user.uid;
    start();
    updateSendBtn();
  } else {
    cleanup();
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wire);
} else {
  wire();
}
