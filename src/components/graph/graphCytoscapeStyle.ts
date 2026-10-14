import type { ThemeMode } from "../../core/types";
import { getAccentInfo } from "../../services/themeTokens";

/**
 * The full Cytoscape stylesheet of the graph pane, as static data.
 *
 * Extracted verbatim from GraphViewPane's init effect (decomposition of the
 * pane). The theme-to-palette derivation that fed the stylesheet — the
 * `isDark`/`isEink` pair and the seven color locals — moved with it, because
 * the stylesheet is their only reader. `window.matchMedia` therefore runs
 * where it always ran: once per Cytoscape init, inside the effect that calls
 * this. Nothing else is read — same theme + clusterByFolder in, same
 * stylesheet out.
 *
 * The untyped cast on the return is the original's, moved verbatim: the
 * stylesheet embeds per-element data mappers that Cytoscape's own style types
 * cannot express.
 */
export function graphCytoscapeStyle(theme: ThemeMode, clusterByFolder: boolean) {
  const isDark =
    theme === "twitter" ||
    (theme === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  const isEink = theme === "eink";
  // 青色族走 --accent-info 的 TS 镜像表（阶段 C1）；#0284c7 白底不达正文阈值。
  const accentInfo = getAccentInfo(theme, isDark);

  /**
   * Node palette, re-derived 2026-10-14 against measured contrast.
   *
   * The previous values were tuned for looks and were never measured against the
   * canvas. Auditing them (`contrast-audit` probe, same machine) showed the
   * LIGHT theme's two most common node kinds failing the 3:1 non-text threshold
   * (WCAG 1.4.11) on the white canvas the pane actually paints:
   *
   *     normalBg #94a3b8 on #ffffff = 2.56:1   FAIL
   *     spaceBg  #f59e0b on #ffffff = 2.15:1   FAIL
   *
   * so a plain note's dot and a flash-note's dot were both washing out — the
   * flash notes (the ones the user is meant to spot) worst of all. The dark and
   * eink palettes passed and are untouched.
   *
   * The replacements keep the same hue family and the same visual weight while
   * clearing the threshold on white:
   *   - normalBg: slate-500 instead of slate-400 → 4.76:1 (was 2.56:1)
   *   - spaceBg:  amber-600 instead of amber-500 → 3.19:1 (was 2.15:1)
   * `currentBg` (the active document, violet-600) already cleared it at 5.70:1
   * and is unchanged, so the "active node is the most prominent" hierarchy the
   * palette is built around still holds: 5.70 > 4.76 > 3.19.
   */
  const currentBg = isEink ? "#000000" : isDark ? "#8b5cf6" : "#7c3aed"; // Obsidian vivid purple for active node
  const normalBg = isEink ? "#444444" : "#64748b"; // Slate-500: 4.76:1 on white, 3.89:1 on dark
  const spaceBg = isEink ? "#777777" : isDark ? "#f59e0b" : "#d97706"; // Amber-600 on light: 3.19:1 on white
  const edgeColor = isEink
    ? "rgba(0, 0, 0, 0.4)"
    : isDark
      ? "rgba(148, 163, 184, 0.22)"
      : "rgba(100, 116, 139, 0.2)";
  const crossFolderEdgeColor = isEink ? "#000000" : accentInfo.accent; // Cyan/sky blue for cross-folder links
  const nodeTextColor = isEink ? "#000000" : isDark ? "#f8fafc" : "#0f172a";
  const textOutlineColor = isEink ? "#ffffff" : isDark ? "#0b0f19" : "#ffffff";

  return [
    {
      // 彻底关闭画布核心区（空白区域）在点击时的任何圆形阴影/点击反馈光圈
      selector: "core",
      style: {
        "active-bg-opacity": 0,
        "active-bg-size": 0,
        "selection-box-opacity": 0,
        "outside-texture-bg-opacity": 0,
      },
    },
    {
      selector: "node",
      style: {
        label: "data(label)",
        "font-size": "11px",
        "font-family":
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        "font-weight": 500,
        color: nodeTextColor,
        "text-valign": "bottom",
        "text-margin-y": 5,
        "text-max-width": "120px",
        "text-wrap": "wrap",
        "text-outline-color": textOutlineColor,
        "text-outline-width": 2,
        "text-outline-opacity": 0.9,
        /**
         * Hide labels that would render smaller than this.
         *
         * Zoomed out on a large vault every label is a few pixels tall, and
         * drawing them costs a text layout per node per frame while producing
         * an illegible smear over the nodes. Cytoscape skips the text draw
         * entirely below the threshold, which is both faster and clearer —
         * the shape and colour of the graph are what is readable at that zoom
         * anyway. Hovering a node and the highlighted neighbourhood still show
         * their labels, and the threshold is low enough that the default
         * fitted view of a small graph is unaffected.
         */
        "min-zoomed-font-size": 7,
        // 节点必须为标准圆形（Ellipse），尺寸随引用权重适度缩放
        shape: "ellipse",
        width: (ele: any) => {
          const inDeg = ele.data("inDegree") || 0;
          return ele.data("isCurrent") ? 18 : Math.min(18, Math.max(9, 9 + inDeg * 1.8));
        },
        height: (ele: any) => {
          const inDeg = ele.data("inDegree") || 0;
          return ele.data("isCurrent") ? 18 : Math.min(18, Math.max(9, 9 + inDeg * 1.8));
        },
        "background-color": (ele: any) => {
          if (ele.data("isCurrent")) return currentBg;
          if (clusterByFolder && ele.data("clusterColor")) {
            return isEink ? normalBg : ele.data("clusterColor");
          }
          if (ele.data("type") === "space") return spaceBg;
          return normalBg;
        },
        // 极简风格与平滑过渡
        "border-width": 0,
        "border-opacity": 0,
        "border-style": "solid",
        "overlay-opacity": 0,
        "overlay-padding": 0,
        "active-bg-opacity": 0,
        "active-bg-size": 0,
        "transition-property": "opacity, border-width, border-color, background-color",
        "transition-duration": "0.18s",
        "transition-timing-function": "ease-out",
      },
    },
    {
      selector: "edge",
      style: {
        width: 1.2,
        "line-color": edgeColor,
        "target-arrow-color": edgeColor,
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        "arrow-scale": 0.65,
        "line-style": isEink ? "dashed" : "solid",
        "overlay-opacity": 0,
        "transition-property": "opacity, line-color, width, target-arrow-color",
        "transition-duration": "0.18s",
        "transition-timing-function": "ease-out",
      },
    },
    {
      // 跨文件夹引用关系：采用虚线与专属青蓝主色调强化跨边界感知
      selector: "edge[?isCrossFolder]",
      style: {
        "line-color": crossFolderEdgeColor,
        "target-arrow-color": crossFolderEdgeColor,
        "line-style": "dashed",
        "line-dash-pattern": [5, 4],
        width: 1.5,
        opacity: 0.9,
      },
    },
    {
      // 鼠标悬停探灯连线点亮效果
      selector: "node.hovered",
      style: {
        "z-index": 1000,
        opacity: 1,
        "border-width": 2,
        "border-color": isEink ? "#000000" : accentInfo.accent,
        "border-opacity": 0.85,
        /**
         * The hovered node keeps its label even when the graph is zoomed out
         * past `min-zoomed-font-size`.
         *
         * Without this the zoom threshold would be a one-way door: at the zoom
         * levels where labels are suppressed, pointing at a dot would tell the
         * user nothing about which note it is — the single interaction the
         * threshold makes most necessary. `min-zoomed-font-size: 0` is
         * Cytoscape's "never suppress this element" value.
         */
        "min-zoomed-font-size": 0,
        "font-size": "12px",
        "text-outline-width": 3,
      },
    },
    {
      selector: "edge.hovered",
      style: {
        "line-color": isEink ? "#000000" : accentInfo.accent,
        "target-arrow-color": isEink ? "#000000" : accentInfo.accent,
        width: 2.0,
        opacity: 1,
        "z-index": 1000,
      },
    },
    {
      // 高亮规则必须只作用于边
      selector: "edge.highlighted",
      style: {
        "line-color": isEink ? "#000000" : "#818cf8",
        "target-arrow-color": isEink ? "#000000" : "#818cf8",
        width: 2.2,
        opacity: 1,
        "z-index": 999,
      },
    },
    {
      selector: "edge.highlighted[?isCrossFolder]",
      style: {
        "line-color": isEink ? "#000000" : "#06b6d4",
        "target-arrow-color": isEink ? "#000000" : "#06b6d4",
        "line-style": "dashed",
        "line-dash-pattern": [6, 3],
        width: 2.5,
        opacity: 1,
        "z-index": 999,
      },
    },
    {
      // 节点高亮置顶
      selector: "node.highlighted",
      style: {
        opacity: 1,
        "background-opacity": 1,
        "border-width": 0,
        "z-index": 999,
        // The selected node and its neighbourhood are the answer to "what is
        // this connected to", so their labels must survive the zoom threshold
        // even when the surrounding labels are suppressed.
        "min-zoomed-font-size": 0,
      },
    },
    {
      // 彻底关闭按下/激活态的一切附加绘制
      selector: ":active",
      style: {
        "overlay-opacity": 0,
        "overlay-padding": 0,
        "overlay-color": "transparent",
        "active-bg-opacity": 0,
        "active-bg-size": 0,
        "underlay-opacity": 0,
        "underlay-padding": 0,
      },
    },
    {
      selector: ":selected",
      style: {
        "overlay-opacity": 0,
        "overlay-padding": 0,
        "active-bg-opacity": 0,
        "active-bg-size": 0,
        "border-width": 0,
        "border-opacity": 0,
      },
    },
    {
      selector: ".dimmed",
      style: {
        opacity: 0.18,
      },
    },
  ] as any;
}
