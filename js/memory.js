// DavAI — Personal memory data layer.
// User-scoped, opt-in via settings.memoryEnabled.
// No sensitive data auto-stored — only what the user or AI explicitly adds.

import { db } from "./firebase.js";
import {
  ref,
  push,
  get,
  set,
  update,
  remove,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

const MEM_ROOT = (uid) => `memory/${uid}`;

/* ---------- List ---------- */
// Returns array of { id, key, value, createdAt, updatedAt } sorted newest first.
export async function listMemory(uid) {
  if (!uid) throw new Error("listMemory: missing uid");
  const snap = await get(ref(db, MEM_ROOT(uid)));
  if (!snap.exists()) return [];
  const rows = [];
  snap.forEach((child) => {
    const v = child.val() || {};
    rows.push({
      id: child.key,
      key: v.key || "",
      value: v.value || "",
      createdAt: v.createdAt || 0,
      updatedAt: v.updatedAt || 0
    });
  });
  rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return rows;
}

/* ---------- Add ---------- */
// key: short label ("preferred_language"), value: string content.
export async function addMemory(uid, key, value) {
  if (!uid) throw new Error("addMemory: missing uid");
  const k = (key || "").trim();
  const v = (value || "").trim();
  if (!k || !v) throw new Error("addMemory: empty key or value");

  const newRef = push(ref(db, MEM_ROOT(uid)));
  await set(newRef, {
    key: k.slice(0, 64),
    value: v.slice(0, 500),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return newRef.key;
}

/* ---------- Update ---------- */
export async function updateMemory(uid, id, patch) {
  if (!uid || !id) throw new Error("updateMemory: missing uid/id");
  const clean = {};
  if (typeof patch.key === "string")   clean.key   = patch.key.trim().slice(0, 64);
  if (typeof patch.value === "string") clean.value = patch.value.trim().slice(0, 500);
  if (!Object.keys(clean).length) return;
  clean.updatedAt = serverTimestamp();
  await update(ref(db, `${MEM_ROOT(uid)}/${id}`), clean);
}

/* ---------- Delete ---------- */
export async function deleteMemory(uid, id) {
  if (!uid || !id) throw new Error("deleteMemory: missing uid/id");
  await remove(ref(db, `${MEM_ROOT(uid)}/${id}`));
}

/* ---------- Clear all ---------- */
export async function clearMemory(uid) {
  if (!uid) throw new Error("clearMemory: missing uid");
  await remove(ref(db, MEM_ROOT(uid)));
}

/* ---------- Context builder for backend ---------- */
// Returns a compact string the backend can pass to the AI as memory context.
// Only called when memoryEnabled === true.
export async function buildMemoryContext(uid, { max = 20 } = {}) {
  if (!uid) return "";
  const rows = await listMemory(uid);
  if (!rows.length) return "";
  return rows.slice(0, max).map((r) => `- ${r.key}: ${r.value}`).join("\n");
}
