/* =========================================================
   DAV AI — LOGIN
   ---------------------------------------------------------
   Email/Password + Google sign-in against davai-2c6fc.
   On success → redirect to index.html (chat page).
   If already signed in → skip straight to index.html.
   ========================================================= */

import { auth, googleProvider } from "./firebase.js";

import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    onAuthStateChanged,
    initializeRecaptchaConfig
}
from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";


/* Initialize reCAPTCHA Enterprise config before any auth call.
   Required on Firebase projects created after Sep 2023.
   Missing this = 400 on every email/password sign-in. */
await initializeRecaptchaConfig(auth);


/* ---------- DOM ---------- */

const form         = document.getElementById("authForm");
const emailInput   = document.getElementById("emailInput");
const passwordInput= document.getElementById("passwordInput");
const submitBtn    = document.getElementById("submitBtn");
const googleBtn    = document.getElementById("googleBtn");
const errorBox     = document.getElementById("authError");
const toggleBtn    = document.getElementById("toggleBtn");
const toggleText   = document.getElementById("toggleText");


/* ---------- MODE ---------- */

let mode = "signin"; // "signin" | "signup"


function setMode(next) {

    mode = next;

    if (mode === "signup") {
        submitBtn.textContent = "Create account";
        toggleText.textContent = "Already have an account?";
        toggleBtn.textContent = "Sign in";
        passwordInput.setAttribute("autocomplete", "new-password");
    } else {
        submitBtn.textContent = "Sign in";
        toggleText.textContent = "New to Dav AI?";
        toggleBtn.textContent = "Create account";
        passwordInput.setAttribute("autocomplete", "current-password");
    }

    clearError();

}


/* ---------- ERRORS ---------- */

function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.add("show");
}

function clearError() {
    errorBox.textContent = "";
    errorBox.classList.remove("show");
}


function prettyError(code) {

    const map = {
        "auth/invalid-email":            "That email address looks invalid.",
        "auth/user-disabled":            "This account has been disabled.",
        "auth/user-not-found":           "No account found with that email.",
        "auth/wrong-password":           "Incorrect password.",
        "auth/invalid-credential":       "Incorrect email or password.",
        "auth/email-already-in-use":     "An account already exists with that email.",
        "auth/weak-password":            "Password must be at least 6 characters.",
        "auth/popup-closed-by-user":     "Google sign-in was cancelled.",
        "auth/popup-blocked":            "Popup was blocked. Allow popups and try again.",
        "auth/network-request-failed":   "Network error. Check your connection.",
        "auth/too-many-requests":        "Too many attempts. Try again later.",
        "auth/operation-not-allowed":    "This sign-in method is not enabled.",
        "auth/unauthorized-domain":      "This domain is not authorized in Firebase."
    };

    return map[code] || "Sign-in failed. Please try again.";

}


/* ---------- LOADING ---------- */

function setLoading(state) {
    submitBtn.disabled = state;
    googleBtn.disabled = state;
    emailInput.disabled = state;
    passwordInput.disabled = state;
}


/* ---------- SUBMIT (email/password) ---------- */

form.addEventListener("submit", async (event) => {

    event.preventDefault();
    clearError();

    const email    = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        showError("Email and password are required.");
        return;
    }

    setLoading(true);

    try {

        if (mode === "signup") {
            await createUserWithEmailAndPassword(auth, email, password);
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }

        // onAuthStateChanged will handle the redirect.

    } catch (err) {
        setLoading(false);
        showError(prettyError(err.code));
    }

});


/* ---------- GOOGLE ---------- */

googleBtn.addEventListener("click", async () => {

    clearError();
    setLoading(true);

    try {

        await signInWithPopup(auth, googleProvider);

        // onAuthStateChanged will handle the redirect.

    } catch (err) {
        setLoading(false);
        showError(prettyError(err.code));
    }

});


/* ---------- TOGGLE ---------- */

toggleBtn.addEventListener("click", () => {

    setMode(mode === "signin" ? "signup" : "signin");

});


/* ---------- AUTH STATE ---------- */

onAuthStateChanged(auth, (user) => {

    if (user) {
        window.location.replace("index.html");
        return;
    }

    markReady();

});


/* ---------- LOADER ---------- */

function markReady() {
    const loader = document.getElementById("pageLoader");
    if (loader) loader.classList.add("is-hidden");
}
