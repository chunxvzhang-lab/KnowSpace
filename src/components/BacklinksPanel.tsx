import React, { useMemo, useState } from "react";
import { GitFork, FileText, ArrowUpRight, Link2, Sparkles, List, Network } from "lucide-react";
import type { BacklinkRef, UnlinkedMention } from "../services/backlinkIndex";
import type { GraphData } from "../services/graphService";
import type { ThemeMode } from "../core/types";
import { LocalGraphView } from "./LocalGraphView";

type BacklinksPanelProps = {
  currentTitle: string;
  currentPath?: string;
  currentDocId?: string | null;
  linkedReferences: BacklinkRef[];
  unlinkedMentions: UnlinkedMention[];
  onJumpToSource: (sourceId: string, line?: number) => void;
  onConvertMention: (mention: UnlinkedMention) => void;
  graphData?: GraphData;
  theme?: ThemeMode;
  onOpenGlobalGraph?: () => void;
};

export function BacklinksPanel({
  currentTitle,
  currentPath,
  currentDocId,
  linkedReferences,
  unlinkedMentions,
  onJumpToSource,
  onConvertMention,
  graphData,
  theme = "twitter",
  onOpenGlobalGraph,
}: BacklinksPanelProps) {
  const [panelSubTab, setPanelSubTab] = useState<"list" | "graph">("list");
  // Group linked references by sourceId
  const linkedGroups = useMemo(() => {
    const map = new Map<string, { title: string; path?: string; items: BacklinkRef[] }>();
    for (const ref of linkedReferences) {
      const existing = map.get(ref.sourceId) || {
        title: ref.sourceTitle,
        path: ref.sourcePath,
        items: [],
      };
      existing.items.push(ref);
      map.set(ref.sourceId, existing);
    }
    return Array.from(map.entries()).map(([sourceId, data]) => ({
      sourceId,
      ...data,
    }));
  }, [linkedReferences]);

  // Group unlinked mentions by sourceId
  const unlinkedGroups = useMemo(() => {
    const map = new Map<string, { title: string; path?: string; items: UnlinkedMention[] }>();
    for (const mention of unlinkedMentions) {
      const existing = map.get(mention.sourceId) || {
        title: mention.sourceTitle,
        path: mention.sourcePath,
        items: [],
      };
      existing.items.push(mention);
      map.set(mention.sourceId, existing);
    }
    return Array.from(map.entries()).map(([sourceId, data]) => ({
      sourceId,
      ...data,
    }));
  }, [unlinkedMentions]);

  return (
    <div className="backlinks-panel">
      {/* Panel Header */}
      <div className="backlinks-header">
        <div className="backlinks-header-title">
          <GitFork size={16} className="text-cyan" />
          <span>反向链接与引用</span>
        </div>
        <div className="backlinks-header-badges">
          <span className="backlinks-count-badge" title="已链接引用总数">
            🔗 {linkedReferences.length}
          </span>
          {unlinkedMentions.length > 0 && (
            <span className="unlinked-count-badge" title="未链接提及总数">
              ⚡ {unlinkedMentions.length}
            </span>
          )}
        </div>
      </div>

      {/* Target Document Context Banner */}
      <div className="backlinks-target-card">
        <div className="backlinks-target-label">当前文档上下文</div>
        <div className="backlinks-target-title" title={currentTitle}>
          {currentTitle}
        </div>
        {currentPath && <div className="backlinks-target-path">{currentPath}</div>}
      </div>

      {/* Mode Switcher: List vs Graph */}
      <div className="backlinks-mode-switcher">
        <button
          type="button"
          className={`backlinks-mode-tab ${panelSubTab === "list" ? "is-active" : ""}`}
          onClick={() => setPanelSubTab("list")}
        >
          <List size={13} />
          <span>引用列表</span>
        </button>
        <button
          type="button"
          className={`backlinks-mode-tab ${panelSubTab === "graph" ? "is-active" : ""}`}
          onClick={() => setPanelSubTab("graph")}
        >
          <Network size={13} />
          <span>局部图谱</span>
        </button>
      </div>

      {panelSubTab === "graph" && graphData && currentDocId ? (
        <LocalGraphView
          graphData={graphData}
          currentDocId={currentDocId}
          theme={theme}
          onSelectNode={(docId) => onJumpToSource(docId)}
          onOpenGlobalGraph={onOpenGlobalGraph}
        />
      ) : (
        <div className="backlinks-content-scroll">
        {/* Section 1: Linked References */}
        <section className="backlinks-section">
          <div className="backlinks-section-title">
            <span>已链接引用</span>
            <span className="section-count">({linkedReferences.length})</span>
          </div>

          {linkedReferences.length === 0 ? (
            <div className="backlinks-empty-state">
              <Link2 size={24} className="backlinks-empty-icon text-muted" />
              <p className="backlinks-empty-title">暂无反向引用</p>
              <p className="backlinks-empty-desc">
                当知识库中其他文档通过 <code>[[{currentTitle}]]</code> 引用本文时，将在此自动汇聚上下文。
              </p>
            </div>
          ) : (
            <div className="backlinks-group-list">
              {linkedGroups.map((group) => (
                <div key={group.sourceId} className="backlinks-group-card">
                  <div
                    className="backlinks-group-header"
                    onClick={() => onJumpToSource(group.sourceId)}
                    title={`跳转到文档：${group.title}`}
                  >
                    <FileText size={14} className="group-icon text-muted" />
                    <span className="group-title">{group.title}</span>
                    <span className="group-badge">{group.items.length}</span>
                    <ArrowUpRight size={13} className="group-arrow" />
                  </div>
                  <div className="backlinks-items-list">
                    {group.items.map((item, idx) => (
                      <div
                        key={`${item.sourceId}-${item.line}-${idx}`}
                        className="backlink-item"
                        onClick={() => onJumpToSource(item.sourceId, item.line)}
                        title={`点击跳转至第 ${item.line} 行`}
                      >
                        <span className="item-line">L{item.line}</span>
                        <div className="item-snippet">
                          {renderSnippetWithWikiLinkHighlight(item.snippet, item.target)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 2: Unlinked Mentions */}
        <section className="backlinks-section unlinked-section">
          <div className="backlinks-section-title">
            <span>未链接提及</span>
            <span className="section-count">({unlinkedMentions.length})</span>
          </div>

          {unlinkedMentions.length === 0 ? (
            <div className="backlinks-empty-state unlinked-empty">
              <Sparkles size={20} className="backlinks-empty-icon text-muted" />
              <p className="backlinks-empty-title">暂无未链接提及</p>
              <p className="backlinks-empty-desc">
                未在其他文档中发现提及「{currentTitle}」但尚未加双链的文本。
              </p>
            </div>
          ) : (
            <div className="backlinks-group-list">
              {unlinkedGroups.map((group) => (
                <div key={group.sourceId} className="backlinks-group-card unlinked-card">
                  <div
                    className="backlinks-group-header"
                    onClick={() => onJumpToSource(group.sourceId)}
                    title={`跳转到文档：${group.title}`}
                  >
                    <FileText size={14} className="group-icon text-muted" />
                    <span className="group-title">{group.title}</span>
                    <span className="group-badge unlinked-badge">{group.items.length}</span>
                    <ArrowUpRight size={13} className="group-arrow" />
                  </div>
                  <div className="backlinks-items-list">
                    {group.items.map((item, idx) => (
                      <div
                        key={`${item.sourceId}-${item.line}-${idx}`}
                        className="backlink-item unlinked-item"
                      >
                        <div
                          className="item-left-clickable"
                          onClick={() => onJumpToSource(item.sourceId, item.line)}
                          title={`点击跳转至第 ${item.line} 行`}
                        >
                          <span className="item-line">L{item.line}</span>
                          <div className="item-snippet">
                            {renderSnippetWithKeywordHighlight(item.snippet, item.mentionText)}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="mention-convert-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onConvertMention(item);
                          }}
                          title={`将此处的「${item.mentionText}」一键升级为 [[${item.mentionText}]] 双链`}
                        >
                          <span>+ 设为双链</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      )}
    </div>
  );
}

/**
 * Highlights [[target...]] in snippet with a subtle link pill.
 */
function renderSnippetWithWikiLinkHighlight(snippet: string, _target: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIndex = 0;

  while ((match = regex.exec(snippet)) !== null) {
    if (match.index > lastIndex) {
      parts.push(snippet.slice(lastIndex, match.index));
    }
    const label = match[2]?.trim() || match[1]?.trim();
    parts.push(
      <span key={`hl-${keyIndex++}`} className="backlink-snippet-pill">
        [[{label}]]
      </span>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < snippet.length) {
    parts.push(snippet.slice(lastIndex));
  }

  return parts;
}

/**
 * Highlights a raw keyword mention in snippet with a subtle highlight.
 */
function renderSnippetWithKeywordHighlight(snippet: string, keyword: string): React.ReactNode {
  if (!keyword) return snippet;
  const parts: React.ReactNode[] = [];
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIndex = 0;

  while ((match = regex.exec(snippet)) !== null) {
    if (match.index > lastIndex) {
      parts.push(snippet.slice(lastIndex, match.index));
    }
    parts.push(
      <mark key={`kw-${keyIndex++}`} className="unlinked-mention-highlight">
        {match[1]}
      </mark>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < snippet.length) {
    parts.push(snippet.slice(lastIndex));
  }

  return parts;
}
