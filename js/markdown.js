// DavAI — markdown renderer.
// marked parses, DOMPurify sanitizes. AI content NEVER touches the DOM
// without going through renderMarkdown().

import { marked } from "https://cdn.jsdelivr.net/npm/marked@12.0.2/+esm";
import DOMPurify from "https://cdn.jsdelivr.net/npm/dompurify@3.1.6/+esm";

marked.setOptions({
  gfm: true,
  breaks: false,
  pedantic: false
});

const ALLOWED_TAGS = [
  "a","p","br","hr","strong","em","del","code","pre","blockquote",
  "ul","ol","li","h1","h2","h3","h4","h5","h6",
  "table","thead","tbody","tr","th","td",
  "span","div","sup","sub"
];

const ALLOWED_ATTR = [
  "href","title","target","rel","class","colspan","rowspan","align"
];

export function renderMarkdown(text) {
  if (!text) return "";
  const raw = marked.parse(String(text));
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script","style","iframe","object","embed","form","input","button"],
    FORBID_ATTR: ["onerror","onload","onclick","onmouseover","onfocus"]
  });
}

export function enhanceCodeBlocks(container) {
  if (!container) return;
  container.querySelectorAll("pre > code").forEach((codeEl) => {
    const pre = codeEl.parentElement;
    if (!pre || pre.dataset.enhanced === "1") return;
    pre.dataset.enhanced = "1";

    const lang = (codeEl.className.match(/language-([\w-]+)/) || [])[1] || "";
    const wrap = document.createElement("div");
    wrap.className = "code-block";

    const head = document.createElement("div");
    head.className = "code-head";

    const label = document.createElement("span");
    label.className = "code-lang";
    label.textContent = lang || "code";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "code-copy";
    copyBtn.setAttribute("data-copy-code", "1");
    copyBtn.textContent = "Copy";

    head.appendChild(label);
    head.appendChild(copyBtn);

    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(head);
    wrap.appendChild(pre);
  });
}
