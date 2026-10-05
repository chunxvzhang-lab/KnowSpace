import type { Bookmark, ChapterManifest, ReadingPosition, ThemeMode } from "../core/types";

const BOOKMARKS_V1_KEY = "bookmd.bookmarks.v1";
const BOOKMARKS_V2_KEY = "bookmd.bookmarks.v2";
const POSITIONS_V1_KEY = "bookmd.positions.v1";
const POSITIONS_V2_KEY = "bookmd.positions.v2";
/**
 * 主题偏好的存储键。**必须与 `index.html` 里「挂载前应用主题」引导脚本读的同一个键**：
 * 那段脚本要在打包之前同步运行、无法 import 这里，所以键名、别名表、缺省值都是**复制品**——
 * 复制品必须有成对断言（规则 5）。守卫 `src/__tests__/boot-theme.test.ts` 取出脚本正文，
 * 用同一批存储内容跑两边比对结果。改这里忘改脚本 = 首帧又闪一次，且没有任何编译期信号。
 */
export const PREFS_KEY = "bookmd.preferences.v1";
/** 没有偏好（或存储坏了）时的缺省主题。 */
export const DEFAULT_THEME: ThemeMode = "system";
/**
 * 遗留主题取值 → 现在的取值。`ThemeMode` 里没有 `"dark"`——那个深色项改名叫
 * `"twitter"`，但老用户的 localStorage 里还写着 `"dark"`，读出来必须折一次。
 * 用 `Map` 而不是对象：存储里的键是用户给的任意字符串，对象查表会摸到
 * `Object.prototype` 上的东西（`"constructor"` 这类），Map 不会。
 */
export const THEME_ALIASES = new Map<string, ThemeMode>([["dark", "twitter"]]);
const MINDMAP_COLLAPSED_KEY = "bookmd.mindmap.collapsed.v1";
const MINDMAP_THEME_KEY = "bookmd.mindmap.theme.v1";
const MINDMAP_LAYOUT_KEY = "bookmd.mindmap.layout.v1";
const MINDMAP_NUMBERING_KEY = "bookmd.mindmap.numbering.v1";

/**
 * Duplicated from the theme module rather than imported.
 *
 * Importing it would make this service depend on the theme table, and storage
 * has no business knowing what themes exist — it is the one place in the app
 * that should stay ignorant of them. The coupling would also be circular in
 * spirit: the theme module is what tells a stored id whether it is valid.
 */
const DEFAULT_MINDMAP_THEME_ID = "classic";

/** Duplicated from the layout module, for the same reason as the theme id. */
const DEFAULT_MINDMAP_LAYOUT_ID = "logic";

export type Preferences = {
  theme: ThemeMode;
  fontScale: number;
  showLineNumbers?: boolean;
  flashCapsuleShortcut?: string;
  /**
   * Whether documents hidden by a leading dot appear in the directory tree.
   *
   * Off by default, which is what the app did before the preference existed — a
   * vault that never asked for hidden files sees exactly the tree it saw before.
   * Names that are tooling rather than documents (`.git`, `node_modules`, build
   * output) are skipped whatever this says; see `ignoredDirectoryNames`.
   */
  showHiddenFiles?: boolean;
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

export function loadReadingPosition(
  bookId: string,
  chapters?: ChapterManifest[],
): ReadingPosition | null {
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
    theme: DEFAULT_THEME,
    fontScale: 1,
    showLineNumbers: true,
    flashCapsuleShortcut: "Alt+Space",
    showHiddenFiles: false,
  };
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    // 别名表与缺省值的写法与 index.html 的引导脚本一一对应（boot-theme.test.ts 逐值比对）。
    // 必须用 `.get()`：`THEME_ALIASES["constructor"]` 会摸到原型上那个函数并当成主题返回。
    const theme: ThemeMode =
      raw.theme == null ? DEFAULT_THEME : (THEME_ALIASES.get(String(raw.theme)) ?? raw.theme);
    const showLineNumbers = raw.showLineNumbers !== undefined ? Boolean(raw.showLineNumbers) : true;
    const showHiddenFiles =
      raw.showHiddenFiles !== undefined ? Boolean(raw.showHiddenFiles) : false;
    const flashCapsuleShortcut =
      typeof raw.flashCapsuleShortcut === "string" && raw.flashCapsuleShortcut.trim()
        ? raw.flashCapsuleShortcut.trim()
        : "Alt+Space";
    return { ...fallback, ...raw, theme, showLineNumbers, showHiddenFiles, flashCapsuleShortcut };
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

/**
 * The chosen layout, keyed by document.
 *
 * Also per document, and for the same reason as the theme: a wide map with many
 * branches wants sides, a narrow outline reads better as one column, and that is
 * a decision about the document rather than about the application.
 *
 * Stored as a bare id. Deciding whether an id still names a layout belongs to
 * the layout module, which has the table.
 */
export function loadMindmapLayout(docKey: string): string | null {
  const all = readRecord<string>(MINDMAP_LAYOUT_KEY);
  const id = all[docKey];
  return typeof id === "string" && id ? id : null;
}

export function saveMindmapLayout(docKey: string, layoutId: string): void {
  const all = readRecord<string>(MINDMAP_LAYOUT_KEY);
  if (layoutId === DEFAULT_MINDMAP_LAYOUT_ID) {
    // The default is what a document gets with no entry at all, so writing it
    // would only leave a key behind for every document ever opened.
    delete all[docKey];
  } else {
    all[docKey] = layoutId;
  }
  writeRecord(MINDMAP_LAYOUT_KEY, all);
}

/**
 * Whether outline numbers are shown for a document.
 *
 * Per document, like the layout and the theme, and for the same sort of reason:
 * whether a map wants numbering is a judgement about that map's contents rather
 * than about the application. Off is the default, so off is stored as the
 * absence of an entry — a document nobody has numbered leaves no trace behind.
 *
 * Kept as view state rather than in the companion file, although the plan listed
 * it as a switch to live there. It decides how the map is drawn and nothing about
 * what the document carries, which is the line the companion file is drawn
 * along; the same reading moved the folds here in M0.7, and the consequence is
 * the same — a reader who opens the document elsewhere loses the preference and
 * nothing else.
 */
export function loadMindmapNumbering(docKey: string): boolean {
  return readRecord<boolean>(MINDMAP_NUMBERING_KEY)[docKey] === true;
}

export function saveMindmapNumbering(docKey: string, on: boolean): void {
  const all = readRecord<boolean>(MINDMAP_NUMBERING_KEY);
  if (on) {
    all[docKey] = true;
  } else {
    delete all[docKey];
  }
  writeRecord(MINDMAP_NUMBERING_KEY, all);
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

function migrateReadingPosition(
  position: ReadingPosition,
  chapters?: ChapterManifest[],
): ReadingPosition | null {
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
  const matchingChapter = chapters.find(
    (c) => c.id === position.chapterId || c.src === position.chapterSrc,
  );
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
