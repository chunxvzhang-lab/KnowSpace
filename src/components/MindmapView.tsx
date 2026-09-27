import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
// The icons the style panel draws with went with it, and the svg scaffolding and
// the per-node node layer have since gone to ./mindmap too (batch 3, wave 3);
// what is left here is the toolbar, the menus, the side chooser and the inline
// editor, plus the three slots of canvas layers the view still owns.
import type { Heading, ThemeMode } from "../core/types";
import {
  buildMindmapTree,
  parseMarkdownToMindmapTree,
  addChildNode,
  findNode,
  calculateNodeDimensions,
} from "../services/mindmapService";
import type { MindmapNode } from "../core/types";
import { MindmapCanvasMenu } from "./MindmapCanvasMenu";
import { MindmapNodeStyleMenu } from "./MindmapNodeStyleMenu";
import { MindmapInlineEditor } from "./MindmapInlineEditor";
import { MindmapToolbar } from "./MindmapToolbar";
import { freezeAppearance } from "../core/mindmapThemes";
import {
  allTags,
  areRelated,
  iconFor,
  linkFor,
  markersFor,
  noteFor,
  setNodeIcon,
  setNodeLink,
  setNodeNote,
  setNodePriority,
  setNodeProgress,
  setNodeTags,
  tagsFor,
  floatingTopics,
} from "../services/mindmapSidecar";
import { boundsOfBoxes, unionBounds } from "../core/mindmapBounds";
import { MindmapFloatingTopics, type FloatingBox } from "./MindmapFloatingTopics";
import { MindmapSummaries } from "./MindmapSummaries";
import { MindmapBoundaries } from "./MindmapBoundaries";
import { MindmapFloatingAnnotationMenu } from "./MindmapFloatingAnnotationMenu";
import { parseMindmapLink } from "../core/mindmapLinks";
import { MindmapRelationLines } from "./MindmapRelationLines";
import { useMindmapAppearance } from "./mindmap/useMindmapAppearance";
import { useMindmapSearch } from "./mindmap/useMindmapSearch";
import { useMindmapExport } from "./mindmap/useMindmapExport";
import { useMindmapShortcuts } from "./mindmap/useMindmapShortcuts";
import { useMindmapSidecar } from "./mindmap/useMindmapSidecar";
import { useMindmapAnnotations, type MindmapContextMenu } from "./mindmap/useMindmapAnnotations";
import { useMindmapTreeOps } from "./mindmap/useMindmapTreeOps";
import { useMindmapViewport } from "./mindmap/useMindmapViewport";
import { MindmapCanvasLayers } from "./mindmap/MindmapCanvasLayers";
import { MindmapNodeLayer } from "./mindmap/MindmapNodeLayer";

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

  // The side-of-root writer (`handleSideChange`) and the two-sided layout's
  // "which side does this new branch go on" question (`sideChooser`) live in
  // useMindmapTreeOps (batch 3, wave 2c): their only readers are the tree
  // handlers that write both the tree and the companion file, which moved there
  // with them.

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
  // (batch 3, wave 2a); it reads `tree` only for the numbering it derives.
  const {
    handlePickTheme,
    activeThemeId,
    mindmapTheme,
    handlePickLayout,
    activeLayoutId,
    showNumbering,
    handleToggleNumbering,
    numbering,
    isSemiCompact,
    isCompact,
    isNarrow,
    isUltraNarrow,
  } = useMindmapAppearance({ documentKey, themeId, containerRef, tree });

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
  const {
    layout,
    collapsedIds,
    handleToggleCollapse,
    handleExpandAll,
    handleCollapseToLevel2,
    sideChooser,
    setSideChooser,
    handleAddChild,
    handleAddSibling,
    handleMoveToSide,
    applyTreeChange,
    handleUndo,
    handleRedo,
    handleSyncToDocument,
    handleMoveSibling,
    clipboardRef,
    clipboardReady,
    handleCopyNode,
    handleCutNode,
    handlePasteNode,
    startEditing,
    startEditingRef,
    handleCommitEdit,
    handleCancelEdit,
    handleUpdateStyle,
    handleNavigate,
    handleDeleteNode,
  } = useMindmapTreeOps({
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
    activeLayoutId,
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
  const {
    isSearchOpen,
    setIsSearchOpen,
    searchQuery,
    searchMatchIds,
    currentSearchIndex,
    searchInputRef,
    handleSearch,
    handleNextSearch,
    handlePrevSearch,
    handleCloseSearch,
    handleSelectAll,
  } = useMindmapSearch({
    tree,
    sidecar,
    layout,
    containerRef,
    setTransform,
    setSelectedNodeIds,
  });

  /**
   * The floating topics, measured the same way the layout measures nodes.
   *
   * Measured rather than stored: a topic's box follows its text, so renaming one
   * resizes it and the file never has to hold a size its own text contradicts.
   * The measurement is the service's, so a free topic looks like the branches
   * beside it instead of like a second opinion about the theme.
   */
  const floatingBoxes = useMemo<FloatingBox[]>(() => {
    return floatingTopics(sidecar).map(({ id, topic }) => {
      const { width, height, lines } = calculateNodeDimensions({
        id,
        text: topic.text,
        level: 1,
        children: [],
      });
      return {
        id,
        text: topic.text,
        lines,
        x: topic.x,
        y: topic.y,
        width,
        height,
        // What it carries, read here rather than in the component: a floating
        // topic's annotations live in the same sections as a node's, so the view
        // reads them the same way and the component draws boxes.
        iconId: iconFor(sidecar, id),
        markers: markersFor(sidecar, id),
        hasNote: Boolean(noteFor(sidecar, id)),
        hasLink: Boolean(parseMindmapLink(linkFor(sidecar, id))),
        tags: tagsFor(sidecar, id),
      };
    });
  }, [sidecar]);

  /**
   * The bounds anything framing the canvas has to use.
   *
   * The layout's bounds cover the tree and nothing else — it has never heard of a
   * free topic — so the export, the printed page and "fit to screen" all take the
   * union. Without it, a topic dragged into open space would be cropped out of the
   * very picture meant to show it.
   */
  const frameBounds = useMemo(() => {
    const floating = boundsOfBoxes(floatingBoxes, 60);
    return floating ? unionBounds(layout.bounds, floating) : layout.bounds;
  }, [floatingBoxes, layout.bounds]);

  /** Where each laid-out node is, for the relation lines to be drawn between. */
  const relationBoxes = useMemo(
    () =>
      new Map(
        layout.nodes.map((node) => [
          node.id,
          { x: node.x, y: node.y, width: node.width, height: node.height },
        ]),
      ),
    [layout],
  );

  /** The stored relations, or nothing while the file is still being read. */
  const relations = sidecar?.relations ?? [];

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
  const {
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handleZoomStep,
    handleFitToScreen,
    isBlankCanvasTarget,
    handleCanvasMouseDown,
    marquee,
    setMarquee,
    marqueeStartRef,
    marqueeRectRef,
    setResizingNode,
    draggingNodeId,
    dragGhostPos,
    dropTargetId,
    dropPosition,
    nodeDragStartRef,
  } = useMindmapViewport({
    containerRef,
    svgRef,
    transform,
    setTransform,
    layout,
    frameBounds,
    tree,
    applyTreeChange,
    handleUpdateStyle,
    handleCommitEdit,
    editingNodeId,
    contextMenu,
    setContextMenu,
    sideChooser,
    setSideChooser,
    setSelectedNodeIds,
  });

  // Initial fit on mount. Still in the view on purpose: in a new file
  // exhaustive-deps is an error, and adding `handleFitToScreen` would re-run
  // this effect on every layout change — re-fitting the canvas after each
  // edit instead of once on mount, which is the behaviour this timing guards.
  useEffect(() => {
    const timer = setTimeout(() => {
      handleFitToScreen();
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  // applyTreeChange, handleMoveSibling, handleZoomStep, the clipboard and its
  // copy/cut/paste, `isBlankCanvasTarget` and `startEditingRef` moved to
  // useMindmapTreeOps and useMindmapViewport (batch 3, wave 2c); they arrive
  // back from those calls above. `isBlankCanvasTarget` is a pure predicate, so
  // the canvas-level gestures below keep asking it first, exactly as before.

  /** Double-clicking empty canvas adds a branch under the root, ready to name. */
  const handleCanvasDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!editable || !isBlankCanvasTarget(e.target)) return;
      e.preventDefault();

      const { nextTree, newNodeId } = addChildNode(tree, tree.id, "新建子主题");
      applyTreeChange(nextTree);
      setSelectedNodeIds(new Set([newNodeId]));
      startEditingRef.current(newNodeId);
    },
    [applyTreeChange, editable, isBlankCanvasTarget, tree],
  );

  /**
   * Right-clicking empty canvas opens the canvas menu.
   *
   * Reported with a null nodeId rather than the root's, because the canvas menu
   * offers actions with no subject — paste, expand all, fit to screen — and
   * quietly addressing the root would put "delete" one mis-click away from a
   * gesture aimed at nothing.
   */
  const handleCanvasContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!isBlankCanvasTarget(e.target)) return;
      e.preventDefault();

      const containerRect = containerRef.current?.getBoundingClientRect();
      setContextMenu({
        x: containerRect ? e.clientX - containerRect.left : e.clientX,
        y: containerRect ? e.clientY - containerRect.top : e.clientY,
        nodeId: tree.id,
        isCanvas: true,
      });
    },
    [isBlankCanvasTarget],
  );

  // The marquee's state, refs and press handler moved to useMindmapViewport
  // (batch 3, wave 2c) and come back from that call. The release effect below
  // stays here on purpose: it puts the picked relation down via
  // `setSelectedRelation`, which useMindmapAnnotations returns further down —
  // the same late-bound closure the wave 2b extraction documented — and a hook
  // called before that one cannot receive the setter without changing when
  // these window listeners attach relative to the floating-drag listener,
  // which must stay the last one registered.
  const isMarqueeSelecting = marquee !== null;

  useEffect(() => {
    if (!isMarqueeSelecting) return;

    const handleMove = (e: MouseEvent) => {
      const start = marqueeStartRef.current;
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!start || !containerRect) return;

      // Pressing on bare canvas puts the picked line down, as it does the picked
      // group: there is one selection on this map, and the reader has moved on.
      setSelectedRelation(null);

      const rect = {
        x1: start.x,
        y1: start.y,
        x2: (e.clientX - containerRect.left - transform.x) / transform.scale,
        y2: (e.clientY - containerRect.top - transform.y) / transform.scale,
      };
      marqueeRectRef.current = rect;
      setMarquee(rect);
    };

    const handleUp = () => {
      const rect = marqueeRectRef.current;
      if (rect && layout) {
        const left = Math.min(rect.x1, rect.x2);
        const right = Math.max(rect.x1, rect.x2);
        const top = Math.min(rect.y1, rect.y2);
        const bottom = Math.max(rect.y1, rect.y2);

        // Intersection, not containment: requiring a node to be fully inside
        // means a box drawn across a row of branches selects nothing, which is
        // the opposite of what drawing it feels like.
        const hit = layout.nodes
          .filter(
            (n) => n.x < right && n.x + n.width > left && n.y < bottom && n.y + n.height > top,
          )
          .map((n) => n.id);
        if (hit.length) setSelectedNodeIds(new Set(hit));
      }
      marqueeStartRef.current = null;
      marqueeRectRef.current = null;
      setMarquee(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isMarqueeSelecting, layout, transform.scale, transform.x, transform.y]);

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
    isSearchOpen,
    sideChooser,
    contextMenu,
    selectedNodeIds,
    setIsSearchOpen,
    searchInputRef,
    handleCloseSearch,
    setSideChooser,
    setContextMenu,
    setSelectedNodeIds,
    handleSelectAll,
    handleCommitEdit,
    handleCancelEdit,
    handleCopyNode,
    handleCutNode,
    handlePasteNode,
    handleUndo,
    handleRedo,
    handleSyncToDocument,
    handleAddChild,
    handleAddSibling,
    handleDeleteNode,
    startEditing,
    handleZoomStep,
    handleFitToScreen,
    handleMoveSibling,
    handleNavigate,
    onClose,
  });

  // The edit-input focus effect moved to useMindmapTreeOps (batch 3, wave 2c),
  // where it keeps its place in that hook's effect sequence after the sync and
  // fold effects. The container mouse trio, the wheel zoom and the collapse
  // handlers moved to useMindmapTreeOps and useMindmapViewport and arrive back
  // from the calls above; the container's props below read them unchanged.

  // The seven ways a map leaves the app — PNG, SVG, print/PDF, OPML, FreeMind,
  // XMind and the Markdown outline. Extracted to useMindmapExport (batch 3,
  // wave 2a); isDarkUi went with it, as the image exports' only reader.
  const {
    handleExportPng,
    handleExportSvg,
    handlePrintPdf,
    handleExportOpml,
    handleExportFreeMind,
    handleExportXmind,
    handleExportMarkdownOutline,
  } = useMindmapExport({ title, tree, theme, svgRef, layout, frameBounds, collapsedIds, sidecar });

  const editingNode = useMemo(() => {
    if (!editingNodeId) return null;
    return layout.nodes.find((n) => n.id === editingNodeId) || null;
  }, [editingNodeId, layout.nodes]);

  const contextTargetNode = useMemo(() => {
    if (!contextMenu) return null;
    return findNode(tree, contextMenu.nodeId);
  }, [contextMenu, tree]);

  const isBatchMode = selectedNodeIds.size > 1;

  /**
   * Opens the style panel under whatever the toolbar pressed.
   *
   * The bar measures its own button and hands the rect over; converting it into
   * canvas coordinates belongs here, because the canvas offset is this view's to
   * know. The panel targets the primary selection, or the root when nothing is
   * selected — the same target the node context menu uses.
   */
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

  const handleStylePanelRequest = useCallback(
    (anchor: DOMRect) => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      setContextMenu({
        x: anchor.left - (containerRect?.left ?? 0),
        y: anchor.bottom - (containerRect?.top ?? 0) + 6,
        nodeId: primarySelectedId || tree.id,
      });
    },
    [primarySelectedId, tree.id],
  );

  /**
   * The node the style panel describes and every annotation control writes to:
   * the node the menu was opened on, or the root when nothing is selected — the
   * same target the node context menu uses. Declared here rather than with the
   * other derived values because both of the things it is derived from are
   * declared later than them.
   */
  const panelNodeId = contextMenu?.nodeId ?? tree.id;

  const panelLink = linkFor(sidecar, panelNodeId);
  const parsedPanelLink = parseMindmapLink(panelLink);

  /**
   * Whether this build can actually go where the panel's link points.
   *
   * Worked out here rather than in the panel, because it is a fact about what
   * this app was handed: a wiki link needs a caller that can open documents, and
   * an anchor needs a caller that can jump. The button is offered disabled with
   * the reason, rather than hidden — a control that vanishes teaches nothing.
   */
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
  const {
    selectedRelation,
    setSelectedRelation,
    handleToggleRelation,
    handleRelationChange,
    handleRelationContextMenu,
    handleRemoveSelectedRelation,
    handleStartRelationEdit,
    handleCancelRelationEdit,
    handleCommitRelationEdit,
    editingRelationBox,
    selectedRelationInfo,
    selectedFloatingId,
    setSelectedFloatingId,
    handleFloatingDragStart,
    handleStartFloatingEdit,
    handleCancelFloatingEdit,
    handleCommitFloatingEdit,
    handleRemoveFloatingTopic,
    handleFloatingContextMenu,
    handleDeleteFloatingTopic,
    handleNewFloatingTopic,
    editingFloatingBox,
    selectedSummaryId,
    setSelectedSummaryId,
    handleAddSummary,
    handleRemoveSummary,
    handleStartSummaryEdit,
    handleCancelSummaryEdit,
    handleCommitSummaryEdit,
    summaryBoxes,
    editingSummaryBox,
    selectedBoundaryId,
    setSelectedBoundaryId,
    handleAddBoundary,
    handleRemoveBoundary,
    handleBoundaryColorChange,
    handleStartBoundaryEdit,
    handleCancelBoundaryEdit,
    handleCommitBoundaryEdit,
    boundaryBoxes,
    editingBoundaryBox,
  } = useMindmapAnnotations({
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
    layout,
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
   */
  const inlineEdit = editingNode
    ? { box: editingNode, onCommit: handleCommitEdit, onCancel: handleCancelEdit }
    : editingFloatingBox
      ? {
          box: editingFloatingBox,
          onCommit: handleCommitFloatingEdit,
          onCancel: handleCancelFloatingEdit,
        }
      : editingSummaryBox
        ? {
            box: editingSummaryBox,
            onCommit: handleCommitSummaryEdit,
            onCancel: handleCancelSummaryEdit,
          }
        : editingBoundaryBox
          ? {
              box: editingBoundaryBox,
              onCommit: handleCommitBoundaryEdit,
              onCancel: handleCancelBoundaryEdit,
            }
          : editingRelationBox
            ? {
                box: editingRelationBox,
                onCommit: handleCommitRelationEdit,
                onCancel: handleCancelRelationEdit,
              }
            : null;

  const selectedIds = [...selectedNodeIds];
  const selectionRelated =
    selectedIds.length === 2 ? areRelated(sidecar, selectedIds[0], selectedIds[1]) : false;

  const canOpenPanelLink =
    parsedPanelLink?.kind === "external" ||
    (parsedPanelLink?.kind === "anchor" && !!onJumpToHeading) ||
    (parsedPanelLink?.kind === "wiki" && !!onWikiLinkClick);

  /**
   * Where a floating topic's link can go.
   *
   * The same question minus the anchor: `#标题` is followed by looking the heading
   * up in the outline, and a topic that is not in the outline has no heading to
   * find. Saying so in the panel is better than offering the button and then
   * doing nothing.
   */
  const canOpenFloatingLink =
    parsedPanelLink?.kind === "external" || (parsedPanelLink?.kind === "wiki" && !!onWikiLinkClick);

  /** The floating topic the menu is about, for a title and a delete. */
  const contextTargetFloating =
    floatingBoxes.find((topic) => topic.id === contextMenu?.nodeId) ?? null;

  return (
    <div
      ref={containerRef}
      className={`mindmap-view-container ${isDragging ? "is-dragging" : ""} ${
        isSemiCompact ? "is-semi-compact" : ""
      } ${isCompact ? "is-compact" : ""} ${isNarrow ? "is-narrow" : ""} ${
        isUltraNarrow ? "is-ultra-narrow" : ""
      }`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Top Floating Clean & Spacious Control Bar */}
      <MindmapToolbar
        title={tree.text || title}
        nodeCount={layout.nodes.length}
        selectedCount={selectedNodeIds.size}
        editable={editable}
        canSyncToDocument={editable && !!onSourceChange}
        hasUnsyncedChanges={hasUnsyncedChanges}
        isUltraNarrow={isUltraNarrow}
        scale={transform.scale}
        themeId={activeThemeId}
        layoutId={activeLayoutId}
        search={{
          isOpen: isSearchOpen,
          query: searchQuery,
          matchIds: searchMatchIds,
          currentIndex: currentSearchIndex,
          inputRef: searchInputRef,
          onToggle: () => {
            setIsSearchOpen((prev) => {
              const next = !prev;
              // Focus after the field exists, hence the delay: it is rendered
              // by the same state change that this returns.
              if (next) setTimeout(() => searchInputRef.current?.focus(), 60);
              return next;
            });
          },
          onQueryChange: handleSearch,
          onPrev: handlePrevSearch,
          onNext: handleNextSearch,
          onClose: handleCloseSearch,
        }}
        onSyncToDocument={handleSyncToDocument}
        onAddSibling={() => handleAddSibling()}
        onAddChild={() => handleAddChild()}
        onStylePanelRequest={handleStylePanelRequest}
        onSelectAll={handleSelectAll}
        onCollapseToLevel2={handleCollapseToLevel2}
        onExpandAll={handleExpandAll}
        onPickTheme={handlePickTheme}
        onPickLayout={handlePickLayout}
        numbering={showNumbering}
        onToggleNumbering={handleToggleNumbering}
        onZoomStep={handleZoomStep}
        onFitToScreen={handleFitToScreen}
        onExportPng={handleExportPng}
        onExportSvg={handleExportSvg}
        onPrintPdf={handlePrintPdf}
        onExportOpml={handleExportOpml}
        onExportFreeMind={handleExportFreeMind}
        onExportXmind={handleExportXmind}
        onExportMarkdownOutline={handleExportMarkdownOutline}
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
        marquee={marquee}
        layout={layout}
        mindmapTheme={mindmapTheme}
        hoveredNodeId={hoveredNodeId}
        selectedNodeIds={selectedNodeIds}
        draggingNodeId={draggingNodeId}
        dragGhostPos={dragGhostPos}
        dropTargetId={dropTargetId}
        handleCanvasMouseDown={handleCanvasMouseDown}
        handleCanvasDoubleClick={handleCanvasDoubleClick}
        handleCanvasContextMenu={handleCanvasContextMenu}
        backLayers={
          <>
            {/* Boundaries are the backmost layer, since a box is a background for
                the group it encloses: the branches leaving those topics pass over
                it, as they do on paper. */}
            <MindmapBoundaries
              boundaries={boundaryBoxes}
              selectedId={selectedBoundaryId}
              onSelect={setSelectedBoundaryId}
              onStartEdit={handleStartBoundaryEdit}
            />

            {/* Relations next, so they pass under the outline rather than across
                it — a line over a label costs both of them their legibility. */}
            <MindmapRelationLines
              relations={relations}
              boxes={relationBoxes}
              selectedKey={
                selectedRelation ? `${selectedRelation.fromId}\u0000${selectedRelation.toId}` : null
              }
              onSelect={setSelectedRelation}
              onStartLabelEdit={handleStartRelationEdit}
              onOpenMenu={handleRelationContextMenu}
            />
          </>
        }
        nodeLayer={
          <MindmapNodeLayer
            nodes={layout.nodes}
            mindmapTheme={mindmapTheme}
            sidecar={sidecar}
            editable={editable}
            hoveredNodeId={hoveredNodeId}
            setHoveredNodeId={setHoveredNodeId}
            selectedNodeIds={selectedNodeIds}
            setSelectedNodeIds={setSelectedNodeIds}
            containerRef={containerRef}
            setContextMenu={setContextMenu}
            dropTargetId={dropTargetId}
            dropPosition={dropPosition}
            searchMatchIds={searchMatchIds}
            currentSearchIndex={currentSearchIndex}
            tree={tree}
            onJumpToHeading={onJumpToHeading}
            startEditing={startEditing}
            handleOpenLink={handleOpenLink}
            numbering={numbering}
            handleToggleCollapse={handleToggleCollapse}
            setResizingNode={setResizingNode}
            handleUpdateStyle={handleUpdateStyle}
            nodeDragStartRef={nodeDragStartRef}
          />
        }
        frontLayers={
          <>
            {/* Summary brackets, then free topics: both are the reader's own
                additions and sit above the outline, and a free topic is the one a
                reader drags over other things. */}
            <MindmapSummaries
              summaries={summaryBoxes}
              selectedId={selectedSummaryId}
              onSelect={setSelectedSummaryId}
              onStartEdit={handleStartSummaryEdit}
            />

            {/* Free topics last, so they sit above the outline: they are the
                reader's own additions, and one dragged over a branch should stay
                visible rather than slide underneath it. */}
            <MindmapFloatingTopics
              topics={floatingBoxes}
              selectedId={selectedFloatingId}
              onSelect={setSelectedFloatingId}
              onStartEdit={handleStartFloatingEdit}
              onStartDrag={handleFloatingDragStart}
              onOpenMenu={handleFloatingContextMenu}
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
    </div>
  );
});
