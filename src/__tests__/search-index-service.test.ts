import { describe, expect, it } from "vitest";
import {
  parseSearchQuery,
  extractTagsFromMarkdown,
  extractLinksFromMarkdown,
  tokenizeText,
  buildVaultSearchIndex,
  updateVaultSearchIndexForDocument,
  searchVault,
  normalizeTag,
  normalizeLinkTarget,
} from "../services/searchIndexService";

describe("searchIndexService - Structured Search Syntax Parser", () => {
  it("parses empty and whitespace queries safely", () => {
    const res = parseSearchQuery("   ");
    expect(res.isEmpty).toBe(true);
    expect(res.tags).toEqual([]);
    expect(res.links).toEqual([]);
    expect(res.phrases).toEqual([]);
  });

  it("parses tag syntax in various formats (tag:#xxx, tag:xxx, #xxx)", () => {
    const q1 = parseSearchQuery("tag:#架构 tag:后端 #微服务");
    expect(q1.tags).toEqual(["架构", "后端", "微服务"]);
    expect(q1.hasFilters).toBe(true);

    const q2 = parseSearchQuery("tag:#react/hooks");
    expect(q2.tags).toEqual(["react/hooks"]);
  });

  it("parses wikilink syntax (link:[[xxx]], link:xxx)", () => {
    const q = parseSearchQuery("link:[[分布式一致性]] link:网络协议.md");
    expect(q.links).toEqual(["分布式一致性", "网络协议"]);
    expect(q.hasFilters).toBe(true);
  });

  it("parses exact quoted phrases", () => {
    const q = parseSearchQuery('"raft consensus algorithm" "leader election"');
    expect(q.phrases).toEqual(["raft consensus algorithm", "leader election"]);
    expect(q.hasFilters).toBe(true);
  });

  it("parses exclusions with minus sign", () => {
    const q = parseSearchQuery("raft -paxos -废弃");
    expect(q.includeTerms).toEqual(["raft"]);
    expect(q.excludeTerms).toEqual(["paxos", "废弃"]);
    expect(q.hasFilters).toBe(true);
  });

  it("parses date filters (after:YYYY-MM-DD, before:YYYY-MM-DD)", () => {
    const q = parseSearchQuery("after:2026-09-01 before:2026-09-08 架构");
    expect(q.afterDate).toBe("2026-09-01");
    expect(q.beforeDate).toBe("2026-09-08");
    expect(q.includeTerms).toEqual(["架构"]);
    expect(q.hasFilters).toBe(true);
  });

  it("parses complex hybrid structured queries", () => {
    const q = parseSearchQuery('tag:#架构 link:[[存储引擎]] "LSM Tree" -BTree after:2026-01-01');
    expect(q.tags).toEqual(["架构"]);
    expect(q.links).toEqual(["存储引擎"]);
    expect(q.phrases).toEqual(["LSM Tree"]);
    expect(q.excludeTerms).toEqual(["btree"]);
    expect(q.afterDate).toBe("2026-01-01");
    expect(q.hasFilters).toBe(true);
  });

  it("handles negative tags without polluting positive tags and ignores tags inside quotes", () => {
    const q = parseSearchQuery('tag:#架构 -#废弃 "tag:#inside"');
    expect(q.tags).toEqual(["架构"]);
    expect(q.excludeTerms).toEqual(["废弃"]);
    expect(q.phrases).toEqual(["tag:#inside"]);
  });
});

describe("searchIndexService - Extraction & Tokenization", () => {
  it("extracts tags from markdown body and frontmatter", () => {
    const markdown = `---
title: 架构指南
tags: [分布式, 高并发]
---

# 概述 (这是一个标题，不应该作为标签)

在微服务体系中，我们采用 #云原生 和 #service-mesh 方案。
代码示例：
\`\`\`bash
# 这里的注释不应该算作标签
echo "hello"
\`\`\`
十六进制颜色如 #ffffff 或 #123456 不应该被作为标签。
`;
    const tags = extractTagsFromMarkdown(markdown);
    expect(tags).toContain("分布式");
    expect(tags).toContain("高并发");
    expect(tags).toContain("云原生");
    expect(tags).toContain("service-mesh");
    expect(tags).not.toContain("概述");
    expect(tags).not.toContain("ffffff");
    expect(tags).not.toContain("123456");
  });

  it("extracts wikilinks from markdown", () => {
    const markdown = `
参考文档 [[分布式协议]] 以及 [[存储引擎|RocksDB]] 和 [[网络层#TCP]]。
`;
    const links = extractLinksFromMarkdown(markdown);
    expect(links).toContain("分布式协议");
    expect(links).toContain("存储引擎");
    expect(links).toContain("网络层");
  });

  it("generates tokens and CJK n-grams for fast search", () => {
    const tokens = tokenizeText("Raft 共识算法");
    expect(tokens).toContain("raft");
    expect(tokens).toContain("共");
    expect(tokens).toContain("识");
    expect(tokens).toContain("共识");
    expect(tokens).toContain("算法");
  });
});

describe("searchIndexService - Vault Search Engine", () => {
  const docs = [
    {
      id: "doc-1",
      title: "分布式协议详解",
      path: "distributed.md",
      content: `# 分布式协议详解

在分布式系统中，#架构 选型至关重要。
我们参考了 [[网络传输协议]]。

Raft 协议是一种为了易于理解而设计的 "raft consensus" 共识算法。
它通过领导者选举和日志复制实现状态机复制。
`,
    },
    {
      id: "doc-2",
      title: "存储引擎与索引",
      path: "storage.md",
      content: `# 存储引擎与索引

LSM-Tree 和 B-Tree 是经典的数据组织形式。
此系统具备 #架构 优势，但包含已废弃的旧版本逻辑。
关联设计见 [[分布式协议详解]]。
`,
    },
    {
      id: "doc-3",
      title: "前端架构演进",
      path: "frontend.md",
      content: `# 前端架构演进

现代 Web 应用使用 React 19 和 TypeScript。
具有模块化 #前端 设计。
`,
    },
  ];

  it("builds vault index and performs term search in milliseconds", () => {
    const index = buildVaultSearchIndex(docs);
    expect(index.documents.size).toBe(3);

    const results = searchVault(index, "共识算法");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chapterId).toBe("doc-1");
    expect(results[0].excerpt).toContain("共识算法");
  });

  it("filters accurately using tag syntax (tag:#架构)", () => {
    const index = buildVaultSearchIndex(docs);

    const results = searchVault(index, "tag:#架构");
    // Both doc-1 and doc-2 have tag #架构
    expect(results.length).toBe(2);
    const docIds = results.map((r) => r.chapterId);
    expect(docIds).toContain("doc-1");
    expect(docIds).toContain("doc-2");
    expect(docIds).not.toContain("doc-3");
  });

  it("filters accurately using wikilink syntax (link:[[...]])", () => {
    const index = buildVaultSearchIndex(docs);

    const results = searchVault(index, "link:[[网络传输协议]]");
    expect(results.length).toBe(1);
    expect(results[0].chapterId).toBe("doc-1");
  });

  it("filters accurately using exact phrase syntax", () => {
    const index = buildVaultSearchIndex(docs);

    const results = searchVault(index, '"raft consensus"');
    expect(results.length).toBe(1);
    expect(results[0].chapterId).toBe("doc-1");
    expect(results[0].category).toBe("phrase");
  });

  it("respects exclusion terms with minus (-废弃)", () => {
    const index = buildVaultSearchIndex(docs);

    // Searching #架构 without exclusion returns 2
    const allArch = searchVault(index, "tag:#架构");
    expect(allArch.length).toBe(2);

    // Searching #架构 with -废弃 excludes doc-2
    const filteredArch = searchVault(index, "tag:#架构 -废弃");
    expect(filteredArch.length).toBe(1);
    expect(filteredArch[0].chapterId).toBe("doc-1");
  });

  it("supports scoped search within a specific chapter", () => {
    const index = buildVaultSearchIndex(docs);

    const results = searchVault(index, "tag:#架构", { scopeChapterId: "doc-2" });
    expect(results.length).toBe(1);
    expect(results[0].chapterId).toBe("doc-2");
  });

  it("incrementally updates search index when a document changes", () => {
    let index = buildVaultSearchIndex(docs);

    // Update doc-3 to include #架构 tag
    const updatedContent = `# 前端架构演进\n\n全新重构，融入统一 #架构 标准体系。`;
    index = updateVaultSearchIndexForDocument(index, "doc-3", "前端架构演进", updatedContent, "frontend.md");

    const results = searchVault(index, "tag:#架构");
    expect(results.length).toBe(3);
    const docIds = results.map((r) => r.chapterId);
    expect(docIds).toContain("doc-3");
  });

  it("searches long multi-character CJK phrases seamlessly", () => {
    const index = buildVaultSearchIndex(docs);
    const results = searchVault(index, "状态机复制");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chapterId).toBe("doc-1");
    expect(results[0].excerpt).toContain("状态机复制");
  });

  it("excludes documents matching negative tag syntax", () => {
    const index = buildVaultSearchIndex(docs);
    const results = searchVault(index, "架构 -#前端");
    const ids = results.map((r) => r.chapterId);
    expect(ids).toContain("doc-1");
    expect(ids).toContain("doc-2");
    expect(ids).not.toContain("doc-3");
  });
});
