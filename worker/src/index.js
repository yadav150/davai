// DavAI Worker — entry point.
// Routes:
//   POST /chat    — AI chat (streaming + non-streaming)
//   POST /search  — web search
//   GET  /health  — health check
//
// Secrets (env):
//   GROQ_API_KEY, TAVILY_API_KEY
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Preflight
    if (request.method === "OPTIONS") {
      return handleOptions(request, env);
    }

    try {
      if (url.pathname === "/health" && request.method === "GET") {
        return json({ ok: true, service: "davai-worker" });
      }

      if (url.pathname === "/chat" && request.method === "POST") {
        return await handleChat(request, env, ctx);
      }

      if (url.pathname === "/search" && request.method === "POST") {
        return await handleSearch(request, env, ctx);
      }

      return json({ error: "not_found" }, 404);
    } catch (err) {
      console.error("worker error", err && err.stack ? err.stack : err);
      return json({ error: "internal_error", message: "Unexpected server error." }, 500);
    }
  }
};

/* ---------- CORS ---------- */
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || "";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function handleOptions(request, env) {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

/* ---------- Handlers (stubs — wired in next steps) ---------- */
async function handleChat(request, env, ctx) {
  const cors = corsHeaders(request, env);
  return json({ error: "not_implemented", message: "Chat handler coming next." }, 501, cors);
}

async function handleSearch(request, env, ctx) {
  const cors = corsHeaders(request, env);
  return json({ error: "not_implemented", message: "Search handler coming next." }, 501, cors);
}
