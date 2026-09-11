import React, { useState, useEffect, useRef } from "react";
import {
  Zap,
  Settings,
  X,
  Check,
  Hash,
  Link,
  Clock,
  Lightbulb,
  Keyboard,
  AlertCircle,
  FileText,
  Pin,
  PinOff,
  Folder,
  RotateCcw,
  Copy,
  StickyNote,
  Sparkles,
  Trash2,
  Bookmark,
  ArrowRight,
} from "lucide-react";
import { loadPreferences, savePreferences } from "../services/storage";
import type { ThemeMode } from "../core/types";

export const FlashCapsule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"note" | "persistent">("note");
  const [content, setContent] = useState("");
  const [persistentContent, setPersistentContent] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [shortcut, setShortcut] = useState("Alt+Space");
  const [targetDisplay, setTargetDisplay] = useState("Space/YYYY-MM-DD_HHmm.md");
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedShortcut, setRecordedShortcut] = useState("");
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [runInBackground, setRunInBackground] = useState(true);
  const [spaceConfig, setSpaceConfig] = useState<{ currentDir: string; isCustom: boolean; defaultDir: string }>({
    currentDir: "",
    isCustom: false,
    defaultDir: "",
  });
  const [settingsError, setSettingsError] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [persistentFeedback, setPersistentFeedback] = useState("");
  const [availableTargets, setAvailableTargets] = useState<string[]>([]);
  const [wikiSuggestState, setWikiSuggestState] = useState<{
    isOpen: boolean;
    query: string;
    startIndex: number;
    selectedIndex: number;
    filtered: string[];
  }>({
    isOpen: false,
    query: "",
    startIndex: -1,
    selectedIndex: 0,
    filtered: [],
  });

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const persistentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const persistentSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;

  const refreshSpaceConfig = () => {
    if (desktop?.getFlashSpaceConfig) {
      desktop.getFlashSpaceConfig().then((cfg) => {
        if (cfg) setSpaceConfig(cfg);
      }).catch(() => {});
    }
    if (desktop?.getFlashTargetPath) {
      desktop.getFlashTargetPath().then((res) => {
        if (res?.relativeDisplay) {
          setTargetDisplay(res.relativeDisplay);
        }
      }).catch(() => {});
    }
  };

  // Initialize preferences, theme, hotkey, pin, persistent note and space config
  useEffect(() => {
    const applyTheme = (t?: string) => {
      const prefs = loadPreferences();
      const nextTheme = (t as ThemeMode) || prefs.theme || "system";
      setTheme(nextTheme);
      document.documentElement.setAttribute("data-theme", nextTheme);
      document.documentElement.dataset.theme = nextTheme;
    };

    applyTheme();
    const prefs = loadPreferences();

    // Load initial hotkey
    if (desktop?.getFlashShortcut) {
      desktop.getFlashShortcut().then((sc) => {
        if (sc) {
          setShortcut(sc);
          setRecordedShortcut(sc);
        }
      }).catch(() => {});
    } else if (prefs.flashCapsuleShortcut) {
      setShortcut(prefs.flashCapsuleShortcut);
      setRecordedShortcut(prefs.flashCapsuleShortcut);
    }

    // Load pin status
    if (desktop?.getFlashPin) {
      desktop.getFlashPin().then((res) => {
        if (res && typeof res.pinned === "boolean") {
          setIsPinned(res.pinned);
        }
      }).catch(() => {});
    }

    // Load app settings
    if (desktop?.getAppSettings) {
      desktop.getAppSettings().then((st) => {
        if (st) {
          setAutoLaunch(st.autoLaunch);
          setRunInBackground(st.runInBackground);
        }
      }).catch(() => {});
    }

    // Load Space path info
    refreshSpaceConfig();

    // Load persistent note / prompt template
    if (desktop?.getPersistentNote) {
      desktop.getPersistentNote().then((res) => {
        if (res && typeof res.text === "string") {
          setPersistentContent(res.text);
        }
      }).catch(() => {});
    } else {
      try {
        const cached = localStorage.getItem("knowspace_persistent_note");
        if (cached) setPersistentContent(cached);
      } catch {}
    }

    // Load historical flash notes and available targets for [[ suggestion
    let lastTargetsLoadTime = 0;
    const loadTargets = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastTargetsLoadTime < 3000) return;
      lastTargetsLoadTime = now;
      try {
        if (desktop?.getFlashNotesSummary) {
          const res = await desktop.getFlashNotesSummary();
          if (res?.success && res.notes) {
            const titles = res.notes.map((n) => n.fileName.replace(/\.md$/i, ""));
            setAvailableTargets((prev) => Array.from(new Set([...prev, ...titles])));
          }
        }
      } catch {}
    };
    loadTargets(true);

    // Auto-focus textarea on mount
    textareaRef.current?.focus();
    requestAnimationFrame(() => textareaRef.current?.focus());

    // Listen for focus event from main process when hotkey is triggered
    let cleanupFocus: (() => void) | undefined;
    if (desktop?.onFlashFocus) {
      cleanupFocus = desktop.onFlashFocus(() => {
        loadTargets();
        applyTheme();
        refreshSpaceConfig();
        const targetTextarea = activeTab === "note" ? textareaRef.current : persistentTextareaRef.current;
        targetTextarea?.focus();
        requestAnimationFrame(() => targetTextarea?.focus());
      });
    }

    let cleanupShortcut: (() => void) | undefined;
    if (desktop?.onFlashShortcutUpdated) {
      cleanupShortcut = desktop.onFlashShortcutUpdated((newSc) => {
        setShortcut(newSc);
        setRecordedShortcut(newSc);
      });
    }

    let cleanupSettings: (() => void) | undefined;
    if (desktop?.onAppSettingsUpdated) {
      cleanupSettings = desktop.onAppSettingsUpdated((st) => {
        setAutoLaunch(st.autoLaunch);
        setRunInBackground(st.runInBackground);
      });
    }

    let cleanupTheme: (() => void) | undefined;
    if (desktop?.onThemeUpdated) {
      cleanupTheme = desktop.onThemeUpdated((newTheme) => {
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
      cleanupFocus?.();
      cleanupShortcut?.();
      cleanupSettings?.();
      cleanupTheme?.();
      window.removeEventListener("storage", onStorage);
      if (persistentSaveTimerRef.current) {
        clearTimeout(persistentSaveTimerRef.current);
      }
    };
  }, [desktop]);

  const handleClose = () => {
    if (desktop?.hideFlashCapsule) {
      desktop.hideFlashCapsule();
    }
  };

  const handleTogglePin = async () => {
    const next = !isPinned;
    setIsPinned(next);
    if (desktop?.setFlashPin) {
      try {
        const res = await desktop.setFlashPin(next);
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
      if (desktop?.saveFlashNote) {
        const res = await desktop.saveFlashNote({ content: content.trim() });
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

  const handleInsertTime = () => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} `;
    insertSnippet(timeStr);
  };

  const handleInsertPersistentToNote = () => {
    if (!persistentContent.trim()) {
      setPersistentFeedback("便签暂无内容");
      setTimeout(() => setPersistentFeedback(""), 1200);
      return;
    }
    insertSnippet(persistentContent + "\n\n");
    setActiveTab("note");
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };

  const handleResizeMouseDown = (e: React.MouseEvent, direction: "se" | "e" | "s") => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.screenX;
    const startY = e.screenY;
    const startWidth = window.innerWidth;
    const startHeight = window.innerHeight;

    let rafId: number | null = null;
    let latestWidth = startWidth;
    let latestHeight = startHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.screenX - startX;
      const deltaY = moveEvent.screenY - startY;

      if (direction === "se" || direction === "e") {
        latestWidth = Math.max(520, Math.min(1600, Math.round(startWidth + deltaX)));
      }
      if (direction === "se" || direction === "s") {
        latestHeight = Math.max(320, Math.min(1200, Math.round(startHeight + deltaY)));
      }

      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          desktop?.setFlashSize?.({ width: latestWidth, height: latestHeight });
          rafId = null;
        });
      }
    };

    const handleMouseUp = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      desktop?.setFlashSize?.({ width: latestWidth, height: latestHeight });
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handlePersistentChange = (val: string) => {
    setPersistentContent(val);
    try {
      localStorage.setItem("knowspace_persistent_note", val);
    } catch {}
    if (persistentSaveTimerRef.current) {
      clearTimeout(persistentSaveTimerRef.current);
    }
    persistentSaveTimerRef.current = setTimeout(() => {
      desktop?.savePersistentNote?.(val);
    }, 350);
  };

  const handleCopyPersistent = () => {
    if (!persistentContent) return;
    navigator.clipboard.writeText(persistentContent).then(() => {
      setPersistentFeedback("✓ 已复制全文");
      setTimeout(() => setPersistentFeedback(""), 1500);
    });
  };

  const handleClearPersistent = () => {
    if (window.confirm("确定要清空常驻便签/提示模板内容吗？此操作不会影响已归档的文档。")) {
      handlePersistentChange("");
      setPersistentFeedback("✓ 已清空");
      setTimeout(() => setPersistentFeedback(""), 1500);
    }
  };

  const handleSelectSpaceDir = async () => {
    if (!desktop?.selectFlashSpaceDir) return;
    setSettingsError("");
    setSettingsSuccess("");
    const res = await desktop.selectFlashSpaceDir();
    if (res?.success && res.newDir) {
      setSettingsSuccess("✓ 已成功切换 Space 存储目录");
      refreshSpaceConfig();
      setTimeout(() => setSettingsSuccess(""), 2000);
    } else if (res?.error) {
      setSettingsError(res.error);
    }
  };

  const handleResetSpaceDir = async () => {
    if (!desktop?.resetFlashSpaceDir) return;
    setSettingsError("");
    setSettingsSuccess("");
    const res = await desktop.resetFlashSpaceDir();
    if (res?.success) {
      setSettingsSuccess("✓ 已恢复为默认 Space 目录");
      refreshSpaceConfig();
      setTimeout(() => setSettingsSuccess(""), 2000);
    }
  };

  const starterTemplates = [
    { label: "📌 今日任务待办", text: "## 今日核心待办\n- [ ] 核心目标 1\n- [ ] 核心目标 2\n- [ ] 临时插入事项\n" },
    { label: "💡 提示词审查模板", text: "作为资深工程师，请对以下代码或方案进行深度代码审查，指出潜在性能与逻辑隐患：\n\n" },
    { label: "📝 会议与访谈速记", text: "## 沟通纪要\n- **参与人**：\n- **关键决议**：\n- **下一步行动 (Next Actions)**：\n  - [ ] " },
    { label: "🔬 闪念知识卡片", text: "### 闪念知识卡片\n- **核心概念**：\n- **知识洞察**：\n- **双链关联**：[[]]\n" },
  ];

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);

    const cursorPos = e.target.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursorPos);
    const match = textBefore.match(/\[\[([^\]\n]*)$/);

    if (match) {
      const query = match[1].toLowerCase().trim();
      const startIndex = cursorPos - match[0].length;
      const filtered = availableTargets
        .filter((t) => !query || t.toLowerCase().includes(query))
        .slice(0, 8);

      setWikiSuggestState({
        isOpen: filtered.length > 0,
        query,
        startIndex,
        selectedIndex: 0,
        filtered,
      });
    } else {
      if (wikiSuggestState.isOpen) {
        setWikiSuggestState((prev) => ({ ...prev, isOpen: false }));
      }
    }
  };

  const insertWikiSuggestion = (title: string) => {
    if (wikiSuggestState.startIndex < 0 || !textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart ?? content.length;
    const before = content.slice(0, wikiSuggestState.startIndex);
    const after = content.slice(cursorPos);
    const inserted = `[[${title}]]`;
    const newContent = `${before}${inserted}${after}`;
    setContent(newContent);
    setWikiSuggestState((prev) => ({ ...prev, isOpen: false }));

    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = before.length + inserted.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 20);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (wikiSuggestState.isOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setWikiSuggestState((prev) => ({
          ...prev,
          selectedIndex: (prev.selectedIndex + 1) % prev.filtered.length,
        }));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setWikiSuggestState((prev) => ({
          ...prev,
          selectedIndex: (prev.selectedIndex - 1 + prev.filtered.length) % prev.filtered.length,
        }));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const selected = wikiSuggestState.filtered[wikiSuggestState.selectedIndex];
        if (selected) {
          e.preventDefault();
          insertWikiSuggestion(selected);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setWikiSuggestState((prev) => ({ ...prev, isOpen: false }));
        return;
      }
    }

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

  const handleShortcutKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isRecording) return;
    e.preventDefault();
    e.stopPropagation();

    if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
      return;
    }

    const parts: string[] = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Command");

    let key = e.key;
    if (key === " ") key = "Space";
    else if (key.length === 1) key = key.toUpperCase();

    const isFKey = /^F[1-9][0-2]?$/i.test(key);
    if (parts.length === 0 && !isFKey) {
      setSettingsError("请至少配合 Ctrl / Alt / Shift 修饰键使用（或单按 F1-F12）");
      return;
    }

    parts.push(key);
    const newSc = parts.join("+");
    setRecordedShortcut(newSc);
    setIsRecording(false);
    setSettingsError("");
  };

  const applyShortcut = async (targetSc: string) => {
    setSettingsError("");
    setSettingsSuccess("");
    if (!targetSc || !targetSc.trim()) {
      setSettingsError("热键不能为空");
      return;
    }

    if (desktop?.setFlashShortcut) {
      const res = await desktop.setFlashShortcut(targetSc.trim());
      if (res.success) {
        setShortcut(targetSc.trim());
        setRecordedShortcut(targetSc.trim());
        setSettingsSuccess(`✓ 全局快捷键已设定为 [ ${targetSc.trim()} ]`);
        const prefs = loadPreferences();
        savePreferences({ ...prefs, flashCapsuleShortcut: targetSc.trim() });
        setTimeout(() => {
          setIsSettingsOpen(false);
          setSettingsSuccess("");
          textareaRef.current?.focus();
        }, 1200);
      } else {
        setSettingsError(res.error || "热键已被系统或其它程序占用");
      }
    } else {
      setShortcut(targetSc.trim());
      setRecordedShortcut(targetSc.trim());
      setSettingsSuccess("✓ 已保存热键偏好");
      setTimeout(() => {
        setIsSettingsOpen(false);
        setSettingsSuccess("");
      }, 1000);
    }
  };

  return (
    <div className={`flash-capsule-overlay theme-${theme}`}>
      <div className="flash-capsule-container">
        {/* Header Bar - Draggable */}
        <div className="flash-header" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
          <div className="flash-header-left">
            <span className="flash-logo-badge">
              <Zap size={15} className="flash-zap-icon" />
              <span className="flash-title">闪念胶囊</span>
            </span>

            {/* Segmented Tab Switcher */}
            <div className="flash-tab-group" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
              <button
                type="button"
                className={`flash-tab-btn ${activeTab === "note" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("note");
                  setTimeout(() => textareaRef.current?.focus(), 50);
                }}
                title="即时闪念速记（Ctrl+Enter 瞬时归档）"
              >
                <Zap size={12} />
                <span>闪念速记</span>
              </button>
              <button
                type="button"
                className={`flash-tab-btn ${activeTab === "persistent" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("persistent");
                  setTimeout(() => persistentTextareaRef.current?.focus(), 50);
                }}
                title="常驻便签 / 提示模板（随写随存，归档不被清空）"
              >
                <StickyNote size={12} />
                <span>常驻模板</span>
              </button>
            </div>
          </div>

          <div className="flash-header-right" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            <span className="flash-target-path" title={`自动按分钟保存至: ${targetDisplay} (同一分钟追加)`}>
              <FileText size={12} />
              <span>{targetDisplay}</span>
            </span>

            {/* Window Pin Toggle Button */}
            <button
              type="button"
              className={`flash-icon-btn ${isPinned ? "active pinned" : ""}`}
              onClick={handleTogglePin}
              title={isPinned ? "已固定窗口：鼠标点击别处不会退出 (再次点击取消固定)" : "固定窗口：开启后鼠标点击外部不退出微窗"}
            >
              {isPinned ? <Pin size={15} className="text-orange" /> : <PinOff size={15} />}
            </button>

            {/* Hotkey Badge */}
            <button
              type="button"
              className="flash-shortcut-badge"
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              title="点击自定义全局呼出热键与存储目录"
            >
              <Keyboard size={12} />
              <span>{shortcut}</span>
            </button>

            {/* Settings Button */}
            <button
              type="button"
              className={`flash-icon-btn ${isSettingsOpen ? "active" : ""}`}
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              title="设置全局热键与存储路径"
            >
              <Settings size={15} />
            </button>

            {/* Close Button */}
            <button
              type="button"
              className="flash-icon-btn flash-close-btn"
              onClick={handleClose}
              title="关闭微窗 (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Hotkey & Space Directory Settings Drawer */}
        {isSettingsOpen && (
          <div className="flash-settings-drawer">
            <div className="flash-settings-header">
              <span className="flash-settings-title">
                <Settings size={14} />
                <span>闪念胶囊偏好与存储设置</span>
              </span>
              <button
                type="button"
                className="flash-settings-close-btn"
                onClick={() => setIsSettingsOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="flash-settings-body">
              {/* Space Storage Directory Section */}
              <div className="flash-dir-settings-card">
                <div className="flash-dir-settings-top">
                  <span className="flash-dir-label">
                    <Folder size={13} className="text-orange" />
                    <strong>Space 存储目录：</strong>
                  </span>
                  <span className="flash-dir-path" title={spaceConfig.currentDir || "工作区默认 Space 目录"}>
                    {spaceConfig.currentDir || "加载中..."}
                  </span>
                  <span className={`flash-dir-badge ${spaceConfig.isCustom ? "custom" : "default"}`}>
                    {spaceConfig.isCustom ? "已自定义" : "工作区默认"}
                  </span>
                </div>
                <div className="flash-dir-settings-actions">
                  <button
                    type="button"
                    className="flash-mini-btn"
                    onClick={handleSelectSpaceDir}
                    title="选择本地任意文件夹作为 Space 存储路径"
                  >
                    <Folder size={12} /> 更改存储位置
                  </button>
                  {spaceConfig.isCustom && (
                    <button
                      type="button"
                      className="flash-mini-btn secondary"
                      onClick={handleResetSpaceDir}
                      title="重置为当前知识库工作区默认的 Space 目录"
                    >
                      <RotateCcw size={12} /> 恢复默认
                    </button>
                  )}
                  <span className="flash-dir-hint">
                    按时间分钟保存在单独 Space 文件夹中，同一分钟追加合并，不重复新建文件夹。
                  </span>
                </div>
              </div>

              {/* Hotkey Settings */}
              <div className="flash-preset-row">
                <span className="flash-preset-label">快捷热键：</span>
                {["Alt+Space", "Ctrl+Shift+Space", "Alt+N", "Ctrl+Alt+N", "F9"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`flash-preset-tag ${shortcut === preset ? "current" : ""}`}
                    onClick={() => {
                      setRecordedShortcut(preset);
                      applyShortcut(preset);
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div className="flash-recorder-row">
                <span className="flash-preset-label">自定义录制：</span>
                <input
                  type="text"
                  readOnly
                  className={`flash-recorder-input ${isRecording ? "recording" : ""}`}
                  placeholder="点击此处后直接按下键盘组合键..."
                  value={isRecording ? "请按下组合键 (如 Ctrl+Shift+K)..." : recordedShortcut}
                  onFocus={() => setIsRecording(true)}
                  onBlur={() => setIsRecording(false)}
                  onKeyDown={handleShortcutKeyDown}
                />
                <button
                  type="button"
                  className="flash-btn flash-btn-primary"
                  onClick={() => applyShortcut(recordedShortcut)}
                  disabled={!recordedShortcut || recordedShortcut === shortcut}
                >
                  <Check size={14} /> 保存并生效
                </button>
              </div>

              <div className="flash-settings-toggles-row">
                <label className="flash-toggle-label">
                  <input
                    type="checkbox"
                    checked={autoLaunch}
                    onChange={async (e) => {
                      const val = e.target.checked;
                      setAutoLaunch(val);
                      const res = await desktop?.setAppSettings?.({ autoLaunch: val });
                      if (res?.settings) {
                        setAutoLaunch(res.settings.autoLaunch);
                        setRunInBackground(res.settings.runInBackground);
                      }
                    }}
                  />
                  <span>开机自启 (静默就绪)</span>
                </label>
                <label className="flash-toggle-label">
                  <input
                    type="checkbox"
                    checked={runInBackground}
                    onChange={async (e) => {
                      const val = e.target.checked;
                      setRunInBackground(val);
                      const res = await desktop?.setAppSettings?.({ runInBackground: val });
                      if (res?.settings) {
                        setAutoLaunch(res.settings.autoLaunch);
                        setRunInBackground(res.settings.runInBackground);
                      }
                    }}
                  />
                  <span>保持后台运行 (关闭至托盘)</span>
                </label>
                <label className="flash-toggle-label">
                  <input
                    type="checkbox"
                    checked={isPinned}
                    onChange={(e) => {
                      setIsPinned(e.target.checked);
                      desktop?.setFlashPin?.(e.target.checked);
                    }}
                  />
                  <span>固定胶囊窗口 (点击外部不退出)</span>
                </label>
                <button
                  type="button"
                  className="flash-btn flash-btn-secondary"
                  style={{ marginLeft: "auto", fontSize: "11px", padding: "4px 9px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                  onClick={async () => {
                    if (desktop?.resetFlashSize) {
                      await desktop.resetFlashSize();
                      setSettingsSuccess("✓ 已恢复精炼胶囊尺寸 (600×360)");
                      setTimeout(() => setSettingsSuccess(""), 1500);
                    }
                  }}
                  title="将闪念胶囊窗口恢复为轻巧标准胶囊尺寸 (600×360)"
                >
                  <RotateCcw size={12} />
                  <span>恢复轻巧尺寸 (600×360)</span>
                </button>
              </div>

              {settingsError && (
                <div className="flash-feedback flash-feedback-error">
                  <AlertCircle size={14} />
                  <span>{settingsError}</span>
                </div>
              )}
              {settingsSuccess && (
                <div className="flash-feedback flash-feedback-success">
                  <Check size={14} />
                  <span>{settingsSuccess}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 1: Instant Note Mode */}
        {activeTab === "note" ? (
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
                onClick={handleInsertTime}
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
                  onClick={handleInsertPersistentToNote}
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
                onChange={handleContentChange}
                onKeyDown={handleKeyDown}
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
                          insertWikiSuggestion(item);
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
                  <span className={`flash-status-msg ${saveStatus}`}>
                    {statusMessage}
                  </span>
                )}
              </div>

              <div className="flash-footer-right">
                <button
                  type="button"
                  className="flash-btn flash-btn-secondary"
                  onClick={handleClose}
                >
                  取消 (Esc)
                </button>
                <button
                  type="button"
                  className="flash-btn flash-btn-primary flash-save-btn"
                  onClick={handleSave}
                  disabled={saveStatus === "saving"}
                >
                  <Zap size={14} />
                  <span>瞬时归档 (Ctrl+↵)</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Tab 2: Persistent Note / Prompt Template Mode */
          <div className="flash-persistent-container">
            {/* Banner info */}
            <div className="flash-persistent-banner">
              <span className="flash-persistent-banner-text">
                📌 <strong>常驻便签与提示模板</strong>：实时自动保存，在归档闪念时<strong>绝不清空</strong>，随时备查、复用或作为 AI 常用 Prompt 提示词使用。
              </span>
              {persistentFeedback && (
                <span className="flash-persistent-badge-feedback">
                  {persistentFeedback}
                </span>
              )}
            </div>

            {/* Starter Template Pills */}
            <div className="flash-starter-row">
              <span className="flash-starter-label">常用构型：</span>
              {starterTemplates.map((t, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="flash-starter-tag"
                  onClick={() => {
                    const next = persistentContent ? `${persistentContent}\n\n${t.text}` : t.text;
                    handlePersistentChange(next);
                  }}
                  title="点击追加此结构到常驻便签"
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Persistent Textarea */}
            <div className="flash-persistent-input-wrapper">
              <textarea
                ref={persistentTextareaRef}
                className="flash-textarea flash-persistent-textarea"
                placeholder="在此记录永久常驻便签、重要 Checklist、常用 Prompt 提示词或固定参考资料... (内容实时自动保存在本地，永不清空)"
                value={persistentContent}
                onChange={(e) => handlePersistentChange(e.target.value)}
                rows={6}
              />
            </div>

            {/* Persistent Footer Actions */}
            <div className="flash-footer">
              <div className="flash-footer-left">
                <span className="flash-char-count">{persistentContent.length} 字 · 自动持久化</span>
              </div>
              <div className="flash-footer-right">
                <button
                  type="button"
                  className="flash-btn flash-btn-secondary"
                  onClick={handleClearPersistent}
                  title="清空常驻便签内容"
                >
                  <Trash2 size={13} />
                  <span>清空</span>
                </button>
                <button
                  type="button"
                  className="flash-btn flash-btn-secondary"
                  onClick={handleCopyPersistent}
                  title="复制常驻便签全文到剪贴板"
                >
                  <Copy size={13} />
                  <span>复制全文</span>
                </button>
                <button
                  type="button"
                  className="flash-btn flash-btn-primary"
                  onClick={handleInsertPersistentToNote}
                  title="将当前模板内容填入闪念速记区"
                >
                  <Zap size={14} />
                  <span>填入速记</span>
                </button>
              </div>
            </div>
          </div>
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
