/**
 * Appends the theme and layout picker styles to src/styles.css.
 *
 * Both controls are native <select> elements, which was a deliberate choice —
 * a handful of options, no previews, and the keyboard and accessibility
 * behaviour comes for free. What it does not come with is the toolbar's look, so
 * this is only enough to make them belong: `appearance: none` removes the OS
 * chrome, and the rest matches the neighbouring buttons.
 *
 * One block for both, since the layout picker was added directly beside the
 * theme picker and they are the same kind of control. Two blocks would be two
 * copies of the same chevron, and the second one would be forgotten the first
 * time the first was adjusted.
 *
 * The file name still says "theme" because that is what it started as.
 *
 * Idempotent: the block is removed first if present.
 *
 * Usage: node scripts/append-theme-picker-css.cjs
 */

const fs = require("node:fs");
const path = require("node:path");

const target = path.resolve(__dirname, "..", "src", "styles.css");

const START = "/* ── Mind map theme and layout pickers ";
const END = "/* ── End mind map theme and layout pickers ── */";

const BLOCK = `${START}──────────────────────────────────
   Two native selects dressed to match the toolbar buttons beside them. They
   share one set of rules on purpose: they sit next to each other, they are
   the same kind of control, and two copies of a chevron drift apart the first
   time one of them is adjusted.
   ─────────────────────────────────────────────────────────────────────────── */

.mindmap-theme-group,
.mindmap-layout-group {
  align-items: center;
  gap: 6px;
  padding: 0 8px;
}

.mindmap-theme-select,
.mindmap-layout-select {
  appearance: none;
  -webkit-appearance: none;
  padding: 4px 20px 4px 8px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 6px;
  background-color: transparent;
  /* The chevron is drawn rather than taken from the OS, since appearance: none
     removes it. Kept inline so the rule needs no asset. */
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%),
    linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: right 11px center, right 7px center;
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
  color: var(--text-primary, #e2e8f0);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.mindmap-theme-select:hover,
.mindmap-layout-select:hover {
  border-color: rgba(56, 189, 248, 0.55);
}

.mindmap-theme-select:focus-visible,
.mindmap-layout-select:focus-visible {
  outline: 2px solid #38bdf8;
  outline-offset: 1px;
}

/* The dropdown list itself is drawn by the OS; on some platforms the options
   inherit the closed control's transparent background and become unreadable. */
.mindmap-theme-select option,
.mindmap-layout-select option {
  background: var(--surface-1, #1e293b);
  color: var(--text-primary, #e2e8f0);
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

  // Exactly one blank line between the previous rule and this block, whether or
  // not a previous copy was just removed — the previous version appended to
  // whatever trailing newlines were already there, so re-running it added a
  // blank line each time.
  const trimmed = css.replace(/\s+$/, "");
  fs.writeFileSync(target, `${trimmed}\n\n${BLOCK}`);
  console.log(`appended ${BLOCK.split("\n").length} lines to src/styles.css`);
}

main();
