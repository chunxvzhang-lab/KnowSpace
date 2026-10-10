const { app, ipcMain } = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const { NEW_FILE_DEFAULTS } = require("./shared.cjs");
const {
  SHELL_NEW_ROOT,
  SHELL_NEW_FILE_TYPES,
  buildEnablePlan,
  buildDisablePlan,
  buildStatusPlan,
  buildRestoreDefaultPlan,
} = require("./shell-new-plan.cjs");

/**
 * Explorer "New" context-menu entries (资源管理器右键 → 新建).
 *
 * 行为契约在 shell-new-plan.cjs（纯函数，测试直接断言）；这里只做三件事：
 * 把模板文件写到 userData（注册表的 FileName 指向它 —— 必须是 asar 外的
 * 真实路径，shell 读不了 asar），用 reg.exe 执行计划，读回真实状态。
 *
 * 状态不另设存储：注册表本身就是唯一事实来源，status 永远现查现答。
 */

const execFileAsync = promisify(execFile);
const REG_EXE = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "reg.exe");

function runReg(args) {
  return execFileAsync(REG_EXE, args, { windowsHide: true });
}

async function regSucceeded(args) {
  try {
    await runReg(args);
    return true;
  } catch {
    return false;
  }
}

function templatesDir() {
  return path.join(app.getPath("userData"), "shell-new-templates");
}

async function writeTemplate(kind) {
  const spec = SHELL_NEW_FILE_TYPES[kind];
  const dir = templatesDir();
  await fs.mkdir(dir, { recursive: true });
  const templatePath = path.join(dir, spec.templateName);
  const content =
    kind === "canvas"
      ? NEW_FILE_DEFAULTS.canvas
      : kind === "mindmap"
        ? NEW_FILE_DEFAULTS.mindmap
        : NEW_FILE_DEFAULTS.document;
  await fs.writeFile(templatePath, content, "utf8");
  return templatePath;
}

/**
 * reg query 输出里取值数据。值名（"(Default)" / 中文系统的「(默认)」）跟随
 * 系统代码页，node 的 utf8 解码下是乱码 —— 但 "REG_SZ" 字面量是 ASCII，
 * 任何代码页下都完好，以它为锚。`[^\S\r\n]*` 把锚与值锁在同一行：空值时
 * 不会越行吞掉下一行的内容。
 */
function parseDefaultValue(stdout) {
  const m = stdout.match(/REG_SZ[^\S\r\n]*(\S*)/);
  return m ? m[1] : "";
}

async function queryValue(args) {
  try {
    const { stdout } = await runReg(args);
    return parseDefaultValue(stdout);
  } catch {
    return null;
  }
}

/** enable 前的 `.md` 默认 ProgID；空串 = 原本没有默认值。 */
async function queryMarkdownDefaultProgId() {
  return (await queryValue(["query", `${SHELL_NEW_ROOT}\\.md`, "/ve"])) ?? "";
}

/** 我们 ProgId 键下记的原默认值；null = 没有记录（旧版启用的残留），不猜。 */
async function queryMarkdownPrevDefault() {
  return queryValue([
    "query",
    `${SHELL_NEW_ROOT}\\${SHELL_NEW_FILE_TYPES.markdown.progId}`,
    "/v",
    "PrevDefault",
  ]);
}

async function getShellNewStatus() {
  if (process.platform !== "win32") {
    return { supported: false, markdown: false, canvas: false, mindmap: false };
  }
  const [markdown, canvas, mindmap] = await Promise.all([
    regSucceeded(buildStatusPlan("markdown")),
    regSucceeded(buildStatusPlan("canvas")),
    regSucceeded(buildStatusPlan("mindmap")),
  ]);
  return { supported: true, markdown, canvas, mindmap };
}

async function setShellNewEntry(request) {
  if (!request || typeof request !== "object") {
    return { success: false, message: "设置参数无效" };
  }
  const { kind, enabled } = request;
  if (!Object.prototype.hasOwnProperty.call(SHELL_NEW_FILE_TYPES, kind)) {
    return { success: false, message: "未知的右键新建文件类型" };
  }
  if (typeof enabled !== "boolean") {
    return { success: false, message: "设置参数无效" };
  }
  if (process.platform !== "win32") {
    return {
      success: false,
      message: "右键新建菜单仅 Windows 桌面版支持。",
      status: await getShellNewStatus(),
    };
  }

  try {
    if (enabled) {
      // enable 序列的每一步都必须成功：ShellNew 是判定标志但 ProgId 是
      // 功能本体，留下半套注册只会表现为"菜单有了双击没反应"这种悬案。
      const templatePath = await writeTemplate(kind);
      const prevDefault = kind === "markdown" ? await queryMarkdownDefaultProgId() : null;
      const plan = buildEnablePlan(kind, {
        exePath: process.execPath,
        templatePath,
        prevDefault,
      });
      for (const args of plan) {
        await runReg(args);
      }
    } else {
      // 恢复 `.md` 的默认类型名要先于删除 ProgId 树 —— 记录就存在那棵树里。
      if (kind === "markdown") {
        const prev = await queryMarkdownPrevDefault();
        if (prev !== null) {
          await runReg(buildRestoreDefaultPlan(prev)).catch(() => {});
        }
      }
      for (const args of buildDisablePlan(kind)) {
        await runReg(args).catch(() => {});
      }
    }
  } catch (err) {
    return { success: false, message: err.message, status: await getShellNewStatus() };
  }

  return { success: true, status: await getShellNewStatus() };
}

function registerShellNewHandlers() {
  ipcMain.handle("bookmd:shell-new-get-status", () => getShellNewStatus());
  ipcMain.handle("bookmd:shell-new-set-entry", (_event, request) => setShellNewEntry(request));
}

module.exports = { registerShellNewHandlers, parseDefaultValue };
