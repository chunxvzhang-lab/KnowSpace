import { Bookmark, Trash2 } from "lucide-react";
import type { Bookmark as BookmarkItem, BookManifest } from "../core/types";

type BookmarkPanelProps = {
  bookmarks: BookmarkItem[];
  manifest: BookManifest;
  onJump: (bookmark: BookmarkItem) => void;
  onDelete: (bookmarkId: string) => void;
};

export function BookmarkPanel({ bookmarks, manifest, onJump, onDelete }: BookmarkPanelProps) {
  if (bookmarks.length === 0) {
    return <p className="muted-panel">还没有书签。阅读时按 Ctrl+B 保存当前位置。</p>;
  }
  return (
    <div className="bookmark-panel">
      {bookmarks.map((bookmark) => {
        const chapterTitle =
          manifest.chapters.find((chapter) => chapter.id === bookmark.chapterId)?.title ??
          bookmark.chapterId;
        return (
          <article className="bookmark-item" key={bookmark.id}>
            <button className="bookmark-main" onClick={() => onJump(bookmark)}>
              <Bookmark size={16} />
              <span>
                <strong>{bookmark.headingText || chapterTitle}</strong>
                <small>{chapterTitle}</small>
                <em>{bookmark.excerpt}</em>
              </span>
            </button>
            <button
              className="icon-button small"
              title="删除书签"
              onClick={() => onDelete(bookmark.id)}
            >
              <Trash2 size={15} />
            </button>
          </article>
        );
      })}
    </div>
  );
}
