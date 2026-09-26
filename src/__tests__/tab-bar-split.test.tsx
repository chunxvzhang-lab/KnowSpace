import { render, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TabBar, type TabItem } from "../components/TabBar";

const mockTabs: TabItem[] = [
  { id: "doc-1", title: "Chapter 1", relativePath: "ch1.md" },
  { id: "doc-2", title: "Chapter 2", relativePath: "ch2.md" },
  { id: "doc-3", title: "Chapter 3", relativePath: "ch3.md" },
];

describe("TabBar Dual Split Context Menu & Indicators", () => {
  it("renders tabs correctly and opens split context menu on right click", () => {
    const onSelectTab = vi.fn();
    const onCloseTab = vi.fn();
    const onOpenDualSplit = vi.fn();
    const onCloseDualSplit = vi.fn();

    render(
      <TabBar
        tabs={mockTabs}
        activeTabId="doc-1"
        dualSplitTabId={null}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onCloseOtherTabs={vi.fn()}
        onCloseRightTabs={vi.fn()}
        onOpenDualSplit={onOpenDualSplit}
        onCloseDualSplit={onCloseDualSplit}
      />,
    );

    expect(screen.getByText("Chapter 1")).toBeDefined();
    expect(screen.getByText("Chapter 2")).toBeDefined();

    // Right-click on doc-2
    const tab2 = screen.getByText("Chapter 2").closest(".tab-item");
    expect(tab2).not.toBeNull();
    fireEvent.contextMenu(tab2!);

    // Context menu should display "📖 在右侧分屏对比查看"
    const splitMenuItem = screen.getByText("📖 在右侧分屏对比查看");
    expect(splitMenuItem).toBeDefined();

    fireEvent.click(splitMenuItem);
    expect(onOpenDualSplit).toHaveBeenCalledWith("doc-2");
  });

  it("highlights the secondary split tab with badge and allows exiting dual split", () => {
    const onSelectTab = vi.fn();
    const onCloseTab = vi.fn();
    const onOpenDualSplit = vi.fn();
    const onCloseDualSplit = vi.fn();

    render(
      <TabBar
        tabs={mockTabs}
        activeTabId="doc-1"
        dualSplitTabId="doc-2"
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onCloseOtherTabs={vi.fn()}
        onCloseRightTabs={vi.fn()}
        onOpenDualSplit={onOpenDualSplit}
        onCloseDualSplit={onCloseDualSplit}
      />,
    );

    // Should display split badge
    expect(screen.getByText("分屏")).toBeDefined();

    // Should display exit split button in tab bar
    const exitBtn = screen.getByText("✕ 退出分屏");
    expect(exitBtn).toBeDefined();

    fireEvent.click(exitBtn);
    expect(onCloseDualSplit).toHaveBeenCalledTimes(1);
  });

  it("supports detaching a tab to a separate independent window via context menu", () => {
    const onDetachTab = vi.fn();

    render(
      <TabBar
        tabs={mockTabs}
        activeTabId="doc-1"
        dualSplitTabId={null}
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onCloseOtherTabs={vi.fn()}
        onCloseRightTabs={vi.fn()}
        onDetachTab={onDetachTab}
      />,
    );

    const tab3 = screen.getByText("Chapter 3").closest(".tab-item");
    expect(tab3).not.toBeNull();
    fireEvent.contextMenu(tab3!);

    const detachBtn = screen.getByText("🗗 分离到独立新窗口");
    expect(detachBtn).toBeDefined();

    fireEvent.click(detachBtn);
    expect(onDetachTab).toHaveBeenCalledWith("doc-3");
  });
});
