import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SpaceTimelinePanel } from "../components/SpaceTimelinePanel";

/**
 * 时间线里勾选待办之后，磁盘上的闪念文件变了 —— 打开着这篇笔记的
 * 阅览页必须收到通知去重读。这里覆盖发通知的一端：写盘成功后调用
 * onNoteFileChanged(filePath)；失败回滚时不通知（预览保持原样，
 * 因为磁盘没有真的变）。
 */
const note = {
  filePath: "C:\\Users\\u\\Documents\\Space\\2026-09-07_1803.md",
  fileName: "2026-09-07_1803.md",
  dateStr: "2026-09-07",
  timeDisplay: "18:03",
  modifiedTime: 0,
  size: 64,
  content: "记忆清晨的一场梦。\n- [ ] 给梦境配一段音频\n",
  todos: [{ id: "t1", lineIndex: 2, text: "给梦境配一段音频", completed: false }],
  tags: [],
};

function mountPanel(props: {
  onNoteFileChanged?: (filePath: string) => void;
  toggleResult?: { success: boolean; error?: string };
}) {
  const toggleFlashTodo = vi
    .fn()
    .mockResolvedValue(props.toggleResult ?? { success: true, completed: true });
  (window as unknown as { knowSpaceDesktop: unknown }).knowSpaceDesktop = {
    capture: {
      getFlashNotesSummary: vi.fn().mockResolvedValue({
        success: true,
        notes: [note],
        spaceDir: "C:\\Users\\u\\Documents\\Space",
      }),
      onFlashNoteSaved: vi.fn().mockReturnValue(() => {}),
      toggleFlashTodo,
    },
    files: {},
  };
  render(<SpaceTimelinePanel onNoteFileChanged={props.onNoteFileChanged} />);
  return { toggleFlashTodo };
}

describe("SpaceTimelinePanel - 待办勾选后的正文同步", () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { knowSpaceDesktop?: unknown }).knowSpaceDesktop;
  });

  it("勾选待办写盘成功后通知上层刷新已打开的正文", async () => {
    const onNoteFileChanged = vi.fn();
    const { toggleFlashTodo } = mountPanel({ onNoteFileChanged });

    const checkbox = await screen.findByRole("checkbox", { name: /给梦境配一段音频/ });
    fireEvent.click(checkbox);

    await vi.waitFor(() => {
      expect(toggleFlashTodo).toHaveBeenCalledWith({
        filePath: note.filePath,
        lineIndex: 2,
        completed: true,
      });
      expect(onNoteFileChanged).toHaveBeenCalledWith(note.filePath);
    });
  });

  it("写盘失败回滚时不通知（磁盘未变，预览不该被动）", async () => {
    const onNoteFileChanged = vi.fn();
    mountPanel({ onNoteFileChanged, toggleResult: { success: false, error: "写入失败" } });

    const checkbox = await screen.findByRole("checkbox", { name: /给梦境配一段音频/ });
    fireEvent.click(checkbox);

    await vi.waitFor(() => {
      expect(onNoteFileChanged).not.toHaveBeenCalled();
    });
  });

  it("未传 onNoteFileChanged 时勾选照常工作", async () => {
    const { toggleFlashTodo } = mountPanel({});

    const checkbox = await screen.findByRole("checkbox", { name: /给梦境配一段音频/ });
    expect(() => fireEvent.click(checkbox)).not.toThrow();

    await vi.waitFor(() => {
      expect(toggleFlashTodo).toHaveBeenCalled();
    });
  });
});
