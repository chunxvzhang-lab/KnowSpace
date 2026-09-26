const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE_URL = "http://127.0.0.1:5188";
const OUTPUT_DIR = path.resolve("docs/manual-images");
const RELEASE_OUTPUT_DIR = path.resolve("release/KnowSpace-win-x64/docs/manual-images");

const sampleDoc1 = `# KnowSpace 知识架构与核心引擎

> **KnowSpace · Personal Knowledge Workspace**  
> *Write. Read. Connect. Know. (记录 · 阅读 · 连接 · 认知)* — 由 **摸鱼Lab** 研发。

---

## 1. 核心系统架构 (Mermaid 拓扑图)

KnowSpace 采用本地优先（Local-first）与 AST 源码行号双向映射架构：

\`\`\`mermaid
flowchart TB
    AST[Markdown AST 编译管线] --> LineMap[源码行号槽位映射]
    LineMap --> SyncEngine[分段线性双向同步滚动]
    SyncEngine --> Split[左右分屏实时渲染]
\`\`\`
`;

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
`;

const sampleDoc3 = `# 03-闪念胶囊与本地原子事务落盘

> 任何灵感，随时捕捉；所有文字，万无一失。
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

  await context.addInitScript(({ s1, s2, s3 }) => {
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
      savePngData: async () => ({ success: true, filePath: "C:\\\\Exports\\\\mermaid-diagram.png" }),
    };

    window.knowSpaceDesktop = mockDesktop;
    window.bookMDDesktop = mockDesktop;
  }, { s1: sampleDoc1, s2: sampleDoc2, s3: sampleDoc3 });

  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForTimeout(1500);

  // Set dark theme
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "twitter");
  });
  await page.waitForTimeout(500);

  // Click second file in tree
  const fileRows = page.locator(".tree-row.file-row");
  console.log("File rows count:", await fileRows.count());
  if (await fileRows.count() >= 2) {
    await fileRows.nth(1).click();
    await page.waitForTimeout(800);
  }

  // Check tabs
  const tabs = page.locator(".tab-item");
  console.log("Tabs count:", await tabs.count());
  if (await tabs.count() >= 2) {
    // Right click inactive tab
    await tabs.nth(0).click({ button: "right" });
    await page.waitForTimeout(500);
    console.log("Saving 09-multi-tabs.png...");
    await saveBoth(page, "09-multi-tabs.png");

    // Click split compare
    const splitOption = page.locator('.tab-context-menu button:has-text("分屏对比")');
    if (await splitOption.count() > 0) {
      await splitOption.click();
      await page.waitForTimeout(1200);
      console.log("Saving 10-dual-split-compare.png...");
      await saveBoth(page, "10-dual-split-compare.png");
    }
  }

  await browser.close();
  console.log("Multi-tabs & Dual split finished!");
})();
