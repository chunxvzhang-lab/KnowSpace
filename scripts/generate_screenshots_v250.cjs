/**
 * KnowSpace v2.5.0 用户手册补充截图生成脚本
 *
 * 覆盖 v2.4.0 / v2.5.0 新增能力：
 *  - FSRS-5 间隔重复闪卡（Space「复盘」面板：正面 / 答案 + 四档评分间隔预览）
 *  - 闪卡三种零侵入语法（问答块 / 行内卡 / 挖空卡）
 *  - v2.4.0 多模态媒体卡片（图片卡片随画布加载渲染）
 *  - v2.4.0 环形对齐 + 交互式环半径拉杆
 *  - 关于对话框 v2.5.0 版本信息
 *
 * 运行前置：vite preview 服务已在 http://127.0.0.1:5199 运行
 *   node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5199
 *
 * 运行：node scripts/generate_screenshots_v250.cjs
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE_URL = "http://127.0.0.1:5199";
const OUTPUT_DIR = path.resolve("docs/manual-images");

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// 卡片 ID：与 src/services/fsrsService.ts 的 computeCardId 完全一致（FNV-1a）
// ─────────────────────────────────────────────────────────────────────────────
function computeCardId(kind, front) {
  const input = `${kind}\u0000${front.trim().toLowerCase()}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fsrs-${(hash >>> 0).toString(36)}`;
}

const QA_FRONT = "Raft 中的 Leader 选举需要多少票才能当选？";
const INLINE_FRONT = "CAP 定理三选二";
const CLOZE_FRONT = "Raft 通过 [...] 来保证集群日志的一致性。";

const ID_QA = computeCardId("qa", QA_FRONT);
const ID_INLINE = computeCardId("inline", INLINE_FRONT);
const ID_CLOZE = computeCardId("cloze", CLOZE_FRONT);

// ─────────────────────────────────────────────────────────────────────────────
// 示例内容
// ─────────────────────────────────────────────────────────────────────────────

const FSRS_SYNTAX_DOC = `# FSRS-5 间隔重复闪卡

> 把「记录 → 整理 → 连接 → **内化**」的最后一环补上：卡片直接写在普通 Markdown 里。

## 1. 问答块：Q: / A:

Q: Raft 中的 Leader 选举需要多少票才能当选？
A: 需要获得**多数派 (Majority)** 选票，即 ⌊N/2⌋ + 1 票。
   3 节点集群需要 2 票，5 节点集群需要 3 票。

## 2. 行内卡：问题 :: 答案

- CAP 定理三选二 :: Consistency / Availability / Partition tolerance
- PACELC :: 分区时在一致性与可用性之间取舍，否则在延迟与一致性之间取舍

## 3. 挖空卡：{{c1::答案}} 与 ==高亮==

- Raft 通过 {{c1::日志复制}} 来保证集群日志的一致性。
- 任期号 (Term) 是 ==单调递增== 的逻辑时钟。
- 提示写法：{{c1::领导者选举::如何选出 Leader？}}

## 4. 复习入口

侧栏「闪念 Space 时间线」→「复盘」标签页，按 Space 显示答案，数字键 1–4 评分。

> 卡片 ID 由内容派生：重排笔记顺序不会让卡片丢失历史。

<!-- fsrs:begin
${ID_QA} S=6.4000 D=5.1000 due=2026-09-15 reps=3 lapses=0 state=review last=2026-09-08
${ID_INLINE} S=2.8000 D=6.3000 due=2026-09-16 reps=1 lapses=0 state=review last=2026-09-12
${ID_CLOZE} S=12.2000 D=4.4000 due=2026-09-17 reps=5 lapses=1 state=review last=2026-09-05
fsrs:end -->
`;

const NOTE_DOC = `# 知识工作台使用手记

## 一、为什么需要一个本地知识库

笔记软件的第一原则是**数据属于自己**：所有文档都以纯 Markdown 落盘，
目录结构即知识结构，任何编辑器都能打开。

## 二、常用入口

- \`Ctrl + K\`：命令中枢（快速切换 / 动作执行 / 大纲直达）
- \`Ctrl + Shift + C\`：空间白板
- \`Ctrl + M\`：思维导图

## 三、下一步

把散落的灵感沉淀成卡片，再用复盘把它们真正记住。
`;

const SPACE_NOTE_1 = `# 2026-09-16 21:30 闪念

今天读《分布式系统设计》的笔记，顺手做成闪卡。

Q: Raft 中的 Leader 选举需要多少票才能当选？
A: 需要获得**多数派 (Majority)** 的选票，即 ⌊N/2⌋ + 1 票。
   3 节点集群需要 2 票，5 节点集群需要 3 票。

- CAP 定理三选二 :: Consistency / Availability / Partition tolerance

- [ ] 整理 PACELC 的补充说明
- [x] 复习 Raft 日志复制

#分布式 #闪卡

<!-- fsrs:begin
${ID_QA} S=6.4000 D=5.1000 due=2026-09-15 reps=3 lapses=0 state=review last=2026-09-08
${ID_INLINE} S=2.8000 D=6.3000 due=2026-09-16 reps=1 lapses=0 state=review last=2026-09-12
fsrs:end -->
`;

const SPACE_NOTE_2 = `# 2026-09-15 09:05 闪念

- Raft 通过 {{c1::日志复制}} 来保证集群日志的一致性。
- 任期号 (Term) 是 ==单调递增== 的逻辑时钟。

#共识算法
`;

const IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="480" height="270" fill="url(#bg)"/>
  <g fill="none" stroke="#7dd3fc" stroke-width="2" opacity="0.85">
    <rect x="36" y="96" width="96" height="56" rx="10"/>
    <rect x="192" y="42" width="96" height="56" rx="10"/>
    <rect x="192" y="150" width="96" height="56" rx="10"/>
    <rect x="348" y="96" width="96" height="56" rx="10"/>
    <path d="M132 124 H162 V70 H192"/>
    <path d="M132 124 H162 V178 H192"/>
    <path d="M288 70 H318 V124 H348"/>
    <path d="M288 178 H318 V124 H348"/>
  </g>
  <g fill="#e0f2fe" font-family="Segoe UI, sans-serif" font-size="13" text-anchor="middle">
    <text x="84" y="129">素材 / 截图</text>
    <text x="240" y="75">白板卡片</text>
    <text x="240" y="183">因果连线</text>
    <text x="396" y="129">演示分镜</text>
  </g>
  <text x="240" y="243" fill="#93c5fd" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle">v2.4.0 · 多模态媒体卡片全局示意</text>
</svg>`;

const MEDIA_DATA_URL = `data:image/svg+xml;base64,${Buffer.from(IMAGE_SVG, "utf8").toString("base64")}`;

const canvasData = {
  nodes: [
    {
      id: "n-inbox",
      type: "text",
      text: "# 灵感收集\n\n剪贴板截图、网页引用、随手一句话，先落到白板上。",
      x: 0,
      y: 0,
      width: 290,
      height: 160,
      color: "5",
    },
    {
      id: "n-media",
      type: "file",
      file: MEDIA_DATA_URL,
      x: 360,
      y: -20,
      width: 400,
      height: 225,
    },
    {
      id: "n-cluster",
      type: "text",
      text: "# 聚类与因果\n\n有向连线表达「前置 / 派生 / 支持」关系。",
      x: 840,
      y: 0,
      width: 290,
      height: 160,
      color: "4",
    },
    {
      id: "n-output",
      type: "text",
      text: "# 逆向萃取\n\n按空间坐标与箭头依赖萃取为 Markdown 长文。",
      x: 380,
      y: 300,
      width: 290,
      height: 160,
      color: "6",
    },
    {
      id: "n-doc",
      type: "file",
      file: "01-知识工作台使用手记.md",
      x: 840,
      y: 300,
      width: 290,
      height: 170,
    },
  ],
  edges: [
    { id: "e-1", fromNode: "n-inbox", toNode: "n-media", label: "素材落地", color: "5" },
    { id: "e-2", fromNode: "n-media", toNode: "n-cluster", label: "归类", color: "4" },
    { id: "e-3", fromNode: "n-cluster", toNode: "n-output", label: "萃取", color: "6" },
    { id: "e-4", fromNode: "n-output", toNode: "n-inbox", label: "迭代", color: "1" },
    { id: "e-5", fromNode: "n-doc", toNode: "n-cluster", label: "引用", color: "3" },
  ],
};

const chapters = [
  { id: "doc-1", title: "01-知识工作台使用手记", src: "01-知识工作台使用手记.md", absolutePath: "C:\\\\Docs\\\\01-知识工作台使用手记.md" },
  { id: "doc-2", title: "02-FSRS间隔重复闪卡", src: "02-FSRS间隔重复闪卡.md", absolutePath: "C:\\\\Docs\\\\02-FSRS间隔重复闪卡.md" },
  { id: "doc-3", title: "06-空间知识全景白板", src: "06-空间知识全景白板.canvas", absolutePath: "C:\\\\Docs\\\\06-空间知识全景白板.canvas" },
];

const contents = {
  "C:\\\\Docs\\\\01-知识工作台使用手记.md": NOTE_DOC,
  "C:\\\\Docs\\\\02-FSRS间隔重复闪卡.md": FSRS_SYNTAX_DOC,
  "C:\\\\Docs\\\\06-空间知识全景白板.canvas": JSON.stringify(canvasData, null, 2),
};

const flashNotes = [
  {
    filePath: "C:\\\\Docs\\\\Space\\\\2026-09-16_2130.md",
    fileName: "2026-09-16_2130.md",
    dateStr: "2026-09-16",
    timeDisplay: "21:30",
    modifiedTime: Date.parse("2026-09-16T21:30:00"),
    size: SPACE_NOTE_1.length,
    content: SPACE_NOTE_1,
    todos: [
      { id: "2026-09-16_2130.md:9", lineIndex: 9, text: "整理 PACELC 的补充说明", completed: false },
      { id: "2026-09-16_2130.md:10", lineIndex: 10, text: "复习 Raft 日志复制", completed: true },
    ],
    tags: ["分布式", "闪卡"],
  },
  {
    filePath: "C:\\\\Docs\\\\Space\\\\2026-09-15_0905.md",
    fileName: "2026-09-15_0905.md",
    dateStr: "2026-09-15",
    timeDisplay: "09:05",
    modifiedTime: Date.parse("2026-09-15T09:05:00"),
    size: SPACE_NOTE_2.length,
    content: SPACE_NOTE_2,
    todos: [],
    tags: ["共识算法"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 浏览器端 Mock（在页面上下文执行）
// ─────────────────────────────────────────────────────────────────────────────
function installMock(payload) {
  const { initialPath, contents: map, chapters: chs, flashNotes: notes } = payload;

  const toSource = (p) => ({
    markdown: map[p] || "",
    baseUrl: "file:///C:/Docs/",
    diskVersion: "v2.5.0",
    writable: true,
    hasBom: false,
    lineEnding: "LF",
    absolutePath: p,
  });

  const desktop = {
    getInitialSyncData: () => ({ filePath: initialPath, source: toSource(initialPath) }),
    getLaunchFilePath: async () => initialPath,
    getDirectoryForFile: async () => ({
      directory: { id: "knowspace-demo-vault", title: "KnowSpace 示例知识库", rootPath: "C:\\\\Docs", chapters: chs },
    }),
    readMarkdownFile: async (p) => toSource(p),
    saveMarkdownFile: async () => ({ success: true, diskVersion: "v2.5.0" }),
    saveMarkdownFileAs: async () => ({ success: true, absolutePath: "C:\\\\Docs\\\\副本.md" }),
    setNativeTheme: async () => {},
    onOpenFilePath: () => () => {},
    onMenuCommand: () => () => {},
    onBeforeClose: () => () => {},
    onFlashNoteSaved: () => () => {},
    getFlashNotesSummary: async () => ({
      success: true,
      spaceDir: "C:\\\\Docs\\\\Space",
      notes,
      totalTodos: 4,
      completedTodos: 2,
    }),
    toggleFlashTodo: async () => ({ success: true }),
    deleteFlashNote: async () => ({ success: true }),
    getFlashShortcut: async () => "Alt+Space",
    setFlashShortcut: async () => ({ success: true }),
    getFlashPin: async () => false,
    setFlashPin: async () => ({ success: true }),
    getPersistentNote: async () => "",
    savePersistentNote: async () => ({ success: true }),
    getAppSettings: async () => ({ autoLaunch: true, runInBackground: true }),
    setAppSettings: async (s) => ({ settings: { autoLaunch: true, runInBackground: true, ...s } }),
    onAppSettingsUpdated: () => () => {},
    listSnapshots: async () => [],
    readSnapshot: async () => ({ content: "" }),
    revertToSnapshot: async () => ({ success: true }),
    createManualSnapshot: async () => ({ success: true }),
    savePngData: async () => ({ success: true, filePath: "C:\\\\Exports\\\\canvas.png" }),
    exportSvgAsPng: async () => ({ success: true }),
    openFlashCapsule: () => {},
    openExternal: async () => true,
  };

  window.knowSpaceDesktop = desktop;
  window.bookMDDesktop = desktop;
}

async function save(page, name) {
  const target = path.join(OUTPUT_DIR, name);
  await page.screenshot({ path: target });
  console.log(`[OK] ${name}`);
}

async function newScene(browser, initialPath) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
  });
  await context.addInitScript(installMock, {
    initialPath,
    contents,
    chapters,
    flashNotes,
  });
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForTimeout(2600);
  return { context, page };
}

async function useLightTheme(page) {
  await page.locator('[aria-label="日光浅色"]').first().click({ timeout: 4000 }).catch(() => {});
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await page.waitForTimeout(500);
}

(async () => {
  console.log("Launching Edge via Playwright for KnowSpace v2.5.0 manual screenshots...");
  const browser = await chromium.launch({ channel: "msedge" });

  // ── Scene A：闪卡语法文档 + 复盘面板 + 关于对话框 ─────────────────────────
  {
    const { context, page } = await newScene(browser, "C:\\\\Docs\\\\02-FSRS间隔重复闪卡.md");
    try {
      await useLightTheme(page);

      // 1) 分屏模式：左侧源码语法 + 右侧实时渲染
      await page.locator('[data-tooltip="分屏模式"]').first().click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(1400);
      await save(page, "36-fsrs-card-syntax.png");

      // 2) 闪念 Space 时间线 → 复盘
      await page.locator('[aria-label="闪念 Space 时间线看板"]').click({ timeout: 5000 });
      await page.waitForTimeout(900);
      await page.locator(".space-tab-btn", { hasText: "复盘" }).click({ timeout: 5000 });
      await page.waitForTimeout(1200);
      await save(page, "37-fsrs-review-question.png");

      // 3) 显示答案 → 四档评分与间隔预览
      await page.locator(".dr-reveal-btn").click({ timeout: 5000 });
      await page.waitForTimeout(500);
      await save(page, "38-fsrs-review-answer.png");

      // 4) 关于对话框（v2.5.0 更新日志）
      await page.locator('[aria-label="关于应用"]').click({ timeout: 5000 });
      await page.waitForTimeout(900);
      await save(page, "39-about-v250.png");
      await page.keyboard.press("Escape");
    } catch (err) {
      console.warn("[WARN] Scene A partial failure:", err.message);
    }
    await context.close();
  }

  // ── Scene B：白板多模态媒体卡片 + 环形排布调距 ────────────────────────────
  {
    const { context, page } = await newScene(browser, "C:\\\\Docs\\\\06-空间知识全景白板.canvas");
    try {
      await useLightTheme(page);
      await page.waitForTimeout(1200);
      await page.locator('[title="自适应全图"]').first().click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(1200);
      await save(page, "40-canvas-media-cards.png");

      // 全选卡片 → 对齐菜单 → 环形对齐
      await page.keyboard.press("Control+a");
      await page.waitForTimeout(700);
      await page.locator('button:has-text("对齐 ▾")').first().click({ timeout: 5000 });
      await page.waitForTimeout(500);
      await page.locator("text=环形对齐 (圆周等分)").click({ timeout: 5000 });
      await page.waitForTimeout(1600);

      // 收起菜单并自适应全图：展示真实圆形弧线闭环
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      await page.locator('[title="自适应全图"]').first().click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(1400);
      await save(page, "41-canvas-ring-layout.png");

      // 加宽视口后重新全选并展开对齐菜单，让下拉面板完整展开（露出环半径拉杆）
      await page.setViewportSize({ width: 2560, height: 1100 });
      await page.waitForTimeout(800);
      await page.locator('[title="自适应全图"]').first().click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(600);
      await page.keyboard.press("Control+a");
      await page.waitForTimeout(600);
      await page.locator('button:has-text("对齐 ▾")').first().click({ timeout: 5000 });
      await page.waitForTimeout(700);
      await save(page, "42-canvas-ring-radius-slider.png");
    } catch (err) {
      console.warn("[WARN] Scene B partial failure:", err.message);
    }
    await context.close();
  }

  await browser.close();
  console.log("Done. Images written to", OUTPUT_DIR);
})();
