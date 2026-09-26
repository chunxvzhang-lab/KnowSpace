/**
 * The command registry: one descriptor per user-invokable app action.
 *
 * This is the single source of truth for WHAT commands exist. Before this file,
 * the same action was wired separately in the palette array (App.tsx), the
 * keyboard handler (useGlobalShortcuts) and the Electron menu routing — which
 * is how the mindmap toggle ended up as two verbatim copies of the same updater
 * and the typewriter toggle as two divergent implementations. Every consumer
 * (palette `>` mode, keybindings, menu, and future entry points) routes through
 * `commandBus.execute(id)`; the handler implementations are bound once in
 * `useCommandRegistrations` (App).
 *
 * Pure data on purpose (L2): no React, no stores, no bridge. The titles are the
 * palette's user-facing strings and are kept byte-identical to what the old
 * inline array showed.
 */

export type CommandCategory =
  | "视图与排版"
  | "文档操作"
  | "复习"
  | "导出与分发"
  | "知识库管理"
  | "界面交互"
  | "写作辅助"
  | "个性化外观"
  | "系统与支持"
  | "导航";

export interface CommandDescriptor {
  /** Stable, namespaced. Never renamed casually — the menu contract maps onto it. */
  id: string;
  title: string;
  description?: string;
  category: CommandCategory;
  /**
   * Display metadata only. The actual key binding lives in useGlobalShortcuts;
   * this string is what the palette shows. Alt+1/2/3 are displayed but not
   * bound anywhere yet (pre-existing state, kept honest by this comment).
   */
  shortcut?: string;
  /** Excluded from the palette list: bound keys whose palette entry would be noise. */
  hidden?: boolean;
}

export const COMMANDS: readonly CommandDescriptor[] = [
  {
    id: "view.read",
    title: "切换视图: 阅读模式",
    description: "沉浸式无干扰文档阅读模式",
    shortcut: "Alt+1",
    category: "视图与排版",
  },
  {
    id: "view.split",
    title: "切换视图: 双栏实时预览",
    description: "左侧编辑器，右侧实时渲染与同步滚动",
    shortcut: "Alt+2",
    category: "视图与排版",
  },
  {
    id: "view.source",
    title: "切换视图: 源码编辑",
    description: "全宽纯净 Markdown 源码编辑模式",
    shortcut: "Alt+3",
    category: "视图与排版",
  },
  {
    id: "view.toggleMindmap",
    title: "切换视图: 思维导图",
    description: "将文档大纲结构转换为无限画布可视化脑图",
    shortcut: "Ctrl+M",
    category: "视图与排版",
  },
  {
    id: "view.toggleCanvas",
    title: "切换视图: 空间白板",
    description: "进入无限多模态可视化白板工作区",
    category: "视图与排版",
  },
  {
    id: "view.toggleGraph",
    title: "切换知识图谱分栏",
    description: "开启或收起右侧全局双向引用关系图谱",
    shortcut: "Ctrl+G",
    category: "视图与排版",
  },
  {
    id: "view.toggleTypewriter",
    title: "切换打字机居中模式",
    description: "保持当前输入光标始终居中于视口中心",
    shortcut: "Alt+T",
    category: "写作辅助",
  },
  {
    id: "review.start",
    title: "开始复习：闪卡",
    description: "打开侧栏的复盘视图，从上次用过的来源继续",
    category: "复习",
  },
  {
    id: "document.print",
    title: "高保真专业 PDF 打印",
    description: "生成高分辨率向量级打印文稿与 PDF 导出",
    shortcut: "Ctrl+P",
    category: "导出与分发",
  },
  {
    id: "document.newFile",
    title: "新建 Markdown 笔记",
    description: "在当前知识库中创建一个全新空白笔记",
    shortcut: "Ctrl+N",
    category: "文档操作",
  },
  {
    id: "document.newCanvas",
    title: "新建空间白板 (.canvas)",
    description: "创建一个无限可视化白板，自由拖拽卡片与建立语义连线",
    category: "文档操作",
  },
  {
    id: "document.save",
    title: "保存当前笔记",
    description: "将当前编辑中的笔记落盘保存至本地磁盘",
    shortcut: "Ctrl+S",
    category: "文档操作",
  },
  {
    id: "document.saveAs",
    title: "另存为笔记...",
    description: "将当前笔记内容导出另存到自定义目录",
    shortcut: "Ctrl+Shift+S",
    category: "文档操作",
  },
  {
    id: "document.openFile",
    title: "打开 Markdown 文件",
    description: "从本地磁盘选择并打开单个 Markdown 笔记",
    shortcut: "Ctrl+O",
    category: "知识库管理",
  },
  {
    id: "document.openDirectory",
    title: "打开本地知识库目录",
    description: "加载本地包含 Markdown 笔记的文件夹",
    shortcut: "Ctrl+Shift+O",
    category: "知识库管理",
  },
  {
    id: "document.addBookmark",
    title: "为当前笔记添加书签",
    description: "把当前阅读位置加入书签列表",
    shortcut: "Ctrl+B",
    category: "文档操作",
    hidden: true,
  },
  {
    id: "navigation.focusSearch",
    title: "打开搜索",
    description: "检索当前知识库的全部笔记内容",
    shortcut: "Ctrl+F",
    category: "知识库管理",
  },
  {
    id: "navigation.previous",
    title: "上一篇笔记",
    shortcut: "Alt+←",
    category: "导航",
    hidden: true,
  },
  {
    id: "navigation.next",
    title: "下一篇笔记",
    shortcut: "Alt+→",
    category: "导航",
    hidden: true,
  },
  {
    id: "ui.openVersionHistory",
    title: "版本快照历史与双栏比对",
    description: "查看本地历史版本快照、逐行差异对比与一键安全还原",
    shortcut: "Ctrl+Shift+H",
    category: "文档操作",
  },
  {
    id: "navigation.toggleDirectory",
    title: "展开 / 收起文档目录侧边栏",
    description: "切换左侧工作区文件树目录的显示状态",
    shortcut: "Ctrl+\\",
    category: "界面交互",
  },
  {
    id: "ui.toggleFullscreen",
    title: "切换全屏模式",
    description: "最大化工作区进入全屏无边框书写体验",
    shortcut: "F11",
    category: "界面交互",
  },
  {
    id: "ui.themeTwitter",
    title: "视觉主题: 暗黑深邃 (Dark)",
    description: "适合夜间专注书写的暗色主题",
    category: "个性化外观",
  },
  {
    id: "ui.themeLight",
    title: "视觉主题: 极简纯白 (Light)",
    description: "高对比度纸张级明亮主题",
    category: "个性化外观",
  },
  {
    id: "ui.themeEink",
    title: "视觉主题: 电子墨水屏 (E-ink)",
    description: "纯黑白极简无色差墨水屏质感",
    category: "个性化外观",
  },
  {
    id: "ui.about",
    title: "关于 KnowSpace 与帮助",
    description: "查看当前软件版本、系统信息与开源协议",
    category: "系统与支持",
  },
];

export type CommandId = (typeof COMMANDS)[number]["id"];

const byId = new Map<string, CommandDescriptor>(COMMANDS.map((c) => [c.id, c]));

export function getCommand(id: string): CommandDescriptor | undefined {
  return byId.get(id);
}

export function listCommands(): CommandDescriptor[] {
  return COMMANDS.slice();
}

/** What the palette shows: everything, minus the explicitly hidden bindings. */
export function listPaletteCommands(): CommandDescriptor[] {
  return COMMANDS.filter((c) => !c.hidden);
}
