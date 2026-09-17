/**
 * Appends the session's status to docs/MINDMAP_XMIND_PLAN.md.
 *
 * The plan is the shared record, and everything below happened after it was
 * written. Without this the state only exists in a conversation, which is the
 * wrong place for the two things that matter most here: what is actually done,
 * and which earlier claims about it should not be trusted.
 *
 * Idempotent: the section is removed first if present.
 *
 * Usage: node scripts/append-m-progress.cjs
 */

const fs = require("node:fs");
const path = require("node:path");

const target = path.resolve(__dirname, "..", "docs", "MINDMAP_XMIND_PLAN.md");

const START = "## 执行进展（M0 完成、M1 完成）";
const END = "<!-- end progress -->";

const BLOCK = `${START}

> 记录于 M0 与 M1 落地之后。**只写可核实的事实**，并标明哪些早前的说法不可信。

### 已完成

| 批次 | 内容 | 状态 |
| :--- | :--- | :--- |
| **M0.1** | 同级拖拽排序（传 \`targetIndex\`，含位移修正） | ✅ |
| **M0.2** | 复制 / 剪切 / 粘贴（子树含样式，复制时重生成 id） | ✅ |
| **M0.3** | 框选多选（相交判定） | ✅ |
| **M0.4** | 空白处双击新建节点 | ✅ |
| **M0.5** | 画布空白右键菜单 | ✅ |
| **M0.6** | 缩放快捷键 + 适应画布按钮 | ✅ |
| **M0.7** | 折叠状态持久化（按文档路径键控） | ✅ |
| **M0.8** | 排序快捷键 \`Alt+↑/↓\` | ✅ |
| **M0.9** | 4 处既有瑕疵（\`targetIndex\` / \`FOLDED\` / 61 处死导入 / 4 条遗留样式） | ✅ |
| **M1.1** | 6 套主题定义 | ✅ |
| **M1.2** | 解析规则（主题=默认值，节点显式样式优先） | ✅ |
| **M1 渲染** | 边与节点颜色改由主题提供 | ✅ |
| **M1.3** | 工具栏选择器 + 按文档记忆 | ✅ |
| **M1.4** | 「固化为节点样式」 | ⏸ 计划标注可选 |

**测试**：59 文件 / 708 项 / 100%。

### ⚠️ 两项需要更正的事实

**1. 早前提交信息里的行数不可信。**
「2799 → 2697」这类数字是**推算而非实测**。核实后三种方法对同一文件给出不同结果（\`split\` 得 2742，\`Measure-Object -Line\` 得 2547，\`git show\` 得 2578）。**可比对的只有组件规模**：

| 已抽出组件 | 行数 |
| :--- | ---: |
| \`MindmapCanvasMenu.tsx\` | 90 |
| \`MindmapSearchGroup.tsx\` | 105 |
| \`MindmapExportMenu.tsx\` | 81 |
| \`MindmapInlineEditor.tsx\` | 77 |
| \`MindmapZoomGroup.tsx\` | 60 |

**\`MindmapView\` 仍远超两千行**，工具栏（约 200 行）与节点右键菜单**尚未抽出**。拆分的理由——「文件已大到不该继续加」——**依然成立**。

**2. 默认主题险些悄悄改变所有人的观感。**
\`classic\` 色板最初**凭记忆填写**，与原 \`BRANCH_COLORS\` **顺序与取值都不同**。因为它是默认主题，**每个升级用户的分支颜色都会变** —— 而**主题测试全部通过**，因为它们只问「一套主题自身是否自洽」，从不问「默认主题是否复现了原有观感」。

**已修正，并用两条测试钉住**（修正前均失败）：

\`\`\`ts
expect(MINDMAP_THEMES.classic.branchColors).toEqual(BRANCH_COLORS);
expect(MINDMAP_THEMES.classic.branchColors.length).toBe(BRANCH_COLORS.length);
\`\`\`

**顺序与长度都有实际作用**：\`layoutMindmap\` 按**色板长度**派生每个顶层子节点的颜色索引。

> 📌 **一般化的教训**：**加一条默认路径时，必须有一条测试断言「默认路径复现旧行为」** —— 否则这类回归只会由用户发现。

### 工具链（本会话建立，均已投入使用）

| 脚本 | 用途 |
| :--- | :--- |
| \`scripts/package-win.ps1\` | **自动探测本地代理** → 构建 → 打包 → 同步 → 校验；含**防重入锁** |
| \`scripts/push.ps1\` | 自动探测代理 → 报告待推数 → 推送 → 确认同步 |
| \`scripts/find-dead-code.cjs\` | 死导入 + 未用样式 |
| \`scripts/scan-source.cjs\` | 正则扫源码（规避 PowerShell 破坏 \`|\`） |

**网络根因**：github.com 在此网络不可达，而**代理在 7897 端口**（7890 是文档里最常写的默认值）。两个脚本都改为**探测多个端口** —— 因为**端口猜错是完全静默的**：变量设了、没人监听、下载照旧失败，**看起来就像修复无效**。

### M2 的前置状态

**M2 与主题完全正交** —— 主题已确定「默认值来源」，各布局消费同一份 \`mindmapTheme\`。改动集中在 \`layoutMindmap\` 的定位算法，不碰渲染。

**建议先做 2.2（双向）**：复用现有 \`measureSubtree\` 阶段，只需把子节点分配成左右两组，**风险最低且视觉差异明显**。

**布局切换器需要落点** —— 工具栏尚未抽出，这是它之前唯一的结构性工作。

${END}
`;

function main() {
  let doc = fs.readFileSync(target, "utf8");

  const start = doc.indexOf(START);
  if (start !== -1) {
    const end = doc.indexOf(END, start);
    if (end === -1) {
      console.error("FAIL: found the section start but not its end marker");
      process.exit(1);
    }
    doc = doc.slice(0, start) + doc.slice(end + END.length + 1);
    console.log("removed the previous section");
  }

  const trimmed = doc.endsWith("\n") ? doc : `${doc}\n`;
  fs.writeFileSync(target, `${trimmed}\n${BLOCK}`);
  console.log(`appended ${BLOCK.split("\n").length} lines to docs/MINDMAP_XMIND_PLAN.md`);
}

main();
