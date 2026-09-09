import { ChevronRight, FileText, Folder, FolderOpen, FolderMinus, Edit3, ListTree, Boxes } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BookManifest, ChapterManifest } from "../core/types";

type ChapterListProps = {
  manifest: BookManifest;
  activeChapterId: string;
  isDirty?: boolean;
  onSelectChapter: (chapterId: string) => void;
  onRenameChapter?: (chapter: ChapterManifest) => void;
  onNewMindmap?: () => void;
  onNewCanvas?: () => void;
};

type TreeNode = {
  name: string;
  path: string;
  children: TreeNode[];
  chapter?: ChapterManifest;
};

export function ChapterList({
  manifest,
  activeChapterId,
  isDirty = false,
  onSelectChapter,
  onRenameChapter,
  onNewMindmap,
  onNewCanvas,
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
    </aside>
  );
}

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
          <span>{node.name}</span>
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
        <span className="tree-file-title">{fileLabel(node.name)}</span>
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

function buildTree(chapters: ChapterManifest[]): TreeNode[] {
  const root: TreeNode = { name: "root", path: "", children: [] };
  for (const chapter of chapters) {
    const parts = chapter.src.replace(/\\/g, "/").split("/").filter(Boolean);
    let current = root;
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/");
      let child = current.children.find((item) => item.path === path);
      if (!child) {
        child = { name: part, path, children: [] };
        current.children.push(child);
      }
      if (index === parts.length - 1) child.chapter = chapter;
      current = child;
    });
  }
  sortNodes(root.children);
  return root.children;
}

function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
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
