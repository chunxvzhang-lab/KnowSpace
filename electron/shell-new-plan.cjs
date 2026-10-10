/**
 * Explorer "New" context-menu entries, as pure command plans.
 *
 * 写的是用户级注册表（HKCU\Software\Classes）：免管理员权限、卸载即净。
 * 双击行为从不改变 —— `.md` 的 UserChoice 优先级高于默认 ProgID，我们只
 * 把自己加进"打开方式"候选。`.md` 的默认类型名会被覆盖为 KnowSpace（否则
 * 「新建」菜单显示的是上一个注册者的名字与图标），原值记在 PrevDefault，
 * disable 时恢复；`.canvas` 是本应用私有扩展名，直接设为默认。
 *
 * 本文件刻意不依赖 electron：命令序列是这份功能的全部行为契约，必须能被
 * 单元测试直接加载逐条断言（工程指南规则 10：无声失效必须机器化检查）。
 * 执行方在 shell-new.cjs。
 */

const SHELL_NEW_ROOT = "HKCU\\Software\\Classes";

const SHELL_NEW_FILE_TYPES = {
  markdown: {
    ext: ".md",
    progId: "KnowSpace.Markdown",
    typeName: "KnowSpace Markdown 文档",
    templateName: "新建 Markdown 文档.md",
  },
  canvas: {
    ext: ".canvas",
    progId: "KnowSpace.Canvas",
    typeName: "KnowSpace 空间白板",
    templateName: "新建空间白板.canvas",
  },
  mindmap: {
    ext: ".mindmap",
    progId: "KnowSpace.Mindmap",
    typeName: "KnowSpace 思维导图",
    templateName: "新建思维导图.mindmap",
  },
};

/**
 * 一条命令 = execFile("reg", args) 的 args 数组。数据里带引号（open command）
 * 由 execFile 的数组参数语义原样传递，不经 cmd，无需二次转义。
 *
 * `prevDefault`：enable 前查到的 `.md` 默认 ProgID（空串 = 原本没有）。执行层
 * 总是传入，原值随 PrevDefault 记在我们自己的 ProgId 键下，disable 时据此恢复
 * ——覆盖默认类型名只为让「新建」菜单显示 KnowSpace，退出时必须还回去。
 */
function buildEnablePlan(kind, { exePath, templatePath, prevDefault = null }) {
  const spec = SHELL_NEW_FILE_TYPES[kind];
  if (!spec) {
    throw new Error(`未知的右键新建类型: ${kind}`);
  }
  if (!exePath || !templatePath) {
    throw new Error("注册右键新建需要 exePath 与 templatePath。");
  }

  const commands = [];
  // ProgId：「新建」菜单条目名与「打开方式」列表里的友好名；图标与双击打开
  // 都指回本应用，路径取当前进程可执行文件，安装版与便携版同样成立。
  commands.push([
    "add",
    `${SHELL_NEW_ROOT}\\${spec.progId}`,
    "/ve",
    "/t",
    "REG_SZ",
    "/d",
    spec.typeName,
    "/f",
  ]);
  commands.push([
    "add",
    `${SHELL_NEW_ROOT}\\${spec.progId}\\DefaultIcon`,
    "/ve",
    "/t",
    "REG_SZ",
    "/d",
    `${exePath},0`,
    "/f",
  ]);
  commands.push([
    "add",
    `${SHELL_NEW_ROOT}\\${spec.progId}\\shell\\open\\command`,
    "/ve",
    "/t",
    "REG_SZ",
    "/d",
    `"${exePath}" "%1"`,
    "/f",
  ]);

  if (kind === "markdown") {
    // OpenWithProgids 只进「打开方式」候选；双击 .md 用哪个程序由
    // UserChoice 决定（优先级高于这里的默认值），所以这一步从不改变
    // 用户现有的双击行为。
    commands.push([
      "add",
      `${SHELL_NEW_ROOT}\\.md\\OpenWithProgids`,
      "/v",
      spec.progId,
      "/t",
      "REG_SZ",
      "/d",
      "",
      "/f",
    ]);
    // 「新建」菜单的条目名与图标跟随 `.md` 的默认 ProgID —— 不覆盖的话，
    // 菜单里显示的是上一个注册者的名字与图标（如 WorkBuddy Document）。
    // 指到我们自己的 ProgID 只改显示与 ShellNew 供体，双击行为不动。
    if (prevDefault !== null) {
      commands.push([
        "add",
        `${SHELL_NEW_ROOT}\\${spec.progId}`,
        "/v",
        "PrevDefault",
        "/t",
        "REG_SZ",
        "/d",
        prevDefault,
        "/f",
      ]);
    }
    commands.push([
      "add",
      `${SHELL_NEW_ROOT}\\.md`,
      "/ve",
      "/t",
      "REG_SZ",
      "/d",
      spec.progId,
      "/f",
    ]);
  } else {
    // 私有扩展名（.canvas / .mindmap）：设为默认关联，双击直接进 KnowSpace。
    commands.push([
      "add",
      `${SHELL_NEW_ROOT}\\${spec.ext}`,
      "/ve",
      "/t",
      "REG_SZ",
      "/d",
      spec.progId,
      "/f",
    ]);
  }
  // ShellNew 最后一步写：它就是"已启用"的判定标志，中途失败不会留下
  // 一个看起来可用其实没有模板的半成品条目。
  commands.push([
    "add",
    `${SHELL_NEW_ROOT}\\${spec.ext}\\ShellNew`,
    "/v",
    "FileName",
    "/t",
    "REG_SZ",
    "/d",
    templatePath,
    "/f",
  ]);
  return commands;
}

/** reg delete 对不存在的键返回非零 —— 执行方把每一次失败都读作"本来就没有"。 */
function buildDisablePlan(kind) {
  const spec = SHELL_NEW_FILE_TYPES[kind];
  if (!spec) {
    throw new Error(`未知的右键新建类型: ${kind}`);
  }
  if (kind === "markdown") {
    // 只撤我们写入的三处；`.md` 键本身与用户的默认关联动都不动。
    return [
      ["delete", `${SHELL_NEW_ROOT}\\.md\\ShellNew`, "/f"],
      ["delete", `${SHELL_NEW_ROOT}\\.md\\OpenWithProgids`, "/v", spec.progId, "/f"],
      ["delete", `${SHELL_NEW_ROOT}\\${spec.progId}`, "/f"],
    ];
  }
  // 私有扩展名：整键撤掉（恢复到未关联状态）。
  return [
    ["delete", `${SHELL_NEW_ROOT}\\${spec.ext}\\ShellNew`, "/f"],
    ["delete", `${SHELL_NEW_ROOT}\\${spec.ext}`, "/f"],
    ["delete", `${SHELL_NEW_ROOT}\\${spec.progId}`, "/f"],
  ];
}

/** status 就是一条 query：命令存在且返回零 = 该类型已启用。 */
function buildStatusPlan(kind) {
  const spec = SHELL_NEW_FILE_TYPES[kind];
  if (!spec) {
    throw new Error(`未知的右键新建类型: ${kind}`);
  }
  return ["query", `${SHELL_NEW_ROOT}\\${spec.ext}\\ShellNew`, "/v", "FileName"];
}

/**
 * 把 `.md` 的默认 ProgID 还给 enable 之前的注册者。prevDefault 为空串表示
 * 原本没有默认值 —— 此时删除默认值本身，而不是写一个空字符串回去。
 * 执行方在 disable 时先读 PrevDefault 记录再调用这里；没有记录（旧版启用
 * 的残留）则跳过恢复，宁可少改也不猜。
 */
function buildRestoreDefaultPlan(prevDefault) {
  if (typeof prevDefault !== "string") {
    throw new Error("恢复 .md 默认类型需要字符串形式的 prevDefault。");
  }
  if (prevDefault) {
    return ["add", `${SHELL_NEW_ROOT}\\.md`, "/ve", "/t", "REG_SZ", "/d", prevDefault, "/f"];
  }
  return ["delete", `${SHELL_NEW_ROOT}\\.md`, "/ve", "/f"];
}

module.exports = {
  SHELL_NEW_ROOT,
  SHELL_NEW_FILE_TYPES,
  buildEnablePlan,
  buildDisablePlan,
  buildStatusPlan,
  buildRestoreDefaultPlan,
};
