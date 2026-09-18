// DavAI — Backend client.
// All AI + search traffic goes through this module.
// No secrets here. Endpoint is configurable at runtime.
//
// Configure the backend URL in one of these ways (priority top to bottom):
//   1. window.DAVAI_BACKEND_URL = "https://...";  (set in index.html before this module loads)
//   2. localStorage.setItem("davai.backendUrl", "https://...")
//   3. meta tag: <meta name="davai-backend" content="https://...">
//
// Until an endpoint is configured, askAI/searchWeb return a structured
// error. No fake responses are produced.

import { auth } from "./firebase.js";

const DEFAULT_MODEL = "openai/gpt-oss-120b";

function getBackendUrl() {
  if (typeof window !== "undefined" && window.DAVAI_BACKEND_URL) return window.DAVAI_BACKEND_URL;
  try {
    const stored = localStorage.getItem("davai.backendUrl");
    if (stored) return stored;
  } catch {}
  const meta = document.querySelector('meta[name="davai-backend"]');
  if (meta && meta.content) return meta.content;
  return "";
}

export function isBackendConfigured() {
  return !!getBackendUrl();
}

async function authHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error("NOT_AUTHENTICATED");
  const token = await user.getIdToken();
  return {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + token
  };
}

function normalizeError(err, fallback) {
  if (!err) return { code: "UNKNOWN", message: fallback || "Unknown error" };
  if (typeof err === "string") return { code: "ERROR", message: err };
  return {
    code: err.code || "ERROR",
    message: err.message || fallback || "Request failed"
  };
}

/* ------------------------------------------------------------------ */
/* askAI — non-streaming request, returns full response                */
/* payload: { messages: [{role, content}], model?, system?, search? }  */
/* returns: { ok, content, sources, model, tokens, error? }            */
/* ------------------------------------------------------------------ */
export async function askAI(payload) {
  const url = getBackendUrl();
  if (!url) {
    return {
      ok: false,
      error: { code: "NO_BACKEND", message: "AI backend is not connected yet." }
    };
  }

  let headers;
  try {
    headers = await authHeaders();
  } catch (e) {
    return { ok: false, error: normalizeError(e, "Not signed in") };
  }

  const body = {
    messages: Array.isArray(payload && payload.messages) ? payload.messages : [],
    model: (payload && payload.model) || DEFAULT_MODEL,
    system: (payload && payload.system) || undefined,
    search: !!(payload && payload.search)
  };

  try {
    const res = await fetch(url.replace(/\/$/, "") + "/chat", {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      let detail = "";
      try { detail = await res.text(); } catch {}
      return {
        ok: false,
        error: { code: "HTTP_" + res.status, message: detail || ("HTTP " + res.status) }
      };
    }

    const data = await res.json();
    return {
      ok: true,
      content: typeof data.content === "string" ? data.content : "",
      sources: Array.isArray(data.sources) ? data.sources : [],
      model: data.model || body.model,
      tokens: typeof data.tokens === "number" ? data.tokens : undefined
    };
  } catch (err) {
    return { ok: false, error: normalizeError(err, "Network error") };
  }
}

/* ------------------------------------------------------------------ */
/* askAIStream — SSE-style streaming                                   */
/* callbacks: { onDelta(text), onDone(meta), onError(err) }            */
/* returns: { abort() } — call to cancel the stream                    */
/* ------------------------------------------------------------------ */
export function askAIStream(payload, callbacks) {
  const cbs = callbacks || {};
  const url = getBackendUrl();

  if (!url) {
    if (cbs.onError) cbs.onError({ code: "NO_BACKEND", message: "AI backend is not connected yet." });
    return { abort() {} };
  }

  const controller = new AbortController();

  (async () => {
    let headers;
    try {
      headers = await authHeaders();
    } catch (e) {
      if (cbs.onError) cbs.onError(normalizeError(e, "Not signed in"));
      return;
    }

    const body = {
      messages: Array.isArray(payload && payload.messages) ? payload.messages : [],
      model: (payload && payload.model) || DEFAULT_MODEL,
      system: (payload && payload.system) || undefined,
      search: !!(payload && payload.search),
      stream: true
    };

    let res;
    try {
      res = await fetch(url.replace(/\/$/, "") + "/chat", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (err) {
      if (err && err.name === "AbortError") return;
      if (cbs.onError) cbs.onError(normalizeError(err, "Network error"));
      return;
    }

    if (!res.ok) {
      let detail = "";
      try { detail = await res.text(); } catch {}
      if (cbs.onError) cbs.onError({ code: "HTTP_" + res.status, message: detail || ("HTTP " + res.status) });
      return;
    }

    const reader = res.body && res.body.getReader ? res.body.getReader() : null;
    if (!reader) {
      // Fallback: read entire body, emit once
      try {
        const data = await res.json();
        if (cbs.onDelta && typeof data.content === "string") cbs.onDelta(data.content);
        if (cbs.onDone) cbs.onDone({ sources: data.sources || [], model: data.model, tokens: data.tokens });
      } catch (err) {
        if (cbs.onError) cbs.onError(normalizeError(err, "Bad response"));
      }
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    let meta = { sources: [], model: body.model };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const chunk of parts) {
          const lines = chunk.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const raw = trimmed.slice(5).trim();
            if (raw === "[DONE]") continue;

            let evt;
            try { evt = JSON.parse(raw); } catch { continue; }

            if (evt.type === "delta" && typeof evt.text === "string") {
              full += evt.text;
              if (cbs.onDelta) cbs.onDelta(evt.text);
            } else if (evt.type === "meta") {
              if (Array.isArray(evt.sources)) meta.sources = evt.sources;
              if (evt.model) meta.model = evt.model;
              if (typeof evt.tokens === "number") meta.tokens = evt.tokens;
            } else if (evt.type === "error") {
              if (cbs.onError) cbs.onError({ code: evt.code || "STREAM_ERROR", message: evt.message || "Stream error" });
            }
          }
        }
      }
      if (cbs.onDone) cbs.onDone({ ...meta, content: full });
    } catch (err) {
      if (err && err.name === "AbortError") return;
      if (cbs.onError) cbs.onError(normalizeError(err, "Stream failed"));
    }
  })();

  return { abort() { try { controller.abort(); } catch {} } };
}

/* ------------------------------------------------------------------ */
/* searchWeb — explicit search tool (backend performs it)              */
/* returns: { ok, results: [{title, url, domain, snippet, publishedAt}], error? } */
/* ------------------------------------------------------------------ */
export async function searchWeb(query) {
  const url = getBackendUrl();
  if (!url) {
    return { ok: false, error: { code: "NO_BACKEND", message: "Search backend is not connected yet." } };
  }
  if (!query || !String(query).trim()) {
    return { ok: false, error: { code: "EMPTY_QUERY", message: "Empty query" } };
  }

  let headers;
  try {
    headers = await authHeaders();
  } catch (e) {
    return { ok: false, error: normalizeError(e, "Not signed in") };
  }

  try {
    const res = await fetch(url.replace(/\/$/, "") + "/search", {
      method: "POST",
      headers,
      body: JSON.stringify({ query: String(query).trim() })
    });
    if (!res.ok) {
      let detail = "";
      try { detail = await res.text(); } catch {}
      return { ok: false, error: { code: "HTTP_" + res.status, message: detail || ("HTTP " + res.status) } };
    }
    const data = await res.json();
    return {
      ok: true,
      results: Array.isArray(data.results) ? data.results : []
    };
  } catch (err) {
    return { ok: false, error: normalizeError(err, "Search failed") };
  }
}
