// DavAI Worker — entry point.
// Routes:
//   GET  /health  — health check
//   POST /chat    — AI chat (streaming + non-streaming)
//   POST /search  — web search
//
// Secrets (Cloudflare env):
//   GROQ_API_KEY, TAVILY_API_KEY, FIREBASE_PROJECT_ID
// Vars:
//   ALLOWED_ORIGINS, DEFAULT_MODEL, DEFAULT_PROVIDER

import { verifyIdToken, getBearerToken } from "./firebase.js";
import { buildSystemPrompt } from "./prompt.js";
import { groqChat, groqChatStream, transformGroqStream } from "./groq.js";
import { tavilySearch } from "./tavily.js";
import { buildContext, shouldSearch } from "./context.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    try {
      if (url.pathname === "/health" && request.method === "GET") {
        return json({ ok: true, service: "davai-worker", time: Date.now() });
      }

      if (url.pathname === "/chat" && request.method === "POST") {
        return await handleChat(request, env);
      }

      if (url.pathname === "/search" && request.method === "POST") {
        return await handleSearch(request, env);
      }

      return json({ error: "not_found" }, 404, corsHeaders(request, env));
    } catch (err) {
      console.error("worker unhandled", err && err.stack ? err.stack : err);
      return json({ error: "internal_error", message: "Unexpected server error." }, 500, corsHeaders(request, env));
    }
  }
};

/* ============================================================
   CORS
   ============================================================ */
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const allowOrigin = allowed.includes(origin) ? origin : (allowed[0] || "");

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extra }
  });
}

function streamResponse(stream, extra = {}) {
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      ...extra
    }
  });
}

/* ============================================================
   Auth
   ============================================================ */
async function authenticate(request, env) {
  const token = getBearerToken(request);
  if (!token) throw new Error("missing_token");
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("missing_project_id");
  return verifyIdToken(token, projectId);
}

/* ============================================================
   POST /chat
   Body: { messages, model?, system?, search?|"auto", stream?, settings? }
   ============================================================ */
async function handleChat(request, env) {
  const cors = corsHeaders(request, env);

  let auth;
  try {
    auth = await authenticate(request, env);
  } catch (e) {
    return json({ error: "unauthorized", message: "Sign in required." }, 401, cors);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request", message: "Invalid JSON body." }, 400, cors);
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const settings = body.settings && typeof body.settings === "object" ? body.settings : {};
  const model = body.model || env.DEFAULT_MODEL || "openai/gpt-oss-120b";
  const memoryContext = typeof body.memoryContext === "string" ? body.memoryContext : "";
  const wantStream = body.stream === true;

  if (!messages.length) {
    return json({ error: "bad_request", message: "No messages provided." }, 400, cors);
  }

  // Latest user message
  const lastUser = [...messages].reverse().find((m) => m && m.role === "user");
  const lastText = lastUser && typeof lastUser.content === "string" ? lastUser.content : "";

  // Search decision
  const searchFlag = body.search;
  const searchEnabled = settings.searchEnabled !== false;
  let doSearch = false;
  if (searchEnabled && searchFlag !== false) {
    if (searchFlag === "auto" || searchFlag === true || searchFlag === undefined) {
      doSearch = shouldSearch(lastText, settings);
    }
  }

  let searchResults = [];
  if (doSearch) {
    try {
      const s = await tavilySearch({
        apiKey: env.TAVILY_API_KEY,
        query: lastText.slice(0, 400),
        maxResults: 6
      });
      searchResults = s.results || [];
    } catch (err) {
      console.warn("search failed, continuing without it", err && err.message);
    }
  }

  const systemPrompt = buildSystemPrompt({
    language: settings.language,
    responseStyle: settings.responseStyle,
    responseLength: settings.responseLength,
    memoryContext,
    searchEnabled
  });

  const ctxMessages = buildContext({
    messages,
    systemPrompt,
    searchResults
  });

  // ---- Non-streaming ----
  if (!wantStream) {
    try {
      const result = await groqChat({
        apiKey: env.GROQ_API_KEY,
        model,
        messages: ctxMessages,
        system: null
      });
      return json({
        content: result.content,
        model: result.model,
        tokens: result.tokens,
        sources: searchResults
      }, 200, cors);
    } catch (err) {
      console.error("groq non-stream failed", err && err.message);
      return json({ error: "ai_failed", message: "AI provider error." }, 502, cors);
    }
  }

  // ---- Streaming ----
  try {
    const { stream, model: usedModel } = await groqChatStream({
      apiKey: env.GROQ_API_KEY,
      model,
      messages: ctxMessages,
      system: null
    });

    const clientStream = transformGroqStream(stream, {
      model: usedModel,
      sources: searchResults
    });

    return streamResponse(clientStream, cors);
  } catch (err) {
    console.error("groq stream failed", err && err.message);
    return json({ error: "ai_failed", message: "AI provider error." }, 502, cors);
  }
}

/* ============================================================
   POST /search
   Body: { query, maxResults?, topic?, depth? }
   ============================================================ */
async function handleSearch(request, env) {
  const cors = corsHeaders(request, env);

  try {
    await authenticate(request, env);
  } catch {
    return json({ error: "unauthorized", message: "Sign in required." }, 401, cors);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request", message: "Invalid JSON body." }, 400, cors);
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return json({ error: "bad_request", message: "Empty query." }, 400, cors);
  }

  try {
    const { results } = await tavilySearch({
      apiKey: env.TAVILY_API_KEY,
      query,
      maxResults: typeof body.maxResults === "number" ? body.maxResults : 6,
      topic: body.topic,
      searchDepth: body.depth
    });
    return json({ results }, 200, cors);
  } catch (err) {
    console.error("tavily failed", err && err.message);
    return json({ error: "search_failed", message: "Search provider error." }, 502, cors);
  }
}
