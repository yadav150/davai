// DavAI — Profile module.
// Manages: DP (Cloudinary upload / initials fallback), display name, bio,
// change password (email users), sign out all devices, delete account.
// All writes await before UI updates.

import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  signOut,
  deleteUser
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  ref,
  get,
  update,
  remove
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";
import { uploadImage, initialsFrom } from "./cloudinary.js";

const $ = (id) => document.getElementById(id);

const modal         = $("profileModal");
const openBtn       = $("profileBtn");
const closeEls      = document.querySelectorAll("[data-close-profile]");

const avatarEl      = $("profileAvatar");
const initialsEl    = $("profileInitials");
const displayNameEl = $("profileDisplayName");
const emailEl       = $("profileEmail");
const providerEl    = $("profileProvider");

const uploadBtn     = $("profileUploadBtn");
const removeBtn     = $("profileRemoveBtn");
const fileInput     = $("profileFileInput");

const nameInput     = $("profileNameInput");
const bioInput      = $("profileBioInput");
const saveBtn       = $("profileSaveBtn");
const saveNote      = $("profileSaveNote");

const pwdSection    = $("profilePasswordSection");
const currentPwdEl  = $("profileCurrentPwd");
const newPwdEl      = $("profileNewPwd");
const changePwdBtn  = $("profileChangePwdBtn");
const pwdNote       = $("profilePwdNote");

const signOutAllBtn = $("profileSignOutAllBtn");
const deleteBtn     = $("profileDeleteBtn");
const dangerNote    = $("profileDangerNote");
const errorNote     = $("profileError");

let currentUid = null;
let currentProfile = null;
let busy = false;

/* ---------- Helpers ---------- */
function setError(msg) { if (errorNote) errorNote.textContent = msg || ""; }
function setSaveNote(msg, isError) {
  if (!saveNote) return;
  saveNote.textContent = msg || "";
  saveNote.classList.toggle("is-error", !!isError);
}
function setPwdNote(msg, isError) {
  if (!pwdNote) return;
  pwdNote.textContent = msg || "";
  pwdNote.classList.toggle("is-error", !!isError);
}
function setDangerNote(msg, isError) {
  if (!dangerNote) return;
  dangerNote.textContent = msg || "";
  dangerNote.classList.toggle("is-error", !!isError);
}

function setBusy(on) {
  busy = !!on;
  [uploadBtn, removeBtn, saveBtn, changePwdBtn, signOutAllBtn, deleteBtn].forEach((b) => {
    if (b) b.disabled = busy;
  });
}

/* ---------- Avatar render ---------- */
function renderAvatar(profile, user) {
  if (!avatarEl) return;
  const url = profile && profile.photoURL ? profile.photoURL : "";
  const name = (profile && profile.displayName)
    || (user && user.displayName)
    || (user && user.email)
    || "";

  avatarEl.innerHTML = "";

  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "Profile picture";
    img.referrerPolicy = "no-referrer";
    img.onerror = () => {
      avatarEl.innerHTML = "";
      const span = document.createElement("span");
      span.id = "profileInitials";
      span.textContent = initialsFrom(name);
      avatarEl.appendChild(span);
    };
    avatarEl.appendChild(img);
    if (removeBtn) removeBtn.classList.remove("is-hidden");
  } else {
    const span = document.createElement("span");
    span.id = "profileInitials";
    span.textContent = initialsFrom(name);
    avatarEl.appendChild(span);
    if (removeBtn) removeBtn.classList.add("is-hidden");
  }
}

/* ---------- Load ---------- */
async function loadProfile(user) {
  currentUid = user.uid;

  // Email + provider display
  if (emailEl) emailEl.textContent = user.email || "—";
  const providers = (user.providerData || []).map((p) => p.providerId);
  if (providerEl) providerEl.textContent = providers.join(", ") || "password";

  const isEmailUser = providers.includes("password");
  if (pwdSection) pwdSection.classList.toggle("is-hidden", !isEmailUser);

  // Firebase profile record
  let profile = null;
  try {
    const snap = await get(ref(db, `users/${user.uid}/profile`));
    profile = snap.exists() ? snap.val() : {};
  } catch (err) {
    console.error("load profile failed", err);
    profile = {};
  }
  currentProfile = profile || {};

  // Fill UI
  if (displayNameEl) displayNameEl.textContent = currentProfile.displayName || user.displayName || "—";
  if (nameInput)     nameInput.value     = currentProfile.displayName || user.displayName || "";
  if (bioInput)      bioInput.value      = currentProfile.bio || "";

  renderAvatar(currentProfile, user);
}

/* ---------- Upload DP ---------- */
if (uploadBtn && fileInput) {
  uploadBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    if (!currentUid || busy) return;
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const { url } = await uploadImage(file);
      await update(ref(db, `users/${currentUid}/profile`), {
        photoURL: url,
        updatedAt: Date.now()
      });
      currentProfile.photoURL = url;
      renderAvatar(currentProfile, auth.currentUser);

      // Also update auth profile where supported (non-blocking).
      if (auth.currentUser) {
        try { await updateProfile(auth.currentUser, { photoURL: url }); } catch {}
      }
    } catch (err) {
      console.error("upload failed", err);
      setError("Upload failed: " + (err && err.message ? err.message : "unknown error"));
    } finally {
      fileInput.value = "";
      setBusy(false);
    }
  });
}

/* ---------- Remove DP ---------- */
if (removeBtn) {
  removeBtn.addEventListener("click", async () => {
    if (!currentUid || busy) return;
    if (!window.confirm("Remove your profile photo? Initials will be shown instead.")) return;
    setError("");
    setBusy(true);
    try {
      await update(ref(db, `users/${currentUid}/profile`), {
        photoURL: "",
        updatedAt: Date.now()
      });
      currentProfile.photoURL = "";
      renderAvatar(currentProfile, auth.currentUser);
      if (auth.currentUser) {
        try { await updateProfile(auth.currentUser, { photoURL: "" }); } catch {}
      }
    } catch (err) {
      console.error("remove photo failed", err);
      setError("Could not remove photo: " + (err && err.message ? err.message : "unknown error"));
    } finally {
      setBusy(false);
    }
  });
}

/* ---------- Save basic info ---------- */
if (saveBtn) {
  saveBtn.addEventListener("click", async () => {
    if (!currentUid || busy) return;
    const name = (nameInput ? nameInput.value : "").trim();
    const bio  = (bioInput ? bioInput.value : "").trim();

    setError("");
    setSaveNote("");
    setBusy(true);
    try {
      await update(ref(db, `users/${currentUid}/profile`), {
        displayName: name,
        bio,
        updatedAt: Date.now()
      });
      currentProfile.displayName = name;
      currentProfile.bio = bio;
      if (displayNameEl) displayNameEl.textContent = name || "—";
      renderAvatar(currentProfile, auth.currentUser);
      if (auth.currentUser && name) {
        try { await updateProfile(auth.currentUser, { displayName: name }); } catch {}
      }
      setSaveNote("Saved", false);
      setTimeout(() => setSaveNote(""), 1400);
    } catch (err) {
      console.error("save profile failed", err);
      setSaveNote("Save failed: " + (err && err.message ? err.message : "unknown error"), true);
    } finally {
      setBusy(false);
    }
  });
}

/* ---------- Change password ---------- */
if (changePwdBtn) {
  changePwdBtn.addEventListener("click", async () => {
    if (busy) return;
    const user = auth.currentUser;
    if (!user || !user.email) return;

    const current = currentPwdEl ? currentPwdEl.value : "";
    const next    = newPwdEl ? newPwdEl.value : "";

    setPwdNote("");
    if (!current || !next) {
      setPwdNote("Enter both current and new password.", true);
      return;
    }
    if (next.length < 6) {
      setPwdNote("New password must be at least 6 characters.", true);
      return;
    }

    setBusy(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, current);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, next);
      if (currentPwdEl) currentPwdEl.value = "";
      if (newPwdEl) newPwdEl.value = "";
      setPwdNote("Password updated.", false);
      setTimeout(() => setPwdNote(""), 1600);
    } catch (err) {
      console.error("change password failed", err);
      const code = err && err.code ? err.code : "";
      let msg = "Could not change password.";
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") msg = "Current password is incorrect.";
      else if (code === "auth/weak-password") msg = "New password is too weak.";
      else if (code === "auth/requires-recent-login") msg = "Please sign out and sign in again, then retry.";
      setPwdNote(msg, true);
    } finally {
      setBusy(false);
    }
  });
}

/* ---------- Sign out all devices ---------- */
if (signOutAllBtn) {
  signOutAllBtn.addEventListener("click", async () => {
    if (busy) return;
    const user = auth.currentUser;
    if (!user) return;
    if (!window.confirm("Sign out from all devices? You will need to sign in again here too.")) return;
    setDangerNote("");
    setBusy(true);
    try {
      await signOut(auth);
      // Session ends; onAuthStateChanged in app.js will show the auth view.
    } catch (err) {
      console.error("sign out all failed", err);
      setDangerNote("Could not sign out: " + (err && err.message ? err.message : "unknown error"), true);
      setBusy(false);
    }
  });
}

/* ---------- Delete account ---------- */
if (deleteBtn) {
  deleteBtn.addEventListener("click", async () => {
    if (busy) return;
    const user = auth.currentUser;
    if (!user) return;

    const typed = window.prompt('Type DELETE to permanently delete your account and all data. This cannot be undone.');
    if (typed !== "DELETE") return;

    setDangerNote("");
    setBusy(true);
    try {
      const uid = user.uid;

      // Best-effort: delete user data first.
      try { await remove(ref(db, `conversations/${uid}`)); } catch (e) { console.warn("rtdb conversations wipe", e); }
      try { await remove(ref(db, `memory/${uid}`)); } catch (e) { console.warn("rtdb memory wipe", e); }
      try { await remove(ref(db, `analytics/${uid}`)); } catch (e) { console.warn("rtdb analytics wipe", e); }
      try { await remove(ref(db, `users/${uid}`)); } catch (e) { console.warn("rtdb users wipe", e); }

      await deleteUser(user);
      // onAuthStateChanged will fire; app returns to auth view.
    } catch (err) {
      console.error("delete account failed", err);
      const code = err && err.code ? err.code : "";
      const msg = code === "auth/requires-recent-login"
        ? "Please sign out, sign in again, then retry delete."
        : "Could not delete account: " + (err && err.message ? err.message : "unknown error");
      setDangerNote(msg, true);
      setBusy(false);
    }
  });
}

/* ---------- Open / close ---------- */
function openModal() {
  if (!modal) return;
  setError(""); setSaveNote(""); setPwdNote(""); setDangerNote("");
  modal.classList.remove("is-hidden");
  modal.setAttribute("aria-hidden", "false");
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
    loadProfile(user).catch((e) => console.error("loadProfile failed", e));
  } else {
    currentUid = null;
    currentProfile = null;
    closeModal();
  }
});
