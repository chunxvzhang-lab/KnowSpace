# KnowSpace · 测试基线快照

> **文档性质**：重构安全网的权威口径（release plan R3 交付物）
> **生成时间**：2026-09-21
> **应用版本**：`2.6.4`
> **生成方式**：`node scripts/capture-test-baseline.cjs`（自动生成，请勿手工编辑）

---

## 一、总览

| 项目 | 数值 |
| :--- | ---: |
| 测试文件 | **107** |
| 用例总数 | **1324** |
| 通过 | 1323 |
| 失败 | 0 |
| 跳过 | 1 |
| 通过率 | 99.9% |

> ✅ **口径确认**：`vitest.config.ts` **未配置任何 `exclude`**，因此上述数字是全量真实口径。
> 此前文档中出现过的 299 / 379 均为**历史阶段的过时数字**，不是被排除的测试。

---

## 二、按文件的用例分布

| 测试文件 | 用例数 | 状态 |
| :--- | ---: | :---: |
| `src/__tests__/canvas-service.test.ts` | 98 | ✅ |
| `src/__tests__/mindmap-sidecar.test.ts` | 82 | ✅ |
| `src/__tests__/fsrs-service.test.ts` | 70 | ✅ |
| `src/__tests__/mindmap-layouts.test.ts` | 69 | ✅ |
| `src/__tests__/canvas-view.test.tsx` | 58 | ✅ |
| `src/__tests__/mindmap-import.test.ts` | 48 | ✅ |
| `src/__tests__/daily-review-panel.test.tsx` | 38 | ✅ |
| `src/__tests__/ui-store.test.ts` | 35 | ✅ |
| `src/__tests__/tab-store.test.ts` | 34 | ✅ |
| `src/__tests__/mindmap-reparent.test.ts` | 32 | ✅ |
| `src/__tests__/review-sources.test.tsx` | 29 | ✅ |
| `src/__tests__/mindmap-themes.test.ts` | 28 | ✅ |
| `src/__tests__/flash-capsule-theme-contrast.test.ts` | 25 | ✅ |
| `src/__tests__/mindmap-collapse-persistence.test.tsx` | 24 | ✅ |
| `src/__tests__/mindmap.test.ts` | 23 | ✅ |
| `src/__tests__/search-index-service.test.ts` | 20 | ✅ |
| `src/__tests__/column-resize.test.tsx` | 19 | ✅ |
| `src/__tests__/markdown-files.test.ts` | 19 | ✅ |
| `src/__tests__/vault-store.test.ts` | 19 | ✅ |
| `src/__tests__/canvas-card-interactions.test.tsx` | 15 | ✅ |
| `src/__tests__/mindmap-svg-export.test.tsx` | 15 | ✅ |
| `src/__tests__/table-generator.test.ts` | 14 | ✅ |
| `src/__tests__/document-creation.test.ts` | 13 | ✅ |
| `src/__tests__/mindmap-export-ecosystem.test.ts` | 13 | ✅ |
| `src/__tests__/backlink-index-hook.test.ts` | 12 | ✅ |
| `src/__tests__/mindmap-relations.test.ts` | 12 | ✅ |
| `src/__tests__/slash-command-trigger.test.ts` | 12 | ✅ |
| `src/__tests__/app-smoke.test.tsx` | 11 | ✅ |
| `src/__tests__/editor-context-menu.test.ts` | 10 | ✅ |
| `src/__tests__/mindmap-xmind-export.test.tsx` | 10 | ✅ |
| `src/__tests__/wheel-scroll-guard.test.ts` | 10 | ✅ |
| `src/__tests__/flash-capsule.test.ts` | 9 | ✅ |
| `src/__tests__/graph.test.ts` | 9 | ✅ |
| `src/__tests__/inflate.test.ts` | 9 | ✅ |
| `src/__tests__/zip.test.ts` | 9 | ✅ |
| `src/__tests__/fsrs-verification.test.ts` | 8 | ✅ |
| `src/__tests__/markdown-v150.test.ts` | 8 | ✅ |
| `src/__tests__/mindmap-icons-ui.test.tsx` | 8 | ✅ |
| `src/__tests__/mindmap-marker-table.test.ts` | 8 | ✅ |
| `src/__tests__/mindmap-node-style-menu.test.tsx` | 8 | ✅ |
| `src/__tests__/mindmap-relation-settings-ui.test.tsx` | 8 | ✅ |
| `src/__tests__/backlink.test.ts` | 7 | ✅ |
| `src/__tests__/graph-and-directory.test.ts` | 7 | ✅ |
| `src/__tests__/graph-depth-clustering.test.ts` | 7 | ✅ |
| `src/__tests__/mindmap-boundaries-ui.test.tsx` | 7 | ✅ |
| `src/__tests__/mindmap-floating-annotations-ui.test.tsx` | 7 | ✅ |
| `src/__tests__/mindmap-floating-ui.test.tsx` | 7 | ✅ |
| `src/__tests__/mindmap-groups.test.ts` | 7 | ✅ |
| `src/__tests__/mindmap-icon-table.test.ts` | 7 | ✅ |
| `src/__tests__/mindmap-links-ui.test.tsx` | 7 | ✅ |
| `src/__tests__/mindmap-notes.test.tsx` | 7 | ✅ |
| `src/__tests__/mindmap-sides.test.ts` | 7 | ✅ |
| `src/__tests__/mindmap-tags-ui.test.tsx` | 7 | ✅ |
| `src/__tests__/review-focus.test.tsx` | 7 | ✅ |
| `src/__tests__/review-source-reader.test.ts` | 7 | ✅ |
| `src/__tests__/theme-mode.test.ts` | 7 | ✅ |
| `src/__tests__/css-custom-properties.test.ts` | 6 | ✅ |
| `src/__tests__/dialogs-conflict-about.test.tsx` | 6 | ✅ |
| `src/__tests__/diff-service.test.ts` | 6 | ✅ |
| `src/__tests__/mindmap-link-parse.test.ts` | 6 | ✅ |
| `src/__tests__/mindmap-marks-ui.test.tsx` | 6 | ✅ |
| `src/__tests__/mindmap-numbering-ui.test.tsx` | 6 | ✅ |
| `src/__tests__/mindmap-relations-ui.test.tsx` | 6 | ✅ |
| `src/__tests__/mindmap-side-choice.test.tsx` | 6 | ✅ |
| `src/__tests__/mindmap-summaries-ui.test.tsx` | 6 | ✅ |
| `src/__tests__/rename-refactor.test.ts` | 6 | ✅ |
| `src/__tests__/search-hook.test.ts` | 6 | ✅ |
| `src/__tests__/space-timeline.test.ts` | 6 | ✅ |
| `src/__tests__/sync-selection.test.ts` | 6 | ✅ |
| `src/__tests__/blocklink.test.ts` | 5 | ✅ |
| `src/__tests__/book-source.test.ts` | 5 | ✅ |
| `src/__tests__/global-shortcuts-hook.test.ts` | 5 | ✅ |
| `src/__tests__/media-lightbox.test.tsx` | 5 | ✅ |
| `src/__tests__/mindmap-alignment.test.tsx` | 5 | ✅ |
| `src/__tests__/mindmap-link-badge.test.tsx` | 5 | ✅ |
| `src/__tests__/mindmap-numbering.test.ts` | 5 | ✅ |
| `src/__tests__/slash-commands.test.ts` | 5 | ✅ |
| `src/__tests__/status-bar.test.tsx` | 5 | ✅ |
| `src/__tests__/svg-export.test.ts` | 5 | ✅ |
| `src/__tests__/vault-opening.test.ts` | 5 | ✅ |
| `src/__tests__/chapter-list.test.tsx` | 4 | ✅ |
| `src/__tests__/command-palette.test.ts` | 4 | ✅ |
| `src/__tests__/editor-context-menu-component.test.tsx` | 4 | ✅ |
| `src/__tests__/file-download.test.ts` | 4 | ✅ |
| `src/__tests__/mermaid-service.test.ts` | 4 | ✅ |
| `src/__tests__/mindmap-palette.test.ts` | 4 | ✅ |
| `src/__tests__/mindmap-wheel-menu.test.tsx` | 4 | ✅ |
| `src/__tests__/print-pdf.test.ts` | 4 | ✅ |
| `src/__tests__/storage.test.ts` | 4 | ✅ |
| `src/__tests__/toc-and-bookmarks.test.tsx` | 4 | ✅ |
| `src/__tests__/web-snapshot-service.test.ts` | 4 | ✅ |
| `src/__tests__/wikilink.test.ts` | 4 | ✅ |
| `src/__tests__/backlinks-panel.test.tsx` | 3 | ✅ |
| `src/__tests__/css-animation-keyframes.test.ts` | 3 | ✅ |
| `src/__tests__/mindmap-bounds.test.ts` | 3 | ✅ |
| `src/__tests__/mindmap-shortcut-scope.test.tsx` | 3 | ✅ |
| `src/__tests__/paths.test.ts` | 3 | ✅ |
| `src/__tests__/search-panel.test.tsx` | 3 | ✅ |
| `src/__tests__/snapshots-node.test.ts` | 3 | ✅ |
| `src/__tests__/sync-scroll.test.ts` | 3 | ✅ |
| `src/__tests__/tab-bar-split.test.tsx` | 3 | ✅ |
| `src/__tests__/theme-eink.test.ts` | 3 | ✅ |
| `src/__tests__/mindmap-layout-performance.test.ts` | 2 | ✅ |
| `src/__tests__/version-history-dialog.test.tsx` | 2 | ✅ |
| `src/__tests__/bench-vault-parse.test.ts` | 1 | ✅ |
| `src/__tests__/document-session.test.ts` | 1 | ✅ |
| `src/__tests__/reader-pane-mermaid.test.tsx` | 1 | ✅ |

---

## 三、重构相关的关键模块规模

> 用于跟踪 release plan 中 R1（`App.tsx` < 500 行）与 R2（白板模块 < 2500 行）的达标情况。

| 文件 | 当前行数 | 目标 |
| :--- | ---: | :--- |
| `src/components/CanvasView.tsx` | 6710 | R2 待拆分: 目标各模块 < 2500 行 |
| `src/App.tsx` | 2295 | R1: < 500 行 |
| `src/services/canvasGraph.ts` | 1152 | R2 已拆分 ✅ |
| `src/services/canvasExport.ts` | 1075 | R2 已拆分 ✅ |
| `src/services/canvasGeometry.ts` | 1021 | R2 已拆分 ✅ |
| `src/services/canvasService.ts` | 127 | R2 门面（127 行）✅ |
| `src/services/fsrsService.ts` | 1014 | F1 新增 · 观察项 |
| `src/components/MindmapView.tsx` | 3547 | 观察项（已达标） |
| `src/services/mindmapService.ts` | 1194 | 观察项 |

---

## 四、回归判定基线

任何重构都必须满足：

1. 用例总数 **不低于 1324**（删除测试需在 PR 说明中论证）
2. 通过率 **100%**
3. 单文件用例数**不得下降**（防止测试被静默删除）

> 复核方式：改动前后各跑一次 `node scripts/capture-test-baseline.cjs`，对比本文档「按文件分布」表。
