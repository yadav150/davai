// DavAI — Memory UI.
// View, add, edit, delete, clear. All writes await before UI updates.

import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  listMemory,
  addMemory,
  updateMemory,
  deleteMemory,
  clearMemory
} from "./memory.js";

const $ = (id) => document.getElementById(id);

const modal    = $("memoryModal");
const openBtn  = $("memoryBtn");
const closeEls = document.querySelectorAll("[data-close-memory]");
const keyInput = $("memKey");
const valInput = $("memValue");
const addBtn   = $("memAddBtn");
const listEl   = $("memList");
const errEl    = $("memError");
const clearBtn = $("memClearBtn");

let currentUid = null;
let busy = false;

function showError(msg) {
  if (!errEl) return;
  errEl.textContent = msg || "";
}
function clearError() { showError(""); }

function setBusy(on) {
  busy = !!on;
  if (addBtn) addBtn.disabled = busy;
  if (clearBtn) clearBtn.disabled = busy;
}

async function render() {
  if (!currentUid || !listEl) return;
  listEl.innerHTML = "";
  const rows = await listMemory(currentUid);
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "conv-empty";
    empty.textContent = "No memory entries yet.";
    listEl.appendChild(empty);
    return;
  }
  rows.forEach((r) => listEl.appendChild(buildRow(r)));
}

function buildRow(r) {
  const row = document.createElement("div");
  row.className = "memory-row";

  const info = document.createElement("div");
  info.className = "memory-info";

  const keyEl = document.createElement("div");
  keyEl.className = "memory-key";
  keyEl.textContent = r.key;

  const valEl = document.createElement("div");
  valEl.className = "memory-value";
  valEl.textContent = r.value;

  info.appendChild(keyEl);
  info.appendChild(valEl);

  const actions = document.createElement("div");
  actions.className = "memory-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn btn-ghost";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", async () => {
    if (busy) return;
    const newVal = window.prompt("Edit value", r.value);
    if (newVal == null) return;
    const clean = newVal.trim();
    if (!clean || clean === r.value) return;
    setBusy(true);
    try {
      await updateMemory(currentUid, r.id, { value: clean });
      await render();
    } catch (err) {
      showError("Update failed: " + (err && err.message ? err.message : "unknown"));
    } finally { setBusy(false); }
  });

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "btn btn-ghost";
  delBtn.textContent = "Delete";
  delBtn.addEventListener("click", async () => {
    if (busy) return;
    if (!window.confirm("Delete this memory entry?")) return;
    setBusy(true);
    try {
      await deleteMemory(currentUid, r.id);
      await render();
    } catch (err) {
      showError("Delete failed: " + (err && err.message ? err.message : "unknown"));
    } finally { setBusy(false); }
  });

  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  row.appendChild(info);
  row.appendChild(actions);
  return row;
}

/* ---------- Add ---------- */
async function onAdd() {
  if (!currentUid || busy) return;
  clearError();
  const k = (keyInput && keyInput.value || "").trim();
  const v = (valInput && valInput.value || "").trim();
  if (!k || !v) { showError("Both key and value are required."); return; }
  setBusy(true);
  try {
    await addMemory(currentUid, k, v);
    if (keyInput) keyInput.value = "";
    if (valInput) valInput.value = "";
    await render();
  } catch (err) {
    showError("Add failed: " + (err && err.message ? err.message : "unknown"));
  } finally { setBusy(false); }
}

if (addBtn) addBtn.addEventListener("click", onAdd);
if (valInput) valInput.addEventListener("keydown", (e) => { if (e.key === "Enter") onAdd(); });

/* ---------- Clear all ---------- */
if (clearBtn) clearBtn.addEventListener("click", async () => {
  if (!currentUid || busy) return;
  if (!window.confirm("Clear all memory entries? This cannot be undone.")) return;
  setBusy(true);
  clearError();
  try {
    await clearMemory(currentUid);
    await render();
  } catch (err) {
    showError("Clear failed: " + (err && err.message ? err.message : "unknown"));
  } finally { setBusy(false); }
});

/* ---------- Open / close ---------- */
function openModal() {
  if (!modal) return;
  clearError();
  modal.classList.remove("is-hidden");
  modal.setAttribute("aria-hidden", "false");
  render().catch((e) => console.error("memory render failed", e));
}
function closeModal() {
  if (!modal) return;
  modal.classList.add("is-hidden");
  modal.setAttribute("aria-hidden", "true");
}

if (openBtn) openBtn.addEventListener("click", openModal);
closeEls.forEach((el) => el.addEventListener("click", closeModal));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal && !modal.classList.contains("is-hidden")) closeModal();
});

/* ---------- Auth ---------- */
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUid = user.uid;
  } else {
    currentUid = null;
    if (listEl) listEl.innerHTML = "";
  }
});
