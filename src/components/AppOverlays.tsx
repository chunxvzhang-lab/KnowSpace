import type { ComponentProps } from "react";
import { AboutDialog } from "./AboutDialog";
import { CommandPalette } from "./CommandPalette";
import { FileConflictDialog } from "./FileConflictDialog";
import { MediaLightbox } from "./MediaLightbox";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { VersionHistoryDialog } from "./VersionHistoryDialog";
import type { DocumentSessionState } from "../hooks/useDocumentSession";
import type { ChapterManifest, RenderedChapter } from "../core/types";
import type { CommandAction } from "./CommandPalette";
import { useUiStore } from "../store/useUiStore";
import { useTabStore } from "../store/useTabStore";
import { useVaultStore } from "../store/useVaultStore";

/**
 * Everything that renders above the workspace: the media lightbox, the two
 * guard dialogs, the command palette, version history, the about box and the
 * notice toast.
 *
 * Split out of App.tsx during R1 batch B3. It is a composition boundary rather
 * than a component with a job — App's render now reads as chrome, then
 * workspace, then floating surfaces, instead of interleaving seven dialogs with
 * the editor.
 *
 * The store migration is what makes this cheap: ten of the values these
 * surfaces need (the lightbox media, four open flags, the notice, preferences,
 * the manifest, the active tab and the recent list) are read straight from the
 * stores here, so they are not props. Only the editing session and the actions
 * App orchestrates remain.
 *
 * `session` in particular has to be a prop: useDocumentSession owns the single
 * editing session, and calling it again here would create a second one rather
 * than share the first.
 *
 * Pass-through callback types are derived from the components that receive
 * them, so a signature change there surfaces here as a type error instead of
 * drifting.
 */
type AppOverlaysProps = {
  session: DocumentSessionState["session"];
  /** Held by the session hook rather than by `session`, so passed alongside it. */
  conflict: DocumentSessionState["conflict"];
  activeChapter?: ChapterManifest;
  renderedChapter: RenderedChapter | null;
  commandActions: CommandAction[];
  onSelectChapter: ComponentProps<typeof CommandPalette>["onSelectChapter"];
  onJumpToHeading: ComponentProps<typeof CommandPalette>["onJumpToHeading"];
  onSavePending: ComponentProps<typeof UnsavedChangesDialog>["onSave"];
  onDiscardPending: ComponentProps<typeof UnsavedChangesDialog>["onDiscard"];
  onCancelPending: ComponentProps<typeof UnsavedChangesDialog>["onCancel"];
  onReloadFromDisk: ComponentProps<typeof FileConflictDialog>["onReload"];
  onOverwrite: ComponentProps<typeof FileConflictDialog>["onOverwrite"];
  onSaveAs: ComponentProps<typeof FileConflictDialog>["onSaveAs"];
  onClearConflict: ComponentProps<typeof FileConflictDialog>["onCancel"];
  onRevertToContent: ComponentProps<typeof VersionHistoryDialog>["onRevertToContent"];
};

export function AppOverlays({
  session,
  conflict,
  activeChapter,
  renderedChapter,
  commandActions,
  onSelectChapter,
  onJumpToHeading,
  onSavePending,
  onDiscardPending,
  onCancelPending,
  onReloadFromDisk,
  onOverwrite,
  onSaveAs,
  onClearConflict,
  onRevertToContent,
}: AppOverlaysProps) {
  const lightboxMedia = useUiStore((s) => s.lightboxMedia);
  const setLightboxMedia = useUiStore((s) => s.setLightboxMedia);
  const unsavedDialogOpen = useUiStore((s) => s.unsavedDialogOpen);
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const versionHistoryOpen = useUiStore((s) => s.versionHistoryOpen);
  const setVersionHistoryOpen = useUiStore((s) => s.setVersionHistoryOpen);
  const aboutOpen = useUiStore((s) => s.aboutOpen);
  const setAboutOpen = useUiStore((s) => s.setAboutOpen);
  const notice = useUiStore((s) => s.notice);
  const preferences = useUiStore((s) => s.preferences);

  const manifest = useVaultStore((s) => s.manifest);
  const chapterId = useTabStore((s) => s.activeTabId);
  const recentVisitedDocIds = useTabStore((s) => s.recentVisitedDocIds);

  const fileName = session?.fileName ?? "当前文件";

  return (
    <>
      <MediaLightbox media={lightboxMedia} onClose={() => setLightboxMedia(null)} />

      <UnsavedChangesDialog
        isOpen={unsavedDialogOpen}
        fileName={fileName}
        onSave={onSavePending}
        onDiscard={onDiscardPending}
        onCancel={onCancelPending}
      />

      <FileConflictDialog
        isOpen={Boolean(conflict)}
        fileName={fileName}
        onReload={onReloadFromDisk}
        onOverwrite={onOverwrite}
        onSaveAs={onSaveAs}
        onCancel={onClearConflict}
      />

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        manifest={manifest}
        currentChapterId={chapterId}
        onSelectChapter={onSelectChapter}
        headings={renderedChapter?.headings}
        onJumpToHeading={onJumpToHeading}
        recentChapterIds={recentVisitedDocIds}
        actions={commandActions}
      />

      <VersionHistoryDialog
        isOpen={versionHistoryOpen}
        onClose={() => setVersionHistoryOpen(false)}
        fileName={activeChapter?.title ?? session?.fileName}
        filePath={session?.absolutePath || undefined}
        rootPath={manifest?.rootPath}
        currentContent={session?.source || ""}
        theme={preferences.theme}
        onRevertToContent={onRevertToContent}
      />

      <AboutDialog isOpen={aboutOpen} onClose={() => setAboutOpen(false)} />

      {notice ? (
        <div className="toast" role="status" aria-live="polite">
          {notice}
        </div>
      ) : null}
    </>
  );
}
