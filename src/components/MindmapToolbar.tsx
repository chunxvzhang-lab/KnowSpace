import { useEffect, useRef, useState } from "react";
import {
  CheckSquare,
  CornerDownRight,
  FoldVertical,
  ListTree,
  MoreHorizontal,
  Network,
  Palette,
  PlusCircle,
  RefreshCw,
  UnfoldVertical,
} from "lucide-react";
import { MindmapExportMenu } from "./MindmapExportMenu";
import { MindmapSearchGroup, type MindmapSearchGroupProps } from "./MindmapSearchGroup";
import { MindmapZoomGroup } from "./MindmapZoomGroup";
import { MINDMAP_THEME_LIST } from "../core/mindmapThemes";
import { MINDMAP_LAYOUT_LIST } from "../services/mindmapLayout";

/**
 * The floating control bar above the canvas.
 *
 * Split out of MindmapView because this is where the map's view-level choices
 * live — theme, layout, zoom, export — and adding the layout picker to a file
 * already past two thousand lines is how such a file stops being readable. The
 * markup and class names are unchanged by the move, so the CSS and the tests
 * that look for them keep working.
 *
 * Holds only what belongs to the bar itself: which dropdown is open. Everything
 * the bar acts on — the tree, the selection, the transform — comes from the
 * caller, which is the only place those agree.
 */
export type MindmapToolbarProps = {
  title: string;
  nodeCount: number;
  selectedCount: number;
  /** Write access to the document. Without it the editing buttons are not offered. */
  editable: boolean;
  /**
   * Whether the map can be written back at all: editing is on and the caller
   * supplied somewhere to write to. Separate from `editable`, because a caller
   * with no write channel can still allow editing the tree on screen.
   */
  canSyncToDocument: boolean;
  hasUnsyncedChanges: boolean;
  isUltraNarrow: boolean;
  /** The canvas scale, for the readout in the zoom group. */
  scale: number;
  themeId: string;
  layoutId: string;
  /** Passed through to the search group, which owns none of its own state. */
  search: MindmapSearchGroupProps;
  onSyncToDocument: () => void;
  onAddSibling: () => void;
  onAddChild: () => void;
  /**
   * Opens the style panel. The bar hands over the rect of the button that was
   * pressed and lets the view work out where that lands on the canvas, because
   * only the view knows what its own coordinate space is.
   */
  onStylePanelRequest: (anchor: DOMRect) => void;
  onSelectAll: () => void;
  onCollapseToLevel2: () => void;
  onExpandAll: () => void;
  onPickTheme: (themeId: string) => void;
  onPickLayout: (layoutId: string) => void;
  onZoomStep: (factor: number) => void;
  onFitToScreen: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onExportOpml: () => void;
  onExportFreeMind: () => void;
  onExportMarkdownOutline: () => void;
};

export function MindmapToolbar({
  title,
  nodeCount,
  selectedCount,
  editable,
  canSyncToDocument,
  hasUnsyncedChanges,
  isUltraNarrow,
  scale,
  themeId,
  layoutId,
  search,
  onSyncToDocument,
  onAddSibling,
  onAddChild,
  onStylePanelRequest,
  onSelectAll,
  onCollapseToLevel2,
  onExpandAll,
  onPickTheme,
  onPickLayout,
  onZoomStep,
  onFitToScreen,
  onExportPng,
  onExportSvg,
  onExportOpml,
  onExportFreeMind,
  onExportMarkdownOutline,
}: MindmapToolbarProps) {
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isExportMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [isExportMenuOpen]);

  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [isMoreMenuOpen]);

  const isBatchMode = selectedCount > 1;
  const styleLabel = isBatchMode ? `批量样式 (${selectedCount})` : "外观样式";

  return (
    /* Top Floating Clean & Spacious Control Bar */
    <header className="mindmap-toolbar">
      <div className="mindmap-toolbar-left">
        <div className="mindmap-toolbar-title" title={title}>
          <ListTree size={16} className="text-cyan" />
          <strong>{title || "思维导图"}</strong>
        </div>
        <span className="mindmap-node-count-badge">{nodeCount} 节点</span>
        {selectedCount > 1 && (
          <span className="mindmap-node-count-badge text-cyan">已选 {selectedCount} 项</span>
        )}
      </div>

      <div className="mindmap-toolbar-center">
        {canSyncToDocument && (
          <>
            <div className="mindmap-toolbar-btn-group">
              <button
                type="button"
                className={`mindmap-tool-btn text-btn mindmap-sync-doc-btn ${hasUnsyncedChanges ? "is-dirty" : ""}`}
                onClick={onSyncToDocument}
                title={
                  hasUnsyncedChanges
                    ? "检测到导图架构修改，点击将章节变更无损同步至文档 (Ctrl+S)"
                    : "导图架构与文档内容保持一致"
                }
              >
                <RefreshCw size={13} className={hasUnsyncedChanges ? "sync-icon-spin" : "text-muted"} />
                <span>{hasUnsyncedChanges ? "同步到文档" : "已同步"}</span>
                {hasUnsyncedChanges && <span className="sync-dirty-dot" />}
              </button>
            </div>

            <div className="mindmap-toolbar-divider" />
          </>
        )}

        {editable && (
          <>
            <div className="mindmap-toolbar-btn-group">
              <button
                type="button"
                className="mindmap-tool-btn text-btn highlight-btn"
                onClick={onAddSibling}
                title="添加同级主题 (Enter)"
              >
                <PlusCircle size={14} />
                <span>同级主题</span>
              </button>
              <button
                type="button"
                className="mindmap-tool-btn text-btn highlight-btn"
                onClick={onAddChild}
                title="添加子主题 (Tab)"
              >
                <CornerDownRight size={14} />
                <span>子主题</span>
              </button>
            </div>

            <div className="mindmap-toolbar-divider" />
          </>
        )}

        {!isUltraNarrow ? (
          <>
            {editable && (
              <>
                <div className="mindmap-toolbar-btn-group">
                  <button
                    type="button"
                    className="mindmap-tool-btn text-btn secondary-action"
                    onClick={(e) => onStylePanelRequest(e.currentTarget.getBoundingClientRect())}
                    title="自定义节点背景、边框、形状、字体及连线风格 (也可在节点上右键)"
                  >
                    <Palette size={14} className="text-cyan" />
                    <span>{styleLabel}</span>
                  </button>
                </div>

                <div className="mindmap-toolbar-divider" />
              </>
            )}

            <div className="mindmap-toolbar-btn-group">
              <button
                type="button"
                className="mindmap-tool-btn text-btn secondary-action"
                onClick={onSelectAll}
                title="选中所有节点 (Ctrl+A)"
              >
                <CheckSquare size={13} />
                <span>全选</span>
              </button>
              <button
                type="button"
                className="mindmap-tool-btn text-btn secondary-action"
                onClick={onCollapseToLevel2}
                title="仅保留 1~2 级主题"
              >
                <FoldVertical size={13} />
                <span>折叠至2级</span>
              </button>
              <button
                type="button"
                className="mindmap-tool-btn text-btn secondary-action"
                onClick={onExpandAll}
                title="展开所有分支"
              >
                <UnfoldVertical size={13} />
                <span>全部展开</span>
              </button>
            </div>

            <div className="mindmap-toolbar-divider" />
          </>
        ) : (
          <>
            {/* Ultra-narrow folded More Actions dropdown menu */}
            <div className="mindmap-toolbar-btn-group">
              <div className="mindmap-more-dropdown" ref={moreMenuRef}>
                <button
                  type="button"
                  className={`mindmap-tool-btn text-btn ${isMoreMenuOpen ? "highlight-btn active" : ""}`}
                  onClick={() => setIsMoreMenuOpen((prev) => !prev)}
                  title="更多导图样式与视图选项"
                  aria-haspopup="true"
                  aria-expanded={isMoreMenuOpen}
                >
                  <MoreHorizontal size={14} />
                </button>
                {isMoreMenuOpen && (
                  <div className="mindmap-more-menu" role="menu">
                    {editable && (
                      <button
                        type="button"
                        className="mindmap-more-menu-item"
                        role="menuitem"
                        onClick={(e) => {
                          setIsMoreMenuOpen(false);
                          onStylePanelRequest(e.currentTarget.getBoundingClientRect());
                        }}
                      >
                        <Palette size={13} className="text-cyan" />
                        <span>{styleLabel}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="mindmap-more-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setIsMoreMenuOpen(false);
                        onSelectAll();
                      }}
                    >
                      <CheckSquare size={13} />
                      <span>全选所有节点 (Ctrl+A)</span>
                    </button>
                    <button
                      type="button"
                      className="mindmap-more-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setIsMoreMenuOpen(false);
                        onCollapseToLevel2();
                      }}
                    >
                      <FoldVertical size={13} />
                      <span>折叠至 2 级</span>
                    </button>
                    <button
                      type="button"
                      className="mindmap-more-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setIsMoreMenuOpen(false);
                        onExpandAll();
                      }}
                    >
                      <UnfoldVertical size={13} />
                      <span>全部展开所有分支</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="mindmap-toolbar-divider" />
          </>
        )}

        {/* In-Canvas Search Toolbar Group */}
        <MindmapSearchGroup {...search} />

        {/* Theme and layout pickers. Native selects rather than hand-rolled
            dropdowns: there are a handful of options, none of them needs a
            preview, and a select arrives with the keyboard handling and
            accessibility a custom menu would have to reimplement. Both
            repaint or reposition only what nobody has pinned by hand or
            reordered, so neither needs a confirmation. */}
        <div className="mindmap-toolbar-btn-group mindmap-theme-group">
          <Palette size={14} className="text-cyan" />
          <select
            className="mindmap-theme-select"
            value={themeId}
            onChange={(e) => onPickTheme(e.target.value)}
            title="切换主题（不会改变手工设置过样式的节点）"
            aria-label="导图主题"
          >
            {MINDMAP_THEME_LIST.map((option) => (
              <option key={option.id} value={option.id} title={option.description}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mindmap-toolbar-btn-group mindmap-layout-group">
          <Network size={14} className="text-cyan" />
          <select
            className="mindmap-layout-select"
            value={layoutId}
            onChange={(e) => onPickLayout(e.target.value)}
            title="切换布局（只改变节点位置，不改动文档与节点样式）"
            aria-label="导图布局"
          >
            {MINDMAP_LAYOUT_LIST.map((option) => (
              <option key={option.id} value={option.id} title={option.description}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <MindmapZoomGroup scale={scale} onStep={onZoomStep} onFitToScreen={onFitToScreen} />
      </div>

      <MindmapExportMenu
        menuRef={exportMenuRef}
        isOpen={isExportMenuOpen}
        onToggle={() => setIsExportMenuOpen((prev) => !prev)}
        onExportPng={() => {
          setIsExportMenuOpen(false);
          onExportPng();
        }}
        onExportSvg={() => {
          setIsExportMenuOpen(false);
          onExportSvg();
        }}
        onExportOpml={() => {
          setIsExportMenuOpen(false);
          onExportOpml();
        }}
        onExportFreeMind={() => {
          setIsExportMenuOpen(false);
          onExportFreeMind();
        }}
        onExportMarkdownOutline={() => {
          setIsExportMenuOpen(false);
          onExportMarkdownOutline();
        }}
      />
    </header>
  );
}
