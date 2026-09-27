import { useCallback, useEffect, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { loadPreferences, savePreferences } from "../../services/storage";

/** Space 存储目录信息（getFlashSpaceConfig 的返回快照）。 */
export interface FlashSpaceConfig {
  currentDir: string;
  isCustom: boolean;
  defaultDir: string;
}

/**
 * 闪念胶囊的「偏好与存储」域：全局热键、Space 目录、应用设置（自启/后台）与
 * 设置抽屉的开关 / 错误 / 成功提示。
 *
 * 从 FlashCapsule 拆出。原巨型初始化 effect 中属于本域的部分（初始热键加载、
 * 应用设置加载、refreshSpaceConfig、onFlashShortcutUpdated 与 onAppSettingsUpdated
 * 订阅）收进这里的 mount effect——订阅仍在首次提交时同步挂载，时序不变。
 */
export function useFlashSettings(params: {
  /** applyShortcut 生效后要把焦点还给速记输入框（原行为：textareaRef.current?.focus()）。 */
  noteTextareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const { noteTextareaRef } = params;
  const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;

  const [shortcut, setShortcut] = useState("Alt+Space");
  const [targetDisplay, setTargetDisplay] = useState("Space/YYYY-MM-DD_HHmm.md");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedShortcut, setRecordedShortcut] = useState("");
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [runInBackground, setRunInBackground] = useState(true);
  const [spaceConfig, setSpaceConfig] = useState<FlashSpaceConfig>({
    currentDir: "",
    isCustom: false,
    defaultDir: "",
  });
  const [settingsError, setSettingsError] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState("");

  const refreshSpaceConfig = useCallback(() => {
    if (desktop?.capture.getFlashSpaceConfig) {
      desktop.capture
        .getFlashSpaceConfig()
        .then((cfg) => {
          if (cfg) setSpaceConfig(cfg);
        })
        .catch(() => {});
    }
    if (desktop?.capture.getFlashTargetPath) {
      desktop.capture
        .getFlashTargetPath()
        .then((res) => {
          if (res?.relativeDisplay) {
            setTargetDisplay(res.relativeDisplay);
          }
        })
        .catch(() => {});
    }
  }, [desktop]);

  // Initialize hotkey / app settings / Space path info, and attach this
  // domain's IPC subscriptions (same mount timing as the original mega effect)
  useEffect(() => {
    const prefs = loadPreferences();

    // Load initial hotkey
    if (desktop?.capture.getFlashShortcut) {
      desktop.capture
        .getFlashShortcut()
        .then((sc) => {
          if (sc) {
            setShortcut(sc);
            setRecordedShortcut(sc);
          }
        })
        .catch(() => {});
    } else if (prefs.flashCapsuleShortcut) {
      setShortcut(prefs.flashCapsuleShortcut);
      setRecordedShortcut(prefs.flashCapsuleShortcut);
    }

    // Load app settings
    if (desktop?.system.getAppSettings) {
      desktop.system
        .getAppSettings()
        .then((st) => {
          if (st) {
            setAutoLaunch(st.autoLaunch);
            setRunInBackground(st.runInBackground);
          }
        })
        .catch(() => {});
    }

    // Load Space path info
    refreshSpaceConfig();

    let cleanupShortcut: (() => void) | undefined;
    if (desktop?.capture.onFlashShortcutUpdated) {
      cleanupShortcut = desktop.capture.onFlashShortcutUpdated((newSc) => {
        setShortcut(newSc);
        setRecordedShortcut(newSc);
      });
    }

    let cleanupSettings: (() => void) | undefined;
    if (desktop?.system.onAppSettingsUpdated) {
      cleanupSettings = desktop.system.onAppSettingsUpdated((st) => {
        setAutoLaunch(st.autoLaunch);
        setRunInBackground(st.runInBackground);
      });
    }

    return () => {
      cleanupShortcut?.();
      cleanupSettings?.();
    };
  }, [desktop, refreshSpaceConfig]);

  const handleShortcutKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
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

    if (desktop?.capture.setFlashShortcut) {
      const res = await desktop.capture.setFlashShortcut(targetSc.trim());
      if (res.success) {
        setShortcut(targetSc.trim());
        setRecordedShortcut(targetSc.trim());
        setSettingsSuccess(`✓ 全局快捷键已设定为 [ ${targetSc.trim()} ]`);
        const prefs = loadPreferences();
        savePreferences({ ...prefs, flashCapsuleShortcut: targetSc.trim() });
        setTimeout(() => {
          setIsSettingsOpen(false);
          setSettingsSuccess("");
          noteTextareaRef.current?.focus();
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

  const handleSelectSpaceDir = async () => {
    if (!desktop?.capture.selectFlashSpaceDir) return;
    setSettingsError("");
    setSettingsSuccess("");
    const res = await desktop.capture.selectFlashSpaceDir();
    if (res?.success && res.newDir) {
      setSettingsSuccess("✓ 已成功切换 Space 存储目录");
      refreshSpaceConfig();
      setTimeout(() => setSettingsSuccess(""), 2000);
    } else if (res?.error) {
      setSettingsError(res.error);
    }
  };

  const handleResetSpaceDir = async () => {
    if (!desktop?.capture.resetFlashSpaceDir) return;
    setSettingsError("");
    setSettingsSuccess("");
    const res = await desktop.capture.resetFlashSpaceDir();
    if (res?.success) {
      setSettingsSuccess("✓ 已恢复为默认 Space 目录");
      refreshSpaceConfig();
      setTimeout(() => setSettingsSuccess(""), 2000);
    }
  };

  return {
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
  };
}
