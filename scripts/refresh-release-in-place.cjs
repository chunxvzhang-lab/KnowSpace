// Refreshes the release artifacts in place, without deleting anything.
//
// Why this exists: three `.asar` files under `release/` are held open by a handle
// that permits writes but not deletion. `electron-builder` therefore cannot clear
// `release/win-unpacked` — it fails with `EBUSY ... unlink app.asar` — and worse,
// it wipes the directory *before* failing, which is how `release/win-unpacked`
// ended up with 2 files instead of 77. The files are perfectly writable, though,
// so new contents can be written over the old ones; no unlink is required.
//
// The fresh build comes from `release-next/`, produced by electron-builder with
// `--config.directories.output=release-next` so it never touched the locked paths.
//
// Run after that build, then run `package-desktop.cjs --skip-builder` to refresh
// the portable directory and re-zip (its prune step warns about the locked files
// and carries on, which is fine — their contents are already correct).
//
// Usage: node scripts/refresh-release-in-place.cjs
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const fresh = path.join(root, "release-next");
const freshUnpacked = path.join(fresh, "win-unpacked");
const liveUnpacked = path.join(root, "release", "win-unpacked");

if (!fs.existsSync(freshUnpacked)) {
  console.error(`找不到 ${path.relative(root, freshUnpacked)}，先跑一次 release-next 构建。`);
  process.exit(1);
}

/** The files that are locked: written in place, never copied over by name. */
const LOCKED = new Set(["resources\\app.asar", "resources\\default_app.asar"]);

let copied = 0;
let skipped = 0;

function sync(fromDir, toDir, prefix = "") {
  fs.mkdirSync(toDir, { recursive: true });
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const from = path.join(fromDir, entry.name);
    const to = path.join(toDir, entry.name);
    const relative = prefix ? `${prefix}\\${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      sync(from, to, relative);
      continue;
    }
    if (LOCKED.has(relative)) {
      skipped += 1;
      continue;
    }
    // Overwriting is a write, which the lock allows. Missing files are created.
    fs.copyFileSync(from, to);
    copied += 1;
  }
}

sync(freshUnpacked, liveUnpacked);
console.log(`win-unpacked: 复制 ${copied} 个文件，跳过 ${skipped} 个被锁的 asar`);

// The installers live in `release/` root and are not locked.
for (const name of fs.readdirSync(fresh)) {
  if (!/\.(msi|exe)$/i.test(name)) continue;
  const from = path.join(fresh, name);
  if (!fs.statSync(from).isFile()) continue;
  fs.copyFileSync(from, path.join(root, "release", name));
  console.log(`安装包: ${name}  ${fs.statSync(from).size} 字节`);
}

// The locked asars still have to carry the new build.
const freshAsar = fs.readFileSync(path.join(freshUnpacked, "resources", "app.asar"));
for (const target of [
  path.join(liveUnpacked, "resources", "app.asar"),
  path.join(root, "release", "KnowSpace-win-x64", "resources", "app.asar"),
]) {
  if (!fs.existsSync(target)) continue;
  fs.writeFileSync(target, freshAsar);
  const ok = fs.statSync(target).size === freshAsar.length;
  console.log(`  ${ok ? "✅" : "❌"} ${path.relative(root, target)}  ${freshAsar.length} 字节`);
}
