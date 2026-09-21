/* =========================================================
   DAV AI — CHATBOT FRONTEND
   ========================================================= */

import { auth } from "./firebase.js";

import { onAuthStateChanged, signOut }
    from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";


/* Product name — single source of truth. */
const PRODUCT_NAME = "Dav AI";

/* Placeholder profile — overwritten by applyRealProfile() on auth. */
const PROFILE = {
    name:     "User",
    email:    "user@example.com",
    initials: "YS"
};


/* ---------- DOM ---------- */

const messageInput = document.getElementById("messageInput");
const sendButton   = document.getElementById("sendButton");
const messages     = document.getElementById("messages");
const welcome      = document.getElementById("welcome");
const typing       = document.getElementById("typing");

const newChat      = document.getElementById("newChat");
const chatHistory  = document.getElementById("chatHistory");
const chatTitle    = document.getElementById("chatTitle");

const mobileMenu   = document.getElementById("mobileMenu");
const sidebar      = document.getElementById("sidebar");

const settingsButton = document.getElementById("settingsButton");
const profileButton  = document.getElementById("profileButton");

const settingsOverlay = document.getElementById("settingsOverlay");
const closeSettings   = document.getElementById("closeSettings");

const logoutButton   = document.getElementById("logoutButton");
const logoutModal    = document.getElementById("logoutModal");
const cancelLogout   = document.getElementById("cancelLogout");
const confirmLogout  = document.getElementById("confirmLogout");


/* ---------- PRODUCT NAME + PROFILE APPLY ---------- */

document.title = PRODUCT_NAME;
document.getElementById("brand").textContent = PRODUCT_NAME;

document.getElementById("avatarSmall").textContent = PROFILE.initials;
document.getElementById("avatarLarge").textContent = PROFILE.initials;

document.getElementById("profileNameSmall").textContent  = PROFILE.name;
document.getElementById("profileEmailSmall").textContent = PROFILE.email;

document.getElementById("profileNameLarge").textContent  = PROFILE.name;
document.getElementById("profileEmailLarge").textContent = PROFILE.email;

document.getElementById("accountName").textContent  = PROFILE.name;
document.getElementById("accountEmail").textContent = PROFILE.email;


/* ---------- INPUT ---------- */

messageInput.addEventListener("input", () => {

    messageInput.style.height = "auto";

    messageInput.style.height =
        Math.min(messageInput.scrollHeight, 150) + "px";

    sendButton.disabled =
        messageInput.value.trim().length === 0;

});


/* ---------- ENTER ---------- */

messageInput.addEventListener("keydown", (event) => {

    if (event.key === "Enter" && !event.shiftKey) {

        event.preventDefault();

        if (!sendButton.disabled) {
            sendMessage();
        }

    }

});


/* ---------- SEND ---------- */

sendButton.addEventListener("click", sendMessage);


async function sendMessage() {

    const text = messageInput.value.trim();

    if (!text) return;

    welcome.style.display = "none";

    addMessage(text, "user");

    messageInput.value = "";

    messageInput.style.height = "auto";

    sendButton.disabled = true;

    updateChatTitle(text);

    ThinkingUI.show("thinking");

    const reply = await requestAssistantReply(text);

    ThinkingUI.hide();

    addMessage(reply, "assistant");

}


/* ---------- MESSAGE ---------- */

function addMessage(text, type) {

    const message = document.createElement("div");

    message.className = "message " + String(type).toLowerCase();

    const content = document.createElement("div");

    content.className = "message-content";

    content.textContent = text;

    message.appendChild(content);

    messages.appendChild(message);

    scrollToBottom();

}


/* =========================================================
   THINKING UI
   ---------------------------------------------------------
   Public API:
       ThinkingUI.show(key?)
       ThinkingUI.hide()
       ThinkingUI.setState(key)

   States:
       thinking | understanding | analyzing |
       researching | checking | comparing | preparing

   Phase 1  : static — "thinking" only.
   Phase 8  : driven by SSE events from Cloudflare Worker.
   ========================================================= */

const ThinkingUI = (() => {

    const STATES = {
        thinking:      "Thinking...",
        understanding: "Understanding your question...",
        analyzing:     "Analyzing the problem...",
        researching:   "Researching relevant information...",
        checking:      "Checking available information...",
        comparing:     "Comparing findings...",
        preparing:     "Preparing the response..."
    };

    const label = document.getElementById("thinkingLabel");

    let current = null;

    function show(key = "thinking") {
        typing.style.display = "block";
        setState(key, true);
        scrollToBottom();
    }

    function hide() {
        typing.style.display = "none";
        current = null;
    }

    function setState(key, immediate = false) {
        if (current === key) return;
        if (!(key in STATES)) return;
        current = key;

        const text = STATES[key];

        if (immediate) {
            label.textContent = text;
            label.style.opacity = "1";
            return;
        }

        label.style.opacity = "0";
        setTimeout(() => {
            label.textContent = text;
            label.style.opacity = "1";
        }, 140);
    }

    return { show, hide, setState, STATES };

})();


/* ---------- SCROLL ---------- */

function scrollToBottom() {

    const chatArea = document.getElementById("chatArea");

    setTimeout(() => {

        chatArea.scrollTo({
            top: chatArea.scrollHeight,
            behavior: "smooth"
        });

    }, 50);

}


/* ---------- TITLE ---------- */

function updateChatTitle(text) {

    const title =
        text.length > 30
            ? text.substring(0, 30) + "..."
            : text;

    chatTitle.textContent = title;

    const existing = document.querySelector(".history-item.active");

    if (existing) {
        existing.textContent = title;
    }

}


/* ---------- NEW CHAT ---------- */

newChat.addEventListener("click", () => {

    messages.innerHTML = "";

    messages.appendChild(welcome);

    welcome.style.display = "flex";

    chatTitle.textContent = "New conversation";

    messageInput.value = "";

    messageInput.style.height = "auto";

    sendButton.disabled = true;

    document.querySelectorAll(".history-item")
        .forEach(item => item.classList.remove("active"));

    const item = document.createElement("div");

    item.className = "history-item active";

    item.textContent = "New conversation";

    chatHistory.prepend(item);

    sidebar.classList.remove("open");

});


/* ---------- MOBILE MENU ---------- */

mobileMenu.addEventListener("click", () => {

    sidebar.classList.toggle("open");

});


/* ---------- SETTINGS ---------- */

function openSettings() {
    settingsOverlay.classList.add("show");
    sidebar.classList.remove("open");
}

function closeSettingsPanel() {
    settingsOverlay.classList.remove("show");
}

settingsButton.addEventListener("click", openSettings);
profileButton.addEventListener("click", openSettings);
closeSettings.addEventListener("click", closeSettingsPanel);


/* ---------- CLICK OUTSIDE SETTINGS ---------- */

settingsOverlay.addEventListener("click", (event) => {

    if (event.target === settingsOverlay) {
        closeSettingsPanel();
    }

});


/* ---------- LOGOUT ---------- */

logoutButton.addEventListener("click", () => {
    logoutModal.classList.add("show");
});

cancelLogout.addEventListener("click", () => {
    logoutModal.classList.remove("show");
});

confirmLogout.addEventListener("click", () => {

    logoutModal.classList.remove("show");
    settingsOverlay.classList.remove("show");

    handleLogout();

});


/* ---------- HISTORY ---------- */

chatHistory.addEventListener("click", (event) => {

    if (event.target.classList.contains("history-item")) {

        document.querySelectorAll(".history-item")
            .forEach(item => item.classList.remove("active"));

        event.target.classList.add("active");

        chatTitle.textContent = event.target.textContent;

        sidebar.classList.remove("open");

    }

});


/* =========================================================
   ASSISTANT REPLY — DEMO ONLY
   ---------------------------------------------------------
   Contract: (userText: string) => Promise<string>
   Replace body with Cloudflare Worker call in Phase 8.
   ========================================================= */

async function requestAssistantReply(userText) {

    await new Promise(resolve => setTimeout(resolve, 1000));

    return "This is a frontend demo response. Real AI intelligence can be connected later.";

}


/* =========================================================
   LOGOUT
   ========================================================= */

async function handleLogout() {

    try {
        stopInactivityWatch();
        await signOut(auth);
        window.location.replace("login.html");
    } catch (err) {
        alert("Logout failed: " + err.message);
    }

}


/* =========================================================
   AUTH GUARD
   ========================================================= */

onAuthStateChanged(auth, (user) => {

    if (!user) {
        stopInactivityWatch();
        window.location.replace("login.html");
        return;
    }

    applyRealProfile(user);
    startInactivityWatch();
    markReady();

});


function applyRealProfile(user) {

    const name =
        user.displayName ||
        (user.email ? user.email.split("@")[0] : "User");

    const email = user.email || "";

    const initials =
        name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(w => w[0].toUpperCase())
            .join("") || "U";

    PROFILE.name     = name;
    PROFILE.email    = email;
    PROFILE.initials = initials;

    document.getElementById("avatarSmall").textContent = initials;
    document.getElementById("avatarLarge").textContent = initials;

    document.getElementById("profileNameSmall").textContent  = name;
    document.getElementById("profileEmailSmall").textContent = email;

    document.getElementById("profileNameLarge").textContent  = name;
    document.getElementById("profileEmailLarge").textContent = email;

    document.getElementById("accountName").textContent  = name;
    document.getElementById("accountEmail").textContent = email;

}


/* ---------- LOADER ---------- */

function markReady() {
    const loader = document.getElementById("pageLoader");
    if (loader) loader.classList.add("is-hidden");
}


/* =========================================================
   INACTIVITY AUTO-LOGOUT — 5 minutes
   ========================================================= */

const INACTIVITY_MS = 5 * 60 * 1000;

let inactivityTimer = null;
let lastReset = 0;

const ACTIVITY_EVENTS = [
    "mousemove",
    "mousedown",
    "keydown",
    "scroll",
    "touchstart",
    "click"
];


function resetInactivityTimer() {

    const now = Date.now();

    if (now - lastReset < 1000) return;
    lastReset = now;

    clearTimeout(inactivityTimer);

    inactivityTimer = setTimeout(async () => {

        try {
            await signOut(auth);
        } catch (err) {
            /* ignore — we redirect anyway */
        }

        window.location.replace("login.html?reason=inactivity");

    }, INACTIVITY_MS);

}


function startInactivityWatch() {

    ACTIVITY_EVENTS.forEach(evt => {
        document.addEventListener(evt, resetInactivityTimer, { passive: true });
    });

    resetInactivityTimer();

}


function stopInactivityWatch() {

    ACTIVITY_EVENTS.forEach(evt => {
        document.removeEventListener(evt, resetInactivityTimer);
    });

    clearTimeout(inactivityTimer);

}
