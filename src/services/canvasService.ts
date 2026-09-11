import type {
  CanvasData,
  CanvasNode,
  CanvasEdge,
  CanvasNodeSide,
  CanvasEdgeLineStyle,
  CanvasTextNode,
  CanvasGroupNode,
  MediaFileType,
  CanvasObstacle,
} from "../types/canvasTypes";
import { renderCardMarkdown } from "./markdown";
import { serializeSvgForExport } from "./svgExport";
import { getCanvasThemeColors, normalizeExportTheme } from "./canvasTheme";

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
 * Safely parses JSON Canvas 1.0 string
 */
export function parseCanvasData(jsonString: string): CanvasData {
  if (!jsonString || typeof jsonString !== "string" || !jsonString.trim()) {
    return { nodes: [], edges: [] };
  }

  try {
    const raw = JSON.parse(jsonString);
    if (!raw || typeof raw !== "object") {
      return { nodes: [], edges: [] };
    }

    const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
    const nodes: CanvasNode[] = [];

    for (const item of rawNodes) {
      if (!item || typeof item !== "object" || typeof item.id !== "string") continue;
      const x = typeof item.x === "number" ? item.x : 0;
      const y = typeof item.y === "number" ? item.y : 0;
      const width = typeof item.width === "number" && item.width > 0 ? item.width : 260;
      const height = typeof item.height === "number" && item.height > 0 ? item.height : 160;
      const color = typeof item.color === "string" ? item.color : undefined;

      if (item.type === "text") {
        nodes.push({
          id: item.id,
          type: "text",
          text: typeof item.text === "string" ? item.text : "",
          x,
          y,
          width,
          height,
          color,
        });
      } else if (item.type === "file") {
        nodes.push({
          id: item.id,
          type: "file",
          file: typeof item.file === "string" ? item.file : "",
          subpath: typeof item.subpath === "string" ? item.subpath : undefined,
          x,
          y,
          width: width < 300 ? 320 : width,
          height: height < 200 ? 240 : height,
          color,
        });
      } else if (item.type === "link") {
        nodes.push({
          id: item.id,
          type: "link",
          url: typeof item.url === "string" ? item.url : "",
          x,
          y,
          width,
          height,
          color,
        });
      } else if (item.type === "group") {
        nodes.push({
          id: item.id,
          type: "group",
          label: typeof item.label === "string" ? item.label : "",
          background: typeof item.background === "string" ? item.background : undefined,
          backgroundStyle: item.backgroundStyle === "cover" || item.backgroundStyle === "ratio" || item.backgroundStyle === "repeat"
            ? item.backgroundStyle
            : undefined,
          x,
          y,
          width: width < 300 ? 400 : width,
          height: height < 200 ? 300 : height,
          color,
        });
      }
    }

    const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
    const validNodeIds = new Set(nodes.map((n) => n.id));
    const edges: CanvasEdge[] = [];

    for (const item of rawEdges) {
      if (!item || typeof item !== "object" || typeof item.id !== "string") continue;
      if (typeof item.fromNode !== "string" || typeof item.toNode !== "string") continue;
      if (!validNodeIds.has(item.fromNode) || !validNodeIds.has(item.toNode)) continue;

      const fromSide = isNodeSide(item.fromSide) ? item.fromSide : "right";
      const toSide = isNodeSide(item.toSide) ? item.toSide : "left";
      const fromEnd = item.fromEnd === "arrow" ? "arrow" : "none";
      const toEnd = item.toEnd === "none" ? "none" : "arrow";
      const color = typeof item.color === "string" ? item.color : undefined;
      const label = typeof item.label === "string" ? item.label : undefined;
      const style = item.style === "straight" || item.style === "step" ? item.style : "bezier";
      const stepOffset = typeof item.stepOffset === "number" ? item.stepOffset : undefined;
      const strokePattern =
        item.strokePattern === "dashed" || item.strokePattern === "dotted"
          ? item.strokePattern
          : undefined;
      const labelShape =
        item.labelShape === "rect" || item.labelShape === "diamond"
          ? item.labelShape
          : undefined;

      // Ring layout extension: keep the circular arc metadata so a ring stays
      // a perfect circle after reloading the .canvas file.
      let ringCenter: { x: number; y: number } | undefined;
      let ringRadius: number | undefined;
      if (
        item.ringCenter &&
        typeof item.ringCenter === "object" &&
        typeof item.ringCenter.x === "number" &&
        typeof item.ringCenter.y === "number"
      ) {
        ringCenter = { x: item.ringCenter.x, y: item.ringCenter.y };
      }
      if (typeof item.ringRadius === "number" && item.ringRadius > 0) {
        ringRadius = item.ringRadius;
      }

      // Grid layout extension: keep the orthogonal straight-segment flag so a
      // rectangular frame stays rectangular after reloading.
      const gridPath = item.gridPath === true ? true : undefined;

      edges.push({
        id: item.id,
        fromNode: item.fromNode,
        fromSide,
        fromEnd,
        toNode: item.toNode,
        toSide,
        toEnd,
        color,
        label,
        style,
        stepOffset,
        strokePattern,
        labelShape,
        ringCenter,
        ringRadius,
        gridPath,
      });
    }

    return { nodes, edges };
  } catch {
    return { nodes: [], edges: [] };
  }
}

/**
 * Serializes CanvasData into JSON Canvas 1.0 format
 */
export function serializeCanvasData(data: CanvasData): string {
  return JSON.stringify(
    {
      nodes: data.nodes,
      edges: data.edges,
    },
    null,
    2
  );
}

/**
 * Generates an initial sample canvas template
 */
export function createDefaultCanvas(title: string = "空间知识白板"): CanvasData {
  const rootGroup: CanvasGroupNode = {
    id: "group-core-1",
    type: "group",
    label: "🌌 核心架构体系",
    x: 60,
    y: 60,
    width: 740,
    height: 480,
    color: "5",
  };

  const welcomeNode: CanvasTextNode = {
    id: "node-welcome-1",
    type: "text",
    text: `### 🪐 ${title}\n\n欢迎进入 **KnowSpace 无限空间可视化白板**！\n- **无界漫游**：按住鼠标中键或空格拖动画布，滚轮可缩放；\n- **卡片交互**：双击进入 Markdown 富文本编辑；\n- **语义连线**：鼠标悬停卡片边缘拉出锚点连线。`,
    x: 100,
    y: 120,
    width: 320,
    height: 220,
    color: "5",
  };

  const derivationNode: CanvasTextNode = {
    id: "node-derivation-2",
    type: "text",
    text: `### 💡 衍生思考与落地\n\n- [x] 兼容标准 \`.canvas\` 开放格式\n- [x] 多模态卡片自由混排\n- [ ] 逆向萃取为长文专著`,
    x: 480,
    y: 160,
    width: 280,
    height: 180,
    color: "4",
  };

  const edge: CanvasEdge = {
    id: "edge-init-1",
    fromNode: "node-welcome-1",
    fromSide: "right",
    fromEnd: "none",
    toNode: "node-derivation-2",
    toSide: "left",
    toEnd: "arrow",
    label: "推导演化",
    color: "5",
    style: "bezier",
  };

  return {
    nodes: [rootGroup, welcomeNode, derivationNode],
    edges: [edge],
  };
}

/**
 * Bounding box calculation for nodes
 */
export function computeBoundingBox(nodes: CanvasNode[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x + n.width > maxX) maxX = n.x + n.width;
    if (n.y + n.height > maxY) maxY = n.y + n.height;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(100, maxX - minX),
    height: Math.max(100, maxY - minY),
  };
}

/**
 * Calculates anchor coordinate for a node on a specific side.
 * Connections strictly start and terminate at the exact geometric midpoint of the edge,
 * ensuring perfect alignment with the node's visual port handles (anchor dots).
 */
export function getNodeAnchorPoint(
  node: CanvasNode,
  side: CanvasNodeSide = "right"
): { x: number; y: number } {
  switch (side) {
    case "top":
      return { x: node.x + node.width / 2, y: node.y };
    case "bottom":
      return { x: node.x + node.width / 2, y: node.y + node.height };
    case "left":
      return { x: node.x, y: node.y + node.height / 2 };
    case "right":
    default:
      return { x: node.x + node.width, y: node.y + node.height / 2 };
  }
}


/**
/**
 * Calculates cubic Bezier control points with strict bounding envelope
 * to guarantee that the curve never balloons or overshoots out of the cards' bounding box.
 */
export function computeBezierControlPoints(
  p1: { x: number; y: number },
  side1: CanvasNodeSide = "right",
  p2: { x: number; y: number },
  side2: CanvasNodeSide = "left"
): { cp1: { x: number; y: number }; cp2: { x: number; y: number } } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  let cp1 = { ...p1 };
  let cp2 = { ...p2 };

  const isHoriz1 = side1 === "left" || side1 === "right";
  const isHoriz2 = side2 === "left" || side2 === "right";

  // Case 1: Both Horizontal (e.g. right -> left or left -> right)
  if (isHoriz1 && isHoriz2) {
    const isForward =
      (side1 === "right" && side2 === "left" && dx > 0) ||
      (side1 === "left" && side2 === "right" && dx < 0);
    if (isForward) {
      const tangentDist = Math.max(20, Math.min(140, Math.abs(dx) * 0.5));
      cp1.x += side1 === "right" ? tangentDist : -tangentDist;
      cp2.x += side2 === "right" ? tangentDist : -tangentDist;
    } else {
      const loopDist = Math.max(25, Math.min(60, dist * 0.25));
      cp1.x += side1 === "right" ? loopDist : -loopDist;
      cp2.x += side2 === "right" ? loopDist : -loopDist;
    }
    return { cp1, cp2 };
  }

  // Case 2: Both Vertical (e.g. bottom -> top or top -> bottom)
  if (!isHoriz1 && !isHoriz2) {
    const isForward =
      (side1 === "bottom" && side2 === "top" && dy > 0) ||
      (side1 === "top" && side2 === "bottom" && dy < 0);
    if (isForward) {
      const tangentDist = Math.max(20, Math.min(140, Math.abs(dy) * 0.5));
      cp1.y += side1 === "bottom" ? tangentDist : -tangentDist;
      cp2.y += side2 === "bottom" ? tangentDist : -tangentDist;
    } else {
      const loopDist = Math.max(25, Math.min(60, dist * 0.25));
      cp1.y += side1 === "bottom" ? loopDist : -loopDist;
      cp2.y += side2 === "bottom" ? loopDist : -loopDist;
    }
    return { cp1, cp2 };
  }

  // Case 3: Perpendicular L-turn (one Horizontal, one Vertical)
  // Bound control point tangents strictly inside the gap so it NEVER arches high above endpoints
  if (isHoriz1) {
    // p1 leaves horizontally, p2 enters vertically
    const isTargetAheadInX = (side1 === "right" && dx > 0) || (side1 === "left" && dx < 0);
    const extentX = isTargetAheadInX
      ? Math.max(15, Math.min(110, Math.abs(dx) * 0.55))
      : Math.max(20, Math.min(50, dist * 0.2));
    cp1.x += side1 === "right" ? extentX : -extentX;

    const isAheadInY = (side2 === "top" && dy > 0) || (side2 === "bottom" && dy < 0);
    const extentY = isAheadInY
      ? Math.max(15, Math.min(110, Math.abs(dy) * 0.55))
      : Math.max(20, Math.min(50, dist * 0.2));
    cp2.y += side2 === "bottom" ? extentY : -extentY;
  } else {
    // p1 leaves vertically, p2 enters horizontally
    const isTargetAheadInY = (side1 === "bottom" && dy > 0) || (side1 === "top" && dy < 0);
    const extentY = isTargetAheadInY
      ? Math.max(15, Math.min(110, Math.abs(dy) * 0.55))
      : Math.max(20, Math.min(50, dist * 0.2));
    cp1.y += side1 === "bottom" ? extentY : -extentY;

    const isAheadInX = (side2 === "left" && dx > 0) || (side2 === "right" && dx < 0);
    const extentX = isAheadInX
      ? Math.max(15, Math.min(110, Math.abs(dx) * 0.55))
      : Math.max(20, Math.min(50, dist * 0.2));
    cp2.x += side2 === "right" ? extentX : -extentX;
  }

  return { cp1, cp2 };
}

/**
 * Information about the draggable bend handle on an orthogonal (step) edge
 */
export interface StepBendHandleInfo {
  x: number;
  y: number;
  orientation: "horizontal" | "vertical";
}

export function getStepBendHandleInfo(
  p1: { x: number; y: number },
  side1: CanvasNodeSide = "right",
  p2: { x: number; y: number },
  side2: CanvasNodeSide = "left",
  stepOffset?: number
): StepBendHandleInfo {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  if ((side1 === "left" || side1 === "right") && (side2 === "left" || side2 === "right")) {
    const midX = p1.x + dx / 2 + (stepOffset || 0);
    return {
      x: midX,
      y: (p1.y + p2.y) / 2,
      orientation: "horizontal",
    };
  }

  if ((side1 === "top" || side1 === "bottom") && (side2 === "top" || side2 === "bottom")) {
    const midY = p1.y + dy / 2 + (stepOffset || 0);
    return {
      x: (p1.x + p2.x) / 2,
      y: midY,
      orientation: "vertical",
    };
  }

  if (side1 === "left" || side1 === "right") {
    const turnX = p2.x + (stepOffset || 0);
    return {
      x: turnX,
      y: (p1.y + p2.y) / 2,
      orientation: "horizontal",
    };
  }

  const turnY = p2.y + (stepOffset || 0);
  return {
    x: (p1.x + p2.x) / 2,
    y: turnY,
    orientation: "vertical",
  };
}

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

export interface AABBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function horizontalSegmentIntersectsBox(x1: number, x2: number, y: number, box: AABBBox): boolean {
  if (y < box.minY || y > box.maxY) return false;
  const segMinX = Math.min(x1, x2);
  const segMaxX = Math.max(x1, x2);
  return Math.max(segMinX, box.minX) < Math.min(segMaxX, box.maxX);
}

export function verticalSegmentIntersectsBox(x: number, y1: number, y2: number, box: AABBBox): boolean {
  if (x < box.minX || x > box.maxX) return false;
  const segMinY = Math.min(y1, y2);
  const segMaxY = Math.max(y1, y2);
  return Math.max(segMinY, box.minY) < Math.min(segMaxY, box.maxY);
}

export function pathIntersectsBox(
  points: Array<{ x: number; y: number }>,
  box: AABBBox
): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    const pt1 = points[i];
    const pt2 = points[i + 1];
    if (Math.abs(pt1.y - pt2.y) < 0.001) {
      if (horizontalSegmentIntersectsBox(pt1.x, pt2.x, pt1.y, box)) return true;
    } else if (Math.abs(pt1.x - pt2.x) < 0.001) {
      if (verticalSegmentIntersectsBox(pt1.x, pt1.y, pt2.y, box)) return true;
    }
  }
  return false;
}

/**
 * Projects a point onto the given circle, i.e. moves it along the ray from the
 * ring centre until it sits exactly on the ring radius.
 *
 * Used so that ring edges — whose endpoints are card anchor points that do not
 * lie on the circle themselves — always start and end on the very same circle,
 * producing a perfectly round outline.
 */
export function projectPointOntoRing(
  point: { x: number; y: number },
  ring: { center: { x: number; y: number }; radius: number }
): { x: number; y: number } {
  const ox = point.x - ring.center.x;
  const oy = point.y - ring.center.y;
  const dist = Math.hypot(ox, oy);
  if (dist < 0.0001) {
    return { x: ring.center.x + ring.radius, y: ring.center.y };
  }
  const scale = ring.radius / dist;
  return { x: ring.center.x + ox * scale, y: ring.center.y + oy * scale };
}

/**
 * Generates an SVG path for connecting edges with refined curvature, orthogonal routing,
 * and smart AABB obstacle avoidance.
 */
export function computeEdgePath(
  p1: { x: number; y: number },
  side1: CanvasNodeSide = "right",
  p2: { x: number; y: number },
  side2: CanvasNodeSide = "left",
  style: CanvasEdgeLineStyle = "bezier",
  stepOffset?: number,
  ring?: { center: { x: number; y: number }; radius: number },
  obstacles?: CanvasObstacle[]
): string {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  // ── Ring layout ────────────────────────────────────────────────────────
  // Draw a true circular arc around the ring centre so that a closed loop of
  // cards arranged on a circle is connected by a perfectly round outline.
  // Both endpoints are projected onto the ring radius, and the shorter arc is
  // always taken, which keeps every segment part of the same circle.
  if (ring && ring.radius > 0) {
    const a = projectPointOntoRing(p1, ring);
    const b = projectPointOntoRing(p2, ring);

    let delta = Math.atan2(b.y - ring.center.y, b.x - ring.center.x) -
      Math.atan2(a.y - ring.center.y, a.x - ring.center.x);
    // Normalise to (-π, π] so we always draw the shorter arc
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta <= -Math.PI) delta += Math.PI * 2;

    const sweep = delta >= 0 ? 1 : 0;
    return `M ${a.x} ${a.y} A ${ring.radius} ${ring.radius} 0 0 ${sweep} ${b.x} ${b.y}`;
  }

  if (style === "straight") {
    return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
  }

  if (style === "step") {
    // 1. Check obstacle avoidance if obstacle bounding boxes are provided
    if (obstacles && obstacles.length > 0) {
      const MARGIN = 14;
      const isHorizontal = (side1 === "left" || side1 === "right") && (side2 === "left" || side2 === "right");
      const isVertical = (side1 === "top" || side1 === "bottom") && (side2 === "top" || side2 === "bottom");

      if (isHorizontal) {
        const midX = p1.x + dx / 2 + (stepOffset || 0);
        const defaultPts = [
          { x: p1.x, y: p1.y },
          { x: midX, y: p1.y },
          { x: midX, y: p2.y },
          { x: p2.x, y: p2.y },
        ];

        const colliding = obstacles.find((obs) => {
          const box: AABBBox = {
            minX: obs.x - MARGIN,
            minY: obs.y - MARGIN,
            maxX: obs.x + obs.width + MARGIN,
            maxY: obs.y + obs.height + MARGIN,
          };
          return pathIntersectsBox(defaultPts, box);
        });

        if (colliding) {
          const box: AABBBox = {
            minX: colliding.x - MARGIN,
            minY: colliding.y - MARGIN,
            maxX: colliding.x + colliding.width + MARGIN,
            maxY: colliding.y + colliding.height + MARGIN,
          };

          const routeAbove = Math.abs(p1.y - box.minY) < Math.abs(p1.y - box.maxY);
          const bypassY = routeAbove ? box.minY - MARGIN : box.maxY + MARGIN;
          const seg1X = p1.x < p2.x ? Math.min(p1.x + 24, box.minX - 6) : Math.max(p1.x - 24, box.maxX + 6);
          const seg2X = p1.x < p2.x ? Math.max(p2.x - 24, box.maxX + 6) : Math.min(p2.x + 24, box.minX - 6);

          return `M ${p1.x} ${p1.y} L ${seg1X} ${p1.y} L ${seg1X} ${bypassY} L ${seg2X} ${bypassY} L ${seg2X} ${p2.y} L ${p2.x} ${p2.y}`;
        }
      } else if (isVertical) {
        const midY = p1.y + dy / 2 + (stepOffset || 0);
        const defaultPts = [
          { x: p1.x, y: p1.y },
          { x: p1.x, y: midY },
          { x: p2.x, y: midY },
          { x: p2.x, y: p2.y },
        ];

        const colliding = obstacles.find((obs) => {
          const box: AABBBox = {
            minX: obs.x - MARGIN,
            minY: obs.y - MARGIN,
            maxX: obs.x + obs.width + MARGIN,
            maxY: obs.y + obs.height + MARGIN,
          };
          return pathIntersectsBox(defaultPts, box);
        });

        if (colliding) {
          const box: AABBBox = {
            minX: colliding.x - MARGIN,
            minY: colliding.y - MARGIN,
            maxX: colliding.x + colliding.width + MARGIN,
            maxY: colliding.y + colliding.height + MARGIN,
          };

          const routeLeft = Math.abs(p1.x - box.minX) < Math.abs(p1.x - box.maxX);
          const bypassX = routeLeft ? box.minX - MARGIN : box.maxX + MARGIN;
          const seg1Y = p1.y < p2.y ? Math.min(p1.y + 24, box.minY - 6) : Math.max(p1.y - 24, box.maxY + 6);
          const seg2Y = p1.y < p2.y ? Math.max(p2.y - 24, box.maxY + 6) : Math.min(p2.y + 24, box.minY - 6);

          return `M ${p1.x} ${p1.y} L ${p1.x} ${seg1Y} L ${bypassX} ${seg1Y} L ${bypassX} ${seg2Y} L ${p2.x} ${seg2Y} L ${p2.x} ${p2.y}`;
        }
      }
    }

    // Orthogonal step routing tailored to anchor orientations and optional draggable offset:
    // Case 1: Horizontal start to Horizontal end (e.g. right -> left)
    if ((side1 === "left" || side1 === "right") && (side2 === "left" || side2 === "right")) {
      const midX = p1.x + dx / 2 + (stepOffset || 0);
      return `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
    }
    // Case 2: Vertical start to Vertical end (e.g. bottom -> top)
    if ((side1 === "top" || side1 === "bottom") && (side2 === "top" || side2 === "bottom")) {
      const midY = p1.y + dy / 2 + (stepOffset || 0);
      return `M ${p1.x} ${p1.y} L ${p1.x} ${midY} L ${p2.x} ${midY} L ${p2.x} ${p2.y}`;
    }
    // Case 3: Horizontal start to Vertical end (Corner 90deg turn or with offset)
    if ((side1 === "left" || side1 === "right") && (side2 === "top" || side2 === "bottom")) {
      const turnX = p2.x + (stepOffset || 0);
      return `M ${p1.x} ${p1.y} L ${turnX} ${p1.y} L ${turnX} ${p2.y} L ${p2.x} ${p2.y}`;
    }
    // Case 4: Vertical start to Horizontal end (Corner 90deg turn or with offset)
    if ((side1 === "top" || side1 === "bottom") && (side2 === "left" || side2 === "right")) {
      const turnY = p2.y + (stepOffset || 0);
      return `M ${p1.x} ${p1.y} L ${p1.x} ${turnY} L ${p2.x} ${turnY} L ${p2.x} ${p2.y}`;
    }
    const midX = p1.x + dx / 2 + (stepOffset || 0);
    return `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
  }

  // Smooth cubic Bezier curve with bounded non-overshooting envelope
  const { cp1, cp2 } = computeBezierControlPoints(p1, side1, p2, side2);
  return `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
}

/**
 * Computes exact midpoint coordinates on connecting edge paths (Bezier, Step, Straight)
 */
export function computeEdgeMidpoint(
  p1: { x: number; y: number },
  side1: CanvasNodeSide = "right",
  p2: { x: number; y: number },
  side2: CanvasNodeSide = "left",
  style: CanvasEdgeLineStyle = "bezier",
  stepOffset?: number,
  ring?: { center: { x: number; y: number }; radius: number },
  obstacles?: CanvasObstacle[]
): { x: number; y: number } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  // Ring layout: midpoint of the shorter circular arc (angle bisector)
  if (ring && ring.radius > 0) {
    const projectAngle = (p: { x: number; y: number }) => {
      const ox = p.x - ring.center.x;
      const oy = p.y - ring.center.y;
      if (Math.hypot(ox, oy) < 0.0001) return 0;
      return Math.atan2(oy, ox);
    };

    let a1 = projectAngle(p1);
    let a2 = projectAngle(p2);
    let delta = a2 - a1;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta <= -Math.PI) delta += Math.PI * 2;

    const midAngle = a1 + delta / 2;
    return {
      x: Math.round(ring.center.x + ring.radius * Math.cos(midAngle)),
      y: Math.round(ring.center.y + ring.radius * Math.sin(midAngle)),
    };
  }

  if (style === "straight") {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }

  if (style === "step") {
    if (obstacles && obstacles.length > 0) {
      const MARGIN = 14;
      const isHorizontal = (side1 === "left" || side1 === "right") && (side2 === "left" || side2 === "right");
      const isVertical = (side1 === "top" || side1 === "bottom") && (side2 === "top" || side2 === "bottom");

      if (isHorizontal) {
        const midX = p1.x + dx / 2 + (stepOffset || 0);
        const defaultPts = [
          { x: p1.x, y: p1.y },
          { x: midX, y: p1.y },
          { x: midX, y: p2.y },
          { x: p2.x, y: p2.y },
        ];
        const colliding = obstacles.find((obs) => {
          const box: AABBBox = {
            minX: obs.x - MARGIN,
            minY: obs.y - MARGIN,
            maxX: obs.x + obs.width + MARGIN,
            maxY: obs.y + obs.height + MARGIN,
          };
          return pathIntersectsBox(defaultPts, box);
        });
        if (colliding) {
          const box: AABBBox = {
            minX: colliding.x - MARGIN,
            minY: colliding.y - MARGIN,
            maxX: colliding.x + colliding.width + MARGIN,
            maxY: colliding.y + colliding.height + MARGIN,
          };
          const routeAbove = Math.abs(p1.y - box.minY) < Math.abs(p1.y - box.maxY);
          const bypassY = routeAbove ? box.minY - MARGIN : box.maxY + MARGIN;
          const seg1X = p1.x < p2.x ? Math.min(p1.x + 24, box.minX - 6) : Math.max(p1.x - 24, box.maxX + 6);
          const seg2X = p1.x < p2.x ? Math.max(p2.x - 24, box.maxX + 6) : Math.min(p2.x + 24, box.minX - 6);
          return { x: Math.round((seg1X + seg2X) / 2), y: Math.round(bypassY) };
        }
      } else if (isVertical) {
        const midY = p1.y + dy / 2 + (stepOffset || 0);
        const defaultPts = [
          { x: p1.x, y: p1.y },
          { x: p1.x, y: midY },
          { x: p2.x, y: midY },
          { x: p2.x, y: p2.y },
        ];
        const colliding = obstacles.find((obs) => {
          const box: AABBBox = {
            minX: obs.x - MARGIN,
            minY: obs.y - MARGIN,
            maxX: obs.x + obs.width + MARGIN,
            maxY: obs.y + obs.height + MARGIN,
          };
          return pathIntersectsBox(defaultPts, box);
        });
        if (colliding) {
          const box: AABBBox = {
            minX: colliding.x - MARGIN,
            minY: colliding.y - MARGIN,
            maxX: colliding.x + colliding.width + MARGIN,
            maxY: colliding.y + colliding.height + MARGIN,
          };
          const routeLeft = Math.abs(p1.x - box.minX) < Math.abs(p1.x - box.maxX);
          const bypassX = routeLeft ? box.minX - MARGIN : box.maxX + MARGIN;
          const seg1Y = p1.y < p2.y ? Math.min(p1.y + 24, box.minY - 6) : Math.max(p1.y - 24, box.maxY + 6);
          const seg2Y = p1.y < p2.y ? Math.max(p2.y - 24, box.maxY + 6) : Math.min(p2.y + 24, box.minY - 6);
          return { x: Math.round(bypassX), y: Math.round((seg1Y + seg2Y) / 2) };
        }
      }
    }

    if ((side1 === "left" || side1 === "right") && (side2 === "left" || side2 === "right")) {
      return { x: p1.x + dx / 2 + (stepOffset || 0), y: (p1.y + p2.y) / 2 };
    }
    if ((side1 === "top" || side1 === "bottom") && (side2 === "top" || side2 === "bottom")) {
      return { x: (p1.x + p2.x) / 2, y: p1.y + dy / 2 + (stepOffset || 0) };
    }
    if (side1 === "left" || side1 === "right") {
      return { x: p2.x + (stepOffset || 0), y: (p1.y + p2.y) / 2 };
    }
    return { x: (p1.x + p2.x) / 2, y: p2.y + (stepOffset || 0) };
  }

  // Smooth cubic Bezier curve midpoint at t = 0.5:
  // B(0.5) = 0.125 * p1 + 0.375 * cp1 + 0.375 * cp2 + 0.125 * p2
  const { cp1, cp2 } = computeBezierControlPoints(p1, side1, p2, side2);

  return {
    x: Math.round(0.125 * p1.x + 0.375 * cp1.x + 0.375 * cp2.x + 0.125 * p2.x),
    y: Math.round(0.125 * p1.y + 0.375 * cp1.y + 0.375 * cp2.y + 0.125 * p2.y),
  };
}

/**
 * Builds the topological / spatial presentation slide sequence for Canvas Presentation Mode.
 * Prioritizes directed edges (causal/flow order), and orders unlinked cards spatially.
 */
export function buildPresentationSequence(data: CanvasData): string[] {
  const presentableNodes = data.nodes.filter((n) => n.type !== "group");
  if (presentableNodes.length === 0) return [];

  const nodeIds = new Set(presentableNodes.map((n) => n.id));
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const id of nodeIds) {
    adj.set(id, []);
    inDegree.set(id, 0);
  }

  for (const edge of data.edges) {
    if (nodeIds.has(edge.fromNode) && nodeIds.has(edge.toNode) && edge.fromNode !== edge.toNode) {
      adj.get(edge.fromNode)!.push(edge.toNode);
      inDegree.set(edge.toNode, (inDegree.get(edge.toNode) || 0) + 1);
    }
  }

  const result: string[] = [];
  const visited = new Set<string>();
  const nodeMap = new Map(presentableNodes.map((n) => [n.id, n]));

  const spatialSort = (aId: string, bId: string) => {
    const na = nodeMap.get(aId)!;
    const nb = nodeMap.get(bId)!;
    if (Math.abs(na.y - nb.y) > 60) return na.y - nb.y;
    return na.x - nb.x;
  };

  const roots = Array.from(nodeIds).filter((id) => (inDegree.get(id) || 0) === 0).sort(spatialSort);

  const queue: string[] = [...roots];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (visited.has(curr)) continue;
    visited.add(curr);
    result.push(curr);

    const children = (adj.get(curr) || []).filter((id) => !visited.has(id)).sort(spatialSort);
    for (const child of children) {
      inDegree.set(child, inDegree.get(child)! - 1);
      if (inDegree.get(child)! <= 0) {
        queue.push(child);
      }
    }
  }

  const remaining = Array.from(nodeIds).filter((id) => !visited.has(id)).sort(spatialSort);
  for (const id of remaining) {
    if (!visited.has(id)) {
      visited.add(id);
      result.push(id);
    }
  }

  return result;
}

/**
 * Extracts canvas topological structure and nodes into a structured Markdown document
 * (Canvas-to-Article Transformation)
 */
export function extractCanvasToMarkdown(
  data: CanvasData,
  title: string = "白板结构化萃取专著"
): string {
  if (!data || data.nodes.length === 0) {
    return `# ${title}\n\n*（当前白板为空，暂无可萃取内容）*\n`;
  }

  const lines: string[] = [];
  lines.push(`# ${title}\n`);
  lines.push(`> 📅 本文由 KnowSpace 空间白板通过拓扑依赖与坐标层次智能萃取生成。\n`);

  // Build edge adjacency map for relationship context
  const outgoingMap = new Map<string, Array<{ toNode: string; label?: string }>>();
  for (const edge of data.edges) {
    const list = outgoingMap.get(edge.fromNode) ?? [];
    list.push({ toNode: edge.toNode, label: edge.label });
    outgoingMap.set(edge.fromNode, list);
  }

  // Separate groups and cards
  const groups = data.nodes.filter((n): n is CanvasGroupNode => n.type === "group");
  const cards = data.nodes.filter((n) => n.type !== "group");

  // Sort groups by Y coordinate
  groups.sort((a, b) => a.y - b.y || a.x - b.x);

  // Group membership map
  const cardGroupMap = new Map<string, string>(); // cardId -> groupId
  for (const card of cards) {
    for (const group of groups) {
      if (
        card.x >= group.x &&
        card.x + card.width <= group.x + group.width &&
        card.y >= group.y &&
        card.y + card.height <= group.y + group.height
      ) {
        cardGroupMap.set(card.id, group.id);
        break;
      }
    }
  }

  // Helper to render card
  const renderCardContent = (card: CanvasNode) => {
    const cardLines: string[] = [];
    if (card.type === "text") {
      cardLines.push(card.text.trim());
    } else if (card.type === "file") {
      const fileName = card.file.replace(/\.(md|markdown)$/i, "");
      cardLines.push(`### 📄 引用笔记：[[${fileName}]]`);
      cardLines.push(`> 原文路径: \`${card.file}\`${card.subpath ? ` (${card.subpath})` : ""}`);
    } else if (card.type === "link") {
      cardLines.push(`### 🔗 外部参考：[${card.url}](${card.url})`);
    }

    // Append outgoing relations
    const relations = outgoingMap.get(card.id);
    if (relations && relations.length > 0) {
      const relTexts = relations.map((r) => {
        const target = data.nodes.find((n) => n.id === r.toNode);
        const targetTitle = target
          ? target.type === "file"
            ? `[[${target.file.replace(/\.(md|markdown)$/i, "")}]]`
            : target.type === "text"
            ? `「${target.text.split("\n")[0].replace(/^#+\s*/, "").slice(0, 20)}」`
            : target.type === "group"
            ? `组群【${target.label || "未命名"}】`
            : "目标节点"
          : "目标节点";
        return `${r.label ? `[${r.label}] -> ` : "-> "}${targetTitle}`;
      });
      cardLines.push(`\n*关联演化：${relTexts.join("； ")}*`);
    }

    return cardLines.join("\n\n");
  };

  // Render cards within groups first
  const handledCardIds = new Set<string>();

  for (const group of groups) {
    lines.push(`## 🏛️ ${group.label || "模块集群"}\n`);
    const innerCards = cards.filter((c) => cardGroupMap.get(c.id) === group.id);
    innerCards.sort((a, b) => a.y - b.y || a.x - b.x);

    if (innerCards.length === 0) {
      lines.push("*（该分组暂无子卡片）*\n");
    } else {
      for (const card of innerCards) {
        lines.push(renderCardContent(card));
        lines.push("\n---\n");
        handledCardIds.add(card.id);
      }
    }
  }

  // Render remaining standalone cards
  const standaloneCards = cards.filter((c) => !handledCardIds.has(c.id));
  if (standaloneCards.length > 0) {
    if (groups.length > 0) {
      lines.push(`## 📌 独立空间卡片与核心思考\n`);
    }
    standaloneCards.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const card of standaloneCards) {
      lines.push(renderCardContent(card));
      lines.push("\n---\n");
    }
  }

  return lines.join("\n").trim() + "\n";
}

function isNodeSide(val: unknown): val is CanvasNodeSide {
  return val === "top" || val === "right" || val === "bottom" || val === "left";
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
 * Automatically computes best attachment sides between two nodes based on relative coordinates.
 * Priority rules:
 * 1. Horizontal band (overlap in Y + horizontal gap): clearly side-by-side -> right/left routing.
 * 2. Vertical band (overlap in X + vertical gap): clearly stacked -> bottom/top routing.
 * 3. Clear vertical separation (gapY > 0):
 *    In multi-tier / multi-row layouts, architectures, and trees, connections between tiers
 *    must always route bottom -> top or top -> bottom, even for outermost cards where horizontal
 *    span (gapX) across the canvas is wide.
 * 4. Horizontal gap (gapX > 0, gapY <= 0): left/right routing.
 * 5. Overlapping nodes: fall back to center-delta direction.
 */
export function getOptimalAnchorSides(
  fromNode: CanvasNode,
  toNode: CanvasNode
): { fromSide: CanvasNodeSide; toSide: CanvasNodeSide } {
  const fromRight = fromNode.x + fromNode.width;
  const fromBottom = fromNode.y + fromNode.height;
  const toRight = toNode.x + toNode.width;
  const toBottom = toNode.y + toNode.height;

  const fromCenterX = fromNode.x + fromNode.width / 2;
  const fromCenterY = fromNode.y + fromNode.height / 2;
  const toCenterX = toNode.x + toNode.width / 2;
  const toCenterY = toNode.y + toNode.height / 2;

  const dx = toCenterX - fromCenterX;
  const dy = toCenterY - fromCenterY;

  const gapX = toNode.x >= fromRight ? toNode.x - fromRight : fromNode.x >= toRight ? fromNode.x - toRight : 0;
  const gapY = toNode.y >= fromBottom ? toNode.y - fromBottom : fromNode.y >= toBottom ? fromNode.y - toBottom : 0;

  const overlapX = Math.max(0, Math.min(fromRight, toRight) - Math.max(fromNode.x, toNode.x));
  const overlapY = Math.max(0, Math.min(fromBottom, toBottom) - Math.max(fromNode.y, toNode.y));

  // 1. Nodes share a horizontal band (overlap in Y) and horizontal gap exists:
  //    Cards in the same row/container connecting side-by-side.
  if (overlapY > 0 && gapX > 0) {
    return dx >= 0
      ? { fromSide: "right", toSide: "left" }
      : { fromSide: "left", toSide: "right" };
  }

  // 2. Nodes share a vertical band (overlap in X) and vertical gap exists:
  //    Cards in the same column connecting vertically.
  if (overlapX > 0 && gapY > 0) {
    return dy >= 0
      ? { fromSide: "bottom", toSide: "top" }
      : { fromSide: "top", toSide: "bottom" };
  }

  // 3. Clear vertical separation (one node is above the other, gapY > 0):
  //    In top-down / bottom-up architectures, multi-row layouts, and tree structures,
  //    connections between tiers must always route bottom -> top or top -> bottom,
  //    even for outermost cards where horizontal distance is wide.
  if (gapY > 0) {
    // Only if vertical gap is negligible (< 40px) AND horizontal gap is overwhelmingly dominant (> 3x):
    if (gapY < 40 && gapX > gapY * 3) {
      return dx >= 0
        ? { fromSide: "right", toSide: "left" }
        : { fromSide: "left", toSide: "right" };
    }
    return dy >= 0
      ? { fromSide: "bottom", toSide: "top" }
      : { fromSide: "top", toSide: "bottom" };
  }

  // 4. Nodes have horizontal gap (no vertical gap):
  if (gapX > 0) {
    return dx >= 0
      ? { fromSide: "right", toSide: "left" }
      : { fromSide: "left", toSide: "right" };
  }

  // 5. Overlapping nodes (no gap in either direction) → use center-delta direction
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { fromSide: "right", toSide: "left" }
      : { fromSide: "left", toSide: "right" };
  } else {
    return dy >= 0
      ? { fromSide: "bottom", toSide: "top" }
      : { fromSide: "top", toSide: "bottom" };
  }
}

/**
 * Resolves a palette key ("1".."12") or hex string to normalized lowercase hex "#rrggbb".
 */
export function normalizeHexColor(col?: string): string | undefined {
  if (!col) return undefined;
  const trimmed = col.trim().toLowerCase();
  if (CANVAS_COLOR_PALETTES[trimmed]) {
    return CANVAS_COLOR_PALETTES[trimmed].stroke.toLowerCase();
  }
  if (trimmed.startsWith("#")) {
    if (trimmed.length === 4) {
      // #rgb -> #rrggbb
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
    }
    if (trimmed.length === 7) {
      return trimmed;
    }
  }
  return undefined;
}

/**
 * Checks whether two colors are perceptually similar (e.g. same color family / hue).
 * Returns true if exact match, or RGB distance < 90, or both have hue difference < 28 deg with sufficient saturation.
 */
export function isColorSimilar(c1?: string, c2?: string): boolean {
  if (!c1 || !c2) return false;
  if (c1.trim().toLowerCase() === c2.trim().toLowerCase()) return true;

  const hex1 = normalizeHexColor(c1);
  const hex2 = normalizeHexColor(c2);
  if (!hex1 || !hex2) return false;
  if (hex1 === hex2) return true;

  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);

  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);

  const distSq = (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
  if (distSq < 90 * 90) return true;

  // HSL / HSV Hue calculation
  const toHueAndSat = (r: number, g: number, b: number) => {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    if (d !== 0) {
      if (max === rn) {
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
      } else if (max === gn) {
        h = ((bn - rn) / d + 2) * 60;
      } else {
        h = ((rn - gn) / d + 4) * 60;
      }
    }
    return { h, s, v };
  };

  const c1Info = toHueAndSat(r1, g1, b1);
  const c2Info = toHueAndSat(r2, g2, b2);

  if (c1Info.s > 0.15 && c2Info.s > 0.15 && c1Info.v > 0.15 && c2Info.v > 0.15) {
    const diff = Math.abs(c1Info.h - c2Info.h);
    const hueDiff = Math.min(diff, 360 - diff);
    if (hueDiff < 28) return true;
  }

  return false;
}

/**
 * Checks if a color is identical or similar to any color in an iterable collection of colors.
 */
export function isColorSimilarToAny(color: string, colorsSet: Iterable<string>): boolean {
  for (const c of colorsSet) {
    if (isColorSimilar(color, c)) return true;
  }
  return false;
}

/**
 * Finds loop component information for a source node, including member nodes,
 * member edges, and all colors associated with the loop.
 */
export function getLoopComponentInfo(
  sourceId: string,
  edges: CanvasEdge[],
  allNodes?: CanvasNode[]
): {
  isSourceInLoop: boolean;
  loopNodeIds: Set<string>;
  loopEdgeIds: Set<string>;
  ringColors: Set<string>;
} {
  const allLoopEdgeIds = getLoopEdgeIdsCached(edges);
  if (allLoopEdgeIds.size === 0) {
    return {
      isSourceInLoop: false,
      loopNodeIds: new Set(),
      loopEdgeIds: new Set(),
      ringColors: new Set(),
    };
  }

  const parent = new Map<string, string>();
  const findRoot = (x: string): string => {
    let cur = x;
    while (parent.get(cur) !== undefined && parent.get(cur) !== cur) {
      parent.set(cur, parent.get(parent.get(cur)!)!);
      cur = parent.get(cur)!;
    }
    return cur;
  };
  const union = (a: string, b: string) => {
    const ra = findRoot(a);
    const rb = findRoot(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const e of edges) {
    if (!allLoopEdgeIds.has(e.id)) continue;
    if (!parent.has(e.fromNode)) parent.set(e.fromNode, e.fromNode);
    if (!parent.has(e.toNode)) parent.set(e.toNode, e.toNode);
    union(e.fromNode, e.toNode);
  }

  if (!parent.has(sourceId)) {
    return {
      isSourceInLoop: false,
      loopNodeIds: new Set(),
      loopEdgeIds: new Set(),
      ringColors: new Set(),
    };
  }

  const sourceRoot = findRoot(sourceId);
  const loopNodeIds = new Set<string>();
  const loopEdgeIds = new Set<string>();
  const ringColors = new Set<string>();

  for (const e of edges) {
    if (!allLoopEdgeIds.has(e.id)) continue;
    if (findRoot(e.fromNode) === sourceRoot) {
      loopEdgeIds.add(e.id);
      loopNodeIds.add(e.fromNode);
      loopNodeIds.add(e.toNode);
      if (e.color) ringColors.add(e.color);
    }
  }

  if (allNodes) {
    for (const n of allNodes) {
      if (loopNodeIds.has(n.id) && n.color) {
        ringColors.add(n.color);
      }
    }
  }

  return {
    isSourceInLoop: true,
    loopNodeIds,
    loopEdgeIds,
    ringColors,
  };
}

/**
 * Determines the consistent edge color for a given source node.
 * Rules:
 * 1. If the node has an explicit color assigned (node.color), use it (unless
 *    the node is in a loop making an external connection and the color conflicts with the loop).
 * 2. If the node already has existing outgoing edges, reuse that edge's color
 *    so all lines from the same card / anchor stay strictly identical in color.
 * 3. If it is a new source node, automatically assign the next palette color
 *    based on the number of distinct source nodes already connected, so different
 *    cards in the same container/canvas are clearly distinguished.
 */
export function getSourceNodeEdgeColor(
  source: CanvasNode | string,
  existingEdges: CanvasEdge[],
  allNodes?: CanvasNode[],
  target?: CanvasNode | string
): string {
  const sourceId = typeof source === "string" ? source : source.id;
  const targetId = target ? (typeof target === "string" ? target : target.id) : undefined;
  const sourceNode =
    typeof source !== "string"
      ? source
      : allNodes?.find((n) => n.id === sourceId);
  const explicitColor = sourceNode?.color;
  const paletteKeys = Object.keys(CANVAS_COLOR_PALETTES);

  // Check if source participates in a closed ring/loop
  const loopInfo = getLoopComponentInfo(sourceId, existingEdges, allNodes);
  const isSourceInLoop = loopInfo.isSourceInLoop;
  const isTargetInSameLoop = targetId ? loopInfo.loopNodeIds.has(targetId) : false;

  // An edge is considered an external connection originating from a loop node if:
  // 1. sourceId is in a loop, AND
  // 2. Either target is explicitly specified and not in the same loop, OR
  //    target is not specified and sourceId already has an outgoing loop edge in existingEdges.
  const isExternalFromLoop =
    isSourceInLoop &&
    (targetId
      ? !isTargetInSameLoop
      : existingEdges.some((e) => e.fromNode === sourceId && loopInfo.loopEdgeIds.has(e.id)));

  if (isExternalFromLoop) {
    // ── Ring-Isolated Outgoing Edge Coloring (Scheme A) ───────────────────
    // External edges originating from a loop card must NEVER use the ring's
    // internal color or colors similar to the ring, preserving visual boundary
    // of the closed loop.
    const ringColors = loopInfo.ringColors;
    const isRingConflict = (col?: string) => (col ? isColorSimilarToAny(col, ringColors) : false);

    // 1. All external outgoing edges from the same card share the same external color
    // Reject any existing external edges whose color conflicts with the ring!
    const existingExternalEdge = existingEdges.find(
      (e) =>
        e.fromNode === sourceId &&
        !loopInfo.loopEdgeIds.has(e.id) &&
        (targetId ? e.toNode !== targetId : true) &&
        e.color &&
        (CANVAS_COLOR_PALETTES[e.color] || e.color.startsWith("#")) &&
        !isRingConflict(e.color)
    );
    if (existingExternalEdge && existingExternalEdge.color) {
      return existingExternalEdge.color;
    }

    // Collect all colors already used by other source cards across the entire canvas,
    // plus the ring's colors so they are strictly avoided.
    const usedAllSourceColors = new Set<string>(ringColors);
    for (const edge of existingEdges) {
      if (
        edge.fromNode &&
        edge.fromNode !== sourceId &&
        edge.color &&
        (CANVAS_COLOR_PALETTES[edge.color] || edge.color.startsWith("#"))
      ) {
        usedAllSourceColors.add(edge.color);
      }
    }

    const candidatePalettes = paletteKeys.filter((k) => !isRingConflict(k));

    // Container-aware external source coloring:
    if (sourceNode && allNodes && allNodes.length > 0) {
      const container = findContainerForNode(sourceNode, allNodes);
      if (container) {
        const siblingCards = allNodes.filter(
          (n) => n.id !== container.id && n.type !== "group" && isNodeInsideGroup(n, container)
        );
        const otherSiblings = siblingCards.filter((s) => s.id !== sourceId);

        const usedSiblingColors = new Set<string>(ringColors);
        for (const sib of otherSiblings) {
          const outgoingEdges = existingEdges.filter(
            (e) =>
              e.fromNode === sib.id &&
              e.color &&
              (CANVAS_COLOR_PALETTES[e.color] || e.color.startsWith("#"))
          );
          for (const edge of outgoingEdges) {
            if (edge.color) usedSiblingColors.add(edge.color);
          }
        }

        if (
          explicitColor &&
          (CANVAS_COLOR_PALETTES[explicitColor] || explicitColor.startsWith("#")) &&
          !isRingConflict(explicitColor) &&
          !usedSiblingColors.has(explicitColor) &&
          !usedAllSourceColors.has(explicitColor)
        ) {
          return explicitColor;
        }

        const idealColor = candidatePalettes.find(
          (k) => !usedSiblingColors.has(k) && !usedAllSourceColors.has(k)
        );
        if (idealColor) return idealColor;

        const siblingAvailable = candidatePalettes.find(
          (k) => !usedSiblingColors.has(k)
        );
        if (siblingAvailable) return siblingAvailable;

        if (candidatePalettes.length > 0) {
          const otherActiveSiblings = otherSiblings.filter((s) =>
            existingEdges.some((e) => e.fromNode === s.id)
          );
          return candidatePalettes[otherActiveSiblings.length % candidatePalettes.length];
        }
      }
    }

    // Non-container / global external source coloring:
    if (
      explicitColor &&
      (CANVAS_COLOR_PALETTES[explicitColor] || explicitColor.startsWith("#")) &&
      !isRingConflict(explicitColor) &&
      !usedAllSourceColors.has(explicitColor)
    ) {
      return explicitColor;
    }

    const canvasAvailable = candidatePalettes.find(
      (k) => !usedAllSourceColors.has(k)
    );
    if (canvasAvailable) return canvasAvailable;

    if (candidatePalettes.length > 0) {
      const otherSources = Array.from(
        new Set(existingEdges.map((e) => e.fromNode).filter((id) => id && id !== sourceId))
      );
      return candidatePalettes[otherSources.length % candidatePalettes.length];
    }
  }

  // 1. Maintain identical color for all outgoing edges from the same card
  const existingEdge = existingEdges.find(
    (e) =>
      e.fromNode === sourceId &&
      e.color &&
      (CANVAS_COLOR_PALETTES[e.color] || e.color.startsWith("#"))
  );
  if (existingEdge && existingEdge.color) {
    return existingEdge.color;
  }

  // Collect all colors already used by other source cards across the entire canvas
  const usedAllSourceColors = new Set<string>();
  for (const edge of existingEdges) {
    if (
      edge.fromNode &&
      edge.fromNode !== sourceId &&
      edge.color &&
      (CANVAS_COLOR_PALETTES[edge.color] || edge.color.startsWith("#"))
    ) {
      usedAllSourceColors.add(edge.color);
    }
  }

  // 2. Container-aware source coloring:
  if (sourceNode && allNodes && allNodes.length > 0) {
    const container = findContainerForNode(sourceNode, allNodes);
    if (container) {
      const siblingCards = allNodes.filter(
        (n) => n.id !== container.id && n.type !== "group" && isNodeInsideGroup(n, container)
      );
      const otherSiblings = siblingCards.filter((s) => s.id !== sourceId);

      // Collect all colors used by outgoing edges from other sibling cards in this container
      const usedSiblingColors = new Set<string>();
      for (const sib of otherSiblings) {
        const outgoingEdges = existingEdges.filter(
          (e) =>
            e.fromNode === sib.id &&
            e.color &&
            (CANVAS_COLOR_PALETTES[e.color] || e.color.startsWith("#"))
        );
        for (const edge of outgoingEdges) {
          if (edge.color) usedSiblingColors.add(edge.color);
        }
      }

      // If card has an explicit color and it does not collide with siblings or active sources, respect it
      if (
        explicitColor &&
        (CANVAS_COLOR_PALETTES[explicitColor] || explicitColor.startsWith("#")) &&
        !usedSiblingColors.has(explicitColor) &&
        !usedAllSourceColors.has(explicitColor)
      ) {
        return explicitColor;
      }

      // First priority: pick color unused by siblings in container AND unused across canvas
      const idealColor = paletteKeys.find(
        (k) => !usedSiblingColors.has(k) && !usedAllSourceColors.has(k)
      );
      if (idealColor) {
        return idealColor;
      }

      // Second priority: pick color unused by siblings in this container
      const siblingAvailable = paletteKeys.find((k) => !usedSiblingColors.has(k));
      if (siblingAvailable) {
        return siblingAvailable;
      }

      // Fallback: cycle among container siblings with outgoing edges
      const otherActiveSiblings = otherSiblings.filter((s) =>
        existingEdges.some((e) => e.fromNode === s.id)
      );
      return paletteKeys[otherActiveSiblings.length % paletteKeys.length];
    }
  }

  // 3. Non-container / global source coloring:
  if (
    explicitColor &&
    (CANVAS_COLOR_PALETTES[explicitColor] || explicitColor.startsWith("#")) &&
    !usedAllSourceColors.has(explicitColor)
  ) {
    return explicitColor;
  }

  // Pick first palette color not used by any other source card on the canvas
  const canvasAvailable = paletteKeys.find((k) => !usedAllSourceColors.has(k));
  if (canvasAvailable) {
    return canvasAvailable;
  }

  // Fallback: cycle across all distinct source cards on the canvas
  const otherSources = Array.from(
    new Set(existingEdges.map((e) => e.fromNode).filter((id) => id && id !== sourceId))
  );
  return paletteKeys[otherSources.length % paletteKeys.length];
}

/**
 * Returns the next edge color for a source node, ensuring all outgoing lines from
 * the same card share the same color while different source cards get different colors.
 */
export function getNextEdgeColorForSource(
  sourceNodeId: string,
  existingEdges: CanvasEdge[],
  allNodes?: CanvasNode[],
  targetNodeId?: string
): string {
  return getSourceNodeEdgeColor(sourceNodeId, existingEdges, allNodes, targetNodeId);
}

/**
 * Resolves the effective color key ("1".."12" or "#rrggbb") for rendering or exporting an edge.
 * Rules:
 * 1. If edge is a loop edge, it uses the edge's color or the ring display color.
 * 2. If edge is an external edge originating from a loop node (Scheme A):
 *    Its color MUST NOT conflict with (or be visually similar to) the ring's colors.
 *    If edge.color is missing or conflicts with the ring, it dynamically computes a
 *    clean, decoupled external color for that source node via getSourceNodeEdgeColor.
 * 3. Otherwise, normal edge: edge.color || sourceDisplayColorMap.get(edge.fromNode).
 */
export function getEffectiveEdgeColorKey(
  edge: CanvasEdge,
  allEdges: CanvasEdge[],
  allNodes?: CanvasNode[],
  sourceDisplayColorMap?: Map<string, string>
): string | undefined {
  if (!edge.fromNode) {
    return edge.color;
  }

  const loopInfo = getLoopComponentInfo(edge.fromNode, allEdges, allNodes);
  const isLoopEdge = loopInfo.loopEdgeIds.has(edge.id);

  if (isLoopEdge) {
    return (
      edge.color ||
      (sourceDisplayColorMap ? sourceDisplayColorMap.get(edge.fromNode) : undefined)
    );
  }

  if (loopInfo.isSourceInLoop) {
    const ringColors = new Set<string>(loopInfo.ringColors);
    if (sourceDisplayColorMap) {
      const ringDisplayCol = sourceDisplayColorMap.get(edge.fromNode);
      if (ringDisplayCol) ringColors.add(ringDisplayCol);
    }

    const isRingConflict = (col?: string) => (col ? isColorSimilarToAny(col, ringColors) : true);

    // Scheme A: external edges originating from loop nodes MUST NOT have the ring's color
    if (!edge.color || isRingConflict(edge.color)) {
      return getSourceNodeEdgeColor(edge.fromNode, allEdges, allNodes, edge.toNode);
    }
    return edge.color;
  }

  return (
    edge.color ||
    (sourceDisplayColorMap ? sourceDisplayColorMap.get(edge.fromNode) : undefined)
  );
}

/**
 * Computes a globally consistent, source-aware color map for all nodes that
 * initiate connections in the canvas. This is the single source of truth used
 * by both the on-screen renderer and SVG/PNG export so that colors stay
 * strictly identical between the two pipelines.
 *
 * Rules:
 * 1. If a source node already has a saved outgoing edge color in the palette,
 *    prefer it.
 * 2. If the source node has an explicit `color` and that color is not yet
 *    used by another sibling in the same container, use it.
 * 3. Otherwise, pick the first unused palette color within the container, then
 *    across the whole canvas, finally cycling as last resort.
 */
export function computeSourceDisplayColorMap(
  nodes: CanvasNode[],
  edges: CanvasEdge[]
): Map<string, string> {
  const map = new Map<string, string>();
  const paletteKeys = Object.keys(CANVAS_COLOR_PALETTES);
  const usedColors = new Set<string>();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // ── Ring groups take absolute precedence ────────────────────────────────
  // Every node participating in the same closed ring must resolve to ONE
  // identical color. Without this, the generic "one distinct color per source
  // node" logic below would split a ring into a rainbow of segments, which is
  // exactly what a merged source card must not do.
  const loopEdgeIds = getLoopEdgeIdsCached(edges);
  if (loopEdgeIds.size > 0) {
    // Union-Find over the ring edges so that each connected ring is one group
    const parent = new Map<string, string>();
    const findRoot = (x: string): string => {
      let cur = x;
      while (parent.get(cur) !== undefined && parent.get(cur) !== cur) {
        parent.set(cur, parent.get(parent.get(cur)!)!);
        cur = parent.get(cur)!;
      }
      return cur;
    };
    const union = (a: string, b: string) => {
      const ra = findRoot(a);
      const rb = findRoot(b);
      if (ra !== rb) parent.set(ra, rb);
    };

    // First pass: build the connectivity
    for (const e of edges) {
      if (!loopEdgeIds.has(e.id)) continue;
      if (!parent.has(e.fromNode)) parent.set(e.fromNode, e.fromNode);
      if (!parent.has(e.toNode)) parent.set(e.toNode, e.toNode);
      union(e.fromNode, e.toNode);
    }

    // Second pass: collect member nodes and the ring's single color
    const groupNodes = new Map<string, Set<string>>();
    const groupColor = new Map<string, string>();
    for (const e of edges) {
      if (!loopEdgeIds.has(e.id)) continue;
      const root = findRoot(e.fromNode);
      let set = groupNodes.get(root);
      if (!set) {
        set = new Set<string>();
        groupNodes.set(root, set);
      }
      set.add(e.fromNode);
      set.add(e.toNode);
      if (!groupColor.has(root) && e.color && (CANVAS_COLOR_PALETTES[e.color] || e.color.startsWith("#"))) {
        groupColor.set(root, e.color);
      }
    }

    for (const [root, nodeIds] of groupNodes.entries()) {
      const color =
        groupColor.get(root) ??
        paletteKeys.find((k) => !usedColors.has(k)) ??
        paletteKeys[usedColors.size % paletteKeys.length];
      for (const nid of nodeIds) map.set(nid, color);
      usedColors.add(color);
    }
  }

  const sourceIds = new Set<string>();
  // Indexed in a single pass instead of scanning `edges` inside the per-source
  // loops below: that used to make the whole function O(sources × edges) and
  // it runs on every geometry change, including each drag frame.
  const sourceExistingColor = new Map<string, string>();
  for (const edge of edges) {
    if (!edge.fromNode || !nodeMap.has(edge.fromNode)) continue;
    sourceIds.add(edge.fromNode);
    if (
      !sourceExistingColor.has(edge.fromNode) &&
      edge.color &&
      (CANVAS_COLOR_PALETTES[edge.color] || edge.color.startsWith("#"))
    ) {
      sourceExistingColor.set(edge.fromNode, edge.color);
    }
  }

  const containerSourceMap = new Map<string, string[]>();
  const rootSources: string[] = [];

  // Groups are extracted and sorted once here. Calling findContainerForNode()
  // per source re-filtered and re-sorted `nodes` every time, making this loop
  // O(sources × nodes); running on every drag frame made that noticeable.
  // Sorted smallest-first so the first hit is still the tightest container,
  // which is exactly findContainerForNode's contract.
  const groupsByArea = nodes
    .filter((n): n is CanvasGroupNode => n.type === "group")
    .sort((a, b) => a.width * a.height - b.width * b.height);
  const findContainerFast = (node: CanvasNode): CanvasGroupNode | undefined => {
    if (node.type === "group") return undefined;
    for (const g of groupsByArea) {
      if (isNodeInsideGroup(node, g)) return g;
    }
    return undefined;
  };

  for (const sourceId of sourceIds) {
    const node = nodeMap.get(sourceId);
    if (!node) continue;
    const container = findContainerFast(node);
    if (container) {
      const list = containerSourceMap.get(container.id) || [];
      list.push(sourceId);
      containerSourceMap.set(container.id, list);
    } else {
      rootSources.push(sourceId);
    }
  }

  for (const [, sourceIdsInContainer] of containerSourceMap.entries()) {
    const containerUsed = new Set<string>();
    for (const sId of sourceIdsInContainer) {
      // Node already resolved by a ring group — keep the ring's unified color
      if (map.has(sId)) {
        containerUsed.add(map.get(sId)!);
        continue;
      }
      const sNode = nodeMap.get(sId);
      const existingColor = sourceExistingColor.get(sId);
      let preferredColor = existingColor || sNode?.color;

      if (!preferredColor || containerUsed.has(preferredColor) || !CANVAS_COLOR_PALETTES[preferredColor]) {
        preferredColor =
          paletteKeys.find((k) => !containerUsed.has(k) && !usedColors.has(k)) ||
          paletteKeys.find((k) => !containerUsed.has(k)) ||
          paletteKeys[containerUsed.size % paletteKeys.length];
      }

      containerUsed.add(preferredColor);
      usedColors.add(preferredColor);
      map.set(sId, preferredColor);
    }
  }

  for (const sId of rootSources) {
    // Node already resolved by a ring group — keep the ring's unified color
    if (map.has(sId)) continue;
    const sNode = nodeMap.get(sId);
    const existingColor = sourceExistingColor.get(sId);
    let preferredColor = existingColor || sNode?.color;
    if (!preferredColor || usedColors.has(preferredColor) || !CANVAS_COLOR_PALETTES[preferredColor]) {
      preferredColor =
        paletteKeys.find((k) => !usedColors.has(k)) ||
        paletteKeys[usedColors.size % paletteKeys.length];
    }
    usedColors.add(preferredColor);
    map.set(sId, preferredColor);
  }

  return map;
}

/**
 * Automatically computes best attachment sides and creates an edge between two nodes
 */
export function createEdgeBetweenNodes(
  fromNode: CanvasNode,
  toNode: CanvasNode,
  label?: string,
  style: CanvasEdgeLineStyle = "bezier",
  existingEdges: CanvasEdge[] = [],
  allNodes?: CanvasNode[]
): CanvasEdge {
  const { fromSide, toSide } = getOptimalAnchorSides(fromNode, toNode);
  const color = getSourceNodeEdgeColor(fromNode, existingEdges, allNodes, toNode);

  return {
    id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fromNode: fromNode.id,
    fromSide,
    fromEnd: "none",
    toNode: toNode.id,
    toSide,
    toEnd: "arrow",
    color,
    label: label || undefined,
    style,
  };
}

/**
 * Spawns a connected child card from a source node for rapid brainstorming
 */
export function spawnConnectedCard(
  sourceNode: CanvasNode,
  direction: "right" | "bottom" = "right",
  initialText?: string,
  label?: string,
  existingEdges: CanvasEdge[] = [],
  allNodes?: CanvasNode[]
): { newNode: CanvasTextNode; newEdge: CanvasEdge } {
  const newId = `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const gap = 120;
  const newX = direction === "right" ? sourceNode.x + sourceNode.width + gap : sourceNode.x;
  const newY = direction === "bottom" ? sourceNode.y + sourceNode.height + gap : sourceNode.y;
  const edgeColor = getSourceNodeEdgeColor(sourceNode, existingEdges, allNodes);

  const newNode: CanvasTextNode = {
    id: newId,
    type: "text",
    text: initialText || "### 分支想法\n输入关联论述与子思考...",
    x: newX,
    y: newY,
    width: Math.min(320, Math.max(260, sourceNode.width)),
    height: 160,
    color: sourceNode.color,
  };

  const newEdge: CanvasEdge = {
    id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fromNode: sourceNode.id,
    fromSide: direction === "right" ? "right" : "bottom",
    fromEnd: "none",
    toNode: newId,
    toSide: direction === "right" ? "left" : "top",
    toEnd: "arrow",
    color: edgeColor,
    label: label || undefined,
    style: "bezier",
  };

  return { newNode, newEdge };
}

/**
 * Creates edges connecting a single root node to multiple target nodes (1-to-Many / Star).
 * Automatically computes optimal anchor sides for each connection and avoids duplicate edges.
 */
export function connectOneToMany(
  rootNode: CanvasNode,
  targetNodes: CanvasNode[],
  existingEdges: CanvasEdge[],
  style: CanvasEdgeLineStyle = "bezier",
  allNodes?: CanvasNode[]
): CanvasEdge[] {
  // All lines originating from the same card share the identical color
  const edgeColor = getSourceNodeEdgeColor(rootNode, existingEdges, allNodes);
  const newEdges: CanvasEdge[] = [];
  for (const target of targetNodes) {
    if (target.id === rootNode.id) continue;
    const exists =
      existingEdges.some(
        (e) =>
          (e.fromNode === rootNode.id && e.toNode === target.id) ||
          (e.fromNode === target.id && e.toNode === rootNode.id)
      ) ||
      newEdges.some(
        (e) =>
          (e.fromNode === rootNode.id && e.toNode === target.id) ||
          (e.fromNode === target.id && e.toNode === rootNode.id)
      );
    if (!exists) {
      const edge = createEdgeBetweenNodes(rootNode, target, undefined, style);
      newEdges.push({ ...edge, color: edgeColor });
    }
  }
  return newEdges;
}

/**
 * Creates sequential chain edges connecting a sequence of nodes: A -> B -> C -> ...
 * By default, sorts nodes spatially (left to right, top to bottom) to prevent criss-crossing dead knots.
 * Skips duplicate edges.
 */
export function connectChainNodes(
  nodes: CanvasNode[],
  existingEdges: CanvasEdge[],
  style: CanvasEdgeLineStyle = "bezier",
  spatiallySort: boolean = true,
  allNodes?: CanvasNode[]
): CanvasEdge[] {
  if (nodes.length < 2) return [];
  const orderedNodes = spatiallySort
    ? [...nodes].sort((a, b) => {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (Math.abs(dx) > 40) return dx;
        return dy;
      })
    : [...nodes];

  const newEdges: CanvasEdge[] = [];
  for (let i = 0; i < orderedNodes.length - 1; i++) {
    const from = orderedNodes[i];
    const to = orderedNodes[i + 1];
    const exists =
      existingEdges.some(
        (e) =>
          (e.fromNode === from.id && e.toNode === to.id) ||
          (e.fromNode === to.id && e.toNode === from.id)
      ) ||
      newEdges.some(
        (e) =>
          (e.fromNode === from.id && e.toNode === to.id) ||
          (e.fromNode === to.id && e.toNode === from.id)
      );
    if (!exists) {
      const edge = createEdgeBetweenNodes(from, to, undefined, style);
      const edgeColor = getSourceNodeEdgeColor(from, [...existingEdges, ...newEdges], allNodes || nodes);
      newEdges.push({ ...edge, color: edgeColor });
    }
  }
  return newEdges;
}

/**
 * Determines whether a directed edge participates in a closed ring of at
 * least 3 nodes. Implemented as a BFS from the edge's target node back to
 * its source, skipping the edge under test.
 *
 * The return path must be at least 2 hops long so that a mere two-way pair
 * (A->B together with B->A, i.e. a bidirectional arrow) is NOT treated as a
 * ring — those should stay free to reuse any palette color.
 */
function isEdgeOnCycle(
  edge: CanvasEdge,
  outgoing: Map<string, CanvasEdge[]>
): boolean {
  const start = edge.toNode;
  const target = edge.fromNode;
  if (start === target) return true; // self-loop

  const visited = new Set<string>([start]);
  // Track hop distance so we can require a return path of >= 2 edges
  const queue: Array<{ node: string; dist: number }> = [{ node: start, dist: 0 }];

  while (queue.length > 0) {
    const { node, dist } = queue.shift()!;
    const outs = outgoing.get(node);
    if (!outs) continue;
    for (const e of outs) {
      if (e.id === edge.id) continue; // skip the edge being tested
      const nextDist = dist + 1;
      if (e.toNode === target && nextDist >= 2) return true;
      if (!visited.has(e.toNode)) {
        visited.add(e.toNode);
        queue.push({ node: e.toNode, dist: nextDist });
      }
    }
  }

  return false;
}

/**
 * Returns the ids of every edge that participates in a closed ring of at
 * least 3 nodes. See isEdgeOnCycle for the detailed rules.
 */
export function getLoopEdgeIds(edges: CanvasEdge[]): Set<string> {
  const ids = new Set<string>();
  if (!edges || edges.length === 0) return ids;

  const outgoing = new Map<string, CanvasEdge[]>();
  for (const e of edges) {
    const list = outgoing.get(e.fromNode);
    if (list) list.push(e);
    else outgoing.set(e.fromNode, [e]);
  }

  for (const e of edges) {
    if (isEdgeOnCycle(e, outgoing)) ids.add(e.id);
  }

  return ids;
}

/**
 * Order-independent FNV-1a fingerprint of the edge topology (ids + endpoints).
 *
 * Card coordinates change on every drag frame, but the topology does not, so
 * this lets us skip the O(E×(V+E)) cycle scan while a card is being dragged —
 * otherwise every frame would re-run a BFS per edge.
 */
function edgeTopologyFingerprint(edges: CanvasEdge[]): number {
  let hash = 2166136261;
  for (let i = 0; i < edges.length; i += 1) {
    const e = edges[i];
    const key = `${e.id}\u0000${e.fromNode}\u0000${e.toNode}`;
    for (let j = 0; j < key.length; j += 1) {
      hash ^= key.charCodeAt(j);
      hash = Math.imul(hash, 16777619);
    }
  }
  // Fold the edge count in as well to make collisions even less likely.
  hash ^= edges.length;
  return hash >>> 0;
}

let cachedTopologyHash = -1;
let cachedLoopEdgeIds: Set<string> | null = null;

/**
 * Memoised `getLoopEdgeIds`. Cache is module-level but purely an optimisation:
 * identical input always produces the identical set, so callers cannot observe
 * a behavioural difference.
 */
function getLoopEdgeIdsCached(edges: CanvasEdge[]): Set<string> {
  const hash = edgeTopologyFingerprint(edges);
  if (hash === cachedTopologyHash && cachedLoopEdgeIds) return cachedLoopEdgeIds;
  const ids = getLoopEdgeIds(edges);
  cachedTopologyHash = hash;
  cachedLoopEdgeIds = ids;
  return ids;
}

/**
 * Collects the palette colors already claimed by edges that form a closed
 * loop. This lets newly created rings pick a color that no other ring on the
 * canvas is currently using, so that multiple loops stay visually distinct.
 * Edges that are NOT part of a cycle (chains, one-to-many stars) are ignored
 * so they remain free to use any palette color.
 */
export function getLoopEdgeColors(edges: CanvasEdge[]): Set<string> {
  const colors = new Set<string>();
  if (!edges || edges.length === 0) return colors;

  const loopIds = getLoopEdgeIds(edges);
  for (const e of edges) {
    if (e.color && loopIds.has(e.id)) colors.add(e.color);
  }

  return colors;
}

/**
 * Expands a set of edge ids so that, whenever a selected edge belongs to a
 * closed ring, every other edge of that same ring is included as well.
 *
 * Used by color / stroke mutations so that the "one ring = one color" rule
 * survives partial edits: right-clicking a single segment of a ring will
 * repaint the entire ring instead of breaking it into mixed colors.
 */
export function expandLoopEdgeSelection(
  edges: CanvasEdge[],
  targetIds: Iterable<string>
): Set<string> {
  const result = new Set<string>(targetIds);
  const loopIds = getLoopEdgeIds(edges);
  if (loopIds.size === 0) return result;

  // Adjacency: node -> ids of ring edges touching it
  const byNode = new Map<string, string[]>();
  for (const e of edges) {
    if (!loopIds.has(e.id)) continue;
    for (const nid of [e.fromNode, e.toNode]) {
      const list = byNode.get(nid);
      if (list) list.push(e.id);
      else byNode.set(nid, [e.id]);
    }
  }

  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const queue: string[] = [];
  for (const id of result) {
    if (loopIds.has(id)) queue.push(id);
  }

  const visitedNodes = new Set<string>();
  while (queue.length > 0) {
    const eid = queue.pop()!;
    const edge = edgeById.get(eid);
    if (!edge) continue;
    for (const nid of [edge.fromNode, edge.toNode]) {
      if (visitedNodes.has(nid)) continue;
      visitedNodes.add(nid);
      const neighbours = byNode.get(nid);
      if (!neighbours) continue;
      for (const neighbourId of neighbours) {
        if (!result.has(neighbourId)) {
          result.add(neighbourId);
          queue.push(neighbourId);
        }
      }
    }
  }

  return result;
}

/**
 * Creates closed loop / ring edges connecting a sequence of nodes:
 * A -> B -> C -> ... -> A
 * Useful for circular workflows, iterative thinking loops, and cyclic systems.
 * Slices nodes in angular order around the group's centroid, and binds edges
 * with tangential perimeter flow to produce clean, rounded circular loops without reverse buckles.
 *
 * Coloring strategy:
 * 1. Every edge inside the ring shares one identical color (one ring = one flow).
 * 2. The chosen color is never one already claimed by another ring on the
 *    canvas, so two different loops are always visually distinguishable.
 */
export function connectLoopNodes(
  nodes: CanvasNode[],
  existingEdges: CanvasEdge[],
  style: CanvasEdgeLineStyle = "bezier",
  spatiallySort: boolean = true,
  allNodes?: CanvasNode[]
): CanvasEdge[] {
  if (nodes.length < 3) return connectChainNodes(nodes, existingEdges, style, spatiallySort, allNodes);

  const cx = nodes.reduce((sum, n) => sum + (n.x + n.width / 2), 0) / nodes.length;
  const cy = nodes.reduce((sum, n) => sum + (n.y + n.height / 2), 0) / nodes.length;

  const orderedNodes = spatiallySort
    ? (() => {
        return [...nodes].sort((a, b) => {
          const angleA = Math.atan2(a.y + a.height / 2 - cy, a.x + a.width / 2 - cx);
          const angleB = Math.atan2(b.y + b.height / 2 - cy, b.x + b.width / 2 - cx);
          return angleA - angleB;
        });
      })()
    : [...nodes];

  const newEdges: CanvasEdge[] = [];
  const count = orderedNodes.length;
  const usedIncomingSides = new Map<string, CanvasNodeSide>();

  // Detect a rectangular grid layout first: its loop is drawn with straight
  // orthogonal segments, producing a clean rectangular frame.
  //
  // Grid must win over ring: the four corners of a 2x2 rectangle are exactly
  // equidistant from their centroid, so a rectangular arrangement also
  // satisfies the "all cards on a common circle" test. Checking the grid first
  // keeps such a layout rectangular instead of turning it into a circle.
  const gridLayout = computeGridLayout(orderedNodes);
  // Otherwise, if the cards really do sit on a circle, every segment becomes a
  // true arc so the loop is a perfectly round ring.
  const ringLayout = gridLayout ? null : computeRingLayout(orderedNodes);

  // Unified color for the whole loop so that all ring segments visually
  // belong to a single semantic flow, regardless of which node is "from".
  //
  // We first resolve the first node's preferred source color, but we then
  // reject it when that color is already claimed by another ring on the
  // canvas — guaranteeing "one ring = one color, different rings = different
  // colors".
  const preferredLoopColor = getSourceNodeEdgeColor(
    orderedNodes[0],
    existingEdges,
    allNodes || nodes
  );
  const loopUsedColors = getLoopEdgeColors(existingEdges);
  const paletteKeys = Object.keys(CANVAS_COLOR_PALETTES);

  let loopEdgeColor: string;
  if (preferredLoopColor && !loopUsedColors.has(preferredLoopColor)) {
    loopEdgeColor = preferredLoopColor;
  } else {
    loopEdgeColor =
      paletteKeys.find((k) => !loopUsedColors.has(k)) ??
      paletteKeys[loopUsedColors.size % paletteKeys.length];
  }

  const nextClockwiseSide = (s: CanvasNodeSide): CanvasNodeSide => {
    switch (s) {
      case "top":
        return "right";
      case "right":
        return "bottom";
      case "bottom":
        return "left";
      case "left":
      default:
        return "top";
    }
  };

  for (let i = 0; i < count; i++) {
    const from = orderedNodes[i];
    const to = orderedNodes[(i + 1) % count];
    const exists =
      existingEdges.some(
        (e) =>
          (e.fromNode === from.id && e.toNode === to.id) ||
          (e.fromNode === to.id && e.toNode === from.id)
      ) ||
      newEdges.some(
        (e) =>
          (e.fromNode === from.id && e.toNode === to.id) ||
          (e.fromNode === to.id && e.toNode === from.id)
      );
    if (!exists) {
      // Relative movement vector between consecutive nodes in the ring:
      const dx = to.x + to.width / 2 - (from.x + from.width / 2);
      const dy = to.y + to.height / 2 - (from.y + from.height / 2);

      let fromSide: CanvasNodeSide = "right";
      let toSide: CanvasNodeSide = "left";

      if (Math.abs(dx) >= Math.abs(dy) * 1.3) {
        // Predominantly horizontal movement
        if (dx > 0) {
          fromSide = "right";
          toSide = "left";
        } else {
          fromSide = "left";
          toSide = "right";
        }
      } else if (Math.abs(dy) >= Math.abs(dx) * 1.3) {
        // Predominantly vertical movement
        if (dy > 0) {
          fromSide = "bottom";
          toSide = "top";
        } else {
          fromSide = "top";
          toSide = "bottom";
        }
      } else {
        // Diagonal quadrants along the clockwise perimeter:
        if (dx > 0 && dy > 0) {
          // Down-Right
          fromSide = "right";
          toSide = "top";
        } else if (dx < 0 && dy > 0) {
          // Down-Left
          fromSide = "bottom";
          toSide = "right";
        } else if (dx < 0 && dy < 0) {
          // Up-Left
          fromSide = "left";
          toSide = "bottom";
        } else {
          // Up-Right
          fromSide = "top";
          toSide = "left";
        }
      }

      // Ensure that a node's outgoing side does NOT overlap with its incoming side:
      const incomingSide = usedIncomingSides.get(from.id);
      if (incomingSide && fromSide === incomingSide) {
        fromSide = nextClockwiseSide(fromSide);
      }

      usedIncomingSides.set(to.id, toSide);

      const edgeColor = loopEdgeColor;
      newEdges.push({
        id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${i + 1}`,
        fromNode: from.id,
        fromSide,
        toNode: to.id,
        toSide,
        color: edgeColor,
        style,
        // When the cards already sit on a common circle, connect them with a
        // true circular arc so the closed loop reads as a perfectly round ring.
        ...(ringLayout
          ? { ringCenter: ringLayout.center, ringRadius: ringLayout.radius }
          : {}),
        // Likewise, a rectangular grid gets straight orthogonal segments.
        ...(gridLayout ? { gridPath: true } : {}),
      });
    }
  }
  return newEdges;
}

/**
 * Removes all edges connected to the specified node (both incoming and outgoing).
 */
export function disconnectNodeEdges(nodeId: string, edges: CanvasEdge[]): CanvasEdge[] {
  return edges.filter((e) => e.fromNode !== nodeId && e.toNode !== nodeId);
}

/**
 * Spawns multiple connected child cards (1-to-Many) from a source node for rapid brainstorming.
 * Neatly spaces the spawned cards vertically (when branching right) or horizontally (when branching bottom).
 */
export function spawnMultipleBranches(
  sourceNode: CanvasNode,
  count: number = 3,
  direction: "right" | "bottom" = "right",
  existingEdges: CanvasEdge[] = [],
  allNodes?: CanvasNode[]
): { newNodes: CanvasTextNode[]; newEdges: CanvasEdge[] } {
  const newNodes: CanvasTextNode[] = [];
  const newEdges: CanvasEdge[] = [];
  const gap = 120;
  const cardWidth = Math.min(320, Math.max(260, sourceNode.width));
  const cardHeight = 150;
  const spacing = 20;

  const totalHeight = count * cardHeight + (count - 1) * spacing;
  const totalWidth = count * cardWidth + (count - 1) * spacing;

  const startY =
    direction === "right"
      ? sourceNode.y + sourceNode.height / 2 - totalHeight / 2
      : sourceNode.y + sourceNode.height + gap;

  const startX =
    direction === "right"
      ? sourceNode.x + sourceNode.width + gap
      : sourceNode.x + sourceNode.width / 2 - totalWidth / 2;

  for (let i = 0; i < count; i++) {
    const newId = `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${i + 1}`;
    const x = direction === "right" ? startX : startX + i * (cardWidth + spacing);
    const y = direction === "right" ? startY + i * (cardHeight + spacing) : startY;

    const newNode: CanvasTextNode = {
      id: newId,
      type: "text",
      text: `### 分支思考 ${i + 1}\n输入关联论述与子观点...`,
      x: Math.round(x),
      y: Math.round(y),
      width: cardWidth,
      height: cardHeight,
      color: sourceNode.color || "5",
    };

    const newEdge = createEdgeBetweenNodes(
      sourceNode,
      newNode,
      undefined,
      "bezier",
      [...existingEdges, ...newEdges],
      allNodes
    );

    newNodes.push(newNode);
    newEdges.push(newEdge);
  }

  return { newNodes, newEdges };
}

/**
 * Cycles arrow heads: None -> Forward -> Bidirectional -> None
 */
export function cycleEdgeArrow(edge: CanvasEdge): CanvasEdge {
  if (edge.toEnd === "arrow" && edge.fromEnd === "arrow") {
    // None
    return { ...edge, fromEnd: "none", toEnd: "none" };
  }
  if (edge.fromEnd === "none" && edge.toEnd === "none") {
    // Forward
    return { ...edge, fromEnd: "none", toEnd: "arrow" };
  }
  // Bidirectional
  return { ...edge, fromEnd: "arrow", toEnd: "arrow" };
}

/**
 * Cycles line style: Bezier -> Step -> Straight -> Bezier
 */
export function cycleEdgeStyle(edge: CanvasEdge): CanvasEdge {
  const nextStyle: CanvasEdgeLineStyle =
    edge.style === "straight" ? "step" : edge.style === "step" ? "bezier" : "straight";
  return { ...edge, style: nextStyle };
}

/**
 * Cycles stroke pattern: solid -> dashed -> dotted -> solid
 */
export function cycleEdgeStrokePattern(edge: CanvasEdge): CanvasEdge {
  const current = edge.strokePattern || "solid";
  const next = current === "solid" ? "dashed" : current === "dashed" ? "dotted" : "solid";
  return { ...edge, strokePattern: next };
}

/**
 * Reverses edge direction
 */
export function reverseEdgeDirection(edge: CanvasEdge): CanvasEdge {
  let newFromEnd: "none" | "arrow" = "none";
  let newToEnd: "none" | "arrow" = "arrow";

  if (edge.fromEnd === "arrow" && edge.toEnd === "arrow") {
    newFromEnd = "arrow";
    newToEnd = "arrow";
  } else if (edge.fromEnd === "none" && edge.toEnd === "none") {
    newFromEnd = "none";
    newToEnd = "none";
  } else if (edge.fromEnd === "arrow" && (!edge.toEnd || edge.toEnd === "none")) {
    newFromEnd = "none";
    newToEnd = "arrow";
  } else {
    newFromEnd = "none";
    newToEnd = "arrow";
  }

  return {
    ...edge,
    fromNode: edge.toNode,
    toNode: edge.fromNode,
    fromSide: edge.toSide,
    toSide: edge.fromSide,
    fromEnd: newFromEnd,
    toEnd: newToEnd,
  };
}

/**
 * Options for exporting infinite canvas as image
 */
export interface CanvasExportOptions {
  title?: string;
  theme?: string;
  background?: "theme" | "white" | "transparent";
  padding?: number;
  scale?: number;
}

function escapeSvgXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generates an ultra-crisp, standalone SVG vector representation of the canvas
 */
export function exportCanvasToSvg(
  data: CanvasData,
  options?: CanvasExportOptions
): string {
  // The very same palette the on-screen renderer uses, so the exported image
  // matches what the user is looking at. This used to be a hand-maintained
  // copy that had drifted: the light theme exported on a #f8fafc backdrop
  // instead of #ffffff, e-ink lost its paper tone, and the dot grid never
  // matched in any theme.
  const themePalette = getCanvasThemeColors(normalizeExportTheme(options?.theme));
  const isDark = themePalette.isDark;
  const isEink = themePalette.isEink;

  const bbox = computeBoundingBox(data.nodes);
  const pad = options?.padding ?? 48;
  const minX = bbox.minX - pad;
  const minY = bbox.minY - pad;
  const width = Math.max(800, Math.ceil(bbox.width + pad * 2));
  const height = Math.max(600, Math.ceil(bbox.height + pad * 2));

  const bgColor =
    options?.background === "transparent"
      ? "none"
      : options?.background === "white"
      ? "#ffffff"
      : themePalette.canvasBg;

  const cardBg = themePalette.cardBg;
  const cardText = themePalette.cardText;
  const cardBorder = themePalette.cardBorder;
  const defaultEdgeColor = themePalette.edgeColor;
  const dotColor = themePalette.dotColor;

  const nodeMap = new Map<string, CanvasNode>(data.nodes.map((n) => [n.id, n]));

  // Build a source-aware color map so SVG export is byte-identical to the
  // on-screen renderer (which reconciles color collisions inside containers
  // and across the canvas via the same logic).
  const sourceDisplayColorMap = computeSourceDisplayColorMap(data.nodes, data.edges);
  // Pre-collect any hex colors that actually appear on edges so we register
  // matching arrow markers up-front in <defs>.
  const exportHexColors = new Set<string>();
  for (const edge of data.edges) {
    const effectiveColorKey = edge.color || (edge.fromNode ? sourceDisplayColorMap.get(edge.fromNode) : undefined);
    if (effectiveColorKey && effectiveColorKey.startsWith("#")) {
      exportHexColors.add(effectiveColorKey);
    }
  }

  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">`
  );

  // Definitions (Filters, Grid Pattern, Arrow Markers)
  lines.push(`  <defs>`);
  lines.push(`    <filter id="card-shadow" x="-8%" y="-8%" width="120%" height="120%">`);
  lines.push(`      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="rgba(0,0,0,0.18)" />`);
  lines.push(`    </filter>`);
  if (bgColor !== "none") {
    lines.push(`    <pattern id="canvas-dots" width="28" height="28" patternUnits="userSpaceOnUse">`);
    lines.push(`      <circle cx="2" cy="2" r="1.2" fill="${dotColor}" />`);
    lines.push(`    </pattern>`);
  }
  // Arrow markers for each palette color
  Object.entries(CANVAS_COLOR_PALETTES).forEach(([k, c]) => {
    lines.push(
      `    <marker id="arrow-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="${c.stroke}" /></marker>`
    );
  });
  // Arrow markers for any custom hex colors that may appear on edges
  exportHexColors.forEach((hex) => {
    lines.push(
      `    <marker id="arrow-${hex.replace("#", "hex-")}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="${hex}" /></marker>`
    );
  });
  lines.push(
    `    <marker id="arrow-default" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="${defaultEdgeColor}" /></marker>`
  );
  lines.push(`  </defs>`);

  // ── Embedded stylesheet ──────────────────────────────────────────────────
  // Mirrors the on-screen card styling so the exported image reproduces every
  // visible element (header tint, origin badge, rich Markdown body, …).
  lines.push(`  <style><![CDATA[`);
  lines.push(`    .ks-card{width:100%;height:100%;box-sizing:border-box;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;background:${themePalette.cardBg};box-shadow:${themePalette.cardShadow};font-family:system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;}`);
  lines.push(`    .ks-hdr{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 10px;font-size:11px;font-weight:600;border-bottom:1px solid ${themePalette.cardHeaderBorder};flex-shrink:0;}`);
  lines.push(`    .ks-title{display:inline-flex;align-items:center;gap:4px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}`);
  lines.push(`    .ks-badge{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;white-space:nowrap;flex-shrink:0;}`);
  lines.push(`    .ks-body{flex:1;padding:8px 12px;overflow:hidden;font-size:13px;line-height:1.6;color:${themePalette.cardText};}`);
  lines.push(`    .ks-body > *:first-child{margin-top:0;}`);
  lines.push(`    .ks-body > *:last-child{margin-bottom:0;}`);
  lines.push(`    .ks-body h1{font-size:17px;font-weight:700;margin:0 0 8px;}`);
  lines.push(`    .ks-body h2{font-size:15.5px;font-weight:700;margin:0 0 8px;}`);
  lines.push(`    .ks-body h3{font-size:14px;font-weight:700;margin:0 0 6px;}`);
  lines.push(`    .ks-body h4,.ks-body h5,.ks-body h6{font-size:13px;font-weight:700;margin:0 0 6px;}`);
  lines.push(`    .ks-body p{margin:0 0 6px;}`);
  lines.push(`    .ks-body ul,.ks-body ol{margin:0 0 6px;padding-left:20px;}`);
  lines.push(`    .ks-body li{margin:2px 0;}`);
  lines.push(`    .ks-body li.task-list-item{list-style:none;margin-left:-18px;}`);
  lines.push(`    .ks-body code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;padding:1px 4px;border-radius:4px;background:${themePalette.codeBg};}`);
  lines.push(`    .ks-body pre{padding:8px 10px;border-radius:6px;overflow:hidden;background:${themePalette.codeBg};margin:0 0 6px;}`);
  lines.push(`    .ks-body pre code{padding:0;background:none;}`);
  lines.push(`    .ks-body blockquote{margin:0 0 6px;padding-left:10px;border-left:3px solid ${themePalette.quoteBorder};opacity:.88;}`);
  lines.push(`    .ks-body a{color:${defaultEdgeColor};text-decoration:underline;}`);
  lines.push(`    .ks-body table{border-collapse:collapse;font-size:12px;}`);
  lines.push(`    .ks-body th,.ks-body td{border:1px solid ${themePalette.cardBorder};padding:2px 6px;}`);
  lines.push(`    .ks-body hr{border:none;border-top:1px solid ${themePalette.cardBorder};margin:8px 0;}`);
  lines.push(`    .ks-body img{max-width:100%;}`);
  lines.push(`  ]]></style>`);

  // Background Rect
  if (bgColor !== "none") {
    lines.push(`  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${bgColor}" />`);
    lines.push(`  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#canvas-dots)" />`);
  }

  // 1. Group Containers Layer
  data.nodes
    .filter((n): n is CanvasGroupNode => n.type === "group")
    .forEach((g) => {
      // Mirrors the on-screen renderer: a custom palette colour wins, otherwise
      // fall back to the theme's own group tones. This used to hard-code the
      // sky-blue palette entry, so an untinted group looked nothing like the
      // one on screen — most visibly in the e-ink theme.
      const pal = g.color && CANVAS_COLOR_PALETTES[g.color] ? CANVAS_COLOR_PALETTES[g.color] : undefined;
      const groupFill = pal ? pal.bg : themePalette.groupBg;
      const groupStroke = pal ? pal.stroke : themePalette.groupBorder;
      lines.push(`  <g class="canvas-group" data-id="${g.id}">`);
      lines.push(
        `    <rect x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" rx="16" fill="${groupFill}" stroke="${groupStroke}" stroke-width="2" stroke-dasharray="6,6" />`
      );
      // Group title header
      lines.push(
        `    <path d="M ${g.x} ${g.y + 32} L ${g.x} ${g.y + 14} Q ${g.x} ${g.y} ${g.x + 14} ${g.y} L ${g.x + g.width - 14} ${g.y} Q ${g.x + g.width} ${g.y} ${g.x + g.width} ${g.y + 14} L ${g.x + g.width} ${g.y + 32} Z" fill="${groupStroke}" />`
      );
      lines.push(
        `    <text x="${g.x + 14}" y="${g.y + 19}" fill="#ffffff" font-family="system-ui, sans-serif" font-size="13" font-weight="600" dominant-baseline="central">📁 ${escapeSvgXml(g.label || "分组容器")}</text>`
      );
      lines.push(`  </g>`);
    });

  // 2. Connection Edges Layer
  data.edges.forEach((edge) => {
    const from = nodeMap.get(edge.fromNode);
    const to = nodeMap.get(edge.toNode);
    if (!from || !to) return;

    const optSides = getOptimalAnchorSides(from, to);
    const fromSide = edge.fromSide || optSides.fromSide;
    const toSide = edge.toSide || optSides.toSide;
    const p1 = getNodeAnchorPoint(from, fromSide);
    const p2 = getNodeAnchorPoint(to, toSide);
    // A grid edge is always a straight orthogonal segment, so stale arc
    // metadata (if any) is ignored — matching the on-screen renderer exactly.
    const ringArc =
      !edge.gridPath && edge.ringCenter && edge.ringRadius
        ? { center: edge.ringCenter, radius: edge.ringRadius }
        : undefined;
    const exportStyle = edge.gridPath ? "straight" : edge.style;
    const obstacles = data.nodes.filter((n) => n.id !== edge.fromNode && n.id !== edge.toNode);
    const pathD = computeEdgePath(p1, fromSide, p2, toSide, exportStyle, edge.stepOffset, ringArc, obstacles);

    // Mirror the on-screen renderer's color resolution: prefer the
    // edge's own explicit color, then fall back to source-aware display color.
    const effectiveColorKey = getEffectiveEdgeColorKey(edge, data.edges, data.nodes, sourceDisplayColorMap);
    const edgeColor =
      effectiveColorKey && CANVAS_COLOR_PALETTES[effectiveColorKey]
        ? CANVAS_COLOR_PALETTES[effectiveColorKey].stroke
        : effectiveColorKey && effectiveColorKey.startsWith("#")
        ? effectiveColorKey
        : defaultEdgeColor;

    const markerRef = effectiveColorKey
      ? CANVAS_COLOR_PALETTES[effectiveColorKey]
        ? `arrow-${effectiveColorKey}`
        : effectiveColorKey.startsWith("#")
        ? `arrow-${effectiveColorKey.replace("#", "hex-")}`
        : "arrow-default"
      : "arrow-default";
    const markerEnd = edge.toEnd === "arrow" ? `url(#${markerRef})` : "none";
    const markerStart = edge.fromEnd === "arrow" ? `url(#${markerRef})` : "none";

    lines.push(`  <g class="canvas-edge" data-id="${edge.id}">`);
    lines.push(
      `    <path d="${pathD}" fill="none" stroke="${edgeColor}" stroke-width="2" stroke-linecap="round" marker-end="${markerEnd}" marker-start="${markerStart}" />`
    );
    if (edge.fromEnd !== "arrow") {
      // On a ring the origin dot must sit on the circle too, not on the raw
      // card anchor point.
      const originPoint = ringArc ? projectPointOntoRing(p1, ringArc) : p1;
      lines.push(
        `    <circle cx="${originPoint.x}" cy="${originPoint.y}" r="3.5" fill="${edgeColor}" stroke="${isDark ? "#0f172a" : "#ffffff"}" stroke-width="1.2" />`
      );
    }

    // 3. Edge Label Badges
    if (edge.label && edge.label.trim()) {
      const rawMid = computeEdgeMidpoint(p1, fromSide, p2, toSide, exportStyle, edge.stepOffset, ringArc, obstacles);
      const labelText = escapeSvgXml(edge.label.trim());
      const shape = edge.labelShape || "pill";
      const charWidth = 11.5;
      const labelWidth = Math.max(54, edge.label.length * charWidth + 18);
      const labelHeight = 24;
      const labelX = rawMid.x - labelWidth / 2;
      const labelY = rawMid.y - labelHeight / 2;
      const labelBg = themePalette.edgeLabelBg;

      lines.push(`    <g class="canvas-edge-label" transform="translate(${rawMid.x}, ${rawMid.y})">`);
      if (shape === "diamond") {
        const halfW = (labelWidth + 18) / 2;
        const halfH = 14;
        lines.push(
          `      <polygon points="0,${-halfH} ${halfW},0 0,${halfH} ${-halfW},0" fill="${labelBg}" stroke="${edgeColor}" stroke-width="1.5" />`
        );
      } else if (shape === "rect") {
        lines.push(
          `      <rect x="${-labelWidth / 2}" y="${-labelHeight / 2}" width="${labelWidth}" height="${labelHeight}" rx="4" fill="${labelBg}" stroke="${edgeColor}" stroke-width="1.5" />`
        );
      } else {
        // pill
        lines.push(
          `      <rect x="${-labelWidth / 2}" y="${-labelHeight / 2}" width="${labelWidth}" height="${labelHeight}" rx="12" fill="${labelBg}" stroke="${edgeColor}" stroke-width="1.5" />`
        );
      }
      lines.push(
        `      <text x="0" y="0" fill="${themePalette.edgeLabelText}" font-family="system-ui, sans-serif" font-size="11.5" font-weight="600" text-anchor="middle" dominant-baseline="central">${labelText}</text>`
      );
      lines.push(`    </g>`);
    }
    lines.push(`  </g>`);
  });

  // 4. Cards Layer — rendered through foreignObject so the exported image
  // reproduces exactly what the user sees on screen: tinted header, origin
  // badge, full rich Markdown body, file/link layouts, task checkboxes, etc.
  const outgoingCountMap = new Map<string, number>();
  for (const e of data.edges) {
    if (e.fromNode) {
      outgoingCountMap.set(e.fromNode, (outgoingCountMap.get(e.fromNode) ?? 0) + 1);
    }
  }

  data.nodes
    .filter((n) => n.type !== "group")
    .forEach((card) => {
      const pal =
        card.color && CANVAS_COLOR_PALETTES[card.color]
          ? CANVAS_COLOR_PALETTES[card.color]
          : undefined;

      const outgoingCount = outgoingCountMap.get(card.id) ?? 0;
      const isOneToManySource = outgoingCount >= 2;
      const sourceColorKey = sourceDisplayColorMap.get(card.id);
      const sourcePal =
        sourceColorKey && CANVAS_COLOR_PALETTES[sourceColorKey]
          ? CANVAS_COLOR_PALETTES[sourceColorKey]
          : undefined;

      // Border priority mirrors CanvasView:
      // one-to-many source color > node color > default border
      const borderStroke =
        isOneToManySource && sourcePal ? sourcePal.stroke : pal ? pal.stroke : cardBorder;
      const borderWidth = (isOneToManySource && sourcePal) || pal ? 2 : 1;
      const headerBg = pal ? pal.bg : themePalette.cardHeaderBg;

      // Header icon + label — identical wording to the on-screen card
      let headerIcon = "📝";
      let headerLabel = "便签卡片";
      const mediaType = card.type === "file" ? getMediaFileType(card.file) : card.type === "link" ? getMediaFileType(card.url) : "other";

      if (card.type === "file") {
        if (mediaType === "image") {
          headerIcon = "🖼️";
          headerLabel = card.file.split(/[/\\]/).pop() || card.file;
        } else if (mediaType === "audio") {
          headerIcon = "🎵";
          headerLabel = card.file.split(/[/\\]/).pop() || card.file;
        } else if (mediaType === "video") {
          headerIcon = "🎬";
          headerLabel = card.file.split(/[/\\]/).pop() || card.file;
        } else if (mediaType === "pdf") {
          headerIcon = "📑";
          headerLabel = card.file.split(/[/\\]/).pop() || card.file;
        } else {
          headerIcon = "📄";
          headerLabel = card.file;
        }
      } else if (card.type === "link") {
        headerIcon = "🔗";
        headerLabel = "外部参考";
      }

      // Body content
      let bodyHtml = "";
      if (card.type === "text") {
        bodyHtml = renderCardMarkdown(card.text);
      } else if (card.type === "file") {
        if (mediaType === "image") {
          bodyHtml = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;background:rgba(0,0,0,0.03);border-radius:6px;"><img src="${escapeSvgXml(card.file)}" alt="${escapeSvgXml(headerLabel)}" style="max-width:100%;max-height:100%;object-fit:contain;" /></div>`;
        } else if (mediaType === "audio") {
          bodyHtml = `<div style="padding:12px;display:flex;flex-direction:column;gap:6px;"><span style="font-weight:600;font-size:12px;">🎵 ${escapeSvgXml(headerLabel)}</span><span style="font-size:11px;opacity:0.7;">音频媒体资源</span></div>`;
        } else if (mediaType === "video") {
          bodyHtml = `<div style="padding:12px;display:flex;flex-direction:column;gap:6px;"><span style="font-weight:600;font-size:12px;">🎬 ${escapeSvgXml(headerLabel)}</span><span style="font-size:11px;opacity:0.7;">视频媒体资源</span></div>`;
        } else if (mediaType === "pdf") {
          bodyHtml = `<div style="padding:12px;display:flex;flex-direction:column;gap:6px;"><span style="font-weight:600;font-size:12px;">📑 ${escapeSvgXml(headerLabel)}</span><span style="font-size:11px;opacity:0.7;">PDF 文档资源</span></div>`;
        } else {
          bodyHtml =
            `<p style="margin:0 0 6px 0;font-weight:600;">${escapeSvgXml(card.file)}</p>` +
            `<p style="margin:0;opacity:0.7;font-size:11.5px;">库内 Markdown 文档卡片。点击右上角图标可在主阅读区全屏打开。</p>`;
        }
      } else {
        bodyHtml = `<a href="${escapeSvgXml(card.url)}">${escapeSvgXml(card.url)}</a>`;
      }

      // "🌱 发起源 · N" hub badge
      let badgeHtml = "";
      if (isOneToManySource) {
        const badgeBg = sourcePal ? sourcePal.bg : "rgba(16, 185, 129, 0.15)";
        const badgeFg = sourcePal ? sourcePal.stroke : "#10b981";
        badgeHtml = `<span class="ks-badge" style="background:${badgeBg};color:${badgeFg};border:1px solid ${badgeFg};">🌱 发起源 · ${outgoingCount}</span>`;
      }

      lines.push(`  <g class="canvas-card" data-id="${card.id}">`);
      lines.push(
        `    <foreignObject x="${card.x}" y="${card.y}" width="${card.width}" height="${card.height}">`
      );
      lines.push(
        `      <div xmlns="http://www.w3.org/1999/xhtml" class="ks-card" style="border:${borderWidth}px solid ${borderStroke};">`
      );
      lines.push(
        `        <div class="ks-hdr" style="background:${headerBg};color:${themePalette.cardHeaderText};">` +
          `<span class="ks-title">${headerIcon} ${escapeSvgXml(headerLabel)}</span>${badgeHtml}</div>`
      );
      lines.push(`        <div class="ks-body">${bodyHtml}</div>`);
      lines.push(`      </div>`);
      lines.push(`    </foreignObject>`);
      lines.push(`  </g>`);
    });

  lines.push(`</svg>`);
  return lines.join("\n");
}

/**
 * Rasterizes canvas SVG into a high-DPI PNG image Data URL
 */
/**
 * Hard ceiling on the rasterised pixel count. Beyond this the backing canvas
 * alone would hold ~100 MB and the subsequent PNG encode would allocate
 * roughly as much again — which is what used to crash (闪退) the renderer on
 * large boards.
 */
const MAX_EXPORT_PIXELS = 24_000_000;
/** Chromium refuses to allocate a canvas larger than 16384px on either side. */
const MAX_EXPORT_EDGE = 16_384;
/** Rasterisation watchdog; generous because big boards legitimately take a while. */
const EXPORT_RASTERISE_TIMEOUT_MS = 20_000;

/**
 * Clamps the requested export scale so the resulting bitmap always stays
 * inside both the per-side and the total-pixel limits. Without this a large
 * whiteboard exported at scale 2 would ask for a canvas the browser cannot
 * allocate, and the renderer would die instead of reporting an error.
 */
export function resolveExportScale(
  width: number,
  height: number,
  requested: number
): number {
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  let scale = Math.max(0.1, requested);

  if (safeW * scale > MAX_EXPORT_EDGE) scale = MAX_EXPORT_EDGE / safeW;
  if (safeH * scale > MAX_EXPORT_EDGE) scale = Math.min(scale, MAX_EXPORT_EDGE / safeH);

  const maxByPixels = Math.sqrt(MAX_EXPORT_PIXELS / (safeW * safeH));
  if (scale > maxByPixels) scale = maxByPixels;

  return Math.max(0.1, scale);
}

function loadImageForExport(url: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      img.src = "";
      reject(new Error("白板图片栅格化超时，请缩小画布范围后重试"));
    }, EXPORT_RASTERISE_TIMEOUT_MS);

    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("白板图片渲染失败"));
    };
    img.src = url;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("白板图片编码失败"));
      }, "image/png");
      return;
    }

    // Very old engines without toBlob: encode manually, byte by byte, so we
    // never build a multi-megabyte base64 string in one go.
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      resolve(new Blob([bytes], { type: "image/png" }));
    } catch (err) {
      reject(err instanceof Error ? err : new Error("白板图片编码失败"));
    }
  });
}

/** True for references that stay inside the document and can never taint it. */
function isInternalReference(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("#")) return true;
  if (/^data:/i.test(trimmed)) return true;
  if (/^(blob|about|javascript):/i.test(trimmed)) return true;
  return false;
}

/**
 * Reads a URL into a data URL. Tries `fetch` first and falls back to XHR,
 * which is the only route that reliably reaches `file://` resources on a
 * `file://` page in Electron (fetch rejects them as cross-origin).
 */
/** Converts a file:// URL into an OS path, or null when it is not one. */
function fileUrlToPath(url: string): string | null {
  if (!/^file:\/\//i.test(url)) return null;
  let p = url.slice("file://".length);
  try {
    p = decodeURIComponent(p);
  } catch {
    // keep the raw value
  }
  if (/^\/[a-zA-Z]:/.test(p)) p = p.slice(1); // file:///C:/x → C:/x
  return p.replace(/\//g, "\\");
}

/** Bound on fetching a single external resource during export. */
const RESOURCE_READ_TIMEOUT_MS = 3000;

async function readUrlAsDataUrl(url: string): Promise<string | null> {
  // Local files first: the page's security context blocks fetch/XHR on
  // file:// resources, but the main process can read them directly — this is
  // what lets card images survive instead of being dropped from the export.
  const localPath = fileUrlToPath(url);
  if (localPath && typeof window !== "undefined") {
    const desktop = window.knowSpaceDesktop ?? window.bookMDDesktop;
    if (desktop?.readFileAsDataUrl) {
      try {
        const res = await desktop.readFileAsDataUrl({ filePath: localPath });
        if (res?.success && res.dataUrl) return res.dataUrl;
      } catch {
        // fall through to the network paths
      }
    }
  }

  // Every read is time-boxed: a hanging remote image must never stall the
  // whole export, it just gets dropped.
  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), RESOURCE_READ_TIMEOUT_MS)
      : null;
    try {
      const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 0) return await blobToDataUrl(blob);
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    // fall through to XHR
  }

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.responseType = "blob";
      xhr.onload = () => {
        const blob = xhr.response as Blob | null;
        if (blob && blob.size > 0) {
          blobToDataUrl(blob).then(finish).catch(() => finish(null));
        } else {
          finish(null);
        }
      };
      xhr.onerror = () => finish(null);
      xhr.ontimeout = () => finish(null);
      xhr.onabort = () => finish(null);
      xhr.timeout = RESOURCE_READ_TIMEOUT_MS;
      xhr.send();
    } catch {
      finish(null);
    }
  });
}

/**
 * Rewrites an exported SVG so every external resource is either inlined as a
 * data URL or removed.
 *
 * An SVG loaded through a blob URL inherits the page's security context, so a
 * single `<img src="file://…">` or cross-origin image inside it taints the
 * canvas it is drawn onto — and a tainted canvas refuses `toBlob()`, which is
 * exactly the "Tainted canvases may not be exported" failure. Inlining keeps
 * the picture; anything we cannot read is dropped so the export still succeeds
 * instead of failing outright.
 */
export async function sanitizeSvgResources(svgString: string): Promise<string> {
  // ── Step 0: make the markup well-formed XML ──────────────────────────────
  // This has to happen FIRST. Card bodies are HTML (markdown-it runs without
  // xhtmlOut), so <br>, <img> and the task-list <input> arrive unclosed. In
  // XML an unclosed <img> swallows everything that follows it, which makes the
  // whole document fail to parse — and that in turn disabled every downstream
  // safeguard: sanitizeSvgViaDom() bailed out, stripSvgImages() returned its
  // input unchanged, and Chromium's error-recovery parser still loaded the
  // external <img>, tainting the canvas so toBlob() refused to run.
  const wellFormed = serializeSvgForExport(valueBooleanAttributes(svgString));

  const viaDom = await sanitizeSvgViaDom(wellFormed);
  if (viaDom !== null) return viaDom;
  // Still not parseable (some other malformation): fall back to a textual
  // rewrite. Less precise, but it keeps the export from failing outright.
  return sanitizeSvgViaRegex(wellFormed);
}

/**
 * Attributes that HTML allows to stand alone but XML requires to carry a
 * value. markdown-it's task lists emit `<input type="checkbox" checked
 * disabled>`, and `checked` alone is a hard XML parse error — self-closing the
 * tag does not help.
 */
const HTML_BOOLEAN_ATTR_RE =
  /(\s)(checked|disabled|selected|readonly|required|multiple|autofocus|hidden|open|reversed|novalidate|formnovalidate|ismap|loop|muted|controls|default|defer|async|allowfullscreen|itemscope|scoped)(?=[\s/>]|$)/gi;

const SVG_OR_HTML_TAG_RE = /<([a-zA-Z][\w:-]*)((?:\s+[^<>]*?)?)(\/?)>/g;

/** Rewrites `disabled` into `disabled="disabled"` so the markup parses as XML. */
export function valueBooleanAttributes(svgString: string): string {
  return svgString.replace(
    SVG_OR_HTML_TAG_RE,
    (full, tag: string, attrs: string, selfClose: string) => {
      if (!attrs) return full;
      const fixed = attrs.replace(
        HTML_BOOLEAN_ATTR_RE,
        (_match, whitespace: string, name: string) => `${whitespace}${name}="${name}"`
      );
      return fixed === attrs ? full : `<${tag}${fixed}${selfClose}>`;
    }
  );
}

/** Returns null when the SVG could not be parsed as XML. */
async function sanitizeSvgViaDom(svgString: string): Promise<string | null> {
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    return null;
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
  } catch {
    return null;
  }
  if (doc.getElementsByTagName("parsererror").length > 0) return null;

  const targets: Array<{ el: Element; attr: string; url: string }> = [];
  const nodes = Array.from(doc.querySelectorAll("img, image"));
  for (const el of nodes) {
    for (const attr of ["src", "href", "xlink:href"]) {
      const url = el.getAttribute(attr);
      if (url && !isInternalReference(url)) {
        targets.push({ el, attr, url });
        break;
      }
    }
  }

  // CSS background images can taint the canvas just as easily.
  for (const el of Array.from(doc.querySelectorAll("[style]"))) {
    const style = el.getAttribute("style") ?? "";
    const match = /url\((['"]?)(?!data:|#)([^'")]+)\1\)/i.exec(style);
    if (match) targets.push({ el, attr: "style", url: match[2] });
  }

  if (targets.length === 0) return svgString;

  const resolved = await Promise.all(
    targets.map(async (t) => ({ ...t, dataUrl: await readUrlAsDataUrl(t.url) }))
  );

  for (const t of resolved) {
    if (t.attr === "style") {
      const style = t.el.getAttribute("style") ?? "";
      t.el.setAttribute(
        "style",
        t.dataUrl
          ? style.replace(t.url, t.dataUrl)
          : style.replace(/url\([^)]*\)/gi, "none")
      );
      continue;
    }

    if (t.dataUrl) {
      t.el.setAttribute(t.attr, t.dataUrl);
      if (t.attr === "href") {
        t.el.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", t.dataUrl);
      }
    } else {
      t.el.remove();
    }
  }

  try {
    return new XMLSerializer().serializeToString(doc);
  } catch {
    return null;
  }
}

const SVG_IMAGE_TAG_RE =
  /<(?:img|image)\b[^>]*?\b(src|href|xlink:href)\s*=\s*(["'])(.*?)\2[^>]*?>/gi;
const SVG_CSS_URL_RE = /url\(\s*(["']?)(?!data:|#)([^'")]+)\1\s*\)/gi;

/** Textual fallback used when the SVG is not well-formed XML. */
async function sanitizeSvgViaRegex(svgString: string): Promise<string> {
  const urls = new Set<string>();
  let match: RegExpExecArray | null;

  SVG_IMAGE_TAG_RE.lastIndex = 0;
  while ((match = SVG_IMAGE_TAG_RE.exec(svgString)) !== null) {
    if (!isInternalReference(match[3])) urls.add(match[3]);
  }
  SVG_CSS_URL_RE.lastIndex = 0;
  while ((match = SVG_CSS_URL_RE.exec(svgString)) !== null) {
    if (!isInternalReference(match[2])) urls.add(match[2]);
  }
  if (urls.size === 0) return svgString;

  const resolved = new Map<string, string | null>();
  await Promise.all(
    [...urls].map(async (url) => {
      resolved.set(url, await readUrlAsDataUrl(url));
    })
  );

  let out = svgString.replace(SVG_IMAGE_TAG_RE, (full, _attr, _quote, url) => {
    const dataUrl = resolved.get(url);
    if (dataUrl) return full.split(url).join(dataUrl);
    // Drop the element entirely — an unreadable external reference would
    // taint the canvas and abort the whole export.
    return "";
  });

  out = out.replace(SVG_CSS_URL_RE, (full, quote, url) => {
    const dataUrl = resolved.get(url);
    return dataUrl ? `url(${quote}${dataUrl}${quote})` : "none";
  });

  return out;
}

/**
 * Last-resort fallback: strips every image from the SVG. Used only when a
 * canvas still reports itself as tainted after sanitisation, so the user gets
 * a text-and-shape export rather than no file at all.
 */
function stripSvgImages(svgString: string): string {
  const viaDom = stripSvgImagesViaDom(svgString);
  if (viaDom !== null) return viaDom;

  // Textual fallback. This used to be the only path and it silently gave up
  // when the markup was not well-formed XML, which is precisely the case that
  // matters here — so now the regex always runs.
  return svgString
    .replace(SVG_IMAGE_TAG_RE, "")
    .replace(SVG_CSS_URL_RE, "none");
}

/** Returns null when the SVG could not be parsed as XML. */
function stripSvgImagesViaDom(svgString: string): string | null {
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    return null;
  }
  try {
    const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
    if (doc.getElementsByTagName("parsererror").length > 0) return null;
    for (const el of Array.from(doc.querySelectorAll("img, image"))) el.remove();
    for (const el of Array.from(doc.querySelectorAll("[style]"))) {
      const style = el.getAttribute("style") ?? "";
      if (/url\(/i.test(style)) {
        el.setAttribute("style", style.replace(/url\([^)]*\)/gi, "none"));
      }
    }
    return new XMLSerializer().serializeToString(doc);
  } catch {
    return null;
  }
}

/** Detects the security error thrown when a canvas has been tainted. */
function isTaintedCanvasError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /tainted|securityerror|may not be exported|insecure/i.test(message);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("当前环境不支持图片转换"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("图片转换失败"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Rasterises the canvas into a PNG Blob.
 *
 * Returning a Blob (instead of a base64 data URL) is deliberate: a data URL
 * for a large board can exceed 80 MB of text, and every hop — the string
 * itself, the IPC structured clone, and the main-process Buffer conversion —
 * used to duplicate it, tripling peak memory and crashing the app.
 */
export async function exportCanvasToPngBlob(
  data: CanvasData,
  options?: CanvasExportOptions
): Promise<Blob> {
  const svgString = exportCanvasToSvg(data, options);
  const bbox = computeBoundingBox(data.nodes);
  const pad = options?.padding ?? 48;
  const baseWidth = Math.max(800, Math.ceil(bbox.width + pad * 2));
  const baseHeight = Math.max(600, Math.ceil(bbox.height + pad * 2));

  const canRasterise =
    typeof document !== "undefined" &&
    typeof Image !== "undefined" &&
    typeof Blob !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function" &&
    Boolean(document.createElement("canvas").getContext?.("2d"));

  if (!canRasterise) {
    // Headless / test environment: hand back the vector so callers still get
    // a usable, if unscaled, image instead of an exception.
    return new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  }

  const scale = resolveExportScale(baseWidth, baseHeight, options?.scale ?? 2);

  // Inline every external reference (or drop what cannot be read) before the
  // SVG is loaded into an <img>. A single file:// or cross-origin resource
  // taints the canvas permanently, and a tainted canvas cannot be exported —
  // the exact "Tainted canvases may not be exported" failure users hit on
  // boards whose cards embed images.
  const safeSvg = await sanitizeSvgResources(svgString);

  const rasterise = async (svg: string): Promise<Blob> => {
    // A data: URL rather than a blob: URL — this is the form the (working)
    // mermaid export path has always used, and Chromium treats it as a fully
    // self-contained document rather than resolving its contents against the
    // page origin.
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const img = await loadImageForExport(dataUrl);

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(baseWidth * scale));
    canvas.height = Math.max(1, Math.round(baseHeight * scale));

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建 Canvas 2D 上下文");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    try {
      return await canvasToPngBlob(canvas);
    } finally {
      // Release the backing store right away — a 24 MP canvas pins ~96 MB.
      canvas.width = 0;
      canvas.height = 0;
    }
  };

  try {
    return await rasterise(safeSvg);
  } catch (err) {
    if (!isTaintedCanvasError(err)) throw err;

    // Something still slipped through (an unreachable relative path, a CSS
    // reference, a resource that loaded after we inspected it). Drop every
    // image and retry once so the user still gets a usable file rather than
    // an error dialog.
    const stripped = stripSvgImages(safeSvg);
    if (stripped === safeSvg) {
      throw new Error("白板包含无法内联的外部图片，浏览器安全策略阻止了图片导出");
    }
    try {
      return await rasterise(stripped);
    } catch (retryErr) {
      if (isTaintedCanvasError(retryErr)) {
        throw new Error("白板包含无法内联的外部图片，浏览器安全策略阻止了图片导出");
      }
      throw retryErr;
    }
  }
}

export async function exportCanvasToPng(
  data: CanvasData,
  options?: CanvasExportOptions
): Promise<string> {
  const blob = await exportCanvasToPngBlob(data, options);
  return blobToDataUrl(blob);
}

/**
 * Triggers download of canvas as PNG or SVG file
 */
export type CanvasDownloadResult = "png" | "svg" | "canceled";

export async function downloadCanvasAsImage(
  data: CanvasData,
  filename: string,
  format: "png" | "svg" = "png",
  options?: CanvasExportOptions
): Promise<CanvasDownloadResult> {
  const cleanName = filename.replace(/\.(png|svg|canvas)$/i, "");

  const saveSvg = (): void => {
    // Run the same well-formed-XML pass used by the rasteriser, so the saved
    // .svg file actually opens in a browser or Illustrator. Without it the
    // unclosed tags and valueless boolean attributes from the card HTML
    // produce a file most viewers reject.
    const svgContent = serializeSvgForExport(valueBooleanAttributes(exportCanvasToSvg(data, options)));
    const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cleanName}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (format === "svg") {
    saveSvg();
    return "svg";
  }

  const desktop =
    typeof window !== "undefined"
      ? window.knowSpaceDesktop ?? window.bookMDDesktop
      : undefined;

  const buildExportSvg = (): string =>
    serializeSvgForExport(valueBooleanAttributes(exportCanvasToSvg(data, options)));

  // PNG export. Rasterising in the renderer uses a <canvas>, which the
  // browser's security model can veto outright. If that happens we do NOT
  // silently hand back an SVG — the board is re-rendered in an offscreen
  // window in the main process instead, where capturePage() composites inside
  // Chromium and is not bound by the canvas tainting rules.
  let blob: Blob | null = null;
  try {
    blob = await exportCanvasToPngBlob(data, options);
  } catch (err) {
    console.warn("渲染进程栅格化失败，改用主进程离屏渲染:", err);
  }

  if (!blob && desktop?.exportCanvasAsPng) {
    const res = await desktop.exportCanvasAsPng({
      svg: buildExportSvg(),
      filename: `${cleanName}.png`,
      scale: 2,
    });
    if (res?.canceled) return "canceled";
    if (res?.success) return "png";
    console.warn("主进程离屏渲染同样失败:", res?.message);
  }

  if (!blob) {
    // Every rasterisation route is exhausted — hand over the vector file
    // rather than an error dialog, but report it honestly.
    saveSvg();
    return "svg";
  }

  // Preferred path: hand the raw bytes to the main process. Passing a base64
  // data URL instead meant the payload was duplicated as a string and then
  // again during IPC serialisation, which is what made big exports crash.
  if (desktop?.savePngBuffer) {
    const buffer = await blob.arrayBuffer();
    const res = await desktop.savePngBuffer({
      buffer,
      filename: `${cleanName}.png`,
    });
    if (res?.canceled) return "canceled";
    if (res?.success) return "png";
    throw new Error(res?.message || "保存图片失败");
  }

  // Legacy bridge without the buffer API
  if (desktop?.savePngData && blob.type === "image/png") {
    const dataUrl = await blobToDataUrl(blob);
    const res = await desktop.savePngData({ dataUrl, filename: `${cleanName}.png` });
    if (res?.canceled) return "canceled";
    if (res?.success) return "png";
    throw new Error(res?.message || "保存图片失败");
  }

  // Browser fallback: download straight from the Blob URL (no base64 step)
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${cleanName}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "png";
}

/**
 * Copies the canvas PNG image directly to system clipboard
 */
export async function copyCanvasImageToClipboard(
  data: CanvasData,
  options?: CanvasExportOptions
): Promise<boolean> {
  const desktop =
    typeof window !== "undefined"
      ? window.knowSpaceDesktop ?? window.bookMDDesktop
      : undefined;

  let blob: Blob | null = null;
  try {
    blob = await exportCanvasToPngBlob(data, options);
  } catch (err) {
    console.warn("渲染进程栅格化失败，改由主进程离屏渲染后复制:", err);
  }

  if (blob && blob.type === "image/png") {
    // The native clipboard is preferred: navigator.clipboard.write() needs the
    // window to be focused and a live user gesture, both of which are easy to
    // lose inside Electron — which is why copying used to do nothing at all.
    if (desktop?.copyPngToClipboard) {
      try {
        const res = await desktop.copyPngToClipboard({ buffer: await blob.arrayBuffer() });
        if (res?.success) return true;
      } catch (err) {
        console.warn("原生剪贴板写入失败，回退到 Web API:", err);
      }
    }

    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof ClipboardItem !== "undefined"
    ) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        return true;
      } catch (err) {
        console.warn("Web 剪贴板写入失败:", err);
      }
    }
  }

  // Last resort: let the main process render the board offscreen and put the
  // result on the clipboard itself. capturePage() is not subject to the canvas
  // tainting rules, so this still works when the renderer path was blocked.
  if (desktop?.copyCanvasAsImage) {
    try {
      const svg = serializeSvgForExport(valueBooleanAttributes(exportCanvasToSvg(data, options)));
      const res = await desktop.copyCanvasAsImage({ svg, scale: 2 });
      if (res?.success) return true;
      console.warn("离屏渲染复制失败:", res?.message);
    } catch (err) {
      console.warn("离屏渲染复制异常:", err);
    }
  }

  return false;
}

/**
 * Alignment directions for batch-selected canvas cards
 */
export type CanvasAlignDirection =
  | "horizontal" // 水平对齐 (沿水平中线对齐，所有卡片 Y 居中齐平)
  | "vertical" // 垂直对齐 (沿垂直中线对齐，所有卡片 X 居中齐平)
  | "left" // 左对齐
  | "center" // 水平居中
  | "right" // 右对齐
  | "top" // 顶端对齐
  | "middle" // 垂直居中
  | "bottom" // 底端对齐
  | "distribute-h" // 水平等距分布
  | "distribute-v" // 垂直等距分布
  | "circle" // 环形对齐 (多张卡片沿圆周均匀排布，配合环形闭环连线使用)
  | "grid"; // 矩形排布 (多张卡片按规整网格矩阵排布)

/**
 * Options for circular (ring) alignment of multiple cards.
 */
export interface CircleAlignOptions {
  /**
   * Explicit radius in canvas units. When omitted, the radius is derived so
   * that the ring is never tighter than the current spread AND neighbouring
   * cards never overlap.
   */
  radius?: number;
  /**
   * Angle (in degrees) of the first card, -90 puts it at 12 o'clock.
   * Defaults to -90 (top).
   */
  startAngleDeg?: number;
  /**
   * Explicit clockwise seating order, outermost card first.
   *
   * The interactive spacing controls pass the order captured when the ring was
   * formed. Without it the order is re-derived from the current angles, and
   * shrinking the ring would let cards swap seats mid-drag.
   */
  orderedIds?: string[];
  /**
   * Applies the collision floor to an explicit `radius` too, so an
   * interactive resize can never collapse the ring into an unreadable pile.
   * Off by default to keep programmatic callers in full control.
   */
  clampToMinRadius?: boolean;
  /**
   * Explicit circle centre. Defaults to the selection's bounding-box centre.
   *
   * Interactive resizing pins the centre captured when the drag started —
   * otherwise the centre would be re-derived from the bounding box on every
   * frame and the whole ring would creep across the canvas as it grows.
   */
  center?: { x: number; y: number };
}

/**
 * Smallest radius at which neighbouring cards still clear each other.
 *
 * Adjacent card centres sit a chord of 2R·sin(π/N) apart, so requiring that
 * chord to cover (most of) the average card diagonal gives R. Shared by the
 * alignment routine and the interactive spacing controls so the slider's lower
 * bound and the drag's floor are always the same number.
 */
export function computeMinRingRadius(nodes: CanvasNode[]): number {
  const count = nodes.length;
  if (count < 3) return 0;
  const avgDiagonal =
    nodes.reduce((sum, n) => sum + Math.hypot(n.width, n.height), 0) / count;
  const requiredChord = avgDiagonal * 0.9;
  return requiredChord / (2 * Math.sin(Math.PI / count));
}

/** Reorders `nodes` to match `orderedIds`, appending anything unlisted. */
function orderByExplicitIds(
  nodes: CanvasNode[],
  orderedIds: string[],
  centerOf: (n: CanvasNode) => { x: number; y: number },
  cx: number,
  cy: number
): CanvasNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: CanvasNode[] = [];
  for (const id of orderedIds) {
    const n = byId.get(id);
    if (n) {
      out.push(n);
      byId.delete(id);
    }
  }
  // Anything not named explicitly keeps its relative angular position.
  const rest = [...byId.values()].sort((a, b) => {
    const pa = centerOf(a);
    const pb = centerOf(b);
    return Math.atan2(pa.y - cy, pa.x - cx) - Math.atan2(pb.y - cy, pb.x - cx);
  });
  return [...out, ...rest];
}

/** Andrew's monotone chain. Returns the hull in counter-clockwise order. */
function convexHull(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length < 3) return [...points];
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);

  const cross = (
    o: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number }
  ) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const build = (input: Array<{ x: number; y: number }>) => {
    const chain: Array<{ x: number; y: number }> = [];
    for (const p of input) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) {
        chain.pop();
      }
      chain.push(p);
    }
    return chain;
  };

  const lower = build(sorted);
  const upper = build([...sorted].reverse());
  // Drop the duplicated endpoints
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Ray-casting point-in-polygon test. */
function isPointInPolygon(
  point: { x: number; y: number },
  polygon: Array<{ x: number; y: number }>
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = yi > point.y !== yj > point.y;
    if (intersects && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * True when `point` falls inside the convex hull of the given cards' centres.
 *
 * This is what lets a click on the hollow middle of a ring or a grid grab the
 * whole selection. That area is empty canvas, so without this check the press
 * would fall through to the background handler and pan the board — while the
 * user's intent, having just arranged and selected the cards, is clearly to
 * move the group.
 *
 * Points genuinely outside the group (but still within the bounding box of a
 * concave arrangement) are correctly rejected, which a plain bounding-box test
 * would not manage.
 */
export function isPointInsideNodeHull(
  point: { x: number; y: number },
  nodes: CanvasNode[]
): boolean {
  if (nodes.length < 3) return false;
  const centres = nodes.map((n) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 }));
  const hull = convexHull(centres);
  if (hull.length < 3) return false;
  return isPointInPolygon(point, hull);
}

/**
 * A ring captured for interactive spacing adjustment.
 */
export interface RingSpacingLayout {
  center: { x: number; y: number };
  radius: number;
  count: number;
  /** Radius below which neighbouring cards would collide. */
  minRadius: number;
  startAngleDeg: number;
  /** Clockwise seating order, frozen for the duration of the interaction. */
  orderedIds: string[];
}

/**
 * Captures the current ring so a slider or a card drag can resize it.
 *
 * Returns null when fewer than three cards are involved or when they do not
 * already sit on a common circle — in that case the caller should fall back to
 * plain card dragging.
 */
export function computeRingSpacingLayout(
  nodes: CanvasNode[],
  tolerance = 0.18
): RingSpacingLayout | null {
  if (nodes.length < 3) return null;

  const ring = computeRingLayout(nodes, tolerance);
  if (!ring) return null;

  const cx = ring.center.x;
  const cy = ring.center.y;
  const centerOf = (n: CanvasNode) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 });

  const ordered = [...nodes].sort((a, b) => {
    const pa = centerOf(a);
    const pb = centerOf(b);
    return Math.atan2(pa.y - cy, pa.x - cx) - Math.atan2(pb.y - cy, pb.x - cx);
  });

  // Match alignNodesInCircle's default so the first resize is a no-op.
  const startAngleDeg =
    (Math.atan2(centerOf(ordered[0]).y - cy, centerOf(ordered[0]).x - cx) * 180) / Math.PI;

  return {
    center: ring.center,
    radius: ring.radius,
    count: ordered.length,
    minRadius: computeMinRingRadius(ordered),
    startAngleDeg,
    orderedIds: ordered.map((n) => n.id),
  };
}

/**
 * Re-flows a ring while one of its cards is dragged, turning the drag into a
 * live radius (and therefore spacing) adjustment.
 *
 * The dragged card follows the pointer; every other card keeps its seat and
 * re-distributes around the centre at the new radius. The centre is pinned to
 * where the ring was when the drag started, so the whole ring does not drift
 * across the canvas.
 */
export function resizeRingSpacing(
  allNodes: CanvasNode[],
  layout: RingSpacingLayout,
  draggedNodeId: string,
  draggedCenter: { x: number; y: number }
): CanvasNode[] {
  const radius = Math.max(
    layout.minRadius,
    Math.hypot(draggedCenter.x - layout.center.x, draggedCenter.y - layout.center.y)
  );

  return alignNodesInCircle(allNodes, new Set(layout.orderedIds), {
    radius,
    startAngleDeg: layout.startAngleDeg,
    orderedIds: layout.orderedIds,
    clampToMinRadius: true,
    // Pin the centre so the ring grows/shrinks in place instead of creeping.
    center: layout.center,
  });
}

/**
 * Arranges the selected cards evenly around a circle — the visual companion of
 * "建立闭环环形连线".
 *
 * Behaviour:
 * 1. The circle is centred on the current bounding-box centre of the
 *    selection, so the ring stays where the user already laid it out.
 * 2. Angular order is preserved from the cards' current positions (the same
 *    clockwise ordering used by connectLoopNodes), so the resulting ring
 *    reads in the order the user expects.
 * 3. Each card is placed by its own centre on the circle, which keeps the ring
 *    balanced even when card sizes differ.
 * 4. The radius never shrinks below the current spread, and never below the
 *    value that would make adjacent cards collide.
 */
export function alignNodesInCircle(
  allNodes: CanvasNode[],
  selectedNodeIds: Set<string> | string[],
  options?: CircleAlignOptions
): CanvasNode[] {
  const selSet = selectedNodeIds instanceof Set ? selectedNodeIds : new Set(selectedNodeIds);
  const selNodes = allNodes.filter((n) => selSet.has(n.id));
  if (selNodes.length < 3) return allNodes;

  const centerOf = (n: CanvasNode) => ({
    x: n.x + n.width / 2,
    y: n.y + n.height / 2,
  });

  // Circle centre = bounding-box centre of the current selection, unless the
  // caller pinned one (interactive resizing does, to stop the ring drifting).
  const minX = Math.min(...selNodes.map((n) => n.x));
  const maxX = Math.max(...selNodes.map((n) => n.x + n.width));
  const minY = Math.min(...selNodes.map((n) => n.y));
  const maxY = Math.max(...selNodes.map((n) => n.y + n.height));
  const cx = options?.center?.x ?? minX + (maxX - minX) / 2;
  const cy = options?.center?.y ?? minY + (maxY - minY) / 2;

  // Clockwise seating order. An explicit order (passed by the interactive
  // spacing controls) wins, so cards keep their seats while the radius
  // changes; otherwise the order is derived from the current angles.
  const ordered = options?.orderedIds
    ? orderByExplicitIds(selNodes, options.orderedIds, centerOf, cx, cy)
    : [...selNodes].sort((a, b) => {
        const pa = centerOf(a);
        const pb = centerOf(b);
        const angleA = Math.atan2(pa.y - cy, pa.x - cx);
        const angleB = Math.atan2(pb.y - cy, pb.x - cx);
        return angleA - angleB;
      });

  const count = ordered.length;
  const minRadius = computeMinRingRadius(ordered);

  // Radius: never collapse inward, never let neighbours overlap
  let radius = options?.radius;
  if (!radius || radius <= 0) {
    const currentSpread = Math.max(
      ...ordered.map((n) => {
        const p = centerOf(n);
        return Math.hypot(p.x - cx, p.y - cy);
      })
    );
    radius = Math.max(currentSpread, minRadius);
  } else if (options?.clampToMinRadius) {
    radius = Math.max(radius, minRadius);
  }

  const startAngle = ((options?.startAngleDeg ?? -90) * Math.PI) / 180;

  const positions = new Map<string, { x: number; y: number }>();
  ordered.forEach((n, i) => {
    const angle = startAngle + (i * 2 * Math.PI) / count;
    positions.set(n.id, {
      x: Math.round(cx + radius * Math.cos(angle) - n.width / 2),
      y: Math.round(cy + radius * Math.sin(angle) - n.height / 2),
    });
  });

  return allNodes.map((n) => {
    const pos = positions.get(n.id);
    return pos ? { ...n, x: pos.x, y: pos.y } : n;
  });
}

/**
 * Options for rectangular (grid) alignment of multiple cards.
 */
export interface GridAlignOptions {
  /** Number of columns. Defaults to ceil(sqrt(N)) — the squarish layout. */
  columns?: number;
  /** Horizontal gutter between cards (default 40). */
  gapX?: number;
  /** Vertical gutter between cards (default 40). */
  gapY?: number;
  /**
   * When set, this card keeps its current coordinates and the whole grid is
   * translated so that it lands exactly where it already is. Used by the
   * drag-to-resize-spacing interaction so the card under the cursor acts as
   * the anchor while every other card re-flows around it.
   */
  anchorNodeId?: string;
}

/**
 * Arranges the selected cards into a neat rectangular grid.
 *
 * Behaviour:
 * 1. Reading order is preserved (top-to-bottom, left-to-right), so cards keep
 *    the sequence the user already established.
 * 2. All cells share one uniform size (the largest card, plus the gutter), so
 *    rows and columns line up perfectly.
 * 3. Each card is centred inside its own cell.
 * 4. The grid stays centred on the selection's original bounding-box centre.
 */
export function alignNodesInGrid(
  allNodes: CanvasNode[],
  selectedNodeIds: Set<string> | string[],
  options?: GridAlignOptions
): CanvasNode[] {
  const selSet = selectedNodeIds instanceof Set ? selectedNodeIds : new Set(selectedNodeIds);
  const selNodes = allNodes.filter((n) => selSet.has(n.id));
  if (selNodes.length < 2) return allNodes;

  const gapX = options?.gapX ?? 40;
  const gapY = options?.gapY ?? 40;

  // Preserve reading order: rows first (with a tolerance), then columns
  const ordered = [...selNodes].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 40) return a.y - b.y;
    return a.x - b.x;
  });

  const count = ordered.length;
  const requestedCols = options?.columns && options.columns > 0 ? Math.floor(options.columns) : 0;
  const cols = Math.max(1, Math.min(count, requestedCols || Math.ceil(Math.sqrt(count))));
  const rows = Math.ceil(count / cols);

  const cellW = Math.max(...ordered.map((n) => n.width)) + gapX;
  const cellH = Math.max(...ordered.map((n) => n.height)) + gapY;

  // Keep the grid centred on the original selection centre
  const minX = Math.min(...selNodes.map((n) => n.x));
  const maxX = Math.max(...selNodes.map((n) => n.x + n.width));
  const minY = Math.min(...selNodes.map((n) => n.y));
  const maxY = Math.max(...selNodes.map((n) => n.y + n.height));
  const cx = minX + (maxX - minX) / 2;
  const cy = minY + (maxY - minY) / 2;

  const gridW = cols * cellW - gapX;
  const gridH = rows * cellH - gapY;
  const startX = cx - gridW / 2;
  const startY = cy - gridH / 2;

  const positions = new Map<string, { x: number; y: number }>();
  ordered.forEach((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.set(n.id, {
      x: Math.round(startX + col * cellW + (cellW - gapX - n.width) / 2),
      y: Math.round(startY + row * cellH + (cellH - gapY - n.height) / 2),
    });
  });

  // Anchor support: pin the referenced card exactly where it already is and
  // shift the whole grid accordingly, so the card under the cursor can drive
  // the layout during a drag without jumping.
  let shiftX = 0;
  let shiftY = 0;
  if (options?.anchorNodeId) {
    const anchor = ordered.find((n) => n.id === options.anchorNodeId);
    const anchorPos = anchor ? positions.get(anchor.id) : undefined;
    if (anchor && anchorPos) {
      shiftX = anchor.x - anchorPos.x;
      shiftY = anchor.y - anchorPos.y;
    }
  }

  return allNodes.map((n) => {
    const pos = positions.get(n.id);
    return pos ? { ...n, x: pos.x + shiftX, y: pos.y + shiftY } : n;
  });
}

/**
 * Detected rectangular-grid layout of a set of cards.
 */
export interface GridLayoutInfo {
  cols: number;
  rows: number;
  gapX: number;
  gapY: number;
  cellW: number;
  cellH: number;
  /** nodeId -> cell coordinates */
  positions: Map<string, { row: number; col: number }>;
  /** Ordered node ids in reading order (row by row). */
  orderedIds: string[];
}

/**
 * Detects whether a set of cards forms a complete rectangular grid.
 *
 * A layout qualifies when:
 * 1. it has at least 2 columns and 2 rows,
 * 2. every card sits on a shared column X and row Y (within `tolerance`),
 * 3. the number of cards exactly fills cols × rows (no holes).
 *
 * Returns null for free-form layouts so callers can fall back to normal
 * behaviour.
 */
export function computeGridLayout(
  nodes: CanvasNode[],
  tolerance = 10
): GridLayoutInfo | null {
  if (nodes.length < 4) return null;

  const clusterValues = (values: number[]): number[] => {
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    const out: number[] = [];
    for (const v of sorted) {
      if (out.length === 0 || v - out[out.length - 1] > tolerance) out.push(v);
    }
    return out;
  };

  const colXs = clusterValues(nodes.map((n) => n.x));
  const rowYs = clusterValues(nodes.map((n) => n.y));
  const cols = colXs.length;
  const rows = rowYs.length;

  if (cols < 2 || rows < 2) return null;
  if (cols * rows !== nodes.length) return null;

  const positions = new Map<string, { row: number; col: number }>();
  for (const n of nodes) {
    const col = colXs.findIndex((x) => Math.abs(x - n.x) <= tolerance);
    const row = rowYs.findIndex((y) => Math.abs(y - n.y) <= tolerance);
    if (col < 0 || row < 0) return null;
    positions.set(n.id, { row, col });
  }
  if (positions.size !== nodes.length) return null;

  const cellW = cols > 1 ? colXs[1] - colXs[0] : 0;
  const cellH = rows > 1 ? rowYs[1] - rowYs[0] : 0;

  const maxW = Math.max(...nodes.map((n) => n.width));
  const maxH = Math.max(...nodes.map((n) => n.height));

  const orderedIds = [...nodes]
    .sort((a, b) => {
      const pa = positions.get(a.id)!;
      const pb = positions.get(b.id)!;
      return pa.row - pb.row || pa.col - pb.col;
    })
    .map((n) => n.id);

  return {
    cols,
    rows,
    gapX: cellW - maxW,
    gapY: cellH - maxH,
    cellW,
    cellH,
    positions,
    orderedIds,
  };
}

/**
 * Re-flows a rectangular grid while the user drags one of its cards, so the
 * drag turns into an interactive spacing adjustment:
 *
 * - the dragged card follows the pointer exactly (it is the anchor),
 * - the horizontal gutter grows with the horizontal drag distance, spread
 *   across the columns,
 * - the vertical gutter grows with the vertical drag distance, spread across
 *   the rows.
 *
 * Returns nodes unchanged when the layout is not a proper grid.
 */
export function resizeGridSpacing(
  allNodes: CanvasNode[],
  layout: GridLayoutInfo,
  draggedNodeId: string,
  deltaX: number,
  deltaY: number,
  baseGapX: number,
  baseGapY: number,
  minGap = 4
): CanvasNode[] {
  const ids = new Set(layout.orderedIds);
  const spreadX = Math.max(1, layout.cols - 1);
  const spreadY = Math.max(1, layout.rows - 1);

  const gapX = Math.max(minGap, baseGapX + deltaX / spreadX);
  const gapY = Math.max(minGap, baseGapY + deltaY / spreadY);

  // The dragged card has already been moved to the pointer position by the
  // caller; passing it as the anchor keeps it exactly there while every other
  // card re-flows around it with the new gutters.
  return alignNodesInGrid(allNodes, ids, {
    columns: layout.cols,
    gapX,
    gapY,
    anchorNodeId: draggedNodeId,
  });
}

/**
 * Keeps grid straight-line metadata in sync with the layout: when the given
 * cards form a rectangular grid, loop edges between them are flagged as
 * orthogonal straight segments; otherwise the flag is cleared.
 */
export function syncGridEdges(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  scopeNodeIds: Set<string> | string[]
): CanvasEdge[] {
  const scope = scopeNodeIds instanceof Set ? scopeNodeIds : new Set(scopeNodeIds);
  const scopedNodes = nodes.filter((n) => scope.has(n.id));
  const scopedIds = new Set(scopedNodes.map((n) => n.id));

  const scopedEdges = edges.filter(
    (e) => scopedIds.has(e.fromNode) && scopedIds.has(e.toNode)
  );
  if (scopedEdges.length === 0) return edges;

  const loopIds = getLoopEdgeIds(scopedEdges);
  if (loopIds.size === 0) return edges;

  const loopNodeIds = new Set<string>();
  for (const e of scopedEdges) {
    if (loopIds.has(e.id)) {
      loopNodeIds.add(e.fromNode);
      loopNodeIds.add(e.toNode);
    }
  }
  const loopNodes = nodes.filter((n) => loopNodeIds.has(n.id));

  const isGrid = computeGridLayout(loopNodes) !== null;

  let changed = false;
  const next = edges.map((e) => {
    if (!loopIds.has(e.id)) return e;
    if (isGrid) {
      if (e.gridPath !== true) {
        changed = true;
        return { ...e, gridPath: true };
      }
      return e;
    }
    if (e.gridPath) {
      changed = true;
      const { gridPath: _g, ...rest } = e;
      return rest as CanvasEdge;
    }
    return e;
  });

  return changed ? next : edges;
}

/**
 * Detects whether a set of nodes is laid out on a common circle.
 * Returns the centre and the mean radius when the deviation across all cards
 * is within `tolerance` (relative), otherwise null.
 */
export function computeRingLayout(
  nodes: CanvasNode[],
  tolerance = 0.18
): { center: { x: number; y: number }; radius: number } | null {
  if (nodes.length < 3) return null;

  const cx = nodes.reduce((sum, n) => sum + (n.x + n.width / 2), 0) / nodes.length;
  const cy = nodes.reduce((sum, n) => sum + (n.y + n.height / 2), 0) / nodes.length;

  const distances = nodes.map((n) => Math.hypot(n.x + n.width / 2 - cx, n.y + n.height / 2 - cy));
  const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
  if (mean < 1) return null;

  const maxDeviation = Math.max(...distances.map((d) => Math.abs(d - mean)));
  if (maxDeviation / mean > tolerance) return null;

  return { center: { x: cx, y: cy }, radius: mean };
}

/**
 * Keeps ring edges in sync with the node layout:
 * - when the given nodes form a circle, every loop edge between them is
 *   stamped with the ring centre/radius so it renders as a true arc;
 * - otherwise any stale ring metadata is cleared so the edge falls back to a
 *   normal bezier/step/straight path.
 *
 * Only edges whose BOTH endpoints are inside `scopeNodeIds` are touched, so
 * unrelated loops elsewhere on the canvas (or a manual ring the user built
 * separately) are left alone.
 */
export function syncRingEdges(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  scopeNodeIds: Set<string> | string[]
): CanvasEdge[] {
  const scope = scopeNodeIds instanceof Set ? scopeNodeIds : new Set(scopeNodeIds);
  const scopedNodes = nodes.filter((n) => scope.has(n.id));

  // Ring detection only considers cards that are themselves part of a cycle,
  // so a plain row of cards is never mistaken for a ring.
  const scopedIds = new Set(scopedNodes.map((n) => n.id));
  const scopedEdges = edges.filter(
    (e) => scopedIds.has(e.fromNode) && scopedIds.has(e.toNode)
  );
  if (scopedEdges.length === 0) return edges;

  const loopIds = getLoopEdgeIds(scopedEdges);
  if (loopIds.size === 0) return edges;

  const loopNodeIds = new Set<string>();
  for (const e of scopedEdges) {
    if (loopIds.has(e.id)) {
      loopNodeIds.add(e.fromNode);
      loopNodeIds.add(e.toNode);
    }
  }
  const loopNodes = nodes.filter((n) => loopNodeIds.has(n.id));

  // A rectangular grid also satisfies the circle test — the four corners of a
  // 2x2 rectangle are exactly equidistant from their centroid — so the grid
  // must take precedence here as well. Otherwise a rectangular loop would be
  // stamped as an arc and stop being a rectangle.
  const isGrid = computeGridLayout(loopNodes) !== null;
  const layout = isGrid ? null : computeRingLayout(loopNodes);

  let changed = false;
  const next = edges.map((e) => {
    if (!loopIds.has(e.id)) return e;
    if (layout) {
      if (
        !e.ringCenter ||
        e.ringCenter.x !== layout.center.x ||
        e.ringCenter.y !== layout.center.y ||
        e.ringRadius !== layout.radius
      ) {
        changed = true;
        return { ...e, ringCenter: layout.center, ringRadius: layout.radius };
      }
      return e;
    }
    if (e.ringCenter || e.ringRadius) {
      changed = true;
      const { ringCenter: _c, ringRadius: _r, ...rest } = e;
      return rest as CanvasEdge;
    }
    return e;
  });

  return changed ? next : edges;
}

/**
 * Re-synchronises the geometric metadata (ring arc / grid straight line) of
 * every loop edge against the current node positions.
 *
 * This is what keeps a closed loop glued to its cards while they are dragged:
 * the ring centre/radius is stored on the edge, so it has to be recomputed
 * whenever the cards move — otherwise the arc keeps pivoting around a stale
 * centre and visibly detaches from the cards.
 *
 * Loops are grouped into independent connected components first, so two
 * unrelated rings on the same canvas never average into each other. Within a
 * component, a rectangular grid takes precedence over a circle (a 2x2
 * rectangle satisfies both tests); failing both, the metadata is cleared so
 * the edge falls back to a plain bezier/step/straight path.
 */
export function syncLoopEdgeGeometry(
  nodes: CanvasNode[],
  edges: CanvasEdge[]
): CanvasEdge[] {
  // Memoised on the edge topology: this runs on every drag frame, where the
  // topology is unchanged and only the coordinates move.
  const loopIds = getLoopEdgeIdsCached(edges);
  if (loopIds.size === 0) return edges;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const loopEdges = edges.filter((e) => loopIds.has(e.id));

  // Union-Find to isolate independent loops
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = parent.get(x) ?? x;
    while (root !== (parent.get(root) ?? root)) {
      root = parent.get(root) ?? root;
    }
    let cur = x;
    while (cur !== root) {
      const next = parent.get(cur) ?? cur;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const e of loopEdges) {
    if (!parent.has(e.fromNode)) parent.set(e.fromNode, e.fromNode);
    if (!parent.has(e.toNode)) parent.set(e.toNode, e.toNode);
    union(e.fromNode, e.toNode);
  }

  const groups = new Map<string, CanvasEdge[]>();
  for (const e of loopEdges) {
    const root = find(e.fromNode);
    const list = groups.get(root) || [];
    list.push(e);
    groups.set(root, list);
  }

  type LoopMeta = { grid: boolean; center?: { x: number; y: number }; radius?: number };
  const meta = new Map<string, LoopMeta>();

  for (const [root, groupEdges] of groups.entries()) {
    const ids = new Set<string>();
    for (const e of groupEdges) {
      ids.add(e.fromNode);
      ids.add(e.toNode);
    }
    const groupNodes = [...ids]
      .map((id) => nodeMap.get(id))
      .filter((n): n is CanvasNode => Boolean(n));

    if (computeGridLayout(groupNodes)) {
      meta.set(root, { grid: true });
      continue;
    }
    const ring = computeRingLayout(groupNodes);
    if (ring) {
      meta.set(root, { grid: false, center: ring.center, radius: ring.radius });
    } else {
      meta.set(root, { grid: false });
    }
  }

  let changed = false;
  const next = edges.map((e) => {
    if (!loopIds.has(e.id)) return e;
    const info = meta.get(find(e.fromNode));
    if (!info) return e;

    if (info.grid) {
      // Straight orthogonal segment, no arc metadata
      if (e.gridPath === true && !e.ringCenter && e.ringRadius === undefined) return e;
      changed = true;
      const { ringCenter: _c, ringRadius: _r, ...rest } = e;
      return { ...rest, gridPath: true } as CanvasEdge;
    }

    if (info.center) {
      // True arc, refreshed against the current card positions
      if (
        e.gridPath === undefined &&
        e.ringCenter?.x === info.center.x &&
        e.ringCenter?.y === info.center.y &&
        e.ringRadius === info.radius
      ) {
        return e;
      }
      changed = true;
      const { gridPath: _g, ...rest } = e;
      return { ...rest, ringCenter: info.center, ringRadius: info.radius } as CanvasEdge;
    }

    // Plain curve
    if (e.gridPath === undefined && !e.ringCenter && e.ringRadius === undefined) return e;
    changed = true;
    const { gridPath: _g, ringCenter: _c, ringRadius: _r, ...rest } = e;
    return rest as CanvasEdge;
  });

  return changed ? next : edges;
}

/**
 * Aligns or distributes selected nodes along the specified direction
 */
export function alignNodes(
  allNodes: CanvasNode[],
  selectedNodeIds: Set<string> | string[],
  direction: CanvasAlignDirection
): CanvasNode[] {
  const selSet = selectedNodeIds instanceof Set ? selectedNodeIds : new Set(selectedNodeIds);
  const selNodes = allNodes.filter((n) => selSet.has(n.id));
  if (selNodes.length < 2) return allNodes;

  // Ring layout needs at least 3 cards to form a meaningful circle
  if (direction === "circle") {
    return alignNodesInCircle(allNodes, selSet);
  }

  if (direction === "grid") {
    return alignNodesInGrid(allNodes, selSet);
  }

  if (direction === "horizontal" || direction === "middle") {
    const minY = Math.min(...selNodes.map((n) => n.y));
    const maxY = Math.max(...selNodes.map((n) => n.y + n.height));
    const centerY = minY + (maxY - minY) / 2;
    return allNodes.map((n) =>
      selSet.has(n.id) ? { ...n, y: Math.round(centerY - n.height / 2) } : n
    );
  }

  if (direction === "vertical" || direction === "center") {
    const minX = Math.min(...selNodes.map((n) => n.x));
    const maxX = Math.max(...selNodes.map((n) => n.x + n.width));
    const centerX = minX + (maxX - minX) / 2;
    return allNodes.map((n) =>
      selSet.has(n.id) ? { ...n, x: Math.round(centerX - n.width / 2) } : n
    );
  }

  if (direction === "left") {
    const minX = Math.min(...selNodes.map((n) => n.x));
    return allNodes.map((n) =>
      selSet.has(n.id) ? { ...n, x: minX } : n
    );
  }

  if (direction === "right") {
    const maxX = Math.max(...selNodes.map((n) => n.x + n.width));
    return allNodes.map((n) =>
      selSet.has(n.id) ? { ...n, x: maxX - n.width } : n
    );
  }

  if (direction === "top") {
    const minY = Math.min(...selNodes.map((n) => n.y));
    return allNodes.map((n) =>
      selSet.has(n.id) ? { ...n, y: minY } : n
    );
  }

  if (direction === "bottom") {
    const maxY = Math.max(...selNodes.map((n) => n.y + n.height));
    return allNodes.map((n) =>
      selSet.has(n.id) ? { ...n, y: maxY - n.height } : n
    );
  }

  if (direction === "distribute-h") {
    if (selNodes.length < 3) return allNodes;
    const sorted = [...selNodes].sort((a, b) => a.x - b.x);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalCardsWidth = sorted.reduce((sum, n) => sum + n.width, 0);
    const totalSpan = last.x + last.width - first.x;
    const availableGap = totalSpan - totalCardsWidth;
    const gap = Math.max(20, Math.round(availableGap / (sorted.length - 1)));

    const newXMap = new Map<string, number>();
    let curX = first.x;
    for (let i = 0; i < sorted.length; i++) {
      newXMap.set(sorted[i].id, curX);
      curX += sorted[i].width + gap;
    }

    return allNodes.map((n) =>
      newXMap.has(n.id) ? { ...n, x: newXMap.get(n.id)! } : n
    );
  }

  if (direction === "distribute-v") {
    if (selNodes.length < 3) return allNodes;
    const sorted = [...selNodes].sort((a, b) => a.y - b.y);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalCardsHeight = sorted.reduce((sum, n) => sum + n.height, 0);
    const totalSpan = last.y + last.height - first.y;
    const availableGap = totalSpan - totalCardsHeight;
    const gap = Math.max(20, Math.round(availableGap / (sorted.length - 1)));

    const newYMap = new Map<string, number>();
    let curY = first.y;
    for (let i = 0; i < sorted.length; i++) {
      newYMap.set(sorted[i].id, curY);
      curY += sorted[i].height + gap;
    }

    return allNodes.map((n) =>
      newYMap.has(n.id) ? { ...n, y: newYMap.get(n.id)! } : n
    );
  }

  return allNodes;
}

