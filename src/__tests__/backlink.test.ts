import { describe, it, expect } from "vitest";
import {
  extractWikiLinksFromMarkdown,
  findUnlinkedMentions,
  convertUnlinkedMentionInText,
  createBacklinkIndex,
  updateDocumentInIndex,
  getLinkedReferences,
  getUnlinkedMentions,
} from "../services/backlinkIndex";

describe("Backlink Index Service", () => {
  it("extracts wikilinks accurately while skipping code blocks", () => {
    const markdown = `
# Title
Here is a link to [[Chapter Architecture]].
And an alias link [[Chapter Architecture|System Design]].

\`\`\`markdown
This is inside code: [[Should Be Ignored]]
\`\`\`

Another real link: [[Database Migrations]]
`;
    const links = extractWikiLinksFromMarkdown(markdown);
    expect(links).toHaveLength(3);
    expect(links[0].target).toBe("Chapter Architecture");
    expect(links[0].alias).toBeUndefined();
    expect(links[0].line).toBe(3);

    expect(links[1].target).toBe("Chapter Architecture");
    expect(links[1].alias).toBe("System Design");
    expect(links[1].line).toBe(4);

    expect(links[2].target).toBe("Database Migrations");
  });

  it("finds unlinked mentions outside of existing links and code", () => {
    const targetTitle = "快速开始";
    const content = `
欢迎阅读文档。
请先参照 快速开始 完成安装部署。
已经存在双链的行：[[快速开始]]
行内代码行：\`快速开始\` 应该被忽略。
最后再提一次 快速开始 引导。
`;
    const mentions = findUnlinkedMentions(targetTitle, content, "doc1", "欢迎页", "welcome.md");
    expect(mentions).toHaveLength(2);
    expect(mentions[0].line).toBe(3);
    expect(mentions[0].snippet).toContain("请先参照 快速开始 完成安装部署");
    expect(mentions[1].line).toBe(6);
  });

  it("converts an unlinked mention to a wikilink in text", () => {
    const content = `Line 1
Line 2 with 快速开始 guide
Line 3`;
    const updated = convertUnlinkedMentionInText(content, 2, "快速开始");
    expect(updated).toContain("Line 2 with [[快速开始]] guide");
  });

  it("builds and queries backlink index correctly", () => {
    const docs = [
      {
        id: "doc-1",
        title: "系统架构",
        path: "docs/arch.md",
        content: "引言。详情参考 [[数据库方案]] 与 [[API规范|接口文档]]。",
      },
      {
        id: "doc-2",
        title: "数据库方案",
        path: "docs/db.md",
        content: "依据 [[系统架构]] 的规范设计数据模型。",
      },
      {
        id: "doc-3",
        title: "开发周报",
        path: "weekly.md",
        content: "本周继续优化 系统架构 模块，同时更新了 [[系统架构]]。",
      },
    ];

    const index = createBacklinkIndex(docs);

    // Linked references to "系统架构"
    const refs = getLinkedReferences(index, "系统架构");
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.sourceId).sort()).toEqual(["doc-2", "doc-3"]);

    // Unlinked mentions of "系统架构"
    const unlinked = getUnlinkedMentions(index, "doc-1", "系统架构");
    expect(unlinked).toHaveLength(1);
    expect(unlinked[0].sourceId).toBe("doc-3");
    expect(unlinked[0].snippet).toContain("本周继续优化 系统架构 模块");

    // Test incremental update
    updateDocumentInIndex(
      index,
      "doc-2",
      "数据库方案",
      "全新重构，不再引用任何文档。",
      "docs/db.md",
    );
    const updatedRefs = getLinkedReferences(index, "系统架构");
    expect(updatedRefs).toHaveLength(1);
    expect(updatedRefs[0].sourceId).toBe("doc-3");
  });

  it("handles anchor references like [[System Architecture#Section 2|Details]]", () => {
    const markdown = "See [[System Architecture#Section 2|Details]] for more info.";
    const links = extractWikiLinksFromMarkdown(markdown);
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe("System Architecture");
    expect(links[0].alias).toBe("Details");
  });

  it("reliably detects unlinked mentions across consecutive lines without RegExp state leakage", () => {
    const targetTitle = "KnowSpace";
    const content = `KnowSpace line 1
KnowSpace line 2
KnowSpace line 3`;
    const mentions = findUnlinkedMentions(targetTitle, content, "doc-test", "Test Doc");
    expect(mentions).toHaveLength(3);
    expect(mentions[0].line).toBe(1);
    expect(mentions[1].line).toBe(2);
    expect(mentions[2].line).toBe(3);
  });

  it("converts unlinked mention safely without corrupting existing wikilinks, aliases, or code blocks", () => {
    const content = `Line 1
Line 2 with [[OtherDoc|快速开始]] and another 快速开始 mention
Line 3 with [快速开始](https://example.com) and \`快速开始\` and actual 快速开始 here`;
    const updated = convertUnlinkedMentionInText(content, 2, "快速开始");
    expect(updated).toContain("Line 2 with [[OtherDoc|快速开始]] and another [[快速开始]] mention");
    expect(updated).not.toContain("[[OtherDoc|[[快速开始]]]]");

    const updated2 = convertUnlinkedMentionInText(content, 3, "快速开始");
    expect(updated2).toContain("Line 3 with [快速开始](https://example.com) and `快速开始` and actual [[快速开始]] here");
  });
});
