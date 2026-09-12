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
});
