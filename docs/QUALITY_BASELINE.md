# KnowSpace · 质量棘轮基线

> **文档性质**：代码质量债务的权威口径（与 `TEST_BASELINE.md` 同规格）
> **生成时间**：2026-09-26
> **应用版本**：`2.6.5`
> **生成方式**：`node scripts/quality-ratchet.cjs`（自动生成，**禁止手工编辑**）
> **判定规则**：CI 中 `--check` 比对，门控指标只许改善不许恶化；放宽基线必须走评审
> 并留下记录（改生成脚本的方法论，而不是改本文件）。

---

## 一、棘轮指标

| 指标 | 基线值 | 规则 |
| :--- | ---: | :--- |
| `colon-any` | 33 | 只减不增（`: any`，含 `any[]`；不含 `Array<any>` 泛型） |
| `as-any` | 10 | 只减不增（`as any`） |
| `files-over-1000-lines` | 15 | 只减不增（src 非测试代码，> 1000 行） |
| `max-file-lines` | 6710 | 只减不增（最大单文件行数） |
| `src-lines` | 56635 | 记录趋势，不设闸 |
| `test-cases` | 见 `TEST_BASELINE.md` | 只增不减——由测试基线守护，本文件不重复设闸 |

---

## 二、超 1000 行文件清单（拆分进度看板）

| 文件 | 行数 |
| :--- | ---: |
| `src/components/CanvasView.tsx` | 6710 |
| `src/components/MindmapView.tsx` | 3547 |
| `src/App.tsx` | 2412 |
| `src/services/mindmapLayout.ts` | 1261 |
| `src/components/DailyReviewPanel.tsx` | 1233 |
| `src/services/mindmapSidecar.ts` | 1201 |
| `src/services/mindmapService.ts` | 1194 |
| `src/services/canvasGraph.ts` | 1152 |
| `src/components/FlashCapsule.tsx` | 1098 |
| `src/services/markdown.ts` | 1088 |
| `src/services/canvasExport.ts` | 1075 |
| `src/components/EditorContextMenu.tsx` | 1064 |
| `src/components/GraphViewPane.tsx` | 1059 |
| `src/services/fsrsService.ts` | 1050 |
| `src/services/canvasGeometry.ts` | 1021 |

---

## 三、类型逃逸清单

### `: any`

| 位置 | 代码 |
| :--- | :--- |
| `src/App.tsx:746` | `: any) {` |
| `src/App.tsx:1740` | `: any) {` |
| `src/App.tsx:1781` | `: any) => {` |
| `src/components/DocumentWorkspace.tsx:33` | `: any) => void;` |
| `src/components/DualDocumentWorkspace.tsx:33` | `: any) => void;` |
| `src/components/EditorPane.tsx:488` | `: any, from: number, to: number) => {` |
| `src/components/EditorPane.tsx:517` | `: any, from: number, to: number) => {` |
| `src/components/EditorPane.tsx:554` | `: any, from: number, to: number) => {` |
| `src/components/GlobalGraphDialog.tsx:237` | `: any) => {` |
| `src/components/GlobalGraphDialog.tsx:241` | `: any) => {` |
| `src/components/GlobalGraphDialog.tsx:245` | `: any) => {` |
| `src/components/GlobalGraphDialog.tsx:353` | `: any) => positions.get(node.data("id"))` |
| `src/components/GlobalGraphDialog.tsx:438` | `: any) => Boolean(e.data("isCrossFolder"` |
| `src/components/GlobalGraphDialog.tsx:502` | `: any) => Boolean(e.data("isCrossFolder"` |
| `src/components/GlobalGraphDialog.tsx:576` | `: any) => {` |
| `src/components/GlobalGraphDialog.tsx:597` | `: any) => Boolean(e.data("isCrossFolder"` |
| `src/components/GraphViewPane.tsx:243` | `: any) => {` |
| `src/components/GraphViewPane.tsx:247` | `: any) => {` |
| `src/components/GraphViewPane.tsx:251` | `: any) => {` |
| `src/components/GraphViewPane.tsx:387` | `: any) => positions.get(node.data("id"))` |
| `src/components/GraphViewPane.tsx:461` | `: any) => Boolean(e.data("isCrossFolder"` |
| `src/components/GraphViewPane.tsx:540` | `: any) => Boolean(e.data("isCrossFolder"` |
| `src/components/GraphViewPane.tsx:637` | `: any) => {` |
| `src/components/GraphViewPane.tsx:658` | `: any) => Boolean(e.data("isCrossFolder"` |
| `src/components/LocalGraphView.tsx:88` | `: any) => {` |
| `src/components/LocalGraphView.tsx:92` | `: any) => {` |
| `src/components/LocalGraphView.tsx:96` | `: any) => {` |
| `src/components/LocalGraphView.tsx:137` | `: any) => (node.data("isCurrent") ? 2 :` |
| `src/hooks/useBacklinkIndex.ts:327` | `: any) {` |
| `src/hooks/useDocumentCreation.ts:203` | `: any) {` |
| `src/hooks/useDocumentCreation.ts:283` | `: any) {` |
| `src/services/markdown.ts:1007` | `: any, silent: boolean) => {` |
| `src/services/mindmapSidecar.ts:373` | `: any of them written as something other` |

### `as any`

| 位置 | 代码 |
| :--- | :--- |
| `src/components/GlobalGraphDialog.tsx:350` | `as any,` |
| `src/components/GlobalGraphDialog.tsx:354` | `as any,` |
| `src/components/GlobalGraphDialog.tsx:502` | `as any).connectedEdges().filter((e: any)` |
| `src/components/GlobalGraphDialog.tsx:753` | `as any)}` |
| `src/components/GraphViewPane.tsx:384` | `as any,` |
| `src/components/GraphViewPane.tsx:388` | `as any,` |
| `src/components/GraphViewPane.tsx:540` | `as any).connectedEdges().filter((e: any)` |
| `src/components/LocalGraphView.tsx:134` | `as any,` |
| `src/components/LocalGraphView.tsx:142` | `as any,` |
| `src/services/markdown.ts:967` | `as any)("block_anchor", "span", 0);` |
