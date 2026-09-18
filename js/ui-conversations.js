// DavAI — Conversations UI.
// Renders sidebar list from Firebase, wires new chat / open / rename / delete / search.
// No DOM outside sidebar + chat header title. Chat rendering is Step 9+.

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { ref, onValue, off } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";
import {
  createConversation,
  listConversations,
  updateConversationMeta,
  renameConversation,
  deleteConversation
} from "./conversations.js";

const $ = (id) => document.getElementById(id);

const convListEl  = $("convList");
const convSearchEl= $("convSearch");
const newChatBtn  = $("newChatBtn");
const chatTitleEl = $("chatTitle");
const chatSubEl   = $("chatSubtitle");
const messagesEl  = $("messages");
const emptyStateEl= $("emptyState");

let currentUid = null;
let currentCid = null;
let allRows = [];
let searchTerm = "";

/* ---------- Helpers ---------- */
function esc(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h";
  const d = Math.floor(h / 24);
  if (d < 7) return d + "d";
  return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/* ---------- Render sidebar ---------- */
function renderList() {
  if (!currentUid) return;

  const term = searchTerm.trim().toLowerCase();
  const rows = term
    ? allRows.filter(r =>
        (r.title || "").toLowerCase().includes(term) ||
        (r.lastMessage || "").toLowerCase().includes(term)
      )
    : allRows;

  convListEl.innerHTML = "";

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "conv-empty";
    empty.textContent = term ? "No matches" : "No conversations yet";
    convListEl.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  rows.forEach((r) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "conv-item" + (r.id === currentCid ? " is-active" : "");
    item.dataset.cid = r.id;

    const titleSpan = document.createElement("span");
    titleSpan.className = "conv-title";
    titleSpan.textContent = r.title || "New chat";

    const metaSpan = document.createElement("span");
    metaSpan.className = "conv-meta";
    metaSpan.textContent = timeAgo(r.updatedAt);

    item.appendChild(titleSpan);
    item.appendChild(metaSpan);

    item.addEventListener("click", () => openConversation(r.id));

    item.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      showRowMenu(r.id, ev.clientX, ev.clientY);
    });

    frag.appendChild(item);
  });
  convListEl.appendChild(frag);
}

/* ---------- Row menu (rename / delete) ---------- */
let activeMenu = null;
function closeRowMenu() {
  if (activeMenu && activeMenu.parentNode) activeMenu.parentNode.removeChild(activeMenu);
  activeMenu = null;
}
function showRowMenu(cid, x, y) {
  closeRowMenu();
  const menu = document.createElement("div");
  menu.className = "conv-menu";

  const rename = document.createElement("button");
  rename.type = "button";
  rename.className = "conv-menu-item";
  rename.textContent = "Rename";
  rename.addEventListener("click", async () => {
    closeRowMenu();
    const row = allRows.find(r => r.id === cid);
    const next = window.prompt("Rename conversation", row ? row.title : "");
    if (next == null) return;
    const clean = next.trim();
    if (!clean) return;
    try {
      await renameConversation(currentUid, cid, clean);
      await refreshList();
      if (cid === currentCid) chatTitleEl.textContent = clean;
    } catch (err) {
      console.error("rename failed", err);
      window.alert("Rename failed: " + (err && err.message ? err.message : "unknown error"));
    }
  });

  const del = document.createElement("button");
  del.type = "button";
  del.className = "conv-menu-item danger";
  del.textContent = "Delete";
  del.addEventListener("click", async () => {
    closeRowMenu();
    const ok = window.confirm("Delete this conversation? This cannot be undone.");
    if (!ok) return;
    try {
      await deleteConversation(currentUid, cid);
      if (cid === currentCid) {
        currentCid = null;
        chatTitleEl.textContent = "New chat";
        chatSubEl.textContent = "";
        messagesEl.innerHTML = "";
        if (emptyStateEl) emptyStateEl.classList.remove("is-hidden");
      }
      await refreshList();
    } catch (err) {
      console.error("delete failed", err);
      window.alert("Delete failed: " + (err && err.message ? err.message : "unknown error"));
    }
  });

  menu.appendChild(rename);
  menu.appendChild(del);
  document.body.appendChild(menu);
  activeMenu = menu;

  const rect = menu.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  menu.style.left = Math.min(x, vw - rect.width - 8) + "px";
  menu.style.top  = Math.min(y, vh - rect.height - 8) + "px";

  setTimeout(() => {
    document.addEventListener("click", closeRowMenu, { once: true });
    document.addEventListener("scroll", closeRowMenu, { once: true, capture: true });
  }, 0);
}

/* ---------- Data ---------- */
async function refreshList() {
  if (!currentUid) return;
  try {
    allRows = await listConversations(currentUid);
    renderList();
  } catch (err) {
    console.error("listConversations failed", err);
  }
}

/* ---------- Actions ---------- */
export async function openConversation(cid) {
  if (!currentUid || !cid) return;
  currentCid = cid;
  const row = allRows.find(r => r.id === cid);
  chatTitleEl.textContent = row ? (row.title || "New chat") : "New chat";
  chatSubEl.textContent = row && row.lastMessage ? row.lastMessage : "";
  renderList();

  // Message rendering belongs to chat module (next step). Emit an event.
  window.dispatchEvent(new CustomEvent("davai:open-conversation", { detail: { cid } }));
}

export async function startNewConversation() {
  if (!currentUid) return null;
  try {
    const cid = await createConversation(currentUid, { title: "New chat" });
    await refreshList();
    await openConversation(cid);
    return cid;
  } catch (err) {
    console.error("createConversation failed", err);
    return null;
  }
}

/* ---------- Search ---------- */
convSearchEl.addEventListener("input", () => {
  searchTerm = convSearchEl.value || "";
  renderList();
});

/* ---------- New chat button ---------- */
newChatBtn.addEventListener("click", () => { startNewConversation(); });

/* ---------- Public getters ---------- */
export function getCurrentUid() { return currentUid; }
export function getCurrentCid() { return currentCid; }

/* ---------- Auth binding ---------- */
let listRef = null;
let listHandler = null;

function bindRealtimeList(uid) {
  if (listRef && listHandler) {
    off(listRef, "value", listHandler);
    listRef = null;
    listHandler = null;
  }
  listRef = ref(db, `conversations/${uid}`);
  listHandler = onValue(listRef, () => {
    refreshList();
  }, (err) => {
    console.error("realtime conversations listener error", err);
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUid = user.uid;
    refreshList();
    bindRealtimeList(user.uid);
  } else {
    currentUid = null;
    currentCid = null;
    allRows = [];
    if (listRef && listHandler) {
      off(listRef, "value", listHandler);
      listRef = null;
      listHandler = null;
    }
    renderList();
  }
});
