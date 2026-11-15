import { FilePlus2, FileText, FolderOpen, ListTree, Boxes, Files } from "lucide-react";
import { useUiStore } from "../store/useUiStore";

type EmptyReaderProps = {
  /** The shell's reader container ref — the empty state IS the reader viewport. */
  readerRef: { current: HTMLElement | null };
  createNewFile: () => void;
  createNewMindmap: () => void;
  createNewCanvas: () => void;
  openMarkdownDirectory: () => void;
};

/**
 * The no-document home screen. Desktop-only actions are hidden rather than
 * disabled: in a plain browser there is no vault to create into, and a card
 * that opens a save dialog is honest only when a filesystem exists behind it.
 */
export function EmptyReader({
  readerRef,
  createNewFile,
  createNewMindmap,
  createNewCanvas,
  openMarkdownDirectory,
}: EmptyReaderProps) {
  const setTemplateDialogOpen = useUiStore((s) => s.setTemplateDialogOpen);
  return (
    <main className="empty-reader" ref={readerRef}>
      <div className="empty-reader-card">
        <div className="empty-reader-eyebrow">KNOWSPACE · 个人知识工作台</div>
        <h1 className="empty-reader-title">选择或新建 Markdown 文档</h1>
        <p className="empty-reader-desc">
          从一篇笔记开始，让知识逐渐相连。阅读与写作、思维导图、空间白板和AI 助理，都在这里。
        </p>
        <div className="empty-actions-grid">
          {window.bookMDDesktop ? (
            <button type="button" className="empty-action-card" onClick={createNewFile}>
              <FilePlus2 size={22} className="about-icon text-orange" />
              <span>新建 Markdown</span>
            </button>
          ) : null}
          {window.bookMDDesktop ? (
            <button
              type="button"
              className="empty-action-card"
              onClick={() => setTemplateDialogOpen(true)}
            >
              <Files size={22} className="about-icon text-blue" />
              <span>从模板新建</span>
            </button>
          ) : null}
          {window.bookMDDesktop ? (
            <button type="button" className="empty-action-card" onClick={createNewMindmap}>
              <ListTree size={22} className="about-icon text-cyan" />
              <span>新建思维导图</span>
            </button>
          ) : null}
          {window.bookMDDesktop ? (
            <button type="button" className="empty-action-card" onClick={createNewCanvas}>
              <Boxes size={22} className="about-icon text-emerald" />
              <span>新建空间白板</span>
            </button>
          ) : null}
          <button
            type="button"
            className="empty-action-card"
            onClick={() => {
              document.querySelector<HTMLInputElement>("input[type='file']")?.click();
            }}
          >
            <FileText size={22} className="about-icon text-blue" />
            <span>打开单文件</span>
          </button>
          {window.bookMDDesktop ? (
            <button type="button" className="empty-action-card" onClick={openMarkdownDirectory}>
              <FolderOpen size={22} className="about-icon text-purple" />
              <span>打开文档目录</span>
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
