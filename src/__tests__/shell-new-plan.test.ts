import { describe, expect, it } from "vitest";

// 与 markdown-files.test.ts 同一模式：electron/*.cjs 无类型声明，require 加载
// 并在本地手写形状 —— 参数类型因此是显式的，非法 kind 也能被 @ts-expect-error 接住。
type ShellNewKind = "markdown" | "canvas" | "mindmap";
type RegCommand = string[];

// @ts-ignore: shell-new-plan.cjs is CommonJS without type declarations
const planModule = require("../../electron/shell-new-plan.cjs") as {
  SHELL_NEW_FILE_TYPES: Record<
    ShellNewKind,
    { ext: string; progId: string; typeName: string; templateName: string }
  >;
  buildEnablePlan: (
    kind: ShellNewKind,
    opts: { exePath: string; templatePath: string; prevDefault?: string | null },
  ) => RegCommand[];
  buildDisablePlan: (kind: ShellNewKind) => RegCommand[];
  buildStatusPlan: (kind: ShellNewKind) => RegCommand[];
  buildRestoreDefaultPlan: (prevDefault: string) => RegCommand;
};
const {
  buildEnablePlan,
  buildDisablePlan,
  buildStatusPlan,
  buildRestoreDefaultPlan,
  SHELL_NEW_FILE_TYPES,
} = planModule;

/**
 * 右键"新建"条目的全部行为就是这几段 reg.exe 命令序列 —— 它们是契约本体，
 * 逐条断言；执行方（shell-new.cjs）只负责跑与读回状态。
 */
const EXE = "C:\\Apps\\KnowSpace.exe";
const MD_TEMPLATE =
  "C:\\Users\\u\\AppData\\Roaming\\knowspace\\shell-new-templates\\新建 Markdown 文档.md";
const CANVAS_TEMPLATE = MD_TEMPLATE.replace("Markdown 文档", "空间白板").replace(".md", ".canvas");

function dataOf(command: string[]) {
  const i = command.indexOf("/d");
  return i === -1 ? undefined : command[i + 1];
}

describe("shell-new-plan（资源管理器右键新建的注册表命令）", () => {
  it("markdown：写 ProgId/图标/打开方式/ShellNew，并覆盖默认类型名（记录原值）", () => {
    const plan = buildEnablePlan("markdown", {
      exePath: EXE,
      templatePath: MD_TEMPLATE,
      prevDefault: "WorkBuddy.md",
    });

    // 打开命令指向本应用，%1 是占位符而不是环境变量展开。
    const openCommand = plan.find((c) => c.join(" ").includes("shell\\open\\command"));
    expect(dataOf(openCommand!)).toBe(`"${EXE}" "%1"`);

    // DefaultIcon 用当前 exe。
    const icon = plan.find((c) => c.join(" ").includes("DefaultIcon"));
    expect(dataOf(icon!)).toBe(`${EXE},0`);

    // ShellNew 用模板文件而非空文件 —— 新建即得到与应用内"新建文档"一致的初始内容。
    const shellNew = plan.find((c) => c.join(" ").includes(".md\\ShellNew"));
    expect(shellNew).toContain("/v");
    expect(dataOf(shellNew!)).toBe(MD_TEMPLATE);

    // 默认类型名指向自己的 ProgID：新建菜单的显示名与图标由它决定，
    // 不覆盖就显示上一个注册者（如 WorkBuddy Document）。双击不受影响
    // —— UserChoice 优先级高于默认值。
    const defaultType = plan.find(
      (c) => c[0] === "add" && c[1] === "HKCU\\Software\\Classes\\.md" && c.includes("/ve"),
    );
    expect(dataOf(defaultType!)).toBe(SHELL_NEW_FILE_TYPES.markdown.progId);

    // 原默认值记录在案，disable 时据此恢复。
    const prevRecord = plan.find((c) => c.includes("PrevDefault"));
    expect(dataOf(prevRecord!)).toBe("WorkBuddy.md");

    // 有一处 OpenWithProgids 追加（打开方式候选）。
    expect(plan.some((c) => c.join(" ").includes(".md\\OpenWithProgids"))).toBe(true);
  });

  it("markdown：原本没有默认值时也照常覆盖（记录空串，恢复时删除默认值）", () => {
    const plan = buildEnablePlan("markdown", {
      exePath: EXE,
      templatePath: MD_TEMPLATE,
      prevDefault: "",
    });
    expect(plan.some((c) => c.includes("PrevDefault"))).toBe(true);
    expect(plan.some((c) => c[1] === "HKCU\\Software\\Classes\\.md" && c.includes("/ve"))).toBe(
      true,
    );
  });

  it("canvas：私有扩展名允许设为默认关联", () => {
    const plan = buildEnablePlan("canvas", { exePath: EXE, templatePath: CANVAS_TEMPLATE });

    const defaultAssoc = plan.find(
      (c) => c[0] === "add" && c[1] === "HKCU\\Software\\Classes\\.canvas" && c.includes("/ve"),
    );
    expect(defaultAssoc).toBeDefined();
    expect(dataOf(defaultAssoc!)).toBe(SHELL_NEW_FILE_TYPES.canvas.progId);

    const shellNew = plan.find((c) => c.join(" ").includes(".canvas\\ShellNew"));
    expect(dataOf(shellNew!)).toBe(CANVAS_TEMPLATE);
  });

  it("mindmap：与 canvas 同路的私有扩展名注册", () => {
    const mmTemplate = CANVAS_TEMPLATE.replace("新建空间白板", "新建思维导图").replace(
      ".canvas",
      ".mindmap",
    );
    const plan = buildEnablePlan("mindmap", { exePath: EXE, templatePath: mmTemplate });

    const defaultAssoc = plan.find(
      (c) => c[0] === "add" && c[1] === "HKCU\\Software\\Classes\\.mindmap" && c.includes("/ve"),
    );
    expect(defaultAssoc).toBeDefined();
    expect(dataOf(defaultAssoc!)).toBe(SHELL_NEW_FILE_TYPES.mindmap.progId);

    const shellNew = plan.find((c) => c.join(" ").includes(".mindmap\\ShellNew"));
    expect(dataOf(shellNew!)).toBe(mmTemplate);

    // disable 整键撤掉
    const disable = buildDisablePlan("mindmap");
    expect(disable.some((c) => c[1] === "HKCU\\Software\\Classes\\.mindmap")).toBe(true);
    expect(disable.some((c) => c[1].includes("KnowSpace.Mindmap"))).toBe(true);
  });

  it("disable：markdown 只撤自己写入的三处，绝不删除 .md 键本身", () => {
    const plan = buildDisablePlan("markdown");

    // 不得有指向 `.md` 根键的 delete —— 那会连别人的关联一起端掉。
    expect(plan.filter((c) => c[1] === "HKCU\\Software\\Classes\\.md")).toEqual([]);

    expect(plan.some((c) => c.join(" ").includes(".md\\ShellNew"))).toBe(true);
    expect(plan.some((c) => c.join(" ").includes("OpenWithProgids"))).toBe(true);
    expect(plan.some((c) => c[1].includes("KnowSpace.Markdown"))).toBe(true);
  });

  it("disable：canvas 撤掉关联与 ShellNew", () => {
    const plan = buildDisablePlan("canvas");
    expect(plan.some((c) => c[1] === "HKCU\\Software\\Classes\\.canvas")).toBe(true);
    expect(plan.some((c) => c[1].includes("KnowSpace.Canvas"))).toBe(true);
  });

  it("status：以 ShellNew\\FileName 的存在为启用标志", () => {
    for (const kind of ["markdown", "canvas", "mindmap"] as const) {
      const query = buildStatusPlan(kind);
      expect(query[0]).toBe("query");
      expect(query.join(" ")).toContain("ShellNew");
      expect(query).toContain("/v");
      expect(query).toContain("FileName");
    }
  });

  it("restore：有记录恢复原默认值，空记录删除默认值", () => {
    const restore = buildRestoreDefaultPlan("WorkBuddy.md");
    expect(restore[0]).toBe("add");
    expect(restore[1]).toBe("HKCU\\Software\\Classes\\.md");
    expect(dataOf(restore)).toBe("WorkBuddy.md");

    const clear = buildRestoreDefaultPlan("");
    expect(clear[0]).toBe("delete");
    expect(clear[1]).toBe("HKCU\\Software\\Classes\\.md");
    expect(clear).toContain("/ve");
  });

  it("未知类型与缺失路径在计划阶段就报错，不进 reg.exe", () => {
    // @ts-expect-error 故意传非法 kind
    expect(() => buildEnablePlan("exe", { exePath: EXE, templatePath: MD_TEMPLATE })).toThrow();
    expect(() => buildEnablePlan("markdown", { exePath: "", templatePath: MD_TEMPLATE })).toThrow();
  });
});
