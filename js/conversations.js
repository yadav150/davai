// DavAI — Conversations data layer.
// All reads/writes go through Firebase Realtime Database.
// No local persistence, no hardcoded conversation data.

import { db } from "./firebase.js";
import {
  ref,
  push,
  get,
  set,
  update,
  remove,
  query,
  orderByChild,
  limitToLast,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

const CONV_ROOT = (uid) => `conversations/${uid}`;
const MSG_ROOT  = (uid, cid) => `conversations/${uid}/${cid}/messages`;

/* ---------- Create ---------- */
// Creates an empty conversation and returns its Firebase key.
export async function createConversation(uid, { title = "New chat" } = {}) {
  if (!uid) throw new Error("createConversation: missing uid");

  const listRef = ref(db, CONV_ROOT(uid));
  const newRef = push(listRef);
  const cid = newRef.key;

  await set(newRef, {
    metadata: {
      title,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: "",
      messageCount: 0
    }
  });

  return cid;
}

/* ---------- List ---------- */
// Returns the most recently updated conversations first.
export async function listConversations(uid, { limit = 50 } = {}) {
  if (!uid) throw new Error("listConversations: missing uid");

  const q = query(
    ref(db, CONV_ROOT(uid)),
    orderByChild("metadata/updatedAt"),
    limitToLast(limit)
  );

  const snap = await get(q);
  if (!snap.exists()) return [];

  const rows = [];
  snap.forEach((child) => {
    const v = child.val() || {};
    const meta = v.metadata || {};
    rows.push({
      id: child.key,
      title: meta.title || "New chat",
      lastMessage: meta.lastMessage || "",
      messageCount: meta.messageCount || 0,
      createdAt: meta.createdAt || null,
      updatedAt: meta.updatedAt || null
    });
  });

  // Newest first.
  rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return rows;
}

/* ---------- Read one ---------- */
// Returns { metadata, messages: [{id, ...}] } or null if missing.
export async function getConversation(uid, cid, { messageLimit = 200 } = {}) {
  if (!uid || !cid) throw new Error("getConversation: missing uid/cid");

  const metaSnap = await get(ref(db, `${CONV_ROOT(uid)}/${cid}/metadata`));
  if (!metaSnap.exists()) return null;

  const msgQuery = query(
    ref(db, MSG_ROOT(uid, cid)),
    orderByChild("timestamp"),
    limitToLast(messageLimit)
  );
  const msgSnap = await get(msgQuery);

  const messages = [];
  if (msgSnap.exists()) {
    msgSnap.forEach((m) => {
      messages.push({ id: m.key, ...m.val() });
    });
    messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }

  return { metadata: metaSnap.val(), messages };
}

/* ---------- Messages ---------- */
// Appends a message. Message shape:
//   { role: "user"|"assistant"|"system", content, sources?, model?, status?, tokens? }
export async function appendMessage(uid, cid, message) {
  if (!uid || !cid) throw new Error("appendMessage: missing uid/cid");
  if (!message || !message.role || typeof message.content !== "string") {
    throw new Error("appendMessage: invalid message");
  }

  const msgRef = push(ref(db, MSG_ROOT(uid, cid)));
  const payload = {
    role: message.role,
    content: message.content,
    timestamp: serverTimestamp()
  };
  if (Array.isArray(message.sources))  payload.sources = message.sources;
  if (message.model)                   payload.model = message.model;
  if (message.status)                  payload.status = message.status;
  if (typeof message.tokens === "number") payload.tokens = message.tokens;

  await set(msgRef, payload);
  return msgRef.key;
}

/* ---------- Update metadata ---------- */
// Patch metadata fields. Always bumps updatedAt.
export async function updateConversationMeta(uid, cid, patch = {}) {
  if (!uid || !cid) throw new Error("updateConversationMeta: missing uid/cid");
  const clean = { ...patch };
  delete clean.createdAt;
  clean.updatedAt = serverTimestamp();

  await update(ref(db, `${CONV_ROOT(uid)}/${cid}/metadata`), clean);
}

/* ---------- Rename ---------- */
export async function renameConversation(uid, cid, title) {
  if (!uid || !cid) throw new Error("renameConversation: missing uid/cid");
  const clean = (title || "").trim();
  if (!clean) throw new Error("renameConversation: empty title");
  await update(ref(db, `${CONV_ROOT(uid)}/${cid}/metadata`), {
    title: clean.slice(0, 120),
    updatedAt: serverTimestamp()
  });
}

/* ---------- Delete ---------- */
export async function deleteConversation(uid, cid) {
  if (!uid || !cid) throw new Error("deleteConversation: missing uid/cid");
  await remove(ref(db, `${CONV_ROOT(uid)}/${cid}`));
}
