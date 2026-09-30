import { Sparkles } from "lucide-react";

/*
 * The active-era changelog groups (v2.7.0 and up), moved verbatim out of
 * AboutDialog when the quality ratchet showed that every new version group
 * was pushing the dialog toward the file-size ceiling. Frozen history stays
 * in AboutDialog itself; a new release group is appended HERE, in the
 * version it belongs to — the point being that the file that grows with
 * every release is a small dedicated one.
 */
export function AboutChangelogRecent() {
  return (
    <>
      {/* v2.7.5 */}
      <div className="about-changelog-group">
        <div className="about-changelog-group-label">
          <Sparkles size={12} className="text-cyan" />
          <span>v2.7.5 图表首屏提速 3.4 倍 · 复盘面板稳定性根治</span>
        </div>
        <ul className="about-changelog-items">
          <li>
            📈 <strong>Mermaid 图表首屏提速 3.4 倍</strong>：剖析定位到首图 ~420ms
            的大头是引擎一次性初始化——空闲窗口预先完成它，实测降至 121ms （秒开不更慢）；
            <strong>复盘面板偶发失败根治</strong>
            ：分块解析加入测试接缝，首屏在任何负载下确定就绪。
          </li>
          <li>
            📦 <strong>没有改变任何既有文件格式</strong>：与 v2.7.4 完全一致，升级不需要迁移。
          </li>
        </ul>
      </div>

      {/* v2.7.4 */}
      <div className="about-changelog-group">
        <div className="about-changelog-group-label">
          <Sparkles size={12} className="text-cyan" />
          <span>v2.7.4 自动保存 · 列表续行 · 上下标快捷键</span>
        </div>
        <ul className="about-changelog-items">
          <li>
            💾 <strong>新增自动保存</strong>（系统偏好中可关，默认开）：最后一次击键 约{" "}
            <strong>1.5 秒</strong>后自动写盘，持续键入时不写盘、聚合为一次。 此前保存的唯一触发是
            Ctrl+S 与关闭确认框——崩溃或断电会丢掉 上次手动保存以来的全部输入。自动保存走的就是
            Ctrl+S 那条路径： 检测到文件被其他程序修改会停下询问而非覆盖；冲突弹窗出现时自动保存
            完全挂起；写盘失败不会重试风暴。
          </li>
          <li>
            📝 <strong>列表续行</strong>：列表行尾按 Enter 自动续行——有序列表
            自动递增编号、任务清单续行为未勾选项、嵌套缩进保留，
            <strong>空项回车即退出列表</strong>（不再堆积空标记）。
          </li>
          <li>
            ⌨️ <strong>上/下标快捷键</strong>：<code>Ctrl+Shift+=</code> 上标、
            <code>Ctrl+=</code> 下标（开关式）。
          </li>
          <li>
            🛡 <code>==高亮==</code>、上标、下标、脚注在<strong>白板卡片</strong>与
            列表项脚注定义（网页粘贴形态）中的渲染由行为测试固化。
          </li>
          <li>
            📦 <strong>没有改变任何既有文件格式</strong>：与 v2.7.3 完全一致，升级不需要迁移。
          </li>
        </ul>
      </div>

      {/* v2.7.3 */}
      <div className="about-changelog-group">
        <div className="about-changelog-group-label">
          <Sparkles size={12} className="text-cyan" />
          <span>v2.7.3 上下标与行内高亮渲染 · 右键工具栏扩展</span>
        </div>
        <ul className="about-changelog-items">
          <li>
            ✏️ <strong>右键格式工具栏新增上标 / 下标</strong>（x² / x₂ 图标， 开关式再点即取消）：
            <code>^文本^</code> 渲染为上标（E = mc^2^ → mc²）、
            <code>~文本~</code> 渲染为下标（H~2~O → H₂O），Pandoc / Obsidian 同款记号。
          </li>
          <li>
            🖍{" "}
            <strong>
              补齐 <code>==高亮==</code> 渲染
            </strong>
            ：格式工具栏的 「文本高亮」按钮自始就插入这个记号，但管线一直没有渲染规则——
            预览里是字面文本（与脚注当时同样的情况）。现在真正高亮显示。
          </li>
          <li>
            🛡 <strong>冲突防护由负向测试钉住</strong>：<code>~~删除线~~</code> 不受影响、未解析脚注{" "}
            <code>[^1^]</code> 保持原样、段落尾部块锚 <code>^block-id</code>{" "}
            照常工作、带空格或未闭合输入保持字面。
          </li>
          <li>
            📦 <strong>没有改变任何既有文件格式</strong>：与 v2.7.2 完全一致，升级不需要迁移。
          </li>
        </ul>
      </div>

      {/* v2.7.2 */}
      <div className="about-changelog-group">
        <div className="about-changelog-group-label">
          <Sparkles size={12} className="text-cyan" />
          <span>v2.7.2 右键列表修复 · 脚注渲染 · 分屏滚动更顺滑</span>
        </div>
        <ul className="about-changelog-items">
          <li>
            🐛 <strong>修复右键「转为列表/标题/引用」写入垃圾文本</strong>
            （自该功能上线起即坏）：转换后文档里出现的是字面 <code>$1-</code> 而不是
            真正的列表标记，预览渲染不出列表。现在生成真标记并保留行首缩进， 「转为有序列表」按 1.
            2. 3. 自动续号，选区里的空行不再变成断开列表的 悬空项；并新增
            <strong>「转为普通文本」</strong>一键取消这些格式。
          </li>
          <li>
            📌 <strong>脚注渲染</strong>：<code>[^1]</code> 与 Obsidian 形式的
            <code>[^1^]</code> 现在渲染为编号上标角标，定义收集到文末脚注列表 （首次引用顺序编号、带
            ↩ 回链）；长文档里角标与列表不在同一屏也能点击互跳。
            没有定义的引用按原样显示，不伪装成有效链接。
          </li>
          <li>
            ⚡ <strong>分屏滚动更顺滑</strong>：消除滚动路径上的强制布局 （几何缓存 + 事件期快照 +
            高度表键复用 + 状态栏重渲染跳过）， 10 万字文档实测滚动尾部帧时间{" "}
            <strong>30.9ms → 18.4ms</strong>、 掉帧 <strong>13 → 2</strong>（同机对照）。
          </li>
          <li>
            🧹 <strong>长会话内存护栏</strong>：滚动位置高度表加上限并按新旧逐出，
            长时间使用不再无限增长。
          </li>
          <li>
            📦 <strong>没有改变任何既有文件格式</strong>：与 v2.7.1 完全一致，升级不需要迁移。
          </li>
        </ul>
      </div>

      {/* v2.7.1 */}
      <div className="about-changelog-group">
        <div className="about-changelog-group-label">
          <Sparkles size={12} className="text-cyan" />
          <span>v2.7.1 下拉菜单修复 · 长文档不再卡顿 · 标签切换约 10 倍</span>
        </div>
        <ul className="about-changelog-items">
          <li>
            🎨 <strong>修复思维导图下拉菜单在浅色主题下不可读</strong>
            （主题/布局选择器）：v2.7.0 把选择器换成了原生控件，但弹出列表由操作系统绘制、
            不随应用主题重绘，实测菜单项对比只剩 1.22:1。现在改为跟随应用主题的手写弹层，
            配色由守卫逐主题验算对比度。
          </li>
          <li>
            ⚡ <strong>长文档打字不再卡顿</strong>：一次击键只重新处理被改动的那一个内容块
            （此前每次停顿都整篇重来），10 万字文档实测打字后最长主线程任务
            <strong>169ms → 0</strong>；文章 DOM 节点 <strong>6,842 → 191</strong>
            （只渲染视口附近的内容，窗外以保留行号锚点的占位段聚合，滚动同步的行号映射原样成立）。
          </li>
          <li>
            ⚡ <strong>标签切换约 10 倍</strong>：切换最长主线程任务 572ms → 58ms——
            打开一篇长文档只物化视口附近的内容。
          </li>
          <li>
            🧪 <strong>测试规模</strong>：<strong>113 个测试套件、1,495 项</strong>
            单元与集成测试（1,493 通过、2 项基准默认跳过）；每个性能改动都配了可重复的
            浏览器基准（docs/PERF_BASELINE.md，脚本生成）。
          </li>
          <li>
            📦 <strong>没有改变任何既有文件格式</strong>：与 v2.7.0 完全一致，升级不需要迁移。
          </li>
        </ul>
      </div>

      {/* v2.7.0 */}
      <div className="about-changelog-group">
        <div className="about-changelog-group-label">
          <Sparkles size={12} className="text-cyan" />
          <span>v2.7.0 架构减负与质量地基：这一版没有新功能，但之后每一版都会更快</span>
        </div>
        <ul className="about-changelog-items">
          <li>
            🏗️ <strong>巨石组件解体</strong>：<code>App</code>（2,349 行）、
            <code>CanvasView</code>（7,179 行）、<code>MindmapView</code>（3,586
            行）与三个大对话框全部拆为职责单一的 hook 与视图组件；全仓库
            <strong>不再有超过一千行的源文件</strong>（此前 15 个），11 个巨型服务收敛到 800
            行内且对外导入面逐字节不变。
          </li>
          <li>
            ⌨️ <strong>命令总线</strong>
            ：命令面板、全局快捷键与系统菜单从此共享同一份命令注册表 ——
            新增一个动作只需注册一处，三个入口同时可用；此前同一动作最多被接线 5
            次，两份逐字复制的切换 updater 与一个双实现的打字机开关就此归一。
          </li>
          <li>
            🧱 <strong>IPC 网关命名空间化</strong>：渲染层 60+ 个扁平方法收敛为 <code>files</code> /{" "}
            <code>history</code> / <code>media</code> / <code>system</code> / <code>capture</code>{" "}
            五个命名空间，附带渲染层与主进程的版本握手；主进程 handler
            按域拆为六个模块，通道契约由守卫测试逐条钉住。
          </li>
          <li>
            🛡️ <strong>质量门禁从约定变成机器</strong>
            ：ESLint（含分层依赖护栏）、Prettier、git hooks、CI 流水线与本地 <code>preflight</code>
            同构六道闸；「测试基线滞后一个版本」这类靠人记得跑的失效不再可能无声发生 ——
            类型逃逸与文件体量受棘轮约束<strong>只减不增</strong>。
          </li>
          <li>
            ✂️ <strong>交互边界修正</strong>：思维导图「换到另一侧」弹层出现后按 <code>Esc</code>{" "}
            现在正确关闭弹层而非清空选择；快捷键处理不再可能被合成事件击穿。
          </li>
          <li>
            📦 <strong>没有改变任何既有文件格式</strong>：<code>.md</code>、<code>.canvas</code>、
            <code>.mindmap.md</code>、伴生文件与 <code>.xmind</code> 与 v2.6.5
            完全一致，升级不需要迁移；用户可见行为与上一版逐一对齐。
          </li>
          <li>
            🧪 <strong>测试规模</strong>：<strong>113 个测试套件、1,414 项</strong>
            单元与集成测试零回归通过；每个重构波次都在全量绿之后才落提交。
          </li>
        </ul>
      </div>
    </>
  );
}
