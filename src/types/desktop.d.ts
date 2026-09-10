import type { BookManifest, ChapterManifest, ChapterSource, DiskVersion } from "../core/types";

export type DirectoryOpenResult =
  | { canceled: true }
  | {
      canceled: false;
      directory: BookManifest & {
        rootPath: string;
      };
    };

export type SaveMarkdownRequest = {
  absolutePath: string;
  content: string;
  expectedVersion?: DiskVersion | null;
  force?: boolean;
  hasBom?: boolean;
  lineEnding?: string;
};

export type SaveMarkdownResult =
  | {
      success: true;
      absolutePath: string;
      baseUrl: string;
      diskVersion: DiskVersion;
      cacheKey: string;
    }
  | {
      success: false;
      errorCode: "INVALID_PATH" | "INVALID_EXTENSION" | "FILE_CONFLICT" | "ACCESS_DENIED" | "WRITE_FAILED" | string;
      message: string;
      diskVersion?: DiskVersion;
    };

export type CreateMarkdownOptions = {
  rootPath?: string;
  defaultName?: string;
  initialContent?: string;
};

export type CreateMarkdownResult =
  | { canceled: true }
  | {
      canceled: false;
      success: true;
      absolutePath: string;
      source: ChapterSource;
      chapter: ChapterManifest;
    }
  | {
      canceled: false;
      success: false;
      errorCode: string;
      message: string;
    };

export type SaveMarkdownAsRequest = {
  currentPath?: string;
  content?: string;
};

export type SaveMarkdownAsResult =
  | { canceled: true }
  | {
      canceled: false;
      success: true;
      absolutePath: string;
      baseUrl: string;
      diskVersion: DiskVersion;
      cacheKey: string;
    }
  | {
      canceled: false;
      success: false;
      errorCode: string;
      message: string;
    };

export type BeforeCloseData = {
  requestId: number;
};

export type KnowSpaceDesktopAPI = {
  getInitialSyncData?: () => { filePath: string; source: ChapterSource | null } | null;
  getLaunchFilePath: () => Promise<string | null>;
  setNativeTheme: (theme: string) => Promise<void>;
  openDirectory: () => Promise<DirectoryOpenResult>;
  refreshDirectory: (rootPath: string) => Promise<BookManifest & { rootPath: string }>;
  readMarkdownFile: (absolutePath: string) => Promise<ChapterSource>;
  getDirectoryForFile: (absolutePath: string) => Promise<{
    directory: BookManifest & { rootPath: string };
    activeChapterId: string | null;
  }>;
  saveMarkdownFile: (request: SaveMarkdownRequest) => Promise<SaveMarkdownResult>;
  createMarkdownFile: (options?: CreateMarkdownOptions) => Promise<CreateMarkdownResult>;
  renameMarkdownFile?: (params: { oldPath: string; newTitle: string }) => Promise<{
    success: boolean;
    newPath?: string;
    newTitle?: string;
    fileName?: string;
    error?: string;
  }>;
  saveMarkdownFileAs: (request?: SaveMarkdownAsRequest) => Promise<SaveMarkdownAsResult>;
  setDocumentState: (state: { activePath: string | null; isDirty: boolean }) => Promise<void>;
  resolveBeforeClose: (result: { requestId: number; action: "proceed" | "cancel" }) => Promise<void>;
  openExternal?: (url: string) => Promise<boolean>;
  toggleFullScreen?: () => Promise<boolean>;
  isFullScreen?: () => Promise<boolean>;
  exportSvgAsPng?: (params: {
    svgHtml: string;
    width?: number;
    height?: number;
    theme?: string;
    filename?: string;
  }) => Promise<{ success?: boolean; canceled?: boolean; filePath?: string; message?: string }>;
  savePngData?: (params: {
    dataUrl: string;
    filename?: string;
  }) => Promise<{ success?: boolean; canceled?: boolean; filePath?: string; message?: string }>;
  /**
   * Saves raw PNG bytes. Preferred over `savePngData` because it avoids
   * base64-encoding a multi-megabyte image before sending it over IPC.
   */
  savePngBuffer?: (params: {
    buffer: ArrayBuffer | Uint8Array;
    filename?: string;
  }) => Promise<{ success?: boolean; canceled?: boolean; filePath?: string; message?: string }>;
  /**
   * Reads a local image back as a data URL. Used when exporting the canvas:
   * the rasteriser refuses to run on a canvas that referenced a file:// image,
   * and fetch/XHR cannot reach those paths reliably.
   */
  readFileAsDataUrl?: (params: {
    filePath: string;
  }) => Promise<{ success?: boolean; dataUrl?: string; message?: string }>;
  openInNewWindow?: (absolutePath: string) => Promise<boolean>;
  printToPdf?: (params?: {
    title?: string;
    landscape?: boolean;
    pageSize?: string;
  }) => Promise<{ success?: boolean; canceled?: boolean; filePath?: string; message?: string }>;
  printDocument?: () => Promise<{ success?: boolean; message?: string }>;

  // Version Snapshots & Time Travel
  listSnapshots?: (params: { filePath: string; rootPath?: string }) => Promise<SnapshotItem[]>;
  readSnapshot?: (params: { filePath: string; rootPath?: string; snapshotId: string }) => Promise<SnapshotDetail | null>;
  revertSnapshot?: (params: { filePath: string; rootPath?: string; snapshotId: string }) => Promise<SaveMarkdownResult>;
  createManualSnapshot?: (params: { filePath: string; rootPath?: string; content: string }) => Promise<{ success: boolean; snapshotId?: string; error?: string }>;

  openFlashCapsule?: () => Promise<boolean>;
  hideFlashCapsule?: () => Promise<boolean>;
  getFlashShortcut?: () => Promise<string>;
  setFlashShortcut?: (shortcut: string) => Promise<{ success: boolean; shortcut?: string; error?: string }>;
  getFlashTargetPath?: () => Promise<{
    workspaceDir: string | null;
    spaceDir?: string;
    defaultDir?: string;
    isCustom?: boolean;
    targetFile: string;
    minuteFileName?: string;
    relativeDisplay: string;
  }>;
  saveFlashNote?: (payload: { content: string; tags?: string[]; isTodo?: boolean }) => Promise<{
    success: boolean;
    filePath?: string;
    fileName?: string;
    dateStr?: string;
    spaceDir?: string;
    error?: string;
  }>;
  getFlashPin?: () => Promise<{ pinned: boolean }>;
  setFlashPin?: (pinned: boolean) => Promise<{ success: boolean; pinned: boolean }>;
  getFlashSpaceConfig?: () => Promise<{ currentDir: string; isCustom: boolean; defaultDir: string }>;
  selectFlashSpaceDir?: () => Promise<{ success: boolean; canceled?: boolean; newDir?: string; error?: string }>;
  resetFlashSpaceDir?: () => Promise<{ success: boolean; defaultDir: string }>;
  getPersistentNote?: () => Promise<{ text: string }>;
  savePersistentNote?: (text: string) => Promise<{ success: boolean }>;
  setFlashSize?: (size: { width: number; height: number }) => Promise<{ success: boolean; width?: number; height?: number }>;
  resetFlashSize?: () => Promise<{ success: boolean; width?: number; height?: number }>;
  getFlashNotesSummary?: () => Promise<FlashNotesSummaryResult>;
  toggleFlashTodo?: (params: { filePath: string; lineIndex: number; completed: boolean }) => Promise<{ success: boolean; completed?: boolean; error?: string }>;
  deleteFlashNote?: (params: { filePath: string }) => Promise<{ success: boolean; error?: string }>;
  savePastedImage?: (params: {
    currentFilePath?: string;
    bufferBase64: string;
    originalName?: string;
    ext?: string;
  }) => Promise<SavePastedImageResult>;
  getAppSettings?: () => Promise<{ autoLaunch: boolean; runInBackground: boolean; flashShortcut: string }>;
  setAppSettings?: (settings: { autoLaunch?: boolean; runInBackground?: boolean }) => Promise<{ success: boolean; settings?: { autoLaunch: boolean; runInBackground: boolean; flashShortcut: string } }>;
  onOpenFilePath: (callback: (absolutePath: string) => void) => () => void;
  onMenuCommand: (callback: (command: string) => void) => () => void;
  onBeforeClose: (callback: (data: BeforeCloseData) => void) => () => void;
  onFullScreenChanged?: (callback: (isFullscreen: boolean) => void) => () => void;
  onFlashFocus?: (callback: () => void) => () => void;
  onFlashShortcutUpdated?: (callback: (shortcut: string) => void) => () => void;
  onFlashNoteSaved?: (callback: (data: { filePath: string; dateStr: string; fileName?: string }) => void) => () => void;
  onAppSettingsUpdated?: (callback: (data: { autoLaunch: boolean; runInBackground: boolean; flashShortcut: string }) => void) => () => void;
  onThemeUpdated?: (callback: (theme: string) => void) => () => void;
};

export type FlashNoteTodo = {
  id: string;
  lineIndex: number;
  text: string;
  completed: boolean;
};

export type FlashNoteSummaryItem = {
  filePath: string;
  fileName: string;
  dateStr: string;
  timeDisplay: string;
  modifiedTime: number;
  size: number;
  content: string;
  todos: FlashNoteTodo[];
  tags: string[];
};

export type FlashNotesSummaryResult = {
  success: boolean;
  spaceDir: string;
  notes: FlashNoteSummaryItem[];
  totalTodos: number;
  completedTodos: number;
  error?: string;
};

export type SavePastedImageResult = {
  success: boolean;
  fileName?: string;
  relativePath?: string;
  absolutePath?: string;
  error?: string;
};

export type SnapshotItem = {
  id: string;
  timestamp: string;
  filePath: string;
  hash: string;
  charCount: number;
  lineCount: number;
  diffAdded: number;
  diffRemoved: number;
  charDelta: number;
  reason: string;
};

export type SnapshotDetail = {
  id: string;
  timestamp: string;
  filePath: string;
  content: string;
  hash: string;
  charCount: number;
  reason: string;
};

declare global {
  interface Window {
    knowSpaceDesktop?: KnowSpaceDesktopAPI;
    bookMDDesktop?: KnowSpaceDesktopAPI;
  }
}

export {};
