import React, { useCallback, useEffect, useRef, useState } from "react";
import { loadPreferences } from "../services/storage";
import { resolveThemeMode } from "../services/themeMode";
import type { ThemeMode } from "../core/types";
import { FlashHeader } from "./flash/FlashHeader";
import { FlashSettingsDrawer } from "./flash/FlashSettingsDrawer";
import { FlashNoteTab, type FlashSaveStatus } from "./flash/FlashNoteTab";
import { FlashPersistentTab } from "./flash/FlashPersistentTab";
import { useFlashSettings } from "./flash/useFlashSettings";
import { useFlashPersistentNote } from "./flash/useFlashPersistentNote";
import { useWikiLinkSuggest } from "./flash/useWikiLinkSuggest";
import { useFlashWindowResize } from "./flash/useFlashWindowResize";

/**
 * 闪念胶囊独立窗口的根组件（src/main.tsx 在 `?mode=flash` 时挂载）。
 *
 * 拆分后的职责边界：
 * - 域状态/订阅在 `flash/` 下的三个 hook：useFlashSettings（热键与存储域，含
 *   onFlashShortcutUpdated / onAppSettingsUpdated 订阅）、useFlashPersistentNote
 *   （350ms 防抖常驻便签）、useWikiLinkSuggest（[[ 联想 + 目标节流加载）。
 * - 视图在 `flash/` 下的四个组件：FlashHeader / FlashSettingsDrawer /
 *   FlashNoteTab / FlashPersistentTab（逐字搬出，prop 驱动）。
 * - 留在根上的是跨域的东西：主题（解析 data-theme + onThemeUpdated + storage
 *   监听）、窗口图钉、归档动作，以及横跨四个域的 onFlashFocus 订阅（热键呼出
 *   要刷新目标/主题/Space 路径并聚焦当前输入框）。窗口尺寸拖拽在
 *   useFlashWindowResize 里（rAF 节流逐字保留）。
 */
export const FlashCapsule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"note" | "persistent">("note");
  const [content, setContent] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [systemPrefersLight, setSystemPrefersLight] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: light)")?.matches ?? false,
  );
  const resolvedTheme = resolveThemeMode(theme, systemPrefersLight);
  const [saveStatus, setSaveStatus] = useState<FlashSaveStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;

  // —— 速记正文域的基础件：插入片段 / 切回速记页（被下方 hook 以参数注入复用）——
  const insertSnippet = (snippet: string) => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const prev = el.value;
    const next = prev.substring(0, start) + snippet + prev.substring(end);
    setContent(next);
    setTimeout(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  const switchToNoteTab = () => {
    setActiveTab("note");
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const selectPersistentTab = () => {
    setActiveTab("persistent");
    setTimeout(() => persistentTextareaRef.current?.focus(), 50);
  };

  const {
    shortcut,
    targetDisplay,
    isSettingsOpen,
    setIsSettingsOpen,
    isRecording,
    setIsRecording,
    recordedShortcut,
    setRecordedShortcut,
    autoLaunch,
    setAutoLaunch,
    runInBackground,
    setRunInBackground,
    spaceConfig,
    settingsError,
    settingsSuccess,
    setSettingsSuccess,
    handleShortcutKeyDown,
    applyShortcut,
    handleSelectSpaceDir,
    handleResetSpaceDir,
    refreshSpaceConfig,
  } = useFlashSettings({ noteTextareaRef: textareaRef });

  const {
    persistentContent,
    persistentFeedback,
    persistentTextareaRef,
    handlePersistentChange,
    handleCopyPersistent,
    handleClearPersistent,
    handleInsertPersistentToNote,
  } = useFlashPersistentNote({ insertSnippet, switchToNoteTab });

  const {
    wikiSuggestState,
    handleContentChange,
    insertWikiSuggestion,
    handleSuggestKeyDown,
    loadTargets,
  } = useWikiLinkSuggest({ content, setContent, textareaRef });

  const applyTheme = useCallback((t?: string) => {
    const prefs = loadPreferences();
    setTheme((t as ThemeMode) || prefs.theme || "system");
  }, []);

  // Initialize theme, and listen for theme / preference updates (main process + storage)
  useEffect(() => {
    applyTheme();

    let cleanupTheme: (() => void) | undefined;
    if (desktop?.system.onThemeUpdated) {
      cleanupTheme = desktop.system.onThemeUpdated((newTheme) => {
        applyTheme(newTheme);
      });
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === "bookmd.preferences.v1" || e.key?.includes("preferences")) {
        applyTheme();
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      cleanupTheme?.();
      window.removeEventListener("storage", onStorage);
    };
  }, [desktop, applyTheme]);

  // 主题设成"跟随系统"时，操作系统在浅色/深色之间切换必须立刻反映到配色上。
  // 改前这一步是 CSS 媒体查询自动完成的；把系统主题解析成具体主题之后，
  // 不自己监听就会出现"窗口不重开就一直用旧配色"。
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSystemPrefersLight(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // `data-theme` 也写**解析后**的主题，并且必须和 overlay 的类名一致：
  // 区块里的浅色覆盖一半写成 `.flash-capsule-overlay.theme-light …`、一半写成
  // `[data-theme="light"] …`，只解析其中一个会让另一族规则在"跟随系统 + 浅色系统"下
  // 静默失效（`.flash-dir-label`、`.flash-starter-tag` 会退回 1.3~1.5:1）。
  // 胶囊是独立窗口，这里改的是它自己的 document，不会影响主窗口。
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  // Pin status, autofocus, and the cross-domain focus subscription. The hotkey
  // focus handler refreshes targets/theme/Space path and refocuses the input —
  // it spans four domains, so it stays on the root.
  useEffect(() => {
    // Load pin status
    if (desktop?.capture.getFlashPin) {
      desktop.capture
        .getFlashPin()
        .then((res) => {
          if (res && typeof res.pinned === "boolean") {
            setIsPinned(res.pinned);
          }
        })
        .catch(() => {});
    }

    // Auto-focus textarea on mount
    textareaRef.current?.focus();
    requestAnimationFrame(() => textareaRef.current?.focus());

    // Listen for focus event from main process when hotkey is triggered
    let cleanupFocus: (() => void) | undefined;
    if (desktop?.capture.onFlashFocus) {
      cleanupFocus = desktop.capture.onFlashFocus(() => {
        loadTargets();
        applyTheme();
        refreshSpaceConfig();
        const targetTextarea =
          activeTab === "note" ? textareaRef.current : persistentTextareaRef.current;
        targetTextarea?.focus();
        requestAnimationFrame(() => targetTextarea?.focus());
      });
    }

    return () => {
      cleanupFocus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeTab is read inside a one-time IPC handler on purpose (same stale-closure as before the split); adding it would tear down and re-subscribe the desktop listener whenever the tab changes
  }, [desktop, applyTheme, loadTargets, refreshSpaceConfig]);

  const handleClose = () => {
    if (desktop?.capture.hideFlashCapsule) {
      desktop.capture.hideFlashCapsule();
    }
  };

  const handleTogglePin = async () => {
    const next = !isPinned;
    setIsPinned(next);
    if (desktop?.capture.setFlashPin) {
      try {
        const res = await desktop.capture.setFlashPin(next);
        if (res && typeof res.pinned === "boolean") {
          setIsPinned(res.pinned);
        }
      } catch {}
    }
  };

  const handleSave = async () => {
    if (!content.trim()) {
      handleClose();
      return;
    }

    setSaveStatus("saving");
    setStatusMessage("正在归档至 Space...");

    try {
      if (desktop?.capture.saveFlashNote) {
        const res = await desktop.capture.saveFlashNote({ content: content.trim() });
        if (res.success) {
          setSaveStatus("saved");
          const targetName = res.fileName || "Space";
          setStatusMessage(`✓ 已归档至 Space/${targetName}`);
          setContent("");
          refreshSpaceConfig();
          setTimeout(() => {
            setSaveStatus("idle");
            if (!isPinned) {
              handleClose();
            }
          }, 500);
        } else {
          setSaveStatus("error");
          setStatusMessage(res.error || "归档失败");
        }
      } else {
        // Fallback for browser testing
        console.log("Flash note saved:", content);
        setSaveStatus("saved");
        setStatusMessage("✓ 已模拟保存");
        setContent("");
        setTimeout(() => {
          setSaveStatus("idle");
        }, 600);
      }
    } catch (err: unknown) {
      setSaveStatus("error");
      const msg = err instanceof Error ? err.message : "保存出错";
      setStatusMessage(msg);
    }
  };

  const handleInsertTime = () => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} `;
    insertSnippet(timeStr);
  };

  const handleResizeMouseDown = useFlashWindowResize();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // [[ 联想下拉的按键导航（方向键 / Enter / Tab / Esc）——消费了才短路
    if (handleSuggestKeyDown(e)) return;

    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (isSettingsOpen) {
        setIsSettingsOpen(false);
      } else {
        handleClose();
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      insertSnippet("  ");
    }
  };

  return (
    <div className={`flash-capsule-overlay theme-${resolvedTheme}`}>
      <div className="flash-capsule-container">
        {/* Header Bar - Draggable */}
        <FlashHeader
          activeTab={activeTab}
          onSelectNoteTab={switchToNoteTab}
          onSelectPersistentTab={selectPersistentTab}
          targetDisplay={targetDisplay}
          isPinned={isPinned}
          onTogglePin={handleTogglePin}
          shortcut={shortcut}
          isSettingsOpen={isSettingsOpen}
          onToggleSettings={() => setIsSettingsOpen(!isSettingsOpen)}
          onClose={handleClose}
        />

        {/* Hotkey & Space Directory Settings Drawer */}
        {isSettingsOpen && (
          <FlashSettingsDrawer
            desktop={desktop}
            spaceConfig={spaceConfig}
            shortcut={shortcut}
            isRecording={isRecording}
            setIsRecording={setIsRecording}
            recordedShortcut={recordedShortcut}
            setRecordedShortcut={setRecordedShortcut}
            autoLaunch={autoLaunch}
            setAutoLaunch={setAutoLaunch}
            runInBackground={runInBackground}
            setRunInBackground={setRunInBackground}
            isPinned={isPinned}
            setIsPinned={setIsPinned}
            settingsError={settingsError}
            settingsSuccess={settingsSuccess}
            setSettingsSuccess={setSettingsSuccess}
            onApplyShortcut={applyShortcut}
            onShortcutKeyDown={handleShortcutKeyDown}
            onSelectSpaceDir={handleSelectSpaceDir}
            onResetSpaceDir={handleResetSpaceDir}
            onClose={() => setIsSettingsOpen(false)}
          />
        )}

        {/* Tab 1: Instant Note Mode / Tab 2: Persistent Note Mode */}
        {activeTab === "note" ? (
          <FlashNoteTab
            content={content}
            textareaRef={textareaRef}
            wikiSuggestState={wikiSuggestState}
            onContentChange={handleContentChange}
            onKeyDown={handleKeyDown}
            onInsertWikiSuggestion={insertWikiSuggestion}
            insertSnippet={insertSnippet}
            onInsertTime={handleInsertTime}
            persistentContent={persistentContent}
            onInsertPersistentToNote={handleInsertPersistentToNote}
            statusMessage={statusMessage}
            saveStatus={saveStatus}
            onClose={handleClose}
            onSave={handleSave}
          />
        ) : (
          <FlashPersistentTab
            persistentContent={persistentContent}
            persistentTextareaRef={persistentTextareaRef}
            persistentFeedback={persistentFeedback}
            onPersistentChange={handlePersistentChange}
            onClearPersistent={handleClearPersistent}
            onCopyPersistent={handleCopyPersistent}
            onInsertToNote={handleInsertPersistentToNote}
          />
        )}

        {/* Window Drag Resize Handles */}
        <div
          className="flash-resize-edge-e"
          onMouseDown={(e) => handleResizeMouseDown(e, "e")}
          title="按住拖拽调节窗口宽度"
        />
        <div
          className="flash-resize-edge-s"
          onMouseDown={(e) => handleResizeMouseDown(e, "s")}
          title="按住拖拽调节窗口高度"
        />
        <div
          className="flash-resize-handle"
          onMouseDown={(e) => handleResizeMouseDown(e, "se")}
          title="按住拖拽调节窗口尺寸"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <circle cx="8" cy="8" r="1.2" />
            <circle cx="4" cy="8" r="1.2" />
            <circle cx="8" cy="4" r="1.2" />
            <circle cx="0" cy="8" r="1.2" />
            <circle cx="4" cy="4" r="1.2" />
            <circle cx="8" cy="0" r="1.2" />
          </svg>
        </div>
      </div>
    </div>
  );
};
