/**
 * Turning the live mind map canvas into a file that stands on its own.
 *
 * The canvas on screen is not exportable as it is: it carries the pan and zoom
 * on a group, interactive-only elements the reader never wants in a file, and
 * colours that come from stylesheets and CSS variables rather than from the
 * document. This module takes the live `<svg>`, copies it, and resolves all
 * three.
 *
 * It is the same code path for both exports, which is the point: the PNG is
 * this SVG rasterised. One function rather than two means a fix to how a node's
 * fill is resolved cannot land in one format and not the other — and the two
 * drifting apart is exactly the kind of bug nobody notices until a file comes
 * out wrong.
 */

export type StandaloneMindmapSvgOptions = {
  /** The laid-out map's bounds, in canvas coordinates. */
  bounds: { minX: number; minY: number; width: number; height: number };
  /**
   * Whether the app is in its dark theme.
   *
   * Only the fallback fills need it. Anything the document itself set is already
   * inline on the element and is kept as it is.
   */
  dark: boolean;
  /** Space left around the content in the exported file. */
  padding?: number;
};

export type StandaloneMindmapSvg = {
  svg: string;
  width: number;
  height: number;
};

/** The font stack a file should carry, since the app's own does not travel. */
const EXPORT_FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/**
 * What a decoration looks like once the stylesheet is gone.
 *
 * The badges, chips and marks on a node are painted by class name on screen, and
 * a stylesheet does not travel with a file. Without this the whole set arrives
 * black: a note badge that is merely the wrong colour in a light export becomes
 * an invisible blob against a dark node, and a tag chip becomes black text on a
 * black rectangle. So each one is written out as a literal, per theme.
 *
 * Literals rather than computed styles, for the same reason the node fills above
 * are literals: what the reader sees is a `color-mix` of a CSS variable, which
 * cannot be evaluated without the document's stylesheet — and a value computed
 * in one engine is not always parseable by the next one that opens the file.
 * Nothing here is something a reader can set, so these are the app's own accents
 * written down rather than a guess at them.
 */
type DecorationRule = {
  selector: string;
  fill?: { dark: string; light: string };
  stroke?: { dark: string; light: string };
  /** Text needs its size and weight too — neither travels with the file. */
  font?: { size: string; weight: string };
  /**
   * Whatever else the stylesheet was saying that matters: a dash pattern, a line
   * width, and `fill: none` — which is not a colour, so it does not belong above.
   */
  attributes?: Record<string, string>;
};

const DECORATION_RULES: DecorationRule[] = [
  // Free topics: the box and its text, dashed as on screen. The fill is the
  // app's own surface rather than the node fill, because a free topic has no
  // branch to take a colour from.
  {
    selector: ".mindmap-floating-rect",
    fill: { dark: "#1e293b", light: "#f8fafc" },
    stroke: { dark: "#3f7fa8", light: "#7cb6d6" },
    attributes: { "stroke-width": "1.2", "stroke-dasharray": "4 3" },
  },
  {
    selector: ".mindmap-floating-text",
    fill: { dark: "#e2e8f0", light: "#0f172a" },
    font: { size: "13px", weight: "500" },
  },
  // Relations between topics. Dashed in the file as on screen, so a line that is
  // an addition to the outline is not mistaken for part of it.
  {
    selector: ".mindmap-relation",
    stroke: { dark: "#b28ae0", light: "#8b5cf6" },
    // `fill: none` is not a colour, and a path without it would arrive as a
    // black shape where the file has no stylesheet to say otherwise.
    attributes: { fill: "none", "stroke-width": "1.4", "stroke-dasharray": "5 4" },
  },
  // Note badge, at the node's top-left corner.
  {
    selector: ".mindmap-note-marker circle",
    fill: { dark: "#16405a", light: "#dcecf8" },
    stroke: { dark: "#2f7fa8", light: "#7cb6d6" },
  },
  {
    selector: ".mindmap-note-marker path",
    stroke: { dark: "#7dd3fc", light: "#0369a1" },
  },
  // Link badge, at its bottom-left.
  {
    selector: ".mindmap-link-marker circle",
    fill: { dark: "#35275c", light: "#ece7fd" },
    stroke: { dark: "#8b6fd0", light: "#b39ae8" },
  },
  {
    selector: ".mindmap-link-marker path",
    stroke: { dark: "#c084fc", light: "#6d28d9" },
  },
  // The icon: lucide strokes with `currentColor`, so an export that says nothing
  // about it draws the icon in the document's default text colour — black, on
  // the node's own fill. Setting the stroke on the icon's own `<svg>` is enough,
  // because its paths inherit from it.
  { selector: ".mindmap-node-icon", stroke: { dark: "#a5d8f0", light: "#0369a1" } },
  // Outline numbers.
  {
    selector: ".mindmap-node-number",
    fill: { dark: "#9fd8f5", light: "#0369a1" },
    font: { size: "10px", weight: "600" },
  },
  // Priority and progress, on the node. The badge's own fill is inline and
  // already survives; the numeral and the dial are not.
  { selector: ".mindmap-priority-text", fill: { dark: "#ffffff", light: "#ffffff" }, font: { size: "9px", weight: "700" } },
  {
    selector: ".mindmap-node-marks .mindmap-progress-track",
    fill: { dark: "#0f172a", light: "#e2e8f0" },
  },
  {
    selector: ".mindmap-node-marks .mindmap-progress-fill",
    fill: { dark: "#7dd3fc", light: "#0284c7" },
  },
  // Tags, under the node.
  {
    selector: ".mindmap-tag-chip",
    fill: { dark: "#14384a", light: "#e0f2fe" },
    stroke: { dark: "#2f6f96", light: "#7cb6d6" },
  },
  {
    selector: ".mindmap-tag-chip.is-more",
    fill: { dark: "#243244", light: "#e2e8f0" },
    stroke: { dark: "#64748b", light: "#94a3b8" },
  },
  {
    selector: ".mindmap-tag-chip-text",
    fill: { dark: "#7dd3fc", light: "#0369a1" },
    font: { size: "9px", weight: "600" },
  },
  // The overflow chip counts up rather than naming a tag, and reads as a note
  // about the row rather than as one of the tags.
  {
    selector: ".mindmap-tag-chip.is-more + .mindmap-tag-chip-text",
    fill: { dark: "#94a3b8", light: "#64748b" },
  },
];

/**
 * A standalone SVG string for a laid-out map, and the size it should be drawn at.
 *
 * Returns null when there is nothing to export, so the callers do not each have
 * to check the same two things.
 */
export function buildStandaloneMindmapSvg(
  source: SVGSVGElement | null,
  options: StandaloneMindmapSvgOptions
): StandaloneMindmapSvg | null {
  if (!source) return null;

  const padding = options.padding ?? 40;
  const { minX, minY, width, height } = options.bounds;
  const exportWidth = width + padding * 2;
  const exportHeight = height + padding * 2;

  const clone = source.cloneNode(true) as SVGSVGElement;
  // The namespace is not set here on purpose. The serializer writes it, because
  // the element is in the SVG namespace, and setting it as well produces the
  // attribute twice — which is not valid XML, and a strict parser refuses the
  // file rather than ignoring the duplicate.
  clone.setAttribute("viewBox", `${minX - padding} ${minY - padding} ${exportWidth} ${exportHeight}`);
  clone.setAttribute("width", `${exportWidth}`);
  clone.setAttribute("height", `${exportHeight}`);

  // The pan and zoom belong to the viewport, not to the map. A file that carried
  // them would open scrolled to wherever the reader happened to be.
  clone.querySelector("g.mindmap-viewport")?.removeAttribute("transform");

  // Interactive-only elements: a selection ring or a resize handle is a control,
  // not part of the drawing.
  clone.querySelectorAll(".mindmap-node-selection-ring").forEach((el) => el.remove());
  // A free topic's selection ring is the same kind of thing: a control, not the
  // picture, and a file that arrived with one would look like a bug.
  clone.querySelectorAll(".mindmap-floating-selection").forEach((el) => el.remove());
  clone.querySelectorAll(".mindmap-node-add-btn").forEach((el) => el.remove());
  clone.querySelectorAll(".mindmap-node-resize-handle").forEach((el) => el.remove());

  const nodeFill = options.dark ? "#1e293b" : "#ffffff";
  const nodeTextFill = options.dark ? "#f8fafc" : "#0f172a";
  const rootTextFill = "#38bdf8";

  // Rects and circles take their fill from a stylesheet on screen, which does
  // not travel with the file. The inline style is the node's own choice and wins
  // where it exists; the rest gets a literal.
  clone.querySelectorAll("rect.mindmap-node-rect").forEach((rect) => {
    const customFill = (rect as SVGRectElement).style.fill;
    const customStroke = (rect as SVGRectElement).style.stroke;
    const customStrokeWidth = (rect as SVGRectElement).style.strokeWidth;

    rect.setAttribute("fill", customFill || nodeFill);
    if (customStroke) rect.setAttribute("stroke", customStroke);
    if (customStrokeWidth) rect.setAttribute("stroke-width", customStrokeWidth);
  });

  clone.querySelectorAll("rect.mindmap-node-rect-underline").forEach((rect) => {
    rect.setAttribute("fill", "transparent");
  });

  clone.querySelectorAll("circle.mindmap-collapse-circle").forEach((circle) => {
    circle.setAttribute("fill", nodeFill);
  });

  clone.querySelectorAll("text.mindmap-node-title-text").forEach((textEl) => {
    const isRootText = textEl.classList.contains("root-title");
    const customFill = (textEl as SVGTextElement).style.fill;
    const customFontSize = (textEl as SVGTextElement).style.fontSize;
    const customFontWeight = (textEl as SVGTextElement).style.fontWeight;

    textEl.setAttribute("fill", customFill || (isRootText ? rootTextFill : nodeTextFill));
    textEl.setAttribute("font-family", EXPORT_FONT_FAMILY);
    textEl.setAttribute("font-size", customFontSize || (isRootText ? "14px" : "12.5px"));
    textEl.setAttribute("font-weight", customFontWeight || (isRootText ? "700" : "500"));
  });

  for (const rule of DECORATION_RULES) {
    const fill = options.dark ? rule.fill?.dark : rule.fill?.light;
    const stroke = options.dark ? rule.stroke?.dark : rule.stroke?.light;

    clone.querySelectorAll(rule.selector).forEach((element) => {
      if (fill) element.setAttribute("fill", fill);
      if (stroke) element.setAttribute("stroke", stroke);
      if (rule.font) {
        element.setAttribute("font-family", EXPORT_FONT_FAMILY);
        element.setAttribute("font-size", rule.font.size);
        element.setAttribute("font-weight", rule.font.weight);
      }
      if (rule.attributes) {
        for (const [name, value] of Object.entries(rule.attributes)) {
          element.setAttribute(name, value);
        }
      }
    });
  }

  return {
    svg: new XMLSerializer().serializeToString(clone),
    width: exportWidth,
    height: exportHeight,
  };
}
