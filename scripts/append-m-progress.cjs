/**
 * Appends the session's status to docs/MINDMAP_XMIND_PLAN.md.
 *
 * The plan is the shared record, and everything below happened after it was
 * written. Without this the state only exists in a conversation, which is the
 * wrong place for the things that matter most here: what is actually done, which
 * earlier claims about it should not be trusted, and what the next layout runs
 * into before it is started.
 *
 * Idempotent: the section is removed first if present. The removal looks for the
 * section's heading rather than its exact wording, so retitling it does not
 * leave a stale copy behind.
 *
 * Usage: node scripts/append-m-progress.cjs
 */

const fs = require("node:fs");
const path = require("node:path");

const target = path.resolve(__dirname, "..", "docs", "MINDMAP_XMIND_PLAN.md");

const START = "## 执行进展（M0、M1 完成，M2 进行中）";
/** Any previous progress section, whatever it was titled. */
const ANY_START = "## 执行进展（";
const END = "<!-- end progress -->";

const BLOCK = `${START}

> 记录于 M2 落地三分之二之后。**只写可核实的事实**，并写明下一步会先撞到什么。

### 已完成

| 批次 | 内容 | 状态 |
| :--- | :--- | :--- |
| **M0.1–M0.9** | 交互补齐（拖拽排序 / 复制粘贴 / 框选 / 空白双击 / 画布菜单 / 缩放 / 折叠持久化 / 排序快捷键 / 4 处瑕疵） | ✅ |
| **M1.1–M1.3** | 6 套主题、解析规则、按文档记忆 | ✅ |
| **M1.4** | 「固化为节点样式」 | ⏸ 计划标注可选 |
| **M2 前置** | **抽出工具栏** \`MindmapToolbar.tsx\`（280 行 JSX + 两个下拉菜单状态） | ✅ |
| **M2.1** | 逻辑结构图（默认，与原实现逐项一致） | ✅ |
| **M2.2** | **双向**（一级分支按体量分列左右，根居中） | ✅ |
| **M2.4** | **纵向**（根在顶部，层级向下，兄弟横向铺开） | ✅ |
| **M2.3** | 径向 / 辐射 | ⏸ 见下 |
| **M2.5** | 时间轴 | ⏸ 见下 |

**测试**：60 文件 / 755 项 / 100%。\`tsc\` 与 \`vite build\` 均通过。

### 布局切换的落地方式

**布局是纯视图层选择**：\`layoutMindmap(tree, collapsedIds, layoutId)\` 只返回坐标与连线路径，不改树、不写文档、不动节点样式。切换布局 = 重新算一次坐标。

**新增的共享结构**（三个布局共用，避免各自漂移）：

| 函数 | 作用 |
| :--- | :--- |
| \`makeLayoutNode\` | 由树节点 + 位置装配布局节点。**三个布局共用一份字段清单** —— 否则将来给 \`MindmapNode\` 加一个样式字段，就会漏掉其中一两个布局 |
| \`measureSubtree\` / \`measureSubtreeWidth\` | 纵向 / 横向的子树占位（互为转置） |
| \`stackHeight\` / \`stackWidth\` | 一排兄弟占用的高度 / 宽度 |
| \`shiftToOrigin\` | 布局完成后整体归位到原点（左右两侧的伸展只有在排完后才知道） |
| \`buildEdgePath(…, axis)\` | 连线形状按轴旋转：\`step\`/\`bezier\` 原本假定"从左往右流"，直接用在纵向布局上会**横向穿过下一层** |

**新增字段** \`MindmapLayoutNode.side\`：\`right\` / \`left\` / \`bottom\`。折叠按钮挂在**子节点实际所在的那条边**上；默认布局全是 \`right\`，所以旧观感没有任何变化。

### 规模（**方法一致才可比**：\`split("\\n").length\`）

| 文件 | 行数 |
| :--- | ---: |
| \`src/components/MindmapView.tsx\` | 2539（抽出工具栏前为 2742） |
| \`src/components/MindmapToolbar.tsx\` | 396 |
| \`src/services/mindmapLayout.ts\` | 718（布局引擎，本次迁出） |
| \`src/services/mindmapService.ts\` | 1180（迁移前为 1821） |

**工具栏抽出只削掉了约 200 行净额**，因为同一批又补进了布局状态与折叠按钮的落点计算。**节点右键菜单（约 300 行）仍未抽出** —— 「文件已大到不该继续加」这个理由**依然成立**。

### 布局引擎已迁出（原记录里的先决条件）

坐标、连线、度量、节点装配与三个布局都在 \`services/mindmapLayout.ts\`；\`core/mindmapLayouts.ts\` 的 **id 表并入其中**。

**为什么合并**：表、标签与分发是同一份清单的三种视图。分在两个文件里的典型错误是「加进了选择器、忘了加分发」—— 而 \`default\` 分支会把它**悄悄画成默认布局**，**不会有任何测试失败**。

**依赖只有一个方向**：布局模块读 service 的 \`calculateNodeDimensions\` 与调色板，service 不知道它存在。

**迁移方式**：\`scripts/extract-mindmap-layout.cjs\`（**按内容定位而不是行号**，写入前先打印边界供核对，默认 dry-run），沿用本仓库已有的迁移脚本写法。**验证靠默认布局的黄金快照** —— 迁移前后逐项一致。

**死代码扫描**（\`scripts/find-dead-code.cjs\`）：0 处未用导入、0 处未用样式。

### ⚠️ 三项需要更正的事实

**1. 上一次会话的最后一个提交从未通过一次成功的构建。**

\`src/components/MindmapInlineEditor.tsx\` 的类型错误（\`textAlign?: string\` 装不进 CSS 的 \`TextAlign\`）**引入于最后一次打包之后**：\`release/KnowSpace-win-x64\` 里的可执行文件停留在 01:01，而该文件改于 01:05。也就是说抽取内联编辑器那一步之后，**没有任何一次 \`npm run build\` 跑过**，而这个错误会让构建直接失败。

**已修正**（把该 prop 收窄为模型里的 \`MindmapTextAlign\`），并确认 \`tsc\` 与 \`vite build\` 现在都通过。

> 📌 教训与 \`package-win.ps1\` 开头记的那条同源：**"提交了"与"构建过"是两件事**。该脚本存在的理由就是上一次 dist 落后四小时；这次落后的是源码本身。

**2. 黄金快照必须由 \`-u\` 生成，不能凭记忆重写。**

本次为默认布局加了三条黄金断言（坐标 / 连线路径 / 包围盒），**在改动任何实现之前**捕获。后来把测试文件重写一遍时，我把其中两条**照记忆手写**了数值 —— 结果那两条"失败"，而失败的是测试文件，不是实现。

**结论**：快照类断言只在**机器生成**时可信；手抄一遍等于把断言变成猜测。

**3. 双向布局的连线段必须按"子节点在哪一侧"选边。**

若按父节点的边取，左侧子节点会从父节点右边缘出发，**穿过父节点自己**。这条已被测试钉住（逐条比对起点与终点的坐标）。

### 下一步：M2.3 与 M2.5 会先撞到什么

**M2.3 径向**：角度分配需要按子树体量划分扇区（否则一个深分支会挤掉整圈）。连线需要**新增一种基于角度的形状**：现有的三个线型都以"框的某个边"为端点，径向的连线应当沿半径方向。**风险最高，放在最后。**

**M2.5 时间轴**：动手前先解决一个**模型约束** —— 现有 \`MindmapLayoutResult.edges\` 只能表达**父子连线**，而时间轴的主轴**不是树边**。若让根分别连向每个一级分支，这些线会**横穿中间的分支方框**。

> 两条出路，需要先选一条：① 让分支**交替位于主轴上下**，连线改为"从轴上垂到节点"，于是主轴由共线的父子连线自然形成；② 把主轴提升为**渲染概念**（布局额外返回一条轴线），edges 仍只表达父子关系。
>
> **倾向前者**：它不需要改渲染层与 \`edges\` 的语义，代价是节点上下交替、每个分支的子树方向随之上/下翻转（\`side\` 需要再添两个值）。

### M3 的前置状态（未变）

**M3/M4 仍需裁决本方案 §7 的 sidecar 方案**（\`<文档名>.mindmap.json\`）。M0–M2 不依赖它，可随时停下。

${END}
`;

function main() {
  let doc = fs.readFileSync(target, "utf8");

  const start = doc.indexOf(ANY_START);
  if (start !== -1) {
    const end = doc.indexOf(END, start);
    if (end === -1) {
      console.error("FAIL: found the section start but not its end marker");
      process.exit(1);
    }
    doc = doc.slice(0, start) + doc.slice(end + END.length + 1);
    console.log("removed the previous section");
  }

  const trimmed = doc.replace(/\s+$/, "");
  fs.writeFileSync(target, `${trimmed}\n\n${BLOCK}`);
  console.log(`appended ${BLOCK.split("\n").length} lines to docs/MINDMAP_XMIND_PLAN.md`);
}

main();
