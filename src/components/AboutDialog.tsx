import { useState, useEffect, useCallback } from "react";
import {
  ExternalLink,
  Github,
  User,
  Cpu,
  Check,
  Copy,
  X,
  BookOpen,
  PenLine,
  FolderTree,
  Search,
  Sparkles,
  ShieldCheck,
  Box,
  History,
  Zap,
  Wrench,
  ListTree,
  Network,
  Layers,
  SplitSquareVertical,
} from "lucide-react";
import appLogo from "../assets/icon.png";

type AboutDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  const [copied, setCopied] = useState(false);
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [runInBackground, setRunInBackground] = useState(true);

  const repoUrl = "https://github.com/chunxvzhang-lab/KnowSpace";
  const authorUrl = "https://github.com/chunxvzhang";

  useEffect(() => {
    if (!isOpen) return undefined;
    const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;
    desktop?.getAppSettings?.().then((settings) => {
      if (settings) {
        setAutoLaunch(settings.autoLaunch);
        setRunInBackground(settings.runInBackground);
      }
    });

    const unsubscribe = desktop?.onAppSettingsUpdated?.((settings) => {
      setAutoLaunch(settings.autoLaunch);
      setRunInBackground(settings.runInBackground);
    });

    return () => unsubscribe?.();
  }, [isOpen]);

  const handleToggleAutoLaunch = async (val: boolean) => {
    setAutoLaunch(val);
    const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;
    const res = await desktop?.setAppSettings?.({ autoLaunch: val });
    if (res?.settings) {
      setAutoLaunch(res.settings.autoLaunch);
      setRunInBackground(res.settings.runInBackground);
    }
  };

  const handleToggleRunInBackground = async (val: boolean) => {
    setRunInBackground(val);
    const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;
    const res = await desktop?.setAppSettings?.({ runInBackground: val });
    if (res?.settings) {
      setAutoLaunch(res.settings.autoLaunch);
      setRunInBackground(res.settings.runInBackground);
    }
  };

  const handleOpenExternal = useCallback((url: string) => {
    if (typeof window !== "undefined") {
      const desktop = (window as unknown as { knowSpaceDesktop?: { openExternal?: (url: string) => Promise<boolean> }; bookMDDesktop?: { openExternal?: (url: string) => Promise<boolean> } }).knowSpaceDesktop || (window as unknown as { bookMDDesktop?: { openExternal?: (url: string) => Promise<boolean> } }).bookMDDesktop;
      if (desktop?.openExternal) {
        desktop.openExternal(url);
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
    <div className="about-dialog-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="about-dialog-title">
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
                <span className="about-version-badge">v2.0.0</span>
              </div>
              <p className="about-tagline">Personal Knowledge Workspace · 个人知识工作台</p>
            </div>
          </div>
          <button type="button" className="about-close-btn" onClick={onClose} title="关闭 (Esc)" aria-label="关闭">
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
              <strong>KnowSpace</strong> 是一款本地优先（Local-First）、现代化高颜值的个人知识工作台。以私密、高效、纯粹为核心，融汇无限可视化白板、时间旅行版本快照、毫秒混合检索、交互式思维导图、全景知识图谱与块级双向链接，助你构建立体多维的结构化思维空间。
            </p>
          </div>

          {/* 2. 版本更新日志 */}
          <div className="about-card about-changelog-card">
            <div className="about-card-title">
              <History size={16} className="about-icon text-blue" />
              <span>版本更新日志 · What&apos;s New</span>
              <span className="about-changelog-version-badge">v2.0.0</span>
            </div>
            <div className="about-changelog-list">
              {/* v2.0.0 */}
              <div className="about-changelog-group">
                <div className="about-changelog-group-label">
                  <Sparkles size={12} className="text-cyan" />
                  <span>v2.0.0 无限空间白板、时间旅行版本快照与全库混合检索</span>
                </div>
                <ul className="about-changelog-items">
                  <li>🎨 <strong>无限空间可视化白板 (Infinite Canvas · JSON Canvas 1.0)</strong>：多模态卡片（Markdown 文本、内嵌文档卡片、分组容器）、贝塞尔/折线连线与磁吸锚点、小地图视口导航，支持将白板拓扑因果关系一键逆向萃取为结构化 Markdown 专著。</li>
                  <li>⏳ <strong>本地时间旅行与版本快照历史 (Local Version History)</strong>：<code>.knowspace/snapshots/</code> 静默差异快照捕获引擎、时间轴版本面板、左右双栏 Side-by-Side 逐行与行内对比、一键无损安全还原与手动快照 (<code>Ctrl+Shift+H</code>)。</li>
                  <li>🔍 <strong>全库毫秒级混合检索引擎 (Hybrid Vault Search)</strong>：全新倒排索引与高级结构化语法（<code>tag:#架构</code>、<code>link:[[双链]]</code>、<code>&quot;严格短语&quot;</code>、<code>-排除词</code>、时间过滤），支持当前章节与全库知识库一键秒级切换。</li>
                </ul>
              </div>

              {/* v1.10.0 */}
              <div className="about-changelog-group" style={{ marginTop: 10, opacity: 0.85 }}>
                <div className="about-changelog-group-label">
                  <Sparkles size={12} className="text-blue" />
                  <span>v1.10.0 斜杠命令、右键上下文感知、专业PDF打印与导图重排</span>
                </div>
                <ul className="about-changelog-items">
                  <li>⌨️ <strong>全键盘斜杠命令菜单 (`/`)</strong>：行首或空格后输入 <code>/</code> 极速呼出补全菜单，支持 20+ 项原生排版、GFM 智能表格、代码块、LaTeX 公式、Mermaid 图表与 Callout 模版。</li>
                  <li>📑 <strong>Obsidian 级情境感知右键菜单</strong>：划词提取为新独立笔记、生成段落块引用（<code>^block-id</code>）、存入闪念收集箱与字数统计。</li>
                  <li>🖨️ <strong>高保真专业 PDF 矢量打印与导出</strong>：集成 Chromium 原生打印引擎 (<code>Ctrl+P</code>)，印刷级跨页防截断规则。</li>
                  <li>🧠 <strong>思维导图跨层级拖拽重排与画布搜索</strong>：支持分支拖拽改变父子层级与同级重排，悬浮搜索实时匹配聚焦。</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 闪念胶囊速记快捷入口 */}
          <div className="about-card">
            <div className="about-card-title">
              <Zap size={16} className="about-icon text-amber" />
              <span>闪念胶囊速记 · Flash Notes</span>
            </div>
            <p className="about-description">
              随时随地按下全局热键（默认 <code>Alt + Space</code>，可自定义）秒级呼出毛玻璃速记微窗，无打扰捕获灵感火花与即时待办，<code>Ctrl + Enter</code> 原子归档落盘至 <code>Inbox/</code> 收集箱。
            </p>
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                className="flash-btn flash-btn-primary"
                style={{ fontSize: 12, padding: "4px 12px" }}
                onClick={() => {
                  const desktop = (window as unknown as { knowSpaceDesktop?: { openFlashCapsule?: () => void }; bookMDDesktop?: { openFlashCapsule?: () => void } }).knowSpaceDesktop || (window as unknown as { bookMDDesktop?: { openFlashCapsule?: () => void } }).bookMDDesktop;
                  desktop?.openFlashCapsule?.();
                }}
              >
                <Zap size={13} /> 立即呼出闪念胶囊 (设置热键)
              </button>
            </div>
          </div>

          {/* 后台运行与开机自启动设置 */}
          <div className="about-card">
            <div className="about-card-title">
              <Cpu size={16} className="about-icon text-blue" />
              <span>系统运行与开机偏好设置 · System Preferences</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={autoLaunch}
                  onChange={(e) => handleToggleAutoLaunch(e.target.checked)}
                  style={{ accentColor: "#f59e0b", width: 16, height: 16, marginTop: 2, cursor: "pointer" }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>开机自启动 (后台静默就绪)</div>
                  <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 2, lineHeight: 1.4 }}>
                    Windows 开机后自动在后台托盘静默就绪，不弹出主窗口打扰，随时按热键呼出闪念胶囊
                  </div>
                </div>
              </label>

              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={runInBackground}
                  onChange={(e) => handleToggleRunInBackground(e.target.checked)}
                  style={{ accentColor: "#f59e0b", width: 16, height: 16, marginTop: 2, cursor: "pointer" }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>关闭主窗口时保持后台运行 (最小化至托盘)</div>
                  <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 2, lineHeight: 1.4 }}>
                    点击窗口右上角 ✕ 时隐藏至右下角系统托盘，双击托盘图标或在托盘右键即可恢复打开工作台
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* 3. 视觉构型：超立方空间 */}
          <div className="about-card">
            <div className="about-card-title">
              <Box size={16} className="about-icon text-orange" />
              <span>视觉构型 ·「超立方空间」HyperSpace Cube</span>
            </div>
            <p className="about-description">
              一个半透明悬浮的等距等角投影（Isometric）多面体空间，内部悬浮着一颗发光的知识晶体核心（Knowledge Core）。采用磨砂玻璃（Frosted Glassmorphism）质感与发光切面，寓意收纳一切想法、文档、图表与知识的私密安全空间。
            </p>
          </div>

          {/* 4. 核心能力体系 */}
          <div className="about-card">
            <div className="about-card-title">
              <Sparkles size={16} className="about-icon text-blue" />
              <span>核心能力体系 (Core Pillars)</span>
            </div>
            <div className="about-pillars-grid">
              <div className="about-pillar-item">
                <div className="about-pillar-head">
                  <ListTree size={14} className="text-cyan" />
                  <strong>Mindmap (思维导图)</strong>
                </div>
                <div className="about-pillar-desc">树状交互脑图、文字智能折行、自由拉伸调整大小与四向排版对齐</div>
              </div>
              <div className="about-pillar-item">
                <div className="about-pillar-head">
                  <Layers size={14} className="text-purple" />
                  <strong>Block Links (块级互联)</strong>
                </div>
                <div className="about-pillar-desc">^block-id 精准锚点指纹、跨文档双链跳转与卡片内嵌预览</div>
              </div>
              <div className="about-pillar-item">
                <div className="about-pillar-head">
                  <Network size={14} className="text-purple" />
                  <strong>Graph (全景图谱)</strong>
                </div>
                <div className="about-pillar-desc">文档与块级双向网状拓扑、有机力导向布局与知识漫游</div>
              </div>
              <div className="about-pillar-item">
                <div className="about-pillar-head">
                  <Zap size={14} className="text-amber" />
                  <strong>Flash (闪念胶囊)</strong>
                </div>
                <div className="about-pillar-desc">全局热键随手记、毛玻璃微窗、常驻模板与 Space 原子归档</div>
              </div>
              <div className="about-pillar-item">
                <div className="about-pillar-head">
                  <BookOpen size={14} className="text-orange" />
                  <strong>Reader (阅读引擎)</strong>
                </div>
                <div className="about-pillar-desc">沉浸纯净排版、仿电子墨水屏护眼与双侧联动微光高亮</div>
              </div>
              <div className="about-pillar-item">
                <div className="about-pillar-head">
                  <PenLine size={14} className="text-blue" />
                  <strong>Editor (极客编辑)</strong>
                </div>
                <div className="about-pillar-desc">CodeMirror 6 极速编辑、AST 零延迟双向同步滚动与剪贴板图床</div>
              </div>
              <div className="about-pillar-item">
                <div className="about-pillar-head">
                  <Search size={14} className="text-cyan" />
                  <strong>Search & TOC (检索大纲)</strong>
                </div>
                <div className="about-pillar-desc">全文段落卡片聚合即时检索、多级目录大纲随动追踪与书签记忆</div>
              </div>
              <div className="about-pillar-item">
                <div className="about-pillar-head">
                  <SplitSquareVertical size={14} className="text-blue" />
                  <strong>Split (双栏分屏)</strong>
                </div>
                <div className="about-pillar-desc">多标签页管理与并排双文档独立滚动对照写作</div>
              </div>
              <div className="about-pillar-item">
                <div className="about-pillar-head">
                  <FolderTree size={14} className="text-green" />
                  <strong>Library (知识库)</strong>
                </div>
                <div className="about-pillar-desc">多级目录树展开记忆、单文档与多层知识库智能载入</div>
              </div>
              <div className="about-pillar-item">
                <div className="about-pillar-head">
                  <ShieldCheck size={14} className="text-amber" />
                  <strong>Security (安全基石)</strong>
                </div>
                <div className="about-pillar-desc">物理事务原子落盘、系统托盘后台静默就绪与外部冲突拦截</div>
              </div>
            </div>
          </div>

          {/* 5. GitHub 主页与开源仓库 */}
          <div className="about-card">
            <div className="about-card-title">
              <Github size={16} className="about-icon text-purple" />
              <span>GitHub 官方开源仓库</span>
            </div>
            <div className="about-info-row">
              <span className="about-label">项目主页：</span>
              <a
                href={repoUrl}
                className="about-link"
                onClick={(e) => {
                  e.preventDefault();
                  handleOpenExternal(repoUrl);
                }}
                title="在外部浏览器打开"
              >
                <span>{repoUrl}</span>
                <ExternalLink size={13} />
              </a>
            </div>
          </div>

          {/* 6. 账号与作者信息 */}
          <div className="about-card">
            <div className="about-card-title">
              <User size={16} className="about-icon text-blue" />
              <span>研发团队与作者信息</span>
            </div>
            <div className="about-info-grid">
              <div className="about-info-row">
                <span className="about-label">开发者账号：</span>
                <a
                  href={authorUrl}
                  className="about-link"
                  onClick={(e) => {
                    e.preventDefault();
                    handleOpenExternal(authorUrl);
                  }}
                  title="访问作者 GitHub 主页"
                >
                  <span>chunxvzhang</span>
                  <ExternalLink size={12} />
                </a>
              </div>
              <div className="about-info-row">
                <span className="about-label">研发团队：</span>
                <span className="about-value">KnowSpace Lab · 摸鱼Lab</span>
              </div>
            </div>
          </div>

          {/* 7. 运行环境与开源许可 */}
          <div className="about-card">
            <div className="about-card-title">
              <Cpu size={16} className="about-icon text-green" />
              <span>运行环境与开源许可</span>
            </div>
            <div className="about-info-list">
              <div className="about-info-row">
                <span className="about-label">核心技术栈：</span>
                <div className="about-tech-badges">
                  <span className="about-tech-tag">Electron 42</span>
                  <span className="about-tech-tag">React 19</span>
                  <span className="about-tech-tag">Vite 7</span>
                  <span className="about-tech-tag">CodeMirror 6</span>
                  <span className="about-tech-tag">TypeScript 5.9</span>
                  <span className="about-tech-tag">Mermaid 11</span>
                  <span className="about-tech-tag">KaTeX</span>
                  <span className="about-tech-tag">Lucide</span>
                </div>
              </div>
              <div className="about-info-row">
                <span className="about-label">开源许可：</span>
                <span className="about-value">MIT License</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="about-footer">
          <div className="about-footer-left">
            <button
              type="button"
              className="about-action-btn secondary"
              onClick={handleCopyRepo}
            >
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
