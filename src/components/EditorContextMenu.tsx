import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { clampMenuPosition } from "../services/tableGenerator";
import { useSubmenuController } from "./editor-menu/useSubmenuController";
import { useEditorEditActions } from "./editor-menu/useEditorEditActions";
import { ContextMenuPortal } from "./editor-menu/ContextMenuPortal";
import { SubmenuPortals } from "./editor-menu/SubmenuPortals";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface EditorContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  view: EditorView;
  currentFilePath?: string;
  onExtractToNote?: (selectedText: string, suggestedTitle: string) => void;
  onSendToFlash?: (text: string) => void;
  onPrint?: () => void;
  onToggleMindmap?: () => void;
  onRevealInToc?: () => void;
}

/**
 * The editor context menu: composition root after the decomposition into
 * `editor-menu/`. State/behaviour lives in the hooks, markup in the two view
 * components, and this file keeps only what spans them:
 * - the main menu's own viewport clamp (`adjustedPos` + the layout effect
 *   below);
 * - the render-time selection snapshot, which `useEditorEditActions` computes
 *   on every render (its callbacks close over it — see that file's contract
 *   note) and this root derives the word/char footer stats from.
 * Outside-click/Esc dismissal lives in `useSubmenuController` (it must see the
 * close-timer ref as a direct `useRef` for the lint rule; behaviour is the
 * original's). The props interface, the `memo` wrapper and every behaviour are
 * unchanged from the pre-split single file.
 */
export const EditorContextMenu = memo(function EditorContextMenu({
  x,
  y,
  onClose,
  view,
  currentFilePath,
  onExtractToNote,
  onSendToFlash,
  onPrint,
  onToggleMindmap,
  onRevealInToc,
}: EditorContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const tablePickerRef = useRef<HTMLDivElement>(null);

  const {
    activeSubmenu,
    submenuPos,
    submenuRef,
    handleOpenSubmenu,
    handleOpenTablePicker,
    handleScheduleClose,
    handleCancelClose,
    handleImmediateCloseSubmenu,
  } = useSubmenuController({ menuRef, tablePickerRef, onClose });

  const {
    hasSelection,
    selectedText,
    docText,
    wrapSelection,
    transformLinePrefix,
    insertAtCursor,
    handleInsertTableDimensions,
    handleCut,
    handleCopy,
    handlePaste,
    handleExtractToNote,
    handleCreateBlockRef,
    handleSendToFlash,
  } = useEditorEditActions({ view, onClose, currentFilePath, onExtractToNote, onSendToFlash });

  // Initial estimate safe positioning (compact height ~340px prevents clipping)
  const [adjustedPos, setAdjustedPos] = useState(() => {
    const defaultViewport = {
      width: typeof window !== "undefined" ? window.innerWidth : 1280,
      height: typeof window !== "undefined" ? window.innerHeight : 800,
    };
    return clampMenuPosition(x, y, 260, 340, defaultViewport, 12);
  });

  // Calculate word and character statistics
  const totalChars = docText.length;
  const totalWords = (docText.match(/[\u4e00-\u9fa5]|[a-zA-Z0-9_-]+/g) || []).length;
  const selectedChars = selectedText.length;

  // Viewport-safe positioning with useLayoutEffect for flicker-free clamping
  useIsomorphicLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const clamped = clampMenuPosition(x, y, rect.width, rect.height, viewport, 12);
    setAdjustedPos(clamped);
  }, [x, y]);

  return (
    <>
      {typeof document !== "undefined" && (
        <ContextMenuPortal
          menuRef={menuRef}
          adjustedPos={adjustedPos}
          view={view}
          onClose={onClose}
          hasSelection={hasSelection}
          selectedChars={selectedChars}
          totalWords={totalWords}
          totalChars={totalChars}
          wrapSelection={wrapSelection}
          handleCut={handleCut}
          handleCopy={handleCopy}
          handlePaste={handlePaste}
          handleExtractToNote={handleExtractToNote}
          handleCreateBlockRef={handleCreateBlockRef}
          handleSendToFlash={handleSendToFlash}
          activeSubmenu={activeSubmenu}
          handleOpenSubmenu={handleOpenSubmenu}
          handleOpenTablePicker={handleOpenTablePicker}
          handleImmediateCloseSubmenu={handleImmediateCloseSubmenu}
          handleScheduleClose={handleScheduleClose}
          onPrint={onPrint}
          onToggleMindmap={onToggleMindmap}
          onRevealInToc={onRevealInToc}
        />
      )}
      <SubmenuPortals
        activeSubmenu={activeSubmenu}
        submenuPos={submenuPos}
        submenuRef={submenuRef}
        tablePickerRef={tablePickerRef}
        handleCancelClose={handleCancelClose}
        handleScheduleClose={handleScheduleClose}
        transformLinePrefix={transformLinePrefix}
        insertAtCursor={insertAtCursor}
        handleInsertTableDimensions={handleInsertTableDimensions}
      />
    </>
  );
});
