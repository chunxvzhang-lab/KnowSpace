import type { ThemeMode } from "../core/types";

/**
 * Single source of truth for every canvas colour.
 *
 * Both the on-screen renderer (CanvasView) and the SVG/PNG exporter
 * (exportCanvasToSvg) read from here. They used to keep separate copies of the
 * palette and had drifted apart — the light theme exported on a #f8fafc
 * background instead of the #ffffff the user was looking at, e-ink exported
 * near-white instead of its paper tone, and the dot grid never matched at all.
 */
export type CanvasThemeColors = {
  /** Canvas backdrop. */
  canvasBg: string;
  /** Dot-grid colour drawn over the backdrop. */
  dotColor: string;
  cardBg: string;
  cardBorder: string;
  cardText: string;
  cardHeaderBg: string;
  cardHeaderBorder: string;
  cardHeaderText: string;
  cardShadow: string;
  groupBorder: string;
  groupBg: string;
  edgeColor: string;
  edgeLabelBg: string;
  edgeLabelText: string;
  anchorDotBg: string;

  // ── Exporter-only extras ────────────────────────────────────────────────
  /** Inline code / code block background inside card bodies. */
  codeBg: string;
  /** Blockquote left border inside card bodies. */
  quoteBorder: string;

  /** Dark family (twitter). Drives contrast-dependent choices. */
  isDark: boolean;
  /** E-ink family. */
  isEink: boolean;
};

export function getCanvasThemeColors(theme: ThemeMode): CanvasThemeColors {
  const isDark =
    theme === "twitter" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches));
  const isEink = theme === "eink";

  if (isEink) {
    return {
      canvasBg: "#f4f1ea",
      dotColor: "#1a1a1a",
      cardBg: "#ffffff",
      cardBorder: "#1a1a1a",
      cardText: "#1a1a1a",
      cardHeaderBg: "#ede8df",
      cardHeaderBorder: "#d5cebf",
      cardHeaderText: "#1a1a1a",
      cardShadow: "0 2px 8px rgba(0,0,0,0.1)",
      groupBorder: "#1a1a1a",
      groupBg: "rgba(0,0,0,0.02)",
      edgeColor: "#1a1a1a",
      edgeLabelBg: "#f4f1ea",
      edgeLabelText: "#1a1a1a",
      anchorDotBg: "#1a1a1a",
      codeBg: "#efe9dd",
      quoteBorder: "#b9b1a0",
      isDark: false,
      isEink: true,
    };
  }

  if (!isDark) {
    return {
      canvasBg: "#ffffff",
      dotColor: "#e2e8f0",
      cardBg: "#ffffff",
      cardBorder: "#e2e8f0",
      cardText: "#1e293b", // Slate 800 - crisp, high-contrast dark text
      cardHeaderBg: "#f8fafc",
      cardHeaderBorder: "#e2e8f0",
      cardHeaderText: "#334155",
      cardShadow: "0 4px 16px rgba(0,0,0,0.06)",
      groupBorder: "rgba(100, 116, 139, 0.4)",
      groupBg: "rgba(241, 245, 249, 0.6)",
      edgeColor: "#0284c7",
      edgeLabelBg: "#ffffff",
      edgeLabelText: "#0f172a",
      anchorDotBg: "#0284c7",
      codeBg: "rgba(15,23,42,0.06)",
      quoteBorder: "rgba(100,116,139,0.45)",
      isDark: false,
      isEink: false,
    };
  }

  // Dark Theme (Twitter / Dark)
  return {
    canvasBg: "#0f172a",
    dotColor: "rgba(255,255,255,0.15)",
    cardBg: "#1e293b",
    cardBorder: "rgba(255,255,255,0.12)",
    cardText: "#f1f5f9", // Crisp light text on dark background
    cardHeaderBg: "rgba(255,255,255,0.04)",
    cardHeaderBorder: "rgba(255,255,255,0.08)",
    cardHeaderText: "#e2e8f0",
    cardShadow: "0 8px 24px rgba(0,0,0,0.35)",
    groupBorder: "rgba(255,255,255,0.2)",
    groupBg: "rgba(255,255,255,0.03)",
    edgeColor: "#38bdf8",
    edgeLabelBg: "#1e293b",
    edgeLabelText: "#f1f5f9",
    anchorDotBg: "#38bdf8",
    codeBg: "rgba(255,255,255,0.08)",
    quoteBorder: "rgba(255,255,255,0.28)",
    isDark: true,
    isEink: false,
  };
}

/**
 * Maps the loosely-typed export option (kept as `string` for backwards
 * compatibility with older call sites) onto a real ThemeMode, translating the
 * legacy "dark" alias.
 */
export function normalizeExportTheme(theme?: string): ThemeMode {
  if (theme === "light" || theme === "eink" || theme === "twitter" || theme === "system") {
    return theme;
  }
  if (theme === "dark") return "twitter";
  return "light";
}
