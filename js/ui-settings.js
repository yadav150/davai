// DavAI — Settings UI.
// Loads settings from Firebase, writes back on change.
// No hardcoded user values — Firebase is the source of truth.

import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { loadUserSettings, saveUserSettings } from "./user.js";

const $ = (id) => document.getElementById(id);

const modal   = $("settingsModal");
const openBtn = $("settingsBtn");
const note    = $("settingsNote");

const fields = {
  theme:          $("setTheme"),
  language:       $("setLanguage"),
  responseStyle:  $("setResponseStyle"),
  responseLength: $("setResponseLength"),
  memoryEnabled:  $("setMemory"),
  searchEnabled:  $("setSearch"),
  provider:       $("setProvider"),
  model:          $("setModel")
};

let currentUid = null;
let saveTimer = null;

function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("davai.theme", t); } catch {}
}

function fillForm(settings) {
  if (!settings) return;
  if (fields.theme)          fields.theme.value          = settings.theme || "dark";
  if (fields.language)       fields.language.value       = settings.language || "auto";
  if (fields.responseStyle)  fields.responseStyle.value  = settings.responseStyle || "balanced";
  if (fields.responseLength) fields.responseLength.value = settings.responseLength || "medium";
  if (fields.memoryEnabled)  fields.memoryEnabled.checked  = settings.memoryEnabled !== false;
  if (fields.searchEnabled)  fields.searchEnabled.checked  = settings.searchEnabled !== false;
  if (fields.provider)       fields.provider.value       = settings.provider || "groq";
  if (fields.model)          fields.model.value          = settings.model || "openai/gpt-oss-120b";
  applyTheme(settings.theme || "dark");
}

function readForm() {
  return {
    theme:          fields.theme ? fields.theme.value : "dark",
    language:       fields.language ? fields.language.value : "auto",
    responseStyle:  fields.responseStyle ? fields.responseStyle.value : "balanced",
    responseLength: fields.responseLength ? fields.responseLength.value : "medium",
    memoryEnabled:  fields.memoryEnabled ? !!fields.memoryEnabled.checked : true,
    searchEnabled:  fields.searchEnabled ? !!fields.searchEnabled.checked : true,
    provider:       fields.provider ? fields.provider.value : "groq",
    model:          fields.model ? fields.model.value.trim() : "openai/gpt-oss-120b"
  };
}

function showNote(text, isError) {
  if (!note) return;
  note.textContent = text;
  note.classList.toggle("is-error", !!isError);
}

async function persist() {
  if (!currentUid) return;
  const patch = readForm();
  if (patch.theme) applyTheme(patch.theme);
  try {
    await saveUserSettings(currentUid, patch);
    showNote("Saved", false);
    setTimeout(() => { if (note) showNote("", false); }, 1200);
  } catch (err) {
    console.error("saveUserSettings failed", err);
    showNote("Save failed: " + (err && err.message ? err.message : "unknown error"), true);
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; persist(); }, 300);
}

Object.values(fields).forEach((el) => {
  if (!el) return;
  el.addEventListener("change", () => {
    if (el === fields.theme) applyTheme(el.value);
    scheduleSave();
  });
  if (el.tagName === "INPUT" && el.type === "text") {
    el.addEventListener("input", scheduleSave);
  }
});

/* ---------- Open / close ---------- */
function openModal() {
  if (!modal) return;
  modal.classList.remove("is-hidden");
  modal.setAttribute("aria-hidden", "false");
}
function closeModal() {
  if (!modal) return;
  modal.classList.add("is-hidden");
  modal.setAttribute("aria-hidden", "true");
}

if (openBtn) openBtn.addEventListener("click", openModal);

document.querySelectorAll("[data-close-settings]").forEach((el) => {
  el.addEventListener("click", closeModal);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal && !modal.classList.contains("is-hidden")) closeModal();
});

/* ---------- Auth ---------- */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    try {
      const settings = await loadUserSettings(user.uid);
      fillForm(settings);
    } catch (err) {
      console.error("loadUserSettings failed", err);
    }
  } else {
    currentUid = null;
  }
});

/* ---------- Public getters ---------- */
export function getSettingsSnapshot() {
  return readForm();
}
