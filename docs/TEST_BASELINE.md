# KnowSpace · 测试基线快照

> **文档性质**：重构安全网的权威口径（release plan R3 交付物）
> **生成时间**：2026-09-17
> **应用版本**：`2.4.0`
> **生成方式**：`node scripts/capture-test-baseline.cjs`（自动生成，请勿手工编辑）

---

## 一、总览

| 项目 | 数值 |
| :--- | ---: |
| 测试文件 | **44** |
| 用例总数 | **454** |
| 通过 | 454 |
| 失败 | 0 |
| 跳过 | 0 |
| 通过率 | 100.0% |

> ✅ **口径确认**：`vitest.config.ts` **未配置任何 `exclude`**，因此上述数字是全量真实口径。
> 此前文档中出现过的 299 / 379 均为**历史阶段的过时数字**，不是被排除的测试。

---

## 二、按文件的用例分布

| 测试文件 | 用例数 | 状态 |
| :--- | ---: | :---: |
| `src/__tests__/canvas-service.test.ts` | 98 | ✅ |
| `src/__tests__/fsrs-service.test.ts` | 70 | ✅ |
| `src/__tests__/canvas-view.test.tsx` | 54 | ✅ |
| `src/__tests__/mindmap.test.ts` | 23 | ✅ |
| `src/__tests__/search-index-service.test.ts` | 20 | ✅ |
| `src/__tests__/editor-context-menu.test.ts` | 10 | ✅ |
| `src/__tests__/flash-capsule.test.ts` | 9 | ✅ |
| `src/__tests__/graph.test.ts` | 9 | ✅ |
| `src/__tests__/markdown-files.test.ts` | 9 | ✅ |
| `src/__tests__/markdown-v150.test.ts` | 8 | ✅ |
| `src/__tests__/backlink.test.ts` | 7 | ✅ |
| `src/__tests__/graph-and-directory.test.ts` | 7 | ✅ |
| `src/__tests__/graph-depth-clustering.test.ts` | 7 | ✅ |
| `src/__tests__/dialogs-conflict-about.test.tsx` | 6 | ✅ |
| `src/__tests__/diff-service.test.ts` | 6 | ✅ |
| `src/__tests__/rename-refactor.test.ts` | 6 | ✅ |
| `src/__tests__/space-timeline.test.ts` | 6 | ✅ |
| `src/__tests__/sync-selection.test.ts` | 6 | ✅ |
| `src/__tests__/blocklink.test.ts` | 5 | ✅ |
| `src/__tests__/media-lightbox.test.tsx` | 5 | ✅ |
| `src/__tests__/mindmap-alignment.test.tsx` | 5 | ✅ |
| `src/__tests__/mindmap-reparent.test.ts` | 5 | ✅ |
| `src/__tests__/status-bar.test.tsx` | 5 | ✅ |
| `src/__tests__/svg-export.test.ts` | 5 | ✅ |
| `src/__tests__/command-palette.test.ts` | 4 | ✅ |
| `src/__tests__/editor-context-menu-component.test.tsx` | 4 | ✅ |
| `src/__tests__/mermaid-service.test.ts` | 4 | ✅ |
| `src/__tests__/mindmap-export-ecosystem.test.ts` | 4 | ✅ |
| `src/__tests__/storage.test.ts` | 4 | ✅ |
| `src/__tests__/toc-and-bookmarks.test.tsx` | 4 | ✅ |
| `src/__tests__/web-snapshot-service.test.ts` | 4 | ✅ |
| `src/__tests__/wikilink.test.ts` | 4 | ✅ |
| `src/__tests__/backlinks-panel.test.tsx` | 3 | ✅ |
| `src/__tests__/chapter-list.test.tsx` | 3 | ✅ |
| `src/__tests__/print-pdf.test.ts` | 3 | ✅ |
| `src/__tests__/search-panel.test.tsx` | 3 | ✅ |
| `src/__tests__/slash-commands.test.ts` | 3 | ✅ |
| `src/__tests__/snapshots-node.test.ts` | 3 | ✅ |
| `src/__tests__/sync-scroll.test.ts` | 3 | ✅ |
| `src/__tests__/tab-bar-split.test.tsx` | 3 | ✅ |
| `src/__tests__/theme-eink.test.ts` | 3 | ✅ |
| `src/__tests__/version-history-dialog.test.tsx` | 2 | ✅ |
| `src/__tests__/document-session.test.ts` | 1 | ✅ |
| `src/__tests__/reader-pane-mermaid.test.tsx` | 1 | ✅ |

---

## 三、重构相关的关键模块规模

> 用于跟踪 release plan 中 R1（`App.tsx` < 500 行）与 R2（白板模块 < 2500 行）的达标情况。

| 文件 | 当前行数 | 目标 |
| :--- | ---: | :--- |
| `src/components/CanvasView.tsx` | 9161 | R2 待拆分: 目标各模块 < 2500 行 |
| `src/App.tsx` | 3589 | R1: < 500 行 |
| `src/services/canvasGraph.ts` | 1152 | R2 已拆分 ✅ |
| `src/services/canvasExport.ts` | 1081 | R2 已拆分 ✅ |
| `src/services/canvasGeometry.ts` | 1027 | R2 已拆分 ✅ |
| `src/services/canvasService.ts` | 127 | R2 门面（127 行）✅ |
| `src/services/fsrsService.ts` | 895 | F1 新增 · 观察项 |
| `src/components/MindmapView.tsx` | 2284 | 观察项（已达标） |
| `src/services/mindmapService.ts` | 1241 | 观察项 |

---

## 四、回归判定基线

任何重构都必须满足：

1. 用例总数 **不低于 454**（删除测试需在 PR 说明中论证）
2. 通过率 **100%**
3. 单文件用例数**不得下降**（防止测试被静默删除）

> 复核方式：改动前后各跑一次 `node scripts/capture-test-baseline.cjs`，对比本文档「按文件分布」表。
