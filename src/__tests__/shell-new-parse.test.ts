import { describe, expect, it } from "vitest";

// @ts-ignore: shell-new.cjs is CommonJS and requires electron (absent under
// vitest the npm stub loads, its named exports are undefined but unused at
// module top level), only the pure parser is exercised here.
const { parseDefaultValue } = require("../../electron/shell-new.cjs");

/**
 * reg query 输出解析的代码页陷阱（真机抓到的回归）：
 *
 * 值名「(Default)」在中文 Windows 上是 GBK 的「(默认)」，node 以 utf8 解码
 * 后成为乱码 —— 任何以值名为锚的解析在非英文系统上必然落空。锚必须是
 * ASCII 字面量 REG_SZ。这里固定两份真实形状的样本：乱码字节按 utf8 读入
 * 后的样子（字符串字面量已持有与运行时相同的码元序列）。
 */
describe("shell-new parseDefaultValue（reg 输出按代码页无关解析）", () => {
  it("英文系统：以 (Default) 命中", () => {
    const out =
      "\r\nHKEY_CURRENT_USER\\Software\\Classes\\.md\r\n    (Default)    REG_SZ    WorkBuddy.md\r\n\r\n";
    expect(parseDefaultValue(out)).toBe("WorkBuddy.md");
  });

  it("中文系统：值名是 GBK 乱码时仍以 REG_SZ 锚定取值", () => {
    // 「(默认)」的 GBK 字节（C4 AC / C8 CF）按 utf8 解码后的真实样子。
    const out =
      "\r\nHKEY_CURRENT_USER\\Software\\Classes\\.md\r\n    (Ĭϼ)    REG_SZ    KnowSpace.Markdown\r\n\r\n";
    expect(parseDefaultValue(out)).toBe("KnowSpace.Markdown");
  });

  it("空默认值：REG_SZ 后无值，返回空串而不是吞下一行", () => {
    const out =
      "\r\nHKEY_CURRENT_USER\\Software\\Classes\\.md\r\n    (Default)    REG_SZ    \r\n\r\n";
    expect(parseDefaultValue(out)).toBe("");
  });

  it("键不存在：无输出，返回空串", () => {
    expect(parseDefaultValue("")).toBe("");
  });

  it("带值名的 /v 查询同样解析（PrevDefault 记录）", () => {
    const out =
      "\r\nHKEY_CURRENT_USER\\Software\\Classes\\KnowSpace.Markdown\r\n    PrevDefault    REG_SZ    WorkBuddy.md\r\n\r\n";
    expect(parseDefaultValue(out)).toBe("WorkBuddy.md");
  });
});
