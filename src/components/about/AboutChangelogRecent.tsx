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
        <span>v2.7.7 界面可读性收口 · 性能基线加了防污染闸门</span>
      </div>
      <ul className="about-changelog-items">
        <li>
          🎨 <strong>命令面板墨屏主题白字压白底修复</strong>
          ：墨屏（eink）主题下搜索框输入与全部条目标题此前
          <strong>完全看不见</strong>（1.00:1），现在恢复清晰可读；关系图旧弹窗遗留的{" "}
          <strong>431 行死样式</strong>一并清理。
        </li>
        <li>
          ✨ <strong>图标着色真正生效</strong>：23
          处橙/青图标此前因类名空转而一直显示成默认灰色——现在按主题取色， 浅色 /
          墨屏下自动使用压暗的同色相，实测三主题最差 ≥3.5:1（不会"颜色对了但看不清"）。
        </li>
        <li>
          🔘 <strong>闪念胶囊控件描边全部可见</strong>
          ：按钮与标签的淡描边在三个主题下都低于无障碍标准 （最差 1.19:1），换成实色后最差面
          3.61:1——浅色主题下"几乎看不见边框"的时代结束了。
        </li>
        <li>
          🛡️ <strong>性能基线有了防污染闸门</strong>：机器繁忙时的测量结果不再能被无声写进基线
          （采样散度 +
          对比已提交基线双判据，脏窗口直接拒绝写盘），回归对比从"靠肉眼看数字"变成有守卫兜底。
        </li>
        <li>
          📦 <strong>既有文件格式一律不变</strong>
          ：本版为质量修复版，无任何功能与格式变更，升级零迁移； 测试{" "}
          <strong>144 套件 / 1,665 项</strong>零回归。
        </li>
      </ul>
    </div>
  );
}
