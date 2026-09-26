const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "..");
const releaseDir = path.join(root, "release");
const releaseRepo = path.join(releaseDir, "BookMD-Reader-win-x64");
const stageDir = path.join(releaseDir, "__msi-x64");
const appOutDir = path.join(releaseDir, "win-unpacked");
const finalMsiPath = path.join(releaseDir, "BookMD-Reader-1.0.0.msi");

const ps = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const wixBase = path.resolve(process.env.LOCALAPPDATA, "electron-builder/Cache/wix-4.0.0.5512.2");
const candle = path.join(wixBase, "candle.exe");
const light = path.join(wixBase, "light.exe");

console.log("Compiling WiX XML with candle.exe...");
execSync(`& "${candle}" -arch x64 -pedantic -dappDir="${appOutDir}" project.wxs`, {
  cwd: stageDir,
  stdio: "inherit",
  shell: ps,
});

console.log("Linking WiX Object with light.exe to:", finalMsiPath);
execSync(
  `& "${light}" -out "${finalMsiPath}" -spdb -sw1076 -dappDir="${appOutDir}" -b "${appOutDir}" -ext WixUIExtension project.wixobj`,
  { cwd: stageDir, stdio: "inherit", shell: ps },
);

if (fs.existsSync(finalMsiPath)) {
  const stat = fs.statSync(finalMsiPath);
  console.log(
    `\n🎉 MSI installer successfully created at: ${finalMsiPath} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`,
  );

  if (fs.existsSync(releaseRepo)) {
    const repoMsi = path.join(releaseRepo, "BookMD-Reader-1.0.0.msi");
    fs.copyFileSync(finalMsiPath, repoMsi);
    console.log(`Copied MSI to release repo: ${repoMsi}`);
  }
} else {
  console.error("MSI file not found at expected path:", finalMsiPath);
}
