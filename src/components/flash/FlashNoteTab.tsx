import React from "react";
import { Zap, Check, Hash, Link, Clock, Lightbulb, Sparkles } from "lucide-react";
import type { RefObject } from "react";
import type { WikiSuggestState } from "./useWikiLinkSuggest";

export type FlashSaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * 速记 Tab：快捷插入工具条、正文输入区（含 [[ 双链联想下拉）与底部归档栏。
 * 从 FlashCapsule 逐字搬出，仅改为 prop 驱动。
 */
export function FlashNoteTab(props: {
  content: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  wikiSuggestState: WikiSuggestState;
  onContentChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onInsertWikiSuggestion: (title: string) => void;
  insertSnippet: (snippet: string) => void;
  onInsertTime: () => void;
  persistentContent: string;
  onInsertPersistentToNote: () => void;
  statusMessage: string;
  saveStatus: FlashSaveStatus;
  onClose: () => void;
  onSave: () => void;
}) {
  const {
    content,
    textareaRef,
    wikiSuggestState,
    onContentChange,
    onKeyDown,
    onInsertWikiSuggestion,
    insertSnippet,
    onInsertTime,
    persistentContent,
    onInsertPersistentToNote,
    statusMessage,
    saveStatus,
    onClose,
    onSave,
  } = props;

  return (
    <>
      {/* Quick Insertion Tools Bar */}
      <div className="flash-tools-bar">
        <button
          type="button"
          className="flash-tool-tag"
          onClick={() => insertSnippet("- [ ] ")}
          title="插入待办复选框"
        >
          <Check size={13} /> 待办
        </button>
        <button
          type="button"
          className="flash-tool-tag"
          onClick={() => insertSnippet("#")}
          title="插入标签"
        >
          <Hash size={13} /> 标签
        </button>
        <button
          type="button"
          className="flash-tool-tag"
          onClick={() => insertSnippet("[[")}
          title="关联双链"
        >
          <Link size={13} /> 双链
        </button>
        <button
          type="button"
          className="flash-tool-tag"
          onClick={onInsertTime}
          title="插入当前时间"
        >
          <Clock size={13} /> 时间
        </button>
        <button
          type="button"
          className="flash-tool-tag"
          onClick={() => insertSnippet("> 💡 ")}
          title="灵感重点"
        >
          <Lightbulb size={13} /> 灵感
        </button>
        {persistentContent.trim() && (
          <button
            type="button"
            className="flash-tool-tag flash-tool-insert-persistent"
            onClick={onInsertPersistentToNote}
            title="一键插入常驻便签/提示模板内容"
          >
            <Sparkles size={13} className="text-orange" /> 引用常驻模板
          </button>
        )}
      </div>

      {/* Text Input Area */}
      <div className="flash-input-wrapper" style={{ position: "relative" }}>
        <textarea
          ref={textareaRef}
          className="flash-textarea"
          placeholder="捕捉此刻灵感火花、临时待办或知识线索... (键入 [[ 关联双链，Ctrl + Enter 瞬时归档)"
          value={content}
          onChange={onContentChange}
          onKeyDown={onKeyDown}
          rows={5}
        />

        {/* WikiLink Autocomplete Dropdown */}
        {wikiSuggestState.isOpen && (
          <div className="flash-wikilink-dropdown">
            <div className="flash-wikilink-header">
              <span>关联双向链接</span>
              <span className="hint">↑↓ 选词 · Enter 插入 · Esc 取消</span>
            </div>
            <div className="flash-wikilink-list">
              {wikiSuggestState.filtered.map((item, idx) => (
                <button
                  key={item}
                  type="button"
                  className={`flash-wikilink-item ${idx === wikiSuggestState.selectedIndex ? "active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onInsertWikiSuggestion(item);
                  }}
                >
                  <Link size={12} className="text-cyan" />
                  <span>{item}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Bar */}
      <div className="flash-footer">
        <div className="flash-footer-left">
          <span className="flash-char-count">{content.length} 字</span>
          {statusMessage && (
            <span className={`flash-status-msg ${saveStatus}`}>{statusMessage}</span>
          )}
        </div>

        <div className="flash-footer-right">
          <button type="button" className="flash-btn flash-btn-secondary" onClick={onClose}>
            取消 (Esc)
          </button>
          <button
            type="button"
            className="flash-btn flash-btn-primary flash-save-btn"
            onClick={onSave}
            disabled={saveStatus === "saving"}
          >
            <Zap size={14} />
            <span>瞬时归档 (Ctrl+↵)</span>
          </button>
        </div>
      </div>
    </>
  );
}
