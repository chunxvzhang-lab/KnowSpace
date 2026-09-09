export interface BentoFeature {
  id: string;
  badge: string;
  title: string;
  description: string;
  image: string;
  colSpan: 'col-8' | 'col-4' | 'col-6' | 'col-12';
  highlights: string[];
  tagColor: 'cyan' | 'indigo' | 'emerald' | 'amber';
}

export const TRUST_METRICS = [
  { label: '100% Local-First', desc: '物理事务原子落盘，零网络外泄与隐私追踪', icon: 'ShieldCheck' },
  { label: '< 15ms 混合检索引擎', desc: '高性能段落级倒排索引，键入即刻呈现', icon: 'Zap' },
  { label: 'JSON Canvas 1.0 标准', desc: '开放白板规范，与全球开源生态无缝互通', icon: 'Layout' },
  { label: '60FPS 知识星系图谱', desc: '黄金螺旋动态力导向拓扑与聚类光环', icon: 'Share2' },
  { label: '高保真矢量打印', desc: 'Chromium 原生排版管线，跨页智能防截断', icon: 'Printer' }
];

export const BENTO_FEATURES: BentoFeature[] = [
  {
    id: 'canvas',
    badge: 'v2.0.0 空间化认知旗舰',
    title: '无限空间可视化白板 (JSON Canvas 1.0)',
    description: '打破一维线性纯文本的束缚。在无限物理尺度的二维空间中自由陈列 Markdown 卡片、文档卡片与分组框；独创逆向拓扑算法，一键将零碎概念萃取为严谨的 Markdown 专著。',
    image: './images/32-infinite-canvas.png',
    colSpan: 'col-8',
    highlights: ['JSON Canvas 1.0 开放标准', '微缩雷达鹰眼 (Minimap)', '贝塞尔平滑因果连线', '逆向拓扑萃取生成长文'],
    tagColor: 'cyan'
  },
  {
    id: 'history',
    badge: 'v2.0.0 数据安全防丢',
    title: '本地版本时间旅行与 Myers LCS Diff',
    description: '摆脱对外部 Git 的繁琐依赖。保存时本地静默捕获轻量级不可变快照，毫秒级逐行高精双栏对比，支持增删统计与一键安全时光倒流。',
    image: './images/34-version-history.png',
    colSpan: 'col-4',
    highlights: ['Side-by-Side 双栏对比', 'Myers LCS 行级算法', '实时增删统计徽章', '一键安全无损还原'],
    tagColor: 'emerald'
  },
  {
    id: 'search',
    badge: 'v2.0.0 毫秒级混合检索',
    title: '全库混合检索与结构化语法体系',
    description: '原生支持 tag:#标签、link:[[双链]]、"严格短语" 与 -负向排除词。搜索结果直观标注章节与物理行号，点击秒级跨文档平滑导航并激发脉冲高亮。',
    image: './images/35-hybrid-vault-search.png',
    colSpan: 'col-4',
    highlights: ['tag:# 与 link:[[ 结构化语法', '跨文档毫秒级高亮脉冲', '快捷语法辅助芯片 (Chips)', '单篇/全库双模式切换'],
    tagColor: 'indigo'
  },
  {
    id: 'mindmap',
    badge: '全键盘双向流转',
    title: '交互式思维导图与多格式生态导出',
    description: 'Markdown 标题大纲与思维导图一键实时双向同步。支持 Tab / Enter 全键盘盲操心流、右键 8 色主题定制，以及 OPML 2.0 / FreeMind / PNG 高清无损生态导出。',
    image: './images/24-mindmap-view.png',
    colSpan: 'col-8',
    highlights: ['Markdown 与脑图即时转换', '全键盘盲操编辑心流', 'OPML 2.0 / FreeMind 导出', '节点连线外观深度定制'],
    tagColor: 'amber'
  },
  {
    id: 'graph',
    badge: '全局与局部宏观洞悉',
    title: '60FPS 知识星系图谱与多层探索',
    description: '通过全景力导向算法洞悉全库双向链接网络。支持 1-Hop / 2-Hop 关联深度切换与目录社区彩色聚类光环，告别混乱的毛线团效应，精准识别孤岛笔记。',
    image: './images/31-graph-depth-clustering.png',
    colSpan: 'col-6',
    highlights: ['60FPS 顺滑拓扑动画', '1-Hop / 2-Hop 关联步长过滤', '文件夹社区彩色聚类光环', '未关联孤岛节点一目了然'],
    tagColor: 'cyan'
  },
  {
    id: 'capsule',
    badge: '灵感零延迟收集',
    title: '闪念胶囊速记悬浮微窗与时空看板',
    description: '按下全局热键 Alt+Space 瞬间唤起毛玻璃速记微窗，秒级捕获待办与灵感碎片并原子落盘至收集箱。配套 GitHub 风格活跃度热力矩阵，忠实记录每日认知足迹。',
    image: './images/15-flash-capsule.png',
    colSpan: 'col-6',
    highlights: ['Alt+Space 全局系统热键', '常驻托盘与开机静默秒开', '物理追加落盘 Inbox/', 'GitHub 风格年度活跃度热力图'],
    tagColor: 'emerald'
  }
];

export const WORKSPACE_MODES = [
  {
    id: 'read',
    name: '纯净阅读',
    icon: 'BookOpen',
    title: '阅读模式 (Read Mode)',
    desc: '960px 黄金视宽排版，沉浸无干扰阅读，打字机居中滚动锁定，支持全屏无损媒体灯箱与 3× Retina PNG 导出。',
    image: './images/07-mode-read.png'
  },
  {
    id: 'split',
    name: '左右分屏',
    icon: 'Columns2',
    title: '左右双栏协同分屏 (Split Mode)',
    desc: '左侧极客源码，右侧实时富文本渲染。自研高精度 AST 块级映射分段线性双向联动滚动，万字长文精准对齐。',
    image: './images/05-mode-split.png'
  },
  {
    id: 'source',
    name: '纯源码极客',
    icon: 'Code2',
    title: '纯源码模式 (Source Mode)',
    desc: '基于先进的 CodeMirror 6 打造，原生支持代码折叠、YAML Front Matter 元数据管理与极客行号槽位。',
    image: './images/06-mode-source.png'
  },
  {
    id: 'mindmap',
    name: '思维导图',
    icon: 'GitBranch',
    title: '交互式思维导图 (Mindmap View)',
    desc: '按下 Ctrl+M 瞬间将 Markdown 大纲转化为交互脑图，支持全键盘 Tab/Enter 盲操编辑、拖拽防环重构与 OPML/FreeMind 导出。',
    image: './images/24-mindmap-view.png'
  },
  {
    id: 'canvas',
    name: '无限白板',
    icon: 'Palette',
    title: '无限空间白板 (JSON Canvas 1.0)',
    desc: '非线性自由空间思考，支持文本卡片、嵌入文档、贝塞尔流向连线与全局 Minimap 鹰眼，一键逆向拓扑萃取为长文。',
    image: './images/32-infinite-canvas.png'
  }
];
