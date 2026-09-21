/* =========================================================
   DAV AI — CHATBOT FRONTEND
   ========================================================= */

import { auth, db } from "./firebase.js";

import { onAuthStateChanged, signOut }
    from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

import {
    ref, push, set, get, update, remove,
    onValue, serverTimestamp
}
from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";


/* Cloudinary — unsigned upload config. */
const CLOUDINARY_CLOUD  = "xgkqlvgt";
const CLOUDINARY_PRESET = "davai_hosting";


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

const avatarSmall     = document.getElementById("avatarSmall");
const avatarLarge     = document.getElementById("avatarLarge");
const avatarInput     = document.getElementById("avatarInput");
const changePictureBtn= document.getElementById("changePictureBtn");
const uploadOverlay   = document.getElementById("uploadOverlay");
const uploadBar       = document.getElementById("uploadBar");
const uploadLabel     = document.getElementById("uploadLabel");

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

    // Load avatar from DB if it exists.
    loadAvatarFromDB(user.uid);

}


/* =========================================================
   AVATAR — CLOUDINARY UPLOAD + DB PERSISTENCE
   ---------------------------------------------------------
   DB path: users/{uid}/profile/photoURL
   ========================================================= */

function setAvatars(photoURL) {

    if (!photoURL) return;

    const html = `<img src="${photoURL}" alt="Profile">`;

    avatarSmall.innerHTML = html;
    avatarLarge.innerHTML = html;

}


async function loadAvatarFromDB(uid) {

    try {
        const snap = await get(ref(db, `users/${uid}/profile/photoURL`));

        if (snap.exists()) {
            setAvatars(snap.val());
        }

    } catch (err) {
        console.warn("Avatar load failed:", err.message);
    }

}


/* ---------- UPLOAD UI ---------- */

function showUpload(state) {

    if (state) {
        uploadBar.style.width = "0%";
        uploadLabel.textContent = "Uploading...";
        uploadOverlay.classList.add("show");
    } else {
        uploadOverlay.classList.remove("show");
    }

}


/* ---------- OPEN FILE PICKER ---------- */

changePictureBtn.addEventListener("click", () => avatarInput.click());

avatarLarge.addEventListener("click", () => avatarInput.click());

avatarLarge.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        avatarInput.click();
    }
});


/* ---------- ON FILE SELECTED ---------- */

avatarInput.addEventListener("change", async () => {

    const file = avatarInput.files && avatarInput.files[0];
    avatarInput.value = "";
    if (!file) return;

    /* Basic guard — size + type. */
    if (!file.type.startsWith("image/")) {
        alert("Please select an image file.");
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        alert("Image must be under 5 MB.");
        return;
    }

    const user = auth.currentUser;
    if (!user) {
        alert("Not signed in.");
        return;
    }

    showUpload(true);

    try {

        const url = await uploadToCloudinary(file, (pct) => {
            uploadBar.style.width = pct + "%";
        });

        uploadLabel.textContent = "Saving...";
        uploadBar.style.width = "100%";

        await set(ref(db, `users/${user.uid}/profile/photoURL`), url);
        await set(ref(db, `users/${user.uid}/profile/updatedAt`), serverTimestamp());

        setAvatars(url);

        setTimeout(() => showUpload(false), 300);

    } catch (err) {
        showUpload(false);
        alert("Upload failed: " + err.message);
    }

});


/* ---------- CLOUDINARY UPLOAD ---------- */

function uploadToCloudinary(file, onProgress) {

    return new Promise((resolve, reject) => {

        const form = new FormData();

        form.append("file", file);
        form.append("upload_preset", CLOUDINARY_PRESET);
        form.append("folder", "davai/avatars");

        const xhr = new XMLHttpRequest();

        xhr.open(
            "POST",
            `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`
        );

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
                const pct = Math.round((e.loaded / e.total) * 100);
                onProgress(pct);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    if (data.secure_url) {
                        resolve(data.secure_url);
                    } else {
                        reject(new Error("No secure_url in response"));
                    }
                } catch (e) {
                    reject(new Error("Invalid Cloudinary response"));
                }
            } else {
                reject(new Error("Cloudinary HTTP " + xhr.status));
            }
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(form);

    });

}


/* =========================================================
   CHAT DB HELPERS
   ---------------------------------------------------------
   Paths:
       users/{uid}/chats/{chatId}/meta
       users/{uid}/chats/{chatId}/messages/{msgId}

   DB-only. No UI. UI wiring is done by callers (6b–6f).
   ========================================================= */

function chatsRoot(uid) {
    return ref(db, `users/${uid}/chats`);
}

function chatMetaRef(uid, chatId) {
    return ref(db, `users/${uid}/chats/${chatId}/meta`);
}

function chatMessagesRef(uid, chatId) {
    return ref(db, `users/${uid}/chats/${chatId}/messages`);
}


/* Create a new empty chat. Returns the new chatId. */
async function createChat(uid) {

    const idRef  = push(chatsRoot(uid));
    const chatId = idRef.key;

    await set(chatMetaRef(uid, chatId), {
        title:        "",
        createdAt:    serverTimestamp(),
        updatedAt:    serverTimestamp(),
        messageCount: 0
    });

    return chatId;

}


/* Save one message. Also updates meta (title + updatedAt + count). */
async function saveMessage(uid, chatId, role, text) {

    const msgRef = push(chatMessagesRef(uid, chatId));

    await set(msgRef, {
        role,
        text,
        ts: serverTimestamp()
    });

    const metaSnap = await get(chatMetaRef(uid, chatId));
    const meta     = metaSnap.val() || {};

    const updates = {
        updatedAt:    serverTimestamp(),
        messageCount: (meta.messageCount || 0) + 1
    };

    /* First user message sets the title. */
    if (role === "user" && !meta.title) {
        updates.title =
            text.length > 40 ? text.slice(0, 40) + "..." : text;
    }

    await update(chatMetaRef(uid, chatId), updates);

}


/* Load all messages of a chat, sorted by ts ascending. */
async function loadMessages(uid, chatId) {

    const snap = await get(chatMessagesRef(uid, chatId));
    const out  = [];

    snap.forEach((c) => {
        const v = c.val();
        out.push({
            id:   c.key,
            role: v.role,
            text: v.text,
            ts:   v.ts || 0
        });
    });

    out.sort((a, b) => (a.ts || 0) - (b.ts || 0));

    return out;

}


/* Live listener over the user's chats.
   Callback receives an array sorted by updatedAt desc.
   Returns an unsubscribe function. */
function watchChats(uid, callback) {

    const unsub = onValue(chatsRoot(uid), (snap) => {

        const list = [];

        snap.forEach((c) => {
            const v    = c.val() || {};
            const meta = v.meta || {};
            list.push({
                id:           c.key,
                title:        meta.title || "New conversation",
                createdAt:    meta.createdAt || 0,
                updatedAt:    meta.updatedAt || 0,
                messageCount: meta.messageCount || 0
            });
        });

        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        callback(list);

    });

    return unsub;

}


/* Delete one chat entirely. */
async function deleteChat(uid, chatId) {
    await remove(ref(db, `users/${uid}/chats/${chatId}`));
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
