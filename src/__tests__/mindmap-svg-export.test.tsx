import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildStandaloneMindmapSvg } from "../services/mindmapSvgExport";
import { MindmapView } from "../components/MindmapView";

/**
 * The file that leaves the app, for both formats.
 *
 * What the canvas looks like on screen is not what a file has to contain: the
 * pan and zoom are the reader's position rather than the map's, half the elements
 * are controls, and the colours come from a stylesheet that does not travel with
 * the file. Each of those is a test below.
 *
 * The PNG export is this same string rasterised, so these checks cover both
 * formats — which is the reason the two share one function. The last test is
 * there because a converter nobody can reach is not a feature.
 */

const SVG = "http://www.w3.org/2000/svg";

function el(tag: string, attrs: Record<string, string>, children: Element[] = []): SVGElement {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  children.forEach((child) => node.appendChild(child));
  return node;
}

/** A canvas shaped like the real one, with one of everything the reader sees. */
function canvasFixture(): SVGSVGElement {
  const viewport = el("g", { class: "mindmap-viewport", transform: "translate(120, 40) scale(1.5)" }, [
    el("rect", {
      class: "mindmap-node-rect",
      width: "80",
      height: "36",
      style: "fill: #ff0000; stroke: #00ff00; stroke-width: 2",
    }),
    el("rect", { class: "mindmap-node-rect-underline", width: "80", height: "36" }),
    el("circle", { class: "mindmap-collapse-circle", r: "7" }),
    el("text", { class: "mindmap-node-title-text root-title", style: "" }, [el("tspan", {}, [])]),
    el("text", { class: "mindmap-node-title-text", style: "font-size: 11px" }, [el("tspan", {}, [])]),
    el("rect", { class: "mindmap-node-selection-ring", width: "86", height: "42" }),
    el("rect", { class: "mindmap-node-add-btn", width: "14", height: "14" }),
    el("g", { class: "mindmap-node-resize-handle" }),
  ]);

  return el("svg", { width: "100%", height: "100%" }, [viewport]) as SVGSVGElement;
}

const BOUNDS = { minX: 40, minY: 40, width: 600, height: 400 };

describe("导出的独立 SVG", () => {
  it("尺寸按内容加内边距给出", () => {
    const result = buildStandaloneMindmapSvg(canvasFixture(), { bounds: BOUNDS, dark: false });

    expect(result).not.toBeNull();
    expect(result!.width).toBe(680);
    expect(result!.height).toBe(480);
    // The bounds already carry their own padding, so the view box starts at 0.
    expect(result!.svg).toContain('viewBox="0 0 680 480"');
    expect(result!.svg).toContain('width="680"');
    expect(result!.svg).toContain('height="480"');
  });

  it("没有画布时返回 null，调用方不必各自判断", () => {
    expect(buildStandaloneMindmapSvg(null, { bounds: BOUNDS, dark: false })).toBeNull();
  });

  it("去掉平移与缩放：文件不该停在读者当时的位置", () => {
    const result = buildStandaloneMindmapSvg(canvasFixture(), { bounds: BOUNDS, dark: false })!;

    expect(result.svg).toContain('class="mindmap-viewport"');
    expect(result.svg).not.toContain("scale(1.5)");
    expect(result.svg).not.toContain("translate(120, 40)");
  });

  it("去掉只属于交互的元素：选择框、添加按钮、缩放手柄", () => {
    const result = buildStandaloneMindmapSvg(canvasFixture(), { bounds: BOUNDS, dark: false })!;

    expect(result.svg).not.toContain("mindmap-node-selection-ring");
    expect(result.svg).not.toContain("mindmap-node-add-btn");
    expect(result.svg).not.toContain("mindmap-node-resize-handle");
    // ...while the parts that are the drawing stay.
    expect(result.svg).toContain("mindmap-node-rect");
    expect(result.svg).toContain("mindmap-collapse-circle");
  });

  it("节点自己设的颜色保留，没设的落成字面色值", () => {
    const light = buildStandaloneMindmapSvg(canvasFixture(), { bounds: BOUNDS, dark: false })!;
    // Read back through the CSSOM, which serialises a colour as rgb() rather
    // than as the hex it was written as. Same colour, and valid in a file.
    expect(light.svg).toContain('fill="rgb(255, 0, 0)"');
    expect(light.svg).toContain('stroke="rgb(0, 255, 0)"');
    expect(light.svg).toContain('stroke-width="2"');
    expect(light.svg).toContain('fill="#ffffff"');

    const dark = buildStandaloneMindmapSvg(canvasFixture(), { bounds: BOUNDS, dark: true })!;
    expect(dark.svg).toContain('fill="#1e293b"');
    // The node's own colour is still its own.
    expect(dark.svg).toContain('fill="rgb(255, 0, 0)"');
  });

  it("线条为下划线形状的节点保持透明填充", () => {
    const result = buildStandaloneMindmapSvg(canvasFixture(), { bounds: BOUNDS, dark: false })!;

    expect(result.svg).toContain('class="mindmap-node-rect-underline"');
    expect(result.svg).toContain('fill="transparent"');
  });

  it("文字带上字族，打开文件的机器没有本应用的样式表", () => {
    const result = buildStandaloneMindmapSvg(canvasFixture(), { bounds: BOUNDS, dark: false })!;

    expect(result.svg).toContain("font-family=");
    expect(result.svg).toContain("Segoe UI");
    // A size the document set is kept; the rest gets a literal.
    expect(result.svg).toContain('font-size="11px"');
    expect(result.svg).toContain('font-size="14px"');
    expect(result.svg).toContain('font-weight="700"');
  });

  it("带着命名空间，且只带一次", () => {
    // Without it a browser and Inkscape both refuse the file; with it twice the
    // file is not valid XML at all, since an element cannot carry the same
    // attribute twice. The serializer supplies it because the element is in the
    // SVG namespace, and this test failed the first time it ran because the
    // module was setting it by hand on top of that.
    const result = buildStandaloneMindmapSvg(canvasFixture(), { bounds: BOUNDS, dark: false })!;

    expect(result.svg).toContain(`xmlns="${SVG}"`);
    expect(result.svg.split(`xmlns="${SVG}"`)).toHaveLength(2);
  });

  it("内边距可调", () => {
    const result = buildStandaloneMindmapSvg(canvasFixture(), {
      bounds: BOUNDS,
      dark: false,
      padding: 0,
    })!;

    expect(result.width).toBe(600);
    expect(result.svg).toContain('viewBox="40 40 600 400"');
  });
});

describe("导出菜单里的 SVG", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("点它真的产出一个 SVG 文件", () => {
    // jsdom has no object URLs, and the anchor click is what the browser would
    // act on, so the blob handed to createObjectURL is the observable end of the
    // journey: a file was produced, and it says what it is.
    const produced: Blob[] = [];
    // jsdom cannot navigate, so the anchor click it is asked to perform is
    // stubbed out rather than left to warn about a download it cannot do.
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: (blob: Blob) => {
        produced.push(blob);
        return "blob:test";
      },
      revokeObjectURL: () => {},
    });

    render(<MindmapView title="测试" source={"- 父节点\n  - 子节点\n- 第二个分支"} />);

    fireEvent.click(screen.getByRole("button", { name: /导出/ }));
    fireEvent.click(screen.getByText("导出 SVG 矢量图"));

    expect(produced).toHaveLength(1);
    expect(produced[0].type).toBe("image/svg+xml;charset=utf-8");
    expect(produced[0].size).toBeGreaterThan(0);
  });
});
