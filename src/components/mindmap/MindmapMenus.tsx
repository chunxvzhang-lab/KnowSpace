import { useCallback, useMemo, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { MindmapNode } from "../../core/types";
import { freezeAppearance, type MindmapTheme } from "../../core/mindmapThemes";
import {
  allTags,
  iconFor,
  markersFor,
  noteFor,
  setNodeIcon,
  setNodeLink,
  setNodeNote,
  setNodePriority,
  setNodeProgress,
  setNodeTags,
  tagsFor,
  type MindmapSidecar,
  type SidecarSection,
} from "../../services/mindmapSidecar";
import { MindmapCanvasMenu } from "../MindmapCanvasMenu";
import { MindmapNodeStyleMenu } from "../MindmapNodeStyleMenu";
import { MindmapFloatingAnnotationMenu } from "../MindmapFloatingAnnotationMenu";
import type { MindmapContextMenu } from "./useMindmapAnnotations";
import type { useMindmapAnnotations } from "./useMindmapAnnotations";
import type { useMindmapDerived } from "./useMindmapDerived";
import type { useMindmapTreeOps } from "./useMindmapTreeOps";

/**
 * The mindmap's three menus and the side question, mounted where the view left
 * them and wired to the hooks the view still calls.
 *
 * Extracted from MindmapView (final trim wave of the decomposition) as pure
 * prop plumbing: the JSX, the closures adapting the hooks to the menus, and the
 * sidecar-edit handlers whose only readers are these menus all moved verbatim —
 * the hooks stay in the view, in their load-bearing order, and arrive here as
 * their return objects. The one stylistic concession is that the handlers and
 * the menu-only derivations (`documentTags`, `selectedIds`, `isBatchMode`) are
 * recomputed here rather than in the view; their inputs and dependencies are
 * unchanged, so their values and identities are too.
 */
type MindmapMenusProps = {
  /** The open context menu, if any; decides which of the three panels shows. */
  contextMenu: MindmapContextMenu | null;
  /** The menu writer — every action closes the menu before it acts. */
  setContextMenu: Dispatch<SetStateAction<MindmapContextMenu | null>>;
  /** The clamped position the boundary layout effect worked out in the view. */
  menuPos: { left: number; top: number };
  /** Measured by the view's effect so the menus never clip at the edges. */
  menuRef: RefObject<HTMLDivElement | null>;
  /** The tree — the canvas menu acts on the root, the panel on a topic in it. */
  tree: MindmapNode;
  /** The companion file, read for what each panel displays. */
  sidecar: MindmapSidecar | null;
  /** The one sidecar writer, from `useMindmapSidecar` — every panel edit goes through it. */
  applySidecarEdit: (
    sections: SidecarSection[],
    edit: (current: MindmapSidecar) => MindmapSidecar,
  ) => void;
  /** Whether the last companion-file write failed; the panels say so. */
  sidecarSaveFailed: boolean;
  /** The current selection, for the batch actions and the batch count. */
  selectedNodeIds: Set<string>;
  /** The primary selection, the fallback target of the freeze-theme action. */
  primarySelectedId: string | null;
  /** Follows a node's link, resolved by the view (it owns the navigation callers). */
  handleOpenLink: (root: MindmapNode, nodeId: string) => void;
  /** "Fit to screen", from the viewport — the canvas menu's last row. */
  handleFitToScreen: () => void;
  /** The active layout id; only the two-sided layout offers a move-to-side. */
  activeLayoutId: string;
  /** The resolved theme, written onto nodes by the freeze-theme action. */
  mindmapTheme: MindmapTheme;
  /** The view's pure derivations (panel target, boxes, selection facts). */
  derived: ReturnType<typeof useMindmapDerived>;
  /** The annotation editors' state and callbacks. */
  annotations: ReturnType<typeof useMindmapAnnotations>;
  /** The tree domain's handlers and clipboard. */
  treeOps: ReturnType<typeof useMindmapTreeOps>;
};

export function MindmapMenus({
  contextMenu,
  setContextMenu,
  menuPos,
  menuRef,
  tree,
  sidecar,
  applySidecarEdit,
  sidecarSaveFailed,
  selectedNodeIds,
  primarySelectedId,
  handleOpenLink,
  handleFitToScreen,
  activeLayoutId,
  mindmapTheme,
  derived,
  annotations,
  treeOps,
}: MindmapMenusProps) {
  const {
    sideChooser,
    setSideChooser,
    handleAddChild,
    handleAddSibling,
    handleMoveToSide,
    applyTreeChange,
    clipboardRef,
    clipboardReady,
    handleCopyNode,
    handleCutNode,
    handlePasteNode,
    handleExpandAll,
    handleCollapseToLevel2,
    handleUpdateStyle,
    handleDeleteNode,
    startEditing,
  } = treeOps;

  const {
    selectedRelation,
    selectedRelationInfo,
    handleToggleRelation,
    handleRelationChange,
    handleRemoveSelectedRelation,
    handleStartRelationEdit,
    handleAddSummary,
    handleRemoveSummary,
    summaryBoxes,
    selectedSummaryId,
    handleAddBoundary,
    handleBoundaryColorChange,
    handleRemoveBoundary,
    boundaryBoxes,
    selectedBoundaryId,
    handleNewFloatingTopic,
    handleRemoveFloatingTopic,
    handleDeleteFloatingTopic,
    selectedFloatingId,
  } = annotations;

  const {
    selectionRelated,
    floatingBoxes,
    contextTargetNode,
    contextTargetFloating,
    panelNodeId,
    panelLink,
    parsedPanelLink,
    canOpenPanelLink,
    canOpenFloatingLink,
  } = derived;

  const selectedIds = [...selectedNodeIds];
  const isBatchMode = selectedNodeIds.size > 1;

  /**
   * A note edit arrives on every keystroke, since the panel holds no state of its
   * own; only the disk write waits, which is why the text never lags the typing.
   */
  const handleNoteChange = useCallback(
    (nodeId: string, text: string) =>
      applySidecarEdit(["notes"], (current) => setNodeNote(current, nodeId, text)),
    [applySidecarEdit],
  );

  /**
   * An icon edit. One icon per node: picking the one a node already wears takes
   * it off, which is the only way to say "none" without a menu of its own.
   */
  const handleIconChange = useCallback(
    (nodeId: string, iconId: string) =>
      applySidecarEdit(["icons"], (current) => setNodeIcon(current, nodeId, iconId)),
    [applySidecarEdit],
  );

  /** A node's link, as typed. Stored verbatim; read when someone follows it. */
  const handleLinkChange = useCallback(
    (nodeId: string, text: string) =>
      applySidecarEdit(["links"], (current) => setNodeLink(current, nodeId, text)),
    [applySidecarEdit],
  );

  /** A node's tags, replaced wholesale — the list is what the panel edits. */
  const handleTagsChange = useCallback(
    (nodeId: string, tags: string[]) =>
      applySidecarEdit(["tags"], (current) => setNodeTags(current, nodeId, tags)),
    [applySidecarEdit],
  );

  /**
   * Every tag the document uses, most used first.
   *
   * Derived from the sidecar rather than stored, so it cannot fall out of step
   * with the tags it describes, and computed once per change rather than once
   * per keystroke in the note field.
   */
  const documentTags = useMemo(() => allTags(sidecar), [sidecar]);

  /**
   * A priority or a progress edit. One handler for both, because they differ
   * only in which setter they reach — a node carries one of each at the same
   * time, so neither is a separate kind of thing to the panel.
   */
  const handleMarkChange = useCallback(
    (nodeId: string, field: "priority" | "progress", value: number | null) =>
      applySidecarEdit(["markers"], (current) =>
        field === "priority"
          ? setNodePriority(current, nodeId, value)
          : setNodeProgress(current, nodeId, value),
      ),
    [applySidecarEdit],
  );

  /**
   * Writes the current theme's appearance into the selected nodes.
   *
   * Confirmed first, because it is the one action here that changes what later
   * theme switches do to these nodes: after it they stop following. It cannot
   * lose anything a reader set by hand — `freezeAppearance` gives a node's own
   * value priority, so writing the answer back is a no-op for every field the
   * node had already chosen.
   */
  const handleFreezeTheme = useCallback(() => {
    const targetIds =
      selectedNodeIds.size > 1 ? Array.from(selectedNodeIds) : [primarySelectedId || tree.id];

    const confirmed = window.confirm(
      `将把当前主题的外观固化到 ${targetIds.length} 个节点的样式上。\n\n` +
        "此后切换主题时，这些节点不再跟随；你手工设置过的颜色、形状与字号不会改变。\n\n是否继续？",
    );
    if (!confirmed) return;

    applyTreeChange(freezeAppearance(tree, targetIds, mindmapTheme));
  }, [tree, selectedNodeIds, primarySelectedId, mindmapTheme, applyTreeChange]);

  return (
    <>
      {/* Where a new first-level branch goes, asked before it is made. It wears the menus'
          own class deliberately: it inherits their look, and their wheel handling — which is
          what keeps the map still while a popover is up. */}
      {sideChooser && (
        <div
          className="mindmap-context-menu mindmap-side-chooser"
          style={{ left: sideChooser.x, top: sideChooser.y }}
          onMouseDown={(event) => event.stopPropagation()}
          role="group"
          aria-label="这一支放哪边"
        >
          <div className="mindmap-ctx-header">
            <span className="mindmap-ctx-title">这一支放哪边？</span>
            <button
              type="button"
              className="mindmap-ctx-close"
              onClick={() => setSideChooser(null)}
              title="关闭 (Esc)"
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <div className="mindmap-ctx-actions">
            <button
              type="button"
              className="mindmap-ctx-item"
              onClick={() => handleAddChild(sideChooser.parentId, "left")}
            >
              放到左侧
            </button>
            <button
              type="button"
              className="mindmap-ctx-item"
              onClick={() => handleAddChild(sideChooser.parentId, "right")}
            >
              放到右侧
            </button>
          </div>
        </div>
      )}

      {/* Canvas menu, for a right-click on empty space. */}
      {contextMenu?.isCanvas && (
        <MindmapCanvasMenu
          left={menuPos.left}
          top={menuPos.top}
          menuRef={menuRef}
          canPaste={Boolean(clipboardRef.current)}
          onClose={() => setContextMenu(null)}
          onNewTopic={() => {
            setContextMenu(null);
            handleAddChild(tree.id);
          }}
          onPaste={() => {
            setContextMenu(null);
            handlePasteNode();
          }}
          selectedCount={selectedIds.length}
          selectionRelated={selectionRelated}
          canBound={selectedIds.length >= 1}
          onAddBoundary={() => {
            setContextMenu(null);
            handleAddBoundary();
          }}
          selectedBoundary={
            boundaryBoxes.find((boundary) => boundary.id === selectedBoundaryId) ?? null
          }
          onBoundaryColorChange={(colorId) => {
            setContextMenu(null);
            handleBoundaryColorChange(colorId);
          }}
          onRemoveBoundary={() => {
            setContextMenu(null);
            handleRemoveBoundary();
          }}
          selectedRelation={selectedRelationInfo}
          onEditRelationLabel={() => {
            if (selectedRelation) handleStartRelationEdit(selectedRelation);
          }}
          onRelationChange={handleRelationChange}
          onRemoveRelation={() => {
            setContextMenu(null);
            handleRemoveSelectedRelation();
          }}
          canSummarise={selectedIds.length >= 2}
          onAddSummary={() => {
            setContextMenu(null);
            handleAddSummary();
          }}
          selectedSummaryText={
            summaryBoxes.find((summary) => summary.id === selectedSummaryId)?.text || null
          }
          onRemoveSummary={() => {
            setContextMenu(null);
            handleRemoveSummary();
          }}
          selectedFloatingText={
            floatingBoxes.find((topic) => topic.id === selectedFloatingId)?.text ?? null
          }
          onNewFloatingTopic={() => {
            setContextMenu(null);
            handleNewFloatingTopic();
          }}
          onRemoveFloatingTopic={() => {
            setContextMenu(null);
            handleRemoveFloatingTopic();
          }}
          onToggleRelation={() => {
            setContextMenu(null);
            handleToggleRelation();
          }}
          onExpandAll={() => {
            setContextMenu(null);
            handleExpandAll();
          }}
          onCollapseToLevel2={() => {
            setContextMenu(null);
            handleCollapseToLevel2();
          }}
          onFitToScreen={() => {
            setContextMenu(null);
            handleFitToScreen();
          }}
        />
      )}

      {/* Right Click Appearance & Typography Customization Context Menu */}
      <MindmapNodeStyleMenu
        open={!!contextMenu && !contextMenu.isCanvas && !contextMenu.floating}
        position={menuPos}
        menuRef={menuRef}
        nodeId={contextMenu?.nodeId ?? tree.id}
        target={contextTargetNode}
        isBatchMode={isBatchMode}
        selectedCount={selectedNodeIds.size}
        canPasteBranch={clipboardReady}
        onCopyBranch={() => handleCopyNode(contextMenu?.nodeId)}
        onCutBranch={() => handleCutNode(contextMenu?.nodeId)}
        onPasteBranch={() => handlePasteNode(contextMenu?.nodeId)}
        icon={iconFor(sidecar, panelNodeId)}
        note={noteFor(sidecar, panelNodeId)}
        link={panelLink}
        parsedLink={parsedPanelLink}
        canOpenLink={canOpenPanelLink}
        tags={tagsFor(sidecar, panelNodeId)}
        knownTags={documentTags}
        markers={markersFor(sidecar, panelNodeId)}
        saveFailed={sidecarSaveFailed}
        onIconChange={handleIconChange}
        onNoteChange={handleNoteChange}
        onLinkChange={handleLinkChange}
        onOpenLink={(nodeId) => handleOpenLink(tree, nodeId)}
        onTagsChange={handleTagsChange}
        onMarkChange={handleMarkChange}
        onUpdateStyle={handleUpdateStyle}
        onDelete={handleDeleteNode}
        onAddChild={handleAddChild}
        onAddSibling={handleAddSibling}
        onStartRename={startEditing}
        // Offered only where a side is a thing: the two-sided layout, for a first-level
        // branch. A deeper topic follows its branch, so it has no other side of its own to
        // be moved to.
        onMoveToSide={
          activeLayoutId === "bidirectional" &&
          tree.children.some((child) => child.id === panelNodeId)
            ? handleMoveToSide
            : undefined
        }
        onFreezeTheme={handleFreezeTheme}
        onClose={() => setContextMenu(null)}
      />

      {/* Right Click on a Floating Topic: its own panel. The annotations are the
          same five as a node's, read from the same sections of the same file by
          the same expressions above — only the header and the one action are this
          panel's own. */}
      <MindmapFloatingAnnotationMenu
        open={!!contextMenu?.floating}
        position={menuPos}
        menuRef={menuRef}
        topicText={contextTargetFloating?.text ?? ""}
        nodeId={panelNodeId}
        isBatchMode={false}
        icon={iconFor(sidecar, panelNodeId)}
        note={noteFor(sidecar, panelNodeId)}
        link={panelLink}
        parsedLink={parsedPanelLink}
        canOpenLink={canOpenFloatingLink}
        tags={tagsFor(sidecar, panelNodeId)}
        knownTags={documentTags}
        markers={markersFor(sidecar, panelNodeId)}
        saveFailed={sidecarSaveFailed}
        onIconChange={handleIconChange}
        onNoteChange={handleNoteChange}
        onLinkChange={handleLinkChange}
        onOpenLink={(nodeId) => handleOpenLink(tree, nodeId)}
        onTagsChange={handleTagsChange}
        onMarkChange={handleMarkChange}
        onDelete={() => handleDeleteFloatingTopic(panelNodeId)}
        onClose={() => setContextMenu(null)}
      />
    </>
  );
}
