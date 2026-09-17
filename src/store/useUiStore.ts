import { create } from "zustand";
import type { LightboxMedia, SidebarTab } from "../core/types";
import { loadPreferences, savePreferences, type Preferences } from "../services/storage";

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
export const SIDEBAR_WIDTH_DEFAULT = 260;

/** How long a notice stays on screen before clearing itself. */
export const NOTICE_TIMEOUT_MS = 4500;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * localStorage keys for everything this store persists.
 *
 * These are the very keys App.tsx used before the migration, so an existing
 * layout and reader preference carry over instead of snapping back to defaults.
 */
const DIR_WIDTH_KEY = "bookmd.layout.dirWidth";
const SIDEBAR_WIDTH_KEY = "bookmd.layout.sidebarWidth";
const TYPEWRITER_KEY = "bookmd.editor.typewriter";

/**
 * Reads a persisted layout width.
 *
 * An out-of-range value falls back to the default rather than being clamped: a
 * stored 900 was written by something else, and silently resizing the pane to
 * its maximum is a stranger outcome than ignoring it. This matches what the
 * useState initialisers in App.tsx did.
 *
 * Exported because the store consumes it at module load — a moment a test
 * cannot re-create, so this is the only way to cover the fallback rules.
 */
export function readStoredWidth(key: string, fallback: number, min: number, max: number): number {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = Number.parseFloat(raw);
    if (Number.isNaN(parsed) || parsed < min || parsed > max) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

/** Keeps the reader's typewriter preference, which had its own key too. */
function readLegacyTypewriter(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(TYPEWRITER_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Writes a value, tolerating a full or unavailable store.
 *
 * The in-memory value stays authoritative for the session, so a failed write
 * costs the user nothing until the next launch.
 */
function writeString(key: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

/**
 * Preferences round-trip through JSON, and `savePreferences` has no guard of
 * its own — a quota error there would otherwise escape into a click handler.
 */
function persistPreferences(preferences: Preferences): void {
  try {
    savePreferences(preferences);
  } catch {
    // ignore
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
  /**
   * The flashcard review is on screen.
   *
   * Set while the Space panel is showing its review tab. The workspace reacts by
   * collapsing the reader and the document tree, because the review needs the
   * width and the two surfaces used to fight over it.
   */
  isReviewFocus: boolean;
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
  /**
   * Writes both pane widths to storage.
   *
   * Deliberately not folded into the width setters: dragging a divider calls
   * them on every mousemove, and a synchronous localStorage write sixty times a
   * second would make the drag stutter. The resize handler calls this once when
   * the gesture ends, which is what App.tsx did before the migration.
   */
  persistLayout: () => void;

  setGraphPaneOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setFullscreen: (fullscreen: boolean) => void;
  /** Turns the wide review layout on and off. */
  setReviewFocus: (active: boolean) => void;

  /**
   * Accepts an updater as well as a value — several call sites already derived
   * the next preferences from the previous ones, so keeping that shape meant
   * those lines needed no change.
   */
  setPreferences: (preferences: Preferences | ((prev: Preferences) => Preferences)) => void;
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

  /**
   * Sets the notice without scheduling anything.
   *
   * App.tsx owns the auto-clear today through an effect keyed on the notice, so
   * this is the setter it needed to migrate to. Switching it over to `notify`
   * and dropping that effect is a follow-up, not part of this move.
   */
  setNotice: (message: string | null) => void;
  /** Shows a notice and clears it after {@link NOTICE_TIMEOUT_MS} itself. */
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
  directoryWidth: readStoredWidth(
    DIR_WIDTH_KEY,
    DIRECTORY_WIDTH_DEFAULT,
    DIRECTORY_WIDTH_MIN,
    DIRECTORY_WIDTH_MAX
  ),
  sidebarWidth: readStoredWidth(
    SIDEBAR_WIDTH_KEY,
    SIDEBAR_WIDTH_DEFAULT,
    SIDEBAR_WIDTH_MIN,
    SIDEBAR_WIDTH_MAX
  ),
  resizingType: null,
  isGraphPaneOpen: false,
  isReviewFocus: false,
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

  persistLayout: () => {
    const { directoryWidth, sidebarWidth } = get();
    writeString(DIR_WIDTH_KEY, String(directoryWidth));
    writeString(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  },

  setGraphPaneOpen: (open) =>
    set((state) => ({
      isGraphPaneOpen: typeof open === "function" ? open(state.isGraphPaneOpen) : open,
    })),
  setFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),

  setReviewFocus: (active) => set({ isReviewFocus: active }),

  // The preferences actions read through get() and set() rather than computing
  // inside the updater, so the storage write stays outside it. An updater with
  // side effects is legal but surprising, and it would also make the write run
  // twice when a caller passes one that saves on its own.
  setPreferences: (preferences) => {
    const next =
      typeof preferences === "function" ? preferences(get().preferences) : preferences;
    persistPreferences(next);
    set({ preferences: next });
  },

  patchPreferences: (patch) => {
    const next = { ...get().preferences, ...patch };
    persistPreferences(next);
    set({ preferences: next });
  },

  toggleTheme: () => {
    const current = get().preferences;
    const next: Preferences = {
      ...current,
      theme: current.theme === "light" ? "twitter" : "light",
    };
    persistPreferences(next);
    set({ preferences: next });
  },

  setTypewriterMode: (enabled) => {
    const current = get().typewriterMode;
    const next = typeof enabled === "function" ? enabled(current) : enabled;
    writeString(TYPEWRITER_KEY, String(next));
    set({ typewriterMode: next });
  },

  toggleTypewriterMode: () => {
    const next = !get().typewriterMode;
    writeString(TYPEWRITER_KEY, String(next));
    set({ typewriterMode: next });
  },

  setLightboxMedia: (media) => set({ lightboxMedia: media }),
  setUnsavedDialogOpen: (open) => set({ unsavedDialogOpen: open }),
  setAboutOpen: (open) => set({ aboutOpen: open }),

  setCommandPaletteOpen: (open) =>
    set((state) => ({
      commandPaletteOpen:
        typeof open === "function" ? open(state.commandPaletteOpen) : open,
    })),

  setVersionHistoryOpen: (open) => set({ versionHistoryOpen: open }),

  setNotice: (message) => set({ notice: message }),

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
