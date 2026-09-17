import type { MindmapNode, MindmapNodeShape } from "./types";

/**
 * Mind map themes.
 *
 * A theme is a set of *view-level defaults*, and that is the whole design. A
 * node that carries its own colour, shape or size keeps it; a node that does
 * not takes the theme's answer. Switching theme therefore repaints only the
 * nodes nobody has touched, and is instant and non-destructive.
 *
 * The alternative — writing the theme into every node on switch — was rejected
 * because it cannot be undone: the first switch overwrites whatever the reader
 * had set by hand, and switching back cannot tell the difference between a
 * style it wrote and a style that was always there. That version also has to
 * write to the document, which this one never does.
 */

export type MindmapThemeId =
  | "classic"
  | "minimal"
  | "dark"
  | "sketch"
  | "contrast"
  | "corporate";

/** The appearance of one node, once the theme has had its say. */
export type NodeAppearance = {
  fill: string;
  textColor: string;
  borderColor: string;
  shape: MindmapNodeShape;
  fontSize: number;
  fontWeight: "normal" | "bold";
};

export type MindmapTheme = {
  id: MindmapThemeId;
  label: string;
  /** One line for the picker, saying who the theme is for. */
  description: string;
  /**
   * Branch colours, cycled by the node's depth so siblings share a colour and
   * a subtree reads as one thing.
   */
  branchColors: string[];
  canvasBackground: string;
  /** Where an edge takes no colour of its own. */
  defaultEdgeColor: string;
  node: NodeAppearance;
  /** Most themes treat the centre differently; omitted fields fall back to `node`. */
  root: Partial<NodeAppearance>;
};

/** Used when a document has no theme of its own, or names one that is gone. */
export const DEFAULT_THEME_ID: MindmapThemeId = "classic";

export const MINDMAP_THEMES: Record<MindmapThemeId, MindmapTheme> = {
  classic: {
    id: "classic",
    label: "经典",
    description: "彩色分支，圆角卡片。默认。",
    branchColors: [
      "#38bdf8", "#34d399", "#fbbf24", "#f472b6",
      "#a78bfa", "#22d3ee", "#fb923c", "#4ade80",
    ],
    canvasBackground: "transparent",
    defaultEdgeColor: "#64748b",
    node: {
      fill: "#1e293b",
      textColor: "#e2e8f0",
      borderColor: "transparent",
      shape: "rounded",
      fontSize: 15,
      fontWeight: "normal",
    },
    root: { fill: "#0ea5e9", textColor: "#082f49", fontWeight: "bold", fontSize: 17 },
  },

  minimal: {
    id: "minimal",
    label: "简约",
    description: "单色细线，无填充。适合打印。",
    branchColors: ["#334155", "#475569", "#64748b", "#94a3b8"],
    canvasBackground: "#ffffff",
    defaultEdgeColor: "#cbd5e1",
    node: {
      fill: "transparent",
      textColor: "#0f172a",
      borderColor: "#cbd5e1",
      shape: "underline",
      fontSize: 15,
      fontWeight: "normal",
    },
    root: { borderColor: "transparent", fontWeight: "bold", fontSize: 18 },
  },

  dark: {
    id: "dark",
    label: "深色",
    description: "近黑背景，低饱和分支。夜间阅读。",
    branchColors: ["#60a5fa", "#4ade80", "#facc15", "#f472b6", "#c084fc"],
    canvasBackground: "#0b1220",
    defaultEdgeColor: "#1e293b",
    node: {
      fill: "#131c2e",
      textColor: "#cbd5e1",
      borderColor: "#1e293b",
      shape: "rounded",
      fontSize: 15,
      fontWeight: "normal",
    },
    root: { fill: "#1d4ed8", textColor: "#eff6ff", fontWeight: "bold" },
  },

  sketch: {
    id: "sketch",
    label: "手绘",
    description: "暖色纸感，胶囊形，虚线描边。",
    branchColors: ["#b45309", "#15803d", "#b91c1c", "#7c3aed", "#0f766e"],
    canvasBackground: "#fdf6e3",
    defaultEdgeColor: "#d6c7a1",
    node: {
      fill: "#fffdf5",
      textColor: "#3f3f46",
      borderColor: "#b45309",
      shape: "capsule",
      fontSize: 15,
      fontWeight: "normal",
    },
    root: { fill: "#fde68a", textColor: "#78350f", fontWeight: "bold" },
  },

  contrast: {
    id: "contrast",
    label: "高对比",
    description: "纯黑白，粗描边。弱视与投影场景。",
    branchColors: ["#000000"],
    canvasBackground: "#ffffff",
    defaultEdgeColor: "#000000",
    node: {
      fill: "#ffffff",
      textColor: "#000000",
      borderColor: "#000000",
      shape: "rect",
      fontSize: 16,
      fontWeight: "bold",
    },
    root: { fill: "#000000", textColor: "#ffffff", fontSize: 18 },
  },

  corporate: {
    id: "corporate",
    label: "企业",
    description: "克制的主色加灰阶，适合汇报。",
    branchColors: ["#1d4ed8", "#0f766e", "#6d28d9", "#475569"],
    canvasBackground: "#f8fafc",
    defaultEdgeColor: "#94a3b8",
    node: {
      fill: "#ffffff",
      textColor: "#1e293b",
      borderColor: "#cbd5e1",
      shape: "rounded",
      fontSize: 14,
      fontWeight: "normal",
    },
    root: { fill: "#1d4ed8", textColor: "#ffffff", fontWeight: "bold", fontSize: 16 },
  },
};

export const MINDMAP_THEME_LIST: MindmapTheme[] = Object.values(MINDMAP_THEMES);

/**
 * Resolves a theme id, tolerating anything.
 *
 * Called with a value read back from storage or from a document's frontmatter,
 * so it can be a theme that has since been removed, an older id, or nonsense.
 * Falling back to the default is the only answer that keeps a map renderable.
 */
export function resolveThemeId(value: unknown): MindmapThemeId {
  // Matched against the list rather than with `value in MINDMAP_THEMES`, which
  // says yes to `"toString"` and `"constructor"` because they are inherited from
  // Object.prototype. A document carrying one of those would then be handed a
  // function where a theme belongs, and the first read of `theme.node` would
  // fail somewhere far from here. `Object.hasOwn` would also do; the list is
  // unambiguous and needs no such reasoning at the call site.
  return typeof value === "string" && MINDMAP_THEME_LIST.some((theme) => theme.id === value)
    ? (value as MindmapThemeId)
    : DEFAULT_THEME_ID;
}

/**
 * The appearance of one node: what it sets explicitly, and the theme for the rest.
 *
 * This is the decision-3 rule in one function, and the reason switching themes
 * is safe. The check is `!= null` rather than truthiness on purpose — an empty
 * string is a real value elsewhere in this codebase (`color: ""` means "use the
 * default"), but `transparent` is a colour a node can genuinely hold, so the
 * test has to be about presence rather than about truthiness.
 */
export function resolveNodeAppearance(
  node: Pick<MindmapNode, "color" | "textColor" | "borderColor" | "shape" | "fontSize" | "fontWeight">,
  theme: MindmapTheme,
  isRoot: boolean
): NodeAppearance {
  const base = isRoot ? { ...theme.node, ...theme.root } : theme.node;

  return {
    fill: node.color != null && node.color !== "" ? node.color : base.fill,
    textColor: node.textColor != null && node.textColor !== "" ? node.textColor : base.textColor,
    borderColor:
      node.borderColor != null && node.borderColor !== "" ? node.borderColor : base.borderColor,
    shape: node.shape ?? base.shape,
    fontSize: node.fontSize ?? base.fontSize,
    fontWeight: node.fontWeight ?? base.fontWeight,
  };
}

/**
 * The colour of a branch at a given depth.
 *
 * Cycled rather than indexed directly, because a deep map has more levels than
 * any theme has colours and the alternative is either an error or a transparent
 * branch.
 */
export function branchColorFor(theme: MindmapTheme, colorIndex: number): string {
  const colors = theme.branchColors;
  if (!colors.length) return theme.defaultEdgeColor;
  const index = ((colorIndex % colors.length) + colors.length) % colors.length;
  return colors[index];
}
