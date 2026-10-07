import { useEffect, useRef, useState } from "react";

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

/**
 * The auto-save switch itself (R1 batch B11).
 *
 * This used to be a `useState` in App.tsx plus the effect that fed it. Moving
 * it next to the scheduler puts both halves of the contract - whether a write
 * is allowed, and when it happens - in one file, and it puts the effect under
 * `react-hooks/exhaustive-deps`: App.tsx is still on the legacy exemption list
 * in eslint.config.mjs, new modules are not. The array is empty on purpose and
 * still honest: the only value the effect closes over is `setEnabled`, a state
 * setter, and the bridge is read off `window` inside the effect.
 *
 * Both directions are wired, exactly as they were: the initial read (the app
 * may have been switched while the window was closed) and the live broadcast,
 * so the About-dialog toggle applies without a restart. Everything is
 * optional-chained because in the browser build and in tests there is no
 * bridge at all - the default stays ON, which is what the settings screen
 * shows as well.
 */
export function useAutoSaveEnabled(): boolean {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const desktop = window.bookMDDesktop;
    desktop?.system
      .getAppSettings?.()
      .then((settings) => {
        if (settings) setEnabled(settings.autoSaveEnabled);
      })
      .catch(() => {});
    const unsubscribe = desktop?.system.onAppSettingsUpdated?.((settings) => {
      setEnabled(settings.autoSaveEnabled);
    });
    return () => unsubscribe?.();
  }, []);

  return enabled;
}
