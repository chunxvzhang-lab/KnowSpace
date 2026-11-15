# KnowSpace v2.7.9

<!-- CHINESE-PORTABLE-20261116 -->
## 2026-11-16 中文便携版更新

**本次新增的 AI 助理、工作台界面和欢迎页修复，请下载下面的 Windows x64 中文便携版。**

- [下载最新中文便携版：KnowSpace-win-x64-portable.zip](https://github.com/chunxvzhang-lab/KnowSpace/releases/download/v2.7.9/KnowSpace-win-x64-portable.zip)
- [SHA256 校验文件：SHA256SUMS-zh-portable-20261116.txt](https://github.com/chunxvzhang-lab/KnowSpace/releases/download/v2.7.9/SHA256SUMS-zh-portable-20261116.txt)

完整解压后运行 `Start-KnowSpace.cmd`，配置保存在同目录的 `Data` 文件夹。升级已有便携版时先退出应用、备份整个原目录，保留自己的 `Data` 和文档。压缩包内没有用户配置、笔记或模型凭证。

### 这次更新

- **AI 助理侧栏**：与文档并排显示；模型接口集中在「关于应用 → 模型接口」，支持 OpenAI 兼容接口与本地 Ollama。
- **对话直接修改文档**：根据指令修改当前原文，对修改片段进行唯一匹配；修订说明不会被当成正文写入。支持查看修改和撤销本次写入。
- **思维导图与白板**：生成可编辑脑图、创建和追加白板文本卡片；对话修改已有分支或卡片时保留其他内容。白板删除卡片会清理关联连线，删除最后一张卡片后重开仍为空白。
- **大纲全文写作**：可根据 Markdown 大纲生成全文，并保留草稿、写入和撤销流程。文档变化、切换、停止、输出截断或格式错误时阻止自动写入。
- **工作台界面**：浅色采用简洁白色设计，移除电子书主题入口；保留闪念胶囊、图谱与脑图入口荧光。优化关于页、模板入口及侧栏布局。
- **欢迎页修复**：补齐缺失的欢迎页样式，解决标题和按钮使用默认外观、六个按钮挤排的问题。支持深浅主题、窄窗口、纵向滚动与可见键盘焦点。
- **离线图文手册**：便携包内附工作台和 AI 对话创作操作手册，更新欢迎页截图。

### 验证与适用范围

本次欢迎页修复已通过 35 项定向测试、TypeScript/Vite 构建、Lint、格式和质量检查。最终程序、本地更新目录及 ZIP 解压目录均通过真实 Electron 桌面回归，覆盖深浅主题、六种窗口组合、欢迎页六个入口和取消路径。ZIP 已通过 CRC 与 84 个文件的 SHA256 核对，并验证实际启动器和重启后的配置保留。

AI 创作与脑图/白板修复在此前交付中通过 1,888 项测试（2 项默认跳过）、固定响应桌面验收及 4 次真实模型请求；欢迎页修复后未重复调用外部模型。模型的输出质量取决于用户配置的服务。

本次更新的是**中文便携版**；现有中文 EXE/MSI 及英文安装包保留此前构建，不包含这次新增功能。旧便携包保留为 `KnowSpace-win-x64-portable-previous.zip`，用于回退。本构建为 Windows x64，未签名。

SHA256（`KnowSpace-win-x64-portable.zip`）：

```text
a1119bb29c9ffe8872f93da6e805ece598453dd6078480be3055cd4096d013e7
```

<!-- /CHINESE-PORTABLE-20261116 -->

---

**文档编辑：右键菜单新增「段落居中」，选中一个或多个段落一键居中。**

v2.7.8 之后的一个小功能版：把"居中对齐"接上文档编辑器的右键菜单。它沿用的是仓库里已有的做法——行尾标记转块属性（和块锚 ` ^block-id` 是同一套思路），不引入任何新语法。**既有文件格式与 v2.7.8 完全一致**（`.md`、`.canvas`、`.mindmap.md`、伴生文件与 `.xmind` 均不变，升级零迁移）。

---

## 📐 文档编辑：右键「段落居中」

- **入口**：编辑器里右键 →「列表与段落排版」子菜单，新增两项——**段落居中** 与 **取消居中**（紧跟「转为引用块」之后）。

- **选中段落一键居中**：选中一个段落或连续多个段落后点「段落居中」，选区内**每一个**非空段落都会在预览里居中显示；只放一个光标（不选中）时，居中光标所在的那一行。空白行自动跳过，不会把断行弄出一个居中空段。

- **开关式取消**：居中是**整段选区统一判定**的——只要选区里已经有居中的段落，点「段落居中」就整体取消（选区内所有居中段落一起复原）；否则才统一加上。想取消也可以用另一个「取消居中」项，效果一致。

- **句中标记不误伤**：居中在源码里以行尾隐藏标记（`⟪center⟫`）表达，这个标记在预览中**永远不显示**。只有真正位于**行尾**的标记才触发居中；一句话中间偶然出现的同名文字会**保持字面、不居中**（有负向测试钉住）。

- **适用范围**：段落、标题、表格直接写 `text-align:center`；列表项、引用块等其它容器通过 `data-align-center` 属性由样式兜底，同样居中。

## 实现与兼容

- 新增 `src/services/markdownAlign.ts`：一个 markdown-it 核心规则扫描每段最后一段文字，命中行尾标记就从可见文本里剥掉，并给段落的 open token 加居中对齐；编辑器侧与渲染侧共用**同一条**"行尾标记"判定规则，两边不会各说各话。
- **分块渲染的逐字节恒等式不受影响**：该规则只修改 token 的属性与文字内容，不增删 token、不改换行，`md.render` 的逐块拼接仍与整篇渲染完全一致（由既有守卫继续钉住）。

## 测试

新增 **10 项**居中守卫（渲染 5 项 + 右键动作 5 项）：多段居中、单行居中、句中标记保持字面、未标记不居中、分块恒等式仍成立、居中/取消/整段判定/空输入空操作。**全套 146 套件 / 1,711 项**单元与集成测试零回归；`tsc` 类型检查、`eslint src --max-warnings 0`、`vite build` 全部通过。

**说明**：本版为功能增强，未改动任何既有文件格式；在 v2.7.8 基础上直接覆盖升级即可，无需迁移动作。

<!-- ENGLISH-WINDOWS-ASSETS -->
## English Windows installers / 英文版 Windows 安装包

English builds of KnowSpace v2.7.9 are now available. Both the application UI (including About and context menus) and the installer use English. User notes remain in their original language.

- [KnowSpace-Setup-2.7.9-en.exe](https://github.com/chunxvzhang-lab/KnowSpace/releases/download/v2.7.9/KnowSpace-Setup-2.7.9-en.exe)
- [KnowSpace-2.7.9-en.msi](https://github.com/chunxvzhang-lab/KnowSpace/releases/download/v2.7.9/KnowSpace-2.7.9-en.msi)
- [SHA256SUMS-en.txt](https://github.com/chunxvzhang-lab/KnowSpace/releases/download/v2.7.9/SHA256SUMS-en.txt)

The existing assets without the `-en` suffix use the Chinese interface. The English installers are unsigned, so Windows SmartScreen may show a warning. Verify downloads with `SHA256SUMS-en.txt`.
