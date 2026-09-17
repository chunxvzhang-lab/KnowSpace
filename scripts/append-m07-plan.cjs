/**
 * Appends the M0.7 findings to docs/MINDMAP_XMIND_PLAN.md.
 *
 * Written from a script for the usual reason: the file is long and only its
 * tail changes. Idempotent — the section is removed first if it is already
 * there, so re-running replaces rather than duplicates.
 *
 * Usage: node scripts/append-m07-plan.cjs
 */

const fs = require("node:fs");
const path = require("node:path");

const target = path.resolve(__dirname, "..", "docs", "MINDMAP_XMIND_PLAN.md");

const START = "## M0.7 折叠状态持久化 —— 实现前的两项核实";
const END = "<!-- end M0.7 -->";

const BLOCK = `${START}

> 记录于动手之前。这一节只写已经**核实过的事实**和**尚未解决的问题**，不含实现。

### ✅ 核实一：节点 id 跨重载稳定，按 id 持久化是有效的

持久化折叠状态最自然的做法是存节点 id 的集合。这只有在 id 稳定时才成立 —— 若 id 每次解析都重新生成，存下来的集合会在重载后全部落空，而且**单元测试测不出来**（测试里 id 是固定的）。

核查 \`parseMarkdownToMindmapTree\` 的生成规则：

| 节点来源 | id 形式 | 稳定性 |
| :--- | :--- | :--- |
| 根节点 | \`root-mindmap-node\` | ✅ 固定字面量 |
| 缩进列表项 | \`node-${"${parentPath}-${childIdx}"}\` | ✅ 由**结构路径**派生 |
| Markdown 标题 | \`heading-${"${line}-${text.slice(0,10)}"}\` | ✅ 由行号与文本派生 |
| **新建节点** | \`node-${"${Date.now()}-${random}"}\` | ⚠️ 随机，但仅存在于当前会话 |

最后一行不构成问题：新建节点在同步回 Markdown 后，下次解析会重新获得**结构 id**。随机 id 是会话内的临时标识。

**结论：可以按 id 持久化。**

> ⚠️ 已知局限（非本次要解决）：id 含**兄弟序号**。若在折叠的节点之前插入同级条目，其序号改变、id 随之改变，折叠会落到错误节点上。这是序号路径的固有代价，换用文本路径可解但会引入重名问题 —— 记为已知取舍。

### ⚠️ 核实二：组件拿不到文档标识，需要一个新 prop

\`MindmapViewProps\` 现有字段：

\`\`\`ts
title: string;
headings?: Heading[];
source?: string;
onSourceChange?: (newSource: string) => void;
editable?: boolean;
onJumpToHeading?: (headingId: string, line?: number) => void;
onClose?: () => void;
theme?: ThemeMode;
\`\`\`

**没有文档路径。** 而持久化的键必须是**每文档一份**。

| 方案 | 评价 |
| :--- | :--- |
| 用 \`title\` 作键 | ❌ **已知错误** —— 同名文档（如各目录下的 \`README\`、\`索引\`）会共用一份折叠状态 |
| 新增 \`documentKey?: string\`，由 App 传入路径 | ✅ 正确，且 App 已有 \`session?.absolutePath\` |
| 存进文档自身（frontmatter / 注释） | ✅ 随文档走，但要处理「同步时不写脏」的问题，且会**改动用户的文档** |

**倾向第二个**：不动用户文档，键正确，改动面小（App 一行、组件一行）。

> 之所以把它记下来而不是直接动手：这次加的是**跨文件的新 prop**，属于「开始就必须做完」的改动。上一批 FreeMind 修复是同类的单点改动，可以独立完成；这一项不行 —— 半途而废会在仓库里留下一个「传了键但没读」或「读了但没传」的中间态。

### 尚未核实的事项（动手前需确认）

1. **保存时机**：折叠/展开是高频操作（\`handleExpandAll\` 一次改掉整个集合），需要与前一批宽度拖拽相同的判断 —— **是否该在每次点击时同步写 localStorage**。宽度那次是拖拽每帧都改所以必须延后；折叠是离散点击，估计可以直接写，但要确认。
2. **失效清理**：文档删改后，存下来的 id 会包含不存在的节点。读取时应**过滤掉树中不存在的 id**，否则集合会无限增长。
3. **与 \`FOLDED\` 导出共用真源**：\`c1582f2\` 已让 FreeMind 导出读取该集合。持久化落地后，**导出、渲染、持久化应当读同一份状态**，避免再出现「三处各自理解折叠」的情况。

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
