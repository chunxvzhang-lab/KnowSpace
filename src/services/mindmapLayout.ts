import type { MindmapNode } from "../core/types";
import type { MindmapSide } from "../core/mindmapSides";
import { layoutBidirectionalTree, layoutLogicTree } from "./mindmapLayoutPlanar";
import { layoutTimelineTree, layoutVerticalTree } from "./mindmapLayoutOrthogonal";
import { layoutRadialTree } from "./mindmapLayoutRadial";
import type { MindmapLayoutResult } from "./mindmapLayoutShared";

/**
 * Mind map layouts: the id table the picker reads, and the dispatch behind it.
 *
 * A layout is a pure view-level function of the tree. It decides where every
 * node sits and how the connector into it is drawn, and it never touches the
 * tree, the document or a node's own styling — which is what makes switching
 * instant and free of anything to undo.
 *
 * The table, the labels and the dispatch live together on purpose: they are
 * three views of one list, and kept apart the way to get them wrong is to add a
 * layout to the picker and forget the switch, where the default case would
 * quietly render it as the default layout and no test would fail.
 *
 * The layouts themselves are split by the geometry they share:
 * `./mindmapLayoutPlanar` grows sideways (logic, bidirectional),
 * `./mindmapLayoutOrthogonal` grows downwards (vertical, timeline) and
 * `./mindmapLayoutRadial` grows outwards (radial). The node and result shapes,
 * the spacing constants and the measuring/placing/edge passes they all run
 * through are in `./mindmapLayoutShared`, which is also where the note on the
 * model dependency lives.
 */

export type MindmapLayoutId = "logic" | "bidirectional" | "vertical" | "radial" | "timeline";

/** Used when a document has no layout of its own, or names one that is gone. */
export const DEFAULT_LAYOUT_ID: MindmapLayoutId = "logic";

export type MindmapLayoutOption = {
  id: MindmapLayoutId;
  label: string;
  /** One line for the picker, saying what the reader gets. */
  description: string;
};

export const MINDMAP_LAYOUT_LIST: MindmapLayoutOption[] = [
  {
    id: "logic",
    label: "逻辑结构图",
    description: "根在左侧，逐级向右展开。默认，与旧版本完全一致。",
  },
  {
    id: "bidirectional",
    label: "双向",
    description: "根居中，一级分支按体量分列左右两侧。适合分支多、横向空间有限的图。",
  },
  {
    id: "vertical",
    label: "纵向",
    description: "根在顶部，层级向下展开。适合条目多而层级浅的大纲，横向铺开便于打印。",
  },
  {
    id: "radial",
    label: "径向",
    description: "根居中，分支按体量分配扇区向外辐射。适合看整体结构，不适合长文本。",
  },
  {
    id: "timeline",
    label: "时间轴",
    description: "一级分支沿水平轴依次排开、上下交替，子分支向外展开。适合顺序性内容。",
  },
];

/**
 * Resolves a layout id, tolerating anything.
 *
 * Called with a value read back from storage, so it can be a layout that has
 * since been removed, an older id, or nonsense. Falling back to the default is
 * the only answer that keeps a map renderable.
 *
 * Matched against the list rather than with `value in`, which says yes to
 * `"toString"` and `"constructor"` because they come from Object.prototype —
 * the same trap `resolveThemeId` documents at length.
 */
export function resolveLayoutId(value: unknown): MindmapLayoutId {
  return typeof value === "string" && MINDMAP_LAYOUT_LIST.some((layout) => layout.id === value)
    ? (value as MindmapLayoutId)
    : DEFAULT_LAYOUT_ID;
}

export type {
  MindmapLayoutNode,
  MindmapLayoutResult,
  MindmapLayoutSide,
} from "./mindmapLayoutShared";

/**
 * Lays the tree out.
 *
 * A layout is a view-level choice and nothing else: the tree, the document and
 * every node's own styling are untouched, so switching is instant and leaves
 * nothing to undo. The default is the rightward tree this file has always built,
 * and the golden snapshots in `mindmap-layouts.test.ts` hold it there — which is
 * also why the fallback below is the default rather than an error.
 */
export function layoutMindmap(
  rootNode: MindmapNode,
  collapsedIds: ReadonlySet<string> = new Set(),
  layoutId: MindmapLayoutId = DEFAULT_LAYOUT_ID,
  sides: Readonly<Record<string, MindmapSide>> = {},
): MindmapLayoutResult {
  switch (layoutId) {
    case "bidirectional":
      return layoutBidirectionalTree(rootNode, collapsedIds, sides);
    case "vertical":
      return layoutVerticalTree(rootNode, collapsedIds);
    case "radial":
      return layoutRadialTree(rootNode, collapsedIds);
    case "timeline":
      return layoutTimelineTree(rootNode, collapsedIds);
    default:
      return layoutLogicTree(rootNode, collapsedIds);
  }
}
