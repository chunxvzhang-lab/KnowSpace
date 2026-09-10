const { contextBridge, ipcRenderer } = require("electron");

let initialSyncData = null;
try {
  initialSyncData = ipcRenderer.sendSync("bookmd:get-sync-launch-data");
} catch {}

const desktopApi = {
  getInitialSyncData: () => initialSyncData,
  getLaunchFilePath: () => ipcRenderer.invoke("bookmd:get-launch-file-path"),
  setNativeTheme: (theme) => ipcRenderer.invoke("bookmd:set-native-theme", theme),
  openDirectory: () => ipcRenderer.invoke("bookmd:open-directory"),
  refreshDirectory: (rootPath) => ipcRenderer.invoke("bookmd:refresh-directory", rootPath),
  readMarkdownFile: (absolutePath) => ipcRenderer.invoke("bookmd:read-markdown-file", absolutePath),
  getDirectoryForFile: (absolutePath) => ipcRenderer.invoke("bookmd:get-directory-for-file", absolutePath),
  saveMarkdownFile: (request) => ipcRenderer.invoke("bookmd:save-markdown-file", request),
  createMarkdownFile: (options) => ipcRenderer.invoke("bookmd:create-markdown-file", options),
  renameMarkdownFile: (params) => ipcRenderer.invoke("bookmd:rename-markdown-file", params),
  saveMarkdownFileAs: (request) => ipcRenderer.invoke("bookmd:save-markdown-file-as", request),
  setDocumentState: (state) => ipcRenderer.invoke("bookmd:set-document-state", state),
  resolveBeforeClose: (result) => ipcRenderer.invoke("bookmd:resolve-before-close", result),
  openExternal: (url) => ipcRenderer.invoke("bookmd:open-external", url),
  toggleFullScreen: () => ipcRenderer.invoke("bookmd:toggle-fullscreen"),
  isFullScreen: () => ipcRenderer.invoke("bookmd:is-fullscreen"),
  exportSvgAsPng: (params) => ipcRenderer.invoke("bookmd:export-svg-as-png", params),
  savePngData: (params) => ipcRenderer.invoke("bookmd:save-png-data", params),
  savePngBuffer: (params) => ipcRenderer.invoke("bookmd:save-png-buffer", params),
  readFileAsDataUrl: (params) => ipcRenderer.invoke("bookmd:read-file-as-data-url", params),
  exportCanvasAsPng: (params) => ipcRenderer.invoke("bookmd:export-canvas-as-png", params),
  copyCanvasAsImage: (params) => ipcRenderer.invoke("bookmd:copy-canvas-as-image", params),
  copyPngToClipboard: (params) => ipcRenderer.invoke("bookmd:copy-png-to-clipboard", params),
  openInNewWindow: (absolutePath) => ipcRenderer.invoke("bookmd:open-in-new-window", absolutePath),
  printToPdf: (options) => ipcRenderer.invoke("bookmd:print-to-pdf", options),
  printDocument: () => ipcRenderer.invoke("bookmd:print-document"),

  // Version Snapshots & Time Travel
  listSnapshots: (params) => ipcRenderer.invoke("bookmd:list-snapshots", params),
  readSnapshot: (params) => ipcRenderer.invoke("bookmd:read-snapshot", params),
  revertSnapshot: (params) => ipcRenderer.invoke("bookmd:revert-snapshot", params),
  createManualSnapshot: (params) => ipcRenderer.invoke("bookmd:create-manual-snapshot", params),

  // Flash Capsule APIs
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
  onAppSettingsUpdated: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("bookmd:app-settings-updated", listener);
    return () => ipcRenderer.removeListener("bookmd:app-settings-updated", listener);
  },
  onThemeUpdated: (callback) => {
    const listener = (_event, theme) => callback(theme);
    ipcRenderer.on("bookmd:theme-updated", listener);
    return () => ipcRenderer.removeListener("bookmd:theme-updated", listener);
  },
};

contextBridge.exposeInMainWorld("knowSpaceDesktop", desktopApi);
contextBridge.exposeInMainWorld("bookMDDesktop", desktopApi);
