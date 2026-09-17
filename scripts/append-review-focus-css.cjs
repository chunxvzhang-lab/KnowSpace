/**
 * Appends the flashcard review focus rules to src/styles.css.
 *
 * A script rather than a hand edit because styles.css is a quarter of a
 * megabyte and rewriting it through a text editor risks touching unrelated
 * rules. Appending is idempotent: the block is removed first if it is already
 * there, so running this twice does not duplicate it.
 *
 * Usage: node scripts/append-review-focus-css.cjs
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "src", "styles.css");

const START = "/* ── Flashcard review focus ";
const END = "/* ── End flashcard review focus ── */";

const BLOCK = `${START}───────────────────────────────────────────────
   The review view lives in the side panel, which is a fixed 260px by default —
   far too narrow for a flashcard. While it is open the reader is collapsed and
   the side panel grows into the space it vacates.

   display:none rather than unmounting, deliberately: the document keeps its
   scroll position, its CodeMirror state and its selection, so returning from a
   review session finds the page exactly as it was left. The shell sets
   .is-review-focus while the Space panel is showing its review tab.
   ─────────────────────────────────────────────────────────────────────────── */

.app-shell.is-review-focus .reader-frame {
  display: none;
}

.app-shell.is-review-focus .side-panel {
  /* The panel's width and flex come from an inline style, so they can only be
     overridden with !important — a more specific selector cannot beat inline. */
  width: auto !important;
  flex: 1 1 auto !important;
  max-width: none;
}

${END}
`;

function main() {
  let css = fs.readFileSync(target, "utf8");

  const start = css.indexOf(START);
  if (start !== -1) {
    const end = css.indexOf(END, start);
    if (end === -1) {
      console.error("FAIL: found the start of the block but not its end marker");
      process.exit(1);
    }
    css = css.slice(0, start) + css.slice(end + END.length + 1);
    console.log("removed the previous block");
  }

  const trimmed = css.endsWith("\n") ? css : `${css}\n`;
  fs.writeFileSync(target, `${trimmed}\n${BLOCK}`);
  console.log(`appended ${BLOCK.split("\n").length} lines to src/styles.css`);
  console.log(`file is now ${fs.statSync(target).size} bytes`);
}

main();
