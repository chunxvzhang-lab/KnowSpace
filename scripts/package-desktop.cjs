const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile, exec } = require("node:child_process");
const { promisify } = require("node:util");

const root = path.resolve(__dirname, "..");
const releaseRoot = path.join(root, "release");
const winUnpacked = path.join(releaseRoot, "win-unpacked");
const appDir = path.join(releaseRoot, "KnowSpace-win-x64");
const portableZip = path.join(releaseRoot, "KnowSpace-win-x64-portable.zip");
const execPromise = promisify(exec);
const execFileAsync = promisify(execFile);

if (process.platform === "win32") {
  process.env.PATH = "C:\\Program Files\\nodejs;" + (process.env.PATH || "");
}

async function main() {
  console.log("1. Ensuring dist is built...");
  await assertExists(path.join(root, "dist", "index.html"), "dist is missing. Run npm run build first.");

  console.log("2. Building MSI installer, NSIS installer, and unpacked application via electron-builder...");
  const builderCmd = process.platform === "win32"
    ? `"${path.join(root, "node_modules", ".bin", "electron-builder.cmd")}"`
    : "npx electron-builder";
  await execPromise(`${builderCmd} --win msi nsis dir`, { cwd: root });

  console.log("3. Copying unpacked binaries into release/KnowSpace-win-x64...");
  await fs.mkdir(releaseRoot, { recursive: true });

  // Empty the folder if we can — then copy, and then check the result against the copy's
  // source. The check at the end is the one that matters.
  //
  // This guard has now been written three times, and the three are worth telling apart.
  // The first emptied the folder with five silent retries and copied on regardless, so a
  // deletion that failed produced a folder that was part old and part new — that is how
  // two v2.3.0 installers ended up inside the v2.6.0 portable zip. The second insisted
  // the folder be empty first, which is the right worry and the wrong test: a file can be
  // impossible to delete and perfectly possible to overwrite. On this machine the editor
  // holds a handle on resources/app.asar that allows writes and refuses deletes, so the
  // build stopped over a file that was about to be replaced anyway. What we mean is "the
  // folder is exactly this build", so that is what is checked now, after the copy. It is
  // strictly more than either earlier version: it also catches a copy that did not
  // finish, and it names the files instead of describing the situation.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await fs.rm(appDir, { recursive: true, force: true });
    } catch (err) {
      // Locked entries survive; whether that matters is decided below.
    }
    if (await isEmptyOrMissing(appDir)) break;
    await new Promise((r) => setTimeout(r, 300));
  }

  await copyDirectory(winUnpacked, appDir);

  // Last version's file sitting beside this one's is the failure this whole dance is
  // about, so remove what does not belong, then look again.
  let problems = await compareDirectories(winUnpacked, appDir);
  if (problems.length) {
    for (const problem of problems.filter((item) => item.kind === "extra")) {
      await fs.rm(path.join(appDir, problem.path), { force: true }).catch(() => {});
    }
    problems = await compareDirectories(winUnpacked, appDir);
  }
  if (problems.length) {
    const detail = problems
      .map((item) => `  ${item.kind === "extra" ? "leftover from an older build" : "not written by this build"}: ${item.path}`)
      .join("\n");
    throw new Error(
      `The packaged folder is not this build, and what does not fit could not be removed:\n${detail}\n` +
        `Close whatever is using ${appDir} (a running KnowSpace.exe, an editor, an open zip) and run again.`
    );
  }

  console.log("3.5 Embedding icon & PE version info into KnowSpace.exe...");
  const pkg = require("../package.json");
  const appVersion = pkg.version || "1.5.0";
  const rcedit = path.join(root, "node_modules", "electron-winstaller", "vendor", "rcedit.exe");
  const targetExe = path.join(appDir, "KnowSpace.exe");
  const iconIco = path.join(root, "build", "icon.ico");
  try {
    await execFileAsync(rcedit, [
      targetExe,
      "--set-icon", iconIco,
      "--set-version-string", "ProductName", "KnowSpace",
      "--set-version-string", "FileDescription", "KnowSpace - Personal Knowledge Workspace",
      "--set-version-string", "CompanyName", "KnowSpace Team",
      "--set-version-string", "LegalCopyright", `Copyright © ${new Date().getFullYear()} KnowSpace`,
      "--set-file-version", appVersion,
      "--set-product-version", appVersion
    ]);
    console.log(`Successfully embedded icon and PE metadata (v${appVersion}) into KnowSpace.exe.`);
  } catch (err) {
    console.warn("rcedit failed (non-critical, binary will keep default icon):", err.message);
  }

  console.log("4. Organizing subfolders (release, docs, assets)...");
  const releaseSubDir = path.join(appDir, "release");
  const assetsDir = path.join(appDir, "assets");
  const docsDir = path.join(appDir, "docs");

  await fs.mkdir(releaseSubDir, { recursive: true });
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.mkdir(docsDir, { recursive: true });

  // Copy MSI if exists
  const possibleMsiSources = [
    path.join(releaseRoot, `KnowSpace ${appVersion}.msi`),
    path.join(releaseRoot, `KnowSpace-${appVersion}.msi`),
    path.join(releaseRoot, `BookMD Reader ${appVersion}.msi`),
    path.join(releaseRoot, `BookMD-Reader-${appVersion}.msi`),
  ];
  for (const src of possibleMsiSources) {
    try {
      await fs.copyFile(src, path.join(releaseSubDir, `KnowSpace-${appVersion}.msi`));
      console.log(`Included MSI installer: ${src} -> KnowSpace-${appVersion}.msi`);
      break;
    } catch (e) {}
  }

  // Copy EXE installer if exists
  const possibleExeSources = [
    path.join(releaseRoot, `KnowSpace-Setup-${appVersion}.exe`),
    path.join(releaseRoot, `KnowSpace Setup ${appVersion}.exe`),
  ];
  for (const src of possibleExeSources) {
    try {
      await fs.copyFile(src, path.join(releaseSubDir, `KnowSpace-Setup-${appVersion}.exe`));
      console.log(`Included EXE installer: ${src} -> KnowSpace-Setup-${appVersion}.exe`);
      break;
    } catch (e) {}
  }

  // Copy assets and docs
  try {
    await fs.copyFile(path.join(root, "icon.png"), path.join(assetsDir, "icon.png"));
  } catch (e) {}
  try {
    await fs.copyFile(path.join(root, "screenshot.png"), path.join(assetsDir, "screenshot.png"));
  } catch (e) {}
  try {
    await fs.copyFile(path.join(root, "LICENSE"), path.join(docsDir, "LICENSE"));
  } catch (e) {}
  try {
    await fs.copyFile(path.join(root, "docs", "USER_MANUAL.md"), path.join(docsDir, "USER_MANUAL.md"));
  } catch (e) {}
  try {
    await fs.copyFile(path.join(root, "docs", "操作手册.md"), path.join(docsDir, "操作手册.md"));
  } catch (e) {}
  try {
    await fs.copyFile(path.join(root, "docs", "PICTURE_MANUAL.md"), path.join(docsDir, "PICTURE_MANUAL.md"));
  } catch (e) {}
  try {
    await fs.copyFile(path.join(root, "docs", "全功能高清图片手册.md"), path.join(docsDir, "全功能高清图片手册.md"));
  } catch (e) {}
  try {
    await fs.copyFile(path.join(root, "docs", "PROMOTIONAL_WEBSITE_PLAN.md"), path.join(docsDir, "PROMOTIONAL_WEBSITE_PLAN.md"));
  } catch (e) {}
  try {
    await fs.copyFile(path.join(root, "docs", "knowspace-roadmap-v2.0-v3.0.md"), path.join(docsDir, "knowspace-roadmap-v2.0-v3.0.md"));
  } catch (e) {}
  try {
    await fs.copyFile(path.join(root, "docs", "knowspace-roadmap-v1.9-v2.5.md"), path.join(docsDir, "knowspace-roadmap-v1.9-v2.5.md"));
  } catch (e) {}
  try {
    await copyDirectory(path.join(root, "docs", "manual-images"), path.join(docsDir, "manual-images"));
  } catch (e) {}
  try {
    const readmeTxt = `KnowSpace v${appVersion}\nPersonal Knowledge Workspace (个人知识工作台)\n\nDirect Run: Double-click 'KnowSpace.exe'\nInstaller: Locate MSI in 'release/KnowSpace-${appVersion}.msi'\nManual: Check 'docs/USER_MANUAL.md' or 'docs/操作手册.md'\nGitHub: https://github.com/chunxvzhang-lab/KnowSpace\n`;
    await fs.writeFile(path.join(docsDir, "README.txt"), readmeTxt, "utf8");
  } catch (e) {}
  try {
    await fs.copyFile(path.join(root, "README.md"), path.join(appDir, "README.md"));
  } catch (e) {}

  console.log("5. Creating portable zip archive...");
  await createPortableZip();

  console.log(`\n🎉 Successfully packaged desktop app: ${appDir}`);
  console.log(`🎉 Portable zip: ${portableZip}`);
}

async function copyDirectory(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath);
    } else if (entry.isSymbolicLink()) {
      const target = await fs.readlink(sourcePath);
      await fs.symlink(target, destinationPath).catch(() => {});
    } else {
      await fs.copyFile(sourcePath, destinationPath);
    }
  }
}

async function createPortableZip() {
  await fs.rm(portableZip, { force: true }).catch(() => {});
  const pyCode = [
    "import zipfile, os",
    `zip_path = r"${portableZip}"`,
    `source_dir = r"${appDir}"`,
    "with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:",
    "    for root, dirs, files in os.walk(source_dir):",
    "        for file in files:",
    "            full_path = os.path.join(root, file)",
    "            rel_path = os.path.relpath(full_path, source_dir)",
    "            zf.write(full_path, rel_path)",
    "print('Zip archive created successfully.')",
  ].join("\n");
  await execFileAsync("python", ["-c", pyCode], { cwd: root });
}

async function assertExists(filePath, message) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(message);
  }
}

async function isEmptyOrMissing(dirPath) {
  try {
    const entries = await fs.readdir(dirPath);
    return entries.length === 0;
  } catch {
    // Missing counts: there is nothing there to merge with.
    return true;
  }
}

/**
 * 目标目录与源目录的差异，两个方向都查。
 *
 * 复制是合并式的，"目录对不对"只能这样确认：源里没有的文件是上一版留下的（`extra`），
 * 源里有而目标里没有或大小不对的，是这次复制没写成功（`missing`）—— copyDirectory 会
 * 静默跳过复制不了的符号链接，所以少了文件也可能一声不响。
 */
async function compareDirectories(sourceDir, targetDir) {
  const expected = new Map();
  const seen = new Set();
  const problems = [];

  async function collect(dir, prefix) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await collect(fullPath, relative);
      } else {
        expected.set(relative, (await fs.stat(fullPath)).size);
      }
    }
  }

  async function compare(dir, prefix) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await compare(fullPath, relative);
        continue;
      }
      seen.add(relative);
      if (!expected.has(relative)) {
        problems.push({ kind: "extra", path: relative });
      } else if ((await fs.stat(fullPath)).size !== expected.get(relative)) {
        problems.push({ kind: "missing", path: relative });
      }
    }
  }

  await collect(sourceDir, "");
  await compare(targetDir, "");
  for (const relative of expected.keys()) {
    if (!seen.has(relative)) problems.push({ kind: "missing", path: relative });
  }
  return problems;
}

main().catch((err) => {
  console.error("Packaging error:", err);
  process.exit(1);
});
