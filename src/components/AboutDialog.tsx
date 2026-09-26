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
                <span className="about-version-badge">v{__APP_VERSION__}</span>
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
              <strong>KnowSpace</strong> 是一款本地优先（Local-First）、现代化高颜值的个人知识工作台。以私密、高效、纯粹为核心，融汇思维导图双端非破坏性同步体系、全景知识图谱与单双击解耦、多模态空间白板、AABB 绕障避障寻路算法、F5 分镜全屏演示、时间旅行版本快照、毫秒混合检索与块级双向链接，助你构建立体多维的结构化思维空间。
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
              {/* v2.6.5 */}
              <div className="about-changelog-group">
                <div className="about-changelog-group-label">
                  <Sparkles size={12} className="text-cyan" />
                  <span>v2.6.5 点开头的文件可以显示了 · 目录不再漏文件 · 复盘与切换提速</span>
                </div>
                <ul className="about-changelog-items">
                  <li>👁️ <strong>新增「显示点开头的文件」开关</strong>（工具栏，仅在打开了文件夹时出现；<strong>默认关闭</strong>，所以升级后第一眼看到的目录树与 v2.6.4 完全一样）。过滤规则分两类：<code>.git</code>、<code>node_modules</code>、<code>dist</code> 这类工具与系统目录<strong>始终跳过</strong>，开关不会把仓库内部结构铺进文档树；你自己的隐藏文件（<code>.草稿.md</code>、<code>.archive/</code>）打开后显示，并以弱化样式呈现。</li>
                  <li>🔤 <strong>隐藏项作为一整块排在可见项之后</strong>，不按名字与可见项混排 —— 打开开关应当是「末尾多出一段」，而不是把你正在看的列表重新排一遍：文档挪位置只因为<em>另一个</em>文档被显示出来，是让列表显得不可靠的那类变化。判定规则为「文件名以点开头，<strong>或它上面任意一层文件夹以点开头</strong>」。</li>
                  <li>🗂️ <strong>修复目录扫描静默漏文件</strong>：文件上限 3000 与深度上限 6 层此前是<strong>硬截断且不产生任何提示</strong> —— 第 7 层往下的整棵子树直接丢弃，读者的结论只能是「我的文档不见了」。现改为护栏（50000 个文件 / 64 层 + 20 秒墙钟兜底），<strong>截断原因必须上报</strong>并在目录树底部说明；同时补上 junction 环路保护与符号链接分支，并区分「打不开的目录」与「空目录」（此前权限不足与空目录都返回空列表，长得一模一样）。</li>
                  <li>🖱️ <strong>修复复盘的文件夹列表滚不动</strong>：列表本身没有滚动容器，而外层容器是 <code>overflow: hidden</code>、头部又不肯收缩，于是列表一变长就被直接裁掉 —— 既没有滚动条也没有触屏手势。顺带修了一个更糟的：列表为空时整个容器不渲染，<strong>「添加文件夹」这个唯一能填充列表的入口被一起藏掉</strong>。</li>
                  <li>⚡ <strong>打开新文件不再跳动</strong>：切换文档时存在两个中间态 —— Tab 已切到新文件而正文还是旧的；以及新正文渲染前的「新身份 + 旧内容」那一帧。现在在切换时<strong>同步查渲染缓存</strong>，让两者落在同一次提交里，中间那一帧就不存在了。</li>
                  <li>🚀 <strong>几处按次发生的平方级扫描</strong>：围栏代码块扫描由「每行从头重扫」改为一次预扫描（5000 行笔记 <strong>973.6 ms → 1.01 ms</strong>）；文件夹路径去重改用 Set（5000 个路径 <strong>7080 ms → 4.4 ms</strong> —— 此前选满 5 个文件夹再切到该来源，界面会僵住约 7 秒）；目录树构建改为查表（9000 篇 <strong>265 ms → 23 ms</strong>）。</li>
                  <li>🧪 <strong>测试规模</strong>：<strong>110 个测试套件、1382 项</strong>单元与集成测试 100% 通过。</li>
                </ul>
              </div>

              {/* v2.6.4 */}
              <div className="about-changelog-group">
                <div className="about-changelog-group-label">
                  <Sparkles size={12} className="text-cyan" />
                  <span>v2.6.4 白板卡片：斜杠命令侧边栏与滚轮归属</span>
                </div>
                <ul className="about-changelog-items">
                  <li>⌨️ <strong>卡片里键入 <code>/</code> 弹出与文档编辑器同一套斜杠命令</strong>：此前卡片里的 <code>/</code> 打开的是「引用笔记」弹层，而且两个编辑器各写了一份触发规则 —— 照抄一份界面只能保证今天一样，所以这次让两边<strong>调用同一个判定函数与同一张命令表</strong>。上下键选择、Enter / Tab 插入、Esc 关闭、英文与拼音首字母搜索，在哪儿都一样。</li>
                  <li>🔗 <strong>引用笔记改用 <code>[[</code></strong>，与文档编辑器语义对齐；从命令列表里选「双向链接 <code>[[]]</code>」会<strong>自动接上</strong>笔记列表。斜杠只在一行开头或空格之后生效 —— 路径、网址与 <code>//</code> 注释里的斜杠不会再弹出面板。</li>
                  <li>🖱️ <strong>滚动卡片内的清单不再带动画布</strong>：滚轮此前同时做了两件事 —— 卡片自己滚，事件又冒泡到画布把整块白板一起平移。现在按<strong>滚动链语义</strong>判定归属：内层还有得滚就归内层，滚到顶或底才交还给画布，所以滚轮停在卡片上永远不会变成死区。</li>
                  <li>🧪 <strong>测试规模</strong>：<strong>103 个测试套件、1276 项</strong>单元与集成测试 100% 通过；另修掉一条在全量运行下偶发失败的用例（复习来源写入本地存储却未在测试之间清理）。</li>
                </ul>
              </div>

              {/* v2.6.3 */}
              <div className="about-changelog-group">
                <div className="about-changelog-group-label">
                  <Sparkles size={12} className="text-cyan" />
                  <span>v2.6.3 导图顶栏重排：双栏展开时，两行对齐成一列</span>
                </div>
                <ul className="about-changelog-items">
                  <li>📐 <strong>顶栏改成网格</strong>：此前它是一条会自己换行的横排，而中间控制区的基准宽度是它的<strong>最大内容宽度</strong> —— 等于先把整行占下；于是被挤到第二行的是右侧的缩放与导出（独自靠右、上方空着半行），标题又在两行之间垂直居中。现在：标题一列、控件区一列、缩放与导出一列。</li>
                  <li>🧩 <strong>设置控件整排换行</strong>：搜索 / 主题 / 布局 / 编号装不下时整排落到第二行，并<strong>与第一行第一个控件同列</strong>、可伸展到右端 —— 前者让两行读成一列，后者让它不必再挤第三行；缩放与导出整组搬到<strong>第二行右端</strong>，第二行因此是满的。</li>
                  <li>📏 <strong>一行还是两行，由顶栏自己量出来</strong>（2026-09-21 构建更新）：不再看写死的 1800px 阈值 —— 那个数是「全带文字 + 搜索框开着」时量的，于是搜索框没开的多数窗口明明放得下一行却落进两行，打开搜索框又会从够宽的窗口里溢出去。现在把六种排法各量一遍，<strong>第一种放得下的胜出</strong>；量的是真实内容，标题长短、搜索框开闭、多选徽章都自动算进去。</li>
                  <li>🔗 <strong>链接徽章改为透明底</strong>（2026-09-21 构建更新）：节点右下角的链接徽章去掉 22% 的紫底，只剩箭头与一圈细边；SVG / PNG 导出一致。</li>
                  <li>☑️ <strong>白板卡片三处连修</strong>（2026-09-21 构建更新）：卡片里的<strong>任务清单可以点选与取消</strong>（此前按下被画布平移抢走，松手时的重渲染换掉了复选框，click 再也落不回去）；卡片编辑器<strong>支持键入 <code>/</code> 或 <code>[[</code> 引用工作区笔记</strong>，渲染出的双链点击即可打开；<strong>Ctrl+Enter 保存后编辑器不再被重新打开</strong>（编辑卡片时的 Delete / Tab / R 也不再误触发画布快捷键）。</li>
                  <li>🎚️ <strong>尺寸与间距统一</strong>：控件一律 30px 高（搜索框与缩放读数此前矮一截、看着是"漂"着）；组间 6px、组内 4px；窄档位补回上下留白；<strong>主题与布局下拉</strong>做成真正的控件 —— 边框、按钮同高、正文色（此前用 <code>--text-primary</code>，在未定义它的主题里看着像被禁用）。</li>
                  <li>🧪 <strong>测试规模</strong>：<strong>99 个测试套件、1241 项</strong>单元与集成测试 100% 通过；布局另有实机截图与计算盒核对。</li>
                </ul>
              </div>

              {/* v2.6.2 */}
              <div className="about-changelog-group">
                <div className="about-changelog-group-label">
                  <Sparkles size={12} className="text-cyan" />
                  <span>v2.6.2 导图细节打磨：顶栏对齐、徽章真能点、图标位置与 PNG 清晰度</span>
                </div>
                <ul className="about-changelog-items">
                  <li>📐 <strong>顶栏两行对齐</strong>：两行布局下第二行与第一行左对齐（此前各组基线不同，保存 / 更多那一排看起来是错位的）。</li>
                  <li>🔗 <strong>链接徽章真正可点</strong>：根因是父层的 <code>pointer-events: none</code> 被继承下来，徽章收不到点击 —— 改为显式 <code>auto</code>；顺带支持<strong>裸域名</strong>（<code>example.com</code>）。</li>
                  <li>🏷️ <strong>节点类型图标画在主题盒子之上</strong>：不再落在盒内右下角被连线压住。</li>
                  <li>🖼️ <strong>PNG 导出改为 3× 超采样</strong>：放大后文字与图标不再发虚。</li>
                  <li>🧪 <strong>测试规模</strong>：<strong>99 个测试套件、1241 项</strong>单元与集成测试 100% 通过。</li>
                </ul>
              </div>

              {/* v2.6.1 */}
              <div className="about-changelog-group">
                <div className="about-changelog-group-label">
                  <Sparkles size={12} className="text-cyan" />
                  <span>v2.6.1 交互对象收口：顶栏、按键归属、链接徽章与节点类型</span>
                </div>
                <ul className="about-changelog-items">
                  <li>📐 <strong>顶栏不再丢右侧控件</strong>：打开文件目录与大纲后，顶栏改为<strong>装不下就换行</strong>（旧写法是定高 + 横向滚动且藏掉滚动条，右侧控件既看不见也够不着）；<strong>缩放与导出</strong>移到右侧同一组，不再跟着中间那排控件重排；滚轮落在顶栏上<strong>不再缩放画布</strong>。</li>
                  <li>⌨️ <strong>快捷键归属插入符所在的输入框</strong>：在<strong>备注框</strong>里按 <code>Delete</code> 此前会删掉备注所属的<strong>整个主题</strong>，在<strong>标签 / 链接框</strong>里按 <code>Ctrl+V</code> 会贴出一个分支 —— 现在有插入符的地方键就属于那个框（<code>Escape</code> 除外）。节点菜单新增 <strong>复制整个主题 / 剪切整个主题 / 粘贴为子主题</strong> 三行，删除行明确为「<strong>删除整个主题及其子主题</strong>」。</li>
                  <li>🔗 <strong>点链接徽章直接打开</strong>：节点右下角的链接徽章从"记号"变成"控件" —— 外链走系统浏览器，<code>[[笔记]]</code> 与 <code>#标题</code> 走阅读器自己的两条通道；命中区放大，悬停提亮，且<strong>不会顺手选中或拖动主题</strong>（自由主题上的徽章同样可点）。</li>
                  <li>🏷️ <strong>节点图标重做为「节点类型」</strong>：从 34 枚按无关分组排列的图片，改为 <strong>一行 8 枚、一名一义</strong>（待办 / 进行中 / 已完成 / 疑问 / 想法 / 风险 / 重点 / 参考），每枚附一句"何时使用"；一个主题至多一枚，点击设置、再点取消，<strong>在画布搜索里输入类型名即可找出同类主题</strong>；旧文件写过的图标 id 仍会画出来。</li>
                  <li>🖱️ <strong>点顶栏收起右键菜单</strong>，且不像点画布那样连选择一起丢掉；「换到另一侧」弹层的两行字改为正文色加粗按钮，不再需要凑近看。</li>
                  <li>🧪 <strong>测试规模</strong>：<strong>99 个测试套件、1238 项</strong>单元与集成测试 100% 通过。</li>
                </ul>
              </div>

              {/* v2.6.0 */}
              <div className="about-changelog-group">
                <div className="about-changelog-group-label">
                  <Sparkles size={12} className="text-cyan" />
                  <span>v2.6.0 导图导入导出闭环 · 闪卡的来源、撤销与写回安全</span>
                </div>
                <ul className="about-changelog-items">
                  <li>🧠 <strong>思维导图导入导出补齐</strong>：新增 <strong><code>.xmind</code> 导出与导入</strong>（DEFLATE 解压与 ZIP 读写为自写实现，且是<strong>唯一一种本应用能读回来</strong>的格式），并补上 <strong>SVG / 打印即 PDF</strong> 导出 —— 导出共 <strong>7 种</strong>、导入 <strong>3 种</strong>（<code>.opml</code> / <code>.mm</code> / <code>.xmind</code>，导入为新文档并带回备注、链接、关系线、概要与边界）。</li>
                  <li>📂 <strong>闪卡四种来源</strong>：闪念 Space / 当前知识库 / <strong>自定义文件夹（最多 5 个）</strong> / 当前文档，并<strong>记住上次用过的来源</strong>；「当前文档」在<strong>有未保存改动时不可选</strong>并说明原因 —— 评分要写进文件，而没有自动保存，之后那次保存会把进度覆盖掉。</li>
                  <li>↩️ <strong>评分可撤销一步</strong>：按错键（<code>重来</code> 与 <code>良好</code> 只隔一个键位）时点撤销按钮或按 <code>Ctrl/Cmd + Z</code>；从没复习过的卡片会把那一行整个收回，<strong>一篇只评过一次就被撤销的笔记与从未评过时逐字节相同</strong>。</li>
                  <li>⌨️ <strong>两个新入口</strong>：命令面板（<code>Ctrl+K</code>）一步「开始复习：闪卡」；编辑器里 <code>/闪卡</code> 直接插入问答 / 行内 / 挖空三种模板，光标落在示例文字上。</li>
                  <li>🛡️ <strong>写回改为合并</strong>：写回前重读文件，只把自己那一行合并进<strong>文件当下的内容</strong> —— 复习期间别处的改动不会被覆盖，被删掉的卡片不再写回，读不到文件时明确报错而不硬写。同时修复三处缺陷：知识库来源此前<strong>按位置配对</strong>（会把进度<strong>写进别的文档</strong>）、同一张卡出现在两篇笔记时被重复计数、撤销唯一一次评分会留下空行。</li>
                  <li>🧪 <strong>测试规模</strong>：<strong>94 个测试套件、1208 项</strong>单元与集成测试 100% 通过。</li>
                </ul>
              </div>

              {/* v2.5.0 */}
              <div className="about-changelog-group" style={{ marginTop: 10, opacity: 0.9 }}>
                <div className="about-changelog-group-label">
                  <Sparkles size={12} className="text-cyan" />
                  <span>v2.5.0 FSRS-5 间隔重复闪卡与架构减负</span>
                </div>
                <ul className="about-changelog-items">
                  <li>🃏 <strong>FSRS-5 间隔重复闪卡 (Spaced Repetition)</strong>：补齐「记录 → 整理 → 连接 → <strong>内化</strong>」的最后一环。基于 <strong>DSR 记忆模型</strong>（稳定性 / 难度 / 可回忆性）与遗忘曲线 <code>R(t,S) = (1 + FACTOR·t/S)^DECAY</code> 逐卡调度，让「保持率恰好降到 90% 的那一刻」成为复习时刻。</li>
                  <li>📝 <strong>三种零侵入语法</strong>：<code>Q:</code>/<code>A:</code> 问答块、<code>问题 :: 答案</code> 行内卡、<code>{"{{c1::答案}}"}</code> 与 <code>==高亮==</code> 挖空卡 —— 卡片直接写在普通 Markdown 里，<strong>不污染正文、不与第三方编辑器冲突</strong>；调度进度存于文档末尾单条 HTML 注释，一卡一行，Git diff 保持可读。</li>
                  <li>🎚️ <strong>四档评分与间隔预览</strong>：「重来 / 困难 / 良好 / 轻松」四键，每个按钮上直接显示选择它之后的下次间隔，不必试错；卡片 ID 由内容派生，<strong>重排笔记顺序不会让卡片丢失历史</strong>。</li>
                  <li>⚡ <strong>纯 CPU、毫秒级、零联网</strong>：不依赖 GPU、不调用端侧 AI、不产生任何网络请求，评分响应预算 &lt; 50ms 已固化为守护测试。</li>
                  <li>🏗️ <strong>架构减负</strong>：<code>App.tsx</code> 减少 <strong>40%</strong>（3589 → 2145 行），领域状态外移为 3 个 Zustand store，并抽出 7 个自定义 hook；<code>canvasService</code> 拆为 <strong>9 个模块 + 门面</strong>（5060 → 127 行）；<code>CanvasView</code> 减少 <strong>30%</strong>（9161 → 6416 行）。</li>
                  <li>🧪 <strong>测试规模翻倍</strong>：55 个测试套件、<strong>619 项</strong>单元与集成测试 100% 通过（v2.4.0 时为 43 套件 / 384 项）。</li>
                </ul>
              </div>

              {/* v2.4.0 */}
              <div className="about-changelog-group" style={{ marginTop: 10, opacity: 0.9 }}>
                <div className="about-changelog-group-label">
                  <Sparkles size={12} className="text-blue" />
                  <span>v2.4.0 交互式排布间距调校、多模态媒体插入与导出链路加固</span>
                </div>
                <ul className="about-changelog-items">
                  <li>🎛️ <strong>交互式排布间距调校</strong>：环形半径滑块与直接拖拽环上卡片实时调距、网格行列间距拖拽微调、多选组中心空白区整体平移；防重叠保护与「整段手势仅记一条撤销」。</li>
                  <li>🖼️ <strong>多模态媒体插入与全屏预览</strong>：右键一键插入图片 / 视频 / 音频并按点击位置精准落卡；双击媒体卡片全屏预览（视频播放与音频播放器，<code>✕</code> / <code>Esc</code> 关闭）。</li>
                  <li>🛡️ <strong>导出与剪贴板彻底修复</strong>：渲染进程栅格化失败时自动改用主进程离屏 <code>capturePage()</code> 出图（<strong>PNG 请求必定得到 PNG</strong>，绝不静默降级）；剪贴板改走系统原生 API；导出配色与屏幕主题 1:1 一致；媒体路径按画布目录解析，图片卡片不再破图。</li>
                  <li>🎨 <strong>12 色专业调色盘</strong>：调色盘由 6 色扩展至 12 色（键 1-6 保持 JSON Canvas 标准色以确保互通），批量卡片与批量连线新增自定义 HEX 取色器。</li>
                  <li>🔗 <strong>绕障寻路优化</strong>：多障碍链式包络合并绕行（一串相邻卡片一次绕开），连线图层下沉至卡片之下，线条永不遮挡卡片文字。</li>
                </ul>
              </div>

              {/* v2.3.0 */}
              <div className="about-changelog-group">
                <div className="about-changelog-group-label">
                  <Sparkles size={12} className="text-cyan" />
                  <span>v2.3.0 空间白板分镜演播深度升级（顺时针闭环、容器优先与上下文复现）</span>
                </div>
                <ul className="about-changelog-items">
                  <li>📽️ <strong>F5 分镜演播 2.3 深度拓扑演进 (Presentation Mode 2.3)</strong>：
                    <ul>
                      <li><strong>同一容器优先演播</strong>：卡片优先遵循所在容器归属按拓扑顺序演播，保障模块化与分组推演节奏。</li>
                      <li><strong>深入子例程推演与自然归栈</strong>：演播到引出外部卡片的发起点时，依因果拓扑深入演播其指向的目标卡片子树，演播完毕后平滑回归发起点所在容器继续演播后续卡片。</li>
                      <li><strong>先单卡后成环推演策略</strong>：当发起卡片同时引出「单独卡片」与「环形结构」时，优先完整演播独立分支，再演播成环卡片组，避免演示认知割裂。</li>
                      <li><strong>顺时针环形完整演播</strong>：基于几何重心极角排序与并查集回路识别，顺时针演播闭环内所有卡片，成环完毕后演播环外延伸分支，保证环形回路 100% 完整呈现。</li>
                      <li><strong>跨容器上下文感知复现</strong>：作为被指向节点播放过的卡片或在首组容器中作为普通卡片播放过的卡片，进入其专属容器后可再次演播，兼顾因果穿透与容器完整性。</li>
                    </ul>
                  </li>
                  <li>🧠 <strong>思维导图响应式工具栏 (Mindmap Responsive Toolbar)</strong>：顶栏按钮组自适应换行排版，在较小窗口或高系统缩放比例下不挤压、不溢出截断，视觉与交互极致优雅。</li>
                  <li>🧪 <strong>全面自动化测试守护</strong>：43 个测试套件、379 项单元与集成测试 100% 通过，为知识工作台保驾护航。</li>
                </ul>
              </div>

              {/* v2.2.0 */}
              <div className="about-changelog-group" style={{ marginTop: 10, opacity: 0.9 }}>
                <div className="about-changelog-group-label">
                  <Sparkles size={12} className="text-blue" />
                  <span>v2.2.0 思维导图双端无损同步、知识图谱美化与交互升级</span>
                </div>
                <ul className="about-changelog-items">
                  <li>🧠 <strong>思维导图双端非破坏性同步体系 (Non-destructive Bidirectional Sync)</strong>：彻底告别导图调整覆盖抹杀正文段落的历史！核心无损同步算法 <code>syncMindmapToDocument</code> 基于 AST 区块映射进行增量标题结构同步，100% 完整保留段落文字、代码块、复杂表格、数学公式与块锚点；顶栏增设「🔄 同步到文档」按键、脏状态感知与呼吸脉冲圆点、支持 <code>Ctrl+S</code> 快捷同步与反向自动联动；移除节点旁冗余悬浮加号，视觉更纯粹。</li>
                  <li>🌐 <strong>知识图谱单双击行为精准解耦</strong>：单击节点仅高亮 1-hop 邻域连线并在右下角展开详情卡片，绝不在左侧打开文件；双击节点（350ms 时间窗口）才在左侧平滑打开对应笔记；点击空白背景即刻清除高亮恢复全景。</li>
                  <li>🖼️ <strong>知识图谱详情卡片重塑</strong>：卡片扩宽至 280px 并升级为分层结构（Meta 徽标行 + 专属标题行 + 代码字体路径行 + 3 列指标微型网格 + 快捷打开按钮），配合超高斯毛玻璃与投影，彻底消除换行挤压。</li>
                  <li>✨ <strong>图谱悬停探灯连线与平滑补间过渡</strong>：注入 <code>0.18s ease-out</code> 补间动效；光标移经节点瞬间点亮相连的所有入度与出度连线（Hover Headlight），关系探索沉浸感跃升。</li>
                  <li>⚓ <strong>段落块及引用智能优雅渲染</strong>：隐藏原始 <code>#^blockId</code> 裸露文本，智能转化为精致徽章与交互式链接。</li>
                  <li>🚀 <strong>全局性能与低功耗优化</strong>：事件节流防抖，图谱按需局部渲染，降低设备性能与发热压力。</li>
                </ul>
              </div>

              {/* v2.1.0 */}
              <div className="about-changelog-group" style={{ marginTop: 10, opacity: 0.9 }}>
                <div className="about-changelog-group-label">
                  <Sparkles size={12} className="text-blue" />
                  <span>v2.1.0 多模态空间白板、AABB绕障寻路与F5分镜全屏演示</span>
                </div>
                <ul className="about-changelog-items">
                  <li>🖼️ <strong>多模态媒体卡片 (Multimodal Canvas 2.1)</strong>：支持剪贴板截图一键直接粘贴 (<code>Ctrl+V</code>)、图片/音视频外部拖拽投放 (Drag & Drop) 自动存入 <code>assets/</code> 目录并在视口落点生成媒体卡片，原生内置媒体播放控制与专属识别标头。</li>
                  <li>🛣️ <strong>智能正交折线 AABB 绕障避障寻路算法</strong>：折线自动检测端点间阻挡卡片包围盒（+14px 安全避让边距），动态规划 5 段正交平滑绕障路径，彻底杜绝穿透遮挡卡片文字，关系标签中心点自适应吸附。</li>
                  <li>📽️ <strong>F5 白板分镜全屏演示模式 (Presentation Mode)</strong>：基于 DAG 拓扑因果关系自动计算镜头演播序，电影级平滑聚焦运镜，演播卡片柔和呼吸发光高亮，背景优雅弱化遮罩，悬浮控制台支持全键盘流与自动播放。</li>
                  <li>🎨 <strong>连线调色板与视觉控制深化</strong>：统一环形回路连线色彩、单条连线右键调色盘与自定义十六进制 HEX 拾色器、离屏高保真 1:1 图片与工程文件高度一致性保障。</li>
                  <li>🧪 <strong>子功能全覆盖强化</strong>：媒体大图灯箱 (MediaLightbox) 缩放与下载、排版状态栏指标实时计算、双链与未链接提及一键升级、外部并发冲突仲裁与未保存确认对话框。</li>
                </ul>
              </div>

              {/* v2.0.0 */}
              <div className="about-changelog-group" style={{ marginTop: 10, opacity: 0.9 }}>
                <div className="about-changelog-group-label">
                  <Sparkles size={12} className="text-blue" />
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
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.4 }}>
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
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.4 }}>
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
                <span>{repoUrl}/releases (下载 v{__APP_VERSION__} 安装包与便携版)</span>
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
