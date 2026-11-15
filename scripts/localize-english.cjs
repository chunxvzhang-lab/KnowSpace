const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const catalog = require("../locales/en.json");
const han = /\p{Script=Han}/u;
const root = path.resolve(__dirname, "..");

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(file);
    return /\.(tsx?|cjs)$/.test(file) && !file.endsWith(".d.ts") ? [file] : [];
  });
}

// Translate source literals, never DOM nodes or user documents. Interpolated
// expressions, IPC names, paths, regular expressions and comments stay intact.
function localizeSource(source, filename, dictionary = catalog) {
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const edits = [];
  const missing = new Set();
  function visit(node) {
    const labelKey =
      ts.isIdentifier(node) && ts.isPropertyAssignment(node.parent) && node.parent.name === node;
    const literal =
      labelKey ||
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node);
    if (literal && han.test(node.text)) {
      const key = node.text.trim();
      const value = dictionary[key];
      if (value === undefined || han.test(value)) {
        missing.add(key);
      } else {
        const leading = node.text.match(/^\s*/)[0];
        const trailing = node.text.match(/\s*$/)[0];
        const text = leading + value + trailing;
        let replacement;
        if (ts.isJsxText(node)) {
          // Match JSX's whitespace folding before converting text to a string
          // expression. A raw '<' in a translated label must not become markup.
          const folded = text
            .split(/\r?\n/)
            .map((line, index, lines) => {
              let result = line.replace(/\t/g, " ");
              if (index > 0) result = result.trimStart();
              if (index < lines.length - 1) result = result.trimEnd();
              return result;
            })
            .filter(Boolean)
            .join(" ")
            .replace(
              /&(gt|lt|amp|quot|apos);/g,
              (_, entity) => ({ gt: ">", lt: "<", amp: "&", quot: '"', apos: "'" })[entity],
            );
          replacement = `{${JSON.stringify(folded)}}`;
        } else if (ts.isStringLiteral(node) || labelKey) {
          replacement = JSON.stringify(text);
          if (ts.isJsxAttribute(node.parent)) replacement = `{${replacement}}`;
        } else {
          const escaped = text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
          if (ts.isTemplateHead(node)) replacement = "`" + escaped + "${";
          else if (ts.isTemplateMiddle(node)) replacement = "}" + escaped + "${";
          else if (ts.isTemplateTail(node)) replacement = "}" + escaped + "`";
          else replacement = "`" + escaped + "`";
        }
        edits.push({ start: node.getStart(file), end: node.end, replacement });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (missing.size) {
    throw new Error(`Missing English translations in ${filename}: ${[...missing].join(" | ")}`);
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + edit.replacement + source.slice(edit.end);
  }
  return source;
}

function checkCoverage() {
  const files = [
    ...sourceFiles(path.join(root, "src")),
    ...sourceFiles(path.join(root, "electron")),
  ];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const result = localizeSource(source, file);
    const parsed = ts.createSourceFile(file, result, ts.ScriptTarget.Latest, true);
    if (parsed.parseDiagnostics.length) {
      throw new Error(
        `English source is invalid: ${file}: ${parsed.parseDiagnostics[0].messageText}`,
      );
    }
  }
  console.log(
    `English coverage: ${Object.keys(catalog).length} entries; ${files.length} source files checked.`,
  );
}

module.exports = { localizeSource, sourceFiles, checkCoverage };
if (require.main === module) checkCoverage();
