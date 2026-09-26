// Confirms the new feature is in the artifact that actually ships, not just in
// the source tree.
//
// `@electron/asar` addresses entries with BACKSLASHES on Windows, and
// `listPackage()` returns them with a LEADING separator (`\dist\assets\…`) that
// `extractFile()` does not accept. Both have to be normalised: strip the leading
// separator, then convert the rest to backslashes. Passing a forward slash
// reports `"…" was not found in this archive`, which reads as a missing file
// rather than a path-format problem.
//
// Run from the repo root:  node scripts/verify-shipped-feature.cjs
const asar = require("@electron/asar");
const path = require("node:path");

const archive = path.join("release", "win-unpacked", "resources", "app.asar");
const entries = asar.listPackage(archive).map((entry) => entry.replace(/\\/g, "/"));

/** Reads one entry out of the archive, by a suffix of its path. */
function readEntry(suffix) {
  const hit = entries.find((entry) => entry.endsWith(suffix));
  if (!hit) return null;
  return asar.extractFile(archive, hit.replace(/^[/\\]/, "").replace(/\//g, "\\")).toString("utf8");
}

let ok = true;

const fileChecks = [
  ["主进程：扫描选项", "/electron/markdown-files.cjs", "setScanOptions"],
  ["主进程：隐藏判定", "/electron/markdown-files.cjs", "isHiddenRelativePath"],
  ["主进程：工具目录始终跳过", "/electron/markdown-files.cjs", "ignoredDirectoryNames"],
  ["IPC handler", "/electron/main.cjs", "bookmd:set-scan-options"],
  ["preload 暴露", "/electron/preload.cjs", "setScanOptions"],
];

for (const [label, file, needle] of fileChecks) {
  const text = readEntry(file);
  if (text === null) {
    console.log("❌ 未找到 " + file);
    ok = false;
    continue;
  }
  const found = text.includes(needle);
  console.log((found ? "✅" : "❌") + " " + label + "  (" + needle + ")");
  if (!found) ok = false;
}

// The renderer is bundled, so the markers live in whichever chunk vite emitted.
const bundles = entries.filter((entry) => entry.endsWith(".js") && entry.includes("/dist/assets/"));
const rendererNeedles = [
  "showHiddenFiles",
  "tree-row-name",
  "is-hidden",
  "setScanOptions",
  "显示点开头的文件",
];

for (const needle of rendererNeedles) {
  let found = false;
  for (const bundle of bundles) {
    const text = readEntry(bundle);
    if (text && text.includes(needle)) {
      found = true;
      break;
    }
  }
  console.log((found ? "✅" : "❌") + " 渲染层包含 " + needle);
  if (!found) ok = false;
}

console.log(ok ? "\n✅ 新功能确实打进产物" : "\n❌ 有缺失");
process.exit(ok ? 0 : 1);
