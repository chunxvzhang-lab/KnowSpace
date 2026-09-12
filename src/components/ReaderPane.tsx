import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GitFork } from "lucide-react";
import type { RenderedChapter } from "../core/types";
import { renderMermaid, type MermaidTheme } from "../services/mermaid";
import type { LightboxMedia } from "./MediaLightbox";
import type { WikiLinkTarget } from "./EditorPane";

type ReaderPaneProps = {
  chapter: RenderedChapter | null;
  containerRef: React.RefObject<HTMLElement | null>;
  fontScale: number;
  mermaidTheme: MermaidTheme;
  onMermaidError: () => void;
  onElementClick?: (targetElement: HTMLElement, selectedText: string) => void;
  showLineNumbers?: boolean;
  onOpenLightbox?: (media: LightboxMedia) => void;
  wikiLinkTargets?: WikiLinkTarget[];
  onWikiLinkClick?: (target: string) => void;
  backlinksCount?: number;
  onOpenBacklinks?: () => void;
};

export const ReaderPane = memo(function ReaderPane({
  chapter,
  containerRef,
  fontScale,
  mermaidTheme,
  onMermaidError,
  onElementClick,
  showLineNumbers = true,
  onOpenLightbox,
  wikiLinkTargets,
  onWikiLinkClick,
  backlinksCount,
  onOpenBacklinks,
}: ReaderPaneProps) {
  const articleRef = useRef<HTMLElement | null>(null);
  const [hoverPopover, setHoverPopover] = useState<{
    target: string;
    label: string;
    x: number;
    y: number;
    exists: boolean;
    path?: string;
  } | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  // Mermaid mutates the sanitized article HTML after React commits it. Keep
  // this prop stable so unrelated renders do not restore the pre-render HTML.
  const articleHtml = useMemo(() => ({ __html: chapter?.html ?? "" }), [chapter?.html]);
  const attachReader = useCallback((node: HTMLElement | null) => {
    containerRef.current = node;
  }, [containerRef]);

  const attachArticle = useCallback((node: HTMLElement | null) => {
    articleRef.current = node;
  }, []);

  const handleMouseOver = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const el = (e.target as HTMLElement).closest<HTMLAnchorElement>("a.wikilink");
      if (!el) return;
      const target = el.getAttribute("data-wikilink-target");
      const label = el.getAttribute("data-wikilink-label") || target;
      if (!target) return;

      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
      const rect = el.getBoundingClientRect();

      const baseDoc = target.split("#")[0].trim();
      const cleanTarget = baseDoc.replace(/\.(md|markdown|canvas)$/i, "").toLowerCase();
      const isAnchorOnly = !cleanTarget && target.includes("#");
      const foundTarget = isAnchorOnly
        ? undefined
        : wikiLinkTargets?.find((t) => {
            const tTitle = t.title.trim().toLowerCase();
            const tFile = (t.relativePath?.split("/").pop() ?? "").replace(/\.(md|markdown|canvas)$/i, "").toLowerCase();
            return tTitle === cleanTarget || tFile === cleanTarget;
          });
      const exists = isAnchorOnly || Boolean(foundTarget);

      hoverTimerRef.current = window.setTimeout(() => {
        setHoverPopover({
          target,
          label: label || target,
          x: Math.min(window.innerWidth - 280, Math.max(12, rect.left)),
          y: rect.bottom + 6,
          exists,
          path: foundTarget?.relativePath,
        });
      }, 240);
    },
    [wikiLinkTargets]
  );

  const handleMouseOut = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const nextEl = e.relatedTarget as HTMLElement | null;
    if (nextEl?.closest(".wikilink-preview-popover") || nextEl?.closest("a.wikilink")) {
      return;
    }
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    setHoverPopover(null);
  }, []);

  // Handle article clicks: code copy, lightbox for images and mermaid charts, wikilinks, selection sync
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // 0. Check if clicking a WikiLink or an Embedded Link
      const wikiLink = target.closest<HTMLAnchorElement>("a.wikilink, a.embed-source-link");
      if (wikiLink) {
        e.preventDefault();
        e.stopPropagation();
        const wikilinkTarget = wikiLink.getAttribute("data-wikilink-target");
        if (wikilinkTarget && onWikiLinkClick) {
          setHoverPopover(null);
          onWikiLinkClick(wikilinkTarget);
        }
        return;
      }

      // 0.5. Check if clicking a block anchor to copy block reference
      const blockAnchor = target.closest<HTMLElement>(".block-anchor");
      if (blockAnchor) {
        e.preventDefault();
        e.stopPropagation();
        const blockId = blockAnchor.getAttribute("data-block-id");
        if (blockId) {
          const refText = `[[#^${blockId}]]`;
          navigator.clipboard.writeText(refText).then(() => {
            blockAnchor.classList.add("is-copied");
            const prevTooltip = blockAnchor.getAttribute("data-tooltip");
            blockAnchor.setAttribute("data-tooltip", `✓ 已复制块引用: ${refText}`);
            const orig = blockAnchor.innerHTML;
            blockAnchor.innerHTML = `<span class="block-anchor-symbol">✓</span><span class="block-anchor-id">已复制</span>`;
            setTimeout(() => {
              blockAnchor.innerHTML = orig;
              blockAnchor.classList.remove("is-copied");
              if (prevTooltip) {
                blockAnchor.setAttribute("data-tooltip", prevTooltip);
              }
            }, 1600);
          });
        }
        return;
      }

      // 1. Check if clicking code copy button
      const copyBtn = target.closest<HTMLButtonElement>(".code-copy-btn");
      if (copyBtn) {
        e.stopPropagation();
        e.preventDefault();
        const pre = copyBtn.closest("pre");
        const codeEl = pre?.querySelector("code");
        if (codeEl) {
          const textToCopy = codeEl.textContent || "";
          navigator.clipboard.writeText(textToCopy).then(() => {
            copyBtn.classList.add("is-copied");
            copyBtn.innerHTML = "✓ 已复制";
            window.setTimeout(() => {
              copyBtn.classList.remove("is-copied");
              copyBtn.innerHTML = "📋 复制";
            }, 2000);
          });
        }
        return;
      }

      // 2. Check if clicking an image for Lightbox preview
      if (onOpenLightbox && target.tagName.toLowerCase() === "img") {
        const img = target as HTMLImageElement;
        e.stopPropagation();
        onOpenLightbox({
          type: "image",
          src: img.src,
          alt: img.alt || "图片预览",
          title: img.title || img.alt || "图片预览",
        });
        return;
      }

      // 3. Check if clicking a Mermaid chart for Lightbox preview
      if (onOpenLightbox) {
        const mermaidPre = target.closest<HTMLElement>("pre.mermaid");
        if (mermaidPre) {
          const svg = mermaidPre.querySelector("svg");
          if (svg) {
            e.stopPropagation();
            let serializedSvg = "";
            try {
              serializedSvg = new XMLSerializer().serializeToString(svg);
            } catch {
              serializedSvg = svg.outerHTML;
            }
            onOpenLightbox({
              type: "mermaid",
              svgHtml: serializedSvg,
              title: "Mermaid 架构图预览",
            });
            return;
          }
        }
      }
    },
    [onOpenLightbox, onWikiLinkClick]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!onElementClick) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Don't trigger selection jump if clicking copy button or lightbox media
      if (target.closest(".code-header-bar") || target.tagName.toLowerCase() === "img" || target.closest("pre.mermaid")) {
        return;
      }
      const selection = window.getSelection();
      const selectedText = selection ? selection.toString() : "";
      onElementClick(target, selectedText);
    },
    [onElementClick]
  );

  // Decorate code blocks with language badge and copy button
  useLayoutEffect(() => {
    const node = articleRef.current;
    if (!node) return;

    const preElements = node.querySelectorAll<HTMLPreElement>("pre.hljs, pre:not(.mermaid)");
    preElements.forEach((pre) => {
      if (pre.querySelector(".code-header-bar")) return; // Already decorated

      const rawLang = pre.getAttribute("data-language") || "";
      const trimmedLang = rawLang.trim();
      const displayLang =
        trimmedLang &&
        trimmedLang.toLowerCase() !== "text" &&
        trimmedLang.toLowerCase() !== "plaintext" &&
        trimmedLang.toLowerCase() !== "code"
          ? trimmedLang.toUpperCase()
          : "";

      const headerBar = document.createElement("div");
      headerBar.className = "code-header-bar";
      headerBar.innerHTML = `
        ${displayLang ? `<span class="code-lang-label">${displayLang}</span>` : ""}
        <button type="button" class="code-copy-btn" title="复制代码到剪贴板">📋 复制</button>
      `;

      pre.style.position = "relative";
      pre.insertBefore(headerBar, pre.firstChild);
    });
  }, [chapter?.html]);

  // Mermaid rendering pipeline
  useLayoutEffect(() => {
    const node = articleRef.current;
    if (!node?.querySelector("pre.mermaid")) return undefined;
    const renderToken = `${chapter?.checksum ?? ""}:${mermaidTheme}`;
    if (node.dataset.mermaidRenderToken === renderToken && node.dataset.mermaidRenderStatus === "scheduled") {
      return undefined;
    }
    node.dataset.mermaidRenderToken = renderToken;
    node.dataset.mermaidRenderStatus = "scheduled";
    const timerId = window.setTimeout(() => {
      if (node.dataset.mermaidRenderToken !== renderToken) return;
      node.dataset.mermaidRenderStatus = "running";
      renderMermaid(node, { theme: mermaidTheme })
        .then(() => {
          if (node.dataset.mermaidRenderToken === renderToken) node.dataset.mermaidRenderStatus = "done";
        })
        .catch(() => {
          if (node.dataset.mermaidRenderToken === renderToken) {
            node.dataset.mermaidRenderStatus = "error";
            onMermaidError();
          }
        });
    }, 0);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [chapter?.checksum, mermaidTheme, onMermaidError]);

  return (
    <main className="reader-pane" ref={attachReader} style={{ "--reader-scale": fontScale } as React.CSSProperties}>
      {chapter?.frontMatter ? <FrontMatterCard data={chapter.frontMatter} /> : null}
      <article
        className={`markdown-body ${showLineNumbers ? "show-line-numbers" : ""}`}
        ref={attachArticle}
        onClick={handleClick}
        onMouseUp={handleMouseUp}
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
        dangerouslySetInnerHTML={articleHtml}
      />
      {backlinksCount !== undefined && backlinksCount > 0 && onOpenBacklinks ? (
        <div
          className="article-backlinks-footer"
          onClick={onOpenBacklinks}
          title="在侧边栏打开反向链接面板"
        >
          <GitFork size={14} className="text-cyan" />
          <span>本文已被引用 <strong>{backlinksCount}</strong> 次</span>
          <span className="article-backlinks-action">在侧栏查看 ➔</span>
        </div>
      ) : null}
      {hoverPopover && (
        <div
          className="wikilink-preview-popover"
          style={{ left: hoverPopover.x, top: hoverPopover.y }}
          onClick={(e) => {
            e.stopPropagation();
            if (onWikiLinkClick) {
              setHoverPopover(null);
              onWikiLinkClick(hoverPopover.target);
            }
          }}
          onMouseEnter={() => {
            if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
          }}
          onMouseLeave={() => setHoverPopover(null)}
        >
          <div className="wikilink-popover-header">
            <span className="wikilink-popover-icon">🔗</span>
            <span className="wikilink-popover-title">{hoverPopover.label}</span>
          </div>
          {hoverPopover.path ? (
            <div className="wikilink-popover-path">{hoverPopover.path}</div>
          ) : null}
          <div className="wikilink-popover-status">
            {hoverPopover.exists ? (
              <span className="wikilink-status-exists">✓ 文档已存在，点击跳转阅读</span>
            ) : (
              <span className="wikilink-status-missing">⚡ 尚未创建，点击即可自动新建</span>
            )}
          </div>
        </div>
      )}
    </main>
  );
});

function FrontMatterCard({ data }: { data: Record<string, unknown> }) {
  const title = typeof data.title === "string" ? data.title : null;
  const description = typeof data.description === "string" ? data.description : null;
  const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
  return (
    <section className="frontmatter-card">
      {title ? <strong>{title}</strong> : null}
      {description ? <p>{description}</p> : null}
      {tags.length ? (
        <div>
          {tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
