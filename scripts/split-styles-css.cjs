// Phase B splitter: moves domain blocks out of src/styles.css with a
// brace-balanced slicer. The DOMAINS list below is the batch that has NOT run
// yet — once it has, the ranges are history (the executed roster lives in
// `git log` and in docs/QUALITY_BASELINE.md's 看板, not restated here, because a
// re-listed roster is one batch out of date immediately). Re-derive the next
// batch with `--sections`; the shrunk file's old line numbers are gone.
//
// Why a script instead of hand-editing 13k lines: slice points are top-level
// block boundaries; a human moving blocks would clip rules. The script
// verifies (a) every line lands in exactly one output, (b) each output's
// braces balance, and (c) the domain ranges form a CONTIGUOUS PREFIX whose
// concatenation (slices + reduced styles.css) reassembles the original
// byte-for-byte — proof that no rule was lost, duplicated, or reordered.
// Run with --dry to only verify.
//
// BATCH USAGE (the ranges below are B2's, already executed): DOMAINS line
// numbers are relative to the CURRENT src/styles.css, so each new batch must
// re-derive its boundaries from the shrunken file AND use new file names —
// writing into an existing slice would replace that domain's CSS instead of
// moving a new one out. The existing-file check below refuses a blind re-run.
const fs = require("fs");
const path = require("path");

const SRC = "src/styles.css";
const OUT_DIR = "src/styles";
const DRY = process.argv.includes("--dry");

const text = fs.readFileSync(SRC, "utf8");
const nl = text.includes("\r\n") ? "\r\n" : "\n";
const lines = text.split(/\r?\n/);

// --- --sections: print the domain map of what is STILL in styles.css --------
// The next batch's DOMAINS ranges have to be re-derived from the shrunk file
// anyway (line numbers move every batch, and stale ranges are how a split
// clips a rule). This turns that counting into a command instead of a scratch
// file: `node scripts/split-styles-css.cjs --sections`.
if (process.argv.includes("--sections")) {
  const marks = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\/\* =+\s*$/.test(lines[i]) && /^\s*\/?\s*\S/.test(lines[i + 1] ?? "")) {
      const title = (lines[i + 1] || "")
        .replace(/^\s+/, "")
        .replace(/\s*\u2550.*$/, "")
        .trim();
      marks.push({ from: i + 1, title });
    }
  }
  for (let k = 0; k < marks.length; k++) {
    const to = (k + 1 < marks.length ? marks[k + 1].from - 1 : lines.length) - 1;
    console.log(
      `${String(marks[k].from).padStart(6)}-${String(to).padStart(6)}  ${marks[k].title}`,
    );
  }
  console.log(`(styles.css now has ${lines.length} lines; only a CONTIGUOUS PREFIX may move out)`);
  process.exit(0);
}

// --- locate top-level block boundaries -------------------------------------
// Strips comments first (for brace tracking only; line ranges still refer to
// the original file). CSS here has no strings containing braces.
function stripComments(srcLines) {
  const joined = srcLines.join("\n");
  let out = "";
  let inBlock = false;
  for (let i = 0; i < joined.length; i++) {
    if (inBlock) {
      if (joined[i] === "*" && joined[i + 1] === "/") {
        inBlock = false;
        i++;
        out += "  ";
      } else out += joined[i] === "\n" ? joined[i] : " ";
    } else if (joined[i] === "/" && joined[i + 1] === "*") {
      inBlock = true;
      i++;
      out += "  ";
    } else out += joined[i];
  }
  return out.split("\n");
}

function scanBlocks(srcLines) {
  const code = stripComments(srcLines);
  const blocks = []; // {start,end} 0-based inclusive over ORIGINAL lines
  let i = 0;
  const n = code.length;
  while (i < n) {
    const t = code[i].trim();
    if (t === "") {
      i++;
      continue;
    }
    const start = i;
    let depth = 0;
    let seen = false;
    while (i < n) {
      for (const ch of code[i]) {
        if (ch === "{") {
          depth++;
          seen = true;
        } else if (ch === "}") depth--;
      }
      if ((seen && depth <= 0) || (!seen && /;\s*$/.test(code[i]))) {
        i++;
        break;
      }
      i++;
    }
    blocks.push({ start, end: i - 1 });
  }
  return blocks;
}

const blocks = scanBlocks(lines);

// --- domain ranges (1-based inclusive) --------------------------------------
// Only a CONTIGUOUS PREFIX of styles.css may move out without disturbing the
// cascade: every rule claimed here sits BEFORE every rule left in styles.css,
// and main.tsx imports the slices in exactly that physical order. A domain
// from the middle of the file (dialogs at ~3067) cannot join this batch —
// moving it would place some theme overrides before rules that used to follow
// them, and "same specificity, later wins" is precisely how the light/eink
// overrides work in this file. Mid-file domains need a segmented split, to be
// done in a later batch with a cascade-order proof.
const DOMAINS = [
  { file: "capsule.css", label: "闪念胶囊浮窗与快捷键自定义", from: 1, to: 869 },
  {
    file: "capsule-panel.css",
    label: "闪念胶囊增强：标签页、钉住、Space 目录与持久笔记",
    from: 870,
    to: 1483,
  },
];

// Refuse a blind re-run of an executed batch: DOMAINS' line numbers are
// relative to the styles.css of THAT batch, and writing into an existing slice
// would replace that domain's CSS with different rules - a silent cascade
// reorder, which is exactly what this script exists to make impossible.
for (const d of DOMAINS) {
  if (fs.existsSync(path.join(OUT_DIR, d.file))) {
    throw new Error(
      `${OUT_DIR}/${d.file} already exists - this batch has run. For the next batch,` +
        ` re-derive DOMAINS from the CURRENT (shrunk) src/styles.css and pick new file names.`,
    );
  }
}

// Validate: every claimed line must belong to a top-level block whose FULL
// range is inside one domain — no rule may straddle a domain edge.
const ownerOf = (line1) => DOMAINS.find((d) => line1 >= d.from && line1 <= d.to);
for (const b of blocks) {
  const s = b.start + 1;
  const e = b.end + 1; // inclusive, 1-based
  const o = ownerOf(s);
  if (!o) continue; // unclaimed stays in styles.css
  if (e > o.to) throw new Error(`${o.file}: block ${s}-${e} crosses its end edge ${o.to}`);
}
// Domain start must itself be a block start or blank/comment gap: assert the
// first claimed line of each domain begins a block (banners/comments are fine).
for (const d of DOMAINS) {
  const startsBlock = blocks.some((b) => b.start + 1 === d.from);
  const isGapLine = !blocks.some((b) => b.start + 1 < d.from && b.end + 1 >= d.from);
  if (!startsBlock && !isGapLine)
    throw new Error(`${d.file}: start ${d.from} lands inside another block`);
}

// Claim lines: domains must be disjoint.
const claimed = new Map(); // line -> file
for (const d of DOMAINS) {
  for (let l = d.from; l <= d.to; l++) {
    if (claimed.has(l))
      throw new Error(`line ${l} claimed by both ${claimed.get(l)} and ${d.file}`);
    claimed.set(l, d.file);
  }
}

// --- assemble outputs --------------------------------------------------------
/**
 * The bytes of one slice: banner, one blank line, then the claimed lines with
 * their leading/trailing blank lines dropped. A domain's `to` is the last rule
 * line + the separator blank that followed it, and `kept` starts on that same
 * kind of blank - so without trimming, every slice ends with a blank line and
 * the shrunk monolith starts with one, which `npm run format:check` rejects
 * (B2 shipped exactly that and needed a separate prettier pass).
 *
 * Blank lines carry no rules, so trimming cannot change the cascade. It also
 * cannot break the proof: the reassembly check below runs against the untouched
 * line lists, before any trimming happens.
 */
const sliceText = (label, bodyLines) => {
  const body = bodyLines.slice();
  while (body.length && /^[ \t]*$/.test(body[0])) body.shift();
  while (body.length && /^[ \t]*$/.test(body[body.length - 1])) body.pop();
  const header = [
    `/* ========================================================================`,
    `   KnowSpace · ${label}`,
    `   从 src/styles.css 按域拆分而来（阶段 B）。加载顺序由 src/main.tsx 决定，`,
    `   必须与拆分前 styles.css 内的物理顺序一致 —— 改顺序等于改级联。`,
    `   ======================================================================== */`,
    ``,
  ].join(nl);
  return header + body.join(nl) + nl;
};

const outs = new Map(); // file -> ascending line numbers
for (const d of DOMAINS) outs.set(d.file, []);
for (let l = 1; l <= lines.length; l++) {
  const f = claimed.get(l);
  if (f) outs.get(f).push(l);
}

// Verify each output's braces balance on its own (comments stripped via naive
// but safe check: count braces outside comment markers is unnecessary because
// CSS comments cannot contain unbalanced braces that matter — but our ranges
// end at block ends, so balance holds by construction; assert anyway).
for (const d of DOMAINS) {
  const bodyLines = outs.get(d.file).map((l) => lines[l - 1]);
  let depth = 0;
  for (const s of bodyLines)
    for (const ch of s)
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
  if (depth !== 0) throw new Error(`${d.file}: brace imbalance ${depth}`);
}

// Reassembly proof. The domains form a contiguous prefix, so
//   slice1 + slice2 + ... + reducedStyles  must equal the original exactly.
// This catches lost, duplicated or reordered lines before anything is written.
const totalClaimed = [...outs.values()].reduce((a, v) => a + v.length, 0);
const prefixCovered = DOMAINS.every((d, i) =>
  i === 0 ? d.from === 1 : d.from === DOMAINS[i - 1].to + 1,
);
if (!prefixCovered)
  throw new Error("domains are not a contiguous prefix - refusing to write (cascade safety)");
const kept = [];
for (let l = 1; l <= lines.length; l++) if (!claimed.has(l)) kept.push(lines[l - 1]);
const reassembled = DOMAINS.flatMap((d) => outs.get(d.file).map((l) => lines[l - 1]))
  .concat(kept)
  .join(nl);
if (reassembled !== text) throw new Error("reassembly mismatch - refusing to write");
console.log(`reassembled byte-for-byte from ${totalClaimed} claimed + ${kept.length} kept lines`);

if (DRY) {
  for (const d of DOMAINS)
    console.log(`  ${d.file}: ${outs.get(d.file).length} lines (${d.from}-${d.to})`);
  console.log("dry run OK — nothing written");
  process.exit(0);
}

// --- write -------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const d of DOMAINS) {
  const bodyLines = outs.get(d.file).map((l) => lines[l - 1]);
  fs.writeFileSync(path.join(OUT_DIR, d.file), sliceText(d.label, bodyLines), "utf8");
  console.log(`wrote ${OUT_DIR}/${d.file}`);
}

// Rewrite styles.css WITHOUT the claimed lines. `kept` starts at the first
// unclaimed line - the blank that used to separate two domains - so drop the
// leading blanks here and the shrunk monolith comes out of the splitter already
// format-clean. (Blank lines carry no rules, so this cannot change the cascade;
// the reassembly proof above ran against the untouched `kept`.)
let writeKept = kept.slice();
while (writeKept.length && /^[ \t]*$/.test(writeKept[0])) writeKept.shift();
fs.writeFileSync(SRC, writeKept.join(nl), "utf8");
console.log(`styles.css reduced to ${writeKept.length} lines`);
