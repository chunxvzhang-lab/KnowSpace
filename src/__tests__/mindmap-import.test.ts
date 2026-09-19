import { describe, expect, it } from "vitest";
import {
  annotationsFromOutline,
  importFileName,
  outlineToMarkdown,
  parseFreemindOutline,
  parseOpmlOutline,
  parseOutlineFile,
  type ImportedOutline,
} from "../services/mindmapImport";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
import type { MindmapNode } from "../core/types";

/**
 * Reading another app's outline.
 *
 * The failure that matters here is silent: a nesting rule guessed wrong produces a
 * document that opens as a flat list — every topic present, none of them where
 * they belong — and nothing complains. So the tests are mostly about shape, and
 * the last one checks the property the whole import rests on: that the Markdown
 * this writes is read back as the same outline.
 */

/** A file in the shape XMind and OmniOutliner write. */
function opml(body: string, head = "<head><title>我的大纲</title></head>"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">${head}<body>${body}</body></opml>`;
}

function outlineOf(xml: string): ImportedOutline {
  const result = parseOpmlOutline(xml);
  if (!result.ok) throw new Error(`这一条本该能解析：${result.message}`);
  return result.outline;
}

/** The texts of a tree, depth-first, each with its depth — the shape, in order. */
function shape(node: MindmapNode, depth = 0): string[] {
  return [
    `${"  ".repeat(depth)}${node.text}`,
    ...node.children.flatMap((child) => shape(child, depth + 1)),
  ];
}

describe("读 OPML", () => {
  it("嵌套按嵌套读，不按出现顺序拍平", () => {
    const outline = outlineOf(
      opml(
        '<outline text="第一章"><outline text="1.1"/><outline text="1.2"><outline text="1.2.1"/></outline></outline><outline text="第二章"/>'
      )
    );

    expect(outline.topics).toHaveLength(2);
    expect(outline.topics[0].text).toBe("第一章");
    expect(outline.topics[0].children.map((t) => t.text)).toEqual(["1.1", "1.2"]);
    expect(outline.topics[0].children[1].children[0].text).toBe("1.2.1");
    // The second top-level topic is a sibling of the first, not its child.
    expect(outline.topics[1].children).toEqual([]);
    expect(outline.title).toBe("我的大纲");
  });

  it("标签依次从 text、title、元素文字里找", () => {
    // `text` is OPML 2.0's; the other two are what other exporters write instead,
    // and a topic with no label at all would be a list item with nothing in it.
    const outline = outlineOf(
      opml('<outline text="甲的"/><outline title="乙的"/><outline>丙的</outline><outline/>')
    );

    expect(outline.topics.map((t) => t.text)).toEqual(["甲的", "乙的", "丙的", "未命名"]);
  });

  it("标签里的换行与空白折成一行", () => {
    // In the source these are attribute values, where a newline is legal — but a
    // newline in a list item ends the item, and the rest of the label would
    // arrive as a sibling topic.
    const outline = outlineOf(opml('<outline text="第一行&#10;第二行   还有空格"/>'));

    expect(outline.topics[0].text).toBe("第一行 第二行 还有空格");
  });

  it("备注与链接跟着主题走，两种写法都认", () => {
    const outline = outlineOf(
      opml('<outline text="甲" _note="记一笔"/><outline text="乙" note="换个名字写" url="https://example.com"/>')
    );

    expect(outline.topics[0].note).toBe("记一笔");
    expect(outline.topics[1].note).toBe("换个名字写");
    expect(outline.topics[1].link).toBe("https://example.com");
    expect(outline.topics[0].link).toBeUndefined();
  });

  it("不认识的属性与 type 照常导入，不去报告", () => {
    // A reader who exported an outline wants the outline. A `type` this build
    // does not implement describes the topic's contents elsewhere, not its place
    // in the outline, and refusing the file over it would be the wrong trade.
    const outline = outlineOf(
      opml('<outline text="订阅" type="rss" xmlUrl="https://example.com/feed.xml" 自定义="随便"/>')
    );

    expect(outline.topics[0].text).toBe("订阅");
    expect(outline.topics[0].children).toEqual([]);
  });

  it("带 BOM 的文件照读", () => {
    const outline = outlineOf(`\uFEFF${opml('<outline text="甲"/>')}`);

    expect(outline.topics[0].text).toBe("甲");
  });

  it("不是大纲的文件说清楚哪里不对", () => {
    expect(parseOpmlOutline("")).toEqual({ ok: false, message: "文件是空的。" });
    expect(parseOpmlOutline("   \n ")).toEqual({ ok: false, message: "文件是空的。" });

    const broken = parseOpmlOutline("<opml><body>");
    expect(broken.ok).toBe(false);

    // An outline in another format: FreeMind's `<map>` is not an OPML, and saying
    // so is more useful than importing its attributes as topics.
    const freemind = parseOpmlOutline('<?xml version="1.0"?><map version="1.0.1"><node TEXT="甲"/></map>');
    expect(freemind).toEqual({
      ok: false,
      message: "这个文件不是 OPML 大纲（没有 <opml><body>）。",
    });
  });

  it("没有 head 的大纲也读", () => {
    const outline = outlineOf(`<opml version="1.0"><body><outline text="甲"/></body></opml>`);

    expect(outline.title).toBe("");
    expect(outline.topics[0].text).toBe("甲");
  });
});

describe("写成 Markdown", () => {
  it("每层两个空格，用 - 开头", () => {
    const markdown = outlineToMarkdown(
      outlineOf(opml('<outline text="甲"><outline text="乙"><outline text="丙"/></outline></outline>'))
    );

    expect(markdown).toBe("- 甲\n  - 乙\n    - 丙\n");
  });

  it("空大纲写成空字符串，而不是一个空行", () => {
    expect(outlineToMarkdown({ title: "空的", topics: [] })).toBe("");
  });

  it("写出来的 Markdown 读回去还是同一棵树", () => {
    // The property the import rests on: the document is the source of truth from
    // the moment it exists, so the translation has to survive the reader that
    // will be applied to it a second later.
    const outline = outlineOf(
      opml(
        '<outline text="父"><outline text="子甲"/><outline text="子乙"><outline text="孙"/></outline></outline><outline text="第二个分支"/>'
      )
    );

    const tree = parseMarkdownToMindmapTree(outlineToMarkdown(outline), "我的大纲");

    expect(shape(tree)).toEqual([
      "我的大纲",
      "  父",
      "    子甲",
      "    子乙",
      "      孙",
      "  第二个分支",
    ]);
  });
});

describe("备注与链接落到哪几个节点上", () => {
  it("按位置对上，包括嵌套里的", () => {
    const outline = outlineOf(
      opml(
        '<outline text="父" _note="父的备注"><outline text="子" _note="子的备注" url="https://example.com"/></outline>'
      )
    );
    const tree = parseMarkdownToMindmapTree(outlineToMarkdown(outline), "我的大纲");

    const { notes, links } = annotationsFromOutline(outline, tree);

    const parent = tree.children[0];
    const child = parent.children[0];
    expect(notes[parent.id]).toBe("父的备注");
    expect(notes[child.id]).toBe("子的备注");
    expect(links[child.id]).toBe("https://example.com");
    expect(Object.keys(notes)).toHaveLength(2);
  });

  it("两棵树的形状对不上时停住，而不是错位", () => {
    // Which would mean the two did not come from one another. Walking on would
    // put every annotation after the mismatch on the wrong topic — a failure that
    // looks like the importer mis-remembering, not like a mismatch.
    const outline = outlineOf(
      opml('<outline text="甲" _note="甲的"><outline text="甲的子里有备注" _note="子的"/></outline>')
    );
    const tree = parseMarkdownToMindmapTree("- 甲\n", "标题");

    const { notes } = annotationsFromOutline(outline, tree);

    expect(notes[tree.children[0].id]).toBe("甲的");
    expect(Object.keys(notes)).toHaveLength(1);
  });

  it("没有标注就不写文件（调用方据此决定要不要落盘）", () => {
    const outline = outlineOf(opml('<outline text="甲"><outline text="乙"/></outline>'));
    const tree = parseMarkdownToMindmapTree(outlineToMarkdown(outline), "标题");

    expect(annotationsFromOutline(outline, tree)).toEqual({ notes: {}, links: {} });
  });
});

describe("读 FreeMind", () => {
  /** A file in the shape FreeMind writes. */
  const mm = (root: string) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<map version="1.0.1">${root}</map>`;

  function freemindOf(xml: string): ImportedOutline {
    const result = parseFreemindOutline(xml);
    if (!result.ok) throw new Error(`这一条本该能解析：${result.message}`);
    return result.outline;
  }

  it("只有一个根，所以根就是这份大纲", () => {
    // The difference from OPML is not a detail: a single root *is* the outline, so
    // its text names the file and its children are the document's first level.
    const outline = freemindOf(
      mm('<node TEXT="我的导图"><node TEXT="甲"/><node TEXT="乙"><node TEXT="乙一"/></node></node>')
    );

    expect(outline.root?.text).toBe("我的导图");
    expect(outline.topics).toEqual([]);
    expect(outline.root?.children.map((t) => t.text)).toEqual(["甲", "乙"]);
    expect(outline.root?.children[1].children[0].text).toBe("乙一");
    // No title element in the format at all: the name comes from the root.
    expect(outline.title).toBe("");
  });

  it("TEXT 的大小写两种都认", () => {
    const outline = freemindOf(mm('<node TEXT="甲"><node text="小写的"/></node>'));

    expect(outline.root?.children[0].text).toBe("小写的");
  });

  it("备注是 HTML：取它的文字，段落与换行留着", () => {
    // FreeMind writes notes as an HTML fragment, and they are going into a text
    // field here — so the markup would only be in the way, while the paragraph
    // breaks are the note's own shape.
    const outline = freemindOf(
      mm(
        '<node TEXT="甲"><richcontent TYPE="NOTE"><html><body><p>第一段</p><p>第二段<br/>下一行</p></body></html></richcontent></node>'
      )
    );

    expect(outline.root?.note).toBe("第一段\n第二段\n下一行");
  });

  it("备注写成纯文字也认", () => {
    const outline = freemindOf(
      mm('<node TEXT="甲"><richcontent TYPE="NOTE">就是一句话</richcontent></node>')
    );

    expect(outline.root?.note).toBe("就是一句话");
  });

  it("链接读 LINK，图标与折叠状态不读", () => {
    // The icon set belongs to a Java client and has no counterpart in this app's
    // table; the fold state belongs to the reader's session here rather than to
    // the document.
    const outline = freemindOf(
      mm(
        '<node TEXT="甲" LINK="https://example.com" FOLDED="true" POSITION="right" COLOR="#ff0000"><icon BUILTIN="idea"/><node TEXT="乙"/></node>'
      )
    );

    expect(outline.root?.link).toBe("https://example.com");
    expect(outline.root?.children.map((t) => t.text)).toEqual(["乙"]);
  });

  it("没有主题的 map 说不出来，就报错", () => {
    expect(parseFreemindOutline(mm(""))).toEqual({
      ok: false,
      message: "这份 FreeMind 导图里没有主题。",
    });
  });

  it("根主题的备注落在文档根上，不是丢掉", () => {
    const outline = freemindOf(
      mm(
        '<node TEXT="我的导图"><richcontent TYPE="NOTE">根上的一句话</richcontent><node TEXT="甲"><richcontent TYPE="NOTE">甲的</richcontent></node></node>'
      )
    );
    const tree = parseMarkdownToMindmapTree(outlineToMarkdown(outline), "我的导图");

    const { notes } = annotationsFromOutline(outline, tree);

    // The document's own root *is* the imported root, so its note has somewhere
    // to go — which is why the root is kept as a root instead of being folded
    // into the list of topics.
    expect(notes[tree.id]).toBe("根上的一句话");
    expect(notes[tree.children[0].id]).toBe("甲的");
  });

  it("写出来的 Markdown 读回去还是一样深", () => {
    const outline = freemindOf(
      mm('<node TEXT="我的导图"><node TEXT="甲"/><node TEXT="乙"><node TEXT="乙一"/></node></node>')
    );

    const tree = parseMarkdownToMindmapTree(outlineToMarkdown(outline), "我的导图");

    expect(shape(tree)).toEqual(["我的导图", "  甲", "  乙", "    乙一"]);
  });
});

describe("按内容决定是哪种格式", () => {
  it("根元素说了算，而不是扩展名", () => {
    // The same exporter writes .xml for both, so the extension cannot be trusted
    // and the root element cannot be wrong.
    const opmlResult = parseOutlineFile(
      '<?xml version="1.0"?><opml version="2.0"><body><outline text="甲"/></body></opml>'
    );
    expect(opmlResult.ok && opmlResult.outline.topics[0].text).toBe("甲");

    const freemindResult = parseOutlineFile(
      '<?xml version="1.0"?><map version="1.0.1"><node TEXT="根"/></map>'
    );
    expect(freemindResult.ok && freemindResult.outline.root?.text).toBe("根");
  });

  it("都不像时，说清楚能读什么", () => {
    // "Not OPML" is not useful news if FreeMind was what the reader had in mind.
    const result = parseOutlineFile('<?xml version="1.0"?><xmind><sheet/></xmind>');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("xmind");
    expect(result.message).toContain("OPML");
    expect(result.message).toContain("FreeMind");
  });

  it("空文件与坏 XML 走同一套说法", () => {
    expect(parseOutlineFile("")).toEqual({ ok: false, message: "文件是空的。" });
    expect(parseOutlineFile("<map><node")).toEqual({
      ok: false,
      message: "这个文件不是可以解析的 XML。",
    });
  });
});

describe("新文档叫什么", () => {
  it("先用自己的标题，再用源文件名", () => {
    expect(importFileName({ title: "我的大纲", topics: [] }, "导出.opml")).toBe("我的大纲.md");
    expect(importFileName({ title: "", topics: [] }, "导出.opml")).toBe("导出.md");
    // Extension casing varies by exporter.
    expect(importFileName({ title: "", topics: [] }, "导出.OPML")).toBe("导出.md");
    expect(importFileName({ title: "", topics: [] }, "我的导图.mm")).toBe("我的导图.md");
    // A single root names the file when there is no head title — the format has
    // nowhere else to put a name.
    expect(importFileName({ title: "", topics: [], root: { text: "根的名字", children: [] } }, "x.mm")).toBe(
      "根的名字.md"
    );
  });

  it("名字里的分隔符换掉：文件得能建出来", () => {
    expect(importFileName({ title: "第一章/第二章: 开头", topics: [] }, "x.opml")).toBe(
      "第一章 第二章 开头.md"
    );
    // Nothing usable left: a default rather than a file called `.md`.
    expect(importFileName({ title: "///", topics: [] }, ".opml")).toBe("导入的大纲.md");
  });
});
