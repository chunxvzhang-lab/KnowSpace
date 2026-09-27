import React from "react";
import { Zap, StickyNote, FileText, Pin, PinOff, Keyboard, Settings, X } from "lucide-react";

/**
 * 闪念胶囊顶栏：可拖拽标题区、速记/常驻双 Tab、目标路径、图钉、热键徽标、
 * 设置与关闭按钮。从 FlashCapsule 逐字搬出，仅改为 prop 驱动。
 */
export function FlashHeader(props: {
  activeTab: "note" | "persistent";
  onSelectNoteTab: () => void;
  onSelectPersistentTab: () => void;
  targetDisplay: string;
  isPinned: boolean;
  onTogglePin: () => void;
  shortcut: string;
  isSettingsOpen: boolean;
  onToggleSettings: () => void;
  onClose: () => void;
}) {
  const {
    activeTab,
    onSelectNoteTab,
    onSelectPersistentTab,
    targetDisplay,
    isPinned,
    onTogglePin,
    shortcut,
    isSettingsOpen,
    onToggleSettings,
    onClose,
  } = props;

  return (
    <div className="flash-header" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
      <div className="flash-header-left">
        <span className="flash-logo-badge">
          <Zap size={15} className="flash-zap-icon" />
          <span className="flash-title">闪念胶囊</span>
        </span>

        {/* Segmented Tab Switcher */}
        <div
          className="flash-tab-group"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <button
            type="button"
            className={`flash-tab-btn ${activeTab === "note" ? "active" : ""}`}
            onClick={onSelectNoteTab}
            title="即时闪念速记（Ctrl+Enter 瞬时归档）"
          >
            <Zap size={12} />
            <span>闪念速记</span>
          </button>
          <button
            type="button"
            className={`flash-tab-btn ${activeTab === "persistent" ? "active" : ""}`}
            onClick={onSelectPersistentTab}
            title="常驻便签 / 提示模板（随写随存，归档不被清空）"
          >
            <StickyNote size={12} />
            <span>常驻模板</span>
          </button>
        </div>
      </div>

      <div
        className="flash-header-right"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <span
          className="flash-target-path"
          title={`自动按分钟保存至: ${targetDisplay} (同一分钟追加)`}
        >
          <FileText size={12} />
          <span>{targetDisplay}</span>
        </span>

        {/* Window Pin Toggle Button */}
        <button
          type="button"
          className={`flash-icon-btn ${isPinned ? "active pinned" : ""}`}
          onClick={onTogglePin}
          title={
            isPinned
              ? "已固定窗口：鼠标点击别处不会退出 (再次点击取消固定)"
              : "固定窗口：开启后鼠标点击外部不退出微窗"
          }
        >
          {isPinned ? <Pin size={15} className="text-orange" /> : <PinOff size={15} />}
        </button>

        {/* Hotkey Badge */}
        <button
          type="button"
          className="flash-shortcut-badge"
          onClick={onToggleSettings}
          title="点击自定义全局呼出热键与存储目录"
        >
          <Keyboard size={12} />
          <span>{shortcut}</span>
        </button>

        {/* Settings Button */}
        <button
          type="button"
          className={`flash-icon-btn ${isSettingsOpen ? "active" : ""}`}
          onClick={onToggleSettings}
          title="设置全局热键与存储路径"
        >
          <Settings size={15} />
        </button>

        {/* Close Button */}
        <button
          type="button"
          className="flash-icon-btn flash-close-btn"
          onClick={onClose}
          title="关闭微窗 (Esc)"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
