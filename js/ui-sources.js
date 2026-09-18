// DavAI — Sources rendering for assistant messages.
// Renders a "Sources" list attached to an assistant message.
// Source shape (from backend): { title, url, domain, snippet, publishedAt }

const $ = (id) => document.getElementById(id);

function safeDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

function esc(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Normalize a source object so downstream code can rely on fields.
export function normalizeSource(s, index) {
  if (!s || typeof s !== "object") return null;
  const url = typeof s.url === "string" ? s.url : "";
  if (!url) return null;
  return {
    index: index + 1,
    title: (s.title || safeDomain(url) || "Source").toString(),
    url,
    domain: (s.domain || safeDomain(url) || "").toString(),
    snippet: (s.snippet || "").toString(),
    publishedAt: s.publishedAt || null
  };
}

// Render a "Sources" panel for the given list. Returns null if empty.
export function buildSourcesPanel(sources) {
  if (!Array.isArray(sources) || !sources.length) return null;

  const normalized = [];
  sources.forEach((s, i) => {
    const n = normalizeSource(s, i);
    if (n) normalized.push(n);
  });
  if (!normalized.length) return null;

  const panel = document.createElement("div");
  panel.className = "sources-panel";

  const head = document.createElement("div");
  head.className = "sources-head";
  head.textContent = "Sources";
  panel.appendChild(head);

  const list = document.createElement("ol");
  list.className = "sources-list";

  normalized.forEach((n) => {
    const li = document.createElement("li");
    li.className = "source-item";

    const a = document.createElement("a");
    a.className = "source-link";
    a.href = n.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    const titleSpan = document.createElement("span");
    titleSpan.className = "source-title";
    titleSpan.textContent = n.title;
    a.appendChild(titleSpan);

    if (n.domain) {
      const dom = document.createElement("span");
      dom.className = "source-domain";
      dom.textContent = n.domain;
      a.appendChild(dom);
    }

    li.appendChild(a);

    if (n.snippet) {
      const p = document.createElement("p");
      p.className = "source-snippet";
      p.textContent = n.snippet;
      li.appendChild(p);
    }

    list.appendChild(li);
  });

  panel.appendChild(list);
  return panel;
}

// Attach a sources panel into an assistant bubble element, if sources exist.
export function attachSourcesToBubble(bubbleEl, sources) {
  if (!bubbleEl) return;
  const existing = bubbleEl.querySelector(".sources-panel");
  if (existing) existing.remove();
  const panel = buildSourcesPanel(sources);
  if (panel) bubbleEl.appendChild(panel);
}
