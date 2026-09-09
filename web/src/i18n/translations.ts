import { TranslationDictionary, Language } from './types';

export const zhTranslations: TranslationDictionary = {
  navbar: {
    features: '产品特性',
    bento: '核心能力',
    workspace: '五维空间',
    interactive: '在线演练',
    comparison: '竞品对比',
    docs: '在线画册与文档',
    commandPalette: '命令中枢',
    download: '免费下载',
    langToggle: 'EN / 中'
  },
  hero: {
    pillTitle: 'SYSTEM ONLINE · KNOWSPACE v2.0.0',
    pillDesc: '无限空间白板 · 本地版本旅行 · 毫秒级混合检索',
    headline: '记录 · 阅读 · 连接 · 认知',
    subhead: '告别折腾 50+ 插件与配置泥潭。开箱即享纯粹 Markdown 写作、全键盘思维导图、JSON Canvas 1.0 空间白板 与 60FPS 知识星系图谱。100% 本地优先，物理事务原子落盘。',
    ctaDownload: '免费下载 Windows 版 (v2.0.0)',
    ctaDocs: '查阅 32 大模块全景画册',
    trustLocal: '100% 数据私有 · 零网络泄露',
    trustSearch: '< 15ms 倒排混合检索引擎',
    trustCanvas: 'JSON Canvas 1.0 全球开放标准',
    themeExperience: '在线亲历设计质感：',
    themeWarm: '日光浅色 (Warm)',
    themeEink: '仿电子墨水屏 (E-ink)',
    themeDark: '极客暗黑 (Geek Dark)',
    windowTag: '03-无限空间白板.canvas',
    windowEngine: '// 5D_WORKSPACE · 60FPS_ENGINE',
    windowStatus: '物理原子落盘已同步',
    float5DTitle: '五维空间自由跃迁',
    float5DDesc: '阅读 · 分屏 · 源码 · 脑图 · 白板',
    floatLocalTitle: '零知识 · 100% 数据主权',
    floatLocalDesc: 'Temp+Fsync 物理事务原子写'
  },
  socialProof: {
    items: [
      { label: '100% 本地优先', desc: '物理事务原子落盘 · 零云端上传' },
      { label: '< 15ms 混合检索', desc: '段落级高性能倒排索引分词' },
      { label: 'JSON Canvas 1.0', desc: '全球开放白板生态无锁死' },
      { label: '60FPS 动态图谱', desc: '黄金螺旋物理力导向拓扑' },
      { label: '印刷级 PDF 打印', desc: 'Chromium 矢量排版防截断' }
    ]
  },
  bento: {
    badge: '核心能力便当盒',
    title: '开箱即用的极客全能武器库',
    desc: '打破传统单体编辑器的能力边界。无需安装任何额外插件，原生沉淀六大高光认知工程模块。',
    features: [
      {
        id: 'canvas',
        badge: 'v2.0.0 空间化认知旗舰',
        title: '无限空间可视化白板 (JSON Canvas 1.0)',
        desc: '打破一维线性纯文本的束缚。在无限物理尺度的二维空间中自由陈列 Markdown 卡片、文档卡片与分组框；独创逆向拓扑算法，一键将零碎概念萃取为严谨的 Markdown 专著。',
        highlights: ['JSON Canvas 1.0 开放标准', '微缩雷达鹰眼 (Minimap)', '贝塞尔平滑因果连线', '逆向拓扑萃取生成长文']
      },
      {
        id: 'history',
        badge: 'v2.0.0 数据安全防丢',
        title: '本地版本时间旅行与 Myers LCS Diff',
        desc: '摆脱对外部 Git 的繁琐依赖。保存时本地静默捕获轻量级不可变快照，毫秒级逐行高精双栏对比，支持增删统计与一键安全时光倒流。',
        highlights: ['Side-by-Side 双栏对比', 'Myers LCS 行级算法', '实时增删统计徽章', '一键安全无损还原']
      },
      {
        id: 'search',
        badge: 'v2.0.0 毫秒级混合检索',
        title: '全库混合检索与结构化语法体系',
        desc: '原生支持 tag:#标签、link:[[双链]]、"严格短语" 与 -负向排除词。搜索结果直观标注章节与物理行号，点击秒级跨文档平滑导航并激发脉冲高亮。',
        highlights: ['tag:# 与 link:[[ 结构化语法', '跨文档毫秒级高亮脉冲', '快捷语法辅助芯片 (Chips)', '单篇/全库双模式切换']
      },
      {
        id: 'mindmap',
        badge: '全键盘双向流转',
        title: '交互式思维导图与多格式生态导出',
        desc: 'Markdown 标题大纲与思维导图一键实时双向同步。支持 Tab / Enter 全键盘盲操心流、右键 8 色主题定制，以及 OPML 2.0 / FreeMind / PNG 高清无损生态导出。',
        highlights: ['Markdown 与脑图即时转换', '全键盘盲操编辑心流', 'OPML 2.0 / FreeMind 导出', '节点连线外观深度定制']
      },
      {
        id: 'graph',
        badge: '全局与局部宏观洞悉',
        title: '60FPS 知识星系图谱与多层探索',
        desc: '通过全景力导向算法洞悉全库双向链接网络。支持 1-Hop / 2-Hop 关联深度切换与目录社区彩色聚类光环，告别混乱的毛线团效应，精准识别孤岛笔记。',
        highlights: ['60FPS 顺滑拓扑动画', '1-Hop / 2-Hop 关联步长过滤', '文件夹社区彩色聚类光环', '未关联孤岛节点一目了然']
      },
      {
        id: 'capsule',
        badge: '灵感零延迟收集',
        title: '闪念胶囊速记悬浮微窗与时空看板',
        desc: '按下全局热键 Alt+Space 瞬间唤起毛玻璃速记微窗，秒级捕获待办与灵感碎片并原子落盘至收集箱。配套 GitHub 风格活跃度热力矩阵，忠实记录每日认知足迹。',
        highlights: ['Alt+Space 全局系统热键', '常驻托盘与开机静默秒开', '物理追加落盘 Inbox/', 'GitHub 风格年度活跃度热力图']
      }
    ]
  },
  workspace: {
    badge: '五维立体工作区',
    title: '从一维线性文本，到五维空间认知跃迁',
    desc: '思考在不同的阶段需要不同的空间容器。KnowSpace 在一套引擎下无缝承载五种工作形态，随时随需按心流切换。',
    modes: [
      {
        id: 'canvas',
        name: '无限白板',
        title: '无限空间白板 (JSON Canvas 1.0)',
        desc: '非线性自由空间思考，支持文本卡片、嵌入文档、贝塞尔流向连线与全局 Minimap 鹰眼，一键逆向拓扑萃取为长文。',
        bullets: [
          'JSON Canvas 1.0 国际开放标准，与全球生态无损互通',
          '拓扑排序算法：零散白板卡片一键逆向萃取为万字专著',
          'Minimap 鹰眼雷达：全局视口实时穿透跳跃'
        ]
      },
      {
        id: 'split',
        name: '左右分屏',
        title: '左右双栏协同分屏 (Split Mode)',
        desc: '左侧极客源码，右侧实时富文本渲染。自研高精度 AST 块级映射分段线性双向联动滚动，万字长文精准对齐。',
        bullets: [
          'AST 块级映射：解决长篇 Markdown 错位滚动的业界难题',
          '实时双向同步：编辑器与渲染视窗毫秒级对齐'
        ]
      },
      {
        id: 'mindmap',
        name: '思维导图',
        title: '交互式思维导图 (Mindmap View)',
        desc: '按下 Ctrl+M 瞬间将 Markdown 大纲转化为交互脑图，支持全键盘 Tab/Enter 盲操编辑、拖拽防环重构与 OPML/FreeMind 导出。',
        bullets: [
          'Ctrl+M 一秒切换：大纲与导图双向无缝转换',
          'OPML 2.0 / FreeMind 导出：无缝流转至专业思维导图工具'
        ]
      },
      {
        id: 'read',
        name: '纯净阅读',
        title: '阅读模式 (Read Mode)',
        desc: '960px 黄金视宽排版，沉浸无干扰阅读，打字机居中滚动锁定，支持全屏无损媒体灯箱与 3× Retina PNG 导出。',
        bullets: [
          '960px 黄金阅读视宽：专为长时间深度阅读优化的护眼排版',
          '打字机垂直锁定：输入焦点永远居中于舒适视线'
        ]
      },
      {
        id: 'source',
        name: '纯源码极客',
        title: '纯源码模式 (Source Mode)',
        desc: '基于先进的 CodeMirror 6 打造，原生支持代码折叠、YAML Front Matter 元数据管理与极客行号槽位。',
        bullets: [
          'CodeMirror 6 现代底座：代码围栏折叠与极客高亮',
          'YAML Front Matter 管理：完整呈现文档元数据与标签体系'
        ]
      }
    ]
  },
  interactive: {
    badge: '动手试玩',
    title: '在线交互实验室：未下载，先体验',
    desc: '点击下方沙盒，直接在浏览器中体验 KnowSpace v2.0.0 的独创核心逻辑。',
    tabCanvas: '① JSON Canvas 拖拽与逆向萃取',
    tabDiff: '② Myers LCS 差异对比滑块',
    tabSearch: '③ 结构化检索引擎演练',
    canvasTitle: '拖拽卡片体验连线跟随与拓扑萃取',
    canvasDesc: '试着按住左键拖拽下方卡片，贝塞尔连线将实时自适应跟随；点击「📝 导出为 Markdown」查看逆向生成结果。',
    canvasExportBtn: '📝 导出为 Markdown',
    canvasNodeATitle: '卡片 A · 核心定义',
    canvasNodeAName: '分布式知识拓扑',
    canvasNodeADrag: '(可自由按住拖拽)',
    canvasNodeBTitle: '卡片 B · 目标落盘',
    canvasNodeBName: '物理事务原子持久化',
    canvasNodeBDrag: '(可自由按住拖拽)',
    canvasExtractedSuccess: '✨ 拓扑排序逆向萃取结果 (Canvas to Markdown):',
    canvasClosePreview: '关闭预览',
    diffTitle: 'Myers LCS 双栏差异对比滑动演示',
    diffDesc: '拖动中间滑动条，体验左侧历史版本与右侧当前版本的逐行微光对比，实时统计变更。',
    diffAdd: '+18 增加',
    diffDel: '-5 删除',
    diffSnapshotTime: '快照：2026-09-09 21:30 (历史版本)',
    diffCurrentVersion: '当前编辑器版本 (最新)',
    diffRestoreBadge: '可时光倒流还原',
    diffLinesLeft: [
      '01: # 系统架构草案',
      '02: 采用常规线性内存缓存',
      '03: - 单点直接写盘，无 Fsync 事务保障',
      '04: - 不具备历史版本回溯能力',
      '05: 依赖外部手动文件备份'
    ],
    diffLinesRight: [
      '01: # 系统架构草案',
      '02: 采用常规线性内存缓存',
      '03: + 引入 Temp + Fsync 物理事务原子写',
      '04: + 原生内置 Myers LCS 逐行差异引擎',
      '05: + 毫秒级一键安全时光倒流恢复'
    ],
    searchTitle: '全库混合检索引擎与结构化语法演练',
    searchDesc: '点击下方语法芯片，体验毫秒级分词匹配与跨文档穿透定位。',
    searchPlaceholder: '尝试输入 tag:# link:[[ 或关键词...',
    searchSpeed: '⚡ 8ms',
    searchChipsLabel: '快速语法芯片：',
    searchNavBtn: '一键定位 ➔'
  },
  engineering: {
    badge: '硬核工程与安全底座',
    title: '数据安全高于一切：为严谨研究者而生',
    desc: '从底层代码到上层交互，KnowSpace 的每一个技术选型都将「防丢稿、防损坏、防锁定」置于最高优先级。',
    pillars: [
      {
        title: 'Temp + Fsync 物理事务原子落盘',
        desc: '保存时绝不在原文件上直接覆盖。先写入隐藏临时文件，调用 OS 系统级 fsync 确保沉入磁盘物理扇区，再执行原子重命名替换，彻底杜绝断电导致 0 字节损坏。'
      },
      {
        title: '外部编辑器并发修改三向协商',
        desc: '实时校验磁盘物理指纹 { size, mtimeMs }。当外部程序（Git pull / 云同步盘 / 外部编辑器）修改文件时，主动拦截并提供「重载/强制覆盖/另存为」安全协商。'
      },
      {
        title: '零网络上传与绝对数据主权',
        desc: '100% 本地优先运行。软件没有任何后台追踪分析或私有云端上报，断网可用率 100%，您的知识资产永远掌握在自己手中。'
      },
      {
        title: '开放标准生态，拒绝厂商绑定',
        desc: '原生拥抱 JSON Canvas 1.0、OPML 2.0、FreeMind、GitHub Flavored Markdown 与 KaTeX，数据格式自由流转，随时可迁移、可备份。'
      }
    ]
  },
  comparison: {
    badge: '客观横向矩阵',
    title: '为什么选择 KnowSpace？',
    desc: '无需在“受制于云端”与“陷入复杂插件配置”之间妥协。',
    thDimension: '核心考量维度',
    thKnowSpace: 'KnowSpace (v2.0.0)',
    badgeOotb: '开箱即用',
    rows: [
      {
        feature: '数据主权与隐私',
        knowspace: '100% 本地优先 · 物理事务原子落盘 · 零云端上传',
        obsidian: '本地优先，但官方多端同步闭源且按月收费',
        notion: '全部托管云端，断网不可用，存在隐私合规风险',
        typora: '本地单文件，无事务落盘防丢防护',
        highlight: true
      },
      {
        feature: '上手成本与插件依赖',
        knowspace: '开箱即用 · 内置白板/脑图/快照/闪念，告别配置泥潭',
        obsidian: '需折腾 50+ 第三方社区插件与 CSS 代码片段才能好用',
        notion: '需要配置复杂数据库与模板关系',
        typora: '单文件排版器，缺乏工程级知识管理体系',
        highlight: true
      },
      {
        feature: '空间化认知形态',
        knowspace: '五维自由跃迁：阅读 ➔ 分屏 ➔ 源码 ➔ 脑图 ➔ 无限白板',
        obsidian: '依靠第三方 Canvas 插件，与大纲双向流转弱',
        notion: '仅一维线性页面与块级排版',
        typora: '仅所见即所得单重视图',
        highlight: true
      },
      {
        feature: '白板逆向长文生成',
        knowspace: '原生独创 · 基于拓扑排序将 2D 白板一键生成 Markdown 长文',
        obsidian: '无此能力，需手动复制卡片拼接',
        notion: '无白板与拓扑长文生成能力',
        typora: '不支持白板',
        highlight: true
      },
      {
        feature: '本地版本时间旅行',
        knowspace: '内置 Myers LCS 算法 · 逐行双栏对比 · 一键安全时光倒流',
        obsidian: '依赖第三方 Git 插件或按月付费官方版本历史',
        notion: '云端历史，需升级付费企业版才能长期保留',
        typora: '无版本历史对比功能'
      },
      {
        feature: '生态开放度与标准',
        knowspace: 'JSON Canvas 1.0 + OPML 2.0 + FreeMind + GFM + KaTeX',
        obsidian: 'Markdown + 专有插件语法',
        notion: '私有数据库格式锁定，导出易排版错乱',
        typora: '标准 Markdown'
      },
      {
        feature: '沉浸全天候主题',
        knowspace: '日光浅色 (Warm Amber) / 仿电子墨水屏 (E-ink) / 极客暗黑',
        obsidian: '依赖社区第三方深色/浅色 CSS 主题',
        notion: '仅基础深浅双色切换',
        typora: '依赖本地 CSS 样式表'
      }
    ]
  },
  download: {
    badge: '下载中心',
    title: '立即开启您的空间化认知之旅',
    desc: '完全免费、遵循 MIT 开源许可。选择适合您的安装方式：',
    msiBadge: '推荐日常使用',
    msiTitle: 'Windows MSI 自动化安装包',
    msiDesc: '一键自动化静默安装，自动注册系统级 .md 与 .canvas 文件双击关联及快捷方式。',
    msiPoints: [
      '原生集成系统级文件后缀关联',
      '控制面板标准完整卸载支持',
      '支持企业级静默部署参数'
    ],
    msiBtn: '下载 MSI 安装包 (~98 MB)',
    msiNote: '适配 Windows 10 / 11 (64位)',
    zipBadge: '免安装 · 随身携带',
    zipTitle: 'Windows 绿色便携版 (.zip)',
    zipDesc: '无需管理员权限，解压即用。可存放于 U 盘或随身移动硬盘，配置默认保留在自身目录，跨机随行。',
    zipPoints: [
      '解压即可启动，无注册表残留',
      '无管理员权限设备即开即用',
      'U 盘随身移动办公利器'
    ],
    zipBtn: '下载绿色便携版 (.zip)',
    zipNote: '直接解压运行 KnowSpace.exe',
    shaTitle: 'SHA-256 完整性哈希校验',
    shaDesc: '可在安装前使用 PowerShell Get-FileHash 进行校验',
    githubAll: '查看 GitHub 全部 Releases 历史'
  },
  faq: {
    badge: '常见疑问',
    title: '关于 KnowSpace 的高频解答',
    desc: '帮助您快速了解数据安全、格式兼容与技术细节。',
    items: [
      {
        question: 'KnowSpace 是免费的吗？它的开源协议是什么？',
        answer: '是的，KnowSpace 是完全免费且开源的，遵循宽松的 MIT 开源许可协议。您可以无限制在个人电脑、团队及商业项目中使用它，并且永远不会遭遇强制付费门槛或功能锁定。',
        category: '产品与许可'
      },
      {
        question: '我的笔记数据保存在哪里？会有云端同步或上传泄露吗？',
        answer: 'KnowSpace 坚持极致的「100% 本地优先 (Local-First)」原则。您的所有笔记、思维导图、白板画布与版本快照都以完全标准的纯文本文件（.md, .canvas）保存在您指定的本地磁盘文件夹中。软件完全没有任何后台联网分析或云端上传代码，离线断网状态下功能 100% 完整可用。',
        category: '数据安全'
      },
      {
        question: '我可以使用坚果云、OneDrive 或 Git 来同步我的 KnowSpace 知识库吗？',
        answer: '完全可以！因为 KnowSpace 所有文件均为标准的本地磁盘目录结构，您可以直接将知识库文件夹放在 OneDrive、坚果云、Dropbox、iCloud 或 Git 仓库内。KnowSpace 内置外部并发修改冲突协商机制，能智能感知外部云同步盘的修改并提供重载/覆盖/另存协商，绝不丢稿。',
        category: '多端同步'
      },
      {
        question: 'KnowSpace 的白板格式是私有的吗？和其他工具兼容吗？',
        answer: '绝非私有！KnowSpace 严格采用 JSON Canvas 1.0 开放标准（jsoncanvas.org）。这意味着您在 KnowSpace 中创建的 .canvas 白板文件，可以直接在 Obsidian 等支持该开放标准的任何现代知识管理工具中无损打开，反之亦然。',
        category: '生态兼容'
      },
      {
        question: '什么是“无限白板逆向萃取长文”功能？',
        answer: '这是 KnowSpace 独创的核心功能。在进行方案设计或灵感发散时，我们常常先在白板中绘制零散的卡片与因果连线。点击白板工具栏的「📝 导出为 Markdown」，底层算法会基于有向无环图的拓扑排序（Topological Sort），自动分析所有卡片的因果流向与坐标，直接生成一篇各级标题严谨、逻辑顺畅的 Markdown 方案长文，打通从发散到成文的闭环。',
        category: '特色功能'
      },
      {
        question: 'Windows 绿色便携版 (Portable) 与 MSI 安装包有什么区别？',
        answer: 'MSI 安装包适合日常固定在电脑上使用，会自动注册系统级文件关联（双击 .md 或 .canvas 直接打开）；绿色便携版免安装，解压即用，可以放在 U 盘或随身移动硬盘中，在没有管理员权限的办公机上即插即用，且软件配置默认写入自身目录。',
        category: '版本安装'
      }
    ]
  },
  docs: {
    backBtn: '返回产品首页',
    badge: '全功能高清图片手册 (Illustrated Manual) · 32 大模块全景画册',
    searchPlaceholder: '搜索 32 大模块...',
    shortcutLabel: '快捷键：',
    keyPointsHeader: '💡 核心设计与实操要点：',
    zoomIn: '查看大图',
    moduleLabel: '模块'
  },
  footer: {
    brandDesc: '让思想在无界空间中自由生长。下一代本地优先、高颜值的个人知识工作台与认知操作系统。',
    builtBy: 'Designed & Built by 摸鱼Lab (Moyu Lab)',
    colFeatures: '核心特性',
    linkCanvas: '无限可视化白板',
    linkHistory: '本地版本时间旅行',
    linkSearch: '全库毫秒级混合检索',
    link5D: '五维立体工作区',
    linkInteractive: '在线交互实验室',
    colDocs: '文档与画册',
    linkManual: '32 大模块高清图片手册 ➔',
    linkComparison: '主流工具横向对比矩阵',
    linkMsiGuide: 'Windows MSI 安装说明',
    linkZipGuide: '绿色便携版使用指引',
    colCommunity: '开源生态',
    linkGithub: 'GitHub 源码仓库',
    license: '协议：MIT License © 2026',
    openStandard: '开放标准：JSON Canvas 1.0',
    copyright: 'Copyright © 2026 摸鱼Lab (Moyu Lab). All rights reserved.',
    motto: 'Write. Read. Connect. Know.'
  },
  palette: {
    title: '命令中枢 (Command Palette)',
    placeholder: '输入命令或关键词... (按 Esc 关闭)',
    catTheme: '界面与主题系统',
    catNav: '页面导航与画册',
    catDownload: '软件下载与安装',
    themeLight: '☀️ 切换至日光浅色主题 (Warm Amber)',
    themeEink: '📖 切换至仿电子墨水屏主题 (E-ink Paper)',
    themeDark: '✨ 切换至极客暗黑主题 (Geek Dark)',
    navDocs: '📚 打开 32 大模块全景画册与文档手册',
    navHome: '🏠 返回官方独立宣传站首页',
    navInteractive: '🕹️ 体验在线交互实验室 (Canvas & Diff)',
    downloadMsi: '📦 下载 Windows MSI 自动化安装包 (v2.0.0)',
    downloadZip: '💼 下载 Windows 绿色便携版 (.zip)',
    hintEsc: '按 ESC 键退出命令中枢'
  }
};

export const enTranslations: TranslationDictionary = {
  navbar: {
    features: 'Features',
    bento: 'Capabilities',
    workspace: '5D Space',
    interactive: 'Playground',
    comparison: 'Comparison',
    docs: 'Docs & Manual',
    commandPalette: 'Command Menu',
    download: 'Free Download',
    langToggle: '中 / EN'
  },
  hero: {
    pillTitle: 'SYSTEM ONLINE · KNOWSPACE v2.0.0',
    pillDesc: 'Infinite Spatial Canvas · Version Time Travel · Inverted Hybrid Search',
    headline: 'Record · Read · Connect · Know',
    subhead: 'Escape the endless trap of tweaking 50+ plugins. Enjoy pure out-of-the-box Markdown, keyboard-first mind maps, JSON Canvas 1.0 spatial whiteboard, and 60FPS knowledge graph. 100% Local-first with atomic physical persistence.',
    ctaDownload: 'Free Download for Windows (v2.0.0)',
    ctaDocs: 'Explore 32-Module Illustrated Manual',
    trustLocal: '100% Local-First · Zero Cloud Leaks',
    trustSearch: '< 15ms Inverted Hybrid Search',
    trustCanvas: 'JSON Canvas 1.0 Open Global Standard',
    themeExperience: 'Live Theme Preview:',
    themeWarm: 'Warm Light',
    themeEink: 'E-ink Paper',
    themeDark: 'Geek Dark',
    windowTag: '03-spatial-whiteboard.canvas',
    windowEngine: '// 5D_WORKSPACE · 60FPS_ENGINE',
    windowStatus: 'Physical Atomic Fsync Synced',
    float5DTitle: '5D Space Frictionless Leap',
    float5DDesc: 'Read · Split · Source · MindMap · Canvas',
    floatLocalTitle: 'Zero-Knowledge · 100% Sovereignty',
    floatLocalDesc: 'Temp+Fsync Physical Atomic Transaction'
  },
  socialProof: {
    items: [
      { label: '100% Local-First', desc: 'Atomic physical persistence · Zero cloud telemetry' },
      { label: '< 15ms Hybrid Search', desc: 'Paragraph-level inverted index search' },
      { label: 'JSON Canvas 1.0', desc: 'Open spatial canvas without vendor lock-in' },
      { label: '60FPS Dynamic Graph', desc: 'Golden spiral force-directed physics layout' },
      { label: 'Print-Ready PDF', desc: 'Chromium vector rendering with anti-truncation' }
    ]
  },
  bento: {
    badge: 'Core Capabilities Bento',
    title: 'Out-of-the-Box Geek Swiss Knife',
    desc: 'Break through the boundaries of monolithic editors. Zero plugins required, natively offering six hardcore cognitive modules.',
    features: [
      {
        id: 'canvas',
        badge: 'v2.0.0 Spatial Cognitive Flagship',
        title: 'Infinite Spatial Whiteboard (JSON Canvas 1.0)',
        desc: 'Escape linear 1D text constraints. Arrange Markdown cards, documents, and groups freely in 2D space. Unique reverse topological synthesis converts scattered nodes into structured monographs.',
        highlights: ['JSON Canvas 1.0 Open Standard', 'Radar Minimap View', 'Smooth Bezier Connectors', 'Reverse Topological Markdown Synthesis']
      },
      {
        id: 'history',
        badge: 'v2.0.0 Data Safety Guarantee',
        title: 'Local Version Time Travel & Myers LCS Diff',
        desc: 'Eliminate complex Git dependencies. Silently captures lightweight immutable snapshots on save. Real-time side-by-side diff with line stats and instant safe time travel.',
        highlights: ['Side-by-Side Dual Pane Diff', 'Myers LCS Line-Level Algorithm', 'Real-Time Change Badges', 'One-Click Safe Reversion']
      },
      {
        id: 'search',
        badge: 'v2.0.0 Millisecond Hybrid Search',
        title: 'Vault Hybrid Search & Structured Syntax',
        desc: 'Native support for tag:#tag, link:[[wikilink]], "exact phrase" and -negation. Search results indicate headings and line numbers with smooth cross-document pulse highlight.',
        highlights: ['tag:# and link:[[ Syntax', 'Cross-Doc Millisecond Pulse', 'Quick Syntax Chips', 'Single/Vault Dual Mode']
      },
      {
        id: 'mindmap',
        badge: 'Keyboard-First Bi-Directional Flow',
        title: 'Interactive Mind Map & Multi-Format Export',
        desc: 'Instant two-way sync between Markdown headings and mind maps. Full keyboard blind editing with Tab/Enter, 8-color themes, and lossless OPML 2.0 / FreeMind / PNG exports.',
        highlights: ['Markdown to Mind Map Instant Sync', 'Keyboard-Driven Editing Flow', 'OPML 2.0 / FreeMind Export', 'Custom Node & Connector Styling']
      },
      {
        id: 'graph',
        badge: 'Macro & Micro Vault Insight',
        title: '60FPS Knowledge Galaxy Graph & Multi-Depth',
        desc: 'Visualize bidirectional linking networks with panoramic force-directed layout. Switch between 1-Hop and 2-Hop depth with folder community clustering rings to identify orphan notes.',
        highlights: ['Smooth 60FPS Physics Simulation', '1-Hop / 2-Hop Depth Filtering', 'Folder Clustering Halos', 'Clear Island Note Detection']
      },
      {
        id: 'capsule',
        badge: 'Zero-Latency Inspiration Capture',
        title: 'Flash Capsule Floating Window & Heatmap',
        desc: 'Press Alt+Space anywhere to trigger the frosted-glass quick note capsule. Captures todos and fleeting ideas with atomic persistence to Inbox/, accompanied by a GitHub-style activity matrix.',
        highlights: ['Alt+Space Global Hotkey', 'Tray Resident & Instant Launch', 'Atomic Append to Inbox/', 'GitHub-Style Yearly Heatmap']
      }
    ]
  },
  workspace: {
    badge: '5D Spatial Workspace',
    title: 'From 1D Linear Text to 5D Spatial Leap',
    desc: 'Thinking requires different spatial containers at different stages. KnowSpace seamlessly supports five workflow forms under one engine.',
    modes: [
      {
        id: 'canvas',
        name: 'Infinite Canvas',
        title: 'Infinite Spatial Whiteboard (JSON Canvas 1.0)',
        desc: 'Non-linear spatial cognition with text cards, embedded documents, Bezier connectors, radar minimap, and one-click reverse topological long-form synthesis.',
        bullets: [
          'JSON Canvas 1.0 open standard: zero vendor lock-in across global ecosystem',
          'Topological sort algorithm: synthesize scattered notes into structured monographs',
          'Minimap radar: instant panoramic jump across massive canvas views'
        ]
      },
      {
        id: 'split',
        name: 'Split View',
        title: 'Bilateral Split Workspace (Split Mode)',
        desc: 'Source code on the left, real-time rich text on the right. Self-developed AST block-mapping syncs scrolling flawlessly across massive documents.',
        bullets: [
          'AST block mapping: resolves misaligned scrolling in long Markdown files',
          'Real-time dual sync: millisecond-accurate alignment between source & preview'
        ]
      },
      {
        id: 'mindmap',
        name: 'Mind Map',
        title: 'Interactive Mind Map (Mindmap View)',
        desc: 'Press Ctrl+M to convert outlines into dynamic mind maps with full keyboard navigation and OPML/FreeMind export.',
        bullets: [
          'Ctrl+M one-second leap: seamless two-way conversion between outline and map',
          'OPML 2.0 / FreeMind export: flawless transfer to professional diagram tools'
        ]
      },
      {
        id: 'read',
        name: 'Clean Read',
        title: 'Immersive Reader (Read Mode)',
        desc: '960px golden reading width, distraction-free reading, typewriter scroll lock, and 3x Retina PNG export.',
        bullets: [
          '960px golden reading width: optimized typography for prolonged deep reading',
          'Typewriter vertical centering: input focus remains comfortable at eye level'
        ]
      },
      {
        id: 'source',
        name: 'Pure Source',
        title: 'Geek Code Editor (Source Mode)',
        desc: 'Powered by modern CodeMirror 6 with code folding, YAML Front Matter metadata management, and geek gutter slots.',
        bullets: [
          'CodeMirror 6 modern foundation: robust code folding & syntax highlighting',
          'YAML Front Matter manager: complete presentation of document metadata and tags'
        ]
      }
    ]
  },
  interactive: {
    badge: 'Interactive Playground',
    title: 'Interactive Lab: Try Before Download',
    desc: 'Interact with the sandboxes below to experience the unique core mechanisms of KnowSpace v2.0.0 directly in your browser.',
    tabCanvas: '① JSON Canvas Drag & Synthesis',
    tabDiff: '② Myers LCS Diff Comparison',
    tabSearch: '③ Structured Search Playground',
    canvasTitle: 'Drag Cards to Experience Connectors & Synthesis',
    canvasDesc: 'Drag the cards below; Bezier curves follow dynamically. Click "📝 Export to Markdown" to view reverse synthesis output.',
    canvasExportBtn: '📝 Export to Markdown',
    canvasNodeATitle: 'Card A · Core Definition',
    canvasNodeAName: 'Distributed Knowledge Topology',
    canvasNodeADrag: '(Click and drag freely)',
    canvasNodeBTitle: 'Card B · Target Storage',
    canvasNodeBName: 'Physical Atomic Persistence',
    canvasNodeBDrag: '(Click and drag freely)',
    canvasExtractedSuccess: '✨ Topological Reverse Synthesis Result (Canvas to Markdown):',
    canvasClosePreview: 'Close Preview',
    diffTitle: 'Myers LCS Side-by-Side Diff Slider',
    diffDesc: 'Drag the slider to compare past snapshots against the current version with real-time change calculation.',
    diffAdd: '+18 Added',
    diffDel: '-5 Deleted',
    diffSnapshotTime: 'Snapshot: 2026-09-09 21:30 (History)',
    diffCurrentVersion: 'Current Active Editor Version (Latest)',
    diffRestoreBadge: 'Time Travel Ready',
    diffLinesLeft: [
      '01: # System Architecture Draft',
      '02: Using standard in-memory caching',
      '03: - Direct write without Fsync transaction',
      '04: - Lacks historical snapshot recovery',
      '05: Relies on manual external backup'
    ],
    diffLinesRight: [
      '01: # System Architecture Draft',
      '02: Using standard in-memory caching',
      '03: + Introduce Temp + Fsync physical atomic write',
      '04: + Built-in Myers LCS line-level diff engine',
      '05: + Instant one-click safe time travel restoration'
    ],
    searchTitle: 'Vault Hybrid Search Engine & Structured Syntax',
    searchDesc: 'Click syntax chips below to experience millisecond token matching and cross-document navigation.',
    searchPlaceholder: 'Try typing tag:# link:[[ or keywords...',
    searchSpeed: '⚡ 8ms',
    searchChipsLabel: 'Quick Syntax Chips:',
    searchNavBtn: 'Locate Note ➔'
  },
  engineering: {
    badge: 'Hardcore Engineering & Security',
    title: 'Data Safety Above All: Built for Rigorous Researchers',
    desc: 'From foundational filesystem calls to high-level UI, every choice prioritizes anti-loss, anti-corruption, and anti-lock-in.',
    pillars: [
      {
        title: 'Temp + Fsync Physical Atomic Persistence',
        desc: 'Never overwrites files in place. Writes to a hidden temp file, calls OS-level fsync to guarantee disk platter flushing, then executes atomic rename.'
      },
      {
        title: 'Concurrent Modification 3-Way Negotiation',
        desc: 'Continuously verifies disk physical fingerprint { size, mtimeMs }. Prompts safe reload, force overwrite, or save-as if external tools (Git / cloud drive) modify files.'
      },
      {
        title: 'Zero Cloud Telemetry & Complete Sovereignty',
        desc: '100% Local-first execution. No tracking scripts, no cloud uploads, 100% functional offline. Your knowledge assets stay strictly on your device.'
      },
      {
        title: 'Open Standards Ecosystem, No Vendor Lock-In',
        desc: 'Natively embraces JSON Canvas 1.0, OPML 2.0, FreeMind, GitHub Flavored Markdown, and KaTeX. Data flows freely and migrates anytime.'
      }
    ]
  },
  comparison: {
    badge: 'Objective Matrix',
    title: 'Why Choose KnowSpace?',
    desc: 'No need to compromise between cloud lock-in and endless plugin tinkering.',
    thDimension: 'Key Consideration',
    thKnowSpace: 'KnowSpace (v2.0.0)',
    badgeOotb: 'Out-of-the-Box',
    rows: [
      {
        feature: 'Data Sovereignty & Privacy',
        knowspace: '100% Local-First · Physical Fsync Atomic Write · Zero Cloud Leaks',
        obsidian: 'Local-first, but official multi-device sync is proprietary & subscription-based',
        notion: 'Fully cloud-hosted, unavailable offline, data privacy compliance risks',
        typora: 'Single file only, lacks transactional atomic write protection',
        highlight: true
      },
      {
        feature: 'Setup Cost & Plugin Fatigue',
        knowspace: 'Out-of-the-Box · Integrated Canvas / MindMap / Snapshots / Capsule',
        obsidian: 'Requires configuring 50+ third-party community plugins and CSS snippets',
        notion: 'Requires complex database schemas and template setup',
        typora: 'Single file viewer, lacks engineering-grade knowledge management',
        highlight: true
      },
      {
        feature: 'Spatial Cognitive Views',
        knowspace: '5D Seamless Leap: Read ➔ Split ➔ Source ➔ MindMap ➔ Whiteboard',
        obsidian: 'Relies on third-party Canvas plugin with weak outline conversion',
        notion: 'Linear 1D block documents only',
        typora: 'WYSIWYG single view only',
        highlight: true
      },
      {
        feature: 'Reverse Whiteboard Synthesis',
        knowspace: 'Native Innovation · Converts 2D Canvas into structured Markdown via topological sort',
        obsidian: 'No such feature; requires manual card copying and stitching',
        notion: 'No whiteboard or topological synthesis capabilities',
        typora: 'Whiteboard not supported',
        highlight: true
      },
      {
        feature: 'Local Version Time Travel',
        knowspace: 'Integrated Myers LCS algorithm · Side-by-side diff · One-click safe restore',
        obsidian: 'Requires third-party Git plugin or paid sync version history',
        notion: 'Cloud version history requires enterprise plan for long retention',
        typora: 'No version history diff features'
      },
      {
        feature: 'Open Standards & Ecosystem',
        knowspace: 'JSON Canvas 1.0 + OPML 2.0 + FreeMind + GFM + KaTeX',
        obsidian: 'Markdown + proprietary plugin syntax',
        notion: 'Proprietary database lock-in, exports frequently lose formatting',
        typora: 'Standard Markdown'
      },
      {
        feature: 'Immersive 24/7 Themes',
        knowspace: 'Warm Amber Light / E-ink Paper / Geek Dark',
        obsidian: 'Relies on community CSS themes',
        notion: 'Basic dark and light switch only',
        typora: 'Relies on local CSS theme files'
      }
    ]
  },
  download: {
    badge: 'Download Center',
    title: 'Begin Your Spatial Cognitive Journey Today',
    desc: 'Completely free and open-source under the MIT License. Choose your installer:',
    msiBadge: 'Recommended for Daily Use',
    msiTitle: 'Windows MSI Automated Installer',
    msiDesc: 'One-click silent installer that automatically registers system file associations for .md and .canvas files.',
    msiPoints: [
      'Native system file extension association (.md & .canvas)',
      'Standard Windows Control Panel clean uninstall support',
      'Supports enterprise silent deployment flags'
    ],
    msiBtn: 'Download MSI Installer (~98 MB)',
    msiNote: 'Compatible with Windows 10 / 11 (64-bit)',
    zipBadge: 'No Install · Portable',
    zipTitle: 'Windows Portable ZIP Package (.zip)',
    zipDesc: 'No administrator rights required. Place on a USB drive or external SSD; configs stay within the local directory.',
    zipPoints: [
      'Extract and launch directly with zero registry pollution',
      'Instant access on corporate machines without admin rights',
      'Ideal portable toolkit for mobile USB workflows'
    ],
    zipBtn: 'Download Portable ZIP (.zip)',
    zipNote: 'Extract and run KnowSpace.exe directly',
    shaTitle: 'SHA-256 Integrity Hash Verification',
    shaDesc: 'Verify file hash before installation using PowerShell Get-FileHash',
    githubAll: 'View Full GitHub Releases History'
  },
  faq: {
    badge: 'FAQ',
    title: 'Frequently Asked Questions',
    desc: 'Quick answers about data security, compatibility, and technical architecture.',
    items: [
      {
        question: 'Is KnowSpace free? What is its open-source license?',
        answer: 'Yes, KnowSpace is 100% free and open-source under the permissive MIT License. You can use it freely for personal, team, or commercial projects without paywalls or feature locks.',
        category: 'Product & License'
      },
      {
        question: 'Where is my note data stored? Is there any cloud sync or leakage risk?',
        answer: 'KnowSpace strictly adheres to the 100% Local-First principle. All notes, mind maps, canvases, and snapshots are stored as standard plain-text files (.md, .canvas) in your designated local directory. The software contains zero telemetry or cloud upload code and functions 100% offline.',
        category: 'Data Security'
      },
      {
        question: 'Can I sync my KnowSpace vault with OneDrive, Dropbox, or Git?',
        answer: 'Absolutely! Since KnowSpace uses standard directory structures on your disk, you can place your vault in OneDrive, Dropbox, iCloud, or a Git repository. Built-in conflict negotiation detects external changes and prompts for reload, overwrite, or save-as.',
        category: 'Multi-Device Sync'
      },
      {
        question: 'Is the KnowSpace canvas format proprietary? Can other tools open it?',
        answer: 'Not at all! KnowSpace strictly follows the open JSON Canvas 1.0 standard (jsoncanvas.org). Canvases created in KnowSpace can be opened losslessly in Obsidian and other compatible tools, and vice versa.',
        category: 'Ecosystem Compatibility'
      },
      {
        question: 'What is the "Reverse Whiteboard Synthesis" feature?',
        answer: 'When brainstorming or designing architectures, we often begin with scattered nodes and arrows on a canvas. Clicking "📝 Export to Markdown" applies topological sorting over the directed acyclic graph, automatically generating a logically sequenced Markdown document.',
        category: 'Key Feature'
      },
      {
        question: 'What is the difference between the Portable ZIP and MSI Installer?',
        answer: 'The MSI package is ideal for standard desktop use and registers file associations. The Portable ZIP requires no installation or admin rights, keeps settings in its own folder, and can run directly from USB drives.',
        category: 'Installation'
      }
    ]
  },
  docs: {
    backBtn: 'Back to Home',
    badge: 'Illustrated Manual · 32-Module Panoramic Gallery',
    searchPlaceholder: 'Search 32 modules...',
    shortcutLabel: 'Shortcut:',
    keyPointsHeader: '💡 Key Design & Operational Highlights:',
    zoomIn: 'Zoom In',
    moduleLabel: 'Module'
  },
  footer: {
    brandDesc: 'Let thoughts grow freely in unbounded space. Next-generation local-first personal knowledge workspace.',
    builtBy: 'Designed & Built by Moyu Lab',
    colFeatures: 'Features',
    linkCanvas: 'Infinite Whiteboard',
    linkHistory: 'Version Time Travel',
    linkSearch: 'Vault Hybrid Search',
    link5D: '5D Spatial Workspace',
    linkInteractive: 'Interactive Playground',
    colDocs: 'Docs & Manuals',
    linkManual: '32-Module Illustrated Manual ➔',
    linkComparison: 'Comparison Matrix',
    linkMsiGuide: 'Windows MSI Guide',
    linkZipGuide: 'Portable ZIP Guide',
    colCommunity: 'Open Source',
    linkGithub: 'GitHub Repository',
    license: 'License: MIT License © 2026',
    openStandard: 'Open Standard: JSON Canvas 1.0',
    copyright: 'Copyright © 2026 Moyu Lab. All rights reserved.',
    motto: 'Write. Read. Connect. Know.'
  },
  palette: {
    title: 'Command Palette',
    placeholder: 'Type a command or keyword... (Esc to close)',
    catTheme: 'Theme System',
    catNav: 'Navigation & Manual',
    catDownload: 'Download & Installation',
    themeLight: '☀️ Switch to Warm Light Theme (Amber)',
    themeEink: '📖 Switch to E-ink Paper Theme',
    themeDark: '✨ Switch to Geek Dark Theme',
    navDocs: '📚 Open 32-Module Illustrated Manual',
    navHome: '🏠 Return to Promotional Landing Home',
    navInteractive: '🕹️ Experience Online Lab (Canvas & Diff)',
    downloadMsi: '📦 Download Windows MSI Installer (v2.0.0)',
    downloadZip: '💼 Download Windows Portable ZIP (.zip)',
    hintEsc: 'Press ESC to exit command palette'
  }
};

export const translations: Record<Language, TranslationDictionary> = {
  zh: zhTranslations,
  en: enTranslations
};
