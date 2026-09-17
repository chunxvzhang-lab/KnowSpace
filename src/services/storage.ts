import type { Bookmark, ChapterManifest, ReadingPosition, ThemeMode } from "../core/types";

const BOOKMARKS_V1_KEY = "bookmd.bookmarks.v1";
const BOOKMARKS_V2_KEY = "bookmd.bookmarks.v2";
const POSITIONS_V1_KEY = "bookmd.positions.v1";
const POSITIONS_V2_KEY = "bookmd.positions.v2";
const PREFS_KEY = "bookmd.preferences.v1";
const MINDMAP_COLLAPSED_KEY = "bookmd.mindmap.collapsed.v1";
const MINDMAP_THEME_KEY = "bookmd.mindmap.theme.v1";

/**
 * Duplicated from the theme module rather than imported.
 *
 * Importing it would make this service depend on the theme table, and storage
 * has no business knowing what themes exist — it is the one place in the app
 * that should stay ignorant of them. The coupling would also be circular in
 * spirit: the theme module is what tells a stored id whether it is valid.
 */
const DEFAULT_MINDMAP_THEME_ID = "classic";

export type Preferences = {
  theme: ThemeMode;
  fontScale: number;
  showLineNumbers?: boolean;
  flashCapsuleShortcut?: string;
};

export function loadBookmarks(bookId: string, chapters?: ChapterManifest[]): Bookmark[] {
  const allV2 = readRecord<Bookmark[]>(BOOKMARKS_V2_KEY);
  if (allV2[bookId]) {
    return allV2[bookId];
  }

  // Check V1 for migration
  const allV1 = readRecord<Bookmark[]>(BOOKMARKS_V1_KEY);
  const v1Bookmarks = allV1[bookId];
  if (v1Bookmarks && Array.isArray(v1Bookmarks)) {
    const migrated = migrateBookmarks(v1Bookmarks, chapters);
    allV2[bookId] = migrated;
    writeRecord(BOOKMARKS_V2_KEY, allV2);
    return migrated;
  }

  return [];
}

export function saveBookmarks(bookId: string, items: Bookmark[]): void {
  const all = readRecord<Bookmark[]>(BOOKMARKS_V2_KEY);
  all[bookId] = items;
  writeRecord(BOOKMARKS_V2_KEY, all);
}

export function loadReadingPosition(bookId: string, chapters?: ChapterManifest[]): ReadingPosition | null {
  const allV2 = readRecord<ReadingPosition>(POSITIONS_V2_KEY);
  if (allV2[bookId]) {
    return allV2[bookId];
  }

  // Check V1 for migration
  const allV1 = readRecord<ReadingPosition>(POSITIONS_V1_KEY);
  const v1Position = allV1[bookId];
  if (v1Position) {
    const migrated = migrateReadingPosition(v1Position, chapters);
    if (migrated) {
      allV2[bookId] = migrated;
      writeRecord(POSITIONS_V2_KEY, allV2);
      return migrated;
    }
  }

  return null;
}

export function saveReadingPosition(position: ReadingPosition): void {
  const all = readRecord<ReadingPosition>(POSITIONS_V2_KEY);
  all[position.bookId] = position;
  writeRecord(POSITIONS_V2_KEY, all);
}

export function loadPreferences(): Preferences {
  const fallback: Preferences = {
    theme: "system",
    fontScale: 1,
    showLineNumbers: true,
    flashCapsuleShortcut: "Alt+Space",
  };
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    const theme: ThemeMode = raw.theme === "dark" ? "twitter" : (raw.theme ?? "system");
    const showLineNumbers = raw.showLineNumbers !== undefined ? Boolean(raw.showLineNumbers) : true;
    const flashCapsuleShortcut = typeof raw.flashCapsuleShortcut === "string" && raw.flashCapsuleShortcut.trim()
      ? raw.flashCapsuleShortcut.trim()
      : "Alt+Space";
    return { ...fallback, ...raw, theme, showLineNumbers, flashCapsuleShortcut };
  } catch {
    return fallback;
  }
}

export function savePreferences(preferences: Preferences): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
}

/**
 * Folded branches, keyed by document.
 *
 * Stored as node ids, which is safe because the ids are derived from the
 * document structure rather than generated fresh: the root is a fixed literal,
 * list items are `node-<path>-<index>` and headings are `heading-<line>-<text>`.
 * A set of random ids would silently empty itself on every reload.
 *
 * Keyed by path rather than title, because a vault full of `README` and `索引`
 * files would otherwise share one set of folds between all of them.
 */
/**
 * The chosen mind map theme, keyed by document.
 *
 * Per document rather than global, because a theme is a property of how a map
 * reads: a technical map and a client-facing one in the same vault can sensibly
 * want different ones, and making the choice global means every switch is a
 * decision about all of them.
 *
 * Stored as a bare id. Interpreting it is the theme module's job, and a document
 * naming a theme that no longer exists falls back there rather than here.
 */
export function loadMindmapTheme(docKey: string): string | null {
  const all = readRecord<string>(MINDMAP_THEME_KEY);
  const id = all[docKey];
  return typeof id === "string" && id ? id : null;
}

export function saveMindmapTheme(docKey: string, themeId: string): void {
  const all = readRecord<string>(MINDMAP_THEME_KEY);
  if (themeId === DEFAULT_MINDMAP_THEME_ID) {
    // The default is what a document gets with no entry at all, so writing it
    // would only leave a key behind for every document ever opened.
    delete all[docKey];
  } else {
    all[docKey] = themeId;
  }
  writeRecord(MINDMAP_THEME_KEY, all);
}

export function loadMindmapCollapsed(docKey: string): string[] {
  const all = readRecord<string[]>(MINDMAP_COLLAPSED_KEY);
  const ids = all[docKey];
  return Array.isArray(ids) ? ids : [];
}

export function saveMindmapCollapsed(docKey: string, ids: string[]): void {
  const all = readRecord<string[]>(MINDMAP_COLLAPSED_KEY);
  if (ids.length === 0) {
    // Everything expanded is the default, so an empty entry is dropped rather
    // than kept — otherwise every document ever opened leaves a key behind.
    delete all[docKey];
  } else {
    all[docKey] = ids;
  }
  writeRecord(MINDMAP_COLLAPSED_KEY, all);
}

function migrateBookmarks(bookmarks: Bookmark[], chapters?: ChapterManifest[]): Bookmark[] {
  if (!chapters || chapters.length === 0) return bookmarks;
  return bookmarks.map((b) => {
    // If chapterId is in legacy format chapter-N, map by index
    const legacyMatch = b.chapterId.match(/^chapter-(\d+)$/);
    if (legacyMatch) {
      const index = parseInt(legacyMatch[1], 10) - 1;
      const targetChapter = chapters[index];
      if (targetChapter) {
        return {
          ...b,
          chapterId: targetChapter.id,
          chapterSrc: targetChapter.src,
        };
      }
    }
    const matchingChapter = chapters.find((c) => c.id === b.chapterId || c.src === b.chapterSrc);
    if (matchingChapter) {
      return {
        ...b,
        chapterId: matchingChapter.id,
        chapterSrc: matchingChapter.src,
      };
    }
    return b;
  });
}

function migrateReadingPosition(position: ReadingPosition, chapters?: ChapterManifest[]): ReadingPosition | null {
  if (!chapters || chapters.length === 0) return position;
  const legacyMatch = position.chapterId.match(/^chapter-(\d+)$/);
  if (legacyMatch) {
    const index = parseInt(legacyMatch[1], 10) - 1;
    const targetChapter = chapters[index];
    if (targetChapter) {
      return {
        ...position,
        chapterId: targetChapter.id,
        chapterSrc: targetChapter.src,
      };
    }
  }
  const matchingChapter = chapters.find((c) => c.id === position.chapterId || c.src === position.chapterSrc);
  if (matchingChapter) {
    return {
      ...position,
      chapterId: matchingChapter.id,
      chapterSrc: matchingChapter.src,
    };
  }
  return position;
}

function readRecord<T>(key: string): Record<string, T> {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, T>) : {};
  } catch {
    return {};
  }
}

function writeRecord<T>(key: string, data: Record<string, T>): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // LocalStorage write error handling
  }
}
