import { useState, useEffect, useCallback, useRef } from "react";
import { ExternalLink, Github, Check, Copy, X, SlidersHorizontal, Info } from "lucide-react";
import appLogo from "../assets/icon.png";
import { AboutFeatureCards } from "./about/AboutFeatureCards";
import { AboutModelSettings } from "./about/AboutModelSettings";
import { useUiStore } from "../store/useUiStore";

type AboutDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const tab = useUiStore((s) => s.aboutTab);
  const setTab = (aboutTab: "overview" | "model") => useUiStore.setState({ aboutTab });
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
    const previousFocus = document.activeElement;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
      if (e.key === "Tab") {
        const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]",
        );
        if (!controls?.length) return;
        const first = controls[0],
          last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
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
      <div ref={dialogRef} className="about-dialog-card" onClick={(e) => e.stopPropagation()}>
        {/* Header with Close button */}
        <div className="about-header">
          <div className="about-brand-section">
            <div className="about-logo-wrapper">
              <img src={appLogo} alt="KnowSpace Logo" className="about-logo-img" />
            </div>
            <div>
              <div className="about-header-title-row">
                <span className="about-app-name" id="about-dialog-title">
                  KnowSpace
                </span>
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

        <nav className="about-nav" aria-label="关于页签">
          <button
            type="button"
            aria-current={tab === "overview" ? "page" : undefined}
            onClick={() => setTab("overview")}
          >
            <Info size={16} />
            关于软件
          </button>
          <button
            type="button"
            aria-current={tab === "model" ? "page" : undefined}
            onClick={() => setTab("model")}
          >
            <SlidersHorizontal size={16} />
            模型接口
          </button>
        </nav>
        <div className="about-body">
          {tab === "model" ? (
            <AboutModelSettings />
          ) : (
            <>
              <section className="about-intro">
                <p className="about-eyebrow">你的本地知识工作台</p>
                <h2>记录想法，连接知识。</h2>
                <p>
                  用 Markdown 写作，以思维导图整理脉络，在白板上展开想法。AI
                  助理与你一起阅读、创作与修改。
                </p>
                <div className="about-capabilities">
                  <span>Markdown 写作</span>
                  <span>思维导图</span>
                  <span>空间白板</span>
                  <span>AI 助理</span>
                </div>
              </section>
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
            </>
          )}
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
