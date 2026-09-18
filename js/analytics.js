// DavAI — Analytics data layer.
// Counters are incremented from real events only.
// Reads/writes scoped to analytics/{uid}.

import { db } from "./firebase.js";
import {
  ref,
  get,
  update,
  increment,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

const ROOT = (uid) => `analytics/${uid}`;

function todayKey() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ---------- Event increments ---------- */
// Each event bumps lifetime counters and today's daily bucket.
export async function trackEvent(uid, type, by = 1) {
  if (!uid || !type) return;
  const day = todayKey();
  const patch = {};
  patch[`${ROOT(uid)}/usage/${type}`] = increment(by);
  patch[`${ROOT(uid)}/daily/${day}/${type}`] = increment(by);
  patch[`${ROOT(uid)}/lastEventAt`] = serverTimestamp();
  try {
    await update(ref(db), patch);
  } catch (err) {
    // Analytics must never break the main flow.
    console.warn("analytics trackEvent failed", type, err);
  }
}

export function trackMessageSent(uid)      { return trackEvent(uid, "messagesSent"); }
export function trackMessageReceived(uid)  { return trackEvent(uid, "messagesReceived"); }
export function trackConversation(uid)     { return trackEvent(uid, "conversationsCreated"); }
export function trackSearch(uid)           { return trackEvent(uid, "searches"); }
export function trackAIRequest(uid)        { return trackEvent(uid, "aiRequests"); }
export function trackError(uid)            { return trackEvent(uid, "errors"); }

// Response time in ms — stores count, total, and computes average on read.
export async function trackResponseTime(uid, ms) {
  if (!uid || typeof ms !== "number" || ms < 0) return;
  const day = todayKey();
  const patch = {};
  patch[`${ROOT(uid)}/responseMs/count`]   = increment(1);
  patch[`${ROOT(uid)}/responseMs/totalMs`] = increment(Math.round(ms));
  patch[`${ROOT(uid)}/daily/${day}/responseMs/count`]   = increment(1);
  patch[`${ROOT(uid)}/daily/${day}/responseMs/totalMs`] = increment(Math.round(ms));
  try {
    await update(ref(db), patch);
  } catch (err) {
    console.warn("analytics trackResponseTime failed", err);
  }
}

/* ---------- Snapshot (for dashboard) ---------- */
export async function getSnapshot(uid) {
  if (!uid) throw new Error("getSnapshot: missing uid");
  const snap = await get(ref(db, ROOT(uid)));
  const val = snap.exists() ? snap.val() : {};
  return {
    usage: val.usage || {},
    daily: val.daily || {},
    responseMs: val.responseMs || { count: 0, totalMs: 0 },
    lastEventAt: val.lastEventAt || null
  };
}

// Returns array of { day, ...counters } sorted ascending (oldest first).
export async function getDailySeries(uid, { days = 14 } = {}) {
  const snap = await getSnapshot(uid);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  const cutoffKey = cutoff.toISOString().slice(0, 10);

  const rows = [];
  Object.keys(snap.daily).forEach((day) => {
    if (day >= cutoffKey) rows.push({ day, ...snap.daily[day] });
  });
  rows.sort((a, b) => a.day.localeCompare(b.day));
  return rows;
}

export function averageResponseMs(responseMs) {
  if (!responseMs || !responseMs.count) return 0;
  return Math.round(responseMs.totalMs / responseMs.count);
}
