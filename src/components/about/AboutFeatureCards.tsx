import { Cpu, Zap } from "lucide-react";

type ShellNewStatus = {
  supported: boolean;
  markdown: boolean;
  canvas: boolean;
  mindmap: boolean;
};

type AboutFeatureCardsProps = {
  autoLaunch: boolean;
  runInBackground: boolean;
  autoSaveEnabled: boolean;
  handleToggleAutoLaunch: (val: boolean) => void | Promise<void>;
  handleToggleRunInBackground: (val: boolean) => void | Promise<void>;
  handleToggleAutoSave: (val: boolean) => void | Promise<void>;
  shellNewStatus: ShellNewStatus | null;
  shellNewMessage: string | null;
  handleToggleShellNew: (
    kind: "markdown" | "canvas" | "mindmap",
    enabled: boolean,
  ) => void | Promise<void>;
  repoUrl: string;
  authorUrl: string;
  handleOpenExternal: (url: string) => void;
};

export function AboutFeatureCards({
  autoLaunch,
  runInBackground,
  autoSaveEnabled,
  handleToggleAutoLaunch,
  handleToggleRunInBackground,
  handleToggleAutoSave,
  shellNewStatus,
  shellNewMessage,
  handleToggleShellNew,
}: AboutFeatureCardsProps) {
  const preferences = [
    {
      title: "开机自启动",
      detail: "开机后在托盘待命，随时捕获闪念。",
      checked: autoLaunch,
      change: handleToggleAutoLaunch,
    },
    {
      title: "关闭主窗口时保持后台运行",
      detail: "关闭窗口后保留托盘和闪念热键。",
      checked: runInBackground,
      change: handleToggleRunInBackground,
    },
    {
      title: "自动保存",
      detail: "停止输入后写入原文件，遇到外部修改时提示冲突。",
      checked: autoSaveEnabled,
      change: handleToggleAutoSave,
    },
  ];
  return (
    <>
      <section className="about-card">
        <h3 className="about-card-title">
          <Cpu size={16} />
          工作台偏好
        </h3>
        {preferences.map((item) => (
          <label className="about-setting-row" key={item.title}>
            <span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
            <input
              type="checkbox"
              checked={item.checked}
              onChange={(e) => void item.change(e.target.checked)}
            />
          </label>
        ))}
        <h4 className="about-subheading">资源管理器快捷新建</h4>
        {(
          [
            ["markdown", "Markdown 文档"],
            ["canvas", "空间白板"],
            ["mindmap", "思维导图"],
          ] as const
        ).map(([kind, title]) => (
          <label className="about-setting-row" key={kind}>
            <span>
              <strong>{title}</strong>
              <small>在文件夹右键“新建”中显示</small>
            </span>
            <input
              type="checkbox"
              disabled={!shellNewStatus?.supported}
              checked={shellNewStatus?.[kind] ?? false}
              onChange={(e) => {
                if (shellNewStatus?.supported) void handleToggleShellNew(kind, e.target.checked);
              }}
            />
          </label>
        ))}
        {!shellNewStatus?.supported && (
          <p className="about-description">快捷新建仅支持 Windows 桌面版。</p>
        )}
        {shellNewMessage && (
          <p className="about-error" role="alert">
            {shellNewMessage}
          </p>
        )}
      </section>
      <section className="about-flash-shortcut">
        <span>
          <Zap size={17} />
          随手记录灵感 <kbd>Alt + Space</kbd>
        </span>
        <button type="button" onClick={() => window.knowSpaceDesktop?.capture.openFlashCapsule?.()}>
          打开闪念胶囊
        </button>
      </section>
      <p className="about-license">KnowSpace · 摸鱼 Lab · MIT 开源许可</p>
    </>
  );
}
