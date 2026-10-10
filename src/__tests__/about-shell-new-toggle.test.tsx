import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AboutFeatureCards } from "../components/about/AboutFeatureCards";

/**
 * 设置卡片里的"右键新建"开关：勾选发出请求、禁用态不发请求。
 * 注册表真值的读回逻辑在 AboutDialog（状态展示）与主进程（现查现答）。
 */
const baseProps = {
  autoLaunch: false,
  runInBackground: true,
  autoSaveEnabled: true,
  handleToggleAutoLaunch: vi.fn(),
  handleToggleRunInBackground: vi.fn(),
  handleToggleAutoSave: vi.fn(),
  shellNewMessage: null,
  repoUrl: "https://github.com/chunxvzhang-lab/KnowSpace",
  authorUrl: "https://github.com/chunxvzhang",
  handleOpenExternal: vi.fn(),
};

describe("AboutFeatureCards - 资源管理器右键新建开关", () => {
  it("勾选 Markdown 开关，按类型发出启用请求", () => {
    const handleToggleShellNew = vi.fn();
    render(
      <AboutFeatureCards
        {...baseProps}
        handleToggleShellNew={handleToggleShellNew}
        shellNewStatus={{ supported: true, markdown: false, canvas: false, mindmap: false }}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Markdown 文档/ }));

    expect(handleToggleShellNew).toHaveBeenCalledWith("markdown", true);
    cleanup();
  });

  it("勾选白板开关，发出 canvas 启用请求", () => {
    const handleToggleShellNew = vi.fn();
    render(
      <AboutFeatureCards
        {...baseProps}
        handleToggleShellNew={handleToggleShellNew}
        shellNewStatus={{ supported: true, markdown: true, canvas: false, mindmap: false }}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /空间白板/ }));

    expect(handleToggleShellNew).toHaveBeenCalledWith("canvas", true);
    cleanup();
  });

  it("勾选思维导图开关，发出 mindmap 启用请求", () => {
    const handleToggleShellNew = vi.fn();
    render(
      <AboutFeatureCards
        {...baseProps}
        handleToggleShellNew={handleToggleShellNew}
        shellNewStatus={{ supported: true, markdown: true, canvas: true, mindmap: false }}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /思维导图/ }));

    expect(handleToggleShellNew).toHaveBeenCalledWith("mindmap", true);
    cleanup();
  });

  it("环境不支持时开关禁用且不发出请求", () => {
    const handleToggleShellNew = vi.fn();
    render(
      <AboutFeatureCards
        {...baseProps}
        handleToggleShellNew={handleToggleShellNew}
        shellNewStatus={{ supported: false, markdown: false, canvas: false, mindmap: false }}
      />,
    );

    const box = screen.getByRole("checkbox", { name: /Markdown 文档/ }) as HTMLInputElement;
    expect(box.disabled).toBe(true);
    fireEvent.click(box);
    expect(handleToggleShellNew).not.toHaveBeenCalled();
    cleanup();
  });

  it("错误消息以 alert 角色呈现", () => {
    render(
      <AboutFeatureCards
        {...baseProps}
        handleToggleShellNew={vi.fn()}
        shellNewStatus={{ supported: true, markdown: false, canvas: false, mindmap: false }}
        shellNewMessage="右键新建菜单仅 Windows 桌面版支持。"
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("仅 Windows 桌面版支持");
    cleanup();
  });
});
