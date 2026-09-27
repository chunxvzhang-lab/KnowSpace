import { useMemo } from "react";
import type { MindmapNode } from "../../core/types";
import { calculateNodeDimensions, findNode } from "../../services/mindmapService";
import type { MindmapLayoutResult } from "../../services/mindmapLayout";
import {
  areRelated,
  floatingTopics,
  iconFor,
  linkFor,
  markersFor,
  noteFor,
  tagsFor,
  type MindmapSidecar,
} from "../../services/mindmapSidecar";
import { boundsOfBoxes, unionBounds } from "../../core/mindmapBounds";
import { parseMindmapLink } from "../../core/mindmapLinks";
import type { FloatingBox } from "../MindmapFloatingTopics";
import type { MindmapContextMenu } from "./useMindmapAnnotations";

/**
 * The pure derivations of the mindmap that belong to no one hook: the measured
 * free topics, the frame bounds the canvas frames itself against, the laid-out
 * boxes the relation lines are drawn between, the style panel's target and its
 * link, and the small reads the three menus and the inline editor share.
 *
 * Extracted from MindmapView (final trim wave of the decomposition). Every
 * value here is a pure function of the threaded-in inputs — the companion file,
 * the layout, the tree, the open menu and the selection — so computing them in
 * one place, ahead of the viewport hook that reads `frameBounds`, cannot move
 * a pixel. The memos are pure and own no state or effects, which is also why
 * this hook may be called before the annotation editors whose boxes the
 * `inlineEdit` derivation would need: that one stays in the view, entangled
 * with `useMindmapAnnotations`' return.
 */
type UseMindmapDerivedParams = {
  /** The companion file, read for what is stored rather than remembered. */
  sidecar: MindmapSidecar | null;
  /** The laid-out tree; `bounds` frames the canvas, `nodes` name an edit target. */
  layout: MindmapLayoutResult;
  /** The tree — a context menu names a topic in it, and its root is the panel's fallback. */
  tree: MindmapNode;
  /** The open context menu, if any; most of these values describe its subject. */
  contextMenu: MindmapContextMenu | null;
  /** The current selection; two selected topics may be joined by a relation. */
  selectedNodeIds: Set<string>;
  /** The topic whose text is being edited inline, if any. */
  editingNodeId: string | null;
  /** Whether this build can follow an anchor link, i.e. jump inside the document. */
  onJumpToHeading?: (headingId: string, line?: number) => void;
  /** Whether this build can follow a wiki link, i.e. open another document. */
  onWikiLinkClick?: (target: string) => void;
};

export function useMindmapDerived({
  sidecar,
  layout,
  tree,
  contextMenu,
  selectedNodeIds,
  editingNodeId,
  onJumpToHeading,
  onWikiLinkClick,
}: UseMindmapDerivedParams) {
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

  /** The laid-out node being edited inline, for the editor's box. */
  const editingNode = useMemo(() => {
    if (!editingNodeId) return null;
    return layout.nodes.find((n) => n.id === editingNodeId) || null;
  }, [editingNodeId, layout.nodes]);

  /** The node the open context menu is about, for the style panel's header. */
  const contextTargetNode = useMemo(() => {
    if (!contextMenu) return null;
    return findNode(tree, contextMenu.nodeId);
  }, [contextMenu, tree]);

  /**
   * The node the style panel describes and every annotation control writes to:
   * the node the menu was opened on, or the root when nothing is selected — the
   * same target the node context menu uses.
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

  /** Two topics picked at once: are they already joined by a relation? */
  const selectedIds = [...selectedNodeIds];
  const selectionRelated =
    selectedIds.length === 2 ? areRelated(sidecar, selectedIds[0], selectedIds[1]) : false;

  /** The floating topic the menu is about, for a title and a delete. */
  const contextTargetFloating =
    floatingBoxes.find((topic) => topic.id === contextMenu?.nodeId) ?? null;

  return {
    floatingBoxes,
    frameBounds,
    relationBoxes,
    relations,
    editingNode,
    contextTargetNode,
    contextTargetFloating,
    panelNodeId,
    panelLink,
    parsedPanelLink,
    canOpenPanelLink,
    canOpenFloatingLink,
    selectionRelated,
  };
}
