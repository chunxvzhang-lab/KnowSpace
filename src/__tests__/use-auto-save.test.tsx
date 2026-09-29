/**
 * Auto-save scheduling (2-7): the hook must aggregate typing into ONE write
 * AUTOSAVE_DEBOUNCE_MS after the last keystroke, never overlap an in-flight
 * save, hold while a FILE_CONFLICT dialog is up, and stay off when disabled.
 * The negative halves are the point: retry storms after failures and
 * save-identity churn resetting the timer are the two ways this hook could
 * turn into a disk hammer, so both are pinned.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { MutableRefObject } from "react";
import { useAutoSave, AUTOSAVE_DEBOUNCE_MS } from "../hooks/useAutoSave";

type Params = {
  enabled: boolean;
  isDirty: boolean;
  isSaving: boolean;
  conflictActive: boolean;
  sourceRevision: number;
  absolutePath: string | null;
  save: () => Promise<unknown>;
};

function harness(initial: Params) {
  const paramsRef: MutableRefObject<Params> = { current: initial };
  const { rerender } = renderHook(() => useAutoSave(paramsRef.current));
  return {
    set(next: Partial<Params>) {
      paramsRef.current = { ...paramsRef.current, ...next };
      rerender();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const base: Params = {
  enabled: true,
  isDirty: true,
  isSaving: false,
  conflictActive: false,
  sourceRevision: 1,
  absolutePath: "C:\\notes\\a.md",
  save: () => Promise.resolve(),
};

describe("useAutoSave", () => {
  it("saves once, AUTOSAVE_DEBOUNCE_MS after the revision settles", async () => {
    const save = vi.fn(() => Promise.resolve());
    harness({ ...base, save });
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 1);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("aggregates continuous typing into a single write (timer resets)", async () => {
    const save = vi.fn(() => Promise.resolve());
    const { set } = harness({ ...base, save });
    for (let rev = 2; rev <= 10; rev += 1) {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 100);
      set({ sourceRevision: rev });
    }
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does not overlap an in-flight save; re-arms after it settles", async () => {
    const save = vi.fn(() => Promise.resolve());
    const { set } = harness({ ...base, save });
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);

    // While the write is in flight the timer must not fire again even if the
    // revision bumps (the save itself updates session state).
    set({ isSaving: true, sourceRevision: 2 });
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 5);
    expect(save).toHaveBeenCalledTimes(1);

    set({ isSaving: false });
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("holds entirely while a conflict dialog is up, resumes after", async () => {
    const save = vi.fn(() => Promise.resolve());
    const { set } = harness({ ...base, save });
    set({ conflictActive: true, sourceRevision: 2 });
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 10);
    expect(save).not.toHaveBeenCalled();

    set({ conflictActive: false, sourceRevision: 3 });
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("never fires when disabled (negative pair)", async () => {
    const save = vi.fn(() => Promise.resolve());
    const { set } = harness({ ...base, enabled: false, save });
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 10);
    expect(save).not.toHaveBeenCalled();

    set({ enabled: true });
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does not retry after a failed save until the revision changes", async () => {
    const save = vi.fn(() => Promise.reject(new Error("disk full")));
    const { set } = harness({ ...base, save });
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await vi.runOnlyPendingTimersAsync(); // let the rejection settle
    expect(save).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 20);
    expect(save).toHaveBeenCalledTimes(1); // no storm while nothing changed

    set({ sourceRevision: 2 });
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(2);
  });
});
