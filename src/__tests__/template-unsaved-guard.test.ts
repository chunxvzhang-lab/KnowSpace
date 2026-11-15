import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useUnsavedGuard } from "../hooks/useUnsavedGuard";
import { useUiStore } from "../store/useUiStore";
import { resetStores, restoreStores } from "./helpers/resetStores";

describe("creating from a template with unsaved edits", () => {
  beforeEach(resetStores);
  afterEach(restoreStores);
  function mount(success = true) {
    const create = vi.fn().mockResolvedValue(undefined);
    const save = vi.fn().mockResolvedValue({ success });
    const { result } = renderHook(() =>
      useUnsavedGuard({
        isDirty: true,
        saveSession: save,
        discardChanges: vi.fn(),
        setViewMode: vi.fn(),
        manifestRef: { current: null },
        tabsRef: { current: [] },
        doOpenMarkdownFile: vi.fn(),
        doOpenDesktopMarkdownPath: vi.fn(),
        doOpenMarkdownDirectory: vi.fn(),
        doCreateNewFile: create,
        doCreateNewMindmap: vi.fn(),
        doCreateNewCanvas: vi.fn(),
      }),
    );
    return { result, create, save };
  }

  const options = { defaultName: "会议纪要.md", initialContent: "# 会议纪要\n\n- [ ] 行动\n" };

  it("retains the selected template while saving the current document first", async () => {
    const { result, create, save } = mount();
    act(() => result.current.guardAction({ type: "new-file", options }));
    expect(useUiStore.getState().unsavedDialogOpen).toBe(true);
    expect(create).not.toHaveBeenCalled();
    await act(async () => result.current.handleDialogSave());
    expect(save).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledExactlyOnceWith(options);
  });

  it("does not create after a failed save or a cancelled guard", async () => {
    const { result, create } = mount(false);
    act(() => result.current.guardAction({ type: "new-file", options }));
    await act(async () => result.current.handleDialogSave());
    expect(useUiStore.getState().unsavedDialogOpen).toBe(true);
    expect(create).not.toHaveBeenCalled();
    act(() => result.current.handleDialogCancel());
    expect(useUiStore.getState().unsavedDialogOpen).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});
