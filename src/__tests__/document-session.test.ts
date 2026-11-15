import { afterEach, describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDocumentSession } from "../hooks/useDocumentSession";

describe("src/hooks/useDocumentSession.ts", () => {
  it.each(["disk failure", "conflict"])("retains unsaved text after %s", async (kind) => {
    const oldBridge = window.bookMDDesktop;
    const saveMarkdownFile =
      kind === "conflict"
        ? vi.fn().mockResolvedValue({
            success: false,
            errorCode: "FILE_CONFLICT",
            message: "changed on disk",
            diskVersion: { size: 4, mtimeMs: 2 },
          })
        : vi.fn().mockRejectedValue(new Error("disk failure"));
    Object.assign(window, { bookMDDesktop: { files: { saveMarkdownFile }, system: {} } });
    try {
      const { result } = renderHook(() => useDocumentSession());
      act(() =>
        result.current.openSession({
          chapterId: "note",
          absolutePath: "C:/note.md",
          fileName: "note.md",
          baseUrl: "",
          source: "old",
          diskVersion: null,
          writable: true,
        }),
      );
      act(() => result.current.updateSource("unsaved text"));
      await act(async () => {
        expect((await result.current.saveSession()).success).toBe(false);
      });
      expect(result.current.session?.source).toBe("unsaved text");
      expect(result.current.session?.savedSource).toBe("old");
      expect(result.current.isDirty).toBe(true);
      expect(Boolean(result.current.conflict)).toBe(kind === "conflict");
    } finally {
      Object.assign(window, { bookMDDesktop: oldBridge });
    }
  });

  it("preserves edits made while saving and does not apply a finished save to another file", async () => {
    let finishSave!: (value: unknown) => void;
    const saveMarkdownFile = vi.fn(
      () =>
        new Promise((resolve) => {
          finishSave = resolve;
        }),
    );
    const oldBridge = window.bookMDDesktop;
    Object.assign(window, { bookMDDesktop: { files: { saveMarkdownFile }, system: {} } });
    try {
      const { result } = renderHook(() => useDocumentSession());
      const open = (id: string) =>
        result.current.openSession({
          chapterId: id,
          absolutePath: `C:/${id}.md`,
          fileName: `${id}.md`,
          baseUrl: "",
          source: id,
          diskVersion: { size: 1, mtimeMs: 1 },
          writable: true,
        });
      act(() => open("first"));
      act(() => result.current.updateSource("saved snapshot"));
      let saving!: ReturnType<typeof result.current.saveSession>;
      act(() => {
        saving = result.current.saveSession();
      });
      act(() => result.current.updateSource("newer edits"));
      await act(async () => {
        finishSave({ success: true, diskVersion: { size: 14, mtimeMs: 2 } });
        await saving;
      });
      expect(result.current.session?.source).toBe("newer edits");
      expect(result.current.session?.savedSource).toBe("saved snapshot");
      expect(result.current.isDirty).toBe(true);

      act(() => {
        saving = result.current.saveSession();
      });
      act(() => open("second"));
      await act(async () => {
        finishSave({ success: true, diskVersion: { size: 11, mtimeMs: 3 } });
        await saving;
      });
      expect(result.current.session?.source).toBe("second");
      expect(result.current.session?.savedSource).toBe("second");
      expect(result.current.isDirty).toBe(false);
    } finally {
      Object.assign(window, { bookMDDesktop: oldBridge });
    }
  });

  it("initializes empty and manages session updates with dirty tracking", async () => {
    const { result } = renderHook(() => useDocumentSession());

    expect(result.current.session).toBeNull();
    expect(result.current.isDirty).toBe(false);

    // Open a session
    act(() => {
      result.current.openSession({
        chapterId: "chap-1",
        absolutePath: "/test/path.md",
        fileName: "path.md",
        baseUrl: "file:///test/",
        source: "# Hello World",
        diskVersion: { size: 13, mtimeMs: 1000 },
        writable: true,
      });
    });

    expect(result.current.session).not.toBeNull();
    expect(result.current.session?.source).toBe("# Hello World");
    expect(result.current.isDirty).toBe(false);

    // Update source
    act(() => {
      result.current.updateSource("# Hello World Edit");
    });

    expect(result.current.isDirty).toBe(true);
    expect(result.current.session?.source).toBe("# Hello World Edit");

    // Discard changes
    act(() => {
      result.current.discardChanges();
    });

    expect(result.current.isDirty).toBe(false);
    expect(result.current.session?.source).toBe("# Hello World");

    // Close session
    act(() => {
      result.current.closeSession();
    });

    expect(result.current.session).toBeNull();
    expect(result.current.isDirty).toBe(false);
  });
});

/**
 * 阅读视图里点击任务复选框的会话层行为。
 *
 * 它与"时间线勾选 → 正文刷新"是一条链的两端：这里覆盖正文端 ——
 * 点击写盘后主进程会广播 flash-note-saved，时间线随之重读（见
 * files.cjs 的 notifyFlashSpaceFileWritten）。
 */
describe("useDocumentSession - 阅读视图任务复选框回写", () => {
  afterEach(() => {
    delete (window as unknown as { bookMDDesktop?: unknown }).bookMDDesktop;
    delete (window as unknown as { knowSpaceDesktop?: unknown }).knowSpaceDesktop;
  });

  function installBridge() {
    const saveMarkdownFile = vi.fn().mockResolvedValue({
      success: true,
      cacheKey: "cache",
      diskVersion: { size: 99, mtimeMs: 2 },
    });
    (window as unknown as { bookMDDesktop: unknown }).bookMDDesktop = {
      files: { saveMarkdownFile, readMarkdownFile: vi.fn() },
      // session 的状态回写 effect 会摸这个域；真实桥永远提供它（契约测试保证），
      // 测试里给空对象即走"无此方法则跳过"的分支。
      system: {},
    };
    return { saveMarkdownFile };
  }

  function mountWithTaskDoc() {
    const { result } = renderHook(() => useDocumentSession());
    act(() => {
      result.current.openSession({
        chapterId: "c1",
        absolutePath: "C:\\Space\\2026-10-10_0900.md",
        fileName: "2026-10-10_0900.md",
        baseUrl: "",
        source: "- [ ] 给梦境配一段音频\n",
        diskVersion: { size: 10, mtimeMs: 1 },
        writable: true,
      });
    });
    return result;
  }

  it("干净文档：翻转写入源码并立即落盘（时间线随即收到广播）", async () => {
    const { saveMarkdownFile } = installBridge();
    const result = mountWithTaskDoc();

    await act(async () => {
      const changed = await result.current.toggleTaskAtSourceLine(1, 0);
      expect(changed).toBe(true);
    });

    expect(result.current.session?.source).toBe("- [x] 给梦境配一段音频\n");
    expect(saveMarkdownFile).toHaveBeenCalledWith(
      expect.objectContaining({ content: "- [x] 给梦境配一段音频\n" }),
    );
    // 落盘后回到干净
    expect(result.current.isDirty).toBe(false);
  });

  it("已有未保存改动：只改内存并标脏，不抢跑保存", async () => {
    const { saveMarkdownFile } = installBridge();
    const result = mountWithTaskDoc();
    act(() => {
      result.current.updateSource("- [ ] 给梦境配一段音频\n正在写的下一段");
    });

    await act(async () => {
      const changed = await result.current.toggleTaskAtSourceLine(1, 0);
      expect(changed).toBe(true);
    });

    expect(result.current.session?.source).toContain("- [x] ");
    expect(result.current.session?.source).toContain("正在写的下一段");
    expect(saveMarkdownFile).not.toHaveBeenCalled();
    expect(result.current.isDirty).toBe(true);
  });

  it("行号越界或不是任务行：返回 false，内容不动", async () => {
    installBridge();
    const result = mountWithTaskDoc();

    await act(async () => {
      expect(await result.current.toggleTaskAtSourceLine(99, 0)).toBe(false);
      expect(await result.current.toggleTaskAtSourceLine(1, 5)).toBe(false);
    });

    expect(result.current.session?.source).toBe("- [ ] 给梦境配一段音频\n");
    expect(result.current.isDirty).toBe(false);
  });

  it("只读文档（不可写）：不翻转", async () => {
    installBridge();
    const { result } = renderHook(() => useDocumentSession());
    act(() => {
      result.current.openSession({
        chapterId: "ro",
        absolutePath: "C:\\Space\\readonly.md",
        fileName: "readonly.md",
        baseUrl: "",
        source: "- [ ] 只读",
        diskVersion: { size: 10, mtimeMs: 1 },
        writable: false,
      });
    });

    await act(async () => {
      expect(await result.current.toggleTaskAtSourceLine(1, 0)).toBe(false);
    });
    expect(result.current.session?.source).toBe("- [ ] 只读");
  });
});
