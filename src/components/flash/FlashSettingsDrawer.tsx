import React from "react";
import { Settings, Folder, RotateCcw, Check, AlertCircle } from "lucide-react";
import type { FlashSpaceConfig } from "./useFlashSettings";

/**
 * 热键与 Space 目录设置抽屉。从 FlashCapsule 逐字搬出，仅改为 prop 驱动；
 * 自动保存的开关与“恢复尺寸”按钮仍内联调用桌面桥，因此把 desktop 一并传入。
 */
export function FlashSettingsDrawer(props: {
  desktop: Window["knowSpaceDesktop"];
  spaceConfig: FlashSpaceConfig;
  shortcut: string;
  isRecording: boolean;
  setIsRecording: (v: boolean) => void;
  recordedShortcut: string;
  setRecordedShortcut: (v: string) => void;
  autoLaunch: boolean;
  setAutoLaunch: (v: boolean) => void;
  runInBackground: boolean;
  setRunInBackground: (v: boolean) => void;
  isPinned: boolean;
  setIsPinned: (v: boolean) => void;
  settingsError: string;
  settingsSuccess: string;
  setSettingsSuccess: (v: string) => void;
  onApplyShortcut: (targetSc: string) => void;
  onShortcutKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelectSpaceDir: () => void;
  onResetSpaceDir: () => void;
  onClose: () => void;
}) {
  const {
    desktop,
    spaceConfig,
    shortcut,
    isRecording,
    setIsRecording,
    recordedShortcut,
    setRecordedShortcut,
    autoLaunch,
    setAutoLaunch,
    runInBackground,
    setRunInBackground,
    isPinned,
    setIsPinned,
    settingsError,
    settingsSuccess,
    setSettingsSuccess,
    onApplyShortcut,
    onShortcutKeyDown,
    onSelectSpaceDir,
    onResetSpaceDir,
    onClose,
  } = props;

  return (
    <div className="flash-settings-drawer">
      <div className="flash-settings-header">
        <span className="flash-settings-title">
          <Settings size={14} />
          <span>闪念胶囊偏好与存储设置</span>
        </span>
        <button type="button" className="flash-settings-close-btn" onClick={onClose}>
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
            <span
              className="flash-dir-path"
              title={spaceConfig.currentDir || "工作区默认 Space 目录"}
            >
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
              onClick={onSelectSpaceDir}
              title="选择本地任意文件夹作为 Space 存储路径"
            >
              <Folder size={12} /> 更改存储位置
            </button>
            {spaceConfig.isCustom && (
              <button
                type="button"
                className="flash-mini-btn secondary"
                onClick={onResetSpaceDir}
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
                onApplyShortcut(preset);
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
            onKeyDown={onShortcutKeyDown}
          />
          <button
            type="button"
            className="flash-btn flash-btn-primary"
            onClick={() => onApplyShortcut(recordedShortcut)}
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
                const res = await desktop?.system.setAppSettings?.({ autoLaunch: val });
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
                const res = await desktop?.system.setAppSettings?.({ runInBackground: val });
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
                desktop?.capture.setFlashPin?.(e.target.checked);
              }}
            />
            <span>固定胶囊窗口 (点击外部不退出)</span>
          </label>
          <button
            type="button"
            className="flash-btn flash-btn-secondary"
            style={{
              marginLeft: "auto",
              fontSize: "11px",
              padding: "4px 9px",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
            }}
            onClick={async () => {
              if (desktop?.capture.resetFlashSize) {
                await desktop.capture.resetFlashSize();
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
  );
}
