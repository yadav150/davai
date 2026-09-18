// DavAI — Analytics dashboard.
// Renders live counters from analytics/{uid}. No mock data.

import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { getSnapshot, getDailySeries, averageResponseMs } from "./analytics.js";

const $ = (id) => document.getElementById(id);

const modal     = $("analyticsModal");
const openBtn   = $("analyticsBtn");
const closeEls  = document.querySelectorAll("[data-close-analytics]");
const gridEl    = $("analyticsGrid");
const dailyEl   = $("analyticsDaily");
const errEl     = $("analyticsError");

let currentUid = null;

function showError(msg) {
  if (!errEl) return;
  errEl.textContent = msg || "";
}

function statCard(label, value, sub) {
  const card = document.createElement("div");
  card.className = "stat-card";

  const l = document.createElement("div");
  l.className = "stat-label";
  l.textContent = label;

  const v = document.createElement("div");
  v.className = "stat-value";
  v.textContent = String(value);

  card.appendChild(l);
  card.appendChild(v);

  if (sub) {
    const s = document.createElement("div");
    s.className = "stat-sub";
    s.textContent = sub;
    card.appendChild(s);
  }
  return card;
}

function renderGrid(snap) {
  if (!gridEl) return;
  gridEl.innerHTML = "";

  const u = snap.usage || {};
  gridEl.appendChild(statCard("Conversations", u.conversationsCreated || 0));
  gridEl.appendChild(statCard("Messages sent", u.messagesSent || 0));
  gridEl.appendChild(statCard("Messages received", u.messagesReceived || 0));
  gridEl.appendChild(statCard("AI requests", u.aiRequests || 0));
  gridEl.appendChild(statCard("Web searches", u.searches || 0));
  gridEl.appendChild(statCard("Errors", u.errors || 0));

  const avg = averageResponseMs(snap.responseMs);
  gridEl.appendChild(statCard("Avg response", avg ? avg + " ms" : "-"));
}

function renderDaily(series) {
  if (!dailyEl) return;
  dailyEl.innerHTML = "";

  if (!series.length) {
    const empty = document.createElement("p");
    empty.className = "conv-empty";
    empty.textContent = "No activity recorded yet.";
    dailyEl.appendChild(empty);
    return;
  }

  const max = Math.max(
    1,
    ...series.map((r) => (r.messagesSent || 0) + (r.messagesReceived || 0))
  );

  series.forEach((row) => {
    const wrap = document.createElement("div");
    wrap.className = "daily-row";

    const dayEl = document.createElement("div");
    dayEl.className = "daily-day";
    dayEl.textContent = row.day.slice(5);

    const barWrap = document.createElement("div");
    barWrap.className = "daily-bar-wrap";
    const bar = document.createElement("div");
    bar.className = "daily-bar";
    const total = (row.messagesSent || 0) + (row.messagesReceived || 0);
    bar.style.width = Math.max(2, Math.round((total / max) * 100)) + "%";
    barWrap.appendChild(bar);

    const valEl = document.createElement("div");
    valEl.className = "daily-val";
    valEl.textContent = String(total);

    wrap.appendChild(dayEl);
    wrap.appendChild(barWrap);
    wrap.appendChild(valEl);
    dailyEl.appendChild(wrap);
  });
}

async function load() {
  if (!currentUid) return;
  showError("");
  try {
    const snap = await getSnapshot(currentUid);
    renderGrid(snap);
    const series = await getDailySeries(currentUid, { days: 14 });
    renderDaily(series);
  } catch (err) {
    console.error("analytics load failed", err);
    showError("Could not load usage: " + (err && err.message ? err.message : "unknown error"));
  }
}

function openModal() {
  if (!modal) return;
  modal.classList.remove("is-hidden");
  modal.setAttribute("aria-hidden", "false");
  load();
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

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUid = user.uid;
  } else {
    currentUid = null;
    if (gridEl) gridEl.innerHTML = "";
    if (dailyEl) dailyEl.innerHTML = "";
  }
});
