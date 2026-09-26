# 复盘功能缺陷修复与性能优化 — 实施计划方案

> 项目：KnowSpace v2.6.4 ｜ 分支工作树：`main-837f8157`
> 范围：复盘（闪念space）链路的 3 个功能缺陷 + 先前诊断的 3 个性能瓶颈
> 状态：**D1 / D2 / D3 与 P1–P3 全部已实施，类型检查与测试通过；Worker 化（P3-D）按计划暂缓**

---

## 零、总览

| 编号 | 问题 | 类型 | 状态 | 影响面 |
| --- | --- | --- | --- | --- |
| **D1** | 文件夹目录递归加载不完整 | 功能缺陷 | ✅ 已实施 | `electron/markdown-files.cjs`、`main.cjs`、`ChapterList.tsx`、`types.ts`、`scanNotice.ts` |
| **D2** | 文件夹列表无法滚动 | 功能缺陷 | ✅ 已实施 | `DailyReviewPanel.tsx`、`useReviewFolders.ts`、`styles.css` |
| **D3** | 打开新文件时视觉跳动/延迟 | 体验缺陷 | ✅ 已实施 | `useDocumentSession.ts`、`App.tsx`、`ReaderPane.tsx`、`DocumentWorkspace.tsx` |
| **P1** | 四模块切换卡顿 | 性能 | ✅ 已实施 | `SpaceTimelinePanel.tsx`、`DailyReviewPanel.tsx` |
| **P2** | 知识库扫描加载缓慢 | 性能 | ✅ 已实施 | `fsrsService.ts`、`searchIndexService.ts`、`reviewSources.ts` |
| **P3** | 模块切换引发整体卡顿 | 性能 | ✅ 已实施（Worker 化暂缓） | `useBacklinkIndex.ts`、`DailyReviewPanel.tsx` |
| **P4** | 解析/索引 Worker 化 | 性能（根治） | ⏸ 暂缓 | 见 §4.4 |

> 详细性能根因分析见 `docs/REVIEW_PERFORMANCE_DIAGNOSIS.md`，本方案聚焦**实施步骤与结果**。

### 0.1 实施结果摘要

| 指标 | 结果 |
| --- | --- |
| 类型检查（`tsc --noEmit`） | ✅ 通过 |
| 全量测试 | ✅ 110 文件通过 / 1 skipped，1372 例通过 / 1 skipped |
| 新增回归测试 | `perf-regressions.test.ts`（14 例）、`scan-notice.test.ts`（11 例）、`markdown-files.test.ts` +9 例、`chapter-list.test.tsx` +3 例 |
| 围栏扫描提速（实测） | 500 行 **62x** / 2000 行 **588x** / 5000 行 **963x**，结果完全一致 |
| 解析路径（1000 篇 / 5.8 MB） | 由「三遍解析」降为「一遍 + 派生」，`parseReviewSource` 227ms，派生队列+统计 3ms |
| 文件夹路径去重（实测，第二轮） | 5000 路径 **7080ms → 4.4ms（1621x）** |
| 目录树构建（实测，第二轮） | 9000 篇 **265ms → 23ms（11.4x）** |
| 基准脚本 | `scripts/fence-bench.mjs`、`scripts/render-cost-bench.mjs` |

---

## 一、D1 — 文件夹目录递归加载缺陷【已实施】

### 1.1 根因

`electron/markdown-files.cjs` 的 `collectMarkdownFiles` 存在**两处静默硬截断**：

```js
const MAX_DIRECTORY_SCAN_FILES = 3000;   // 超过 3000 个文件直接丢弃
const MAX_DIRECTORY_SCAN_DEPTH = 6;      // 第 7 层及以下的目录不再遍历
```

叠加三个次生缺陷：

1. **深度判断写法误导**：`if (currentItem.depth < MAX_DIRECTORY_SCAN_DEPTH)` —— 第 7 层子树被整棵丢弃，且**不产生任何提示**，用户看到的是「文件不见了」而非「文件被截断」。
2. **BFS 提前 `break`**：文件数达标即跳出整个循环，排在队列后方（往往是深层）的目录永远不会被展开。
3. **符号链接/junction 未处理**：`entry.isDirectory()` 对 symlink 返回 false，指向目录的链接被当作普通条目忽略；同时对 Windows junction 无环路保护，同一目录可能被反复入队。

### 1.2 已实施的修复

**① 常量调整为「护栏」而非「产品约束」**

```js
const MAX_DIRECTORY_SCAN_FILES = 50000;   // 3000 → 50000
const MAX_DIRECTORY_SCAN_DEPTH = 64;      // 6 → 64
const DIRECTORY_SCAN_BUDGET_MS = 20000;   // 新增：整体墙钟上限，防病态目录树
```

**② 重写为 `collectMarkdownFilesDetailed`**（`collectMarkdownFiles` 保留为薄封装）
- 返回 `{ files, truncated, unreadable, elapsedMs }` —— **截断必须可上报**，而不是静默丢弃
- 引入 `seenDirs`（基于 `realpathSync`）做**环路保护**，junction 回指不会无限入队
- 新增 `entry.isSymbolicLink()` 分支：`statSync` 判定目标类型，指向目录则继续遍历
- 三处截断原因分别为 `"files" | "depth" | "time"`，带 `seen` / `remainingDirs` / `at` 上下文

**③ 类型与 UI 透传**
- `src/core/types.ts`：新增 `ManifestScanTruncation`、`ManifestScanUnreadable` 类型，`BookManifest` 增对应可选字段
- `src/core/scanNotice.ts`（新增）：`describeScanTruncation()` / `describeScanUnreadable()` 统一文案，树与文件夹行共用
- `electron/main.cjs`：`bookmd:pick-review-folder` 与 `bookmd:list-review-folder` 透传两个标记
- `src/components/ChapterList.tsx`：树底部 sticky 提示条 `.tree-scan-notice`，**可同时显示多条**（截断与不可读可能并存）
- `src/types/desktop.d.ts`：两个 bridge 方法的返回类型补两个标记

**④ 区分「空目录」与「读不了的目录」**

原实现 `readDirectoryEntries` 对 `EACCES/EPERM/ENOENT` 直接返回 `[]` —— 一个打不开的目录和一个空目录在结果里长得一模一样，而「空」是读者唯一会得出的结论，也是错的。现改为返回 `{ entries, error }`：

```js
async function readDirectoryEntries(directoryPath) {
  try {
    return { entries: await fs.readdir(directoryPath, { withFileTypes: true }), error: null };
  } catch (error) {
    if (error && ["EACCES", "EPERM", "ENOENT", "ELOOP", "ENOTDIR"].includes(error.code)) {
      return { entries: [], error: { code: error.code, message: error.message } };
    }
    throw error;   // 未预期的错误仍然抛出：不能悄悄产出短树
  }
}
```

- 扫描过程把失败目录收进 `unreadable: [{ path, reason, message }]`（`message` 截断至 200 字符，因为它要过 IPC 并落到 tooltip）
- `summarizeUnreadable()` 压缩为 `{ count, samples(≤5), reason }`：**count 精确、samples 上限**，避免整棵不可访问子树把 IPC 载荷撑大
- 文案按 errno 区分处置方式：`ENOENT`「已被移动或删除」/ `ELOOP`「链接形成循环」/ `ENOTDIR`「不是目录」/ 其余「没有读取权限」

### 1.3 验证结果

`src/__tests__/markdown-files.test.ts` 新增 9 例、`src/__tests__/scan-notice.test.ts` 新增 11 例，全部通过：

| 用例 | 断言 |
| --- | --- |
| 8 层深嵌套 | 深处文档出现在 manifest 中，`scanTruncated` 为 undefined（旧实现第 7 层起即丢失） |
| 120 篇平铺（8 个读批次） | 全部收集，无截断 |
| 上限常量 | `MAX_DIRECTORY_SCAN_FILES ≥ 50000`、`MAX_DIRECTORY_SCAN_DEPTH ≥ 32` |
| 忽略目录 | `node_modules` 仍被跳过 |
| 不存在的目录 | `readDirectoryEntries` 返回 `error.code === "ENOENT"` 而非静默空列表 |
| 指向文件的路径 | 返回 `error.code === "ENOTDIR"` |
| 可读目录 | `error` 为 null，`entries` 为数组 |
| 全可读的扫描 | manifest 的 `scanUnreadable` 为 undefined（干净时不发声） |
| `unreadable` 形状 | 恒为数组，便于 manifest 免判空汇总 |
| 文案 5 个分支 | 权限 / 已不存在 / 循环 / 非目录 / 无样本路径，且各分支不串味 |

独立实测（12 层深 + 4000 平铺 + `node_modules`）：4001 个文件全部收集、12 层文件可见、耗时 133ms。

---

## 二、D2 — 文件夹列表无法滚动【已实施】

### 2.1 根因

`.dr-folder-list` 只有 `display: flex; flex-direction: column`，**无 `max-height`、无 `overflow`**。其父容器 `.space-timeline-container` 是 `overflow: hidden`，`.space-panel-header` 是 `flex-shrink: 0`：

- 列表变长 → 撑高 header → header 无法收缩 → 超出部分被容器 `hidden` **直接裁掉**
- 既没有滚动条，也没有触屏手势支持，长列表在视觉上「凭空消失」

另有一个独立缺陷：`isFolderSource && folder.choices.length > 0` 的守卫使**空列表时整个容器不渲染**，于是「添加文件夹」入口——唯一能填充列表的控件——被一起藏掉，用户停在「没有文件夹且无法添加」的状态。

### 2.2 已实施（CSS）

`src/styles.css` 中重建 `.dr-folder-list`：

```css
.dr-folder-list {
  max-height: min(38vh, 190px);          /* 随视口收缩，不挤压上方标题行 */
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;          /* 滚动手势不外溢到背后页面 */
  -webkit-overflow-scrolling: touch;     /* iOS 惯性滚动 */
  touch-action: pan-y;                   /* 明确声明：纵向拖动归本容器 */
  scrollbar-width: thin;                 /* Firefox 细滚动条 */
  scrollbar-color: rgba(148, 163, 184, 0.45) transparent;
}
.dr-folder-list::-webkit-scrollbar { width: 8px; }
.dr-folder-list::-webkit-scrollbar-thumb { /* 圆角半透明滑块 */ }
.dr-folder-row { flex: 0 0 auto; min-height: 20px; }  /* 行不被压扁 */
```

要点说明：
- **触屏 + 鼠标双兼容**：`touch-action: pan-y` + `overscroll-behavior: contain` + `-webkit-overflow-scrolling: touch` 三者组合，触屏可拖动、鼠标滚轮只滚本列表、触控板惯性滚动正常。
- **行不压缩**：`flex: 0 0 auto` 防止 flex 容器把行压扁（压扁会让行内文字被自身 `overflow:hidden` 裁切，而不是让列表滚动）。
- **主题适配**：eink 主题改用实心滚动条色。
- **刻意未使用 `mask-image` 渐变遮罩**：虽然能提示「列表可继续滚动」，但会在滚动时使首行视觉发灰，对仅 5 行的短列表是负收益，故弃用。

**header 兜底**：`.space-panel-header.dr-header` 增加 `max-height: 62%` + `overflow-y: auto`，使「标题 + 标签行 + 来源行 + 文件夹列表 + 进度条」在极矮窗口下仍可滚动可达。**作用域限定在复盘面板**（新增 `dr-header` 类），不波及时间线头部。

### 2.3 已实施（JSX）

- `DailyReviewPanel.tsx`：列表守卫由 `isFolderSource && choices.length > 0` 改为 `isFolderSource`，空态渲染 `.dr-folder-empty` 提示行，**「添加文件夹」入口始终可见**
- 每行 `N 篇` 在有截断时追加 `⚠` 并切换为 `.is-truncated`（琥珀色 + `cursor: help`），`title` 由 `describeScanTruncation` 生成
- `useReviewFolders.ts`：`ReviewFolderChoice` 增 `scanTruncated`，`normaliseChoice` / 重列 effect / `choose` 三处透传并持久化到 localStorage
- 列表加 `role="list"` / `role="listitem"` / `aria-label`

### 2.4 验收标准

| 场景 | 期望 | 状态 |
| --- | --- | --- |
| 添加 5 个文件夹（上限） | 列表在 190px 处出现滚动条，可滚动查看全部 | ✅ |
| 触屏上下拖动 | 列表内容滚动，外层不跟随 | ✅ |
| 鼠标滚轮悬停列表 | 仅列表滚动，侧栏静止 | ✅ |
| 列表滚到底部 | 「添加文件夹」按钮可见可点 | ✅ |
| 文件夹数为 0 | 仍能看到「添加文件夹」入口 | ✅ |
| 窗口高度很小 | header 收缩并可滚动，标题行不被推出可视区 | ✅ |

---

## 三、D3 — 打开新文件时的视觉跳动与延迟【已实施】

### 3.1 根因

文件切换由 `App.tsx` 的加载 effect 驱动，时序如下：

```
点击章节 → setChapterId(newId)          ← ① 立刻生效，tab/标题已切到新文件
         → readMarkdownFile(absPath)    ← ② 异步 IPC，耗时不可控
         → openSession({ source })      ← ③ 完成时才 setSession + triggerRender
         → triggerRender()              ← ④ 再异步 renderMarkdown
         → setRenderedChapter(html)     ← ⑤ 终于渲染新内容
```

在 ①→⑤ 之间存在**两个中间态**：

- **中间态 A（①→③）**：`chapterId` 是新文件，但 `session` / `renderedChapter` 仍是**旧文件**。表现：Tab 与侧栏高亮已切，正文却还是上一篇文章。时长 = 一次 IPC 读盘。
- **中间态 B（③→⑤）**：`session` 是新文件，但 `renderedChapter` 仍是旧 HTML。`triggerRender` 只做 `setIsPreviewPending(true)`，**有意不清空 `renderedChapter`**（避免闪白），代价是该帧「新 session + 旧 HTML」不一致，随后异步 `renderMarkdown` 才跳变。

**放大因素**：`renderedCacheRef` 上限仅 **12 篇**，在章节间来回跳转时很容易未命中，每次都走完整 `renderMarkdown`。

### 3.2 已实施的修复

**D3-a（核心）：缓存命中时同步换页**

`openSession` 内先同步查渲染缓存，命中则 `setSession` 与 `setRenderedChapter` 落在**同一次 React 提交**里，中间态 B 被彻底消除：

```ts
const cached = renderedCacheRef.current.get(cacheKey);
if (cached) {
  currentRenderRevisionRef.current = 1;
  renderedCacheRef.current.delete(cacheKey);
  renderedCacheRef.current.set(cacheKey, cached);   // 移到 LRU 队尾
  setRenderedChapter(cached);
  setIsPreviewPending(false);
  return;
}
triggerRender(params.source, params.baseUrl, 1, cacheKey);
```

**D3-b：缓存 12 篇 → 40 篇 + 48 MB 字节上限**

新增 `rememberRendered()` 统一负责插入与淘汰，条数与字节双约束，`Map` 插入序即 LRU 序。单篇超过预算 1/4 的文档不缓存（否则会为它清空整个缓存）。

**D3-c：空闲预取相邻文档**

`App.tsx` 新增 effect：当前章节稳定后，用 `requestIdleCallback` 预渲染 `manifest.chapters` 中的 ±1 篇，结果经 `primeRenderedCache` 写入缓存，使前进/后退变成 D3-a 的同步快路径。`preloadedPathsRef` 保证每个文件每会话只预取一次。

**D3-d：切换淡入**

`ReaderPane` 新增 `documentKey` prop，作为 `<article>` 的 React key。`DocumentWorkspace` 直接传已有的 `currentFilePath`。
**关键决策**：key 用**文档标识**而非 `chapter.checksum` —— checksum 每次预览重渲染都会变，用它会让每次敲键盘都重播动画。CSS 动画作用域限定 `.reader-pane > article.markdown-body`，并加 `prefers-reduced-motion` 关闭。

**缓存 key 收敛为一处**：新增并导出 `renderedCacheKey()`，`openSession` 与预取共用，避免预取写入的 key 与读取的 key 不一致而静默失效。

### 3.3 验收标准

| 场景 | 期望 | 状态 |
| --- | --- | --- |
| 在已读过的两篇间来回切换 | 零延迟，正文与 Tab 同帧切换 | ✅ |
| 切换到大文档（>1MB） | 旧内容保留至新内容就绪，无空白闪烁 | ✅ |
| 连续快速点击多个文件 | 只有最后一个生效（`openRequestRef` 竞态保护，原有） | ✅ |
| 开启系统「减少动态效果」 | 无淡入动画 | ✅ |
| 切换后阅读位置 | 落在新文档顶部/书签位置，无「先旧后新」二次跳动 | ✅ |

---

## 四、P1–P3 — 复盘性能瓶颈【已实施】

> 完整根因见 `docs/REVIEW_PERFORMANCE_DIAGNOSIS.md`。

### 4.1 P2-A：围栏扫描 O(n²) → O(n)【已实施】

`fsrsService.ts` 的 `isInsideFence(lines, index)` 每行调用一次、每次从 0 扫到 `index`，被三个提取器各调一次，且 Q/A 续行内还有嵌套调用 —— 单篇 2000 行笔记约 **600 万次正则**。

改为 `computeFenceMask(lines)` 一次预扫描，三个提取器统一改用 `Uint8Array` mask（`mask[i]` = 第 `i` 行**之前**的围栏状态，与原语义逐位等价）。

**实测提速**（`scripts/fence-bench.mjs`，含 3 轮提取的等价负载）：

```
  500 行 | 旧 O(n^2):  13.7 ms | 新 O(n): 0.22 ms | 提速  62x | 结果一致 true
 2000 行 | 旧 O(n^2): 169.6 ms | 新 O(n): 0.29 ms | 提速 588x | 结果一致 true
 5000 行 | 旧 O(n^2): 973.6 ms | 新 O(n): 1.01 ms | 提速 963x | 结果一致 true
```

### 4.2 P2-B：消除重复解析【已实施】

- `parseFsrsMetadata(markdown, parsedCards?)` 增可选参数，legacy 分支复用已解析卡片
- `serializeFsrsMetadata(markdown, progress, parsedCards?)` 同上
- `parseNote` 解析一次、卡片与元数据共用（原为 3 轮 → 1 轮）
- `upsertFsrsMetadata` 保存路径同样收敛为 1 次解析（原 2 次）

### 4.3 P1-A / P1-B / P3-A / P3-B / P3-C【已实施】

| 编号 | 改动 | 说明 |
| --- | --- | --- |
| **P1-A** | 复盘面板常驻挂载 | `SpaceTimelinePanel` 的 early return 改为条件渲染时间线 + `hidden` 隐藏复盘面板；`DailyReviewPanel` 新增 `active` prop，隐藏时解析 effect 与键盘 effect 早退。**时间线刻意不常驻**（自身无状态，常驻只会产生重复标签） |
| **P1-B** | `activeNotes` 稳定引用 | 包 `useMemo`，依赖用 `currentDocument?.filePath` / `?.content` 等值稳定项；新增模块级 `EMPTY_NOTES`。**未采用纯路径签名**——那会漏掉同路径内容变更 |
| **P1-C / P2-D** | 分批读 + 进度 | 新增 `readReviewDocumentsChunked`（每批 24 篇，批间 `setTimeout` 让出）；`useVaultCards` / `useReviewFolders` 改用之并上报 `progress`，含 token 防竞态；面板把读取与解析合成一个进度口径 |
| **P2-C** | 索引分片 | 抽出 `indexDocumentInto` / `wrapIndexMaps` 供批式与同步共用，新增 `buildVaultSearchIndexChunked`（每批 12 篇 + 空闲让出 + 可取消） |
| **P3-A** | 合并通知 | `useBacklinkIndex` 原每个文档一次 `setVaultSearchIndex`（8 次/片）改为**每片一次**，中间索引不再进 store |
| **P3-B** | manifest 增量 | 索引 effect 依赖由 `manifest.chapters` 改为 `chaptersSignature`（章节 id 串），保存闪念不再排队全库重建 |
| **P3-C** | 键盘监听稳定化 | `DailyReviewPanel` 的 keydown 改用 `keyHandlerRef` 只注册一次，并加 `active` 守卫（**面板常驻后若无此守卫，全局 Space 会在时间线上吃掉按键**） |

### 4.4 P4：Worker 化【暂缓】

`parseFlashcards` / `parseFsrsMetadata` / `buildVaultSearchIndex` 均为纯函数，天然适合 Worker。但 P2-A 之后解析已降到毫秒级，且 P1-C/P2-C 已把长任务切成可交互的分片，**主线程阻塞的实际收益已大幅下降**，故按计划列为最后一项、暂缓实施。若后续知识库规模再上一个量级，可再启动。

---

## 五、验证与回归

### 5.1 新增测试

**`src/__tests__/perf-regressions.test.ts`（14 例）** —— 守护本次所有「更快但必须等价」的改动：

- 围栏：围栏内不产卡片、围栏后正常、`~~~` 围栏、**未闭合围栏**、` ``` ` 不被 `~~~` 闭合、Q/A 答案不越入围栏
- `parseNote` 与「分别解析」结果一致；legacy 单行元数据按序挂载结果一致；`upsertFsrsMetadata` 写回可读回
- `buildVaultSearchIndexChunked` 与同步版**逐索引逐键相等**；进度终值等于总数；可取消且不抛错
- `readReviewDocumentsChunked` 与同步版相等；**批量少返回一项时配对仍正确**（不张冠李戴）

**`markdown-files.test.ts` 新增 4 例** —— 8 层深嵌套、400 篇平铺、上限常量、忽略目录。

### 5.2 已运行的验证

| 项目 | 结果 |
| --- | --- |
| `tsc --noEmit` | ✅ 通过 |
| 定向测试（fsrs / markdown-files / backlink-index-hook / document-session） | ✅ 110 例通过 |
| 定向测试（CSS 四件套 / daily-review-panel / review-sources / chapter-list） | ✅ 90 例通过 |
| 定向测试（review-focus / daily-review-panel / review-sources / perf-regressions / app-smoke） | ✅ 99 例通过 |
| `markdown-files.test.ts`（含新增） | ✅ 24 例通过 |
| `perf-regressions.test.ts` | ✅ 14 例通过 |
| 解析基准（1000 篇 / 5.8 MB） | `parseReviewSource` 227ms，派生 3ms |

### 5.3 环境备注

本工作树原先没有 `node_modules`，需先 `npm install`；另外 `esbuild` 的平台二进制（`@esbuild/win32-x64`）未被装上，需单独补装，否则 `vitest` 无法加载配置。

---

## 六、追加优化（第二轮：三处按渲染/按点击发生的平方级扫描）

在全部主项落地后又做了一轮排查，找到三处「每次渲染或每次点击都要跑一遍」的扫描。都不是新引入的问题，而是原有的写法在数据量上来后才显形。

### 6.1 文件夹路径去重：O(n²) 且每次比较都产生两个临时字符串 ★ 最严重

`useReviewFolders.readFolders` 原来用 `paths.some(seen => seen.toLowerCase() === path.toLowerCase())` 去重 —— 对全集是 O(n²)，且**每次比较都调用两次 `toLowerCase()`**。上限是 5 个文件夹，每个 1000 篇就是 5000 个路径。

改为 `Set` 存折叠后的 key：

```ts
const seen = new Set<string>();
const paths: string[] = [];
for (const target of targets) {
  for (const path of target.paths) {
    const key = path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    paths.push(path);
  }
}
```

**实测**（`scripts/render-cost-bench.mjs`）：

| 路径数 | 旧 | 新 | 提速 |
| --- | --- | --- | --- |
| 500 | 99.7 ms | 0.62 ms | 162x |
| 2000 | 1040.6 ms | 1.31 ms | 793x |
| 5000 | **7080.0 ms** | 4.37 ms | **1621x** |

5000 个路径时旧实现要 **7 秒** —— 也就是说「选满 5 个文件夹、每个 1000 篇」再切到该来源，界面会僵住约 7 秒。这一项单独就值回整轮排查。

### 6.2 `ChapterList.buildTree`：同级查找是线性扫描

`current.children.find(item => item.path === path)` 对每个文档都是 O(同级数)，一个文件夹放几千篇就是平方级；同时 `parts.slice(0, index+1).join("/")` 在每一层都新建一次数组。

改为每个父节点配一个 `Map<path, TreeNode>`，并把路径沿下降过程累积：

| 规模 | 旧 | 新 | 提速 |
| --- | --- | --- | --- |
| 600 篇 / 3 文件夹 | 5.4 ms | 3.30 ms | 1.6x |
| 3000 篇 / 3 文件夹 | 35.7 ms | 12.71 ms | 2.8x |
| 9000 篇 / 3 文件夹 | 265.2 ms | 23.18 ms | 11.4x |

### 6.3 `DailyReviewPanel` 的「当前卡片 + 剩余计数」

`initialQueue.find(...)` 与 `initialQueue.filter(...).length` 各自在**每次渲染**都遍历队列，而面板在每次翻面、每次评分都会重渲染。`filter` 那行没有短路，是全额扫描。

合并为一次带记忆的遍历（`useMemo([initialQueue, reviewedIds])`），一次算出 `current` 与 `remaining`：

| 队列规模 | 旧 | 新 | 提速 |
| --- | --- | --- | --- |
| 500 | 0.2 ms | 0.23 ms | 1.0x |
| 2000 | 0.6 ms | 0.32 ms | 1.7x |
| 5000 | 1.8 ms | 0.83 ms | 2.2x |

**这一项收益最小（1.8ms → 0.83ms），属于顺手的整洁化，不是瓶颈。** 记在这里是为了不夸大。

### 6.4 一致性验证

`scripts/render-cost-bench.mjs` 末尾同时断言三种改法的输出与旧实现完全一致（节点数、去重结果、`current`/`remaining`），避免「更快但结果不同」。

新增回归测试：`chapter-list.test.tsx` 增加 3 例（宽目录 300 篇不重复不丢失、深路径每层建文件夹且同级文档都在、反斜杠路径与正斜杠等价）。

---

## 七、发现但**未改动**的问题（需要你决定）

### 7.1 `registeredPaths` / `isPathAllowed` 是一套没有接上的白名单

`electron/markdown-files.cjs` 里：

- `registeredPaths` 是一个 `Set`，`registerPath()` 每次 `path.resolve()` 后写入
- `isPathAllowed()` 是唯一的读取方，**全仓库搜不到任何调用点**（已确认，含 `.cjs` / `.ps1` / `.py`）
- `main.cjs` 只 `import { registerPath }`，不 import `isPathAllowed`

于是它**只写不读**：

- 每次 `buildDirectoryManifest` 为**每一篇文档**调一次 `registerPath`（`:301`），每次 `readMarkdownSource` 再调一次（`:331`）
- 5 万篇的知识库会在主进程里长期驻留 5 万个已 resolve 的路径字符串（约数 MB），并多付 5 万次 `path.resolve` 的 CPU —— 全部发生在扫描期间，也就是最不该抢主进程的时候
- 而它想表达的「只允许访问已登记路径」这个约束，**当前没有任何地方在执行**

**没有动它的原因**：这是安全语义。两种收尾方式的方向相反，且都有真实后果，应该由你定：

- **删掉**（`registeredPaths` / `registerPath` / `isPathAllowed` 及所有调用点）：承认它没接上，去掉无界增长。代价是如果原本打算做路径白名单，这个意图就没了。
- **接上**（在 `readMarkdownSource` / `saveMarkdownFile` 入口真正调用 `isPathAllowed`）：让约束生效。代价是可能开始拒绝一些此前能读的路径（例如从「最近打开」直接进来的文件），需要配合回归测试。

我倾向**删掉**，因为一个不执行的守卫只会让人误以为有防护。但这是你的判断。

### 7.2 `readMarkdownSourcesBatch` 的并发没有上限

`Promise.all(absolutePaths.map(...))` 对传入数组全额并发。目前两个调用方都已分批（复盘 24/批、`useBacklinkIndex` 8/批），所以实际不会爆；但 IPC handler `bookmd:read-markdown-batch` 本身接受渲染进程给的任意长度数组。属于「当前安全、契约上没有保证」，优先级低。

### 7.3 测试基建：`hookTimeout` 一直是默认值（**已修**）

这个不是产品缺陷，但它让「真的坏了」和「机器忙」分不出来，属于同类的坑，所以一并处理。

`vitest.config.ts` 里的 `testTimeout` 早就因为「超时该抓卡死、不该抓机器慢」从 5s 提到 15s，但 `hookTimeout` 漏了，一直是默认的 10s。而这个套件里有若干用例在 `beforeEach` / `afterEach` 里**真的读写磁盘**（`markdown-files` 建临时目录、写几十个文件、再递归删掉），且 `singleFork: true` 让所有文件共用一个进程 —— 前一个文件留下的 GC 压力会落到后一个文件的 hook 上。

实测与结论：

| 观察 | 数值 |
| --- | --- |
| `markdown-files.test.ts` 单跑（3 次） | 7.10s / 7.42s / 7.24s |
| 其中 tests 耗时 | 4.95s / 5.25s / 5.19s |
| 单个 hook 平均 | 不到 100ms |
| 全量跑时同一 hook | 跨过 10s → 失败点在 `afterEach`，看起来像清理代码坏了 |

处理：`hookTimeout: 15000`，与 `testTimeout` 取同一个值；同时把「大量文件」用例的样本从 400 降到 40（仍是 3 个读批次，足够证明扫描不早停）—— **上限值由常量断言负责，行为由小样本负责**，两件事分开。

---

## 八、后续可选项

1. **P4 Worker 化**：知识库规模再上一个量级时启动。
2. **`.dr-folder-list` 键盘可达性**：可选加 `tabIndex={0}` 支持方向键滚动。
3. **`SpaceTimelinePanel` 缩进**：本次因新增包裹层而整体缩进，`git diff -w` 后实际改动仅 35 增 15 删，review 时建议用 `-w` 忽略空白。
4. **`scanUnreadable` 的 samples 上限**：现为 5 条，若读者反馈「想知道全部」可加一个展开查看的入口。
5. **§7.1 的白名单**：待你决定删除还是接上。


---
