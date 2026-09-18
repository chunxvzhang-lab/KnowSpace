/**
 * Splices the session's status into docs/MINDMAP_XMIND_PLAN.md.
 *
 * The section itself lives in `docs/mindmap-progress.section.md` and is read
 * from there rather than embedded in this file as a template literal. It was
 * embedded, and that cost four runs of this script: markdown is mostly
 * backticks, and inside a template literal every one of them has to be escaped,
 * so the natural thing to write is the thing that breaks it. A string literal is
 * the wrong container for prose. Now the prose is a file, edited as prose, and
 * this script only puts it in place.
 *
 * Idempotent: an existing section is removed first. The removal looks for the
 * heading rather than the exact wording, so retitling the section does not leave
 * a stale copy behind.
 *
 * Usage: node scripts/append-m-progress.cjs
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "docs", "MINDMAP_XMIND_PLAN.md");
const sectionPath = path.join(root, "docs", "mindmap-progress.section.md");

/** Any previous progress section, whatever it was titled. */
const ANY_START = "## 执行进展（";
const END = "<!-- end progress -->";

function main() {
  const section = fs.readFileSync(sectionPath, "utf8").replace(/\s+$/, "");

  // Checked rather than trusted: a section file that lost its marker would
  // otherwise leave the next run unable to find and replace it, and the document
  // would grow a second copy every time.
  if (!section.startsWith(ANY_START)) {
    console.error(`FAIL: the section file does not start with ${ANY_START}`);
    process.exit(1);
  }
  if (!section.endsWith(END)) {
    console.error(`FAIL: the section file does not end with ${END}`);
    process.exit(1);
  }

  let doc = fs.readFileSync(target, "utf8");

  const start = doc.indexOf(ANY_START);
  if (start !== -1) {
    const end = doc.indexOf(END, start);
    if (end === -1) {
      console.error("FAIL: found the section start but not its end marker");
      process.exit(1);
    }
    doc = doc.slice(0, start) + doc.slice(end + END.length + 1);
    console.log("removed the previous section");
  }

  const trimmed = doc.replace(/\s+$/, "");
  fs.writeFileSync(target, `${trimmed}\n\n${section}\n`);
  console.log(`appended ${section.split("\n").length} lines to docs/MINDMAP_XMIND_PLAN.md`);
}

main();
