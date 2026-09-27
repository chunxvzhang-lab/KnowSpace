const { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { isValidMarkdownPath, registerPath } = require("./markdown-files.cjs");
const { getAppConfig, getAutoLaunch, saveAppConfig } = require("./shared.cjs");

/**
 * Window and system handlers: new windows, native theme, external links,
 * fullscreen, printing/PDF export, document dirty-state and the before-close
 * handshake, launch-file plumbing and app settings.
 *
 * These sit closest to the lifecycle, so their context carries the most
 * lifecycle-owned state — but only accessors and the stable Maps, never the
 * whole main module.
 *
 * context (from main.cjs): {
 *   createWindow,               (initialFilePath) => Promise<BrowserWindow>
 *   getWindowFromEvent,         (event) => BrowserWindow | null
 *   getMainWindow,              () => BrowserWindow | null
 *   windows,                    Set<BrowserWindow>
 *   getFlashCapsuleWindow,      () => BrowserWindow | null
 *   windowInitialPaths,         Map<id, string> — launch paths per window/webContents
 *   windowInitialData,          Map<id, {filePath, source}> — pre-read launch documents
 *   getLaunchFilePath,          () => string | null
 *   clearLaunchFilePath,        () => void
 *   setDocumentState,           (state) => void — close flow reads it back in main.cjs
 *   getPendingCloseResolvers,   () => Map<requestId, (action) => void>
 *   setAutoLaunch,              (enabled: boolean) => void
 *   updateTrayMenu,             () => void
 *   broadcastSettings,          () => void
 * }
 */

function registerSystemHandlers(context) {
  // Startup handshake: preload invokes this once per window with the bridge's
  // API_VERSION literal (electron/preload.cjs). If it and the app version drift
  // apart — one bumped without the other — every renderer warns at first
  // launch instead of the contract silently desyncing. Returns the real app
  // version so a future renderer-side check can compare without a new channel.
  ipcMain.handle("bookmd:api-version", (_event, reportedVersion) => {
    const appVersion = app.getVersion();
    if (typeof reportedVersion === "string" && reportedVersion !== appVersion) {
      console.warn(
        `[bookmd] desktop bridge API version ${reportedVersion} != app version ${appVersion} — bump electron/preload.cjs API_VERSION together with package.json "version".`,
      );
    }
    return appVersion;
  });

  ipcMain.handle("bookmd:open-in-new-window", async (_event, absolutePath) => {
    if (typeof absolutePath !== "string" || !isValidMarkdownPath(absolutePath)) {
      throw new Error("无效的 Markdown 文件路径。");
    }
    registerPath(absolutePath);
    const newWin = await context.createWindow(absolutePath);
    if (newWin) {
      newWin.focus();
      return true;
    }
    return false;
  });

  ipcMain.on("bookmd:get-sync-launch-data", (event) => {
    const senderWebContentsId = event?.sender?.id;
    const senderWin = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null;
    const winId = senderWin?.id;

    let cachedData = null;
    if (senderWebContentsId && context.windowInitialData.has(senderWebContentsId)) {
      cachedData = context.windowInitialData.get(senderWebContentsId);
    } else if (winId && context.windowInitialData.has(winId)) {
      cachedData = context.windowInitialData.get(winId);
    }

    const launchPath = context.getLaunchFilePath();
    let filePath = null;
    if (senderWebContentsId && context.windowInitialPaths.has(senderWebContentsId)) {
      filePath = context.windowInitialPaths.get(senderWebContentsId);
    } else if (winId && context.windowInitialPaths.has(winId)) {
      filePath = context.windowInitialPaths.get(winId);
    } else if (launchPath) {
      filePath = launchPath;
    }

    event.returnValue = cachedData ? cachedData : filePath ? { filePath, source: null } : null;
  });

  ipcMain.handle("bookmd:get-launch-file-path", async (event) => {
    const senderWebContentsId = event?.sender?.id;
    const senderWin = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null;

    if (senderWebContentsId && context.windowInitialPaths.has(senderWebContentsId)) {
      const filePath = context.windowInitialPaths.get(senderWebContentsId);
      context.windowInitialPaths.delete(senderWebContentsId);
      if (senderWin) context.windowInitialPaths.delete(senderWin.id);
      return filePath;
    }
    if (senderWin && context.windowInitialPaths.has(senderWin.id)) {
      const filePath = context.windowInitialPaths.get(senderWin.id);
      context.windowInitialPaths.delete(senderWin.id);
      return filePath;
    }
    const launchPath = context.getLaunchFilePath();
    if (launchPath) {
      context.clearLaunchFilePath();
      return launchPath;
    }
    return null;
  });

  ipcMain.handle("bookmd:set-native-theme", (_event, theme) => {
    const isDark = theme === "twitter" || theme === "dark";
    const isLight = theme === "light" || theme === "eink";
    nativeTheme.themeSource = isDark ? "dark" : isLight ? "light" : "system";
    for (const win of context.windows) {
      try {
        if (win && !win.isDestroyed()) {
          win.setBackgroundColor(isDark ? "#000000" : theme === "eink" ? "#f4f1ea" : "#f6f7f4");
        }
      } catch {}
    }
    const flashWindow = context.getFlashCapsuleWindow();
    if (flashWindow && !flashWindow.isDestroyed()) {
      try {
        flashWindow.webContents.send("bookmd:theme-updated", theme);
      } catch {}
    }
  });

  ipcMain.handle("bookmd:set-document-state", (_event, state) => {
    if (state && typeof state === "object") {
      context.setDocumentState({
        activePath: state.activePath ?? null,
        isDirty: Boolean(state.isDirty),
      });
    }
  });

  ipcMain.handle("bookmd:resolve-before-close", (_event, { requestId, action }) => {
    const pendingCloseResolvers = context.getPendingCloseResolvers();
    const resolver = pendingCloseResolvers.get(requestId);
    if (resolver) {
      pendingCloseResolvers.delete(requestId);
      resolver(action);
    }
  });

  ipcMain.handle("bookmd:open-external", async (_event, url) => {
    if (
      typeof url === "string" &&
      (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("mailto:"))
    ) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  ipcMain.handle("bookmd:toggle-fullscreen", (event) => {
    const targetWin = context.getWindowFromEvent(event);
    if (!targetWin || targetWin.isDestroyed()) return false;
    const next = !targetWin.isFullScreen();
    targetWin.setFullScreen(next);
    return next;
  });

  ipcMain.handle("bookmd:is-fullscreen", (event) => {
    const targetWin = context.getWindowFromEvent(event);
    if (!targetWin || targetWin.isDestroyed()) return false;
    return targetWin.isFullScreen();
  });

  ipcMain.handle("bookmd:print-to-pdf", async (event, request = {}) => {
    const targetWin = context.getWindowFromEvent(event) || context.getMainWindow();
    if (!targetWin || targetWin.isDestroyed()) {
      return { success: false, message: "未找到活动窗口" };
    }

    const { title = "文档", landscape = false, pageSize = "A4" } = request;
    const cleanTitle = (title || "文档").replace(/[\\/:*?"<>|]/g, "_").trim();
    const defaultPath = path.join(app.getPath("downloads"), `${cleanTitle}.pdf`);

    const saveResult = await dialog.showSaveDialog(targetWin || undefined, {
      title: "导出为高保真专业 PDF",
      defaultPath,
      filters: [
        { name: "PDF 文档 (*.pdf)", extensions: ["pdf"] },
        { name: "所有文件 (*.*)", extensions: ["*"] },
      ],
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { canceled: true };
    }

    let prevBg = "#ffffff";
    try {
      if (
        targetWin &&
        !targetWin.isDestroyed() &&
        typeof targetWin.getBackgroundColor === "function"
      ) {
        prevBg = targetWin.getBackgroundColor();
        targetWin.setBackgroundColor("#ffffff");
      }
    } catch {}

    try {
      const pdfBuffer = await targetWin.webContents.printToPDF({
        printBackground: true,
        pageSize: pageSize || "A4",
        landscape: Boolean(landscape),
        margins: {
          marginType: "none",
        },
        preferCSSPageSize: true,
      });

      await fs.promises.writeFile(saveResult.filePath, pdfBuffer);
      return { success: true, filePath: saveResult.filePath };
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      return { success: false, message: err.message };
    } finally {
      try {
        if (
          targetWin &&
          !targetWin.isDestroyed() &&
          typeof targetWin.setBackgroundColor === "function"
        ) {
          targetWin.setBackgroundColor(prevBg);
        }
      } catch {}
    }
  });

  ipcMain.handle("bookmd:print-document", async (event) => {
    const targetWin = context.getWindowFromEvent(event) || context.getMainWindow();
    if (!targetWin || targetWin.isDestroyed()) {
      return { success: false, message: "未找到活动窗口" };
    }
    try {
      targetWin.webContents.print({ silent: false, printBackground: true });
      return { success: true };
    } catch (err) {
      console.error("Failed to invoke print:", err);
      return { success: false, message: err.message };
    }
  });

  // App Settings (Background Running & Auto-Launch)
  ipcMain.handle("bookmd:get-app-settings", () => {
    const config = getAppConfig();
    return {
      autoLaunch: getAutoLaunch(),
      runInBackground: config.runInBackground !== false,
      flashShortcut: config.flashShortcut || "Alt+Space",
    };
  });

  ipcMain.handle("bookmd:set-app-settings", (_event, settings) => {
    if (!settings || typeof settings !== "object") {
      return { success: false, error: "设置参数无效" };
    }
    if (typeof settings.autoLaunch === "boolean") {
      context.setAutoLaunch(settings.autoLaunch);
    }
    if (typeof settings.runInBackground === "boolean") {
      saveAppConfig({ runInBackground: settings.runInBackground });
    }
    context.updateTrayMenu();
    context.broadcastSettings();
    return {
      success: true,
      settings: {
        autoLaunch: getAutoLaunch(),
        runInBackground: getAppConfig().runInBackground !== false,
        flashShortcut: getAppConfig().flashShortcut || "Alt+Space",
      },
    };
  });
}

module.exports = { registerSystemHandlers };
