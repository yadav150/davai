// DavAI — Markdown renderer for AI responses.
// marked parses markdown, DOMPurify sanitizes the HTML.
// Raw AI HTML is never inserted into the DOM without sanitization.

import { marked } from "https://cdn.jsdelivr.net/npm/marked@12.0.2/lib/marked.esm.js";
import DOMPurify from "https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.es.mjs";

marked.setOptions({
  gfm: true,
  breaks: true,
  headerIds: false,
  mangle: false
});

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "p", "br", "hr", "strong", "em", "del", "blockquote",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "pre", "code",
    "table", "thead", "tbody", "tr", "th", "td",
    "a", "span"
  ],
  ALLOWED_ATTR: ["href", "title", "target", "rel", "class"],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "input"],
  FORBID_ATTR: ["style", "onerror", "onload", "onclick"]
};

// Render markdown → sanitized HTML string.
export function renderMarkdown(text) {
  if (!text) return "";
  const rawHtml = marked.parse(String(text));
  const safe = DOMPurify.sanitize(rawHtml, PURIFY_CONFIG);
  return forceSafeLinks(safe);
}

// Ensure external links open safely.
function forceSafeLinks(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  tpl.content.querySelectorAll("a").forEach((a) => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  });
  return tpl.innerHTML;
}

// After inserting rendered HTML into the DOM, add copy buttons to code blocks.
export function enhanceCodeBlocks(root) {
  if (!root) return;
  root.querySelectorAll("pre > code").forEach((codeEl) => {
    const pre = codeEl.parentElement;
    if (pre.querySelector(".code-copy")) return;

    pre.classList.add("code-block");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-copy";
    btn.textContent = "Copy";
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(codeEl.textContent);
        btn.textContent = "Copied";
        setTimeout(() => { btn.textContent = "Copy"; }, 1200);
      } catch {
        btn.textContent = "Failed";
        setTimeout(() => { btn.textContent = "Copy"; }, 1200);
      }
    });
    pre.appendChild(btn);
  });
}
