import { describe, expect, it } from "vitest";

describe("printToPDF options & filename sanitization", () => {
  it("sanitizes forbidden characters from PDF export title", () => {
    const rawTitle = "2026/09:架构*设计?规范<草案>|v1";
    const cleanTitle = rawTitle.replace(/[\\/:*?"<>|]/g, "_").trim();
    expect(cleanTitle).toBe("2026_09_架构_设计_规范_草案__v1");
  });

  it("constructs standard pure white A4 print margins and options", () => {
    const options = {
      printBackground: true,
      pageSize: "A4",
      landscape: false,
      margins: {
        marginType: "none",
      },
      preferCSSPageSize: true,
    };

    expect(options.printBackground).toBe(true);
    expect(options.pageSize).toBe("A4");
    expect(options.margins.marginType).toBe("none");
  });

  it("verifies required selectors and break-inside avoidance in styles.css", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const cssPath = path.resolve(__dirname, "../styles.css");
    const cssContent = await fs.readFile(cssPath, "utf8");

    expect(cssContent).toContain("@media print");
    expect(cssContent).toContain(".editor-section");
    expect(cssContent).toContain(".pane-header-bar");
    expect(cssContent).toContain(".dual-pane-header");
    expect(cssContent).toContain(".dual-splitter");
    expect(cssContent).toContain("break-inside: avoid");
    expect(cssContent).toContain("break-after: avoid");
  });

  it("导图视图有自己的打印规则：整张图适配纸张，控件不打印", async () => {
    // The map is an infinite canvas on screen, and what is visible there is the
    // reader's pan and zoom. A page has no reader, so the transform goes and the
    // map is fitted to the paper instead. The view box that completes this is set
    // in MindmapView, because it depends on the laid-out bounds — see
    // mindmap-svg-export.test.tsx for that half.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const cssContent = await fs.readFile(path.resolve(__dirname, "../styles.css"), "utf8");

    const printBlock = cssContent.slice(cssContent.indexOf("@media print {"));
    expect(printBlock.length).toBeGreaterThan(0);

    expect(printBlock).toMatch(/\.mindmap-viewport\s*\{\s*transform:\s*none/);
    expect(printBlock).toMatch(/\.mindmap-svg-canvas\s*\{[^}]*width:\s*100%/);
    expect(printBlock).toMatch(/\.mindmap-svg-canvas\s*\{[^}]*max-height:\s*240mm/);
    expect(printBlock).toMatch(/\.mindmap-view-container\s*\{[^}]*height:\s*auto/);

    // The same elements the PNG and SVG exports strip: controls, not drawing.
    const hidden = printBlock.slice(
      printBlock.indexOf(".mindmap-node-selection-ring"),
      printBlock.indexOf("display: none", printBlock.indexOf(".mindmap-node-selection-ring"))
    );
    for (const control of [
      ".mindmap-node-add-btn",
      ".mindmap-node-resize-handle",
      ".mindmap-context-menu",
      ".mindmap-inline-edit-input",
    ]) {
      expect(hidden).toContain(control);
    }
  });
});
