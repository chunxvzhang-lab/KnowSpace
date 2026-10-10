import { X, Zap } from "lucide-react";
import type {
  Bookmark,
  DocumentSession,
  RenderedChapter,
  SearchResult,
  SidebarTab,
  ThemeMode,
} from "../core/types";
import { BacklinksPanel } from "./BacklinksPanel";
import { BookmarkPanel } from "./BookmarkPanel";
import { SearchPanel } from "./SearchPanel";
import { SpaceTimelinePanel } from "./SpaceTimelinePanel";
import { TocPanel } from "./TocPanel";
import { extractHeadingsFromSource } from "../services/markdown";
import { useUiStore } from "../store/useUiStore";
import { useVaultStore } from "../store/useVaultStore";
import { useReviewStore } from "../store/useReviewStore";
import type { useBacklinkIndex } from "../hooks/useBacklinkIndex";

/** The slice of the backlinks hook the sidebar's panel renders. */
export type BacklinksView = Pick<
  ReturnType<typeof useBacklinkIndex>,
  | "currentDocTitle"
  | "currentLinkedReferences"
  | "currentUnlinkedMentions"
  | "handleJumpToBacklink"
  | "handleConvertMention"
  | "graphData"
>;

type SidebarPanelProps = {
  // R1 batch B7: `manifest`, the bookmark list and the search fields (query /
  // scope / active match) are **not props any more**. The sidebar renders
  // exactly what the vault store holds, so it subscribes to those fields
  // itself - one source of truth instead of a pass-through App had to keep in
  // sync, and App no longer re-renders for a search-scope change it never uses.
  session: DocumentSession | null;
  renderedChapter: RenderedChapter | null;
  activeHeadingId: string | undefined;
  bookmarkedHeadingIds: ReadonlySet<string>;
  jumpToHeading: (headingId: string, behavior?: ScrollBehavior, highlight?: boolean) => void;
  jumpBookmark: (bookmark: Bookmark) => void;
  searchResults: SearchResult[];
  onQueryChange: (query: string) => void;
  handleSearchJump: (result: SearchResult) => void;
  reviewableDocument: { filePath: string; content: string; dirty: boolean } | null;
  onOpenNoteFile: (filePath: string) => void;
  onOpenNoteInReader: (filePath: string) => void;
  /** Fired after a timeline todo is toggled on disk, so an open reader can re-read. */
  onFlashNoteFileChanged: (filePath: string) => void;
  handleReviewActiveChange: (active: boolean) => void;
  handleMergeFlashNote: (content: string, fileName: string) => void;
  handleSidebarResizeMouseDown: (event: React.MouseEvent) => void;
  handleSidebarDoubleClick: () => void;
  backlinks: BacklinksView;
  theme: ThemeMode;
  onOpenGlobalGraph: () => void;
};

const tabLabels: Record<SidebarTab, string> = {
  toc: "大纲",
  bookmarks: "书签",
  search: "搜索",
  space: "闪念 Space",
  backlinks: "反向链接",
};

/**
 * The sidebar: the Space timeline, or the toc / bookmarks / search / backlinks
 * tabs. Which tab is active and how wide the panel is come from the UI store —
 * the same place the resizer writes them — so this component owns the layout
 * the way the store owns it, and receives only the content it renders.
 */
export function SidebarPanel({
  session,
  renderedChapter,
  activeHeadingId,
  bookmarkedHeadingIds,
  jumpToHeading,
  jumpBookmark,
  searchResults,
  onQueryChange,
  handleSearchJump,
  reviewableDocument,
  onOpenNoteFile,
  onOpenNoteInReader,
  onFlashNoteFileChanged,
  handleReviewActiveChange,
  handleMergeFlashNote,
  handleSidebarResizeMouseDown,
  handleSidebarDoubleClick,
  backlinks,
  theme,
  onOpenGlobalGraph,
}: SidebarPanelProps) {
  const sidebarTab = useUiStore((s) => s.sidebarTab);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const resizingType = useUiStore((s) => s.resizingType);
  // R1 batch B7: these seven come straight from the stores that own them. The
  // scope setter is included - it used to arrive as `onScopeChange`, a prop
  // whose only job was to forward a store action back into the store.
  const manifest = useVaultStore((s) => s.manifest);
  const bookmarks = useVaultStore((s) => s.bookmarks);
  const persistBookmarks = useVaultStore((s) => s.persistBookmarks);
  const searchQuery = useVaultStore((s) => s.searchQuery);
  const activeSearchMatchId = useVaultStore((s) => s.activeSearchMatchId);
  const searchScope = useVaultStore((s) => s.searchScope);
  const setSearchScope = useVaultStore((s) => s.setSearchScope);
  // A counter for "start a review", bumped by the command palette. The review
  // lives behind this panel's own tab, which the workspace does not otherwise
  // control — so the request travels as a changing number that can be watched,
  // rather than as a flag that might already be showing. (R1 batch B7 moved this
  // read, and the note explaining it, down from App.tsx together with the prop.)
  const openReviewRequest = useReviewStore((s) => s.reviewRequest);

  return (
    <>
      <aside className="side-panel" style={{ width: sidebarWidth, flex: `0 0 ${sidebarWidth}px` }}>
        {sidebarTab === "space" ? (
          <section id="space-panel" role="tabpanel" aria-labelledby="space-tab">
            <div className="space-standalone-header">
              <div className="space-standalone-title">
                <Zap size={15} style={{ color: "#f59e0b" }} />
                <span>闪念 Space</span>
              </div>
              {manifest && (
                <button
                  type="button"
                  className="space-standalone-close-btn"
                  onClick={() => setSidebarTab("toc")}
                  title="返回大纲目录"
                  aria-label="返回大纲目录"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <SpaceTimelinePanel
              onOpenNoteFile={onOpenNoteFile}
              onOpenNoteInReader={onOpenNoteInReader}
              onNoteFileChanged={onFlashNoteFileChanged}
              onReviewActiveChange={handleReviewActiveChange}
              onMergeIntoDocument={handleMergeFlashNote}
              currentDocument={reviewableDocument}
              openReviewRequest={openReviewRequest}
            />
          </section>
        ) : (
          <>
            <div className="tabs" role="tablist" aria-label="侧栏区域">
              {(["toc", "bookmarks", "search"] as SidebarTab[]).map((tab) => (
                <button
                  key={tab}
                  id={`${tab}-tab`}
                  role="tab"
                  aria-selected={sidebarTab === tab}
                  aria-controls={`${tab}-panel`}
                  className={sidebarTab === tab ? "active" : ""}
                  onClick={() => setSidebarTab(tab)}
                >
                  {tabLabels[tab]}
                </button>
              ))}
            </div>
            {sidebarTab === "toc" && manifest ? (
              <section id="toc-panel" role="tabpanel" aria-labelledby="toc-tab">
                <TocPanel
                  headings={
                    renderedChapter?.headings?.length
                      ? renderedChapter.headings
                      : session?.source
                        ? extractHeadingsFromSource(session.source)
                        : []
                  }
                  activeHeadingId={activeHeadingId}
                  bookmarkedHeadingIds={bookmarkedHeadingIds}
                  onJump={jumpToHeading}
                />
              </section>
            ) : null}
            {sidebarTab === "bookmarks" && manifest ? (
              <section id="bookmarks-panel" role="tabpanel" aria-labelledby="bookmarks-tab">
                <BookmarkPanel
                  bookmarks={bookmarks}
                  manifest={manifest}
                  onJump={jumpBookmark}
                  onDelete={(bookmarkId) =>
                    persistBookmarks(bookmarks.filter((item) => item.id !== bookmarkId))
                  }
                />
              </section>
            ) : null}
            {sidebarTab === "search" && manifest ? (
              <section id="search-panel" role="tabpanel" aria-labelledby="search-tab">
                <SearchPanel
                  query={searchQuery}
                  results={searchResults}
                  activeResultId={activeSearchMatchId}
                  scope={searchScope}
                  onScopeChange={setSearchScope}
                  vaultDocCount={manifest?.chapters?.length}
                  onQueryChange={onQueryChange}
                  onJump={handleSearchJump}
                />
              </section>
            ) : null}
            {sidebarTab === "backlinks" ? (
              <section id="backlinks-panel" role="tabpanel" aria-labelledby="backlinks-tab">
                <BacklinksPanel
                  currentTitle={backlinks.currentDocTitle}
                  currentPath={session?.absolutePath || session?.fileName}
                  currentDocId={session?.chapterId}
                  linkedReferences={backlinks.currentLinkedReferences}
                  unlinkedMentions={backlinks.currentUnlinkedMentions}
                  onJumpToSource={backlinks.handleJumpToBacklink}
                  onConvertMention={backlinks.handleConvertMention}
                  graphData={backlinks.graphData}
                  theme={theme}
                  onOpenGlobalGraph={onOpenGlobalGraph}
                />
              </section>
            ) : null}
          </>
        )}
      </aside>
      <div
        className={`layout-resizer ${resizingType === "sidebar" ? "is-active" : ""}`}
        onMouseDown={handleSidebarResizeMouseDown}
        onDoubleClick={handleSidebarDoubleClick}
        role="separator"
        aria-orientation="vertical"
        title="拖拽调整大纲侧栏宽度（双击自适应最佳宽度）"
      />
    </>
  );
}
