// DavAI Worker — conversation context builder.
// Frontend sends: { messages, settings, memoryContext }
// This module turns that into a clean message array for the model.

const MAX_HISTORY = 30;       // hard cap on messages sent upstream
const MAX_CHARS_PER_MSG = 8000; // truncate very long messages

/**
 * Normalize and trim the incoming message list.
 * @param {Array} messages
 * @returns {Array<{role:string,content:string}>}
 */
export function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const out = [];
  messages.forEach((m) => {
    if (!m || typeof m.content !== "string") return;
    const role = m.role === "assistant" ? "assistant" : (m.role === "system" ? "system" : "user");
    const content = m.content.length > MAX_CHARS_PER_MSG
      ? m.content.slice(0, MAX_CHARS_PER_MSG) + "\n[...truncated]"
      : m.content;
    out.push({ role, content });
  });
  // Keep only the most recent MAX_HISTORY messages.
  return out.slice(-MAX_HISTORY);
}

/**
 * Build the final message array sent to the model.
 * Order: [system(base)] + [system(memory)] + [system(search)] + history
 *
 * @param {object} opts
 * @param {Array}  opts.messages        — raw history from client
 * @param {string} [opts.memoryContext] — memory block (optional)
 * @param {Array}  [opts.searchResults] — normalized search results (optional)
 * @param {string} [opts.systemPrompt]  — the base system prompt
 * @returns {Array}
 */
export function buildContext({ messages, memoryContext, searchResults, systemPrompt }) {
  const history = normalizeMessages(messages);
  const sys = [];

  if (systemPrompt && String(systemPrompt).trim()) {
    sys.push({ role: "system", content: String(systemPrompt) });
  }

  if (memoryContext && String(memoryContext).trim()) {
    sys.push({
      role: "system",
      content:
        "Personal memory (user-approved). Use only when relevant:\n" +
        String(memoryContext).trim()
    });
  }

  if (Array.isArray(searchResults) && searchResults.length) {
    const block = searchResults.map((r, i) =>
      `[${i + 1}] ${r.title}\n${r.domain}\n${r.url}\n${r.snippet}`
    ).join("\n\n");

    sys.push({
      role: "system",
      content:
        "The following web search results were just retrieved for the user's latest question. " +
        "Use them to ground your answer in current information. " +
        "Cite sources by number, e.g. [1], when you rely on them. " +
        "Do not fabricate any source outside this list.\n\n" + block
    });
  }

  return sys.concat(history);
}

/**
 * Decide whether a web search is likely needed for the latest user message.
 * Heuristic — kept simple and non-committal; the model can still answer
 * without search if this returns false.
 *
 * @param {string} text
 * @param {object} settings — { searchEnabled }
 * @returns {boolean}
 */
export function shouldSearch(text, settings) {
  if (!settings || settings.searchEnabled === false) return false;
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return false;

  // Signals that suggest freshness matters.
  const triggers = [
    "latest", "today", "yesterday", "this week", "this month", "this year",
    "current", "currently", "now", "right now", "recent", "recently",
    "news", "update", "updates", "announced", "announcement",
    "2024", "2025", "2026",
    "price", "prices", "rate", "rates", "stock", "market",
    "scheme", "schemes", "yojana", "eligibility", "notification",
    "exam date", "result", "results", "cutoff", "admit card", "recruitment",
    "job opening", "vacancy", "vacancies", "hiring",
    "who is", "what is happening", "what happened",
    "aaj", "abhi", "taza", "khabar", "khabrein", "naya", "nayi", "latest"
  ];
  return triggers.some((k) => t.includes(k));
}
