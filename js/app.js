// DavAI — App shell controller.
// Owns: auth state → view switching, auth form, sidebar toggle, theme toggle.
// Does NOT own: chat, conversations list, settings, memory.

import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  signInWithGitHub,
  mapAuthError
} from "./auth.js";
import { ensureUserRecord, loadUserSettings } from "./user.js";

/* ---------- DOM refs ---------- */
const $ = (id) => document.getElementById(id);

const bootLoader  = $("bootLoader");
const authView    = $("authView");
const appView     = $("appView");

const authForm    = $("authForm");
const authEmail   = $("authEmail");
const authPassword= $("authPassword");
const authError   = $("authError");
const authSubmit  = $("authSubmit");
const authSubmitLabel = authSubmit.querySelector(".btn-label");
const authSubmitSpinner = authSubmit.querySelector(".btn-spinner");
const authTabs    = document.querySelectorAll(".auth-tab");
const togglePwd   = $("togglePassword");
const providerBtns= document.querySelectorAll(".btn-provider");

const sidebar      = $("sidebar");
const sidebarScrim = $("sidebarScrim");
const openSidebar  = $("openSidebar");
const closeSidebar = $("closeSidebar");
const signOutBtn   = $("signOutBtn");
const themeToggle  = $("themeToggle");

/* ---------- State ---------- */
let authMode = "signin"; // "signin" | "signup"
let bootDone = false;

/* ---------- Helpers ---------- */
function hideBoot() {
  if (bootDone) return;
  bootDone = true;
  bootLoader.classList.add("is-hidden");
}

function showAuthError(msg) {
  if (!msg) {
    authError.classList.add("is-hidden");
    authError.textContent = "";
    return;
  }
  authError.textContent = msg;
  authError.classList.remove("is-hidden");
}

function setAuthLoading(isLoading) {
  authSubmit.disabled = isLoading;
  providerBtns.forEach((b) => { b.disabled = isLoading; });
  authSubmitSpinner.classList.toggle("is-hidden", !isLoading);
}

function showView(which) {
  if (which === "app") {
    authView.classList.add("is-hidden");
    authView.setAttribute("aria-hidden", "true");
    appView.classList.remove("is-hidden");
    appView.setAttribute("aria-hidden", "false");
  } else {
    appView.classList.add("is-hidden");
    appView.setAttribute("aria-hidden", "true");
    authView.classList.remove("is-hidden");
    authView.setAttribute("aria-hidden", "false");
  }
}

/* ---------- Auth tabs ---------- */
authTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const mode = tab.dataset.tab;
    if (mode === authMode) return;
    authMode = mode;

    authTabs.forEach((t) => {
      const active = t.dataset.tab === mode;
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    });

    authSubmitLabel.textContent = mode === "signin" ? "Sign in" : "Create account";
    authPassword.setAttribute(
      "autocomplete",
      mode === "signin" ? "current-password" : "new-password"
    );
    showAuthError("");
  });
});

/* ---------- Password toggle ---------- */
togglePwd.addEventListener("click", () => {
  const isPwd = authPassword.type === "password";
  authPassword.type = isPwd ? "text" : "password";
  togglePwd.setAttribute("aria-label", isPwd ? "Hide password" : "Show password");
});

/* ---------- Auth form submit ---------- */
authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showAuthError("");

  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email) { showAuthError("Please enter your email address."); return; }
  if (!password) { showAuthError("Please enter your password."); return; }

  setAuthLoading(true);
  try {
    if (authMode === "signin") {
      await signInWithEmail(email, password);
    } else {
      await signUpWithEmail(email, password);
    }
    // onAuthStateChanged will swap the view.
    authForm.reset();
  } catch (err) {
    showAuthError(mapAuthError(err));
  } finally {
    setAuthLoading(false);
  }
});

/* ---------- Provider sign-in ---------- */
providerBtns.forEach((btn) => {
  btn.addEventListener("click", async () => {
    showAuthError("");
    setAuthLoading(true);
    try {
      const provider = btn.dataset.provider;
      if (provider === "google") await signInWithGoogle();
      else if (provider === "github") await signInWithGitHub();
    } catch (err) {
      showAuthError(mapAuthError(err));
    } finally {
      setAuthLoading(false);
    }
  });
});

/* ---------- Sign out ---------- */
signOutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch {
    // Sign-out failure here is extremely rare; the onAuthStateChanged
    // listener will reflect the true state either way.
  }
});

/* ---------- Sidebar (mobile drawer) ---------- */
function openDrawer() {
  sidebar.classList.add("is-open");
  sidebarScrim.hidden = false;
}
function closeDrawer() {
  sidebar.classList.remove("is-open");
  sidebarScrim.hidden = true;
}
openSidebar.addEventListener("click", openDrawer);
closeSidebar.addEventListener("click", closeDrawer);
sidebarScrim.addEventListener("click", closeDrawer);

/* ---------- Sidebar collapse (desktop) ---------- */
const collapseSidebar = $("collapseSidebar");
const COLLAPSE_KEY = "davai.sidebarCollapsed";

function applyCollapsed(on) {
  appView.classList.toggle("is-collapsed", !!on);
  try { localStorage.setItem(COLLAPSE_KEY, on ? "1" : "0"); } catch {}
}

if (collapseSidebar) {
  collapseSidebar.addEventListener("click", () => {
    const next = !appView.classList.contains("is-collapsed");
    applyCollapsed(next);
  });
}

// Restore on load (desktop only — mobile drawer ignores this)
try {
  if (localStorage.getItem(COLLAPSE_KEY) === "1") applyCollapsed(true);
} catch {}

/* ---------- Theme toggle ---------- */
// Temporary: stored locally until Settings module syncs it to Firebase.
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}
const savedTheme = localStorage.getItem("davai.theme") || "dark";
applyTheme(savedTheme);

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem("davai.theme", next);
});

/* ---------- Auth state → view switching ---------- */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      await ensureUserRecord(user);
      const settings = await loadUserSettings(user.uid);
      if (settings && settings.theme) {
        applyTheme(settings.theme);
      }
    } catch (err) {
      console.error("DavAI: user bootstrap failed", err);
    }
    showView("app");
  } else {
    showView("auth");
  }
  hideBoot();
});
