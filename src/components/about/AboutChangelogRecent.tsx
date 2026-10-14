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
        <span>v2.7.8 知识图谱提速 · 四个实测瓶颈逐个拆掉</span>
      </div>
      <ul className="about-changelog-items">
        <li>
          ⚡ <strong>图谱构建提速 21.6×</strong>（8,000 节点 2,568ms → 119ms）：剖析发现
          <strong>94.8%</strong>{" "}
          的构建耗时卡在节点去重的一处全表扫描上（对每个节点遍历整张别名表）。
          改成保序后缀索引后，用 200 个随机仓库对照原算法逐字节比对，结果完全一致。
        </li>
        <li>
          🕸️ <strong>大图谱布局提速 9.4×</strong>（3,200 节点 10.4 秒 → 1.1
          秒）：力导向斥力原本是平方级、且同步执行，会冻结整个应用；现在改用 Barnes-Hut
          近似，小图仍走原算法（逐位一致）。同一张图每次布局结果也固定了，不再"关掉筛选再打开位置就变"。
        </li>
        <li>
          🚀 <strong>拖拽从卡顿到满帧</strong>（1,200 节点：帧间隔 200ms → 16.7ms，掉帧 69 →
          6）：根因是每次数据变化都<strong>销毁重建整个画布实例</strong>
          （485ms）。现在实例只建一次、数据原地更新， 筛选与切换主题都不再重建。
        </li>
        <li>
          🎨 <strong>浅色主题节点配色此前不达可见门槛</strong>：普通节点 2.56:1、闪念节点
          2.15:1，均低于非文字元素 3:1（肉眼与截图都看不出，只有算比值才发现）。现在 4.76:1 /
          3.19:1，并保留"当前文档 &gt; 普通 &gt; 闪念"的层级。
        </li>
        <li>
          🔍 <strong>搜索与筛选更跟手</strong>：搜索框加 180ms 防抖（原先每敲一键重建一次图）；默认
          1,500 节点上限，超出时表头<strong>明确写出"已省略 N"</strong>
          并可一键显示全部——是降级不是静默截断。
        </li>
        <li>
          📦 <strong>既有文件格式一律不变</strong>
          ：本版为功能优化版，升级零迁移；测试 <strong>143 套件 / 1,691 项</strong>零回归。
        </li>
      </ul>
    </div>
  );
}
