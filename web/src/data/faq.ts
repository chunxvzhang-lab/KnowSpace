export interface FaqItem {
  question: string;
  answer: string;
  category: string;
}

export const FAQS: FaqItem[] = [
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
];
