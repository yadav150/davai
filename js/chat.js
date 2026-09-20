/* =========================================================
   DAV AI — CHATBOT FRONTEND
   Cloned from approved reference design.
   No backend, no auth, no Firebase wired in yet.
   ========================================================= */

/* Product name — single source of truth. */
const PRODUCT_NAME = "Dav AI";

/* Placeholder profile — replaced by Firebase Auth + Cloudinary later. */
const PROFILE = {
    name: "User",
    email: "user@example.com",
    initials: "YS"
};


/* ---------- DOM ---------- */

const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const messages = document.getElementById("messages");
const welcome = document.getElementById("welcome");
const typing = document.getElementById("typing");

const newChat = document.getElementById("newChat");
const chatHistory = document.getElementById("chatHistory");
const chatTitle = document.getElementById("chatTitle");

const mobileMenu = document.getElementById("mobileMenu");
const sidebar = document.getElementById("sidebar");

const settingsButton = document.getElementById("settingsButton");
const profileButton = document.getElementById("profileButton");

const settingsOverlay = document.getElementById("settingsOverlay");
const closeSettings = document.getElementById("closeSettings");

const logoutButton = document.getElementById("logoutButton");
const logoutModal = document.getElementById("logoutModal");
const cancelLogout = document.getElementById("cancelLogout");
const confirmLogout = document.getElementById("confirmLogout");


/* ---------- PRODUCT NAME + PROFILE APPLY ---------- */

document.title = PRODUCT_NAME;
document.getElementById("brand").textContent = PRODUCT_NAME;

document.getElementById("avatarSmall").textContent = PROFILE.initials;
document.getElementById("avatarLarge").textContent = PROFILE.initials;

document.getElementById("profileNameSmall").textContent = PROFILE.name;
document.getElementById("profileEmailSmall").textContent = PROFILE.email;

document.getElementById("profileNameLarge").textContent = PROFILE.name;
document.getElementById("profileEmailLarge").textContent = PROFILE.email;

document.getElementById("accountName").textContent = PROFILE.name;
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

    addMessage(text, "User");

    messageInput.value = "";

    messageInput.style.height = "auto";

    sendButton.disabled = true;

    updateChatTitle(text);

    ThinkingUI.show("Thinking");

    const reply = await requestAssistantReply(text);

    ThinkingUI.hide();

    addMessage(reply, "Assistant");

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
   Public API (stable — do NOT rename):
       ThinkingUI.show(key?)       // show indicator
       ThinkingUI.hide()           // hide indicator
       ThinkingUI.setState(key)    // transition to a state

   States (keys):
       thinking | understanding | analyzing |
       researching | checking | comparing | preparing

   Source of state changes:
       Phase 1 (now)   : static — "thinking" only.
       Phase 8 (later) : driven by SSE events from the
                         Cloudflare Worker. No DOM rewrite
                         needed — same public API.
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

    const chatArea =
        document.getElementById("chatArea");

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

    const existing =
        document.querySelector(".history-item.active");

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

    const item =
        document.createElement("div");

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


settingsButton.addEventListener(
    "click",
    openSettings
);


profileButton.addEventListener(
    "click",
    openSettings
);


closeSettings.addEventListener(
    "click",
    closeSettingsPanel
);


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

    if (
        event.target.classList.contains("history-item")
    ) {

        document.querySelectorAll(".history-item")
            .forEach(item =>
                item.classList.remove("active")
            );

        event.target.classList.add("active");

        chatTitle.textContent =
            event.target.textContent;

        sidebar.classList.remove("open");

    }

});


/* =========================================================
   ASSISTANT REPLY — DEMO ONLY
   ---------------------------------------------------------
   Contract: (userText: string) => Promise<string>
   Replace body with Groq call later. Nothing else changes.
   ========================================================= */

async function requestAssistantReply(userText) {

    await new Promise(resolve => setTimeout(resolve, 1000));

    return "This is a frontend demo response. Real AI intelligence can be connected later.";

}


/* =========================================================
   LOGOUT — DEMO ONLY
   ---------------------------------------------------------
   Replace with Firebase signOut later.
   ========================================================= */

function handleLogout() {

    alert("You have been logged out.");

}
