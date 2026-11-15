import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Toolbar } from "../components/Toolbar";

describe("document tools dialog", () => {
  const originalShowModal = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    "showModal",
  );
  const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    });
  });
  afterEach(() => {
    cleanup();
    if (originalShowModal)
      Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    vi.restoreAllMocks();
  });
  const base = {
    title: "KnowSpace",
    chapterTitle: "Document",
    viewMode: "read" as const,
    onViewModeChange: vi.fn(),
    canGoPrevious: false,
    canGoNext: false,
    fontScale: 1,
    onFontScaleChange: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onAddBookmark: vi.fn(),
    onOpenMarkdown: vi.fn(),
  };
  function openTools() {
    fireEvent.click(screen.getByRole("button", { name: "文档工具" }));
    return screen.getByRole("dialog", { name: "文档工具" });
  }
  it("closes before opening another workflow and keeps top-level save available", () => {
    const onOpenVersionHistory = vi.fn(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    render(<Toolbar {...base} onOpenVersionHistory={onOpenVersionHistory} />);
    expect(screen.getByRole("button", { name: "保存当前文件" })).toBeDefined();
    const dialog = openTools();
    fireEvent.click(within(dialog).getByRole("button", { name: /版本快照与历史比对/ }));
    expect(onOpenVersionHistory).toHaveBeenCalledOnce();
  });
  it("changes reading settings without dismissing the dialog and reports values", () => {
    const onToggleLineNumbers = vi.fn();
    const onFontScaleChange = vi.fn();
    render(
      <Toolbar
        {...base}
        showLineNumbers
        onToggleLineNumbers={onToggleLineNumbers}
        onFontScaleChange={onFontScaleChange}
      />,
    );
    const dialog = openTools();
    const toggle = within(dialog).getByRole("button", { name: "隐藏正文预览行号" });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(onToggleLineNumbers).toHaveBeenCalledOnce();
    fireEvent.change(within(dialog).getByRole("slider", { name: "阅读字号" }), {
      target: { value: "1.2" },
    });
    expect(onFontScaleChange).toHaveBeenCalledWith(1.2);
    expect(dialog.hasAttribute("open")).toBe(true);
  });
  it("offers hidden-file controls only with a directory and prevents global shortcuts inside tools", () => {
    const onToggleHiddenFiles = vi.fn();
    const { rerender } = render(<Toolbar {...base} onToggleHiddenFiles={onToggleHiddenFiles} />);
    const dialog = openTools();
    expect(within(dialog).queryByRole("button", { name: "显示点开头的文件" })).toBeNull();
    rerender(<Toolbar {...base} hasDirectory onToggleHiddenFiles={onToggleHiddenFiles} />);
    fireEvent.click(within(dialog).getByRole("button", { name: "显示点开头的文件" }));
    expect(onToggleHiddenFiles).toHaveBeenCalledOnce();
    const globalKey = vi.fn();
    window.addEventListener("keydown", globalKey);
    try {
      fireEvent.keyDown(dialog, { key: "Escape" });
      expect(globalKey).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", globalKey);
    }
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭文档工具" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
