import { useCallback, useEffect, useRef } from "react";
import {
  useUiStore,
  DIRECTORY_WIDTH_DEFAULT,
  DIRECTORY_WIDTH_MAX,
  DIRECTORY_WIDTH_MIN,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
} from "../store/useUiStore";

/**
 * Dragging and fitting the two resizable columns — the document directory on
 * the left and the side panel beside it.
 *
 * First hook out of App.tsx (R1 batch B3b). The whole cluster is self-contained
 * once the widths live in the store: two mousedown handlers, one window-level
 * drag effect, and the double-click fit that measures a column's contents.
 * Nothing here needs the editing session, which is what made it the safe one to
 * start with.
 *
 * The width bounds appear twice by design and mean different things. The store
 * clamps what a *drag* may produce (160–480 and 180–520). The narrower constants
 * below clamp what a *fit* may produce (200–380 and 220–400), because measuring
 * a column of text should not be allowed to produce the extremes a manual drag
 * can. Both were verified to match the code this replaces.
 */

/** What a double-click fit measures, and the room it leaves beyond the text. */
const DIRECTORY_FIT_SELECTOR = ".chapter-list";
const DIRECTORY_ITEM_SELECTOR = ".tree-item-title, .tree-folder-title, .tree-heading";
const DIRECTORY_FIT_MIN = 200;
const DIRECTORY_FIT_MAX = 380;
const DIRECTORY_GUTTER = 60;

const SIDEBAR_FIT_SELECTOR = ".side-panel";
const SIDEBAR_ITEM_SELECTOR =
  ".toc-item-text, .search-card-excerpt, .bookmark-item-title, .tabs";
const SIDEBAR_FIT_MIN = 220;
const SIDEBAR_FIT_MAX = 400;
const SIDEBAR_GUTTER = 48;

/** Suppresses text selection and pointer changes for the duration of a drag. */
const RESIZING_CLASS = "is-resizing-col";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Widest content in a column, or null when the column is not on screen.
 *
 * Null and zero mean different things to the caller: a missing column falls
 * back to the default width, whereas an empty one is a genuine measurement and
 * clamps to the minimum. The previous inline version distinguished them the same
 * way, by whether the container lookup succeeded.
 */
function measureWidestItem(
  containerSelector: string,
  itemSelector: string,
  gutter: number
): number | null {
  const container = document.querySelector(containerSelector);
  if (!container) return null;
  let widest = 0;
  container.querySelectorAll(itemSelector).forEach((el) => {
    widest = Math.max(widest, el.getBoundingClientRect().width + gutter);
  });
  return widest;
}

export function useColumnResize() {
  const resizingType = useUiStore((s) => s.resizingType);
  const setResizingType = useUiStore((s) => s.setResizingType);
  const setDirectoryWidth = useUiStore((s) => s.setDirectoryWidth);
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth);
  const persistLayout = useUiStore((s) => s.persistLayout);

  /** Pointer position and column width when the current drag began. */
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleDirResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setResizingType("dir");
      startXRef.current = e.clientX;
      // Read through getState rather than subscribing to the width. The old
      // handler listed it as a dependency, so its identity changed on every
      // frame of a drag — which meant the resizer element received a new
      // onMouseDown prop sixty times a second for no reason.
      startWidthRef.current = useUiStore.getState().directoryWidth;
    },
    [setResizingType]
  );

  const handleSidebarResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setResizingType("sidebar");
      startXRef.current = e.clientX;
      startWidthRef.current = useUiStore.getState().sidebarWidth;
    },
    [setResizingType]
  );

  useEffect(() => {
    if (!resizingType) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startXRef.current;
      if (resizingType === "dir") {
        setDirectoryWidth(
          clamp(
            startWidthRef.current + deltaX,
            DIRECTORY_WIDTH_MIN,
            DIRECTORY_WIDTH_MAX
          )
        );
      } else if (resizingType === "sidebar") {
        setSidebarWidth(
          clamp(startWidthRef.current + deltaX, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX)
        );
      }
    };

    const handleMouseUp = () => {
      // Persist once, when the gesture ends. The store's width setters run on
      // every mousemove, and a synchronous localStorage write per frame would
      // make the drag stutter — which is why persistLayout exists separately.
      persistLayout();
      setResizingType(null);
      document.body.classList.remove(RESIZING_CLASS);
    };

    document.body.classList.add(RESIZING_CLASS);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.body.classList.remove(RESIZING_CLASS);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    // The widths are deliberately absent from this list. They used to be here
    // only to seed the locals that tracked the latest value for mouseup; with
    // that gone, depending on them would tear down and re-add the window
    // listeners on every frame of the drag to no effect.
  }, [resizingType, setDirectoryWidth, setSidebarWidth, setResizingType, persistLayout]);

  const handleDirDoubleClick = useCallback(() => {
    const measured = measureWidestItem(
      DIRECTORY_FIT_SELECTOR,
      DIRECTORY_ITEM_SELECTOR,
      DIRECTORY_GUTTER
    );
    setDirectoryWidth(
      measured === null
        ? DIRECTORY_WIDTH_DEFAULT
        : clamp(Math.ceil(measured), DIRECTORY_FIT_MIN, DIRECTORY_FIT_MAX)
    );
    // persistLayout reads through get(), so it already sees the width just set.
    persistLayout();
  }, [setDirectoryWidth, persistLayout]);

  const handleSidebarDoubleClick = useCallback(() => {
    const measured = measureWidestItem(
      SIDEBAR_FIT_SELECTOR,
      SIDEBAR_ITEM_SELECTOR,
      SIDEBAR_GUTTER
    );
    setSidebarWidth(
      measured === null
        ? SIDEBAR_WIDTH_DEFAULT
        : clamp(Math.ceil(measured), SIDEBAR_FIT_MIN, SIDEBAR_FIT_MAX)
    );
    persistLayout();
  }, [setSidebarWidth, persistLayout]);

  return {
    handleDirResizeMouseDown,
    handleSidebarResizeMouseDown,
    handleDirDoubleClick,
    handleSidebarDoubleClick,
  };
}
