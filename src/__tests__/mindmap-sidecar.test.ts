import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptySidecar,
  loadSidecar,
  noteFor,
  parseSidecar,
  saveSidecar,
  serializeSidecar,
  setNodeNote,
  sidecarIsEmpty,
  type MindmapSidecar,
} from "../services/mindmapSidecar";

/**
 * The companion file, as the renderer sees it.
 *
 * The file itself — its name, its atomic write — is checked against a real disk
 * in markdown-files.test.ts. What is checked here is everything the renderer
 * decides: what counts as a readable companion, what happens to a file it cannot
 * read, and which of the reader's edits reach the disk at all.
 *
 * Those decisions are the feature. A second file beside a document is a promise
 * that the document cannot be damaged by it, and most of these tests are about
 * keeping that promise: garbage degrades to a plain tree, unknown sections are
 * written back rather than dropped, and merely opening a document writes
 * nothing.
 */

/** The bridge, faked locally so each test can name the exact payloads. */
function installBridge() {
  const api = {
    readMindmapSidecar: vi.fn().mockResolvedValue({ success: true, exists: false }),
    saveMindmapSidecar: vi.fn().mockResolvedValue({ success: true }),
  };
  (window as unknown as Record<string, unknown>).knowSpaceDesktop = api;
  return api;
}

function removeBridge() {
  delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
  delete (window as unknown as Record<string, unknown>).bookMDDesktop;
}

describe("导图伴生文件", () => {
  afterEach(() => {
    removeBridge();
    vi.restoreAllMocks();
  });

  describe("解析：读不懂就退化成纯树", () => {
    it("空文件与纯空白当作没有伴生文件", () => {
      expect(parseSidecar("")).toBeNull();
      expect(parseSidecar("   \n\t ")).toBeNull();
      expect(parseSidecar(null)).toBeNull();
      expect(parseSidecar(undefined)).toBeNull();
    });

    it("坏 JSON 或不是对象都不抛异常，只给 null", () => {
      // A companion is a file a person may well have edited by hand, possibly
      // while the app was open. None of these may reach the reader as a crash.
      expect(parseSidecar('{ "version": 1, "notes": {')).toBeNull();
      expect(parseSidecar("[1, 2, 3]")).toBeNull();
      expect(parseSidecar('"一段字符串"')).toBeNull();
      expect(parseSidecar("null")).toBeNull();
    });

    it("读出备注，并丢掉不是文本或空白的条目", () => {
      const sidecar = parseSidecar(
        JSON.stringify({
          version: 1,
          notes: { "node-a": "第一条备注", "node-b": "   ", "node-c": 42, "node-d": null },
        })
      );

      expect(sidecar?.notes).toEqual({ "node-a": "第一条备注" });
    });

    it("notes 不是对象时只当没有备注，文件本身仍然有效", () => {
      // Half a file is still a file: the sections below are independent, and one
      // bad section must not cost the others.
      const sidecar = parseSidecar(JSON.stringify({ version: 1, notes: "坏了" }));

      expect(sidecar).not.toBeNull();
      expect(sidecar?.notes).toEqual({});
    });

    it("不认识的段落与更高的版本都原样留着", () => {
      // The rule that makes a second file safe across versions: an older build
      // must not destroy what a newer one wrote. It writes back what it read.
      const sidecar = parseSidecar(
        JSON.stringify({ version: 7, icons: { "node-a": "star" }, notes: { "node-a": "备注" } })
      );

      expect(sidecar?.version).toBe(7);
      expect(sidecar?.icons).toEqual({ "node-a": "star" });

      const written = JSON.parse(serializeSidecar(sidecar as MindmapSidecar));
      expect(written.version).toBe(7);
      expect(written.icons).toEqual({ "node-a": "star" });
    });

    it("正文里没有的节点，备注不删", () => {
      // The tree can be shorter than the document for reasons that have nothing
      // to do with the note — a heading mid-edit, another layout. Deleting
      // someone's writing because of what a view happened to show would be
      // unrecoverable, so an orphan note is kept and simply has nowhere to show.
      const sidecar = parseSidecar(JSON.stringify({ notes: { "node-已经不在树里": "别删我" } }));

      expect(sidecar?.notes).toEqual({ "node-已经不在树里": "别删我" });
    });
  });

  describe("序列化：写出来的东西人也要能看", () => {
    it("缩进两格、结尾换行", () => {
      const sidecar: MindmapSidecar = { version: 1, notes: { "node-a": "备注" } };

      expect(serializeSidecar(sidecar)).toBe(
        ['{', '  "version": 1,', '  "notes": {', '    "node-a": "备注"', "  }", "}", ""].join("\n")
      );
    });

    it("没有备注时省掉 notes 段", () => {
      // A file that records nothing should be a small file: `notes: {}` on every
      // document ever opened would make "no notes" look like a decision.
      expect(serializeSidecar(emptySidecar())).toBe('{\n  "version": 1\n}\n');
    });

    it("读进来再写回去，内容一样", () => {
      const original = '{\n  "version": 1,\n  "notes": {\n    "node-a": "备注"\n  }\n}\n';

      expect(serializeSidecar(parseSidecar(original) as MindmapSidecar)).toBe(original);
    });
  });

  describe("改备注", () => {
    it("设值与清空", () => {
      const withNote = setNodeNote(emptySidecar(), "node-a", "写点什么");

      expect(noteFor(withNote, "node-a")).toBe("写点什么");
      // Only whitespace is not a note, however it was typed.
      expect(setNodeNote(withNote, "node-a", "   ").notes).toEqual({});
      expect(setNodeNote(withNote, "node-a", "").notes).toEqual({});
    });

    it("返回新的对象，不动传进来的那个", () => {
      // The view holds the loaded sidecar and the edited one at the same time,
      // to tell "there is something to save" from "this is what is on disk".
      const before = emptySidecar();
      const after = setNodeNote(before, "node-a", "备注");

      expect(before.notes).toEqual({});
      expect(after).not.toBe(before);
      expect(after.notes).not.toBe(before.notes);
    });

    it("空伴生文件的判断", () => {
      expect(sidecarIsEmpty(null)).toBe(true);
      expect(sidecarIsEmpty(emptySidecar())).toBe(true);
      // Anything a newer version wrote counts as content, even unseen, or the
      // next save could look like nothing worth writing.
      expect(sidecarIsEmpty({ version: 7, notes: {}, icons: { a: "star" } })).toBe(false);
      expect(sidecarIsEmpty(setNodeNote(emptySidecar(), "node-a", "备注"))).toBe(false);
    });
  });

  describe("与磁盘之间", () => {
    it("没有桥、没有文档键、没有文件，都是没有伴生文件", async () => {
      removeBridge();
      expect(await loadSidecar("/vault/a.md")).toBeNull();

      const api = installBridge();
      expect(await loadSidecar(null)).toBeNull();
      expect(await loadSidecar(undefined)).toBeNull();
      expect(await loadSidecar("")).toBeNull();
      // Nothing was asked of the disk for a document with no path behind it.
      expect(api.readMindmapSidecar).not.toHaveBeenCalled();

      expect(await loadSidecar("/vault/a.md")).toBeNull();
      expect(api.readMindmapSidecar).toHaveBeenCalledWith({ documentPath: "/vault/a.md" });
    });

    it("读失败、内容坏了、桥抛异常，都只是没有备注", async () => {
      const api = installBridge();

      api.readMindmapSidecar.mockResolvedValueOnce({ success: false, message: "权限不足" });
      expect(await loadSidecar("/vault/a.md")).toBeNull();

      api.readMindmapSidecar.mockResolvedValueOnce({ success: true, exists: true, content: "{ 坏" });
      expect(await loadSidecar("/vault/a.md")).toBeNull();

      api.readMindmapSidecar.mockRejectedValueOnce(new Error("通道断了"));
      expect(await loadSidecar("/vault/a.md")).toBeNull();
    });

    it("读到的备注原样回来", async () => {
      const api = installBridge();
      api.readMindmapSidecar.mockResolvedValueOnce({
        success: true,
        exists: true,
        content: JSON.stringify({ version: 1, notes: { "node-a": "备注" } }),
      });

      const sidecar = await loadSidecar("/vault/a.md");

      expect(noteFor(sidecar, "node-a")).toBe("备注");
    });

    it("保存写的是序列化后的文本，路径是文档路径", async () => {
      const api = installBridge();
      const sidecar = setNodeNote(emptySidecar(), "node-a", "备注");

      expect(await saveSidecar("/vault/a.md", sidecar)).toBe(true);

      expect(api.saveMindmapSidecar).toHaveBeenCalledWith({
        documentPath: "/vault/a.md",
        // The path is the document's; deriving the companion's name from it is
        // the main process's job, so the renderer never names a file itself.
        content: serializeSidecar(sidecar),
      });
    });

    it("没有桥或没有文档键时不写，也不抛", async () => {
      removeBridge();
      expect(await saveSidecar("/vault/a.md", emptySidecar())).toBe(false);

      const api = installBridge();
      expect(await saveSidecar(null, emptySidecar())).toBe(false);
      expect(await saveSidecar(undefined, emptySidecar())).toBe(false);
      expect(api.saveMindmapSidecar).not.toHaveBeenCalled();
    });

    it("写失败只回答 false", async () => {
      const api = installBridge();
      api.saveMindmapSidecar.mockResolvedValueOnce({ success: false, message: "磁盘忙" });

      expect(await saveSidecar("/vault/a.md", emptySidecar())).toBe(false);

      api.saveMindmapSidecar.mockRejectedValueOnce(new Error("通道断了"));
      expect(await saveSidecar("/vault/a.md", emptySidecar())).toBe(false);
    });

    it("只是打开文档，不会写盘", async () => {
      // The rule that keeps the file trustworthy: it says what the reader wrote,
      // so nothing that only reads may write.
      const api = installBridge();
      api.readMindmapSidecar.mockResolvedValueOnce({
        success: true,
        exists: true,
        content: JSON.stringify({ version: 1, notes: { "node-a": "备注" } }),
      });

      await loadSidecar("/vault/a.md");

      expect(api.saveMindmapSidecar).not.toHaveBeenCalled();
    });
  });
});
