import type { RefObject } from "react";
import { Download } from "lucide-react";

/**
 * The mind map export dropdown.
 *
 * Four formats, each a row with a title and a note naming the programs that
 * read it — which is the only reason the notes exist, since "OPML 2.0" means
 * nothing to most people and "兼容 MindNode" does.
 *
 * Holds no state of its own: whether it is open belongs to the caller, because
 * the same flag closes it on an outside click alongside the other menus.
 */
export type MindmapExportMenuProps = {
  /** Shared with the other menus, so one outside-click handler closes them all. */
  menuRef: RefObject<HTMLDivElement | null>;
  isOpen: boolean;
  onToggle: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  /**
   * Opens the print dialog, which is also where a PDF comes out.
   *
   * Not a converter: the application already prints documents through the main
   * process, and a map reuses that rather than growing a second way to make a
   * PDF.
   */
  onPrintPdf: () => void;
  /**
   * The map as an `.xmind` file — bytes rather than text, since the format is a ZIP.
   *
   * First among the outline formats here because it is the one that carries what
   * the map knows beyond its tree, and the only one this app can read back.
   */
  onExportXmind: () => void;
  onExportOpml: () => void;
  onExportFreeMind: () => void;
  onExportMarkdownOutline: () => void;
};

export function MindmapExportMenu({
  menuRef,
  isOpen,
  onToggle,
  onExportPng,
  onExportSvg,
  onPrintPdf,
  onExportXmind,
  onExportOpml,
  onExportFreeMind,
  onExportMarkdownOutline,
}: MindmapExportMenuProps) {
  // Each row closes the menu before running, so the file chooser is not opened
  // behind a menu that is still on screen.
  const rows: Array<{ title: string; description: string; run: () => void }> = [
    { title: "导出 PNG 图片", description: "高清透明背景位图 (.png)", run: onExportPng },
    {
      title: "导出 SVG 矢量图",
      description: "文字仍是文字，可编辑、可缩放印刷 (.svg)",
      run: onExportSvg,
    },
    {
      title: "打印 / 导出 PDF",
      description: "整张导图缩放到纸张上；在打印对话框里可存为 PDF",
      run: onPrintPdf,
    },
    {
      title: "导出 XMind (.xmind)",
      description: "带备注、标签、关系线与概要边界，可被本应用再读回来",
      run: onExportXmind,
    },
    { title: "导出 OPML 2.0", description: "兼容 MindNode、OmniOutliner (.opml)", run: onExportOpml },
    {
      title: "导出 FreeMind (.mm)",
      description: "兼容 XMind、FreeMind、Freeplane (.mm)",
      run: onExportFreeMind,
    },
    {
      title: "导出 Markdown 大纲",
      description: "多级层级纯文本大纲 (.md)",
      run: onExportMarkdownOutline,
    },
  ];

  return (
    <div className="mindmap-toolbar-right" ref={menuRef}>
      <div className="mindmap-export-dropdown">
        <button
          type="button"
          className={`mindmap-tool-btn text-btn export-btn ${isOpen ? "active" : ""}`}
          onClick={onToggle}
          title="导出导图为 PNG、SVG、OPML 2.0、FreeMind (.mm) 或 Markdown 大纲"
          aria-haspopup="true"
          aria-expanded={isOpen}
        >
          <Download size={14} />
          <span>导出 ▾</span>
        </button>

        {isOpen && (
          <div className="mindmap-export-menu" role="menu">
            {rows.map((row) => (
              <button
                key={row.title}
                type="button"
                className="mindmap-export-menu-item"
                role="menuitem"
                onClick={row.run}
              >
                <span className="export-item-title">{row.title}</span>
                <span className="export-item-desc">{row.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
