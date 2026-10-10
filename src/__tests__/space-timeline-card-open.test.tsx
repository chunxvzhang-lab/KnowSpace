import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SpaceTimelinePanel } from "../components/SpaceTimelinePanel";

/**
 * 双击闪念卡片在阅览页打开详情，而时间线留在原地。
 *
 * 之前打开任何闪念文件都会把侧栏强制切回大纲页，卡片一点，时间线就"消失"
 * 了。链路上真正的保证在 useVaultOpening（见 vault-opening-space-note.test.ts），
 * 这里覆盖的是卡片自己这一端：双击发出请求、按钮上的双击不算数、单击不开。
 */
const note = {
  filePath: "C:\\Users\\u\\Documents\\Space\\2026-09-07_1803.md",
  fileName: "2026-09-07_1803.md",
  dateStr: "2026-09-07",
  timeDisplay: "18:03",
  modifiedTime: 0,
  size: 64,
  content: "记忆清晨的一场梦，醒来就写下来。",
  todos: [],
  tags: ["灵感"],
};

function mountPanel(onOpenNoteInReader?: (filePath: string) => void) {
  (window as unknown as { knowSpaceDesktop: unknown }).knowSpaceDesktop = {
    capture: {
      getFlashNotesSummary: vi.fn().mockResolvedValue({
        success: true,
        notes: [note],
        spaceDir: "C:\\Users\\u\\Documents\\Space",
      }),
      onFlashNoteSaved: vi.fn().mockReturnValue(() => {}),
    },
    // 复盘面板常驻挂载，它的桥在无记忆文件夹时会安静返回；给一个空 files
    // 让 `bridge?.files.listReviewFolder` 可求值即可。
    files: {},
  };
  return render(<SpaceTimelinePanel onOpenNoteInReader={onOpenNoteInReader} />);
}

describe("SpaceTimelinePanel - 双击卡片在阅览页打开", () => {
  afterEach(cleanup);

  it("双击卡片正文，请求在阅览页打开该闪念", async () => {
    const onOpenNoteInReader = vi.fn();
    mountPanel(onOpenNoteInReader);

    fireEvent.doubleClick(await screen.findByText("记忆清晨的一场梦，醒来就写下来。"));

    expect(onOpenNoteInReader).toHaveBeenCalledTimes(1);
    expect(onOpenNoteInReader).toHaveBeenCalledWith(note.filePath);
  });

  it("时间线在双击之后原样留在屏幕上", async () => {
    const onOpenNoteInReader = vi.fn();
    mountPanel(onOpenNoteInReader);

    fireEvent.doubleClick(await screen.findByText("记忆清晨的一场梦，醒来就写下来。"));

    // 面板本身不掌管侧栏，这里钉住的是"双击没有把时间线从 DOM 里拿走"。
    expect(document.querySelector(".space-timeline-container")).not.toBeNull();
    const timelineTab = screen.getByText("时间轴").closest("button");
    expect(timelineTab?.className).toContain("active");
  });

  it("双击落在操作按钮上属于按钮，不打开阅览页", async () => {
    const onOpenNoteInReader = vi.fn();
    mountPanel(onOpenNoteInReader);

    const copyButton = await screen.findByTitle("复制全文");
    fireEvent.doubleClick(copyButton);

    expect(onOpenNoteInReader).not.toHaveBeenCalled();
  });

  it("单击卡片不触发打开，双击语义只留给双击", async () => {
    const onOpenNoteInReader = vi.fn();
    mountPanel(onOpenNoteInReader);

    fireEvent.click(await screen.findByText("记忆清晨的一场梦，醒来就写下来。"));

    expect(onOpenNoteInReader).not.toHaveBeenCalled();
  });

  it("未传 onOpenNoteInReader 时双击安静无事", async () => {
    mountPanel();

    const content = await screen.findByText("记忆清晨的一场梦，醒来就写下来。");
    expect(() => fireEvent.doubleClick(content)).not.toThrow();
  });
});
