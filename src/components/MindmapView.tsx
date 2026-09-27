import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
// The composition root of the mindmap: the hook calls in their load-bearing
// order, the canvas layer slots, the inline editor, and the two mount points —
// the toolbar and the menus/side-chooser — whose wiring lives beside them in
// ./mindmap. The style panel's icons, the svg scaffolding and the per-node node
// layer went to ./mindmap in earlier waves (batch 3); the pure derivations went
// to useMindmapDerived and the menu/toolbar wiring to MindmapMenus and
// MindmapToolbarMount in the final trim wave.
import type { Heading, ThemeMode } from "../core/types";
import { buildMindmapTree, parseMarkdownToMindmapTree } from "../services/mindmapService";
import type { MindmapNode } from "../core/types";
import { MindmapInlineEditor } from "./MindmapInlineEditor";
import { linkFor } from "../services/mindmapSidecar";
import { parseMindmapLink } from "../core/mindmapLinks";
import { MindmapFloatingTopics } from "./MindmapFloatingTopics";
import { MindmapSummaries } from "./MindmapSummaries";
import { MindmapBoundaries } from "./MindmapBoundaries";
import { MindmapRelationLines } from "./MindmapRelationLines";
import { useMindmapAppearance } from "./mindmap/useMindmapAppearance";
import { useMindmapSearch } from "./mindmap/useMindmapSearch";
import { useMindmapExport } from "./mindmap/useMindmapExport";
import { useMindmapShortcuts } from "./mindmap/useMindmapShortcuts";
import { useMindmapSidecar } from "./mindmap/useMindmapSidecar";
import { useMindmapAnnotations, type MindmapContextMenu } from "./mindmap/useMindmapAnnotations";
import { useMindmapTreeOps } from "./mindmap/useMindmapTreeOps";
import { useMindmapViewport } from "./mindmap/useMindmapViewport";
import { useMindmapDerived } from "./mindmap/useMindmapDerived";
import { MindmapCanvasLayers } from "./mindmap/MindmapCanvasLayers";
import { MindmapNodeLayer } from "./mindmap/MindmapNodeLayer";
import { MindmapMenus } from "./mindmap/MindmapMenus";
import { MindmapToolbarMount } from "./mindmap/MindmapToolbarMount";

/**
 * A node's icon, drawn on its leading edge and outside its box.
 *
 * Outside on purpose: a node's size is the layout's business, and growing the
 * box to fit a drawing would move every node in the map — the golden layout
 * snapshots exist to stop exactly that kind of drift. An id this build does not
 * know draws nothing rather than breaking the map.
 */
export type MindmapViewProps = {
  title: string;
  headings?: Heading[];
  source?: string;
  onSourceChange?: (newSource: string) => void;
  editable?: boolean;
  onJumpToHeading?: (headingId: string, line?: number) => void;
  /**
   * Opens another document, for `[[wiki links]]` on a node.
   *
   * Supplied by the caller because only it knows how this app resolves a name to
   * a file — the reader already asks the same question when a wiki link is
   * clicked, so it hands over the same answer rather than a second resolver
   * growing here. Without it, a wiki link is shown and described but not
   * followable, and the panel says so instead of failing on click.
   */
  onWikiLinkClick?: (target: string) => void;
  onClose?: () => void;
  theme?: ThemeMode;
  /**
   * Identifies the document whose folds are being shown.
   *
   * A path, from the caller that has one. It cannot be derived from `title`:
   * a vault with several `README` or `索引` files would share a single set of
   * folds between all of them. Omitted means folds are not persisted for this
   * mind map, which is the right behaviour for a preview with no file behind it.
   */
  documentKey?: string;
  /**
   * The appearance the map falls back to for anything a node has not styled
   * itself. Defaults to the classic theme, so a caller that has not been taught
   * about themes yet still renders as it always did.
   */
  themeId?: string;
};

// Rich 18-color modern curated palette for node card background fill (includes transparent)

// Curated node border colors (includes default branch color and transparent border)

// Curated high-contrast font colors

// Rich 14-color line palette

export const MindmapView = memo(function MindmapView({
  title,
  headings,
  source,
  onSourceChange,
  editable = true,
  onJumpToHeading,
  onWikiLinkClick,
  onClose,
  theme = "system",
  documentKey,
  themeId,
}: MindmapViewProps) {
  // The companion file and the one writer every annotation edit goes through:
  // the sidecar state, the load-and-merge on document change, the debounced
  // save and `applySidecarEdit`. Extracted to useMindmapSidecar (batch 3,
  // wave 2b). Called here — ahead of useMindmapAppearance — so its load effect
  // keeps running before the appearance hook's load effects, the order they
  // have always run in. The annotation editors' state (the picked and edited
  // relation, floating topic, summary and boundary, and the floating drag)
  // lives in useMindmapAnnotations, called further down at the position its
  // callbacks have always occupied, which keeps the floating drag's
  // window listener the last effect this component registers.
  const { sidecar, applySidecarEdit, sidecarSaveFailed } = useMindmapSidecar({ documentKey });

  /**
   * Follows a link to a heading in this document.
   *
   * The document's headings become this map's nodes, so an anchor names a node
   * — which is why following one is the same jump the reader's outline makes,
   * and needs no resolution beyond finding that node. The text must match
   * entirely (case aside): a link that lands somewhere approximate is worse than
   * one that does nothing, because the reader would not know it missed.
   */
  const followAnchor = useCallback(
    (root: MindmapNode, text: string) => {
      const wanted = text.trim().toLowerCase();
      if (!wanted) return;

      const matches: MindmapNode[] = [];
      const walk = (node: MindmapNode) => {
        if (node.text.trim().toLowerCase() === wanted) matches.push(node);
        node.children.forEach(walk);
      };
      walk(root);

      const target = matches[0];
      if (target && onJumpToHeading) onJumpToHeading(target.id, target.line);
    },
    [onJumpToHeading],
  );

  /**
   * Follows a node's link, through whichever channel its form calls for.
   *
   * All three already exist in the app — the shell opens a URL, the reader's own
   * resolver opens a wiki link, and a heading is a node here — so following a
   * link on the map is a matter of picking one, not of building a fourth way to
   * navigate.
   */
  const handleOpenLink = useCallback(
    (root: MindmapNode, nodeId: string) => {
      const link = parseMindmapLink(linkFor(sidecar, nodeId));
      if (!link) return;

      if (link.kind === "external") {
        const bridge = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;
        void bridge?.system.openExternal?.(link.target);
        return;
      }

      if (link.kind === "wiki") {
        // The anchor rides along: resolving `doc#heading` is the reader's
        // business, and it already does exactly that for a wiki link in text.
        onWikiLinkClick?.(link.anchor ? `${link.target}#${link.anchor}` : link.target);
        return;
      }

      followAnchor(root, link.target);
    },
    [followAnchor, onWikiLinkClick, sidecar],
  );

  // The side-of-root writer (`handleSideChange`) and the two-sided layout's
  // "which side does this new branch go on" question (`sideChooser`) live in
  // useMindmapTreeOps (batch 3, wave 2c): their only readers are the tree
  // handlers that write both the tree and the companion file, which moved there
  // with them.

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Initialize tree from source or headings
  const initialTree = useMemo(() => {
    if (source && source.trim()) {
      return parseMarkdownToMindmapTree(source, title);
    }
    if (headings && headings.length > 0) {
      return buildMindmapTree(title, headings);
    }
    return {
      id: "root-mindmap-node",
      text: title || "中心主题",
      level: 0,
      children: [],
    };
  }, [source, title, headings]);

  const [tree, setTree] = useState<MindmapNode>(initialTree);
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false);

  // Pan & Zoom transform state.
  //
  // Held by the view rather than by useMindmapViewport, deliberately: the tree
  // ops hook runs before the viewport hook (the pan handlers need its callbacks
  // and its layout) and its `handleAddChild` positions the two-sided layout's
  // side question with the transform, so the state has to exist above both.
  // Threading it in is the only acyclic order.
  const [transform, setTransform] = useState({ x: 60, y: 80, scale: 1 });

  // Per-document look & feel: the theme, layout and numbering the reader picks,
  // remembered under the document's key, plus the responsive breakpoints the
  // container class and the toolbar listen to. Extracted to useMindmapAppearance
  // (batch 3, wave 2a); it reads `tree` only for the numbering it derives. The
  // whole return object is kept as one value — the members thread into the tree
  // ops hook below, the container class and the two mount points.
  const appearance = useMindmapAppearance({ documentKey, themeId, containerRef, tree });

  // The source-sync effect (external document changes re-parse into the tree
  // unless this map has unsynced edits) and the fold persistence moved to
  // useMindmapTreeOps (batch 3, wave 2c), which owns that domain; they keep
  // their relative order there.

  // Selected node(s), inline editing, and context menu states
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set([tree.id]));
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>("");
  /**
   * The open context menu, and what it is about.
   *
   * `isCanvas` marks a menu opened on empty canvas. The canvas menu is a
   * different menu rather than the node menu without a subject: it creates,
   * pastes and folds the whole map, none of which need a node.
   *
   * A flag rather than a nullable `nodeId`, because the node menu reads
   * `nodeId` as a plain string in a dozen places. Making it nullable would have
   * forced a narrowing guard into every one of them to describe a state none of
   * them can be in.
   *
   * The shape itself lives with the annotation editors (`MindmapContextMenu` in
   * useMindmapAnnotations), which open this same menu for a line and for a free
   * topic and write the same fields.
   */
  const [contextMenu, setContextMenu] = useState<MindmapContextMenu | null>(null);

  const [menuPos, setMenuPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  // Safe boundary calculation for context menu to prevent bottom/right clipping
  useLayoutEffect(() => {
    if (!contextMenu) return;
    const container = containerRef.current;
    if (!container) return;

    const cWidth = container.clientWidth;
    const cHeight = container.clientHeight;
    const menuEl = menuRef.current;
    const mWidth = menuEl?.offsetWidth || 256;
    const mHeight = menuEl?.offsetHeight || 440;

    let left = contextMenu.x;
    let top = contextMenu.y;

    // Prevent overflowing right boundary
    if (left + mWidth > cWidth - 16) {
      left = Math.max(16, cWidth - mWidth - 16);
    }
    // Prevent overflowing bottom boundary: flip upwards if near bottom
    if (top + mHeight > cHeight - 16) {
      top = Math.max(16, contextMenu.y - mHeight);
      if (top + mHeight > cHeight - 16) {
        top = Math.max(16, cHeight - mHeight - 16);
      }
    }

    setMenuPos({ left: Math.round(left), top: Math.round(top) });
  }, [contextMenu]);

  // Primary single selected node for single-target actions
  const primarySelectedId = useMemo(() => {
    if (selectedNodeIds.size === 0) return null;
    const arr = Array.from(selectedNodeIds);
    return arr[arr.length - 1];
  }, [selectedNodeIds]);

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // The sides are read from the companion file rather than from the tree: which side a
  // first-level branch hangs on is not something a document can say, and only the
  // two-sided layout has an opinion about it — the others ignore the map entirely.
  const statedSides = sidecar?.sides;

  // The tree domain — Markdown synchronisation, undo/redo, the clipboard, the
  // CRUD/navigation/style handlers, the collapse state and the derived layout —
  // extracted to useMindmapTreeOps (batch 3, wave 2c). Called after
  // useMindmapAppearance, whose `activeLayoutId` the layout needs, and before
  // useMindmapViewport, whose pan handlers need the callbacks and the layout
  // returned here. `tree`/`hasUnsyncedChanges` stay above on purpose: the
  // appearance hook derives the outline numbering from the tree and has to run
  // before this call, so the state cannot live below it.
  const treeOps = useMindmapTreeOps({
    documentKey,
    source,
    title,
    onSourceChange,
    editable,
    applySidecarEdit,
    tree,
    setTree,
    hasUnsyncedChanges,
    setHasUnsyncedChanges,
    activeLayoutId: appearance.activeLayoutId,
    statedSides,
    transform,
    containerRef,
    selectedNodeIds,
    setSelectedNodeIds,
    primarySelectedId,
    editingNodeId,
    setEditingNodeId,
    editingText,
    setEditingText,
    setContextMenu,
    editInputRef,
  });

  // In-canvas search: the field's state, the match set, walking between the
  // matches, and select-all — which shares the "point at topics the reader
  // named" gesture. Extracted to useMindmapSearch (batch 3, wave 2a); the
  // viewport, selection and container stay with the view and thread in here.
  // Called directly after the tree ops hook now, because it needs the layout
  // that hook returns; it registers no effects, so the move changes nothing.
  const search = useMindmapSearch({
    tree,
    sidecar,
    layout: treeOps.layout,
    containerRef,
    setTransform,
    setSelectedNodeIds,
  });

  /**
   * The pure derivations that belong to no one hook: the measured free topics,
   * the frame bounds anything framing the canvas takes, the laid-out boxes the
   * relation lines are drawn between, and the style panel's target and its
   * link. Extracted to useMindmapDerived (final trim wave). The call sits here
   * — after the layout exists, before the viewport reads `frameBounds` — and is
   * a pure memo bundle: no state, no effects, so the position costs nothing and
   * moves nothing. The menus and the rest of the view share the same bundle via
   * `derived`; the members the view itself reads are pulled out below.
   */
  const derived = useMindmapDerived({
    sidecar,
    layout: treeOps.layout,
    tree,
    contextMenu,
    selectedNodeIds,
    editingNodeId,
    onJumpToHeading,
    onWikiLinkClick,
  });
  const { floatingBoxes, frameBounds, relationBoxes, relations, editingNode } = derived;

  // The camera and the container-level gestures — the pan & zoom handlers, the
  // wheel zoom, "fit to screen", the marquee press, the print view-box swap,
  // and the container mouse trio (which multiplexes the node-resize stream and
  // the node drag-and-drop hit-testing alongside the pan) — extracted to
  // useMindmapViewport (batch 3, wave 2c). The trio cannot be split without
  // composing handlers in the view and changing the order its branches run in,
  // so the whole of it lives there and the drag/resize states moved with the
  // gesture that drives them; the view reads them back for the ghost badge and
  // the drop indicators. The transform itself stays above, threaded into both
  // this hook and the tree ops hook (see the note on the state).
  const viewport = useMindmapViewport({
    containerRef,
    svgRef,
    transform,
    setTransform,
    layout: treeOps.layout,
    frameBounds,
    tree,
    applyTreeChange: treeOps.applyTreeChange,
    handleUpdateStyle: treeOps.handleUpdateStyle,
    handleCommitEdit: treeOps.handleCommitEdit,
    editingNodeId,
    contextMenu,
    setContextMenu,
    sideChooser: treeOps.sideChooser,
    setSideChooser: treeOps.setSideChooser,
    setSelectedNodeIds,
    editable,
    startEditingRef: treeOps.startEditingRef,
  });

  // Initial fit on mount. Still in the view on purpose: in a new file
  // exhaustive-deps is an error, and adding `handleFitToScreen` would re-run
  // this effect on every layout change — re-fitting the canvas after each
  // edit instead of once on mount, which is the behaviour this timing guards.
  useEffect(() => {
    const timer = setTimeout(() => {
      viewport.handleFitToScreen();
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  // applyTreeChange, handleMoveSibling, handleZoomStep, the clipboard and its
  // copy/cut/paste, `isBlankCanvasTarget`, `startEditingRef` and the two
  // canvas-level gestures (double-click-to-create, right-click canvas menu)
  // moved to useMindmapTreeOps and useMindmapViewport (batch 3, wave 2c; the
  // gestures joined the viewport in the final trim wave, beside the blank-
  // canvas predicate they both ask first); they arrive back from those calls.

  // The marquee's state, refs and press handler moved to useMindmapViewport
  // (batch 3, wave 2c) and come back from that call. The release effect below
  // stays here on purpose: it puts the picked relation down via
  // `setSelectedRelation`, which useMindmapAnnotations returns further down —
  // the same late-bound closure the wave 2b extraction documented — and a hook
  // called before that one cannot receive the setter without changing when
  // these window listeners attach relative to the floating-drag listener,
  // which must stay the last one registered.
  const isMarqueeSelecting = viewport.marquee !== null;

  useEffect(() => {
    if (!isMarqueeSelecting) return;

    const handleMove = (e: MouseEvent) => {
      const start = viewport.marqueeStartRef.current;
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!start || !containerRect) return;

      // Pressing on bare canvas puts the picked line down, as it does the picked
      // group: there is one selection on this map, and the reader has moved on.
      annotations.setSelectedRelation(null);

      const rect = {
        x1: start.x,
        y1: start.y,
        x2: (e.clientX - containerRect.left - transform.x) / transform.scale,
        y2: (e.clientY - containerRect.top - transform.y) / transform.scale,
      };
      viewport.marqueeRectRef.current = rect;
      viewport.setMarquee(rect);
    };

    const handleUp = () => {
      const rect = viewport.marqueeRectRef.current;
      if (rect && treeOps.layout) {
        const left = Math.min(rect.x1, rect.x2);
        const right = Math.max(rect.x1, rect.x2);
        const top = Math.min(rect.y1, rect.y2);
        const bottom = Math.max(rect.y1, rect.y2);

        // Intersection, not containment: requiring a node to be fully inside
        // means a box drawn across a row of branches selects nothing, which is
        // the opposite of what drawing it feels like.
        const hit = treeOps.layout.nodes
          .filter(
            (n) => n.x < right && n.x + n.width > left && n.y < bottom && n.y + n.height > top,
          )
          .map((n) => n.id);
        if (hit.length) setSelectedNodeIds(new Set(hit));
      }
      viewport.marqueeStartRef.current = null;
      viewport.marqueeRectRef.current = null;
      viewport.setMarquee(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isMarqueeSelecting, treeOps.layout, transform.scale, transform.x, transform.y]);

  // handleUndo/handleRedo/handleSyncToDocument and the interactive topic
  // actions — add child (with the two-sided layout's side question), add
  // sibling, delete, rename, style, keyboard navigation, and the move-to-other-
  // side row — moved to useMindmapTreeOps (batch 3, wave 2c); they arrive back
  // from that call above, and useMindmapShortcuts below composes them exactly
  // as it always did.

  // Global Mindmap Keydown shortcuts. The handler body — guards, order,
  // preventDefaults — lives verbatim in useMindmapShortcuts (batch 3, wave 2a);
  // everything it composes threads in from the view's own hooks and locals.
  useMindmapShortcuts({
    editingNodeId,
    isSearchOpen: search.isSearchOpen,
    sideChooser: treeOps.sideChooser,
    contextMenu,
    selectedNodeIds,
    setIsSearchOpen: search.setIsSearchOpen,
    searchInputRef: search.searchInputRef,
    handleCloseSearch: search.handleCloseSearch,
    setSideChooser: treeOps.setSideChooser,
    setContextMenu,
    setSelectedNodeIds,
    handleSelectAll: search.handleSelectAll,
    handleCommitEdit: treeOps.handleCommitEdit,
    handleCancelEdit: treeOps.handleCancelEdit,
    handleCopyNode: treeOps.handleCopyNode,
    handleCutNode: treeOps.handleCutNode,
    handlePasteNode: treeOps.handlePasteNode,
    handleUndo: treeOps.handleUndo,
    handleRedo: treeOps.handleRedo,
    handleSyncToDocument: treeOps.handleSyncToDocument,
    handleAddChild: treeOps.handleAddChild,
    handleAddSibling: treeOps.handleAddSibling,
    handleDeleteNode: treeOps.handleDeleteNode,
    startEditing: treeOps.startEditing,
    handleZoomStep: viewport.handleZoomStep,
    handleFitToScreen: viewport.handleFitToScreen,
    handleMoveSibling: treeOps.handleMoveSibling,
    handleNavigate: treeOps.handleNavigate,
    onClose,
  });

  // The edit-input focus effect moved to useMindmapTreeOps (batch 3, wave 2c),
  // where it keeps its place in that hook's effect sequence after the sync and
  // fold effects. The container mouse trio, the wheel zoom and the collapse
  // handlers moved to useMindmapTreeOps and useMindmapViewport and arrive back
  // from the calls above; the container's props below read them unchanged.

  // The seven ways a map leaves the app — PNG, SVG, print/PDF, OPML, FreeMind,
  // XMind and the Markdown outline. Extracted to useMindmapExport (batch 3,
  // wave 2a); isDarkUi went with it, as the image exports' only reader. The
  // whole return object goes to the toolbar mount, its only reader.
  const exportHandlers = useMindmapExport({
    title,
    tree,
    theme,
    svgRef,
    layout: treeOps.layout,
    frameBounds,
    collapsedIds: treeOps.collapsedIds,
    sidecar,
  });

  /**
   * The annotation editors: relations, free topics, summaries and boundaries —
   * their picked/edited state, their callbacks, the free topic's drag window
   * listener and the box each inline editor draws over. Extracted to
   * useMindmapAnnotations (batch 3, wave 2b); called here, at the position its
   * callbacks have always occupied, so the drag listener stays the last effect
   * this component registers. `setSelectedRelation` is read above this line by
   * the marquee effect; that reference sits inside the effect's closure, which
   * only ever runs after this call has returned.
   */
  const annotations = useMindmapAnnotations({
    applySidecarEdit,
    selectedNodeIds,
    containerRef,
    transform,
    menuPos,
    editingText,
    setEditingText,
    setContextMenu,
    treeId: tree.id,
    sidecar,
    layout: treeOps.layout,
    relationBoxes,
    floatingBoxes,
  });

  /**
   * The one inline editor, and what it is editing.
   *
   * One render site rather than one per kind. A node, a free topic and a
   * summary's label are all a box with text in it, and the editor never wanted
   * more than that — deciding here, in one place, is also what makes it
   * impossible for two editors to be open at once.
   *
   * This is the one derivation that stayed in the view on purpose: its inputs
   * are the annotation editors' boxes and commit/cancel pairs, which do not
   * exist until the hook above has returned — moving it into useMindmapDerived
   * would be a cycle.
   */
  const inlineEdit = editingNode
    ? { box: editingNode, onCommit: treeOps.handleCommitEdit, onCancel: treeOps.handleCancelEdit }
    : annotations.editingFloatingBox
      ? {
          box: annotations.editingFloatingBox,
          onCommit: annotations.handleCommitFloatingEdit,
          onCancel: annotations.handleCancelFloatingEdit,
        }
      : annotations.editingSummaryBox
        ? {
            box: annotations.editingSummaryBox,
            onCommit: annotations.handleCommitSummaryEdit,
            onCancel: annotations.handleCancelSummaryEdit,
          }
        : annotations.editingBoundaryBox
          ? {
              box: annotations.editingBoundaryBox,
              onCommit: annotations.handleCommitBoundaryEdit,
              onCancel: annotations.handleCancelBoundaryEdit,
            }
          : annotations.editingRelationBox
            ? {
                box: annotations.editingRelationBox,
                onCommit: annotations.handleCommitRelationEdit,
                onCancel: annotations.handleCancelRelationEdit,
              }
            : null;

  return (
    <div
      ref={containerRef}
      className={`mindmap-view-container ${viewport.isDragging ? "is-dragging" : ""} ${
        appearance.isSemiCompact ? "is-semi-compact" : ""
      } ${appearance.isCompact ? "is-compact" : ""} ${appearance.isNarrow ? "is-narrow" : ""} ${
        appearance.isUltraNarrow ? "is-ultra-narrow" : ""
      }`}
      onMouseDown={viewport.handleMouseDown}
      onMouseMove={viewport.handleMouseMove}
      onMouseUp={viewport.handleMouseUp}
      onMouseLeave={viewport.handleMouseUp}
      onWheel={viewport.handleWheel}
    >
      <MindmapToolbarMount
        title={title}
        tree={tree}
        selectedNodeIds={selectedNodeIds}
        editable={editable}
        onSourceChange={onSourceChange}
        hasUnsyncedChanges={hasUnsyncedChanges}
        transform={transform}
        containerRef={containerRef}
        primarySelectedId={primarySelectedId}
        setContextMenu={setContextMenu}
        appearance={appearance}
        search={search}
        treeOps={treeOps}
        viewport={viewport}
        exportHandlers={exportHandlers}
      />

      {/* Main SVG Infinite Mindmap Canvas. The svg scaffolding — the glow filter
          defs, the marquee rect, the viewport group, the edge paths and the drag
          ghost — moved to MindmapCanvasLayers (batch 3, wave 3, the final wave of
          the decomposition). The layers this view still owns are handed over as
          explicit slots and land inside the viewport group in the same paint
          order as before: the boundaries and relations under the outline, the
          node layer between it and the summaries and free topics above it. */}
      <MindmapCanvasLayers
        svgRef={svgRef}
        transform={transform}
        marquee={viewport.marquee}
        layout={treeOps.layout}
        mindmapTheme={appearance.mindmapTheme}
        hoveredNodeId={hoveredNodeId}
        selectedNodeIds={selectedNodeIds}
        draggingNodeId={viewport.draggingNodeId}
        dragGhostPos={viewport.dragGhostPos}
        dropTargetId={viewport.dropTargetId}
        handleCanvasMouseDown={viewport.handleCanvasMouseDown}
        handleCanvasDoubleClick={viewport.handleCanvasDoubleClick}
        handleCanvasContextMenu={viewport.handleCanvasContextMenu}
        backLayers={
          <>
            {/* Boundaries are the backmost layer, since a box is a background for
                the group it encloses: the branches leaving those topics pass over
                it, as they do on paper. */}
            <MindmapBoundaries
              boundaries={annotations.boundaryBoxes}
              selectedId={annotations.selectedBoundaryId}
              onSelect={annotations.setSelectedBoundaryId}
              onStartEdit={annotations.handleStartBoundaryEdit}
            />

            {/* Relations next, so they pass under the outline rather than across
                it — a line over a label costs both of them their legibility. */}
            <MindmapRelationLines
              relations={relations}
              boxes={relationBoxes}
              selectedKey={
                annotations.selectedRelation
                  ? `${annotations.selectedRelation.fromId}\u0000${annotations.selectedRelation.toId}`
                  : null
              }
              onSelect={annotations.setSelectedRelation}
              onStartLabelEdit={annotations.handleStartRelationEdit}
              onOpenMenu={annotations.handleRelationContextMenu}
            />
          </>
        }
        nodeLayer={
          <MindmapNodeLayer
            nodes={treeOps.layout.nodes}
            mindmapTheme={appearance.mindmapTheme}
            sidecar={sidecar}
            editable={editable}
            hoveredNodeId={hoveredNodeId}
            setHoveredNodeId={setHoveredNodeId}
            selectedNodeIds={selectedNodeIds}
            setSelectedNodeIds={setSelectedNodeIds}
            containerRef={containerRef}
            setContextMenu={setContextMenu}
            dropTargetId={viewport.dropTargetId}
            dropPosition={viewport.dropPosition}
            searchMatchIds={search.searchMatchIds}
            currentSearchIndex={search.currentSearchIndex}
            tree={tree}
            onJumpToHeading={onJumpToHeading}
            startEditing={treeOps.startEditing}
            handleOpenLink={handleOpenLink}
            numbering={appearance.numbering}
            handleToggleCollapse={treeOps.handleToggleCollapse}
            setResizingNode={viewport.setResizingNode}
            handleUpdateStyle={treeOps.handleUpdateStyle}
            nodeDragStartRef={viewport.nodeDragStartRef}
          />
        }
        frontLayers={
          <>
            {/* Summary brackets, then free topics: both are the reader's own
                additions and sit above the outline, and a free topic is the one a
                reader drags over other things. */}
            <MindmapSummaries
              summaries={annotations.summaryBoxes}
              selectedId={annotations.selectedSummaryId}
              onSelect={annotations.setSelectedSummaryId}
              onStartEdit={annotations.handleStartSummaryEdit}
            />

            {/* Free topics last, so they sit above the outline: they are the
                reader's own additions, and one dragged over a branch should stay
                visible rather than slide underneath it. */}
            <MindmapFloatingTopics
              topics={floatingBoxes}
              selectedId={annotations.selectedFloatingId}
              onSelect={annotations.setSelectedFloatingId}
              onStartEdit={annotations.handleStartFloatingEdit}
              onStartDrag={annotations.handleFloatingDragStart}
              onOpenMenu={annotations.handleFloatingContextMenu}
              onOpenLink={(id) => handleOpenLink(tree, id)}
            />
          </>
        }
      />

      {/* Inline text editing, over whatever was asked for: a node's text, a free
          topic's text, or a summary's label. One editor, because all three are a
          box with text in it. */}
      {inlineEdit && (
        <MindmapInlineEditor
          node={inlineEdit.box}
          transform={transform}
          value={editingText}
          inputRef={editInputRef}
          onChange={setEditingText}
          onCommit={inlineEdit.onCommit}
          onCancel={inlineEdit.onCancel}
        />
      )}

      <MindmapMenus
        contextMenu={contextMenu}
        setContextMenu={setContextMenu}
        menuPos={menuPos}
        menuRef={menuRef}
        tree={tree}
        sidecar={sidecar}
        applySidecarEdit={applySidecarEdit}
        sidecarSaveFailed={sidecarSaveFailed}
        selectedNodeIds={selectedNodeIds}
        primarySelectedId={primarySelectedId}
        handleOpenLink={handleOpenLink}
        handleFitToScreen={viewport.handleFitToScreen}
        activeLayoutId={appearance.activeLayoutId}
        mindmapTheme={appearance.mindmapTheme}
        derived={derived}
        annotations={annotations}
        treeOps={treeOps}
      />
    </div>
  );
});
