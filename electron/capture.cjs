const { app, dialog, globalShortcut, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const {
  getAppConfig,
  saveAppConfig,
  saveFlashShortcut,
  getLastActiveWorkspaceDir,
  getDefaultSpaceDir,
  resolveFlashSpaceDir,
} = require("./shared.cjs");

/**
 * Flash capsule + Space handlers: opening/hiding the capsule, the global
 * shortcut, pinning, the Space directory, the persistent note, capsule size,
 * the Space timeline (notes summary, todos) and pasted-image capture.
 *
 * The capsule window itself is created and managed by main.cjs — these
 * handlers reach it only through context accessors.
 *
 * context (from main.cjs): {
 *   windows,                    Set<BrowserWindow> — broadcast targets
 *   getMainWindow,              () => BrowserWindow | null
 *   getFlashCapsuleWindow,      () => BrowserWindow | null
 *   toggleFlashCapsuleWindow,   () => Promise<void>
 *   getFlashShortcut,           () => string
 *   setFlashShortcut,           (shortcut: string) => void
 *   getFlashPinned,             () => boolean
 *   setFlashPinned,             (pinned: boolean) => void
 *   getNativeDialogOpen,        () => boolean
 *   setNativeDialogOpen,        (open: boolean) => void
 * }
 */

function getMinuteFileTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  const dateStr = `${year}-${month}-${day}`;
  const minuteFileName = `${dateStr}_${hours}${minutes}.md`;
  const timeDisplay = `${hours}:${minutes}:${seconds}`;
  const minuteDisplay = `${hours}:${minutes}`;

  return { dateStr, minuteFileName, timeDisplay, minuteDisplay };
}

// Flash Space Timeline & Inbox Hub cache: re-listed only when the Space
// directory's mtime moves. Every writer below invalidates it explicitly.
let cachedFlashSummary = null;
let lastFlashSummaryMtime = 0;

function invalidateFlashSummaryCache() {
  cachedFlashSummary = null;
  lastFlashSummaryMtime = 0;
}

function registerCaptureHandlers(context) {
  // Flash Capsule IPC handlers
  ipcMain.handle("bookmd:open-flash-capsule", async () => {
    await context.toggleFlashCapsuleWindow();
    return true;
  });

  ipcMain.handle("bookmd:hide-flash-capsule", () => {
    const flashWindow = context.getFlashCapsuleWindow();
    if (flashWindow && !flashWindow.isDestroyed()) {
      flashWindow.hide();
    }
    return true;
  });

  ipcMain.handle("bookmd:get-flash-shortcut", () => {
    return context.getFlashShortcut() || "Alt+Space";
  });

  ipcMain.handle("bookmd:set-flash-shortcut", (_event, newShortcut) => {
    if (!newShortcut || typeof newShortcut !== "string") {
      return { success: false, error: "快捷键格式不能为空" };
    }
    const cleanShortcut = newShortcut.trim();
    const currentShortcut = context.getFlashShortcut();
    try {
      if (currentShortcut) {
        try {
          globalShortcut.unregister(currentShortcut);
        } catch {}
      }
      const registered = globalShortcut.register(cleanShortcut, () => {
        context.toggleFlashCapsuleWindow();
      });
      if (registered) {
        context.setFlashShortcut(cleanShortcut);
        saveFlashShortcut(cleanShortcut);
        for (const w of context.windows) {
          try {
            if (!w.isDestroyed()) {
              w.webContents.send("bookmd:flash-shortcut-updated", cleanShortcut);
            }
          } catch {}
        }
        const flashWindow = context.getFlashCapsuleWindow();
        if (flashWindow && !flashWindow.isDestroyed()) {
          try {
            flashWindow.webContents.send("bookmd:flash-shortcut-updated", cleanShortcut);
          } catch {}
        }
        return { success: true, shortcut: cleanShortcut };
      } else {
        if (currentShortcut) {
          try {
            globalShortcut.register(currentShortcut, () => {
              context.toggleFlashCapsuleWindow();
            });
          } catch {}
        }
        return {
          success: false,
          error: `快捷键 "${cleanShortcut}" 注册失败，可能已被系统或其它软件占用。`,
        };
      }
    } catch (err) {
      if (currentShortcut) {
        try {
          globalShortcut.register(currentShortcut, () => {
            context.toggleFlashCapsuleWindow();
          });
        } catch {}
      }
      return { success: false, error: err.message || "快捷键格式无效" };
    }
  });

  ipcMain.handle("bookmd:get-flash-target-path", () => {
    const { dir: spaceDir, isCustom, defaultDir } = resolveFlashSpaceDir();
    const { minuteFileName, dateStr, minuteDisplay } = getMinuteFileTimestamp();
    const targetFile = path.join(spaceDir, minuteFileName);
    return {
      workspaceDir: getLastActiveWorkspaceDir(),
      spaceDir,
      defaultDir,
      isCustom,
      targetFile,
      minuteFileName,
      relativeDisplay: `Space/${minuteFileName}`,
    };
  });

  ipcMain.handle("bookmd:save-flash-note", async (_event, payload) => {
    if (!payload || typeof payload.content !== "string" || !payload.content.trim()) {
      return { success: false, error: "速记内容不能为空" };
    }
    try {
      const { dir: spaceDir } = resolveFlashSpaceDir();
      const { minuteFileName, dateStr, timeDisplay, minuteDisplay } = getMinuteFileTimestamp();
      const targetFile = path.join(spaceDir, minuteFileName);

      if (!fs.existsSync(spaceDir)) {
        fs.mkdirSync(spaceDir, { recursive: true });
      }

      const isNewFile = !fs.existsSync(targetFile);
      if (isNewFile) {
        const header = `# ⚡ 闪念笔记 (${dateStr} ${minuteDisplay})\n\n> 归档于 Space 知识库 · 记录即时灵感与知识线索\n\n---\n\n`;
        fs.writeFileSync(targetFile, header, "utf8");
      }

      const cleanContent = payload.content.trim();
      const entry = `### 🕒 ${timeDisplay}\n\n${cleanContent}\n\n---\n\n`;
      fs.appendFileSync(targetFile, entry, "utf8");
      invalidateFlashSummaryCache();

      // Broadcast note added to open windows
      for (const w of context.windows) {
        try {
          if (!w.isDestroyed()) {
            w.webContents.send("bookmd:flash-note-saved", {
              filePath: targetFile,
              dateStr,
              fileName: minuteFileName,
            });
          }
        } catch {}
      }

      return {
        success: true,
        filePath: targetFile,
        fileName: minuteFileName,
        dateStr,
        spaceDir,
      };
    } catch (err) {
      console.error("Failed to save flash note:", err);
      return { success: false, error: err.message || "写入文件失败" };
    }
  });

  // Flash Capsule Pin IPC handlers
  ipcMain.handle("bookmd:get-flash-pin", () => {
    return { pinned: Boolean(context.getFlashPinned()) };
  });

  ipcMain.handle("bookmd:set-flash-pin", (_event, pinned) => {
    const nextPinned = Boolean(pinned);
    context.setFlashPinned(nextPinned);
    saveAppConfig({ flashPinned: nextPinned });
    return { success: true, pinned: nextPinned };
  });

  // Flash Space Directory Management IPC handlers
  ipcMain.handle("bookmd:get-flash-space-config", () => {
    const { dir: currentDir, isCustom, defaultDir } = resolveFlashSpaceDir();
    return { currentDir, isCustom, defaultDir };
  });

  ipcMain.handle("bookmd:select-flash-space-dir", async () => {
    context.setNativeDialogOpen(true);
    try {
      const flashWindow = context.getFlashCapsuleWindow();
      const parentWin =
        flashWindow && !flashWindow.isDestroyed() && flashWindow.isVisible()
          ? flashWindow
          : context.getMainWindow();
      const result = await dialog.showOpenDialog(parentWin || undefined, {
        title: "选择闪念 Space 存储目录",
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { canceled: true };
      }
      const selectedDir = result.filePaths[0];
      saveAppConfig({ flashSpaceDir: selectedDir });
      invalidateFlashSummaryCache();
      return { success: true, canceled: false, newDir: selectedDir };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      context.setNativeDialogOpen(false);
    }
  });

  ipcMain.handle("bookmd:reset-flash-space-dir", () => {
    saveAppConfig({ flashSpaceDir: "" });
    invalidateFlashSummaryCache();
    const defaultDir = getDefaultSpaceDir();
    return { success: true, defaultDir };
  });

  // Persistent Note & Prompt Template Module IPC handlers
  ipcMain.handle("bookmd:get-persistent-note", () => {
    return { text: getAppConfig().persistentNote || "" };
  });

  ipcMain.handle("bookmd:save-persistent-note", (_event, text) => {
    const safeText = typeof text === "string" ? text : "";
    saveAppConfig({ persistentNote: safeText });
    return { success: true };
  });

  ipcMain.handle("bookmd:set-flash-size", (_event, payload) => {
    if (!payload || typeof payload !== "object") return { success: false };
    const flashWindow = context.getFlashCapsuleWindow();
    if (flashWindow && !flashWindow.isDestroyed()) {
      const w = Math.max(440, Math.min(1000, Math.round(payload.width)));
      const h = Math.max(260, Math.min(720, Math.round(payload.height)));
      flashWindow.setSize(w, h);
      saveAppConfig({ flashWidth: w, flashHeight: h });
      return { success: true, width: w, height: h };
    }
    return { success: false };
  });

  ipcMain.handle("bookmd:reset-flash-size", () => {
    const w = 600;
    const h = 360;
    const flashWindow = context.getFlashCapsuleWindow();
    if (flashWindow && !flashWindow.isDestroyed()) {
      flashWindow.setSize(w, h);
      saveAppConfig({ flashWidth: w, flashHeight: h });
      return { success: true, width: w, height: h };
    }
    saveAppConfig({ flashWidth: w, flashHeight: h });
    return { success: true, width: w, height: h };
  });

  ipcMain.handle("bookmd:get-flash-notes-summary", async () => {
    try {
      const { dir: spaceDir } = resolveFlashSpaceDir();
      if (!fs.existsSync(spaceDir)) {
        return { success: true, spaceDir, notes: [], totalTodos: 0, completedTodos: 0 };
      }

      let dirMtime = 0;
      try {
        const dirStat = fs.statSync(spaceDir);
        dirMtime = dirStat.mtimeMs;
      } catch {}

      if (
        cachedFlashSummary &&
        lastFlashSummaryMtime === dirMtime &&
        cachedFlashSummary.spaceDir === spaceDir
      ) {
        return cachedFlashSummary;
      }

      const files = await fs.promises.readdir(spaceDir);
      const mdFiles = files.filter((f) => f.endsWith(".md") || f.endsWith(".markdown"));

      const notes = [];
      let totalTodos = 0;
      let completedTodos = 0;

      for (const fileName of mdFiles) {
        try {
          const filePath = path.join(spaceDir, fileName);
          const stats = await fs.promises.stat(filePath);
          const content = await fs.promises.readFile(filePath, "utf8");

          const lines = content.split(/\r?\n/);
          const todos = [];
          const tagsSet = new Set();

          lines.forEach((line, idx) => {
            // Todo regex: - [ ] or - [x]
            const todoMatch = line.match(/^(\s*[-*]\s*\[)([ xX])(\]\s+)(.*)$/);
            if (todoMatch) {
              const isCompleted = todoMatch[2].toLowerCase() === "x";
              todos.push({
                id: `${fileName}:${idx}`,
                lineIndex: idx,
                text: todoMatch[4].trim(),
                completed: isCompleted,
              });
              totalTodos++;
              if (isCompleted) completedTodos++;
            }

            // Tags regex: #tag
            const tagMatches = line.match(/(?:^|\s)#([a-zA-Z0-9_\u4e00-\u9fa5]+)/g);
            if (tagMatches && !line.startsWith("#")) {
              tagMatches.forEach((t) => {
                const clean = t.trim().replace(/^#/, "");
                if (clean) tagsSet.add(clean);
              });
            }
          });

          // Extract date and minute from filename (e.g. 2026-08-28_1433.md)
          let dateStr = "";
          let timeDisplay = "";
          const fnMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})\.md$/);
          if (fnMatch) {
            dateStr = fnMatch[1];
            timeDisplay = `${fnMatch[2]}:${fnMatch[3]}`;
          } else {
            const mDate = new Date(stats.mtime);
            dateStr = mDate.toISOString().slice(0, 10);
            timeDisplay = `${String(mDate.getHours()).padStart(2, "0")}:${String(mDate.getMinutes()).padStart(2, "0")}`;
          }

          notes.push({
            filePath,
            fileName,
            dateStr,
            timeDisplay,
            modifiedTime: stats.mtimeMs,
            size: stats.size,
            content,
            todos,
            tags: Array.from(tagsSet),
          });
        } catch (err) {
          console.warn("Error reading flash note file:", fileName, err);
        }
      }

      // Sort newest first
      notes.sort((a, b) => b.modifiedTime - a.modifiedTime || b.fileName.localeCompare(a.fileName));

      cachedFlashSummary = {
        success: true,
        spaceDir,
        notes,
        totalTodos,
        completedTodos,
      };
      lastFlashSummaryMtime = dirMtime;

      return cachedFlashSummary;
    } catch (err) {
      console.error("Failed to get flash notes summary:", err);
      return { success: false, error: err.message || "读取闪念列表失败", notes: [] };
    }
  });

  ipcMain.handle("bookmd:toggle-flash-todo", async (_event, payload) => {
    if (!payload || typeof payload.filePath !== "string" || typeof payload.lineIndex !== "number") {
      return { success: false, error: "参数无效" };
    }
    try {
      const { filePath, lineIndex, completed } = payload;
      if (!fs.existsSync(filePath)) {
        return { success: false, error: "文件不存在" };
      }

      const raw = fs.readFileSync(filePath, "utf8");
      const lines = raw.split(/\r?\n/);
      if (lineIndex < 0 || lineIndex >= lines.length) {
        return { success: false, error: "行号超出范围" };
      }

      const line = lines[lineIndex];
      const match = line.match(/^(\s*[-*]\s*\[)([ xX])(\]\s+.*)$/);
      if (!match) {
        return { success: false, error: "该行不是有效的待办复选框" };
      }

      const replacementMark = completed ? "x" : " ";
      lines[lineIndex] = `${match[1]}${replacementMark}${match[3]}`;
      fs.writeFileSync(filePath, lines.join("\n"), "utf8");
      invalidateFlashSummaryCache();

      return { success: true, completed };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("bookmd:delete-flash-note", async (_event, payload) => {
    if (!payload || typeof payload.filePath !== "string") {
      return { success: false, error: "参数无效" };
    }
    try {
      const { filePath } = payload;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        invalidateFlashSummaryCache();
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Image Paste & Drop to Assets IPC handler
  ipcMain.handle("bookmd:save-pasted-image", async (_event, payload) => {
    if (!payload || !payload.bufferBase64) {
      return { success: false, error: "缺少图片数据" };
    }
    try {
      const { currentFilePath, bufferBase64, originalName, ext = "png" } = payload;

      // Determine target assets directory
      const workspaceDir = getLastActiveWorkspaceDir();
      let targetDir = "";
      if (
        currentFilePath &&
        typeof currentFilePath === "string" &&
        fs.existsSync(path.dirname(currentFilePath))
      ) {
        targetDir = path.join(path.dirname(currentFilePath), "assets");
      } else if (workspaceDir && fs.existsSync(workspaceDir)) {
        targetDir = path.join(workspaceDir, "assets");
      } else {
        targetDir = path.join(app.getPath("userData"), "assets");
      }

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Format timestamp: YYYYMMDD_HHmmss
      const now = new Date();
      const pad = (n, len = 2) => String(n).padStart(len, "0");
      const timeStamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

      const cleanExt = ext.replace(/^\./, "") || "png";
      const fileName = originalName
        ? `${path.basename(originalName, path.extname(originalName))}_${timeStamp}.${cleanExt}`
        : `image_${timeStamp}.${cleanExt}`;

      const targetPath = path.join(targetDir, fileName);
      const cleanBase64 = bufferBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");

      fs.writeFileSync(targetPath, buffer);

      return {
        success: true,
        fileName,
        relativePath: `assets/${fileName}`,
        absolutePath: targetPath,
      };
    } catch (err) {
      console.error("Failed to save pasted image:", err);
      return { success: false, error: err.message || "写入图片文件失败" };
    }
  });
}

module.exports = { registerCaptureHandlers };
