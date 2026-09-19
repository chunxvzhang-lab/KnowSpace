import { describe, expect, it } from "vitest";
import { describeMindmapLink, parseMindmapLink } from "../core/mindmapLinks";

/**
 * Reading a node's link.
 *
 * The three forms are the whole contract, and so is the fourth answer: text that
 * is none of them returns null rather than being guessed at. That matters more
 * than it looks — the panel shows the reader that answer while they type, and
 * the map draws no badge for it, so nothing pretends to be followable when it
 * is not.
 */
describe("链接形式", () => {
  it("外部地址：交给系统打开", () => {
    expect(parseMindmapLink("https://example.com/a?b=1")).toEqual({
      kind: "external",
      target: "https://example.com/a?b=1",
    });
    expect(parseMindmapLink("http://localhost:3000")).toEqual({
      kind: "external",
      target: "http://localhost:3000",
    });
    expect(parseMindmapLink("mailto:someone@example.com")).toEqual({
      kind: "external",
      target: "mailto:someone@example.com",
    });
    // Scheme matching is case-insensitive, as URLs are.
    expect(parseMindmapLink("HTTPS://Example.com")?.kind).toBe("external");
  });

  it("内部文档：[[名字]]，可带 #标题", () => {
    expect(parseMindmapLink("[[产品设计]]")).toEqual({ kind: "wiki", target: "产品设计" });
    expect(parseMindmapLink("[[产品设计#验收标准]]")).toEqual({
      kind: "wiki",
      target: "产品设计",
      anchor: "验收标准",
    });
    // Whitespace around either half is the reader's spacing, not part of a name.
    expect(parseMindmapLink("[[ 产品设计 # 验收标准 ]]")).toEqual({
      kind: "wiki",
      target: "产品设计",
      anchor: "验收标准",
    });
  });

  it("本文档标题：#标题", () => {
    expect(parseMindmapLink("#验收标准")).toEqual({ kind: "anchor", target: "验收标准" });
    // `[[#标题]]` names no document, so it is the local form being written the
    // long way — read as the same thing rather than as a document called "".
    expect(parseMindmapLink("[[#验收标准]]")).toEqual({ kind: "anchor", target: "验收标准" });
  });

  it("不是链接就返回 null，而不是猜", () => {
    expect(parseMindmapLink("")).toBeNull();
    expect(parseMindmapLink("   ")).toBeNull();
    expect(parseMindmapLink(null)).toBeNull();
    expect(parseMindmapLink(undefined)).toBeNull();
    // Bare text is not a link: this app spells internal links `[[…]]`, and
    // guessing that `产品设计` means a document would make typos navigate.
    expect(parseMindmapLink("产品设计")).toBeNull();
    expect(parseMindmapLink("#")).toBeNull();
    expect(parseMindmapLink("[[]]")).toBeNull();
    expect(parseMindmapLink("[[#]]")).toBeNull();
    expect(parseMindmapLink("[[产品设计#]]")).toEqual({ kind: "wiki", target: "产品设计" });

    // Alias syntax is not read by this build, and guessing that the part before
    // the bar is the document would send someone to a file they never named.
    // The text is kept; the panel says it is not a link it can follow.
    expect(parseMindmapLink("[[产品设计|别名]]")).toBeNull();
  });

  it("前后空白不影响判断，也让内容保持原样", () => {
    expect(parseMindmapLink("  https://example.com  ")).toEqual({
      kind: "external",
      target: "https://example.com",
    });
    expect(parseMindmapLink("  #标题  ")).toEqual({ kind: "anchor", target: "标题" });
  });

  it("面板要先说明去哪儿，再让人点", () => {
    expect(describeMindmapLink({ kind: "external", target: "https://x" })).toBe("外部链接");
    expect(describeMindmapLink({ kind: "wiki", target: "产品设计" })).toBe("文档「产品设计」");
    expect(describeMindmapLink({ kind: "wiki", target: "产品设计", anchor: "验收" })).toBe(
      "文档「产品设计」的 #验收"
    );
    expect(describeMindmapLink({ kind: "anchor", target: "验收" })).toBe("本文档的 #验收");
  });
});
