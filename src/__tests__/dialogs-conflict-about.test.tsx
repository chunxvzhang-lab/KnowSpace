import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileConflictDialog } from "../components/FileConflictDialog";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog";
import { AboutDialog } from "../components/AboutDialog";

describe("Dialogs Sub-function Tests", () => {
  describe("FileConflictDialog", () => {
    it("returns null when not open", () => {
      const { container } = render(
        <FileConflictDialog
          isOpen={false}
          fileName="test.md"
          onReload={vi.fn()}
          onOverwrite={vi.fn()}
          onSaveAs={vi.fn()}
          onCancel={vi.fn()}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders options and triggers callbacks when open", () => {
      const onReload = vi.fn();
      const onOverwrite = vi.fn();
      const onSaveAs = vi.fn();
      const onCancel = vi.fn();

      render(
        <FileConflictDialog
          isOpen={true}
          fileName="conflicted.md"
          onReload={onReload}
          onOverwrite={onOverwrite}
          onSaveAs={onSaveAs}
          onCancel={onCancel}
        />
      );

      expect(screen.getByText("检测到文件冲突")).toBeDefined();
      expect(screen.getByText(/conflicted.md/)).toBeDefined();

      fireEvent.click(screen.getByText("重新载入磁盘内容"));
      expect(onReload).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText("强制覆盖磁盘文件"));
      expect(onOverwrite).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText("另存为新文件"));
      expect(onSaveAs).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText("取消"));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("UnsavedChangesDialog", () => {
    it("returns null when not open", () => {
      const { container } = render(
        <UnsavedChangesDialog
          isOpen={false}
          fileName="notes.md"
          onSave={vi.fn()}
          onDiscard={vi.fn()}
          onCancel={vi.fn()}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders save, discard, cancel buttons and triggers callbacks", () => {
      const onSave = vi.fn();
      const onDiscard = vi.fn();
      const onCancel = vi.fn();

      render(
        <UnsavedChangesDialog
          isOpen={true}
          fileName="important-notes.md"
          onSave={onSave}
          onDiscard={onDiscard}
          onCancel={onCancel}
        />
      );

      expect(screen.getByText("是否保存未保存的修改？")).toBeDefined();
      expect(screen.getByText(/important-notes.md/)).toBeDefined();

      fireEvent.click(screen.getByText("保存文件"));
      expect(onSave).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText("放弃更改"));
      expect(onDiscard).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText("取消"));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("AboutDialog", () => {
    it("returns null when not open", () => {
      const { container } = render(
        <AboutDialog isOpen={false} onClose={vi.fn()} />
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders version info, product details, and close action", () => {
      const onClose = vi.fn();
      render(<AboutDialog isOpen={true} onClose={onClose} />);

      expect(screen.getAllByText("KnowSpace").length).toBeGreaterThan(0);
      expect(screen.getAllByText(/v2\.0\./).length).toBeGreaterThan(0);
      expect(screen.getByText(/Personal Knowledge Workspace/)).toBeDefined();

      // Click Close button
      const closeBtn = screen.getByTitle("关闭 (Esc)");
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
