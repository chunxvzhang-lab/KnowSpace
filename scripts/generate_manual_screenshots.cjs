const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE_URL = "http://127.0.0.1:5188";
const OUTPUT_DIR = path.resolve("docs/manual-images");
const RELEASE_OUTPUT_DIR = path.resolve("release/KnowSpace-win-x64/docs/manual-images");

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
if (!fs.existsSync(RELEASE_OUTPUT_DIR)) {
  fs.mkdirSync(RELEASE_OUTPUT_DIR, { recursive: true });
}

// Sample Markdown 1
const sampleDoc1 = `# KnowSpace 知识架构与核心引擎

> **KnowSpace · Personal Knowledge Workspace**  
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

    subgraph Workspace [三段式工作空间]
        Reader[沉浸阅读器 Reader]
        Editor[极客源码编辑器 CodeMirror 6]
        Split[左右分屏实时渲染]
    end

    subgraph Storage [数据持久与安全]
        AtomicSave[原子事务落盘保存]
        BOMGuard[UTF-8 BOM 与 CRLF 保真]
        Conflict[外部修改冲突感知]
    end

    AST --> LineMap
    LineMap --> SyncEngine
    SyncEngine --> Split
    Split --> Reader
    Split --> Editor
    Editor --> AtomicSave
    AtomicSave --> BOMGuard
    AtomicSave --> Conflict
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
- [ ] 2D/3D WebGL 交互式动态知识图谱

---

## 5. 特性对比与指标 (GFM Table)

| 核心维度 | 传统 Markdown 编辑器 | KnowSpace 个人知识工作台 |
| :--- | :--- | :--- |
| **首屏渲染速度** | 常见 800ms ~ 1.5s 缓慢白屏 | **毫秒级秒开 (332 kB 首屏精简分包)** |
| **同步滚动精度** | 简易百分比滚动，高度漂移严重 | **AST 块级行号分段线性插值零漂移** |
| **架构图导出** | 需截图截断或低清模糊 | **Mermaid 3× Retina 超清矢量 PNG 导出** |
| **对比模式** | 需打开两个独立窗口手工并排 | **原生多标签右键「左右分屏对比模式」** |
| **闪念捕捉** | 需先启动主界面寻找目录建文件 | **全局热键 \`Alt+Space\` 磨砂浮窗秒级落盘** |
| **数据安全** | 常见直接写覆磁盘易截断损坏 | **原子事务写入 + \`fsync\` + 重命名替换** |
`;

// Sample Markdown 2
const sampleDoc2 = `# 02-AST双向零延迟同步与图表导出

> 本章节深入解析 KnowSpace 的底层核心协同算法与超清渲染导出管线。

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

## 2. Mermaid 3× Retina 超高清导出管线

在灯箱模式下，KnowSpace 直接从 DOM 获取渲染后的矢量包围盒：

1. **\`getBBox()\` 计算精准边界**：消除 SVG 外部冗余空白并保留安全边距。
2. **主题配色与字体 CSS 深度内联**：自动嵌入当前主题底色与文字颜色。
3. **3 倍分辨率 Canvas 栅格化**：生成 300+ DPI 印刷级清晰度的 PNG 图片。
`;

// Sample Markdown 3
const sampleDoc3 = `# 03-闪念胶囊与本地原子事务落盘

> 任何灵感，随时捕捉；所有文字，万无一失。

---

## 1. 闪念胶囊 (Flash Notes) 交互设计

- \`Alt+Space\` 全局随时召唤磨砂玻璃悬浮卡片。
- 支持 \`- [ ]\` 待办、\`#\` 标签、\`[[\` 双链与当前时间快捷插入。
- 按下 \`Ctrl+Enter\` 秒级原子落盘保存至 \`Inbox/YYYY-MM-DD.md\`。
`;

async function saveBoth(page, name) {
  const p1 = path.join(OUTPUT_DIR, name);
  const p2 = path.join(RELEASE_OUTPUT_DIR, name);
  await page.screenshot({ path: p1 });
  fs.copyFileSync(p1, p2);
  console.log(`Saved screenshot: ${name}`);
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
  });

  // Inject desktop mock into the page
  await context.addInitScript(
    ({ s1, s2, s3 }) => {
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
      ];

      const contentMap = {
        "C:\\\\Docs\\\\01-架构设计与核心技术.md": s1,
        "C:\\\\Docs\\\\02-AST双向零延迟同步.md": s2,
        "C:\\\\Docs\\\\03-闪念胶囊与原子落盘.md": s3,
        "doc-1": s1,
        "doc-2": s2,
        "doc-3": s3,
      };

      const mockDesktop = {
        getInitialSyncData: () => ({
          filePath: "C:\\\\Docs\\\\01-架构设计与核心技术.md",
          source: {
            markdown: s1,
            baseUrl: "file:///C:/Docs/",
            diskVersion: "v1",
            writable: true,
            hasBom: false,
            lineEnding: "LF",
          },
        }),
        getLaunchFilePath: async () => "C:\\\\Docs\\\\01-架构设计与核心技术.md",
        getDirectoryForFile: async () => ({
          directory: {
            id: "knowspace-library",
            title: "KnowSpace 核心知识库",
            rootPath: "C:\\\\Docs",
            chapters,
          },
        }),
        readMarkdownFile: async (filePath) => ({
          markdown: contentMap[filePath] || s1,
          baseUrl: "file:///C:/Docs/",
          diskVersion: "v1",
          writable: true,
          hasBom: false,
          lineEnding: "LF",
        }),
        saveMarkdownFile: async () => ({ success: true }),
        saveMarkdownFileAs: async () => ({ success: true }),
        setNativeTheme: async () => {},
        onOpenFilePath: () => () => {},
        onMenuCommand: () => () => {},
        onBeforeClose: () => () => {},
        onFlashNoteSaved: () => () => {},
        exportSvgAsPng: async () => ({ success: true }),
        savePngData: async () => ({
          success: true,
          filePath: "C:\\\\Exports\\\\mermaid-diagram.png",
        }),
      };

      window.knowSpaceDesktop = mockDesktop;
      window.bookMDDesktop = mockDesktop;
    },
    { s1: sampleDoc1, s2: sampleDoc2, s3: sampleDoc3 },
  );

  const page = await context.newPage();

  console.log("Navigating to app with desktop mock...");
  await page.goto(BASE_URL);
  await page.waitForTimeout(1500);

  // Switch to dark theme first (signature brand look)
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "twitter");
  });
  await page.waitForTimeout(500);

  // 01: Overview Workbench (Directory open, Split mode, Geek Dark theme)
  console.log("Capturing 01-overview-workbench.png...");
  await saveBoth(page, "01-overview-workbench.png");

  // 02: Light Theme (Warm Amber-Orange)
  console.log("Capturing 02-theme-light.png...");
  const lightBtn = page.locator('button[aria-label="日光浅色"]');
  if ((await lightBtn.count()) > 0) {
    await lightBtn.click();
  } else {
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  }
  await page.waitForTimeout(600);
  await saveBoth(page, "02-theme-light.png");

  // 03: E-ink Paper Theme
  console.log("Capturing 03-theme-eink.png...");
  const einkBtn = page.locator('button[aria-label="仿电子墨水屏"]');
  if ((await einkBtn.count()) > 0) {
    await einkBtn.click();
  } else {
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "eink"));
  }
  await page.waitForTimeout(600);
  await saveBoth(page, "03-theme-eink.png");

  // 04: Geek Dark Theme
  console.log("Capturing 04-theme-dark.png...");
  const darkBtn = page.locator('button[aria-label="极客暗黑"]');
  if ((await darkBtn.count()) > 0) {
    await darkBtn.click();
  } else {
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "twitter"));
  }
  await page.waitForTimeout(600);
  await saveBoth(page, "04-theme-dark.png");

  // 05: Split View Mode
  console.log("Capturing 05-mode-split.png...");
  const splitBtn = page.locator('.view-mode-control button:has-text("分屏")');
  if ((await splitBtn.count()) > 0) {
    await splitBtn.click();
  }
  await page.waitForTimeout(600);
  await saveBoth(page, "05-mode-split.png");

  // 06: Source View Mode
  console.log("Capturing 06-mode-source.png...");
  const sourceBtn = page.locator('.view-mode-control button:has-text("源码")');
  if ((await sourceBtn.count()) > 0) {
    await sourceBtn.click();
  }
  await page.waitForTimeout(600);
  await saveBoth(page, "06-mode-source.png");

  // 07: Read View Mode
  console.log("Capturing 07-mode-read.png...");
  const readBtn = page.locator('.view-mode-control button:has-text("阅读")');
  if ((await readBtn.count()) > 0) {
    await readBtn.click();
  }
  await page.waitForTimeout(600);
  await saveBoth(page, "07-mode-read.png");

  // 08: Rich Markdown (KaTeX, Mermaid, Code with Badge)
  console.log("Capturing 08-rich-markdown.png...");
  await page.evaluate(() => {
    const reader =
      document.querySelector(".reader-scroll-container") || document.querySelector(".reader-pane");
    if (reader) reader.scrollTop = 160;
  });
  await page.waitForTimeout(800);
  await saveBoth(page, "08-rich-markdown.png");

  // Reset scroll
  await page.evaluate(() => {
    const reader =
      document.querySelector(".reader-scroll-container") || document.querySelector(".reader-pane");
    if (reader) reader.scrollTop = 0;
  });

  // Switch back to split mode
  if ((await splitBtn.count()) > 0) await splitBtn.click();
  await page.waitForTimeout(500);

  // Click second chapter in tree to open it as a tab
  console.log("Opening second chapter to populate multi-tabs...");
  const chapterItems = page.locator(".tree-item-content");
  if ((await chapterItems.count()) >= 2) {
    await chapterItems.nth(1).click();
    await page.waitForTimeout(800);
  }

  // 09: Multi-tabs Bar & Context Menu
  console.log("Capturing 09-multi-tabs.png...");
  const tabs = page.locator(".tab-item");
  if ((await tabs.count()) >= 2) {
    // Right-click the inactive tab (doc-1)
    await tabs.nth(0).click({ button: "right" });
    await page.waitForTimeout(500);
    await saveBoth(page, "09-multi-tabs.png");

    // 10: Dual Split Compare View
    console.log("Capturing 10-dual-split-compare.png...");
    const splitOption = page.locator('.tab-context-menu button:has-text("分屏对比")');
    if ((await splitOption.count()) > 0) {
      await splitOption.click();
      await page.waitForTimeout(1000);
      await saveBoth(page, "10-dual-split-compare.png");

      // Exit dual split
      const exitBtn = page.locator(".tab-exit-split-btn");
      if ((await exitBtn.count()) > 0) {
        await exitBtn.click();
        await page.waitForTimeout(600);
      }
    } else {
      await page.keyboard.press("Escape");
    }
  }

  // Switch to doc-1 again
  if ((await tabs.count()) >= 1) {
    await tabs.nth(0).click();
    await page.waitForTimeout(600);
  }

  // 11: Navigation Outline (TOC)
  console.log("Capturing 11-navigation-toc.png...");
  const tocNavBtn = page.locator('button[aria-label="大纲目录"]');
  if ((await tocNavBtn.count()) > 0) {
    await tocNavBtn.click();
    await page.waitForTimeout(600);
    await saveBoth(page, "11-navigation-toc.png");
  }

  // 12: Fulltext Search Panel
  console.log("Capturing 12-fulltext-search.png...");
  const searchNavBtn = page.locator('button[aria-label="全文搜索"]');
  if ((await searchNavBtn.count()) > 0) {
    await searchNavBtn.click();
    await page.waitForTimeout(500);
    const searchInput = page.locator(".search-box input");
    if ((await searchInput.count()) > 0) {
      await searchInput.fill("AST");
      await page.waitForTimeout(800);
      const firstCard = page.locator(".search-card").first();
      if ((await firstCard.count()) > 0) {
        await firstCard.click();
        await page.waitForTimeout(600);
      }
      await saveBoth(page, "12-fulltext-search.png");
    }
  }

  // 13: Bookmarks Panel
  console.log("Capturing 13-bookmarks.png...");
  const addBookmarkBtn = page.locator('button[title*="添加书签"]');
  if ((await addBookmarkBtn.count()) > 0) {
    await addBookmarkBtn.click();
    await page.waitForTimeout(500);
  }
  const bookmarksNavBtn = page.locator('button[aria-label="书签列表"]');
  if ((await bookmarksNavBtn.count()) > 0) {
    await bookmarksNavBtn.click();
    await page.waitForTimeout(600);
    await saveBoth(page, "13-bookmarks.png");
  }

  // 14: Media Lightbox
  console.log("Capturing 14-media-lightbox.png...");
  // Find rendered Mermaid SVG or pre.mermaid
  const mermaidElem = page.locator("pre.mermaid, .mermaid-container svg").first();
  if ((await mermaidElem.count()) > 0) {
    await mermaidElem.click();
    await page.waitForTimeout(800);
    await saveBoth(page, "14-media-lightbox.png");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  } else {
    console.log("Mermaid element not found for lightbox.");
  }

  // 15: Flash Capsule (Open flash mode)
  console.log("Capturing 15-flash-capsule.png...");
  const flashPage = await context.newPage();
  await flashPage.setViewportSize({ width: 720, height: 480 });
  await flashPage.goto(`${BASE_URL}/?mode=flash`);
  await flashPage.waitForTimeout(1000);
  const flashTextarea = flashPage.locator(".flash-textarea");
  if ((await flashTextarea.count()) > 0) {
    await flashTextarea.fill(
      "- [x] 梳理 KnowSpace 知识库核心功能\n> 💡 明天下午 14:00 摸鱼Lab 架构评审会\n[[01-架构设计与核心技术]]",
    );
  }
  await flashPage.waitForTimeout(500);
  await saveBoth(flashPage, "15-flash-capsule.png");

  // Also show flash settings open
  console.log("Capturing 15-flash-capsule-settings.png...");
  const flashSettingsBtn = flashPage.locator('button[title*="设置全局热键"]');
  if ((await flashSettingsBtn.count()) > 0) {
    await flashSettingsBtn.click();
    await flashPage.waitForTimeout(500);
    await saveBoth(flashPage, "15-flash-capsule-settings.png");
  }
  await flashPage.close();

  // 16: About Dialog
  console.log("Capturing 16-about-dialog.png...");
  const aboutBtn = page.locator('button[aria-label="关于应用"]');
  if ((await aboutBtn.count()) > 0) {
    await aboutBtn.click();
    await page.waitForTimeout(600);
    await saveBoth(page, "16-about-dialog.png");
  }

  await browser.close();
  console.log("ALL screenshots generated perfectly!");
})();
