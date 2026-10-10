import { Sparkles } from "lucide-react";

/*
 * 版本更新日志——只保留最新版本一节。
 *
 * 2026-10-10 产品决定：历史版本组（v2.7.4 及以前）从「关于」移除，
 * 读者看到的永远是当前这一版做了什么。（dialogs-conflict-about 测试
 * 钉住"恰好一节、且以当前版本号开头"，发布时替换本节内容即可。）
 */
export function AboutChangelogRecent() {
  return (
    <div className="about-changelog-group">
      <div className="about-changelog-group-label">
        <Sparkles size={12} className="text-cyan" />
        <span>v2.7.6 闪念双向同步 · 资源管理器右键新建 · 图表首屏提速 3.4 倍</span>
      </div>
      <ul className="about-changelog-items">
        <li>
          🔗 <strong>闪念双向同步</strong>：正文与闪念时间线两处状态实时一致 —— 阅读视图里
          <strong>点击待办复选框直接回写落盘</strong>（不再只是切 DOM 状态、刷新即复原）；
          编辑器里勾选 / 取消 / 编辑 / 删除行，保存（或自动保存）后时间线卡片即时刷新；
          反向时间线勾选，打开的正文预览同步重读。两处安全策略对称：文档有未保存改动时，
          正文侧不抢跑保存、对端刷新也让路，任何一侧的进行中编辑都不会被另一方顺带提交；
          时间线勾选与闪念引用 `[[...]]` 里别的文档的任务行互不误伤。
        </li>
        <li>
          🖱️ <strong>资源管理器右键「新建」菜单</strong>：直接新建 KnowSpace Markdown
          文档、空间白板（<code>.canvas</code>）与思维导图（<code>.mindmap</code>， Markdown
          大纲，双击进导图视图）；在「关于 → 系统运行与系统集成偏好」中逐项开关。 写用户级注册表
          <strong>无需管理员权限</strong>，<strong>不改变 .md 既有的默认打开方式</strong>
          ，取消勾选即从系统还原。
        </li>
        <li>
          🗂️ <strong>闪念时间线交互</strong>
          ：双击卡片在阅览页打开详情、时间线保持原位，浏览节奏不被打断；
          「常驻模板」页处于前台时，点击窗口外部<strong>不再消失</strong>，切回速记页即恢复。
        </li>
        <li>
          📈 <strong>Mermaid 图表首屏提速 3.4 倍</strong>：剖析定位到首图 ~420ms
          的大头是引擎一次性初始化——空闲窗口预先完成它，实测降至 121ms （秒开不更慢）；
          <strong>复盘面板偶发失败根治</strong>
          ：分块解析加入测试接缝，首屏在任何负载下确定就绪。
        </li>
        <li>
          📦 <strong>既有文件格式一律不变</strong>：<code>.md</code>、<code>.canvas</code>、
          <code>.mindmap.md</code>、伴生文件与 <code>.xmind</code> 与 v2.7.4
          完全一致，升级不需要迁移；<code>.mindmap</code> 是新增的可选扩展名，不影响任何既有文件。
        </li>
      </ul>
    </div>
  );
}
