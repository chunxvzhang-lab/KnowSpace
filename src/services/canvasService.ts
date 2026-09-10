import type {
  CanvasData,
  CanvasNode,
  CanvasEdge,
  CanvasNodeSide,
  CanvasEdgeLineStyle,
  CanvasTextNode,
  CanvasGroupNode,
} from "../types/canvasTypes";

export const CANVAS_COLOR_PALETTES: Record<string, { label: string; stroke: string; bg: string }> = {
  "1": { label: "珊瑚红", stroke: "#ef4444", bg: "rgba(239, 68, 68, 0.12)" },
  "2": { label: "活力橙", stroke: "#f97316", bg: "rgba(249, 115, 22, 0.12)" },
  "3": { label: "琥珀黄", stroke: "#eab308", bg: "rgba(234, 179, 8, 0.12)" },
  "4": { label: "翡翠绿", stroke: "#10b981", bg: "rgba(16, 185, 129, 0.12)" },
  "5": { label: "天青蓝", stroke: "#06b6d4", bg: "rgba(6, 182, 212, 0.12)" },
  "6": { label: "罗兰紫", stroke: "#a855f7", bg: "rgba(168, 85, 247, 0.12)" },
};

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
 * Generates an SVG path for connecting edges with refined curvature and orthogonal routing
 */
export function computeEdgePath(
  p1: { x: number; y: number },
  side1: CanvasNodeSide = "right",
  p2: { x: number; y: number },
  side2: CanvasNodeSide = "left",
  style: CanvasEdgeLineStyle = "bezier",
  stepOffset?: number
): string {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  if (style === "straight") {
    return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
  }

  if (style === "step") {
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
  stepOffset?: number
): { x: number; y: number } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  if (style === "straight") {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }

  if (style === "step") {
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
 * Determines the consistent edge color for a given source node.
 * Rules:
 * 1. If the node has an explicit color assigned (node.color), use it.
 * 2. If the node already has existing outgoing edges, reuse that edge's color
 *    so all lines from the same card / anchor stay strictly identical in color.
 * 3. If it is a new source node, automatically assign the next palette color
 *    based on the number of distinct source nodes already connected, so different
 *    cards in the same container/canvas are clearly distinguished.
 */
export function getSourceNodeEdgeColor(
  source: CanvasNode | string,
  existingEdges: CanvasEdge[],
  allNodes?: CanvasNode[]
): string {
  const sourceId = typeof source === "string" ? source : source.id;
  const sourceNode =
    typeof source !== "string"
      ? source
      : allNodes?.find((n) => n.id === sourceId);
  const explicitColor = sourceNode?.color;
  const paletteKeys = Object.keys(CANVAS_COLOR_PALETTES);

  // 1. Maintain identical color for all outgoing edges from the same card
  const existingEdge = existingEdges.find(
    (e) => e.fromNode === sourceId && e.color && CANVAS_COLOR_PALETTES[e.color]
  );
  if (existingEdge && existingEdge.color) {
    return existingEdge.color;
  }

  // Collect all colors already used by other source cards across the entire canvas
  const usedAllSourceColors = new Set<string>();
  for (const edge of existingEdges) {
    if (edge.fromNode && edge.fromNode !== sourceId && edge.color && CANVAS_COLOR_PALETTES[edge.color]) {
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
          (e) => e.fromNode === sib.id && e.color && CANVAS_COLOR_PALETTES[e.color]
        );
        for (const edge of outgoingEdges) {
          if (edge.color) usedSiblingColors.add(edge.color);
        }
      }

      // If card has an explicit color and it does not collide with siblings or active sources, respect it
      if (
        explicitColor &&
        CANVAS_COLOR_PALETTES[explicitColor] &&
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
    CANVAS_COLOR_PALETTES[explicitColor] &&
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
  allNodes?: CanvasNode[]
): string {
  return getSourceNodeEdgeColor(sourceNodeId, existingEdges, allNodes);
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

  const sourceIds = new Set<string>();
  for (const edge of edges) {
    if (edge.fromNode && nodeMap.has(edge.fromNode)) {
      sourceIds.add(edge.fromNode);
    }
  }

  const containerSourceMap = new Map<string, string[]>();
  const rootSources: string[] = [];

  for (const sourceId of sourceIds) {
    const node = nodeMap.get(sourceId);
    if (!node) continue;
    const container = findContainerForNode(node, nodes);
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
      const sNode = nodeMap.get(sId);
      const existingColor = edges.find(
        (e) => e.fromNode === sId && e.color && CANVAS_COLOR_PALETTES[e.color]
      )?.color;
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
    const sNode = nodeMap.get(sId);
    const existingColor = edges.find(
      (e) => e.fromNode === sId && e.color && CANVAS_COLOR_PALETTES[e.color]
    )?.color;
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
  const color = getSourceNodeEdgeColor(fromNode, existingEdges, allNodes);

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
 * Collects the palette colors already claimed by edges that form a closed
 * loop. This lets newly created rings pick a color that no other ring on the
 * canvas is currently using, so that multiple loops stay visually distinct.
 * Edges that are NOT part of a cycle (chains, one-to-many stars) are ignored
 * so they remain free to use any palette color.
 */
export function getLoopEdgeColors(edges: CanvasEdge[]): Set<string> {
  const colors = new Set<string>();
  if (!edges || edges.length === 0) return colors;

  const outgoing = new Map<string, CanvasEdge[]>();
  for (const e of edges) {
    const list = outgoing.get(e.fromNode);
    if (list) list.push(e);
    else outgoing.set(e.fromNode, [e]);
  }

  for (const e of edges) {
    if (!e.color) continue;
    if (isEdgeOnCycle(e, outgoing)) {
      colors.add(e.color);
    }
  }

  return colors;
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
  direction: "right" | "bottom" = "right"
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

    const newEdge = createEdgeBetweenNodes(sourceNode, newNode);

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
  const isDark =
    options?.theme === "twitter" ||
    options?.theme === "dark" ||
    (options?.theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

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
      : isDark
      ? "#0f172a"
      : "#f8fafc";

  const cardBg = isDark ? "#1e293b" : "#ffffff";
  const cardText = isDark ? "#f1f5f9" : "#0f172a";
  const cardBorder = isDark ? "#334155" : "#e2e8f0";
  const defaultEdgeColor = isDark ? "#38bdf8" : "#0284c7";
  const dotColor = isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)";

  const nodeMap = new Map<string, CanvasNode>(data.nodes.map((n) => [n.id, n]));

  // Build a source-aware color map so SVG export is byte-identical to the
  // on-screen renderer (which reconciles color collisions inside containers
  // and across the canvas via the same logic).
  const sourceDisplayColorMap = computeSourceDisplayColorMap(data.nodes, data.edges);
  // Pre-collect any hex colors that actually appear on edges so we register
  // matching arrow markers up-front in <defs>.
  const exportHexColors = new Set<string>();
  for (const edge of data.edges) {
    const effectiveColorKey = sourceDisplayColorMap.get(edge.fromNode) || edge.color;
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

  // Background Rect
  if (bgColor !== "none") {
    lines.push(`  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${bgColor}" />`);
    lines.push(`  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#canvas-dots)" />`);
  }

  // 1. Group Containers Layer
  data.nodes
    .filter((n): n is CanvasGroupNode => n.type === "group")
    .forEach((g) => {
      const pal = g.color && CANVAS_COLOR_PALETTES[g.color] ? CANVAS_COLOR_PALETTES[g.color] : CANVAS_COLOR_PALETTES["5"];
      lines.push(`  <g class="canvas-group" data-id="${g.id}">`);
      lines.push(
        `    <rect x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" rx="16" fill="${pal.bg}" stroke="${pal.stroke}" stroke-width="2" stroke-dasharray="6,6" />`
      );
      // Group title header
      lines.push(
        `    <path d="M ${g.x} ${g.y + 32} L ${g.x} ${g.y + 14} Q ${g.x} ${g.y} ${g.x + 14} ${g.y} L ${g.x + g.width - 14} ${g.y} Q ${g.x + g.width} ${g.y} ${g.x + g.width} ${g.y + 14} L ${g.x + g.width} ${g.y + 32} Z" fill="${pal.stroke}" />`
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
    const pathD = computeEdgePath(p1, fromSide, p2, toSide, edge.style);

    // Mirror the on-screen renderer's color resolution: prefer the
    // source-aware display color, then fall back to the edge's stored color.
    const effectiveColorKey = sourceDisplayColorMap.get(edge.fromNode) || edge.color;
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
      lines.push(
        `    <circle cx="${p1.x}" cy="${p1.y}" r="3.5" fill="${edgeColor}" stroke="${isDark ? "#0f172a" : "#ffffff"}" stroke-width="1.2" />`
      );
    }

    // 3. Edge Label Badges
    if (edge.label && edge.label.trim()) {
      const rawMid = computeEdgeMidpoint(p1, fromSide, p2, toSide, edge.style);
      const labelText = escapeSvgXml(edge.label.trim());
      const shape = edge.labelShape || "pill";
      const charWidth = 11.5;
      const labelWidth = Math.max(54, edge.label.length * charWidth + 18);
      const labelHeight = 24;
      const labelX = rawMid.x - labelWidth / 2;
      const labelY = rawMid.y - labelHeight / 2;
      const labelBg = isDark ? "#1e293b" : "#ffffff";

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
        `      <text x="0" y="0" fill="${cardText}" font-family="system-ui, sans-serif" font-size="11.5" font-weight="600" text-anchor="middle" dominant-baseline="central">${labelText}</text>`
      );
      lines.push(`    </g>`);
    }
    lines.push(`  </g>`);
  });

  // 4. Cards Layer
  data.nodes
    .filter((n) => n.type !== "group")
    .forEach((card) => {
      const pal = card.color && CANVAS_COLOR_PALETTES[card.color] ? CANVAS_COLOR_PALETTES[card.color] : CANVAS_COLOR_PALETTES["5"];
      const headerColor = pal.stroke;

      lines.push(`  <g class="canvas-card" data-id="${card.id}" filter="url(#card-shadow)">`);
      // Card Body Rect
      lines.push(
        `    <rect x="${card.x}" y="${card.y}" width="${card.width}" height="${card.height}" rx="12" fill="${cardBg}" stroke="${cardBorder}" stroke-width="1.2" />`
      );
      // Card Header Banner
      lines.push(
        `    <path d="M ${card.x} ${card.y + 26} L ${card.x} ${card.y + 12} Q ${card.x} ${card.y} ${card.x + 12} ${card.y} L ${card.x + card.width - 12} ${card.y} Q ${card.x + card.width} ${card.y} ${card.x + card.width} ${card.y + 12} L ${card.x + card.width} ${card.y + 26} Z" fill="${headerColor}" />`
      );

      // Card Header Icon & Title
      let cardTitle = "文本卡片";
      if (card.type === "file") cardTitle = card.file.replace(/\.(md|markdown)$/i, "");
      else if (card.type === "link") cardTitle = "网页超链";
      lines.push(
        `    <text x="${card.x + 10}" y="${card.y + 15}" fill="#ffffff" font-family="system-ui, sans-serif" font-size="11" font-weight="600" dominant-baseline="central">${escapeSvgXml(cardTitle)}</text>`
      );

      // Card Body Content Lines
      if (card.type === "text") {
        const rawLines = card.text.split("\n");
        let curY = card.y + 44;
        const maxY = card.y + card.height - 12;

        for (const rawLine of rawLines) {
          if (curY > maxY) break;
          const trimmed = rawLine.trim();
          if (!trimmed) {
            curY += 8;
            continue;
          }

          let displayLine = trimmed;
          let isHeader = false;
          if (trimmed.startsWith("### ")) {
            displayLine = trimmed.slice(4);
            isHeader = true;
          } else if (trimmed.startsWith("## ")) {
            displayLine = trimmed.slice(3);
            isHeader = true;
          } else if (trimmed.startsWith("# ")) {
            displayLine = trimmed.slice(2);
            isHeader = true;
          } else if (trimmed.startsWith("- [x] ")) {
            displayLine = "☑ " + trimmed.slice(6);
          } else if (trimmed.startsWith("- [ ] ")) {
            displayLine = "☐ " + trimmed.slice(6);
          } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
            displayLine = "• " + trimmed.slice(2);
          }

          // Truncate long lines to fit card width
          const maxChars = Math.floor((card.width - 24) / 8);
          if (displayLine.length > maxChars) {
            displayLine = displayLine.slice(0, maxChars - 1) + "…";
          }

          lines.push(
            `    <text x="${card.x + 12}" y="${curY}" fill="${isHeader ? headerColor : cardText}" font-family="system-ui, sans-serif" font-size="${isHeader ? "13" : "11.5"}" font-weight="${isHeader ? "bold" : "normal"}">${escapeSvgXml(displayLine)}</text>`
          );
          curY += isHeader ? 20 : 16;
        }
      } else if (card.type === "file") {
        lines.push(
          `    <text x="${card.x + 12}" y="${card.y + 50}" fill="${cardText}" font-family="system-ui, sans-serif" font-size="12" font-weight="600">📄 ${escapeSvgXml(card.file)}</text>`
        );
      } else if (card.type === "link") {
        lines.push(
          `    <text x="${card.x + 12}" y="${card.y + 50}" fill="${defaultEdgeColor}" font-family="system-ui, sans-serif" font-size="11.5" text-decoration="underline">🔗 ${escapeSvgXml(card.url)}</text>`
        );
      }

      lines.push(`  </g>`);
    });

  lines.push(`</svg>`);
  return lines.join("\n");
}

/**
 * Rasterizes canvas SVG into a high-DPI PNG image Data URL
 */
export async function exportCanvasToPng(
  data: CanvasData,
  options?: CanvasExportOptions
): Promise<string> {
  const svgString = exportCanvasToSvg(data, options);
  const bbox = computeBoundingBox(data.nodes);
  const pad = options?.padding ?? 48;
  const totalWidth = Math.max(800, Math.ceil(bbox.width + pad * 2));
  const totalHeight = Math.max(600, Math.ceil(bbox.height + pad * 2));
  const scale = options?.scale ?? 2;

  return new Promise<string>((resolve, reject) => {
    const testCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    const hasCanvas2d = Boolean(testCanvas && testCanvas.getContext && testCanvas.getContext("2d"));

    if (typeof Image === "undefined" || typeof document === "undefined" || !hasCanvas2d) {
      const base64 = typeof Buffer !== "undefined" ? Buffer.from(svgString).toString("base64") : btoa(svgString);
      resolve(`data:image/svg+xml;base64,${base64}`);
      return;
    }

    const img = new Image();
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error("白板图片导出栅格化超时"));
    }, 8000);

    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(totalWidth * scale);
        canvas.height = Math.round(totalHeight * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("无法创建 Canvas 2D 上下文");

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/png"));
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    img.onerror = (err) => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      reject(err);
    };

    img.src = url;
  });
}

/**
 * Triggers download of canvas as PNG or SVG file
 */
export async function downloadCanvasAsImage(
  data: CanvasData,
  filename: string,
  format: "png" | "svg" = "png",
  options?: CanvasExportOptions
): Promise<void> {
  const cleanName = filename.replace(/\.(png|svg|canvas)$/i, "");

  if (format === "svg") {
    const svgContent = exportCanvasToSvg(data, options);
    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cleanName}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  // PNG Export
  const pngDataUrl = await exportCanvasToPng(data, options);
  if (typeof window !== "undefined" && window.knowSpaceDesktop?.savePngData) {
    await window.knowSpaceDesktop.savePngData({
      dataUrl: pngDataUrl,
      filename: `${cleanName}.png`,
    });
    return;
  }

  const a = document.createElement("a");
  a.href = pngDataUrl;
  a.download = `${cleanName}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Copies the canvas PNG image directly to system clipboard
 */
export async function copyCanvasImageToClipboard(
  data: CanvasData,
  options?: CanvasExportOptions
): Promise<boolean> {
  try {
    const pngDataUrl = await exportCanvasToPng(data, options);
    const res = await fetch(pngDataUrl);
    const blob = await res.blob();
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return true;
    }
    return false;
  } catch (err) {
    console.error("复制白板图片至剪贴板失败:", err);
    return false;
  }
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
  | "distribute-v"; // 垂直等距分布

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

