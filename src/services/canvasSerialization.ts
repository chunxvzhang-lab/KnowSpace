/**
 * JSON Canvas 1.0 serialization: parsing, writing and the default board.
 *
 * Extracted from canvasService during the R2 split — see
 * the R2 canvas split. Code is byte-identical to the original.
 */

import type {
  CanvasData,
  CanvasEdge,
  CanvasNode,
  CanvasNodeSide,
  CanvasTextNode,
  CanvasGroupNode,
} from "../types/canvasTypes";

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

function isNodeSide(val: unknown): val is CanvasNodeSide {
  return val === "top" || val === "right" || val === "bottom" || val === "left";
}
