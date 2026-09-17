import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGlobalShortcuts } from "../hooks/useGlobalShortcuts";
import { resetStores, restoreStores } from "./helpers/resetStores";
import { installDesktopMock, removeDesktopMock, type DesktopMock } from "./helpers/desktopMock";

type Params = Parameters<typeof useGlobalShortcuts>[0];

function makeParams(overrides: Partial<Params> = {}): Params {
  return {
    initialHandledRef: { current: true },
    openDesktopMarkdownPathRef: { current: vi.fn() },
    createNewFileRef: { current: vi.fn() },
    openMarkdownDirectoryRef: { current: vi.fn() },
    saveSessionRef: { current: vi.fn() },
    saveSessionAsRef: { current: vi.fn() },
    toggleFullscreenRef: { current: vi.fn() },
    guardActionRef: { current: vi.fn() },
    toggleFullscreen: vi.fn(),
    handleCloseDualSplit: vi.fn(),
    handleCloseTab: vi.fn(),
    selectChapter: vi.fn(),
    saveSession: vi.fn(),
    saveSessionAs: vi.fn(),
    createNewFile: vi.fn(),
    openMarkdownDirectory: vi.fn(),
    handlePrintDocument: vi.fn(),
    handleToggleGraphPane: vi.fn(),
    goPrevious: vi.fn(),
    goNext: vi.fn(),
    addBookmark: vi.fn(),
    focusSearch: vi.fn(),
    setViewMode: vi.fn(),
    ...overrides,
  };
}

/**
 * Captures the callbacks the hook registers with the desktop bridge, so a test
 * can invoke them the way the shell would.
 */
function captureDesktopHandlers(desktop: DesktopMock) {
  const captured: Record<string, ((arg: never) => void) | undefined> = {};
  const unsubscribes: Record<string, ReturnType<typeof vi.fn>> = {};
  const bridge = desktop as unknown as Record<string, unknown>;

  for (const name of ["onOpenFilePath", "onMenuCommand", "onBeforeClose", "onFlashNoteSaved"]) {
    const unsubscribe = vi.fn();
    unsubscribes[name] = unsubscribe;
    bridge[name] = vi.fn((handler: (arg: never) => void) => {
      captured[name] = handler;
      return unsubscribe;
    });
  }
  return { captured, unsubscribes };
}

describe("useGlobalShortcuts - desktop wiring", () => {
  let desktop: DesktopMock;

  beforeEach(() => {
    resetStores();
    desktop = installDesktopMock();
    // Keep the launch-file path out of the way so these tests are about the
    // registrations rather than about opening a document at startup.
    (desktop as unknown as Record<string, unknown>).getInitialSyncData = () => undefined;
    (desktop as unknown as Record<string, unknown>).getLaunchFilePath = () =>
      Promise.resolve(undefined);
  });

  afterEach(() => {
    removeDesktopMock();
    restoreStores();
    vi.restoreAllMocks();
  });

  it("subscribes to every bridge and tears them all down", () => {
    const { unsubscribes } = captureDesktopHandlers(desktop);

    const view = renderHook(() => useGlobalShortcuts(makeParams()));
    view.unmount();

    // All four listens belong to this hook; a missed unsubscribe would leave the
    // shell holding a callback into a dead component.
    for (const name of ["onOpenFilePath", "onMenuCommand", "onBeforeClose", "onFlashNoteSaved"]) {
      expect(unsubscribes[name]).toHaveBeenCalledTimes(1);
    }
  });

  it("opens a path handed over by the shell", () => {
    const params = makeParams();
    const { captured } = captureDesktopHandlers(desktop);
    renderHook(() => useGlobalShortcuts(params));

    captured.onOpenFilePath?.("C:/vault/dropped.md" as never);

    expect(params.openDesktopMarkdownPathRef.current).toHaveBeenCalledWith(
      "C:/vault/dropped.md"
    );
  });

  it("routes a menu command to the matching ref", () => {
    const params = makeParams();
    const { captured } = captureDesktopHandlers(desktop);
    renderHook(() => useGlobalShortcuts(params));

    for (const [command, ref] of [
      ["new-file", params.createNewFileRef],
      ["open-directory", params.openMarkdownDirectoryRef],
      ["save", params.saveSessionRef],
      ["save-as", params.saveSessionAsRef],
      ["toggle-fullscreen", params.toggleFullscreenRef],
    ] as const) {
      captured.onMenuCommand?.(command as never);
      expect(ref.current).toHaveBeenCalledTimes(1);
    }
  });

  it("sends the close request through the unsaved-changes guard", () => {
    // Closing the window is not this hook's to allow: it asks App, which knows
    // whether there is anything unsaved.
    const params = makeParams();
    const { captured } = captureDesktopHandlers(desktop);
    renderHook(() => useGlobalShortcuts(params));

    captured.onBeforeClose?.({ requestId: 7 } as never);

    expect(params.guardActionRef.current).toHaveBeenCalledWith({
      type: "close-window",
      requestId: 7,
    });
  });

  it("does nothing without a desktop bridge", () => {
    removeDesktopMock();

    expect(() => renderHook(() => useGlobalShortcuts(makeParams()))).not.toThrow();
  });
});
