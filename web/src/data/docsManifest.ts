export interface DocModule {
  id: string;
  index: string;
  category: string;
  title: string;
  shortcut?: string;
  description: string;
  images: {
    src: string;
    caption: string;
  }[];
  keyPoints: string[];
}

export const DOCS_MODULES: DocModule[] = [
  {
    id: 'workbench',
    index: '01',
    category: '界面架构',
    title: '工作台全景与三段式交互架构',
    shortcut: 'Ctrl + \\',
    description: '左侧知识库目录树、中央现代化双栏分屏工作区、右侧多功能抽屉栏与底部状态栏，信息层级分明，支持随时自适应折叠。',
    images: [{ src: './images/01-overview-workbench.png', caption: 'KnowSpace v2.0.0 工作台界面全景' }],
    keyPoints: ['三段式弹性布局调度', '状态栏实时统计字数与编码', 'Ctrl+\\ 一键收起左侧目录树']
  },
  {
    id: 'themes',
    index: '02',
    category: '主题系统',
    title: '三大沉浸主题系统',
    shortcut: '顶栏主题按钮',
    description: '日光浅色 (Warm Amber)、仿电子墨水屏 (E-ink Paper) 与极客暗黑 (Geek Dark)，全天候不同光照环境下舒适护眼阅读。',
    images: [
      { src: './images/02-theme-light.png', caption: '☀️ 日光浅色主题 (Warm Amber)' },
      { src: './images/03-theme-eink.png', caption: '📖 仿电子墨水屏主题 (E-ink Paper)' },
      { src: './images/04-theme-dark.png', caption: '✨ 极客暗黑主题 (Geek Dark)' }
    ],
    keyPoints: ['CSS 自定义属性毫秒级无极过渡', '墨水屏低疲劳灰度色阶调优', '暗黑模式高对比度代码高亮']
  },
  {
    id: 'workspace-views',
    index: '03',
    category: '视图模式',
    title: '五重视图自适应切换',
    shortcut: '阅读 / 分屏 / 源码 / 脑图 / 白板',
    description: '涵盖纯净阅读、左右分屏协同、纯源码极客、交互式思维导图与无限空间可视化白板，满足不同创作阶段的心流需求。',
    images: [
      { src: './images/05-mode-split.png', caption: '左右双栏分屏协同读写模式' },
      { src: './images/06-mode-source.png', caption: '纯源码沉浸极客模式' },
      { src: './images/07-mode-read.png', caption: '纯净排版阅读模式' }
    ],
    keyPoints: ['AST 块级映射分段线性双向同步滚动', 'CodeMirror 6 极客代码精准折叠', '960px 黄金视宽阅读模式']
  },
  {
    id: 'rich-markdown',
    index: '04',
    category: '排版渲染',
    title: '高级富文本与现代科学排版引擎',
    shortcut: 'GFM / LaTeX',
    description: '原生支持 GitHub Flavored Markdown 表格、任务列表、KaTeX 复杂物理与数学公式、Mermaid 流程图与时序图。',
    images: [{ src: './images/08-rich-markdown.png', caption: '现代富文本排版与科学公式渲染' }],
    keyPoints: ['KaTeX 矢量数学公式无损渲染', 'Mermaid 架构图与流程图实时渲染', 'GFM 任务清单就地交互打勾']
  },
  {
    id: 'code-copy',
    index: '05',
    category: '编辑体验',
    title: '代码块语法高亮与一键复制微动效',
    description: '涵盖 100+ 编程语言高精度语法着色，顶部常驻语言标签微胶囊与悬浮一键复制按钮，带柔和绿色勾选微动效。',
    images: [{ src: './images/20-code-copied.png', caption: '代码围栏悬浮一键复制微动效' }],
    keyPoints: ['多语言自动高精度着色', '一键复制至系统剪贴板', '平滑对号状态切换反馈']
  },
  {
    id: 'multi-tabs',
    index: '06',
    category: '标签协同',
    title: '原生多标签协同浏览与标签右键管理',
    shortcut: 'Ctrl + W / 鼠标中键',
    description: '支持同时打开多个章节文档，未保存修改以呼吸灯徽章直观提示，右键支持关闭其它、关闭所有或在新窗口拆分。',
    images: [{ src: './images/09-multi-tabs.png', caption: '多文档标签页协同与呼吸灯状态' }],
    keyPoints: ['标签平滑水平滚动漫游', '鼠标中键点击标签秒关', '未保存状态呼吸灯拦截保护']
  },
  {
    id: 'split-compare',
    index: '07',
    category: '对比审查',
    title: '原生双文档左右分屏对比模式',
    description: '在标签页右键选择「向右拆分」，实现左右两个独立 Markdown 文档并排研读对比，各自保持独立视口高度与书签。',
    images: [{ src: './images/10-dual-split-compare.png', caption: '左右双文档并排独立阅读对比模式' }],
    keyPoints: ['双文档独立滚动视口', '技术方案与参考规范并排研读', '一键还原单屏工作台']
  },
  {
    id: 'mindmap-view',
    index: '08',
    category: '思维导图',
    title: '交互式思维导图模式',
    shortcut: 'Ctrl + M',
    description: '按下 Ctrl+M 将文档结构化大纲秒级转化为交互脑图。支持 Tab 添加子分支、Enter 添加同级分支、方向键快速漫游。',
    images: [{ src: './images/24-mindmap-view.png', caption: 'Markdown 大纲秒转交互式思维导图' }],
    keyPoints: ['全键盘心流盲操编辑', '分支折叠与展开收束', '画布滚轮平移缩放漫游']
  },
  {
    id: 'mindmap-custom',
    index: '09',
    category: '思维导图',
    title: '思维导图节点右键编辑与分支管理',
    description: '右键点击任意导图节点，唤出定制面板：选择 8 种高雅主题配色、4 种节点形状、3 种连线形态，支持拖拽防环吸附重构。',
    images: [{ src: './images/25-mindmap-customization.png', caption: '导图节点与连线外观深度定制' }],
    keyPoints: ['8 色雅致主题快速换肤', '拖拽节点跨分支智能吸附', '就地 F2 激活重命名输入框']
  },
  {
    id: 'mindmap-export',
    index: '10',
    category: '思维导图',
    title: '思维导图多格式生态导出',
    shortcut: '导出按钮 ▾',
    description: '支持导出为透明底 300+ DPI 印刷级 PNG、标准 OPML 2.0 树形大纲、FreeMind (.mm) 格式以及标准 Markdown。',
    images: [{ src: './images/30-mindmap-export-modal.png', caption: '思维导图多格式生态导出面板' }],
    keyPoints: ['OPML 2.0 无损导入主流脑图软件', '透明背景超清 PNG 导出', '结构化 Markdown 树形转储']
  },
  {
    id: 'command-palette',
    index: '11',
    category: '极客心流',
    title: '全局命令中枢 (Command Palette)',
    shortcut: 'Ctrl + K / Ctrl + P',
    description: '随时按下快捷键唤起全能搜索中枢：支持拼音模糊匹配文档、输入前缀 > 触发系统动作、输入前缀 # 跨小节大纲穿透。',
    images: [{ src: './images/27-command-palette.png', caption: '全局命令中枢快速检索与动作调度' }],
    keyPoints: ['全键盘盲操不离主键区', '拼音首字母模糊智能纠错', '动作、文件、大纲三模合一']
  },
  {
    id: 'slash-menu',
    index: '12',
    category: '极客心流',
    title: '编辑器斜杠快捷指令菜单',
    shortcut: '/ (斜杠)',
    description: '在编辑器空行键入斜杠 /，瞬时唤起浮动菜单，键盘上下键选择即可秒级插入标题、表格、代码围栏、公式、Callout 与图表。',
    images: [{ src: './images/28-slash-commands.png', caption: '编辑器斜杠指令速查浮动菜单' }],
    keyPoints: ['常用 Markdown 模板秒级补全', '键盘上下键高亮无缝回车', '支持关键词就地过滤选项']
  },
  {
    id: 'context-menu',
    index: '13',
    category: '编辑体验',
    title: '极客编辑器右键上下文增强菜单',
    description: '选中文本右键单击，快速提取为新独立笔记、快速建立双向链接 [[文档]]、包裹代码块或存入闪念收集箱。',
    images: [{ src: './images/29-editor-context-menu.png', caption: '编辑器上下文智能感知右键菜单' }],
    keyPoints: ['选区一键提取为独立原子笔记', '快捷包裹语法符号', '右键格式化 Markdown 排版']
  },
  {
    id: 'backlinks',
    index: '14',
    category: '双向链接',
    title: '双向链接网络与反向引用面板',
    shortcut: '[[ 或 侧栏反链',
    description: '键入 [[ 唤出全库文档联想卡片建立双链；展开右侧反向引用面板，实时查看所有引用了当前文档的其他章节与段落。',
    images: [{ src: './images/22-backlinks-panel.png', caption: '双向链接网络与反向引用抽屉面板' }],
    keyPoints: ['[[ 自动联想全库文档', '反向链接实时反查聚合', '未显式引用的潜在提及发现']
  },
  {
    id: 'block-ref',
    index: '15',
    category: '双向链接',
    title: '原子块级引用与嵌入卡片',
    shortcut: '#^ 联想',
    description: '为长文段落打上唯一指纹锚点 ^block-id，在其他笔记中以卡片形式完整嵌入显示原段落，原出处更新时全库实时同步。',
    images: [{ src: './images/26-block-reference.png', caption: '原子级段落指纹块引用与嵌入卡片' }],
    keyPoints: ['段落级微粒度原子引用', '嵌入卡片原出处一键穿透定位', '跨文档复用核心定义与结论']
  },
  {
    id: 'global-graph',
    index: '16',
    category: '知识网络',
    title: '知识网络全景拓扑图谱',
    shortcut: 'Ctrl + G',
    description: '60FPS 顺滑的动态力导向拓扑网络。节点大小代表关联热度，连线代表双向关联，鼠标拖拽节点、缩放画布，发现知识孤岛。',
    images: [{ src: './images/21-global-graph.png', caption: '60FPS 知识网络全景力导向拓扑图谱' }],
    keyPoints: ['动态物理引力模拟演算', '孤岛笔记快速发现治理', '单击节点直接打开对应文档']
  },
  {
    id: 'graph-clustering',
    index: '17',
    category: '知识网络',
    title: '知识图谱多层探索与彩色聚类光环',
    description: '提供 1-Hop / 2-Hop 关联深度切换与目录社区彩色聚类光环，告别千篇笔记时的“毛线团效应”，宏观拓扑井然有序。',
    images: [{ src: './images/31-graph-depth-clustering.png', caption: '图谱关联深度调节与彩色聚类光环' }],
    keyPoints: ['1-Hop / 2-Hop 关联步长精准聚焦', '同目录节点彩色聚类光环包裹', '告别视觉杂乱与性能瓶颈']
  },
  {
    id: 'flash-capsule',
    index: '18',
    category: '灵感捕获',
    title: '闪念胶囊灵感速记悬浮微窗',
    shortcut: 'Alt + Space',
    description: '无论正在编码、浏览网页还是开会，按下全局系统热键唤出毛玻璃微窗，Ctrl+Enter 保存秒级原子落盘至收集箱。',
    images: [{ src: './images/15-flash-capsule.png', caption: '闪念胶囊灵感速记悬浮微窗' }],
    keyPoints: ['全局系统级热键秒唤', '秒级落盘 Inbox/ 收集箱', '绝不打断当前主线工作']
  },
  {
    id: 'flash-settings',
    index: '19',
    category: '灵感捕获',
    title: '闪念胶囊全局热键录制与常驻配置',
    description: '点击齿轮图标，支持在输入框直接按下心仪组合键就地重绑定，勾选开机静默自启与常驻托盘，保障 0 延迟秒开。',
    images: [{ src: './images/15-flash-capsule-settings.png', caption: '闪念胶囊全局热键录制与常驻面板' }],
    keyPoints: ['快捷键实时捕获录制', '系统托盘常驻后台秒开', '开机静默自启配置']
  },
  {
    id: 'timeline-panel',
    index: '20',
    category: '时空足迹',
    title: '知识时空面板与活跃度热力矩阵',
    description: '展开时空足迹看板，以 GitHub 风格绿色矩阵方块展现一年内每日创作与阅读节律，记录关键里程碑。',
    images: [{ src: './images/23-timeline-panel.png', caption: '知识时空看板与 GitHub 风格热力矩阵' }],
    keyPoints: ['每日字数与活动深度热力格', '知识演进里程碑足迹回溯', '创作节奏量化可视化']
  },
  {
    id: 'navigation-toc',
    index: '21',
    category: '导航检索',
    title: '多级实时大纲目录树 (TOC)',
    description: '实时解析正文中 H1~H6 标题树，随着阅读滚动大纲项自动脉冲高亮，点击平滑滚动直达对应章节小节。',
    images: [{ src: './images/11-navigation-toc.png', caption: '多级实时大纲目录树与视口高亮' }],
    keyPoints: ['视口高亮实时穿透脉冲', '平滑动画毫秒级滚动', '深层嵌套标题结构清晰']
  },
  {
    id: 'fulltext-search',
    index: '22',
    category: '导航检索',
    title: '全文极速检索与毫秒级高亮穿透',
    shortcut: 'Ctrl + F',
    description: '倒排索引在万字长文中键入关键词瞬间呈现所有匹配卡片，点击卡片直接滚动并驱动光标精准选中文本。',
    images: [{ src: './images/12-fulltext-search.png', caption: '单文档全文检索与高亮穿透定位' }],
    keyPoints: ['前后段落上下文智能预览', '命中文本黄色发光背景', '光标精准选中文本']
  },
  {
    id: 'bookmarks',
    index: '23',
    category: '导航检索',
    title: '精选书签与阅读进度百分比管理',
    shortcut: 'Ctrl + B',
    description: '按下 Ctrl+B 为当前段落打上书签，卡片精确记录章节名称与当前阅读百分比（如 68%），点击精确回到视口。',
    images: [{ src: './images/13-bookmarks.png', caption: '精选书签与精准阅读进度百分比' }],
    keyPoints: ['精确阅读高度百分比记录', '重点小节快速收藏打标', '一键续读无缝直达']
  },
  {
    id: 'media-lightbox',
    index: '24',
    category: '视觉体验',
    title: '媒体与架构图无损缩放灯箱',
    shortcut: '单击图片 / Esc',
    description: '单击任意大型 Mermaid 架构图或插图进入全屏灯箱，支持 20%~500% 矢量无损缩放平移与 3× Retina PNG 导出。',
    images: [{ src: './images/14-media-lightbox.png', caption: '媒体与架构图全屏无损缩放灯箱' }],
    keyPoints: ['20%~500% 矢量无损放大', '3× Retina 印刷级透明图导出', 'Esc 或双击随时退出']
  },
  {
    id: 'mode-zen',
    index: '25',
    category: '沉浸专注',
    title: 'Zen 极简专注模式',
    shortcut: 'F10',
    description: '按下 F10 瞬间隐去所有侧栏、目录树与工具栏，正文自适应 960px 居中，零干扰沉浸在心流创作中。',
    images: [{ src: './images/19-mode-zen.png', caption: 'Zen 极简专注无干扰创作模式' }],
    keyPoints: ['一键隐去全屏侧边栏', '960px 黄金视宽自然收束', '再按 F10 一秒恢复工作台']
  },
  {
    id: 'conflict-dialog',
    index: '26',
    category: '数据安全',
    title: '外部编辑器并发修改冲突协商',
    description: '比对物理文件指纹 { size, mtimeMs }，当外部程序（Git pull / 云同步盘 / VSCode）修改文件时，弹出三向协商对话框。',
    images: [{ src: './images/18-dialog-conflict.png', caption: '外部编辑器并发修改三向冲突协商弹窗' }],
    keyPoints: ['磁盘指纹精准防丢', '重新载入 / 强制覆盖 / 另存为', '云同步冲突万无一失']
  },
  {
    id: 'unsaved-guard',
    index: '27',
    category: '数据安全',
    title: '物理事务原子落盘与未保存守卫拦截',
    shortcut: 'Ctrl + S',
    description: '底层写入隐藏临时文件，调用 OS 级 fsync 确保沉入物理扇区再原子替换；全链路拦截未保存离开动作，彻底杜绝丢稿。',
    images: [{ src: './images/17-dialog-unsaved.png', caption: '全链路未保存修改安全拦截弹窗' }],
    keyPoints: ['Temp + Fsync 物理事务原子写', '切换章节与退出应用全链路守卫', '0 字节损坏彻底绝迹']
  },
  {
    id: 'infinite-canvas',
    index: '28',
    category: 'v2.0.0 旗舰',
    title: '无限空间可视化白板 (JSON Canvas 1.0 标准)',
    description: '突破线性思维。在无限二维空间中自由陈列 Markdown 文本卡片、嵌入笔记、网页与分组框，支持贝塞尔连线与 Minimap 鹰眼。',
    images: [{ src: './images/32-infinite-canvas.png', caption: '无限空间可视化白板 (JSON Canvas 1.0)' }],
    keyPoints: ['JSON Canvas 1.0 开放标准无锁死', '滚轮以光标为中心 10%~500% 缩放', '右上角微缩雷达鹰眼跳跃穿透']
  },
  {
    id: 'canvas-extraction',
    index: '29',
    category: 'v2.0.0 旗舰',
    title: '白板卡片定制与逆向拓扑长文萃取',
    shortcut: '📝 导出为 Markdown',
    description: '独创逆向拓扑算法（Topological Sort），根据卡片因果连线与空间坐标，自动重构萃取为一篇层次严密的 Markdown 长文。',
    images: [{ src: './images/33-canvas-card-creation.png', caption: '白板卡片属性定制与拓扑逆向长文生成' }],
    keyPoints: ['多选卡片一键打包为分组 (Ctrl+G)', '连线流向一键翻转快捷键 R', '非线性思考到线性长文完美闭环']
  },
  {
    id: 'version-history',
    index: '30',
    category: 'v2.0.0 旗舰',
    title: '本地版本时间旅行与 Myers LCS 差异对比',
    shortcut: 'Ctrl + Shift + H',
    description: '脱离外部 Git。保存时自动在本地记录不可变轻量快照，Myers LCS 逐行双栏对比，展示 +N/-N 增删统计并支持一键无损还原。',
    images: [{ src: './images/34-version-history.png', caption: '本地版本时间旅行与 Myers LCS 差异对比' }],
    keyPoints: ['毫秒级 Myers LCS 行级 Diff', '新增行浅绿/删除行浅红微光提示', '一键安全时光倒流恢复']
  },
  {
    id: 'hybrid-search',
    index: '31',
    category: 'v2.0.0 旗舰',
    title: '全库毫秒级混合检索引擎与结构化语法',
    shortcut: 'Ctrl + Shift + F',
    description: '基于高性能倒排索引，支持 tag:#标签、link:[[双链]]、"精确短语"、-排除词结构化语法，点击卡片秒级平滑定位并激发脉冲高亮。',
    images: [{ src: './images/35-hybrid-vault-search.png', caption: '全库混合检索与结构化语法体系' }],
    keyPoints: ['tag:# 与 link:[[ 结构化语法', '语法快捷芯片点击就地补全', '跨文档导航 1.8 秒电光蓝脉冲高亮']
  },
  {
    id: 'about-dialog',
    index: '32',
    category: '系统关于',
    title: '关于 KnowSpace 与团队致谢',
    shortcut: '活动栏 ℹ️ 按钮',
    description: '展示现代技术架构栈：React 19 + TypeScript + Electron 42 + CodeMirror 6 + KaTeX + JSON Canvas 1.0，遵循 MIT 开源许可。',
    images: [{ src: './images/16-about-dialog.png', caption: '关于 KnowSpace 桌面技术栈与摸鱼Lab' }],
    keyPoints: ['MIT 开源许可协议', '纯本地零云端外泄架构', '摸鱼Lab (Moyu Lab) 匠心呈现']
  }
];
