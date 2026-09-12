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

    const { container } = render(
      <EditorContextMenu
        x={150}
        y={200}
        onClose={onClose}
        view={mockView}
      />
    );

    const menu = container.querySelector(".editor-context-menu");
    expect(menu).toBeDefined();

    const scrollArea = container.querySelector(".editor-context-menu-scroll");
    expect(scrollArea).toBeDefined();

    const footer = container.querySelector(".context-menu-footer");
    expect(footer).toBeDefined();
    expect(footer?.textContent).toContain("全文共");
  });

  it("opens portal submenu on hover and inserts standard 3x3 table on click", () => {
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

    // Portal renders "标准表格 (3×3)" and "自定义表格 (行列数)" into document.body
    const standardTableBtn = screen.getByText("标准表格 (3×3)");
    expect(standardTableBtn).toBeDefined();

    fireEvent.click(standardTableBtn);
    expect(mockView.dispatch).toHaveBeenCalled();
    const dispatchedCall = (mockView.dispatch as any).mock.calls[0][0];
    expect(dispatchedCall.changes.insert).toContain("| 标题 1 | 标题 2 | 标题 3 |");
    expect(onClose).toHaveBeenCalled();
  });

  it("opens custom table picker and supports custom dimensions insertion", () => {
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

    // Open insert submenu
    const insertTrigger = screen.getByText("插入内容与图表");
    fireEvent.mouseEnter(insertTrigger.closest(".context-menu-item")!);

    // Open custom table picker
    const customTableTrigger = screen.getByText("自定义表格 (行列数)");
    fireEvent.mouseEnter(customTableTrigger.closest(".context-menu-item")!);

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
});
