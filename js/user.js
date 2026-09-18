// DavAI — User profile + settings bootstrap.
// First real Firebase Realtime Database writes happen here.
// Once created, Firebase is the source of truth — no hardcoded defaults
// override existing values.

import { db } from "./firebase.js";
import {
  ref,
  get,
  set,
  update,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

const DEFAULT_SETTINGS = {
  theme: "dark",
  language: "auto",
  responseStyle: "balanced",
  responseLength: "medium",
  memoryEnabled: true,
  searchEnabled: true,
  model: "openai/gpt-oss-120b",
  provider: "groq"
};

const DEFAULT_PROFILE = {
  displayName: "",
  photoURL: "",
  createdAt: null,
  lastSeenAt: null
};

// Ensure users/{uid}/profile and users/{uid}/settings exist.
// Missing fields are filled once; existing values are never overwritten.
export async function ensureUserRecord(user) {
  if (!user || !user.uid) throw new Error("ensureUserRecord: missing user");

  const profileRef  = ref(db, `users/${user.uid}/profile`);
  const settingsRef = ref(db, `users/${user.uid}/settings`);

  const [profileSnap, settingsSnap] = await Promise.all([
    get(profileRef),
    get(settingsRef)
  ]);

  const writes = {};

  if (!profileSnap.exists()) {
    writes[`users/${user.uid}/profile`] = {
      ...DEFAULT_PROFILE,
      displayName: user.displayName || "",
      photoURL: user.photoURL || "",
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp()
    };
  } else {
    // Always refresh lastSeenAt and fill missing fields from the auth user.
    const existing = profileSnap.val() || {};
    const patch = { lastSeenAt: serverTimestamp() };
    if (!existing.displayName && user.displayName) patch.displayName = user.displayName;
    if (!existing.photoURL && user.photoURL)       patch.photoURL = user.photoURL;
    writes[`users/${user.uid}/profile`] = { ...existing, ...patch };
  }

  if (!settingsSnap.exists()) {
    writes[`users/${user.uid}/settings`] = DEFAULT_SETTINGS;
  } else {
    // Fill only missing keys — never overwrite user-chosen values.
    const existing = settingsSnap.val() || {};
    const patch = {};
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (!(k in existing)) patch[k] = DEFAULT_SETTINGS[k];
    }
    if (Object.keys(patch).length) {
      writes[`users/${user.uid}/settings`] = { ...existing, ...patch };
    }
  }

  const keys = Object.keys(writes);
  if (!keys.length) return;

  // Multi-path update in one atomic write.
  await update(ref(db), writes);
}

// Load current settings. Caller decides how to use them.
export async function loadUserSettings(uid) {
  if (!uid) throw new Error("loadUserSettings: missing uid");
  const snap = await get(ref(db, `users/${uid}/settings`));
  return snap.exists() ? snap.val() : { ...DEFAULT_SETTINGS };
}

// Update one or more settings. Writes are awaited before resolving.
export async function saveUserSettings(uid, patch) {
  if (!uid) throw new Error("saveUserSettings: missing uid");
  if (!patch || typeof patch !== "object") return;
  await update(ref(db, `users/${uid}/settings`), patch);
}

// Load profile.
export async function loadUserProfile(uid) {
  if (!uid) throw new Error("loadUserProfile: missing uid");
  const snap = await get(ref(db, `users/${uid}/profile`));
  return snap.exists() ? snap.val() : null;
}
