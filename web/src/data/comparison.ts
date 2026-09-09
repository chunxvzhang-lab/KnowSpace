export interface ComparisonItem {
  feature: string;
  knowspace: string;
  obsidian: string;
  notion: string;
  typora: string;
  highlight?: boolean;
}

export const COMPARISON_DATA: ComparisonItem[] = [
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
    notion: '普通浅色 / 暗黑两色',
    typora: '支持 CSS 主题配置'
  },
  {
    feature: '检索与响应性能',
    knowspace: '< 15ms 混合检索引擎 · 原生倒排分词 · 结构化语法支持',
    obsidian: '随着笔记量突破千篇，索引内存消耗增加',
    notion: '网络请求搜索，受限于网络延迟',
    typora: '单文件轻量检索'
  }
];
