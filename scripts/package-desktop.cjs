const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile, exec } = require("node:child_process");
const { promisify } = require("node:util");

const root = path.resolve(__dirname, "..");
const releaseRoot = path.join(root, "release");
const winUnpacked = path.join(releaseRoot, "win-unpacked");
const appDir = path.join(releaseRoot, "KnowSpace-win-x64");
const portableZip = path.join(releaseRoot, "KnowSpace-win-x64-portable.zip");
// 便携目录里由本脚本自己产出的三个子目录（理由见 PORTABLE_ONLY_ENTRIES）。声明在模块作用域
// 而不是第 4 步里，是因为第 3 步开头就要用它们清掉上一届的产物。
const appReleaseDir = path.join(appDir, "release");
const appAssetsDir = path.join(appDir, "assets");
const appDocsDir = path.join(appDir, "docs");
const appVersion = require("../package.json").version || "1.5.0";

// 便携目录里 docs/ 该有的顶层条目（第 4 步复制的那几份 + 它自己写的 README.txt）。
// 第 3 步据此清掉上一届留下、这一届不再生成的文档。**加了新的发布文档，这里要一起加**；
// 反过来，不再分发的文档要一起删，否则它会被当成"这一届该有的"而留下来。
//
// 现在只有两份手册、图片、许可证与 manual-images。2026-09-26 把规划与路线图类文档
// （推广方案、两份 roadmap）从这个白名单里去掉，同时从仓库删除了源文件 —— 它们不是
// 给用户看的，而且基线都停在旧版本。
const PORTABLE_DOC_ENTRIES = [
  "LICENSE",
  "USER_MANUAL.md",
  "PICTURE_MANUAL.md",
  "全功能高清图片手册.md",
  "README.txt",
  "manual-images",
];
const execPromise = promisify(exec);
const execFileAsync = promisify(execFile);

if (process.platform === "win32") {
  process.env.PATH = "C:\\Program Files\\nodejs;" + (process.env.PATH || "");
}

async function main() {
  console.log("1. Ensuring dist is built...");
  await assertExists(path.join(root, "dist", "index.html"), "dist is missing. Run npm run build first.");

  // 安装包已经构建好时，没必要再跑一遍 electron-builder：它慢，而且每次都会先清空
  // release/win-unpacked 和自己的临时暂存目录。只想同步便携目录或重打 zip 的时候，
  // 那两件事都是白做的——尤其在被沙箱限制批量删除的环境里，清空暂存目录还会直接失败。
  if (process.argv.includes("--skip-builder")) {
    console.log("2. Skipping electron-builder (--skip-builder); reusing release/win-unpacked...");
    await assertExists(path.join(winUnpacked, "KnowSpace.exe"), "release/win-unpacked is missing. Run a full pack first.");
  } else {
    console.log("2. Building MSI installer, NSIS installer, and unpacked application via electron-builder...");
    const builderCmd = process.platform === "win32"
      ? `"${path.join(root, "node_modules", ".bin", "electron-builder.cmd")}"`
      : "npx electron-builder";
    await execPromise(`${builderCmd} --win msi nsis dir`, { cwd: root });
  }

  console.log("3. Copying unpacked binaries into release/KnowSpace-win-x64...");
  await fs.mkdir(releaseRoot, { recursive: true });

  // 先清掉上一届的安装包和文档，再动整目录——顺序是有意的。
  //
  // 下面那段"清空整目录"注定失败（app.asar 删不掉），而沙箱的批量删除额度是按单次调用累计的：
  // 那几次失败尝试会一次把额度用光，之后再删任何东西都被静默拦掉，包括这两个本该删掉的旧
  // 安装包。而删除失败在这里是被 `.catch(() => {})` 吞掉的，症状就变成"旧安装包跟着进了便携
  // zip"——正是脚本上面那段注释里 v2.6.0 事故的重演。所以定向清理必须排在前面：
  // 它是本次调用里唯一真正需要成功的删除。
  await pruneDirectory(appReleaseDir, [`KnowSpace-${appVersion}.msi`, `KnowSpace-Setup-${appVersion}.exe`]);
  await pruneDirectory(appAssetsDir, ["icon.png", "screenshot.png"]);
  await pruneDirectory(appDocsDir, PORTABLE_DOC_ENTRIES);

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

  await fs.mkdir(appReleaseDir, { recursive: true });
  await fs.mkdir(appAssetsDir, { recursive: true });
  await fs.mkdir(appDocsDir, { recursive: true });

  // Copy MSI if exists
  const possibleMsiSources = [
    path.join(releaseRoot, `KnowSpace ${appVersion}.msi`),
    path.join(releaseRoot, `KnowSpace-${appVersion}.msi`),
    path.join(releaseRoot, `BookMD Reader ${appVersion}.msi`),
    path.join(releaseRoot, `BookMD-Reader-${appVersion}.msi`),
  ];
  for (const src of possibleMsiSources) {
    try {
      await fs.copyFile(src, path.join(appReleaseDir, `KnowSpace-${appVersion}.msi`));
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
      await fs.copyFile(src, path.join(appReleaseDir, `KnowSpace-Setup-${appVersion}.exe`));
      console.log(`Included EXE installer: ${src} -> KnowSpace-Setup-${appVersion}.exe`);
      break;
    } catch (e) {}
  }

  // Copy assets and docs
  try {
    await fs.copyFile(path.join(root, "icon.png"), path.join(appAssetsDir, "icon.png"));
  } catch (e) {}
  try {
    await fs.copyFile(path.join(root, "screenshot.png"), path.join(appAssetsDir, "screenshot.png"));
  } catch (e) {}
  try {
    await fs.copyFile(path.join(root, "LICENSE"), path.join(appDocsDir, "LICENSE"));
  } catch (e) {}
  try {
    await fs.copyFile(path.join(root, "docs", "USER_MANUAL.md"), path.join(appDocsDir, "USER_MANUAL.md"));
  } catch (e) {}
  // 规划与路线图类文档不再随包分发，也不再留在仓库里：`docs/` 只保留跟着版本走的
  // 用户手册与工程规范。2026-09-26 一次性清掉了二十余份实施计划、路线图、推广方案与
  // 一次性校验报告 —— 它们的基线都停在某个旧版本，留着只会让读者读到过时的口径。
  // 需要历史版本时从 git 历史里取，不要再把它们放回这个白名单。
  try {
    await fs.copyFile(path.join(root, "docs", "PICTURE_MANUAL.md"), path.join(appDocsDir, "PICTURE_MANUAL.md"));
  } catch (e) {}
  try {
    await fs.copyFile(path.join(root, "docs", "全功能高清图片手册.md"), path.join(appDocsDir, "全功能高清图片手册.md"));
  } catch (e) {}
  try {
    await copyDirectory(path.join(root, "docs", "manual-images"), path.join(appDocsDir, "manual-images"));
  } catch (e) {}
  try {
    const readmeTxt = `KnowSpace v${appVersion}\nPersonal Knowledge Workspace (个人知识工作台)\n\nDirect Run: Double-click 'KnowSpace.exe'\nInstaller: Locate MSI in 'release/KnowSpace-${appVersion}.msi'\nManual: Check 'docs/USER_MANUAL.md'\nGitHub: https://github.com/chunxvzhang-lab/KnowSpace\n`;
    await fs.writeFile(path.join(appDocsDir, "README.txt"), readmeTxt, "utf8");
  } catch (e) {}
  try {
    await fs.copyFile(path.join(root, "README.md"), path.join(appDir, "README.md"));
  } catch (e) {}

  // 旧版本留下的文件在第 3 步开头就清掉了（那里解释过为什么必须排在前头）。
  // 这一节只做加法。

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

/**
 * 只保留 `keep` 里列出的条目，同层的其它文件删掉；子目录一律保留。
 *
 * 第 4 步重建的是 `docs/`、`assets/`、`release/`。从前靠"先把整个 appDir 删干净"来保证
 * 不留旧文件，但在这个目录上删不动（见第 3 步的注释），于是旧版本的安装包会一届一届攒
 * 进便携 zip——v2.6.0 的包里混着两个 v2.3.0 安装包就是这么来的。所以改成定向清理：
 * 只删这一层里不该存在的文件，不碰目录（`docs/manual-images` 这类要留着）。
 *
 * 删的是自己的产物，且数量是个位数，不会撞上安全删除的批量阈值。
 */
async function pruneDirectory(dir, keep) {
  const keepSet = new Set(keep);
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory() || keepSet.has(entry.name)) continue;
    const target = path.join(dir, entry.name);
    try {
      await fs.rm(target, { force: true });
    } catch (err) {
      // 不静默。这里原本是 `.catch(() => {})`，于是"删不掉"表现为"便携 zip 里莫名多出
      // 上一版的安装包"——查起来毫无线索。删不掉就是旧文件会跟着分发出去，必须报出来。
      console.warn(`  [warn] stale entry kept: ${target} (${err.message})`);
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
    "        dirs[:] = [d for d in dirs if not d.startswith('.')]",
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
 * 便携目录里那些不是 electron-builder 产物的东西。
 *
 * `release/KnowSpace-win-x64` 同时是开发工作区、又是发布目录，所以它装着两类"构建之外"的东西：
 *
 *  - `.workbuddy-ai` / `.mimosa`：开发工作区的痕迹。不排除的话，第 3 步会把它们当成"上一版
 *    残留"删掉（删掉的是项目记忆，不是缓存），第 5 步会把它们打进分发给用户的 zip。
 *  - `docs/` / `assets/` / `release/` / `README.md`：第 4 步自己产出的便携版附加内容。
 *    win-unpacked 里没有它们，于是每次打包都会被判成"多余"、被删掉、再重新生成一遍。
 *    `docs/` 一个目录就有 52 个文件，这些删除加在一起会撞上安全删除的批量阈值（50/次），
 *    而删除失败是静默吞掉的（`.catch(() => {})`），所以症状是比对报告"目录不是这次构建"，
 *    打包在最后一步倒下——看起来像复制没写完，实际是删除没做完。
 *
 * 两类都不该参与"这个目录是不是这次构建"的判断：那个判断只对 electron-builder 的产物有意义。
 * 只看最外层：产物内部不会有这种条目，逐层判断反而会误伤将来某个同名的嵌套目录。
 */
const PORTABLE_ONLY_ENTRIES = new Set(["docs", "assets", "release", "README.md"]);

function isBuildOutput(relative) {
  const first = relative.split("/")[0];
  return !first.startsWith(".") && !PORTABLE_ONLY_ENTRIES.has(first);
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
      if (!isBuildOutput(relative)) continue;
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
