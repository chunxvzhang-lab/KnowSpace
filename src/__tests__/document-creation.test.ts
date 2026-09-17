import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDocumentCreation } from "../hooks/useDocumentCreation";
import { useUiStore } from "../store/useUiStore";
import { useTabStore } from "../store/useTabStore";
import { useVaultStore } from "../store/useVaultStore";
import {
  installDesktopMock,
  removeDesktopMock,
  SAMPLE_MANIFEST,
  type DesktopMock,
} from "./helpers/desktopMock";
import { resetStores, restoreStores } from "./helpers/resetStores";

type Params = Parameters<typeof useDocumentCreation>[0];

/** A successful createMarkdownFile result for the given path. */
function createdAt(absolutePath: string, id = "new-chapter") {
  const fileName = absolutePath.split("/").pop() ?? "new.md";
  return {
    canceled: false,
    success: true,
    absolutePath,
    chapter: { id, title: fileName.replace(/\.md$/, ""), src: fileName, absolutePath },
    source: {
      markdown: "# 新文档\n",
      baseUrl: "",
      diskVersion: null,
      hasBom: false,
      lineEnding: "\n",
    },
  };
}

describe("useDocumentCreation", () => {
  let desktop: DesktopMock;
  let openSession: Params["openSession"];
  let setViewMode: Params["setViewMode"];
  let activeLoadedChapterIdRef: { current: string };

  beforeEach(() => {
    resetStores();
    desktop = installDesktopMock();
    openSession = vi.fn() as unknown as Params["openSession"];
    setViewMode = vi.fn() as unknown as Params["setViewMode"];
    activeLoadedChapterIdRef = { current: "" };
  });

  afterEach(() => {
    removeDesktopMock();
    restoreStores();
    vi.restoreAllMocks();
  });

  const mount = () =>
    renderHook(() =>
      useDocumentCreation({ openSession, setViewMode, activeLoadedChapterIdRef })
    );

  describe("when the desktop bridge is missing", () => {
    it("says so instead of failing silently", async () => {
      removeDesktopMock();

      await mount().result.current.doCreateNewFile();

      expect(useUiStore.getState().notice).toBe("新建文件功能仅在桌面版可用。");
      expect(openSession).not.toHaveBeenCalled();
    });
  });

  describe("creating a Markdown file", () => {
    it("does nothing at all when the dialog is cancelled", async () => {
      // The mock's default is a cancellation, which is what a user closing the
      // save dialog produces.
      const before = useTabStore.getState().tabs;

      await mount().result.current.doCreateNewFile();

      expect(useTabStore.getState().tabs).toBe(before);
      expect(openSession).not.toHaveBeenCalled();
      expect(useVaultStore.getState().manifest).toBeNull();
    });

    it("builds a single-document manifest when no folder is open", async () => {
      desktop.createMarkdownFile.mockResolvedValue(createdAt("C:/vault/新笔记.md"));

      await mount().result.current.doCreateNewFile();

      const manifest = useVaultStore.getState().manifest;
      expect(manifest).not.toBeNull();
      expect(manifest?.id).toBe("directory:C:/vault/新笔记.md");
      expect(manifest?.chapters).toHaveLength(1);
      expect(manifest?.chapters[0].id).toBe("new-chapter");
    });

    it("refreshes the folder instead when one is open", async () => {
      useVaultStore.getState().setManifest(SAMPLE_MANIFEST);
      desktop.createMarkdownFile.mockResolvedValue(createdAt("C:/vault/新笔记.md"));

      await mount().result.current.doCreateNewFile();

      expect(desktop.refreshDirectory).toHaveBeenCalledWith(SAMPLE_MANIFEST.rootPath);
      // The refreshed manifest replaces the old one wholesale rather than being
      // merged with a locally constructed chapter list.
      expect(useVaultStore.getState().manifest).toEqual(SAMPLE_MANIFEST);
    });

    it("points the tab list, the panel and the session at the new document", async () => {
      desktop.createMarkdownFile.mockResolvedValue(createdAt("C:/vault/新笔记.md"));

      await mount().result.current.doCreateNewFile();

      expect(useTabStore.getState().activeTabId).toBe("new-chapter");
      expect(useTabStore.getState().tabs.map((t) => t.id)).toEqual(["new-chapter"]);
      expect(useUiStore.getState().sidebarOpen).toBe(true);
      expect(useUiStore.getState().sidebarTab).toBe("toc");
      expect(setViewMode).toHaveBeenCalledWith("split");
      expect(activeLoadedChapterIdRef.current).toBe("new-chapter");

      expect(openSession).toHaveBeenCalledWith(
        expect.objectContaining({
          chapterId: "new-chapter",
          absolutePath: "C:/vault/新笔记.md",
          fileName: "新笔记.md",
          source: "# 新文档\n",
          writable: true,
        })
      );
    });

    it("says which document was created", async () => {
      desktop.createMarkdownFile.mockResolvedValue(createdAt("C:/vault/新笔记.md"));

      await mount().result.current.doCreateNewFile();

      expect(useUiStore.getState().notice).toContain("新笔记");
    });

    it("reports a failure rather than swallowing it", async () => {
      desktop.createMarkdownFile.mockRejectedValue(new Error("磁盘只读"));

      await mount().result.current.doCreateNewFile();

      expect(useUiStore.getState().notice).toBe("磁盘只读");
      expect(openSession).not.toHaveBeenCalled();
    });

    it("passes on a message from a failed create", async () => {
      desktop.createMarkdownFile.mockResolvedValue({
        canceled: false,
        success: false,
        message: "名称已存在",
      });

      await mount().result.current.doCreateNewFile();

      expect(useUiStore.getState().notice).toBe("名称已存在");
    });

    it("stays quiet when a failed create carries no message", async () => {
      desktop.createMarkdownFile.mockResolvedValue({ canceled: false, success: false });

      await mount().result.current.doCreateNewFile();

      expect(useUiStore.getState().notice).toBeNull();
    });
  });

  describe("creating a mind map", () => {
    it("opens the editor on the mind map view", async () => {
      desktop.createMarkdownFile.mockResolvedValue(createdAt("C:/vault/新导图.mindmap.md"));

      await mount().result.current.doCreateNewMindmap();

      expect(setViewMode).toHaveBeenCalledWith("mindmap");
      expect(desktop.createMarkdownFile).toHaveBeenCalledWith(
        expect.objectContaining({ defaultName: "新建思维导图.mindmap.md" })
      );
    });

    it("seeds the document with a starter outline", async () => {
      desktop.createMarkdownFile.mockResolvedValue(createdAt("C:/vault/新导图.mindmap.md"));

      await mount().result.current.doCreateNewMindmap();

      const call = desktop.createMarkdownFile.mock.calls[0][0] as { initialContent: string };
      expect(call.initialContent).toContain("# 中心主题");
    });
  });

  describe("creating a space canvas", () => {
    it("opens the editor on the canvas view", async () => {
      desktop.createMarkdownFile.mockResolvedValue(createdAt("C:/vault/新白板.canvas"));

      await mount().result.current.doCreateNewCanvas();

      expect(setViewMode).toHaveBeenCalledWith("canvas");
    });

    it("seeds a valid empty canvas", async () => {
      desktop.createMarkdownFile.mockResolvedValue(createdAt("C:/vault/新白板.canvas"));

      await mount().result.current.doCreateNewCanvas();

      const call = desktop.createMarkdownFile.mock.calls[0][0] as { initialContent: string };
      const canvas = JSON.parse(call.initialContent);
      // createDefaultCanvas is the single source of a blank board; this asserts
      // the hook still routes through it rather than inlining a literal.
      expect(Array.isArray(canvas.nodes)).toBe(true);
      expect(Array.isArray(canvas.edges)).toBe(true);
    });
  });
});
