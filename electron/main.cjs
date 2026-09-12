const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeTheme, shell, globalShortcut, screen, nativeImage, clipboard } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath, pathToFileURL } = require("node:url");
const {
  markdownExtensions,
  buildDirectoryManifest,
  readMarkdownSource,
  readMarkdownSourcesBatch,
  saveMarkdownFile,
  registerPath,
  isValidMarkdownPath,
} = require("./markdown-files.cjs");
const {
  recordSnapshot,
  listSnapshots,
  readSnapshot,
} = require("./snapshots.cjs");

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
let pendingCloseResolvers = new Map();
let closeRequestId = 0;
let documentState = {
  activePath: null,
  isDirty: false,
};

let flashCapsuleWindow = null;
let flashCapsuleLoadingPromise = null;
let lastActiveWorkspaceDir = null;
let tray = null;
let isFlashCapsulePinned = false;
let isNativeDialogOpen = false;

function getAppConfig() {
  try {
    const configPath = path.join(app.getPath("userData"), "knowspace-config.json");
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
      return {
        flashShortcut: parsed.flashShortcut || "Alt+Space",
        runInBackground: parsed.runInBackground !== false,
        autoLaunch: Boolean(parsed.autoLaunch),
        flashPinned: Boolean(parsed.flashPinned),
        flashSpaceDir: typeof parsed.flashSpaceDir === "string" ? parsed.flashSpaceDir : "",
        persistentNote: typeof parsed.persistentNote === "string" ? parsed.persistentNote : "",
        flashWidth: typeof parsed.flashWidth === "number" ? parsed.flashWidth : 600,
        flashHeight: typeof parsed.flashHeight === "number" ? parsed.flashHeight : 360,
      };
    }
  } catch {}
  return {
    flashShortcut: "Alt+Space",
    runInBackground: true,
    autoLaunch: false,
    flashPinned: false,
    flashSpaceDir: "",
    persistentNote: "",
    flashWidth: 600,
    flashHeight: 360,
  };
}

isFlashCapsulePinned = Boolean(getAppConfig().flashPinned);

function getDefaultSpaceDir() {
  let baseDir = lastActiveWorkspaceDir && fs.existsSync(lastActiveWorkspaceDir)
    ? lastActiveWorkspaceDir
    : path.join(app.getPath("userData"), "workspace");
  if (path.basename(baseDir).toLowerCase() === "space") {
    return baseDir;
  }
  return path.join(baseDir, "Space");
}

function resolveFlashSpaceDir() {
  const config = getAppConfig();
  if (config.flashSpaceDir && typeof config.flashSpaceDir === "string" && config.flashSpaceDir.trim()) {
    const customDir = path.resolve(config.flashSpaceDir.trim());
    if (!fs.existsSync(customDir)) {
      try {
        fs.mkdirSync(customDir, { recursive: true });
      } catch (err) {
        console.warn("Could not create custom flash space dir:", err);
      }
    }
    if (fs.existsSync(customDir)) {
      return { dir: customDir, isCustom: true, defaultDir: getDefaultSpaceDir() };
    }
  }

  const defaultDir = getDefaultSpaceDir();
  if (!fs.existsSync(defaultDir)) {
    try {
      fs.mkdirSync(defaultDir, { recursive: true });
    } catch {}
  }
  return { dir: defaultDir, isCustom: false, defaultDir };
}

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

function saveAppConfig(newConfig) {
  try {
    const configPath = path.join(app.getPath("userData"), "knowspace-config.json");
    let current = {};
    if (fs.existsSync(configPath)) {
      try {
        current = JSON.parse(fs.readFileSync(configPath, "utf8"));
      } catch {}
    }
    const merged = { ...current, ...newConfig };
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf8");
    return merged;
  } catch {
    return newConfig;
  }
}

function getSavedFlashShortcut() {
  return getAppConfig().flashShortcut;
}

function saveFlashShortcut(shortcut) {
  return saveAppConfig({ flashShortcut: shortcut });
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

function getAutoLaunch() {
  const config = getAppConfig();
  return Boolean(config.autoLaunch);
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
      if (!win.isDestroyed() && win.isVisible() && !isFlashCapsulePinned && !isNativeDialogOpen) {
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
  const windowIcon = process.platform === "win32" && fs.existsSync(iconIco)
    ? iconIco
    : (fs.existsSync(iconPng) ? iconPng : undefined);

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

// IPC handlers
ipcMain.handle("bookmd:open-in-new-window", async (_event, absolutePath) => {
  if (typeof absolutePath !== "string" || !isValidMarkdownPath(absolutePath)) {
    throw new Error("无效的 Markdown 文件路径。");
  }
  registerPath(absolutePath);
  const newWin = await createWindow(absolutePath);
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
  if (senderWebContentsId && windowInitialData.has(senderWebContentsId)) {
    cachedData = windowInitialData.get(senderWebContentsId);
  } else if (winId && windowInitialData.has(winId)) {
    cachedData = windowInitialData.get(winId);
  }

  let filePath = null;
  if (senderWebContentsId && windowInitialPaths.has(senderWebContentsId)) {
    filePath = windowInitialPaths.get(senderWebContentsId);
  } else if (winId && windowInitialPaths.has(winId)) {
    filePath = windowInitialPaths.get(winId);
  } else if (launchFilePath) {
    filePath = launchFilePath;
  }

  event.returnValue = cachedData ? cachedData : (filePath ? { filePath, source: null } : null);
});

ipcMain.handle("bookmd:get-launch-file-path", async (event) => {
  const senderWebContentsId = event?.sender?.id;
  const senderWin = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null;

  if (senderWebContentsId && windowInitialPaths.has(senderWebContentsId)) {
    const filePath = windowInitialPaths.get(senderWebContentsId);
    windowInitialPaths.delete(senderWebContentsId);
    if (senderWin) windowInitialPaths.delete(senderWin.id);
    return filePath;
  }
  if (senderWin && windowInitialPaths.has(senderWin.id)) {
    const filePath = windowInitialPaths.get(senderWin.id);
    windowInitialPaths.delete(senderWin.id);
    return filePath;
  }
  if (launchFilePath) {
    const filePath = launchFilePath;
    launchFilePath = null;
    return filePath;
  }
  return null;
});

ipcMain.handle("bookmd:set-native-theme", (_event, theme) => {
  const isDark = theme === "twitter" || theme === "dark";
  const isLight = theme === "light" || theme === "eink";
  nativeTheme.themeSource = isDark ? "dark" : (isLight ? "light" : "system");
  for (const win of windows) {
    try {
      if (win && !win.isDestroyed()) {
        win.setBackgroundColor(isDark ? "#000000" : (theme === "eink" ? "#f4f1ea" : "#f6f7f4"));
      }
    } catch {}
  }
  if (flashCapsuleWindow && !flashCapsuleWindow.isDestroyed()) {
    try {
      flashCapsuleWindow.webContents.send("bookmd:theme-updated", theme);
    } catch {}
  }
});

ipcMain.handle("bookmd:set-document-state", (_event, state) => {
  if (state && typeof state === "object") {
    documentState = {
      activePath: state.activePath ?? null,
      isDirty: Boolean(state.isDirty),
    };
  }
});

ipcMain.handle("bookmd:resolve-before-close", (_event, { requestId, action }) => {
  const resolver = pendingCloseResolvers.get(requestId);
  if (resolver) {
    pendingCloseResolvers.delete(requestId);
    resolver(action);
  }
});

ipcMain.handle("bookmd:open-directory", async (event) => {
  const targetWin = getWindowFromEvent(event);
  const result = await dialog.showOpenDialog(targetWin || undefined, {
    title: "选择 Markdown 文件目录",
    properties: ["openDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const rootPath = result.filePaths[0];
  lastActiveWorkspaceDir = rootPath;
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
  lastActiveWorkspaceDir = rootPath;
  return await buildDirectoryManifest(rootPath);
});

ipcMain.handle("bookmd:read-markdown-file", async (_event, absolutePath) => {
  return await readMarkdownSource(absolutePath);
});

ipcMain.handle("bookmd:read-markdown-batch", async (_event, paths) => {
  return await readMarkdownSourcesBatch(paths);
});

ipcMain.handle("bookmd:open-external", async (_event, url) => {
  if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("mailto:"))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
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
    lastActiveWorkspaceDir = rootPath;
  }
  const directory = await buildDirectoryManifest(rootPath);

  const activeChapter = directory.chapters.find(
    (c) => path.resolve(c.absolutePath) === path.resolve(absolutePath)
  );

  return {
    directory,
    activeChapterId: activeChapter ? activeChapter.id : null,
  };
});

// Flash Capsule IPC handlers
ipcMain.handle("bookmd:open-flash-capsule", async () => {
  await toggleFlashCapsuleWindow();
  return true;
});

ipcMain.handle("bookmd:hide-flash-capsule", () => {
  if (flashCapsuleWindow && !flashCapsuleWindow.isDestroyed()) {
    flashCapsuleWindow.hide();
  }
  return true;
});

ipcMain.handle("bookmd:get-flash-shortcut", () => {
  return currentFlashShortcut || "Alt+Space";
});

ipcMain.handle("bookmd:set-flash-shortcut", (_event, newShortcut) => {
  if (!newShortcut || typeof newShortcut !== "string") {
    return { success: false, error: "快捷键格式不能为空" };
  }
  const cleanShortcut = newShortcut.trim();
  try {
    if (currentFlashShortcut) {
      try {
        globalShortcut.unregister(currentFlashShortcut);
      } catch {}
    }
    const registered = globalShortcut.register(cleanShortcut, () => {
      toggleFlashCapsuleWindow();
    });
    if (registered) {
      currentFlashShortcut = cleanShortcut;
      saveFlashShortcut(cleanShortcut);
      for (const w of windows) {
        try {
          if (!w.isDestroyed()) {
            w.webContents.send("bookmd:flash-shortcut-updated", cleanShortcut);
          }
        } catch {}
      }
      if (flashCapsuleWindow && !flashCapsuleWindow.isDestroyed()) {
        try {
          flashCapsuleWindow.webContents.send("bookmd:flash-shortcut-updated", cleanShortcut);
        } catch {}
      }
      return { success: true, shortcut: cleanShortcut };
    } else {
      if (currentFlashShortcut) {
        try {
          globalShortcut.register(currentFlashShortcut, () => {
            toggleFlashCapsuleWindow();
          });
        } catch {}
      }
      return { success: false, error: `快捷键 "${cleanShortcut}" 注册失败，可能已被系统或其它软件占用。` };
    }
  } catch (err) {
    if (currentFlashShortcut) {
      try {
        globalShortcut.register(currentFlashShortcut, () => {
          toggleFlashCapsuleWindow();
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
    workspaceDir: lastActiveWorkspaceDir,
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
    for (const w of windows) {
      try {
        if (!w.isDestroyed()) {
          w.webContents.send("bookmd:flash-note-saved", { filePath: targetFile, dateStr, fileName: minuteFileName });
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
  return { pinned: Boolean(isFlashCapsulePinned) };
});

ipcMain.handle("bookmd:set-flash-pin", (_event, pinned) => {
  isFlashCapsulePinned = Boolean(pinned);
  saveAppConfig({ flashPinned: isFlashCapsulePinned });
  return { success: true, pinned: isFlashCapsulePinned };
});

// Flash Space Directory Management IPC handlers
ipcMain.handle("bookmd:get-flash-space-config", () => {
  const { dir: currentDir, isCustom, defaultDir } = resolveFlashSpaceDir();
  return { currentDir, isCustom, defaultDir };
});

ipcMain.handle("bookmd:select-flash-space-dir", async () => {
  isNativeDialogOpen = true;
  try {
    const parentWin = (flashCapsuleWindow && !flashCapsuleWindow.isDestroyed() && flashCapsuleWindow.isVisible())
      ? flashCapsuleWindow
      : mainWindow;
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
    isNativeDialogOpen = false;
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
  if (flashCapsuleWindow && !flashCapsuleWindow.isDestroyed()) {
    const w = Math.max(440, Math.min(1000, Math.round(payload.width)));
    const h = Math.max(260, Math.min(720, Math.round(payload.height)));
    flashCapsuleWindow.setSize(w, h);
    saveAppConfig({ flashWidth: w, flashHeight: h });
    return { success: true, width: w, height: h };
  }
  return { success: false };
});

ipcMain.handle("bookmd:reset-flash-size", () => {
  const w = 600;
  const h = 360;
  if (flashCapsuleWindow && !flashCapsuleWindow.isDestroyed()) {
    flashCapsuleWindow.setSize(w, h);
    saveAppConfig({ flashWidth: w, flashHeight: h });
    return { success: true, width: w, height: h };
  }
  saveAppConfig({ flashWidth: w, flashHeight: h });
  return { success: true, width: w, height: h };
});

// Flash Space Timeline & Inbox Hub IPC handlers
let cachedFlashSummary = null;
let lastFlashSummaryMtime = 0;

function invalidateFlashSummaryCache() {
  cachedFlashSummary = null;
  lastFlashSummaryMtime = 0;
}

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

    if (cachedFlashSummary && lastFlashSummaryMtime === dirMtime && cachedFlashSummary.spaceDir === spaceDir) {
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
    let targetDir = "";
    if (currentFilePath && typeof currentFilePath === "string" && fs.existsSync(path.dirname(currentFilePath))) {
      targetDir = path.join(path.dirname(currentFilePath), "assets");
    } else if (lastActiveWorkspaceDir && fs.existsSync(lastActiveWorkspaceDir)) {
      targetDir = path.join(lastActiveWorkspaceDir, "assets");
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
    setAutoLaunch(settings.autoLaunch);
  }
  if (typeof settings.runInBackground === "boolean") {
    saveAppConfig({ runInBackground: settings.runInBackground });
  }
  updateTrayMenu();
  broadcastSettings();
  return {
    success: true,
    settings: {
      autoLaunch: getAutoLaunch(),
      runInBackground: getAppConfig().runInBackground !== false,
      flashShortcut: getAppConfig().flashShortcut || "Alt+Space",
    },
  };
});

ipcMain.handle("bookmd:save-markdown-file", async (_event, request) => {
  if (!request || typeof request.absolutePath !== "string") {
    return { success: false, errorCode: "INVALID_PATH", message: "无效的文件路径。" };
  }
  return await saveMarkdownFile({
    absolutePath: request.absolutePath,
    content: request.content,
    expectedVersion: request.expectedVersion,
    force: Boolean(request.force),
    hasBom: request.hasBom,
    lineEnding: request.lineEnding,
  });
});

// Local Version History & Snapshot APIs
ipcMain.handle("bookmd:list-snapshots", async (_event, params = {}) => {
  if (!params || !params.filePath) return [];
  return await listSnapshots({
    filePath: params.filePath,
    rootPath: params.rootPath,
  });
});

ipcMain.handle("bookmd:read-snapshot", async (_event, params = {}) => {
  if (!params || !params.filePath || !params.snapshotId) return null;
  return await readSnapshot({
    filePath: params.filePath,
    rootPath: params.rootPath,
    snapshotId: params.snapshotId,
  });
});

ipcMain.handle("bookmd:revert-snapshot", async (_event, params = {}) => {
  if (!params || !params.filePath || !params.snapshotId) {
    return { success: false, message: "参数无效" };
  }
  const snap = await readSnapshot({
    filePath: params.filePath,
    rootPath: params.rootPath,
    snapshotId: params.snapshotId,
  });
  if (!snap || typeof snap.content !== "string") {
    return { success: false, message: "无法读取目标快照内容" };
  }

  const saveRes = await saveMarkdownFile({
    absolutePath: params.filePath,
    content: snap.content,
    force: true,
  });

  if (saveRes.success) {
    await recordSnapshot({
      filePath: params.filePath,
      rootPath: params.rootPath,
      content: snap.content,
      reason: `revert (${params.snapshotId})`,
    });
  }

  return saveRes;
});

ipcMain.handle("bookmd:create-manual-snapshot", async (_event, params = {}) => {
  if (!params || !params.filePath || typeof params.content !== "string") {
    return { success: false, message: "参数无效" };
  }
  return await recordSnapshot({
    filePath: params.filePath,
    rootPath: params.rootPath,
    content: params.content,
    reason: "manual",
  });
});

ipcMain.handle("bookmd:create-markdown-file", async (event, options = {}) => {
  let defaultDir = options.rootPath || app.getPath("documents");
  let defaultName = options.defaultName || "未命名.md";
  const defaultPath = path.join(defaultDir, defaultName);
  const targetWin = getWindowFromEvent(event);

  const isCanvas = defaultName.endsWith(".canvas");
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
    content: options.initialContent ?? (isCanvas ? '{\n  "nodes": [],\n  "edges": []\n}' : "# 未命名\n\n"),
    force: true,
  });

  if (!saveRes.success) {
    return { canceled: false, success: false, message: saveRes.message, errorCode: saveRes.errorCode };
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
  const targetWin = getWindowFromEvent(event);

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
    return { canceled: false, success: false, message: saveRes.message, errorCode: saveRes.errorCode };
  }

  registerPath(targetPath);
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

ipcMain.handle("bookmd:toggle-fullscreen", (event) => {
  const targetWin = getWindowFromEvent(event);
  if (!targetWin || targetWin.isDestroyed()) return false;
  const next = !targetWin.isFullScreen();
  targetWin.setFullScreen(next);
  return next;
});

ipcMain.handle("bookmd:is-fullscreen", (event) => {
  const targetWin = getWindowFromEvent(event);
  if (!targetWin || targetWin.isDestroyed()) return false;
  return targetWin.isFullScreen();
});

ipcMain.handle("bookmd:save-png-data", async (event, request = {}) => {
  const targetWin = getWindowFromEvent(event);
  const { dataUrl, filename = "mermaid-diagram" } = request;
  if (!dataUrl) return { success: false, message: "缺少图片数据" };

  const cleanFilename = (filename || "mermaid-diagram").replace(/\.(svg|png)$/i, "");
  const defaultPath = path.join(app.getPath("downloads"), `${cleanFilename}.png`);

  const saveResult = await dialog.showSaveDialog(targetWin || undefined, {
    title: "导出 Mermaid 架构图为 PNG 高清图片",
    defaultPath,
    filters: [
      { name: "PNG 高清图片 (*.png)", extensions: ["png"] },
      { name: "所有文件 (*.*)", extensions: ["*"] },
    ],
  });

  if (saveResult.canceled || !saveResult.filePath) {
    return { canceled: true };
  }

  try {
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    await fs.promises.writeFile(saveResult.filePath, buffer);
    return { success: true, filePath: saveResult.filePath };
  } catch (err) {
    console.error("Failed to write PNG file:", err);
    return { success: false, message: err.message };
  }
});

ipcMain.handle("bookmd:read-file-as-data-url", async (event, request = {}) => {
  const { filePath } = request;
  if (!filePath || typeof filePath !== "string") {
    return { success: false, message: "缺少文件路径" };
  }

  try {
    const data = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "gif"
        ? "image/gif"
        : ext === "webp"
        ? "image/webp"
        : ext === "svg"
        ? "image/svg+xml"
        : ext === "bmp"
        ? "image/bmp"
        : "image/png";
    return { success: true, dataUrl: `data:${mime};base64,${data.toString("base64")}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle("bookmd:save-png-buffer", async (event, request = {}) => {
  const targetWin = getWindowFromEvent(event);
  const { buffer, filename = "KnowSpace白板" } = request;
  if (!buffer) return { success: false, message: "缺少图片数据" };

  const cleanFilename = (filename || "KnowSpace白板").replace(/\.(svg|png)$/i, "");
  const defaultPath = path.join(app.getPath("downloads"), `${cleanFilename}.png`);

  const saveResult = await dialog.showSaveDialog(targetWin || undefined, {
    title: "导出白板为 PNG 高清图片",
    defaultPath,
    filters: [
      { name: "PNG 高清图片 (*.png)", extensions: ["png"] },
      { name: "所有文件 (*.*)", extensions: ["*"] },
    ],
  });

  if (saveResult.canceled || !saveResult.filePath) {
    return { canceled: true };
  }

  try {
    // The renderer sends a plain ArrayBuffer (arriving as a Uint8Array here),
    // so no base64 decoding is needed and peak memory stays flat.
    const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    await fs.promises.writeFile(saveResult.filePath, data);
    return { success: true, filePath: saveResult.filePath };
  } catch (err) {
    console.error("Failed to write PNG file:", err);
    return { success: false, message: err.message };
  }
});

ipcMain.handle("bookmd:export-svg-as-png", async (event, request = {}) => {
  const targetWin = getWindowFromEvent(event);
  const { svgHtml, theme = "twitter", filename = "mermaid-diagram" } = request;
  if (!svgHtml) return { success: false, message: "缺少 SVG 源码" };

  const cleanFilename = (filename || "mermaid-diagram").replace(/\.(svg|png)$/i, "");
  const defaultPath = path.join(app.getPath("downloads"), `${cleanFilename}.png`);

  const saveResult = await dialog.showSaveDialog(targetWin || undefined, {
    title: "导出 Mermaid 架构图为 PNG 高清图片",
    defaultPath,
    filters: [
      { name: "PNG 高清图片 (*.png)", extensions: ["png"] },
      { name: "所有文件 (*.*)", extensions: ["*"] },
    ],
  });

  if (saveResult.canceled || !saveResult.filePath) {
    return { canceled: true };
  }

  // Initial window size for measuring
  const offscreenWin = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    webPreferences: {
      offscreen: true,
      contextIsolation: false,
    },
  });

  try {
    const isDark = theme === "twitter" || (theme === "system" && nativeTheme.shouldUseDarkColors);
    const bgColor = isDark ? "#000000" : "#ffffff";
    const textColor = isDark ? "#e7e9ea" : "#0f1419";

    const pageHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {
    box-sizing: border-box;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: geometricPrecision;
  }
  html, body {
    margin: 0;
    padding: 0;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background-color: ${bgColor};
    color: ${textColor};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif;
  }
  svg {
    width: 100vw;
    height: 100vh;
    display: block;
    margin: 0;
    shape-rendering: geometricPrecision;
    text-rendering: geometricPrecision;
  }
</style>
</head>
<body>
  ${svgHtml}
</body>
</html>`;

    await offscreenWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(pageHtml)}`);
    // Wait for DOM & SVG to parse
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Measure exact bounding box and update viewBox to tightly frame contents
    const metrics = await offscreenWin.webContents.executeJavaScript(`
      (() => {
        const svg = document.querySelector('svg');
        if (!svg) return { success: false, width: 1200, height: 800 };

        svg.style.margin = '0';
        svg.style.position = 'static';
        svg.style.transform = 'none';
        svg.style.maxWidth = 'none';
        svg.style.maxHeight = 'none';

        let bbox;
        try {
          bbox = svg.getBBox();
        } catch (e) {
          const vb = svg.viewBox && svg.viewBox.baseVal;
          bbox = {
            x: vb ? vb.x : 0,
            y: vb ? vb.y : 0,
            width: vb && vb.width ? vb.width : (svg.clientWidth || 1200),
            height: vb && vb.height ? vb.height : (svg.clientHeight || 800),
          };
        }

        const pad = Math.max(20, Math.round(Math.min(bbox.width, bbox.height) * 0.035));
        const finalX = bbox.x - pad;
        const finalY = bbox.y - pad;
        const finalWidth = Math.max(Math.ceil(bbox.width + pad * 2), 100);
        const finalHeight = Math.max(Math.ceil(bbox.height + pad * 2), 80);

        svg.setAttribute('viewBox', finalX + ' ' + finalY + ' ' + finalWidth + ' ' + finalHeight);
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.style.width = '100vw';
        svg.style.height = '100vh';

        return {
          success: true,
          width: finalWidth,
          height: finalHeight,
        };
      })()
    `);

    const naturalWidth = metrics?.width || 1200;
    const naturalHeight = metrics?.height || 800;

    // Compute Ultra-HD Retina resolution (2.0x to 3.5x scale)
    const scale = Math.max(2.0, Math.min(3200 / naturalWidth, 3.5));
    const targetWidth = Math.max(Math.min(Math.round(naturalWidth * scale), 4800), 600);
    const targetHeight = Math.max(Math.min(Math.round(naturalHeight * scale), 4800), 400);

    offscreenWin.setSize(targetWidth, targetHeight);
    offscreenWin.setContentSize(targetWidth, targetHeight);

    // Wait for layout to settle at high resolution
    await new Promise((resolve) => setTimeout(resolve, 200));

    const image = await offscreenWin.webContents.capturePage({
      x: 0,
      y: 0,
      width: targetWidth,
      height: targetHeight,
    });

    const pngBuffer = image.toPNG();
    await fs.promises.writeFile(saveResult.filePath, pngBuffer);
    return { success: true, filePath: saveResult.filePath };
  } catch (err) {
    console.error("Failed to render and save PNG:", err);
    return { success: false, message: err.message };
  } finally {
    if (offscreenWin && !offscreenWin.isDestroyed()) {
      offscreenWin.destroy();
    }
  }
});

/**
 * Renders an SVG document in an offscreen window and returns the PNG bytes.
 *
 * This deliberately bypasses the renderer's <canvas> pipeline. `capturePage()`
 * composites the page inside Chromium itself, so it succeeds even when the SVG
 * references resources that would "taint" a canvas and make `toBlob()` refuse
 * to run — which is exactly why exporting a board whose cards embed local or
 * remote images used to produce an SVG instead of a PNG.
 */
async function renderSvgToPngBuffer(svgMarkup, scale = 2) {
  const viewBoxMatch =
    /viewBox\s*=\s*"([-\d.eE]+)\s+([-\d.eE]+)\s+([\d.eE]+)\s+([\d.eE]+)"/i.exec(svgMarkup);
  let naturalWidth = viewBoxMatch ? parseFloat(viewBoxMatch[3]) : 0;
  let naturalHeight = viewBoxMatch ? parseFloat(viewBoxMatch[4]) : 0;

  if (!(naturalWidth > 0)) {
    const wm = /\bwidth\s*=\s*"([\d.]+)/i.exec(svgMarkup);
    naturalWidth = wm ? parseFloat(wm[1]) : 1600;
  }
  if (!(naturalHeight > 0)) {
    const hm = /\bheight\s*=\s*"([\d.]+)/i.exec(svgMarkup);
    naturalHeight = hm ? parseFloat(hm[1]) : 1200;
  }

  // Same pixel budget the renderer enforces, so huge boards stay affordable.
  const maxByPixels = Math.sqrt(24000000 / (naturalWidth * naturalHeight));
  const safeScale = Math.max(1, Math.min(scale, 3.5, maxByPixels));
  const targetWidth = Math.max(320, Math.min(Math.round(naturalWidth * safeScale), 4800));
  const targetHeight = Math.max(240, Math.min(Math.round(naturalHeight * safeScale), 4800));

  const offscreenWin = new BrowserWindow({
    width: targetWidth,
    height: targetHeight,
    show: false,
    webPreferences: { offscreen: true, contextIsolation: false },
  });

  try {
    const pageHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
  svg { display: block; shape-rendering: geometricPrecision; text-rendering: geometricPrecision; }
</style></head><body>${svgMarkup}</body></html>`;

    // Written through document.write rather than a data: URL so that very
    // large boards (inlined base64 images) are not limited by URL length.
    await offscreenWin.loadURL("about:blank");
    await offscreenWin.webContents.executeJavaScript(
      `document.open();document.write(${JSON.stringify(pageHtml)});document.close();true;`
    );
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Pin the drawing to the exact capture resolution
    await offscreenWin.webContents.executeJavaScript(`
      (() => {
        const svg = document.querySelector('svg');
        if (!svg) return false;
        svg.setAttribute('width', '${targetWidth}');
        svg.setAttribute('height', '${targetHeight}');
        svg.style.width = '${targetWidth}px';
        svg.style.height = '${targetHeight}px';
        return true;
      })()
    `);
    await new Promise((resolve) => setTimeout(resolve, 250));

    const image = await offscreenWin.webContents.capturePage({
      x: 0,
      y: 0,
      width: targetWidth,
      height: targetHeight,
    });
    return image.toPNG();
  } finally {
    if (offscreenWin && !offscreenWin.isDestroyed()) offscreenWin.destroy();
  }
}

ipcMain.handle("bookmd:export-canvas-as-png", async (event, request = {}) => {
  const targetWin = getWindowFromEvent(event);
  const { svg, filename = "KnowSpace白板", scale = 2 } = request;
  if (!svg) return { success: false, message: "缺少白板 SVG 数据" };

  const cleanFilename = (filename || "KnowSpace白板").replace(/\.(svg|png)$/i, "");
  const defaultPath = path.join(app.getPath("downloads"), `${cleanFilename}.png`);

  const saveResult = await dialog.showSaveDialog(targetWin || undefined, {
    title: "导出白板为 PNG 高清图片",
    defaultPath,
    filters: [
      { name: "PNG 高清图片 (*.png)", extensions: ["png"] },
      { name: "所有文件 (*.*)", extensions: ["*"] },
    ],
  });

  if (saveResult.canceled || !saveResult.filePath) return { canceled: true };

  try {
    const pngBuffer = await renderSvgToPngBuffer(svg, scale);
    await fs.promises.writeFile(saveResult.filePath, pngBuffer);
    return { success: true, filePath: saveResult.filePath };
  } catch (err) {
    console.error("离屏渲染白板 PNG 失败:", err);
    return { success: false, message: err.message };
  }
});

ipcMain.handle("bookmd:copy-canvas-as-image", async (event, request = {}) => {
  const { svg, scale = 2 } = request;
  if (!svg) return { success: false, message: "缺少白板 SVG 数据" };

  try {
    const pngBuffer = await renderSvgToPngBuffer(svg, scale);
    const image = nativeImage.createFromBuffer(pngBuffer);
    if (image.isEmpty()) return { success: false, message: "生成的图片为空" };
    clipboard.writeImage(image);
    return { success: true };
  } catch (err) {
    console.error("离屏渲染并复制白板图片失败:", err);
    return { success: false, message: err.message };
  }
});

ipcMain.handle("bookmd:copy-png-to-clipboard", async (event, request = {}) => {
  const { buffer } = request;
  if (!buffer) return { success: false, message: "缺少图片数据" };

  try {
    // The native clipboard does not need window focus or a user gesture, both
    // of which make navigator.clipboard.write() unreliable inside Electron.
    const image = nativeImage.createFromBuffer(
      Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
    );
    if (image.isEmpty()) return { success: false, message: "图片数据无效" };
    clipboard.writeImage(image);
    return { success: true };
  } catch (err) {
    console.error("写入系统剪贴板失败:", err);
    return { success: false, message: err.message };
  }
});

ipcMain.handle("bookmd:print-to-pdf", async (event, request = {}) => {
  const targetWin = getWindowFromEvent(event) || mainWindow;
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
    if (targetWin && !targetWin.isDestroyed() && typeof targetWin.getBackgroundColor === "function") {
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
      if (targetWin && !targetWin.isDestroyed() && typeof targetWin.setBackgroundColor === "function") {
        targetWin.setBackgroundColor(prevBg);
      }
    } catch {}
  }
});

ipcMain.handle("bookmd:print-document", async (event) => {
  const targetWin = getWindowFromEvent(event) || mainWindow;
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


