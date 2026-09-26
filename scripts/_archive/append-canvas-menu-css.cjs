/**
 * Appends the canvas context menu styles to src/styles.css.
 *
 * `.mindmap-ctx-item` did not exist: the node menu styles its rows with a
 * different class, so the canvas menu's buttons would have rendered as browser
 * defaults. `.mindmap-marquee` needs nothing — it carries its own fill, stroke
 * and dash through attributes, which is why it can be drawn from the component
 * without a rule.
 *
 * Idempotent: the block is removed first if present.
 *
 * Usage: node scripts/append-canvas-menu-css.cjs
 */

const fs = require("node:fs");
const path = require("node:path");

const target = path.resolve(__dirname, "..", "src", "styles.css");

const START = "/* ── Mind map canvas context menu ";
const END = "/* ── End mind map canvas context menu ── */";

const BLOCK = `${START}─────────────────────────────────────────
   Rows for the menu that opens on empty canvas. It is a different menu from
   the node one — those rows edit one branch's appearance, these act on the
   whole map — so they get their own row style rather than borrowing one whose
   layout assumes a colour swatch beside it.
   ─────────────────────────────────────────────────────────────────────────── */

.mindmap-ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary, #e2e8f0);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease;
}

.mindmap-ctx-item:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.16);
  color: #38bdf8;
}

.mindmap-ctx-item:disabled {
  /* Paste has nothing to offer until something has been copied, and saying so
     by greying it out beats a row that silently does nothing. */
  opacity: 0.42;
  cursor: default;
}

.mindmap-canvas-menu {
  min-width: 172px;
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
}

main();
