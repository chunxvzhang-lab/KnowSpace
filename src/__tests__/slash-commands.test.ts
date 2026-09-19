import { describe, expect, it } from "vitest";
import {
  SLASH_COMMANDS,
  matchSlashCommands,
  getCommandTemplate,
} from "../services/slashCommands";
import { parseFlashcards } from "../services/fsrsService";

describe("slashCommands service", () => {
  it("contains all core productivity commands across 7 categories", () => {
    expect(SLASH_COMMANDS.length).toBeGreaterThanOrEqual(15);
    const categories = new Set(SLASH_COMMANDS.map((c) => c.category));
    expect(categories.has("排版与标题")).toBe(true);
    expect(categories.has("列表与任务")).toBe(true);
    expect(categories.has("代码与结构")).toBe(true);
    expect(categories.has("图表与公式")).toBe(true);
    expect(categories.has("高级卡片")).toBe(true);
    expect(categories.has("知识连接")).toBe(true);
    // Flashcards have their own category rather than joining "高级卡片", which is
    // callouts: asking the reader to remember which kind of 卡片 is which is how a
    // command ends up unfindable.
    expect(categories.has("复习闪卡")).toBe(true);
  });

  it("三条闪卡命令的模板，插进去就已经是一张卡", () => {
    // The menu and the review are two halves of one feature, and this is where they are
    // tied together. A template that is *nearly* the syntax would look right in the menu
    // and produce nothing to review — a silent way to lose a card.
    const cases = [
      ["card_qa", "qa", "问题\nA: 答案\n"],
      ["card_inline", "inline", "问题 :: 答案\n"],
      ["card_cloze", "cloze", "答案}}，其余照常。\n"],
    ] as const;

    for (const [id, kind, tail] of cases) {
      const command = SLASH_COMMANDS.find((c) => c.id === id)!;
      const { text, cursorOffset } = getCommandTemplate(command);

      const cards = parseFlashcards(text);
      expect(cards).toHaveLength(1);
      expect(cards[0].kind).toBe(kind);
      // The cursor lands on the placeholder, so the reader types over the sample rather
      // than hunting for it.
      expect(text.slice(cursorOffset)).toBe(tail);
    }
  });

  it("搜「闪卡」或「复习」都能找到它们", () => {
    // What the reader actually types. The category name is not searched — only id,
    // title, description and keywords are — so both words have to be in the commands
    // themselves.
    for (const query of ["闪卡", "复习"]) {
      expect(matchSlashCommands(query).filter((c) => c.category === "复习闪卡")).toHaveLength(3);
    }
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
