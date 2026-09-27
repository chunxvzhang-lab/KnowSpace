import type { ComponentProps, ReactNode } from "react";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasOverlayMenus } from "./CanvasOverlayMenus";
import { CanvasPresentationChrome } from "./CanvasPresentationChrome";

/**
 * The canvas chrome: the three wave-4 satellites that frame the board — the
 * floating glassmorphic toolbar, the overlay menus/modals layer and the
 * presentation-mode controls — plus the board world passed through as
 * `children` so the root container's sibling order is preserved exactly
 * (toolbar + overlay before the world, the presentation chrome after it; paint
 * order is z-index-determined, see the CanvasWorld comment in CanvasView).
 *
 * Extracted from CanvasView (final trim wave). Pure prop plumbing: this
 * component owns no state and adds no handlers; each bundle is exactly the
 * props of the component it feeds, so the mount sites below spread them
 * verbatim — the JSX (comments included) is what used to live inline in
 * CanvasView. The presentation guard expression is evaluated in CanvasView,
 * exactly as before, and arrives as `showPresentation`.
 */
type CanvasChromeProps = {
  /** `isPresentationMode && presentationSequence.length > 0`, from CanvasView. */
  showPresentation: boolean;
  toolbar: ComponentProps<typeof CanvasToolbar>;
  overlay: ComponentProps<typeof CanvasOverlayMenus>;
  presentation: ComponentProps<typeof CanvasPresentationChrome>;
  /** The board world — rendered between the overlay and the presentation chrome. */
  children?: ReactNode;
};

export function CanvasChrome({
  showPresentation,
  toolbar,
  overlay,
  presentation,
  children,
}: CanvasChromeProps) {
  return (
    <>
      {/* 1. TOP FLOATING GLASSMORPHIC TOOLBAR (extracted component, wave 4) */}
      <CanvasToolbar {...toolbar} />

      {/* 5-9. OVERLAY LAYER — the note-picker / extract / export / spawn
          modals, the portalled right-click context menu, the toast and the
          media lightbox (extracted component, wave 4). The overlay state it
          renders stays up in CanvasView because non-overlay code writes it:
          the gesture hooks take setContextMenu, the keyboard chains close the
          modals, the toolbar opens the export modal, showToast writes the
          toast, openMediaPreview writes the lightbox. */}
      <CanvasOverlayMenus {...overlay} />

      {children}

      {/* 10. Presentation Mode Floating Controls & Slide Drawer (extracted
          component, wave 4; the guard arrives as `showPresentation` so the
          chrome only mounts while a presentation with slides is actually
          running) */}
      {showPresentation && <CanvasPresentationChrome {...presentation} />}
    </>
  );
}
