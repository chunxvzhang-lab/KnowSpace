const { contextBridge, ipcRenderer } = require("electron");

// Keep in sync with package.json "version": the startup handshake below (and
// the bookmd:api-version handler in system.cjs) warns when the two drift
// apart, so a one-sided bump is visible at first launch.
const API_VERSION = "2.7.5";

let initialSyncData = null;
try {
  initialSyncData = ipcRenderer.sendSync("bookmd:get-sync-launch-data");
} catch {}

// The bridge is namespaced by the handler module that owns each channel —
// files.cjs → files, history.cjs → history, media.cjs → media, system.cjs →
// system (window lifecycle, settings, shell events), capture.cjs → capture
// (Flash Capsule, including save-pasted-image, which wave 1 moved there).
// `apiVersion` is what the handshake reports back to main.
const desktopApi = {
  apiVersion: API_VERSION,

  files: {
    openDirectory: () => ipcRenderer.invoke("bookmd:open-directory"),
    refreshDirectory: (rootPath) => ipcRenderer.invoke("bookmd:refresh-directory", rootPath),
    readMarkdownFile: (absolutePath) =>
      ipcRenderer.invoke("bookmd:read-markdown-file", absolutePath),
    readMarkdownBatch: (paths) => ipcRenderer.invoke("bookmd:read-markdown-batch", paths),
    // The reader's scan preferences (currently: whether hidden files appear). A
    // setting rather than an argument on each listing call, so a re-listing from
    // any of the app's eleven paths honours it without being told again.
    setScanOptions: (options) => ipcRenderer.invoke("bookmd:set-scan-options", options),
    // A folder to revise from: picked, and listed again later, both without opening it
    // as the workspace.
    pickReviewFolder: () => ipcRenderer.invoke("bookmd:pick-review-folder"),
    listReviewFolder: (rootPath) => ipcRenderer.invoke("bookmd:list-review-folder", rootPath),
    // Picking an outline file to import: the dialog and the read both happen in the
    // main process, and what comes back is text rather than a path to write to.
    pickOutlineFile: () => ipcRenderer.invoke("bookmd:pick-outline-file"),
    // The mind map's companion file: what a Markdown document cannot hold.
    readMindmapSidecar: (params) => ipcRenderer.invoke("bookmd:read-mindmap-sidecar", params),
    saveMindmapSidecar: (params) => ipcRenderer.invoke("bookmd:save-mindmap-sidecar", params),
    getDirectoryForFile: (absolutePath) =>
      ipcRenderer.invoke("bookmd:get-directory-for-file", absolutePath),
    saveMarkdownFile: (request) => ipcRenderer.invoke("bookmd:save-markdown-file", request),
    createMarkdownFile: (options) => ipcRenderer.invoke("bookmd:create-markdown-file", options),
    renameMarkdownFile: (params) => ipcRenderer.invoke("bookmd:rename-markdown-file", params),
    saveMarkdownFileAs: (request) => ipcRenderer.invoke("bookmd:save-markdown-file-as", request),
  },

  history: {
    // Version Snapshots & Time Travel
    listSnapshots: (params) => ipcRenderer.invoke("bookmd:list-snapshots", params),
    readSnapshot: (params) => ipcRenderer.invoke("bookmd:read-snapshot", params),
    revertSnapshot: (params) => ipcRenderer.invoke("bookmd:revert-snapshot", params),
    createManualSnapshot: (params) => ipcRenderer.invoke("bookmd:create-manual-snapshot", params),
  },

  media: {
    exportSvgAsPng: (params) => ipcRenderer.invoke("bookmd:export-svg-as-png", params),
    exportCanvasAsPng: (params) => ipcRenderer.invoke("bookmd:export-canvas-as-png", params),
    savePngData: (params) => ipcRenderer.invoke("bookmd:save-png-data", params),
    savePngBuffer: (params) => ipcRenderer.invoke("bookmd:save-png-buffer", params),
    readFileAsDataUrl: (params) => ipcRenderer.invoke("bookmd:read-file-as-data-url", params),
    copyCanvasAsImage: (params) => ipcRenderer.invoke("bookmd:copy-canvas-as-image", params),
    copyPngToClipboard: (params) => ipcRenderer.invoke("bookmd:copy-png-to-clipboard", params),
  },

  system: {
    getInitialSyncData: () => initialSyncData,
    getLaunchFilePath: () => ipcRenderer.invoke("bookmd:get-launch-file-path"),
    setNativeTheme: (theme) => ipcRenderer.invoke("bookmd:set-native-theme", theme),
    openExternal: (url) => ipcRenderer.invoke("bookmd:open-external", url),
    toggleFullScreen: () => ipcRenderer.invoke("bookmd:toggle-fullscreen"),
    isFullScreen: () => ipcRenderer.invoke("bookmd:is-fullscreen"),
    openInNewWindow: (absolutePath) =>
      ipcRenderer.invoke("bookmd:open-in-new-window", absolutePath),
    printToPdf: (options) => ipcRenderer.invoke("bookmd:print-to-pdf", options),
    printDocument: () => ipcRenderer.invoke("bookmd:print-document"),
    setDocumentState: (state) => ipcRenderer.invoke("bookmd:set-document-state", state),
    resolveBeforeClose: (result) => ipcRenderer.invoke("bookmd:resolve-before-close", result),

    // App Settings (Background Running & Auto Launch)
    getAppSettings: () => ipcRenderer.invoke("bookmd:get-app-settings"),
    setAppSettings: (settings) => ipcRenderer.invoke("bookmd:set-app-settings", settings),

    onOpenFilePath: (callback) => {
      const listener = (_event, filePath) => callback(filePath);
      ipcRenderer.on("bookmd:open-file-path", listener);
      return () => ipcRenderer.removeListener("bookmd:open-file-path", listener);
    },
    onMenuCommand: (callback) => {
      const listener = (_event, command) => callback(command);
      ipcRenderer.on("bookmd:menu-command", listener);
      return () => ipcRenderer.removeListener("bookmd:menu-command", listener);
    },
    onBeforeClose: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on("bookmd:before-close", listener);
      return () => ipcRenderer.removeListener("bookmd:before-close", listener);
    },
    onFullScreenChanged: (callback) => {
      const listener = (_event, isFull) => callback(isFull);
      ipcRenderer.on("bookmd:fullscreen-changed", listener);
      return () => ipcRenderer.removeListener("bookmd:fullscreen-changed", listener);
    },
    onThemeUpdated: (callback) => {
      const listener = (_event, theme) => callback(theme);
      ipcRenderer.on("bookmd:theme-updated", listener);
      return () => ipcRenderer.removeListener("bookmd:theme-updated", listener);
    },
    onAppSettingsUpdated: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on("bookmd:app-settings-updated", listener);
      return () => ipcRenderer.removeListener("bookmd:app-settings-updated", listener);
    },
  },

  capture: {
    // Flash Capsule APIs (save-pasted-image lives here because wave 1 put its
    // channel in capture.cjs)
    openFlashCapsule: () => ipcRenderer.invoke("bookmd:open-flash-capsule"),
    hideFlashCapsule: () => ipcRenderer.invoke("bookmd:hide-flash-capsule"),
    getFlashShortcut: () => ipcRenderer.invoke("bookmd:get-flash-shortcut"),
    setFlashShortcut: (shortcut) => ipcRenderer.invoke("bookmd:set-flash-shortcut", shortcut),
    getFlashTargetPath: () => ipcRenderer.invoke("bookmd:get-flash-target-path"),
    saveFlashNote: (payload) => ipcRenderer.invoke("bookmd:save-flash-note", payload),
    getFlashPin: () => ipcRenderer.invoke("bookmd:get-flash-pin"),
    setFlashPin: (pinned) => ipcRenderer.invoke("bookmd:set-flash-pin", pinned),
    getFlashSpaceConfig: () => ipcRenderer.invoke("bookmd:get-flash-space-config"),
    selectFlashSpaceDir: () => ipcRenderer.invoke("bookmd:select-flash-space-dir"),
    resetFlashSpaceDir: () => ipcRenderer.invoke("bookmd:reset-flash-space-dir"),
    getPersistentNote: () => ipcRenderer.invoke("bookmd:get-persistent-note"),
    savePersistentNote: (text) => ipcRenderer.invoke("bookmd:save-persistent-note", text),
    setFlashSize: (size) => ipcRenderer.invoke("bookmd:set-flash-size", size),
    resetFlashSize: () => ipcRenderer.invoke("bookmd:reset-flash-size"),
    getFlashNotesSummary: () => ipcRenderer.invoke("bookmd:get-flash-notes-summary"),
    toggleFlashTodo: (params) => ipcRenderer.invoke("bookmd:toggle-flash-todo", params),
    deleteFlashNote: (params) => ipcRenderer.invoke("bookmd:delete-flash-note", params),
    savePastedImage: (params) => ipcRenderer.invoke("bookmd:save-pasted-image", params),

    onFlashFocus: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("bookmd:flash-focus", listener);
      return () => ipcRenderer.removeListener("bookmd:flash-focus", listener);
    },
    onFlashShortcutUpdated: (callback) => {
      const listener = (_event, shortcut) => callback(shortcut);
      ipcRenderer.on("bookmd:flash-shortcut-updated", listener);
      return () => ipcRenderer.removeListener("bookmd:flash-shortcut-updated", listener);
    },
    onFlashNoteSaved: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on("bookmd:flash-note-saved", listener);
      return () => ipcRenderer.removeListener("bookmd:flash-note-saved", listener);
    },
  },
};

contextBridge.exposeInMainWorld("knowSpaceDesktop", desktopApi);
contextBridge.exposeInMainWorld("bookMDDesktop", desktopApi);

// Startup handshake: each window's preload reports its bridge version once, on
// load. system.cjs compares it against app.getVersion() and console.warns on
// mismatch — catching a preload edited without the app version (or the
// reverse) at first launch rather than as a mystery contract break later.
ipcRenderer.invoke("bookmd:api-version", API_VERSION).catch(() => {});
