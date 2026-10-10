import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVaultOpening } from "../hooks/useVaultOpening";
import { useUiStore } from "../store/useUiStore";
import { useTabStore } from "../store/useTabStore";
import { useVaultStore } from "../store/useVaultStore";

/**
 * 打开闪念文件不得把侧栏从"闪念 Space"上拽走。
 *
 * 全链路是：时间线卡片 → openNoteFile/openNoteInReader → 守卫
 * （useUnsavedGuard）→ doOpenDesktopMarkdownPath。旧逻辑在最后一步无条件
 * `setSidebarTab("toc")`，这就是"点开卡片时间线自动退出"的根因。守卫会暂存
 * 动作等保存后重放，所以这条保证必须在最底端成立，测试也就打在最底端。
 */
const SPACE_PATH = "C:\\Users\\u\\Documents\\Space\\2026-09-07_1803.md";
const DOC_PATH = "C:\\Docs\\企业智能体落地建议.md";

const readMarkdownFile = vi.fn();

function mountOpening() {
  const setViewMode = vi.fn();
  const { result } = renderHook(() =>
    useVaultOpening({
      openSession: vi.fn(),
      setViewMode,
      activeLoadedChapterIdRef: { current: "" },
      pendingBookmarkRef: { current: null },
    }),
  );
  return { result, setViewMode };
}

beforeEach(() => {
  // 时间线就位：侧栏开着、停在闪念 Space 页上。
  useUiStore.setState({ sidebarOpen: true, sidebarTab: "space" });
  useTabStore.setState({ tabs: [], activeTabId: "" });
  useVaultStore.setState({ manifest: null });
  readMarkdownFile.mockReset().mockResolvedValue({ markdown: "# 闪念\n正文", baseUrl: "file:///" });
  (window as unknown as { bookMDDesktop: unknown }).bookMDDesktop = {
    files: { readMarkdownFile },
  };
});

describe("useVaultOpening - Space 闪念文件与侧栏", () => {
  it("打开 Space 闪念后侧栏仍停留在 space（时间线不退出）", async () => {
    const { result, setViewMode } = mountOpening();

    await act(async () => {
      await result.current.doOpenDesktopMarkdownPath(SPACE_PATH);
    });

    expect(useUiStore.getState().sidebarTab).toBe("space");
    expect(useUiStore.getState().sidebarOpen).toBe(true);
    expect(setViewMode).not.toHaveBeenCalled();
  });

  it("打开普通文件仍把侧栏切回大纲（既有行为不变）", async () => {
    const { result } = mountOpening();

    await act(async () => {
      await result.current.doOpenDesktopMarkdownPath(DOC_PATH);
    });

    expect(useUiStore.getState().sidebarTab).toBe("toc");
    expect(useUiStore.getState().sidebarOpen).toBe(true);
  });

  it("选项 viewMode=read 时切到阅览页，且侧栏不动", async () => {
    const { result, setViewMode } = mountOpening();

    await act(async () => {
      await result.current.doOpenDesktopMarkdownPath(SPACE_PATH, null, { viewMode: "read" });
    });

    expect(setViewMode).toHaveBeenCalledWith("read");
    expect(useUiStore.getState().sidebarTab).toBe("space");
  });
});
