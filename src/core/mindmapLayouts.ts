/**
 * Mind map layouts.
 *
 * A layout is a pure function of the tree: it decides where each node sits and
 * how the connector into it is drawn. Nothing here reaches the document, which
 * is what makes switching layouts free — the same tree is laid out again, the
 * Markdown is never touched, and no node style is rewritten.
 *
 * Only layouts that exist are listed. An id in the union with no implementation
 * behind it would reach the dispatch in `layoutMindmap` and have to be treated
 * as a typo there, and a picker offering it would be offering a dead option.
 * The plan's remaining three (radial, tree table, timeline) join this table when
 * they are written.
 */

export type MindmapLayoutId = "logic" | "bidirectional" | "vertical";

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
