import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useColumnResize } from "../hooks/useColumnResize";
import { useUiStore } from "../store/useUiStore";
import { resetStores, restoreStores } from "./helpers/resetStores";

/**
 * The resize handlers take a React.MouseEvent but read exactly two things from
 * it, so a minimal stand-in keeps these tests about the behaviour rather than
 * about constructing events.
 */
const mouseDownAt = (clientX: number) =>
  ({ preventDefault() {}, clientX }) as unknown as React.MouseEvent;

function movePointerTo(clientX: number) {
  act(() => {
    window.dispatchEvent(new MouseEvent("mousemove", { clientX }));
  });
}

function releasePointer() {
  act(() => {
    window.dispatchEvent(new MouseEvent("mouseup"));
  });
}

/**
 * Builds a measurable column. jsdom reports every element as zero-sized, so the
 * one rect the fit logic reads is stubbed directly.
 */
function mountColumn(
  containerClass: string,
  itemClass: string,
  itemWidth: number
): HTMLElement {
  const container = document.createElement("div");
  container.className = containerClass;
  const item = document.createElement("div");
  item.className = itemClass;
  item.getBoundingClientRect = () => ({ width: itemWidth }) as DOMRect;
  container.appendChild(item);
  document.body.appendChild(container);
  return container;
}

describe("useColumnResize", () => {
  let mounted: HTMLElement[] = [];

  beforeEach(() => {
    resetStores();
    mounted = [];
  });

  afterEach(() => {
    mounted.forEach((el) => el.remove());
    restoreStores();
    localStorage.clear();
    document.body.classList.remove("is-resizing-col");
  });

  describe("starting a drag", () => {
    it("marks the directory column as being resized", () => {
      const { result } = renderHook(() => useColumnResize());

      act(() => result.current.handleDirResizeMouseDown(mouseDownAt(300)));

      expect(useUiStore.getState().resizingType).toBe("dir");
    });

    it("marks the side panel as being resized", () => {
      const { result } = renderHook(() => useColumnResize());

      act(() => result.current.handleSidebarResizeMouseDown(mouseDownAt(300)));

      expect(useUiStore.getState().resizingType).toBe("sidebar");
    });

    it("suppresses text selection for the duration", () => {
      const { result } = renderHook(() => useColumnResize());

      act(() => result.current.handleDirResizeMouseDown(mouseDownAt(300)));

      expect(document.body.classList.contains("is-resizing-col")).toBe(true);
    });

    it("captures the width at the moment the drag begins", () => {
      // The delta is measured against the width when the pointer went down, not
      // against the live width — otherwise every move would compound.
      useUiStore.getState().setDirectoryWidth(240);
      const { result } = renderHook(() => useColumnResize());

      act(() => result.current.handleDirResizeMouseDown(mouseDownAt(300)));
      movePointerTo(340);
      // A second move from the same origin must land on the same width.
      movePointerTo(340);

      expect(useUiStore.getState().directoryWidth).toBe(280);
    });
  });

  describe("dragging", () => {
    it("follows the pointer delta", () => {
      useUiStore.getState().setDirectoryWidth(240);
      const { result } = renderHook(() => useColumnResize());

      act(() => result.current.handleDirResizeMouseDown(mouseDownAt(300)));
      movePointerTo(340);

      expect(useUiStore.getState().directoryWidth).toBe(280);
    });

    it("holds the directory within its own bounds", () => {
      useUiStore.getState().setDirectoryWidth(240);
      const { result } = renderHook(() => useColumnResize());
      act(() => result.current.handleDirResizeMouseDown(mouseDownAt(300)));

      movePointerTo(-1000);
      expect(useUiStore.getState().directoryWidth).toBe(160);

      movePointerTo(5000);
      expect(useUiStore.getState().directoryWidth).toBe(480);
    });

    it("uses the side panel's wider bounds for the side panel", () => {
      useUiStore.getState().setSidebarWidth(300);
      const { result } = renderHook(() => useColumnResize());
      act(() => result.current.handleSidebarResizeMouseDown(mouseDownAt(300)));

      movePointerTo(-1000);
      expect(useUiStore.getState().sidebarWidth).toBe(180);

      movePointerTo(5000);
      expect(useUiStore.getState().sidebarWidth).toBe(520);
    });

    it("leaves the other column alone", () => {
      useUiStore.getState().setDirectoryWidth(240);
      useUiStore.getState().setSidebarWidth(300);
      const { result } = renderHook(() => useColumnResize());

      act(() => result.current.handleSidebarResizeMouseDown(mouseDownAt(300)));
      movePointerTo(400);

      expect(useUiStore.getState().sidebarWidth).toBe(400);
      expect(useUiStore.getState().directoryWidth).toBe(240);
    });

    it("does nothing when no drag is in progress", () => {
      // The listeners are only attached while resizingType is set, but a stray
      // move must still not move anything.
      const { result } = renderHook(() => useColumnResize());
      useUiStore.getState().setDirectoryWidth(240);

      movePointerTo(9999);

      expect(useUiStore.getState().directoryWidth).toBe(240);
    });
  });

  describe("ending a drag", () => {
    it("writes the width once, on release", () => {
      useUiStore.getState().setDirectoryWidth(240);
      const { result } = renderHook(() => useColumnResize());
      act(() => result.current.handleDirResizeMouseDown(mouseDownAt(300)));

      movePointerTo(340);
      // Persisting per frame would be a synchronous localStorage write at sixty
      // hertz, which is why this is asserted before the release.
      expect(localStorage.getItem("bookmd.layout.dirWidth")).toBeNull();

      releasePointer();

      expect(localStorage.getItem("bookmd.layout.dirWidth")).toBe("280");
    });

    it("clears the resizing state and the body class", () => {
      const { result } = renderHook(() => useColumnResize());
      act(() => result.current.handleDirResizeMouseDown(mouseDownAt(300)));

      releasePointer();

      expect(useUiStore.getState().resizingType).toBeNull();
      expect(document.body.classList.contains("is-resizing-col")).toBe(false);
    });

    it("stops listening once the drag is over", () => {
      useUiStore.getState().setDirectoryWidth(240);
      const { result } = renderHook(() => useColumnResize());
      act(() => result.current.handleDirResizeMouseDown(mouseDownAt(300)));
      releasePointer();

      movePointerTo(5000);

      expect(useUiStore.getState().directoryWidth).toBe(240);
    });
  });

  describe("fitting a column to its contents", () => {
    it("sizes the directory to its widest entry plus its gutter", () => {
      mounted.push(mountColumn("chapter-list", "tree-item-title", 250));
      const { result } = renderHook(() => useColumnResize());

      act(() => result.current.handleDirDoubleClick());

      // 250 + 60 gutter, inside the fit bounds.
      expect(useUiStore.getState().directoryWidth).toBe(310);
    });

    it("clamps a very wide entry to the fit maximum", () => {
      mounted.push(mountColumn("chapter-list", "tree-item-title", 900));
      const { result } = renderHook(() => useColumnResize());

      act(() => result.current.handleDirDoubleClick());

      expect(useUiStore.getState().directoryWidth).toBe(380);
    });

    it("clamps an empty column to the fit minimum", () => {
      mounted.push(mountColumn("chapter-list", "tree-item-title", 0));
      const { result } = renderHook(() => useColumnResize());

      act(() => result.current.handleDirDoubleClick());

      expect(useUiStore.getState().directoryWidth).toBe(200);
    });

    it("falls back to the default when the column is not on screen", () => {
      // A missing container means there was nothing to measure, which is a
      // different situation from a column that measured empty.
      const { result } = renderHook(() => useColumnResize());

      act(() => result.current.handleDirDoubleClick());

      expect(useUiStore.getState().directoryWidth).toBe(240);
    });

    it("fits the side panel with its own selector and bounds", () => {
      mounted.push(mountColumn("side-panel", "toc-item-text", 300));
      const { result } = renderHook(() => useColumnResize());

      act(() => result.current.handleSidebarDoubleClick());

      // 300 + 48 gutter.
      expect(useUiStore.getState().sidebarWidth).toBe(348);
    });

    it("falls back to the side panel's own default", () => {
      const { result } = renderHook(() => useColumnResize());

      act(() => result.current.handleSidebarDoubleClick());

      expect(useUiStore.getState().sidebarWidth).toBe(260);
    });

    it("persists the fitted width", () => {
      mounted.push(mountColumn("chapter-list", "tree-item-title", 250));
      const { result } = renderHook(() => useColumnResize());

      act(() => result.current.handleDirDoubleClick());

      expect(localStorage.getItem("bookmd.layout.dirWidth")).toBe("310");
    });
  });
});
