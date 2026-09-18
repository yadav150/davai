// DavAI Worker — Tavily search client.
// Docs: https://docs.tavily.com/docs/rest-api/api-reference

const TAVILY_URL = "https://api.tavily.com/search";

/**
 * Perform a web search via Tavily.
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.query
 * @param {number} [opts.maxResults=6]
 * @param {string} [opts.topic="general"] — "general" | "news"
 * @param {string} [opts.searchDepth="basic"] — "basic" | "advanced"
 * @returns {{ results: Array<{title,url,domain,snippet,publishedAt}>, answer?: string }}
 */
export async function tavilySearch({ apiKey, query, maxResults = 6, topic = "general", searchDepth = "basic" }) {
  if (!apiKey) throw new Error("missing_tavily_key");
  const q = String(query || "").trim();
  if (!q) return { results: [] };

  const payload = {
    api_key: apiKey,
    query: q,
    search_depth: searchDepth === "advanced" ? "advanced" : "basic",
    topic: topic === "news" ? "news" : "general",
    max_results: Math.max(1, Math.min(10, maxResults)),
    include_answer: false,
    include_raw_content: false,
    include_images: false
  };

  const res = await fetch(TAVILY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("tavily_http_" + res.status + (text ? ": " + text.slice(0, 200) : ""));
  }

  const data = await res.json();
  const results = Array.isArray(data.results) ? data.results : [];

  return {
    results: results.map(normalizeResult).filter(Boolean)
  };
}

function safeDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

function normalizeResult(r) {
  if (!r || typeof r !== "object") return null;
  const url = typeof r.url === "string" ? r.url : "";
  if (!url) return null;
  return {
    title: String(r.title || safeDomain(url) || "Source").slice(0, 200),
    url,
    domain: safeDomain(url),
    snippet: String(r.content || r.snippet || "").slice(0, 400),
    publishedAt: r.published_date || r.publishedAt || null
  };
}

/**
 * Build a compact text block of search results to inject into the model context.
 */
export function formatResultsForContext(results) {
  if (!Array.isArray(results) || !results.length) return "";
  return results.map((r, i) =>
    `[${i + 1}] ${r.title}\n${r.domain}\n${r.url}\n${r.snippet}`
  ).join("\n\n");
}
