import { describe, expect, it } from "vitest";
import {
  SLASH_COMMANDS,
  matchSlashCommands,
  getCommandTemplate,
} from "../services/slashCommands";

describe("slashCommands service", () => {
  it("contains all core productivity commands across 6 categories", () => {
    expect(SLASH_COMMANDS.length).toBeGreaterThanOrEqual(15);
    const categories = new Set(SLASH_COMMANDS.map((c) => c.category));
    expect(categories.has("排版与标题")).toBe(true);
    expect(categories.has("列表与任务")).toBe(true);
    expect(categories.has("代码与结构")).toBe(true);
    expect(categories.has("图表与公式")).toBe(true);
    expect(categories.has("高级卡片")).toBe(true);
    expect(categories.has("知识连接")).toBe(true);
  });

  it("matches commands by English keyword, id, or pinyin initials", () => {
    // Empty query returns all
    expect(matchSlashCommands("").length).toBe(SLASH_COMMANDS.length);

    // Matches 'h1'
    const h1 = matchSlashCommands("h1");
    expect(h1.some((c) => c.id === "h1")).toBe(true);

    // Matches 'bt' (pinyin for 标题)
    const bt = matchSlashCommands("bt");
    expect(bt.some((c) => c.id.startsWith("h"))).toBe(true);

    // Matches 'table' / 'bg' (表格)
    const table = matchSlashCommands("bg");
    expect(table.some((c) => c.id === "table")).toBe(true);

    // Matches 'code' / 'dm' (代码)
    const code = matchSlashCommands("dm");
    expect(code.some((c) => c.id === "code_block")).toBe(true);

    // Matches 'mermaid' / 'lc' (流程图)
    const mermaid = matchSlashCommands("lc");
    expect(mermaid.some((c) => c.id === "mermaid_flowchart")).toBe(true);

    // Matches 'todo' / 'db' (待办)
    const todo = matchSlashCommands("db");
    expect(todo.some((c) => c.id === "todo")).toBe(true);
  });

  it("generates templates with accurate cursor offsets", () => {
    const h1 = SLASH_COMMANDS.find((c) => c.id === "h1")!;
    const resH1 = getCommandTemplate(h1);
    expect(resH1.text).toBe("# 标题内容\n");
    expect(resH1.cursorOffset).toBe(2);

    const wikilink = SLASH_COMMANDS.find((c) => c.id === "wikilink")!;
    const resWiki = getCommandTemplate(wikilink);
    expect(resWiki.text).toBe("[[]]");
    expect(resWiki.cursorOffset).toBe(2);

    const ts = SLASH_COMMANDS.find((c) => c.id === "timestamp")!;
    const resTs = getCommandTemplate(ts);
    expect(resTs.text).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} $/);
    expect(resTs.cursorOffset).toBe(resTs.text.length);
  });
});
