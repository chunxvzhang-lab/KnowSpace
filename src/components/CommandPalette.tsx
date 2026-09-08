import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  FileText,
  Command,
  Hash,
  ArrowRight,
  Clock,
  Sparkles,
  CornerDownLeft,
  X,
  Printer,
  ListTree,
  Network,
  FolderOpen,
  Maximize2,
  FilePlus,
  Save,
  Type,
  Sun,
  Moon,
  Feather,
  Columns,
} from "lucide-react";
import type { BookManifest, Heading, ThemeMode } from "../core/types";

export interface CommandAction {
  id: string;
  title: string;
  description?: string;
  shortcut?: string;
  icon?: React.ReactNode;
  category: string;
  run: () => void;
}

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  manifest: BookManifest | null;
  currentChapterId?: string | null;
  onSelectChapter: (chapterId: string) => void;
  headings?: Heading[];
  onJumpToHeading?: (headingId: string, line?: number) => void;
  recentChapterIds?: string[];
  actions?: CommandAction[];
}

/**
 * Lightweight fuzzy matcher that checks if query characters appear sequentially
 * or if query matches substring of title/path/pinyin.
 */
function fuzzyMatch(text: string, query: string): { matched: boolean; score: number } {
  const t = text.toLowerCase();
  const q = query.toLowerCase();

  if (!q) return { matched: true, score: 0 };
  if (t === q) return { matched: true, score: 100 };
  if (t.startsWith(q)) return { matched: true, score: 80 };
  const subIdx = t.indexOf(q);
  if (subIdx !== -1) return { matched: true, score: 60 - subIdx };

  // Sequential character match
  let qIdx = 0;
  let score = 0;
  let prevMatchIdx = -2;

  for (let i = 0; i < t.length && qIdx < q.length; i++) {
    if (t[i] === q[qIdx]) {
      score += 5;
      if (i === prevMatchIdx + 1) {
        score += 10; // Bonus for consecutive match
      }
      prevMatchIdx = i;
      qIdx++;
    }
  }

  return { matched: qIdx === q.length, score };
}

export const CommandPalette = memo(function CommandPalette({
  isOpen,
  onClose,
  manifest,
  currentChapterId,
  onSelectChapter,
  headings = [],
  onJumpToHeading,
  recentChapterIds = [],
  actions = [],
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Focus management & state reset on open
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } else if (previousActiveElementRef.current) {
      try {
        previousActiveElementRef.current.focus();
      } catch {
        // ignore
      }
    }
  }, [isOpen]);

  const trimmedQuery = query.trim();
  const isActionMode = trimmedQuery.startsWith(">");
  const isHeadingMode = trimmedQuery.startsWith("#");

  const actionSearchTerm = isActionMode ? trimmedQuery.slice(1).trim() : "";
  const headingSearchTerm = isHeadingMode ? trimmedQuery.slice(1).trim() : "";
  const docSearchTerm = !isActionMode && !isHeadingMode ? trimmedQuery : "";

  // 1. Filtered Actions list (> ...)
  const filteredActions = useMemo(() => {
    if (!isActionMode) return [];
    if (!actionSearchTerm) return actions;

    return actions
      .map((action) => {
        const titleMatch = fuzzyMatch(action.title, actionSearchTerm);
        const descMatch = fuzzyMatch(action.description || "", actionSearchTerm);
        const categoryMatch = fuzzyMatch(action.category, actionSearchTerm);
        const bestScore = Math.max(titleMatch.score, descMatch.score, categoryMatch.score);
        return {
          action,
          matched: titleMatch.matched || descMatch.matched || categoryMatch.matched,
          score: bestScore,
        };
      })
      .filter((item) => item.matched)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.action);
  }, [isActionMode, actionSearchTerm, actions]);

  // 2. Filtered Headings list (# ...)
  const filteredHeadings = useMemo(() => {
    if (!isHeadingMode) return [];
    if (!headingSearchTerm) return headings;

    return headings
      .map((h) => {
        const m = fuzzyMatch(h.text, headingSearchTerm);
        return { heading: h, matched: m.matched, score: m.score };
      })
      .filter((item) => item.matched)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.heading);
  }, [isHeadingMode, headingSearchTerm, headings]);

  // 3. Filtered Chapters / Documents list
  const chapters = manifest?.chapters || [];

  const filteredDocs = useMemo(() => {
    if (isActionMode || isHeadingMode) return [];

    if (!docSearchTerm) {
      // Empty query: Show MRU recent docs first, then the rest
      const mruChapters = recentChapterIds
        .map((id) => chapters.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c));

      const mruIdSet = new Set(mruChapters.map((c) => c.id));
      const remaining = chapters.filter((c) => !mruIdSet.has(c.id));
      return [...mruChapters, ...remaining];
    }

    return chapters
      .map((ch) => {
        const titleMatch = fuzzyMatch(ch.title, docSearchTerm);
        const pathMatch = fuzzyMatch(ch.src || "", docSearchTerm);
        const isRecent = recentChapterIds.includes(ch.id);
        const score = Math.max(titleMatch.score, pathMatch.score) + (isRecent ? 15 : 0);
        return {
          chapter: ch,
          matched: titleMatch.matched || pathMatch.matched,
          score,
        };
      })
      .filter((item) => item.matched)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.chapter);
  }, [isActionMode, isHeadingMode, docSearchTerm, chapters, recentChapterIds]);

  // Unified items count for keyboard navigation
  const currentItemsCount = isActionMode
    ? filteredActions.length
    : isHeadingMode
    ? filteredHeadings.length
    : filteredDocs.length;

  // Reset or clamp selected index when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [trimmedQuery, isActionMode, isHeadingMode]);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(".command-palette-item.is-selected");
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  // Execute current selection
  const executeCurrent = (index: number) => {
    if (isActionMode) {
      const action = filteredActions[index];
      if (action) {
        onClose();
        action.run();
      }
    } else if (isHeadingMode) {
      const h = filteredHeadings[index];
      if (h && onJumpToHeading) {
        onClose();
        onJumpToHeading(h.id, h.line);
      }
    } else {
      const doc = filteredDocs[index];
      if (doc) {
        onClose();
        onSelectChapter(doc.id);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (currentItemsCount > 0) {
        setSelectedIndex((prev) => (prev + 1) % currentItemsCount);
      }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (currentItemsCount > 0) {
        setSelectedIndex((prev) => (prev - 1 + currentItemsCount) % currentItemsCount);
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (currentItemsCount > 0) {
        executeCurrent(selectedIndex);
      }
      return;
    }

    if (e.key === "Tab" && !trimmedQuery) {
      e.preventDefault();
      setQuery(">");
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="command-palette-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="全局命令面板"
    >
      <div className="command-palette-container" onKeyDown={handleKeyDown}>
        {/* Search Header */}
        <div className="command-palette-header">
          <div className="command-palette-icon">
            {isActionMode ? (
              <Command size={18} className="text-cyan" />
            ) : isHeadingMode ? (
              <Hash size={18} className="text-amber" />
            ) : (
              <Search size={18} className="text-muted" />
            )}
          </div>
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isActionMode
                ? "输入关键词搜索执行命令..."
                : isHeadingMode
                ? "输入关键词直达章节小节大纲..."
                : "搜索文档标题/路径，输入 > 执行动作，输入 # 搜索小节大纲..."
            }
          />
          {query && (
            <button
              type="button"
              className="command-palette-clear-btn"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              title="清空"
            >
              <X size={14} />
            </button>
          )}
          <div className="command-palette-tag-hints">
            <button
              type="button"
              className={`mode-badge ${isActionMode ? "active" : ""}`}
              onClick={() => {
                setQuery(">");
                inputRef.current?.focus();
              }}
            >
              &gt; 动作命令
            </button>
            <button
              type="button"
              className={`mode-badge ${isHeadingMode ? "active" : ""}`}
              onClick={() => {
                setQuery("#");
                inputRef.current?.focus();
              }}
            >
              # 章节大纲
            </button>
          </div>
        </div>

        {/* Results List */}
        <div className="command-palette-list" ref={listRef}>
          {/* Action Mode Items */}
          {isActionMode && (
            <>
              {filteredActions.length === 0 ? (
                <div className="command-palette-empty">没有匹配的动作命令</div>
              ) : (
                filteredActions.map((action, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <div
                      key={action.id}
                      className={`command-palette-item ${isSelected ? "is-selected" : ""}`}
                      onClick={() => executeCurrent(index)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div className="item-icon-wrapper">
                        {action.icon || <Command size={16} />}
                      </div>
                      <div className="item-body">
                        <div className="item-title-row">
                          <strong className="item-title">{action.title}</strong>
                          <span className="item-category-pill">{action.category}</span>
                        </div>
                        {action.description && (
                          <span className="item-subtitle">{action.description}</span>
                        )}
                      </div>
                      {action.shortcut && (
                        <div className="item-shortcut-badge">
                          <kbd>{action.shortcut}</kbd>
                        </div>
                      )}
                      <div className="item-action-icon">
                        <CornerDownLeft size={13} />
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* Heading Mode Items */}
          {isHeadingMode && (
            <>
              {filteredHeadings.length === 0 ? (
                <div className="command-palette-empty">当前文档没有匹配的大纲标题</div>
              ) : (
                filteredHeadings.map((h, index) => {
                  const isSelected = index === selectedIndex;
                  const indentLevel = Math.max(0, h.level - 1);
                  return (
                    <div
                      key={`${h.id}-${index}`}
                      className={`command-palette-item ${isSelected ? "is-selected" : ""}`}
                      onClick={() => executeCurrent(index)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div className="item-icon-wrapper text-amber">
                        <Hash size={15} />
                      </div>
                      <div className="item-body">
                        <div className="item-title-row">
                          <span
                            className="item-title"
                            style={{ paddingLeft: `${indentLevel * 12}px` }}
                          >
                            <span className="heading-level-tag">H{h.level}</span>
                            {h.text}
                          </span>
                        </div>
                        {h.line && (
                          <span className="item-subtitle">第 {h.line} 行</span>
                        )}
                      </div>
                      <div className="item-action-icon">
                        <CornerDownLeft size={13} />
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* Document / Quick Switcher Items */}
          {!isActionMode && !isHeadingMode && (
            <>
              {filteredDocs.length === 0 ? (
                <div className="command-palette-empty">未搜索到匹配的文档</div>
              ) : (
                filteredDocs.map((ch, index) => {
                  const isSelected = index === selectedIndex;
                  const isCurrent = ch.id === currentChapterId;
                  const isRecent = recentChapterIds.includes(ch.id);

                  return (
                    <div
                      key={ch.id}
                      className={`command-palette-item ${isSelected ? "is-selected" : ""}`}
                      onClick={() => executeCurrent(index)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div className="item-icon-wrapper">
                        {isRecent && !docSearchTerm ? (
                          <Clock size={16} className="text-cyan" />
                        ) : (
                          <FileText size={16} />
                        )}
                      </div>
                      <div className="item-body">
                        <div className="item-title-row">
                          <strong className="item-title">{ch.title}</strong>
                          {isCurrent && <span className="item-current-pill">当前文档</span>}
                          {isRecent && !docSearchTerm && (
                            <span className="item-recent-pill">最近访问</span>
                          )}
                        </div>
                        {ch.src && <span className="item-subtitle">{ch.src}</span>}
                      </div>
                      <div className="item-action-icon">
                        <CornerDownLeft size={13} />
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>

        {/* Footer Shortcut Legend */}
        <div className="command-palette-footer">
          <div className="footer-keys">
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> 导航
            </span>
            <span>
              <kbd>↵</kbd> 打开/执行
            </span>
            <span>
              <kbd>Esc</kbd> 关闭
            </span>
            <span>
              输入 <kbd>&gt;</kbd> 动作
            </span>
            <span>
              输入 <kbd>#</kbd> 大纲
            </span>
          </div>
          <div className="footer-count">
            {currentItemsCount} 项
          </div>
        </div>
      </div>
    </div>
  );
});
