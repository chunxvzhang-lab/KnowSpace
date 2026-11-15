import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { documentTemplates } from "../services/documentTemplates";
import { TemplateDialog } from "../components/TemplateDialog";

describe("built-in document templates", () => {
  it("bundles all 20 maintained Markdown files without changing their content", () => {
    expect(documentTemplates).toHaveLength(20);
    expect(new Set(documentTemplates.map((template) => template.category)).size).toBe(5);
    expect(new Set(documentTemplates.map((template) => template.id)).size).toBe(20);
    for (const [index, template] of documentTemplates.entries()) {
      const category = `${String(Math.floor(index / 4) + 1).padStart(2, "0")}-${template.category}`;
      const file = resolve(
        __dirname,
        "../../docs/markdown-templates",
        category,
        `${template.id}.md`,
      );
      expect(template.content).toBe(readFileSync(file, "utf8"));
      expect(template.id).toMatch(new RegExp(`^${String(index + 1).padStart(2, "0")}-`));
      expect(template.content).toContain("【待填写");
    }
  });
});

describe("template picker", () => {
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
  const mount = () => {
    const onClose = vi.fn();
    const onCreate = vi.fn();
    render(<TemplateDialog onClose={onClose} onCreate={onCreate} />);
    return { onClose, onCreate };
  };

  it("previews actual Markdown and creates only the selected template", () => {
    const { onCreate } = mount();
    fireEvent.click(screen.getByRole("button", { name: /会议纪要.*协作与推进/ }));
    const preview = screen.getByRole("region", { name: "模板内容预览" });
    expect(within(preview).getByRole("heading", { name: "行动项" })).toBeTruthy();
    expect(preview.querySelectorAll("table")).toHaveLength(2);
    expect(onCreate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "使用模板新建" }));
    expect(onCreate).toHaveBeenCalledExactlyOnceWith(documentTemplates[4]);
  });

  it("filters by both category and trimmed search, with a usable empty state", () => {
    mount();
    fireEvent.change(screen.getByLabelText("模板分类"), { target: { value: "协作与推进" } });
    expect(screen.getByRole("status").textContent).toContain("4 / 20");
    fireEvent.change(screen.getByLabelText("搜索模板"), { target: { value: "  会议  " } });
    expect(screen.getByRole("status").textContent).toContain("1 / 20");
    fireEvent.change(screen.getByLabelText("搜索模板"), { target: { value: "不存在的模板" } });
    expect(screen.getByRole("button", { name: "使用模板新建" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByText("没有可预览的模板。")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("搜索模板"), { target: { value: "" } });
    expect(screen.getByRole("status").textContent).toContain("4 / 20");
  });

  it("cancels without creating a note", () => {
    const { onClose, onCreate } = mount();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
