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
| **M2.3** | **径向**（扇区按体量分配，环半径由相邻间距反推） | ✅ |
| **M2.5** | **时间轴**（一级分支沿轴交替上下，连线沿轴走再垂下） | ✅ |

**M2 的五个布局全部完成。**

**测试**：60 文件 / 783 项 / 100%。\`tsc\` 与 \`vite build\` 均通过。

### 径向布局（M2.3）的三处要点

**扇区权重是混合的，不是纯按体量。** 纯按体量分配听起来对，但它会坏：一个只含单个叶子的分支挨着一个大分支时，它的扇区趋近于零宽，而**两个框不重叠所需的半径 = 框宽 ÷ 角间距** —— **整环会被推到几千像素之外**。混合 50% 的均分把最窄扇区**限制在父扇区的固定比例**，重的分支仍然明显更宽（测试里 5:1 的体量比变成不到 3:1）。

**环半径由两条约束取大**：① 上一环半径 + 两环各自的最坏径向半宽 + 间距；② 本环相邻框的角间距反推出的最小半径（**首尾也算相邻 —— 环是圆不是线**）。

**连线的三种形状按半径旋转**：\`step\` = 沿父方向出到中间环 → 弧上横移 → 到子节点；\`bezier\` 用同样两点作控制点；\`straight\` 就是辐条。中间角取**最短弧**，否则刚好跨过起点的分支会绕大半圈。

**折叠按钮**：径向节点的子节点分布在四周，"在哪条边上"没有答案，因此布局节点新增 \`toggleOffset\`（节点本地坐标的落点），渲染器优先用它，其余布局仍走 \`side\`。**这也顺手解决了时间轴问题的一半。**

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
| \`src/components/MindmapView.tsx\` | 2545（抽出工具栏前为 2742） |
| \`src/components/MindmapToolbar.tsx\` | 396 |
| \`src/services/mindmapLayout.ts\` | 1244（五个布局与全部几何） |
| \`src/services/mindmapService.ts\` | 1183（迁移前为 1821） |
| \`src/__tests__/mindmap-layouts.test.ts\` | 1075 |

**工具栏抽出只削掉了约 200 行净额**，因为同一批又补进了布局状态与折叠按钮的落点计算。**节点右键菜单（约 300 行）仍未抽出** —— 「文件已大到不该继续加」这个理由**依然成立**。

### 布局引擎已迁出（原记录里的先决条件）

坐标、连线、度量、节点装配与三个布局都在 \`services/mindmapLayout.ts\`；\`core/mindmapLayouts.ts\` 的 **id 表并入其中**。

**为什么合并**：表、标签与分发是同一份清单的三种视图。分在两个文件里的典型错误是「加进了选择器、忘了加分发」—— 而 \`default\` 分支会把它**悄悄画成默认布局**，**不会有任何测试失败**。

**依赖只有一个方向**：布局模块读 service 的 \`calculateNodeDimensions\` 与调色板，service 不知道它存在。

**迁移方式**：\`scripts/extract-mindmap-layout.cjs\`（**按内容定位而不是行号**，写入前先打印边界供核对，默认 dry-run），沿用本仓库已有的迁移脚本写法。**验证靠默认布局的黄金快照** —— 迁移前后逐项一致。

**死代码扫描**（\`scripts/find-dead-code.cjs\`）：0 处未用导入、0 处未用样式。

### ⚠️ 四项需要更正的事实

**1. 上一次会话的最后一个提交从未通过一次成功的构建。**

\`src/components/MindmapInlineEditor.tsx\` 的类型错误（\`textAlign?: string\` 装不进 CSS 的 \`TextAlign\`）**引入于最后一次打包之后**：\`release/KnowSpace-win-x64\` 里的可执行文件停留在 01:01，而该文件改于 01:05。也就是说抽取内联编辑器那一步之后，**没有任何一次 \`npm run build\` 跑过**，而这个错误会让构建直接失败。

**已修正**（把该 prop 收窄为模型里的 \`MindmapTextAlign\`），并确认 \`tsc\` 与 \`vite build\` 现在都通过。

> 📌 教训与 \`package-win.ps1\` 开头记的那条同源：**"提交了"与"构建过"是两件事**。该脚本存在的理由就是上一次 dist 落后四小时；这次落后的是源码本身。

**2. 黄金快照必须由 \`-u\` 生成，不能凭记忆重写。**

本次为默认布局加了三条黄金断言（坐标 / 连线路径 / 包围盒），**在改动任何实现之前**捕获。后来把测试文件重写一遍时，我把其中两条**照记忆手写**了数值 —— 结果那两条"失败"，而失败的是测试文件，不是实现。

**结论**：快照类断言只在**机器生成**时可信；手抄一遍等于把断言变成猜测。

**3. 双向布局的连线段必须按"子节点在哪一侧"选边。**

若按父节点的边取，左侧子节点会从父节点右边缘出发，**穿过父节点自己**。这条已被测试钉住（逐条比对起点与终点的坐标）。

**4. 测试自己也会写错 —— 这是本次第二例。**

径向的扇区测试第一版把「相邻节点角度的中点」当成扇区边界。**这只在两个扇区相等时成立**：不等时，两个扇区被算成同一个数，断言便在**浮点末位**上失败（\`expected 1.3264502315156903 to be greater than 1.3264502315156905\`），看起来像精度问题，其实是推导错了。

**改法**：换成"两个等重分支夹一个轻分支"的格局 —— 此时**扇区宽度可以直接从可观测的角间距反解**，不需要任何关于边界的假设。

> 📌 与第 2 条同源：**断言失败时，先问是哪一边错了**。这两次错的都是测试。

### 时间轴（M2.5）：方案 ① 可行，但只有一条路

**先否掉了看起来最直接的做法**：从根**直连**分支 —— 直线、\`step\`、\`bezier\` 都会**穿过中间的分支方框**。轴是水平的、分支沿轴排开，连向第 5 个分支的线必然掠过前 4 个。

**唯一可行的路是"沿轴走，再垂到节点"**，它成立的前提是：**轴是唯一没有被方框占用的走廊** —— 所有方框按构造都退到轴的一侧至少 \`SPINE_GAP\`。也正因为这条走廊，**分支必须上下交替**：全放一侧就没有走廊可言了。

**由此得到一条渲染决定**：轴上的每一段**共线且重叠**，若各用各的分支色，靠近根的一段会混成脏色、到远端才渐渐变成单色。因此**轴上的所有段共用第一个分支配色**；分支自己的颜色留在它的节点与子树内部的连线上。

**\`side\` 增加了 \`top\`**（时间轴的上侧分支朝上生长）。径向那种"哪条边都不是"的情形仍由 \`toggleOffset\` 表达 —— 两种机制各管一种"方向不是一个名字"的情况。

**验证**：有一条测试专门断言「**轴上的那段走廊没有任何方框占用**」—— 这是整个设计的支点，它一旦被推翻，时间轴就得改成方案 ②（把主轴提升为渲染概念）。

### 性能实测（方案 §5 风险表里唯一未验证的一条）

方案写着「大图（>500 节点）需实测」。实测两种形状：

| 形状 | 逻辑 | 双向 | 纵向 | 径向 | 时间轴 |
| :--- | ---: | ---: | ---: | ---: | ---: |
| **841 节点 / 3 层**（宽而浅） | 3ms | 3ms | 6ms | 2ms | 1ms |
| **601 节点 / 600 层**（深链，最坏） | 94ms | 124ms | 80ms | **5ms** | 80ms |

**结论：不需要优化。** 真实文档落在第一行的量级上。

**但两行的差距说明了一件事**：每个布局都靠**遍历子树**来回答"这棵子树有多高 / 多宽"，于是一条深度 d 的链要付 d² 次访问 —— 宽树把这份代价完全藏住了。**径向快 20 倍，只因它在第一阶段就把每个节点的尺寸算好、存进条目里复用**，其余四个布局每层都要重算一遍。

> **为什么记录下来而不是顺手优化**：600 层不是任何真实文档的形状，为一个不存在的场景去改四个布局的度量路径，等于**把风险挪到用户真实会走的路径上**。真遇到深文档卡顿，这就是第一个该改的地方。

**测试**：\`src/__tests__/mindmap-layout-performance.test.ts\`。上限给得很宽（2s / 4s，实测的 20–30 倍），它钉的是**代价的形状**而不是机器快慢；实测数字直接打印在测试输出里，供下一次会话对照事实而不是对照注释。

### 下一步：M2 之后是评审点

按方案 §4 的顺序，**M2 之后就是决策点**：M3（节点富元数据）与 M4（非树形结构）都需要先定 **sidecar 方案**（\`<文档名>.mindmap.json\`，见 §7）。

**M0–M2 没有引入任何新文件格式**：五个布局、主题、交互全部只作用于视图层，所以这里可以停，不留半成品。

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
