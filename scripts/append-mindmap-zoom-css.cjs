/**
 * Appends the mind map zoom control styles to src/styles.css.
 *
 * Same reasoning as the review-focus appender: styles.css is a quarter of a
 * megabyte, and rewriting it through a text editor risks touching unrelated
 * rules. Appending is idempotent — the block is removed first if present.
 *
 * Usage: node scripts/append-mindmap-zoom-css.cjs
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "src", "styles.css");

const START = "/* ── Mind map zoom controls ";
const END = "/* ── End mind map zoom controls ── */";

const BLOCK = `${START}──────────────────────────────────────────────────
   The zoom readout doubles as the fit-to-screen button, so it is a button
   rather than a span. It keeps the toolbar's muted colour by default and only
   picks up the accent on hover, to avoid competing with the primary actions
   beside it.
   ─────────────────────────────────────────────────────────────────────────── */

.mindmap-zoom-group {
  align-items: center;
  gap: 2px;
}

.mindmap-zoom-value {
  min-width: 44px;
  padding: 2px 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.mindmap-zoom-value:hover {
  background: rgba(56, 189, 248, 0.14);
  color: #38bdf8;
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
