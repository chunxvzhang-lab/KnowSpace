/**
 * Prints the declaration form of the given handlers/state in CanvasView.tsx.
 *
 * Used when extracting a JSX branch: the generated component needs prop types
 * that match the parent exactly, and guessing them produces a trail of
 * "Expected N arguments, but got M" errors. This dumps the real signature.
 *
 * Usage: node scripts/dump-handler-signatures.cjs <name> [<name> ...]
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "src", "components", "CanvasView.tsx");

function main() {
  const names = process.argv.slice(2);
  if (names.length === 0) {
    console.error("Usage: node scripts/dump-handler-signatures.cjs <name> [<name> ...]");
    process.exit(1);
  }

  const lines = fs.readFileSync(target, "utf8").split(/\r?\n/);

  for (const name of names) {
    // Find `const name = useCallback(` / `const name = (` / `function name(` /
    // `const [name, setName] = useState<…>(`
    const patterns = [
      new RegExp(`^\\s*const \\[${name},`),
      new RegExp(`^\\s*const ${name} = useCallback\\(`),
      new RegExp(`^\\s*const ${name} = `),
      new RegExp(`^\\s*(export )?function ${name}\\(`),
      new RegExp(`^\\s*const ${name}: `),
    ];

    const index = lines.findIndex((line) => patterns.some((re) => re.test(line)));
    if (index === -1) {
      console.log(`${name}: NOT FOUND\n`);
      continue;
    }

    // Print the declaration plus up to 6 following lines, which is enough to
    // capture the parameter list of a useCallback even when it is wrapped.
    const chunk = lines.slice(index, index + 7).join("\n").trimEnd();
    console.log(`${name}  (line ${index + 1}):`);
    console.log(chunk);
    console.log("");
  }
}

main();
