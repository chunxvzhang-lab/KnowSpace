import { useState, useEffect, useCallback } from "react";
import { ExternalLink, Github, Check, Copy, X, History } from "lucide-react";
import appLogo from "../assets/icon.png";
import { AboutFeatureCards } from "./about/AboutFeatureCards";
import { AboutChangelogRecent } from "./about/AboutChangelogRecent";

type AboutDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  const [copied, setCopied] = useState(false);
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [runInBackground, setRunInBackground] = useState(true);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  // 资源管理器右键"新建"条目的真实状态。注册表是唯一事实来源，对话框
  // 每次打开与每次切换后都现查现示，不自己记账。
  const [shellNewStatus, setShellNewStatus] = useState<{
    supported: boolean;
    markdown: boolean;
    canvas: boolean;
    mindmap: boolean;
  } | null>(null);
  const [shellNewMessage, setShellNewMessage] = useState<string | null>(null);

  const repoUrl = "https://github.com/chunxvzhang-lab/KnowSpace";
  const authorUrl = "https://github.com/chunxvzhang";

  useEffect(() => {
    if (!isOpen) return undefined;
    const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;
    desktop?.system.getAppSettings?.().then((settings) => {
      if (settings) {
        setAutoLaunch(settings.autoLaunch);
        setRunInBackground(settings.runInBackground);
        setAutoSaveEnabled(settings.autoSaveEnabled);
      }
    });

    desktop?.system.getShellNewStatus?.().then((status) => {
      if (status) setShellNewStatus(status);
    });

    const unsubscribe = desktop?.system.onAppSettingsUpdated?.((settings) => {
      setAutoLaunch(settings.autoLaunch);
      setRunInBackground(settings.runInBackground);
      setAutoSaveEnabled(settings.autoSaveEnabled);
    });

    return () => unsubscribe?.();
  }, [isOpen]);

  const handleToggleAutoLaunch = async (val: boolean) => {
    setAutoLaunch(val);
    const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;
    const res = await desktop?.system.setAppSettings?.({ autoLaunch: val });
    if (res?.settings) {
      setAutoLaunch(res.settings.autoLaunch);
      setRunInBackground(res.settings.runInBackground);
      setAutoSaveEnabled(res.settings.autoSaveEnabled);
    }
  };

  const handleToggleRunInBackground = async (val: boolean) => {
    setRunInBackground(val);
    const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;
    const res = await desktop?.system.setAppSettings?.({ runInBackground: val });
    if (res?.settings) {
      setAutoLaunch(res.settings.autoLaunch);
      setRunInBackground(res.settings.runInBackground);
      setAutoSaveEnabled(res.settings.autoSaveEnabled);
    }
  };

  const handleToggleAutoSave = async (val: boolean) => {
    setAutoSaveEnabled(val);
    const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;
    const res = await desktop?.system.setAppSettings?.({ autoSaveEnabled: val });
    if (res?.settings) {
      setAutoLaunch(res.settings.autoLaunch);
      setRunInBackground(res.settings.runInBackground);
      setAutoSaveEnabled(res.settings.autoSaveEnabled);
    }
  };

  const handleToggleShellNew = async (
    kind: "markdown" | "canvas" | "mindmap",
    enabled: boolean,
  ) => {
    const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;
    const res = await desktop?.system.setShellNewEntry?.({ kind, enabled });
    // 失败时主进程同样带回现查状态，开关按注册表真值回弹，不留在半途。
    if (res?.status) {
      setShellNewStatus(res.status);
    }
    setShellNewMessage(res ? (res.success ? null : res.message || "设置未生效") : "桌面版桥不可用");
  };

  const handleOpenExternal = useCallback((url: string) => {
    if (typeof window !== "undefined") {
      // Both window keys expose the same namespaced bridge; one read is enough.
      const desktop = window.knowSpaceDesktop;
      if (desktop?.system.openExternal) {
        desktop.system.openExternal(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  }, []);

  const handleCopyRepo = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(repoUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }, [repoUrl]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="about-dialog-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-dialog-title"
    >
      <div className="about-dialog-card" onClick={(e) => e.stopPropagation()}>
        {/* Header with Close button */}
        <div className="about-header">
          <div className="about-brand-section">
            <div className="about-logo-wrapper">
              <img src={appLogo} alt="KnowSpace Logo" className="about-logo-img" />
            </div>
            <div>
              <div className="about-header-title-row">
                <span className="about-app-name">KnowSpace</span>
                <span className="about-version-badge">v{__APP_VERSION__}</span>
              </div>
              <p className="about-tagline">Personal Knowledge Workspace · 个人知识工作台</p>
            </div>
          </div>
          <button
            type="button"
            className="about-close-btn"
            onClick={onClose}
            title="关闭 (Esc)"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content sections */}
        <div className="about-body">
          {/* 1. 品牌 Slogan 与理念 */}
          <div className="about-card about-slogan-card">
            <div className="about-slogan-title">Write. Read. Connect. Know.</div>
            <div className="about-slogan-sub">记录 · 阅读 · 连接 · 认知</div>
            <p className="about-description" style={{ marginTop: 6 }}>
              <strong>KnowSpace</strong>{" "}
              是一款本地优先（Local-First）、现代化高颜值的个人知识工作台。以私密、高效、纯粹为核心，融汇思维导图双端非破坏性同步体系、全景知识图谱与单双击解耦、多模态空间白板、AABB
              绕障避障寻路算法、F5
              分镜全屏演示、时间旅行版本快照、毫秒混合检索与块级双向链接，助你构建立体多维的结构化思维空间。
            </p>
          </div>

          {/* 2. 版本更新日志 */}
          <div className="about-card about-changelog-card">
            <div className="about-card-title">
              <History size={16} className="about-icon text-blue" />
              <span>版本更新日志 · What&apos;s New</span>
              <span className="about-changelog-version-badge">v{__APP_VERSION__}</span>
            </div>
            <div className="about-changelog-list">
              <AboutChangelogRecent />
            </div>
          </div>

          {/* 闪念胶囊速记 / 系统偏好 / 视觉构型 / 能力体系 / 仓库 / 作者 / 许可 —
              the content cards between the changelog and the footer, verbatim
              into their own component (final trim wave); the settings card's
              state and bridge writers stay here and arrive as props. */}
          <AboutFeatureCards
            autoLaunch={autoLaunch}
            runInBackground={runInBackground}
            autoSaveEnabled={autoSaveEnabled}
            handleToggleAutoLaunch={handleToggleAutoLaunch}
            handleToggleRunInBackground={handleToggleRunInBackground}
            handleToggleAutoSave={handleToggleAutoSave}
            shellNewStatus={shellNewStatus}
            shellNewMessage={shellNewMessage}
            handleToggleShellNew={handleToggleShellNew}
            repoUrl={repoUrl}
            authorUrl={authorUrl}
            handleOpenExternal={handleOpenExternal}
          />
        </div>

        {/* Footer actions */}
        <div className="about-footer">
          <div className="about-footer-left">
            <button type="button" className="about-action-btn secondary" onClick={handleCopyRepo}>
              {copied ? <Check size={14} className="text-green" /> : <Copy size={14} />}
              <span>{copied ? "已复制链接" : "复制仓库地址"}</span>
            </button>
            <button
              type="button"
              className="about-action-btn secondary"
              onClick={() => handleOpenExternal(`${repoUrl}/releases`)}
            >
              <ExternalLink size={14} />
              <span>版本发布 (Releases)</span>
            </button>
            <button
              type="button"
              className="about-action-btn secondary"
              onClick={() => handleOpenExternal(repoUrl)}
            >
              <Github size={14} />
              <span>访问 GitHub</span>
              <ExternalLink size={12} />
            </button>
          </div>
          <button type="button" className="about-action-btn primary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
