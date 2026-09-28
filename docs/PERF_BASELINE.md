# KnowSpace · 性能基线快照

> **文档性质**：阶段 2「性能与资源重构」的权威性能口径（计划 §6.3 能力建设交付物）
> **生成时间**：2026-09-28T12:19:50.826Z
> **应用版本**：`2.7.0`
> **生成方式**：`node scripts/capture-perf-baseline.cjs`（自动生成，**禁止手工编辑**）

---

## 一、测量环境（本机即参考机）

| 项目 | 值 |
| :--- | :--- |
| Playwright | 1.63.0 |
| 浏览器 | msedge (Chromium, headless) |
| 视口 | 1440×900 @ dpr 1 |
| CPU | 11th Gen Intel(R) Core(TM) i7-1165G7 @ 2.80GHz · 8 核 |
| 内存 | 15.8 GB |
| 系统 | Windows_NT 10.0.26200 |

> ⚠️ **诚实免责声明**：所有数字都是**机器相对**的——换一台机器（CPU/显卡/电源策略不同）数值会整体漂移，
> 因此跨机器对比无效；**本机是基线的参考机**。夜间/复核任务应在同一台机器上运行，
> 只比较与本文档基线值的相对变化（`--check` 的容差即为此设计）。

**测量纪律**（`ENGINEERING_GUIDE.md` 4.5）：每个场景预热 1 次后取 **N=3 的最优值**；
墙钟数字在页面内用 `performance.now()` / `requestAnimationFrame` 时间戳测量（非 CDP 往返），
>50ms 的主线程占用一律来自 `PerformanceObserver("longtask")`，不采用抽样猜测。
语料由脚本内固定种子生成器产出，逐字节可复现（10 万字长文 / 30 张 Mermaid / 20×200KB 标签库）。

---

## 二、指标基线表

| 指标 | 基线值 | 预算（计划 §6.3） | 说明 |
| :--- | ---: | :--- | :--- |
| _长文 DOM (2-2)_ |  |  |  |
| 10 万字文档 article 内 DOM 节点数 | **6842 个** | < 200（§6.3 验收：DOM 虚拟化） | ❌ **未达标** — 语料 A（10 万字）打开后 <article> 子树的全部后代元素数。未虚拟化的现状基线。 |
| 10 万字文档顶层块数（[data-source-line]） | **2282 块** | —（口径项） |  — 渲染器为顶层块标注 data-source-line 的元素数，即虚拟化的目标颗粒度。 |
| _打字延迟 (2-1/2-2)_ |  |  |  |
| 长文打字 · 最长单次主线程长任务 | **169.0 ms** | ≤ 50（§6.3 <16ms 的长任务口径：单次长任务预算记 50ms） | ❌ **未达标** — CodeMirror 中连续输入 60 字符（20ms/键）+ 350ms 防抖后的整篇预览重渲染，取按键窗口至落定的最长一条 >50ms longtask。 |
| 长文打字 · >50ms 长任务次数 | **2 次** | = 0（口径：无 >50ms 长任务） | ❌ **未达标** — 同窗口内 >50ms 的 longtask 条数。当前防抖后整篇重渲染，>0 即为计划 2-1（增量块解析）要消灭的对象。 |
| 最长渲染 · markdown-it 解析段 | **25.5 ms** | —（口径项） |  — 打字落定窗口内最长一次 renderMarkdown 的 ks:md-render-parse 测量值（markdown.render 同步段）。permanent marks 见 src/services/markdown.ts：每次渲染先清同名旧条目，读到的即窗口内最后一次（=落定重渲染、长任务本体）的解剖。0 与「没有成本」的区分看 counts 行。jsdom bench 说解析占比极小，这里是 Chromium 的绝对值复核。 |
| 最长渲染 · DOMPurify 净化段 | **66.4 ms** | —（口径项） |  — 同一次渲染的 ks:md-render-sanitize 段（RETURN_DOM_FRAGMENT 净化，主线程固有）。jsdom 口径下净化占 83%，但 jsdom 的 DOMPurify 是纯 JS——Chromium 原生 DOM 上这个比例是否成立，决定块级净化缓存这刀该不该下。 |
| 最长渲染 · DOM 后处理段 | **6.5 ms** | —（口径项） |  — 同一次渲染的 ks:md-render-dom 段（addHeadingIds → template.innerHTML，含 URL 重写/图片优化/纯文本提取；sha256 的 await 在测量段外）。三段之和与 typing_max_longtask_ms 的差即 React 提交/样式/Layout 等管线外成本。 |
| _滚动帧时 (2-4)_ |  |  |  |
| 长文滚动 · 帧间隔 p50 | **16.4 ms** | ≤ 16.7（恒定 60FPS） | ✅ 达标 — 分屏模式下 rAF 循环逐帧 scrollBy(420px) 共 120 帧，rAF 时间戳差的分位数（in-page performance.now，非 CDP 往返）。分屏是同步滚动工作唯一存在的模式——阅读模式下 useSyncScroll 本就惰性，量它等于没量。 |
| 长文滚动 · 帧间隔 p95 | **29.5 ms** | ≤ 16.7（恒定 60FPS） | ❌ **未达标** — 2-4（滚动读写分离）的目标指标：p95 而非均值，尾部掉帧才是用户感知。 |
| 长文滚动 · 掉帧数（帧间隔 >20ms） | **13 帧** | = 0（120 帧内） | ❌ **未达标** — 滚动窗口 120 帧中帧间隔 >20ms 的帧数。 |
| _图表批量 (2-5)_ |  |  |  |
| 视口内 Mermaid 图 · 首屏完成时长 | **241.0 ms** | < 80（§6.3 图表/公式批量；验收线 <50） | ❌ **未达标** — 语料 B（30 图）：article 带着 pre.mermaid 进入 DOM → 视口 ±300px 内全部图渲染出 <svg>。两端时间戳由注入页面的 MutationObserver 记录（轮询锚点出生即晚，量出来是 harness 不是应用）。惰性池语义下的首屏感知口径；急切全量版的「第 30 张完成」口径见 v2.7.0 基线历史。 |
| beforeprint flush · 全部 30 图完成 | **739.5 ms** | —（口径项：打印/导出的完整性成本，允许慢于首屏，必须完整） |  — dispatch beforeprint 后 30/30 张 svg 全部出现的时长。它同时是「懒加载不会吞掉任何一张图」的机器证明。 |
| 30 张 Mermaid 图 · 窗口内长任务总时长 | **60.0 ms** | —（口径项） |  — 同一窗口内 >50ms longtask 的 duration 之和，衡量主线程被图表渲染占用的总时间。 |
| _多标签内存 (2-3)_ |  |  |  |
| 20 标签 · 单标签 JS 堆增量 | **1.77 MB** | < 5（目标；冷冻态 <0.2） | ✅ 达标 — 打开第 1 篇与第 20 篇之间 GC 后的 JS 堆差 ÷ 19。若已低于预算，计划 2-3 的「~18MB/标签」历史假设在本机基线上不成立。 |
| 20 标签 · 轮切一轮后 JS 堆 | **83.08 MB** | —（20 标签总内存较 v2.7 下降 ≥50% 的起算基线） |  — Ctrl+Tab 轮切 20 次并落定、强制 GC 后的 usedJSHeapSize。后续 2-3 落地后以此值为分母验证「下降 ≥50%」。 |
| 20 标签 · 单次切换最长长任务 | **484.0 ms** | ≤ 50（长任务口径） | ❌ **未达标** — 轮切窗口内最长的一条 >50ms longtask（每次切换都触发整篇 ~200KB 重渲染）。 |
| 20 标签 · 单次切换平均耗时 | **580.4 ms** | —（2-3 验收线：冷冻恢复 <100ms 的对照） |  — 每次 Ctrl+Tab 从按键到新文档内容挂载完成的等待均值。 |

> 注：单标签 JS 堆增量已低于 5MB 预算 —— 计划 §6.3 中「单标签 ~18MB（历史）」的假设在本机基线上不成立，2-3「Tab 冷冻与注水」的收益应改按 **DOM 节点规模**（本表第 1 行）而非纯内存重新论证；本表将随每次改动重跑持续验证这一判断。

---

## 三、怎么跑

```bash
npm run build          # 先构建 dist/（本脚本不负责构建）
npm run perf:baseline       # 重新捕获并覆盖本文件
npm run perf:baseline:check # 复跑并对照本文件做回归判定
```

- `--check` **不做字节相等断言**（性能数字做不到稳定）：计时类指标以 `基线 × 1.5` 为上限，
  基线 <20 的指标改用 `基线 + 25` 的绝对余量；确定性计数（DOM 节点/块数）要求**完全相等**。
  任一指标越界 → 退出码 1。
- 本 harness **故意不进 PR 门禁 / preflight**：它启动真实浏览器、耗时分钟级，按计划 §6.3 的安排
  属于**夜间任务**（nightly）车道；PR 门禁留给秒级的 vitest 与质量棘轮。
- 基线刷新：完成任何一项 2-x 工作后重跑 `npm run perf:baseline` 并提交本文件，让表格成为
  「改动前后各一条可重复基准」的载体。

---

<!-- perf-baseline:metrics
{
  "schema": 1,
  "generatedAt": "2026-09-28T12:19:50.826Z",
  "version": "2.7.0",
  "metrics": {
    "longdoc_dom_nodes": 6842,
    "longdoc_blocks": 2282,
    "typing_max_longtask_ms": 169,
    "typing_longtask_count": 2,
    "typing_parse_max_ms": 25.5,
    "typing_sanitize_max_ms": 66.39999999850988,
    "typing_dom_max_ms": 6.5,
    "scroll_p50_frame_ms": 16.399999998509884,
    "scroll_p95_frame_ms": 29.5,
    "scroll_dropped_frames": 13,
    "mermaid_firstpaint_ms": 241,
    "mermaid_flush_ms": 739.5,
    "mermaid_longtask_sum_ms": 60,
    "tab_per_tab_heap_delta_mb": 1.7654637788471423,
    "tab_heap_after_cycle_mb": 83.07503509521484,
    "tab_switch_max_longtask_ms": 484,
    "tab_switch_avg_ms": 580.405000000447
  }
}
end perf-baseline:metrics -->
