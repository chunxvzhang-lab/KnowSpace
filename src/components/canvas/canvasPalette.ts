import { CANVAS_COLOR_PALETTES } from "../../services/canvasService";

/**
 * Resolves a stored colour key (or raw hex) into the stroke/background pair the
 * canvas paints with.
 *
 * Extracted from CanvasView during the R2 split so the minimap and the card
 * layer share one definition — duplicating it would let the two drift, and the
 * minimap's whole job is to mirror what the cards look like.
 */
export function getNodePalette(
  color?: string
): { label: string; stroke: string; bg: string } | undefined {
  if (!color) return undefined;
  if (CANVAS_COLOR_PALETTES[color]) return CANVAS_COLOR_PALETTES[color];
  if (color.startsWith("#")) {
    // 1f hex ≈ 12% — the same tint the standard palette uses for its `bg`,
    // instead of 18 (~9%) which made a custom colour read noticeably paler
    // than its own swatch.
    return { label: "自定义", stroke: color, bg: `${color}1f` };
  }
  return undefined;
}
