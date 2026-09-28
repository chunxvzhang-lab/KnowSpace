/**
 * Block-granular rendering (phase 2, wave 2-1) correctness proof.
 *
 * The whole wave rests on two byte-level identities, pinned here against the
 * REAL production pipeline (`buildMarkdownIt`, the exact PROD sanitize config
 * via the service):
 *
 *  1. concat(per-group raw render) === md.render(source);
 *  2. concat(per-group DOMPurify.sanitize) === DOMPurify.sanitize(whole raw).
 *
 * And on the pipeline identity that follows from them: for every fixture,
 * `renderMarkdown(source).html` is byte-identical to what the old whole
 * document pipeline produced (the legacy reference recomputed in-test from
 * md.render + one whole sanitize + the same post-processing functions).
 *
 * Documents that fail the segmentation gates (hidden front-matter tokens,
 * raw HTML bleeding across block boundaries, dangling inline tags) must take
 * the whole-document path unchanged.
 */
import { describe, it, expect } from "vitest";
import DOMPurify from "dompurify";
import {
  buildBlockPlan,
  buildMarkdownIt,
  PROD_FRAGMENT_CONFIG,
  renderMarkdown,
  sanitizeBlockGroups,
  sanitizeBlockPlan,
} from "../services/markdown";
import { addHeadingIds, optimizeImages, rewriteRelativeUrls } from "../services/markdownDom";

const md = buildMarkdownIt(() => {});

/**
 * Fixtures the block path must take, split into groups, and sanitize
 * identically to the whole document. The task-list / blockquote-with-list /
 * table / raw-HTML cases are the ones that would fool a naive *string* split
 * (tags spanning many lines inside ONE block) — the token-group split is
 * immune because markdown-it keeps them single groups.
 */
const BLOCK_SAFE: Record<string, string> = {
  headingsAndFences: `# Title

Paragraph **bold** with [a link](http://example.com/a?x=1&y=2).

## Section

\`\`\`js
const a = 1 < 2 && 3 > 2; // escaped, cannot fool the tag scanner
function f() { return "x"; }
\`\`\`

---

Closing paragraph.
`,
  lists: `- item one
- item two
  - nested
- [x] done
- [ ] todo

1. ordered
2. items
`,
  blockquoteWithList: `> ## Heading in quote
>
> - item A
> - item B
>
> trailing quote paragraph
`,
  tables: `| 列一 | 列二 |
| :--- | ---: |
| a&b | c |
| d | e |
`,
  rawInlineBalancedInTable: `| Col | Value |
| --- | --- |
| bold | <b>x</b> |
| br | a<br>b |
`,
  rawHtmlBalanced: `<div class="wrap">
<p>inside raw with <span>nested</span> tags</p>
<ul><li>raw list<br>line</li></ul>
</div>

After the raw block.
`,
  inlineHtml: `A paragraph with <b>bold</b>, <u>underline</u> and a self-closing <br/> tag.

Another paragraph.
`,
  mermaidFence: "```mermaid\nflowchart LR\nA -->|x & y| B\n```\n",
  math: `Inline $a < b$ and display:

$$
\\int_0^1 x\\,dx = \\frac{1}{2}
$$
`,
};

/** Documents the gates must route to the whole-document fallback. */
const WHOLE_ONLY: Record<string, string> = {
  frontMatter: `---
title: Hello
tags: [a, b]
---

# After front matter

Para.
`,
  rawHtmlBleedingAcrossBlocks: `<div>

Content between blank lines.

</div>
`,
  danglingInlineTag: `A paragraph with a dangling <em>open tag.

Next paragraph.
`,
  strayTagInTableCell: `| Col | Value |
| --- | --- |
| a | <c> |
| b | d |
`,
};

function wholeSanitizeString(raw: string): string {
  const fragment = DOMPurify.sanitize(raw, PROD_FRAGMENT_CONFIG) as unknown as DocumentFragment;
  const template = document.createElement("template");
  template.content.append(fragment);
  return template.innerHTML;
}

/** The old pipeline's html, recomputed from scratch as the byte reference. */
function legacyHtml(source: string, baseUrl: string): string {
  const raw = md.render(source);
  const fragment = DOMPurify.sanitize(raw, PROD_FRAGMENT_CONFIG) as unknown as DocumentFragment;
  addHeadingIds(fragment);
  rewriteRelativeUrls(fragment, baseUrl);
  optimizeImages(fragment);
  const template = document.createElement("template");
  template.content.append(fragment);
  return template.innerHTML;
}

describe("block segmentation: the two byte-level identities", () => {
  for (const [name, source] of Object.entries(BLOCK_SAFE)) {
    it(`${name}: groups render, sanitize and serialize like the whole document`, async () => {
      const plan = buildBlockPlan(md, source);
      expect(plan.mode, "fixture must take the block path").toBe("blocks");
      if (plan.mode !== "blocks") return;

      // Identity 1: raw group renders concatenate back to md.render exactly.
      const raws = plan.groups.map((group) => group.raw);
      expect(raws.join("")).toBe(md.render(source));

      // Identity 2: per-block sanitize joined === whole-document sanitize.
      expect(sanitizeBlockGroups(plan.groups)).toBe(wholeSanitizeString(md.render(source)));

      // The pipeline-level consequence: the shipped html is byte-identical to
      // the old whole-document render, and html === concat(blocks).
      const baseUrl = window.location.href;
      const rendered = await renderMarkdown(source, baseUrl);
      expect(rendered.blocks).toBeDefined();
      expect(rendered.blocks?.length).toBe(plan.groups.length);
      expect(rendered.blocks!.map((block) => block.html).join("")).toBe(rendered.html);
      expect(rendered.html).toBe(legacyHtml(source, baseUrl));

      // Every source range is monotone and real (R7: data-source-line rides
      // the post-processed blocks the reader inserts).
      const lines = source.split("\n").length;
      for (const block of rendered.blocks!) {
        expect(block.sourceStart).toBeGreaterThanOrEqual(1);
        expect(block.sourceEnd).toBeLessThanOrEqual(lines);
        expect(block.sourceEnd).toBeGreaterThanOrEqual(block.sourceStart);
      }
      expect(rendered.html).toContain("data-source-line=");
    });
  }

  for (const [name, source] of Object.entries(WHOLE_ONLY)) {
    it(`${name}: falls back to the whole-document path, html unchanged`, async () => {
      // Segmentation gates: front matter is refused up front (hidden token);
      // bleeding/dangling raw HTML is refused by the balance scan at the
      // sanitize stage — which then tells the caller to sanitize whole.
      const plan = buildBlockPlan(md, source);
      if (plan.mode !== "whole") {
        const sanitized = sanitizeBlockPlan(plan.groups);
        expect(sanitized.mode, "balance scan must reject this fixture").toBe("unsafe");
      }

      const baseUrl = window.location.href;
      const rendered = await renderMarkdown(source, baseUrl);
      expect(rendered.blocks).toBeUndefined();
      expect(rendered.html).toBe(legacyHtml(source, baseUrl));
    });
  }

  it("wikilink embeds split their paragraph: html stays right, blocks drop", async () => {
    const source = "Text before ![[Some Doc#^abc]] after.\n";
    const baseUrl = window.location.href;
    const rendered = await renderMarkdown(source, baseUrl);
    // One token group, but the embed <div> auto-closes the <p> — 2 elements,
    // the 1:1 boundary check must refuse to pair them.
    expect(rendered.blocks).toBeUndefined();
    expect(rendered.html).toBe(legacyHtml(source, baseUrl));
  });
});

describe("sanitize cache is content-addressed per block", () => {
  it("editing one paragraph in a 50-block doc changes exactly one block key", () => {
    const paragraphs = Array.from({ length: 50 }, (_, i) => `第 ${i + 1} 段 paragraph text ${i}.`);
    const source = paragraphs.join("\n\n") + "\n";
    const edited = [...paragraphs];
    edited[24] = edited[24] + " — typed here";
    const editedSource = edited.join("\n\n") + "\n";

    const v1 = buildBlockPlan(md, source);
    const v2 = buildBlockPlan(md, editedSource);
    expect(v1.mode).toBe("blocks");
    expect(v2.mode).toBe("blocks");
    if (v1.mode !== "blocks" || v2.mode !== "blocks") return;
    expect(v1.groups.length).toBe(50);
    expect(v2.groups.length).toBe(50);

    const changed = v1.groups.filter((group, i) => group.raw !== v2.groups[i].raw).length;
    expect(changed).toBe(1);
    // And the content-addressed cache keys on that exact raw string, so the
    // remaining 49 blocks replay on the next renderMarkdown.
    expect(sanitizeBlockGroups(v1.groups) === sanitizeBlockGroups(v2.groups)).toBe(false);
  });

  it("a second renderMarkdown of the same source reuses cached blocks (stable output)", async () => {
    const paragraphs = Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1} with **content**.`);
    const source = paragraphs.join("\n\n") + "\n";
    const first = await renderMarkdown(source);
    const second = await renderMarkdown(source);
    expect(second.html).toBe(first.html);
    expect(second.blocks?.map((b) => b.html).join("")).toBe(first.html);
  });

  it("cold whole-pass backfill and warm per-block replay produce identical bytes", async () => {
    // A nonce in EVERY block guarantees the first render is fully cold (one
    // whole-document sanitize pass that back-fills the per-block cache), and
    // the second render — through a different module-cache key (baseUrl is
    // part of it) — is fully warm (per-block strings from cache, joined and
    // parsed). The two paths must be interchangeable down to the byte.
    const nonce = `n${Math.random().toString(36).slice(2, 10)}`;
    const blocks = Array.from({ length: 9 }, (_, i) => `Paragraph ${i} ${nonce}-${i} body text.`);
    const source = `# Heading ${nonce}\n\n` + blocks.join("\n\n") + "\n";

    const cold = await renderMarkdown(source, "http://cold.invalid/");
    const warm = await renderMarkdown(source, "http://warm.invalid/");
    expect(cold.blocks).toBeDefined();
    expect(warm.blocks).toBeDefined();
    expect(warm.html).toBe(cold.html);
    expect(warm.blocks).toEqual(cold.blocks);
    // And both match the old whole-document pipeline's output.
    expect(cold.html).toBe(legacyHtml(source, "http://cold.invalid/"));
    expect(warm.html).toBe(legacyHtml(source, "http://warm.invalid/"));
  });
});
