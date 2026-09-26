import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, fireEvent, type RenderHookResult } from "@testing-library/react";
import { useGlobalShortcuts } from "../hooks/useGlobalShortcuts";
import { commandBus } from "../services/commandBus";
import { useUiStore } from "../store/useUiStore";
import { useTabStore } from "../store/useTabStore";
import { resetStores, restoreStores } from "./helpers/resetStores";
import { installDesktopMock, removeDesktopMock, type DesktopMock } from "./helpers/desktopMock";

type Params = Parameters<typeof useGlobalShortcuts>[0];
type View = RenderHookResult<unknown, Params>;

function makeParams(overrides: Partial<Params> = {}): Params {
  return {
    initialHandledRef: { current: true },
    openDesktopMarkdownPathRef: { current: vi.fn() },
    guardActionRef: { current: vi.fn() },
    handleCloseDualSplit: vi.fn(),
    handleCloseTab: vi.fn(),
    selectChapter: vi.fn(),
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
  let view: View | null = null;

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
    // The keydown listener lives on `window`, which outlives a test: an
    // un-unmounted render would fire this hook's handler in the NEXT test
    // (and since handlers execute loudly through the bus, it would throw
    // there). Unmounting is part of the test's cleanup now.
    view?.unmount();
    view = null;
    removeDesktopMock();
    restoreStores();
    vi.restoreAllMocks();
  });

  it("subscribes to every bridge and tears them all down", () => {
    const { unsubscribes } = captureDesktopHandlers(desktop);

    view = renderHook(() => useGlobalShortcuts(makeParams()));
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
    view = renderHook(() => useGlobalShortcuts(params));

    captured.onOpenFilePath?.("C:/vault/dropped.md" as never);

    expect(params.openDesktopMarkdownPathRef.current).toHaveBeenCalledWith("C:/vault/dropped.md");
  });

  it("routes a menu command to the command bus", () => {
    const { captured } = captureDesktopHandlers(desktop);
    view = renderHook(() => useGlobalShortcuts(makeParams()));
    // Replace, don't pass through: the bus has no handlers here and its
    // loud "no handler" throw is production behaviour, not this test's subject.
    const execute = vi.spyOn(commandBus, "execute").mockImplementation(() => {});

    // The menu speaks Electron ids (main.cjs); the hook maps them onto the
    // command registry so the handlers stay bound in exactly one place.
    captured.onMenuCommand?.("new-file" as never);
    captured.onMenuCommand?.("open-directory" as never);
    captured.onMenuCommand?.("save" as never);
    captured.onMenuCommand?.("save-as" as never);
    captured.onMenuCommand?.("toggle-fullscreen" as never);
    captured.onMenuCommand?.("togglefullscreen" as never);
    captured.onMenuCommand?.("something-unknown" as never);

    expect(execute).toHaveBeenCalledTimes(6);
    expect(execute).toHaveBeenNthCalledWith(1, "document.newFile");
    expect(execute).toHaveBeenNthCalledWith(2, "document.openDirectory");
    expect(execute).toHaveBeenNthCalledWith(3, "document.save");
    expect(execute).toHaveBeenNthCalledWith(4, "document.saveAs");
    expect(execute).toHaveBeenNthCalledWith(5, "ui.toggleFullscreen");
    expect(execute).toHaveBeenNthCalledWith(6, "ui.toggleFullscreen");
  });

  it("sends the close request through the unsaved-changes guard", () => {
    // Closing the window is not this hook's to allow: it asks App, which knows
    // whether there is anything unsaved.
    const params = makeParams();
    const { captured } = captureDesktopHandlers(desktop);
    view = renderHook(() => useGlobalShortcuts(params));

    captured.onBeforeClose?.({ requestId: 7 } as never);

    expect(params.guardActionRef.current).toHaveBeenCalledWith({
      type: "close-window",
      requestId: 7,
    });
  });

  it("does nothing without a desktop bridge", () => {
    removeDesktopMock();

    expect(() => {
      view = renderHook(() => useGlobalShortcuts(makeParams()));
    }).not.toThrow();
  });
});

describe("useGlobalShortcuts - keyboard bindings", () => {
  let view: View | null = null;

  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    view?.unmount();
    view = null;
    commandBus.reset();
    restoreStores();
    vi.restoreAllMocks();
  });

  function renderAndSpy() {
    view = renderHook(() => useGlobalShortcuts(makeParams()));
    return vi.spyOn(commandBus, "execute").mockImplementation(() => {});
  }

  const press = (options: KeyboardEventInit) => fireEvent.keyDown(window, options);

  it("saves with Ctrl+S and save-as with Ctrl+Shift+S", () => {
    const execute = renderAndSpy();
    press({ key: "s", ctrlKey: true });
    press({ key: "S", ctrlKey: true, shiftKey: true });
    expect(execute).toHaveBeenNthCalledWith(1, "document.save");
    expect(execute).toHaveBeenNthCalledWith(2, "document.saveAs");
  });

  it("toggles the palette with Ctrl+K through the store, not the bus", () => {
    const execute = renderAndSpy();
    expect(useUiStore.getState().commandPaletteOpen).toBe(false);
    press({ key: "k", ctrlKey: true });
    expect(useUiStore.getState().commandPaletteOpen).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("closes the active tab with Ctrl+W", () => {
    const handleCloseTab = vi.fn();
    useTabStore.setState({
      tabs: [{ id: "t1", title: "doc.md", relativePath: "doc.md" }],
      activeTabId: "t1",
    });
    view = renderHook(() => useGlobalShortcuts(makeParams({ handleCloseTab })));
    press({ key: "w", ctrlKey: true });
    expect(handleCloseTab).toHaveBeenCalledWith("t1");
  });

  it("routes Alt+T to the typewriter command (one implementation, two entries)", () => {
    const execute = renderAndSpy();
    press({ key: "t", altKey: true });
    expect(execute).toHaveBeenCalledWith("view.toggleTypewriter");
  });

  it("does not fire reader-only bindings while editing", () => {
    const execute = renderAndSpy();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    // Dispatch on the focused element, like a real keypress: the event target
    // is what the isEditing guard reads, not the window the listener sits on.
    fireEvent.keyDown(input, { key: "b", ctrlKey: true, bubbles: true });
    expect(execute).not.toHaveBeenCalled();
    input.remove();
  });
});
