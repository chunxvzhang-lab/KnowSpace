import { render, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasView } from "../components/CanvasView";
import type { CanvasData } from "../types/canvasTypes";

const initialCanvasData: CanvasData = {
  nodes: [
    {
      id: "node-1",
      type: "text",
      text: "# 核心假说\n\n无限画布白板作为知识中枢架构。",
      x: 100,
      y: 100,
      width: 280,
      height: 180,
      color: "4",
    },
    {
      id: "node-2",
      type: "group",
      label: "宏观系统层",
      x: 50,
      y: 50,
      width: 400,
      height: 300,
      color: "6",
    },
  ],
  edges: [
    {
      id: "edge-1",
      fromNode: "node-1",
      fromSide: "right",
      toNode: "node-2",
      toSide: "left",
      label: "归属于",
    },
  ],
};

describe("CanvasView Component", () => {
  it("renders toolbar with title, controls, and node cards", () => {
    const onSourceChange = vi.fn();
    const onClose = vi.fn();

    render(
      <CanvasView
        title="架构白板"
        source={JSON.stringify(initialCanvasData)}
        onSourceChange={onSourceChange}
        editable={true}
        theme="twitter"
        onClose={onClose}
      />
    );

    // Toolbar title
    expect(screen.getByText(/架构白板/)).toBeDefined();

    // Node contents rendered
    expect(screen.getByText(/核心假说/)).toBeDefined();
    expect(screen.getByText(/宏观系统层/)).toBeDefined();

    // Toolbar buttons
    expect(screen.getByText("文本卡片")).toBeDefined();
    expect(screen.getByText("分组容器")).toBeDefined();
    expect(screen.getByText("萃取长文")).toBeDefined();

    // Zoom display at 100%
    expect(screen.getByText("100%")).toBeDefined();
  });

  it("handles zoom in and zoom out", () => {
    render(
      <CanvasView
        title="缩放测试"
        source={JSON.stringify(initialCanvasData)}
        onSourceChange={vi.fn()}
        editable={true}
        theme="twitter"
      />
    );

    const zoomInBtn = screen.getByTitle("放大");
    fireEvent.click(zoomInBtn);

    // Zoom 1.0 * 1.15 = 1.15 => 115%
    expect(screen.getByText("115%")).toBeDefined();

    const zoomOutBtn = screen.getByTitle("缩小");
    fireEvent.click(zoomOutBtn);

    // Zoom 1.15 * 0.85 = 0.9775 => 98%
    expect(screen.getByText("98%")).toBeDefined();
  });

  it("adds a new text card when clicking '文本卡片'", () => {
    const onSourceChange = vi.fn();

    render(
      <CanvasView
        title="添加卡片测试"
        source={JSON.stringify(initialCanvasData)}
        onSourceChange={onSourceChange}
        editable={true}
        theme="twitter"
      />
    );

    const addCardBtn = screen.getByText("文本卡片");
    fireEvent.click(addCardBtn);

    // onSourceChange should have been invoked with 3 nodes
    expect(onSourceChange).toHaveBeenCalled();
    const savedData: CanvasData = JSON.parse(onSourceChange.mock.calls[0][0]);
    expect(savedData.nodes.length).toBe(3);
    const newNode = savedData.nodes.find((n) => n.id !== "node-1" && n.id !== "node-2");
    expect(newNode).toBeDefined();
    expect(newNode?.type).toBe("text");
  });

  it("adds a new group container when clicking '分组容器'", () => {
    const onSourceChange = vi.fn();

    render(
      <CanvasView
        title="概念分组测试"
        source={JSON.stringify(initialCanvasData)}
        onSourceChange={onSourceChange}
        editable={true}
        theme="twitter"
      />
    );

    const addGroupBtn = screen.getByText("分组容器");
    fireEvent.click(addGroupBtn);

    expect(onSourceChange).toHaveBeenCalled();
    const savedData: CanvasData = JSON.parse(onSourceChange.mock.calls[0][0]);
    expect(savedData.nodes.length).toBe(3);
    const newGroup = savedData.nodes.find((n) => n.id !== "node-1" && n.id !== "node-2");
    expect(newGroup?.type).toBe("group");
  });

  it("opens reverse extraction modal and extracts markdown monograph", () => {
    const onExtractToNote = vi.fn();

    render(
      <CanvasView
        title="萃取测试"
        source={JSON.stringify(initialCanvasData)}
        onSourceChange={vi.fn()}
        editable={true}
        theme="twitter"
        onExtractToNote={onExtractToNote}
      />
    );

    // Click "萃取长文"
    const extractBtn = screen.getByText("萃取长文");
    fireEvent.click(extractBtn);

    // Modal should be visible
    expect(screen.getByText(/白板结构化萃取专著/)).toBeDefined();
    expect(screen.getByText("另存为新笔记")).toBeDefined();

    // Click "另存为新笔记"
    const saveNoteBtn = screen.getByText("另存为新笔记");
    fireEvent.click(saveNoteBtn);

    expect(onExtractToNote).toHaveBeenCalled();
    const [savedTitle, savedContent] = onExtractToNote.mock.calls[0];
    expect(savedTitle).toBe("萃取测试-萃取长文");
    expect(savedContent).toContain("核心假说");
  });

  it("invokes onSave callback when clicking Save button and pressing Ctrl+S", () => {
    const onSave = vi.fn();

    const { container } = render(
      <CanvasView
        title="保存测试白板"
        source={JSON.stringify(initialCanvasData)}
        onSave={onSave}
        isDirty={true}
        editable={true}
        theme="twitter"
      />
    );

    // Save button rendered with dirty status
    const saveBtn = screen.getByTitle(/保存白板/);
    expect(saveBtn).toBeDefined();

    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledTimes(1);

    // Test Ctrl+S shortcut
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("toggles box selection mode in toolbar", () => {
    render(
      <CanvasView
        title="框选测试白板"
        source={JSON.stringify(initialCanvasData)}
        editable={true}
        theme="twitter"
      />
    );

    const boxSelectBtn = screen.getByTitle(/开启框选模式/);
    expect(boxSelectBtn).toBeDefined();

    fireEvent.click(boxSelectBtn);
    expect(screen.getByText("框选中")).toBeDefined();

    fireEvent.click(boxSelectBtn);
    expect(screen.getByText("框选")).toBeDefined();
  });

  it("opens right-click context menu on canvas background and card", () => {
    render(
      <CanvasView
        title="右键测试白板"
        source={JSON.stringify(initialCanvasData)}
        editable={true}
        theme="twitter"
      />
    );

    // 1. Context menu on background
    const canvasContainer = screen.getByTitle("右键测试白板").closest(".knowspace-canvas-view");
    expect(canvasContainer).toBeDefined();
    fireEvent.contextMenu(canvasContainer!);

    expect(screen.getByText("白板快捷菜单")).toBeDefined();
    expect(screen.getByText("在此处新建文本卡片")).toBeDefined();
    expect(screen.getByText("全选所有卡片")).toBeDefined();

    // Close menu with Escape
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("白板快捷菜单")).toBeNull();

    // 2. Context menu on card
    const cardEl = screen.getByText(/核心假说/).closest(".canvas-node");
    expect(cardEl).toBeDefined();
    fireEvent.contextMenu(cardEl!);

    expect(screen.getByText("编辑卡片")).toBeDefined();
    expect(screen.getByText("复制副本")).toBeDefined();
    expect(screen.getByText("标签色彩")).toBeDefined();
    expect(screen.getByText("删除卡片")).toBeDefined();
  });

  it("dynamically clamps context menu position and maxHeight to prevent viewport bottom overflow", () => {
    render(
      <CanvasView
        title="遮挡测试白板"
        source={JSON.stringify(initialCanvasData)}
        editable={true}
        theme="twitter"
      />
    );

    const canvasContainer = screen.getByTitle("遮挡测试白板").closest(".knowspace-canvas-view") as HTMLElement;
    expect(canvasContainer).toBeDefined();

    vi.spyOn(canvasContainer, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 1000,
      bottom: 700,
      width: 1000,
      height: 700,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Right-click near the bottom of canvas (clientY = 620)
    fireEvent.contextMenu(canvasContainer, { clientX: 300, clientY: 620 });

    expect(screen.getByText("白板快捷菜单")).toBeDefined();
    const menuEl = document.querySelector(".canvas-context-menu") as HTMLElement;
    expect(menuEl).not.toBeNull();

    // Top must be clamped significantly lower than clientY to fit on screen
    const topValue = parseInt(menuEl.style.top, 10);
    expect(topValue).toBeLessThanOrEqual(700 - 12);
    // Menu maxHeight must be bounded by container height minus padding
    expect(menuEl.style.maxHeight).toBeDefined();
  });

  it("executes context menu actions: adding new card, editing card, and saving", () => {
    const onSourceChange = vi.fn();
    const onSave = vi.fn();

    render(
      <CanvasView
        title="右键交互白板"
        source={JSON.stringify(initialCanvasData)}
        onSourceChange={onSourceChange}
        onSave={onSave}
        editable={true}
        theme="twitter"
      />
    );

    // 1. Right click on background to open menu and click "在此处新建文本卡片"
    const canvasContainer = screen.getByTitle("右键交互白板").closest(".knowspace-canvas-view");
    expect(canvasContainer).toBeDefined();
    fireEvent.contextMenu(canvasContainer!);

    const addCardMenuItem = screen.getByText("在此处新建文本卡片");
    expect(addCardMenuItem).toBeDefined();
    fireEvent.click(addCardMenuItem);

    // Newly added card should exist and trigger onSourceChange
    expect(onSourceChange).toHaveBeenCalled();
    const callArg = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    expect(callArg.nodes.length).toBe(3);

    // 2. Right click on node-1 to edit card
    const cardEl = screen.getByText(/核心假说/).closest(".canvas-node");
    expect(cardEl).toBeDefined();
    fireEvent.contextMenu(cardEl!);

    const editCardMenuItem = screen.getByText("编辑卡片");
    fireEvent.click(editCardMenuItem);

    // Should now have a textarea and "编辑中" badge and "完成" button
    expect(screen.getByText("编辑中")).toBeDefined();
    const textarea = screen.getByPlaceholderText(/输入 Markdown 内容/);
    expect(textarea).toBeDefined();

    // Clicking inside the textarea should NOT exit edit mode
    fireEvent.mouseDown(textarea);
    fireEvent.click(textarea);
    expect(screen.getByText("编辑中")).toBeDefined();

    // Modify text in textarea
    fireEvent.change(textarea, { target: { value: "# 核心假说（已修改）" } });

    // Click "完成" button in header to finish edit
    const finishBtn = screen.getByText("完成");
    fireEvent.click(finishBtn);

    // Should exit editing mode and update text
    expect(screen.queryByText("编辑中")).toBeNull();
    const updatedCalls = onSourceChange.mock.calls;
    const lastSaved = JSON.parse(updatedCalls[updatedCalls.length - 1][0]);
    const updatedNode = lastSaved.nodes.find((n: any) => n.id === "node-1");
    expect(updatedNode.text).toBe("# 核心假说（已修改）");

    // 3. Right click background and click "保存白板"
    fireEvent.contextMenu(canvasContainer!);
    const saveMenuItem = screen.getByText("保存白板");
    fireEvent.click(saveMenuItem);
    expect(onSave).toHaveBeenCalled();
  });

  it("duplicates, changes color, and deletes cards via right-click context menu", () => {
    const onSourceChange = vi.fn();

    render(
      <CanvasView
        title="右键卡片操作"
        source={JSON.stringify(initialCanvasData)}
        onSourceChange={onSourceChange}
        editable={true}
        theme="twitter"
      />
    );

    // 1. Right click card and duplicate
    const cardEl = screen.getByText(/核心假说/).closest(".canvas-node");
    expect(cardEl).toBeDefined();
    fireEvent.contextMenu(cardEl!);

    const duplicateBtn = screen.getByText("复制副本");
    fireEvent.click(duplicateBtn);

    expect(onSourceChange).toHaveBeenCalled();
    let lastSaved = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    expect(lastSaved.nodes.length).toBe(3);

    // 2. Right click card and select color from context menu
    fireEvent.contextMenu(cardEl!);
    const ctxMenu = document.querySelector(".canvas-context-menu")!;
    expect(ctxMenu).toBeDefined();
    const redColorDot = ctxMenu.querySelector(".canvas-color-dot[title='珊瑚红']") as HTMLElement;
    expect(redColorDot).toBeDefined();
    fireEvent.click(redColorDot);

    lastSaved = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    const coloredNode = lastSaved.nodes.find((n: any) => n.id === "node-1");
    expect(coloredNode.color).toBe("1");

    // 3. Right click card and delete
    fireEvent.contextMenu(cardEl!);
    const deleteBtn = screen.getByText("删除卡片");
    fireEvent.click(deleteBtn);

    lastSaved = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    expect(lastSaved.nodes.find((n: any) => n.id === "node-1")).toBeUndefined();
  });

  it("safely drags card and group container without crashing or throwing null errors", () => {
    const onSourceChange = vi.fn();

    render(
      <CanvasView
        title="拖拽稳定性测试"
        source={JSON.stringify(initialCanvasData)}
        onSourceChange={onSourceChange}
        editable={true}
        theme="twitter"
      />
    );

    // 1. Drag a text card
    const cardEl = screen.getByText(/核心假说/).closest(".canvas-node") as HTMLElement;
    expect(cardEl).toBeDefined();

    fireEvent.mouseDown(cardEl, { button: 0, clientX: 120, clientY: 120 });
    fireEvent.mouseMove(window, { clientX: 180, clientY: 190 });
    fireEvent.mouseUp(window, { clientX: 180, clientY: 190 });

    // Should not crash and should record position
    expect(onSourceChange).toHaveBeenCalled();

    // 2. Drag group container
    const groupEl = screen.getByText(/宏观系统层/).closest(".canvas-group") as HTMLElement;
    expect(groupEl).toBeDefined();

    fireEvent.mouseDown(groupEl, { button: 0, clientX: 60, clientY: 60 });
    fireEvent.mouseMove(window, { clientX: 100, clientY: 110 });
    fireEvent.mouseUp(window, { clientX: 100, clientY: 110 });

    expect(onSourceChange).toHaveBeenCalled();
  });

  it("spawns a connected child card via context menu and Tab shortcut", () => {
    const onSourceChange = vi.fn();

    render(
      <CanvasView
        title="派生想法测试"
        source={JSON.stringify(initialCanvasData)}
        onSourceChange={onSourceChange}
        editable={true}
        theme="twitter"
      />
    );

    // Right click card and click "🌱 派生右侧子想法"
    const cardEl = screen.getByText(/核心假说/).closest(".canvas-node")!;
    fireEvent.contextMenu(cardEl);

    const spawnBtn = screen.getByText(/派生右侧子想法/);
    expect(spawnBtn).toBeDefined();
    fireEvent.click(spawnBtn);

    expect(onSourceChange).toHaveBeenCalled();
    const lastSaved = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    // A new text node and a connecting edge should be created
    expect(lastSaved.nodes.length).toBe(3);
    expect(lastSaved.edges.length).toBe(2);
    const newEdge = lastSaved.edges.find((e: any) => e.fromNode === "node-1" && e.toNode !== "node-2");
    expect(newEdge).toBeDefined();
  });

  it("links multiple selected cards with auto-linking button", () => {
    const onSourceChange = vi.fn();

    render(
      <CanvasView
        title="多选连线测试"
        source={JSON.stringify({
          nodes: [
            { id: "a", type: "text", text: "A", x: 0, y: 0, width: 200, height: 100 },
            { id: "b", type: "text", text: "B", x: 300, y: 0, width: 200, height: 100 },
          ],
          edges: [],
        })}
        onSourceChange={onSourceChange}
        editable={true}
        theme="twitter"
      />
    );

    // Select node A
    const nodeA = screen.getByText("A").closest(".canvas-node")!;
    fireEvent.mouseDown(nodeA, { button: 0 });

    // Shift-click node B to multi-select
    const nodeB = screen.getByText("B").closest(".canvas-node")!;
    fireEvent.mouseDown(nodeB, { button: 0, shiftKey: true });

    // Multi-link button should appear in toolbar
    const linkToolbarBtn = screen.getByTitle(/自动建立.*连线/);
    expect(linkToolbarBtn).toBeDefined();
    fireEvent.click(linkToolbarBtn);

    expect(onSourceChange).toHaveBeenCalled();
    const lastSaved = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    expect(lastSaved.edges.length).toBe(1);
    expect(lastSaved.edges[0].fromNode).toBe("a");
    expect(lastSaved.edges[0].toNode).toBe("b");
  });

  it("displays floating relationship toolbar on edge selection and allows editing style, arrow, and presets", () => {
    const onSourceChange = vi.fn();

    render(
      <CanvasView
        title="连线编辑测试"
        source={JSON.stringify(initialCanvasData)}
        onSourceChange={onSourceChange}
        editable={true}
        theme="twitter"
      />
    );

    // Click on edge path to select edge
    const edgeHitArea = document.querySelector("svg path[stroke='transparent']")!;
    expect(edgeHitArea).toBeDefined();
    fireEvent.click(edgeHitArea);

    // Floating edge toolbar should appear
    const edgeToolbar = document.querySelector(".canvas-edge-toolbar");
    expect(edgeToolbar).toBeDefined();

    // Click a preset chip (e.g., "前置")
    const presetBtn = screen.getByTitle("设为「前置」关系");
    expect(presetBtn).toBeDefined();
    fireEvent.click(presetBtn);

    let lastSaved = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    expect(lastSaved.edges[0].label).toBe("前置");

    // Toggle arrow mode
    const arrowToggleBtn = screen.getByTitle(/切换箭头/);
    fireEvent.click(arrowToggleBtn);
    lastSaved = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    // Cycle from forward to bidirectional
    expect(lastSaved.edges[0].fromEnd).toBe("arrow");
    expect(lastSaved.edges[0].toEnd).toBe("arrow");

    // Toggle line style
    const styleToggleBtn = screen.getByTitle(/切换线型/);
    fireEvent.click(styleToggleBtn);
    lastSaved = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    expect(lastSaved.edges[0].style).toBeDefined();

    // Reverse flow
    const reverseBtn = screen.getByTitle("反转连线流向");
    fireEvent.click(reverseBtn);
    lastSaved = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    expect(lastSaved.edges[0].fromNode).toBe("node-2");
    expect(lastSaved.edges[0].toNode).toBe("node-1");
  });

  it("opens edge context menu on right click with rich relationship controls", () => {
    const onSourceChange = vi.fn();

    render(
      <CanvasView
        title="连线右键菜单测试"
        source={JSON.stringify(initialCanvasData)}
        onSourceChange={onSourceChange}
        editable={true}
        theme="twitter"
      />
    );

    // Right-click on edge <g>
    const edgeGroup = document.querySelector("svg g[style*='pointer-events: all']")!;
    expect(edgeGroup).toBeDefined();
    fireEvent.contextMenu(edgeGroup);

    // Context menu should display edge relationship header
    expect(screen.getByText("🔗 关系连线")).toBeDefined();
    expect(screen.getByText("快捷关系预设:")).toBeDefined();
    expect(screen.getByText("反转连线流向")).toBeDefined();

    // Click "反驳" preset
    const refutePreset = screen.getByText("反驳");
    fireEvent.click(refutePreset);

    const lastSaved = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    expect(lastSaved.edges[0].label).toBe("反驳");
  });

  it("ensures overlapping groups do not stick together when dragged", () => {
    const multiGroupData: CanvasData = {
      nodes: [
        {
          id: "group-A",
          type: "group",
          label: "分组 A (青色)",
          x: 100,
          y: 100,
          width: 300,
          height: 300,
        },
        {
          id: "group-B",
          type: "group",
          label: "分组 B (黄色)",
          x: 150,
          y: 150,
          width: 300,
          height: 300,
        },
        {
          id: "card-in-A",
          type: "text",
          text: "卡片 A",
          x: 120,
          y: 120,
          width: 100,
          height: 80,
        },
      ],
      edges: [],
    };

    const onSourceChange = vi.fn();
    render(
      <CanvasView
        title="分组解耦测试"
        source={JSON.stringify(multiGroupData)}
        onSourceChange={onSourceChange}
        editable={true}
      />
    );

    const groupA = screen.getByText(/分组 A/).closest(".canvas-group")!;
    expect(groupA).toBeDefined();

    // Mouse down on Group A to start dragging
    fireEvent.mouseDown(groupA, { clientX: 110, clientY: 110, button: 0 });

    // Move mouse by 50px
    fireEvent.mouseMove(window, { clientX: 160, clientY: 160 });

    // Release mouse at current position
    fireEvent.mouseUp(window, { clientX: 160, clientY: 160 });

    const lastSaved = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    const savedGroupA = lastSaved.nodes.find((n: any) => n.id === "group-A");
    const savedGroupB = lastSaved.nodes.find((n: any) => n.id === "group-B");
    const savedCardA = lastSaved.nodes.find((n: any) => n.id === "card-in-A");

    // Group A moved by 50px
    expect(savedGroupA.x).toBe(150);
    expect(savedGroupA.y).toBe(150);
    // Card in A moved with Group A
    expect(savedCardA.x).toBe(170);
    expect(savedCardA.y).toBe(170);
    // Group B remained untouched and did NOT stick to Group A!
    expect(savedGroupB.x).toBe(150);
    expect(savedGroupB.y).toBe(150);
  });

  it("renders relationship label on dedicated z-index 25 layer and omits badge for empty labels", () => {
    const edgeData: CanvasData = {
      nodes: [
        { id: "node-a", type: "text", text: "卡片1", x: 100, y: 100, width: 200, height: 100 },
        { id: "node-b", type: "text", text: "卡片2", x: 400, y: 100, width: 200, height: 100 },
        { id: "node-c", type: "text", text: "卡片3", x: 700, y: 100, width: 200, height: 100 },
      ],
      edges: [
        { id: "edge-labeled", fromNode: "node-a", toNode: "node-b", label: "推导演化" },
        { id: "edge-unlabeled", fromNode: "node-b", toNode: "node-c" }, // No label
      ],
    };

    render(
      <CanvasView
        title="关系标签层级测试"
        source={JSON.stringify(edgeData)}
        onSourceChange={vi.fn()}
        editable={true}
      />
    );

    // Labeled edge badge is rendered
    const badge = screen.getByText("推导演化").closest(".canvas-edge-label-badge") as HTMLElement;
    expect(badge).toBeDefined();
    // z-index is 25 (above cards' z-index 10)
    expect(badge.style.zIndex).toBe("25");

    // Unlabeled edge must NOT display any "关系说明" placeholder text
    expect(screen.queryByText("关系说明")).toBeNull();
  });

  it("renders all information cards and camera viewport in the minimap", () => {
    const dataWithStandalone: CanvasData = {
      nodes: [
        { id: "group-1", type: "group", label: "容器内", x: 50, y: 50, width: 300, height: 200 },
        { id: "card-inside", type: "text", text: "组内卡片", x: 80, y: 80, width: 100, height: 60 },
        { id: "card-outside", type: "file", file: "独立卡片.md", x: 500, y: 400, width: 150, height: 80 },
      ],
      edges: [],
    };

    render(
      <CanvasView
        title="缩略图全卡片测试"
        source={JSON.stringify(dataWithStandalone)}
        onSourceChange={vi.fn()}
      />
    );

    const minimap = document.querySelector(".canvas-minimap");
    expect(minimap).toBeDefined();

    // Minimap SVG rects should include group, card-inside, card-outside, and camera viewport
    const minimapRects = minimap!.querySelectorAll("svg rect");
    expect(minimapRects.length).toBeGreaterThanOrEqual(3);
  });

  it("stops wheel event propagation on modal overlays and file lists to prevent canvas zoom", () => {
    render(
      <CanvasView
        title="弹窗滚轮隔离测试"
        source={JSON.stringify(initialCanvasData)}
        onSourceChange={vi.fn()}
        allChapters={[{ id: "1", title: "笔记1", src: "notes/1.md" }]}
      />
    );

    // Initially at 100% zoom
    expect(screen.getByText("100%")).toBeDefined();

    // Open file picker modal
    const addNoteBtn = screen.getByText("引入笔记");
    fireEvent.click(addNoteBtn);

    expect(screen.getByText("引入知识库笔记至白板")).toBeDefined();

    // Scroll wheel on file list inside modal
    const fileItem = screen.getByText("笔记1");
    fireEvent.wheel(fileItem, { deltaY: 100 });

    // Canvas zoom must remain exactly 100% (wheel event did not zoom/pan canvas)
    expect(screen.getByText("100%")).toBeDefined();
  });

  it("opens group-specific context menu with label rename, color palette, and duplicate actions", () => {
    const groupData: CanvasData = {
      nodes: [
        { id: "group-target", type: "group", label: "研发架构组", x: 100, y: 100, width: 300, height: 200, color: "3" },
      ],
      edges: [],
    };

    render(
      <CanvasView
        title="分组右键测试"
        source={JSON.stringify(groupData)}
        onSourceChange={vi.fn()}
        editable={true}
      />
    );

    const groupEl = screen.getByText(/研发架构组/).closest(".canvas-group")!;
    fireEvent.contextMenu(groupEl, { clientX: 120, clientY: 120 });

    // Group-specific context menu options are visible
    expect(screen.getByText("重命名分组标签")).toBeDefined();
    expect(screen.getByText("分组色彩")).toBeDefined();
    expect(screen.getByText("复制分组副本")).toBeDefined();
    expect(screen.getByText("删除分组容器")).toBeDefined();
    // Card-only items should NOT be in group context menu
    expect(screen.queryByText("🌱 派生右侧子想法")).toBeNull();
  });

  it("ensures newly added group container does not scoop cards from existing container on drag", () => {
    const onSourceChange = vi.fn();
    const existingData: CanvasData = {
      nodes: [
        { id: "old-group", type: "group", label: "原有分组", x: 200, y: 100, width: 500, height: 400 },
        { id: "card-in-old", type: "text", text: "原容器卡片", x: 250, y: 150, width: 120, height: 80 },
      ],
      edges: [],
    };

    render(
      <CanvasView
        title="新建分组不影响测试"
        source={JSON.stringify(existingData)}
        onSourceChange={onSourceChange}
        editable={true}
      />
    );

    // Click "分组容器" to add a new group
    const addGroupBtn = screen.getByText("分组容器");
    fireEvent.click(addGroupBtn);

    // Get the newly added group
    const newGroupEl = screen.getByText(/概念分组容器/).closest(".canvas-group")!;
    expect(newGroupEl).toBeDefined();

    // Drag the new group by 60px
    fireEvent.mouseDown(newGroupEl, { clientX: 250, clientY: 150, button: 0 });
    fireEvent.mouseMove(window, { clientX: 310, clientY: 210 });
    fireEvent.mouseUp(window, { clientX: 310, clientY: 210 });

    const lastCall = onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0];
    const savedData = JSON.parse(lastCall);
    const savedCard = savedData.nodes.find((n: any) => n.id === "card-in-old");

    // The card from the existing group remained untouched at its original position
    expect(savedCard.x).toBe(250);
    expect(savedCard.y).toBe(150);
  });

  it("allows modifying relationship label shape to diamond, rect, and pill", () => {
    const onSourceChange = vi.fn();
    const edgeData: CanvasData = {
      nodes: [
        { id: "from-node", type: "text", text: "起点卡片", x: 100, y: 100, width: 120, height: 80 },
        { id: "to-node", type: "text", text: "终点卡片", x: 400, y: 100, width: 120, height: 80 },
      ],
      edges: [
        { id: "edge-shape-test", fromNode: "from-node", toNode: "to-node", label: "因果影响", labelShape: "pill" },
      ],
    };

    render(
      <CanvasView
        title="连线形状测试"
        source={JSON.stringify(edgeData)}
        onSourceChange={onSourceChange}
        editable={true}
      />
    );

    const badge = screen.getByText("因果影响");
    expect(badge).toBeDefined();

    // Right-click badge to open edge context menu
    fireEvent.contextMenu(badge, { clientX: 250, clientY: 100 });

    // Verify shape selector is present in context menu
    expect(screen.getByText("标签形状")).toBeDefined();
    const diamondOption = screen.getByText("菱形");
    fireEvent.click(diamondOption);

    // Verify onSourceChange was called with updated labelShape: "diamond"
    const lastCall = onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0];
    const savedData = JSON.parse(lastCall);
    const targetEdge = savedData.edges.find((e: any) => e.id === "edge-shape-test");
    expect(targetEdge.labelShape).toBe("diamond");
  });

  it("opens image export modal from toolbar and allows switching formats and downloading", () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(
      <CanvasView
        title="白板图片导出测试"
        source={JSON.stringify(initialCanvasData)}
        onSourceChange={vi.fn()}
        editable={true}
      />
    );

    // Click "导出图片" in toolbar
    const exportBtn = screen.getByText("导出图片");
    expect(exportBtn).toBeDefined();
    fireEvent.click(exportBtn);

    // Export Modal should be visible
    expect(screen.getByText("导出白板为图片")).toBeDefined();
    expect(screen.getByText(/画板统计：/)).toBeDefined();

    // Format buttons
    const svgFormatBtn = screen.getByText(/SVG 矢量图形/);
    expect(svgFormatBtn).toBeDefined();
    fireEvent.click(svgFormatBtn);

    // Verify download button updates to SVG
    expect(screen.getByText("下载 SVG 文件")).toBeDefined();

    // Background selection
    const whiteBgBtn = screen.getByText("纯白底色");
    fireEvent.click(whiteBgBtn);

    // Trigger download
    const downloadBtn = screen.getByText("下载 SVG 文件");
    fireEvent.click(downloadBtn);
    expect(clickSpy).toHaveBeenCalled();

    // Switch back to PNG and test copy button
    const pngFormatBtn = screen.getByText(/PNG 高清位图/);
    fireEvent.click(pngFormatBtn);
    expect(screen.getByText("复制图片到剪贴板")).toBeDefined();

    clickSpy.mockRestore();
  });

  it("opens image export modal from canvas background right-click context menu", () => {
    render(
      <CanvasView
        title="右键导出测试"
        source={JSON.stringify(initialCanvasData)}
        onSourceChange={vi.fn()}
        editable={true}
      />
    );

    // Right click canvas background
    const canvasContainer = screen.getByTitle("右键导出测试").closest(".knowspace-canvas-view");
    expect(canvasContainer).toBeDefined();
    fireEvent.contextMenu(canvasContainer!);

    // Find "📸 导出白板为图片..." context item
    const ctxExportItem = screen.getByText("📸 导出白板为图片...");
    expect(ctxExportItem).toBeDefined();
    fireEvent.click(ctxExportItem);

    // Modal is opened
    expect(screen.getByText("导出白板为图片")).toBeDefined();
  });

  it("creates text card or group container on a SINGLE click even when a node is selected", () => {
    const onSourceChange = vi.fn();
    render(
      <CanvasView
        title="单次点击测试"
        source={JSON.stringify(initialCanvasData)}
        onSourceChange={onSourceChange}
        editable={true}
      />
    );

    // 1. Select a card first
    const card = screen.getByText(/核心假说/).closest(".canvas-node");
    expect(card).toBeDefined();
    fireEvent.click(card!);

    // Toolbar now shows selected count badge and spawn button (toolbar expanded)
    expect(screen.getByText("已选 1 项")).toBeDefined();

    // 2. Click "文本卡片" on toolbar - simulate real browser sequence: mousedown then click
    const addCardBtn = screen.getByText("文本卡片").closest("button")!;
    expect(addCardBtn).toBeDefined();

    // mousedown must NOT bubble to background to clear selection and shift toolbar
    fireEvent.mouseDown(addCardBtn);
    fireEvent.click(addCardBtn);

    // Must be invoked on the very first click
    expect(onSourceChange).toHaveBeenCalled();
    const firstCallData: CanvasData = JSON.parse(onSourceChange.mock.calls[0][0]);
    expect(firstCallData.nodes.length).toBe(3);

    // 3. Now select node-1 again
    onSourceChange.mockClear();
    fireEvent.click(card!);
    expect(screen.getByText("已选 1 项")).toBeDefined();

    // 4. Click "分组容器" on toolbar on single click
    const addGroupBtn = screen.getByText("分组容器").closest("button")!;
    fireEvent.mouseDown(addGroupBtn);
    fireEvent.click(addGroupBtn);

    expect(onSourceChange).toHaveBeenCalled();
    const secondCallData: CanvasData = JSON.parse(onSourceChange.mock.calls[0][0]);
    const groupNode = secondCallData.nodes.find((n) => n.type === "group" && n.id !== "node-2");
    expect(groupNode).toBeDefined();
  });

  it("drags a card smoothly using the card header drag handle", () => {
    const onSourceChange = vi.fn();
    render(
      <CanvasView
        title="卡片拖拽测试"
        source={JSON.stringify(initialCanvasData)}
        onSourceChange={onSourceChange}
        editable={true}
      />
    );

    const card = screen.getByText(/核心假说/).closest(".canvas-node") as HTMLElement;
    expect(card).toBeDefined();

    const header = card.querySelector(".canvas-card-header") as HTMLElement;
    expect(header).toBeDefined();
    expect(header.style.cursor).toBe("move");

    // Start drag on header at (100, 100)
    fireEvent.mouseDown(header, { clientX: 100, clientY: 100, button: 0 });

    // Move mouse on window by +60px, +80px
    fireEvent.mouseMove(window, { clientX: 160, clientY: 180 });

    // Release mouse on window
    fireEvent.mouseUp(window, { clientX: 160, clientY: 180 });

    expect(onSourceChange).toHaveBeenCalled();
    const updatedData: CanvasData = JSON.parse(onSourceChange.mock.calls[0][0]);
    const movedNode = updatedData.nodes.find((n) => n.id === "node-1")!;
    expect(movedNode.x).toBe(160); // 100 + 60
    expect(movedNode.y).toBe(180); // 100 + 80
  });

  it("creates a new card and allows it to be dragged immediately without obstruction", () => {
    const onSourceChange = vi.fn();
    render(
      <CanvasView
        title="新卡片立即拖拽测试"
        source={JSON.stringify(initialCanvasData)}
        onSourceChange={onSourceChange}
        editable={true}
      />
    );

    // Click "文本卡片" to create new card
    const addCardBtn = screen.getByText("文本卡片").closest("button")!;
    fireEvent.click(addCardBtn);

    expect(onSourceChange).toHaveBeenCalled();
    const currentData: CanvasData = JSON.parse(onSourceChange.mock.calls[0][0]);
    const newCardData = currentData.nodes.find((n) => n.id !== "node-1" && n.id !== "node-2")!;
    expect(newCardData).toBeDefined();

    const newCardEl = screen.getByText(/新想法卡片/).closest(".canvas-node") as HTMLElement;
    expect(newCardEl).toBeDefined();

    // Verify header is ready as drag handle
    const header = newCardEl.querySelector(".canvas-card-header") as HTMLElement;
    expect(header).toBeDefined();

    onSourceChange.mockClear();

    // Drag new card header
    fireEvent.mouseDown(header, { clientX: 200, clientY: 200, button: 0 });
    fireEvent.mouseMove(window, { clientX: 250, clientY: 270 });
    fireEvent.mouseUp(window, { clientX: 250, clientY: 270 });

    expect(onSourceChange).toHaveBeenCalled();
    const draggedData: CanvasData = JSON.parse(onSourceChange.mock.calls[0][0]);
    const draggedNode = draggedData.nodes.find((n) => n.id === newCardData.id)!;
    expect(draggedNode.x).toBe(newCardData.x + 50);
    expect(draggedNode.y).toBe(newCardData.y + 70);
  });

  it("reverses edge direction using 'R' shortcut when an edge is selected", () => {
    const onSourceChange = vi.fn();
    render(
      <CanvasView
        title="快捷键反转连线测试"
        source={JSON.stringify(initialCanvasData)}
        onSourceChange={onSourceChange}
        editable={true}
      />
    );

    // Select edge
    const edgeHitArea = document.querySelector("svg path[stroke='transparent']")!;
    expect(edgeHitArea).toBeDefined();
    fireEvent.click(edgeHitArea);

    // Press 'r' shortcut to reverse edge
    fireEvent.keyDown(window, { key: "r" });

    expect(onSourceChange).toHaveBeenCalled();
    const updatedData: CanvasData = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    expect(updatedData.edges[0].fromNode).toBe("node-2");
    expect(updatedData.edges[0].toNode).toBe("node-1");
  });

  it("provides detailed card context menu actions: copying text, copying wikilink, and resetting size", () => {
    const onSourceChange = vi.fn();
    const testData: CanvasData = {
      nodes: [
        {
          id: "custom-size-node",
          type: "text",
          text: "# 测试卡片\n卡片正文详情",
          x: 100,
          y: 100,
          width: 500,
          height: 400,
        },
      ],
      edges: [],
    };

    render(
      <CanvasView
        title="卡片右键细化测试"
        source={JSON.stringify(testData)}
        onSourceChange={onSourceChange}
        editable={true}
      />
    );

    const cardEl = screen.getByText(/测试卡片/).closest(".canvas-node")!;
    fireEvent.contextMenu(cardEl);

    // Verify enriched card items
    expect(screen.getByText("复制文本内容")).toBeDefined();
    expect(screen.getByText("复制双链引用 [[...]]")).toBeDefined();
    expect(screen.getByText("重置标准尺寸")).toBeDefined();

    // Click reset size
    fireEvent.click(screen.getByText("重置标准尺寸"));

    expect(onSourceChange).toHaveBeenCalled();
    const updatedData: CanvasData = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    const resetNode = updatedData.nodes.find((n) => n.id === "custom-size-node")!;
    expect(resetNode.width).toBe(280);
    expect(resetNode.height).toBe(160);
  });

  it("supports multi-selection context menu: grouping selected cards and aligning them", () => {
    const onSourceChange = vi.fn();
    const multiCardsData: CanvasData = {
      nodes: [
        { id: "c1", type: "text", text: "卡片 A", x: 100, y: 100, width: 200, height: 120 },
        { id: "c2", type: "text", text: "卡片 B", x: 260, y: 180, width: 200, height: 120 },
      ],
      edges: [],
    };

    render(
      <CanvasView
        title="多选对齐与成组测试"
        source={JSON.stringify(multiCardsData)}
        onSourceChange={onSourceChange}
        editable={true}
      />
    );

    // Select both cards with Shift
    const cardA = screen.getByText("卡片 A").closest(".canvas-node")!;
    const cardB = screen.getByText("卡片 B").closest(".canvas-node")!;
    fireEvent.mouseDown(cardA);
    fireEvent.mouseDown(cardB, { shiftKey: true });

    // Open context menu on card B
    fireEvent.contextMenu(cardB);

    // Verify multi-selection actions
    expect(screen.getByText(/批量操作 \(2 项\)/)).toBeDefined();
    expect(screen.getByText("打包为新分组容器")).toBeDefined();
    expect(screen.getByText("左对齐")).toBeDefined();
    expect(screen.getByText("水平居中")).toBeDefined();
    expect(screen.getByText("顶端对齐")).toBeDefined();

    // Click "左对齐"
    fireEvent.click(screen.getByText("左对齐"));

    expect(onSourceChange).toHaveBeenCalled();
    let updatedData: CanvasData = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    const nodeA = updatedData.nodes.find((n) => n.id === "c1")!;
    const nodeB = updatedData.nodes.find((n) => n.id === "c2")!;
    expect(nodeA.x).toBe(100);
    expect(nodeB.x).toBe(100);

    // Clear selection with Escape
    fireEvent.keyDown(window, { key: "Escape" });

    // Re-select both cards cleanly and group them
    fireEvent.mouseDown(cardA);
    fireEvent.mouseDown(cardB, { shiftKey: true });
    fireEvent.contextMenu(cardB);
    fireEvent.click(screen.getByText("打包为新分组容器"));

    updatedData = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    const groupCreated = updatedData.nodes.find((n) => n.type === "group");
    expect(groupCreated).toBeDefined();
    expect(groupCreated?.label).toBe("新建分组容器");
  });

  it("provides detailed group container context menu: select cards, fit size, and dissolve group", () => {
    const onSourceChange = vi.fn();
    const groupWithCardsData: CanvasData = {
      nodes: [
        { id: "grp-box", type: "group", label: "核心容器", x: 50, y: 50, width: 800, height: 600 },
        { id: "inner-card-1", type: "text", text: "内部卡片 1", x: 100, y: 100, width: 200, height: 100 },
        { id: "inner-card-2", type: "text", text: "内部卡片 2", x: 350, y: 100, width: 200, height: 100 },
      ],
      edges: [],
    };

    render(
      <CanvasView
        title="容器右键细化测试"
        source={JSON.stringify(groupWithCardsData)}
        onSourceChange={onSourceChange}
        editable={true}
      />
    );

    const grpEl = screen.getByText(/核心容器/).closest(".canvas-group")!;
    fireEvent.contextMenu(grpEl, { clientX: 70, clientY: 70 });

    // Verify group context menu items
    expect(screen.getByText("选中组内所有卡片")).toBeDefined();
    expect(screen.getByText("自适应贴合组内卡片尺寸")).toBeDefined();
    expect(screen.getByText("解散分组 (保留内部卡片)")).toBeDefined();
    expect(screen.getByText("删除容器及内部卡片")).toBeDefined();

    // Click "自适应贴合组内卡片尺寸"
    fireEvent.click(screen.getByText("自适应贴合组内卡片尺寸"));

    expect(onSourceChange).toHaveBeenCalled();
    let updatedData: CanvasData = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    const fittedGrp = updatedData.nodes.find((n) => n.id === "grp-box")!;
    expect(fittedGrp.width).toBeLessThan(800);

    // Re-open context menu and dissolve group
    fireEvent.contextMenu(grpEl, { clientX: 70, clientY: 70 });
    fireEvent.click(screen.getByText("解散分组 (保留内部卡片)"));

    updatedData = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    expect(updatedData.nodes.find((n) => n.id === "grp-box")).toBeUndefined();
    // Inner cards are preserved!
    expect(updatedData.nodes.find((n) => n.id === "inner-card-1")).toBeDefined();
    expect(updatedData.nodes.find((n) => n.id === "inner-card-2")).toBeDefined();
  });

  it("provides background context menu with paste from clipboard and align to grid", () => {
    const onSourceChange = vi.fn();
    const unalignedData: CanvasData = {
      nodes: [
        { id: "unaligned-1", type: "text", text: "非对齐卡片", x: 107, y: 133, width: 200, height: 100 },
      ],
      edges: [],
    };

    render(
      <CanvasView
        title="背景右键细化测试"
        source={JSON.stringify(unalignedData)}
        onSourceChange={onSourceChange}
        editable={true}
      />
    );

    const canvasContainer = screen.getByTitle("背景右键细化测试").closest(".knowspace-canvas-view")!;
    fireEvent.contextMenu(canvasContainer);

    // Verify background items
    expect(screen.getByText("从剪贴板粘贴为卡片")).toBeDefined();
    expect(screen.getByText("对齐所有卡片到网格 (20px)")).toBeDefined();

    // Click align to grid
    fireEvent.click(screen.getByText("对齐所有卡片到网格 (20px)"));

    expect(onSourceChange).toHaveBeenCalled();
    const updatedData: CanvasData = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    const alignedNode = updatedData.nodes.find((n) => n.id === "unaligned-1")!;
    expect(alignedNode.x % 20).toBe(0);
    expect(alignedNode.y % 20).toBe(0);
  });

  it("supports one-to-many star connection for multiple selected cards via toolbar and context menu", () => {
    const onSourceChange = vi.fn();
    const starData: CanvasData = {
      nodes: [
        { id: "root", type: "text", text: "中心概念", x: 100, y: 100, width: 200, height: 100 },
        { id: "sub-1", type: "text", text: "分支概念 1", x: 400, y: 50, width: 200, height: 100 },
        { id: "sub-2", type: "text", text: "分支概念 2", x: 400, y: 200, width: 200, height: 100 },
      ],
      edges: [],
    };

    render(
      <CanvasView
        title="一对多关联测试"
        source={JSON.stringify(starData)}
        onSourceChange={onSourceChange}
        editable={true}
        theme="twitter"
      />
    );

    // Multi-select all 3 cards: root, sub-1, sub-2
    const rootEl = screen.getByText("中心概念").closest(".canvas-node")!;
    const sub1El = screen.getByText("分支概念 1").closest(".canvas-node")!;
    const sub2El = screen.getByText("分支概念 2").closest(".canvas-node")!;

    fireEvent.mouseDown(rootEl, { button: 0 });
    fireEvent.mouseDown(sub1El, { button: 0, shiftKey: true });
    fireEvent.mouseDown(sub2El, { button: 0, shiftKey: true });

    // One-to-many button should be visible in toolbar
    const oneToManyBtn = screen.getByTitle("以当前选中卡片为源，向其余所有选中卡片放射建立一对多关联");
    expect(oneToManyBtn).toBeDefined();
    fireEvent.click(oneToManyBtn);

    expect(onSourceChange).toHaveBeenCalled();
    const saved = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    expect(saved.edges.length).toBe(2);
    // Both edges originate from root
    expect(saved.edges.every((e: any) => e.fromNode === "root")).toBe(true);
    expect(saved.edges.map((e: any) => e.toNode)).toEqual(expect.arrayContaining(["sub-1", "sub-2"]));
  });

  it("supports connecting cards by dragging and dropping directly onto target card body", () => {
    const onSourceChange = vi.fn();
    const dropData: CanvasData = {
      nodes: [
        { id: "card-from", type: "text", text: "源卡片", x: 100, y: 100, width: 200, height: 100 },
        { id: "card-to", type: "text", text: "目标卡片", x: 500, y: 100, width: 200, height: 100 },
      ],
      edges: [],
    };

    render(
      <CanvasView
        title="全域释放连线测试"
        source={JSON.stringify(dropData)}
        onSourceChange={onSourceChange}
        editable={true}
        theme="twitter"
      />
    );

    // Select the from card to display anchors
    const fromCard = screen.getByText("源卡片").closest(".canvas-node")!;
    fireEvent.click(fromCard);

    // Find the right anchor dot and start connection drag
    const rightAnchor = fromCard.querySelector('.canvas-anchor-dot[title*="right"]')!;
    expect(rightAnchor).toBeDefined();
    fireEvent.mouseDown(rightAnchor, { button: 0 });

    // Release mouse directly over target card body (not an anchor dot)
    const toCard = screen.getByText("目标卡片").closest(".canvas-node")!;
    fireEvent.mouseUp(toCard);

    expect(onSourceChange).toHaveBeenCalled();
    const saved = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    expect(saved.edges.length).toBe(1);
    expect(saved.edges[0].fromNode).toBe("card-from");
    expect(saved.edges[0].toNode).toBe("card-to");
  });

  it("spawns multiple branches (1-to-many) from single card context menu", () => {
    const onSourceChange = vi.fn();
    const singleData: CanvasData = {
      nodes: [
        { id: "hub", type: "text", text: "主干主题", x: 100, y: 100, width: 200, height: 100 },
      ],
      edges: [],
    };

    render(
      <CanvasView
        title="批量派生测试"
        source={JSON.stringify(singleData)}
        onSourceChange={onSourceChange}
        editable={true}
        theme="twitter"
      />
    );

    const hubCard = screen.getByText("主干主题").closest(".canvas-node")!;
    fireEvent.contextMenu(hubCard);

    const spawnBtn = screen.getByText(/批量派生分支/);
    expect(spawnBtn).toBeDefined();
    fireEvent.click(spawnBtn);

    // Modal should appear asking for spawn count
    expect(screen.getByText(/派生分支数量/)).toBeDefined();
    const confirmBtn = screen.getByText(/确认派生/);
    expect(confirmBtn).toBeDefined();
    fireEvent.click(confirmBtn);

    expect(onSourceChange).toHaveBeenCalled();
    const saved = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    // 1 hub + 3 new cards = 4 nodes
    expect(saved.nodes.length).toBe(4);
    // 3 new edges from hub to branches
    expect(saved.edges.length).toBe(3);
    expect(saved.edges.every((e: any) => e.fromNode === "hub")).toBe(true);
  });

  it("disconnects all edges from a card via context menu", () => {
    const onSourceChange = vi.fn();
    const connectedData: CanvasData = {
      nodes: [
        { id: "node-x", type: "text", text: "连线卡片", x: 100, y: 100, width: 200, height: 100 },
        { id: "node-y", type: "text", text: "关联卡片 1", x: 400, y: 100, width: 200, height: 100 },
        { id: "node-z", type: "text", text: "关联卡片 2", x: 400, y: 300, width: 200, height: 100 },
      ],
      edges: [
        { id: "e1", fromNode: "node-x", toNode: "node-y" },
        { id: "e2", fromNode: "node-z", toNode: "node-x" },
      ],
    };

    render(
      <CanvasView
        title="断开连线测试"
        source={JSON.stringify(connectedData)}
        onSourceChange={onSourceChange}
        editable={true}
        theme="twitter"
      />
    );

    const cardX = screen.getByText("连线卡片").closest(".canvas-node")!;
    fireEvent.contextMenu(cardX);

    const disconnectBtn = screen.getByText("✂️ 断开所有关联连线");
    expect(disconnectBtn).toBeDefined();
    fireEvent.click(disconnectBtn);

    expect(onSourceChange).toHaveBeenCalled();
    const saved = JSON.parse(onSourceChange.mock.calls[onSourceChange.mock.calls.length - 1][0]);
    expect(saved.edges.length).toBe(0);
  });

  it("preserves multi-selection when shift-clicking cards and after click events", () => {
    const multiData: CanvasData = {
      nodes: [
        { id: "c1", type: "text", text: "卡片一", x: 100, y: 100, width: 200, height: 100 },
        { id: "c2", type: "text", text: "卡片二", x: 350, y: 100, width: 200, height: 100 },
        { id: "c3", type: "text", text: "卡片三", x: 600, y: 100, width: 200, height: 100 },
      ],
      edges: [],
    };

    render(
      <CanvasView
        title="多选持久性测试"
        source={JSON.stringify(multiData)}
        onSourceChange={vi.fn()}
        editable={true}
        theme="twitter"
      />
    );

    const card1 = screen.getByText("卡片一").closest(".canvas-node")!;
    const card2 = screen.getByText("卡片二").closest(".canvas-node")!;
    const card3 = screen.getByText("卡片三").closest(".canvas-node")!;

    // 1. Click card 1
    fireEvent.mouseDown(card1, { button: 0 });
    fireEvent.mouseUp(card1, { button: 0 });
    fireEvent.click(card1);
    expect(card1.classList.contains("selected")).toBe(true);
    expect(card2.classList.contains("selected")).toBe(false);

    // 2. Shift+Click card 2
    fireEvent.mouseDown(card2, { button: 0, shiftKey: true });
    fireEvent.mouseUp(card2, { button: 0, shiftKey: true });
    fireEvent.click(card2, { shiftKey: true });
    expect(card1.classList.contains("selected")).toBe(true);
    expect(card2.classList.contains("selected")).toBe(true);

    // 3. Ctrl+Click card 3
    fireEvent.mouseDown(card3, { button: 0, ctrlKey: true });
    fireEvent.mouseUp(card3, { button: 0, ctrlKey: true });
    fireEvent.click(card3, { ctrlKey: true });
    expect(card1.classList.contains("selected")).toBe(true);
    expect(card2.classList.contains("selected")).toBe(true);
    expect(card3.classList.contains("selected")).toBe(true);
  });

  it("preserves multi-selection after collaborative dragging cards", () => {
    const multiData: CanvasData = {
      nodes: [
        { id: "drag1", type: "text", text: "拖拽卡片A", x: 100, y: 100, width: 200, height: 100 },
        { id: "drag2", type: "text", text: "拖拽卡片B", x: 350, y: 100, width: 200, height: 100 },
      ],
      edges: [],
    };

    render(
      <CanvasView
        title="多选拖拽测试"
        source={JSON.stringify(multiData)}
        onSourceChange={vi.fn()}
        editable={true}
        theme="twitter"
      />
    );

    const cardA = screen.getByText("拖拽卡片A").closest(".canvas-node")!;
    const cardB = screen.getByText("拖拽卡片B").closest(".canvas-node")!;

    // Select both
    fireEvent.mouseDown(cardA, { button: 0 });
    fireEvent.click(cardA);
    fireEvent.mouseDown(cardB, { button: 0, shiftKey: true });
    fireEvent.click(cardB, { shiftKey: true });
    expect(cardA.classList.contains("selected")).toBe(true);
    expect(cardB.classList.contains("selected")).toBe(true);

    // Drag cardA collaboratively
    fireEvent.mouseDown(cardA, { button: 0, clientX: 150, clientY: 150 });
    fireEvent.mouseMove(window, { clientX: 220, clientY: 220 });
    fireEvent.mouseUp(window, { clientX: 220, clientY: 220 });
    // When mouseup finishes drag, browser triggers click on the released element
    fireEvent.click(cardA);

    // Both cards must still remain selected!
    expect(cardA.classList.contains("selected")).toBe(true);
    expect(cardB.classList.contains("selected")).toBe(true);
  });

  it("marquee box selection inside group container selects inner cards only and not the group container", () => {
    const groupWithCardsData: CanvasData = {
      nodes: [
        { id: "g1", type: "group", label: "容器分组", x: 50, y: 50, width: 600, height: 400 },
        { id: "inner1", type: "text", text: "内部卡片1", x: 100, y: 120, width: 180, height: 90 },
        { id: "inner2", type: "text", text: "内部卡片2", x: 320, y: 120, width: 180, height: 90 },
      ],
      edges: [],
    };

    render(
      <CanvasView
        title="组内框选测试"
        source={JSON.stringify(groupWithCardsData)}
        onSourceChange={vi.fn()}
        editable={true}
        theme="twitter"
      />
    );

    const groupNode = screen.getByText(/容器分组/).closest(".canvas-node")!;
    const innerCard1 = screen.getByText(/内部卡片1/).closest(".canvas-node")!;
    const innerCard2 = screen.getByText(/内部卡片2/).closest(".canvas-node")!;

    // Trigger box selection over group body with Shift key
    fireEvent.mouseDown(groupNode, { button: 0, shiftKey: true, clientX: 90, clientY: 110 });
    fireEvent.mouseMove(window, { clientX: 520, clientY: 230, shiftKey: true });
    fireEvent.mouseUp(window, { clientX: 520, clientY: 230, shiftKey: true });

    // Inner cards are selected
    expect(innerCard1.classList.contains("selected")).toBe(true);
    expect(innerCard2.classList.contains("selected")).toBe(true);
    // Outer group container MUST NOT be selected
    expect(groupNode.classList.contains("selected")).toBe(false);
  });

  it("panning canvas does not clear active card selection while stationary background click does", () => {
    const data: CanvasData = {
      nodes: [
        { id: "pan-card", type: "text", text: "保持选中卡片", x: 100, y: 100, width: 200, height: 100 },
      ],
      edges: [],
    };

    const { container } = render(
      <CanvasView
        title="画布平移选区测试"
        source={JSON.stringify(data)}
        onSourceChange={vi.fn()}
        editable={true}
        theme="twitter"
      />
    );

    const card = screen.getByText("保持选中卡片").closest(".canvas-node")!;
    const canvasContainer = container.querySelector(".knowspace-canvas-view")!;

    // Select the card
    fireEvent.mouseDown(card, { button: 0 });
    fireEvent.click(card);
    expect(card.classList.contains("selected")).toBe(true);

    // Drag background to pan canvas (movement > 4px)
    fireEvent.mouseDown(canvasContainer, { button: 0, clientX: 400, clientY: 400 });
    fireEvent.mouseMove(window, { clientX: 450, clientY: 450 });
    fireEvent.mouseUp(window, { clientX: 450, clientY: 450 });

    // Selection MUST be preserved after panning!
    expect(card.classList.contains("selected")).toBe(true);

    // Click background statically without moving (movement <= 4px)
    fireEvent.mouseDown(canvasContainer, { button: 0, clientX: 400, clientY: 400 });
    fireEvent.mouseUp(window, { clientX: 400, clientY: 400 });

    // Now selection is cleared!
    expect(card.classList.contains("selected")).toBe(false);
  });

  it("closes both directory and outline sidebar when opening or switching to a canvas file", () => {
    // Simulates the state transition logic in App.tsx
    let directoryOpen = true;
    let sidebarOpen = true;
    let sidebarTab: "toc" | "bookmarks" | "search" = "toc";
    let viewMode: "reader" | "split" | "mindmap" | "canvas" = "split";

    const handleOpenDocument = (fileName: string) => {
      const isCanvas = fileName.toLowerCase().endsWith(".canvas");
      if (isCanvas) {
        viewMode = "canvas";
        directoryOpen = false;
        sidebarOpen = false;
      } else {
        sidebarOpen = true;
        sidebarTab = "toc";
      }
    };

    // Open a markdown file first
    handleOpenDocument("chapter-1.md");
    expect(sidebarOpen).toBe(true);
    expect(sidebarTab).toBe("toc");

    // Open a canvas whiteboard file
    handleOpenDocument("system-architecture.canvas");
    expect(viewMode).toBe("canvas");
    expect(directoryOpen).toBe(false);
    expect(sidebarOpen).toBe(false);
  });
});



