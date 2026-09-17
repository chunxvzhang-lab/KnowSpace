# KnowSpace · 巨石文件拆分设计（R2）

> **文档性质**：R2 拆分方案与回滚预案（release plan v2.5.0 §3.1 交付物）
> **制定时间**：2026-09-17
> **分析依据**：`CanvasView.tsx` 与 `canvasService.ts` 的逐行结构审计（🟢 实测）
> **评审检查点**：2026-09-30
> **目标版本**：`v2.5.0`

---

## 〇、口径统一（重要）

原计划与本文档曾出现**两套行数**，差异来自统计方式：

| 统计方式 | 含义 |
| :--- | :--- |
| `Measure-Object -Line` | **不含空行** —— 原计划用的口径（8451 / 3319） |
| `File.ReadAllLines().Count` | **含空行** —— 本文档采用的口径 |

**本文档统一采用「总行数（含空行）」**，因为它更直观、也是编辑器与 GitHub 显示的数字。

### 实测基线（2026-09-17）

| 文件 | 总行数 | 非空行数 | R2 目标 |
| :--- | ---: | ---: | :--- |
| `src/components/CanvasView.tsx` | **9161** | 8636 | 各模块 < 2500 |
| `src/services/canvasService.ts` | **5060** | 4535 | 各模块 < 2500 |
| `src/App.tsx` | **3589** | 3319 | R1: < 500 |
| `src/components/MindmapView.tsx` | 2284 | 2137 | 观察（已达标） |
| `src/services/fsrsService.ts` | 895 | 784 | — （F1 新增） |
| **三巨石合计** | **17,810** | 16,490 | — |

---

## 一、canvasService.ts 拆分设计

### 1.1 现状

**5060 行 / 80 个导出符号**（68 函数 + 12 类型常量），另有 34 个模块级内部符号。

**已被识别的三类隐藏耦合**：

| 耦合 | 说明 | 风险 |
| :--- | :--- | :---: |
| `getLoopEdgeIdsCached`（**未导出**） | 被 `color` 组的两个函数跨组调用 | 🔴 高 |
| `syncLoopEdgeGeometry` / `syncRingEdges` / `syncGridEdges` | 同时依赖 **环检测（graph）** 与 **环/网格检测（geometry）** | 🔴 高 |
| `DOM / Electron 桥调用` | 100% 集中在 `export` 组（3438 行之后） | 🟢 机会 |

> 💡 **第三条是拆分最大的收益点**：拆开后 `serialization` / `geometry` / `routing` / `color` / `graph` **五个模块可在无浏览器环境下测试**。

### 1.2 目标模块与依赖方向

```
              canvasPrimitives            （常量 · 类型 · 媒体工具 · 文本工具）
                     │
        ┌────────────┼────────────┐
        ↓            ↓            ↓
  canvasGeometry  canvasRouting  canvasSerialization
        ↑            （依赖 geometry）
        │
   canvasGraph                    （环检测 + 拓扑指纹缓存 + sync*）
        ↑
   canvasColor                    （调色板 · 色彩映射 · 环色分配）
        ↑
   canvasEdges                    （建边 · 派生 · 拆边 · 线型循环）

        └──────────────→ canvasExport ←──────────────┘
                    （SVG / PNG / 剪贴板 / 资源内联 · 独占 DOM）

   canvasService.ts  →  门面 re-export（保持既有 import 路径 100% 不变）
```

**依赖为单向，无环** ✅

### 1.3 模块职责划分

| 模块 | 承接内容 | 预估行数 |
| :--- | :--- | ---: |
| `canvasPrimitives.ts` | 调色板常量、标准色 id、关系预设、媒体类型判定（`getMediaFileType` / `isMediaFile` / `isImageFile` / `resolveMediaSrc`）、`toggleChecklistInMarkdown`、节点包含谓词（`isNodeInsideGroup` / `getNodesInsideGroup` / `findContainerForNode`） | ~350 |
| `canvasGeometry.ts` | 包围盒、锚点、贝塞尔控制点、折线手柄、最佳边选择、环投影、凸包与中点判定、最小环半径、环/网格检测（`computeRingLayout` / `computeGridLayout`）、环/网格对齐、间距调整（`resizeRingSpacing` / `resizeGridSpacing`）、`alignNodes` 总调度 | ~1100 |
| `canvasRouting.ts` | `AABBBox`、碰撞包络收集、线段/路径相交判定、`computeEdgePath`、`computeEdgeMidpoint` | ~330 |
| `canvasGraph.ts` | 环边判定（`getLoopEdgeIds`）+ **拓扑指纹缓存**、环色查询、环选择扩展、三个 `sync*` 函数、演示序列（`buildPresentationSequence`）、拓扑萃取（`extractCanvasToMarkdown`） | ~1050 |
| `canvasColor.ts` | 色彩规范化与相似度、环组件信息、源节点边色决策、有效边色 key、`computeSourceDisplayColorMap` | ~600 |
| `canvasSerialization.ts` | `parseCanvasData` / `serializeCanvasData` / `createDefaultCanvas` | ~270 |
| `canvasEdges.ts` | 建边、派生卡片、一对多/链式/闭环连接、断边、箭头与线型循环、方向反转 | ~620 |
| `canvasExport.ts` | 导出选项类型、SVG 生成、尺寸钳制、资源内联与 XML 合法化、PNG 栅格化、下载、剪贴板 | ~1040 |
| `canvasService.ts` | **门面**：re-export 全部 65 个外部引用的符号 | ~120 |

### 1.4 关键耦合的处理方案

**① `getLoopEdgeIdsCached` 与它的缓存**

```
现状：未导出，却被 canvasColor 的 getLoopComponentInfo / computeSourceDisplayColorMap 调用
风险：若把缓存留在原地，color 模块会产生对 graph 内部实现的依赖
方案：缓存（cachedTopologyHash / cachedLoopEdgeIds）随函数一并迁入 canvasGraph，
      并作为「模块内导出」暴露给 canvasColor —— 单向依赖，无环 ✅
```

**② 三个 `sync*` 函数的归属**

```
现状：syncGridEdges / syncRingEdges / syncLoopEdgeGeometry
      同时依赖 环检测(graph) + 环网格检测(geometry)
风险：若归入 geometry，则 geometry → graph 反向依赖，形成双向环 ❌
方案：归入 canvasGraph（其本质是"拓扑驱动的几何同步"），
      单向依赖 canvasGeometry ✅
```

**③ 正则的 `g` 标记与 `lastIndex`**

`SVG_IMAGE_TAG_RE` / `SVG_CSS_URL_RE` 带 `g` 标记，`lastIndex` 是可变状态，现于 `sanitizeSvgViaRegex` 与 `stripSvgImages` 间手动重置。**两者同属 export 组，整体迁移即可，拆分后不跨模块** ✅

**④ 门面必须覆盖的符号**

| 调用方 | 导入符号数 |
| :--- | ---: |
| `src/components/CanvasView.tsx` | 49 |
| `src/__tests__/canvas-service.test.ts` | 57 |
| `src/App.tsx` | 1 |
| **并集（门面必须覆盖）** | **65** |

> 为保证零破坏，门面**转发全部 80 个导出**（含仅内部使用与仅测试使用的符号），调用方**一行都不用改**。
>
> ⚠️ **类型导出注意**：`CanvasAlignDirection` 被 `CanvasView` 以**值导入方式**引入 —— 门面必须同时保留类型与常量导出，避免 `verbatimModuleSyntax` 下的编译错误。

---

## 二、CanvasView.tsx 拆分设计

### 2.1 现状

**9161 行**，含 **35 个 `useState`**、**46 个 `useRef`**、约 **150 个函数**，以及一个 **630 行**的全局鼠标手势 effect（3278–3910）。

### 2.2 分层目标

```
CanvasView（组合根，目标 < 800 行）
├─ hooks/
│   ├─ useCanvasData          data / history / emitChange / latestDataRef / pushHistory
│   ├─ useViewport            viewport / viewportRef / 缩放 / 平移 / rAF 节流
│   ├─ useCanvasSelection     selectedNodeIds / selectedEdgeIds 及派生选择
│   ├─ useCanvasGestures      全局 mousemove/mouseup 手势引擎（630 行 effect 拆解）
│   ├─ useCanvasHotkeys       全局键盘快捷键
│   └─ useCanvasTheme         colors / isDark / isEink
├─ CanvasToolbar              顶部工具栏（依赖面最广，最后拆）
├─ CanvasWorld                世界层容器（translate/scale）
│   ├─ CanvasEdgeLayer        svg 连线层
│   ├─ CanvasNodeLayer        卡片层
│   │   ├─ CanvasGroupNode    分组容器卡片
│   │   └─ CanvasCard         普通卡片
│   │       ├─ CardHeader / CardBody / AnchorHandles / CardFloatingMenu
│   ├─ CanvasEdgeLabelLayer   连线标签层
│   └─ CanvasMinimap          小地图
├─ CanvasContextMenu          右键菜单（再拆 Edge / Node / CanvasBackground 三个分支）
├─ CanvasModals               文件选择 / 萃取 / 导出 / 批量派生
├─ CanvasPresentation         演示控件 + 分镜抽屉
├─ CanvasEdgeBatchToolbar     连线批量工具栏
└─ CanvasChrome               Toast / 框选矩形
```

### 2.3 拆分优先级（按「内聚度 ÷ 耦合面」排序）

| 批次 | 目标模块 | 现位置 | 内聚度 | 说明 |
| :---: | :--- | :--- | :---: | :--- |
| **1** | `CanvasToast` / `MarqueeSelectionBox` | 8785–8812 / 7042–7056 | ★★★★★ | 纯视觉，零状态，热身用 |
| **1** | `CanvasModals`（4 个） | 6541–7041 | ★★★★ | 各自 4–6 个私有 state，输入输出清晰 |
| **1** | `CanvasMinimap` | 6386–6540 | ★★★★★ | 输入仅 `data/viewport/theme` + `setViewport` |
| **1** | `CanvasEdgeBatchToolbar` | 8587–8783 | ★★★★ | 输入 `selectedEdgeIds` + 6 个回调 |
| **2** | `CanvasEdgeLayer` | 4942–5280 | ★★★★ | 输入 `edges/nodeMap/selected*/theme` + 回调集合 |
| **2** | `CanvasEdgeLabelLayer` | 6169–6383 | ★★★★ | 与连线层同构 |
| **2** | `EdgeContextMenu` | 7090–7673 | ★★★★★ | 三个互斥分支之一 |
| **3** | `CanvasNodeLayer`（含卡片子组件） | 5283–6167 | ★★★ | 卡片内部可再拆 Header/Body/Anchors/浮动菜单 |
| **3** | `NodeContextMenu` | 7674–8361 | ★★★★ | 三个互斥分支之一 |
| **4** | `CanvasPresentation` | 8817–9043 | ★★★ | 输入 `presentationSequence/currentSlideIndex/...` |
| **4** | `CanvasContextMenu` 背景分支 | 8362–8585 | ★★★★ | 收口三个分支 |
| **5** | `CanvasToolbar` | 4372–4919 | ★★ | 依赖选择/历史/视口/模态/演示，最后拆 |
| **5** | `hooks/*`（6 个） | 分散 | ★★ | 需要模块边界稳定后再抽取 |

### 2.4 最难处理的 6 个共享状态

拆分时**必须上提到最近的公共祖先**（或放进 Store / Context），否则会形成 prop-drilling 反模式：

| # | 共享物 | 被哪些域使用 | 处理方式 |
| :---: | :--- | :--- | :--- |
| 1 | `latestDataRef` | **几乎所有编辑函数**（绕过闭包陈旧） | `useCanvasData` 内部持有，通过 hook 返回值暴露 |
| 2 | `data` + `pushHistory` + `emitChange` | 所有写路径的三件套 | 同上 |
| 3 | `viewport` / `viewportRef` | 手势、滚轮、小地图、框选坐标换算、演示聚焦、工具栏 | `useViewport` |
| 4 | `selectedNodeIds` / `selectedEdgeIds` | 卡片层、连线层、工具栏、右键菜单、键盘、框选、拖拽 | `useCanvasSelection` |
| 5 | `containerRef` | 所有 client↔canvas 坐标换算 | 组合根持有，向下传 ref |
| 6 | `connectingState` / `nodeDragRef` 等会话 refs | 「写在外层事件、读在全局 effect」 | `useCanvasGestures` 内闭包持有，外层经它暴露的 API 写入 |

### 2.5 630 行手势 effect 的拆解

现状：单个 `useEffect`（3278–3910）内含 **7 个分支** + 撤销/清理逻辑。

| 分支 | 现行号 | 拆解方向 |
| :--- | :--- | :--- |
| 折线拐点拖拽 | 3281–3301 | `useStepBendDrag` |
| 组整体拖移 | 3306–3348 | `useGroupDrag` |
| 框选 | 3351–3413 | `useBoxSelection` |
| 画布平移 | 3416–3436 | `useCanvasPan` |
| 节点拖拽 | 3439–3571 | `useNodeDrag` |
| 卡片缩放 | 3574–3609 | `useNodeResize` |
| 锚点连线 | 3611–3630 | `useEdgeConnect` |

> 建议先在 **Batch 2–3** 期间把这些分支**提取为同文件内的具名函数**（降复杂度、不改行为），待模块边界稳定后在 **Batch 5** 统一迁入 `useCanvasGestures` 的各子 hook。

---

## 三、执行计划

### 3.1 批次划分

| 批次 | 内容 | 窗口 | 出口标准 |
| :---: | :--- | :--- | :--- |
| **B1** | canvasService 拆分（含门面） | 10/06 – 10/16 | 全量测试绿 + 65 符号调用方零改动 |
| **B2** | CanvasView 低耦合层（Toast / Modals / Minimap / EdgeBatchToolbar） | 10/06 – 10/12 | 同上 + 手动回归（小地图/导出/右键） |
| **B3** | 连线层 + 标签层 + EdgeContextMenu | 10/13 – 10/20 | 同上 + 连线回归（绕障/环色/折点） |
| **B4** | 卡片层 + NodeContextMenu | 10/20 – 10/28 | 同上 + 卡片回归（拖拽/调距/分组/媒体） |
| **B5** | 演示层 + 工具栏 + hooks 抽取 | 10/28 – 11/02 | 同上 + F5 演播回归 + 性能对照 |

### 3.2 每批的固定动作

```
① 提取模块（不改行为，纯搬移 + 接口定义）
② npx tsc --noEmit                        → 0 错误
③ node scripts/capture-test-baseline.cjs   → 与基线逐文件对比，用例数不得下降
④ 手动回归该批对应的清单项
⑤ 提交（单批单 commit，便于回滚）
⑥ 行数复核：新模块是否 < 2500
```

### 3.3 回滚策略

| 级别 | 触发 | 动作 |
| :--- | :--- | :--- |
| 批次内 | tsc 报错 / 测试失败 | 未提交则直接丢弃；已提交则 `git revert` 该批 commit |
| 批次后 | 手动回归发现行为变化 | revert 该批 commit，重新设计接口后再执行 |
| 阶段级 | 拆分后性能明显回退 | 保留低耦合层成果，回退卡片/连线层，改用「门面 + 少量抽取」保守方案 |
| 版本级 | 多批均失败 | 触发计划 §5.2 降级：**R2 顺延 v2.6.0**，本版聚焦 R1 + F1 |

> **核心保障**：拆分期间**不改变任何运行时行为**。任何需要"顺手改逻辑"的想法一律拆成独立提交，与搬移分离。

---

## 四、验收对照

| 验收项（来自 v2.5.0 计划 §3.1 R2） | 本设计的对应措施 |
| :--- | :--- |
| 拆分后单文件均 < 2500 行 | §1.3 预估最大模块 1100 行；§3.2 步骤⑥ 每批复核 |
| 白板相关测试全部通过 | §3.2 步骤③ 逐文件对比基线（`canvas-service` 98 项 + `canvas-view` 54 项） |
| 手动回归清单全通过 | §3.2 步骤④ 按批分域回归，清单见计划 §7.3 |
| 性能无回退 | §3.2 步骤④ 含拖动帧率对照；导出链路模块化后 DOM 集中，无新增开销 |
| （附加）低层模块可脱离浏览器测试 | §1.1 第三条收益点 |

---

## 五、风险登记

| ID | 风险 | 等级 | 应对 |
| :--- | :--- | :---: | :--- |
| **S-1** | 搬移过程中无心改动逻辑 | 🔴 高 | 纯搬移 + 独立提交；每批跑基线对比 |
| **S-2** | `getLoopEdgeIdsCached` 缓存跨模块后失效或重复 | 🔴 高 | 缓存与函数同迁 graph 模块（§1.4 ①）；测试覆盖拖拽路径 |
| **S-3** | `sync*` 归属错误导致循环依赖 | 🟠 中 | 归入 graph，单向依赖 geometry（§1.4 ②） |
| **S-4** | 类型导出丢失（`verbatimModuleSyntax`） | 🟠 中 | 门面转发全部 80 个符号；`tsc --noEmit` 把关 |
| **S-5** | CanvasView 共享状态上提后 props 爆炸 | 🟠 中 | 按 §2.4 收敛到 6 个 hook，而非逐层透传 |
| **S-6** | 与 R1（Zustand）改动冲突 | 🟠 中 | 文件归属：R2 独占 `CanvasView*` / `canvasService*`；R1 独占 `store/` 与 `App.tsx` |

---

## 六、文档维护

- 每批完成后更新 §3.1 的出口标准勾选状态
- 若某批被迫回滚，在 §5 记录原因与决策时间
- 09/30 评审：确认本设计，或按 §5 降级为「门面 + 低耦合层」保守方案
