// Temporary test for js/conversations.js. Delete after verification.

import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  createConversation,
  listConversations,
  getConversation,
  appendMessage,
  updateConversationMeta,
  renameConversation,
  deleteConversation
} from "./conversations.js";

const pass = (m) => console.log("PASS:", m);
const fail = (m, e) => console.error("FAIL:", m, e && (e.code || e.message), e);

async function run(uid) {
  console.group("DavAI conversations test");
  console.log("uid:", uid);

  let cid = null;

  try {
    cid = await createConversation(uid, { title: "diag-conv" });
    if (typeof cid !== "string" || !cid) throw new Error("no cid returned");
    pass("createConversation -> " + cid);
  } catch (e) { fail("createConversation", e); console.groupEnd(); return; }

  try {
    const rows = await listConversations(uid);
    const found = rows.find(r => r.id === cid);
    if (!found) throw new Error("new conversation not in list");
    pass("listConversations found " + rows.length + " row(s), includes new");
  } catch (e) { fail("listConversations", e); }

  try {
    await appendMessage(uid, cid, { role: "user", content: "hello test" });
    await appendMessage(uid, cid, { role: "assistant", content: "hi back", model: "test-model" });
    pass("appendMessage x2 OK");
  } catch (e) { fail("appendMessage", e); }

  try {
    const conv = await getConversation(uid, cid);
    if (!conv || !Array.isArray(conv.messages) || conv.messages.length !== 2) {
      throw new Error("expected 2 messages, got " + (conv && conv.messages ? conv.messages.length : "none"));
    }
    const roles = conv.messages.map(m => m.role).join(",");
    if (roles !== "user,assistant") throw new Error("bad role order: " + roles);
    pass("getConversation returned 2 messages in order: " + roles);
  } catch (e) { fail("getConversation", e); }

  try {
    await updateConversationMeta(uid, cid, { lastMessage: "hi back", messageCount: 2 });
    pass("updateConversationMeta OK");
  } catch (e) { fail("updateConversationMeta", e); }

  try {
    await renameConversation(uid, cid, "renamed-conv");
    const conv = await getConversation(uid, cid);
    if (conv.metadata.title !== "renamed-conv") throw new Error("title not updated");
    pass("renameConversation OK");
  } catch (e) { fail("renameConversation", e); }

  try {
    await deleteConversation(uid, cid);
    const conv = await getConversation(uid, cid);
    if (conv !== null) throw new Error("conversation still exists after delete");
    pass("deleteConversation OK (getConversation returns null)");
  } catch (e) { fail("deleteConversation", e); }

  console.groupEnd();
  console.log("DavAI conversations test: DONE");
}

let ran = false;
onAuthStateChanged(auth, (user) => {
  if (ran) return;
  ran = true;
  setTimeout(() => {
    const u = auth.currentUser || user;
    if (!u) { console.warn("No auth user. Sign in first, then refresh."); return; }
    run(u.uid);
  }, 1200);
});
