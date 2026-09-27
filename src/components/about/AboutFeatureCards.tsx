import {
  ExternalLink,
  Github,
  User,
  Cpu,
  BookOpen,
  PenLine,
  FolderTree,
  Search,
  Sparkles,
  ShieldCheck,
  Box,
  Zap,
  ListTree,
  Network,
  Layers,
  SplitSquareVertical,
} from "lucide-react";

/**
 * The About dialog's content cards between the changelog and the footer:
 * the flash-capsule launcher, the system-preference checkboxes, the visual
 * concept, the capability pillars, and the project / author / license
 * blocks. The settings card is the only interactive one — its state and the
 * two writers live in AboutDialog (the app-settings bridge), and arrive here
 * as props. Extracted verbatim in the final trim wave to keep the dialog
 * shell a shell.
 */
type AboutFeatureCardsProps = {
  autoLaunch: boolean;
  runInBackground: boolean;
  handleToggleAutoLaunch: (val: boolean) => void | Promise<void>;
  handleToggleRunInBackground: (val: boolean) => void | Promise<void>;
  repoUrl: string;
  authorUrl: string;
  handleOpenExternal: (url: string) => void;
};

export function AboutFeatureCards({
  autoLaunch,
  runInBackground,
  handleToggleAutoLaunch,
  handleToggleRunInBackground,
  repoUrl,
  authorUrl,
  handleOpenExternal,
}: AboutFeatureCardsProps) {
  return (
    <>
      {/* 闪念胶囊速记快捷入口 */}
      <div className="about-card">
        <div className="about-card-title">
          <Zap size={16} className="about-icon text-amber" />
          <span>闪念胶囊速记 · Flash Notes</span>
        </div>
        <p className="about-description">
          随时随地按下全局热键（默认 <code>Alt + Space</code>
          ，可自定义）秒级呼出毛玻璃速记微窗，无打扰捕获灵感火花与即时待办，
          <code>Ctrl + Enter</code> 原子归档落盘至 <code>Inbox/</code> 收集箱。
        </p>
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            className="flash-btn flash-btn-primary"
            style={{ fontSize: 12, padding: "4px 12px" }}
            onClick={() => {
              // Both window keys expose the same namespaced bridge.
              const desktop = window.knowSpaceDesktop;
              desktop?.capture.openFlashCapsule?.();
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
              style={{
                accentColor: "#f59e0b",
                width: 16,
                height: 16,
                marginTop: 2,
                cursor: "pointer",
              }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>开机自启动 (后台静默就绪)</div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginTop: 2,
                  lineHeight: 1.4,
                }}
              >
                Windows 开机后自动在后台托盘静默就绪，不弹出主窗口打扰，随时按热键呼出闪念胶囊
              </div>
            </div>
          </label>

          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={runInBackground}
              onChange={(e) => handleToggleRunInBackground(e.target.checked)}
              style={{
                accentColor: "#f59e0b",
                width: 16,
                height: 16,
                marginTop: 2,
                cursor: "pointer",
              }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                关闭主窗口时保持后台运行 (最小化至托盘)
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginTop: 2,
                  lineHeight: 1.4,
                }}
              >
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
          一个半透明悬浮的等距等角投影（Isometric）多面体空间，内部悬浮着一颗发光的知识晶体核心（Knowledge
          Core）。采用磨砂玻璃（Frosted
          Glassmorphism）质感与发光切面，寓意收纳一切想法、文档、图表与知识的私密安全空间。
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
            <div className="about-pillar-desc">
              树状交互脑图、文字智能折行、自由拉伸调整大小与四向排版对齐
            </div>
          </div>
          <div className="about-pillar-item">
            <div className="about-pillar-head">
              <Layers size={14} className="text-purple" />
              <strong>Block Links (块级互联)</strong>
            </div>
            <div className="about-pillar-desc">
              ^block-id 精准锚点指纹、跨文档双链跳转与卡片内嵌预览
            </div>
          </div>
          <div className="about-pillar-item">
            <div className="about-pillar-head">
              <Network size={14} className="text-purple" />
              <strong>Graph (全景图谱)</strong>
            </div>
            <div className="about-pillar-desc">
              文档与块级双向网状拓扑、有机力导向布局与知识漫游
            </div>
          </div>
          <div className="about-pillar-item">
            <div className="about-pillar-head">
              <Zap size={14} className="text-amber" />
              <strong>Flash (闪念胶囊)</strong>
            </div>
            <div className="about-pillar-desc">
              全局热键随手记、毛玻璃微窗、常驻模板与 Space 原子归档
            </div>
          </div>
          <div className="about-pillar-item">
            <div className="about-pillar-head">
              <BookOpen size={14} className="text-orange" />
              <strong>Reader (阅读引擎)</strong>
            </div>
            <div className="about-pillar-desc">
              沉浸纯净排版、仿电子墨水屏护眼与双侧联动微光高亮
            </div>
          </div>
          <div className="about-pillar-item">
            <div className="about-pillar-head">
              <PenLine size={14} className="text-blue" />
              <strong>Editor (极客编辑)</strong>
            </div>
            <div className="about-pillar-desc">
              CodeMirror 6 极速编辑、AST 零延迟双向同步滚动与剪贴板图床
            </div>
          </div>
          <div className="about-pillar-item">
            <div className="about-pillar-head">
              <Search size={14} className="text-cyan" />
              <strong>Search & TOC (检索大纲)</strong>
            </div>
            <div className="about-pillar-desc">
              全文段落卡片聚合即时检索、多级目录大纲随动追踪与书签记忆
            </div>
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
            <div className="about-pillar-desc">
              物理事务原子落盘、系统托盘后台静默就绪与外部冲突拦截
            </div>
          </div>
        </div>
      </div>

      {/* 5. GitHub 主页与开源仓库 */}
      <div className="about-card">
        <div className="about-card-title">
          <Github size={16} className="about-icon text-purple" />
          <span>GitHub 官方开源仓库与版本发布</span>
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
        <div className="about-info-row" style={{ marginTop: 6 }}>
          <span className="about-label">最新发布：</span>
          <a
            href={`${repoUrl}/releases`}
            className="about-link"
            onClick={(e) => {
              e.preventDefault();
              handleOpenExternal(`${repoUrl}/releases`);
            }}
            title="下载最新安装包与便携版"
          >
            <span>
              {repoUrl}/releases (下载 v{__APP_VERSION__} 安装包与便携版)
            </span>
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
    </>
  );
}
