/**
 * Canvas primitives: shared constants, media-type detection and containment
 * predicates.
 *
 * This is the bottom of the canvas module graph — it depends on nothing else in
 * `services/canvas*` and is imported by every layer above it. Keeping it free of
 * DOM access means it can be exercised directly in tests.
 *
 * Part of the canvasService split (see docs/CANVAS_SPLIT_DESIGN.md). Code here
 * was moved verbatim; behaviour is unchanged.
 */

import type { CanvasNode, CanvasGroupNode, MediaFileType } from "../types/canvasTypes";

/**
 * Card / edge colours.
 *
 * Keys 1–6 are the six colours defined by the open JSON Canvas standard, so
 * boards stay interoperable with other tools. Keys 7–12 are our own extension
 * for richer batch recolouring — readers that do not know them fall back to a
 * neutral card, which is a graceful degradation.
 *
 * Colour is resolved through this table only; nothing hard-codes the count, so
 * every palette picker picks new entries up automatically.
 */
export const CANVAS_COLOR_PALETTES: Record<string, { label: string; stroke: string; bg: string }> = {
  "1": { label: "珊瑚红", stroke: "#ef4444", bg: "rgba(239, 68, 68, 0.12)" },
  "2": { label: "活力橙", stroke: "#f97316", bg: "rgba(249, 115, 22, 0.12)" },
  "3": { label: "琥珀黄", stroke: "#eab308", bg: "rgba(234, 179, 8, 0.12)" },
  "4": { label: "翡翠绿", stroke: "#10b981", bg: "rgba(16, 185, 129, 0.12)" },
  "5": { label: "天青蓝", stroke: "#06b6d4", bg: "rgba(6, 182, 212, 0.12)" },
  "6": { label: "罗兰紫", stroke: "#a855f7", bg: "rgba(168, 85, 247, 0.12)" },
  "7": { label: "靛蓝", stroke: "#6366f1", bg: "rgba(99, 102, 241, 0.12)" },
  "8": { label: "粉樱", stroke: "#ec4899", bg: "rgba(236, 72, 153, 0.12)" },
  "9": { label: "玫瑰红", stroke: "#f43f5e", bg: "rgba(244, 63, 94, 0.12)" },
  "10": { label: "青碧", stroke: "#14b8a6", bg: "rgba(20, 184, 166, 0.12)" },
  "11": { label: "青柠", stroke: "#84cc16", bg: "rgba(132, 204, 22, 0.12)" },
  "12": { label: "石板灰", stroke: "#64748b", bg: "rgba(100, 116, 139, 0.12)" },
};

/**
 * The six colours defined by the JSON Canvas standard, in order.
 *
 * Used where space is tight — the floating card toolbar — so those compact
 * controls keep showing the interoperable core palette, while the roomier
 * batch pickers offer the full extended set.
 */
export const CANVAS_STANDARD_COLOR_IDS = ["1", "2", "3", "4", "5", "6"] as const;

/**
 * Common knowledge relationship preset labels
 */
export const CANVAS_RELATION_PRESETS = [
  "属于",
  "前置",
  "包含",
  "派生",
  "支持",
  "反驳",
  "引用",
  "协同",
] as const;

/**
 * Recognizes media file types (images, audio, video, PDF) supported on the canvas
 */
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "m4a", "flac", "aac"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "ogv"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "canvas"]);

export function getMediaFileType(filePathOrUrl?: string): MediaFileType {
  if (!filePathOrUrl || typeof filePathOrUrl !== "string") return "other";
  const trimmed = filePathOrUrl.trim();
  if (trimmed.startsWith("data:image/")) return "image";
  if (trimmed.startsWith("data:audio/")) return "audio";
  if (trimmed.startsWith("data:video/")) return "video";
  if (trimmed.startsWith("data:application/pdf")) return "pdf";

  const clean = trimmed.split("?")[0].split("#")[0];
  const parts = clean.split(".");
  if (parts.length <= 1) return "other";
  const ext = parts[parts.length - 1].toLowerCase();

  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (PDF_EXTENSIONS.has(ext)) return "pdf";
  if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown";
  return "other";
}

export function isMediaFile(filePathOrUrl?: string): boolean {
  const type = getMediaFileType(filePathOrUrl);
  return type === "image" || type === "audio" || type === "video" || type === "pdf";
}

export function isImageFile(filePathOrUrl?: string): boolean {
  return getMediaFileType(filePathOrUrl) === "image";
}

/**
 * Resolves a canvas media reference into a URL the renderer's <img>/<video>/
 * <audio> elements can actually load.
 *
 * Media cards store `assets/<file>` **relative to the .canvas file's folder**
 * (JSON Canvas convention, keeps boards portable). Feeding that relative path
 * straight into `<img src>` makes the browser resolve it against the HTML
 * page's own URL (`.../dist/index.html`), which points nowhere — the card then
 * renders a broken-image placeholder instead of the picture.
 *
 * Resolution rules:
 * 1. `data:` / `http(s):` / `blob:` / `file:` → returned untouched.
 * 2. Absolute filesystem path (e.g. `C:\vault\assets\a.png` or `/vault/a.png`)
 *    → converted to a `file://` URL.
 * 3. Relative path → joined against the directory of `canvasFilePath`, then
 *    converted to a `file://` URL.
 * 4. Relative path with no known canvas file → returned untouched (best
 *    effort; the image simply cannot be located yet).
 *
 * `canvasFilePath` is the absolute path of the `.canvas` document itself.
 */
export function resolveMediaSrc(file: string, canvasFilePath?: string): string {
  if (!file) return "";
  const value = file.trim();
  if (!value) return "";
  if (/^(data:|https?:|blob:|file:)/i.test(value)) return value;

  const isWinAbsolute = /^[a-zA-Z]:[\\/]/.test(value);
  const isUnixAbsolute = value.startsWith("/") && !value.startsWith("//");
  const isAbsolute = isWinAbsolute || isUnixAbsolute;
  if (!isAbsolute && !canvasFilePath) return value;

  const normalized = value.replace(/\\/g, "/");
  const canvasNorm = (canvasFilePath ?? "").replace(/\\/g, "/");

  let combined: string;
  if (isAbsolute) {
    combined = normalized;
  } else {
    const dirEnd = canvasNorm.lastIndexOf("/");
    const dir = dirEnd >= 0 ? canvasNorm.slice(0, dirEnd + 1) : "";
    combined = `${dir}${normalized.replace(/^\/+/, "")}`;
  }

  // Build a file:// URL: /C:/vault/assets/a.png → file:///C:/vault/assets/a.png
  let urlPath = combined.startsWith("/") ? combined : `/${combined}`;
  try {
    urlPath = encodeURI(urlPath).replace(/#/g, "%23").replace(/\?/g, "%3F");
  } catch {
    // Malformed sequence — keep the raw path, still better than a broken img.
  }
  return `file://${urlPath}`;
}

/**
 * Checks whether a node's center point lies within a group's bounding rectangle
 */
export function isNodeInsideGroup(node: CanvasNode, group: CanvasGroupNode): boolean {
  if (node.id === group.id || node.type === "group") return false;
  const centerX = node.x + node.width / 2;
  const centerY = node.y + node.height / 2;
  return (
    centerX >= group.x &&
    centerX <= group.x + group.width &&
    centerY >= group.y &&
    centerY <= group.y + group.height
  );
}

/**
 * Finds all nodes whose center point lies inside the given group's rectangle
 */
export function getNodesInsideGroup(nodes: CanvasNode[], group: CanvasGroupNode): CanvasNode[] {
  return nodes.filter((n) => isNodeInsideGroup(n, group));
}

/**
 * Finds the immediate parent container (group) for a given node.
 * If nested in multiple groups, returns the innermost (smallest area) container.
 */
export function findContainerForNode(
  node: CanvasNode,
  allNodes: CanvasNode[]
): CanvasGroupNode | undefined {
  if (node.type === "group") return undefined;
  const groups = allNodes.filter((n): n is CanvasGroupNode => n.type === "group");
  const containing = groups.filter((g) => isNodeInsideGroup(node, g));
  if (containing.length === 0) return undefined;
  return containing.sort((a, b) => a.width * a.height - b.width * b.height)[0];
}

/**
 * Toggles a checkbox (- [ ] <-> - [x]) at a given match index in a markdown string
 */
export function toggleChecklistInMarkdown(text: string, checkboxIndex: number): string {
  let currentIndex = 0;
  return text.replace(/^(\s*[-*+]\s*\[)([ xX])(\])/gm, (match, prefix, checkState, suffix) => {
    if (currentIndex === checkboxIndex) {
      currentIndex++;
      const nextState = checkState.trim().toLowerCase() === "x" ? " " : "x";
      return `${prefix}${nextState}${suffix}`;
    }
    currentIndex++;
    return match;
  });
}
