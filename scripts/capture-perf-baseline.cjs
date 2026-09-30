/**
 * Captures the performance baseline into a committed snapshot (plan §6.3, phase 2).
 *
 * Same mental model as `capture-test-baseline.cjs` / `quality-ratchet.cjs`:
 * the script owns the number, humans never hand-edit it. `docs/PERF_BASELINE.md`
 * is fully regenerated on every run; the authoritative machine-readable copy
 * lives in the `perf-baseline:metrics` JSON block at the bottom of that doc.
 *
 * What it does:
 *   1. requires `dist/` (it does NOT build — run `npm run build` first),
 *   2. spawns `vite preview` on a free port,
 *   3. drives the real web build in headless Edge (channel "msedge"), feeding it
 *      a deterministic Markdown corpus through a MOCK DESKTOP BRIDGE injected
 *      via `context.addInitScript` before any app script runs (window.knowSpaceDesktop
 *      + window.bookMDDesktop), because the app only gets real content through
 *      that bridge (useVaultOpening / useChapterLoading / useDocumentSession),
 *   4. runs the five scenario groups of plan §6.3,
 *   5. writes docs/PERF_BASELINE.md.
 *
 * Measurement discipline (ENGINEERING_GUIDE.md 4.5): every scenario is executed
 * once as warm-up and then N=3 times; the committed number is the min of the 3
 * samples. Long-task / frame numbers come from in-page PerformanceObserver
 * ("longtask") and rAF timestamps, never from round-trip CDP latency.
 *
 * `--check` mode: unlike test counts, perf numbers are not byte-stable, so
 * --check does NOT assert equality. Fresh values must stay within
 *     limit = committed < 20 ? committed + 25 : committed × 1.5
 * (ms and MB metrics alike — the +25 absolute floor keeps near-zero metrics
 * such as "long-task count = 0" from being flagged by a single 60ms task).
 * Deterministic counts (DOM node count, block count) must match exactly.
 * Any breach exits 1.
 *
 * NOT wired into CI/preflight on purpose: this harness launches a real browser
 * and costs minutes per run — the plan puts perf benchmarks on the nightly
 * lane, not the PR gate. A regression in phase-2 perf work should fail the
 * nightly job that calls `npm run perf:baseline:check`.
 *
 * Usage:  node scripts/capture-perf-baseline.cjs
 *         node scripts/capture-perf-baseline.cjs --check
 * Output: docs/PERF_BASELINE.md (capture mode only)
 */

const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const docPath = path.join(root, "docs", "PERF_BASELINE.md");
const distIndex = path.join(root, "dist", "index.html");

/** Progress tracing for the browser lane (PERF_TRACE=1) — diagnostics only. */
const TRACE = process.env.PERF_TRACE === "1";
const trace = (...a) => {
  if (TRACE) console.log("[trace]", ...a);
};

/** Reject (instead of hanging forever) if a page-side await misses its deadline. */
async function withDeadline(fn, ms, label) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`[${label}] exceeded ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const SAMPLES = 3;
const LONGTASK_MS = 50; // guide 4.5 / plan §6.3 long-task threshold
const SCROLL_FRAMES = 120;
const TYPING_CHARS = 60;
const TYPING_SETTLE_MS = 2500; // > the 350ms preview debounce + full re-render
// 与 Mermaid 惰性池的 rootMargin 同源（src/services/mermaid.ts 的池常量）。
// 首屏完成线 = 视口 ± 这个边距内的图全部画完；改了池的边距就要改这里，
// 两边不一致时这个测量口径会悄悄说谎——这是它写成常量的原因。
const MERMAID_VIEWPORT_MARGIN_PX = 300;

/* ------------------------------------------------------------------ *
 * Metric registry — one source of truth for printing, the doc, and
 * --check. `kind`: "exact" (deterministic count) or "timing".
 * ------------------------------------------------------------------ */
const METRICS = [
  {
    key: "longdoc_dom_nodes",
    scenario: "长文 DOM (2-2)",
    name: "10 万字文档 article 内 DOM 节点数",
    unit: "个",
    kind: "exact",
    digits: 0,
    budget: "< 200（§6.3 验收：DOM 虚拟化）",
    pass: (v) => v < 200,
    desc: "语料 A（10 万字）打开后 <article> 子树的全部后代元素数。未虚拟化的现状基线。",
  },
  {
    key: "longdoc_blocks",
    scenario: "长文 DOM (2-2)",
    name: "10 万字文档顶层块数（[data-source-line]）",
    unit: "块",
    kind: "exact",
    digits: 0,
    budget: "—（口径项）",
    pass: null,
    desc: "渲染器为顶层块标注 data-source-line 的元素数，即虚拟化的目标颗粒度。",
  },
  {
    key: "typing_max_longtask_ms",
    scenario: "打字延迟 (2-1/2-2)",
    name: "长文打字 · 最长单次主线程长任务",
    unit: "ms",
    kind: "timing",
    digits: 1,
    budget: "≤ 50（§6.3 <16ms 的长任务口径：单次长任务预算记 50ms）",
    pass: (v) => v <= LONGTASK_MS,
    desc: "CodeMirror 中连续输入 60 字符（20ms/键）+ 350ms 防抖后的整篇预览重渲染，取按键窗口至落定的最长一条 >50ms longtask。",
  },
  {
    key: "typing_longtask_count",
    scenario: "打字延迟 (2-1/2-2)",
    name: "长文打字 · >50ms 长任务次数",
    unit: "次",
    kind: "timing",
    digits: 0,
    budget: "= 0（口径：无 >50ms 长任务）",
    pass: (v) => v === 0,
    desc: "同窗口内 >50ms 的 longtask 条数。当前防抖后整篇重渲染，>0 即为计划 2-1（增量块解析）要消灭的对象。",
  },
  {
    key: "typing_parse_max_ms",
    scenario: "打字延迟 (2-1/2-2)",
    name: "最长渲染 · markdown-it 解析段",
    unit: "ms",
    kind: "timing",
    digits: 1,
    budget: "—（口径项）",
    pass: null,
    desc: "打字落定窗口内最长一次 renderMarkdown 的 ks:md-render-parse 测量值（markdown.render 同步段）。permanent marks 见 src/services/markdown.ts：每次渲染先清同名旧条目，读到的即窗口内最后一次（=落定重渲染、长任务本体）的解剖。0 与「没有成本」的区分看 counts 行。jsdom bench 说解析占比极小，这里是 Chromium 的绝对值复核。",
  },
  {
    key: "typing_sanitize_max_ms",
    scenario: "打字延迟 (2-1/2-2)",
    name: "最长渲染 · DOMPurify 净化段",
    unit: "ms",
    kind: "timing",
    digits: 1,
    budget: "—（口径项）",
    pass: null,
    desc: "同一次渲染的 ks:md-render-sanitize 段（RETURN_DOM_FRAGMENT 净化，主线程固有）。jsdom 口径下净化占 83%，但 jsdom 的 DOMPurify 是纯 JS——Chromium 原生 DOM 上这个比例是否成立，决定块级净化缓存这刀该不该下。",
  },
  {
    key: "typing_dom_max_ms",
    scenario: "打字延迟 (2-1/2-2)",
    name: "最长渲染 · DOM 后处理段",
    unit: "ms",
    kind: "timing",
    digits: 1,
    budget: "—（口径项）",
    pass: null,
    desc: "同一次渲染的 ks:md-render-dom 段（addHeadingIds → template.innerHTML，含 URL 重写/图片优化/纯文本提取；sha256 的 await 在测量段外）。三段之和与 typing_max_longtask_ms 的差即 React 提交/样式/Layout 等管线外成本。",
  },
  {
    key: "scroll_p50_frame_ms",
    scenario: "滚动帧时 (2-4)",
    name: "长文滚动 · 帧间隔 p50",
    unit: "ms",
    kind: "timing",
    digits: 1,
    budget: "≤ 16.7（恒定 60FPS）",
    pass: (v) => v <= 16.7,
    desc: "分屏模式下 rAF 循环逐帧 scrollBy(420px) 共 120 帧，rAF 时间戳差的分位数（in-page performance.now，非 CDP 往返）。分屏是同步滚动工作唯一存在的模式——阅读模式下 useSyncScroll 本就惰性，量它等于没量。",
  },
  {
    key: "scroll_p95_frame_ms",
    scenario: "滚动帧时 (2-4)",
    name: "长文滚动 · 帧间隔 p95",
    unit: "ms",
    kind: "timing",
    digits: 1,
    budget: "≤ 16.7（恒定 60FPS）",
    pass: (v) => v <= 16.7,
    desc: "2-4（滚动读写分离）的目标指标：p95 而非均值，尾部掉帧才是用户感知。",
  },
  {
    key: "scroll_dropped_frames",
    scenario: "滚动帧时 (2-4)",
    name: "长文滚动 · 掉帧数（帧间隔 >20ms）",
    unit: "帧",
    kind: "timing",
    digits: 0,
    budget: "= 0（120 帧内）",
    pass: (v) => v === 0,
    desc: `滚动窗口 ${SCROLL_FRAMES} 帧中帧间隔 >20ms 的帧数。`,
  },
  {
    key: "mermaid_firstpaint_ms",
    scenario: "图表批量 (2-5)",
    name: "视口内 Mermaid 图 · 首屏完成时长",
    unit: "ms",
    kind: "timing",
    digits: 1,
    budget: "< 80（§6.3 图表/公式批量；验收线 <50）",
    pass: (v) => v < 80,
    desc: "语料 B（30 图）：article 带着 pre.mermaid 进入 DOM → 视口 ±300px 内全部图渲染出 <svg>。两端时间戳由注入页面的 MutationObserver 记录（轮询锚点出生即晚，量出来是 harness 不是应用）。惰性池语义下的首屏感知口径；急切全量版的「第 30 张完成」口径见 v2.7.0 基线历史。",
  },
  {
    key: "mermaid_flush_ms",
    scenario: "图表批量 (2-5)",
    name: "beforeprint flush · 全部 30 图完成",
    unit: "ms",
    kind: "timing",
    digits: 1,
    budget: "—（口径项：打印/导出的完整性成本，允许慢于首屏，必须完整）",
    pass: null,
    desc: "dispatch beforeprint 后 30/30 张 svg 全部出现的时长。它同时是「懒加载不会吞掉任何一张图」的机器证明。",
  },
  {
    key: "mermaid_longtask_sum_ms",
    scenario: "图表批量 (2-5)",
    name: "30 张 Mermaid 图 · 窗口内长任务总时长",
    unit: "ms",
    kind: "timing",
    digits: 1,
    budget: "—（口径项）",
    pass: null,
    desc: "同一窗口内 >50ms longtask 的 duration 之和，衡量主线程被图表渲染占用的总时间。",
  },
  {
    key: "tab_per_tab_heap_delta_mb",
    scenario: "多标签内存 (2-3)",
    name: "20 标签 · 单标签 JS 堆增量",
    unit: "MB",
    kind: "timing",
    digits: 2,
    budget: "< 5（目标；冷冻态 <0.2）",
    pass: (v) => v < 5,
    desc: "打开第 1 篇与第 20 篇之间 GC 后的 JS 堆差 ÷ 19。若已低于预算，计划 2-3 的「~18MB/标签」历史假设在本机基线上不成立。",
  },
  {
    key: "tab_heap_after_cycle_mb",
    scenario: "多标签内存 (2-3)",
    name: "20 标签 · 轮切一轮后 JS 堆",
    unit: "MB",
    kind: "timing",
    digits: 2,
    budget: "—（20 标签总内存较 v2.7 下降 ≥50% 的起算基线）",
    pass: null,
    desc: "Ctrl+Tab 轮切 20 次并落定、强制 GC 后的 usedJSHeapSize。后续 2-3 落地后以此值为分母验证「下降 ≥50%」。",
  },
  {
    key: "tab_switch_max_longtask_ms",
    scenario: "多标签内存 (2-3)",
    name: "20 标签 · 单次切换最长长任务",
    unit: "ms",
    kind: "timing",
    digits: 1,
    budget: "≤ 50（长任务口径）",
    pass: (v) => v <= LONGTASK_MS,
    desc: "轮切窗口内最长的一条 >50ms longtask（每次切换都触发整篇 ~200KB 重渲染）。",
  },
  {
    key: "tab_switch_avg_ms",
    scenario: "多标签内存 (2-3)",
    name: "20 标签 · 单次切换平均耗时",
    unit: "ms",
    kind: "timing",
    digits: 1,
    budget: "—（2-3 验收线：冷冻恢复 <100ms 的对照）",
    pass: null,
    desc: "每次 Ctrl+Tab 从按键到新文档内容挂载完成的等待均值。",
  },
];

/* ------------------------------------------------------------------ *
 * Deterministic corpus generators (fixed seed — byte-identical every
 * run, in Node and in the report).
 * ------------------------------------------------------------------ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  "知识",
  "节点",
  "上下文",
  "映射",
  "缓存",
  "解析",
  "增量",
  "虚拟化",
  "渲染",
  "主线程",
  "同步",
  "滚动",
  "行号",
  "锚点",
  "分块",
  "索引",
  "段落",
  "标题",
  "列表",
  "表格",
  "performance",
  "baseline",
  "renderer",
  "document",
  "layout",
  "scroll",
  "worker",
  "virtual",
  "parser",
  "chunk",
  "anchor",
  "profile",
  "budget",
  "latency",
  "frame",
];

function sentence(rnd) {
  const n = 10 + Math.floor(rnd() * 8);
  const parts = [];
  for (let i = 0; i < n; i += 1) parts.push(WORDS[Math.floor(rnd() * WORDS.length)]);
  return parts.slice(0, 6).join("、") + "；" + parts.slice(6).join(" ") + "。";
}

/**
 * A deterministic Markdown document of >= targetChars with hundreds of
 * top-level blocks: headings / paragraphs / task lists / code fences /
 * tables interleaved in a fixed cycle. `marker` appears in every H2 so the
 * harness can wait for a specific document to be on screen.
 */
function generateDocument(seed, targetChars, marker) {
  const rnd = mulberry32(seed);
  const out = ["# " + marker + " · 性能基准语料", "", sentence(rnd), sentence(rnd), ""];
  let section = 0;
  let block = 0;
  while (out.join("\n").length < targetChars) {
    section += 1;
    block += 1;
    const tag = marker + " 分节 " + String(section).padStart(3, "0");
    out.push("", "## " + tag, "");
    out.push(sentence(rnd), sentence(rnd), sentence(rnd), sentence(rnd), "");
    block += 5;
    if (block % 2 === 0) {
      out.push("### 任务清单 " + section, "");
      for (let i = 0; i < 6; i += 1) {
        out.push((rnd() > 0.5 ? "- [x] " : "- [ ] ") + sentence(rnd).slice(0, 40));
      }
      out.push("");
    } else {
      out.push("### 代码片段 " + section, "");
      out.push("```js");
      for (let i = 0; i < 8; i += 1) {
        out.push(
          "const " +
            WORDS[Math.floor(rnd() * WORDS.length)].replace(/[^a-zA-Z]/g, "x") +
            "_" +
            i +
            " = parse(" +
            i +
            " * block[" +
            section +
            "]);",
        );
      }
      out.push("```", "");
    }
    out.push("| 列一 | 列二 | 列三 | 列四 |", "| :--- | ---: | :--- | ---: |");
    for (let r = 0; r < 6; r += 1) {
      out.push(
        "| " +
          sentence(rnd).slice(0, 18) +
          " | " +
          (section * 7 + r) +
          " | " +
          WORDS[Math.floor(rnd() * WORDS.length)] +
          " | " +
          (section * 13 + r) +
          " |",
      );
    }
    out.push("");
  }
  const md = out.join("\n");
  if (!md.includes(marker + " 分节 001")) throw new Error("corpus sanity check failed");
  return md;
}

function generateMermaidDocument(count) {
  const out = [
    "# 图表压力测试语料",
    "",
    "以下 " + count + " 张小图覆盖急切渲染管线（2-5 的基线）。",
    "",
  ];
  for (let i = 1; i <= count; i += 1) {
    const id = String(i).padStart(2, "0");
    out.push(
      "",
      "## 图 " + id + " 小节",
      "",
      "句子" + id + "：" + sentence(mulberry32(i * 97 + 13)).slice(0, 60),
      "",
      "```mermaid",
      "graph TD",
      "  A" + id + "[入度校验 " + id + "] --> B" + id + "[增量解析]",
      "  B" + id + " --> C" + id + "{命中缓存?}",
      "  C" + id + " -->|是| D" + id + "[直接贴图]",
      "  C" + id + " -->|否| E" + id + "[重排子图 " + id + "]",
      "  E" + id + " --> D" + id,
      "```",
      "",
    );
  }
  return out.join("\n");
}

function buildCorpus() {
  // NOTE the path names: `doOpenDesktopMarkdownPath` treats any path whose
  // lowercase contains "space" as a flash-note (Space) file and skips the
  // workspace/manifest wiring — the corpus deliberately avoids that substring.
  const vaultRoot = "C:\\KnowPerf\\Vault";
  const chapters = [];
  for (let i = 1; i <= 20; i += 1) {
    const id = String(i).padStart(2, "0");
    const title = "第 " + id + " 章";
    chapters.push({
      id: "perf-ch-" + id,
      title,
      fileName: "chapter-" + id + ".md",
      absolutePath: vaultRoot + "\\chapter-" + id + ".md",
      marker: title,
      markdown: generateDocument(4000 + i, 200 * 1024, title),
    });
  }
  return {
    longDoc: {
      path: "C:\\KnowPerf\\long-document.md",
      fileName: "long-document.md",
      markdown: generateDocument(20260928, 100 * 1024, "长文基准"),
    },
    mermaidDoc: {
      path: "C:\\KnowPerf\\mermaid-document.md",
      fileName: "mermaid-document.md",
      markdown: generateMermaidDocument(30),
    },
    vault: {
      title: "Perf Vault",
      rootPath: vaultRoot,
      chapters,
    },
  };
}

/* ------------------------------------------------------------------ *
 * The mock desktop bridge. Injected via addInitScript BEFORE any app
 * script runs, so the app believes it is inside Electron and drives its
 * real opening/rendering code paths over deterministic in-memory
 * documents. It implements the full window.knowSpaceDesktop /
 * window.bookMDDesktop surface of src/types/desktop.d.ts; everything
 * the benchmark does not exercise is a resolved-Promise no-op.
 * ------------------------------------------------------------------ */
function installMockBridge(payload) {
  const { apiVersion, longDoc, mermaidDoc, vault } = payload;

  const byPath = new Map();
  byPath.set(longDoc.path, longDoc.markdown);
  byPath.set(mermaidDoc.path, mermaidDoc.markdown);
  for (const ch of vault.chapters) byPath.set(ch.absolutePath, ch.markdown);

  const manifest = {
    id: "perf-vault",
    title: vault.title,
    description: "性能基准语料库",
    rootPath: vault.rootPath,
    chapters: vault.chapters.map((c) => ({
      id: c.id,
      title: c.title,
      src: c.fileName,
      absolutePath: c.absolutePath,
    })),
  };

  const sourceFor = (absolutePath) => {
    const markdown = byPath.get(absolutePath);
    if (markdown === undefined) {
      throw new Error("mock bridge: unknown path " + absolutePath);
    }
    return {
      markdown,
      baseUrl: "mem://knowspace-perf/",
      cacheKey: absolutePath,
      diskVersion: { size: markdown.length, mtimeMs: 1700000000000 },
      hasBom: false,
      lineEnding: "\n",
    };
  };

  const done = (value) => () => Promise.resolve(value);
  const unsub = () => () => undefined;
  const hooks = { openFilePath: null, menuCommand: null };

  const api = {
    apiVersion,
    files: {
      openDirectory: async () => ({ canceled: false, directory: manifest }),
      refreshDirectory: async () => manifest,
      readMarkdownFile: async (p) => sourceFor(p),
      readMarkdownBatch: async (ps) => ps.map(sourceFor),
      getDirectoryForFile: async (p) => ({
        directory: manifest,
        activeChapterId: (
          manifest.chapters.find((c) => c.absolutePath === p) || manifest.chapters[0]
        ).id,
      }),
      setScanOptions: done({ ok: true }),
      pickReviewFolder: done({ canceled: true }),
      listReviewFolder: done({}),
      readMindmapSidecar: done({ exists: false }),
      saveMindmapSidecar: done({ success: true }),
      saveMarkdownFile: async (req) => ({
        success: true,
        absolutePath: req.absolutePath,
        baseUrl: "mem://knowspace-perf/",
        diskVersion: { size: req.content.length, mtimeMs: 1700000000001 },
        cacheKey: req.absolutePath,
      }),
      saveMarkdownFileAs: done({ canceled: true }),
      createMarkdownFile: done({ canceled: true }),
      renameMarkdownFile: done({ success: false, error: "mock bridge" }),
      pickOutlineFile: done({ canceled: true }),
    },
    history: {
      listSnapshots: done([]),
      readSnapshot: done(null),
      revertSnapshot: done({ success: false, errorCode: "MOCK", message: "mock bridge" }),
      createManualSnapshot: done({ success: true, snapshotId: "mock" }),
    },
    media: {
      exportSvgAsPng: done({ success: false, canceled: true }),
      savePngData: done({ success: false, canceled: true }),
      savePngBuffer: done({ success: false, canceled: true }),
      readFileAsDataUrl: done({ success: false, message: "mock bridge" }),
      exportCanvasAsPng: done({ success: false, canceled: true }),
      copyCanvasAsImage: done({ success: false }),
      copyPngToClipboard: done({ success: false }),
    },
    system: {
      getInitialSyncData: () => null,
      getLaunchFilePath: done(null),
      setNativeTheme: done(undefined),
      setDocumentState: done(undefined),
      resolveBeforeClose: done(undefined),
      openExternal: done(true),
      toggleFullScreen: done(false),
      isFullScreen: done(false),
      openInNewWindow: done(false),
      printToPdf: done({ success: false, canceled: true }),
      printDocument: done({ success: false, message: "mock bridge" }),
      getAppSettings: done({ autoLaunch: false, runInBackground: false, flashShortcut: "" }),
      setAppSettings: done({
        success: true,
        settings: { autoLaunch: false, runInBackground: false, flashShortcut: "" },
      }),
      onOpenFilePath: (cb) => {
        hooks.openFilePath = cb;
        return unsub();
      },
      onMenuCommand: (cb) => {
        hooks.menuCommand = cb;
        return unsub();
      },
      onBeforeClose: (cb) => unsub(),
      onFullScreenChanged: () => unsub(),
      onThemeUpdated: () => unsub(),
      onAppSettingsUpdated: () => unsub(),
    },
    capture: {
      openFlashCapsule: done(false),
      hideFlashCapsule: done(false),
      getFlashShortcut: done(""),
      setFlashShortcut: done({ success: false, error: "mock bridge" }),
      getFlashTargetPath: done({
        workspaceDir: null,
        targetFile: "perf.md",
        relativeDisplay: "perf.md",
      }),
      saveFlashNote: done({ success: false, error: "mock bridge" }),
      getFlashPin: done({ pinned: false }),
      setFlashPin: done({ success: true, pinned: false }),
      getFlashSpaceConfig: done({
        currentDir: "mem://perf",
        isCustom: false,
        defaultDir: "mem://perf",
      }),
      selectFlashSpaceDir: done({ success: false, canceled: true }),
      resetFlashSpaceDir: done({ success: false, defaultDir: "mem://perf" }),
      getPersistentNote: done({ text: "" }),
      savePersistentNote: done({ success: true }),
      setFlashSize: done({ success: true }),
      resetFlashSize: done({ success: true }),
      getFlashNotesSummary: done({
        success: true,
        spaceDir: "mem://perf",
        notes: [],
        totalTodos: 0,
        completedTodos: 0,
      }),
      toggleFlashTodo: done({ success: false }),
      deleteFlashNote: done({ success: false }),
      savePastedImage: done({ success: false, error: "mock bridge" }),
      onFlashFocus: () => unsub(),
      onFlashShortcutUpdated: () => unsub(),
      onFlashNoteSaved: () => unsub(),
    },
  };

  window.knowSpaceDesktop = api;
  window.bookMDDesktop = api;

  // ---- harness surface (benchmark-only; the real app never reads it) ----
  const perf = { longtasks: [] };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        perf.longtasks.push({ duration: e.duration, startTime: e.startTime });
      }
    }).observe({ type: "longtask", buffered: true });
  } catch (err) {
    /* longtask unsupported → scenarios fail loudly instead */
  }
  const waitForHooks = async (which) => {
    const t0 = performance.now();
    while (!hooks[which]) {
      if (performance.now() - t0 > 20000) {
        throw new Error("app never registered bridge hook " + which);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return hooks[which];
  };
  // The two entry points the harness uses to drive real app flows without
  // fighting the file dialogs: the desktop "open this file path" event and
  // the application menu command (open-directory → commandBus → guarded
  // doOpenMarkdownDirectory).
  perf.openPath = async (p) => (await waitForHooks("openFilePath"))(p);
  perf.menu = async (c) => (await waitForHooks("menuCommand"))(c);
  window.__perf = perf;
}

/* ------------------------------------------------------------------ *
 * Server / page helpers
 * ------------------------------------------------------------------ */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(url, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http
        .get(url, (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else setTimeout(check, 300);
        })
        .on("error", () => {
          if (Date.now() - start > timeoutMs) reject(new Error("preview server start timed out"));
          else setTimeout(check, 300);
        });
    };
    check();
  });
}

function startPreview(preferredPort) {
  const isWin = process.platform === "win32";
  const child = spawn(
    isWin ? "npx.cmd" : "npx",
    ["vite", "preview", "--port", String(preferredPort), "--host", "127.0.0.1", "--strictPort"],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"], shell: isWin, detached: false },
  );
  let out = "";
  child.stdout.on("data", (d) => {
    out += String(d);
  });
  child.stderr.on("data", (d) => {
    out += String(d);
  });
  const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");
  // Vite prints the URL it actually serves under; --strictPort guarantees it is
  // the preferred one (it exits otherwise), but parse it anyway — it is the
  // only honest source of truth for the polling URL.
  const actualPort = new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = setInterval(() => {
      const m = out.replace(ANSI, "").match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) {
        clearInterval(tick);
        resolve(Number(m[1]));
      } else if (child.exitCode !== null || Date.now() - t0 > 45000) {
        clearInterval(tick);
        reject(
          new Error("vite preview did not start. Output:\n" + out.replace(ANSI, "").slice(-2000)),
        );
      }
    }, 250);
  });
  return {
    child,
    actualPort,
    kill() {
      if (isWin) {
        spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        child.kill("SIGTERM");
      }
    },
  };
}

async function newSeededPage(browser, url, corpus, opts = {}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  await context.addInitScript(installMockBridge, {
    apiVersion: pkg.version,
    longDoc: corpus.longDoc,
    mermaidDoc: corpus.mermaidDoc,
    vault: corpus.vault,
  });
  // In-page event timestamps for the mermaid scenario. Needed because a
  // polling/evaluate measurement anchor is born LATE — by the time CDP
  // round-trips land in the page, the first viewportful of diagrams has
  // already rendered and the window collapses to ~0ms (a false PASS that
  // measures the harness, not the app). A MutationObserver installed before
  // any app script records the real interval. Scoped to the mermaid scenario:
  // a subtree observer over the whole document costs milliseconds on the
  // long-doc scenario it does not serve.
  if (opts.instrumentMermaid) {
    await context.addInitScript(() => {
      const marks = { firstPreAt: 0, svgAt: [] };
      window.__perfMermaid = marks;
      const obs = new MutationObserver((records) => {
        for (const r of records) {
          for (const n of r.addedNodes) {
            if (!(n instanceof Element)) continue;
            // "Diagram-bearing content entered the DOM" under whichever DOM
            // shape React used: a subtree insert containing the pre, the
            // article itself, or (the real path) dangerouslySetInnerHTML
            // filling an empty article — where each block, pre.mermaid
            // included, arrives as a DIRECT added node. One selector covers
            // ancestor-and-self: matches() for self, querySelector for under.
            if (!marks.firstPreAt) {
              const hit =
                (n.matches && n.matches("pre.mermaid")) ||
                (n.querySelector && n.querySelector("pre.mermaid"));
              if (hit) marks.firstPreAt = performance.now();
            }
            if (
              n.tagName === "svg" &&
              n.parentElement &&
              n.parentElement.matches &&
              n.parentElement.matches("pre.mermaid")
            ) {
              marks.svgAt.push(performance.now());
            }
          }
        }
      });
      obs.observe(document, { childList: true, subtree: true });
    });
  }
  const page = await context.newPage();
  // Disable the HTTP cache for this page — headless Edge shares one profile
  // across contexts, so without this the warm-up run loads the async mermaid
  // vendor chunk into the disk cache and every measured sample gets a ~0ms
  // "first paint". A cold cache per sample is the honest comparison; a
  // cache-warm number is a false PASS (caught in the first phase-2 capture).
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  page.setDefaultTimeout(90000);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return { context, page };
}

/** Drive the real open-file flow (onOpenFilePath → doOpenDesktopMarkdownPath). */
async function openFileAndWait(page, absPath, marker) {
  await page.evaluate((p) => window.__perf.openPath(p), absPath);
  await page.waitForFunction(
    (m) => {
      const a = document.querySelector("article.markdown-body");
      return Boolean(a) && a.textContent.indexOf(m) !== -1;
    },
    marker,
    { timeout: 60000, polling: 150 },
  );
  await page.waitForTimeout(600); // preview commit + post-commit effects
}

async function openViaMenu(page, command) {
  await page.evaluate((c) => window.__perf.menu(c), command);
}

async function clickIfPresent(page, selector) {
  try {
    await page.click(selector, { timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

/** Durations of every >50ms longtask started at/after `since` (page clock). */
async function longtasksAfter(page, since) {
  return page.evaluate(
    (s) =>
      window.__perf.longtasks
        .filter((e) => e.duration > 50 && e.startTime >= s)
        .map((e) => e.duration),
    since,
  );
}

/* ------------------------------------------------------------------ *
 * Scenarios. Each returns one sample; the runner does warm-up + min-of-3.
 * ------------------------------------------------------------------ */

async function scenarioLongDocDom(browser, url, corpus) {
  const { context, page } = await newSeededPage(browser, url, corpus);
  try {
    await openFileAndWait(page, corpus.longDoc.path, "长文基准 分节 001");
    return await page.evaluate(() => {
      const a = document.querySelector("article.markdown-body");
      return {
        nodes: a.querySelectorAll("*").length,
        blocks: a.querySelectorAll("[data-source-line]").length,
      };
    });
  } finally {
    await context.close();
  }
}

async function scenarioTyping(browser, url, corpus) {
  const { context, page } = await newSeededPage(browser, url, corpus);
  try {
    await openFileAndWait(page, corpus.longDoc.path, "长文基准 分节 001");
    if (!(await clickIfPresent(page, ".view-mode-btn[title^='分屏']"))) {
      throw new Error("split-mode button not found");
    }
    await page.waitForSelector(".cm-content", { timeout: 15000 });
    await page.click(".cm-content");
    const text = "性能基线打字延迟探针 Performance baseline typing probe 0123456789 增量解析".slice(
      0,
      TYPING_CHARS,
    );
    if (text.length !== TYPING_CHARS) throw new Error("typing text length drift");
    const t0 = await page.evaluate(() => performance.now());
    await page.keyboard.type(text, { delay: 20 });
    await page.waitForTimeout(TYPING_SETTLE_MS);
    // Wait until the longtask stream is quiet (the full-document re-render
    // after the 350ms debounce may still be running), so no entry is missed.
    let prev = -1;
    for (let i = 0; i < 16; i += 1) {
      const cur = await page.evaluate(
        (s) => window.__perf.longtasks.filter((e) => e.startTime >= s).length,
        t0,
      );
      if (cur === prev) break;
      prev = cur;
      await page.waitForTimeout(400);
    }
    const durations = await longtasksAfter(page, t0);
    // Anatomy of the longest render in the window: the permanent marks in
    // src/services/markdown.ts clear their own previous entries before each
    // render, so getEntriesByName returns ≤1 measure per segment — and that
    // one entry is the LATEST render, which after the 350ms debounce is
    // exactly the full-document re-render that owns the long task. We still
    // take the MAX over whatever entries exist (defensive: if the clearing
    // strategy ever changes, the metric keeps meaning "longest segment").
    const segments = await page.evaluate(() => {
      const read = (name) => {
        const entries = performance.getEntriesByName(name, "measure");
        return {
          maxMs: entries.length ? Math.max(...entries.map((e) => e.duration)) : 0,
          // count distinguishes "no render happened" (count=0, value 0 is a
          // hole in coverage) from "render costed ~0" (count≥1).
          count: entries.length,
        };
      };
      return {
        parse: read("ks:md-render-parse"),
        sanitize: read("ks:md-render-sanitize"),
        dom: read("ks:md-render-dom"),
      };
    });
    if (segments.parse.count === 0 || segments.sanitize.count === 0 || segments.dom.count === 0) {
      console.warn(
        `[perf] typing: renderMarkdown segments missing (parse=${segments.parse.count} ` +
          `sanitize=${segments.sanitize.count} dom=${segments.dom.count}) — the 0 values mean ` +
          `"no measured render", NOT "no cost" (cached render skips the marks).`,
      );
    }
    return {
      maxMs: durations.length ? Math.max(...durations) : 0,
      count: durations.length,
      parseMaxMs: segments.parse.maxMs,
      sanitizeMaxMs: segments.sanitize.maxMs,
      domMaxMs: segments.dom.maxMs,
    };
  } finally {
    await context.close();
  }
}

/**
 * The measured scroll loop, shared verbatim by the baseline scenario and the
 * --profile-scroll diagnostic lane (identical bytes so a profile describes
 * exactly what the baseline times). Module-level so Playwright serializes it
 * once; see scenarioScroll for the mode/split rationale.
 */
async function scrollPageLoop([frames, step]) {
  const el = document.querySelector(".reader-pane");
  const internal = Boolean(el) && el.scrollHeight > el.clientHeight + 200;
  const target = internal ? el : document.scrollingElement || document.documentElement;
  const isWin = !internal;
  /*
   * The scrollable extent is a LAYOUT-dependent read (scrollHeight/clientHeight
   * force a style+layout flush when the frame dirtied anything - split mode
   * does, every frame). A real user scrolling with the wheel never reads it
   * back, so reading it inside the per-frame loop measured the harness's own
   * flushes, not the app's (same class of distortion as the polling-anchor
   * fix). Read it once, refresh only at wrap; loop-position detection uses
   * scrollTop, which the scroller already stores (no layout needed).
   */
  const readMax = () =>
    isWin
      ? document.documentElement.scrollHeight - window.innerHeight
      : target.scrollHeight - target.clientHeight;
  let max = readMax();
  const deltas = [];
  let last = performance.now();
  let lastPos = -1;
  for (let i = 0; i < frames; i += 1) {
    await new Promise((r) => requestAnimationFrame(() => r()));
    const now = performance.now();
    deltas.push(now - last);
    last = now;
    const pos = isWin ? window.scrollY : target.scrollTop;
    if (pos >= max - 4 || pos === lastPos) {
      if (isWin) window.scrollTo(0, 0);
      else target.scrollTop = 0;
      max = readMax();
    }
    lastPos = pos;
    if (isWin) window.scrollBy(0, step);
    else target.scrollBy(0, step);
  }
  const sorted = deltas.slice(1).sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1)))];
  return {
    p50: pct(0.5),
    p95: pct(0.95),
    drops: deltas.filter((d) => d > 20).length,
    frames: deltas.length,
    deltas,
  };
}

async function scenarioScroll(browser, url, corpus) {
  const { context, page } = await newSeededPage(browser, url, corpus);
  try {
    await openFileAndWait(page, corpus.longDoc.path, "长文基准 分节 001");
    // 分屏，不是阅读：同步滚动的逐帧工作只在 split 下存在，阅读模式下
    // useSyncScroll 本就惰性——用错了模式，2-4 的收益会被口径整体吞掉。
    await clickIfPresent(page, ".view-mode-btn[title='分屏模式（边写边看）']");
    return await page.evaluate(scrollPageLoop, [SCROLL_FRAMES, 420]);
  } finally {
    await context.close();
  }
}

/**
 * --profile-scroll: one warm-up pass, then a CDP-sampled CPU profile of the
 * same loop. Diagnostic lane only (never writes the baseline): answers
 * "where do the dropped frames go" before any optimization is attempted —
 * Guide rule 4: change a hot path only with a measured address.
 */
async function profileScroll(browser, url, corpus) {
  const { context, page } = await newSeededPage(browser, url, corpus);
  try {
    await openFileAndWait(page, corpus.longDoc.path, "长文基准 分节 001");
    await clickIfPresent(page, ".view-mode-btn[title='分屏模式（边写边看）']");
    // Warm-up: JIT-compile the hot path so the profiled pass shows steady
    // state, not first-run compile noise.
    await page.evaluate(scrollPageLoop, [SCROLL_FRAMES, 420]);
    const rewind = async () => {
      await page.evaluate(() => {
        const el = document.querySelector(".reader-pane");
        if (el) el.scrollTop = 0;
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(300);
    };
    // Start the measured passes from the top of the document (the warm-up pass
    // left the scroller at the end). N=3 with min() per measurement discipline
    // (ENGINEERING_GUIDE 4.5): this machine's numbers swing ~50% with thermal
    // state, so a single pass cannot support an A/B. The CPU profile is taken
    // around the LAST pass; the stats are the min of all three.
    let stats = null;
    let profile = null;
    let coldDeltas = null;
    const merge = (s) => {
      stats = stats
        ? {
            p50: Math.min(stats.p50, s.p50),
            p95: Math.min(stats.p95, s.p95),
            drops: Math.min(stats.drops, s.drops),
            frames: s.frames,
          }
        : s;
    };
    for (let pass = 1; pass <= 3; pass += 1) {
      await rewind();
      if (pass === 3) {
        const cdp = await context.newCDPSession(page);
        await cdp.send("Profiler.enable");
        await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
        await cdp.send("Profiler.start");
        const s = await page.evaluate(scrollPageLoop, [SCROLL_FRAMES, 420]);
        profile = (await cdp.send("Profiler.stop")).profile;
        merge(s);
      } else {
        const s = await page.evaluate(scrollPageLoop, [SCROLL_FRAMES, 420]);
        if (pass === 1) coldDeltas = s.deltas; // the COLD pass: height table empty
        merge(s);
      }
    }
    return { stats, profile, coldDeltas };
  } finally {
    await context.close();
  }
}

/** Self time per frame, µs, attributed to the sample that was on-CPU. */
function profileSelfTime(profile) {
  const selfUs = new Map();
  const { samples, timeDeltas } = profile;
  if (!samples || !timeDeltas) return selfUs;
  for (let i = 1; i < samples.length; i += 1) {
    const dt = timeDeltas[i] || 0;
    if (dt <= 0) continue;
    const id = samples[i - 1];
    selfUs.set(id, (selfUs.get(id) || 0) + dt);
  }
  return selfUs;
}

/** Inclusive (ancestor-walk) time per node, µs, over the whole profile. */
function profileTotalTime(profile) {
  const parentOf = new Map();
  for (const n of profile.nodes) {
    for (const c of n.children || []) parentOf.set(c, n.id);
  }
  const totalUs = new Map();
  const { samples, timeDeltas } = profile;
  if (!samples || !timeDeltas) return totalUs;
  for (let i = 1; i < samples.length; i += 1) {
    const dt = timeDeltas[i] || 0;
    if (dt <= 0) continue;
    let id = samples[i - 1];
    const seen = new Set();
    while (id !== undefined && !seen.has(id)) {
      seen.add(id);
      totalUs.set(id, (totalUs.get(id) || 0) + dt);
      id = parentOf.get(id);
    }
  }
  return totalUs;
}

function fmtFrame(cf) {
  const name = cf.functionName || "(native/anonymous)";
  const url = (cf.url || "").replace(/^.*\/(dist\/assets|src|node_modules)\//, "$1/");
  return `${name} @ ${url}:${cf.lineNumber ?? "?"}`;
}

/**
 * Print the profile: bucket totals (idle/GC/native vs app vs vendor), top
 * self-time frames, and inclusive time for the reader's own controller
 * functions (those are what an optimization changes).
 */
function printProfile(profile, outDir) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n.callFrame || {}]));
  const selfUs = profileSelfTime(profile);
  const totalUs = profileTotalTime(profile);
  const grandUs = [...selfUs.values()].reduce((a, b) => a + b, 0);

  const bucketOf = (cf) => {
    const name = cf.functionName || "";
    if (name === "(idle)" || name === "(root)") return "idle";
    if (name === "(garbage collector)") return "gc";
    if (!cf.url) return "native/anonymous";
    if (/dist\/assets/.test(cf.url)) return "app bundle";
    if (/node_modules/.test(cf.url)) {
      return /codemirror|@lezer/.test(cf.url) ? "codemirror" : "vendor";
    }
    return "other";
  };
  const buckets = new Map();
  for (const [id, us] of selfUs) {
    const b = bucketOf(byId.get(id) || {});
    buckets.set(b, (buckets.get(b) || 0) + us);
  }
  console.log(`\n[profile] total ${(grandUs / 1000).toFixed(1)} ms sampled`);
  for (const [b, us] of [...buckets.entries()].sort((a, b2) => b2[1] - a[1])) {
    console.log(
      `  ${b.padEnd(18)} ${(us / 1000).toFixed(1).padStart(8)} ms  ${((100 * us) / grandUs).toFixed(1)}%`,
    );
  }

  const rank = (map, filter) =>
    [...map.entries()]
      .filter(([id]) => !filter || filter(byId.get(id) || {}))
      .map(([id, us]) => ({ us, label: fmtFrame(byId.get(id) || {}) }))
      .sort((a, b) => b.us - a.us)
      .slice(0, 24)
      .filter((r) => r.us > 1000);

  console.log("\n[profile] top self time:");
  for (const r of rank(selfUs))
    console.log(`  ${(r.us / 1000).toFixed(1).padStart(8)} ms  ${r.label}`);
  console.log("\n[profile] top inclusive time (app bundle only):");
  for (const r of rank(totalUs, (cf) => /dist\/assets/.test(cf.url || ""))) {
    console.log(`  ${(r.us / 1000).toFixed(1).padStart(8)} ms  ${r.label}`);
  }

  if (outDir) {
    const file = path.join(outDir, "scroll-profile.cpuprofile");
    fs.writeFileSync(file, JSON.stringify(profile));
    console.log(`\n[profile] raw profile written to ${file} (open in DevTools > Performance)`);
  }
}

/**
 * --profile-mermaid: one mermaid scenario pass that reports the SVG timestamp
 * DISTRIBUTION instead of a single first-paint number — pre→svg0 is the first
 * diagram (which carries any module/API warm-up), the deltas are the marginal
 * cost per diagram, and the longtask offsets say which part blocks the
 * thread. Diagnostic lane only; answers "what is the 178ms made of" before
 * any optimization is attempted (rule 4).
 */
async function profileMermaid(browser, url, corpus) {
  const { context, page } = await newSeededPage(browser, url, corpus, {
    instrumentMermaid: true,
  });
  try {
    // 模拟真实浏览节奏：从应用启动到打开一篇含图文档，用户至少要看一眼
    // 界面。秒开会让 idle 预热与首图竞争（ensureWarm 串行化保证不更差，
    // 但也测不出收益）。
    await page.waitForTimeout(1300);
    await openFileAndWait(page, corpus.mermaidDoc.path, "图 01 小节");
    return await page.evaluate(
      async ([margin]) => {
        const wait = async (pred, timeoutMs, label) => {
          const start = performance.now();
          while (!pred()) {
            if (performance.now() - start > timeoutMs) throw new Error("timeout: " + label);
            await new Promise((r) => setTimeout(r, 16));
          }
        };
        await wait(
          () => window.__perfMermaid && window.__perfMermaid.firstPreAt > 0,
          30000,
          "injected marks",
        );
        const viewportCount = Array.from(document.querySelectorAll("article pre.mermaid")).filter(
          (el) => {
            const r = el.getBoundingClientRect();
            return r.top < window.innerHeight + margin && r.bottom > -margin;
          },
        ).length;
        await wait(
          () => window.__perfMermaid.svgAt.length >= viewportCount,
          30000,
          "viewport mermaid svgs",
        );
        const marks = window.__perfMermaid;
        await new Promise((r) => setTimeout(r, 1200)); // let trailing longtasks land
        const lts = window.__perf.longtasks.filter(
          (e) =>
            e.startTime >= marks.firstPreAt - 5 && e.startTime <= marks.svgAt[viewportCount - 1],
        );
        return {
          firstPreAt: marks.firstPreAt,
          svgAt: marks.svgAt.slice(0, viewportCount),
          viewportCount,
          longtasks: lts.map((e) => ({
            startMs: Math.round(e.startTime - marks.firstPreAt),
            durMs: Math.round(e.duration),
          })),
        };
      },
      [MERMAID_VIEWPORT_MARGIN_PX],
    );
  } finally {
    await context.close();
  }
}

async function scenarioMermaid(browser, url, corpus) {
  trace("mermaid: newSeededPage");
  const { context, page } = await newSeededPage(browser, url, corpus, {
    instrumentMermaid: true,
  });
  try {
    trace("mermaid: openFileAndWait");
    // 模拟真实浏览节奏（2026-09-30 口径修订）：从启动到打开含图文档，用户
    // 至少浏览片刻。这个停顿同时是 idle 预热生效的前提——预热在启动空闲窗
    // 口完成一次性的 API 初始化（首图 421ms → ~120ms），秒开会让预热与首图
    // 竞争（ensureWarm 串行化保证不更差，但也测不出收益）。
    await page.waitForTimeout(1300);
    await openFileAndWait(page, corpus.mermaidDoc.path, "图 01 小节");
    trace("mermaid: measuring");
    return await withDeadline(
      () =>
        page.evaluate(
          async ([total, margin]) => {
            const wait = async (pred, timeoutMs, label) => {
              const start = performance.now();
              while (!pred()) {
                if (performance.now() - start > timeoutMs) throw new Error("timeout: " + label);
                await new Promise((r) => setTimeout(r, 16));
              }
            };
            // Timing comes from the injected MutationObserver's event
            // timestamps, not from this evaluate's clock: a polling anchor is
            // born late — by the time CDP lands, the first viewportful has
            // often already rendered, and the window collapses to ~0ms.
            await wait(
              () => window.__perfMermaid && window.__perfMermaid.firstPreAt > 0,
              30000,
              "injected marks",
            );
            // 视口（±rootMargin，与池的边距同源）内几张图，首屏完成线就是
            // 第 N 张 svg 的时间戳。
            // 第 N 张 svg 的时间戳。
            const viewportCount = Array.from(
              document.querySelectorAll("article pre.mermaid"),
            ).filter((el) => {
              const r = el.getBoundingClientRect();
              return r.top < window.innerHeight + margin && r.bottom > -margin;
            }).length;
            await wait(
              () => window.__perfMermaid.svgAt.length >= viewportCount,
              30000,
              "viewport mermaid svgs",
            );
            const marks = window.__perfMermaid;
            const paintMs = marks.svgAt[viewportCount - 1] - marks.firstPreAt;
            // 打印完整性：beforeprint 把离屏图全部同步画完的代价——用户
            // 按下打印那刻的真实成本，也是「懒不漏图」的机器证明。
            const flushStart = performance.now();
            window.dispatchEvent(new Event("beforeprint"));
            await wait(
              () => document.querySelectorAll("article pre.mermaid svg").length >= total,
              90000,
              "all mermaid svgs after print flush",
            );
            const flushMs = performance.now() - flushStart;
            await new Promise((r) => setTimeout(r, 1500)); // let trailing longtasks land
            const t0 = marks.firstPreAt;
            const t1 = marks.svgAt[Math.max(0, viewportCount - 1)];
            const lts = window.__perf.longtasks.filter(
              (e) => e.duration > 50 && e.startTime >= t0 - 5 && e.startTime <= t1,
            );
            return {
              paintMs,
              flushMs,
              viewportCount,
              longtaskCount: lts.length,
              longtaskSumMs: lts.reduce((s, e) => s + e.duration, 0),
            };
          },
          [30, MERMAID_VIEWPORT_MARGIN_PX],
        ),
      180000,
      "mermaid measure",
    );
  } finally {
    await context.close();
  }
}

async function scenarioTabs(browser, url, corpus) {
  const { context, page } = await newSeededPage(browser, url, corpus);
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    const heapMB = async () => {
      await cdp.send("HeapProfiler.collectGarbage");
      const { metrics } = await cdp.send("Performance.getMetrics");
      const m = metrics.find((x) => x.name === "JSHeapUsedSize");
      if (!m) throw new Error("JSHeapUsedSize metric missing");
      return m.value / (1024 * 1024);
    };

    // 1. Open the 20-chapter vault through the guarded directory flow:
    //    menu("open-directory") → commandBus → doOpenMarkdownDirectory →
    //    files.openDirectory (mock manifest) → first chapter renders.
    await openViaMenu(page, "open-directory");
    await page.waitForFunction(
      () => {
        const a = document.querySelector("article.markdown-body");
        return Boolean(a) && a.textContent.indexOf("第 01 章") !== -1;
      },
      null,
      { timeout: 60000, polling: 150 },
    );
    await page.waitForTimeout(800);
    const heap1 = await heapMB();

    // 2. Open the remaining 19 chapters through the same real flow the
    //    desktop shell uses (onOpenFilePath); each opens a tab, so after
    //    this pass tabs = [01..20] and the active tab is 20.
    for (let i = 2; i <= 20; i += 1) {
      const ch = corpus.vault.chapters[i - 1];
      await openFileAndWait(page, ch.absolutePath, ch.marker + " 分节 001");
    }
    await page.waitForTimeout(800);
    const heap20 = await heapMB();

    // 3. Round-robin: Ctrl+Tab cycles tabs in array order, so 20 presses
    //    starting from tab 20 cover each of the 20 exactly once.
    await page.evaluate(() => document.body.focus());
    const t0 = await page.evaluate(() => performance.now());
    let switchTotal = 0;
    for (let k = 0; k < 20; k += 1) {
      const ch = corpus.vault.chapters[k]; // press #1 → tab index 0
      const s0 = await page.evaluate(() => performance.now());
      await page.keyboard.press("Control+Tab");
      await page.waitForFunction(
        (m) => {
          const a = document.querySelector("article.markdown-body");
          return Boolean(a) && a.textContent.indexOf(m) !== -1;
        },
        ch.marker + " 分节 001",
        { timeout: 60000, polling: 150 },
      );
      const s1 = await page.evaluate(() => performance.now());
      switchTotal += s1 - s0;
    }
    await page.waitForTimeout(1500); // settle the final render's longtasks
    const t1 = await page.evaluate(() => performance.now());
    const lts = await page.evaluate(
      ([s, e]) =>
        window.__perf.longtasks
          .filter((x) => x.duration > 50 && x.startTime >= s && x.startTime <= e)
          .map((x) => x.duration),
      [t0, t1 + 1500],
    );
    const heapCycle = await heapMB();

    return {
      perTabDeltaMB: (heap20 - heap1) / 19,
      heapCycleMB: heapCycle,
      maxSwitchLongtaskMs: lts.length ? Math.max(...lts) : 0,
      avgSwitchMs: switchTotal / 20,
    };
  } finally {
    await context.close();
  }
}

/* ------------------------------------------------------------------ *
 * Runner: warm-up + min-of-3 per scenario; exact counts run once.
 * ------------------------------------------------------------------ */
async function sample(fn, label) {
  const results = [];
  console.log(`[perf] ${label}: warm-up ...`);
  await fn(); // guide 4.5 warm-up, discarded
  for (let i = 0; i < SAMPLES; i += 1) {
    console.log(`[perf] ${label}: sample ${i + 1}/${SAMPLES} ...`);
    results.push(await fn());
  }
  return results;
}

const pickMin = (list, get) => Math.min(...list.map(get));

async function runAll(browser, url, corpus) {
  const values = {};

  const dom = await (async () => {
    console.log("[perf] scenario long-doc DOM (exact counts, single run) ...");
    return scenarioLongDocDom(browser, url, corpus);
  })();
  values.longdoc_dom_nodes = dom.nodes;
  values.longdoc_blocks = dom.blocks;

  const typing = await sample(() => scenarioTyping(browser, url, corpus), "typing latency");
  values.typing_max_longtask_ms = pickMin(typing, (r) => r.maxMs);
  values.typing_longtask_count = pickMin(typing, (r) => r.count);
  values.typing_parse_max_ms = pickMin(typing, (r) => r.parseMaxMs);
  values.typing_sanitize_max_ms = pickMin(typing, (r) => r.sanitizeMaxMs);
  values.typing_dom_max_ms = pickMin(typing, (r) => r.domMaxMs);

  const scroll = await sample(() => scenarioScroll(browser, url, corpus), "scroll frames");
  values.scroll_p50_frame_ms = pickMin(scroll, (r) => r.p50);
  values.scroll_p95_frame_ms = pickMin(scroll, (r) => r.p95);
  values.scroll_dropped_frames = pickMin(scroll, (r) => r.drops);

  const mermaid = await sample(() => scenarioMermaid(browser, url, corpus), "mermaid first paint");
  values.mermaid_firstpaint_ms = pickMin(mermaid, (r) => r.paintMs);
  values.mermaid_flush_ms = pickMin(mermaid, (r) => r.flushMs);
  values.mermaid_longtask_sum_ms = pickMin(mermaid, (r) => r.longtaskSumMs);

  const tabs = await sample(() => scenarioTabs(browser, url, corpus), "20-tab switch");
  values.tab_per_tab_heap_delta_mb = pickMin(tabs, (r) => r.perTabDeltaMB);
  values.tab_heap_after_cycle_mb = pickMin(tabs, (r) => r.heapCycleMB);
  values.tab_switch_max_longtask_ms = pickMin(tabs, (r) => r.maxSwitchLongtaskMs);
  values.tab_switch_avg_ms = pickMin(tabs, (r) => r.avgSwitchMs);

  return values;
}

/* ------------------------------------------------------------------ *
 * Snapshot document
 * ------------------------------------------------------------------ */
function fmt(metric, value) {
  if (metric.digits === 0) return String(Math.round(value));
  return value.toFixed(metric.digits);
}

function envBlock() {
  const pw = JSON.parse(
    fs.readFileSync(path.join(root, "node_modules", "playwright", "package.json"), "utf8"),
  );
  const cpus = os.cpus();
  return {
    playwright: pw.version,
    channel: "msedge (Chromium, headless)",
    viewport: "1440×900 @ dpr 1",
    cpu: `${cpus[0] ? cpus[0].model.trim() : "unknown"} · ${cpus.length} 核`,
    memory: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB`,
    platform: `${os.type()} ${os.release()}`,
  };
}

function writeDoc(values) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const env = envBlock();
  const now = new Date().toISOString();

  const rows = [];
  let scenarioLabel = "";
  for (const m of METRICS) {
    const v = values[m.key];
    if (v === undefined || v === null || Number.isNaN(v)) {
      throw new Error(`metric ${m.key} did not produce a number (${String(v)})`);
    }
    if (m.scenario !== scenarioLabel) {
      scenarioLabel = m.scenario;
      rows.push(`| _${m.scenario}_ |  |  |  |`);
    }
    let verdict = "";
    if (m.pass) verdict = m.pass(v) ? "✅ 达标" : "❌ **未达标**";
    rows.push(`| ${m.name} | **${fmt(m, v)} ${m.unit}** | ${m.budget} | ${verdict} — ${m.desc} |`);
  }

  const tabNote =
    values.tab_per_tab_heap_delta_mb < 5
      ? "> 注：单标签 JS 堆增量已低于 5MB 预算 —— 计划 §6.3 中「单标签 ~18MB（历史）」的假设在本机基线上不成立，" +
        "2-3「Tab 冷冻与注水」的收益应改按 **DOM 节点规模**（本表第 1 行）而非纯内存重新论证；" +
        "本表将随每次改动重跑持续验证这一判断。"
      : "> 注：单标签增量超过 5MB 预算，印证 2-3「Tab 冷冻与注水」的必要性；本表是其收益的唯一分母。";

  const lines = [
    "# KnowSpace · 性能基线快照",
    "",
    "> **文档性质**：阶段 2「性能与资源重构」的权威性能口径（计划 §6.3 能力建设交付物）",
    `> **生成时间**：${now}`,
    `> **应用版本**：\`${pkg.version}\``,
    "> **生成方式**：`node scripts/capture-perf-baseline.cjs`（自动生成，**禁止手工编辑**）",
    "",
    "---",
    "",
    "## 一、测量环境（本机即参考机）",
    "",
    "| 项目 | 值 |",
    "| :--- | :--- |",
    `| Playwright | ${env.playwright} |`,
    `| 浏览器 | ${env.channel} |`,
    `| 视口 | ${env.viewport} |`,
    `| CPU | ${env.cpu} |`,
    `| 内存 | ${env.memory} |`,
    `| 系统 | ${env.platform} |`,
    "",
    "> ⚠️ **诚实免责声明**：所有数字都是**机器相对**的——换一台机器（CPU/显卡/电源策略不同）数值会整体漂移，",
    "> 因此跨机器对比无效；**本机是基线的参考机**。夜间/复核任务应在同一台机器上运行，",
    "> 只比较与本文档基线值的相对变化（`--check` 的容差即为此设计）。",
    "",
    "**测量纪律**（`ENGINEERING_GUIDE.md` 4.5）：每个场景预热 1 次后取 **N=3 的最优值**；",
    "墙钟数字在页面内用 `performance.now()` / `requestAnimationFrame` 时间戳测量（非 CDP 往返），",
    '>50ms 的主线程占用一律来自 `PerformanceObserver("longtask")`，不采用抽样猜测。',
    "语料由脚本内固定种子生成器产出，逐字节可复现（10 万字长文 / 30 张 Mermaid / 20×200KB 标签库）。",
    "",
    "---",
    "",
    "## 二、指标基线表",
    "",
    "| 指标 | 基线值 | 预算（计划 §6.3） | 说明 |",
    "| :--- | ---: | :--- | :--- |",
    ...rows,
    "",
    tabNote,
    "",
    "---",
    "",
    "## 三、怎么跑",
    "",
    "```bash",
    "npm run build          # 先构建 dist/（本脚本不负责构建）",
    "npm run perf:baseline       # 重新捕获并覆盖本文件",
    "npm run perf:baseline:check # 复跑并对照本文件做回归判定",
    "```",
    "",
    "- `--check` **不做字节相等断言**（性能数字做不到稳定）：计时类指标以 `基线 × 1.5` 为上限，",
    "  基线 <20 的指标改用 `基线 + 25` 的绝对余量；确定性计数（DOM 节点/块数）要求**完全相等**。",
    "  任一指标越界 → 退出码 1。",
    "- 本 harness **故意不进 PR 门禁 / preflight**：它启动真实浏览器、耗时分钟级，按计划 §6.3 的安排",
    "  属于**夜间任务**（nightly）车道；PR 门禁留给秒级的 vitest 与质量棘轮。",
    "- 基线刷新：完成任何一项 2-x 工作后重跑 `npm run perf:baseline` 并提交本文件，让表格成为",
    "  「改动前后各一条可重复基准」的载体。",
    "",
    "---",
    "",
    "<!-- perf-baseline:metrics",
    JSON.stringify({ schema: 1, generatedAt: now, version: pkg.version, metrics: values }, null, 2),
    "end perf-baseline:metrics -->",
    "",
  ];

  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, lines.join("\n"), "utf8");
}

/* ------------------------------------------------------------------ *
 * --check
 * ------------------------------------------------------------------ */
function readCommitted() {
  if (!fs.existsSync(docPath)) {
    console.error("[perf] docs/PERF_BASELINE.md not found — run the capture first.");
    process.exit(1);
  }
  const doc = fs.readFileSync(docPath, "utf8");
  const m = doc.match(/<!-- perf-baseline:metrics\n([\s\S]*?)\nend perf-baseline:metrics -->/);
  if (!m) {
    console.error("[perf] metrics JSON block missing from docs/PERF_BASELINE.md — regenerate it.");
    process.exit(1);
  }
  return JSON.parse(m[1]).metrics;
}

function checkAgainst(committed, fresh) {
  const problems = [];
  for (const metric of METRICS) {
    const c = committed[metric.key];
    const f = fresh[metric.key];
    if (typeof c !== "number" || typeof f !== "number") {
      problems.push(`${metric.key}: committed=${c} fresh=${f} (non-numeric)`);
      continue;
    }
    if (metric.kind === "exact") {
      if (f !== c) problems.push(`${metric.key}: exact count changed ${c} -> ${f}`);
      continue;
    }
    const limit = c < 20 ? c + 25 : c * 1.5;
    if (f > limit) {
      problems.push(`${metric.key}: ${f.toFixed(1)} > tolerance ${limit.toFixed(1)} (基线 ${c})`);
    }
  }
  if (problems.length) {
    console.error(
      "[perf] REGRESSION against committed PERF_BASELINE.md (tolerance = committed×1.5, " +
        "or committed+25 below 20; exact counts must match):\n  - " +
        problems.join("\n  - ") +
        "\nIf this is an intended refresh, re-capture: node scripts/capture-perf-baseline.cjs",
    );
    process.exit(1);
  }
  console.log("[perf] check OK: every metric within committed tolerance, exact counts stable.");
}

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */
async function main() {
  const checkOnly = process.argv.includes("--check");

  if (!fs.existsSync(distIndex)) {
    console.error(
      "[perf] dist/ not found. This harness measures the production build and does NOT\n" +
        "       build it itself. Run first:  npm run build",
    );
    process.exit(1);
  }

  const corpus = buildCorpus();
  const longChars = corpus.longDoc.markdown.length;
  if (longChars < 100000) throw new Error(`long doc corpus too small: ${longChars}`);

  const port = await freePort();
  const server = startPreview(port);
  let browser;
  try {
    const realPort = await server.actualPort;
    const url = `http://127.0.0.1:${realPort}/`;
    await waitForServer(url, 60000);
    console.log(`[perf] preview server up at ${url}`);
    browser = await chromium.launch({ channel: "msedge", headless: true });
    if (process.argv.includes("--profile-scroll")) {
      const result = await profileScroll(browser, url, corpus);
      console.log(
        `[profile] scroll loop (min of 3): p50=${result.stats.p50.toFixed(1)}ms p95=${result.stats.p95.toFixed(1)}ms drops=${result.stats.drops}/${result.stats.frames}`,
      );
      // 冷启动慢帧分布：高度表为空的首轮（pass 1）里，>20ms 的帧号与间隔——
      // 若慢帧集中在开头（修正期），高度表持久化才有收益可言。
      if (result.coldDeltas) {
        const slow = result.coldDeltas.map((d, i) => ({ i: i + 1, d })).filter((f) => f.d > 20);
        console.log(
          `[profile] cold pass: frames>20ms = ${slow.length}/${result.coldDeltas.length}`,
        );
        console.log(
          `[profile] cold slow frames (index:ms): ${slow
            .slice(0, 40)
            .map((f) => `${f.i}:${f.d.toFixed(0)}`)
            .join(", ")}`,
        );
        const head = result.coldDeltas.slice(0, 30);
        const tail = result.coldDeltas.slice(30);
        const avg = (arr) => (arr.length ? arr.reduce((s, d) => s + d, 0) / arr.length : 0);
        console.log(
          `[profile] cold head(1-30) avg ${avg(head).toFixed(1)}ms vs tail(31+) avg ${avg(tail).toFixed(1)}ms`,
        );
      }
      printProfile(result.profile, os.tmpdir());
      return;
    }
    if (process.argv.includes("--profile-mermaid")) {
      const m = await profileMermaid(browser, url, corpus);
      console.log(
        `[profile] mermaid: viewport diagrams=${m.viewportCount}, pre→svg0=${(m.svgAt[0] - m.firstPreAt).toFixed(1)}ms`,
      );
      let prev = m.svgAt[0];
      const gaps = m.svgAt.slice(1).map((t) => {
        const d = t - prev;
        prev = t;
        return d;
      });
      console.log(`[profile] marginal per-diagram ms: ${gaps.map((g) => g.toFixed(0)).join(", ")}`);
      for (const lt of m.longtasks) {
        console.log(`[profile] longtask +${lt.startMs}ms dur=${lt.durMs}ms`);
      }
      return;
    }
    const values = await runAll(browser, url, corpus);

    for (const m of METRICS) {
      const v = values[m.key];
      const verdict = m.pass ? (m.pass(v) ? "PASS" : "FAIL") : "info";
      console.log(
        `[perf] ${m.key.padEnd(30)} = ${fmt(m, v).padStart(8)} ${m.unit.padEnd(2)} [${verdict}]`,
      );
    }

    if (checkOnly) {
      checkAgainst(readCommitted(), values);
    } else {
      writeDoc(values);
      console.log(`[perf] snapshot written to ${path.relative(root, docPath)}`);
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill();
  }
}

main().catch((err) => {
  console.error("[perf] FAILED:", err);
  process.exit(1);
});
