import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditorContextMenu } from "../components/EditorContextMenu";
import { EditorView } from "@codemirror/view";

describe("EditorContextMenu Component", () => {
  const createMockView = (initialText = "测试文档段落内容") => {
    const doc = {
      toString: () => initialText,
      length: initialText.length,
      sliceString: (from: number, to: number) => initialText.slice(from, to),
      lineAt: () => ({ text: initialText, from: 0, to: initialText.length, number: 1 }),
      line: (n: number) => ({ text: initialText, from: 0, to: initialText.length, number: n }),
    };

    return {
      state: {
        doc,
        selection: {
          main: { from: 0, to: 0, empty: true },
        },
        sliceDoc: (from: number, to: number) => initialText.slice(from, to),
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    } as unknown as EditorView;
  };

  it("renders with scroll container and pinned footer without overflowing", () => {
    const mockView = createMockView();
    const onClose = vi.fn();

    render(
      <EditorContextMenu
        x={150}
        y={200}
        onClose={onClose}
        view={mockView}
      />
    );

    const menu = document.querySelector(".editor-context-menu");
    expect(menu).toBeDefined();

    const scrollArea = document.querySelector(".editor-context-menu-scroll");
    expect(scrollArea).toBeDefined();

    const ribbon = document.querySelector(".format-ribbon");
    expect(ribbon).toBeDefined();

    const footer = document.querySelector(".context-menu-footer");
    expect(footer).toBeDefined();
    expect(footer?.textContent).toContain("全文共");
  });

  it("opens portal submenu on hover and inserts rich blocks without redundant table options", () => {
    const mockView = createMockView();
    const onClose = vi.fn();

    render(
      <EditorContextMenu
        x={150}
        y={200}
        onClose={onClose}
        view={mockView}
      />
    );

    const insertTrigger = screen.getByText("插入内容与图表");
    expect(insertTrigger).toBeDefined();

    // Hover to trigger portal submenu
    fireEvent.mouseEnter(insertTrigger.closest(".context-menu-item")!);

    // Portal renders "代码块", "LaTeX 数学公式", "Mermaid 架构图", "当前时间戳"
    const codeBlockBtn = screen.getByText("代码块");
    expect(codeBlockBtn).toBeDefined();
    expect(screen.getByText("LaTeX 数学公式")).toBeDefined();
    expect(screen.getByText("Mermaid 架构图")).toBeDefined();
    expect(screen.getByText("当前时间戳")).toBeDefined();

    // Redundant duplicate table items are removed from this submenu
    expect(screen.queryByText("标准表格 (3×3)")).toBeNull();
    expect(screen.queryByText("自定义表格 (行列数)")).toBeNull();

    fireEvent.click(codeBlockBtn);
    expect(mockView.dispatch).toHaveBeenCalled();
    const dispatchedCall = (mockView.dispatch as any).mock.calls[0][0];
    expect(dispatchedCall.changes.insert).toContain("```typescript");
    expect(onClose).toHaveBeenCalled();
  });

  it("opens custom table picker directly from main menu and supports dimension selection", () => {
    const mockView = createMockView();
    const onClose = vi.fn();

    render(
      <EditorContextMenu
        x={150}
        y={200}
        onClose={onClose}
        view={mockView}
      />
    );

    // Direct first-class trigger in main menu
    const directTableTrigger = screen.getByText("插入表格 (自定义行列)");
    fireEvent.mouseEnter(directTableTrigger.closest(".context-menu-item")!);

    // Verify table picker panel is rendered
    expect(screen.getByText("自定义表格")).toBeDefined();
    expect(screen.getByLabelText("自定义表格行列选择器")).toBeDefined();

    // Verify 8x6 matrix has 48 cells
    const cells = document.querySelectorAll(".table-grid-cell");
    expect(cells.length).toBe(48);

    // Click a specific matrix cell (e.g. 4th row, 5th col -> cell index 28)
    const targetCell = cells[4 * 8 + 3]; // row 5, col 4
    fireEvent.click(targetCell);

    expect(mockView.dispatch).toHaveBeenCalled();
    const dispatchedCall = (mockView.dispatch as any).mock.calls[0][0];
    expect(dispatchedCall.changes.insert).toContain("| 标题 1 | 标题 2 | 标题 3 | 标题 4 |");
    expect(onClose).toHaveBeenCalled();
  });

  it("guarantees mutual exclusivity of submenus to eliminate lingering or overlapping panels", () => {
    const mockView = createMockView();
    const onClose = vi.fn();

    render(
      <EditorContextMenu
        x={150}
        y={200}
        onClose={onClose}
        view={mockView}
      />
    );

    // 1. Hover table picker -> table picker opens
    const directTableTrigger = screen.getByText("插入表格 (自定义行列)");
    fireEvent.mouseEnter(directTableTrigger.closest(".context-menu-item")!);
    expect(screen.getByLabelText("自定义表格行列选择器")).toBeDefined();

    // 2. Hover headings submenu -> table picker must close immediately, headings submenu opens
    const headingsTrigger = screen.getByText("转为标题");
    fireEvent.mouseEnter(headingsTrigger.closest(".context-menu-item")!);
    expect(screen.queryByLabelText("自定义表格行列选择器")).toBeNull();
    expect(screen.getByText("一级标题 H1")).toBeDefined();

    // 3. Hover clipboard group -> headings submenu must close immediately
    const copyBtn = screen.getByText("复制");
    fireEvent.mouseEnter(copyBtn.closest(".menu-group")!);
    expect(screen.queryByText("一级标题 H1")).toBeNull();
    expect(screen.queryByLabelText("自定义表格行列选择器")).toBeNull();
  });
});
