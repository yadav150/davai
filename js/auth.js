// DavAI — authentication module.
// Handles sign-in / sign-up / provider popups / sign-out and
// switches between #authView and #appView based on real Firebase auth state.

import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

const $ = (id) => document.getElementById(id);

const bootLoader   = $("bootLoader");
const authView     = $("authView");
const appView      = $("appView");
const authForm     = $("authForm");
const authEmail    = $("authEmail");
const authPassword = $("authPassword");
const authError    = $("authError");
const authSubmit   = $("authSubmit");
const submitLabel  = authSubmit.querySelector(".btn-label");
const submitSpin   = authSubmit.querySelector(".btn-spinner");
const togglePw     = $("togglePassword");
const signOutBtn   = $("signOutBtn");
const tabs         = document.querySelectorAll(".auth-tab");
const providerBtns = document.querySelectorAll(".btn-provider");

let mode = "signin"; // "signin" | "signup"

/* ---------- view helpers ---------- */

function show(view) {
  bootLoader.classList.add("is-hidden");

  const isAuth = view === "auth";
  authView.classList.toggle("is-hidden", !isAuth);
  authView.setAttribute("aria-hidden", String(!isAuth));

  appView.classList.toggle("is-hidden", isAuth);
  appView.setAttribute("aria-hidden", String(isAuth));
}

function showError(msg) {
  authError.textContent = msg;
  authError.classList.remove("is-hidden");
}

function clearError() {
  authError.textContent = "";
  authError.classList.add("is-hidden");
}

function setLoading(on) {
  authSubmit.disabled = on;
  submitSpin.classList.toggle("is-hidden", !on);
  submitLabel.textContent = on
    ? (mode === "signin" ? "Signing in…" : "Creating account…")
    : (mode === "signin" ? "Sign in" : "Create account");
}

/* ---------- error mapping ---------- */

const ERROR_MAP = {
  "auth/invalid-email":          "That email address doesn't look right.",
  "auth/missing-password":       "Please enter your password.",
  "auth/weak-password":          "Password must be at least 6 characters.",
  "auth/email-already-in-use":   "This email is already registered. Try signing in.",
  "auth/user-not-found":         "No account found with this email.",
  "auth/wrong-password":         "Incorrect password. Please try again.",
  "auth/invalid-credential":     "Email or password is incorrect.",
  "auth/operation-not-allowed":  "This sign-in method is not enabled in Firebase.",
  "auth/popup-closed-by-user":   "Sign-in popup was closed before completing.",
  "auth/popup-blocked":          "Popup was blocked. Please allow popups and retry.",
  "auth/network-request-failed": "Network error. Check your connection.",
  "auth/too-many-requests":      "Too many attempts. Please wait and retry."
};

function friendlyError(err) {
  return ERROR_MAP[err?.code] || "Something went wrong. Please try again.";
}

/* ---------- tabs ---------- */

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    mode = tab.dataset.tab;
    tabs.forEach((t) => {
      const active = t === tab;
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", String(active));
    });

    authPassword.autocomplete = mode === "signin" ? "current-password" : "new-password";
    submitLabel.textContent = mode === "signin" ? "Sign in" : "Create account";
    clearError();
  });
});

/* ---------- password visibility ---------- */

togglePw.addEventListener("click", () => {
  const showing = authPassword.type === "text";
  authPassword.type = showing ? "password" : "text";
  togglePw.setAttribute("aria-label", showing ? "Show password" : "Hide password");
});

/* ---------- email/password submit ---------- */

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email) return showError("Please enter your email.");
  if (!password) return showError("Please enter your password.");

  setLoading(true);
  try {
    if (mode === "signin") {
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      await createUserWithEmailAndPassword(auth, email, password);
    }
    // onAuthStateChanged will handle the view switch.
  } catch (err) {
    showError(friendlyError(err));
  } finally {
    setLoading(false);
  }
});

/* ---------- providers ---------- */

providerBtns.forEach((btn) => {
  btn.addEventListener("click", async () => {
    clearError();
    const provider = btn.dataset.provider;
    const providerObj =
      provider === "google" ? new GoogleAuthProvider()
      : provider === "github" ? new GithubAuthProvider()
      : null;

    if (!providerObj) return;

    try {
      await signInWithPopup(auth, providerObj);
    } catch (err) {
      showError(friendlyError(err));
    }
  });
});

/* ---------- sign out ---------- */

signOutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.error("Sign-out failed:", err);
  }
});

/* ---------- auth state ---------- */

onAuthStateChanged(auth, (user) => {
  if (user) {
    show("app");
  } else {
    show("auth");
  }
});
