import type { RefObject } from "react";
import { Search } from "lucide-react";

/**
 * In-canvas node search: the toggle, the field, the match counter and the
 * previous/next/close controls.
 *
 * The keyboard handling here is the part worth reading before changing
 * anything. Enter and Shift+Enter step through matches, and Escape closes the
 * search — all three are caught on the field itself rather than in the canvas
 * shortcut handler, because while the field has focus the canvas handler is
 * deliberately inert. Moving them would mean Enter creating a node behind an
 * open search box.
 */
export type MindmapSearchGroupProps = {
  isOpen: boolean;
  query: string;
  /** Ids of the matching nodes, in the order the navigation steps through them. */
  matchIds: readonly string[];
  /** Index of the focused match; the counter shows this position, 1-based. */
  currentIndex: number;
  inputRef: RefObject<HTMLInputElement | null>;
  onToggle: () => void;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
};

export function MindmapSearchGroup({
  isOpen,
  query,
  matchIds,
  currentIndex,
  inputRef,
  onToggle,
  onQueryChange,
  onClose,
  onPrev,
  onNext,
}: MindmapSearchGroupProps) {
  const hasMatches = matchIds.length > 0;

  return (
    <div className="mindmap-toolbar-btn-group mindmap-search-group">
      <button
        type="button"
        className={`mindmap-tool-btn text-btn ${isOpen ? "highlight-btn" : ""}`}
        onClick={onToggle}
        title="搜索导图节点"
      >
        <Search size={13} className="text-cyan" />
        <span>搜索</span>
      </button>

      {isOpen && (
        <div className="mindmap-search-box">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="搜索导图节点..."
            className="mindmap-search-input"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (e.shiftKey) onPrev();
                else onNext();
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
          />

          {hasMatches && (
            <span className="mindmap-search-count">
              {currentIndex + 1}/{matchIds.length}
            </span>
          )}

          <button
            type="button"
            className="mindmap-search-nav-btn"
            onClick={onPrev}
            disabled={!hasMatches}
            title="上一个 (Shift+Enter)"
          >
            ▲
          </button>
          <button
            type="button"
            className="mindmap-search-nav-btn"
            onClick={onNext}
            disabled={!hasMatches}
            title="下一个 (Enter)"
          >
            ▼
          </button>
          <button
            type="button"
            className="mindmap-search-nav-btn close-btn"
            onClick={onClose}
            title="关闭搜索 (Esc)"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
