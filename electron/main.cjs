const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  nativeTheme,
  globalShortcut,
  screen,
  nativeImage,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath } = require("node:url");
const { readMarkdownSource, registerPath, isValidMarkdownPath } = require("./markdown-files.cjs");
const { getAppConfig, saveAppConfig, getAutoLaunch } = require("./shared.cjs");
const { registerFilesHandlers } = require("./files.cjs");
const { registerCaptureHandlers } = require("./capture.cjs");
const { registerHistoryHandlers } = require("./history.cjs");
const { registerMediaHandlers } = require("./media.cjs");
const { registerSystemHandlers } = require("./system.cjs");
const { registerShellNewHandlers } = require("./shell-new.cjs");

// Hardware acceleration and performance optimization switches
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("high-dpi-support", "1");
app.commandLine.appendSwitch("enable-smooth-scrolling");
// Limit V8 heap growth to prevent memory hoarding, keeping memory lean
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=512");

const devServerUrl = process.env.BOOKMD_DEV_SERVER_URL;
const isLaunchHidden = process.argv.includes("--hidden");

const windows = new Set();
let mainWindow = null;
let launchFilePath = findMarkdownPathFromArgs(process.argv);
let isAppQuitting = false;
const pendingCloseResolvers = new Map();
let closeRequestId = 0;
let documentState = {
  activePath: null,
  isDirty: false,
};

let flashCapsuleWindow = null;
let flashCapsuleLoadingPromise = null;
let tray = null;
let isFlashCapsulePinned = false;
// 「常驻模板」页处于前台时，失焦同样不隐藏：切到该页就是要把窗口留在
// 眼前对照着写，点一下别处就消失会把常驻两个字变成摆设。它是页签状态
// 而不是窗口设置，所以不落盘、不显示在图钉上，窗口关闭即复位。
let isFlashPersistentTabActive = false;
let isNativeDialogOpen = false;

isFlashCapsulePinned = Boolean(getAppConfig().flashPinned);

function getSavedFlashShortcut() {
  return getAppConfig().flashShortcut;
}

let currentFlashShortcut = getSavedFlashShortcut();

function setAutoLaunch(enabled) {
  saveAppConfig({ autoLaunch: enabled });
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
      path: process.execPath,
      args: ["--hidden"],
    });
  } catch (e) {
    console.warn("Failed to set login item settings via Electron:", e);
  }
  updateTrayMenu();
}

function broadcastSettings() {
  const settings = {
    autoLaunch: getAutoLaunch(),
    runInBackground: getAppConfig().runInBackground !== false,
    flashShortcut: getAppConfig().flashShortcut || "Alt+Space",
  };
  for (const w of windows) {
    try {
      if (!w.isDestroyed()) {
        w.webContents.send("bookmd:app-settings-updated", settings);
      }
    } catch {}
  }
  if (flashCapsuleWindow && !flashCapsuleWindow.isDestroyed()) {
    try {
      flashCapsuleWindow.webContents.send("bookmd:app-settings-updated", settings);
    } catch {}
  }
}

let hasNotifiedTray = false;
function notifyTrayMinimized() {
  if (!tray) return;
  if (!hasNotifiedTray) {
    hasNotifiedTray = true;
    try {
      tray.displayBalloon?.({
        iconType: "info",
        title: "KnowSpace 已最小化到托盘",
        content: "应用在后台保持运行，双击托盘图标或使用快捷键可随时唤起。",
      });
    } catch {}
  }
}

function getTrayIcon() {
  const candidates = [
    path.join(__dirname, "icon.ico"),
    path.join(__dirname, "icon.png"),
    path.join(__dirname, "..", "build", "icon.ico"),
    path.join(__dirname, "..", "build", "icon.png"),
    path.join(__dirname, "..", "icon.png"),
    path.join(process.resourcesPath, "build", "icon.ico"),
    path.join(process.resourcesPath, "icon.png"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) {
          return process.platform === "win32" && p.endsWith(".ico")
            ? img
            : img.resize({ width: 16, height: 16 });
        }
      } catch {
        return p;
      }
      return p;
    }
  }
  return undefined;
}

function createTray() {
  if (tray) return;
  const icon = getTrayIcon();
  if (!icon) {
    console.error("[Tray] No valid tray icon found among candidates.");
    return;
  }

  try {
    tray = new Tray(icon);
    tray.setToolTip("KnowSpace · 个人知识工作台");
    updateTrayMenu();

    tray.on("click", () => {
      showMainWindow();
    });

    tray.on("double-click", () => {
      showMainWindow();
    });
    console.log("[Tray] System tray initialized successfully.");
  } catch (err) {
    console.error("[Tray] Failed to create tray:", err);
  }
}

function updateTrayMenu() {
  if (!tray) return;
  const config = getAppConfig();
  const shortcut = config.flashShortcut || "Alt+Space";
  const autoLaunch = getAutoLaunch();
  const runInBackground = config.runInBackground !== false;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `⚡ 呼出闪念胶囊 (${shortcut})`,
      click: () => toggleFlashCapsuleWindow(),
    },
    {
      label: "📖 打开 KnowSpace 工作台",
      click: () => showMainWindow(),
    },
    { type: "separator" },
    {
      label: "开机自启动 (后台静默启动)",
      type: "checkbox",
      checked: autoLaunch,
      click: (item) => {
        setAutoLaunch(item.checked);
        broadcastSettings();
      },
    },
    {
      label: "关闭主窗口时保持后台运行",
      type: "checkbox",
      checked: runInBackground,
      click: (item) => {
        saveAppConfig({ runInBackground: item.checked });
        broadcastSettings();
      },
    },
    { type: "separator" },
    {
      label: "❌ 彻底退出 KnowSpace",
      click: () => {
        isAppQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
}

async function createFlashCapsuleWindow() {
  const config = getAppConfig();
  const initialWidth = config.flashWidth || 600;
  const initialHeight = config.flashHeight || 360;

  const win = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth: 440,
    minHeight: 260,
    maxWidth: 1000,
    maxHeight: 720,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    maximizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on("closed", () => {
    if (flashCapsuleWindow === win) {
      flashCapsuleWindow = null;
    }
    // 页签状态随窗口走：窗口重建后回到「闪念速记」页，复位防止
    // 一个已不存在的页面继续压住失焦隐藏。
    isFlashPersistentTabActive = false;
  });

  win.on("resize", () => {
    try {
      if (!win.isDestroyed() && !win.isMaximized()) {
        const [w, h] = win.getSize();
        if (w >= 440 && w <= 1000 && h >= 260 && h <= 720) {
          saveAppConfig({ flashWidth: w, flashHeight: h });
        }
      }
    } catch {}
  });

  win.on("blur", () => {
    try {
      if (
        !win.isDestroyed() &&
        win.isVisible() &&
        !isFlashCapsulePinned &&
        !isFlashPersistentTabActive &&
        !isNativeDialogOpen
      ) {
        win.hide();
      }
    } catch {}
  });

  const query = { mode: "flash" };
  if (!app.isPackaged && devServerUrl) {
    await win.loadURL(`${devServerUrl}?mode=flash`);
  } else {
    await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { query });
  }

  return win;
}

async function ensureFlashCapsuleWindow() {
  if (flashCapsuleWindow && !flashCapsuleWindow.isDestroyed()) {
    return flashCapsuleWindow;
  }
  if (flashCapsuleLoadingPromise) {
    return flashCapsuleLoadingPromise;
  }
  flashCapsuleLoadingPromise = (async () => {
    try {
      const win = await createFlashCapsuleWindow();
      flashCapsuleWindow = win;
      return win;
    } catch (err) {
      console.error("Failed to create/pre-warm flash capsule window:", err);
      flashCapsuleWindow = null;
      throw err;
    } finally {
      flashCapsuleLoadingPromise = null;
    }
  })();
  return flashCapsuleLoadingPromise;
}

async function toggleFlashCapsuleWindow() {
  try {
    const win = await ensureFlashCapsuleWindow();
    if (!win || win.isDestroyed()) return;

    if (win.isVisible()) {
      win.hide();
    } else {
      const config = getAppConfig();
      const cursorPoint = screen.getCursorScreenPoint();
      const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
      const bounds = currentDisplay.workArea;
      const winWidth = config.flashWidth || 600;
      const winHeight = config.flashHeight || 360;
      const x = Math.round(bounds.x + (bounds.width - winWidth) / 2);
      const y = Math.round(bounds.y + (bounds.height - winHeight) / 3);
      win.setBounds({ x, y, width: winWidth, height: winHeight });
      win.show();
      win.focus();
      win.webContents.send("bookmd:flash-focus");
    }
  } catch (err) {
    console.error("Error toggling flash capsule:", err);
  }
}

function initFlashCapsule() {
  const shortcut = currentFlashShortcut || "Alt+Space";
  try {
    const success = globalShortcut.register(shortcut, () => {
      toggleFlashCapsuleWindow();
    });
    if (!success && shortcut !== "Ctrl+Shift+Space") {
      console.warn(`Shortcut ${shortcut} registration failed, trying fallback Ctrl+Shift+Space...`);
      const fallbackSuccess = globalShortcut.register("Ctrl+Shift+Space", () => {
        toggleFlashCapsuleWindow();
      });
      if (fallbackSuccess) {
        currentFlashShortcut = "Ctrl+Shift+Space";
      }
    }
  } catch (e) {
    console.warn("Global shortcut register error:", e);
  }

  // Pre-warm the flash capsule window silently in the background after main window initialization
  // This eliminates the 1-2s first-time lag when invoking the capsule after software restart
  setTimeout(() => {
    ensureFlashCapsuleWindow().catch((err) => {
      console.warn("Flash capsule background pre-warm failed:", err);
    });
  }, 800);
}

function getActiveWindow() {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  for (const win of windows) {
    if (!win.isDestroyed()) return win;
  }
  return null;
}

function buildApplicationMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    {
      label: "文件",
      submenu: [
        {
          label: "新建",
          accelerator: "Ctrl+N",
          click: () => sendMenuCommand("new-file"),
        },
        {
          label: "打开文件...",
          accelerator: "Ctrl+O",
          click: async () => {
            const activeWin = getActiveWindow();
            const result = await dialog.showOpenDialog(activeWin || undefined, {
              title: "打开 Markdown 文件",
              filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
              properties: ["openFile"],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              sendOpenFilePath(result.filePaths[0]);
            }
          },
        },
        {
          label: "打开目录...",
          accelerator: "Ctrl+Shift+O",
          click: () => sendMenuCommand("open-directory"),
        },
        { type: "separator" },
        {
          label: "保存",
          accelerator: "Ctrl+S",
          click: () => sendMenuCommand("save"),
        },
        {
          label: "另存为...",
          accelerator: "Ctrl+Shift+S",
          click: () => sendMenuCommand("save-as"),
        },
        { type: "separator" },
        {
          label: "退出",
          accelerator: isMac ? "Cmd+Q" : "Ctrl+Q",
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { label: "撤销", role: "undo" },
        { label: "重做", role: "redo" },
        { type: "separator" },
        { label: "剪切", role: "cut" },
        { label: "复制", role: "copy" },
        { label: "粘贴", role: "paste" },
        { label: "全选", role: "selectAll" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { label: "重新加载", role: "reload" },
        { label: "强制重新加载", role: "forceReload" },
        { label: "开发者工具", role: "toggleDevTools" },
        { type: "separator" },
        { label: "重置缩放", role: "resetZoom" },
        { label: "放大", role: "zoomIn" },
        { label: "缩小", role: "zoomOut" },
        { type: "separator" },
        { label: "切换全屏", role: "togglefullscreen" },
      ],
    },
    {
      label: "窗口",
      submenu: [
        { label: "最小化", role: "minimize" },
        { label: "关闭窗口", role: "close" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function sendMenuCommand(command) {
  const win = getActiveWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send("bookmd:menu-command", command);
}

const windowInitialPaths = new Map();
const windowInitialData = new Map();

function getWindowFromEvent(event) {
  if (event?.sender) {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) return win;
    } catch {}
  }
  return getActiveWindow();
}

async function createWindow(initialFilePath = null) {
  const iconIco = path.join(__dirname, "icon.ico");
  const iconPng = path.join(__dirname, "icon.png");
  const windowIcon =
    process.platform === "win32" && fs.existsSync(iconIco)
      ? iconIco
      : fs.existsSync(iconPng)
        ? iconPng
        : undefined;

  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 360,
    minHeight: 240,
    show: false,
    title: "KnowSpace",
    icon: windowIcon,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#000000" : "#f6f7f4",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });

  const winId = win.id;
  let webContentsId = null;
  try {
    webContentsId = win.webContents?.id ?? null;
  } catch {}

  windows.add(win);
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = win;
  }

  if (initialFilePath) {
    registerPath(initialFilePath);
    windowInitialPaths.set(winId, initialFilePath);
    if (webContentsId !== null) {
      windowInitialPaths.set(webContentsId, initialFilePath);
    }
    // Asynchronously pre-read Markdown source for instantaneous render on launch
    readMarkdownSource(initialFilePath)
      .then((source) => {
        windowInitialData.set(winId, { filePath: initialFilePath, source });
        if (webContentsId !== null) {
          windowInitialData.set(webContentsId, { filePath: initialFilePath, source });
        }
      })
      .catch(() => {});
  }

  win.once("ready-to-show", () => {
    try {
      if (!isLaunchHidden && !win.isDestroyed() && !win.isVisible()) {
        win.show();
        win.focus();
      }
    } catch {}
  });

  const showFallbackTimer = setTimeout(() => {
    try {
      if (!isLaunchHidden && !win.isDestroyed() && !win.isVisible()) {
        win.show();
        win.focus();
      }
    } catch {}
  }, 600);

  win.on("close", (event) => {
    if (isAppQuitting) return;

    const config = getAppConfig();
    const runInBackground = config.runInBackground !== false;

    if (runInBackground && win === mainWindow && windows.size <= 1) {
      if (documentState.isDirty) {
        event.preventDefault();
        closeRequestId += 1;
        const reqId = closeRequestId;

        try {
          if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send("bookmd:before-close", { requestId: reqId });
          }
        } catch {}

        const timer = setTimeout(() => {
          pendingCloseResolvers.delete(reqId);
        }, 10000);

        pendingCloseResolvers.set(reqId, (result) => {
          clearTimeout(timer);
          if (result === "proceed") {
            win.hide();
            notifyTrayMinimized();
          }
        });
      } else {
        event.preventDefault();
        win.hide();
        notifyTrayMinimized();
      }
      return;
    }

    if (documentState.isDirty) {
      event.preventDefault();
      closeRequestId += 1;
      const reqId = closeRequestId;

      try {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send("bookmd:before-close", { requestId: reqId });
        }
      } catch {}

      // Fallback timeout in case renderer does not respond
      const timer = setTimeout(() => {
        pendingCloseResolvers.delete(reqId);
      }, 10000);

      pendingCloseResolvers.set(reqId, (result) => {
        clearTimeout(timer);
        if (result === "proceed") {
          clearTimeout(showFallbackTimer);
          windows.delete(win);
          windowInitialPaths.delete(winId);
          windowInitialData.delete(winId);
          if (webContentsId !== null) {
            windowInitialPaths.delete(webContentsId);
            windowInitialData.delete(webContentsId);
          }
          try {
            if (!win.isDestroyed()) {
              win.destroy();
            }
          } catch {}
          if (windows.size === 0 && process.platform !== "darwin") {
            app.quit();
          }
        }
      });
    }
  });

  win.on("closed", () => {
    clearTimeout(showFallbackTimer);
    windows.delete(win);
    windowInitialPaths.delete(winId);
    windowInitialData.delete(winId);
    if (webContentsId !== null) {
      windowInitialPaths.delete(webContentsId);
      windowInitialData.delete(webContentsId);
    }
    if (mainWindow === win) {
      mainWindow = getActiveWindow();
    }
  });

  win.on("enter-full-screen", () => {
    try {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send("bookmd:fullscreen-changed", true);
      }
    } catch {}
  });

  win.on("leave-full-screen", () => {
    try {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send("bookmd:fullscreen-changed", false);
      }
    } catch {}
  });

  if (!app.isPackaged && devServerUrl) {
    await win.loadURL(devServerUrl);
  } else {
    await win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  return win;
}

function findMarkdownPathFromArgs(argv, workingDirectory = null) {
  if (!Array.isArray(argv)) return null;
  for (const arg of argv) {
    const filePath = normalizeLaunchPath(arg, workingDirectory);
    if (filePath && isValidMarkdownPath(filePath)) {
      return filePath;
    }
  }
  return null;
}

function normalizeLaunchPath(value, workingDirectory = null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^"|"$/g, "");
  if (!trimmed || trimmed.startsWith("--") || trimmed.startsWith("-")) return null;
  try {
    if (/^file:/i.test(trimmed)) {
      return fileURLToPath(trimmed);
    }
    return workingDirectory ? path.resolve(workingDirectory, trimmed) : path.resolve(trimmed);
  } catch {
    return null;
  }
}

function sendOpenFilePath(filePath) {
  if (!filePath) return;
  registerPath(filePath);
  let win = mainWindow;
  if (!win || win.isDestroyed()) {
    createWindow(filePath);
    return;
  }
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
  try {
    win.setAlwaysOnTop(true);
    win.setAlwaysOnTop(false);
  } catch {}

  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", () => {
      win.webContents.send("bookmd:open-file-path", filePath);
    });
  } else {
    win.webContents.send("bookmd:open-file-path", filePath);
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine, workingDirectory) => {
    const filePath = findMarkdownPathFromArgs(commandLine, workingDirectory);
    if (filePath) {
      sendOpenFilePath(filePath);
    } else {
      showMainWindow();
    }
  });

  app.whenReady().then(() => {
    buildApplicationMenu();
    initFlashCapsule();
    createTray();

    if (getAppConfig().autoLaunch) {
      setAutoLaunch(true);
    }

    if (!isLaunchHidden) {
      createWindow(launchFilePath);
      launchFilePath = null;
    } else {
      createWindow(launchFilePath).then((w) => {
        try {
          if (w && !w.isDestroyed()) {
            w.hide();
          }
        } catch {}
      });
      launchFilePath = null;
    }
  });
}

app.on("activate", () => {
  showMainWindow();
});

app.on("before-quit", () => {
  isAppQuitting = true;
  try {
    globalShortcut.unregisterAll();
  } catch {}
  if (flashCapsuleWindow && !flashCapsuleWindow.isDestroyed()) {
    flashCapsuleWindow.destroy();
  }
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
  }
});

app.on("will-quit", () => {
  try {
    globalShortcut.unregisterAll();
  } catch {}
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
  }
});

app.on("window-all-closed", () => {
  const config = getAppConfig();
  const runInBackground = config.runInBackground !== false;
  if (!runInBackground && process.platform !== "darwin") {
    app.quit();
  }
});

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  const markdownPath = findMarkdownPathFromArgs([filePath]);
  if (markdownPath) {
    sendOpenFilePath(markdownPath);
  }
});

// ---------------------------------------------------------------------------
// IPC handler registration
//
// The channel handlers live in domain modules beside this file — files.cjs
// (vault + document CRUD), capture.cjs (flash capsule + Space), history.cjs
// (snapshots), media.cjs (PNG/SVG export + clipboard) and system.cjs
// (window/system + settings) — each exporting one register*Handlers(context)
// function. Config and workspace-dir helpers shared by several groups live in
// shared.cjs and are required by those modules directly.
//
// The context below is the whole seam: explicit accessors for lifecycle-owned
// mutable state (window refs, the close flow, the launch path, flash capsule
// toggles) plus the stable Maps/Sets. Registration order is not observable;
// it runs at module load, exactly where these handlers were declared inline.
// ---------------------------------------------------------------------------

// Accessors over lifecycle-owned mutable state, shared with the handler modules.
function getMainWindow() {
  return mainWindow;
}

function getFlashCapsuleWindow() {
  return flashCapsuleWindow;
}

function getLaunchFilePath() {
  return launchFilePath;
}

function clearLaunchFilePath() {
  launchFilePath = null;
}

function setDocumentState(state) {
  documentState = state;
}

function getPendingCloseResolvers() {
  return pendingCloseResolvers;
}

function getFlashShortcut() {
  return currentFlashShortcut;
}

function setFlashShortcut(shortcut) {
  currentFlashShortcut = shortcut;
}

function getFlashPinned() {
  return isFlashCapsulePinned;
}

function setFlashPinned(pinned) {
  isFlashCapsulePinned = pinned;
}

function getFlashPersistentTabActive() {
  return isFlashPersistentTabActive;
}

function setFlashPersistentTabActive(active) {
  isFlashPersistentTabActive = Boolean(active);
}

function getNativeDialogOpen() {
  return isNativeDialogOpen;
}

function setNativeDialogOpen(open) {
  isNativeDialogOpen = open;
}

const handlerContext = {
  // Windows: the Set is stable; single-window refs go through accessors
  // because main.cjs reassigns them.
  windows,
  getMainWindow,
  getFlashCapsuleWindow,
  createWindow,
  getWindowFromEvent,
  toggleFlashCapsuleWindow,
  // Launch / document / close state owned by the window lifecycle
  windowInitialPaths,
  windowInitialData,
  getLaunchFilePath,
  clearLaunchFilePath,
  setDocumentState,
  getPendingCloseResolvers,
  // Flash capsule state shared with the capsule window's blur/shortcut logic
  getFlashShortcut,
  setFlashShortcut,
  getFlashPinned,
  setFlashPinned,
  getFlashPersistentTabActive,
  setFlashPersistentTabActive,
  getNativeDialogOpen,
  setNativeDialogOpen,
  // Tray / settings side effects owned by the lifecycle
  setAutoLaunch,
  updateTrayMenu,
  broadcastSettings,
};

registerFilesHandlers(handlerContext);
registerCaptureHandlers(handlerContext);
registerHistoryHandlers();
registerMediaHandlers(handlerContext);
registerSystemHandlers(handlerContext);
// Explorer "New" menu entries own no lifecycle state, so they get no context.
registerShellNewHandlers();
