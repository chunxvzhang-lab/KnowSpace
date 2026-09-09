import mermaid from "mermaid";

export type MermaidTheme = "default" | "dark" | "neutral";

type RenderMermaidOptions = {
  theme?: MermaidTheme;
  force?: boolean;
};

let renderId = 0;
let initializedTheme: MermaidTheme | null = null;

function ensureInitialized(theme: MermaidTheme): void {
  if (initializedTheme === theme) return;
  initializedTheme = theme;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme,
    suppressErrorRendering: true,
  });
}

/**
 * Read the raw Mermaid source from a <pre class="mermaid"> element.
 *
 * markdown.ts stores the original (unescaped) source as base64 in the
 * `data-mermaid-src` attribute so HTML-entity encoding (e.g. --> → --&gt;)
 * can never corrupt the diagram source before Mermaid sees it.
 *
 * Fallback: use textContent (browser auto-decodes HTML entities).
 */
function readSource(diagram: HTMLElement): string {
  const b64 = diagram.getAttribute("data-mermaid-src");
  if (b64) {
    try {
      return decodeURIComponent(escape(atob(b64)));
    } catch {
      // fall through to textContent
    }
  }
  return diagram.textContent ?? "";
}

function cleanupStrayNodes(id: string): void {
  try {
    document.getElementById(`d${id}`)?.remove();
    document.getElementById(id)?.remove();
    // Broad sweep for any leftovers with the same prefix
    document.querySelectorAll(`[id^='d${id}'], [id='${id}']`).forEach((el) => el.remove());
  } catch {
    // ignore
  }
}

const MAX_MERMAID_CACHE_SIZE = 50;
const mermaidSvgCache = new Map<string, string>();

export function clearMermaidCache(): void {
  mermaidSvgCache.clear();
}

export async function renderMermaid(
  container: HTMLElement,
  options: RenderMermaidOptions = {},
): Promise<void> {
  const diagrams = Array.from(
    container.querySelectorAll<HTMLElement>("pre.mermaid"),
  );
  if (diagrams.length === 0) return;

  const theme =
    options.theme ??
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default");

  ensureInitialized(theme);

  for (const diagram of diagrams) {
    // Skip already-rendered diagrams unless forced or theme changed.
    const prevTheme = diagram.getAttribute("data-mermaid-theme");
    const alreadyRendered = diagram.classList.contains("mermaid-rendered");
    if (alreadyRendered && !options.force && prevTheme === theme) continue;

    const source = readSource(diagram).trim();
    if (!source) continue;

    diagram.setAttribute("data-mermaid-theme", theme);
    diagram.classList.remove("mermaid-rendered", "mermaid-error");

    const cacheKey = `${theme}:${source}`;
    if (mermaidSvgCache.has(cacheKey)) {
      diagram.textContent = "";
      diagram.innerHTML = mermaidSvgCache.get(cacheKey)!;
      diagram.classList.add("mermaid-rendered");
      continue;
    }

    const id = `bookmd-mermaid-${Date.now()}-${(renderId += 1)}`;
    try {
      const { svg } = await mermaid.render(id, source);
      cleanupStrayNodes(id);
      mermaidSvgCache.set(cacheKey, svg);
      if (mermaidSvgCache.size > MAX_MERMAID_CACHE_SIZE) {
        const firstKey = mermaidSvgCache.keys().next().value;
        if (firstKey) mermaidSvgCache.delete(firstKey);
      }
      // Clear text content first, then inject SVG
      diagram.textContent = "";
      diagram.innerHTML = svg;
      diagram.classList.add("mermaid-rendered");
    } catch (error) {
      cleanupStrayNodes(id);
      const label = describeMermaidError(error);
      // Show graceful fallback — raw source preserved in a code block
      diagram.textContent = "";
      diagram.classList.add("mermaid-error");
      diagram.innerHTML = `<div class="mermaid-error-fallback"><div class="mermaid-error-label">⚠️ Mermaid 渲染失败：${escapeHtml(label)}</div><pre class="mermaid-error-source"><code>${escapeHtml(source)}</code></pre></div>`;
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function describeMermaidError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
