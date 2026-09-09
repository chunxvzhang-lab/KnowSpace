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
};

export type BookManifest = {
  id: string;
  title: string;
  description?: string;
  rootPath?: string;
  chapters: ChapterManifest[];
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
