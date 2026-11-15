import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { localizeSource, checkCoverage } = require("../../scripts/localize-english.cjs");

describe("English build localization", () => {
  it("covers renderer and native-process literals without missing translations", () => {
    expect(() => checkCoverage()).not.toThrow();
  });
  it("translates labels, attributes, templates and HTML while preserving expressions and user data", () => {
    const source = `// 保存\nconst value = userNote; const label = "保存";
const toast = \`已删除 \${count}\`;
const view = <button title="保存">保存</button>;
const pattern = /中文/;`;
    const result = localizeSource(source, "sample.tsx");
    expect(result).toContain('const label = "Save"');
    expect(result).toContain("`Deleted ${count}`");
    expect(result).toContain('<button title={"Save"}>{"Save"}</button>');
    expect(result).toContain("const value = userNote");
    expect(result).toContain("/中文/");
    expect(result).toContain("// 保存");
  });
  it("fails the build for untranslated new labels rather than silently shipping mixed UI", () => {
    expect(() => localizeSource('const label = "新文案";', "new.ts")).toThrow(/Missing English/);
  });
  it("keeps label-based object keys and lookups consistent for every timeline group", () => {
    const source = `const groups = { 今天: [], 昨天: [], 更早之前: [] };
groups["今天"].push("a"); groups["昨天"].push("b"); groups["更早之前"].push("c");
return groups;`;
    const translated = localizeSource(source, "timeline.ts");
    const groups = new Function(translated)();
    expect(groups).toEqual({ Today: ["a"], Yesterday: ["b"], Earlier: ["c"] });
  });
  it("preserves syntax and whitespace in multiline snippets", () => {
    const result = localizeSource("const text = `# 未命名\\n\\n`;", "sample.ts");
    expect(result).toBe("const text = `# Untitled\n\n`;");
  });
  it("keeps English artifacts separate from published packages", () => {
    const script = readFileSync(resolve(__dirname, "../../scripts/package-english.cjs"), "utf8");
    expect(script).toContain('"release", "english"');
    expect(script).toContain('installerLanguages: ["en_US"]');
    expect(script).toContain('language: "1033"');
    expect(script).toContain("KnowSpace-Setup-${version}-en.${ext}");
  });
});
