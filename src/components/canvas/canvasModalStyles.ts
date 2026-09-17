import type { CSSProperties } from "react";
import type { ThemeMode } from "../../core/types";
import type { getCanvasThemeColors } from "../../services/canvasTheme";

/**
 * Shared chrome for the canvas modals (insert note, extract, export, spawn).
 *
 * Extracted from CanvasView during the R2 split so the extracted modal
 * components and the ones still living in the parent render identically.
 */
export const modalOverlayStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  backgroundColor: "rgba(0,0,0,0.6)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 200,
};

export function modalContentStyle(
  theme: ThemeMode,
  colors: ReturnType<typeof getCanvasThemeColors>
): CSSProperties {
  return {
    width: 440,
    backgroundColor: colors.cardBg,
    color: colors.cardText,
    borderRadius: 12,
    border: `1px solid ${colors.cardBorder}`,
    boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
    padding: 20,
  };
}

/** Neutral icon-button treatment used across the toolbar and modals. */
export function toolBtnStyle(
  theme: ThemeMode,
  colors: ReturnType<typeof getCanvasThemeColors>
): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 8px",
    background: "none",
    border: "none",
    borderRadius: 6,
    color: colors.cardText,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
    transition: "all 0.15s ease",
    whiteSpace: "nowrap",
    flexShrink: 0,
  };
}
