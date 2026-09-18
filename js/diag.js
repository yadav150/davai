// Temporary diagnostic. Delete after use.

import { auth, db } from "./firebase.js";
import {
  ref, get, set, remove
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

async function run() {
  console.group("DavAI diagnostic");

  const user = auth.currentUser;
  console.log("currentUser:", user ? {
    uid: user.uid,
    email: user.email,
    provider: user.providerData.map(p => p.providerId)
  } : null);

  if (!user) {
    console.warn("No auth user. Sign in first, then run again.");
    console.groupEnd();
    return;
  }

  const uid = user.uid;

  try {
    const snap = await get(ref(db, `users/${uid}/settings`));
    console.log("read users/{uid}/settings:", snap.exists() ? snap.val() : "EMPTY");
  } catch (e) {
    console.error("read settings failed:", e.code || e.message, e);
  }

  try {
    const snap = await get(ref(db, `users/${uid}/profile`));
    console.log("read users/{uid}/profile:", snap.exists() ? snap.val() : "EMPTY");
  } catch (e) {
    console.error("read profile failed:", e.code || e.message, e);
  }

  try {
    await set(ref(db, `users/${uid}/settings/diagProbe`), Date.now());
    console.log("write users/{uid}/settings/diagProbe: OK");
    await remove(ref(db, `users/${uid}/settings/diagProbe`));
    console.log("remove diagProbe: OK");
  } catch (e) {
    console.error("write settings failed:", e.code || e.message, e);
  }

  try {
    await get(ref(db, "users/__not_my_uid__/settings"));
    console.warn("rules too open: read of foreign uid succeeded (unexpected)");
  } catch (e) {
    console.log("foreign uid read blocked (expected):", e.code || e.message);
  }

  console.groupEnd();
}

run();
