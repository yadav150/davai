// DavAI — UI primitives: toast, modals, drawer, context menu, dialogs, formatters.
// No Firebase, no data. Pure UI.

const $ = (id) => document.getElementById(id);

/* ---------- formatters ---------- */

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const IST_TZ = "Asia/Kolkata";
const fmtTime  = new Intl.DateTimeFormat("en-IN", { timeZone: IST_TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const fmtShort = new Intl.DateTimeFormat("en-IN", { timeZone: IST_TZ, day: "2-digit", month: "short" });
const fmtFull  = new Intl.DateTimeFormat("en-IN", { timeZone: IST_TZ, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function formatIST(ts, mode = "time") {
  if (!ts) return "";
  const d = new Date(ts);
  if (mode === "short") return fmtShort.format(d);
  if (mode === "full")  return fmtFull.format(d);
  return fmtTime.format(d);
}

/* ---------- svg icon helper ---------- */

export function icon(name, size = "") {
  const cls = size ? `icon ${size}` : "icon";
  return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

/* ---------- toast ---------- */

export function toast(message, { type = "info", duration = 3200 } = {}) {
  const wrap = $("toastWrap");
  if (!wrap) return;

  const el = document.createElement("div");
  el.className = "toast";
  const iconName = type === "success" ? "check" : type === "error" ? "alert" : "alert";
  el.innerHTML = `${icon(iconName, "sm")}<span>${escapeHtml(message)}</span>`;
  wrap.appendChild(el);

  const remove = () => {
    el.classList.add("is-out");
    setTimeout(() => el.remove(), 200);
  };
  const t = setTimeout(remove, duration);
  el.addEventListener("click", () => { clearTimeout(t); remove(); });
}

/* ---------- modal ---------- */

export function openModal(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove("is-hidden");
  el.setAttribute("aria-hidden", "false");
}

export function closeModal(id) {
  const el = $(id);
  if (!el) return;
  el.classList.add("is-hidden");
  el.setAttribute("aria-hidden", "true");
}

export function isModalOpen(id) {
  const el = $(id);
  return el && !el.classList.contains("is-hidden");
}

/* ---------- drawer ---------- */

export function openDrawer() {
  const sb = $("sidebar");
  const sc = $("sidebarScrim");
  if (!sb || !sc) return;
  sb.classList.add("is-open");
  sc.hidden = false;
}

export function closeDrawer() {
  const sb = $("sidebar");
  const sc = $("sidebarScrim");
  if (!sb || !sc) return;
  sb.classList.remove("is-open");
  sc.hidden = true;
}

/* ---------- context menu ---------- */

let menuOpen = false;

export function openContextMenu(x, y, items) {
  const el = $("contextMenu");
  if (!el) return;

  el.innerHTML = items
    .map((it, i) =>
      it.separator
        ? `<div style="height:1px;background:var(--border);margin:4px 6px"></div>`
        : `<button type="button" data-index="${i}">${it.icon ? icon(it.icon, "sm") : ""}<span>${escapeHtml(it.label)}</span></button>`
    )
    .join("");

  el.classList.remove("is-hidden");
  menuOpen = true;

  // position within viewport
  el.style.left = "0px";
  el.style.top = "0px";
  const rect = el.getBoundingClientRect();
  const vw = innerWidth, vh = innerHeight;
  const left = Math.min(x, vw - rect.width - 8);
  const top  = Math.min(y, vh - rect.height - 8);
  el.style.left = Math.max(8, left) + "px";
  el.style.top  = Math.max(8, top)  + "px";

  el.querySelectorAll("button[data-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      const it = items[idx];
      closeContextMenu();
      if (it && typeof it.onClick === "function") it.onClick();
    });
  });
}

export function closeContextMenu() {
  const el = $("contextMenu");
  if (!el) return;
  el.classList.add("is-hidden");
  el.innerHTML = "";
  menuOpen = false;
}

export function isContextMenuOpen() { return menuOpen; }

/* ---------- confirm dialog ---------- */

export function confirmDialog({
  title = "Are you sure?",
  message = "This action cannot be undone.",
  confirmText = "Confirm"
} = {}) {
  return new Promise((resolve) => {
    const titleEl = $("confirmTitle");
    const textEl  = $("confirmText");
    const btn     = $("confirmAction");
    const modal   = $("confirmModal");
    if (!modal || !btn) return resolve(false);

    titleEl.textContent = title;
    textEl.textContent  = message;
    btn.textContent     = confirmText;

    const cleanup = () => {
      btn.removeEventListener("click", onYes);
      modal.querySelectorAll("[data-close]").forEach((n) =>
        n.removeEventListener("click", onNo)
      );
      closeModal("confirmModal");
    };
    const onYes = () => { cleanup(); resolve(true); };
    const onNo  = () => { cleanup(); resolve(false); };

    btn.addEventListener("click", onYes);
    modal.querySelectorAll("[data-close]").forEach((n) =>
      n.addEventListener("click", onNo)
    );

    openModal("confirmModal");
  });
}

/* ---------- rename dialog ---------- */

export function renameDialog({ defaultValue = "" } = {}) {
  return new Promise((resolve) => {
    const input = $("renameInput");
    const btn   = $("renameSave");
    const modal = $("renameModal");
    if (!modal || !input || !btn) return resolve(null);

    input.value = defaultValue;

    const cleanup = () => {
      btn.removeEventListener("click", onSave);
      input.removeEventListener("keydown", onKey);
      modal.querySelectorAll("[data-close]").forEach((n) =>
        n.removeEventListener("click", onCancel)
      );
      closeModal("renameModal");
    };
    const onSave = () => {
      const v = input.value.trim();
      cleanup();
      resolve(v || null);
    };
    const onCancel = () => { cleanup(); resolve(null); };
    const onKey = (e) => {
      if (e.key === "Enter") { e.preventDefault(); onSave(); }
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    };

    btn.addEventListener("click", onSave);
    input.addEventListener("keydown", onKey);
    modal.querySelectorAll("[data-close]").forEach((n) =>
      n.addEventListener("click", onCancel)
    );

    openModal("renameModal");
    setTimeout(() => input.focus(), 30);
  });
}

/* ---------- global wiring ---------- */

function wireGlobal() {
  // data-close buttons
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-close]");
    if (t) closeModal(t.getAttribute("data-close"));
  });

  // drawer
  const openBtn  = $("openSidebar");
  const closeBtn = $("closeSidebar");
  const scrim    = $("sidebarScrim");
  if (openBtn)  openBtn.addEventListener("click", openDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (scrim)    scrim.addEventListener("click", closeDrawer);

  // close context menu on scroll / resize / outside click
  window.addEventListener("scroll", closeContextMenu, true);
  window.addEventListener("resize", () => { closeContextMenu(); if (innerWidth > 900) closeDrawer(); });
  document.addEventListener("mousedown", (e) => {
    if (!menuOpen) return;
    const el = $("contextMenu");
    if (el && !el.contains(e.target)) closeContextMenu();
  });

  // escape priority: menu > topmost modal > drawer
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (menuOpen) { closeContextMenu(); return; }
    const openModals = [...document.querySelectorAll(".modal:not(.is-hidden)")];
    if (openModals.length) { closeModal(openModals[openModals.length - 1].id); return; }
    closeDrawer();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wireGlobal);
} else {
  wireGlobal();
}
