import { useEffect, type RefObject } from "react";
import type { BookManifest } from "../core/types";
import { useUiStore } from "../store/useUiStore";
import { useVaultStore } from "../store/useVaultStore";

/**
 * The renderer-side half of the preferences → main-process bridge.
 *
 * Two effects that share one shape — a preference the main process cannot read
 * from storage, pushed to it whenever it changes:
 *
 * 1. the native window frame's theme (the OS title bar does not follow the
 *    document's `data-theme` on its own);
 * 2. the hidden-files scan preference, plus the re-listing that makes it
 *    immediately visible — the directory is walked in the main process, so the
 *    setting must be pushed, and the tree already on screen was built under
 *    the old one.
 *
 * Extracted from App.tsx in the final trim wave. Verbatim moves, including the
 * doc-strings' reasoning about loop avoidance and silent failure. Persisting
 * preferences is not part of either: the UI store writes them when they change
 * (see useUiStore).
 */
export function useDesktopBridgeSync({
  manifestRef,
}: {
  manifestRef: RefObject<BookManifest | null>;
}) {
  const preferences = useUiStore((s) => s.preferences);
  const setManifest = useVaultStore((s) => s.setManifest);

  // Apply the theme to the document and the native window frame.
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    window.bookMDDesktop?.system.setNativeTheme?.(preferences.theme);
  }, [preferences]);

  /**
   * Tells the main process whether hidden documents should be listed, and
   * re-lists the open folder so the change is visible immediately.
   *
   * Keyed on the preference alone. Depending on `manifest` would re-run this on
   * every refresh, and the refresh itself changes the manifest — a loop.
   */
  useEffect(() => {
    const desktop = window.bookMDDesktop;
    desktop?.files.setScanOptions?.({ includeHidden: preferences.showHiddenFiles === true });

    const rootPath = manifestRef.current?.rootPath;
    if (!rootPath || !desktop?.files.refreshDirectory) return;

    let cancelled = false;
    void (async () => {
      try {
        const next = await desktop.files.refreshDirectory(rootPath);
        if (!cancelled && next) setManifest(next);
      } catch {
        // A failed re-listing leaves the tree as it is. The setting is already
        // stored, so the next open picks it up — no need to say anything.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [preferences.showHiddenFiles, setManifest, manifestRef]);
}
