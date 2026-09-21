/* =========================================================
   DAV AI — WORKER API CLIENT
   ---------------------------------------------------------
   Talks to davai-worker. Sends Firebase ID token.
   Parses SSE: delta | meta | error | [DONE]

   Public:
       streamChat({ messages, settings, signal, onEvent })
   ========================================================= */

import { auth } from "./firebase.js";
import { getIdToken }
    from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";


const WORKER_BASE = "https://davai-worker.yadavsubba2003.workers.dev";


async function authHeader() {

    const user = auth.currentUser;
    if (!user) throw new Error("not_signed_in");

    /* Force a refresh if the cached token is within 5 minutes of expiry.
       Passing `true` always refreshes — slow but always valid.
       Firebase's own caching handles the common case cheaply. */
    const token = await getIdToken(user);
    return { Authorization: "Bearer " + token };

}


/* Parse one SSE chunk buffer into events.
   Returns { events: [...], rest: "leftover" } */
function parseSSE(buffer) {

    const events = [];
    const parts  = buffer.split("\n\n");
    const rest   = parts.pop() || "";

    for (const chunk of parts) {

        const lines = chunk.split("\n");

        for (const line of lines) {

            const t = line.trim();
            if (!t.startsWith("data:")) continue;

            const raw = t.slice(5).trim();
            if (!raw) continue;

            if (raw === "[DONE]") {
                events.push({ type: "done" });
                continue;
            }

            try {
                events.push(JSON.parse(raw));
            } catch {
                /* skip malformed */
            }

        }

    }

    return { events, rest };

}


/* Main streaming entry.
   onEvent receives one of:
       { type: "delta",  text }
       { type: "meta",   model, sources }
       { type: "status", state }
       { type: "error",  code, message }
       { type: "done" }                                          */
export async function streamChat({ messages, settings, signal, onEvent }) {

    const headers = {
        "Content-Type": "application/json",
        ...(await authHeader())
    };

    const res = await fetch(WORKER_BASE + "/chat", {
        method:  "POST",
        headers,
        signal,
        body: JSON.stringify({
            messages,
            settings: settings || {},
            stream:   true
        })
    });

    if (!res.ok) {

        let payload = null;
        try { payload = await res.json(); } catch { /* ignore */ }

        const reason = payload && payload.reason ? " [" + payload.reason + "]" : "";
        const msg =
            (payload && (payload.message || payload.error)) ||
            ("HTTP " + res.status);

        throw new Error("chat_" + res.status + ": " + msg + reason);

    }

    if (!res.body) throw new Error("no_stream_body");

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = "";

    while (true) {

        const { value, done } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const { events, rest } = parseSSE(buffer);
        buffer = rest;

        for (const evt of events) {
            if (typeof onEvent === "function") onEvent(evt);
        }

    }

    /* Flush any tail. */
    if (buffer.trim()) {
        const { events } = parseSSE(buffer + "\n\n");
        for (const evt of events) {
            if (typeof onEvent === "function") onEvent(evt);
        }
    }

}
