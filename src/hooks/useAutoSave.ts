import { useEffect, useRef } from "react";

/**
 * Auto-save (plan 2-7): after the last keystroke, park for
 * AUTOSAVE_DEBOUNCE_MS and then run the SAME saveSession a Ctrl+S runs —
 * same optimistic diskVersion gate, same atomic write, same snapshot
 * recording. There is no separate autosave path to drift.
 *
 * Scheduling contract, pinned by use-auto-save.test.tsx:
 *  - typing RESETS the timer: while the reader keeps typing nothing writes,
 *    and one write happens AUTOSAVE_DEBOUNCE_MS after they stop (aggregated,
 *    not per-keystroke);
 *  - an in-flight save never overlaps another (isSaving re-arms the timer
 *    rather than queueing a second dispatch);
 *  - a FILE_CONFLICT pauses auto-save entirely — silent automatic writes
 *    must not race a conflict the user is being asked to resolve; it
 *    resumes on the next revision change after the conflict clears;
 *  - failure (disk full, permission) does NOT retry on its own: with the
 *    revision unchanged the effect does not re-run, so a broken disk
 *    produces one attempt per edit, not a 1.5s retry storm;
 *  - the save callback is read through a ref: it changes identity on every
 *    session update, and scheduling must not reset because of that.
 */
export const AUTOSAVE_DEBOUNCE_MS = 1500;

type AutoSaveParams = {
  /** Master switch (app settings, default on). */
  enabled: boolean;
  isDirty: boolean;
  isSaving: boolean;
  /** A FILE_CONFLICT dialog is up — hold all automatic writes. */
  conflictActive: boolean;
  /** Bumps on every edit; the debounce timer re-arms with it. */
  sourceRevision: number;
  absolutePath: string | null;
  save: () => Promise<unknown>;
};

export function useAutoSave(params: AutoSaveParams): void {
  const latest = useRef(params);
  latest.current = params;

  const { enabled, isDirty, isSaving, conflictActive, sourceRevision, absolutePath } = params;

  useEffect(() => {
    if (!enabled || !isDirty || isSaving || conflictActive || !absolutePath) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void latest.current.save();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, isDirty, isSaving, conflictActive, sourceRevision, absolutePath]);
}
