const { app, dialog, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  buildDirectoryManifest,
  readMarkdownSource,
  readMarkdownSourcesBatch,
  saveMarkdownFile,
  readMindmapSidecar,
  saveMindmapSidecar,
  readOutlineFile,
  registerPath,
  isValidMarkdownPath,
  setScanOptions,
} = require("./markdown-files.cjs");
const {
  getLastActiveWorkspaceDir,
  setLastActiveWorkspaceDir,
  resolveFlashSpaceDir,
  NEW_FILE_DEFAULTS,
} = require("./shared.cjs");
const { invalidateFlashSummaryCache } = require("./capture.cjs");

/**
 * 正文保存的是 Space 闪念文件时：失效摘要缓存，并广播与"闪念归档"同一个
 * 事件 —— 时间线面板已在订阅 `bookmd:flash-note-saved`，勾选、取消勾选、
 * 编辑、删除行，凡落盘一次就同步一次，两处状态不再分叉。
 *
 * 判定用"落在 Space 目录内"：时间线展示的就是该目录下的所有 .md，比按
 * 文件名形状猜更准（自定义 Space 目录的用户文件名不一定是分钟命名）。
 */
function notifyFlashSpaceFileWritten(context, targetPath) {
  try {
    const { dir: spaceDir } = resolveFlashSpaceDir();
    if (!spaceDir || typeof targetPath !== "string") return;
    const normalizedDir = path.resolve(spaceDir).toLowerCase();
    const normalizedTarget = path.resolve(targetPath).toLowerCase();
    if (!normalizedTarget.startsWith(normalizedDir + path.sep)) return;

    invalidateFlashSummaryCache();
    const fileName = path.basename(targetPath);
    for (const w of context.windows) {
      try {
        if (!w.isDestroyed()) {
          w.webContents.send("bookmd:flash-note-saved", { filePath: targetPath, fileName });
        }
      } catch {}
    }
  } catch {
    // 广播失败不影响保存本身——它只是同步的加速器。
  }
}

/**
 * Directory and Markdown file CRUD handlers: opening/refreshing a vault,
 * reading and writing documents, the mind map sidecar, review-folder listings
 * and outline import. Everything that names a file on disk goes through
 * markdown-files.cjs; this module only registers the channels around it.
 *
 * context (from main.cjs): { getWindowFromEvent }
 */

function registerFilesHandlers(context) {
  /**
   * Applies the reader's directory-scan preferences.
   *
   * A setting rather than a per-call argument: a directory is listed from eleven
   * places, and a preference threaded through all of them would be forgotten on
   * one of them eventually — showing up as "my hidden files came back", but only
   * on whichever path was missed. Kept in shared.cjs beside `lastActiveWorkspaceDir`,
   * which is state for the same reason.
   *
   * The renderer pushes this on startup and on every change. A renderer that never
   * pushes gets the default (hidden files stay hidden), which is what the app did
   * before the preference existed.
   */
  ipcMain.handle("bookmd:set-scan-options", (_event, options) => {
    setScanOptions(options);
    return { ok: true };
  });

  ipcMain.handle("bookmd:open-directory", async (event) => {
    const targetWin = context.getWindowFromEvent(event);
    const result = await dialog.showOpenDialog(targetWin || undefined, {
      title: "选择 Markdown 文件目录",
      properties: ["openDirectory"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const rootPath = result.filePaths[0];
    setLastActiveWorkspaceDir(rootPath);
    const manifest = await buildDirectoryManifest(rootPath);
    return {
      canceled: false,
      directory: manifest,
    };
  });

  ipcMain.handle("bookmd:refresh-directory", async (_event, rootPath) => {
    if (typeof rootPath !== "string" || !rootPath) {
      throw new Error("无效的目录路径。");
    }
    setLastActiveWorkspaceDir(rootPath);
    return await buildDirectoryManifest(rootPath);
  });

  /**
   * A folder to revise from, chosen without opening it as the workspace.
   *
   * Opening a folder is a different act with different consequences — it replaces the
   * vault, the tabs and the reading session — and a reader who wants the cards out of
   * some folder wants none of that. So this lists the folder and hands back its
   * Markdown files, and nothing else moves: `lastActiveWorkspaceDir` in particular is
   * left alone, because revising from a folder is not working in it.
   */
  ipcMain.handle("bookmd:pick-review-folder", async (event) => {
    const targetWin = context.getWindowFromEvent(event);
    const result = await dialog.showOpenDialog(targetWin || undefined, {
      title: "选择复习卡片所在的文件夹",
      properties: ["openDirectory"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const rootPath = result.filePaths[0];
    try {
      const manifest = await buildDirectoryManifest(rootPath);
      return {
        canceled: false,
        rootPath,
        name: path.basename(rootPath),
        paths: manifest.chapters.map((chapter) => chapter.absolutePath).filter(Boolean),
        ...(manifest.scanTruncated ? { scanTruncated: manifest.scanTruncated } : {}),
        ...(manifest.scanUnreadable ? { scanUnreadable: manifest.scanUnreadable } : {}),
      };
    } catch (err) {
      return {
        canceled: false,
        rootPath,
        name: path.basename(rootPath),
        paths: [],
        message: err?.message || "无法读取这个文件夹。",
      };
    }
  });

  /**
   * The Markdown files in a folder the reader chose earlier.
   *
   * A remembered choice is stored as a path rather than as a list, and this is how it is
   * looked at again — so cards written since the folder was chosen are in tonight's
   * review. Listed without side effects, for the same reason the picker has none.
   */
  ipcMain.handle("bookmd:list-review-folder", async (_event, rootPath) => {
    if (typeof rootPath !== "string" || !rootPath) return { paths: [] };

    try {
      const manifest = await buildDirectoryManifest(rootPath);
      return {
        paths: manifest.chapters.map((chapter) => chapter.absolutePath).filter(Boolean),
        // Passed through so the folder row can say a listing is partial rather
        // than showing a short count as if it were the folder's real size.
        ...(manifest.scanTruncated ? { scanTruncated: manifest.scanTruncated } : {}),
        ...(manifest.scanUnreadable ? { scanUnreadable: manifest.scanUnreadable } : {}),
      };
    } catch (err) {
      return { paths: [], message: err?.message || "无法读取这个文件夹。" };
    }
  });

  ipcMain.handle("bookmd:read-markdown-file", async (_event, absolutePath) => {
    return await readMarkdownSource(absolutePath);
  });

  ipcMain.handle("bookmd:read-markdown-batch", async (_event, paths) => {
    return await readMarkdownSourcesBatch(paths);
  });

  // The mind map's companion file. The renderer sends a document path it already
  // has open and the main process derives the companion's path from it, so neither
  // handler can be asked to touch a file of the renderer's choosing.
  ipcMain.handle("bookmd:read-mindmap-sidecar", async (_event, params) => {
    return await readMindmapSidecar(params?.documentPath);
  });

  ipcMain.handle("bookmd:save-mindmap-sidecar", async (_event, params) => {
    return await saveMindmapSidecar({
      documentPath: params?.documentPath,
      content: params?.content,
    });
  });

  ipcMain.handle("bookmd:get-directory-for-file", async (_event, absolutePath) => {
    if (typeof absolutePath !== "string" || !isValidMarkdownPath(absolutePath)) {
      throw new Error("只能读取 Markdown 文件。");
    }
    const rootPath = path.dirname(path.resolve(absolutePath));
    let isSpaceDir = false;
    try {
      const spaceDirInfo = resolveFlashSpaceDir();
      if (
        path.resolve(rootPath).toLowerCase() === path.resolve(spaceDirInfo.dir).toLowerCase() ||
        path.basename(rootPath).toLowerCase() === "space"
      ) {
        isSpaceDir = true;
      }
    } catch {}

    if (!isSpaceDir) {
      setLastActiveWorkspaceDir(rootPath);
    }
    const directory = await buildDirectoryManifest(rootPath);

    const activeChapter = directory.chapters.find(
      (c) => path.resolve(c.absolutePath) === path.resolve(absolutePath),
    );

    return {
      directory,
      activeChapterId: activeChapter ? activeChapter.id : null,
    };
  });

  ipcMain.handle("bookmd:save-markdown-file", async (_event, request) => {
    if (!request || typeof request.absolutePath !== "string") {
      return { success: false, errorCode: "INVALID_PATH", message: "无效的文件路径。" };
    }
    const result = await saveMarkdownFile({
      absolutePath: request.absolutePath,
      content: request.content,
      expectedVersion: request.expectedVersion,
      force: Boolean(request.force),
      hasBom: request.hasBom,
      lineEnding: request.lineEnding,
    });
    if (result.success) {
      notifyFlashSpaceFileWritten(context, request.absolutePath);
    }
    return result;
  });

  // An outline file to import, written by another app — XMind, FreeMind or OPML.
  //
  // The path comes from a native dialog rather than from the renderer, which is why
  // this is allowed to read a file that is not one of this app's documents: the
  // reader picked it, in a dialog this process drew, and the answer is a one-off
  // string rather than a path the renderer may write back to.
  //
  // All the formats are offered in one entry because which one a file is, is decided
  // by what is inside it — a ZIP, or a root element — and never by its extension.
  ipcMain.handle("bookmd:pick-outline-file", async (event) => {
    const targetWin = context.getWindowFromEvent(event);
    const result = await dialog.showOpenDialog(targetWin || undefined, {
      title: "导入大纲（XMind / FreeMind / OPML）",
      filters: [
        { name: "大纲文件", extensions: ["xmind", "mm", "opml", "xml"] },
        { name: "所有文件", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const read = await readOutlineFile(result.filePaths[0]);
    return read.success ? { ...read, canceled: false } : read;
  });

  ipcMain.handle("bookmd:create-markdown-file", async (event, options = {}) => {
    let defaultDir = options.rootPath || app.getPath("documents");
    let defaultName = options.defaultName || "未命名.md";
    const defaultPath = path.join(defaultDir, defaultName);
    const targetWin = context.getWindowFromEvent(event);

    const isCanvas = defaultName.endsWith(".canvas");
    const isMindmap = defaultName.endsWith(".mindmap");
    const defaultTitle = isCanvas ? "新建空间白板文件" : "新建 Markdown 文件";
    const filters = isCanvas
      ? [
          { name: "JSON Canvas", extensions: ["canvas"] },
          { name: "所有文件", extensions: ["*"] },
        ]
      : [
          { name: "Markdown / Canvas", extensions: ["md", "markdown", "canvas"] },
          { name: "所有文件", extensions: ["*"] },
        ];

    const result = await dialog.showSaveDialog(targetWin || undefined, {
      title: defaultTitle,
      defaultPath,
      filters,
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    const targetPath = result.filePath;
    const saveRes = await saveMarkdownFile({
      absolutePath: targetPath,
      content:
        options.initialContent ??
        (isCanvas
          ? NEW_FILE_DEFAULTS.canvas
          : isMindmap
            ? NEW_FILE_DEFAULTS.mindmap
            : NEW_FILE_DEFAULTS.document),
      force: true,
    });

    if (!saveRes.success) {
      return {
        canceled: false,
        success: false,
        message: saveRes.message,
        errorCode: saveRes.errorCode,
      };
    }

    registerPath(targetPath);
    const source = await readMarkdownSource(targetPath);
    return {
      canceled: false,
      success: true,
      absolutePath: targetPath,
      source,
      chapter: {
        id: `chapter:path:${encodeURIComponent(path.basename(targetPath).toLowerCase())}`,
        title: path.basename(targetPath).replace(/\.(md|markdown|canvas)$/i, ""),
        src: path.basename(targetPath),
        absolutePath: targetPath,
        baseUrl: pathToFileURL(path.dirname(targetPath) + path.sep).toString(),
      },
    };
  });

  ipcMain.handle("bookmd:rename-markdown-file", async (event, params = {}) => {
    const { oldPath, newTitle } = params;
    if (!oldPath || !newTitle) {
      return { success: false, error: "缺少原路径或新文件名" };
    }

    try {
      const ext = path.extname(oldPath).toLowerCase() || ".md";
      const cleanTitle = newTitle.trim().replace(/\.(md|markdown|canvas)$/i, "");
      if (!cleanTitle) {
        return { success: false, error: "新文件名不能为空" };
      }
      const dir = path.dirname(oldPath);
      const newFileName = `${cleanTitle}${ext}`;
      const newPath = path.join(dir, newFileName);

      if (newPath.toLowerCase() !== oldPath.toLowerCase()) {
        try {
          await fs.promises.access(newPath);
          return { success: false, error: `同名文件「${newFileName}」已存在` };
        } catch {
          // Safe to rename
        }
      }

      await fs.promises.rename(oldPath, newPath);
      registerPath(newPath);

      return {
        success: true,
        newPath,
        newTitle: cleanTitle,
        fileName: newFileName,
      };
    } catch (err) {
      console.error("Failed to rename markdown file:", err);
      return { success: false, error: err.message || "重命名文件失败" };
    }
  });

  ipcMain.handle("bookmd:save-markdown-file-as", async (event, request = {}) => {
    const defaultPath = request.currentPath || path.join(app.getPath("documents"), "未命名.md");
    const targetWin = context.getWindowFromEvent(event);

    const result = await dialog.showSaveDialog(targetWin || undefined, {
      title: "另存为 Markdown 文件",
      defaultPath,
      filters: [
        { name: "Markdown", extensions: ["md", "markdown"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    const targetPath = result.filePath;
    const saveRes = await saveMarkdownFile({
      absolutePath: targetPath,
      content: request.content ?? "",
      force: true,
    });

    if (!saveRes.success) {
      return {
        canceled: false,
        success: false,
        message: saveRes.message,
        errorCode: saveRes.errorCode,
      };
    }

    registerPath(targetPath);
    notifyFlashSpaceFileWritten(context, targetPath);
    const source = await readMarkdownSource(targetPath);
    return {
      canceled: false,
      success: true,
      absolutePath: targetPath,
      baseUrl: pathToFileURL(path.dirname(targetPath) + path.sep).toString(),
      diskVersion: source.diskVersion,
      cacheKey: source.cacheKey,
    };
  });
}

module.exports = { registerFilesHandlers };
