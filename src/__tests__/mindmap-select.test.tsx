import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MindmapSelect, type MindmapSelectOption } from "../components/mindmap/MindmapSelect";

const OPTIONS: MindmapSelectOption[] = [
  { id: "logic", label: "逻辑结构图", description: "根居中，一级分支左右展开" },
  { id: "bidirectional", label: "双向" },
  { id: "vertical", label: "纵向" },
];

function renderPicker(overrides?: { value?: string; onChange?: (id: string) => void }) {
  const onChange = overrides?.onChange ?? vi.fn();
  const view = render(
    <MindmapSelect
      value={overrides?.value ?? "logic"}
      options={OPTIONS}
      onChange={onChange}
      ariaLabel="导图布局"
    />,
  );
  const trigger = screen.getByRole("button", { name: "导图布局" });
  return { view, onChange, trigger };
}

describe("MindmapSelect（手写下拉，替换 OS 弹层的黑盒样式）", () => {
  beforeEach(() => {
    // portal 落在 body 上，跨用例残留会让下一个用例看到上一轮的弹层。
    document.body.textContent = "";
  });

  it("触发钮显示当前项；打开后是 listbox 且当前项选中", async () => {
    renderPicker();
    expect(screen.getByRole("button", { name: "导图布局" }).textContent).toContain("逻辑结构图");
    fireEvent.click(screen.getByRole("button", { name: "导图布局" }));
    const listbox = await screen.findByRole("listbox");
    expect(listbox).toBeTruthy();
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["逻辑结构图", "双向", "纵向"]);
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    // 打开即定位到当前项（aria-activedescendant 指向它）。
    expect(
      screen.getByRole("button", { name: "导图布局" }).getAttribute("aria-activedescendant"),
    ).toBe(options[0].id);
  });

  it("点击选项提交并关闭", async () => {
    const { onChange } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "导图布局" }));
    fireEvent.click(await screen.findByText("双向"));
    expect(onChange).toHaveBeenCalledWith("bidirectional");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("键盘：ArrowDown 移动活动项，Enter 提交活动项", async () => {
    const { onChange } = renderPicker();
    const trigger = screen.getByRole("button", { name: "导图布局" });
    fireEvent.click(trigger);
    await screen.findByRole("listbox");
    // 当前项是第一项：ArrowDown 移到第二项。
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("bidirectional");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Escape 关闭而不提交", async () => {
    const onChange = vi.fn();
    renderPicker({ onChange });
    const trigger = screen.getByRole("button", { name: "导图布局" });
    fireEvent.click(trigger);
    await screen.findByRole("listbox");
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("点击弹层与触发钮之外的任何地方关闭", async () => {
    const { onChange } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "导图布局" }));
    await screen.findByRole("listbox");
    fireEvent(document.body, new MouseEvent("mousedown", { bubbles: true }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("未列入列表的 value 显示原始 id，而不是悄悄顶替成第一项", () => {
    renderPicker({ value: "legacy-id" });
    expect(screen.getByRole("button", { name: "导图布局" }).textContent).toContain("legacy-id");
  });
});
