import { describe, it, expect, vi } from "vitest";
import {
  parseCanvasData,
  serializeCanvasData,
  createDefaultCanvas,
  computeBoundingBox,
  getNodeAnchorPoint,
  computeEdgePath,
  extractCanvasToMarkdown,
  getOptimalAnchorSides,
  getNextEdgeColorForSource,
  exportCanvasToSvg,
  exportCanvasToPng,
  downloadCanvasAsImage,
  copyCanvasImageToClipboard,
  reverseEdgeDirection,
  connectOneToMany,
  connectChainNodes,
  connectLoopNodes,
  disconnectNodeEdges,
  spawnMultipleBranches,
  cycleEdgeStrokePattern,
  getStepBendHandleInfo,
  computeBezierControlPoints,
  computeEdgeMidpoint,
} from "../services/canvasService";
import type { CanvasData, CanvasTextNode, CanvasFileNode, CanvasGroupNode } from "../types/canvasTypes";

describe("canvasService - JSON Canvas 1.0 Specification", () => {
  it("parses empty or invalid input safely", () => {
    expect(parseCanvasData("")).toEqual({ nodes: [], edges: [] });
    expect(parseCanvasData("invalid json")).toEqual({ nodes: [], edges: [] });
    expect(parseCanvasData("{}")).toEqual({ nodes: [], edges: [] });
  });

  it("parses standard text, file, link, and group nodes", () => {
    const json = JSON.stringify({
      nodes: [
        { id: "text-1", type: "text", text: "Hello Canvas", x: 10, y: 20, width: 250, height: 150, color: "1" },
        { id: "file-1", type: "file", file: "01-架构设计.md", x: 300, y: 50, width: 320, height: 240, color: "4" },
        { id: "link-1", type: "link", url: "https://knowspace.dev", x: 700, y: 100, width: 200, height: 100 },
        { id: "group-1", type: "group", label: "核心系统", x: 0, y: 0, width: 900, height: 500, color: "5" },
      ],
      edges: [
        { id: "edge-1", fromNode: "text-1", fromSide: "right", toNode: "file-1", toSide: "left", label: "引用" },
      ],
    });

    const parsed = parseCanvasData(json);
    expect(parsed.nodes).toHaveLength(4);
    expect(parsed.nodes[0].type).toBe("text");
    expect((parsed.nodes[0] as CanvasTextNode).text).toBe("Hello Canvas");
    expect((parsed.nodes[1] as CanvasFileNode).file).toBe("01-架构设计.md");
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.edges[0].label).toBe("引用");
    expect(parsed.edges[0].toSide).toBe("left");
  });

  it("filters edges referencing non-existent nodes", () => {
    const json = JSON.stringify({
      nodes: [{ id: "n1", type: "text", text: "Only Node", x: 0, y: 0, width: 100, height: 100 }],
      edges: [{ id: "e1", fromNode: "n1", toNode: "ghost-node" }],
    });
    const parsed = parseCanvasData(json);
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.edges).toHaveLength(0);
  });

  it("serializes CanvasData into formatted JSON Canvas", () => {
    const data: CanvasData = {
      nodes: [{ id: "t1", type: "text", text: "Test", x: 50, y: 50, width: 200, height: 100 }],
      edges: [],
    };
    const json = serializeCanvasData(data);
    expect(json).toContain('"type": "text"');
    expect(json).toContain('"text": "Test"');
  });

  it("generates default initial canvas template", () => {
    const defaultCanvas = createDefaultCanvas("我的空间");
    expect(defaultCanvas.nodes.length).toBeGreaterThanOrEqual(2);
    expect(defaultCanvas.edges.length).toBeGreaterThanOrEqual(1);
    expect(defaultCanvas.nodes.some((n) => n.type === "group")).toBe(true);
    expect(defaultCanvas.nodes.some((n) => n.type === "text")).toBe(true);
  });

  it("calculates bounding box accurately", () => {
    const nodes: CanvasTextNode[] = [
      { id: "1", type: "text", text: "A", x: 100, y: 50, width: 200, height: 100 },
      { id: "2", type: "text", text: "B", x: 500, y: 300, width: 150, height: 80 },
    ];
    const bbox = computeBoundingBox(nodes);
    expect(bbox.minX).toBe(100);
    expect(bbox.minY).toBe(50);
    expect(bbox.maxX).toBe(650);
    expect(bbox.maxY).toBe(380);
    expect(bbox.width).toBe(550);
    expect(bbox.height).toBe(330);
  });

  it("computes anchor points and SVG edge paths", () => {
    const node: CanvasTextNode = { id: "1", type: "text", text: "A", x: 100, y: 100, width: 200, height: 100 };
    const rightAnchor = getNodeAnchorPoint(node, "right");
    expect(rightAnchor).toEqual({ x: 300, y: 150 });

    const topAnchor = getNodeAnchorPoint(node, "top");
    expect(topAnchor).toEqual({ x: 200, y: 100 });

    const bezierPath = computeEdgePath({ x: 100, y: 100 }, "right", { x: 300, y: 200 }, "left", "bezier");
    expect(bezierPath).toMatch(/^M 100 100 C/);

    const stepPath = computeEdgePath({ x: 100, y: 100 }, "right", { x: 300, y: 200 }, "left", "step");
    expect(stepPath).toMatch(/^M 100 100 L/);

    const straightPath = computeEdgePath({ x: 100, y: 100 }, "right", { x: 300, y: 200 }, "left", "straight");
    expect(straightPath).toBe("M 100 100 L 300 200");
  });

  it("extracts canvas topological structure to markdown article", () => {
    const group: CanvasGroupNode = {
      id: "g1",
      type: "group",
      label: "微服务架构",
      x: 50,
      y: 50,
      width: 600,
      height: 400,
    };
    const t1: CanvasTextNode = {
      id: "t1",
      type: "text",
      text: "### 网关服务\n负责流量接入与鉴权",
      x: 80,
      y: 100,
      width: 200,
      height: 100,
    };
    const f1: CanvasFileNode = {
      id: "f1",
      type: "file",
      file: "用户中心.md",
      x: 350,
      y: 100,
      width: 250,
      height: 150,
    };

    const data: CanvasData = {
      nodes: [group, t1, f1],
      edges: [
        { id: "e1", fromNode: "t1", fromSide: "right", toNode: "f1", toSide: "left", label: "转发请求" },
      ],
    };

    const article = extractCanvasToMarkdown(data, "架构演化设计方案");
    expect(article).toContain("# 架构演化设计方案");
    expect(article).toContain("## 🏛️ 微服务架构");
    expect(article).toContain("网关服务");
    expect(article).toContain("[[用户中心]]");
    expect(article).toContain("转发请求");
  });

  it("calculates optimal anchor sides based on relative position", () => {
    const nodeA: CanvasTextNode = { id: "a", type: "text", text: "A", x: 0, y: 100, width: 100, height: 100 };
    const nodeB: CanvasTextNode = { id: "b", type: "text", text: "B", x: 300, y: 100, width: 100, height: 100 };
    // Node B is to the right of Node A -> A: right, B: left
    expect(getOptimalAnchorSides(nodeA, nodeB)).toEqual({ fromSide: "right", toSide: "left" });
    // Reverse -> B: left, A: right
    expect(getOptimalAnchorSides(nodeB, nodeA)).toEqual({ fromSide: "left", toSide: "right" });

    const nodeC: CanvasTextNode = { id: "c", type: "text", text: "C", x: 100, y: 0, width: 100, height: 100 };
    const nodeD: CanvasTextNode = { id: "d", type: "text", text: "D", x: 100, y: 400, width: 100, height: 100 };
    // Node D is below Node C -> C: bottom, D: top
    expect(getOptimalAnchorSides(nodeC, nodeD)).toEqual({ fromSide: "bottom", toSide: "top" });
    // Reverse -> D: top, C: bottom
    expect(getOptimalAnchorSides(nodeD, nodeC)).toEqual({ fromSide: "top", toSide: "bottom" });
  });

  it("exports canvas to standalone SVG with nodes, edges, and centered labels", () => {
    const data: CanvasData = {
      nodes: [
        { id: "grp-1", type: "group", label: "核心域", x: 50, y: 50, width: 400, height: 300, color: "5" },
        { id: "card-1", type: "text", text: "### 系统模型\n- [x] 模块完成\n- [ ] 待定", x: 80, y: 90, width: 200, height: 120, color: "2" },
        { id: "file-1", type: "file", file: "设计图.md", x: 350, y: 90, width: 180, height: 100, color: "3" },
        { id: "link-1", type: "link", url: "https://example.com", x: 350, y: 220, width: 180, height: 80 },
      ],
      edges: [
        { id: "edge-1", fromNode: "card-1", toNode: "file-1", label: "推导演化", labelShape: "pill", toEnd: "arrow" },
        { id: "edge-2", fromNode: "card-1", toNode: "link-1", label: "参考链接", labelShape: "diamond" },
      ],
    };

    const svg = exportCanvasToSvg(data, { theme: "light", background: "white" });
    expect(svg).toMatch(/^<\?xml version="1\.0"/);
    expect(svg).toContain("<svg xmlns=\"http://www.w3.org/2000/svg\"");
    // Contains group container
    expect(svg).toContain("📁 核心域");
    // Contains cards
    expect(svg).toContain("系统模型");
    expect(svg).toContain("☑ 模块完成");
    expect(svg).toContain("☐ 待定");
    expect(svg).toContain("📄 设计图.md");
    expect(svg).toContain("🔗 https://example.com");
    // Contains centered edge labels with transform translate
    expect(svg).toContain("推导演化");
    expect(svg).toContain("参考链接");
    expect(svg).toContain("class=\"canvas-edge-label\"");
    // Diamond label shape uses polygon
    expect(svg).toContain("<polygon points=");

    // Test dark theme & transparent background
    const darkSvg = exportCanvasToSvg(data, { theme: "dark", background: "transparent" });
    expect(darkSvg).not.toContain("url(#canvas-dots)");
  });

  it("exports canvas to PNG data url or svg fallback safely", async () => {
    const data: CanvasData = {
      nodes: [
        { id: "1", type: "text", text: "PNG Test", x: 0, y: 0, width: 200, height: 100 },
      ],
      edges: [],
    };

    const pngOrSvg = await exportCanvasToPng(data);
    expect(pngOrSvg).toMatch(/^data:image\//);
  });

  it("handles image download and clipboard copy functions gracefully", async () => {
    const data: CanvasData = {
      nodes: [
        { id: "1", type: "text", text: "Download Test", x: 0, y: 0, width: 200, height: 100 },
      ],
      edges: [],
    };

    // Spy on anchor click to prevent jsdom navigation warning
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    // SVG download via DOM
    await downloadCanvasAsImage(data, "test-canvas", "svg");
    expect(clickSpy).toHaveBeenCalled();

    // PNG download via desktop knowSpaceDesktop bridge
    const savePngMock = vi.fn().mockResolvedValue(true);
    (window as any).knowSpaceDesktop = { savePngData: savePngMock };
    await downloadCanvasAsImage(data, "test-canvas", "png");
    expect(savePngMock).toHaveBeenCalled();

    clickSpy.mockRestore();
    delete (window as any).knowSpaceDesktop;

    // Clipboard copy
    const copied = await copyCanvasImageToClipboard(data);
    expect(typeof copied).toBe("boolean");
  });

  it("reverses edge direction properly for single-arrow, bidirectional, and undirected lines", () => {
    // 1. Standard single arrow from A to B -> reverses to B to A with arrow at A
    const edge1 = {
      id: "e1",
      fromNode: "nodeA",
      fromSide: "right" as const,
      toNode: "nodeB",
      toSide: "left" as const,
      fromEnd: "none" as const,
      toEnd: "arrow" as const,
    };
    const rev1 = reverseEdgeDirection(edge1);
    expect(rev1.fromNode).toBe("nodeB");
    expect(rev1.fromSide).toBe("left");
    expect(rev1.toNode).toBe("nodeA");
    expect(rev1.toSide).toBe("right");
    expect(rev1.fromEnd).toBe("none");
    expect(rev1.toEnd).toBe("arrow");

    // 2. Bidirectional arrow
    const edge2 = {
      id: "e2",
      fromNode: "nodeA",
      toNode: "nodeB",
      fromEnd: "arrow" as const,
      toEnd: "arrow" as const,
    };
    const rev2 = reverseEdgeDirection(edge2);
    expect(rev2.fromNode).toBe("nodeB");
    expect(rev2.toNode).toBe("nodeA");
    expect(rev2.fromEnd).toBe("arrow");
    expect(rev2.toEnd).toBe("arrow");

    // 3. Backwards arrow (fromEnd arrow, toEnd none) -> reverses so target has arrow
    const edge3 = {
      id: "e3",
      fromNode: "nodeA",
      toNode: "nodeB",
      fromEnd: "arrow" as const,
      toEnd: "none" as const,
    };
    const rev3 = reverseEdgeDirection(edge3);
    expect(rev3.fromNode).toBe("nodeB");
    expect(rev3.toNode).toBe("nodeA");
    expect(rev3.fromEnd).toBe("none");
    expect(rev3.toEnd).toBe("arrow");

    // 4. Undirected line (both none) -> stays undirected
    const edge4 = {
      id: "e4",
      fromNode: "nodeA",
      toNode: "nodeB",
      fromEnd: "none" as const,
      toEnd: "none" as const,
    };
    const rev4 = reverseEdgeDirection(edge4);
    expect(rev4.fromNode).toBe("nodeB");
    expect(rev4.toNode).toBe("nodeA");
    expect(rev4.fromEnd).toBe("none");
    expect(rev4.toEnd).toBe("none");
  });

  it("connects one root node to multiple target nodes (1-to-Many / Star)", () => {
    const rootNode: CanvasTextNode = {
      id: "root-1",
      type: "text",
      text: "# 核心假说",
      x: 100,
      y: 200,
      width: 260,
      height: 140,
    };
    const target1: CanvasTextNode = {
      id: "child-1",
      type: "text",
      text: "子观点 1",
      x: 450,
      y: 100,
      width: 260,
      height: 140,
    };
    const target2: CanvasTextNode = {
      id: "child-2",
      type: "text",
      text: "子观点 2",
      x: 450,
      y: 300,
      width: 260,
      height: 140,
    };
    const target3: CanvasTextNode = {
      id: "child-3",
      type: "text",
      text: "子观点 3",
      x: 450,
      y: 500,
      width: 260,
      height: 140,
    };

    const edges = connectOneToMany(rootNode, [rootNode, target1, target2, target3], []);
    // Should skip self (rootNode) and create exactly 3 edges
    expect(edges).toHaveLength(3);
    expect(edges[0].fromNode).toBe("root-1");
    expect(edges[0].toNode).toBe("child-1");
    expect(edges[1].fromNode).toBe("root-1");
    expect(edges[1].toNode).toBe("child-2");
    expect(edges[2].fromNode).toBe("root-1");
    expect(edges[2].toNode).toBe("child-3");

    // Calling again with existing edges should not create duplicates
    const edgesDup = connectOneToMany(rootNode, [target1, target2, target3], edges);
    expect(edgesDup).toHaveLength(0);
  });

  it("connects nodes in a chain with spatial sorting to prevent criss-crossing dead knots", () => {
    const nodeA: CanvasTextNode = { id: "a", type: "text", text: "A", x: 100, y: 100, width: 100, height: 100 };
    const nodeB: CanvasTextNode = { id: "b", type: "text", text: "B", x: 300, y: 100, width: 100, height: 100 };
    const nodeC: CanvasTextNode = { id: "c", type: "text", text: "C", x: 500, y: 100, width: 100, height: 100 };

    // Pass in unordered array: [C, A, B]
    const chainEdges = connectChainNodes([nodeC, nodeA, nodeB], [], "bezier", true);
    expect(chainEdges).toHaveLength(2);
    // Spatially sorted: A -> B -> C
    expect(chainEdges[0].fromNode).toBe("a");
    expect(chainEdges[0].toNode).toBe("b");
    expect(chainEdges[1].fromNode).toBe("b");
    expect(chainEdges[1].toNode).toBe("c");
  });

  it("disconnects all incoming and outgoing edges for a specific node", () => {
    const edges = [
      { id: "e1", fromNode: "node-1", toNode: "node-2" },
      { id: "e2", fromNode: "node-3", toNode: "node-1" },
      { id: "e3", fromNode: "node-2", toNode: "node-3" },
    ] as any;

    const remaining = disconnectNodeEdges("node-1", edges);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("e3");
  });

  it("spawns multiple branches (1-to-Many) neatly arranged and connected", () => {
    const sourceNode: CanvasTextNode = {
      id: "source-1",
      type: "text",
      text: "# 中心主题",
      x: 100,
      y: 200,
      width: 260,
      height: 150,
      color: "4",
    };

    const result = spawnMultipleBranches(sourceNode, 3, "right");
    expect(result.newNodes).toHaveLength(3);
    expect(result.newEdges).toHaveLength(3);

    // All edges point from source to the new nodes
    expect(result.newEdges.every((e) => e.fromNode === "source-1")).toBe(true);
    expect(result.newEdges[0].toNode).toBe(result.newNodes[0].id);
    expect(result.newEdges[1].toNode).toBe(result.newNodes[1].id);
    expect(result.newEdges[2].toNode).toBe(result.newNodes[2].id);

    // Nodes are arranged to the right of source and stacked vertically
    expect(result.newNodes[0].x).toBeGreaterThan(sourceNode.x + sourceNode.width);
    expect(result.newNodes[1].y).toBeGreaterThan(result.newNodes[0].y);
    expect(result.newNodes[2].y).toBeGreaterThan(result.newNodes[1].y);
  });

  it("prevents occlusion in vertical tiers by picking top/bottom anchors even when dx is wide", () => {
    // Lower card connecting to upper-right card:
    // fromNode is at bottom (y: 600..740), toNode is at upper-tier (y: 100..240, x: 700..960)
    // Horizontal distance (dx = 500) exceeds dy = 500, but vertical tiering must strictly pick top -> bottom
    const lowerCard: CanvasTextNode = {
      id: "lower",
      type: "text",
      text: "底部聚合卡片",
      x: 200,
      y: 600,
      width: 260,
      height: 140,
    };
    const upperRightCard: CanvasTextNode = {
      id: "upper-right",
      type: "text",
      text: "右上目标卡片",
      x: 700,
      y: 100,
      width: 260,
      height: 140,
    };

    const sides = getOptimalAnchorSides(lowerCard, upperRightCard);
    expect(sides).toEqual({ fromSide: "top", toSide: "bottom" });

    // Reverse: from upper-tier to lower card should be bottom -> top
    const reverseSides = getOptimalAnchorSides(upperRightCard, lowerCard);
    expect(reverseSides).toEqual({ fromSide: "bottom", toSide: "top" });
  });

  it("connects nodes in a closed loop (Ring) in centroid angular order without crossing", () => {
    const node1: CanvasTextNode = { id: "n1", type: "text", text: "1", x: 200, y: 100, width: 100, height: 100 };
    const node2: CanvasTextNode = { id: "n2", type: "text", text: "2", x: 400, y: 100, width: 100, height: 100 };
    const node3: CanvasTextNode = { id: "n3", type: "text", text: "3", x: 400, y: 300, width: 100, height: 100 };
    const node4: CanvasTextNode = { id: "n4", type: "text", text: "4", x: 200, y: 300, width: 100, height: 100 };

    // Pass in scrambled order
    const loopEdges = connectLoopNodes([node3, node1, node4, node2], [], "bezier", true);
    // Closed ring of 4 nodes must produce 4 edges
    expect(loopEdges).toHaveLength(4);

    // Verify all 4 nodes are connected in a single cycle
    const fromIds = loopEdges.map((e) => e.fromNode);
    const toIds = loopEdges.map((e) => e.toNode);
    expect(new Set(fromIds).size).toBe(4);
    expect(new Set(toIds).size).toBe(4);

    // Every fromNode is visited exactly once, and loop is closed (A -> B -> C -> D -> A)
    const nextMap = new Map(loopEdges.map((e) => [e.fromNode, e.toNode]));
    let current = fromIds[0];
    const visited = [current];
    for (let i = 0; i < 3; i++) {
      current = nextMap.get(current)!;
      visited.push(current);
    }
    expect(nextMap.get(current)).toBe(fromIds[0]); // Closes loop
    expect(new Set(visited).size).toBe(4);
  });

  it("supports connecting group containers with cards and other groups", () => {
    const groupA: CanvasGroupNode = {
      id: "grp-a",
      type: "group",
      label: "分组 A",
      x: 100,
      y: 100,
      width: 400,
      height: 300,
    };
    const groupB: CanvasGroupNode = {
      id: "grp-b",
      type: "group",
      label: "分组 B",
      x: 600,
      y: 100,
      width: 400,
      height: 300,
    };
    const cardOutside: CanvasTextNode = {
      id: "ext-card",
      type: "text",
      text: "外部卡片",
      x: 350,
      y: 500,
      width: 200,
      height: 100,
    };

    // 1. Connect groupA to cardOutside (1-to-many)
    const edges1 = connectOneToMany(groupA, [cardOutside], []);
    expect(edges1).toHaveLength(1);
    expect(edges1[0].fromNode).toBe("grp-a");
    expect(edges1[0].toNode).toBe("ext-card");

    // 2. Connect groupA to groupB
    const edges2 = connectOneToMany(groupA, [groupB], []);
    expect(edges2).toHaveLength(1);
    expect(edges2[0].fromNode).toBe("grp-a");
    expect(edges2[0].toNode).toBe("grp-b");
    expect(edges2[0].fromSide).toBe("right");
    expect(edges2[0].toSide).toBe("left");
  });

  it("anchors all connections to the exact midpoint of each edge for cards and containers", () => {
    const card: CanvasTextNode = {
      id: "card-1",
      type: "text",
      text: "Card",
      x: 100,
      y: 100,
      width: 240,
      height: 160,
    };

    // Connections strictly start/terminate at edge centers
    expect(getNodeAnchorPoint(card, "top")).toEqual({ x: 100 + 120, y: 100 });
    expect(getNodeAnchorPoint(card, "bottom")).toEqual({ x: 100 + 120, y: 100 + 160 });
    expect(getNodeAnchorPoint(card, "left")).toEqual({ x: 100, y: 100 + 80 });
    expect(getNodeAnchorPoint(card, "right")).toEqual({ x: 100 + 240, y: 100 + 80 });

    const wideContainer: CanvasGroupNode = {
      id: "big-group",
      type: "group",
      x: 100,
      y: 100,
      width: 600,
      height: 400,
    };
    expect(getNodeAnchorPoint(wideContainer, "top")).toEqual({ x: 100 + 300, y: 100 });
    expect(getNodeAnchorPoint(wideContainer, "bottom")).toEqual({ x: 100 + 300, y: 100 + 400 });
    expect(getNodeAnchorPoint(wideContainer, "left")).toEqual({ x: 100, y: 100 + 200 });
    expect(getNodeAnchorPoint(wideContainer, "right")).toEqual({ x: 100 + 600, y: 100 + 200 });
  });


  it("prioritizes horizontal dominance in left-right structured layouts", () => {
    // Left node and right node with slight vertical offset
    const leftNode: CanvasTextNode = {
      id: "left-n",
      type: "text",
      text: "Left",
      x: 100,
      y: 100,
      width: 200,
      height: 120,
    };
    const rightNode: CanvasTextNode = {
      id: "right-n",
      type: "text",
      text: "Right",
      x: 500,
      y: 160,
      width: 200,
      height: 120,
    };

    // Horizontal distance (200px gap) strongly dominates vertical distance (0px gap due to overlap)
    const sides = getOptimalAnchorSides(leftNode, rightNode);
    expect(sides).toEqual({ fromSide: "right", toSide: "left" });

    // Reverse
    const revSides = getOptimalAnchorSides(rightNode, leftNode);
    expect(revSides).toEqual({ fromSide: "left", toSide: "right" });
  });

  it("assigns smooth tangent-aligned sides in circular loop without overlapping entry/exit", () => {
    // 5 nodes arranged roughly in a circle (12, 2, 5, 7, 10 o'clock)
    const topNode: CanvasTextNode = { id: "top", type: "text", text: "12", x: 300, y: 50, width: 120, height: 80 };
    const rightTopNode: CanvasTextNode = { id: "rt", type: "text", text: "2", x: 500, y: 180, width: 120, height: 80 };
    const rightBotNode: CanvasTextNode = { id: "rb", type: "text", text: "5", x: 450, y: 380, width: 120, height: 80 };
    const leftBotNode: CanvasTextNode = { id: "lb", type: "text", text: "7", x: 150, y: 380, width: 120, height: 80 };
    const leftTopNode: CanvasTextNode = { id: "lt", type: "text", text: "10", x: 100, y: 180, width: 120, height: 80 };

    const ringEdges = connectLoopNodes([topNode, rightTopNode, rightBotNode, leftBotNode, leftTopNode], [], "bezier", true);
    expect(ringEdges).toHaveLength(5);

    // Check top node's incoming and outgoing edges:
    // Outgoing from top should be "right" side towards 2 o'clock
    const outFromTop = ringEdges.find((e) => e.fromNode === "top");
    expect(outFromTop).toBeDefined();
    expect(outFromTop!.fromSide).toBe("right");

    // Incoming to top should be "left" side from 10 o'clock
    const inToTop = ringEdges.find((e) => e.toNode === "top");
    expect(inToTop).toBeDefined();
    expect(inToTop!.toSide).toBe("left");

    // Entry and exit sides on top node must NEVER be both "bottom" (fixing the screenshot 1 bug)
    expect(outFromTop!.fromSide).not.toBe(inToTop!.toSide);
  });

  it("cycles edge stroke patterns through solid, dashed, and dotted", () => {
    const edge = { id: "e1", fromNode: "a", toNode: "b" };
    const p1 = cycleEdgeStrokePattern(edge);
    expect(p1.strokePattern).toBe("dashed");

    const p2 = cycleEdgeStrokePattern(p1);
    expect(p2.strokePattern).toBe("dotted");

    const p3 = cycleEdgeStrokePattern(p2);
    expect(p3.strokePattern).toBe("solid");
  });

  it("computes strict bounding envelope for bezier curves without overshooting arch", () => {
    // 9 o'clock node (left) to 12 o'clock node (top), dy is small (50px), dx is 200px
    const p1 = { x: 100, y: 150 }; // side: top
    const p2 = { x: 300, y: 100 }; // side: left
    const cps = computeBezierControlPoints(p1, "top", p2, "left");
    // p1 goes upwards. dy is 50. Max upward extent must not overshoot (cp1.y should not shoot hundreds of pixels into sky)
    expect(cps.cp1.y).toBeGreaterThanOrEqual(150 - 50 * 0.55 - 10);
    expect(cps.cp2.x).toBeLessThanOrEqual(300);
  });

  it("calculates step bend handle position and supports stepOffset translation", () => {
    const p1 = { x: 100, y: 100 };
    const p2 = { x: 300, y: 200 };
    // Horizontal start/end
    const handleNoOffset = getStepBendHandleInfo(p1, "right", p2, "left");
    expect(handleNoOffset.orientation).toBe("horizontal");
    expect(handleNoOffset.x).toBe(200); // halfway between 100 and 300
    expect(handleNoOffset.y).toBe(150);

    // With stepOffset = 30
    const handleWithOffset = getStepBendHandleInfo(p1, "right", p2, "left", 30);
    expect(handleWithOffset.x).toBe(230);

    // Compute path with stepOffset
    const pathWithOffset = computeEdgePath(p1, "right", p2, "left", "step", 30);
    expect(pathWithOffset).toBe("M 100 100 L 230 100 L 230 200 L 300 200");

    // Geometric midpoint aligns with step bend
    const mid = computeEdgeMidpoint(p1, "right", p2, "left", "step", 30);
    expect(mid.x).toBe(230);
    expect(mid.y).toBe(150);
  });

  it("prefers vertical routing over diagonal when gapY >= gapX (top-bottom layout wins)", () => {
    // Source card in bottom container, target card in top container, slight horizontal offset
    const bottomCard: CanvasTextNode = { id: "src", type: "text", text: "A", x: 100, y: 350, width: 200, height: 130 };
    const topCard: CanvasTextNode = { id: "tgt", type: "text", text: "B", x: 300, y: 60, width: 200, height: 130 };

    // gapX = 300 - 300 = 0 (they actually share X boundary), gapY = 350 - 190 = 160
    // Should use top→bottom routing (source exits top since dy < 0)
    const sides = getOptimalAnchorSides(bottomCard, topCard);
    expect(sides.fromSide).toBe("top");
    expect(sides.toSide).toBe("bottom");

    // Also when gapX < gapY (diagonal with vertical dominance):
    const bottomLeft: CanvasTextNode = { id: "bl", type: "text", text: "A", x: 50, y: 350, width: 200, height: 130 };
    const topRight: CanvasTextNode = { id: "tr", type: "text", text: "B", x: 300, y: 60, width: 200, height: 130 };
    // gapX = 300-250 = 50, gapY = 350-190 = 160. gapY >= gapX → vertical routing
    const diag = getOptimalAnchorSides(bottomLeft, topRight);
    expect(diag.fromSide).toBe("top");
    expect(diag.toSide).toBe("bottom");
  });

  it("auto-cycles edge colors for successive outgoing edges from the same source node", () => {
    const node1: CanvasTextNode = { id: "n1", type: "text", text: "Src", x: 0, y: 0, width: 200, height: 120 };
    const node2: CanvasTextNode = { id: "n2", type: "text", text: "A", x: 300, y: 0, width: 200, height: 120 };
    const node3: CanvasTextNode = { id: "n3", type: "text", text: "B", x: 300, y: 150, width: 200, height: 120 };
    const node4: CanvasTextNode = { id: "n4", type: "text", text: "C", x: 300, y: 300, width: 200, height: 120 };

    // No existing edges: first connection gets palette key "1"
    expect(getNextEdgeColorForSource("n1", [])).toBe("1");

    // With one existing edge from n1: second gets "2"
    const existingEdge = { id: "e0", fromNode: "n1", fromSide: "right" as const, fromEnd: "none" as const,
      toNode: "n2", toSide: "left" as const, toEnd: "arrow" as const };
    expect(getNextEdgeColorForSource("n1", [existingEdge])).toBe("2");

    // connectOneToMany auto-cycles colors for each new edge
    const edges = connectOneToMany(node1, [node2, node3, node4], []);
    expect(edges).toHaveLength(3);
    // Each edge should have a distinct palette color
    const colors = edges.map((e) => e.color);
    expect(colors[0]).toBe("1");
    expect(colors[1]).toBe("2");
    expect(colors[2]).toBe("3");
    // All colors distinct
    expect(new Set(colors).size).toBe(3);
  });
});

