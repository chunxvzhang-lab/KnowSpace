import { memo, useMemo } from "react";
import type { EditorViewMode } from "../core/types";
import { Check, Edit3, ShieldAlert, Cpu } from "lucide-react";

type StatusBarProps = {
  fileName?: string;
  chapterTitle?: string;
  source?: string;
  isDirty?: boolean;
  writable?: boolean;
  lineEnding?: string;
  viewMode: EditorViewMode;
  isLargeDocument?: boolean;
};

export const StatusBar = memo(function StatusBar({
  fileName,
  chapterTitle,
  source = "",
  isDirty = false,
  writable = true,
  lineEnding = "LF",
  viewMode,
  isLargeDocument = false,
}: StatusBarProps) {
  /*
   * The stats read the whole document: on the 100k perf corpus the naive
   * `source.trim().split(/\s+/)` cost ~3.5ms per render, and the 2-4 profile
   * caught StatusBar re-rendering through every heading change of a scroll
   * burst (140ms over 120 frames) even though `source` never moved. useMemo
   * keeps it to once per actual content change; memo (the export) keeps
   * unrelated parent commits from running this component at all.
   */
  const { charCount, wordCount, readTimeMin } = useMemo(() => {
    const chars = source.length;
    const trimmed = source.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    return { charCount: chars, wordCount: words, readTimeMin: Math.max(1, Math.ceil(chars / 400)) };
  }, [source]);

  const viewModeLabel: Record<EditorViewMode, string> = {
    read: "阅读视图",
    split: "分屏协作",
    source: "源码编辑",
    mindmap: "思维导图",
    canvas: "空间白板",
  };

  return (
    <footer className="status-bar" aria-label="状态信息栏">
      {/* Left info: Chapter & Save Status */}
      <div className="status-item status-file">
        {writable ? (
          isDirty ? (
            <span className="status-badge dirty" title="有未保存的修改">
              <Edit3 size={11} />
              <span>未保存</span>
            </span>
          ) : (
            <span className="status-badge saved" title="所有修改已保存">
              <Check size={11} />
              <span>已保存</span>
            </span>
          )
        ) : (
          <span className="status-badge readonly" title="只读文档">
            <ShieldAlert size={11} />
            <span>只读</span>
          </span>
        )}
        <span className="status-filename" title={fileName ?? chapterTitle}>
          {fileName ?? chapterTitle ?? "就绪"}
        </span>
      </div>

      {/* Center info: Stats & Read time */}
      <div className="status-item status-metrics">
        {charCount > 0 && (
          <>
            <span className="status-metric">{charCount.toLocaleString()} 字符</span>
            <span className="status-separator">•</span>
            <span className="status-metric">{wordCount.toLocaleString()} 词</span>
            <span className="status-separator">•</span>
            <span className="status-metric">约 {readTimeMin} 分钟阅读</span>
          </>
        )}
        {isLargeDocument && (
          <>
            <span className="status-separator">•</span>
            <span className="status-metric warning">大文档优化</span>
          </>
        )}
      </div>

      {/* Right info: Mode, Encoding, Format */}
      <div className="status-item status-tech">
        <span className="status-pill">{viewModeLabel[viewMode]}</span>
        <span className="status-pill">{lineEnding.toUpperCase()}</span>
        <span className="status-pill">UTF-8</span>
        <span className="status-brand">
          <Cpu size={11} />
          <span>KnowSpace</span>
        </span>
      </div>
    </footer>
  );
});
