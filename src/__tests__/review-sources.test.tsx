import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { DailyReviewPanel } from "../components/DailyReviewPanel";
import { useVaultStore } from "../store/useVaultStore";

/**
 * The review used to read only the Space folder, because that was the only
 * place the desktop bridge could list. These tests cover the second source: the
 * knowledge base the app already has a manifest for.
 */

const VAULT = {
  id: "vault-1",
  title: "测试库",
  rootPath: "C:/Vault",
  chapters: [
    { id: "c1", title: "第一章", src: "c1.md", absolutePath: "C:/Vault/c1.md" },
    { id: "c2", title: "第二章", src: "c2.md", absolutePath: "C:/Vault/c2.md" },
  ],
};

/** A Space note with one inline card, for the default source. */
const SPACE_NOTE = {
  filePath: "C:/Space/2026-09-17_0900.md",
  content: "闪念问题 :: 闪念答案",
};

const pristineVault = useVaultStore.getState();

describe("DailyReviewPanel - 卡片来源", () => {
  let readMarkdownBatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    readMarkdownBatch = vi.fn().mockResolvedValue([]);
    (window as unknown as Record<string, unknown>).knowSpaceDesktop = {
      saveMarkdownFile: vi.fn().mockResolvedValue({ success: true }),
      readMarkdownBatch,
    };
    useVaultStore.setState({ ...pristineVault, manifest: VAULT });
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
    useVaultStore.setState(pristineVault, true);
    vi.restoreAllMocks();
  });

  it("默认复习 Space 里的卡片，且不读取知识库", () => {
    render(<DailyReviewPanel notes={[SPACE_NOTE]} />);

    expect(screen.getByText("闪念问题")).toBeDefined();
    // Reading every chapter is the expensive part, so it must not happen just
    // because the review was opened.
    expect(readMarkdownBatch).not.toHaveBeenCalled();
  });

  it("切换到知识库时才批量读取文档", async () => {
    render(<DailyReviewPanel notes={[SPACE_NOTE]} />);

    await act(async () => {
      fireEvent.click(screen.getByText("当前知识库"));
    });

    expect(readMarkdownBatch).toHaveBeenCalledWith(["C:/Vault/c1.md", "C:/Vault/c2.md"]);
  });

  it("切换后复习的是知识库文档里的卡片", async () => {
    readMarkdownBatch.mockResolvedValue([
      { markdown: "知识库问题 :: 知识库答案" },
      { markdown: "这一篇只是普通段落，没有卡片。" },
    ]);
    render(<DailyReviewPanel notes={[SPACE_NOTE]} />);

    await act(async () => {
      fireEvent.click(screen.getByText("当前知识库"));
    });

    await waitFor(() => expect(screen.getByText("知识库问题")).toBeDefined());
    // The Space card is out of the queue entirely, not merely deprioritised.
    expect(screen.queryByText("闪念问题")).toBeNull();
  });

  it("切回 Space 时不需要重新读取", async () => {
    readMarkdownBatch.mockResolvedValue([{ markdown: "知识库问题 :: 知识库答案" }]);
    render(<DailyReviewPanel notes={[SPACE_NOTE]} />);

    await act(async () => {
      fireEvent.click(screen.getByText("当前知识库"));
    });
    await waitFor(() => expect(screen.getByText("知识库问题")).toBeDefined());

    await act(async () => {
      fireEvent.click(screen.getByText("闪念 Space"));
    });

    expect(screen.getByText("闪念问题")).toBeDefined();
    expect(readMarkdownBatch).toHaveBeenCalledTimes(1);
  });

  it("未打开知识库时该来源不可选", () => {
    useVaultStore.setState({ ...pristineVault, manifest: null });
    render(<DailyReviewPanel notes={[SPACE_NOTE]} />);

    const button = screen.getByText("当前知识库").closest("button") as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    expect(button.title).toContain("尚未打开知识库");
  });

  it("读取失败时说明原因，而不是显示空态", async () => {
    readMarkdownBatch.mockRejectedValue(new Error("磁盘不可读"));
    render(<DailyReviewPanel notes={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByText("当前知识库"));
    });

    await waitFor(() => expect(screen.getByText("读取知识库失败")).toBeDefined());
    expect(screen.getByText("磁盘不可读")).toBeDefined();
  });

  it("知识库里没有卡片时给出针对该来源的引导", async () => {
    readMarkdownBatch.mockResolvedValue([{ markdown: "没有卡片的普通段落" }]);
    render(<DailyReviewPanel notes={[SPACE_NOTE]} />);

    await act(async () => {
      fireEvent.click(screen.getByText("当前知识库"));
    });

    await waitFor(() => expect(screen.getByText("知识库里还没有闪卡")).toBeDefined());
  });

  it("没有绝对路径的章节会被跳过而不是报错", async () => {
    useVaultStore.setState({
      ...pristineVault,
      manifest: {
        ...VAULT,
        chapters: [
          { id: "c1", title: "有路径", src: "c1.md", absolutePath: "C:/Vault/c1.md" },
          { id: "c2", title: "无路径", src: "c2.md" },
        ],
      },
    });
    readMarkdownBatch.mockResolvedValue([{ markdown: "只有一篇 :: 也能复习" }]);
    render(<DailyReviewPanel notes={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByText("当前知识库"));
    });

    await waitFor(() => expect(screen.getByText("只有一篇")).toBeDefined());
    expect(readMarkdownBatch).toHaveBeenCalledWith(["C:/Vault/c1.md"]);
  });
});
