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
  getSourceNodeEdgeColor,
  exportCanvasToSvg,
  exportCanvasToPng,
  downloadCanvasAsImage,
  copyCanvasImageToClipboard,
  resolveExportScale,
  sanitizeSvgResources,
  valueBooleanAttributes,
  reverseEdgeDirection,
  connectOneToMany,
  connectChainNodes,
  connectLoopNodes,
  getLoopEdgeColors,
  getLoopEdgeIds,
  expandLoopEdgeSelection,
  computeSourceDisplayColorMap,
  alignNodesInCircle,
  alignNodesInGrid,
  computeRingLayout,
  syncRingEdges,
  projectPointOntoRing,
  computeGridLayout,
  syncGridEdges,
  syncLoopEdgeGeometry,
  resizeGridSpacing,
  computeMinRingRadius,
  computeRingSpacingLayout,
  resizeRingSpacing,
  isPointInsideNodeHull,
  CANVAS_COLOR_PALETTES,
  CANVAS_STANDARD_COLOR_IDS,
  disconnectNodeEdges,
  spawnMultipleBranches,
  cycleEdgeStrokePattern,
  getStepBendHandleInfo,
  computeBezierControlPoints,
  computeEdgeMidpoint,
  alignNodes,
} from "../services/canvasService";
import { getCanvasThemeColors } from "../services/canvasTheme";
import type { CanvasData, CanvasTextNode, CanvasFileNode, CanvasGroupNode, CanvasEdge } from "../types/canvasTypes";

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
    // Cards are rendered as foreignObject so every on-screen detail survives
    expect(svg).toContain("<foreignObject");
    expect(svg).toContain('class="ks-card"');
    expect(svg).toContain('class="ks-hdr"');
    expect(svg).toContain('class="ks-body"');
    // Rich Markdown body is preserved (heading + real task-list checkboxes)
    expect(svg).toContain("系统模型");
    expect(svg).toContain('type="checkbox"');
    expect(svg).toContain("模块完成");
    expect(svg).toContain("待定");
    // File card keeps its filename in the header
    expect(svg).toContain("📄 设计图.md");
    // Link card keeps its icon in the header and the URL in the body
    expect(svg).toContain("🔗 外部参考");
    expect(svg).toContain("https://example.com");
    // card-1 emits two edges -> rendered as a hub with the origin badge
    expect(svg).toContain("🌱 发起源 · 2");
    // Header tint follows the card palette (card-1 uses palette "2" = 活力橙)
    expect(svg).toContain("background:rgba(249, 115, 22, 0.12)");
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
    const savePngBufferMock = vi.fn().mockResolvedValue({ success: true });
    const savePngDataMock = vi.fn().mockResolvedValue({ success: true });
    (window as any).knowSpaceDesktop = {
      savePngBuffer: savePngBufferMock,
      savePngData: savePngDataMock,
    };
    // The raw-buffer bridge must be preferred: base64 data URLs used to
    // duplicate a multi-megabyte string across the IPC boundary and crash.
    const pngResult = await downloadCanvasAsImage(data, "test-canvas", "png");
    expect(savePngBufferMock).toHaveBeenCalled();
    expect(savePngDataMock).not.toHaveBeenCalled();
    expect(pngResult).toBe("png");

    // Cancelling is reported distinctly so the UI can keep the dialog open
    savePngBufferMock.mockResolvedValueOnce({ canceled: true });
    expect(await downloadCanvasAsImage(data, "test-canvas", "png")).toBe("canceled");

    // SVG format reports itself as such
    expect(await downloadCanvasAsImage(data, "test-canvas", "svg")).toBe("svg");

    clickSpy.mockRestore();
    delete (window as any).knowSpaceDesktop;

    // Clipboard copy
    const copied = await copyCanvasImageToClipboard(data);
    expect(typeof copied).toBe("boolean");
  });

  it("removes external SVG resources so the canvas can never be tainted", async () => {
    // A file:// image inside the exported SVG is what produced
    // "Tainted canvases may not be exported" — toBlob() refuses to run.
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">` +
      `<image href="file:///C:/private/shot.png" width="10" height="10"/>` +
      `<rect width="100" height="100"/></svg>`;

    const out = await sanitizeSvgResources(svg);
    expect(out).not.toContain("file:///C:/private/shot.png");
    // Everything else in the drawing must survive
    expect(out).toContain("<rect");
  });

  it("keeps data URLs and internal references untouched", async () => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg">` +
      `<image href="data:image/png;base64,iVBORw0KGgo="/>` +
      `<use href="#shared-shape"/></svg>`;

    const out = await sanitizeSvgResources(svg);
    expect(out).toContain("data:image/png;base64,iVBORw0KGgo=");
    expect(out).toContain("#shared-shape");
  });

  it("strips img tags nested inside foreignObject card bodies", async () => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject x="0" y="0" width="200" height="100">` +
      `<div xmlns="http://www.w3.org/1999/xhtml"><img src="file:///nowhere/tracker.png"/><p>text</p></div>` +
      `</foreignObject></svg>`;

    const out = await sanitizeSvgResources(svg);
    expect(out).not.toContain("tracker.png");
    expect(out).toContain("text");
  }, 15000);

  it("rewrites CSS url() references that would taint the canvas", async () => {
    // Deliberately not well-formed XML (unclosed <br>) so this also exercises
    // the textual fallback path.
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg">` +
      `<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">` +
      `<span style="background-image:url('file:///nowhere/paper.png')">a<br></span>` +
      `</div></foreignObject></svg>`;

    const out = await sanitizeSvgResources(svg);
    expect(out).not.toContain("paper.png");
  }, 15000);

  it("repairs unclosed HTML void tags so the export becomes valid XML", async () => {
    // Mirrors exactly what exportCanvasToSvg() produces: markdown-it runs
    // without xhtmlOut, so card bodies carry <br>, <img> and the task-list
    // <input> unclosed. In XML an unclosed <img> swallows everything after it,
    // which used to make the document unparseable — that in turn disabled the
    // inlining pass AND the strip-images retry, and Chromium's error-recovery
    // parser still loaded the external image, tainting the canvas.
    const svg =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">` +
      `<foreignObject x="0" y="0" width="400" height="200">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" class="ks-card">` +
      `<div class="ks-body"><p>before<br>after</p>` +
      `<img src="file:///nowhere/shot.png" alt="s">` +
      `<input type="checkbox" checked disabled></div>` +
      `</div></foreignObject></svg>`;

    const out = await sanitizeSvgResources(svg);

    // The external reference must be gone
    expect(out).not.toContain("shot.png");

    // The result must be parseable XML — this is the actual fix
    const doc = new DOMParser().parseFromString(out, "image/svg+xml");
    expect(doc.getElementsByTagName("parsererror").length).toBe(0);

    // Void elements are now self-closed
    expect(out).toMatch(/<br\s*\/>/);
    expect(out).toMatch(/<input[^>]*\/>/);

    // Surrounding card content survives
    expect(out).toContain("before");
    expect(out).toContain("after");
  }, 15000);

  it("preserves the drawing when there are no external resources", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>`;
    const out = await sanitizeSvgResources(svg);
    // The markup may be normalised (XML declaration, namespace order), but the
    // drawing itself must be identical.
    expect(out).toContain('<circle cx="5" cy="5" r="4"/>');
    expect(out).not.toContain("url(");
  });

  it("gives XML values to HTML boolean attributes", () => {
    // `checked` alone is legal HTML but a hard XML parse error.
    const input =
      `<div xmlns="http://www.w3.org/1999/xhtml">` +
      `<input class="task-list-item-checkbox" type="checkbox" disabled checked>` +
      `</div>`;
    const out = valueBooleanAttributes(input);
    expect(out).toContain('disabled="disabled"');
    expect(out).toContain('checked="checked"');
    // Attributes that already have values must be left alone
    expect(out).toContain('type="checkbox"');
  });

  it("routes clipboard copy through the main process when no PNG can be produced", async () => {
    const data: CanvasData = {
      nodes: [{ id: "1", type: "text", text: "Clip", x: 0, y: 0, width: 120, height: 80 }],
      edges: [],
    };

    // jsdom has no canvas 2D context, so exportCanvasToPngBlob yields an SVG —
    // exactly the situation where the previous implementation silently
    // returned false and copying did nothing at all. The main process must
    // take over via offscreen rendering.
    const copyCanvasAsImage = vi.fn().mockResolvedValue({ success: true });
    (window as any).knowSpaceDesktop = { copyCanvasAsImage };

    expect(await copyCanvasImageToClipboard(data)).toBe(true);
    expect(copyCanvasAsImage).toHaveBeenCalled();
    const passedSvg = copyCanvasAsImage.mock.calls[0][0].svg as string;
    expect(passedSvg).toContain("<svg");

    delete (window as any).knowSpaceDesktop;

    // With no bridge available it degrades to a plain false, never a throw
    expect(await copyCanvasImageToClipboard(data)).toBe(false);
  });

  it("exports with the same backdrop and dot grid the screen shows", () => {
    const data: CanvasData = {
      nodes: [{ id: "1", type: "text", text: "Theme", x: 0, y: 0, width: 200, height: 120 }],
      edges: [],
    };

    // The exporter used to keep its own hand-maintained palette: light exported
    // on #f8fafc instead of #ffffff, and e-ink lost its paper tone entirely.
    for (const theme of ["light", "eink", "twitter"] as const) {
      const palette = getCanvasThemeColors(theme);
      const svg = exportCanvasToSvg(data, { theme });

      expect(svg).toContain(palette.canvasBg);
      expect(svg).toContain(palette.dotColor);
      // The old hard-coded fallbacks must be gone
      if (theme !== "light") expect(svg).not.toContain("#f8fafc");
      if (theme !== "twitter") expect(svg).not.toContain("rgba(255, 255, 255, 0.12)");
    }

    // An explicit white/transparent background still overrides the theme
    expect(exportCanvasToSvg(data, { theme: "eink", background: "white" })).toContain("#ffffff");
    const transparent = exportCanvasToSvg(data, { theme: "eink", background: "transparent" });
    expect(transparent).not.toContain(`fill="${getCanvasThemeColors("eink").canvasBg}"`);
  });

  it("computes the smallest radius that keeps ring neighbours apart", () => {
    const cards: CanvasTextNode[] = [1, 2, 3, 4].map((i) => ({
      id: `m${i}`,
      type: "text" as const,
      text: `Card ${i}`,
      x: i * 40,
      y: i * 30,
      width: 160,
      height: 100,
    }));

    expect(computeMinRingRadius(cards)).toBeGreaterThan(0);
    // Fewer than three cards cannot form a ring
    expect(computeMinRingRadius(cards.slice(0, 2))).toBe(0);

    // More cards of the same size need a larger radius to stay clear
    const many = [...cards, ...cards.map((c) => ({ ...c, id: `${c.id}-b` }))];
    expect(computeMinRingRadius(many)).toBeGreaterThan(computeMinRingRadius(cards));
  });

  it("detects a ring so the radius can be adjusted interactively", () => {
    const cards: CanvasTextNode[] = [1, 2, 3, 4, 5, 6].map((i) => ({
      id: `r${i}`,
      type: "text" as const,
      text: `Card ${i}`,
      x: i * 200,
      y: 0,
      width: 160,
      height: 100,
    }));
    const ids = cards.map((n) => n.id);
    const ringNodes = alignNodesInCircle(cards, ids);

    const layout = computeRingSpacingLayout(ringNodes);
    expect(layout).not.toBeNull();
    expect(layout!.orderedIds).toHaveLength(6);
    expect(layout!.minRadius).toBeGreaterThan(0);
    expect(layout!.radius).toBeGreaterThan(0);

    // Free-form arrangements are not a ring
    expect(computeRingSpacingLayout(cards)).toBeNull();
    // Fewer than three cards is not a ring either
    expect(computeRingSpacingLayout(ringNodes.slice(0, 2))).toBeNull();
  });

  it("resizes a ring in place when one of its cards is dragged", () => {
    const cards: CanvasTextNode[] = [1, 2, 3, 4, 5, 6].map((i) => ({
      id: `s${i}`,
      type: "text" as const,
      text: `Card ${i}`,
      x: i * 200,
      y: 0,
      width: 160,
      height: 100,
    }));
    const ids = cards.map((n) => n.id);
    const ringNodes = alignNodesInCircle(cards, ids);
    const layout = computeRingSpacingLayout(ringNodes)!;

    const dragged = ringNodes.find((n) => n.id === layout.orderedIds[0])!;
    const draggedCenter = {
      x: dragged.x + dragged.width / 2,
      y: dragged.y + dragged.height / 2,
    };
    // Push the card 60% further out from the centre
    const pushed = {
      x: layout.center.x + (draggedCenter.x - layout.center.x) * 1.6,
      y: layout.center.y + (draggedCenter.y - layout.center.y) * 1.6,
    };

    const resized = resizeRingSpacing(ringNodes, layout, dragged.id, pushed);

    // Every card now sits further from the SAME centre — the ring grew in
    // place instead of creeping across the canvas.
    for (const n of resized) {
      const r = Math.hypot(
        n.x + n.width / 2 - layout.center.x,
        n.y + n.height / 2 - layout.center.y
      );
      expect(r).toBeGreaterThan(layout.radius * 1.2);
    }

    // Seating order is preserved, so cards do not swap places mid-drag
    const angles = layout.orderedIds.map((id) => {
      const n = resized.find((x) => x.id === id)!;
      return Math.atan2(
        n.y + n.height / 2 - layout.center.y,
        n.x + n.width / 2 - layout.center.x
      );
    });
    const sorted = [...angles].sort((a, b) => a - b);
    expect(angles).toEqual(sorted);
  });

  it("never collapses a ring below the collision floor", () => {
    const cards: CanvasTextNode[] = [1, 2, 3, 4, 5, 6].map((i) => ({
      id: `t${i}`,
      type: "text" as const,
      text: `Card ${i}`,
      x: i * 200,
      y: 0,
      width: 160,
      height: 100,
    }));
    const ids = cards.map((n) => n.id);
    const ringNodes = alignNodesInCircle(cards, ids);
    const layout = computeRingSpacingLayout(ringNodes)!;

    // Drag the card right on top of the centre
    const collapsed = resizeRingSpacing(ringNodes, layout, layout.orderedIds[0], {
      x: layout.center.x,
      y: layout.center.y,
    });

    for (const n of collapsed) {
      const r = Math.hypot(
        n.x + n.width / 2 - layout.center.x,
        n.y + n.height / 2 - layout.center.y
      );
      expect(r).toBeGreaterThanOrEqual(layout.minRadius - 1);
    }
  });

  it("offers an extended palette while keeping the standard six first", () => {
    // Keys 1-6 are the JSON Canvas standard, so boards stay interoperable;
    // 7-12 are our own additions for richer batch recolouring.
    expect(CANVAS_STANDARD_COLOR_IDS).toEqual(["1", "2", "3", "4", "5", "6"]);
    for (const id of CANVAS_STANDARD_COLOR_IDS) {
      expect(CANVAS_COLOR_PALETTES[id]).toBeDefined();
    }

    const ids = Object.keys(CANVAS_COLOR_PALETTES);
    expect(ids.length).toBeGreaterThan(6);
    expect(ids.slice(0, 6)).toEqual([...CANVAS_STANDARD_COLOR_IDS]);

    // Extended entries must be usable everywhere a colour key is accepted
    for (const id of ids) {
      const entry = CANVAS_COLOR_PALETTES[id];
      expect(entry.stroke).toMatch(/^#[0-9a-f]{6}$/i);
      expect(entry.bg.length).toBeGreaterThan(0);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it("detects a click in the hollow middle of a ring or grid selection", () => {
    const cards: CanvasTextNode[] = [1, 2, 3, 4, 5, 6].map((i) => ({
      id: `h${i}`,
      type: "text" as const,
      text: `Card ${i}`,
      x: i * 200,
      y: 0,
      width: 160,
      height: 100,
    }));
    const ids = cards.map((n) => n.id);
    const ringNodes = alignNodesInCircle(cards, ids);
    const layout = computeRingSpacingLayout(ringNodes)!;

    // Dead centre of the ring is empty canvas but belongs to the group
    expect(isPointInsideNodeHull(layout.center, ringNodes)).toBe(true);

    // Well outside the ring is not
    expect(
      isPointInsideNodeHull(
        { x: layout.center.x, y: layout.center.y - layout.radius * 3 },
        ringNodes
      )
    ).toBe(false);

    // A grid's inner gap counts too
    const gridNodes = alignNodesInGrid(cards, ids);
    const gridBox = computeBoundingBox(gridNodes);
    expect(
      isPointInsideNodeHull(
        { x: gridBox.minX + gridBox.width / 2, y: gridBox.minY + gridBox.height / 2 },
        gridNodes
      )
    ).toBe(true);

    // Fewer than three cards cannot enclose anything
    expect(isPointInsideNodeHull({ x: 100, y: 100 }, ringNodes.slice(0, 2))).toBe(false);
  });

  it("rejects a point outside a concave arrangement's bounding box interior", () => {
    // Four cards in an L shape: the top-right corner of the bounding box is
    // inside the box but outside the group, so a naive bbox test would wrongly
    // grab the selection there.
    const cards: CanvasTextNode[] = [
      { id: "a", type: "text", text: "a", x: 0, y: 0, width: 100, height: 100 },
      { id: "b", type: "text", text: "b", x: 200, y: 0, width: 100, height: 100 },
      { id: "c", type: "text", text: "c", x: 0, y: 200, width: 100, height: 100 },
      { id: "d", type: "text", text: "d", x: 100, y: 400, width: 100, height: 100 },
    ];

    // Centre of the L's short arm is inside
    expect(isPointInsideNodeHull({ x: 100, y: 50 }, cards)).toBe(true);
    // The far top-right corner is inside the bbox but outside the hull
    expect(isPointInsideNodeHull({ x: 340, y: 20 }, cards)).toBe(false);
  });

  it("clamps the export scale so oversized boards cannot crash the renderer", () => {
    // Normal board: the requested scale is honoured
    expect(resolveExportScale(1000, 800, 2)).toBeCloseTo(2, 5);
    expect(resolveExportScale(1000, 800, 1)).toBeCloseTo(1, 5);

    // Very wide board: capped by the 16384px per-side limit
    const wide = resolveExportScale(20000, 100, 2);
    expect(20000 * wide).toBeLessThanOrEqual(16384);
    expect(wide).toBeLessThan(1);

    // Very tall board: also capped per-side
    const tall = resolveExportScale(100, 20000, 2);
    expect(20000 * tall).toBeLessThanOrEqual(16384);

    // Huge board: capped by the total pixel budget
    const huge = resolveExportScale(20000, 20000, 2);
    expect(20000 * huge * (20000 * huge)).toBeLessThanOrEqual(24_000_000 + 1);

    // Never returns something degenerate
    expect(resolveExportScale(10, 10, 2)).toBeGreaterThan(0);
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

  it("uses one identical color for every edge within the same ring", () => {
    const n1: CanvasTextNode = { id: "r1", type: "text", text: "1", x: 200, y: 100, width: 100, height: 100 };
    const n2: CanvasTextNode = { id: "r2", type: "text", text: "2", x: 400, y: 100, width: 100, height: 100 };
    const n3: CanvasTextNode = { id: "r3", type: "text", text: "3", x: 400, y: 300, width: 100, height: 100 };
    const n4: CanvasTextNode = { id: "r4", type: "text", text: "4", x: 200, y: 300, width: 100, height: 100 };

    const ring = connectLoopNodes([n1, n2, n3, n4], [], "bezier", true);
    expect(ring).toHaveLength(4);

    const colors = new Set(ring.map((e) => e.color));
    expect(colors.size).toBe(1); // every segment shares the same color
  });

  it("assigns different colors to different rings on the same canvas", () => {
    // First ring
    const a1: CanvasTextNode = { id: "a1", type: "text", text: "A1", x: 100, y: 100, width: 80, height: 80 };
    const a2: CanvasTextNode = { id: "a2", type: "text", text: "A2", x: 260, y: 100, width: 80, height: 80 };
    const a3: CanvasTextNode = { id: "a3", type: "text", text: "A3", x: 260, y: 260, width: 80, height: 80 };
    const a4: CanvasTextNode = { id: "a4", type: "text", text: "A4", x: 100, y: 260, width: 80, height: 80 };

    // Second ring (spatially separated so angular ordering is stable)
    const b1: CanvasTextNode = { id: "b1", type: "text", text: "B1", x: 700, y: 500, width: 80, height: 80 };
    const b2: CanvasTextNode = { id: "b2", type: "text", text: "B2", x: 860, y: 500, width: 80, height: 80 };
    const b3: CanvasTextNode = { id: "b3", type: "text", text: "B3", x: 860, y: 660, width: 80, height: 80 };
    const b4: CanvasTextNode = { id: "b4", type: "text", text: "B4", x: 700, y: 660, width: 80, height: 80 };

    const ringA = connectLoopNodes([a1, a2, a3, a4], [], "bezier", true);
    const allNodes = [a1, a2, a3, a4, b1, b2, b3, b4];
    const ringB = connectLoopNodes([b1, b2, b3, b4], ringA, "bezier", true, allNodes);

    const colorA = ringA[0].color;
    const colorB = ringB[0].color;

    expect(colorA).toBeDefined();
    expect(colorB).toBeDefined();
    expect(colorB).not.toBe(colorA); // rings must be visually distinct

    // Each ring is internally uniform
    expect(new Set(ringA.map((e) => e.color)).size).toBe(1);
    expect(new Set(ringB.map((e) => e.color)).size).toBe(1);
  });

  it("detects loop colors only from edges that actually form a cycle", () => {
    // A closed ring a -> b -> c -> a
    const ringEdges: CanvasEdge[] = [
      { id: "e1", fromNode: "a", toNode: "b", color: "1" },
      { id: "e2", fromNode: "b", toNode: "c", color: "1" },
      { id: "e3", fromNode: "c", toNode: "a", color: "1" },
    ];
    expect(getLoopEdgeColors(ringEdges)).toEqual(new Set(["1"]));

    // A simple chain x -> y -> z on its own nodes is NOT a cycle,
    // so it claims no loop color
    const chainEdges: CanvasEdge[] = [
      { id: "c1", fromNode: "x", toNode: "y", color: "2" },
      { id: "c2", fromNode: "y", toNode: "z", color: "2" },
    ];
    expect(getLoopEdgeColors(chainEdges).size).toBe(0);

    // Mixed canvas: the disconnected chain must not contribute,
    // only the actual ring does
    const mixed: CanvasEdge[] = [...chainEdges, ...ringEdges];
    expect(getLoopEdgeColors(mixed)).toEqual(new Set(["1"]));

    // A mere two-way pair (u -> v, v -> u) is not a ring either
    const pairEdges: CanvasEdge[] = [
      { id: "p1", fromNode: "u", toNode: "v", color: "3" },
      { id: "p2", fromNode: "v", toNode: "u", color: "3" },
    ];
    expect(getLoopEdgeColors(pairEdges).size).toBe(0);
  });

  it("maps every node of a ring to ONE identical display color (regression)", () => {
    const n1: CanvasTextNode = { id: "c1", type: "text", text: "1", x: 200, y: 100, width: 100, height: 100 };
    const n2: CanvasTextNode = { id: "c2", type: "text", text: "2", x: 400, y: 100, width: 100, height: 100 };
    const n3: CanvasTextNode = { id: "c3", type: "text", text: "3", x: 480, y: 300, width: 100, height: 100 };
    const n4: CanvasTextNode = { id: "c4", type: "text", text: "4", x: 380, y: 460, width: 100, height: 100 };
    const n5: CanvasTextNode = { id: "c5", type: "text", text: "5", x: 180, y: 420, width: 100, height: 100 };

    const nodes = [n1, n2, n3, n4, n5];
    const ring = connectLoopNodes(nodes, [], "bezier", true);
    expect(ring).toHaveLength(5);

    // The ring itself must be uniform...
    expect(new Set(ring.map((e) => e.color)).size).toBe(1);

    // ...AND the display color map used by the renderer / exporter must
    // resolve every ring node to that same single color, instead of
    // splitting the ring into a rainbow of segments.
    const displayMap = computeSourceDisplayColorMap(nodes, ring);
    const resolved = new Set<string>();
    for (const e of ring) {
      const key = displayMap.get(e.fromNode) || e.color!;
      resolved.add(key);
    }
    expect(resolved.size).toBe(1);
    expect([...resolved][0]).toBe(ring[0].color);
  });

  it("keeps two separate rings mapped to two different display colors", () => {
    const a1: CanvasTextNode = { id: "da1", type: "text", text: "A1", x: 100, y: 100, width: 80, height: 80 };
    const a2: CanvasTextNode = { id: "da2", type: "text", text: "A2", x: 260, y: 100, width: 80, height: 80 };
    const a3: CanvasTextNode = { id: "da3", type: "text", text: "A3", x: 260, y: 260, width: 80, height: 80 };
    const a4: CanvasTextNode = { id: "da4", type: "text", text: "A4", x: 100, y: 260, width: 80, height: 80 };
    const b1: CanvasTextNode = { id: "db1", type: "text", text: "B1", x: 900, y: 600, width: 80, height: 80 };
    const b2: CanvasTextNode = { id: "db2", type: "text", text: "B2", x: 1060, y: 600, width: 80, height: 80 };
    const b3: CanvasTextNode = { id: "db3", type: "text", text: "B3", x: 1060, y: 760, width: 80, height: 80 };
    const b4: CanvasTextNode = { id: "db4", type: "text", text: "B4", x: 900, y: 760, width: 80, height: 80 };

    const ringA = connectLoopNodes([a1, a2, a3, a4], [], "bezier", true);
    const allNodes = [a1, a2, a3, a4, b1, b2, b3, b4];
    const ringB = connectLoopNodes([b1, b2, b3, b4], ringA, "bezier", true, allNodes);
    const allEdges = [...ringA, ...ringB];

    const displayMap = computeSourceDisplayColorMap(allNodes, allEdges);

    const colorOf = (edges: CanvasEdge[]) => {
      const set = new Set<string>();
      for (const e of edges) set.add(displayMap.get(e.fromNode) || e.color!);
      return set;
    };

    const colorsA = colorOf(ringA);
    const colorsB = colorOf(ringB);

    expect(colorsA.size).toBe(1); // ring A is uniform
    expect(colorsB.size).toBe(1); // ring B is uniform
    expect([...colorsA][0]).not.toBe([...colorsB][0]); // and they differ
  });

  it("expands a single ring segment selection to the whole ring", () => {
    const nodes: CanvasTextNode[] = [
      { id: "x1", type: "text", text: "1", x: 100, y: 100, width: 80, height: 80 },
      { id: "x2", type: "text", text: "2", x: 300, y: 100, width: 80, height: 80 },
      { id: "x3", type: "text", text: "3", x: 300, y: 300, width: 80, height: 80 },
      { id: "x4", type: "text", text: "4", x: 100, y: 300, width: 80, height: 80 },
    ];
    const ring = connectLoopNodes(nodes, [], "bezier", true);
    // A dangling edge pointing to a node outside the ring — it can never
    // complete a cycle, so it must not be classified as a loop edge.
    const unrelated: CanvasEdge = { id: "solo", fromNode: "x1", toNode: "outside", color: "2" };
    const edges = [...ring, unrelated];

    // All ring edges are detected as loop edges
    const loopIds = getLoopEdgeIds(edges);
    expect(loopIds.size).toBe(4);
    expect(loopIds.has("solo")).toBe(false);

    // Selecting one segment expands to the full ring, leaving the chain edge out
    const expanded = expandLoopEdgeSelection(edges, [ring[0].id]);
    expect(expanded.size).toBe(4);
    expect(expanded.has("solo")).toBe(false);
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

  it("prefers vertical routing for tiered layouts even when connecting to outermost cards across wide horizontal distance", () => {
    // Lower card in bottom tier connecting to outermost card on the far left of upper tier
    // gapX is wide (800 - 360 = 440px), gapY is 360px
    const bottomCard: CanvasTextNode = { id: "bot-3", type: "text", text: "Bottom Card 3", x: 800, y: 600, width: 260, height: 140 };
    const topOutermostCard: CanvasTextNode = { id: "top-1", type: "text", text: "Top Card 1", x: 100, y: 100, width: 260, height: 140 };

    // Lower card must start from its top, and upper card must end at its bottom
    const sides = getOptimalAnchorSides(bottomCard, topOutermostCard);
    expect(sides).toEqual({ fromSide: "top", toSide: "bottom" });

    // Reverse: from top outermost card to lower card must start from bottom and end at top
    const reverseSides = getOptimalAnchorSides(topOutermostCard, bottomCard);
    expect(reverseSides).toEqual({ fromSide: "bottom", toSide: "top" });
  });

  it("ensures all edges from the same card/starting point share identical color, while different cards get distinct colors", () => {
    const cardA: CanvasTextNode = { id: "card-a", type: "text", text: "Card A", x: 0, y: 0, width: 200, height: 120 };
    const cardB: CanvasTextNode = { id: "card-b", type: "text", text: "Card B", x: 300, y: 0, width: 200, height: 120 };
    const target1: CanvasTextNode = { id: "t1", type: "text", text: "T1", x: 0, y: 300, width: 200, height: 120 };
    const target2: CanvasTextNode = { id: "t2", type: "text", text: "T2", x: 300, y: 300, width: 200, height: 120 };
    const target3: CanvasTextNode = { id: "t3", type: "text", text: "T3", x: 600, y: 300, width: 200, height: 120 };

    // Card A connects to multiple targets (1-to-many): all lines from Card A must be IDENTICAL in color
    const edgesFromA = connectOneToMany(cardA, [target1, target2, target3], []);
    expect(edgesFromA).toHaveLength(3);
    const colorA = edgesFromA[0].color;
    expect(edgesFromA.every((e) => e.color === colorA)).toBe(true);

    // Card A connects again: must still reuse that same color
    const nextColorA = getSourceNodeEdgeColor(cardA, edgesFromA);
    expect(nextColorA).toBe(colorA);

    // Card B (different card) connects: must automatically get a distinct color
    const edgesFromB = connectOneToMany(cardB, [target1, target2], edgesFromA);
    expect(edgesFromB).toHaveLength(2);
    const colorB = edgesFromB[0].color;
    expect(edgesFromB.every((e) => e.color === colorB)).toBe(true);
    expect(colorB).not.toBe(colorA);

    // If card has an explicit user-assigned color, all lines from it strictly use that color
    const coloredCard: CanvasTextNode = { id: "c-col", type: "text", text: "Colored", x: 0, y: 0, width: 200, height: 120, color: "2" };
    const edgesFromColored = connectOneToMany(coloredCard, [target1, target2], []);
    expect(edgesFromColored.every((e) => e.color === "2")).toBe(true);
  });

  it("automatically assigns distinct colors to different cards within the same container, while lines from the same card share color", () => {
    const group: CanvasGroupNode = {
      id: "group-box",
      type: "group",
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      label: "服务容器",
    };

    const card1: CanvasTextNode = { id: "c1", type: "text", text: "Card 1", x: 50, y: 50, width: 180, height: 100 };
    const card2: CanvasTextNode = { id: "c2", type: "text", text: "Card 2", x: 260, y: 50, width: 180, height: 100 };
    const card3: CanvasTextNode = { id: "c3", type: "text", text: "Card 3", x: 470, y: 50, width: 180, height: 100 };
    const targetA: CanvasTextNode = { id: "tA", type: "text", text: "Target A", x: 200, y: 800, width: 180, height: 100 };
    const targetB: CanvasTextNode = { id: "tB", type: "text", text: "Target B", x: 500, y: 800, width: 180, height: 100 };

    const allNodes = [group, card1, card2, card3, targetA, targetB];

    // Card 1 initiates first connection
    const color1 = getSourceNodeEdgeColor(card1, [], allNodes);
    expect(color1).toBeDefined();

    // Card 1 initiates multiple connections -> all share the SAME color
    const edgesCard1 = [
      { id: "e1", fromNode: card1.id, toNode: targetA.id, color: color1 },
      { id: "e2", fromNode: card1.id, toNode: targetB.id, color: color1 },
    ];
    const color1Again = getSourceNodeEdgeColor(card1, edgesCard1, allNodes);
    expect(color1Again).toBe(color1);

    // Card 2 in the SAME container initiates connection -> must receive a DIFFERENT color
    const color2 = getSourceNodeEdgeColor(card2, edgesCard1, allNodes);
    expect(color2).not.toBe(color1);

    const edgesCard2 = [
      ...edgesCard1,
      { id: "e3", fromNode: card2.id, toNode: targetA.id, color: color2 },
    ];

    // Card 3 in the SAME container initiates connection -> must receive a DIFFERENT color from both Card 1 and Card 2
    const color3 = getSourceNodeEdgeColor(card3, edgesCard2, allNodes);
    expect(color3).not.toBe(color1);
    expect(color3).not.toBe(color2);

    // connectOneToMany with container nodes
    const autoEdgesCard2 = connectOneToMany(card2, [targetA, targetB], edgesCard1, "bezier", allNodes);
    expect(autoEdgesCard2.every((e) => e.color === color2)).toBe(true);
    expect(autoEdgesCard2[0].color).not.toBe(color1);
  });

  it("aligns nodes along horizontal, vertical, and distributed directions accurately", () => {
    const nodeA: CanvasTextNode = { id: "a", type: "text", text: "A", x: 100, y: 100, width: 100, height: 100 };
    const nodeB: CanvasTextNode = { id: "b", type: "text", text: "B", x: 300, y: 200, width: 100, height: 200 };
    const nodeC: CanvasTextNode = { id: "c", type: "text", text: "C", x: 500, y: 300, width: 100, height: 100 };
    const untouched: CanvasTextNode = { id: "u", type: "text", text: "U", x: 999, y: 999, width: 50, height: 50 };

    const nodes = [nodeA, nodeB, nodeC, untouched];
    const selIds = new Set(["a", "b", "c"]);

    // Horizontal Alignment: aligns along the horizontal center line
    // minY = 100, maxY = 400 (from nodeB y:200 + h:200). centerY = 250.
    const hAligned = alignNodes(nodes, selIds, "horizontal");
    const hA = hAligned.find((n) => n.id === "a")!;
    const hB = hAligned.find((n) => n.id === "b")!;
    const hC = hAligned.find((n) => n.id === "c")!;
    expect(hA.y + hA.height / 2).toBe(250);
    expect(hB.y + hB.height / 2).toBe(250);
    expect(hC.y + hC.height / 2).toBe(250);
    expect(hAligned.find((n) => n.id === "u")!.x).toBe(999);

    // Vertical Alignment: aligns along the vertical center line
    // minX = 100, maxX = 600 (from nodeC x:500 + w:100). centerX = 350.
    const vAligned = alignNodes(nodes, selIds, "vertical");
    const vA = vAligned.find((n) => n.id === "a")!;
    const vB = vAligned.find((n) => n.id === "b")!;
    const vC = vAligned.find((n) => n.id === "c")!;
    expect(vA.x + vA.width / 2).toBe(350);
    expect(vB.x + vB.width / 2).toBe(350);
    expect(vC.x + vC.width / 2).toBe(350);

    // Left alignment: minX is 100
    const leftAligned = alignNodes(nodes, selIds, "left");
    expect(leftAligned.filter((n) => selIds.has(n.id)).every((n) => n.x === 100)).toBe(true);

    // Right alignment: maxX is 600, each node x = 600 - width
    const rightAligned = alignNodes(nodes, selIds, "right");
    expect(rightAligned.find((n) => n.id === "a")!.x).toBe(500);

    // Top alignment: minY is 100
    const topAligned = alignNodes(nodes, selIds, "top");
    expect(topAligned.filter((n) => selIds.has(n.id)).every((n) => n.y === 100)).toBe(true);

    // Bottom alignment: maxY is 400
    const bottomAligned = alignNodes(nodes, selIds, "bottom");
    expect(bottomAligned.find((n) => n.id === "a")!.y).toBe(300);
    expect(bottomAligned.find((n) => n.id === "b")!.y).toBe(200);

    // Distribute horizontally
    const distH = alignNodes(nodes, selIds, "distribute-h");
    const dhA = distH.find((n) => n.id === "a")!;
    const dhB = distH.find((n) => n.id === "b")!;
    const dhC = distH.find((n) => n.id === "c")!;
    const gap1 = dhB.x - (dhA.x + dhA.width);
    const gap2 = dhC.x - (dhB.x + dhB.width);
    expect(gap1).toBe(gap2);
  });

  it("assigns distinct colors when source cards in different containers initiate connections", () => {
    const containerA: CanvasGroupNode = { id: "contA", type: "group", label: "Group A", x: 0, y: 0, width: 300, height: 400 };
    const containerB: CanvasGroupNode = { id: "contB", type: "group", label: "Group B", x: 400, y: 0, width: 300, height: 400 };
    const cardA1: CanvasTextNode = { id: "ca1", type: "text", text: "A1", x: 20, y: 50, width: 200, height: 80 };
    const cardB1: CanvasTextNode = { id: "cb1", type: "text", text: "B1", x: 420, y: 50, width: 200, height: 80 };
    const allNodes = [containerA, containerB, cardA1, cardB1];

    const colorA = getSourceNodeEdgeColor(cardA1, [], allNodes);
    expect(colorA).toBeDefined();

    const edgesA = [
      { id: "ea1", fromNode: cardA1.id, toNode: cardB1.id, color: colorA },
    ];

    // Card B in container B initiates connections -> must pick a color unused by Card A on canvas!
    const colorB = getSourceNodeEdgeColor(cardB1, edgesA, allNodes);
    expect(colorB).toBeDefined();
    expect(colorB).not.toBe(colorA);
  });

  it("renders origin dot circles for directed lines in exportCanvasToSvg", () => {
    const nodeA: CanvasTextNode = { id: "na", type: "text", text: "Node A", x: 0, y: 0, width: 200, height: 100 };
    const nodeB: CanvasTextNode = { id: "nb", type: "text", text: "Node B", x: 300, y: 0, width: 200, height: 100 };
    const directedEdge: CanvasEdge = {
      id: "e1",
      fromNode: "na",
      fromSide: "right",
      fromEnd: "none",
      toNode: "nb",
      toSide: "left",
      toEnd: "arrow",
      color: "1",
    };
    const svg = exportCanvasToSvg({ nodes: [nodeA, nodeB], edges: [directedEdge] });
    expect(svg).toContain("<circle cx=");
    expect(svg).toContain('r="3.5"');
  });

  it("keeps aligned geometry identical between state and the exported SVG (preview == export)", () => {
    const a: CanvasTextNode = { id: "a", type: "text", text: "A", x: 0, y: 0, width: 200, height: 100 };
    const b: CanvasTextNode = { id: "b", type: "text", text: "B", x: 300, y: 260, width: 200, height: 100 };
    const c: CanvasTextNode = { id: "c", type: "text", text: "C", x: 600, y: 90, width: 200, height: 100 };

    // Center-align the three cards on the horizontal midline
    const aligned = alignNodes([a, b, c], ["a", "b", "c"], "horizontal");
    const picked = ["a", "b", "c"].map((id) => aligned.find((n) => n.id === id)!);

    // Every center shares the exact same Y
    const centersY = picked.map((n) => n.y + n.height / 2);
    expect(new Set(centersY).size).toBe(1);

    // The exported SVG must place the cards at exactly those coordinates,
    // which is what makes "preview" and "export" agree.
    const svg = exportCanvasToSvg({ nodes: aligned, edges: [] }, { theme: "light" });
    for (const n of picked) {
      expect(svg).toContain(
        `<foreignObject x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}">`
      );
    }
  });

  it("arranges multiple cards evenly on a circle (ring alignment)", () => {
    // Five cards scattered roughly around a centre at (500, 400)
    const nodes: CanvasTextNode[] = [
      { id: "r1", type: "text", text: "1", x: 460, y: 100, width: 80, height: 80 },
      { id: "r2", type: "text", text: "2", x: 800, y: 360, width: 80, height: 80 },
      { id: "r3", type: "text", text: "3", x: 700, y: 660, width: 80, height: 80 },
      { id: "r4", type: "text", text: "4", x: 260, y: 660, width: 80, height: 80 },
      { id: "r5", type: "text", text: "5", x: 160, y: 360, width: 80, height: 80 },
    ];
    const ids = nodes.map((n) => n.id);

    const aligned = alignNodesInCircle(nodes, ids);
    const placed = ids.map((id) => aligned.find((n) => n.id === id)!);

    // Centre = bounding-box centre of the original selection
    const minX = Math.min(...nodes.map((n) => n.x));
    const maxX = Math.max(...nodes.map((n) => n.x + n.width));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxY = Math.max(...nodes.map((n) => n.y + n.height));
    const cx = minX + (maxX - minX) / 2;
    const cy = minY + (maxY - minY) / 2;

    // 1. Every card centre sits at the same distance from the ring centre
    //    (integer coordinate rounding leaves at most a sub-pixel deviation)
    const radii = placed.map((n) => Math.hypot(n.x + n.width / 2 - cx, n.y + n.height / 2 - cy));
    radii.forEach((r) => expect(Math.abs(r - radii[0])).toBeLessThan(1.5));

    // 2. Cards are evenly spaced in angle (2π / N apart)
    const angles = placed
      .map((n) => Math.atan2(n.y + n.height / 2 - cy, n.x + n.width / 2 - cx))
      .map((a) => (a + 2 * Math.PI) % (2 * Math.PI))
      .sort((a, b) => a - b);
    const expectedStep = (2 * Math.PI) / placed.length;
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i] - angles[i - 1]).toBeCloseTo(expectedStep, 1);
    }

    // 3. The ring must not collapse inward
    const originalMaxRadius = Math.max(
      ...nodes.map((n) => Math.hypot(n.x + n.width / 2 - cx, n.y + n.height / 2 - cy))
    );
    expect(radii[0]).toBeGreaterThanOrEqual(originalMaxRadius - 1);
  });

  it("preserves clockwise order when arranging a ring, matching loop edges", () => {
    const nodes: CanvasTextNode[] = [
      { id: "t", type: "text", text: "top", x: 460, y: 100, width: 80, height: 80 },
      { id: "r", type: "text", text: "right", x: 800, y: 360, width: 80, height: 80 },
      { id: "b", type: "text", text: "bottom", x: 460, y: 620, width: 80, height: 80 },
      { id: "l", type: "text", text: "left", x: 120, y: 360, width: 80, height: 80 },
    ];

    const aligned = alignNodesInCircle(nodes, ["t", "r", "b", "l"]);
    const centreX = 120 + (800 + 80 - 120) / 2;
    const centreY = 100 + (620 + 80 - 100) / 2;

    const angleOf = (id: string) => {
      const n = aligned.find((x) => x.id === id)!;
      return Math.atan2(n.y + n.height / 2 - centreY, n.x + n.width / 2 - centreX);
    };

    // top(-90°) -> right(0°) -> bottom(90°) -> left(180°) is a clockwise ring
    const order = ["t", "r", "b", "l"].map(angleOf);
    expect(order[1]).toBeGreaterThan(order[0]);
    expect(order[2]).toBeGreaterThan(order[1]);
    expect(order[3]).toBeGreaterThan(order[2]);
  });

  it("leaves selections smaller than 3 cards untouched for ring alignment", () => {
    const a: CanvasTextNode = { id: "a", type: "text", text: "A", x: 0, y: 0, width: 100, height: 80 };
    const b: CanvasTextNode = { id: "b", type: "text", text: "B", x: 400, y: 260, width: 100, height: 80 };
    const result = alignNodes([a, b], ["a", "b"], "circle");
    expect(result.find((n) => n.id === "a")).toMatchObject({ x: 0, y: 0 });
    expect(result.find((n) => n.id === "b")).toMatchObject({ x: 400, y: 260 });
  });

  it("honours an explicit radius when ring-aligning", () => {
    const nodes: CanvasTextNode[] = [
      { id: "p1", type: "text", text: "1", x: 0, y: 0, width: 60, height: 60 },
      { id: "p2", type: "text", text: "2", x: 300, y: 0, width: 60, height: 60 },
      { id: "p3", type: "text", text: "3", x: 150, y: 300, width: 60, height: 60 },
    ];
    const cx = 0 + (300 + 60 - 0) / 2;
    const cy = 0 + (300 + 60 - 0) / 2;

    const aligned = alignNodesInCircle(nodes, ["p1", "p2", "p3"], { radius: 250 });
    for (const n of aligned) {
      const r = Math.hypot(n.x + n.width / 2 - cx, n.y + n.height / 2 - cy);
      expect(r).toBeCloseTo(250, 0);
    }
  });

  it("arranges cards into a rectangular grid with aligned rows and columns", () => {
    const nodes: CanvasTextNode[] = [1, 2, 3, 4, 5, 6].map((i) => ({
      id: `g${i}`,
      type: "text" as const,
      text: `Card ${i}`,
      x: i * 90,
      y: i * 70,
      width: 160,
      height: 100,
    }));
    const ids = nodes.map((n) => n.id);

    // 6 cards -> squarish grid of 3 columns x 2 rows
    const aligned = alignNodesInGrid(nodes, ids);
    const placed = ids.map((id) => aligned.find((n) => n.id === id)!);

    // Group by row (Y) and column (X) using rounded coordinates
    const rows = new Map<number, string[]>();
    const cols = new Map<number, string[]>();
    for (const n of placed) {
      const r = rows.get(n.y) ?? [];
      r.push(n.id);
      rows.set(n.y, r);
      const c = cols.get(n.x) ?? [];
      c.push(n.id);
      cols.set(n.x, c);
    }

    // 3 columns and 2 rows of distinct coordinates => a real grid
    expect(cols.size).toBe(3);
    expect(rows.size).toBe(2);
    // Each row holds 3 cards, each column holds 2
    rows.forEach((ids2) => expect(ids2.length).toBe(3));
    cols.forEach((ids2) => expect(ids2.length).toBe(2));

    // Uniform gutters: consecutive columns are evenly spaced
    const xs = [...cols.keys()].sort((a, b) => a - b);
    expect(xs[1] - xs[0]).toBe(xs[2] - xs[1]);
  });

  it("detects a rectangular grid layout and rejects free-form arrangements", () => {
    // 2x3 grid produced by alignNodesInGrid
    const cards: CanvasTextNode[] = [1, 2, 3, 4, 5, 6].map((i) => ({
      id: `q${i}`,
      type: "text" as const,
      text: `Card ${i}`,
      x: i * 100,
      y: i * 80,
      width: 160,
      height: 100,
    }));
    const gridNodes = alignNodesInGrid(cards, cards.map((n) => n.id));
    const layout = computeGridLayout(gridNodes);

    expect(layout).not.toBeNull();
    expect(layout!.cols).toBe(3);
    expect(layout!.rows).toBe(2);
    expect(layout!.orderedIds).toHaveLength(6);

    // Free-form (diagonal) arrangement is not a grid
    const diagonal: CanvasTextNode[] = [1, 2, 3, 4].map((i) => ({
      id: `d${i}`,
      type: "text" as const,
      text: `Card ${i}`,
      x: i * 137,
      y: i * 93,
      width: 100,
      height: 80,
    }));
    expect(computeGridLayout(diagonal)).toBeNull();
  });

  it("keeps the anchor card pinned when re-flowing a grid", () => {
    const cards: CanvasTextNode[] = [1, 2, 3, 4].map((i) => ({
      id: `a${i}`,
      type: "text" as const,
      text: `Card ${i}`,
      x: i * 60,
      y: i * 50,
      width: 120,
      height: 80,
    }));
    const ids = cards.map((n) => n.id);

    // First lay them out, then pin the second card where it currently is
    const laidOut = alignNodesInGrid(cards, ids, { columns: 2, gapX: 40, gapY: 40 });
    const anchorBefore = laidOut.find((n) => n.id === "a2")!;

    const anchored = alignNodesInGrid(laidOut, ids, {
      columns: 2,
      gapX: 120,
      gapY: 40,
      anchorNodeId: "a2",
    });
    const anchorAfter = anchored.find((n) => n.id === "a2")!;

    // The anchor must not move...
    expect(anchorAfter.x).toBe(anchorBefore.x);
    expect(anchorAfter.y).toBe(anchorBefore.y);

    // ...while the gutter really did grow (columns are further apart)
    const xs = [...new Set(anchored.map((n) => n.x))].sort((a, b) => a - b);
    expect(xs[1] - xs[0]).toBeGreaterThan(120);
  });

  it("marks loop edges as straight segments on a grid and clears it off-grid", () => {
    const cards: CanvasTextNode[] = [1, 2, 3, 4].map((i) => ({
      id: `m${i}`,
      type: "text" as const,
      text: `Card ${i}`,
      x: i * 70,
      y: i * 55,
      width: 140,
      height: 90,
    }));
    const ids = cards.map((n) => n.id);

    // A ring formed on a scattered layout carries no grid flag
    const loopEdges = connectLoopNodes(cards, [], "bezier", true);
    for (const e of loopEdges) expect(e.gridPath).toBeUndefined();

    // Once arranged as a grid, the loop edges become straight segments
    const gridNodes = alignNodesInGrid(cards, ids);
    const gridEdges = syncGridEdges(gridNodes, loopEdges, ids);
    for (const e of gridEdges) expect(e.gridPath).toBe(true);

    // Breaking the grid clears the flag again
    const scattered = gridNodes.map((n, i) => ({ ...n, x: n.x + i * 37, y: n.y + i * 29 }));
    const cleared = syncGridEdges(scattered, gridEdges, ids);
    for (const e of cleared) expect(e.gridPath).toBeUndefined();
  });

  it("widens the gutters when dragging a card inside a grid", () => {
    const cards: CanvasTextNode[] = [1, 2, 3, 4].map((i) => ({
      id: `r${i}`,
      type: "text" as const,
      text: `Card ${i}`,
      x: i * 60,
      y: i * 45,
      width: 120,
      height: 80,
    }));
    const ids = cards.map((n) => n.id);
    const laidOut = alignNodesInGrid(cards, ids, { columns: 2, gapX: 40, gapY: 40 });
    const layout = computeGridLayout(laidOut)!;

    // Drag the top-right card 80px to the right
    const draggedId = layout.orderedIds[1];
    const startById = new Map(layout.orderedIds.map((id) => [id, laidOut.find((n) => n.id === id)!]));
    const startPos = startById.get(draggedId)!;

    const moved = laidOut.map((n) =>
      n.id === draggedId ? { ...n, x: startPos.x + 80, y: startPos.y } : n
    );
    const result = resizeGridSpacing(moved, layout, draggedId, 80, 0, layout.gapX, layout.gapY);

    // The dragged card stays where the pointer put it
    const afterDrag = result.find((n) => n.id === draggedId)!;
    expect(afterDrag.x).toBe(startPos.x + 80);

    // Columns are now further apart than before
    const xsBefore = [...new Set(laidOut.map((n) => n.x))].sort((a, b) => a - b);
    const xsAfter = [...new Set(result.map((n) => n.x))].sort((a, b) => a - b);
    expect(xsAfter[1] - xsAfter[0]).toBeGreaterThan(xsBefore[1] - xsBefore[0]);
  });

  it("detects a circular layout and turns loop edges into true arcs", () => {
    // Lay 6 cards out on a circle first
    const nodes: CanvasTextNode[] = [0, 1, 2, 3, 4, 5].map((i) => ({
      id: `c${i}`,
      type: "text" as const,
      text: `Card ${i}`,
      x: 500 + 300 * Math.cos((i * Math.PI) / 3),
      y: 500 + 300 * Math.sin((i * Math.PI) / 3),
      width: 80,
      height: 80,
    }));

    // The layout must be recognised as a ring
    const layout = computeRingLayout(nodes);
    expect(layout).not.toBeNull();
    expect(layout!.radius).toBeCloseTo(300, 0);

    // Loop edges created on a circular layout become circular arcs
    const ringEdges = connectLoopNodes(nodes, [], "bezier", true);
    expect(ringEdges).toHaveLength(6);
    for (const e of ringEdges) {
      expect(e.ringCenter).toBeDefined();
      expect(e.ringRadius).toBeCloseTo(300, 0);
    }

    // Every segment renders as an SVG arc (A command) with the same radius,
    // so the whole loop draws one perfect circle.
    const ring = { center: ringEdges[0].ringCenter!, radius: ringEdges[0].ringRadius! };
    for (const e of ringEdges) {
      const from = nodes.find((n) => n.id === e.fromNode)!;
      const to = nodes.find((n) => n.id === e.toNode)!;
      const p1 = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
      const p2 = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
      const d = computeEdgePath(p1, "right", p2, "left", "bezier", undefined, ring);
      expect(d).toMatch(/^M [\d.-]+ [\d.-]+ A 300 300 0 0 [01] [\d.-]+ [\d.-]+$/);
    }
  });

  it("does not treat a plain row of cards as a ring", () => {
    const row: CanvasTextNode[] = [1, 2, 3, 4].map((i) => ({
      id: `r${i}`,
      type: "text" as const,
      text: `Card ${i}`,
      x: i * 240,
      y: 0,
      width: 160,
      height: 100,
    }));
    expect(computeRingLayout(row)).toBeNull();

    // Chained edges on a non-circular layout keep their normal curve
    const chain = connectChainNodes(row, [], "bezier", true);
    for (const e of chain) {
      expect(e.ringCenter).toBeUndefined();
    }
  });

  it("syncs ring arcs when cards are ring-aligned, and clears them afterwards", () => {
    // Six cards in a row (a 3x2 grid is deliberately not co-circular, while a
    // 2x2 square would be, so six cards keep this test unambiguous).
    const base: CanvasTextNode[] = [1, 2, 3, 4, 5, 6].map((i) => ({
      id: `s${i}`,
      type: "text" as const,
      text: `Card ${i}`,
      x: i * 240,
      y: 0,
      width: 160,
      height: 100,
    }));
    const ids = base.map((n) => n.id);

    // Form a closed loop first (not yet circular -> no ring metadata)
    const loopEdges = connectLoopNodes(base, [], "bezier", true);
    expect(loopEdges).toHaveLength(6);
    for (const e of loopEdges) expect(e.ringCenter).toBeUndefined();

    // Now ring-align the cards: the loop edges must adopt the arc
    const ringNodes = alignNodesInCircle(base, ids);
    const syncedEdges = syncRingEdges(ringNodes, loopEdges, ids);
    for (const e of syncedEdges) {
      expect(e.ringCenter).toBeDefined();
      expect(e.ringRadius).toBeGreaterThan(0);
    }

    // Switching back to a grid layout clears the arcs again
    const gridNodes = alignNodesInGrid(ringNodes, ids);
    const clearedEdges = syncRingEdges(gridNodes, syncedEdges, ids);
    for (const e of clearedEdges) {
      expect(e.ringCenter).toBeUndefined();
      expect(e.ringRadius).toBeUndefined();
    }
  });

  it("prefers a rectangular grid over a circle when both tests match", () => {
    // A 2x2 square satisfies BOTH tests: its four corners are exactly
    // equidistant from the centroid (circle) and it is a complete grid. The
    // grid must win, otherwise the loop would be drawn as an arc.
    const cards: CanvasTextNode[] = [1, 2, 3, 4].map((i) => ({
      id: `g${i}`,
      type: "text" as const,
      text: `Card ${i}`,
      x: i * 80,
      y: i * 60,
      width: 180,
      height: 120,
    }));
    const ids = cards.map((n) => n.id);
    const gridNodes = alignNodesInGrid(cards, ids, { columns: 2, gapX: 60, gapY: 60 });

    // Sanity: this layout is genuinely ambiguous
    expect(computeRingLayout(gridNodes)).not.toBeNull();
    expect(computeGridLayout(gridNodes)).not.toBeNull();

    const loopEdges = connectLoopNodes(gridNodes, [], "bezier", true);
    expect(loopEdges).toHaveLength(4);
    for (const e of loopEdges) {
      expect(e.gridPath).toBe(true);
      expect(e.ringCenter).toBeUndefined();
      expect(e.ringRadius).toBeUndefined();
    }

    // Even if stale arc metadata sneaks in, the sync clears it in favour of
    // the rectangular frame.
    const contaminated = loopEdges.map((e) => ({
      ...e,
      ringCenter: { x: 0, y: 0 },
      ringRadius: 999,
    }));
    const cleaned = syncLoopEdgeGeometry(gridNodes, contaminated);
    for (const e of cleaned) {
      expect(e.gridPath).toBe(true);
      expect(e.ringCenter).toBeUndefined();
    }
  });

  it("recomputes ring geometry so a closed loop follows its cards", () => {
    const cards: CanvasTextNode[] = [1, 2, 3, 4, 5, 6].map((i) => ({
      id: `f${i}`,
      type: "text" as const,
      text: `Card ${i}`,
      x: i * 200,
      y: 0,
      width: 160,
      height: 100,
    }));
    const ids = cards.map((n) => n.id);

    const ringNodes = alignNodesInCircle(cards, ids);
    const loopEdges = connectLoopNodes(ringNodes, [], "bezier", true);
    const centerBefore = loopEdges[0].ringCenter!;
    expect(centerBefore).toBeDefined();

    // Translate the whole ring: the stored centre must move with the cards,
    // otherwise the arc stays behind and visibly detaches.
    const moved = ringNodes.map((n) => ({ ...n, x: n.x + 250, y: n.y + 130 }));
    const synced = syncLoopEdgeGeometry(moved, loopEdges);
    for (const e of synced) {
      expect(e.ringCenter!.x).toBeCloseTo(centerBefore.x + 250, 3);
      expect(e.ringCenter!.y).toBeCloseTo(centerBefore.y + 130, 3);
      expect(e.ringRadius).toBeCloseTo(loopEdges[0].ringRadius!, 3);
    }
  });

  it("clears loop metadata once the cards no longer form a ring or a grid", () => {
    const cards: CanvasTextNode[] = [1, 2, 3, 4, 5, 6].map((i) => ({
      id: `z${i}`,
      type: "text" as const,
      text: `Card ${i}`,
      x: i * 200,
      y: 0,
      width: 160,
      height: 100,
    }));
    const ids = cards.map((n) => n.id);
    const ringNodes = alignNodesInCircle(cards, ids);
    const loopEdges = connectLoopNodes(ringNodes, [], "bezier", true);

    // Scatter them into a free-form layout
    const scattered = ringNodes.map((n, i) => ({
      ...n,
      x: n.x + i * 31,
      y: n.y + i * 47,
    }));
    const synced = syncLoopEdgeGeometry(scattered, loopEdges);
    for (const e of synced) {
      expect(e.ringCenter).toBeUndefined();
      expect(e.ringRadius).toBeUndefined();
      expect(e.gridPath).toBeUndefined();
    }
  });

  it("projects anchor points exactly onto the ring circle", () => {
    const ring = { center: { x: 100, y: 100 }, radius: 200 };
    const projected = projectPointOntoRing({ x: 400, y: 100 }, ring);
    expect(Math.hypot(projected.x - 100, projected.y - 100)).toBeCloseTo(200, 5);
    expect(projected.x).toBeCloseTo(300, 5);
    expect(projected.y).toBeCloseTo(100, 5);
  });

  it("exports the hub badge for one-to-many sources with the exact edge count", () => {
    const hub: CanvasTextNode = { id: "hub", type: "text", text: "Hub", x: 0, y: 0, width: 200, height: 100 };
    const targets: CanvasTextNode[] = [1, 2, 3].map((i) => ({
      id: `t${i}`,
      type: "text" as const,
      text: `Target ${i}`,
      x: 400,
      y: i * 140,
      width: 200,
      height: 100,
    }));

    const edges = connectOneToMany(hub, targets, [], "bezier", [hub, ...targets]);
    expect(edges).toHaveLength(3);

    const svg = exportCanvasToSvg({ nodes: [hub, ...targets], edges }, { theme: "light" });
    expect(svg).toContain("🌱 发起源 · 3");
    expect(svg).toContain('class="ks-badge"');
    // Targets only emit no edges, so they must NOT be flagged as hubs
    expect(svg).not.toContain("🌱 发起源 · 1");
  });
});



