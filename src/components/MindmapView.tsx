import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
// The icons the style panel draws with went with it; what is left here is the
// canvas, the toolbar and the inline editor.
import type { Heading, ThemeMode, MindmapNodeShape, MindmapLineStyle, MindmapTextAlign } from "../core/types";
import {
  buildMindmapTree,
  parseMarkdownToMindmapTree,
  syncMindmapToDocument,
  addChildNode,
  addSiblingNode,
  deleteNode,
  updateNodeText,
  updateNodesStyle,
  findNode,
  findParent,
  findSibling,
  reparentNode,
  planDrop,
  moveWithinSiblings,
  copySubtree,
  pasteSubtree,
  searchMindmapNodes,
  exportMindmapToOpml,
  exportMindmapToFreeMind,
  exportMindmapToMarkdownOutline,
  calculateNodeDimensions,
} from "../services/mindmapService";
import type { MindmapNode } from "../core/types";
import {
  loadMindmapCollapsed,
  saveMindmapCollapsed,
  loadMindmapTheme,
  saveMindmapTheme,
  loadMindmapLayout,
  saveMindmapLayout,
  loadMindmapNumbering,
  saveMindmapNumbering,
} from "../services/storage";
import { buildStandaloneMindmapSvg } from "../services/mindmapSvgExport";
import { MindmapCanvasMenu } from "./MindmapCanvasMenu";
import { MindmapNodeStyleMenu } from "./MindmapNodeStyleMenu";
import { MindmapInlineEditor } from "./MindmapInlineEditor";
import { MindmapToolbar } from "./MindmapToolbar";
import {
  DEFAULT_THEME_ID,
  MINDMAP_THEMES,
  branchColorFor,
  freezeAppearance,
  resolveThemeId,
  type MindmapTheme,
} from "../core/mindmapThemes";
import {
  DEFAULT_LAYOUT_ID,
  layoutMindmap,
  resolveLayoutId,
  type MindmapLayoutNode,
} from "../services/mindmapLayout";
import {
  allTags,
  emptySidecar,
  areRelated,
  iconFor,
  linkFor,
  loadSidecar,
  mergeSidecar,
  type SidecarSection,
  markersFor,
  noteFor,
  saveSidecar,
  setNodeIcon,
  setNodeLink,
  setNodeNote,
  setNodePriority,
  setNodeProgress,
  addFloatingTopic,
  floatingTopics,
  moveFloatingTopic,
  removeFloatingTopic,
  setFloatingText,
  setNodeTags,
  tagsFor,
  toggleRelation,
  type MindmapSidecar,
} from "../services/mindmapSidecar";
import { boundsOfBoxes, unionBounds } from "../core/mindmapBounds";
import { MindmapFloatingTopics, type FloatingBox } from "./MindmapFloatingTopics";
import { findMindmapIcon } from "../core/mindmapIcons";
import { numberingFor } from "../core/mindmapNumbering";
import { parseMindmapLink } from "../core/mindmapLinks";
import { NodeLinkMark, NodeMarks, NodeTags } from "./MindmapMarks";
import { MindmapRelationLines } from "./MindmapRelationLines";

/**
 * How long a note waits before it is written.
 *
 * Writing on every keystroke would mean a disk write per character. Long enough
 * to cover a burst of typing, short enough that a reader who types and then
 * moves on never notices the pause.
 */
const NOTE_SAVE_DELAY = 600;

/**
 * A node's icon, drawn on its leading edge and outside its box.
 *
 * Outside on purpose: a node's size is the layout's business, and growing the
 * box to fit a drawing would move every node in the map — the golden layout
 * snapshots exist to stop exactly that kind of drift. An id this build does not
 * know draws nothing rather than breaking the map.
 */
function NodeIcon({ iconId, height }: { iconId: string; height: number }) {
  const icon = findMindmapIcon(iconId);
  if (!icon) return null;
  const Icon = icon.Icon;
  return <Icon className="mindmap-node-icon" size={16} x={-22} y={(height - 16) / 2} strokeWidth={1.8} />;
}

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

/**
 * Calculates optimal contrast text color (dark vs white) based on background luminance.
 */
function getContrastTextColor(hexColor?: string): string {
  if (!hexColor || hexColor === "transparent") return "";
  const hex = hexColor.replace("#", "");
  if (hex.length !== 6) return "#ffffff";
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "#ffffff";
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#0f172a" : "#ffffff";
}

/**
 * Whether the app's own chrome is dark.
 *
 * Only the exports need it, and only as the fallback for a node that has no
 * colour of its own: a map written to a file has no stylesheet behind it, so
 * "transparent" would mean "whatever the program opening it decides".
 */
function isDarkUi(theme: ThemeMode): boolean {
  return (
    theme === "twitter" ||
    (theme === "system" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches)
  );
}

/**
 * Where the collapse toggle sits on a node: just outside the edge its children
 * are on.
 *
 * The answer comes from the layout — either the `side` field the connector pass
 * also uses, or, when the children are spread around the node rather than on one
 * edge, the offset the radial layout worked out. Only the layout knows which way
 * a branch grows; reading it here rather than re-deriving it from coordinates is
 * what keeps the toggle and the connectors agreeing after a layout switch.
 */
function collapseToggleAnchor(node: MindmapLayoutNode): string {
  if (node.toggleOffset) return `translate(${node.toggleOffset.x}, ${node.toggleOffset.y})`;
  if (node.side === "left") return `translate(-1, ${node.height / 2})`;
  if (node.side === "top") return `translate(${node.width / 2}, -1)`;
  if (node.side === "bottom") return `translate(${node.width / 2}, ${node.height + 1})`;
  return `translate(${node.width + 1}, ${node.height / 2})`;
}

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
  /**
   * The theme the reader picked, or null while the document's own is unknown.
   *
   * Null is a real state rather than a placeholder: it means nobody has chosen
   * for this document yet, so the stored value — or the caller's prop, or the
   * default — applies. Collapsing that into a single string would lose the
   * difference between "this document says dark" and "dark is what we fall back
   * to", and the first is what has to be written back unchanged.
   */
  const [pickedThemeId, setPickedThemeId] = useState<string | null>(null);

  // Load the document's theme when the document changes. Unlike the folds,
  // there is no matching save effect, so no guard is needed here: the write
  // happens in the handler below, which only runs on a deliberate choice.
  useEffect(() => {
    setPickedThemeId(documentKey ? loadMindmapTheme(documentKey) : null);
  }, [documentKey]);

  const activeThemeId = resolveThemeId(pickedThemeId ?? themeId ?? DEFAULT_THEME_ID);
  const mindmapTheme: MindmapTheme = MINDMAP_THEMES[activeThemeId];

  const handlePickTheme = useCallback(
    (next: string) => {
      setPickedThemeId(next);
      // Only a document with a path can be remembered. A preview of unsaved
      // text has nowhere to file the choice, and inventing a key for it would
      // mean every such preview shared one.
      if (documentKey) saveMindmapTheme(documentKey, next);
    },
    [documentKey]
  );

  /**
   * The layout the reader picked, or null while the document's own is unknown.
   *
   * Same shape as the theme above, and for the same reason: null means "nobody
   * has chosen for this document", which is not the same as "this document chose
   * the default", and the deliberate choice has to survive a round trip as
   * itself. There is no caller-supplied prop to fall back to — a layout has no
   * equivalent of the theme's frontmatter, and inventing one would be a second
   * source of truth for a value only this view reads.
   */
  const [pickedLayoutId, setPickedLayoutId] = useState<string | null>(null);

  useEffect(() => {
    setPickedLayoutId(documentKey ? loadMindmapLayout(documentKey) : null);
  }, [documentKey]);

  const activeLayoutId = resolveLayoutId(pickedLayoutId ?? DEFAULT_LAYOUT_ID);

  const handlePickLayout = useCallback(
    (next: string) => {
      setPickedLayoutId(next);
      // A layout is a property of the document, like the theme, so it is filed
      // under the same key. A preview with no path behind it cannot be
      // remembered, and inventing a key would make all such previews share one.
      if (documentKey) saveMindmapLayout(documentKey, next);
    },
    [documentKey]
  );

  /**
   * Whether outline numbers are drawn beside the nodes.
   *
   * A view state, remembered per document like the layout and the theme: some
   * maps are read as outlines and want numbers, others are read as pictures and
   * do not. Nothing about the tree changes either way — the numbers are drawn,
   * never written — so there is nothing to undo when it is switched off.
   */
  const [showNumbering, setShowNumbering] = useState(false);

  useEffect(() => {
    setShowNumbering(documentKey ? loadMindmapNumbering(documentKey) : false);
  }, [documentKey]);

  const handleToggleNumbering = useCallback(() => {
    const next = !showNumbering;
    setShowNumbering(next);
    if (documentKey) saveMindmapNumbering(documentKey, next);
  }, [documentKey, showNumbering]);

  /**
   * The document's companion file: what the map knows that the document does not.
   *
   * Held as the reader's text rather than as what is on disk — the two differ by
   * up to one pause in typing, since a write per keystroke would be a write per
   * character. `null` means no companion was found, which is the ordinary state
   * of a document nobody has annotated.
   */
  const [sidecar, setSidecar] = useState<MindmapSidecar | null>(null);
  const [sidecarSaveFailed, setSidecarSaveFailed] = useState(false);

  /**
   * The free topic the reader has picked, if any.
   *
   * Kept apart from the tree's selection deliberately. Everything that acts on
   * selected nodes — delete, style, relate, batch — assumes its ids are nodes,
   * and one of them forgetting would act on the wrong thing; a second piece of
   * state is cheaper than auditing all of them.
   */
  const [selectedFloatingId, setSelectedFloatingId] = useState<string | null>(null);
  const [editingFloatingId, setEditingFloatingId] = useState<string | null>(null);

  /**
   * The drag in progress, in a ref rather than in state.
   *
   * A ref because the window listeners below are attached once and must read the
   * current drag without being re-attached on every frame of it, and because a
   * drag updating state on each move would re-render for something that is
   * already visible.
   */
  const [draggingFloatingId, setDraggingFloatingId] = useState<string | null>(null);
  const draggingFloatingOffsetRef = useRef<{ x: number; y: number } | null>(null);

  /**
   * The sections the reader has edited since this document was opened.
   *
   * Kept so a load that lands late can be merged rather than applied outright:
   * the reader's edits win for the sections they touched and the file wins for
   * the rest. Without it, a slow read silently undoes whatever was clicked while
   * it was in flight — and, worse, the save that follows writes that undo out.
   */
  const editedSectionsRef = useRef<Set<SidecarSection>>(new Set());

  useEffect(() => {
    let cancelled = false;
    editedSectionsRef.current = new Set();
    setSidecar(null);
    setSidecarSaveFailed(false);
    if (!documentKey) return;

    void loadSidecar(documentKey).then((loaded) => {
      if (cancelled) return;
      // Nothing has been touched: the file is simply what is on screen.
      if (editedSectionsRef.current.size === 0) {
        setSidecar(loaded);
        return;
      }
      setSidecar((current) => mergeSidecar(loaded, current, editedSectionsRef.current));
    });
    return () => {
      cancelled = true;
    };
  }, [documentKey]);

  const pendingSidecarSave = useRef<{ key: string; sidecar: MindmapSidecar } | null>(null);
  const sidecarSaveTimer = useRef<number | null>(null);

  /**
   * Writes notes to the companion file, a pause after typing stops.
   *
   * The document key and the contents are captured when the pause starts rather
   * than read when it ends: switching documents mid-pause would otherwise write
   * the previous document's notes into the new document's file, which is the one
   * way this could lose writing rather than merely delay it.
   */
  const scheduleSidecarSave = useCallback((key: string, next: MindmapSidecar) => {
    pendingSidecarSave.current = { key, sidecar: next };
    if (sidecarSaveTimer.current !== null) window.clearTimeout(sidecarSaveTimer.current);
    sidecarSaveTimer.current = window.setTimeout(() => {
      sidecarSaveTimer.current = null;
      const pending = pendingSidecarSave.current;
      pendingSidecarSave.current = null;
      if (!pending) return;
      void saveSidecar(pending.key, pending.sidecar).then((ok) => setSidecarSaveFailed(!ok));
    }, NOTE_SAVE_DELAY);
  }, []);

  useEffect(
    () => () => {
      // A pause still running when the view goes away is written out now, so
      // closing the map right after typing does not lose what was typed.
      if (sidecarSaveTimer.current !== null) window.clearTimeout(sidecarSaveTimer.current);
      const pending = pendingSidecarSave.current;
      pendingSidecarSave.current = null;
      if (pending) void saveSidecar(pending.key, pending.sidecar);
    },
    []
  );

  /**
   * An annotation edit: immediate in memory, written shortly afterwards.
   *
   * One path for every kind of annotation rather than one per kind, so there is
   * a single pause to reason about and a single place where the document a write
   * belongs to is decided.
   */
  const applySidecarEdit = useCallback(
    (
      sections: SidecarSection[],
      edit: (current: MindmapSidecar) => MindmapSidecar
    ) => {
      editedSectionsRef.current = new Set([...editedSectionsRef.current, ...sections]);
      const next = edit(sidecar ?? emptySidecar());
      setSidecar(next);
      if (documentKey) scheduleSidecarSave(documentKey, next);
    },
    [documentKey, scheduleSidecarSave, sidecar]
  );

  /**
   * A note edit arrives on every keystroke, since the panel holds no state of its
   * own; only the disk write waits, which is why the text never lags the typing.
   */
  const handleNoteChange = useCallback(
    (nodeId: string, text: string) =>
      applySidecarEdit(["notes"], (current) => setNodeNote(current, nodeId, text)),
    [applySidecarEdit]
  );

  /**
   * An icon edit. One icon per node: picking the one a node already wears takes
   * it off, which is the only way to say "none" without a menu of its own.
   */
  const handleIconChange = useCallback(
    (nodeId: string, iconId: string) =>
      applySidecarEdit(["icons"], (current) => setNodeIcon(current, nodeId, iconId)),
    [applySidecarEdit]
  );

  /** A node's link, as typed. Stored verbatim; read when someone follows it. */
  const handleLinkChange = useCallback(
    (nodeId: string, text: string) =>
      applySidecarEdit(["links"], (current) => setNodeLink(current, nodeId, text)),
    [applySidecarEdit]
  );

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
    [onJumpToHeading]
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
        const bridge =
          typeof window !== "undefined"
            ? window.knowSpaceDesktop ?? window.bookMDDesktop
            : undefined;
        void bridge?.openExternal?.(link.target);
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
    [followAnchor, onWikiLinkClick, sidecar]
  );

  /** A node's tags, replaced wholesale — the list is what the panel edits. */
  const handleTagsChange = useCallback(
    (nodeId: string, tags: string[]) =>
      applySidecarEdit(["tags"], (current) => setNodeTags(current, nodeId, tags)),
    [applySidecarEdit]
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
          : setNodeProgress(current, nodeId, value)
      ),
    [applySidecarEdit]
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const lastEmittedSourceRef = useRef<string>("");

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

  // Keep tree in sync if external document structure changes, while protecting active unsynced mindmap edits
  useEffect(() => {
    if (source && source.trim() && source !== lastEmittedSourceRef.current) {
      if (!hasUnsyncedChanges) {
        setTree(parseMarkdownToMindmapTree(source, title));
      }
    }
  }, [source, title, hasUnsyncedChanges]);

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
   */
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
    isCanvas?: boolean;
  } | null>(null);

  /** Marquee selection, in canvas coordinates, while dragging on empty space. */
  const [marquee, setMarquee] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
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

  // Undo / Redo history stacks (retained for keyboard shortcuts Ctrl+Z / Ctrl+Y)
  const undoStackRef = useRef<MindmapNode[]>([]);
  const redoStackRef = useRef<MindmapNode[]>([]);

  // Pan & Zoom transform state
  const [transform, setTransform] = useState({ x: 60, y: 80, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, startTransformX: 0, startTransformY: 0 });

  // Node collapse state
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  /**
   * The document whose folds are currently in `collapsedIds`.
   *
   * Guards the save below. Without it, opening a second document would write
   * the first document's folds under the second one's key: the save effect runs
   * once with the previous set still in state, before the restore has landed.
   */
  const collapsedKeyRef = useRef<string | undefined>(undefined);

  // Restore this document's folds when the document changes.
  useEffect(() => {
    if (!documentKey) {
      collapsedKeyRef.current = undefined;
      return;
    }

    // Ids for nodes that no longer exist are dropped. The document may have
    // been edited since the folds were saved, and a stale id would otherwise
    // sit in storage forever without ever being read back.
    const present = new Set<string>();
    const collect = (node: MindmapNode) => {
      present.add(node.id);
      for (const child of node.children ?? []) collect(child);
    };
    collect(tree);

    const restored = loadMindmapCollapsed(documentKey).filter((id) => present.has(id));
    collapsedKeyRef.current = documentKey;
    setCollapsedIds(new Set(restored));
    // Deliberately keyed on documentKey alone: re-running when the tree changes
    // would re-apply the stored folds over ones the reader has just made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentKey]);

  // Save folds as they change. Folding is a discrete click rather than a
  // per-frame drag, so unlike the pane widths there is nothing to gain by
  // deferring the write.
  useEffect(() => {
    if (!documentKey || collapsedKeyRef.current !== documentKey) return;
    saveMindmapCollapsed(documentKey, [...collapsedIds]);
  }, [collapsedIds, documentKey]);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Node manual resizing state
  const [resizingNode, setResizingNode] = useState<{
    nodeId: string;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  // Compute 2D layout coordinates
  const layout = useMemo(() => {
    return layoutMindmap(tree, collapsedIds, activeLayoutId);
  }, [tree, collapsedIds, activeLayoutId]);

  /**
   * Numbers by node id, or nothing while the switch is off.
   *
   * Derived from the tree rather than from the layout, which is the point of the
   * split: folding a branch or changing the layout cannot renumber anything,
   * because neither is an input here — only the document's own structure is.
   */
  const numbering = useMemo(() => (showNumbering ? numberingFor(tree) : null), [showNumbering, tree]);

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
      return { id, text: topic.text, lines, x: topic.x, y: topic.y, width, height };
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
        ])
      ),
    [layout]
  );

  /** The stored relations, or nothing while the file is still being read. */
  const relations = sidecar?.relations ?? [];

  /**
   * Fits the whole map onto the printed page.
   *
   * On screen this is an infinite canvas, and what is visible is decided by the
   * reader's pan and zoom; a printed page has no reader, so the map has to be
   * fitted to the paper instead. The print stylesheet drops the pan and zoom
   * transform, but it cannot supply a view box, because that depends on where
   * the layout put everything — which is why this half is code and runs on the
   * print event the browser (and Electron's printToPDF) fires around printing.
   *
   * Whatever was there before is put back afterwards, including nothing: the
   * canvas normally has no view box at all, and leaving one behind would change
   * how the map is drawn until the next reload.
   */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    let restore: string | null = null;

    const handleBeforePrint = () => {
      restore = svg.getAttribute("viewBox");
      const { minX, minY, width, height } = frameBounds;
      svg.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
    };

    const handleAfterPrint = () => {
      if (restore === null) svg.removeAttribute("viewBox");
      else svg.setAttribute("viewBox", restore);
      restore = null;
    };

    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
      handleAfterPrint();
    };
  }, [frameBounds]);

  // Drag-and-drop reparenting state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragGhostPos, setDragGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  /**
   * Where the dragged node would land relative to the node under the pointer.
   *
   * "before" and "after" slot it between that node's siblings; "child" makes it
   * a child, which is what dropping on the middle of a node has always meant.
   *
   * Before this, a drop could only ever append: reparentNode has taken a
   * targetIndex since it was written, and nothing ever passed one.
   */
  const [dropPosition, setDropPosition] = useState<"before" | "after" | "child">("child");
  const nodeDragStartRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    hasMoved: boolean;
  } | null>(null);

  // In-canvas search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatchIds, setSearchMatchIds] = useState<string[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const focusOnNode = useCallback((nodeId: string) => {
    if (!layout || !containerRef.current) return;
    const target = layout.nodes.find((n) => n.id === nodeId);
    if (!target) return;
    const cWidth = containerRef.current.clientWidth;
    const cHeight = containerRef.current.clientHeight;
    const targetCenterX = target.x + target.width / 2;
    const targetCenterY = target.y + target.height / 2;
    setTransform((prev) => ({
      ...prev,
      x: Math.round(cWidth / 2 - targetCenterX * prev.scale),
      y: Math.round(cHeight / 2 - targetCenterY * prev.scale),
    }));
    setSelectedNodeIds(new Set([nodeId]));
  }, [layout]);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchMatchIds([]);
      setCurrentSearchIndex(0);
      return;
    }
    const matches = searchMindmapNodes(tree, q);
    setSearchMatchIds(matches);
    setCurrentSearchIndex(0);
    if (matches.length > 0) {
      focusOnNode(matches[0]);
    }
  }, [focusOnNode, tree]);

  const handleNextSearch = useCallback(() => {
    if (searchMatchIds.length === 0) return;
    const nextIdx = (currentSearchIndex + 1) % searchMatchIds.length;
    setCurrentSearchIndex(nextIdx);
    focusOnNode(searchMatchIds[nextIdx]);
  }, [currentSearchIndex, focusOnNode, searchMatchIds]);

  const handlePrevSearch = useCallback(() => {
    if (searchMatchIds.length === 0) return;
    const prevIdx = (currentSearchIndex - 1 + searchMatchIds.length) % searchMatchIds.length;
    setCurrentSearchIndex(prevIdx);
    focusOnNode(searchMatchIds[prevIdx]);
  }, [currentSearchIndex, focusOnNode, searchMatchIds]);

  /**
   * Closes the search and clears it.
   *
   * One callback rather than the same three setters written out at each of the
   * four places that dismiss the search — the field's Escape, its close button,
   * the canvas Escape and now the extracted group. Clearing the query on close
   * is part of it: leaving it behind means reopening shows stale matches with
   * no focused node, which reads as the search being broken.
   */
  const handleCloseSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery("");
    setSearchMatchIds([]);
    setCurrentSearchIndex(0);
  }, []);

  // Select all nodes handler
  const handleSelectAll = useCallback(() => {
    if (!layout || layout.nodes.length === 0) return;
    setSelectedNodeIds(new Set(layout.nodes.map((n) => n.id)));
  }, [layout]);

  // Fit to screen helper
  const handleFitToScreen = useCallback(() => {
    const container = containerRef.current;
    if (!container || !layout) return;

    const cWidth = container.clientWidth;
    const cHeight = container.clientHeight;
    const { width: lWidth, height: lHeight, minX, minY } = frameBounds;

    if (lWidth === 0 || lHeight === 0) return;

    const scaleX = (cWidth - 140) / lWidth;
    const scaleY = (cHeight - 140) / lHeight;
    const newScale = Math.max(0.4, Math.min(1.15, Math.min(scaleX, scaleY)));

    const newX = (cWidth - lWidth * newScale) / 2 - minX * newScale;
    const newY = (cHeight - lHeight * newScale) / 2 - minY * newScale;

    setTransform({ x: Math.round(newX), y: Math.round(newY), scale: Number(newScale.toFixed(2)) });
  }, [layout]);

  // Initial fit on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      handleFitToScreen();
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  // Tree mutation & Non-destructive Markdown synchronization
  const applyTreeChange = useCallback(
    (nextTree: MindmapNode) => {
      undoStackRef.current.push(tree);
      redoStackRef.current = [];
      setTree(nextTree);
      setHasUnsyncedChanges(true);
    },
    [tree]
  );

  /**
   * Reorders the selected node among its siblings; Alt+↑ and Alt+↓.
   *
   * Only the first selected node moves, and never the root — it has no siblings
   * to move among. A move that would run off either end returns the same tree
   * and is skipped, so it does not push an undo entry that undoes nothing.
   */
  const handleMoveSibling = useCallback(
    (delta: number) => {
      const nodeId = [...selectedNodeIds][0];
      if (!nodeId || nodeId === tree.id) return;

      const nextTree = moveWithinSiblings(tree, nodeId, delta);
      if (nextTree === tree) return;
      applyTreeChange(nextTree);
    },
    [applyTreeChange, selectedNodeIds, tree]
  );

  /**
   * Steps the zoom, keeping the centre of the viewport fixed.
   *
   * The wheel handler anchors on the cursor; from a keyboard there is no cursor
   * to anchor to, so the middle of the canvas is the equivalent choice.
   */
  const handleZoomStep = useCallback((factor: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const centreX = rect.width / 2;
    const centreY = rect.height / 2;

    setTransform((prev) => {
      const nextScale = Math.max(0.25, Math.min(2.5, Number((prev.scale * factor).toFixed(3))));
      const scaleRatio = nextScale / prev.scale;
      return {
        ...prev,
        scale: nextScale,
        x: centreX - (centreX - prev.x) * scaleRatio,
        y: centreY - (centreY - prev.y) * scaleRatio,
      };
    });
  }, []);

  /**
   * The copied branch.
   *
   * A ref rather than state, deliberately: nothing renders from it, and the
   * paste shortcut reads it at the moment it runs — putting it in state would
   * re-render the whole canvas on every copy for no visible change. It is not
   * the system clipboard either; what is copied is a tree, not text.
   */
  const clipboardRef = useRef<MindmapNode | null>(null);

  const handleCopyNode = useCallback(() => {
    const nodeId = [...selectedNodeIds][0];
    if (!nodeId) return;
    const copied = copySubtree(tree, nodeId);
    if (copied) clipboardRef.current = copied;
  }, [selectedNodeIds, tree]);

  const handleCutNode = useCallback(() => {
    const nodeId = [...selectedNodeIds][0];
    // The root is refused: cutting it would leave no tree to paste into.
    if (!nodeId || nodeId === tree.id) return;

    const copied = copySubtree(tree, nodeId);
    if (!copied) return;
    clipboardRef.current = copied;

    // deleteNode returns the tree *and* what to select afterwards, so a cut
    // leaves a sensible selection rather than nothing selected.
    const { nextTree, fallbackSelectedId } = deleteNode(tree, nodeId);
    applyTreeChange(nextTree);
    setSelectedNodeIds(new Set([fallbackSelectedId]));
  }, [applyTreeChange, selectedNodeIds, tree]);

  const handlePasteNode = useCallback(() => {
    const copied = clipboardRef.current;
    if (!copied) return;

    // Pasted under the selection, so a paste into empty space lands on the root
    // rather than doing nothing.
    const result = pasteSubtree(tree, [...selectedNodeIds][0], copied);
    if (!result) return;

    applyTreeChange(result.nextTree);
    setSelectedNodeIds(new Set([result.newNodeId]));
  }, [applyTreeChange, selectedNodeIds, tree]);

  /**
   * Whether an event landed on bare canvas.
   *
   * The svg receives everything, including events from the nodes inside it, so
   * every canvas-level gesture has to ask this first. Without it a double-click
   * on a node would both edit that node and create a new one.
   */
  const isBlankCanvasTarget = useCallback((target: EventTarget | null): boolean => {
    const element = target as HTMLElement | SVGElement | null;
    if (!element || typeof element.closest !== "function") return true;
    return !(
      element.closest(".mindmap-node-interactive") ||
      element.closest(".mindmap-toolbar") ||
      element.closest(".mindmap-inline-edit-input") ||
      element.closest(".mindmap-context-menu")
    );
  }, []);

  /**
   * Reaches startEditing, which is declared further down.
   *
   * A ref rather than a direct call because the two are in the other order, and
   * moving either would drag a sixty-line block with it. The same indirection
   * App uses for selectChapter. Assigned in an effect once startEditing exists.
   */
  const startEditingRef = useRef<(nodeId?: string) => void>(() => {});

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
    [applyTreeChange, editable, isBlankCanvasTarget, tree]
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
    [isBlankCanvasTarget]
  );

  /** Marquee selection: press on empty canvas, drag a box, release to select. */
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const marqueeRectRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const isMarqueeSelecting = marquee !== null;

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Left button only, and only on bare canvas: the pan drag starts on the
      // same surface, so anything looser would fight it.
      if (e.button !== 0 || !isBlankCanvasTarget(e.target)) return;
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      const x = (e.clientX - containerRect.left - transform.x) / transform.scale;
      const y = (e.clientY - containerRect.top - transform.y) / transform.scale;
      marqueeStartRef.current = { x, y };
      marqueeRectRef.current = { x1: x, y1: y, x2: x, y2: y };
      setMarquee(marqueeRectRef.current);
    },
    [isBlankCanvasTarget, transform.scale, transform.x, transform.y]
  );

  useEffect(() => {
    if (!isMarqueeSelecting) return;

    const handleMove = (e: MouseEvent) => {
      const start = marqueeStartRef.current;
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!start || !containerRect) return;

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
            (n) => n.x < right && n.x + n.width > left && n.y < bottom && n.y + n.height > top
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

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current.pop()!;
    redoStackRef.current.push(tree);
    setTree(prev);
    setHasUnsyncedChanges(true);
  }, [tree]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop()!;
    undoStackRef.current.push(tree);
    setTree(next);
    setHasUnsyncedChanges(true);
  }, [tree]);

  const handleSyncToDocument = useCallback(() => {
    if (!onSourceChange) return;
    const currentDoc = source || "";
    const syncedMarkdown = syncMindmapToDocument(currentDoc, tree);
    lastEmittedSourceRef.current = syncedMarkdown;
    onSourceChange(syncedMarkdown);
    setHasUnsyncedChanges(false);
  }, [source, tree, onSourceChange]);

  // Interactive Topic Actions
  const handleAddChild = useCallback(
    (parentId?: string) => {
      if (!editable) return;
      const targetId = parentId || primarySelectedId || tree.id;
      // Uncollapse if collapsed
      if (collapsedIds.has(targetId)) {
        setCollapsedIds((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
      }
      const { nextTree, newNodeId } = addChildNode(tree, targetId, "新建子主题");
      applyTreeChange(nextTree);
      setSelectedNodeIds(new Set([newNodeId]));
      setEditingNodeId(newNodeId);
      setEditingText("新建子主题");
      setContextMenu(null);
    },
    [editable, primarySelectedId, tree, collapsedIds, applyTreeChange]
  );

  const handleAddSibling = useCallback(
    (targetId?: string) => {
      if (!editable) return;
      const id = targetId || primarySelectedId || tree.id;
      const { nextTree, newNodeId } = addSiblingNode(tree, id, "新建同级主题");
      applyTreeChange(nextTree);
      setSelectedNodeIds(new Set([newNodeId]));
      setEditingNodeId(newNodeId);
      setEditingText("新建同级主题");
      setContextMenu(null);
    },
    [editable, primarySelectedId, tree, applyTreeChange]
  );

  const handleDeleteNode = useCallback(
    (nodeId?: string) => {
      if (!editable) return;
      const targetIds = nodeId ? [nodeId] : Array.from(selectedNodeIds);
      if (targetIds.length === 0) return;

      let currTree = tree;
      let lastFallback: string | null = tree.id;

      for (const id of targetIds) {
        if (id === tree.id || id === "root-mindmap-node") continue;
        const { nextTree, fallbackSelectedId } = deleteNode(currTree, id);
        currTree = nextTree;
        lastFallback = fallbackSelectedId;
      }

      applyTreeChange(currTree);
      setSelectedNodeIds(lastFallback ? new Set([lastFallback]) : new Set());
      setEditingNodeId(null);
      setContextMenu(null);
    },
    [editable, selectedNodeIds, tree, applyTreeChange]
  );

  const startEditing = useCallback(
    (nodeId?: string) => {
      if (!editable) return;
      const id = nodeId || primarySelectedId || tree.id;
      const node = findNode(tree, id);
      if (node) {
        setSelectedNodeIds(new Set([id]));
        setEditingNodeId(id);
        setEditingText(node.text);
        setContextMenu(null);
      }
    },
    [editable, primarySelectedId, tree]
  );

  // Keeps the indirection above pointing at the current startEditing. Assigning
  // during render is safe here because nothing reads it until the next
  // interaction, which is always after this line has run.
  startEditingRef.current = startEditing;

  const handleCommitEdit = useCallback(() => {
    if (!editingNodeId) return;
    if (editingText.trim()) {
      const nextTree = updateNodeText(tree, editingNodeId, editingText.trim());
      applyTreeChange(nextTree);
    }
    setEditingNodeId(null);
  }, [editingNodeId, editingText, tree, applyTreeChange]);

  const handleCancelEdit = useCallback(() => {
    setEditingNodeId(null);
  }, []);

  // Update Appearance & Typography Styles (Batch-updates all selected nodes if multiple nodes are selected!)
  const handleUpdateStyle = useCallback(
    (
      nodeId: string,
      styles: {
        color?: string;
        shape?: MindmapNodeShape;
        lineColor?: string;
        lineStyle?: MindmapLineStyle;
        fontSize?: number;
        fontWeight?: "normal" | "bold";
        textColor?: string;
        borderColor?: string;
        textAlign?: MindmapTextAlign;
        customWidth?: number;
        customHeight?: number;
      }
    ) => {
      // If multiple nodes are selected, apply to ALL selected nodes at once!
      const targetIds =
        selectedNodeIds.size > 1
          ? Array.from(selectedNodeIds)
          : [nodeId];

      const nextTree = updateNodesStyle(tree, targetIds, styles);
      applyTreeChange(nextTree);
    },
    [tree, selectedNodeIds, applyTreeChange]
  );

  // Keyboard navigation
  const handleNavigate = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      const currId = primarySelectedId || tree.id;
      if (direction === "left") {
        const parent = findParent(tree, currId);
        if (parent) setSelectedNodeIds(new Set([parent.id]));
      } else if (direction === "right") {
        const curr = findNode(tree, currId);
        if (curr?.children && curr.children.length > 0) {
          setSelectedNodeIds(new Set([curr.children[0].id]));
        }
      } else if (direction === "up") {
        const prev = findSibling(tree, currId, -1);
        if (prev) setSelectedNodeIds(new Set([prev.id]));
      } else if (direction === "down") {
        const next = findSibling(tree, currId, 1);
        if (next) setSelectedNodeIds(new Set([next.id]));
      }
    },
    [primarySelectedId, tree]
  );

  // Global Mindmap Keydown shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (editingNodeId) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleCommitEdit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          handleCancelEdit();
        }
        return;
      }

      // Ctrl+F In-Canvas Search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 60);
        return;
      }

      // Ctrl+A Select All
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        handleSelectAll();
        return;
      }

      // Copy, cut and paste the selected branch. These sit after the
      // editing guard at the top of this handler, so they never fire while
      // text is being edited — Ctrl+C in the inline editor has to stay the
      // browser's copy.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        handleCopyNode();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") {
        e.preventDefault();
        handleCutNode();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        handlePasteNode();
        return;
      }

      // Escape closes search, context menu, deselects nodes, or closes view
      if (e.key === "Escape") {
        e.preventDefault();
        if (isSearchOpen) {
          handleCloseSearch();
          return;
        }
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        if (selectedNodeIds.size > 0) {
          setSelectedNodeIds(new Set());
          return;
        }
        if (onClose) {
          onClose();
          return;
        }
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (
        (e.ctrlKey && e.key.toLowerCase() === "y") ||
        (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSyncToDocument();
        return;
      }

      if (e.key === "Tab" || e.key === "Insert") {
        e.preventDefault();
        handleAddChild();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddSibling();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleDeleteNode();
        return;
      }
      if (e.key === "F2" || e.key === " ") {
        e.preventDefault();
        startEditing();
        return;
      }
      // Zoom. Ctrl/Cmd with the usual keys, plus Ctrl+0 for fit-to-screen,
      // which until now only ran once when the canvas mounted.
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        handleZoomStep(1.15);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        handleZoomStep(0.87);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        handleFitToScreen();
        return;
      }

      // Alt+arrows reorder among siblings. This has to be tested before the
      // plain arrow navigation below, which does not look at the modifier and
      // would otherwise swallow both of these.
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        handleMoveSibling(e.key === "ArrowUp" ? -1 : 1);
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        handleNavigate("up");
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        handleNavigate("down");
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleNavigate("left");
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNavigate("right");
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    editingNodeId,
    contextMenu,
    selectedNodeIds,
    handleSelectAll,
    handleCommitEdit,
    handleCancelEdit,
    handleUndo,
    handleRedo,
    handleAddChild,
    handleAddSibling,
    handleDeleteNode,
    startEditing,
    handleNavigate,
    handleMoveSibling,
    handleCopyNode,
    handleCutNode,
    handlePasteNode,
    handleZoomStep,
    handleFitToScreen,
    onClose,
    isSearchOpen,
    handleSyncToDocument,
  ]);

  // Focus and select input on entering edit mode
  useEffect(() => {
    if (editingNodeId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingNodeId]);

  // Pan interaction handlers & blank canvas click deselect
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | SVGElement;
    if (
      target.closest(".mindmap-node-interactive") ||
      target.closest(".mindmap-toolbar") ||
      target.closest(".mindmap-inline-edit-input") ||
      target.closest(".mindmap-context-menu")
    ) {
      return;
    }
    // Clicking blank canvas background commits edit, closes menu, and cancels selection!
    if (editingNodeId) {
      handleCommitEdit();
    }
    if (contextMenu) {
      setContextMenu(null);
    }
    setSelectedNodeIds(new Set());

    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startTransformX: transform.x,
      startTransformY: transform.y,
    };
  }, [transform.x, transform.y, editingNodeId, contextMenu, handleCommitEdit]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (resizingNode) {
        const dx = (e.clientX - resizingNode.startX) / transform.scale;
        const dy = (e.clientY - resizingNode.startY) / transform.scale;
        const newWidth = Math.max(60, Math.round(resizingNode.startWidth + dx));
        const newHeight = Math.max(30, Math.round(resizingNode.startHeight + dy));
        handleUpdateStyle(resizingNode.nodeId, {
          customWidth: newWidth,
          customHeight: newHeight,
        });
        return;
      }

      if (nodeDragStartRef.current) {
        const dx = e.clientX - nodeDragStartRef.current.startX;
        const dy = e.clientY - nodeDragStartRef.current.startY;
        if (!nodeDragStartRef.current.hasMoved && Math.hypot(dx, dy) > 8) {
          nodeDragStartRef.current.hasMoved = true;
          setDraggingNodeId(nodeDragStartRef.current.nodeId);
        }
        if (nodeDragStartRef.current.hasMoved) {
          setDragGhostPos({ x: e.clientX, y: e.clientY });

          const containerRect = containerRef.current?.getBoundingClientRect();
          if (containerRect && layout) {
            const canvasX = (e.clientX - containerRect.left - transform.x) / transform.scale;
            const canvasY = (e.clientY - containerRect.top - transform.y) / transform.scale;

            let targetFound: string | null = null;
            let position: "before" | "after" | "child" = "child";
            for (const node of layout.nodes) {
              if (node.id === nodeDragStartRef.current.nodeId) continue;
              if (
                canvasX >= node.x - 25 &&
                canvasX <= node.x + node.width + 25 &&
                canvasY >= node.y - 25 &&
                canvasY <= node.y + node.height + 25
              ) {
                targetFound = node.id;
                // The upper and lower fifths reorder among siblings; the middle
                // makes the node a child. The root is exempt from the bands —
                // it has no siblings to slot between.
                if (node.id !== tree.id) {
                  const topBand = node.y + node.height * 0.2;
                  const bottomBand = node.y + node.height * 0.8;
                  if (canvasY < topBand) position = "before";
                  else if (canvasY > bottomBand) position = "after";
                }
                break;
              }
            }
            setDropTargetId(targetFound);
            setDropPosition(position);
          }
          return;
        }
      }

      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setTransform((prev) => ({
        ...prev,
        x: Math.round(dragStartRef.current.startTransformX + dx),
        y: Math.round(dragStartRef.current.startTransformY + dy),
      }));
    },
    // tree.id is here because the drop bands are skipped for the root node.
    [isDragging, resizingNode, transform.scale, transform.x, transform.y, layout, tree.id, handleUpdateStyle]
  );

  const handleMouseUp = useCallback(() => {
    if (resizingNode) {
      setResizingNode(null);
    }
    if (nodeDragStartRef.current) {
      if (nodeDragStartRef.current.hasMoved && draggingNodeId && dropTargetId) {
        // A before/after drop on the root or on one's own descendant is
        // meaningless, so planDrop returns null and the move is dropped rather
        // than silently becoming something else.
        const plan = planDrop(tree, draggingNodeId, dropTargetId, dropPosition);
        if (plan) {
          const nextTree = reparentNode(tree, draggingNodeId, plan.parentId, plan.index);
          if (nextTree !== tree) applyTreeChange(nextTree);
        }
      }
      nodeDragStartRef.current = null;
      setDraggingNodeId(null);
      setDropTargetId(null);
      setDropPosition("child");
      setDragGhostPos(null);
    }
    setIsDragging(false);
  }, [applyTreeChange, draggingNodeId, dropTargetId, dropPosition, resizingNode, tree]);

  // Wheel zoom handler
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    setTransform((prev) => {
      const nextScale = Math.max(0.25, Math.min(2.5, Number((prev.scale * zoomFactor).toFixed(3))));
      const scaleRatio = nextScale / prev.scale;
      const nextX = cursorX - (cursorX - prev.x) * scaleRatio;
      const nextY = cursorY - (cursorY - prev.y) * scaleRatio;
      return {
        x: Math.round(nextX),
        y: Math.round(nextY),
        scale: nextScale,
      };
    });
  }, []);

  // Toggle collapse for a specific node
  const handleToggleCollapse = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Expand all nodes
  const handleExpandAll = useCallback(() => {
    setCollapsedIds(new Set());
  }, []);

  // Collapse to Level 2
  const handleCollapseToLevel2 = useCallback(() => {
    const toCollapse = new Set<string>();
    for (const n of layout.nodes) {
      if (n.level >= 2 && n.hasChildren) {
        toCollapse.add(n.id);
      }
    }
    setCollapsedIds(toCollapse);
  }, [layout.nodes]);

  // Export as PNG (100% Transparent Background, correct node & text fills, zero black blocks)
  const handleExportPng = useCallback(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !layout) return;

    // The canvas cannot be written out as it is: the pan and zoom, the
    // interactive-only elements and the stylesheet colours all have to be
    // resolved first. That is one function, shared with the SVG export — the PNG
    // below is that SVG rasterised, so the two formats cannot drift apart.
    const built = buildStandaloneMindmapSvg(svgEl, {
      bounds: frameBounds,
      dark: isDarkUi(theme),
    });
    if (!built) return;

    const { svg: svgString, width: exportWidth, height: exportHeight } = built;

    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const dpr = window.devicePixelRatio || 2;
      canvas.width = exportWidth * dpr;
      canvas.height = exportHeight * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.scale(dpr, dpr);
      // Transparent background: clearRect without any fillRect
      ctx.clearRect(0, 0, exportWidth, exportHeight);
      ctx.drawImage(img, 0, 0, exportWidth, exportHeight);

      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return;
        const pngUrl = URL.createObjectURL(pngBlob);
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = `${title || "mindmap"}-思维导图.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(pngUrl);
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    img.src = url;
  }, [layout, title, theme]);

  /**
   * Export as SVG.
   *
   * The same string the PNG is rasterised from, written out as it is — so a
   * vector file costs one download and no second implementation. Text stays
   * text, which is the reason to want one: the file can be opened in an
   * illustration program and edited, or printed at any size.
   */
  const handleExportSvg = useCallback(() => {
    const built = buildStandaloneMindmapSvg(svgRef.current, {
      bounds: frameBounds,
      dark: isDarkUi(theme),
    });
    if (!built) return;

    const blob = new Blob([built.svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "mindmap"}-思维导图.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [layout, title, theme]);

  /**
   * Print the map, which is also how a PDF comes out of it.
   *
   * The application already owns this path — a print stylesheet and the main
   * process's `printToPdf` — so a map does not need a converter of its own, and
   * asking the operating system for a PDF costs no dependency. Landscape is
   * asked for because a map is wider than it is tall; the reader can still change
   * it in the dialog.
   *
   * The view box the page is drawn with is swapped in by the effect above, on the
   * event Electron fires while printing — the same event a browser fires for
   * Ctrl+P, which is the fallback when there is no bridge.
   */
  const handlePrintPdf = useCallback(() => {
    const bridge =
      typeof window !== "undefined" ? window.knowSpaceDesktop ?? window.bookMDDesktop : undefined;

    if (bridge?.printToPdf) {
      void bridge.printToPdf({ title: `${title || "mindmap"}-思维导图`, landscape: true });
      return;
    }
    window.print();
  }, [title]);

  const handleExportOpml = useCallback(() => {
    const xml = exportMindmapToOpml(tree, title);
    const blob = new Blob([xml], { type: "text/x-opml+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "mindmap"}.opml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [tree, title]);

  const handleExportFreeMind = useCallback(() => {
    // Collapsed state lives here, not on the tree, so the exporter has to be
    // told about it — without this the FOLDED attribute was never written.
    const xml = exportMindmapToFreeMind(tree, collapsedIds);
    const blob = new Blob([xml], { type: "application/x-freemind;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "mindmap"}.mm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [tree, title, collapsedIds]);

  const handleExportMarkdownOutline = useCallback(() => {
    const md = exportMindmapToMarkdownOutline(tree);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "mindmap"}-outline.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [tree, title]);

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
        "此后切换主题时，这些节点不再跟随；你手工设置过的颜色、形状与字号不会改变。\n\n是否继续？"
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
    [primarySelectedId, tree.id]
  );

  const [isSemiCompact, setIsSemiCompact] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [isUltraNarrow, setIsUltraNarrow] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        setIsSemiCompact(w < 1220);
        setIsCompact(w < 1000);
        setIsNarrow(w < 820);
        setIsUltraNarrow(w < 650);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
   * Connects the two selected topics, or disconnects them.
   *
   * The selection is the gesture: two topics chosen with Ctrl-click are exactly
   * what a relation needs, so this reads as "do something with these two" rather
   * than as a mode the reader has to enter and remember to leave. The pair is
   * normalised on the way in, so the order they were selected in cannot matter.
   */
  const handleToggleRelation = useCallback(() => {
    const ids = [...selectedNodeIds];
    if (ids.length !== 2) return;
    applySidecarEdit(["relations"], (current) => toggleRelation(current, ids[0], ids[1]));
  }, [applySidecarEdit, selectedNodeIds]);

  /**
   * The drag, listened for on the window.
   *
   * On the window rather than on the box, because once a drag has started the
   * pointer leaves the box almost immediately and a gesture that stopped
   * tracking at its edge would drop the topic wherever the reader's hand happened
   * to leave the shape. Moves are written into the map's state and the file
   * follows on its usual pause: the debounce collapses a whole drag into one
   * write, which is the only way a drag should ever reach the disk.
   */
  useEffect(() => {
    if (!draggingFloatingId) return;

    const handleMove = (event: MouseEvent) => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      const offset = draggingFloatingOffsetRef.current;
      if (!containerRect || !offset) return;

      const x = (event.clientX - containerRect.left - transform.x) / transform.scale - offset.x;
      const y = (event.clientY - containerRect.top - transform.y) / transform.scale - offset.y;
      applySidecarEdit(["floating"], (current) =>
        moveFloatingTopic(current, draggingFloatingId, Math.round(x), Math.round(y))
      );
    };

    const handleUp = () => setDraggingFloatingId(null);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [applySidecarEdit, draggingFloatingId, transform.scale, transform.x, transform.y]);

  /**
   * Starts a drag from wherever in the box the pointer went down.
   *
   * The offset is what stops a topic grabbed near its right edge from jumping so
   * that its corner sits under the cursor.
   */
  const handleFloatingDragStart = useCallback(
    (id: string, event: React.MouseEvent) => {
      const box = floatingBoxes.find((topic) => topic.id === id);
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!box || !containerRect) return;

      const pointerX = (event.clientX - containerRect.left - transform.x) / transform.scale;
      const pointerY = (event.clientY - containerRect.top - transform.y) / transform.scale;
      draggingFloatingOffsetRef.current = { x: pointerX - box.x, y: pointerY - box.y };
      setDraggingFloatingId(id);
    },
    [floatingBoxes, transform.scale, transform.x, transform.y]
  );

  const handleStartFloatingEdit = useCallback(
    (id: string) => {
      const box = floatingBoxes.find((topic) => topic.id === id);
      if (!box) return;
      setEditingFloatingId(id);
      setEditingText(box.text);
    },
    [floatingBoxes]
  );

  const handleCancelFloatingEdit = useCallback(() => setEditingFloatingId(null), []);

  /**
   * Commits a free topic's text. Emptying it takes the topic away, which is what
   * the section's own reader takes an empty topic to mean — one reading, written
   * once, so the screen and a later version cannot disagree about it.
   */
  const handleCommitFloatingEdit = useCallback(() => {
    const id = editingFloatingId;
    setEditingFloatingId(null);
    if (!id) return;
    applySidecarEdit(["floating"], (current) => setFloatingText(current, id, editingText));
  }, [applySidecarEdit, editingFloatingId, editingText]);

  const handleRemoveFloatingTopic = useCallback(() => {
    if (!selectedFloatingId) return;
    const id = selectedFloatingId;
    setSelectedFloatingId(null);
    applySidecarEdit(["floating"], (current) => removeFloatingTopic(current, id));
  }, [applySidecarEdit, selectedFloatingId]);

  /**
   * Puts a free topic where the reader right-clicked.
   *
   * The menu's coordinates are the container's, and the canvas behind it may be
   * panned and zoomed, so they go through the same conversion the marquee uses —
   * otherwise the topic would land somewhere other than where it was asked for.
   */
  const handleNewFloatingTopic = useCallback(() => {
    const x = (menuPos.left - transform.x) / transform.scale;
    const y = (menuPos.top - transform.y) / transform.scale;
    applySidecarEdit(
      ["floating"],
      (current) => addFloatingTopic(current, "新主题", Math.round(x), Math.round(y)).sidecar
    );
  }, [applySidecarEdit, menuPos.left, menuPos.top, transform.scale, transform.x, transform.y]);

  /** The box the floating editor is drawing over, if one is open. */
  const editingFloatingBox =
    floatingBoxes.find((topic) => topic.id === editingFloatingId) ?? null;

  const selectedIds = [...selectedNodeIds];
  const selectionRelated =
    selectedIds.length === 2 ? areRelated(sidecar, selectedIds[0], selectedIds[1]) : false;

  const canOpenPanelLink =
    parsedPanelLink?.kind === "external" ||
    (parsedPanelLink?.kind === "anchor" && !!onJumpToHeading) ||
    (parsedPanelLink?.kind === "wiki" && !!onWikiLinkClick);

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
        onExportMarkdownOutline={handleExportMarkdownOutline}
      />

      {/* Main SVG Infinite Mindmap Canvas */}
      <svg
        ref={svgRef}
        className="mindmap-svg-canvas"
        width="100%"
        height="100%"
        // Canvas-level gestures. Each one asks isBlankCanvasTarget first, so
        // a click on a node does not also count as a click on the canvas.
        onMouseDown={handleCanvasMouseDown}
        onDoubleClick={handleCanvasDoubleClick}
        onContextMenu={handleCanvasContextMenu}
      >
        <defs>
          <filter id="node-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Marquee box. Inside the viewport group so its coordinates are the
            same canvas coordinates the nodes are laid out in — drawing it
            outside would mean converting by hand on every frame. */}
        {marquee && (
          <rect
            className="mindmap-marquee"
            x={Math.min(marquee.x1, marquee.x2)}
            y={Math.min(marquee.y1, marquee.y2)}
            width={Math.abs(marquee.x2 - marquee.x1)}
            height={Math.abs(marquee.y2 - marquee.y1)}
            fill="rgba(56, 189, 248, 0.12)"
            stroke="#38bdf8"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        )}

        <g
          className="mindmap-viewport"
          transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}
        >
          {/* Relations first, so they pass under the outline rather than across
              it — a line over a label costs both of them their legibility. */}
          <MindmapRelationLines relations={relations} boxes={relationBoxes} />

          {/* Render Bezier / Step / Straight Connecting Edges */}
          <g className="mindmap-edges-group">
            {layout.edges.map((edge) => {
              // The theme is where branch colours come from. An edge that
              // carries its own colour keeps it; only the default changes.
              const defaultColor = branchColorFor(mindmapTheme, edge.colorIndex);
              const color = edge.color || defaultColor;
              const isHighlighted =
                hoveredNodeId === edge.fromId ||
                hoveredNodeId === edge.toId ||
                selectedNodeIds.has(edge.fromId) ||
                selectedNodeIds.has(edge.toId);
              return (
                <path
                  key={`${edge.fromId}->${edge.toId}`}
                  d={edge.d}
                  className={`mindmap-branch-path ${isHighlighted ? "is-highlighted" : ""}`}
                  stroke={color}
                  strokeWidth={isHighlighted ? 2.5 : 1.8}
                  fill="none"
                  strokeOpacity={isHighlighted ? 0.95 : 0.65}
                  strokeLinecap="round"
                />
              );
            })}
          </g>

          {/* Render Mindmap Nodes */}
          <g className="mindmap-nodes-group">
            {layout.nodes.map((node) => {
              const defaultBranchColor =
                node.level === 0
                  ? mindmapTheme.root.fill ?? mindmapTheme.node.fill
                  : branchColorFor(mindmapTheme, node.colorIndex);
              const customBg = node.color || "";
              const isCustomTransparent = customBg === "transparent";
              const isHovered = hoveredNodeId === node.id;
              const isSelected = selectedNodeIds.has(node.id);
              const isRoot = node.level === 0;

              // Border stroke calculation
              let strokeColor = defaultBranchColor;
              let strokeWidth = isSelected ? 2.2 : isHovered ? 1.8 : isRoot ? 1.6 : 1.2;

              if (node.borderColor === "transparent") {
                strokeColor = "transparent";
                strokeWidth = 0;
              } else if (node.borderColor) {
                strokeColor = node.borderColor;
              } else if (customBg && !isCustomTransparent) {
                strokeColor = isSelected
                  ? "#38bdf8"
                  : isHovered
                  ? "rgba(255, 255, 255, 0.75)"
                  : "rgba(0, 0, 0, 0.18)";
              }

              // Automatic high-contrast text color when custom background is set
              const autoContrastTextColor =
                customBg && !isCustomTransparent ? getContrastTextColor(customBg) : "";
              const resolvedTextColor =
                node.textColor ||
                autoContrastTextColor ||
                (isRoot ? "#38bdf8" : undefined);

              return (
                <g
                  key={node.id}
                  className={`mindmap-node-interactive ${isRoot ? "is-root" : ""} ${
                    isSelected ? "is-selected" : ""
                  } ${isHovered ? "is-hovered" : ""} ${dropTargetId === node.id ? "is-drop-target" : ""} ${
                    searchMatchIds.includes(node.id) ? "is-search-match" : ""
                  }`}
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    if (!isRoot && editable) {
                      nodeDragStartRef.current = {
                        nodeId: node.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        hasMoved: false,
                      };
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey || e.ctrlKey) {
                      setSelectedNodeIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(node.id)) next.delete(node.id);
                        else next.add(node.id);
                        return next;
                      });
                    } else {
                      setSelectedNodeIds(new Set([node.id]));
                    }
                    setContextMenu(null);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (editable) {
                      startEditing(node.id);
                    } else if (!isRoot && onJumpToHeading) {
                      onJumpToHeading(node.id, node.line);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!selectedNodeIds.has(node.id)) {
                      setSelectedNodeIds(new Set([node.id]));
                    }
                    const containerRect = containerRef.current?.getBoundingClientRect();
                    const cX = containerRect ? e.clientX - containerRect.left : e.clientX;
                    const cY = containerRect ? e.clientY - containerRect.top : e.clientY;
                    setContextMenu({ x: cX, y: cY, nodeId: node.id });
                  }}
                >
                  <title>
                    {isRoot
                      ? "中心主题 (右键设置样式，按 Tab 添加子主题)"
                      : `${node.text} (可按住拖拽至其他主题移为子分支，双击编辑，右键设置样式)`}
                  </title>

                  {/* Drop Target Adsorption Glowing Ring */}
                  {dropTargetId === node.id && (
                    <g className="mindmap-drop-target-indicator">
                      <rect
                        x={-7}
                        y={-7}
                        width={node.width + 14}
                        height={node.height + 14}
                        rx={12}
                        ry={12}
                        fill="rgba(56, 189, 248, 0.22)"
                        stroke="#38bdf8"
                        strokeWidth={2.5}
                        strokeDasharray="5 3"
                      />
                      <text
                        x={node.width / 2}
                        y={-10}
                        textAnchor="middle"
                        fill="#38bdf8"
                        fontSize={11}
                        fontWeight="bold"
                      >
                        {dropPosition === "before"
                          ? "↑ 插入到此主题之前"
                          : dropPosition === "after"
                            ? "↓ 插入到此主题之后"
                            : "+ 移为子主题"}
                      </text>
                    </g>
                  )}

                  {/* Where exactly the dragged node would land. The ring above
                      says which node is the target; this says whether the drop
                      reorders among its siblings or reparents under it. */}
                  {dropTargetId === node.id && dropPosition !== "child" && (
                    <line
                      className="mindmap-drop-insert-line"
                      x1={-6}
                      x2={node.width + 6}
                      y1={dropPosition === "before" ? -8 : node.height + 8}
                      y2={dropPosition === "before" ? -8 : node.height + 8}
                      stroke="#38bdf8"
                      strokeWidth={3}
                      strokeLinecap="round"
                    />
                  )}

                  {/* In-Canvas Search Match Ring */}
                  {searchMatchIds.includes(node.id) && (
                    <rect
                      x={-5}
                      y={-5}
                      width={node.width + 10}
                      height={node.height + 10}
                      rx={10}
                      ry={10}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth={searchMatchIds[currentSearchIndex] === node.id ? 3 : 1.8}
                      strokeDasharray={searchMatchIds[currentSearchIndex] === node.id ? "none" : "4 2"}
                    />
                  )}

                  {/* Selection Glow Outline */}
                  {isSelected && (
                    <rect
                      x={-3}
                      y={-3}
                      width={node.width + 6}
                      height={node.height + 6}
                      rx={
                        node.shape === "capsule"
                          ? (node.height + 6) / 2
                          : node.shape === "rect"
                          ? 0
                          : node.shape === "underline"
                          ? 4
                          : isRoot
                          ? 11
                          : 9
                      }
                      ry={
                        node.shape === "capsule"
                          ? (node.height + 6) / 2
                          : node.shape === "rect"
                          ? 0
                          : node.shape === "underline"
                          ? 4
                          : isRoot
                          ? 11
                          : 9
                      }
                      className="mindmap-node-selection-ring"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      fill="none"
                      strokeDasharray="4 2"
                    />
                  )}

                  {/* Node Capsule / Rounded / Rect / Underline Background */}
                  {node.shape === "underline" ? (
                    <>
                      <rect
                        width={node.width}
                        height={node.height}
                        fill="transparent"
                        className="mindmap-node-rect-underline"
                      />
                      <line
                        x1={0}
                        y1={node.height - 2}
                        x2={node.width}
                        y2={node.height - 2}
                        stroke={node.borderColor || (customBg && !isCustomTransparent ? customBg : defaultBranchColor)}
                        strokeWidth={isSelected ? 2.8 : isHovered ? 2.2 : 1.8}
                      />
                    </>
                  ) : (
                    <rect
                      width={node.width}
                      height={node.height}
                      rx={
                        node.shape === "capsule"
                          ? node.height / 2
                          : node.shape === "rect"
                          ? 0
                          : node.shape === "rounded"
                          ? 6
                          : isRoot
                          ? 8
                          : 6
                      }
                      ry={
                        node.shape === "capsule"
                          ? node.height / 2
                          : node.shape === "rect"
                          ? 0
                          : node.shape === "rounded"
                          ? 6
                          : isRoot
                          ? 8
                          : 6
                      }
                      className="mindmap-node-rect"
                      data-custom-color={!!customBg}
                      data-transparent={isCustomTransparent}
                      style={{
                        fill: isCustomTransparent ? "transparent" : (customBg || undefined),
                        stroke: strokeColor,
                        strokeWidth: strokeWidth,
                      }}
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      filter={isSelected || isHovered ? "url(#node-glow)" : undefined}
                    />
                  )}

                  {/* Node Label Text - Rendered via <tspan> for multi-line and text alignments */}
                  {(() => {
                    const lines = node.lines && node.lines.length > 0 ? node.lines : [node.text];
                    const align = node.textAlign || "center";
                    const effectiveFontSize = node.fontSize || (isRoot ? 15 : 13);
                    const lineHeight = Math.round(effectiveFontSize * 1.38);
                    const padX = isRoot ? 18 : 12;
                    const innerWidth = Math.max(20, node.width - padX * 2);

                    // Vertical centering: each line is placed at the center of its
                    // line box and rendered with dominant-baseline: central.
                    const totalTextHeight = lines.length * lineHeight;
                    const firstLineCenterY = (node.height - totalTextHeight) / 2 + lineHeight / 2;

                    let textAnchor: "middle" | "start" | "end" = "middle";
                    let xPos = node.width / 2;

                    if (align === "left") {
                      textAnchor = "start";
                      xPos = padX;
                    } else if (align === "right") {
                      textAnchor = "end";
                      xPos = node.width - padX;
                    } else if (align === "justify") {
                      textAnchor = "start";
                      xPos = padX;
                    }

                    return (
                      <text
                        className={`mindmap-node-title-text ${isRoot ? "root-title" : ""}`}
                        style={{
                          fontSize: `${effectiveFontSize}px`,
                          fontWeight: node.fontWeight ? (node.fontWeight === "bold" ? 700 : 400) : (isRoot ? 700 : 500),
                          fill: resolvedTextColor || undefined,
                          // Inline styles beat author CSS, guaranteeing the chosen
                          // alignment actually takes effect on the SVG text.
                          textAnchor,
                          dominantBaseline: "central",
                        }}
                      >
                        {lines.map((line, idx) => {
                          const isNotLast = idx < lines.length - 1;
                          const isJustified = align === "justify" && isNotLast && line.trim().length > 1;

                          return (
                            <tspan
                              key={idx}
                              x={xPos}
                              y={firstLineCenterY + idx * lineHeight}
                              textLength={isJustified ? innerWidth : undefined}
                              lengthAdjust={isJustified ? "spacing" : undefined}
                            >
                              {line}
                            </tspan>
                          );
                        })}
                      </text>
                    );
                  })()}

                  {/* What the node carries but the document cannot say: an icon
                      on its leading edge, a note badge and the marks on its corners. */}
                  <NodeIcon iconId={iconFor(sidecar, node.id)} height={node.height} />
                  <NodeMarks width={node.width} markers={markersFor(sidecar, node.id)} />
                  <NodeTags height={node.height} tags={tagsFor(sidecar, node.id)} />
                  {/* Only for a link this build recognises: the badge says "this
                      goes somewhere", and a mark that promised a trip for text
                      that leads nowhere would be the one lie on the map. Text
                      that is not a link still shows in the panel, with the hint. */}
                  {parseMindmapLink(linkFor(sidecar, node.id)) ? (
                    <NodeLinkMark height={node.height} />
                  ) : null}

                  {/* Outline numbering, drawn above the node's left corner.
                      Beside the text and not inside it: the text is what gets
                      written back to the document, and a number in it would be
                      a number the reader never typed. The corner is the one
                      place nothing else claims — the note badge sits on it, the
                      marks are opposite, and the icon is further left. */}
                  {numbering?.[node.id] ? (
                    <text className="mindmap-node-number" x={4} y={-5}>
                      {numbering[node.id]}
                    </text>
                  ) : null}

                  {/* A note is the one thing about a node the document cannot
                      show, so the map says where one is: a badge on the node's
                      leading corner, drawn for the eye rather than the cursor. */}
                  {noteFor(sidecar, node.id) ? (
                    <g className="mindmap-note-marker" transform="translate(-4, -4)" aria-label="有备注">
                      <circle r="4.6" />
                      <path d="M -2 -0.8 H 2 M -2 1.4 H 0.4" />
                    </g>
                  ) : null}

                  {/* Children Collapse/Expand Toggle Button (+ / - geometrically centered via SVG vector lines).
                      Hung off the edge the children are actually on: the default layout grows
                      everything right, so nothing moves there, while a branch on the left of a
                      bidirectional map and every parent in the vertical layout would otherwise
                      end up with the toggle in the middle of the row below it. */}
                  {node.hasChildren && (
                    <g
                      className="mindmap-collapse-btn"
                      transform={collapseToggleAnchor(node)}
                      onClick={(e) => handleToggleCollapse(node.id, e)}
                    >
                      <circle
                        r={7}
                        className="mindmap-collapse-circle"
                        stroke={strokeColor !== "transparent" ? strokeColor : defaultBranchColor}
                        strokeWidth={1.2}
                      />
                      {/* Horizontal bar of minus / plus - guaranteed centered at y=0 */}
                      <line
                        x1={-3.2}
                        y1={0}
                        x2={3.2}
                        y2={0}
                        stroke={strokeColor !== "transparent" ? strokeColor : defaultBranchColor}
                        strokeWidth={1.4}
                        strokeLinecap="round"
                        pointerEvents="none"
                      />
                      {/* Vertical bar of plus when collapsed - guaranteed centered at x=0 */}
                      {node.collapsed && (
                        <line
                          x1={0}
                          y1={-3.2}
                          x2={0}
                          y2={3.2}
                          stroke={strokeColor !== "transparent" ? strokeColor : defaultBranchColor}
                          strokeWidth={1.4}
                          strokeLinecap="round"
                          pointerEvents="none"
                        />
                      )}
                      <title>{node.collapsed ? "展开子分支" : "折叠子分支"}</title>
                    </g>
                  )}


                  {/* Manual Resize Handle at bottom-right corner */}
                  {editable && (isHovered || isSelected) && (
                    <g
                      className="mindmap-node-resize-handle"
                      transform={`translate(${node.width - 9}, ${node.height - 9})`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setResizingNode({
                          nodeId: node.id,
                          startX: e.clientX,
                          startY: e.clientY,
                          startWidth: node.width,
                          startHeight: node.height,
                        });
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleUpdateStyle(node.id, {
                          customWidth: undefined,
                          customHeight: undefined,
                        });
                      }}
                    >
                      <rect
                        x={0}
                        y={0}
                        width={9}
                        height={9}
                        fill="transparent"
                        className="mindmap-resize-hitarea"
                      />
                      {/* Diagonal grip marks */}
                      <line
                        x1={7}
                        y1={2}
                        x2={2}
                        y2={7}
                        stroke="#38bdf8"
                        strokeWidth={1.4}
                        strokeLinecap="round"
                      />
                      <line
                        x1={7}
                        y1={5}
                        x2={5}
                        y2={7}
                        stroke="#38bdf8"
                        strokeWidth={1.4}
                        strokeLinecap="round"
                      />
                      <title>拖动调整节点大小（双击恢复自动自适应）</title>
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {/* Free topics last, so they sit above the outline: they are the
              reader's own additions, and one dragged over a branch should stay
              visible rather than slide underneath it. */}
          <MindmapFloatingTopics
            topics={floatingBoxes}
            selectedId={selectedFloatingId}
            onSelect={setSelectedFloatingId}
            onStartEdit={handleStartFloatingEdit}
            onStartDrag={handleFloatingDragStart}
          />
        </g>
      </svg>

      {/* Dragging Ghost Node Badge Following Cursor */}
      {draggingNodeId && dragGhostPos && (
        <div
          className="mindmap-drag-ghost"
          style={{
            position: "fixed",
            left: dragGhostPos.x + 14,
            top: dragGhostPos.y + 14,
            pointerEvents: "none",
            zIndex: 9999,
          }}
        >
          <span className="ghost-icon">📦</span>
          <span className="ghost-text">
            {layout.nodes.find((n) => n.id === draggingNodeId)?.text || "主题"}
          </span>
          {dropTargetId && <span className="ghost-target-hint">➔ 移为子主题</span>}
        </div>
      )}

      {/* Inline Text Editing Overlay Input */}
      {editingNode && (
        <MindmapInlineEditor
          node={editingNode}
          transform={transform}
          value={editingText}
          inputRef={editInputRef}
          onChange={setEditingText}
          onCommit={handleCommitEdit}
          onCancel={handleCancelEdit}
        />
      )}

      {/* The same editor over a free topic. A free topic has a box and text like
          any other, so it needs no editor of its own — and only one editor is
          ever shown, with the node's taking precedence if both were somehow
          asked for. */}
      {!editingNode && editingFloatingBox && (
        <MindmapInlineEditor
          node={editingFloatingBox}
          transform={transform}
          value={editingText}
          inputRef={editInputRef}
          onChange={setEditingText}
          onCommit={handleCommitFloatingEdit}
          onCancel={handleCancelFloatingEdit}
        />
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
        open={!!contextMenu && !contextMenu.isCanvas}
        position={menuPos}
        menuRef={menuRef}
        nodeId={contextMenu?.nodeId ?? tree.id}
        target={contextTargetNode}
        isBatchMode={isBatchMode}
        selectedCount={selectedNodeIds.size}
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
        onFreezeTheme={handleFreezeTheme}
        onClose={() => setContextMenu(null)}
      />
    </div>
  );
});
