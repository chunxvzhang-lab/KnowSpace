export type SidebarTab = "toc" | "bookmarks" | "search" | "space" | "backlinks";
export type ThemeMode = "system" | "light" | "twitter" | "eink";
export type EditorViewMode = "read" | "split" | "source" | "mindmap" | "canvas";

export type MindmapNodeShape = "rounded" | "capsule" | "rect" | "underline";
export type MindmapLineStyle = "bezier" | "step" | "straight";
export type MindmapTextAlign = "left" | "center" | "right" | "justify";

export type MindmapNode = {
  id: string;
  text: string;
  level: number;
  line?: number;
  children: MindmapNode[];
  collapsed?: boolean;
  color?: string;
  shape?: MindmapNodeShape;
  lineColor?: string;
  lineStyle?: MindmapLineStyle;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  textColor?: string;
  borderColor?: string;
  textAlign?: MindmapTextAlign;
  customWidth?: number;
  customHeight?: number;
};

export type DiskVersion = {
  size: number;
  mtimeMs: number;
};

export type ChapterManifest = {
  id: string;
  title: string;
  src: string;
  absolutePath?: string;
  baseUrl?: string;
  /**
   * Set when the document is hidden by naming convention.
   *
   * A leading dot on the document's own name, or on any folder above it — a note
   * inside `.archive/` is hidden because the reader hid the folder. Present only
   * when true, so a manifest from a vault with no hidden documents is identical
   * to what earlier versions produced.
   *
   * The tree sorts these after the visible documents rather than by name among
   * them, so turning the preference on appends a section instead of reshuffling
   * the list the reader was already reading.
   */
  hidden?: boolean;
};

/**
 * Set when a directory walk stopped before it had seen everything.
 *
 * A scan that stopped early is otherwise indistinguishable from a folder that
 * genuinely holds nothing, and the reader's only available explanation for the
 * second is the wrong one. So the reason travels with the manifest, and the UI
 * that shows a count is the UI that qualifies it.
 */
export type ManifestScanTruncation = {
  reason: "files" | "depth" | "time";
  seen: number;
  /** Directories still queued when the file ceiling was reached. */
  remainingDirs?: number;
  /** The folder the depth limit stopped at. */
  at?: string;
};

/**
 * Directories the scan could not open.
 *
 * Kept apart from a truncation because it is a different fact and calls for a
 * different response: a truncated scan means "there is more than I showed you",
 * while this means "there is a part of your folder I could not look at". A
 * directory that fails to open returns no entries, so without this it is
 * indistinguishable from an empty one — and "empty" is the reading the reader
 * will land on, which is the wrong one.
 */
export type ManifestScanUnreadable = {
  /** How many directories could not be opened. Exact, unlike `samples`. */
  count: number;
  /** A few of them, so the reader can see which. Capped on the main side. */
  samples: string[];
  /** The errno of the first failure, e.g. `EACCES`. */
  reason: string;
};

export type BookManifest = {
  id: string;
  title: string;
  description?: string;
  rootPath?: string;
  chapters: ChapterManifest[];
  /** Present only for a walk that stopped early; absent for a complete one. */
  scanTruncated?: ManifestScanTruncation;
  /** Present only when part of the folder could not be opened. */
  scanUnreadable?: ManifestScanUnreadable;
};

export type Heading = {
  id: string;
  text: string;
  level: number;
  line?: number;
};

export type RenderedChapter = {
  html: string;
  headings: Heading[];
  frontMatter: Record<string, unknown> | null;
  checksum: string;
  plainText: string;
  hasMermaid: boolean;
};

export type Bookmark = {
  id: string;
  bookId: string;
  chapterId: string;
  chapterSrc?: string;
  headingId?: string;
  headingText?: string;
  scrollRatio: number;
  excerpt: string;
  chapterChecksum: string;
  createdAt: string;
  updatedAt: string;
};

export type BookmarkResolution = {
  bookmark: Bookmark;
  stale: boolean;
  targetHeadingId?: string;
  scrollRatio: number;
  message?: string;
};

export type ReadingPosition = {
  bookId: string;
  chapterId: string;
  chapterSrc?: string;
  headingId?: string;
  scrollRatio: number;
  updatedAt: string;
};

export type SearchResult = {
  id?: string;
  index: number;
  matchIndex?: number;
  headingId?: string;
  title: string;
  excerpt: string;
  lineNumber?: number;
  lineEndNumber?: number;
  lineOffset?: number;
  query?: string;
  matchedText?: string;
  matchCountInBlock?: number;
  chapterId?: string;
  chapterTitle?: string;
  chapterPath?: string;
  category?: "tag" | "link" | "text" | "phrase";
  tags?: string[];
  links?: string[];
  score?: number;
};

export type ChapterSource = {
  markdown: string;
  baseUrl: string;
  cacheKey?: string;
  diskVersion?: DiskVersion;
  hasBom?: boolean;
  lineEnding?: string;
  absolutePath?: string;
};

export type DocumentSession = {
  chapterId: string;
  absolutePath: string | null;
  fileName: string;
  baseUrl: string;
  source: string;
  savedSource: string;
  diskVersion: DiskVersion | null;
  sourceRevision: number;
  savedRevision: number;
  writable: boolean;
  hasBom?: boolean;
  lineEnding?: string;
};

export type FlashNotePayload = {
  content: string;
  tags?: string[];
  isTodo?: boolean;
};

export type FlashNoteSaveResult = {
  success: boolean;
  filePath?: string;
  dateStr?: string;
  error?: string;
};

/**
 * Payload for the full-screen media lightbox.
 *
 * Lives here rather than beside the component so the UI store can hold it
 * without depending on `components/` — the store sits below the components in
 * the dependency order, not above them. `MediaLightbox` re-exports it, so
 * existing imports keep working.
 *
 * `type: "mermaid"` carries `svgHtml` instead of `src`.
 */
export type LightboxMedia = {
  type: "image" | "mermaid" | "video" | "audio";
  src?: string;
  svgHtml?: string;
  alt?: string;
  title?: string;
};
