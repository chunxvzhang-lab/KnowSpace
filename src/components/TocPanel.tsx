import { Bookmark } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Heading } from "../core/types";

type TocPanelProps = {
  headings: Heading[];
  activeHeadingId?: string;
  bookmarkedHeadingIds?: ReadonlySet<string>;
  onJump: (headingId: string) => void;
};

export function TocPanel({
  headings,
  activeHeadingId,
  bookmarkedHeadingIds,
  onJump,
}: TocPanelProps) {
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!activeHeadingId) return;
    const nav = navRef.current;
    if (!nav) return;
    const activeButton = nav.querySelector<HTMLElement>(
      `[data-heading-id="${CSS.escape(activeHeadingId)}"]`,
    );
    if (activeButton) {
      const navRect = nav.getBoundingClientRect();
      const btnRect = activeButton.getBoundingClientRect();
      if (btnRect.top < navRect.top || btnRect.bottom > navRect.bottom) {
        const offset =
          activeButton.offsetTop - nav.clientHeight / 2 + activeButton.clientHeight / 2;
        nav.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
      }
    }
  }, [activeHeadingId]);

  if (headings.length === 0) {
    return <p className="muted-panel">本章没有标题。</p>;
  }
  return (
    <nav className="toc-panel" aria-label="章节大纲" ref={navRef}>
      {headings.map((heading) => {
        const hasBookmark = bookmarkedHeadingIds?.has(heading.id);
        return (
          <button
            key={heading.id}
            data-heading-id={heading.id}
            className={`toc-link level-${heading.level}${heading.id === activeHeadingId ? " active" : ""}`}
            onClick={() => onJump(heading.id)}
          >
            <span className="toc-link-text">{heading.text}</span>
            {hasBookmark ? (
              <Bookmark className="toc-bookmark-marker" size={13} aria-label="已加书签" />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
