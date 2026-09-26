import { ChevronRight, FileText, Folder, FolderOpen, FolderMinus, Edit3, Import, ListTree, Boxes } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { describeScanTruncation, describeScanUnreadable } from "../core/scanNotice";
import type { BookManifest, ChapterManifest } from "../core/types";

type ChapterListProps = {
  manifest: BookManifest;
  activeChapterId: string;
  isDirty?: boolean;
  onSelectChapter: (chapterId: string) => void;
  onRenameChapter?: (chapter: ChapterManifest) => void;
  onNewMindmap?: () => void;
  onNewCanvas?: () => void;
  /**
   * Imports an outline another app wrote, as a new document.
   *
   * Offered beside the other ways of making a document rather than in the mind
   * map's own toolbar, because that is what it does: it adds a document to the
   * directory, and the map of it is whatever the outline says.
   */
  onImportOutline?: () => void;
};

type TreeNode = {
  name: string;
  path: string;
  children: TreeNode[];
  chapter?: ChapterManifest;
  /**
   * Whether this entry is hidden by naming convention.
   *
   * A node is hidden if its own name starts with a dot, or if its document is —
   * which covers a file inside a hidden folder, since the manifest marks those
   * too. Kept on the node rather than recomputed from `name` so a folder and the
   * documents under it cannot disagree about it.
   */
  hidden: boolean;
};

export const ChapterList = memo(function ChapterList({
  manifest,
  activeChapterId,
  isDirty = false,
  onSelectChapter,
  onRenameChapter,
  onNewMindmap,
  onNewCanvas,
  onImportOutline,
}: ChapterListProps) {
  const activeChapter = useMemo(
    () => manifest.chapters.find((chapter) => chapter.id === activeChapterId),
    [activeChapterId, manifest.chapters],
  );
  // By default, hide Space flash notes from the main document directory tree unless currently opened
  const filteredChapters = useMemo(() => {
    const isCurrentInSpace = Boolean(activeChapter?.src && activeChapter.src.replace(/\\/g, "/").toLowerCase().startsWith("space/"));
    return manifest.chapters.filter((ch) => {
      const isSpace = ch.src.replace(/\\/g, "/").toLowerCase().startsWith("space/");
      return !isSpace || isCurrentInSpace;
    });
  }, [manifest.chapters, activeChapter?.src]);

  const tree = useMemo(() => buildTree(filteredChapters), [filteredChapters]);
  const defaultOpen = useMemo(() => collectParentFolderPaths(activeChapter?.src), [activeChapter?.src]);
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set(defaultOpen));

  useEffect(() => {
    setOpenFolders((current) => new Set([...current, ...defaultOpen]));
  }, [defaultOpen, manifest.id]);

  function toggleFolder(path: string) {
    setOpenFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  /**
   * What to say when the tree is not the whole folder.
   *
   * A partial tree that says nothing is worse than no tree: the missing files
   * are ones the reader wrote and expects to see, and "they are not there" has
   * one obvious explanation, which is the wrong one. So anything that kept the
   * walk from the truth is announced in the place the documents would have been.
   *
   * Both can apply at once — a scan can stop at the file ceiling *and* have
   * passed over a folder it could not open — so this is a list, not one line.
   */
  const scanNotices = useMemo(() => {
    const notices: string[] = [];
    const truncated = describeScanTruncation(manifest.scanTruncated);
    if (truncated) notices.push(truncated);
    const unreadable = describeScanUnreadable(manifest.scanUnreadable);
    if (unreadable) notices.push(unreadable);
    return notices;
  }, [manifest.scanTruncated, manifest.scanUnreadable]);

  return (
    <aside className="chapter-list file-tree" aria-label="文档目录">
      <div className="tree-heading">
        <span>DOCUMENT</span>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          {onNewMindmap && (
            <button
              type="button"
              className="tree-action-btn"
              onClick={onNewMindmap}
              title="新建思维导图 (Ctrl+M)"
              aria-label="新建思维导图"
            >
              <ListTree size={13} />
            </button>
          )}
          {onNewCanvas && (
            <button
              type="button"
              className="tree-action-btn"
              onClick={onNewCanvas}
              title="新建空间白板 (.canvas)"
              aria-label="新建空间白板"
            >
              <Boxes size={13} />
            </button>
          )}
          {onImportOutline && (
            <button
              type="button"
              className="tree-action-btn"
              onClick={onImportOutline}
              title="导入大纲（OPML / FreeMind）为新文档"
              aria-label="导入大纲"
            >
              <Import size={13} />
            </button>
          )}
          {openFolders.size > 0 && (
            <button
              type="button"
              className="tree-action-btn"
              onClick={() => setOpenFolders(new Set())}
              title="全部收起"
              aria-label="全部收起文件夹"
            >
              <FolderMinus size={13} />
            </button>
          )}
        </div>
      </div>
      <nav>
        {tree.length ? (
          tree.map((node) => (
            <TreeRow
              key={node.path}
              node={node}
              depth={0}
              activeChapterId={activeChapterId}
              isDirty={isDirty}
              openFolders={openFolders}
              onToggleFolder={toggleFolder}
              onSelectChapter={onSelectChapter}
              onRenameChapter={onRenameChapter}
            />
          ))
        ) : (
          <p className="muted-panel">没有 Markdown 文件。</p>
        )}
      </nav>
      {scanNotices.length > 0 ? (
        <div className="tree-scan-notice">
          {scanNotices.map((notice) => (
            <p key={notice} title={notice}>
              {notice}
            </p>
          ))}
        </div>
      ) : null}
    </aside>
  );
});

function TreeRow({
  node,
  depth,
  activeChapterId,
  isDirty,
  openFolders,
  onToggleFolder,
  onSelectChapter,
  onRenameChapter,
}: {
  node: TreeNode;
  depth: number;
  activeChapterId: string;
  isDirty: boolean;
  openFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectChapter: (chapterId: string) => void;
  onRenameChapter?: (chapter: ChapterManifest) => void;
}) {
  const isFolder = node.children.length > 0 && !node.chapter;
  const isOpen = openFolders.has(node.path);

  if (isFolder) {
    return (
      <div>
        <button
          className="tree-row folder-row"
          style={{ "--tree-depth": depth } as React.CSSProperties}
          onClick={() => onToggleFolder(node.path)}
        >
          <ChevronRight className={isOpen ? "folder-caret open" : "folder-caret"} size={12} />
          {isOpen ? <FolderOpen size={13} /> : <Folder size={13} />}
          <span className={`tree-row-name${node.hidden ? " is-hidden" : ""}`}>{node.name}</span>
        </button>
        {isOpen
          ? node.children.map((child) => (
              <TreeRow
                key={child.path}
                node={child}
                depth={depth + 1}
                activeChapterId={activeChapterId}
                isDirty={isDirty}
                openFolders={openFolders}
                onToggleFolder={onToggleFolder}
                onSelectChapter={onSelectChapter}
                onRenameChapter={onRenameChapter}
              />
            ))
          : null}
      </div>
    );
  }

  if (!node.chapter) return null;
  const isActive = node.chapter.id === activeChapterId;

  return (
    <div
      className={`tree-row-wrapper ${isActive ? "is-active" : ""}`}
      style={{ "--tree-depth": depth } as React.CSSProperties}
    >
      <button
        type="button"
        className={isActive ? "tree-row file-row active" : "tree-row file-row"}
        onClick={() => onSelectChapter(node.chapter!.id)}
        title={node.chapter.src}
      >
        {node.name.toLowerCase().endsWith(".canvas") ? (
          <Boxes size={13} color="#10b981" />
        ) : node.name.toLowerCase().endsWith(".mindmap.md") ? (
          <ListTree size={13} color="#06b6d4" />
        ) : (
          <FileText size={13} />
        )}
        <span className={`tree-file-title tree-row-name${node.hidden ? " is-hidden" : ""}`}>
          {fileLabel(node.name)}
        </span>
        {isActive && isDirty && <span className="tree-dirty-dot" title="未保存" />}
      </button>
      {onRenameChapter && (
        <button
          type="button"
          className="tree-rename-btn"
          title="重命名文档"
          aria-label={`重命名 ${node.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRenameChapter(node.chapter!);
          }}
        >
          <Edit3 size={11} />
        </button>
      )}
    </div>
  );
}

/**
 * Builds the folder tree the sidebar renders.
 *
 * Siblings are looked up through a map rather than scanned. The obvious shape —
 * `current.children.find(child => child.path === path)` — is O(siblings) per
 * document, so a folder holding a few thousand notes at one level costs a
 * quadratic number of string comparisons every time the tree is rebuilt, which
 * is on every manifest change.
 *
 * The path is accumulated as the walk descends instead of being re-sliced and
 * re-joined at each level, which also drops a per-level array allocation.
 */
function buildTree(chapters: ChapterManifest[]): TreeNode[] {
  const root: TreeNode = { name: "root", path: "", children: [], hidden: false };
  /** Each node's children, keyed by their own path. */
  const childrenByPath = new Map<TreeNode, Map<string, TreeNode>>();
  childrenByPath.set(root, new Map());

  for (const chapter of chapters) {
    const parts = chapter.src.replace(/\\/g, "/").split("/").filter(Boolean);
    // A document is hidden if its own name is, or any folder above it is — the
    // manifest carries the whole-path answer, so read it rather than re-deriving
    // it from the last segment.
    const documentHidden = chapter.hidden === true || parts.some((part) => part.startsWith("."));
    let current = root;
    let path = "";

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      path = path ? `${path}/${part}` : part;
      const isLeaf = index === parts.length - 1;

      const siblings = childrenByPath.get(current)!;
      let child = siblings.get(path);
      if (!child) {
        child = {
          name: part,
          path,
          children: [],
          hidden: part.startsWith(".") || (isLeaf && documentHidden),
        };
        siblings.set(path, child);
        current.children.push(child);
        childrenByPath.set(child, new Map());
      }
      if (isLeaf) child.chapter = chapter;
      current = child;
    }
  }
  sortNodes(root.children);
  return root.children;
}

/**
 * Orders each folder's contents.
 *
 * Hidden entries sort as a block after the visible ones, and that is the point
 * of it rather than an incidental detail: turning the hidden-file preference on
 * appends a section instead of interleaving. A reader who had a tree they knew
 * should not find a document moved because a *different* one was revealed.
 *
 * The folder-before-file rule then applies inside each block, so the shape of
 * the visible tree is exactly what it was with the preference off.
 */
function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
    const aFolder = a.children.length > 0 && !a.chapter;
    const bFolder = b.children.length > 0 && !b.chapter;
    if (aFolder !== bFolder) return aFolder ? -1 : 1;
    return a.name.localeCompare(b.name, "zh-Hans-CN", { numeric: true });
  });
  nodes.forEach((node) => sortNodes(node.children));
}

function collectParentFolderPaths(src?: string): string[] {
  if (!src) return [];
  const parts = src.replace(/\\/g, "/").split("/").filter(Boolean);
  const paths: string[] = [];
  for (let index = 1; index < parts.length; index += 1) {
    paths.push(parts.slice(0, index).join("/"));
  }
  return paths;
}

function fileLabel(name: string): string {
  return name.replace(/\.(md|markdown)$/i, ".md");
}
