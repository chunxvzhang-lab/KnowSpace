# KnowSpace · 质量棘轮基线

> **文档性质**：代码质量债务的权威口径（与 `TEST_BASELINE.md` 同规格）
> **生成时间**：2026-10-05
> **应用版本**：`2.7.5`
> **生成方式**：`node scripts/quality-ratchet.cjs`（自动生成，**禁止手工编辑**）
> **判定规则**：CI 中 `--check` 比对，门控指标只许改善不许恶化；放宽基线必须走评审
> 并留下记录（改生成脚本的方法论，而不是改本文件）。

---

## 一、棘轮指标

| 指标 | 基线值 | 规则 |
| :--- | ---: | :--- |
| `colon-any` | 30 | 只减不增（`: any`，含 `any[]`；不含 `Array<any>` 泛型） |
| `as-any` | 10 | 只减不增（`as any`） |
| `files-over-1000-lines` | 0 | 只减不增（src 非测试代码，> 1000 行） |
| `max-file-lines` | 962 | 只减不增（最大单文件行数） |
| `styles-css-lines` | 2256 | 只减不增（阶段 B：CSS 按**连续前缀**外迁到 src/styles/*.css；回升意味着有人手工折叠了切片，那会改级联） |
| `undeclared-imports` | 0 | 必须为 0（src 中 import 的第三方包必须在 package.json 显式声明，防幽灵依赖） |
| `src-lines` | 71257 | 记录趋势，不设闸 |
| `test-cases` | 见 `TEST_BASELINE.md` | 只增不减——由测试基线守护，本文件不重复设闸 |

---

## 二、超 1000 行文件清单（拆分进度看板）

| 文件 | 行数 |
| :--- | ---: |

---

## 三、CSS 拆分进度看板（阶段 B）

`src/styles.css` 的按域外迁清单。**顺序即级联**：下表顺序 = `src/main.tsx` 的
import 顺序 = 拆分前 styles.css 内的物理顺序；只有连续前缀可以外迁（见
`scripts/split-styles-css.cjs` 的重组证明）。

| 文件 | 行数 |
| :--- | ---: |
| `src/styles/tokens.css`（切片） | 251 |
| `src/styles/shell.css`（切片） | 777 |
| `src/styles/sidebar.css`（切片） | 785 |
| `src/styles/workspace.css`（切片） | 180 |
| `src/styles/reader.css`（切片） | 591 |
| `src/styles/code.css`（切片） | 410 |
| `src/styles/statusbar.css`（切片） | 104 |
| `src/styles/dialogs.css`（切片） | 376 |
| `src/styles/search-nav.css`（切片） | 132 |
| `src/styles/gutter.css`（切片） | 53 |
| `src/styles/about.css`（切片） | 526 |
| `src/styles/tabbar.css`（切片） | 169 |
| `src/styles/copy-header.css`（切片） | 70 |
| `src/styles/lightbox.css`（切片） | 158 |
| `src/styles/fullscreen.css`（切片） | 133 |
| `src/styles/dual-split.css`（切片） | 256 |
| `src/styles/capsule.css`（切片） | 873 |
| `src/styles/capsule-panel.css`（切片） | 618 |
| `src/styles/space-timeline.css`（切片） | 658 |
| `src/styles/review-panel.css`（切片） | 511 |
| `src/styles/backlinks-panel.css`（切片） | 454 |
| `src/styles/graph.css`（切片） | 893 |
| `src/styles/graph-workspace.css`（切片） | 538 |
| `src/styles/mindmap.css`（切片） | 915 |
| `src/styles/blocklink.css`（切片） | 198 |
| `src/styles/editor-context-menu.css`（切片） | 720 |
| `src/styles/mindmap-search.css`（切片） | 120 |
| `src/styles.css`（剩余） | 2256 |

---

## 四、类型逃逸清单

### `: any`

| 位置 | 代码 |
| :--- | :--- |
| `src/components/DocumentWorkspace.tsx:33` | `: any) => void;` |
| `src/components/DualDocumentWorkspace.tsx:33` | `: any) => void;` |
| `src/components/EditorPane.tsx:590` | `: any, from: number, to: number) => {` |
| `src/components/EditorPane.tsx:619` | `: any, from: number, to: number) => {` |
| `src/components/EditorPane.tsx:656` | `: any, from: number, to: number) => {` |
| `src/components/GlobalGraphDialog.tsx:245` | `: any) => {` |
| `src/components/GlobalGraphDialog.tsx:249` | `: any) => {` |
| `src/components/GlobalGraphDialog.tsx:253` | `: any) => {` |
| `src/components/GlobalGraphDialog.tsx:361` | `: any) => positions.get(node.data("id"))` |
| `src/components/GlobalGraphDialog.tsx:446` | `: any) => Boolean(e.data("isCrossFolder"` |
| `src/components/GlobalGraphDialog.tsx:512` | `: any) => Boolean(e.data("isCrossFolder"` |
| `src/components/GlobalGraphDialog.tsx:586` | `: any) => {` |
| `src/components/GlobalGraphDialog.tsx:607` | `: any) => Boolean(e.data("isCrossFolder"` |
| `src/components/graph/graphCytoscapeStyle.ts:66` | `: any) => {` |
| `src/components/graph/graphCytoscapeStyle.ts:70` | `: any) => {` |
| `src/components/graph/graphCytoscapeStyle.ts:74` | `: any) => {` |
| `src/components/graph/useCytoscapeGraph.ts:176` | `: any) => positions.get(node.data("id"))` |
| `src/components/graph/useCytoscapeGraph.ts:250` | `: any) => Boolean(e.data("isCrossFolder"` |
| `src/components/graph/useCytoscapeGraph.ts:331` | `: any) => Boolean(e.data("isCrossFolder"` |
| `src/components/graph/useCytoscapeGraph.ts:449` | `: any) => {` |
| `src/components/graph/useCytoscapeGraph.ts:470` | `: any) =>` |
| `src/components/LocalGraphView.tsx:92` | `: any) => {` |
| `src/components/LocalGraphView.tsx:96` | `: any) => {` |
| `src/components/LocalGraphView.tsx:100` | `: any) => {` |
| `src/components/LocalGraphView.tsx:141` | `: any) => (node.data("isCurrent") ? 2 :` |
| `src/hooks/useBacklinkIndex.ts:374` | `: any) {` |
| `src/hooks/useDocumentCreation.ts:206` | `: any) {` |
| `src/hooks/useDocumentCreation.ts:287` | `: any) {` |
| `src/services/markdownPlugins.ts:128` | `: any, silent: boolean) => {` |
| `src/services/mindmapSidecarRead.ts:51` | `: any of them written as something other` |

### `as any`

| 位置 | 代码 |
| :--- | :--- |
| `src/components/GlobalGraphDialog.tsx:358` | `as any,` |
| `src/components/GlobalGraphDialog.tsx:362` | `as any,` |
| `src/components/GlobalGraphDialog.tsx:510` | `as any)` |
| `src/components/GlobalGraphDialog.tsx:759` | `as any)}` |
| `src/components/graph/graphCytoscapeStyle.ts:207` | `as any;` |
| `src/components/graph/useCytoscapeGraph.ts:177` | `as any,` |
| `src/components/graph/useCytoscapeGraph.ts:329` | `as any)` |
| `src/components/LocalGraphView.tsx:138` | `as any,` |
| `src/components/LocalGraphView.tsx:146` | `as any,` |
| `src/services/markdownPlugins.ts:88` | `as any)("block_anchor", "span", 0);` |

---

## 五、未声明的第三方 import（幽灵依赖清单，必须为空）

| 位置 | 包名 |
| :--- | :--- |
