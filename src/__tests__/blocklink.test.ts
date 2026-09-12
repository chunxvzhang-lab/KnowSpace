import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../services/markdown";

describe("blocklink & embedding", () => {
  it("extracts paragraph-end ^block-id and renders block-anchor badge", async () => {
    const md = "这是核心总结段落，包含重要指标。 ^key-summary";
    const rendered = await renderMarkdown(md);

    expect(rendered.html).toContain('class="block-anchor"');
    expect(rendered.html).toContain('data-block-id="key-summary"');
    expect(rendered.html).toContain('id="^key-summary"');
    expect(rendered.html).toContain('data-tooltip="点击复制段落引用 [[#^key-summary]]"');
    // Ensure the raw blockId string is not directly shown in the DOM body
    expect(rendered.html).not.toContain('<span class="block-anchor-id">key-summary</span>');
    expect(rendered.html).toContain("这是核心总结段落，包含重要指标。");
  });

  it("renders block reference wikilink [[doc#^block-id]] with semantic label without #^blockId", async () => {
    const md = "参见上文核心指标：[[USER_MANUAL#^key-summary]]。";
    const rendered = await renderMarkdown(md);

    expect(rendered.html).toContain('class="wikilink wikilink-block"');
    expect(rendered.html).toContain('data-wikilink-target="USER_MANUAL#^key-summary"');
    expect(rendered.html).toContain("⚓");
    expect(rendered.html).toContain("USER_MANUAL &gt; 段落引用");
    expect(rendered.html).not.toContain('<span class="wikilink-text">USER_MANUAL#^key-summary</span>');
  });

  it("renders local block reference [[#^block-id]] as semantic '段落引用'", async () => {
    const md = "请跳转至本页总结：[[#^local-block]]。另见别名引用：[[#^local-block|核心结论]]。";
    const rendered = await renderMarkdown(md);

    expect(rendered.html).toContain('class="wikilink wikilink-block"');
    expect(rendered.html).toContain('data-wikilink-target="#^local-block"');
    expect(rendered.html).toContain('<span class="wikilink-text">段落引用</span>');
    expect(rendered.html).not.toContain('<span class="wikilink-text">#^local-block</span>');
    // Custom alias is faithfully preserved
    expect(rendered.html).toContain('<span class="wikilink-text">核心结论</span>');
  });

  it("renders block embedding ![[doc#^block-id]] as an embed card", async () => {
    const md = "以下为内嵌卡片：\n\n![[架构设计#^topology]]";
    const rendered = await renderMarkdown(md);

    expect(rendered.html).toContain('class="wikilink-embed-card"');
    expect(rendered.html).toContain('data-embed-target="架构设计#^topology"');
    expect(rendered.html).toContain("块级内联引用");
    expect(rendered.html).toContain('class="embed-source-link"');
    expect(rendered.html).toContain("架构设计 &gt; 段落引用");
  });

  it("defines jump-target-pulse animation with smooth duration and rounded border", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const css = fs.readFileSync(path.resolve(__dirname, "../styles.css"), "utf-8");

    expect(css).toContain(".jump-target-pulse");
    expect(css).toContain("animation: jumpPulseGlow 1.4s ease-out forwards;");
    expect(css).toContain("border-radius: 4px;");
  });
});
