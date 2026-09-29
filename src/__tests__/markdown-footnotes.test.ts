/**
 * Footnote rendering (the 角标 report): `[^1]` and the Obsidian `[^1^]`
 * reference both render as numbered superscripts jumping to a collected
 * definition list, through the REAL production pipeline
 * (renderMarkdown -> blocks + sanitize), so the sanitizer whitelist for
 * sup/a/href/id/class/data-fn-* is part of what this pins.
 *
 * Pair-asserted (rule 5): unresolved reference stays literal AND resolved
 * one becomes a sup; unreferenced definition is dropped AND referenced one
 * renders; definition text never shows at the definition site.
 */
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../services/markdown";

const htmlOf = async (source: string): Promise<string> => {
  const chapter = await renderMarkdown(source);
  return chapter.html;
};

describe("footnote rendering", () => {
  it("renders the Obsidian [^1^] reference as a superscript jump", async () => {
    const html = await htmlOf("正文句子[^1^]。\n\n[^1^]: 这是脚注内容。\n");
    expect(html).toContain('<sup class="footnote-ref"');
    expect(html).toContain('href="#fn-1"');
    expect(html).toContain(">1</a></sup>");
    // the definition surfaces only in the collected list, and the raw tag
    // never survives as literal text
    expect(html).not.toContain("[^1^]");
    expect(html).toContain("这是脚注内容。");
    // jump contract: the reference carries the definition's source line for
    // the virtualized reader (line 3 of the sample above)
    expect(html).toContain('data-fn-def-line="3"');
  });

  it("renders the standard [^1] reference and links back with a numbered list", async () => {
    const html = await htmlOf("甲[^a]，乙[^b]，再甲[^a]。\n\n[^b]: 乙注\n\n[^a]: 甲注\n");
    // first-reference order: [^a] is 1 even though its definition is last.
    expect(html).toContain('id="fnref-a"');
    const aNumber = html.indexOf('<a href="#fn-a"');
    const bNumber = html.indexOf('<a href="#fn-b"');
    expect(aNumber).toBeGreaterThan(-1);
    expect(bNumber).toBeGreaterThan(-1);
    expect(html.slice(aNumber, aNumber + 60)).toContain(">1<");
    expect(html.slice(bNumber, bNumber + 60)).toContain(">2<");
    // back-reference from the list to the body, with the first reference's line
    expect(html).toContain('class="footnote-backref"');
    expect(html).toContain('href="#fnref-a"');
  });

  it("keeps an unresolved reference literal - no dead link (rule 10)", async () => {
    const html = await htmlOf("这里[^9]没有定义。\n");
    expect(html).toContain("[^9]");
    expect(html).not.toContain("footnote-ref");
  });

  it("drops an unreferenced definition from the document entirely", async () => {
    const html = await htmlOf("没有引用的正文。\n\n[^ghost]: 永远不会显示\n");
    expect(html).not.toContain("永远不会显示");
    expect(html).not.toContain("footnotes");
  });

  it("includes 2-space indented continuation lines in the definition", async () => {
    const html = await htmlOf("引用[^1]。\n\n[^1]: 第一行\n  第二行\n");
    expect(html).toContain("第一行");
    expect(html).toContain("第二行");
  });

  it("supports labels with spaces", async () => {
    const html = await htmlOf("文字[^my note]。\n\n[^my note]: 空格标签\n");
    expect(html).toContain("空格标签");
    expect(html).not.toContain("[^my note]");
  });

  it("accepts a definition inside a list item (pasted-web shape)", async () => {
    // Pasted web text often carries footnote definitions as list items; the
    // block rule's default alt chain covers list context, so this works
    // without special handling - pinned so it stays that way.
    const html = await htmlOf("- [^215]: 列表里的定义\n\n创造了纪录[^215^]。\n");
    expect(html).toContain("列表里的定义");
    expect(html).not.toContain("[^215^]");
  });

  it("the block pipeline groups the footnotes section (no whole-document fallback)", async () => {
    const chapter = await renderMarkdown("短句[^1]。\n\n[^1]: 注\n");
    expect(chapter.blocks).toBeTruthy();
    const blocks = chapter.blocks ?? [];
    expect(blocks.length).toBeGreaterThan(1);
    const footnotesBlock = blocks.find((b) => b.html.includes('class="footnotes"'));
    expect(footnotesBlock).toBeTruthy();
    // the section block maps back to the definition's source lines
    expect(footnotesBlock?.sourceStart).toBeGreaterThanOrEqual(3);
  });

  it("footnote refs inside a definition's own text stay literal", async () => {
    const html = await htmlOf("正文[^1]。\n\n[^1]: 定义里写[^2]。\n\n[^2]: 二号注\n");
    // [^2] inside footnote 1's text is not turned into a link...
    expect(html).toContain("[^2]");
    // ...but footnote 2 still exists as its own list entry when referenced
    // from the body - here it is not referenced, so it must be absent.
    expect(html).not.toContain("二号注");
  });

  it("does not interfere with wikilinks or task lists", async () => {
    const html = await htmlOf("- [ ] 任务 [[某笔记]] 尾注[^1]。\n\n[^1]: 列表脚注\n");
    expect(html).toContain('class="task-list-item');
    expect(html).toContain("data-wikilink-target");
    expect(html).toContain("列表脚注");
  });
});
