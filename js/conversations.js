// DavAI — conversation data layer.
// All reads/writes go to /conversations/{uid}. No UI, no rendering.

import { db } from "./firebase.js";
import {
  ref,
  push,
  set,
  update,
  remove,
  onValue,
  off,
  query,
  orderByChild,
  limitToLast
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

const now = () => Date.now();

export function conversationsRef(uid) {
  return ref(db, `conversations/${uid}`);
}

export function conversationRef(uid, cid) {
  return ref(db, `conversations/${uid}/${cid}`);
}

export function messagesRef(uid, cid) {
  return ref(db, `conversations/${uid}/${cid}/messages`);
}

/* ---------- create ---------- */

export async function createConversation(uid, title = "New chat") {
  const listRef = conversationsRef(uid);
  const newRef = push(listRef);
  const cid = newRef.key;
  const ts = now();

  await set(newRef, {
    metadata: {
      title,
      createdAt: ts,
      updatedAt: ts,
      lastMessage: ""
    },
    messages: {}
  });

  return cid;
}

/* ---------- list (subscribe) ---------- */

export function subscribeConversations(uid, cb) {
  const listRef = conversationsRef(uid);
  const handler = (snap) => {
    const out = [];
    snap.forEach((child) => {
      const v = child.val() || {};
      const m = v.metadata || {};
      out.push({
        id: child.key,
        title: m.title || "New chat",
        createdAt: m.createdAt || 0,
        updatedAt: m.updatedAt || 0,
        lastMessage: m.lastMessage || ""
      });
    });
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    cb(out);
  };
  onValue(listRef, handler);
  return () => off(listRef, "value", handler);
}

/* ---------- rename / delete / touch ---------- */

export async function renameConversation(uid, cid, title) {
  await update(ref(db, `conversations/${uid}/${cid}/metadata`), {
    title: String(title).slice(0, 200),
    updatedAt: now()
  });
}

export async function deleteConversation(uid, cid) {
  await remove(conversationRef(uid, cid));
}

export async function touchConversation(uid, cid, lastMessage) {
  await update(ref(db, `conversations/${uid}/${cid}/metadata`), {
    updatedAt: now(),
    lastMessage: String(lastMessage || "").slice(0, 500)
  });
}

/* ---------- messages ---------- */

export async function addMessage(uid, cid, msg) {
  const msgRef = push(messagesRef(uid, cid));
  const payload = {
    role: msg.role,
    content: String(msg.content ?? ""),
    timestamp: msg.timestamp || now()
  };
  if (msg.status) payload.status = msg.status;
  if (msg.model) payload.model = msg.model;
  if (typeof msg.tokens === "number") payload.tokens = msg.tokens;
  if (msg.sources && typeof msg.sources === "object") payload.sources = msg.sources;

  await set(msgRef, payload);
  return msgRef.key;
}

export async function updateMessage(uid, cid, mid, patch) {
  await update(ref(db, `conversations/${uid}/${cid}/messages/${mid}`), patch);
}

export async function deleteMessage(uid, cid, mid) {
  await remove(ref(db, `conversations/${uid}/${cid}/messages/${mid}`));
}

/* ---------- messages stream (last 200) ---------- */

export function subscribeMessages(uid, cid, cb, limit = 200) {
  const q = query(messagesRef(uid, cid), orderByChild("timestamp"), limitToLast(limit));
  const handler = (snap) => {
    const out = [];
    snap.forEach((child) => {
      const v = child.val() || {};
      out.push({
        id: child.key,
        role: v.role,
        content: v.content || "",
        timestamp: v.timestamp || 0,
        status: v.status || "",
        model: v.model || "",
        tokens: v.tokens || 0,
        sources: v.sources || null
      });
    });
    out.sort((a, b) => a.timestamp - b.timestamp);
    cb(out);
  };
  onValue(q, handler);
  return () => off(q, "value", handler);
}
