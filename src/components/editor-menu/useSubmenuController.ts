import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { calculateSubmenuPosition } from "../../services/tableGenerator";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export type SubmenuType = "headings" | "lists" | "insert" | "tablePicker" | null;

type UseSubmenuControllerParams = {
  /** Ref on the main menu element; outside-click dismissal ignores clicks inside it. */
  menuRef: RefObject<HTMLDivElement | null>;
  /** Ref on the table-picker panel; outside-click dismissal ignores clicks inside it. */
  tablePickerRef: RefObject<HTMLDivElement | null>;
  /** Closes the whole menu (outside click, or Esc with no submenu open). */
  onClose: () => void;
};

/**
 * The single mutually-exclusive active submenu of the editor context menu,
 * plus the dismissal listeners that close the whole menu.
 *
 * Extracted from EditorContextMenu (decomposition of the context menu): the
 * state declarations, the five lifecycle callbacks, the clamp effect and the
 * click-outside/Esc effect below are the originals, moved verbatim.
 *
 * Three contracts are load-bearing here:
 * - Close-timer semantics: leaving a submenu trigger schedules a 220ms close
 *   (`handleScheduleClose`), entering the panel or another trigger cancels it
 *   (`handleCancelClose` / `handleOpenSubmenu`), and entering a plain menu
 *   group closes immediately (`handleImmediateCloseSubmenu`). The timer lives
 *   in a ref so the window listeners can also clear it on unmount.
 * - The clamp effect's dependency array stays `[activeSubmenu]` exactly as in
 *   the original: it runs once per submenu mount, measures the freshly
 *   attached DOM and nudges `submenuPos` back inside the viewport. It is
 *   deliberately NOT re-run when `submenuPos` itself changes, otherwise the
 *   nudge would re-trigger itself.
 * - The Esc handler closes only the open submenu first; the menu itself is
 *   closed by a second Esc. The cleanup clears any pending close timer.
 */
export function useSubmenuController({
  menuRef,
  tablePickerRef,
  onClose,
}: UseSubmenuControllerParams) {
  const submenuRef = useRef<HTMLDivElement>(null);

  // Submenu states: single mutually-exclusive active submenu
  const [activeSubmenu, setActiveSubmenu] = useState<SubmenuType>(null);
  const [submenuPos, setSubmenuPos] = useState<{ left: number; top: number } | null>(null);

  const submenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Submenu dynamic viewport boundary clamping
  useIsomorphicLayoutEffect(() => {
    if (!submenuRef.current || !submenuPos) return;
    const rect = submenuRef.current.getBoundingClientRect();
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    let nextTop = submenuPos.top;
    let nextLeft = submenuPos.left;
    let changed = false;

    if (rect.bottom > vh - 12) {
      const overflow = rect.bottom - (vh - 12);
      nextTop = Math.max(12, submenuPos.top - overflow);
      changed = true;
    }
    if (rect.right > vw - 12) {
      const overflow = rect.right - (vw - 12);
      nextLeft = Math.max(12, submenuPos.left - overflow);
      changed = true;
    }
    if (changed) {
      setSubmenuPos({ left: nextLeft, top: nextTop });
    }
  }, [activeSubmenu]);

  // Click outside and Esc listener
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        !submenuRef.current?.contains(target) &&
        !tablePickerRef.current?.contains(target)
      ) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeSubmenu) {
          setActiveSubmenu(null);
          return;
        }
        onClose();
      }
    };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKeyDown);
      if (submenuCloseTimer.current) {
        clearTimeout(submenuCloseTimer.current);
      }
    };
    // menuRef/tablePickerRef are stable ref objects handed in by the caller —
    // listed for the lint rule; they never change identity, so this effect
    // still re-runs exactly when `activeSubmenu` or `onClose` does.
  }, [activeSubmenu, onClose, menuRef, tablePickerRef]);

  // Helper: Open Submenu with smooth viewport coordinate calculation
  const handleOpenSubmenu = useCallback(
    (name: SubmenuType, anchorEl: HTMLElement, width = 190, height = 200) => {
      if (submenuCloseTimer.current) {
        clearTimeout(submenuCloseTimer.current);
        submenuCloseTimer.current = null;
      }
      const anchorRect = anchorEl.getBoundingClientRect();
      const pos = calculateSubmenuPosition(anchorRect, width, height, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      setSubmenuPos(pos);
      setActiveSubmenu(name);
    },
    [],
  );

  // Helper: Open Table Picker Panel
  const handleOpenTablePicker = useCallback(
    (anchorEl: HTMLElement) => {
      handleOpenSubmenu("tablePicker", anchorEl, 264, 310);
    },
    [handleOpenSubmenu],
  );

  const handleScheduleClose = useCallback(() => {
    if (submenuCloseTimer.current) {
      clearTimeout(submenuCloseTimer.current);
    }
    submenuCloseTimer.current = setTimeout(() => {
      setActiveSubmenu(null);
      submenuCloseTimer.current = null;
    }, 220);
  }, []);

  const handleCancelClose = useCallback(() => {
    if (submenuCloseTimer.current) {
      clearTimeout(submenuCloseTimer.current);
      submenuCloseTimer.current = null;
    }
  }, []);

  const handleImmediateCloseSubmenu = useCallback(() => {
    if (submenuCloseTimer.current) {
      clearTimeout(submenuCloseTimer.current);
      submenuCloseTimer.current = null;
    }
    setActiveSubmenu(null);
  }, []);

  return {
    activeSubmenu,
    submenuPos,
    submenuRef,
    handleOpenSubmenu,
    handleOpenTablePicker,
    handleScheduleClose,
    handleCancelClose,
    handleImmediateCloseSubmenu,
  };
}
