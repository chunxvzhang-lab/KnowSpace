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
    textEl.setAttribute(
      "font-family",
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    );
    textEl.setAttribute("font-size", customFontSize || (isRootText ? "14px" : "12.5px"));
    textEl.setAttribute("font-weight", customFontWeight || (isRootText ? "700" : "500"));
  });

  return {
    svg: new XMLSerializer().serializeToString(clone),
    width: exportWidth,
    height: exportHeight,
  };
}
