/**
 * Moves the node style panel out of MindmapView into its own component.
 *
 * 344 lines of JSX, the largest block left in a 2540-line file. It is moved by
 * line range rather than retyped, and the identifiers it reached for become
 * props by substitution — the body is otherwise untouched, so the diff is the
 * boundary and the names.
 *
 * What makes this safe to do at all is the smoke test added first:
 * mindmap-node-style-menu.test.tsx opens the panel, changes a background colour
 * and a shape, syncs, and reads the style comment that reaches the markdown. The
 * panel had no coverage before it, and this script refuses to make the two
 * regions overlap or to leave a name it did not substitute, so a mistake fails
 * here rather than in front of a reader.
 *
 * The five preset tables move with it. Each is declared at the top of the file
 * and used only inside the panel, which the script checks rather than assumes.
 *
 * Usage: node scripts/extract-node-style-menu.cjs [--write]
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const viewPath = path.join(root, "src", "components", "MindmapView.tsx");
const menuPath = path.join(root, "src", "components", "MindmapNodeStyleMenu.tsx");

/** The panel, as an expression inside MindmapView's return. */
const REGION_START = "      {/* Right Click Appearance & Typography Customization Context Menu */}";
const REGION_END = "      )}";
/** After the panel: the container's own closing tags, which stay. */
const AFTER_REGION = "    </div>";

/** The tables the panel reads, and nothing else. */
/**
 * Every table the panel reads.
 *
 * The list was five long the first time and the panel wanted eight: the border,
 * text and line colour palettes are separate tables from the background one, and
 * a hand-written list of what a 344-line panel uses is a guess. tsc found it.
 */
const PRESETS = [
  "PRESET_COLORS",
  "PRESET_BORDER_COLORS",
  "PRESET_TEXT_COLORS",
  "PRESET_LINE_COLORS",
  "PRESET_FONT_SIZES",
  "PRESET_SHAPES",
  "PRESET_ALIGNMENTS",
  "PRESET_LINE_STYLES",
];

/** Identifier renames: the panel's closures become its props. */
const RENAMES = [
  ["contextMenu.nodeId", "nodeId"],
  ["contextTargetNode", "target"],
  ["menuPos", "position"],
  ["setContextMenu(null)", "onClose()"],
  ["handleUpdateStyle", "onUpdateStyle"],
  ["handleDeleteNode", "onDelete"],
  ["handleAddChild", "onAddChild"],
  ["handleAddSibling", "onAddSibling"],
  ["startEditing", "onStartRename"],
  ["selectedNodeIds.size", "selectedCount"],
];

/** Names that must be gone once the substitutions have run. */
const MUST_BE_GONE = [
  "contextMenu",
  "contextTargetNode",
  "menuPos",
  "setContextMenu",
  "handleUpdateStyle",
  "handleDeleteNode",
  "handleAddChild",
  "handleAddSibling",
  "startEditing",
  "selectedNodeIds",
];

/**
 * The icons the moved markup actually uses.
 *
 * Read off MindmapView's own lucide import rather than listed here, because a
 * hand-written list is wrong in both directions: an icon the panel uses and the
 * list omits is a compile error, and one the list adds and the panel does not
 * use is dead code the file carries until somebody notices.
 */
function usedIcons(lines, bodyEnd, body) {
  const end = lines.findIndex((line, i) => i < bodyEnd && line === '} from "lucide-react";');
  if (end === -1) {
    console.error("FAIL: could not find the lucide import");
    process.exit(1);
  }
  const start = (() => {
    for (let i = end; i >= 0; i -= 1) if (lines[i].startsWith("import {")) return i;
    console.error("FAIL: could not find the start of the lucide import");
    process.exit(1);
  })();

  const names = lines
    .slice(start + 1, end)
    .map((line) => line.replace(/[,\s]/g, ""))
    .filter(Boolean);

  return names.filter((name) => new RegExp(`\\b${name}\\b`).test(body));
}

/** Module level: the imports and the two types. */
const prelude = (icons) => `import type { RefObject } from "react";
import {
${icons.map((name) => `  ${name},`).join("\n")}
} from "lucide-react";
import type {
  MindmapLineStyle,
  MindmapNode,
  MindmapNodeShape,
  MindmapTextAlign,
} from "../core/types";

/**
 * The node style panel: what a right click on a node opens.
 *
 * Split out of MindmapView, which was 2540 lines with this and nothing else of
 * its size left in it. Nothing about it changed in the move: the markup, the
 * class names and the preset tables are the same, so the stylesheet and the
 * tests that look for them keep working.
 *
 * Holds no state. Every control writes through \`onUpdateStyle\` to the node the
 * caller names, and what the panel shows as active comes from that node's own
 * styles rather than from a copy kept here — a second copy is how the panel ends
 * up disagreeing with the map it is describing.
 */
export type MindmapNodeStyleMenuProps = {
  open: boolean;
  /** Where the panel sits, in the canvas container's coordinates. */
  position: { left: number; top: number };
  menuRef: RefObject<HTMLDivElement | null>;
  /** The node every control writes to. */
  nodeId: string;
  /** That node, whose own styles decide which swatch and pill read as active. */
  target: MindmapNode | null;
  /** True when several nodes are selected, which some labels and actions reflect. */
  isBatchMode: boolean;
  selectedCount: number;
  onUpdateStyle: (nodeId: string, styles: NodeStylePatch) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId?: string) => void;
  onAddSibling: (targetId?: string) => void;
  onStartRename: (nodeId: string) => void;
  onClose: () => void;
};

/** The fields a node's style can be set to; mirrors the service's patch shape. */
type NodeStylePatch = {
  color?: string;
  shape?: MindmapNodeShape;
  lineColor?: string;
  lineStyle?: MindmapLineStyle;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  textColor?: string;
  borderColor?: string;
  textAlign?: MindmapTextAlign;
  customWidth?: number;
  customHeight?: number;
};
`;

// The presets are assembled between the types and the function, which is why the
// prelude and the signature are two templates rather than one. The first run put
// the tables inside the return statement and the file did not parse.
const SIGNATURE = `export function MindmapNodeStyleMenu({
  open,
  position,
  menuRef,
  nodeId,
  target,
  isBatchMode,
  selectedCount,
  onUpdateStyle,
  onDelete,
  onAddChild,
  onAddSibling,
  onStartRename,
  onClose,
}: MindmapNodeStyleMenuProps) {
  if (!open) return null;

  return (
`;

const FOOTER = `  );
}
`;

function indexOfLine(lines, marker, from = 0, what = "marker") {
  const index = lines.findIndex((line, i) => i >= from && line === marker);
  if (index === -1) {
    console.error(`FAIL: could not find ${what} (searched from line ${from + 1})`);
    process.exit(1);
  }
  return index;
}

/**
 * A \`const NAME = [...];\` block at module level, taken whole.
 *
 * The declaration line is located by prefix and its \`= [\` rather than by the
 * exact text, because three of the five carry a type annotation — and one of
 * those annotations names an icon, which the import list below has to see.
 */
function takePreset(lines, name, alreadyTaken) {
  const start = lines.findIndex(
    (line) => line.startsWith(`const ${name}`) && line.trimEnd().endsWith("= [")
  );
  if (start === -1) {
    console.error(`FAIL: could not find the declaration of ${name}`);
    process.exit(1);
  }
  const end = indexOfLine(lines, "];", start, `the end of ${name}`);

  const inside = [];
  for (let i = start + 1; i <= end; i += 1) inside.push(lines[i]);
  const uses = lines.filter((line) => line.includes(name)).length;
  if (uses !== 2) {
    console.error(`FAIL: ${name} is used ${uses} times, not once outside its declaration`);
    process.exit(1);
  }
  if (alreadyTaken.some((range) => start <= range.end && end >= range.start)) {
    console.error(`FAIL: ${name} overlaps another table`);
    process.exit(1);
  }
  alreadyTaken.push({ start, end });
  // The declaration line travels as it is, annotation and all. An earlier
  // version wrote `const NAME = [` and dropped the type three of the tables
  // carry, which turned their values into `string` and broke every control that
  // assigns one to a narrower field — the compiler caught it, and the fix is not
  // to restate the annotation here but to move the line itself.
  return { declaration: lines[start], body: inside };
}

function main() {
  const write = process.argv.includes("--write");
  const lines = fs.readFileSync(viewPath, "utf8").split(/\r?\n/);

  // ── The panel ─────────────────────────────────────────────────────────────
  const start = indexOfLine(lines, REGION_START, 0, "the start of the panel");
  const end = indexOfLine(lines, REGION_END, start, "the end of the panel");
  if (lines[end + 1] !== AFTER_REGION) {
    console.error(`FAIL: the line after the panel is ${JSON.stringify(lines[end + 1])}`);
    process.exit(1);
  }

  // start + 1 is the wrapper the component replaces with `if (!open) return null`,
  // so the body begins at the element itself.
  const wrapper = lines[start + 1];
  if (!wrapper.includes("{contextMenu &&")) {
    console.error(`FAIL: the line after the comment is not the panel's condition: ${wrapper}`);
    process.exit(1);
  }
  const body = lines.slice(start + 2, end).map((line) => line.replace(/^ {4}/, ""));
  let moved = body.join("\n");
  const substitutions = [];
  for (const [from, to] of RENAMES) {
    const before = moved.split(from).length - 1;
    if (before === 0) continue;
    moved = moved.split(from).join(to);
    substitutions.push(`${from} -> ${to} (${before})`);
  }
  for (const name of MUST_BE_GONE) {
    if (moved.includes(name)) {
      console.error(`FAIL: ${name} survived the substitutions`);
      process.exit(1);
    }
  }

  // ── The preset tables ─────────────────────────────────────────────────────
  const taken = [];
  const presets = PRESETS.map((name) => ({ name, ...takePreset(lines, name, taken) }));

  // The tables count too: one of them types its icon field as `typeof AlignCenter`,
  // so the name has to be imported even though the markup only maps over it.
  const icons = usedIcons(
    lines,
    start,
    [...presets.flatMap((preset) => [preset.declaration, ...preset.body]), moved].join("\n")
  );
  const component = [
    prelude(icons),
    ...presets.flatMap((preset) => [preset.declaration, ...preset.body, ""]),
    SIGNATURE,
    moved,
    FOOTER,
  ].join("\n");

  // ── What MindmapView keeps ────────────────────────────────────────────────
  const drop = new Set();
  for (const { start: from, end: to } of taken) {
    for (let i = from; i <= to; i += 1) drop.add(i);
  }

  const call = [
    "      {/* Right Click Appearance & Typography Customization Context Menu */}",
    "      <MindmapNodeStyleMenu",
    "        open={!!contextMenu && !contextMenu.isCanvas}",
    "        position={menuPos}",
    "        menuRef={menuRef}",
    "        nodeId={contextMenu?.nodeId ?? tree.id}",
    "        target={contextTargetNode}",
    "        isBatchMode={isBatchMode}",
    "        selectedCount={selectedNodeIds.size}",
    "        onUpdateStyle={handleUpdateStyle}",
    "        onDelete={handleDeleteNode}",
    "        onAddChild={handleAddChild}",
    "        onAddSibling={handleAddSibling}",
    "        onStartRename={startEditing}",
    "        onClose={() => setContextMenu(null)}",
    "      />",
  ];

  const next = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (i === start) {
      next.push(...call);
      continue;
    }
    if (i >= start && i <= end) continue; // the rest of the panel
    if (drop.has(i)) continue; // the tables that moved
    next.push(lines[i]);
  }

  const importLine = 'import { MindmapNodeStyleMenu } from "./MindmapNodeStyleMenu";';
  const anchor = next.findIndex((line) => line.startsWith("import { MindmapInlineEditor }"));
  if (anchor === -1) {
    console.error("FAIL: could not find where the component imports are");
    process.exit(1);
  }
  next.splice(anchor, 0, importLine);

  console.log(`panel:      lines ${start + 1}-${end + 1} (${end - start} lines)`);
  console.log(`icons:      ${icons.join(", ")}`);
  console.log(`presets:    ${presets.map((p) => `${p.name} (${p.body.length + 2})`).join(", ")}`);
  console.log(`renames:    ${substitutions.join(", ")}`);
  console.log(`MindmapView: ${lines.length} -> ${next.length} lines`);
  console.log(`MindmapNodeStyleMenu.tsx: ${component.split("\n").length} lines`);

  if (!write) {
    console.log("\n--- dry run, nothing written ---");
    return;
  }

  fs.writeFileSync(menuPath, component);
  fs.writeFileSync(viewPath, next.join("\n"));
  console.log(`\nwrote ${path.relative(root, menuPath)}`);
  console.log(`rewrote ${path.relative(root, viewPath)}`);
}

main();
