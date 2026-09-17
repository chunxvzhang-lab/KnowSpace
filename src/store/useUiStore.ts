import { create } from "zustand";
import type { LightboxMedia, SidebarTab } from "../core/types";
import { loadPreferences, type Preferences } from "../services/storage";

/**
 * UI chrome: layout, appearance, modal visibility and transient notices.
 *
 * This is the first slice of the App.tsx state migration (R1 in
 * docs/RELEASE_PLAN_v2.5.0.md) and was chosen to go first because it is the
 * only slice with no IPC calls, no async work and no DOM references — which
 * makes it safe to move before the riskier vault and tab domains.
 *
 * Deliberately *not* here:
 * - Reader/editor element refs (`readerRef`, `editorViewRef`). Zustand stores
 *   should not hold DOM nodes; they belong to the component that owns them.
 * - Search session state (`searchQuery`, `searchScope`). It is tightly coupled
 *   to the rendered document and moves with the vault domain instead.
 * - Anything that reads a file. That is the vault store's job.
 */

/** Sidebar width clamp, matching the resize handler's own bounds. */
export const DIRECTORY_WIDTH_MIN = 160;
export const DIRECTORY_WIDTH_MAX = 480;
export const SIDEBAR_WIDTH_MIN = 180;
export const SIDEBAR_WIDTH_MAX = 520;

export const DIRECTORY_WIDTH_DEFAULT = 240;
export const SIDEBAR_WIDTH_DEFAULT = 280;

/** How long a notice stays on screen before clearing itself. */
export const NOTICE_TIMEOUT_MS = 4500;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Reads a legacy layout width.
 *
 * Before this store existed, App.tsx persisted the two pane widths under
 * separate localStorage keys. Reading them here means a user's layout survives
 * the migration instead of snapping back to the defaults.
 */
function readLegacyWidth(key: string, fallback: number, min: number, max: number): number {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? fallback : clamp(parsed, min, max);
  } catch {
    return fallback;
  }
}

/** Keeps the reader's typewriter preference, which had its own key too. */
function readLegacyTypewriter(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem("bookmd.editor.typewriter") === "true";
  } catch {
    return false;
  }
}

type UiState = {
  // ── Layout ──────────────────────────────────────────────────────────────
  sidebarOpen: boolean;
  directoryOpen: boolean;
  sidebarTab: SidebarTab;
  directoryWidth: number;
  sidebarWidth: number;
  /** Which pane divider is being dragged, if any. */
  resizingType: "dir" | "sidebar" | null;
  isGraphPaneOpen: boolean;
  isFullscreen: boolean;

  // ── Appearance ──────────────────────────────────────────────────────────
  preferences: Preferences;
  typewriterMode: boolean;

  // ── Modals & overlays ───────────────────────────────────────────────────
  lightboxMedia: LightboxMedia | null;
  unsavedDialogOpen: boolean;
  aboutOpen: boolean;
  commandPaletteOpen: boolean;
  versionHistoryOpen: boolean;

  // ── Transient feedback ──────────────────────────────────────────────────
  notice: string | null;
};

type UiActions = {
  setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setDirectoryOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setSidebarTab: (tab: SidebarTab) => void;

  setDirectoryWidth: (width: number) => void;
  setSidebarWidth: (width: number) => void;
  setResizingType: (type: "dir" | "sidebar" | null) => void;

  setGraphPaneOpen: (open: boolean) => void;
  setFullscreen: (fullscreen: boolean) => void;

  setPreferences: (preferences: Preferences) => void;
  /** Applies a partial update — the shape components actually use. */
  patchPreferences: (patch: Partial<Preferences>) => void;
  /** Flips between light and dark, leaving eink/system untouched. */
  toggleTheme: () => void;
  setTypewriterMode: (enabled: boolean | ((prev: boolean) => boolean)) => void;
  toggleTypewriterMode: () => void;

  setLightboxMedia: (media: LightboxMedia | null) => void;
  setUnsavedDialogOpen: (open: boolean) => void;
  setAboutOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setVersionHistoryOpen: (open: boolean) => void;

  /** Shows a notice; it clears itself after {@link NOTICE_TIMEOUT_MS}. */
  notify: (message: string | null) => void;

  /** Closes every overlay — used by the Escape chain and on navigation. */
  closeAllOverlays: () => void;
};

export type UiStore = UiState & UiActions;

/** Module-level so overlapping notices cannot leave stale timers behind. */
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

export const useUiStore = create<UiStore>()((set, get) => ({
  // ── Initial state ───────────────────────────────────────────────────────
  sidebarOpen: true,
  directoryOpen: true,
  sidebarTab: "toc",
  directoryWidth: readLegacyWidth(
    "bookmd.layout.dirWidth",
    DIRECTORY_WIDTH_DEFAULT,
    DIRECTORY_WIDTH_MIN,
    DIRECTORY_WIDTH_MAX
  ),
  sidebarWidth: readLegacyWidth(
    "bookmd.layout.sidebarWidth",
    SIDEBAR_WIDTH_DEFAULT,
    SIDEBAR_WIDTH_MIN,
    SIDEBAR_WIDTH_MAX
  ),
  resizingType: null,
  isGraphPaneOpen: false,
  isFullscreen: false,

  preferences: loadPreferences(),
  typewriterMode: readLegacyTypewriter(),

  lightboxMedia: null,
  unsavedDialogOpen: false,
  aboutOpen: false,
  commandPaletteOpen: false,
  versionHistoryOpen: false,

  notice: null,

  // ── Actions ─────────────────────────────────────────────────────────────
  setSidebarOpen: (open) =>
    set((state) => ({
      sidebarOpen: typeof open === "function" ? open(state.sidebarOpen) : open,
    })),

  setDirectoryOpen: (open) =>
    set((state) => ({
      directoryOpen: typeof open === "function" ? open(state.directoryOpen) : open,
    })),

  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  setDirectoryWidth: (width) =>
    set({ directoryWidth: clamp(width, DIRECTORY_WIDTH_MIN, DIRECTORY_WIDTH_MAX) }),

  setSidebarWidth: (width) =>
    set({ sidebarWidth: clamp(width, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX) }),

  setResizingType: (type) => set({ resizingType: type }),

  setGraphPaneOpen: (open) => set({ isGraphPaneOpen: open }),
  setFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),

  setPreferences: (preferences) => set({ preferences }),

  patchPreferences: (patch) => set((state) => ({ preferences: { ...state.preferences, ...patch } })),

  toggleTheme: () =>
    set((state) => ({
      preferences: {
        ...state.preferences,
        theme: state.preferences.theme === "light" ? "twitter" : "light",
      },
    })),

  setTypewriterMode: (enabled) =>
    set((state) => ({
      typewriterMode:
        typeof enabled === "function" ? enabled(state.typewriterMode) : enabled,
    })),

  toggleTypewriterMode: () => set((state) => ({ typewriterMode: !state.typewriterMode })),

  setLightboxMedia: (media) => set({ lightboxMedia: media }),
  setUnsavedDialogOpen: (open) => set({ unsavedDialogOpen: open }),
  setAboutOpen: (open) => set({ aboutOpen: open }),

  setCommandPaletteOpen: (open) =>
    set((state) => ({
      commandPaletteOpen:
        typeof open === "function" ? open(state.commandPaletteOpen) : open,
    })),

  setVersionHistoryOpen: (open) => set({ versionHistoryOpen: open }),

  notify: (message) => {
    if (noticeTimer) {
      clearTimeout(noticeTimer);
      noticeTimer = null;
    }
    set({ notice: message });
    if (message) {
      noticeTimer = setTimeout(() => {
        noticeTimer = null;
        // Guard against a newer notice having replaced this one.
        if (get().notice === message) set({ notice: null });
      }, NOTICE_TIMEOUT_MS);
    }
  },

  closeAllOverlays: () =>
    set({
      lightboxMedia: null,
      unsavedDialogOpen: false,
      aboutOpen: false,
      commandPaletteOpen: false,
      versionHistoryOpen: false,
    }),
}));
