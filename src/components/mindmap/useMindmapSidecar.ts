import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptySidecar,
  loadSidecar,
  mergeSidecar,
  saveSidecar,
  type MindmapSidecar,
  type SidecarSection,
} from "../../services/mindmapSidecar";

/**
 * How long a note waits before it is written.
 *
 * Writing on every keystroke would mean a disk write per character. Long enough
 * to cover a burst of typing, short enough that a reader who types and then
 * moves on never notices the pause.
 */
const NOTE_SAVE_DELAY = 600;

type UseMindmapSidecarParams = {
  /**
   * Identifies the document whose companion file is shown and written.
   *
   * A path, from the caller that has one. Omitted means the companion is not
   * persisted for this mind map, which is the right behaviour for a preview
   * with no file behind it.
   */
  documentKey?: string;
};

/**
 * The document's companion file: the sidecar state, when it is read, and the
 * one path every annotation edit goes through.
 *
 * The contract here is the late-load merge. `editedSectionsRef` records the
 * sections the reader has touched since the document was opened, and when the
 * read lands after an edit, `mergeSidecar` lets the reader's edits win for the
 * sections they touched and the file win for the rest — so a slow read cannot
 * undo whatever was clicked while it was in flight, and the save that follows
 * cannot write that undo out. The save itself is debounced
 * (`scheduleSidecarSave`), and a pause still running when the view goes away is
 * flushed rather than dropped.
 *
 * Extracted from MindmapView (batch 3, wave 2b of the decomposition). A verbatim
 * move: the debounce timing, the touched-sections bookkeeping and the flush on
 * unmount are the contract, not implementation detail.
 *
 * Ordering: the view must call this hook before `useMindmapAppearance`. The
 * load effect below has always run ahead of the appearance hook's load effects;
 * the states are disjoint so nothing observable depends on it today, but the
 * order is kept rather than re-derived. The load effect reads only
 * `documentKey` — it never touches the tree — so no tree is threaded in.
 * `setSidecar` is deliberately not returned: nothing outside the merge contract
 * writes the sidecar directly, and keeping the write private is what makes the
 * touched-sections bookkeeping trustworthy. `applySidecarEdit` is the single
 * writer every annotation handler goes through.
 */
export function useMindmapSidecar({ documentKey }: UseMindmapSidecarParams) {
  /**
   * The document's companion file: what the map knows that the document does not.
   *
   * Held as the reader's text rather than as what is on disk — the two differ by
   * up to one pause in typing, since a write per keystroke would be a write per
   * character. `null` means no companion was found, which is the ordinary state
   * of a document nobody has annotated.
   */
  const [sidecar, setSidecar] = useState<MindmapSidecar | null>(null);
  const [sidecarSaveFailed, setSidecarSaveFailed] = useState(false);

  /**
   * The sections the reader has edited since this document was opened.
   *
   * Kept so a load that lands late can be merged rather than applied outright:
   * the reader's edits win for the sections they touched and the file wins for
   * the rest. Without it, a slow read silently undoes whatever was clicked while
   * it was in flight — and, worse, the save that follows writes that undo out.
   */
  const editedSectionsRef = useRef<Set<SidecarSection>>(new Set());

  useEffect(() => {
    let cancelled = false;
    editedSectionsRef.current = new Set();
    setSidecar(null);
    setSidecarSaveFailed(false);
    if (!documentKey) return;

    void loadSidecar(documentKey).then((loaded) => {
      if (cancelled) return;
      // Nothing has been touched: the file is simply what is on screen.
      if (editedSectionsRef.current.size === 0) {
        setSidecar(loaded);
        return;
      }
      setSidecar((current) => mergeSidecar(loaded, current, editedSectionsRef.current));
    });
    return () => {
      cancelled = true;
    };
  }, [documentKey]);

  const pendingSidecarSave = useRef<{ key: string; sidecar: MindmapSidecar } | null>(null);
  const sidecarSaveTimer = useRef<number | null>(null);

  /**
   * Writes notes to the companion file, a pause after typing stops.
   *
   * The document key and the contents are captured when the pause starts rather
   * than read when it ends: switching documents mid-pause would otherwise write
   * the previous document's notes into the new document's file, which is the one
   * way this could lose writing rather than merely delay it.
   */
  const scheduleSidecarSave = useCallback((key: string, next: MindmapSidecar) => {
    pendingSidecarSave.current = { key, sidecar: next };
    if (sidecarSaveTimer.current !== null) window.clearTimeout(sidecarSaveTimer.current);
    sidecarSaveTimer.current = window.setTimeout(() => {
      sidecarSaveTimer.current = null;
      const pending = pendingSidecarSave.current;
      pendingSidecarSave.current = null;
      if (!pending) return;
      void saveSidecar(pending.key, pending.sidecar).then((ok) => setSidecarSaveFailed(!ok));
    }, NOTE_SAVE_DELAY);
  }, []);

  useEffect(
    () => () => {
      // A pause still running when the view goes away is written out now, so
      // closing the map right after typing does not lose what was typed.
      if (sidecarSaveTimer.current !== null) window.clearTimeout(sidecarSaveTimer.current);
      const pending = pendingSidecarSave.current;
      pendingSidecarSave.current = null;
      if (pending) void saveSidecar(pending.key, pending.sidecar);
    },
    [],
  );

  /**
   * An annotation edit: immediate in memory, written shortly afterwards.
   *
   * One path for every kind of annotation rather than one per kind, so there is
   * a single pause to reason about and a single place where the document a write
   * belongs to is decided.
   */
  const applySidecarEdit = useCallback(
    (sections: SidecarSection[], edit: (current: MindmapSidecar) => MindmapSidecar) => {
      editedSectionsRef.current = new Set([...editedSectionsRef.current, ...sections]);
      const next = edit(sidecar ?? emptySidecar());
      setSidecar(next);
      if (documentKey) scheduleSidecarSave(documentKey, next);
    },
    [documentKey, scheduleSidecarSave, sidecar],
  );

  return {
    sidecar,
    applySidecarEdit,
    sidecarSaveFailed,
  };
}
