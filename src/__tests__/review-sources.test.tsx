import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { DailyReviewPanel } from "../components/DailyReviewPanel";
import { MAX_REVIEW_FOLDERS } from "../hooks/useReviewFolders";
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

/**
 * A batch answer shaped the way the bridge shapes it.
 *
 * One entry per path, each carrying **the path it is about** — that is the real
 * shape, and leaving the paths out is what hid a defect through four releases of
 * these tests: the panel's hook paired results with paths by position, which is only
 * ever right while nothing is dropped.
 */
function batch(entries: Array<[string, string]>) {
  return entries.map(([absolutePath, markdown]) => ({ absolutePath, markdown, baseUrl: "" }));
}

describe("DailyReviewPanel - 卡片来源", () => {
  let readMarkdownBatch: ReturnType<typeof vi.fn>;
  let saveMarkdownFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    readMarkdownBatch = vi.fn().mockResolvedValue([]);
    saveMarkdownFile = vi.fn().mockResolvedValue({ success: true });
    (window as unknown as Record<string, unknown>).knowSpaceDesktop = {
      saveMarkdownFile,
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
    readMarkdownBatch.mockResolvedValue(
      batch([
        ["C:/Vault/c1.md", "知识库问题 :: 知识库答案"],
        ["C:/Vault/c2.md", "这一篇只是普通段落，没有卡片。"],
      ])
    );
    render(<DailyReviewPanel notes={[SPACE_NOTE]} />);

    await act(async () => {
      fireEvent.click(screen.getByText("当前知识库"));
    });

    await waitFor(() => expect(screen.getByText("知识库问题")).toBeDefined());
    // The Space card is out of the queue entirely, not merely deprioritised.
    expect(screen.queryByText("闪念问题")).toBeNull();
  });

  it("切回 Space 时不需要重新读取", async () => {
    readMarkdownBatch.mockResolvedValue(batch([["C:/Vault/c1.md", "知识库问题 :: 知识库答案"]]));
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
    readMarkdownBatch.mockResolvedValue(batch([["C:/Vault/c1.md", "没有卡片的普通段落"]]));
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
    readMarkdownBatch.mockResolvedValue(batch([["C:/Vault/c1.md", "只有一篇 :: 也能复习"]]));
    render(<DailyReviewPanel notes={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByText("当前知识库"));
    });

    await waitFor(() => expect(screen.getByText("只有一篇")).toBeDefined());
    expect(readMarkdownBatch).toHaveBeenCalledWith(["C:/Vault/c1.md"]);
  });

  it("批量结果少了一项时，后面的章节不会张冠李戴", async () => {
    // The bridge drops what it cannot return — a file it could not read, and any
    // chapter that is not Markdown at all (a `.canvas`) — so its answer is not as long
    // as the question. Pairing by position is how the second chapter ends up showing
    // the first one's text, and — because the card's source path is what a rating
    // writes to — how progress is saved into the wrong document.
    readMarkdownBatch.mockResolvedValue(
      batch([["C:/Vault/c2.md", "第二章的问题 :: 第二章的答案"]])
    );
    render(<DailyReviewPanel notes={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByText("当前知识库"));
    });
    await waitFor(() => expect(screen.getByText("第二章的问题")).toBeDefined());

    fireEvent.click(screen.getByText("显示答案"));
    await act(async () => {
      fireEvent.click(screen.getByText("良好"));
    });

    // The card came out of c2, so c2 is the file that gets its progress.
    expect(saveMarkdownFile).toHaveBeenCalledWith(
      expect.objectContaining({ absolutePath: "C:/Vault/c2.md" })
    );
  });
});

/**
 * Which source the panel opens on.
 *
 * Remembering it is the difference between a reader who reviews a folder getting there
 * in one click and getting there in four, every session.
 */
describe("DailyReviewPanel - 记住上次的来源", () => {
  let readMarkdownBatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    readMarkdownBatch = vi.fn().mockResolvedValue([]);
    (window as unknown as Record<string, unknown>).knowSpaceDesktop = {
      saveMarkdownFile: vi.fn().mockResolvedValue({ success: true }),
      readMarkdownBatch,
      pickReviewFolder: vi.fn().mockResolvedValue({ canceled: true }),
      listReviewFolder: vi.fn().mockResolvedValue({ paths: [] }),
    };
    useVaultStore.setState({ ...pristineVault, manifest: VAULT });
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
  });

  it("上次用的是知识库：这次直接打开它，并且已经读好了", async () => {
    readMarkdownBatch.mockResolvedValue(batch([["C:/Vault/c1.md", "上次的卡 :: 答案"]]));
    const first = render(<DailyReviewPanel notes={[SPACE_NOTE]} />);
    await act(async () => {
      fireEvent.click(screen.getByText("当前知识库"));
    });
    await waitFor(() => expect(screen.getByText("上次的卡")).toBeDefined());
    first.unmount();

    render(<DailyReviewPanel notes={[SPACE_NOTE]} />);

    // No click this time, and the documents are read anyway — a remembered source was
    // never clicked, which is why the loading cannot live in the click handlers.
    await waitFor(() => expect(screen.getByText("上次的卡")).toBeDefined());
    expect(screen.queryByText("闪念问题")).toBeNull();
  });

  it("记住的知识库这次没打开：回到 Space，而不是空复习", async () => {
    readMarkdownBatch.mockResolvedValue(batch([["C:/Vault/c1.md", "上次的卡 :: 答案"]]));
    const first = render(<DailyReviewPanel notes={[SPACE_NOTE]} />);
    await act(async () => {
      fireEvent.click(screen.getByText("当前知识库"));
    });
    await waitFor(() => expect(screen.getByText("上次的卡")).toBeDefined());
    first.unmount();

    // No workspace open this time. The remembered source cannot be used, so the panel
    // opens on the one that always exists, with the Space cards in front of the reader.
    useVaultStore.setState({ ...pristineVault, manifest: null });
    render(<DailyReviewPanel notes={[SPACE_NOTE]} />);

    await waitFor(() => expect(screen.getByText("闪念问题")).toBeDefined());
  });

  it("记住的文件夹已经被取消：回到 Space", async () => {
    // Stored as the plain source name — that is what the panel writes.
    localStorage.setItem("knowspace.review-source", "folder");
    render(<DailyReviewPanel notes={[SPACE_NOTE]} />);

    await waitFor(() => expect(screen.getByText("闪念问题")).toBeDefined());
    expect(screen.queryByText("还没有选择文件夹")).toBeNull();
  });
});

/**
 * The fourth source: the document the reader has open.
 *
 * Nothing is fetched for this one — the workspace already holds the text — so what is
 * worth testing is the rule that guards it: a rating writes into the file, there is no
 * autosave, and a save from a buffer loaded before the review would write the progress
 * away. So an unsaved document is turned down rather than warned about.
 */
describe("DailyReviewPanel - 当前文档来源", () => {
  const NOTE = { filePath: "C:/Vault/open.md", content: "眼前的问题 :: 眼前的答案" };

  beforeEach(() => {
    localStorage.clear();
    (window as unknown as Record<string, unknown>).knowSpaceDesktop = {
      saveMarkdownFile: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
    localStorage.clear();
  });

  const documentTab = () =>
    screen.getByRole("button", { name: "当前文档" }) as HTMLButtonElement;

  it("没有打开文档时不可选，并说明原因", () => {
    render(<DailyReviewPanel notes={[]} />);

    expect(documentTab().disabled).toBe(true);
    expect(documentTab().title).toBe("没有打开的文档");
  });

  it("打开且已保存时：只复习这一篇的卡片", async () => {
    render(
      <DailyReviewPanel
        notes={[SPACE_NOTE]}
        currentDocument={{ ...NOTE, dirty: false }}
      />
    );

    await act(async () => {
      fireEvent.click(documentTab());
    });

    expect(screen.getByText("眼前的问题")).toBeDefined();
    // Not the Space note it was given beside it.
    expect(screen.queryByText("闪念问题")).toBeNull();
  });

  it("评分写回这一篇自己的文件", async () => {
    const saveMarkdownFile = vi.fn().mockResolvedValue({ success: true });
    (window as unknown as Record<string, unknown>).knowSpaceDesktop = { saveMarkdownFile };
    render(<DailyReviewPanel notes={[]} currentDocument={{ ...NOTE, dirty: false }} />);

    await act(async () => {
      fireEvent.click(documentTab());
    });
    fireEvent.click(screen.getByText("显示答案"));
    await act(async () => {
      fireEvent.click(screen.getByText("良好"));
    });

    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(1));
    expect(saveMarkdownFile.mock.calls.at(-1)?.[0]).toMatchObject({
      absolutePath: "C:/Vault/open.md",
    });
  });

  it("有未保存改动时不可选，并说清为什么", () => {
    render(<DailyReviewPanel notes={[]} currentDocument={{ ...NOTE, dirty: true }} />);

    expect(documentTab().disabled).toBe(true);
    expect(documentTab().title).toContain("先保存");
  });

  it("选中之后变成未保存：卡片立刻收起，并给出同一句提示", async () => {
    // The case the rule exists for. Reviewing stops the moment the document has
    // unsaved changes, rather than continuing and losing the progress at the next
    // save — which is a thing the reader would only find out afterwards.
    const { rerender } = render(
      <DailyReviewPanel notes={[]} currentDocument={{ ...NOTE, dirty: false }} />
    );
    await act(async () => {
      fireEvent.click(documentTab());
    });
    expect(screen.getByText("眼前的问题")).toBeDefined();

    rerender(<DailyReviewPanel notes={[]} currentDocument={{ ...NOTE, dirty: true }} />);

    expect(screen.queryByText("眼前的问题")).toBeNull();
    expect(screen.getByText("这一篇有未保存的改动，先保存再复习")).toBeDefined();
  });

  it("这一篇没有卡片时，说的是这一篇", async () => {
    render(
      <DailyReviewPanel
        notes={[]}
        currentDocument={{ filePath: "C:/Vault/open.md", content: "只有正文。", dirty: false }}
      />
    );

    await act(async () => {
      fireEvent.click(documentTab());
    });

    expect(screen.getByText("这一篇里还没有闪卡")).toBeDefined();
  });
});

/**
 * The third source: a folder of the reader's own.
 *
 * Not the same act as opening it as the workspace — that replaces the vault, the tabs
 * and the reading session, and someone who wants the cards out of a folder wants none
 * of it — so the folder is asked for, listed and read, and nothing else moves.
 */
describe("DailyReviewPanel - 自定义文件夹来源", () => {
  let readMarkdownBatch: ReturnType<typeof vi.fn>;
  let saveMarkdownFile: ReturnType<typeof vi.fn>;
  let pickReviewFolder: ReturnType<typeof vi.fn>;
  let listReviewFolder: ReturnType<typeof vi.fn>;

  const folderRow = {
    rootPath: "C:/Notes/复习",
    name: "复习",
    paths: ["C:/Notes/复习/a.md"],
  };

  beforeEach(() => {
    localStorage.clear();
    readMarkdownBatch = vi.fn().mockResolvedValue([]);
    saveMarkdownFile = vi.fn().mockResolvedValue({ success: true });
    pickReviewFolder = vi.fn().mockResolvedValue({ canceled: true });
    listReviewFolder = vi.fn().mockResolvedValue({ paths: [] });
    (window as unknown as Record<string, unknown>).knowSpaceDesktop = {
      saveMarkdownFile,
      readMarkdownBatch,
      pickReviewFolder,
      listReviewFolder,
    };
    useVaultStore.setState({ ...pristineVault, manifest: VAULT });
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
    localStorage.clear();
  });

  it("还没选文件夹时先去问一个；取消了就明说，而不是显示空复习", async () => {
    render(<DailyReviewPanel notes={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByText("自定义文件夹"));
    });

    expect(pickReviewFolder).toHaveBeenCalledTimes(1);
    expect(screen.getByText("还没有选择文件夹")).toBeDefined();
  });

  it("选好之后复习这个文件夹里的卡片，并显示它的名字", async () => {
    pickReviewFolder.mockResolvedValue({ canceled: false, ...folderRow });
    readMarkdownBatch.mockResolvedValue(batch([["C:/Notes/复习/a.md", "文件夹里的问题 :: 答案"]]));
    render(<DailyReviewPanel notes={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByText("自定义文件夹"));
    });

    await waitFor(() => expect(screen.getByText("文件夹里的问题")).toBeDefined());
    expect(screen.getByText("复习")).toBeDefined();
    expect(readMarkdownBatch).toHaveBeenCalledWith(["C:/Notes/复习/a.md"]);
  });

  it("记住的文件夹会重新列一遍，新写的卡因此进得来", async () => {
    // The path is remembered rather than the listing: a folder gains files, and a
    // review that cannot see this week's cards would be worse than one that looks.
    localStorage.setItem(
      "knowspace.review-folder",
      JSON.stringify({ ...folderRow, paths: ["C:/Notes/复习/旧.md"] })
    );
    listReviewFolder.mockResolvedValue({ paths: ["C:/Notes/复习/新.md"] });
    readMarkdownBatch.mockResolvedValue(batch([["C:/Notes/复习/新.md", "新写的卡 :: 答案"]]));
    render(<DailyReviewPanel notes={[]} />);

    await waitFor(() => expect(listReviewFolder).toHaveBeenCalledWith("C:/Notes/复习"));

    await act(async () => {
      fireEvent.click(screen.getByText("自定义文件夹"));
    });

    await waitFor(() => expect(screen.getByText("新写的卡")).toBeDefined());
    expect(readMarkdownBatch).toHaveBeenCalledWith(["C:/Notes/复习/新.md"]);
  });

  it("同一文件夹的第二张卡不会把第一张抹掉，而且不为此刻重读整个文件夹", async () => {
    pickReviewFolder.mockResolvedValue({ canceled: false, ...folderRow });
    // Two cards in one file. The second rating has to merge on top of the first, and the
    // panel is what knows what the first one wrote — so it merges on top of that rather
    // than on top of the file as it was when the review opened.
    //
    // This used to be arranged by re-reading the whole folder after every rating, which
    // is the mechanism the old version of this test asserted. That mechanism is gone on
    // purpose: it is also what made a rating cost seconds on a large vault. The outcome
    // is what matters, so the outcome is what is asserted — including that the folder was
    // read once, not once per rating.
    readMarkdownBatch.mockResolvedValue(
      batch([["C:/Notes/复习/a.md", "文件夹里的第一张 :: 答案一\n\n文件夹里的第二张 :: 答案二"]])
    );
    render(<DailyReviewPanel notes={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByText("自定义文件夹"));
    });
    await waitFor(() => expect(screen.getByText("文件夹里的第一张")).toBeDefined());

    fireEvent.click(screen.getByText("显示答案"));
    await act(async () => {
      fireEvent.click(screen.getByText("良好"));
    });
    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText("显示答案"));
    await act(async () => {
      fireEvent.click(screen.getByText("良好"));
    });
    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(2));

    const secondWrite = saveMarkdownFile.mock.calls[1][0].content as string;
    const rows = secondWrite.split("\n").filter((line) => line.startsWith("fsrs-"));
    expect(rows.length).toBe(2);
    expect(readMarkdownBatch).toHaveBeenCalledTimes(1);
  });

  it("重新列一遍失败时，不清空已经记住的文件夹", async () => {
    localStorage.setItem("knowspace.review-folder", JSON.stringify(folderRow));
    // A drive that is not mounted yet, or a permission blip. The listing answers with
    // nothing *and says so* — and "could not be read" must not be shown as "has no
    // cards", which is how a reader concludes their cards are gone.
    listReviewFolder.mockResolvedValue({ paths: [], message: "无法读取这个文件夹。" });
    readMarkdownBatch.mockResolvedValue(batch([["C:/Notes/复习/a.md", "记住的卡 :: 答案"]]));
    render(<DailyReviewPanel notes={[]} />);
    await waitFor(() => expect(listReviewFolder).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByText("自定义文件夹"));
    });

    await waitFor(() => expect(screen.getByText("记住的卡")).toBeDefined());
    expect(readMarkdownBatch).toHaveBeenCalledWith(["C:/Notes/复习/a.md"]);
  });

  it("点「移除」就不再记住它", async () => {
    localStorage.setItem("knowspace.review-folders", JSON.stringify([folderRow]));
    listReviewFolder.mockResolvedValue({ paths: folderRow.paths });
    render(<DailyReviewPanel notes={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByText("自定义文件夹"));
    });
    await waitFor(() => expect(screen.getByText("复习")).toBeDefined());

    fireEvent.click(screen.getByText("移除"));

    expect(localStorage.getItem("knowspace.review-folders")).toBe(JSON.stringify([]));
    expect(screen.getByText("还没有选择文件夹")).toBeDefined();
  });

  it("两个文件夹：两边的卡在同一轮里", async () => {
    // Revision is rarely one subject. A reader with 英语 and 专业课 was re-picking a
    // folder every time they switched; now both are read, and the batch is asked for
    // the union of their files.
    pickReviewFolder
      .mockResolvedValueOnce({ canceled: false, ...folderRow })
      .mockResolvedValueOnce({
        canceled: false,
        rootPath: "C:/Notes/英语",
        name: "英语",
        paths: ["C:/Notes/英语/b.md"],
      });
    readMarkdownBatch.mockResolvedValue(
      batch([
        ["C:/Notes/复习/a.md", "复习里的卡 :: 答案"],
        ["C:/Notes/英语/b.md", "英语里的卡 :: 答案"],
      ])
    );
    render(<DailyReviewPanel notes={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByText("自定义文件夹"));
    });
    await waitFor(() => expect(screen.getByText("复习里的卡")).toBeDefined());
    // The second one is picked from the row that adds another.
    await act(async () => {
      fireEvent.click(screen.getByText("添加文件夹"));
    });

    await waitFor(() => expect(screen.getByText("英语")).toBeDefined());
    expect(readMarkdownBatch).toHaveBeenLastCalledWith([
      "C:/Notes/复习/a.md",
      "C:/Notes/英语/b.md",
    ]);
  });

  it("同一个文件夹加两次：只留一行", async () => {
    pickReviewFolder.mockResolvedValue({ canceled: false, ...folderRow });
    readMarkdownBatch.mockResolvedValue(batch([["C:/Notes/复习/a.md", "卡 :: 答案"]]));
    render(<DailyReviewPanel notes={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByText("自定义文件夹"));
    });
    await waitFor(() => expect(screen.getByText("复习")).toBeDefined());
    await act(async () => {
      fireEvent.click(screen.getByText("添加文件夹"));
    });

    // One row, and the file is read once: adding it again refreshes the listing rather
    // than listing the same folder twice.
    expect(screen.getAllByText("复习")).toHaveLength(1);
    expect(readMarkdownBatch).toHaveBeenLastCalledWith(["C:/Notes/复习/a.md"]);
  });

  it("两个文件夹里有同一个文件时，那个文件只读一次", async () => {
    localStorage.setItem(
      "knowspace.review-folders",
      JSON.stringify([
        folderRow,
        { rootPath: "C:/Notes/复习/子集", name: "子集", paths: ["C:/Notes/复习/a.md"] },
      ])
    );
    listReviewFolder.mockResolvedValue({ paths: ["C:/Notes/复习/a.md"] });
    readMarkdownBatch.mockResolvedValue(batch([["C:/Notes/复习/a.md", "卡 :: 答案"]]));
    render(<DailyReviewPanel notes={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByText("自定义文件夹"));
    });

    // One folder inside another is a normal thing to set up, and the same path read
    // twice would put the same cards in the round twice.
    await waitFor(() => expect(readMarkdownBatch).toHaveBeenCalled());
    expect(readMarkdownBatch.mock.calls.at(-1)?.[0]).toEqual(["C:/Notes/复习/a.md"]);
  });

  it("上限到了就不再接受新的，并说清为什么", async () => {
    const many = Array.from({ length: MAX_REVIEW_FOLDERS }, (_, index) => ({
      rootPath: `C:/Notes/f${index}`,
      name: `f${index}`,
      paths: [`C:/Notes/f${index}/a.md`],
    }));
    localStorage.setItem("knowspace.review-folders", JSON.stringify(many));
    listReviewFolder.mockResolvedValue({ paths: [] });
    render(<DailyReviewPanel notes={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByText("自定义文件夹"));
    });

    const add = await screen.findByText("添加文件夹");
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect((add as HTMLButtonElement).title).toContain("当前知识库");
  });

  it("旧版本记住的那一个文件夹会被带过来", async () => {
    // The single-folder key this replaced. An upgrade renaming a storage key is not a
    // reason for the folder someone chose to disappear.
    localStorage.setItem("knowspace.review-folder", JSON.stringify(folderRow));
    listReviewFolder.mockResolvedValue({ paths: folderRow.paths });
    readMarkdownBatch.mockResolvedValue(batch([["C:/Notes/复习/a.md", "带过来的卡 :: 答案"]]));
    render(<DailyReviewPanel notes={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByText("自定义文件夹"));
    });

    await waitFor(() => expect(screen.getByText("带过来的卡")).toBeDefined());
    expect(screen.getByText("复习")).toBeDefined();
  });
});
