// DavAI diagnostic — overwrite safe.
// Loads via index.html script tag (module). Does not modify user data
// except a single probe key that is removed immediately.

import { app, auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  ref, get, set, remove, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

function line(label, value) {
  console.log(label + ":", value);
}
function fail(label, e) {
  console.error(label + " FAILED:", {
    code: e && e.code,
    message: e && e.message
  });
}

function runChecks(user) {
  console.group("DavAI diagnostic");
  line("version", "diag-2");
  line("projectId", app.options.projectId);
  line("databaseURL", app.options.databaseURL);
  line("authDomain", app.options.authDomain);

  if (!user) {
    console.warn("AUTH: no current user. Sign in first, then refresh.");
    console.groupEnd();
    return;
  }

  line("AUTH uid", user.uid);
  line("AUTH email", user.email);
  line("AUTH providers", user.providerData.map(p => p.providerId));

  const uid = user.uid;

  (async () => {
    try {
      const snap = await get(ref(db, `users/${uid}`));
      line(`read users/${uid}`, snap.exists() ? snap.val() : "EMPTY");
    } catch (e) { fail(`read users/${uid}`, e); }

    try {
      const snap = await get(ref(db, "users"));
      line("read users/ (whole node)", snap.exists() ? "DATA (unexpected)" : "EMPTY");
    } catch (e) { fail("read users/ (whole node)", e); }

    try {
      await set(ref(db, `users/${uid}/settings/__diag__`), Date.now());
      line("write users/{uid}/settings/__diag__", "OK");
      await remove(ref(db, `users/${uid}/settings/__diag__`));
      line("remove __diag__", "OK");
    } catch (e) { fail("write probe", e); }

    try {
      await set(ref(db, `conversations/${uid}/__diag__`), { t: serverTimestamp() });
      line("write conversations/{uid}/__diag__", "OK");
      await remove(ref(db, `conversations/${uid}/__diag__`));
      line("remove conversations probe", "OK");
    } catch (e) { fail("write conversations probe", e); }

    try {
      await get(ref(db, "users/__foreign_uid__/settings"));
      console.warn("RULE CHECK: foreign uid read SUCCEEDED (rules too open)");
    } catch (e) {
      line("RULE CHECK foreign read blocked", e.code || e.message);
    }

    try {
      const snap = await get(ref(db, "/"));
      const val = snap.val();
      if (val === null) line("read / (root)", "NULL");
      else line("read / (root)", Object.keys(val));
    } catch (e) { line("read / (root) blocked", e.code || e.message); }

    console.groupEnd();
  })();
}

let ran = false;
onAuthStateChanged(auth, (user) => {
  if (ran) return;
  ran = true;
  setTimeout(() => runChecks(auth.currentUser || user), 1500);
});
