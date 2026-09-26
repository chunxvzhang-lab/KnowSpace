import { describe, it, expect } from "vitest";
import {
  renderMarkdown,
  extractHeadingsFromSource,
  findHeadingLineInSource,
} from "../services/markdown";
import type { Heading } from "../core/types";

describe("v1.5.0 Markdown Enhancements", () => {
  it("injects data-language attribute on code blocks", async () => {
    const markdown = "```python\nprint('hello world')\n```";
    const rendered = await renderMarkdown(markdown);
    expect(rendered.html).toContain('data-language="python"');
    expect(rendered.html).toContain('class="hljs"');
  });

  it("handles code blocks without explicit language specification", async () => {
    const markdown = "```\nplain text content\n```";
    const rendered = await renderMarkdown(markdown);
    expect(rendered.html).toContain('data-language=""');
    expect(rendered.html).toContain('class="hljs"');
  });

  it("handles typescript code blocks with syntax highlighting and data-language", async () => {
    const markdown = "```typescript\nconst greeting: string = 'Hello BookMD';\n```";
    const rendered = await renderMarkdown(markdown);
    expect(rendered.html).toContain('data-language="typescript"');
  });

  it("renders headings with data-heading-id, id and source line numbers", async () => {
    const md = `# Document Title

Some introduction paragraph.

## Section 1: Features
Feature details here.

### 1.1 **Speed & Performance**
Benchmarking notes.
`;
    const rendered = await renderMarkdown(md);

    expect(rendered.headings.length).toBe(3);
    expect(rendered.headings[0].text).toBe("Document Title");
    expect(rendered.headings[0].line).toBe(1);

    expect(rendered.headings[1].text).toBe("Section 1: Features");
    expect(rendered.headings[1].line).toBe(5);

    expect(rendered.headings[2].text).toBe("1.1 Speed & Performance");
    expect(rendered.headings[2].line).toBe(8);

    expect(rendered.html).toContain(`data-heading-id="${rendered.headings[0].id}"`);
    expect(rendered.html).toContain(`data-heading-id="${rendered.headings[1].id}"`);
    expect(rendered.html).toContain(`data-heading-id="${rendered.headings[2].id}"`);
  });

  it("extractHeadingsFromSource extracts line numbers and strips inline markdown formatting", () => {
    const source = `Intro line

# 🚀 **Welcome** to KnowSpace

Paragraph 1

## *Core Architecture* & \`APIs\`

Paragraph 2

### [Link Text](https://example.com) Heading
`;
    const headings = extractHeadingsFromSource(source);

    expect(headings.length).toBe(3);
    expect(headings[0].text).toBe("🚀 Welcome to KnowSpace");
    expect(headings[0].line).toBe(3);

    expect(headings[1].text).toBe("Core Architecture & APIs");
    expect(headings[1].line).toBe(7);

    expect(headings[2].text).toBe("Link Text Heading");
    expect(headings[2].line).toBe(11);
  });

  it("findHeadingLineInSource returns heading.line directly when present", () => {
    const source = `# Title\n\n## Section\n`;
    const heading: Heading = {
      id: "section",
      text: "Section",
      level: 2,
      line: 3,
    };
    expect(findHeadingLineInSource(source, heading)).toBe(3);
  });

  it("findHeadingLineInSource returns -1 when heading does not exist in source", () => {
    const source = `# Title\n\n## Real Heading\n`;
    const missingHeading: Heading = {
      id: "non-existent",
      text: "Non Existent",
      level: 2,
    };
    expect(findHeadingLineInSource(source, missingHeading)).toBe(-1);
  });

  it("findHeadingLineInSource locates formatted heading lines when line property is missing", () => {
    const source = `# Title\n\n## **Deep Section**\n\nContent`;
    const heading: Heading = {
      id: "deep-section",
      text: "Deep Section",
      level: 2,
    };
    expect(findHeadingLineInSource(source, heading)).toBe(3);
  });
});
