#!/usr/bin/env node
/*
 * Release orchestration: node scripts/release.cjs [version] [--skip-preflight]
 *
 * The v2.7.2 -> v2.7.4 releases distilled a fixed sequence that was executed
 * by hand each time, ~40 minutes of babysitting with several places to
 * forget a step (the preload API_VERSION drift was caught by a guard, not by
 * a checklist). This script IS the checklist, in execution order:
 *
 *   1. consistency gate: package.json version vs preload API_VERSION vs the
 *      manual title vs AboutDialog changelog vs the release notes file
 *   2. preflight (two full rounds — the flake-verdict discipline)
 *   3. commit the version files (exactly the six paths, nothing else staged)
 *   4. desktop:pack (electron-builder; ~13 min)
 *   5. artifact verification: MSI magic, zip==dir asar sha256, bundle carries
 *      the version strings, preload handshake version
 *   6. publish_github_release.py (tag + release + three assets)
 *   7. verify-github-release.py with GITHUB_TOKEN from git credential fill
 *   8. push main + tag with retry (this network drops connections routinely)
 *
 * What it deliberately does NOT do: write the changelog. The AboutDialog
 * group, the manual's changelog row and docs/RELEASE_NOTES_v<version>.md are
 * human work — step 1 only checks they exist and mention the version.
 *
 * Every step prints what it does and the script exits non-zero on the first
 * failure, so a re-run resumes visibly rather than blindly.
 */
const { execFileSync, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const root = path.join(__dirname, "..");
const version =
  process.argv[2] || JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const skipPreflight = process.argv.includes("--skip-preflight");
const preflightRounds = skipPreflight ? 0 : 2;

const step = (label) => console.log(`\n=== release[${version}] ${label} ===`);
const die = (msg) => {
  console.error(`\n[release] FAILED: ${msg}`);
  process.exit(1);
};
// On Windows npm/npx are .cmd shims: the bare name ENOENTs without a shell,
// and spawning `.cmd` directly is EINVAL since Node's CVE-2023-32559 fix -
// so they must run through the shell (their args here are all fixed strings,
// never user text; v2.7.5's first live run found both halves of this at the
// pack step).
const NPM_SHELL = process.platform === "win32";
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, stdio: "inherit", ...opts });
const runNpm = (args, opts = {}) =>
  execFileSync("npm", args, { cwd: root, stdio: "inherit", shell: NPM_SHELL, ...opts });

/** GitHub credential from the Windows credential manager (what git itself uses). */
function githubToken() {
  const res = spawnSync("git", ["credential", "fill"], {
    cwd: root,
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
  });
  const line = (res.stdout || "").split("\n").find((l) => l.startsWith("password="));
  return line ? line.slice("password=".length).trim() : "";
}

async function confirm(question) {
  if (process.env.RELEASE_ASSUME_YES === "1") return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(`${question} [y/N] `, resolve));
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

/* ── 1. consistency gate ──────────────────────────────────────────────── */
function consistencyGate() {
  step("1/8 consistency gate");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (pkg.version !== version) {
    die(`package.json version is ${pkg.version}, expected ${version}`);
  }

  const preload = fs.readFileSync(path.join(root, "electron", "preload.cjs"), "utf8");
  if (!preload.includes(`const API_VERSION = "${version}"`)) {
    die(
      `electron/preload.cjs API_VERSION does not match ${version} (the handshake guard would fail anyway)`,
    );
  }

  const notes = path.join(root, "docs", `RELEASE_NOTES_v${version}.md`);
  if (!fs.existsSync(notes)) {
    die(`missing ${notes} — write the release notes first (publish uses it as the body)`);
  }

  const manual = fs.readFileSync(path.join(root, "docs", "USER_MANUAL.md"), "utf8");
  if (!manual.includes(`用户手册（v${version}）`)) {
    die(`docs/USER_MANUAL.md title does not say v${version} — run scripts/bump-doc-version.py`);
  }
  if (!manual.includes(`| v${version} |`)) {
    die(`docs/USER_MANUAL.md has no v${version} changelog row`);
  }

  // The active-era changelog groups live in the AboutChangelogRecent satellite
  // (the ratchet-driven split); fall back to the dialog itself so the gate
  // does not hard-code where the groups live (v2.7.5's first live run found
  // exactly this: the gate pointed at the pre-split location).
  const about =
    fs.readFileSync(path.join(root, "src", "components", "AboutDialog.tsx"), "utf8") +
    fs.readFileSync(
      path.join(root, "src", "components", "about", "AboutChangelogRecent.tsx"),
      "utf8",
    );
  if (!about.includes(`v${version} `)) {
    die(`no v${version} changelog group in AboutDialog/AboutChangelogRecent`);
  }
  console.log("  package.json / preload / release notes / manual / AboutDialog all agree.");
}

/* ── 2. preflight, two rounds ─────────────────────────────────────────── */
function preflight() {
  for (let round = 1; round <= preflightRounds; round += 1) {
    step(`2/8 preflight round ${round}/${preflightRounds}`);
    run("node", ["scripts/preflight.cjs"]);
  }
}

/* ── 3. commit the version files ──────────────────────────────────────── */
const VERSION_FILES = [
  "package.json",
  "docs/USER_MANUAL.md",
  `docs/RELEASE_NOTES_v${version}.md`,
  "src/components/AboutDialog.tsx",
  "electron/preload.cjs",
];

function commitVersionFiles() {
  step("3/8 commit the version files");
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).stdout;
  const dirty = status
    .split("\n")
    .filter(Boolean)
    .map((l) => l.slice(3));
  if (dirty.length === 0) {
    console.log("  working tree clean — version files already committed.");
    return;
  }
  const unexpected = dirty.filter(
    (f) => !VERSION_FILES.includes(f) && !f.startsWith("release/KnowSpace-win-x64/docs/"),
  );
  if (unexpected.length > 0) {
    die(
      `unexpected dirty files (not part of a release): ${unexpected.join(", ")}\n` +
        "  commit or stash them first — this script stages exactly the version files.",
    );
  }
  run("git", ["add", ...VERSION_FILES]);
  run("git", ["commit", "-m", `chore(release): v${version}`]);
}

/* ── 4. pack ──────────────────────────────────────────────────────────── */
function pack() {
  step("4/8 desktop:pack (~13 min, electron-builder)");
  runNpm(["run", "desktop:pack"]);
}

/* ── 5. artifact verification ─────────────────────────────────────────── */
function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function verifyArtifacts() {
  step("5/8 artifact verification");
  const msi = path.join(root, "release", `KnowSpace-${version}.msi`);
  const magic = fs.readFileSync(msi).subarray(0, 8);
  if (!magic.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
    die(`${msi} is not an OLE compound file (MSI magic mismatch)`);
  }

  const zipPath = path.join(root, "release", "KnowSpace-win-x64-portable.zip");
  const dirAsar = path.join(root, "release", "KnowSpace-win-x64", "resources", "app.asar");
  // python's zipfile is the proven reader here (node has no builtin zip);
  // forward slashes keep the embedded paths free of escaping games.
  const pythonProbe = spawnSync(
    "python",
    [
      "-c",
      `
import zipfile, hashlib, json
z = zipfile.ZipFile(r"${zipPath.replace(/\\/g, "/")}")
a = [n for n in z.namelist() if n.endswith("app.asar")][0]
h = hashlib.sha256(z.read(a)).hexdigest()
d = hashlib.sha256(open(r"${dirAsar.replace(/\\/g, "/")}", "rb").read()).hexdigest()
print(json.dumps({"entry": a, "equal": h == d}))
`,
    ],
    { cwd: root, encoding: "utf8" },
  );
  const probe = JSON.parse(pythonProbe.stdout.trim());
  if (!probe.equal) die("zip inner app.asar differs from the portable directory asar");

  const extract = path.join(require("node:os").tmpdir(), `ks-release-verify-${version}`);
  fs.rmSync(extract, { recursive: true, force: true });
  execFileSync("npx", ["asar", "extract", dirAsar, extract], {
    cwd: root,
    stdio: "pipe",
    shell: NPM_SHELL,
  });
  const bundles = fs
    .readdirSync(path.join(extract, "dist", "assets"))
    .filter((f) => /^App-.*\.js$/.test(f));
  if (bundles.length !== 1)
    die(`expected exactly one App-*.js bundle, found: ${bundles.join(", ")}`);
  const bundle = fs.readFileSync(path.join(extract, "dist", "assets", bundles[0]), "utf8");
  // Permanent probes only — a per-release headline string would turn this
  // script into another hand-synced version point (the thing it exists to
  // remove): the bundle must carry THIS release's changelog heading, and one
  // feature string from each shipped era that never changes (footnote
  // back-ref aria label, the mermaid warm-up id).
  for (const needle of [`v${version} `, "返回正文", "bookmd-mermaid-warmup"]) {
    if (!bundle.includes(needle)) die(`bundle ${bundles[0]} does not contain "${needle}"`);
  }
  const shippedPreload = fs.readFileSync(path.join(extract, "electron", "preload.cjs"), "utf8");
  if (!shippedPreload.includes(`const API_VERSION = "${version}"`)) {
    die(`shipped preload.cjs does not carry API_VERSION ${version}`);
  }
  console.log(
    `  MSI magic OK; zip==dir asar (${probe.entry}); bundle ${bundles[0]} carries v${version}; preload handshake OK.`,
  );
}

/* ── 6/7. publish + verify ────────────────────────────────────────────── */
function publish() {
  step("6/8 publish to GitHub (tag + release + three assets)");
  run("python", ["scripts/publish_github_release.py"]);
}

function verifyRelease() {
  step("7/8 independent verification");
  const token = githubToken();
  if (!token) die("no GitHub credential available (git credential fill came up empty)");
  run(
    "python",
    ["scripts/verify-github-release.py", `v${version}`, "--repo", "chunxvzhang-lab/KnowSpace"],
    {
      env: { ...process.env, GITHUB_TOKEN: token },
    },
  );
}

/* ── 8. push with retry ───────────────────────────────────────────────── */
function push() {
  step("8/8 push main + tag (with retry — this network drops connections)");
  const attempts = 6;
  for (let i = 1; i <= attempts; i += 1) {
    const res = spawnSync("git", ["push", "origin", "main", `v${version}`], {
      cwd: root,
      encoding: "utf8",
    });
    if (res.status === 0) {
      console.log((res.stdout || "").trim().split("\n").pop());
      return;
    }
    console.log(
      `  push attempt ${i}/${attempts} failed: ${(res.stderr || "").trim().split("\n").pop()}`,
    );
    if (i < attempts) {
      // Synchronous 30s pause without shelling out.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
    }
  }
  die(
    `push failed ${attempts} times — commits are safe locally; retry manually when the network returns`,
  );
}

/* ── main ─────────────────────────────────────────────────────────────── */
(async () => {
  step("0/8 plan");
  console.log(
    `  version ${version}; preflight rounds ${preflightRounds}; the six version files must be written already.\n` +
      "  The script stages EXACTLY those files, packs, verifies artifacts, publishes, verifies, pushes.",
  );
  consistencyGate();
  if (!(await confirm("Consistency gate passed. Continue with preflight + pack + publish?"))) {
    die("aborted by user");
  }
  if (preflightRounds > 0) preflight();
  commitVersionFiles();
  pack();
  verifyArtifacts();
  publish();
  verifyRelease();
  push();
  step("DONE");
  console.log(`  v${version} released and verified. Local portable dir is the shipped build.`);
})();
