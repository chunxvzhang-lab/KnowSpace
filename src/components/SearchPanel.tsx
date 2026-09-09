import { useState, useRef, useMemo } from "react";
import { Search, X, Hash, Tag, Link2, Quote, MinusCircle, FileText, Globe, BookOpen } from "lucide-react";
import type { SearchResult } from "../core/types";
import { parseSearchQuery } from "../services/searchIndexService";

export type SearchScope = "current" | "vault";

export type SearchPanelProps = {
  query: string;
  results: SearchResult[];
  activeResultId?: string | null;
  onQueryChange: (query: string) => void;
  onJump: (result: SearchResult) => void;
  scope?: SearchScope;
  onScopeChange?: (scope: SearchScope) => void;
  vaultDocCount?: number;
};

/**
 * Intelligent highlighter that recognizes structured queries (tags, links, phrases, words)
 * and highlights all matched components within the excerpt text.
 */
function renderHighlightedText(text: string, rawQuery: string) {
  if (!rawQuery || !rawQuery.trim()) return text;
  const parsed = parseSearchQuery(rawQuery);

  const candidates = new Set<string>();
  parsed.phrases.forEach((p) => candidates.add(p.toLowerCase()));
  parsed.tags.forEach((t) => {
    candidates.add(`#${t.toLowerCase()}`);
    candidates.add(t.toLowerCase());
  });
  parsed.links.forEach((l) => {
    candidates.add(`[[${l.toLowerCase()}]]`);
    candidates.add(l.toLowerCase());
  });
  parsed.includeTerms.forEach((t) => candidates.add(t.toLowerCase()));

  if (candidates.size === 0) {
    const q = rawQuery.trim().toLowerCase();
    if (q) candidates.add(q);
  }

  // Sort candidate terms by length descending to match longest matches first
  const terms = Array.from(candidates).filter(Boolean).sort((a, b) => b.length - a.length);
  if (terms.length === 0) return text;

  // Build combined regex
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");

  const parts = text.split(regex);
  return parts.map((part, idx) => {
    if (terms.some((t) => t.toLowerCase() === part.toLowerCase())) {
      return (
        <mark key={`m-${idx}`} className="search-excerpt-match">
          {part}
        </mark>
      );
    }
    return part;
  });
}

export function SearchPanel({
  query,
  results,
  activeResultId,
  onQueryChange,
  onJump,
  scope = "current",
  onScopeChange,
  vaultDocCount,
}: SearchPanelProps) {
  const [internalScope, setInternalScope] = useState<SearchScope>(scope);
  const activeScope = onScopeChange ? scope : internalScope;
  const inputRef = useRef<HTMLInputElement>(null);

  const handleScopeSelect = (newScope: SearchScope) => {
    if (onScopeChange) {
      onScopeChange(newScope);
    } else {
      setInternalScope(newScope);
    }
  };

  const handleQuickInsert = (snippet: string) => {
    const nextQuery = query ? `${query.trim()} ${snippet}` : snippet;
    onQueryChange(nextQuery);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const uniqueDocsCount = useMemo(() => {
    const set = new Set<string>();
    results.forEach((r) => {
      if (r.chapterId) set.add(r.chapterId);
      else if (r.chapterTitle) set.add(r.chapterTitle);
    });
    return set.size;
  }, [results]);

  return (
    <div className="search-panel">
      {/* Search Scope Switcher (Current Chapter vs Vault Knowledge Base) */}
      <div className="search-scope-bar" role="tablist" aria-label="搜索范围切换">
        <button
          type="button"
          role="tab"
          aria-selected={activeScope === "current"}
          className={`search-scope-tab ${activeScope === "current" ? "active" : ""}`}
          onClick={() => handleScopeSelect("current")}
        >
          <BookOpen size={12} />
          <span>当前章节</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeScope === "vault"}
          className={`search-scope-tab ${activeScope === "vault" ? "active" : ""}`}
          onClick={() => handleScopeSelect("vault")}
        >
          <Globe size={12} />
          <span>全库检索</span>
          {vaultDocCount ? <span className="search-scope-count">{vaultDocCount}</span> : null}
        </button>
      </div>

      {/* Main Search Input */}
      <label className="search-box">
        <Search size={15} className="search-box-icon" />
        <input
          ref={inputRef}
          aria-label={activeScope === "vault" ? "搜索全库文档内容" : "搜索当前章节内容"}
          data-search-input
          placeholder={
            activeScope === "vault"
              ? "全库混合检索 (支持 tag:#, link:[[, \"短语\")..."
              : "搜索章节关键字 (支持 tag:#, link:[[)..."
          }
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
        />
        {query ? (
          <button
            type="button"
            className="search-clear-btn"
            onClick={() => onQueryChange("")}
            title="清空搜索"
            aria-label="清空"
          >
            <X size={13} />
          </button>
        ) : null}
      </label>

      {/* Structured Syntax Fast Insert Chips */}
      <div className="search-syntax-chips" aria-label="结构化语法快捷辅助">
        <button
          type="button"
          className="search-syntax-chip"
          title="筛选指定标签，如 tag:#架构"
          onClick={() => handleQuickInsert("tag:#")}
        >
          <Tag size={10} />
          <span>tag:#</span>
        </button>
        <button
          type="button"
          className="search-syntax-chip"
          title="筛选引用指定双链文档，如 link:[[分布式协议]]"
          onClick={() => handleQuickInsert("link:[[")}
        >
          <Link2 size={10} />
          <span>link:[[</span>
        </button>
        <button
          type="button"
          className="search-syntax-chip"
          title="执行严格连续短语检索，如 &quot;raft consensus&quot;"
          onClick={() => handleQuickInsert('""')}
        >
          <Quote size={10} />
          <span>"短语"</span>
        </button>
        <button
          type="button"
          className="search-syntax-chip"
          title="排除包含指定词语的内容，如 -旧版"
          onClick={() => handleQuickInsert("-")}
        >
          <MinusCircle size={10} />
          <span>-排除</span>
        </button>
      </div>

      {/* Match Statistics Badge */}
      {query.trim() && results.length > 0 ? (
        <div className="search-count-badge">
          <span>
            共找到 <strong>{results.length}</strong> 处匹配
            {results.length > 100 ? "（已展示前 100 条最相关结果）" : ""}
            {activeScope === "vault" && uniqueDocsCount > 0 ? ` · 涉及 ${uniqueDocsCount} 篇文档` : ""}
          </span>
        </div>
      ) : null}

      {/* Results List */}
      <div className="search-results">
        {query.trim() && results.length === 0 ? (
          <div className="muted-panel search-empty-state">
            <p>没有找到匹配内容</p>
            <span style={{ fontSize: 11, opacity: 0.7 }}>
              可尝试切换「全库检索」或调整标签/关键字语法
            </span>
          </div>
        ) : null}

        {results.slice(0, 100).map((result, idx) => {
          const resultId = result.id ?? `res-${idx}-${result.index}`;
          const isActive = activeResultId === resultId;

          return (
            <button
              type="button"
              className={`search-result ${isActive ? "active" : ""}`}
              key={resultId}
              onClick={() => onJump(result)}
            >
              <div className="search-result-header">
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden" }}>
                  {activeScope === "vault" && result.chapterTitle && (
                    <span className="search-chapter-badge" title={`所属章节: ${result.chapterTitle}`}>
                      <FileText size={10} style={{ flexShrink: 0 }} />
                      <span className="search-chapter-badge-text">{result.chapterTitle}</span>
                    </span>
                  )}
                  <strong>{result.title}</strong>
                </div>

                <div className="search-result-meta-row">
                  {result.matchCountInBlock && result.matchCountInBlock > 1 ? (
                    <span className="search-block-count-tag" title={`该文段中包含 ${result.matchCountInBlock} 处匹配`}>
                      {result.matchCountInBlock} 处匹配
                    </span>
                  ) : null}
                  {result.lineNumber ? (
                    <span className="search-line-tag">
                      <Hash size={10} style={{ marginRight: 2 }} />
                      L{result.lineNumber}
                      {result.lineEndNumber && result.lineEndNumber > result.lineNumber
                        ? `-${result.lineEndNumber}`
                        : ""}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Tags & Links indicators on card */}
              {((result.tags && result.tags.length > 0) || (result.links && result.links.length > 0)) && (
                <div className="search-result-badges-row">
                  {result.tags?.slice(0, 3).map((t) => (
                    <span key={t} className="search-card-pill tag-pill">
                      #{t}
                    </span>
                  ))}
                  {result.links?.slice(0, 2).map((l) => (
                    <span key={l} className="search-card-pill link-pill">
                      [[{l}]]
                    </span>
                  ))}
                </div>
              )}

              <span className="search-result-excerpt">
                {renderHighlightedText(result.excerpt, query)}
              </span>
            </button>
          );
        })}

        {results.length > 100 && (
          <div className="muted-panel" style={{ textAlign: "center", padding: "10px 12px", fontSize: 11, opacity: 0.75 }}>
            仅展示前 100 条最相关结果。如需精确定位，请补充关键词或使用标签、双链语法。
          </div>
        )}
      </div>
    </div>
  );
}
