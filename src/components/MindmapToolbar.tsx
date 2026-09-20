import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CheckSquare,
  CornerDownRight,
  FoldVertical,
  ListTree,
  MoreHorizontal,
  Network,
  ListOrdered,
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
  /** Whether outline numbers are drawn beside the nodes. */
  numbering: boolean;
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
  onToggleNumbering: () => void;
  onZoomStep: (factor: number) => void;
  onFitToScreen: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onPrintPdf: () => void;
  /**
   * The map as an `.xmind` file: the one export this app can also read.
   *
   * Offered alongside the other outline formats because that is what it is, ahead
   * of them because it is the only one that carries what the map knows beyond its
   * tree — the notes, the lines, the brackets.
   */
  onExportXmind: () => void;
  onExportOpml: () => void;
  onExportFreeMind: () => void;
  onExportMarkdownOutline: () => void;
};

/**
 * How the bar arranges itself.
 *
 * `twoRow` is the structural choice: everything on one row, or the settings row
 * (search, theme, layout, numbering) dropped below the structural controls with
 * zoom and export at its right end. `density` is what gives way first — the
 * labels of the secondary actions, then of the primary ones — because a tooltip
 * survives a lost label and a control that spilled outside the bar does not.
 */
type ToolbarVariant = {
  twoRow: boolean;
  density: "full" | "secondary" | "compact";
};

/**
 * The order the arrangements are tried in, and the order is the whole policy:
 * one row with every label, one row without the secondary labels, two rows with
 * every label, two rows without the secondary labels, and only then the
 * arrangements that also drop the primary labels. So a label is worth more than
 * a row — but the primary labels are worth more than the last of the rows: the
 * bar only goes all-icon once there is no row arrangement left that keeps them.
 */
const TOOLBAR_VARIANTS: ToolbarVariant[] = [
  { twoRow: false, density: "full" },
  { twoRow: false, density: "secondary" },
  { twoRow: true, density: "full" },
  { twoRow: true, density: "secondary" },
  { twoRow: false, density: "compact" },
  { twoRow: true, density: "compact" },
];

/** The four grid items, in the order the bar places them. */
type ToolbarBlocks = {
  left: HTMLElement | null;
  center: HTMLElement | null;
  settings: HTMLElement | null;
  view: HTMLElement | null;
};

/**
 * What one candidate arrangement needs, in pixels, measured rather than guessed.
 *
 * A fixed breakpoint cannot answer this, because what the bar holds changes
 * while the window does not: opening the search field adds a couple of hundred
 * pixels, a second selected node adds a badge, a longer document title widens
 * the first column, and the theme and layout pickers are only as wide as their
 * longest option. So the bar is laid out at its natural width — absolutely
 * positioned, `width: max-content` — with the candidate's classes on, and each
 * block reports the width it actually wants. Nothing is squeezed, so nothing
 * lies.
 *
 * The previous candidate's classes are taken off first: measuring with them
 * still on would measure the union of two arrangements, and the loop below
 * would pick a row mode the labels of another density had already paid for.
 * The caller restores the bar's own class list once, after the loop. All of it
 * happens in one task, between a layout read and the next paint, so the
 * temporary arrangement is never on screen.
 */
function measureRequirement(
  toolbar: HTMLElement,
  blocks: ToolbarBlocks,
  variant: ToolbarVariant
): number {
  const style = getComputedStyle(toolbar);
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const gap = parseFloat(style.columnGap) || 0;

  toolbar.classList.remove("is-two-row", "is-density-secondary", "is-density-compact");
  toolbar.classList.add("is-measuring");
  if (variant.twoRow) toolbar.classList.add("is-two-row");
  if (variant.density === "secondary") toolbar.classList.add("is-density-secondary");
  if (variant.density === "compact") toolbar.classList.add("is-density-compact");

  const widthOf = (el: HTMLElement | null) => {
    if (!el) return 0;
    // The outer width, margins included: the narrow modes give the controls
    // column a few pixels of side margin, and a box that fits its track without
    // them still wraps inside it with them.
    const box = getComputedStyle(el);
    return (
      el.getBoundingClientRect().width +
      (parseFloat(box.marginLeft) || 0) +
      (parseFloat(box.marginRight) || 0)
    );
  };
  const left = widthOf(blocks.left);
  const center = widthOf(blocks.center);
  const settings = widthOf(blocks.settings);
  const view = widthOf(blocks.view);

  // One row is four tracks: title, controls, settings, zoom and export. Two rows
  // is three: the controls and the settings share the middle track, which
  // therefore has to hold the wider of the two, and zoom and export move to the
  // right end of the settings row — which is what keeps that row from ending in
  // a hole the width of the window.
  return variant.twoRow
    ? left + view + Math.max(center, settings) + padding + gap * 2
    : left + center + settings + view + padding + gap * 3;
}

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
  numbering,
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
  onToggleNumbering,
  onZoomStep,
  onFitToScreen,
  onExportPng,
  onExportSvg,
  onPrintPdf,
  onExportXmind,
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

  const toolbarRef = useRef<HTMLElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const centerRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<HTMLDivElement | null>(null);
  const [variant, setVariant] = useState<ToolbarVariant>({
    twoRow: false,
    density: "full",
  });
  /** The width of the map area, which is not the width of the window. */
  const [areaWidth, setAreaWidth] = useState(0);
  /**
   * Everything the measurement depends on, as one string.
   *
   * Measuring costs a handful of forced layouts, and the bar re-renders on every
   * pan and zoom step. So the measurement is skipped unless one of these
   * changed — which is also the list of what can change what the bar needs.
   */
  const signatureRef = useRef("");
  /** Bumped once the webfonts land, because they change every width. */
  const [fontEpoch, setFontEpoch] = useState(0);

  /**
   * Choose the arrangement, by measuring what the bar currently holds.
   *
   * Runs before paint on every render that changed something the widths depend
   * on, so the bar is never seen in an arrangement it has outgrown. The first
   * candidate that fits wins; if none does — a window narrower than the bar's
   * floor — the last one stands and the CSS lets the rows wrap rather than
   * spill, which is the one failure that stays readable.
   */
  const applyLayout = () => {
    const toolbar = toolbarRef.current;
    const area = toolbar?.parentElement;
    if (!toolbar || !area || area.clientWidth <= 0) return;

    const signature = [
      area.className,
      areaWidth,
      title,
      nodeCount,
      selectedCount,
      editable,
      canSyncToDocument,
      hasUnsyncedChanges,
      numbering,
      themeId,
      layoutId,
      Math.round(scale * 100),
      search.isOpen,
      search.matchIds.length,
      fontEpoch,
    ].join("|");
    if (signature === signatureRef.current) return;
    signatureRef.current = signature;

    const ownClass = toolbar.className;
    try {
      // The space the grid actually has is the bar's own content box — it
      // already accounts for the offsets, the `max-width` cap and the border,
      // none of which are worth rederiving here. Read before the measuring
      // class goes on, which is the one thing that changes the bar's width.
      const available = toolbar.clientWidth - 4;
      let chosen = TOOLBAR_VARIANTS[TOOLBAR_VARIANTS.length - 1];
      for (const candidate of TOOLBAR_VARIANTS) {
        if (
          measureRequirement(
            toolbar,
            {
              left: leftRef.current,
              center: centerRef.current,
              settings: settingsRef.current,
              view: viewRef.current,
            },
            candidate
          ) <= available
        ) {
          chosen = candidate;
          break;
        }
      }
      if (chosen.twoRow !== variant.twoRow || chosen.density !== variant.density) {
        setVariant(chosen);
      }
    } finally {
      toolbar.className = ownClass;
    }
  };

  useLayoutEffect(() => {
    applyLayout();
  });

  // The map area's width is what decides everything, and it changes without the
  // window changing: opening the folder or the outline panel takes a third of
  // it away.
  useEffect(() => {
    const area = toolbarRef.current?.parentElement;
    if (!area || typeof ResizeObserver === "undefined") return;
    setAreaWidth(area.clientWidth);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setAreaWidth(entry.contentRect.width);
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) setFontEpoch((epoch) => epoch + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    /* Top Floating Clean & Spacious Control Bar */
    <header
      ref={toolbarRef}
      className={`mindmap-toolbar ${variant.twoRow ? "is-two-row" : ""} ${
        variant.density === "full" ? "" : `is-density-${variant.density}`
      }`}
    >
      <div className="mindmap-toolbar-left" ref={leftRef}>
        <div className="mindmap-toolbar-title" title={title}>
          <ListTree size={16} className="text-cyan" />
          <strong>{title || "思维导图"}</strong>
        </div>
        <span className="mindmap-node-count-badge">{nodeCount} 节点</span>
        {selectedCount > 1 && (
          <span className="mindmap-node-count-badge text-cyan">已选 {selectedCount} 项</span>
        )}
      </div>

      <div className="mindmap-toolbar-center" ref={centerRef}>
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

      </div>

      {/* The settings row: search, theme, layout, numbering.
          It is its own grid item rather than the tail of the row above, because where it
          lands is the whole point. When the bar cannot hold one line, this row starts at
          the left edge of the *controls* — the column the structural buttons begin in —
          and is free to run to the right edge. Both matter: lining up with the first
          button of the row above is what makes two rows read as one column, and spanning
          the full width is what lets the row hold everything without a third line.
          Previously these sat in the same wrapping box as the controls above, so the
          browser broke the line wherever it ran out — and since that box's flex basis was
          its max-content width, it claimed the whole row first, which is why the zoom and
          export cluster was what got pushed down, alone and right-aligned, over a hole. */}
      <div className="mindmap-toolbar-settings" ref={settingsRef}>
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

        {/* Outline numbering: a toggle rather than a picker, because the useful
            states are two. It sits with the view controls, not with the export
            ones — it changes how the map is drawn and nothing else. */}
        <button
          type="button"
          className={`mindmap-tool-btn text-btn highlight-btn ${numbering ? "active" : ""}`}
          onClick={onToggleNumbering}
          title="显示/隐藏分支编号（只影响显示，不改动文档）"
          aria-pressed={numbering}
        >
          <ListOrdered size={14} />
          <span>编号</span>
        </button>

      </div>

      {/* What the reader is looking at, and what they take away from it: zoom and export,
          one group, always the right end of the first row. They take no part in the
          reflow above — the map-level controls can wrap under themselves as much as they
          like without moving these two. */}
      <div className="mindmap-toolbar-view" ref={viewRef}>
        <div className="mindmap-toolbar-zoom">
          <MindmapZoomGroup scale={scale} onStep={onZoomStep} onFitToScreen={onFitToScreen} />
        </div>
        <div className="mindmap-toolbar-divider" />
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
          onPrintPdf={() => {
            setIsExportMenuOpen(false);
            onPrintPdf();
          }}
          onExportXmind={() => {
            setIsExportMenuOpen(false);
            onExportXmind();
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
      </div>
    </header>
  );
}
