export type SlashCommandCategory =
  | "排版与标题"
  | "列表与任务"
  | "代码与结构"
  | "图表与公式"
  | "高级卡片"
  | "知识连接";

export interface SlashCommand {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: SlashCommandCategory;
  keywords: string[];
  template: string;
  cursorOffset?: number; // Cursor offset relative to start of inserted template
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // 1. 排版与标题
  {
    id: "h1",
    title: "一级标题 (H1)",
    description: "主标题，大段落核心主题",
    icon: "H1",
    category: "排版与标题",
    keywords: ["h1", "1", "bt", "biaoti", "title", "heading", "yijibiaoti"],
    template: "# 标题内容\n",
    cursorOffset: 2,
  },
  {
    id: "h2",
    title: "二级标题 (H2)",
    description: "小节标题，二级知识结构",
    icon: "H2",
    category: "排版与标题",
    keywords: ["h2", "2", "bt", "biaoti", "subtitle", "erjibiaoti"],
    template: "## 标题内容\n",
    cursorOffset: 3,
  },
  {
    id: "h3",
    title: "三级标题 (H3)",
    description: "子小节标题，三级细分要点",
    icon: "H3",
    category: "排版与标题",
    keywords: ["h3", "3", "bt", "biaoti", "section", "sanjibiaoti"],
    template: "### 标题内容\n",
    cursorOffset: 4,
  },
  {
    id: "h4",
    title: "四级标题 (H4)",
    description: "细分小标题",
    icon: "H4",
    category: "排版与标题",
    keywords: ["h4", "4", "bt", "biaoti", "sijibiaoti"],
    template: "#### 标题内容\n",
    cursorOffset: 5,
  },
  {
    id: "divider",
    title: "水平分割线",
    description: "内容视觉横向分割线",
    icon: "➖",
    category: "排版与标题",
    keywords: ["divider", "fgx", "fengexian", "line", "hr", "---"],
    template: "\n---\n\n",
    cursorOffset: 5,
  },
  {
    id: "quote",
    title: "引用块",
    description: "高亮引述外部名言或参考资料",
    icon: "❝",
    category: "排版与标题",
    keywords: ["quote", "yy", "yinyong", "blockquote", "cite"],
    template: "> 引用文字内容\n\n",
    cursorOffset: 2,
  },

  // 2. 列表与任务
  {
    id: "todo",
    title: "待办清单",
    description: "可交互打勾的任务清单项",
    icon: "☑️",
    category: "列表与任务",
    keywords: ["todo", "db", "daiban", "task", "checkbox", "renwu"],
    template: "- [ ] 待办事项内容\n",
    cursorOffset: 6,
  },
  {
    id: "bullet_list",
    title: "无序列表",
    description: "圆点项目符号列表",
    icon: "•",
    category: "列表与任务",
    keywords: ["bullet", "wx", "wuxu", "list", "ul", "xiangmu"],
    template: "- 列表项内容\n",
    cursorOffset: 2,
  },
  {
    id: "ordered_list",
    title: "有序列表",
    description: "1. 2. 3. 递增编号列表",
    icon: "1.",
    category: "列表与任务",
    keywords: ["number", "yx", "youxu", "ordered", "ol", "shunxu"],
    template: "1. 编号步骤或内容\n",
    cursorOffset: 3,
  },

  // 3. 代码与结构
  {
    id: "code_block",
    title: "代码块",
    description: "包含多语言语法高亮的代码围栏",
    icon: "💻",
    category: "代码与结构",
    keywords: ["code", "dm", "daima", "block", "fence", "kaifa"],
    template: "```typescript\n// 在此编写代码\nconsole.log(\"Hello KnowSpace\");\n```\n",
    cursorOffset: 14,
  },
  {
    id: "table",
    title: "标准表格 (3×3)",
    description: "Markdown 自动对齐表格",
    icon: "📊",
    category: "代码与结构",
    keywords: ["table", "bg", "biaoge", "grid", "sheet"],
    template: "| 标题 1 | 标题 2 | 标题 3 |\n| :--- | :--- | :--- |\n| 单元格 1 | 单元格 2 | 单元格 3 |\n| 单元格 4 | 单元格 5 | 单元格 6 |\n\n",
    cursorOffset: 2,
  },

  // 4. 图表与公式
  {
    id: "math_block",
    title: "LaTeX 数学公式块",
    description: "KaTeX 科学公式独立块",
    icon: "∑",
    category: "图表与公式",
    keywords: ["math", "gs", "gongshi", "latex", "katex", "equation"],
    template: "\\[\nE = mc^2\n\\]\n\n",
    cursorOffset: 3,
  },
  {
    id: "math_inline",
    title: "行内公式",
    description: "嵌在段落文字中的小公式",
    icon: "√",
    category: "图表与公式",
    keywords: ["inline_math", "hn", "hangnei", "katex", "formula"],
    template: "\\( x^2 + y^2 = r^2 \\) ",
    cursorOffset: 3,
  },
  {
    id: "mermaid_flowchart",
    title: "Mermaid 流程图",
    description: "标准上下/左右逻辑流程图",
    icon: "🔀",
    category: "图表与公式",
    keywords: ["flowchart", "lc", "liucheng", "mermaid", "graph"],
    template: "```mermaid\nflowchart TD\n    A[开始] --> B{判断条件}\n    B -- 是 --> C[执行步骤]\n    B -- 否 --> D[回退处理]\n    C --> E[结束]\n```\n",
    cursorOffset: 27,
  },
  {
    id: "mermaid_sequence",
    title: "Mermaid 时序图",
    description: "消息交互与时序泳道图",
    icon: "⏱️",
    category: "图表与公式",
    keywords: ["sequence", "sx", "shixu", "uml", "timing"],
    template: "```mermaid\nsequenceDiagram\n    autonumber\n    Client->>Server: 发起请求 (Request)\n    Server-->>Database: 查询数据\n    Database-->>Server: 返回结果\n    Server-->>Client: 响应成功 (200 OK)\n```\n",
    cursorOffset: 31,
  },
  {
    id: "mermaid_mindmap",
    title: "Mermaid 思维导图块",
    description: "文本级轻量脑图",
    icon: "🧠",
    category: "图表与公式",
    keywords: ["mindmap", "dt", "daotu", "naotu", "tree"],
    template: "```mermaid\nmindmap\n  root((中心主题))\n    核心分支A\n      子要点 1\n      子要点 2\n    核心分支B\n      子要点 3\n```\n",
    cursorOffset: 25,
  },

  // 5. 高级卡片
  {
    id: "callout_note",
    title: "提示卡片 (Note)",
    description: "蓝色重点注释与背景提示框",
    icon: "ℹ️",
    category: "高级卡片",
    keywords: ["note", "ts", "tishi", "callout", "info"],
    template: "> [!NOTE]\n> 在此输入背景说明或额外提示信息。\n\n",
    cursorOffset: 12,
  },
  {
    id: "callout_tip",
    title: "技巧卡片 (Tip)",
    description: "绿色高效操作技巧提示框",
    icon: "💡",
    category: "高级卡片",
    keywords: ["tip", "jq", "jiqiao", "callout", "hint", "best_practice"],
    template: "> [!TIP]\n> 在此输入优化建议或高效快捷操作技巧。\n\n",
    cursorOffset: 11,
  },
  {
    id: "callout_warning",
    title: "警告卡片 (Warning)",
    description: "黄色注意事项与警告提示框",
    icon: "⚠️",
    category: "高级卡片",
    keywords: ["warning", "jg", "jinggao", "callout", "caution", "alert"],
    template: "> [!WARNING]\n> 在此输入注意事项或潜在风险警告。\n\n",
    cursorOffset: 15,
  },
  {
    id: "callout_important",
    title: "关键卡片 (Important)",
    description: "紫色关键步骤与重要规格",
    icon: "❗",
    category: "高级卡片",
    keywords: ["important", "zy", "zhongyao", "callout", "critical"],
    template: "> [!IMPORTANT]\n> 在此输入不可跳过的关键前置条件与核心步骤。\n\n",
    cursorOffset: 17,
  },
  {
    id: "details",
    title: "可折叠手风琴面板",
    description: "<details> 点击展开/折叠面板",
    icon: "🔽",
    category: "高级卡片",
    keywords: ["details", "zd", "zhedie", "summary", "collapse", "accordion"],
    template: "<details>\n<summary>点击展开查看详情</summary>\n\n在此输入折叠隐藏的内容...\n\n</details>\n\n",
    cursorOffset: 19,
  },

  // 6. 知识连接
  {
    id: "wikilink",
    title: "双向链接 [[]]",
    description: "链接工作区中的其他笔记与知识卡片",
    icon: "🔗",
    category: "知识连接",
    keywords: ["wikilink", "sl", "shuanglian", "link", "[[", "bi_link"],
    template: "[[]]",
    cursorOffset: 2,
  },
  {
    id: "block_anchor",
    title: "段落块级锚点 (^block)",
    description: "为当前段落赋予可被精确引用的专属指纹",
    icon: "⚓",
    category: "知识连接",
    keywords: ["block", "kd", "kuai", "anchor", "fingerprint", "^"],
    template: " ^block-" + Math.random().toString(36).slice(2, 8) + "\n",
    cursorOffset: 15,
  },
  {
    id: "timestamp",
    title: "插入当前时间戳",
    description: "插入精确到分钟的日期与时间",
    icon: "🕒",
    category: "知识连接",
    keywords: ["time", "sj", "shijian", "date", "now", "riqi"],
    template: "", // Dynamic
  },
];

/**
 * Filter slash commands based on typed query (supporting pinyin, id, title, and keywords)
 */
export function matchSlashCommands(rawQuery: string): SlashCommand[] {
  const clean = rawQuery.trim().toLowerCase();
  if (!clean) return SLASH_COMMANDS;

  return SLASH_COMMANDS.filter((cmd) => {
    if (cmd.id.toLowerCase().includes(clean)) return true;
    if (cmd.title.toLowerCase().includes(clean)) return true;
    if (cmd.description.toLowerCase().includes(clean)) return true;
    return cmd.keywords.some((kw) => kw.toLowerCase().includes(clean));
  });
}

/**
 * Generates dynamic template text for a command
 */
export function getCommandTemplate(cmd: SlashCommand): { text: string; cursorOffset: number } {
  if (cmd.id === "timestamp") {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} `;
    return { text: ts, cursorOffset: ts.length };
  }
  return { text: cmd.template, cursorOffset: cmd.cursorOffset ?? cmd.template.length };
}
