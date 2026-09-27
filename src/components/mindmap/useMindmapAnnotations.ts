import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { MindmapSidecar, SidecarSection } from "../../services/mindmapSidecar";
import type { MindmapLayoutResult } from "../../services/mindmapLayout";
import { boundsOfBoxes } from "../../core/mindmapBounds";
import { boundaryTitleAnchor, summaryLabelAnchor } from "../../core/mindmapGroups";
import { relationGeometry } from "../../core/mindmapRelations";
import {
  addBoundary,
  addFloatingTopic,
  addSummary,
  moveFloatingTopic,
  relationBetween,
  removeBoundary,
  removeFloatingTopic,
  removeSummary,
  setBoundaryColor,
  setBoundaryText,
  setFloatingText,
  setRelationFields,
  setSummaryText,
  summariesIn,
  boundariesIn,
  toggleRelation,
} from "../../services/mindmapSidecar";
import type { FloatingBox } from "../MindmapFloatingTopics";
import type { SummaryBox } from "../MindmapSummaries";
import type { BoundaryBox } from "../MindmapBoundaries";

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
export type MindmapContextMenu = {
  x: number;
  y: number;
  /**
   * The topic this menu is about — a topic in the outline, or, when `floating`
   * is set, one the outline does not own. The field is named for the map's
   * topics rather than for the tree's nodes, because both kinds are topics and
   * a panel only ever needs the id to write by.
   */
  nodeId: string;
  isCanvas?: boolean;
  /** True when this menu is about a floating topic, which has its own panel. */
  floating?: boolean;
};

type UseMindmapAnnotationsParams = {
  /**
   * The one sidecar writer, from `useMindmapSidecar`. Passed in rather than
   * rebuilt here so every kind of annotation shares the single debounce and the
   * single late-load merge contract; its identity changes with the sidecar,
   * which is what keeps an edit from reading a stale file.
   */
  applySidecarEdit: (
    sections: SidecarSection[],
    edit: (current: MindmapSidecar) => MindmapSidecar,
  ) => void;
  /** The node selection — the gesture relations, summaries and boundaries are made with. */
  selectedNodeIds: Set<string>;
  /** The scrollable container, measured to turn pointer coordinates into canvas ones. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** The pan & zoom transform, divided out of every pointer coordinate. */
  transform: { x: number; y: number; scale: number };
  /** Where the open menu sits; a new free topic lands where its menu was asked for. */
  menuPos: { left: number; top: number };
  /** The one inline editor's text, shared with the node editor — read on commit. */
  editingText: string;
  /** The same text's writer — a label edit starts by filling the shared field. */
  setEditingText: Dispatch<SetStateAction<string>>;
  /** The view's context-menu writer; a line or a floating topic opens it as its own panel. */
  setContextMenu: (menu: MindmapContextMenu | null) => void;
  /**
   * The root topic's id. A line's menu is filed under the root, because a line
   * has no surface of its own to hang a panel off — the view's tree is not
   * threaded in for the sake of this one field.
   */
  treeId: string;
  /** The companion file, read for what is stored rather than remembered. */
  sidecar: MindmapSidecar | null;
  /** The laid-out nodes — read for `layout.nodes` only, to name a line's two ends. */
  layout: MindmapLayoutResult;
  /** Where each laid-out node is; the geometry the line, summary and bracket editors draw over. */
  relationBoxes: Map<string, { x: number; y: number; width: number; height: number }>;
  /** The free topics as boxes; the drag and the text editor both read their geometry. */
  floatingBoxes: FloatingBox[];
};

/**
 * The annotation editors: relations, free topics, summaries and boundaries.
 *
 * Their picked/edited state, their callbacks, the window listener that carries a
 * free topic's drag, and the geometry of the box each inline editor draws over.
 * Everything they write goes through `applySidecarEdit` (threaded in from
 * `useMindmapSidecar`), so a relation toggle, a floating topic's rename and a
 * boundary's colour all reach the disk by the same debounced pause.
 *
 * Extracted from MindmapView (batch 3, wave 2b of the decomposition). A verbatim
 * move: the drag-listener lifecycle, the selection resets and the commit/cancel
 * pairs are the contract. The view must call this hook at the position the
 * callbacks have always occupied — after the marquee and inline-editor effects —
 * so the drag listener stays the last effect the component registers. That is
 * also why `setSelectedRelation` may be read by the marquee effect above the
 * call: that reference sits inside the effect's closure, which only ever runs
 * after the hook has returned.
 *
 * The shared state stays with the view and is threaded in: the context menu (one
 * menu for nodes, lines and free topics), the inline editor's text (one editor
 * for nodes, free topics and labels) and the geometry the boxes are worked out
 * from. The `set*` setters threaded in are React's own and never change
 * identity, so the deps they appear in cost nothing.
 */
export function useMindmapAnnotations({
  applySidecarEdit,
  selectedNodeIds,
  containerRef,
  transform,
  menuPos,
  editingText,
  setEditingText,
  setContextMenu,
  treeId,
  sidecar,
  layout,
  relationBoxes,
  floatingBoxes,
}: UseMindmapAnnotationsParams) {
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

  /** The summary the reader has picked, and the one whose label is being typed. */
  const [selectedSummaryId, setSelectedSummaryId] = useState<string | null>(null);
  const [editingSummaryId, setEditingSummaryId] = useState<string | null>(null);

  /** The same pair for boundaries, which are picked and titled by their title. */
  const [selectedBoundaryId, setSelectedBoundaryId] = useState<string | null>(null);
  const [editingBoundaryId, setEditingBoundaryId] = useState<string | null>(null);

  /**
   * The line the reader has picked, and the one whose label is being typed.
   *
   * Held as the pair rather than as a key, because everything done to a line is
   * addressed by the two topics it joins — the canonical order is a storage rule,
   * and nothing outside the file has to know it.
   */
  const [selectedRelation, setSelectedRelation] = useState<{
    fromId: string;
    toId: string;
  } | null>(null);
  const [editingRelation, setEditingRelation] = useState<{
    fromId: string;
    toId: string;
  } | null>(null);

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
   * Changes what the picked line says or how it is drawn.
   *
   * One handler for the label and the three ids, because they differ only in
   * which field they touch — and because the line's other settings have to
   * survive each one, which is the service's patch for.
   */
  const handleRelationChange = useCallback(
    (field: "label" | "arrow" | "style" | "color", value: string) => {
      if (!selectedRelation) return;
      const { fromId, toId } = selectedRelation;
      applySidecarEdit(["relations"], (current) =>
        setRelationFields(current, fromId, toId, { [field]: value }),
      );
    },
    [applySidecarEdit, selectedRelation],
  );

  /**
   * A right click on a line: the canvas menu, with the line as its subject.
   *
   * The same shape as a right click on a floating topic — pick the thing, then
   * open the menu about it at the cursor — and a line has no surface of its own
   * to hang a panel off, so the rows it needs appear inside that menu.
   */
  const handleRelationContextMenu = useCallback(
    (relation: { fromId: string; toId: string }, event: React.MouseEvent) => {
      setSelectedRelation({ fromId: relation.fromId, toId: relation.toId });
      const containerRect = containerRef.current?.getBoundingClientRect();
      const x = containerRect ? event.clientX - containerRect.left : event.clientX;
      const y = containerRect ? event.clientY - containerRect.top : event.clientY;
      setContextMenu({ x, y, nodeId: treeId, isCanvas: true });
    },
    [containerRef, setContextMenu, treeId],
  );

  const handleRemoveSelectedRelation = useCallback(() => {
    if (!selectedRelation) return;
    const { fromId, toId } = selectedRelation;
    setSelectedRelation(null);
    setEditingRelation(null);
    applySidecarEdit(["relations"], (current) => toggleRelation(current, fromId, toId));
  }, [applySidecarEdit, selectedRelation]);

  const handleStartRelationEdit = useCallback(
    (relation: { fromId: string; toId: string; label?: string }) => {
      setSelectedRelation({ fromId: relation.fromId, toId: relation.toId });
      setEditingRelation({ fromId: relation.fromId, toId: relation.toId });
      setEditingText(relation.label ?? "");
    },
    [setEditingText],
  );

  const handleCancelRelationEdit = useCallback(() => setEditingRelation(null), []);

  const handleCommitRelationEdit = useCallback(() => {
    const relation = editingRelation;
    setEditingRelation(null);
    if (!relation) return;
    applySidecarEdit(["relations"], (current) =>
      setRelationFields(current, relation.fromId, relation.toId, { label: editingText }),
    );
  }, [applySidecarEdit, editingRelation, editingText]);

  /**
   * The box the label editor is drawing over: the line's own middle.
   *
   * Worked out from the same geometry the line is drawn with, so the editor lands
   * on the curve rather than beside it — a label written two pixels off the line
   * it belongs to is the kind of thing that reads as a bug.
   */
  const editingRelationBox = (() => {
    if (!editingRelation) return null;
    const from = relationBoxes.get(editingRelation.fromId);
    const to = relationBoxes.get(editingRelation.toId);
    if (!from || !to) return null;
    const { apex } = relationGeometry(from, to);
    return {
      x: apex.x - 60,
      y: apex.y - 11,
      width: 120,
      height: 22,
    };
  })();

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
        moveFloatingTopic(current, draggingFloatingId, Math.round(x), Math.round(y)),
      );
    };

    const handleUp = () => setDraggingFloatingId(null);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [
    applySidecarEdit,
    containerRef,
    draggingFloatingId,
    transform.scale,
    transform.x,
    transform.y,
  ]);

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
    [containerRef, floatingBoxes, transform.scale, transform.x, transform.y],
  );

  const handleStartFloatingEdit = useCallback(
    (id: string) => {
      const box = floatingBoxes.find((topic) => topic.id === id);
      if (!box) return;
      setEditingFloatingId(id);
      setEditingText(box.text);
    },
    [floatingBoxes, setEditingText],
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
   * A right click on a floating topic: its own panel, where the cursor is.
   *
   * The same shape as the node handler — select it if it is not selected, then
   * open the panel at the cursor — because it is the same gesture about a
   * different kind of topic, and a reader should not have to learn a second one.
   */
  const handleFloatingContextMenu = useCallback(
    (id: string, event: React.MouseEvent) => {
      setSelectedFloatingId(id);
      const containerRect = containerRef.current?.getBoundingClientRect();
      const x = containerRect ? event.clientX - containerRect.left : event.clientX;
      const y = containerRect ? event.clientY - containerRect.top : event.clientY;
      setContextMenu({ x, y, nodeId: id, floating: true });
    },
    [containerRef, setContextMenu],
  );

  /** Deletes the floating topic a panel is about, by id rather than by selection. */
  const handleDeleteFloatingTopic = useCallback(
    (id: string) => {
      setContextMenu(null);
      setSelectedFloatingId(null);
      applySidecarEdit(["floating"], (current) => removeFloatingTopic(current, id));
    },
    [applySidecarEdit, setContextMenu],
  );

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
      (current) => addFloatingTopic(current, "新主题", Math.round(x), Math.round(y)).sidecar,
    );
  }, [applySidecarEdit, menuPos.left, menuPos.top, transform.scale, transform.x, transform.y]);

  /** The box the floating editor is drawing over, if one is open. */
  const editingFloatingBox = floatingBoxes.find((topic) => topic.id === editingFloatingId) ?? null;

  /**
   * Each summary with the bounds it spans.
   *
   * Worked out from the laid-out boxes rather than stored: a summary is about
   * topics, not about a rectangle, so moving or renaming one of them moves the
   * bracket with it and nothing has to be kept in step. A summary whose topics
   * are not all on the canvas — folded away, or renamed since — is drawn over
   * whatever part of the group is there, and over nothing at all when none of it
   * is.
   */
  const summaryBoxes = useMemo<SummaryBox[]>(() => {
    return summariesIn(sidecar).map(({ id, summary }) => {
      const boxes = summary.nodeIds
        .map((nodeId) => relationBoxes.get(nodeId))
        .filter((box): box is { x: number; y: number; width: number; height: number } => !!box);
      return { id, text: summary.text, bounds: boundsOfBoxes(boxes, 0) };
    });
  }, [sidecar, relationBoxes]);

  /**
   * Brackets the selected topics.
   *
   * Two or more, because a bracket over one topic says nothing a label on that
   * topic could not — and the gesture is the same multi-selection relations use,
   * so there is no new mode to learn.
   */
  const handleAddSummary = useCallback(() => {
    const nodeIds = [...selectedNodeIds];
    if (nodeIds.length < 2) return;
    applySidecarEdit(["summaries"], (current) => addSummary(current, nodeIds).sidecar);
  }, [applySidecarEdit, selectedNodeIds]);

  const handleRemoveSummary = useCallback(() => {
    if (!selectedSummaryId) return;
    const id = selectedSummaryId;
    setSelectedSummaryId(null);
    applySidecarEdit(["summaries"], (current) => removeSummary(current, id));
  }, [applySidecarEdit, selectedSummaryId]);

  const handleStartSummaryEdit = useCallback(
    (id: string) => {
      const summary = summaryBoxes.find((entry) => entry.id === id);
      if (!summary) return;
      setEditingSummaryId(id);
      setEditingText(summary.text);
    },
    [setEditingText, summaryBoxes],
  );

  const handleCancelSummaryEdit = useCallback(() => setEditingSummaryId(null), []);

  /**
   * Commits a summary's label. Emptying it leaves the bracket in place, unlike a
   * free topic's text: what the reader asked for was the bracket, and a bracket
   * with nothing written on it still says "these belong together".
   */
  const handleCommitSummaryEdit = useCallback(() => {
    const id = editingSummaryId;
    setEditingSummaryId(null);
    if (!id) return;
    applySidecarEdit(["summaries"], (current) => setSummaryText(current, id, editingText));
  }, [applySidecarEdit, editingSummaryId, editingText]);

  /** Each boundary with the bounds it encloses, the same way summaries are built. */
  const boundaryBoxes = useMemo<BoundaryBox[]>(() => {
    return boundariesIn(sidecar).map(({ id, boundary }) => {
      const boxes = boundary.nodeIds
        .map((nodeId) => relationBoxes.get(nodeId))
        .filter((box): box is { x: number; y: number; width: number; height: number } => !!box);
      return { id, text: boundary.text, colorId: boundary.color, bounds: boundsOfBoxes(boxes, 0) };
    });
  }, [sidecar, relationBoxes]);

  /**
   * Draws a box around the selection.
   *
   * One topic is enough, unlike a summary: a box around a single topic says "this
   * one is its own thing", which a bracket could never say — a bracket over one
   * topic is just a line beside it.
   */
  const handleAddBoundary = useCallback(() => {
    const nodeIds = [...selectedNodeIds];
    if (nodeIds.length === 0) return;
    applySidecarEdit(["boundaries"], (current) => addBoundary(current, nodeIds).sidecar);
  }, [applySidecarEdit, selectedNodeIds]);

  const handleRemoveBoundary = useCallback(() => {
    if (!selectedBoundaryId) return;
    const id = selectedBoundaryId;
    setSelectedBoundaryId(null);
    applySidecarEdit(["boundaries"], (current) => removeBoundary(current, id));
  }, [applySidecarEdit, selectedBoundaryId]);

  const handleBoundaryColorChange = useCallback(
    (colorId: string) => {
      if (!selectedBoundaryId) return;
      const id = selectedBoundaryId;
      applySidecarEdit(["boundaries"], (current) => setBoundaryColor(current, id, colorId));
    },
    [applySidecarEdit, selectedBoundaryId],
  );

  const handleStartBoundaryEdit = useCallback(
    (id: string) => {
      const boundary = boundaryBoxes.find((entry) => entry.id === id);
      if (!boundary) return;
      setEditingBoundaryId(id);
      setEditingText(boundary.text);
    },
    [boundaryBoxes, setEditingText],
  );

  const handleCancelBoundaryEdit = useCallback(() => setEditingBoundaryId(null), []);

  const handleCommitBoundaryEdit = useCallback(() => {
    const id = editingBoundaryId;
    setEditingBoundaryId(null);
    if (!id) return;
    applySidecarEdit(["boundaries"], (current) => setBoundaryText(current, id, editingText));
  }, [applySidecarEdit, editingBoundaryId, editingText]);

  /** The box the title editor is drawing over, in the band above the group. */
  const editingBoundaryBox = (() => {
    const boundary = boundaryBoxes.find((entry) => entry.id === editingBoundaryId);
    if (!boundary?.bounds) return null;
    const anchor = boundaryTitleAnchor(boundary.bounds);
    return {
      x: anchor.x - 2,
      y: anchor.y - 10,
      width: Math.max(120, boundary.text.length * 8 + 40),
      height: 20,
    };
  })();

  /** The box the label editor is drawing over, sized to the label's own line. */
  const editingSummaryBox = (() => {
    const summary = summaryBoxes.find((entry) => entry.id === editingSummaryId);
    if (!summary?.bounds) return null;
    const anchor = summaryLabelAnchor(summary.bounds);
    return {
      x: anchor.x,
      y: anchor.y - 11,
      width: Math.max(120, summary.text.length * 8 + 40),
      height: 22,
    };
  })();

  /** Every topic's text by id, for naming the two ends of a picked line. */
  const topicTexts = useMemo(() => {
    const texts = new Map<string, string>();
    for (const node of layout.nodes) texts.set(node.id, node.text);
    for (const topic of floatingBoxes) texts.set(topic.id, topic.text);
    return texts;
  }, [layout.nodes, floatingBoxes]);

  /**
   * The picked line as the menu needs it: what it says, and what it joins.
   *
   * Read from the file rather than remembered when the line was clicked, so the
   * menu shows what is stored — a font of the label being typed, a colour going
   * back to the theme, both arrive here as soon as they are written.
   */
  const selectedRelationInfo = useMemo(() => {
    if (!selectedRelation) return null;
    const relation = relationBetween(sidecar, selectedRelation.fromId, selectedRelation.toId);
    if (!relation) return null;

    return {
      label: relation.label ?? "",
      arrow: relation.arrow ?? "",
      style: relation.style ?? "",
      color: relation.color ?? "",
      fromText: topicTexts.get(relation.fromId) ?? relation.fromId,
      toText: topicTexts.get(relation.toId) ?? relation.toId,
    };
  }, [selectedRelation, sidecar, topicTexts]);

  return {
    // Relations.
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
    // Free topics.
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
    // Summaries.
    selectedSummaryId,
    setSelectedSummaryId,
    handleAddSummary,
    handleRemoveSummary,
    handleStartSummaryEdit,
    handleCancelSummaryEdit,
    handleCommitSummaryEdit,
    summaryBoxes,
    editingSummaryBox,
    // Boundaries.
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
  };
}
