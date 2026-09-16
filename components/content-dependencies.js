const scriptLoads = new Map();
const styleLoads = new Map();
let katexConfigured = false;

function loadScript(src) {
  if (scriptLoads.has(src)) return scriptLoads.get(src);

  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true" || existing.readyState === "complete" || existing.readyState === "loaded") {
        resolve();
      } else {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", reject, { once: true });
    document.head.appendChild(script);
  });

  scriptLoads.set(src, promise);
  return promise;
}

function loadStyle(href) {
  if (styleLoads.has(href)) return styleLoads.get(href);

  const promise = new Promise((resolve, reject) => {
    const baseName = href.split("/").pop();
    const existing = document.querySelector(`link[href="${href}"], link[href*="${baseName}"]`);
    if (existing) {
      if (existing.sheet) resolve();
      else {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
      }
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", reject, { once: true });
    document.head.appendChild(link);
  });

  styleLoads.set(href, promise);
  return promise;
}

function transformOutsideCode(text, transform) {
  const pieces = [];
  let plainStart = 0;
  let cursor = 0;

  const pushPlain = end => {
    if (end > plainStart) pieces.push(transform(text.slice(plainStart, end)));
  };

  while (cursor < text.length) {
    const lineStart = cursor === 0 || text[cursor - 1] === "\n";
    if (lineStart) {
      const lineEnd = text.indexOf("\n", cursor);
      const end = lineEnd === -1 ? text.length : lineEnd;
      const opener = /^( {0,3})(`{3,}|~{3,})/.exec(text.slice(cursor, end));
      if (opener) {
        const marker = opener[2][0];
        const minLength = opener[2].length;
        let fenceEnd = lineEnd === -1 ? text.length : lineEnd + 1;
        let search = fenceEnd;

        while (search < text.length) {
          const closeLineEnd = text.indexOf("\n", search);
          const closeEnd = closeLineEnd === -1 ? text.length : closeLineEnd;
          const closeLine = text.slice(search, closeEnd);
          const closer = new RegExp(`^ {0,3}${marker}{${minLength},}[ \\t]*$`);
          if (closer.test(closeLine)) {
            fenceEnd = closeLineEnd === -1 ? text.length : closeLineEnd + 1;
            break;
          }
          if (closeLineEnd === -1) {
            fenceEnd = text.length;
            break;
          }
          search = closeLineEnd + 1;
          fenceEnd = search;
        }

        pushPlain(cursor);
        pieces.push(text.slice(cursor, fenceEnd));
        cursor = fenceEnd;
        plainStart = cursor;
        continue;
      }
    }

    if (text[cursor] === "`") {
      let runEnd = cursor + 1;
      while (text[runEnd] === "`") runEnd += 1;
      const ticks = text.slice(cursor, runEnd);
      const close = text.indexOf(ticks, runEnd);
      if (close !== -1) {
        pushPlain(cursor);
        const codeEnd = close + ticks.length;
        pieces.push(text.slice(cursor, codeEnd));
        cursor = codeEnd;
        plainStart = cursor;
        continue;
      }
      cursor = runEnd;
      continue;
    }

    cursor += 1;
  }

  pushPlain(text.length);
  return pieces.join("");
}

function normalizeMathText(text) {
  let normalized = text.replace(/==([^=]+)==/g, "<mark>$1</mark>");

  // marked-katex-extension은 block math의 여닫는 $$가 각각 독립된 줄에 있어야 한다.
  normalized = normalized.replace(/(^|[^\\])\$\$([\s\S]*?)\$\$/g, (match, prefix, tex, offset, source) => {
    const delimiterStart = offset + prefix.length;
    const delimiterEnd = offset + match.length;
    const leading = source.slice(0, delimiterStart);
    const trailing = source.slice(delimiterEnd);
    const before = delimiterStart === 0 || leading.endsWith("\n\n")
      ? ""
      : leading.endsWith("\n") ? "\n" : "\n\n";
    const after = delimiterEnd === source.length || trailing.startsWith("\n\n")
      ? ""
      : trailing.startsWith("\n") ? "\n" : "\n\n";
    return `${prefix}${before}$$\n${tex.trim()}\n$$${after}`;
  });

  return normalized;
}

/** 코드 fence/span은 그대로 보존하고 그 밖의 Markdown에서만 수식과 하이라이트를 정규화한다. */
export function normalizeMarkdownMath(text) {
  if (!text) return "";
  return transformOutsideCode(text, normalizeMathText);
}

export async function ensureMarkdown(markdownText) {
  if (typeof window.marked === "undefined") {
    await loadScript("https://cdn.jsdelivr.net/npm/marked/marked.min.js");
  }

  if (!markdownText || !markdownText.includes("$")) return;

  await Promise.all([
    loadStyle("https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css"),
    typeof window.katex === "undefined"
      ? loadScript("https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js")
      : Promise.resolve(),
  ]);

  if (typeof window.markedKatex === "undefined") {
    await loadScript("https://cdn.jsdelivr.net/npm/marked-katex-extension/lib/index.umd.js");
  }

  if (!katexConfigured && typeof window.markedKatex === "function") {
    window.marked.use(
      window.markedKatex({ throwOnError: false, nonStandard: true }),
    );
    katexConfigured = true;
  }
}

export async function ensureCodeHighlighting() {
  await Promise.all([
    loadStyle(
      "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css",
    ),
    loadStyle(
      "https://fonts.googleapis.com/css2?family=Google+Sans+Code:wght@400..700&display=swap",
    ),
    typeof window.hljs === "undefined"
      ? loadScript(
          "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js",
        )
      : Promise.resolve(),
  ]);
}

export async function ensurePdfJs() {
  if (typeof window.pdfjsLib === "undefined") {
    await loadScript(
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    );
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return window.pdfjsLib;
}
