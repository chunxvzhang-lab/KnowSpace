const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE_URL = "http://127.0.0.1:5199";
const OUTPUT_DIR = path.resolve("docs/manual-images");
const RELEASE_OUTPUT_DIR = path.resolve("release/KnowSpace-win-x64/docs/manual-images");

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
if (!fs.existsSync(RELEASE_OUTPUT_DIR)) {
  fs.mkdirSync(RELEASE_OUTPUT_DIR, { recursive: true });
}

// Rich multi-chapter documentation with AST mapping, block links, math, mermaid, and tags
const sampleDoc1 = `# KnowSpace 知识架构与核心引擎

> **KnowSpace · Personal Knowledge Workspace (v2.0.0)**  
> *Write. Read. Connect. Know. (记录 · 阅读 · 连接 · 认知)* — 由 **摸鱼Lab** 研发。

---

## 1. 核心系统架构 (Mermaid 拓扑图)

KnowSpace 采用本地优先（Local-first）与 AST 源码行号双向映射架构：

\`\`\`mermaid
flowchart TB
    subgraph CoreEngine [KnowSpace 核心引擎]
        AST[Markdown AST 编译管线]
        LineMap[源码行号槽位映射]
        SyncEngine[分段线性双向同步滚动]
    end

    subgraph Workspace [四维认知空间工作台]
        Reader[沉浸阅读器 Reader]
        Editor[极客源码编辑器 CodeMirror 6]
        Canvas[JSON Canvas 1.0 无限白板]
        MindMap[多格式双向思维导图]
    end

    subgraph Storage [数据持久与安全]
        AtomicSave[原子事务落盘保存]
        BOMGuard[UTF-8 BOM 与 CRLF 保真]
        Snapshots[Myers LCS 版本时间旅行快照]
    end

    AST --> LineMap
    LineMap --> SyncEngine
    SyncEngine --> Editor
    SyncEngine --> Reader
    Editor --> Canvas
    Editor --> MindMap
    Editor --> AtomicSave
    AtomicSave --> BOMGuard
    AtomicSave --> Snapshots
\`\`\`

---

## 2. 科学计算与数学公式 (KaTeX)

支持高性能 LaTeX 数学公式即时渲染，包含行内公式与独立居中公式块：

- **傅里叶变换定义**：
$$ \\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(x) e^{-2\\pi i x \\xi} dx $$

- **质能方程与欧拉恒等式**：$E = mc^2$ 以及 $e^{i\\pi} + 1 = 0$。

---

## 3. 高亮代码块与一键复制 (Code & Badges)

内置等宽字体、语法着色胶囊标签与一键无损复制功能：

\`\`\`typescript
import { useState, useCallback } from "react";

export function useAtomicSave(docPath: string) {
  const [isSaving, setIsSaving] = useState(false);

  const saveFile = useCallback(async (content: string) => {
    setIsSaving(true);
    try {
      await window.knowSpaceDesktop?.saveMarkdownFile({
        filePath: docPath,
        markdown: content,
        atomic: true,
      });
      console.log("文档原子落盘保存成功！");
    } finally {
      setIsSaving(false);
    }
  }, [docPath]);

  return { saveFile, isSaving };
}
\`\`\`

---

## 4. 任务清单与项目状态 (GFM Tasks)

- [x] 基于 React 19 + TypeScript + Electron 42 现代化桌面架构
- [x] CodeMirror 6 极客编辑器与 AST 行号槽位精准对齐
- [x] 多标签页协同浏览、鼠标中键关闭与未保存黄点呼吸灯
- [x] 双文档左右分屏对比查看模式（Dual Document Split View）
- [x] 图片与 Mermaid 架构图无损灯箱缩放平移与 3× Retina PNG 导出
- [x] 闪念胶囊（Flash Notes）全局浮窗与秒级原子归档
- [x] 知识网络全景图谱 (60FPS 动态力导向拓扑与 1-Hop/2-Hop 聚类)
- [x] 思维导图多格式生态导出 (PNG / OPML / FreeMind / Markdown)
- [x] 全局命令中枢 (Ctrl+K) 与编辑区斜杠指令 (/)
- [x] **v2.0.0 旗舰特性**：JSON Canvas 1.0 无限空间可视化白板
- [x] **v2.0.0 旗舰特性**：本地版本历史与 Myers LCS 逐字符双栏 Diff 对比
- [x] **v2.0.0 旗舰特性**：毫秒级全库混合倒排检索引擎 (tag:#, link:[[, "短语")

---

## 5. 核心特性矩阵 (GFM Table)

| 核心维度 | 传统 Markdown 编辑器 | KnowSpace 个人知识工作台 (v2.0.0) |
| :--- | :--- | :--- |
| **首屏渲染速度** | 常见 800ms ~ 1.5s 缓慢白屏 | **毫秒级秒开 (332 kB 首屏精简分包)** |
| **同步滚动精度** | 简易百分比滚动，高度漂移严重 | **AST 块级行号分段线性插值零漂移** |
| **空间白板** | 不支持或需复杂专有插件 | **原生兼容 JSON Canvas 1.0，4锚点磁吸与逆向萃取长文** |
| **版本安全** | 仅依赖撤销栈，关机即丢失 | **本地隐藏空间静默版本历史，Myers LCS 逐字符对比** |
| **导图多格式导出**| 仅支持基础截图或不可导出 | **支持 2x PNG / OPML 2.0 / FreeMind / Markdown** |
| **命令与排版中枢**| 菜单层级繁复，操作断层 | **Ctrl+K 全局命令中枢 + / 斜杠极速指令** |
| **图谱关联深度** | 单一平铺网络，极易视觉过载 | **1-Hop / 2-Hop 探索深度 + 文件夹色彩聚类光环** |
| **数据安全** | 常见直接写覆磁盘易截断损坏 | **原子事务写入 + \`fsync\` + 重命名替换** |

---

## 6. 底层同步细节与块级指纹

这是核心的段落块，带有原子块指纹标识：
KnowSpace 采用轻量 AST 解析引擎，在毫秒级内构建行号双向投影索引。 ^ast-sync

相关参考文档请参阅 [[02-AST双向零延迟同步]] 以及 [[04-对比分屏与导图生态]]。
`;

const sampleDoc1Older = `# KnowSpace 知识架构与核心引擎

> **KnowSpace · Personal Knowledge Workspace**  
> *Write. Read. Connect. Know. (记录 · 阅读 · 连接 · 认知)* — 由 **摸鱼Lab** 研发。

---

## 1. 核心系统架构 (Mermaid 拓扑图)

旧版系统缺少无限空间白板与版本历史模块。

\`\`\`mermaid
flowchart TB
    AST[Markdown AST 编译管线] --> Editor[编辑器]
    Editor --> Save[普通保存]
\`\`\`

---

## 2. 高亮代码块

旧版代码实现如下：

\`\`\`typescript
export function saveFile(content: string) {
  // 旧版非原子落盘逻辑
  fs.writeFileSync("file.md", content);
}
\`\`\`
`;

const sampleDoc2 = `# 02-AST双向零延迟同步与块级链接

> 本章节深入解析 KnowSpace 的底层核心协同算法与原子块级引用卡片。

---

## 1. 为什么需要 AST 块级行号映射？

传统 Markdown 编辑器大多依赖纯 DOM 像素高度与滚动百分比进行同步。在包含数学公式、大型表格或 Mermaid 图表时，左右高度极不一致，导致严重的滚动漂移。

KnowSpace 在 Markdown-it 编译阶段为每个 AST 块节点注入 \`data-source-line\` 属性：

\`\`\`json
{
  "block": "fence",
  "tag": "pre",
  "sourceLine": 42,
  "sourceLineEnd": 68,
  "type": "code_block"
}
\`\`\`

---

## 2. 块级原子引用嵌入卡片演示

下面通过 \`![[...#^block-id]]\` 语法精准嵌入第一章节中的同步核心段落：

![[01-架构设计与核心技术#^ast-sync]]

---

## 3. 双向关联与反向引用

- 主系统架构：[[01-架构设计与核心技术]]
- 数据安全机制：[[05-工业级数据安全基石]]
`;

const sampleDoc3 = `# 03-闪念胶囊与本地原子事务落盘

> 任何灵感，随时捕捉；所有文字，万无一失。

---

## 1. 闪念胶囊 (Flash Notes) 交互设计

- \`Alt+Space\` 全局随时召唤磨砂玻璃悬浮卡片。
- 支持 \`- [ ]\` 待办、\`#\` 标签、\`[[\` 双链与当前时间快捷插入。
- 按下 \`Ctrl+Enter\` 秒级原子落盘保存至 \`Inbox/YYYY-MM-DD.md\`。

---

## 2. 标签与双链关联

关联知识节点：[[01-架构设计与核心技术]] 以及 [[04-对比分屏与导图生态]]。
标签记录：#architecture #react19 #knowledge-base
`;

const sampleDoc4 = `# 04-对比分屏与导图生态

> 深入解读双文档左右对比模式与思维导图交互体系。

---

## 1. 原生双文档分屏对比 (Dual Document Split)

- 标签页右键一键开启分屏对比。
- 左右文档独立滚动、独立选择阅读模式。
- 点击顶部退出按钮一秒还原单视口工作台。

---

## 2. 导图多格式生态导出 (OPML / FreeMind)

- 支持 \`Ctrl+M\` 一键将 Markdown 转换为交互式脑图。
- 节点支持 Tab 新建子主题、Enter 同级分支、F2 就地命名。
- 一键导出为超清透明背景 PNG、OPML 2.0、FreeMind (.mm) 或 Markdown 大纲。
- 关联节点：[[01-架构设计与核心技术]]。
`;

const sampleDoc5 = `# 05-工业级数据安全基石

> 数据无价，安全第一。

---

## 1. 物理事务原子落盘与 fsync 刷盘

- 先写同目录隐藏临时文件。
- OS 级 fsync 物理刷盘。
- 原子重命名覆盖原文件，杜绝 0 字节损坏。
- 关联节点：[[01-架构设计与核心技术]]。
`;

const sampleCanvasData = {
  nodes: [
    {
      id: "group-1",
      type: "group",
      label: "🌌 KnowSpace v2.0.0 四维认知空间架构",
      x: 40,
      y: 40,
      width: 920,
      height: 520,
      color: "5"
    },
    {
      id: "card-1",
      type: "text",
      text: "### ✍️ 1. 深度写作与编辑\n- CodeMirror 6 极客心流\n- AST 零延迟双向同步滚动\n- 斜杠命令 `/` 与 Obsidian 级右键\n- 印刷级 A4 跨页防截断 PDF 导出",
      x: 80,
      y: 100,
      width: 260,
      height: 180,
      color: "1"
    },
    {
      id: "card-2",
      type: "text",
      text: "### 🧠 2. 树状思维导图\n- Markdown 大纲秒级转脑图 (`Ctrl+M`)\n- 分支自由拖拽重排与自闭环防环\n- 14 色调和配色与 4 种节点形状\n- OPML 2.0 / FreeMind / 2x PNG 导出",
      x: 380,
      y: 100,
      width: 270,
      height: 180,
      color: "2"
    },
    {
      id: "card-3",
      type: "text",
      text: "### 🎨 3. 无限空间白板\n- 兼容标准 JSON Canvas 1.0 规范\n- 4 锚点磁吸与贝塞尔动态连线\n- 缩略雷达小地图与全景聚焦\n- **【独创】画布逆向拓扑萃取长文**",
      x: 680,
      y: 100,
      width: 250,
      height: 180,
      color: "4"
    },
    {
      id: "card-4",
      type: "text",
      text: "### 🌐 4. 网状星系图谱\n- 60FPS 极速原生 Canvas 渲染\n- 1-Hop 邻近与 2-Hop 扩展局部减负\n- 顶级目录色彩语义聚类光环\n- MOC 核心枢纽与未链接孤岛挖掘",
      x: 220,
      y: 330,
      width: 270,
      height: 180,
      color: "5"
    },
    {
      id: "card-5",
      type: "text",
      text: "### ⏳ 5. 版本时间旅行\n- 30s 去抖静默本地快照捕获\n- Myers LCS 逐行与行内字符 Diff\n- 一键无损安全还原与手动快照\n- 物理事务原子落盘与冲突防丢稿",
      x: 540,
      y: 330,
      width: 270,
      height: 180,
      color: "3"
    }
  ],
  edges: [
    {
      id: "edge-1",
      fromNode: "card-1",
      fromSide: "right",
      fromEnd: "none",
      toNode: "card-2",
      toSide: "left",
      toEnd: "arrow",
      label: "升维结构化",
      color: "1",
      style: "bezier"
    },
    {
      id: "edge-2",
      fromNode: "card-2",
      fromSide: "right",
      fromEnd: "none",
      toNode: "card-3",
      toSide: "left",
      toEnd: "arrow",
      label: "空间化发散",
      color: "2",
      style: "bezier"
    },
    {
      id: "edge-3",
      fromNode: "card-1",
      fromSide: "bottom",
      fromEnd: "none",
      toNode: "card-4",
      toSide: "top",
      toEnd: "arrow",
      label: "双链互联",
      color: "5",
      style: "bezier"
    },
    {
      id: "edge-4",
      fromNode: "card-3",
      fromSide: "bottom",
      fromEnd: "none",
      toNode: "card-5",
      toSide: "top",
      toEnd: "arrow",
      label: "版本沉淀",
      color: "4",
      style: "bezier"
    }
  ]
};

const sampleCanvasContent = JSON.stringify(sampleCanvasData, null, 2);

async function saveBoth(page, name) {
  const p1 = path.join(OUTPUT_DIR, name);
  const p2 = path.join(RELEASE_OUTPUT_DIR, name);
  await page.screenshot({ path: p1 });
  fs.copyFileSync(p1, p2);
  console.log(`[OK] Saved screenshot: ${name}`);
}

(async () => {
  console.log("Launching Edge browser via Playwright for KnowSpace v2.0.0...");
  const browser = await chromium.launch({ channel: "msedge" });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
  });

  const chapters = [
    {
      id: "doc-1",
      title: "01-架构设计与核心技术",
      src: "01-架构设计与核心技术.md",
      absolutePath: "C:\\\\Docs\\\\01-架构设计与核心技术.md",
    },
    {
      id: "doc-2",
      title: "02-AST双向零延迟同步",
      src: "02-AST双向零延迟同步.md",
      absolutePath: "C:\\\\Docs\\\\02-AST双向零延迟同步.md",
    },
    {
      id: "doc-3",
      title: "03-闪念胶囊与原子落盘",
      src: "03-闪念胶囊与原子落盘.md",
      absolutePath: "C:\\\\Docs\\\\03-闪念胶囊与原子落盘.md",
    },
    {
      id: "doc-4",
      title: "04-对比分屏与导图生态",
      src: "04-对比分屏与导图生态.md",
      absolutePath: "C:\\\\Docs\\\\04-对比分屏与导图生态.md",
    },
    {
      id: "doc-5",
      title: "05-工业级数据安全基石",
      src: "05-工业级数据安全基石.md",
      absolutePath: "C:\\\\Docs\\\\05-工业级数据安全基石.md",
    },
    {
      id: "doc-6",
      title: "06-空间知识全景白板",
      src: "06-空间知识全景白板.canvas",
      absolutePath: "C:\\\\Docs\\\\06-空间知识全景白板.canvas",
    },
  ];

  const contentMap = {
    "C:\\\\Docs\\\\01-架构设计与核心技术.md": sampleDoc1,
    "C:\\\\Docs\\\\02-AST双向零延迟同步.md": sampleDoc2,
    "C:\\\\Docs\\\\03-闪念胶囊与原子落盘.md": sampleDoc3,
    "C:\\\\Docs\\\\04-对比分屏与导图生态.md": sampleDoc4,
    "C:\\\\Docs\\\\05-工业级数据安全基石.md": sampleDoc5,
    "C:\\\\Docs\\\\06-空间知识全景白板.canvas": sampleCanvasContent,
    "doc-1": sampleDoc1,
    "doc-2": sampleDoc2,
    "doc-3": sampleDoc3,
    "doc-4": sampleDoc4,
    "doc-5": sampleDoc5,
    "doc-6": sampleCanvasContent,
  };

  // Mock Desktop Environment
  await context.addInitScript(({ s1, sOld, cmap, chs }) => {
    const mockDesktop = {
      getInitialSyncData: () => ({
        filePath: "C:\\\\Docs\\\\01-架构设计与核心技术.md",
        source: {
          markdown: s1,
          baseUrl: "file:///C:/Docs/",
          diskVersion: "v2.0.0",
          writable: true,
          hasBom: false,
          lineEnding: "LF",
        },
      }),
      getLaunchFilePath: async () => "C:\\\\Docs\\\\01-架构设计与核心技术.md",
      getDirectoryForFile: async () => ({
        directory: {
          id: "knowspace-core-library",
          title: "KnowSpace 核心工作区",
          rootPath: "C:\\\\Docs",
          chapters: chs,
        },
      }),
      readMarkdownFile: async (filePath) => ({
        markdown: cmap[filePath] || s1,
        baseUrl: "file:///C:/Docs/",
        diskVersion: "v2.0.0",
        writable: true,
        hasBom: false,
        lineEnding: "LF",
      }),
      saveMarkdownFile: async () => {
        if (window.__triggerConflictNextSave) {
          window.__triggerConflictNextSave = false;
          return {
            success: false,
            errorCode: "FILE_CONFLICT",
            diskVersion: "v2",
            message: "磁盘上的文件已由外部进程修改，检测到冲突版本。",
          };
        }
        return { success: true, diskVersion: "v2.0.0" };
      },
      saveMarkdownFileAs: async () => ({ success: true, absolutePath: "C:\\\\Docs\\\\01-架构设计-副本.md" }),
      setNativeTheme: async () => {},
      onOpenFilePath: () => () => {},
      onMenuCommand: () => () => {},
      onBeforeClose: () => () => {},
      onFlashNoteSaved: () => () => {},
      exportSvgAsPng: async () => ({ success: true }),
      savePngData: async () => ({ success: true, filePath: "C:\\\\Exports\\\\mindmap.png" }),
      
      // Local Version History & Snapshots API Mock
      listSnapshots: async ({ filePath, rootPath }) => [
        {
          id: "snap-20260909-210000",
          timestamp: "2026-09-09T21:00:00.000Z",
          filePath: filePath || "C:\\\\Docs\\\\01-架构设计与核心技术.md",
          hash: "a3f89b1c7d2e4f5a",
          charCount: 2350,
          lineCount: 110,
          diffAdded: 28,
          diffRemoved: 6,
          charDelta: 850,
          reason: "30s 自动快照：引入 v2.0.0 无限白板与版本旅行矩阵",
        },
        {
          id: "snap-20260908-163000",
          timestamp: "2026-09-08T16:30:00.000Z",
          filePath: filePath || "C:\\\\Docs\\\\01-架构设计与核心技术.md",
          hash: "8b2c4d6e9f1a3c5e",
          charCount: 1500,
          lineCount: 82,
          diffAdded: 45,
          diffRemoved: 0,
          charDelta: 1500,
          reason: "手动里程碑：v2.0.0 核心引擎与架构拓扑定稿",
        },
        {
          id: "snap-20260907-100000",
          timestamp: "2026-09-07T10:00:00.000Z",
          filePath: filePath || "C:\\\\Docs\\\\01-架构设计与核心技术.md",
          hash: "1c2d3e4f5a6b7c8d",
          charCount: 820,
          lineCount: 45,
          diffAdded: 45,
          diffRemoved: 0,
          charDelta: 820,
          reason: "初始版本：创建基础架构说明草稿",
        },
      ],
      readSnapshot: async ({ filePath, snapshotId }) => ({
        id: snapshotId,
        timestamp: "2026-09-08T16:30:00.000Z",
        filePath: filePath || "C:\\\\Docs\\\\01-架构设计与核心技术.md",
        content: sOld,
        hash: "8b2c4d6e9f1a3c5e",
        charCount: 1500,
        reason: "手动里程碑：v2.0.0 核心引擎与架构拓扑定稿",
      }),
      revertToSnapshot: async () => ({ success: true }),
      createManualSnapshot: async ({ reason }) => ({
        success: true,
        snapshot: {
          id: `snap-${Date.now()}`,
          timestamp: new Date().toISOString(),
          filePath: "C:\\\\Docs\\\\01-架构设计与核心技术.md",
          hash: "manual123",
          charCount: 2350,
          lineCount: 110,
          diffAdded: 0,
          diffRemoved: 0,
          charDelta: 0,
          reason: reason || "手动里程碑快照",
        }
      })
    };

    window.knowSpaceDesktop = mockDesktop;
    window.bookMDDesktop = mockDesktop;
  }, { s1: sampleDoc1, sOld: sampleDoc1Older, cmap: contentMap, chs: chapters });

  const page = await context.newPage();
  console.log(`Navigating to ${BASE_URL}...`);
  await page.goto(BASE_URL);
  await page.waitForTimeout(2000);

  // Set default dark theme
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "twitter");
  });
  await page.waitForTimeout(600);

  // 01: Overview Workbench
  console.log("Capturing 01-overview-workbench.png...");
  await saveBoth(page, "01-overview-workbench.png");

  // 02: Light Theme
  console.log("Capturing 02-theme-light.png...");
  const lightBtn = page.locator('button[aria-label="日光浅色"]');
  if (await lightBtn.count() > 0) {
    await lightBtn.click();
  } else {
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  }
  await page.waitForTimeout(600);
  await saveBoth(page, "02-theme-light.png");

  // 03: E-ink Paper Theme
  console.log("Capturing 03-theme-eink.png...");
  const einkBtn = page.locator('button[aria-label="仿电子墨水屏"]');
  if (await einkBtn.count() > 0) {
    await einkBtn.click();
  } else {
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "eink"));
  }
  await page.waitForTimeout(600);
  await saveBoth(page, "03-theme-eink.png");

  // 04: Geek Dark Theme
  console.log("Capturing 04-theme-dark.png...");
  const darkBtn = page.locator('button[aria-label="极客暗黑"]');
  if (await darkBtn.count() > 0) {
    await darkBtn.click();
  } else {
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "twitter"));
  }
  await page.waitForTimeout(600);
  await saveBoth(page, "04-theme-dark.png");

  // 05: Split View Mode
  console.log("Capturing 05-mode-split.png...");
  const splitBtn = page.locator('.view-mode-control button:has-text("分屏")');
  if (await splitBtn.count() > 0) await splitBtn.click();
  await page.waitForTimeout(600);
  await saveBoth(page, "05-mode-split.png");

  // 06: Source View Mode
  console.log("Capturing 06-mode-source.png...");
  const sourceBtn = page.locator('.view-mode-control button:has-text("源码")');
  if (await sourceBtn.count() > 0) await sourceBtn.click();
  await page.waitForTimeout(600);
  await saveBoth(page, "06-mode-source.png");

  // 07: Read View Mode
  console.log("Capturing 07-mode-read.png...");
  const readBtn = page.locator('.view-mode-control button:has-text("阅读")');
  if (await readBtn.count() > 0) await readBtn.click();
  await page.waitForTimeout(600);
  await saveBoth(page, "07-mode-read.png");

  // 08: Rich Markdown (KaTeX, Mermaid, Code Blocks)
  console.log("Capturing 08-rich-markdown.png...");
  await page.evaluate(() => {
    const reader = document.querySelector(".reader-scroll-container") || document.querySelector(".reader-pane");
    if (reader) reader.scrollTop = 160;
  });
  await page.waitForTimeout(800);
  await saveBoth(page, "08-rich-markdown.png");

  // Reset scroll and switch back to split mode
  await page.evaluate(() => {
    const reader = document.querySelector(".reader-scroll-container") || document.querySelector(".reader-pane");
    if (reader) reader.scrollTop = 0;
  });
  if (await splitBtn.count() > 0) await splitBtn.click();
  await page.waitForTimeout(600);

  // Open multiple tabs
  console.log("Populating multiple tabs...");
  const fileRows = page.locator(".tree-row.file-row, .tree-item-content");
  if (await fileRows.count() >= 3) {
    await fileRows.nth(1).click();
    await page.waitForTimeout(700);
    await fileRows.nth(2).click();
    await page.waitForTimeout(700);
    await fileRows.nth(0).click();
    await page.waitForTimeout(700);
  }

  // 09: Multi-tabs & Tab Context Menu
  console.log("Capturing 09-multi-tabs.png...");
  const tabs = page.locator(".tab-item");
  if (await tabs.count() >= 2) {
    await tabs.nth(1).click({ button: "right" });
    await page.waitForTimeout(500);
    await saveBoth(page, "09-multi-tabs.png");

    // 10: Dual Split Compare View
    console.log("Capturing 10-dual-split-compare.png...");
    const splitOption = page.locator('.tab-context-menu button:has-text("分屏对比")');
    if (await splitOption.count() > 0) {
      await splitOption.click();
      await page.waitForTimeout(1000);
      await saveBoth(page, "10-dual-split-compare.png");

      const exitSplitBtn = page.locator(".tab-exit-split-btn");
      if (await exitSplitBtn.count() > 0) {
        await exitSplitBtn.click();
        await page.waitForTimeout(600);
      }
    } else {
      await page.keyboard.press("Escape");
    }
  }

  // 11: Navigation Outline (TOC)
  console.log("Capturing 11-navigation-toc.png...");
  const tocNavBtn = page.locator('button[aria-label="大纲目录"]');
  if (await tocNavBtn.count() > 0) {
    await tocNavBtn.click();
    await page.waitForTimeout(600);
    await saveBoth(page, "11-navigation-toc.png");
  }

  // 12: Fulltext Search Panel
  console.log("Capturing 12-fulltext-search.png...");
  const searchNavBtn = page.locator('button[aria-label="全文搜索"]');
  if (await searchNavBtn.count() > 0) {
    await searchNavBtn.click();
    await page.waitForTimeout(500);
    const searchInput = page.locator(".search-box input");
    if (await searchInput.count() > 0) {
      await searchInput.fill("AST");
      await page.waitForTimeout(800);
      const firstCard = page.locator(".search-card").first();
      if (await firstCard.count() > 0) {
        await firstCard.click();
        await page.waitForTimeout(600);
      }
      await saveBoth(page, "12-fulltext-search.png");
    }
  }

  // 13: Bookmarks Panel
  console.log("Capturing 13-bookmarks.png...");
  const addBookmarkBtn = page.locator('button[title*="添加书签"]');
  if (await addBookmarkBtn.count() > 0) {
    await addBookmarkBtn.click();
    await page.waitForTimeout(400);
  }
  const bookmarksNavBtn = page.locator('button[aria-label="书签列表"]');
  if (await bookmarksNavBtn.count() > 0) {
    await bookmarksNavBtn.click();
    await page.waitForTimeout(600);
    await saveBoth(page, "13-bookmarks.png");
  }

  // 14: Media Lightbox
  console.log("Capturing 14-media-lightbox.png...");
  const mermaidDiagram = page.locator("pre.mermaid, .mermaid-container svg, img.md-image-block").first();
  if (await mermaidDiagram.count() > 0) {
    await mermaidDiagram.click();
    await page.waitForTimeout(800);
    await saveBoth(page, "14-media-lightbox.png");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }

  // 15: Flash Capsule
  console.log("Capturing 15-flash-capsule.png...");
  const flashPage = await context.newPage();
  await flashPage.setViewportSize({ width: 740, height: 500 });
  await flashPage.goto(`${BASE_URL}/?mode=flash`);
  await flashPage.waitForTimeout(1000);
  const flashTextarea = flashPage.locator(".flash-textarea");
  if (await flashTextarea.count() > 0) {
    await flashTextarea.fill("- [x] 梳理 KnowSpace v2.0.0 空间知识工作台\n> 💡 摸鱼Lab 架构评审：支持 JSON Canvas 1.0 与本地时间旅行\n[[01-架构设计与核心技术]] #v2.0.0 #canvas");
  }
  await flashPage.waitForTimeout(500);
  await saveBoth(flashPage, "15-flash-capsule.png");

  // 15-settings: Flash Capsule Settings
  console.log("Capturing 15-flash-capsule-settings.png...");
  const flashSettingsBtn = flashPage.locator('button[title*="设置全局热键"], button[title*="设置"]');
  if (await flashSettingsBtn.count() > 0) {
    await flashSettingsBtn.click();
    await flashPage.waitForTimeout(500);
    await saveBoth(flashPage, "15-flash-capsule-settings.png");
  }
  await flashPage.close();

  // 16: About Dialog (v2.0.0!)
  console.log("Capturing 16-about-dialog.png...");
  const aboutBtn = page.locator('button[aria-label="关于应用"]');
  if (await aboutBtn.count() > 0) {
    await aboutBtn.click();
    await page.waitForTimeout(600);
    await saveBoth(page, "16-about-dialog.png");
    const closeAbout = page.locator(".modal-close, button[aria-label='关闭'], .dialog-close-btn");
    if (await closeAbout.count() > 0) await closeAbout.click();
    else await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }

  // 17: Dialog Unsaved Changes Guard
  console.log("Capturing 17-dialog-unsaved.png...");
  const cmContent = page.locator(".cm-content");
  if (await cmContent.count() > 0) {
    await cmContent.click();
    await page.keyboard.type("\n\n<!-- unsaved demo edit -->");
    await page.waitForTimeout(500);
    if (await fileRows.count() >= 2) {
      await fileRows.nth(1).click();
      await page.waitForTimeout(600);
      await saveBoth(page, "17-dialog-unsaved.png");
      const discardBtn = page.locator('button:has-text("放弃更改")');
      if (await discardBtn.count() > 0) await discardBtn.click();
      else await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }
  }

  // 18: Dialog Conflict
  console.log("Capturing 18-dialog-conflict.png...");
  await page.evaluate(() => {
    window.__triggerConflictNextSave = true;
  });
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(800);
  await saveBoth(page, "18-dialog-conflict.png");
  const conflictReload = page.locator('button:has-text("重新载入磁盘内容")').first();
  if (await conflictReload.count() > 0) await conflictReload.click();
  else {
    const cancelBtn = page.locator('.modal-conflict button:has-text("取消"), button:has-text("取消")').first();
    if (await cancelBtn.count() > 0) await cancelBtn.click();
    else await page.keyboard.press("Escape");
  }
  await page.waitForTimeout(500);

  // 19: Zen Focus Mode
  console.log("Capturing 19-mode-zen.png...");
  const toggleDirBtn = page.locator('button[title*="折叠目录"], button[aria-label*="目录"]').first();
  if (await toggleDirBtn.count() > 0) await toggleDirBtn.click();
  if (await readBtn.count() > 0) await readBtn.click();
  await page.waitForTimeout(600);
  await saveBoth(page, "19-mode-zen.png");
  // Restore
  if (await toggleDirBtn.count() > 0) await toggleDirBtn.click();
  if (await splitBtn.count() > 0) await splitBtn.click();
  await page.waitForTimeout(500);

  // 20: Code Block Copied Effect
  console.log("Capturing 20-code-copied.png...");
  const copyBtn = page.locator(".code-copy-btn").first();
  if (await copyBtn.count() > 0) {
    await copyBtn.scrollIntoViewIfNeeded();
    await copyBtn.click();
    await page.waitForTimeout(150);
    await saveBoth(page, "20-code-copied.png");
  }

  // 21 & 31: Knowledge Graph View & Depth / Clustering
  console.log("Capturing 21-global-graph.png and 31-graph-depth-clustering.png...");
  const graphActivityBtn = page.locator('button[aria-label="知识网络全景图谱"], button[data-tooltip*="知识网络"]');
  if (await graphActivityBtn.count() > 0) {
    await graphActivityBtn.click();
    await page.waitForTimeout(1200);
    await saveBoth(page, "21-global-graph.png");

    const depthBtn = page.locator('button:has-text("1-Hop"), button:has-text("2-Hop")').first();
    if (await depthBtn.count() > 0) {
      await depthBtn.click();
      await page.waitForTimeout(600);
    }
    await saveBoth(page, "31-graph-depth-clustering.png");

    await graphActivityBtn.click();
    await page.waitForTimeout(600);
  }

  // 22: Backlinks Panel
  console.log("Capturing 22-backlinks-panel.png...");
  const backlinksNavBtn = page.locator('button[aria-label="反向链接与引用"], button[data-tooltip*="反向链接"]');
  if (await backlinksNavBtn.count() > 0) {
    await backlinksNavBtn.click();
    await page.waitForTimeout(700);
    await saveBoth(page, "22-backlinks-panel.png");
  }

  // 23: Timeline Panel
  console.log("Capturing 23-timeline-panel.png...");
  const timelineNavBtn = page.locator('button[aria-label="闪念 Space 时间线看板"], button[data-tooltip*="时间线"]');
  if (await timelineNavBtn.count() > 0) {
    await timelineNavBtn.click();
    await page.waitForTimeout(700);
    await saveBoth(page, "23-timeline-panel.png");
  }

  // 24: Mindmap View (Ctrl+M)
  console.log("Capturing 24-mindmap-view.png...");
  const mindmapModeBtn = page.locator('.view-mode-control button:has-text("脑图")');
  if (await mindmapModeBtn.count() > 0) {
    await mindmapModeBtn.click();
    await page.waitForTimeout(1000);
    await saveBoth(page, "24-mindmap-view.png");

    // 25: Mindmap Customization (Node Context Menu)
    console.log("Capturing 25-mindmap-customization.png...");
    const mindmapNodes = page.locator(".mindmap-node-interactive");
    if (await mindmapNodes.count() >= 2) {
      await mindmapNodes.nth(1).click({ button: "right" });
      await page.waitForTimeout(500);
      await saveBoth(page, "25-mindmap-customization.png");
    }

    // 30: Mindmap Export Modal / Dropdown
    console.log("Capturing 30-mindmap-export-modal.png...");
    const exportBtn = page.locator("button.export-btn, button:has-text('导出导图')");
    if (await exportBtn.count() > 0) {
      await exportBtn.click();
      await page.waitForTimeout(500);
      await saveBoth(page, "30-mindmap-export-modal.png");
      await page.keyboard.press("Escape");
    }

    if (await splitBtn.count() > 0) await splitBtn.click();
    await page.waitForTimeout(600);
  }

  // 26: Block Reference Embed Card
  console.log("Capturing 26-block-reference.png...");
  const tabsList = page.locator(".tab-item");
  if (await tabsList.count() >= 2) {
    await tabsList.nth(1).click();
    await page.waitForTimeout(800);
    const embedCard = page.locator(".wikilink-embed-card");
    if (await embedCard.count() > 0) {
      await embedCard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
    }
    await saveBoth(page, "26-block-reference.png");
    await tabsList.nth(0).click();
    await page.waitForTimeout(600);
  }

  // 27: Command Palette (Ctrl+K)
  console.log("Capturing 27-command-palette.png...");
  const cmdPaletteBtn = page.locator('button[aria-label="全局命令中枢"], button[data-tooltip*="全局命令中枢"]');
  if (await cmdPaletteBtn.count() > 0) {
    await cmdPaletteBtn.click();
  } else {
    await page.keyboard.press("Control+k");
  }
  await page.waitForTimeout(600);
  const cmdInput = page.locator(".command-palette-input, input[placeholder*='搜索命令']");
  if (await cmdInput.count() > 0) {
    await cmdInput.fill("白板");
    await page.waitForTimeout(500);
  }
  await saveBoth(page, "27-command-palette.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // 28: Slash Commands (/)
  console.log("Capturing 28-slash-commands.png...");
  const editorContent = page.locator(".cm-content");
  if (await editorContent.count() > 0) {
    await editorContent.click();
    await page.keyboard.press("End");
    await page.keyboard.type("\n/");
    await page.waitForTimeout(600);
    await saveBoth(page, "28-slash-commands.png");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // 29: Editor Context Menu
  console.log("Capturing 29-editor-context-menu.png...");
  if (await editorContent.count() > 0) {
    await editorContent.click({ button: "right", position: { x: 200, y: 150 } });
    await page.waitForTimeout(500);
    await saveBoth(page, "29-editor-context-menu.png");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // ==========================================
  // NEW v2.0.0 FLAGSHIP FEATURE SCREENSHOTS
  // ==========================================

  // 32: Infinite Canvas View (Ctrl+Shift+C)
  console.log("Capturing 32-infinite-canvas.png...");
  const canvasModeBtn = page.locator('.view-mode-control button:has-text("白板")');
  if (await canvasModeBtn.count() > 0) {
    await canvasModeBtn.click();
    await page.waitForTimeout(1200);

    // If needed, zoom or center
    const fitBtn = page.locator('button[title*="适应视口"], button[title*="适应画布"], button[title*="适应"]');
    if (await fitBtn.count() > 0) {
      await fitBtn.click();
      await page.waitForTimeout(500);
    }
    await saveBoth(page, "32-infinite-canvas.png");

    // 33: Canvas Node Context Menu / Customization
    console.log("Capturing 33-canvas-card-creation.png...");
    const canvasCards = page.locator(".canvas-node, .canvas-card-node, [data-node-id]");
    if (await canvasCards.count() > 0) {
      await canvasCards.first().click({ button: "right" });
      await page.waitForTimeout(500);
      await saveBoth(page, "33-canvas-card-creation.png");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }

    // Switch back to split mode
    if (await splitBtn.count() > 0) await splitBtn.click();
    await page.waitForTimeout(600);
  }

  // 34: Version History & Myers LCS Diff Dialog (Ctrl+Shift+H)
  console.log("Capturing 34-version-history.png...");
  const historyBtn = page.locator('button[aria-label*="版本快照"], button[title*="版本快照"], button[title*="Ctrl+Shift+H"]');
  if (await historyBtn.count() > 0) {
    await historyBtn.click();
  } else {
    await page.keyboard.press("Control+Shift+H");
  }
  await page.waitForTimeout(1000);

  // Click second snapshot to trigger rich diff
  const snapshotItems = page.locator(".snapshot-item, [data-snapshot-id], .version-item");
  if (await snapshotItems.count() >= 2) {
    await snapshotItems.nth(0).click();
    await page.waitForTimeout(700);
  }
  await saveBoth(page, "34-version-history.png");
  await page.evaluate(() => {
    const overlay = document.querySelector(".version-history-overlay");
    if (overlay) overlay.click();
    const closeBtn = document.querySelector(".version-history-container header button:last-child");
    if (closeBtn) closeBtn.click();
  });
  await page.waitForTimeout(600);

  // 35: Hybrid Vault Search with Structured Syntax
  console.log("Capturing 35-hybrid-vault-search.png...");
  if (await searchNavBtn.count() > 0) {
    await searchNavBtn.click();
    await page.waitForTimeout(600);
    const searchInput = page.locator(".search-box input, .hybrid-search-input");
    if (await searchInput.count() > 0) {
      await searchInput.fill('tag:#architecture "AST" link:[[01-架构设计与核心技术]]');
      await page.waitForTimeout(800);
      await saveBoth(page, "35-hybrid-vault-search.png");
    }
  }

  await browser.close();
  console.log("\n=======================================================");
  console.log(" ALL 35 HIGH-DEFINITION SCREENSHOTS CAPTURED FOR v2.0.0!");
  console.log("=======================================================\n");
})();
