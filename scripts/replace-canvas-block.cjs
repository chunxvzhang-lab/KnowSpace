/**
 * Replaces a top-level JSX block in CanvasView.tsx with a component call.
 *
 * The R2 split moves large JSX regions (the minimap alone is ~150 lines) into
 * their own components. Doing that with a string replace means reproducing the
 * whole block byte-for-byte, which is exactly the kind of transcription the
 * rest of this split avoids. Instead the block is located by its opening marker
 * and its closing line is found by indentation.
 *
 * Usage:
 *   node scripts/replace-canvas-block.cjs --marker "BOTTOM-RIGHT INTERACTIVE MINIMAP" \
 *        --indent 6 --replacement "<CanvasMinimap ... />" [--write]
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const targetPath = path.join(root, "src", "components", "CanvasView.tsx");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const marker = args.marker;
  const indent = Number(args.indent ?? 6);
  const replacement = args.replacement;

  if (!marker || !replacement) {
    console.error("Required: --marker <text> --replacement <code>");
    process.exit(1);
  }

  const lines = fs.readFileSync(targetPath, "utf8").split(/\r?\n/);

  const startIndex = lines.findIndex((line) => line.includes(marker));
  if (startIndex === -1) {
    console.error(`Marker not found: ${marker}`);
    process.exit(1);
  }

  const pad = " ".repeat(indent);
  // Conditionally rendered blocks end with `)}` rather than a closing tag, so
  // the terminator is configurable.
  const closing = args.closing ? `${pad}${args.closing}` : `${pad}</div>`;

  // The block's own terminator sits at the same indentation as its opener; any
  // nested markup is indented further, so the first exact match is the end.
  const endIndex = lines.findIndex((line, i) => i > startIndex && line === closing);
  if (endIndex === -1) {
    console.error(`No closing '${closing}' found after line ${startIndex + 1}`);
    process.exit(1);
  }

  console.log(`Found block at lines ${startIndex + 1}-${endIndex + 1} (${endIndex - startIndex + 1} lines)`);
  console.log(`First line: ${lines[startIndex].trim().slice(0, 80)}`);
  console.log(`Last line:  ${lines[endIndex].trim().slice(0, 80)}`);

  // Report what is being removed so a wrong boundary is obvious before writing
  const removedNonBlank = lines
    .slice(startIndex, endIndex + 1)
    .filter((l) => l.trim() !== "").length;
  console.log(`Non-blank lines removed: ${removedNonBlank}`);

  if (!args.write) {
    console.log("\n(dry run — pass --write to apply)");
    return;
  }

  // A literal \n in the argument becomes a real newline, and the pad is applied
  // to every line so the generated JSX keeps the surrounding indentation.
  const replacementLines = String(replacement)
    .split("\\n")
    .map((line) => `${pad}${line}`);

  const next = [
    ...lines.slice(0, startIndex),
    ...replacementLines,
    ...lines.slice(endIndex + 1),
  ];

  fs.writeFileSync(targetPath, next.join("\n"), "utf8");
  console.log(
    `\nReplaced. File is now ${next.length} lines (was ${lines.length}, ${lines.length - next.length} fewer).`
  );
}

main();
