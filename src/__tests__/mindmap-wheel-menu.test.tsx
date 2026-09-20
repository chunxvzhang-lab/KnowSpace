import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";

/**
 * 滚轮与打开的右键菜单。
 *
 * 菜单很高 —— 它自己会滚动，`overflow-y: auto` 就是为这个写的 —— 但滚轮事件仍然会冒泡到
 * 挂着缩放处理的外层容器上，于是"想看看菜单剩下那半"变成了"整张脑图跟着放大缩小"。
 * 这三条用例钉住的是：**菜单开着时，滚轮不动脑图**；菜单该关的时候关掉；以及没有菜单时
 * 缩放一切照旧 —— 最后一条同样重要，把功能一起关掉也是一种错。
 */
const SOURCE = ["- 父节点", "  - 子节点甲", "  - 子节点乙", "- 第二个分支"].join("\n");

describe("滚轮与右键菜单", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  /** 视口组的变换就是缩放本身：它变没变，比任何内部状态都直接。 */
  const transformOf = () => document.querySelector(".mindmap-viewport")?.getAttribute("transform") ?? "";
  const menuOf = () => document.querySelector(".mindmap-context-menu");
  const viewport = () => document.querySelector(".mindmap-viewport") as Element;

  it("在菜单上滚动：菜单滚它的，脑图不动", () => {
    render(<MindmapView title="测试" source={SOURCE} />);
    fireEvent.click(screen.getByRole("button", { name: "外观样式" }));

    const menu = menuOf();
    expect(menu).toBeTruthy();
    const before = transformOf();

    fireEvent.wheel(menu as Element, { deltaY: -240 });

    expect(transformOf()).toBe(before);
    // And the wheel did not cost the reader their menu either.
    expect(menuOf()).toBeTruthy();
  });

  it("菜单开着时在别处滚动：关掉菜单，同样不缩放", () => {
    render(<MindmapView title="测试" source={SOURCE} />);
    fireEvent.click(screen.getByRole("button", { name: "外观样式" }));
    const before = transformOf();

    fireEvent.wheel(viewport(), { deltaY: -240 });

    expect(transformOf()).toBe(before);
    // One gesture, one effect: the wheel dismissed the menu instead of zooming.
    expect(menuOf()).toBeNull();
  });

  it("没有菜单时，滚轮照常缩放", () => {
    render(<MindmapView title="测试" source={SOURCE} />);
    const before = transformOf();

    fireEvent.wheel(viewport(), { deltaY: -240 });

    expect(transformOf()).not.toBe(before);
  });

  it("在顶栏上滚动：脑图同样不动 —— 顶栏是外壳，不是画布", () => {
    // 这一条和测试文件里别的不太一样：它管的是"顶栏上面",而顶栏的布局问题（打开文件目录与
    // 大纲后右侧控件消失）是 CSS 的换行改掉的，jsdom 看不见布局，能钉住的只有这一半 ——
    // 滚轮落在顶栏上不该穿透到画布的缩放上。
    render(<MindmapView title="测试" source={SOURCE} />);
    const before = transformOf();

    fireEvent.wheel(document.querySelector(".mindmap-toolbar") as Element, { deltaY: -240 });

    expect(transformOf()).toBe(before);
  });
});
