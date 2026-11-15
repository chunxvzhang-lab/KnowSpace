const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { build, Platform, Arch } = require("electron-builder");
const { localizeSource, sourceFiles, checkCoverage } = require("./localize-english.cjs");
const pkg = require("../package.json");

const root = path.resolve(__dirname, "..");
const staging = path.join(root, "output", "english-build");
const output = path.join(root, "release", "english");

async function main() {
  checkCoverage();
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"], {
    cwd: root,
    stdio: "inherit",
  });
  execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, KNOWSPACE_LANGUAGE: "en" },
  });
  await fs.mkdir(staging, { recursive: true });
  for (const folder of ["dist", "electron", "build"]) {
    await fs.cp(path.join(root, folder), path.join(staging, folder), { recursive: true });
  }
  for (const source of sourceFiles(path.join(root, "electron"))) {
    const target = path.join(staging, path.relative(root, source));
    let code = localizeSource(await fs.readFile(source, "utf8"), source);
    if (source.endsWith("main.cjs"))
      code = 'require("electron").app.commandLine.appendSwitch("lang", "en-US");\n' + code;
    await fs.writeFile(target, code);
  }
  await fs.copyFile(path.join(root, "icon.png"), path.join(staging, "icon.png"));
  // All renderer dependencies are bundled by Vite; Electron modules use only
  // Node/Electron built-ins. Do not copy development tools into the installer.
  await fs.writeFile(
    path.join(staging, "package.json"),
    JSON.stringify(
      {
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        author: pkg.author,
        type: pkg.type,
        main: pkg.main,
      },
      null,
      2,
    ),
  );
  await build({
    projectDir: root,
    targets: Platform.WINDOWS.createTarget(["msi", "nsis"], Arch.x64),
    config: {
      ...pkg.build,
      electronVersion: require("electron/package.json").version,
      electronDist: path.join(root, "node_modules", "electron", "dist"),
      npmRebuild: false,
      directories: { app: staging, output, buildResources: path.join(root, "build") },
      msi: { ...pkg.build.msi, artifactName: "KnowSpace-${version}-en.${ext}" },
      nsis: {
        ...pkg.build.nsis,
        language: "1033",
        installerLanguages: ["en_US"],
        multiLanguageInstaller: false,
        displayLanguageSelector: false,
        artifactName: "KnowSpace-Setup-${version}-en.${ext}",
      },
    },
  });
  console.log(`English installers written to ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
