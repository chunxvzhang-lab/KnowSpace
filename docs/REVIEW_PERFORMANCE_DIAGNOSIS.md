# 【闪念space】复盘功能性能瓶颈诊断与优化方案

> 版本：KnowSpace v2.6.4 ｜ 分析对象：`SpaceTimelinePanel` → `DailyReviewPanel` 复盘链路
> 结论：三个卡顿点是**三条相互独立的根因**，其中一个（O(n²) 围栏扫描）同时是另外两个的放大器。

---

## 一、代码结构总览

### 1.1 复盘功能的调用链

```
App.tsx (2295 行)
  └─ <SpaceTimelinePanel>                       <!-- 闪念 space 面板容器，565 行 -->
        activeTab: "timeline" | "todos" | "review"
        │
        ├─ activeTab === "timeline" → 时间线列表（groupedTimeline）
        ├─ activeTab === "todos"    → 待办列表（allTodos）
        └─ activeTab === "review"  ──► 【early return，整体替换面板 body】
              <DailyReviewPanel                    <!-- 复盘核心，1106 行 -->
                notes / currentDocument / loading / tabsSlot
              />

DailyReviewPanel 内部
  ├─ reviewSource: "space" | "vault" | "folder" | "document"   ← 四个复盘模块
  ├─ useVaultCards()        → 知识库源（按需 load，整库 IPC 读）
  ├─ useReviewFolders()     → 自定义文件夹源（localStorage 记忆，最多 5 个）
  ├─ activeNotes            → 四源归一化后的 ReviewSourceDocument[]
  ├─ 协作式分片解析 effect   → 8ms 一片，每片 setTimeout(step,0) 交还主线程
  │     └─ parseNote() → parseFlashcards() + parseFsrsMetadata()
  │           └─ extractQaPairs / extractInlineCards / extractClozeCards
  │                 └─ isInsideFence()   ★ O(n²) 热点
  ├─ useMemo → buildQueueFromParsed / summarizeParsed  （按 retrievability 排序）
  ├─ handleRate()  → 重读文件 → upsertFsrsMetadata → saveMarkdownFile(force) → 乐观推进
  └─ handleUndo()  → 单步回滚

旁路（与复盘同享的全库重算路径）
  ├─ useGlobalShortcuts()  → 闪念保存事件 → refreshDirectory() + setManifest()
  └─ useBacklinkIndex()    → 全库 chunk=8 空闲分片建索引 → setBacklinkIndex + setVaultSearchIndex
        └─ backlinkIndex.ts  → createBacklinkIndex / updateDocumentInIndex
        └─ searchIndexService → buildVaultSearchIndex / updateVaultSearchIndexForDocument
```

### 1.2 关键文件与规模

| 文件 | 行数 | 在复盘链路中的角色 |
| --- | --- | --- |
| `src/components/SpaceTimelinePanel.tsx` | 565 | 面板容器；`review` 分支用 **early return** |
| `src/components/DailyReviewPanel.tsx` | 1106 | 复盘核心：四源、分片解析、评分落盘 |
| `src/hooks/useVaultCards.ts` | 84 | 知识库源（全章节 IPC 读） |
| `src/hooks/useReviewFolders.ts` | 303 | 文件夹源（localStorage + 目录列举） |
| `src/services/reviewSources.ts` | 66 | `readReviewDocuments` 统一读取层 |
| `src/services/fsrsService.ts` | 1015 | FSRS-5 调度 + 卡片解析 + 元数据读写 |
| `src/services/searchIndexService.ts` | 841 | 全库搜索索引（**同步**构建） |
| `src/services/backlinkIndex.ts` | 371 | 双链索引 |
| `src/hooks/useBacklinkIndex.ts` | 305 | 空闲分片建索引 + 实时增量 |
| `src/hooks/useGlobalShortcuts.ts` | 353 | 闪念保存 → 全库刷新 |

---

## 二、瓶颈一：四个复盘模块切换时的卡顿

### 2.1 根因 A（主因）：`review` 分支用 early return，**切换即整树卸载**

`SpaceTimelinePanel.tsx:284`：

```tsx
if (activeTab === "review") {
  return <DailyReviewPanel ... />;
}
```

React 的 reconciliation 会认为 `review` 与 `timeline/todos` 是**完全不同类型的子树**，于是：

- 进入 `复盘`：`DailyReviewPanel` 全新挂载 → `parsedNotes` / `writtenContent` / `publishedKey` / `log` / `reviewedIds` **全部从零开始**。
- 离开 `复盘`：`DailyReviewPanel` 整个卸载 → 上述缓存与本次会话的评分日志**全部销毁**。

后果：每次在 `时间线 ⇄ 复盘` 之间来回，都会**重新读一遍源、重新解析一遍全部笔记**。用户感知就是「一切到复盘就卡一下，切回去再切回来又卡一下」。

> 注意这里切换的是**外层 tab**（timeline/todos/review）。而用户所说的「四个复盘模块」是 `DailyReviewPanel` 内部的 `space/vault/folder/document` 四源切换 —— 这两件事的卡顿机制不同，见 2.2 / 2.3。

### 2.2 根因 B：`activeNotes` 每次渲染都是**新数组身份**，作为 effect 依赖触发重复解析

`DailyReviewPanel.tsx:254-262`（内联三元表达式，未包 `useMemo`）：

```tsx
const activeNotes: ReviewSourceDocument[] = isVaultSource
  ? vault.documents
  : isFolderSource
    ? folder.documents
    : isDocumentSource
      ? canReviewDocument && currentDocument
        ? [{ filePath: currentDocument.filePath, content: currentDocument.content }]  // ★ 每次新数组
        : []
      : notes;
```

它被写进解析 effect 的依赖数组（`DailyReviewPanel.tsx:401`）：

```tsx
}, [activeNotes, parseRevision]);
```

- `document` 源：每次渲染都 `[{...}]` 新建数组 → effect 每次渲染都跑。
- `space` 源：`notes` 来自父组件 `useState`，父组件任何重渲染（如 `loadSummary` 刷新）都会换身份 → effect 再跑。
- `vault` / `folder` 源：`documents` 由 hook 持有相对稳定。

现有的 `publishedKey` 守卫（`:365`）确实挡住了「内容没变就重复发布」，但**守卫是在 effect 内部才生效的**——effect 本身、`key` 的 `join` 拼接、`stale` 的 `filter` 遍历（对全库每个 note 做一次 Map 查询）仍然每次全跑。全库 3000 篇笔记时，仅这一步的无效遍历就有可观开销，且发生在**点击切换源的那一帧**。

### 2.3 根因 C：切换 `vault` / `folder` 源会同步触发全量 IPC + 全量解析

源切换 effect（`DailyReviewPanel.tsx:218-245`）：

```tsx
if (reviewSource === "vault" && vault.chapterCount > 0 && !vault.loaded) void vault.load();
if (reviewSource === "folder" && folder.choices.length > 0 && !folder.loaded) void folder.load();
```

- `vault.load()` → `useVaultCards` 把 `manifest.chapters` 全部映射为 `absolutePath`，调用 `readReviewDocuments` → `bridge.readMarkdownBatch(paths)` **一次性读取整个知识库**。
- `folder.load()` → `readFolders()` 去重后 `readReviewDocuments` 读取全部文件。
- 读完后 `activeNotes` 变成新身份 → 立刻触发 2.2 的解析 effect → **全库每篇笔记 O(n²) 解析**（见瓶颈二）。

**这两步叠加，就是「点 vault 按钮后整个软件卡死几秒」的直接原因。**

### 2.4 根因 D：切换按钮的内联回调 + 每次渲染重建的闭包

四源切换按钮（`DailyReviewPanel.tsx` 底部）使用内联箭头函数 `onClick={() => setReviewSource("vault")}`。配合 `activeNotes` 内联、`documentSourceRefusal` 每次重算，切换时会引发一次**全量重渲染**，`initialQueue`/`previews` 等 memo 若依赖链上有非稳定引用也会被连累重算。

### 2.5 优化方案（瓶颈一）

#### 方案 1-A：把 early return 改成「隐藏不卸载」，保住缓存 ★ 首选

让 `DailyReviewPanel` 常驻挂载，用 CSS 控制显隐，而不是靠条件 return 销毁重建。

```tsx
// SpaceTimelinePanel.tsx —— 替换 `if (activeTab === "review") return ...`
return (
  <div className="space-timeline-root">
    {/* 时间线 / 待办：仅在非 review 时渲染，避免 review 时白跑 memo */}
    {!isReviewActive && (
      <div className="space-tab-body">
        {/* ...原有 timeline / todos body... */}
      </div>
    )}

    {/* 复盘面板常驻：用 display 切换，卸载即丢失解析缓存 */}
    <div style={{ display: isReviewActive ? "block" : "none" }}>
      <DailyReviewPanel
        notes={notes}
        currentDocument={currentDocument}
        loading={loading}
        onOpenNoteFile={onOpenNoteFile}
        onProgressSaved={loadSummary}
        tabsSlot={tabSwitcher}
        active={isReviewActive}
      />
    </div>
  </div>
);
```

配套：`DailyReviewPanel` 新增 `active` 入参，在解析 effect 与键盘监听 effect 里早退，避免隐藏时仍做重活：

```tsx
// DailyReviewPanel.tsx
type DailyReviewPanelProps = { /* ...原有... */ active?: boolean };

useEffect(() => {
  if (active === false) return;         // 面板隐藏时不解析
  // ...原解析逻辑
}, [active, activeNotes, parseRevision]);
```

> 更彻底的方案是把面板状态提到 `SpaceTimelinePanel` 或一个 Zustand store（`useReviewStore`），使「卸载」不影响缓存。但方案 1-A 改动最小、风险最低，且能同时解决瓶颈三的一部分。

#### 方案 1-B：`activeNotes` 改为稳定引用（`useMemo` + 内容签名）

```tsx
// DailyReviewPanel.tsx
const activeNotes: ReviewSourceDocument[] = useMemo(() => {
  if (isVaultSource) return vault.documents;
  if (isFolderSource) return folder.documents;
  if (isDocumentSource) {
    return canReviewDocument && currentDocument
      ? [{ filePath: currentDocument.filePath, content: currentDocument.content }]
      : EMPTY_NOTES;                     // 模块级常量，保证空数组身份稳定
  }
  return notes;
}, [
  isVaultSource, isFolderSource, isDocumentSource,
  vault.documents, folder.documents,
  canReviewDocument, currentDocument?.filePath, currentDocument?.content,
  notes,
]);
```

再把 effect 的依赖从「数组身份」改成「**内容签名**」，从根上切断「同内容不同身份 → 重跑解析」：

```tsx
const notesSignature = useMemo(
  () => activeNotes.map((n) => n.filePath).join("\u0000"),
  [activeNotes]
);

useEffect(() => {
  // 原逻辑不变，只是触发条件从数组身份变成签名
}, [notesSignature, parseRevision, reviewSource]);
```

> ⚠️ 注意：`useMemo` 依赖里保留 `activeNotes` 的**内容**而非身份 —— 若上游 `notes` 每次都换身份，仍会穿透。因此 1-B 与 1-A 建议**一起上**：1-A 保住缓存，1-B 减少重跑。

#### 方案 1-C：把「读取」与「解析」彻底异步化，切换期间给即时反馈

`vault.load()` / `folder.load()` 目前是 `void` 调用后靠 `loading` 态驱动 UI。建议显式区分三态并在解析前就渲染骨架：

```tsx
// DailyReviewPanel.tsx —— 把「读文件」的等待与「找卡片」的等待合成一个进度口径
const [readProgress, setReadProgress] = useState<{ done: number; total: number } | null>(null);
const progress = readProgress ?? parseProgress;   // 先报读取进度，读完报解析进度
```

`useVaultCards.load()` 改为**分批读取 + 上报进度**（复用 `useBacklinkIndex` 里已验证的 `CHUNK_SIZE = 8` + `readMarkdownBatch` 模式）：

```ts
// useVaultCards.ts
const CHUNK_SIZE = 8;
const load = useCallback(async () => {
  const bridge = window.knowSpaceDesktop || window.bookMDDesktop;
  if (!bridge) return;
  const paths = manifest.chapters
    .map((c) => c.absolutePath)
    .filter((p): p is string => Boolean(p));
  const docs: ReviewSourceDocument[] = [];
  for (let i = 0; i < paths.length; i += CHUNK_SIZE) {
    const chunk = paths.slice(i, i + CHUNK_SIZE);
    docs.push(...(await readReviewDocuments(bridge, chunk)));
    onProgress?.({ done: Math.min(i + CHUNK_SIZE, paths.length), total: paths.length });
    await new Promise((r) => setTimeout(r, 0));   // 交还主线程，UI 不冻
  }
  setDocuments(docs);
}, [manifest, onProgress]);
```

#### 方案 1-D：切换按钮回调 `useCallback` 化

```tsx
const selectSource = useCallback((kind: ReviewSourceKind) => () => setReviewSource(kind), []);
// 渲染处：<button onClick={selectSource("vault")}>知识库</button>
```

---

## 三、瓶颈二：知识库扫描加载缓慢导致的卡顿

### 3.1 根因 A（★ 核心热点）：`isInsideFence` 是 **O(n²) / 每篇笔记**，且被调用三轮

`fsrsService.ts:412-420`：

```ts
function isInsideFence(lines: string[], index: number): boolean {
  let fence: string | null = null;
  for (let i = 0; i < index; i += 1) {          // ★ 从 0 扫到 index
    const match = /^\s*(```+|~~~+)/.exec(lines[i]);
    if (!match) continue;
    /* 翻转 fence 状态 */
  }
  return fence !== null;
}
```

调用点（**每一行都调用一次，每次内部再扫前面所有行**）：

- `extractQaPairs` → `fsrsService.ts:464`
- `extractInlineCards` → `fsrsService.ts:512`
- `extractClozeCards` → `fsrsService.ts:544`
- 且 `extractQaPairs` 内层还有一个 `isInsideFence(lines, j)`（`:488`）在 Q/A 续行循环里 —— 形成**嵌套的二次扫描**。

设一篇笔记 N 行，则：
- 单次 `parseFlashcards` 开销 = `3 × Σ(i=0..N) i` ≈ `1.5 N²` 次正则匹配。
- 一篇 500 行的笔记 ≈ 37.5 万次正则执行；一篇 2000 行的笔记 ≈ 600 万次。

而 `parseFlashcards` 在整库扫描时**对每一篇笔记各跑一次**。这就是 `DailyReviewPanel.tsx:310-324` 注释里写的「5.8 MB 知识库 = 7.5 秒无响应」的**直接来源**。

再叠加：`parseNote`（`:868`）同时调 `parseFlashcards` **和** `parseFsrsMetadata`，而 `parseFsrsMetadata`（`:687`）在遇到 legacy 孤儿进度时会**再调一次 `parseFlashcards`**。即单篇笔记最坏解析 3 轮全量。

### 3.2 根因 B：`buildVaultSearchIndex` 在渲染线程**同步**构建

`searchIndexService.ts` 的 `buildVaultSearchIndex(documents)` 对**全库每篇文档**做：
- `extractTagsFromMarkdown` / `parseFrontmatterTags`
- `extractLinksFromMarkdown`
- `tokenizeText`（CJK unigram + bigram，分词结果数量约 2× 字符数）
- `parseDocumentBlocks`

全部在一个同步调用里完成，无分片、无 yield。它被 `useBacklinkIndex`（`:147`）在**每个 chunk 的每篇文档**上通过 `updateVaultSearchIndexForDocument` 调用，也在 store 初始化（`createBacklinkIndex([])` / `buildVaultSearchIndex([])`）路径上调用。全库规模下这是**秒级阻塞**。

### 3.3 根因 C：`readReviewDocuments` 一次性读全库，无进度、无分片

`reviewSources.ts:readReviewDocuments`：

```ts
// 优先批量 IPC
const batchData = await bridge.readMarkdownBatch(paths);
```

`readMarkdownBatch` 一次性把**所有**章节内容读进内存。几千篇笔记时：
- IPC 序列化 / 反序列化是 O(总字节数)，主进程与渲染进程都要扛；
- 读完后 `content` 全量驻留 JS 堆 → 内存峰值抬升（见瓶颈三的内存维度）。

### 3.4 优化方案（瓶颈二）

#### 方案 2-A：`isInsideFence` 从 O(n²) 降到 O(n) ★ 收益最大、改动最小

**做法**：一次性预扫描出「围栏区间」，用二分查找判定任意行是否在围栏内；或直接在主循环里**维护一个滚动的 `inFence` 布尔量**，彻底删掉 `isInsideFence`。

推荐后者（最简单、零额外数据结构）：

```ts
// fsrsService.ts —— 新增：一次性算出每行是否位于围栏内
function computeFenceMask(lines: string[]): Uint8Array {
  const mask = new Uint8Array(lines.length);
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^\s*(```+|~~~+)/.exec(lines[i]);
    if (m) {
      if (fence === null) {
        fence = m[1][0];              // 记录 ``` 或 ~~~
        mask[i] = 1;                  // 围栏标记行本身也算「在围栏内」，跳过
        continue;
      }
      if (m[1][0] === fence) {
        mask[i] = 1;
        fence = null;
        continue;
      }
    }
    mask[i] = fence !== null ? 1 : 0;
  }
  return mask;
}
```

三个提取器统一改成接收 mask：

```ts
function extractQaPairs(lines: string[], fence: Uint8Array): FsrsCard[] {
  for (let i = 0; i < lines.length; i += 1) {
    if (fence[i] || isInsideMetadata(lines[i])) continue;
    // ...原逻辑
    // 内层续行判断同样改用 fence[j]
  }
}

export function parseFlashcards(markdown: string): FsrsCard[] {
  if (!markdown) return [];
  const lines = markdown.split(/\r?\n/);
  const fence = computeFenceMask(lines);          // 只扫一次
  const found = [
    ...extractQaPairs(lines, fence),
    ...extractInlineCards(lines, fence),
    ...extractClozeCards(lines, fence),
  ];
  // ...
}
```

**复杂度**：`O(N²) → O(N)`。以 2000 行笔记计，从约 600 万次正则降到 2000 次 —— **三个数量级**。这一项改动单独就能把整库解析从「秒级」压到「百毫秒级」。

#### 方案 2-B：消除 `parseNote` 内部的重复解析（三轮 → 一轮）

`parseFsrsMetadata` 里的 legacy 分支会再调一次 `parseFlashcards`。改为：把已解析的卡片作为参数传入，复用结果。

```ts
// fsrsService.ts
export function parseFsrsMetadata(
  markdown: string,
  cards?: FsrsCard[]            // ★ 可选：外部已解析的卡片，避免重复解析
): Map<string, FsrsProgress> {
  // ...在需要 parseFlashcards 的 legacy 分支里：
  const cardsForOrphan = cards ?? parseFlashcards(markdown);
  // ...
}

// parseNote 改为一次解析、两处复用
export function parseNote(note: { path: string; content: string }): ParsedNote {
  const cards = parseFlashcards(note.content);
  return {
    path: note.path,
    content: note.content,
    cards,
    progress: parseFsrsMetadata(note.content, cards),   // ★ 复用
  };
}
```

同步检查 `serializeFsrsMetadata` 内的 `parseFlashcards` 调用点，同样传入 `cards`。

#### 方案 2-C：`buildVaultSearchIndex` 分片化（空闲让出）

把它从「一个同步大函数」改成「可中断的生成器/分片任务」，复用 `useBacklinkIndex` 已验证的 `requestIdleCallback + setTimeout(…, 20)` 模式：

```ts
// searchIndexService.ts —— 新增分片版本（保留原同步版给测试/小库）
export async function buildVaultSearchIndexChunked(
  documents: { filePath: string; content: string; title?: string }[],
  onProgress?: (done: number, total: number) => void,
  isCancelled: () => boolean = () => false,
  chunkSize = 12,
): Promise<VaultSearchIndex> {
  let index = buildVaultSearchIndex([]);
  for (let i = 0; i < documents.length; i += chunkSize) {
    if (isCancelled()) break;
    // 同步处理本片：单片刻意做小，保证每片 < 一帧
    for (const doc of documents.slice(i, i + chunkSize)) {
      index = updateVaultSearchIndexForDocument(
        index, doc.filePath, doc.title ?? "", doc.content, doc.filePath
      );
    }
    onProgress?.(Math.min(i + chunkSize, documents.length), documents.length);
    await new Promise<void>((resolve) => {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(() => setTimeout(resolve, 0), { timeout: 120 });
      } else {
        setTimeout(resolve, 0);
      }
    });
  }
  return index;
}
```

调用处（`useBacklinkIndex.ts:105-166`）已经是分片粒度，可直接把 `buildVaultSearchIndex` 换成这个版本，或保持逐篇 `updateVaultSearchIndexForDocument` 不变、只把**首次全量构建**改成分片。

#### 方案 2-D：`readReviewDocuments` 分批读 + 字节级上限

```ts
// reviewSources.ts
const READ_CHUNK = 8;
export async function readReviewDocumentsChunked(
  bridge: DesktopBridge,
  paths: string[],
  onProgress?: (done: number, total: number) => void,
  isCancelled: () => boolean = () => false,
): Promise<ReviewSourceDocument[]> {
  const out: ReviewSourceDocument[] = [];
  for (let i = 0; i < paths.length; i += READ_CHUNK) {
    if (isCancelled()) break;
    const chunk = paths.slice(i, i + READ_CHUNK);
    out.push(...(await readReviewDocuments(bridge, chunk)));  // 复用原有按 absolutePath 配对的正确性保障
    onProgress?.(Math.min(i + READ_CHUNK, paths.length), paths.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}
```

> 注意：`readReviewDocuments` 里「**按 `absolutePath` 小写配对**而非按位置配对」的规则必须保留 —— 这是既有的正确性约束（批量 IPC 返回顺序不保证）。

---

## 四、瓶颈三：模块切换引发的整体软件卡顿

### 4.1 根因 A：全库规模的同步重算在渲染线程串行发生

模块切换会触发**三条全库重算路径**同时/相继执行：

1. **解析路径**（瓶颈二）—— `parseNote` × 全库笔记，`isInsideFence` O(n²)。
2. **搜索索引路径** —— `buildVaultSearchIndex` / `updateVaultSearchIndexForDocument`（`useBacklinkIndex.ts:147`），全库同步。
3. **双链索引路径** —— `updateDocumentInIndex` + `setBacklinkIndex({ ...backlinkIndex })`（`useBacklinkIndex.ts:146,153`）。

其中第 3 点有一个**隐性的 O(全库) 拷贝**：`setBacklinkIndex({ ...backlinkIndex })` 在**每个 chunk** 都执行一次（`:153`），把顶层对象展开复制 —— 虽然 `Map` 是引用共享，但这是**每个 chunk 触发一次全 store 订阅通知**，会让所有订阅 `backlinkIndex` 的组件（`BacklinksPanel`、`GraphViewPane`、`useBacklinkIndex` 自身的 `graphData` memo）**重渲染**。库越大、chunk 越多，通知次数越多。

### 4.2 根因 B：闪念保存事件 → `refreshDirectory` + `setManifest` → 全库重算链

`useGlobalShortcuts.ts:152-160` 订阅 `onFlashNoteSaved`，每次闪念保存都会 `refreshDirectory()` 并 `setManifest(...)`。

`useBacklinkIndex.ts:186` 的第一个 effect 依赖 `[manifest?.chapters]`：

```tsx
}, [manifest?.chapters]);
```

`setManifest` 产生了**新的 `chapters` 数组身份** → 该 effect 重跑 → 600ms 后启动**整库空闲分片重建索引**。也就是说：**每保存一条闪念，就排队一次全库重建**。

同时 `SpaceTimelinePanel` 内部也订阅了同一个事件并 `loadSummary()`（见 summary 记录），进一步放大。

### 4.3 根因 C：全局键盘监听被反复注册

- `useGlobalShortcuts` 的 keydown effect 依赖数组很大（含多个回调）。
- `DailyReviewPanel` 也注册了全局 keydown（Space 揭示 / 1–4 评分 / Ctrl+Z 撤销），依赖 `[revealed, saving, handleRate]`，其中 `handleRate` 是 `useCallback` 但依赖链长。

模块切换导致这些回调重建 → 监听器**解绑再绑**。单次开销不大，但叠加在「切换那一帧」上会加重掉帧；更实际的风险是**监听器泄漏**（若某个 cleanup 遗漏）导致多份处理函数。

### 4.4 优化方案（瓶颈三）

#### 方案 3-A：合并 `setBacklinkIndex` 的每次 chunk 通知 → 每帧一次

```ts
// useBacklinkIndex.ts —— runChunks 内部
let dirty = false;
for (let i = 0; i < pendingChapters.length; i += CHUNK_SIZE) {
  // ...处理 chunk，updateDocumentInIndex 原地改 backlinkIndex
  dirty = true;
  // 只在让出前统一 flush 一次
  if (dirty) { setBacklinkIndex({ ...backlinkIndex }); dirty = false; }
  await yieldToIdle();
}
```

更进一步的正确做法：把索引做成**版本号 + 不可变快照**，或改用 `useSyncExternalStore` 订阅，避免 `{ ...obj }` 这种「浅拷贝骗过 === 」的写法带来的**全订阅者抖动**。

#### 方案 3-B：`manifest` 更新走「增量」，不要重跑全库索引

`useBacklinkIndex.ts:73` 的 effect 依赖 `[manifest?.chapters]` 太粗。改为依赖一个**结构签名**，并在闪念保存路径上**只更新受影响的那一篇**：

```tsx
const chaptersSignature = useMemo(
  () => manifest?.chapters.map((c) => `${c.id}:${c.mtime ?? ""}`).join("|") ?? "",
  [manifest]
);

useEffect(() => {
  if (!manifest?.chapters?.length) return;
  // ...
}, [chaptersSignature]);      // 章节集合真变化才全量重建
```

并在 `onFlashNoteSaved` 路径里，不要 `setManifest` 整包重建，而是对新保存的那一篇直接：

```ts
updateDocumentInIndex(backlinkIndex, chapterId, title, content, path);
setBacklinkIndex({ ...backlinkIndex });
```

#### 方案 3-C：全局快捷键监听合并 / 去抖

- `DailyReviewPanel` 的 keydown 用 `ref` 持有最新回调，**effect 依赖数组清空**，只在挂载时注册一次：

```tsx
const handlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
handlerRef.current = (e) => { /* 用最新的 revealed / saving / handleRate */ };

useEffect(() => {
  const onKey = (e: KeyboardEvent) => handlerRef.current(e);
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, []);                       // ★ 只注册一次
```

- 若 `useGlobalShortcuts` 与 `DailyReviewPanel` 都要处理 Space/1-4，建议**统一到一处分发**，或让 `DailyReviewPanel` 通过 `active` prop 在自己未激活时直接不处理（见 1-A）。

#### 方案 3-D：把重活挪出渲染线程（中期方案）

上述都是「降低主线程占用」。要根治 **整软件卡顿**，正解是**把解析与索引搬到 Worker**：

- `parseFlashcards` / `parseFsrsMetadata` / `buildVaultSearchIndex` 都是纯函数、无 DOM 依赖，天然适合 Worker。
- `Electron` 下可用 `new Worker(new URL("./workers/reviewParse.worker.ts", import.meta.url), { type: "module" })`（Vite 原生支持）。
- 主线程只收「增量结果」（一批 `ParsedNote` / 一批 index patch），UI 完全不受影响。

```ts
// workers/reviewParse.worker.ts（示意）
self.onmessage = (e: MessageEvent<{ id: number; notes: { path: string; content: string }[] }>) => {
  const { id, notes } = e.data;
  const parsed = notes.map(parseNote);            // 在 Worker 里跑 O(n²) 也无所谓了
  (self as any).postMessage({ id, parsed });
};
```

配合方案 2-A（O(n²)→O(n)）后，Worker 化的收益会从「秒级」降为「毫秒级」，但**主线程零阻塞**这个性质才是「不再整体卡顿」的保证。

---

## 五、优化优先级与预期收益

| 优先级 | 方案 | 改动面 | 预期收益 | 风险 |
| --- | --- | --- | --- | --- |
| **P0** | 2-A `isInsideFence` → `computeFenceMask` | `fsrsService.ts` 1 个函数 + 3 个调用点 | 全库解析 **1~3 个数量级**提速 | 低（纯函数，可单测覆盖） |
| **P0** | 2-B 消除 `parseNote` 重复解析 | `fsrsService.ts` 2~3 处 | 解析轮次 3→1，约 **-60%** | 低 |
| **P1** | 1-A `DailyReviewPanel` 常驻不卸载 | `SpaceTimelinePanel.tsx` + `DailyReviewPanel` 1 个 prop | 进出复盘**不再重解析** | 中（需处理隐藏态 effect 早退） |
| **P1** | 1-B `activeNotes` 稳定引用 + 签名依赖 | `DailyReviewPanel.tsx` | 消除无效重跑 | 低 |
| **P1** | 3-B `manifest` 增量更新 | `useBacklinkIndex.ts` + 保存链路 | 保存闪念不再全库重建 | 中 |
| **P2** | 1-C / 2-D 分批读 + 进度 | `useVaultCards.ts`、`reviewSources.ts` | 切换时 UI 不再冻 | 低 |
| **P2** | 2-C 索引分片化 | `searchIndexService.ts` | 首次建索引可交互 | 低 |
| **P2** | 3-A 合并 chunk 通知 | `useBacklinkIndex.ts` | 减少全订阅者抖动 | 低 |
| **P2** | 3-C 快捷键监听稳定化 | `DailyReviewPanel.tsx` | 减少切换掉帧 | 低 |
| **P3** | 3-D Worker 化 | 新增 worker 文件 + 调用改造 | 主线程零阻塞（根治） | 高（构建/测试链） |

**建议落地顺序**：`2-A → 2-B → 1-A → 1-B → 3-B → 其余`。前两项是纯函数级优化，收益最大、风险最低，且能被现有 `vitest` 直接覆盖。

---

## 六、验证建议

1. **单元测试**：为 `computeFenceMask` 与 `parseFlashcards` 写等价性测试（对含围栏、含嵌套围栏边界、未闭合围栏的样本文档断言输出与原实现一致）。
2. **性能基准**：用 `vitest bench` 或独立脚本，对 500 行 / 2000 行 / 10000 行笔记分别测 `parseFlashcards` 优化前后耗时。
3. **端到端**：`scripts/` 下已有 Playwright 链路（`playwright@^1.63.0`），可脚本化「切换到 vault 源 → 记录首次可交互时间」与「timeline ⇄ review 往返 10 次 → 记录总耗时」两个指标，作为回归基线写入 `docs/TEST_BASELINE.md`。
