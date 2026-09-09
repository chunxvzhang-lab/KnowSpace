import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { VersionHistoryDialog } from "../components/VersionHistoryDialog";
import { recordWebSnapshot } from "../services/webSnapshotService";

describe("VersionHistoryDialog Component", () => {
  const mockFile = "notes.md";
  const oldContent = "Line 1\nOld Line 2\nLine 3";
  const newContent = "Line 1\nNew Line 2 (edited)\nLine 3\nLine 4 (added)";

  beforeEach(() => {
    localStorage.clear();
    // Seed localStorage with a snapshot
    recordWebSnapshot(mockFile, oldContent, "manual");
  });

  it("renders version history dialog and displays diff", async () => {
    const onClose = vi.fn();
    const onRevert = vi.fn().mockReturnValue(true);

    render(
      <VersionHistoryDialog
        isOpen={true}
        onClose={onClose}
        fileName="notes.md"
        filePath="notes.md"
        currentContent={newContent}
        theme="twitter"
        onRevertToContent={onRevert}
      />
    );

    // Title
    expect(screen.getByText(/时间旅行与本地快照历史/)).toBeDefined();

    // Mode toggles
    expect(screen.getByText("双栏对比")).toBeDefined();
    expect(screen.getByText("统一对比")).toBeDefined();

    // Snapshot card exists in timeline
    await waitFor(() => {
      expect(screen.getByText("历史快照版本")).toBeDefined();
      expect(screen.getAllByText(/最新/).length).toBeGreaterThan(0);
    });

    // Side-by-side diff headers
    expect(screen.getByText("历史快照版本")).toBeDefined();
    expect(screen.getByText("当前工作区最新版本")).toBeDefined();

    // Contains diff texts
    expect(screen.getByText("Old Line 2")).toBeDefined();
    expect(screen.getByText("New Line 2 (edited)")).toBeDefined();
  });

  it("switches to unified mode and handles revert workflow", async () => {
    const onClose = vi.fn();
    const onRevert = vi.fn().mockReturnValue(true);

    render(
      <VersionHistoryDialog
        isOpen={true}
        onClose={onClose}
        fileName="notes.md"
        filePath="notes.md"
        currentContent={newContent}
        theme="twitter"
        onRevertToContent={onRevert}
      />
    );

    // Switch to unified diff
    const unifiedBtn = screen.getByText("统一对比");
    fireEvent.click(unifiedBtn);

    // Click "还原至此版本"
    const revertBtn = screen.getByText("还原至此版本");
    fireEvent.click(revertBtn);

    // Confirmation modal should appear
    expect(screen.getByText("确认还原至历史快照？")).toBeDefined();

    // Confirm revert
    const confirmBtn = screen.getByText("确认还原");
    fireEvent.click(confirmBtn);

    expect(onRevert).toHaveBeenCalledWith(oldContent);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
