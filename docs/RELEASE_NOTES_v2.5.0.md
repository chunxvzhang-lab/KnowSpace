# 🚀 KnowSpace v2.5.0

**KnowSpace · Personal Knowledge Workspace（现代化个人知识工作台）**
> **Write. Read. Connect. Know.（记录 · 阅读 · 连接 · 认知）**

**KnowSpace v2.5.0 正式发布！**

本版是 KnowSpace 迄今**最大的一次架构与能力双升级**：

1. **🃏 FSRS-5 间隔重复闪卡** —— 补齐「记录 → 整理 → 连接 → **内化**」的最后一环（全新能力）
2. **🏗️ 架构减负** —— `App.tsx` 减少 **40%**，`CanvasView` 减少 **30%**，`canvasService` 拆为 **9 个模块 + 门面**
3. **🧪 工程质量** —— 测试从 384 项增至 **619 项**，100% 通过

---

## ✨ 一、FSRS-5 间隔重复闪卡（全新）

> 记下来的知识会随时间遗忘。这是 KnowSpace 第一次回答「如何让读到的东西真正留下来」。

### 📝 三种零侵入语法

卡片直接写在普通 Markdown 里，**不引入专有格式、不与任何第三方编辑器冲突**：

| 语法 | 写法 | 特点 |
| :--- | :--- | :--- |
| **问答块** | `Q: 问题` 换行 `A: 答案` | 答案可多行，全角 `：` 与半角 `:` 均可 |
| **行内卡** | `问题 :: 答案` | 单行成卡，适合术语速记 |
| **挖空卡** | `{{c1::答案}}` · `{{c1::答案::提示}}` · `==高亮==` | 两种写法，提示可选 |

### 🧠 FSRS-5 DSR 调度内核

完整实现**稳定性 S / 难度 D / 可回忆性 R** 三变量模型：

```
遗忘曲线   R(t,S) = (1 + FACTOR·t/S)^DECAY      DECAY = -0.5, FACTOR = 19/81
初始稳定性 S₀(G) = w[G-1]
初始难度   D₀(G) = w4 - e^(w5·(G-1)) + 1
难度更新   ΔD = -w6·(G-3)，含均值回归        → 钳制 [1, 10]
成功增长   S' = S·(1 + e^w8·(11-D)·S^-w9·(e^(w10(1-R))-1)·hard·easy)
遗忘下降   S' = w11·D^-w12·((S+1)^w13-1)·e^(w14(1-R))   → 上限为原 S
间隔       I(r) = S/FACTOR·(r^(1/DECAY)-1)     → I(0.9) = S 恰好成立
```

两个常数（`DECAY = -0.5`、`FACTOR = 19/81`）是**推导得出**的，保证 **`R(S,S) = 0.9`** —— 这正是「稳定性 = 保持率降到 90% 所需的天数」这一定义本身，并在测试中直接断言该恒等式。

**遗忘分支的上限是原稳定性**：即「忘记」绝不会让一张卡片变得更容易记住。

### 🎚️ 四档评分与间隔预览

`重来 / 困难 / 良好 / 轻松` 四键，**每个按钮上直接显示选择它之后的下次间隔**（如「3 天后」）—— 不必试错。同日重复评分走短期权重分支。

### 💾 进度存于单条 HTML 注释

所有调度状态写入文档末尾一处 `<!-- fsrs:begin … fsrs:end -->` 注释块，**一卡一行**：

- 任何第三方 Markdown 编辑器里都只是一个**普通注释**，正文零污染
- Git diff 保持可读
- 删除的卡片在写回时自动清除，重复写入**替换**而非堆叠

### 🔑 卡片 ID 由内容派生

**重排笔记顺序不会让卡片丢失历史**，只有真正修改问题才会重置。这一条在实现初期就写进了测试。

### ⚡ 纯 CPU、毫秒级、零联网

不依赖 GPU、不调用端侧 AI、**不产生任何网络请求**。评分响应预算 **< 50ms**，并已固化为守护测试。

---

## 🏗️ 二、架构减负

### `App.tsx`：3589 → **2145 行（-40%）**

| 手法 | 成果 |
| :--- | :--- |
| **领域状态外移** | 3 个 Zustand store（`useUiStore` / `useTabStore` / `useVaultStore`），32 个状态离开顶层组件 |
| **逻辑抽取** | 7 个新 hook：`useColumnResize` · `useDocumentCreation` · `useVaultOpening` · `useSearch` · `useBacklinkIndex` · `useGlobalShortcuts` · `useBookmarks` |
| **渲染抽取** | `AppOverlays` 组件收纳全部浮层 |

**关键收益不止行数**：

- **编辑不再牵动标签页** —— 原先一个 49 行的 effect 负责把编辑器的「未保存」标记同步进标签页数组，逐字段比较五个字段只为判断是否 bail out。由于**同一时刻至多只有一个标签页可能是脏的**，该标记改为**渲染时派生**，打字只改一个 memo。
- **浮层可脱离整个外壳被测试** —— 灯箱、命令面板等所需的值现在直接读 store，不再是逐层透传的 props。
- **多处 stale-closure 风险消除** —— 原先靠 `*Ref` 镜像规避的回调，现在读 `getState()`。

### `canvasService.ts`：5060 行 → **9 个模块 + 127 行门面**

```
canvasPrimitives → canvasGeometry → canvasRouting
                        ↑
                   canvasGraph  (环检测 + 缓存 + sync*)
                        ↑
                   canvasColor
                        ↑
                   canvasEdges
                   ↓ 全部 → canvasExport（独占 DOM）
              canvasService（门面转发全部 80 个符号）
```

沿用**门面 re-export**：3 个调用方（`CanvasView` / 测试 / `App`）**一行都不用改**，回归面压到最小。DOM 与 Electron 桥调用 **100% 集中在 export 组**。

### `CanvasView.tsx`：9161 → **6416 行（-30%）**

已抽出 `CanvasToast` · `MarqueeSelectionBox` · `CanvasMinimap` · `CanvasEdgeBatchToolbar` · 4 个 Modal · `CanvasEdgeLabelLayer` · `CanvasEdgeLayer` · `EdgeContextMenu` · `NodeContextMenu`，以及 `canvasPalette` / `canvasEdgeUtils` / `canvasModalStyles` / `canvasEdgeIcons` 等工具模块。

---

## 🧪 三、工程质量

| 项目 | v2.4.0 | **v2.5.0** |
| :--- | ---: | ---: |
| 测试套件 | 43 | **55** |
| 测试用例 | 384 | **619** |
| 通过率 | 100% | **100%** |
| 测试基线快照 | — | ✅ `docs/TEST_BASELINE.md`（含逐文件用例分布，防静默删除） |

**新增工程脚本**：

| 脚本 | 作用 |
| :--- | :--- |
| `scripts/capture-test-baseline.cjs` | 一键跑测试 → 解析 vitest JSON → 生成基线快照 |
| `scripts/build-portable-zip.ps1` | 便携版打包（.NET `ZipFile` 流式写入，避免大目录 OOM） |
| `scripts/run-release-publish.ps1` | 注入工具路径后调用发布器 |

**顺带修正的一处口径问题**：计划文档此前用不计空行的方式统计行数，同一文件会得出两个数字。现已统一为**总行数（含空行）**，与编辑器 / GitHub 显示一致，并固化进基线脚本。

---

## 🔧 四、修复与改进

- **标签页脏标记**：修复切换标签页后旧标签页可能残留脏点的问题（改为派生后该状态不再存在）
- **关闭右侧标签页**：原先在 `setState` updater 内执行导航副作用，**StrictMode 下会双调用** → 已移出 updater
- **列宽拖拽**：拖拽中不再每帧重建 `onMouseDown` prop
- **打开大型知识库**：索引构建与跳转的竞态由请求计数器守卫（慢读取被新请求超越时放弃结果）

---

## 📦 五、下载与安装

| 资产文件 | 类型 | 适用场景 |
| :--- | :--- | :--- |
| [`KnowSpace-Setup-2.5.0.exe`](https://github.com/chunxvzhang-lab/KnowSpace/releases/download/v2.5.0/KnowSpace-Setup-2.5.0.exe) | **Windows 向导安装程序（推荐）** | 桌面快捷方式、开始菜单图标、`.md` / `.canvas` 文件关联 |
| [`KnowSpace-2.5.0.msi`](https://github.com/chunxvzhang-lab/KnowSpace/releases/download/v2.5.0/KnowSpace-2.5.0.msi) | **Windows MSI 标准安装包** | 企业 IT 批量分发、组策略静默安装 |
| [`KnowSpace-win-x64-portable.zip`](https://github.com/chunxvzhang-lab/KnowSpace/releases/download/v2.5.0/KnowSpace-win-x64-portable.zip) | **Windows 免安装绿色便携版** | 解压即用，支持放入 U 盘，随身携带 |

---

## 🖥️ 六、系统要求

- Windows 10 / 11 (x64)
- 摸鱼Lab 研发出品

---

## 🔄 七、从 v2.4.0 升级

**无需任何迁移动作。** 本版：

- **未改变**任何既有文件格式（`.md` / `.canvas` 完全兼容）
- **未新增**任何强制目录结构
- FSRS 进度仅在你**首次使用闪卡**后才会写入文档末尾的注释块；不使用则该注释不存在
- v2.5.0 创建的库可由 v2.4.0 正常打开（多出的 `<!-- fsrs -->` 注释与普通注释无异）

---

## 📋 八、已知事项

- 部分键盘快捷方式分支尚未有独立单元测试覆盖，依赖应用级测试与人工回归（`useGlobalShortcuts` 的桌面接线部分已有测试）
- `src/__tests__/snapshots-node.test.ts` 存在**偶发**的文件系统时序失败（临时目录竞争），单独运行稳定通过；将在后续版本修复
