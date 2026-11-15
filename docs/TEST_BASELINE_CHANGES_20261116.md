# 2026-11-16 测试基线变更依据

本次同步 AI 助理和工作台改版时，将测试基线从 148 个文件、1,715 项更新为 166 个文件、1,890 项。实际全量运行结果为 1,888 项通过、0 项失败、2 项默认跳过。

原基线检查发现以下文件数量变化，均由对应功能退出或实现替换引起：

| 原测试 | 变化依据 | 当前覆盖 |
| --- | --- | --- |
| `sync-scroll.test.ts` 的 8 项 | 工作台编辑使用 CodeMirror 实时预览，`DocumentWorkspace.tsx` 不再挂载原编辑器与阅读器双栏同步滚动，`useSyncScroll.ts` 已删除 | `editor-live-preview.test.tsx` 的 23 项、`live-preview-session.test.ts` 的 4 项覆盖实时预览的文档更新、编辑事务和会话；`reader-pane-virtual.test.tsx` 保留 15 项阅读虚拟化检查 |
| `sync-selection.test.ts` 的 6 项 | 同一替换移除了双栏间选区联动，`useSyncSelection.ts` 已删除；恢复这组测试需要恢复已退出的实现 | 实时预览测试覆盖编辑器与源文档；AI 选区写作另有当前文档版本与选区冲突检查 |
| `reader-pane-virtual.test.tsx` 的 16 → 15 项 | 删除的 1 项专门验证 `useSyncScroll` 对双栏锚点的映射，与阅读虚拟化本身无关 | 其余 15 项保留，持续验证虚拟挂载、源行导航和长文档窗口范围 |
| `theme-eink.test.ts` 的 3 项 | 用户要求去掉电子书主题；原测试要求继续保存和选择该主题，与现有行为冲突 | 改为 `theme-eink.test.tsx` 的 4 项，验证旧设置迁移至浅色且保留字号/行号、保存时规范化、仅提供深浅两个主题按钮，以及移除旧主题命令 |

这些变化不通过关闭基线检查、跳过失败测试或修改统计范围处理。更新后的生成快照继续由 `capture-test-baseline.cjs --check` 执行总数、逐文件数量和零失败检查。原始运行报告保留在本地 `test-baseline.json`，不纳入源码仓库。

欢迎页另新增 `scripts/verify-welcome-ui.cjs`，在真实 Electron 内验证计算样式、深浅主题、窄窗口与短窗口、六个入口、键盘焦点和取消路径。它在修复前的便携版失败，修复后在最终运行目录、本地目录与 ZIP 解压目录通过。
