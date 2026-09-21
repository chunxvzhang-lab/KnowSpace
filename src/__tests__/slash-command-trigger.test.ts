import { describe, expect, it } from "vitest";
import { SLASH_COMMANDS, applySlashCommand, detectSlashTrigger } from "../services/slashCommands";

/**
 * The `/` trigger, pinned.
 *
 * The document editor and the canvas card's textarea both ask this one function,
 * so these cases are the contract for "the two editors behave the same". The
 * cases that matter most are the ones that must NOT fire: a slash is common in
 * paths, URLs and comments, and a menu opening in the middle of one is the kind
 * of bug that gets blamed on the editor being flaky.
 */
describe("detectSlashTrigger", () => {
  it("finds a slash at the start of a line", () => {
    expect(detectSlashTrigger("/todo", 5)).toEqual({ query: "todo", startIndex: 0 });
  });

  it("finds one typed after a space, mid-sentence", () => {
    expect(detectSlashTrigger("清单 /todo", 8)).toEqual({ query: "todo", startIndex: 3 });
  });

  it("finds the slash before anything has been typed after it", () => {
    expect(detectSlashTrigger("/", 1)).toEqual({ query: "", startIndex: 0 });
  });

  it("finds one at the start of a line further down the document", () => {
    expect(detectSlashTrigger("正文\n/h1", 6)).toEqual({ query: "h1", startIndex: 3 });
  });

  it("keeps the search to the line the caret is on", () => {
    // The slash is a line above, so it is not the one being typed.
    expect(detectSlashTrigger("/todo\n正文", 8)).toBeNull();
  });

  it("lower-cases the query, so search is case-insensitive", () => {
    expect(detectSlashTrigger("/TODO", 5)?.query).toBe("todo");
  });

  it("searches Chinese as readily as English", () => {
    expect(detectSlashTrigger("清单 /闪卡", 6)?.query).toBe("闪卡");
  });

  it("ignores a slash that is part of a path, URL, comment or escape", () => {
    for (const text of [
      "notes/a.md",
      "path/to/note",
      "https://example.com",
      "http://a",
      "a//b",
      "\\/escape",
    ]) {
      expect(detectSlashTrigger(text, text.length), text).toBeNull();
    }
  });

  it("stops the query at the first space, so a later word is not a search", () => {
    expect(detectSlashTrigger("/todo 后面还有字", 11)).toBeNull();
  });
});

describe("applySlashCommand", () => {
  const command = (id: string) => SLASH_COMMANDS.find((c) => c.id === id)!;

  it("replaces the query with the template and leaves the caret inside it", () => {
    const trigger = detectSlashTrigger("清单 /todo", 8)!;
    const result = applySlashCommand("清单 /todo", trigger, 8, command("todo"));
    expect(result.text).toBe("清单 - [ ] 待办事项内容\n");
    // Straight after "- [ ] ", which is where the reader starts typing.
    expect(result.caret).toBe(9);
  });

  it("keeps whatever followed the caret", () => {
    const text = "/h2段落";
    const trigger = detectSlashTrigger(text, 3)!;
    const result = applySlashCommand(text, trigger, 3, command("h2"));
    expect(result.text).toBe("## 标题内容\n段落");
    expect(result.caret).toBe(3);
  });

  it("asks the service for a dynamic command's text rather than a template", () => {
    const trigger = detectSlashTrigger("/time", 5)!;
    const result = applySlashCommand("/time", trigger, 5, command("timestamp"));
    expect(result.text).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} $/);
    expect(result.caret).toBe(result.text.length);
  });
});
