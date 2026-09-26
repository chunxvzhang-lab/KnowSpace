const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const sevenZip = path.resolve(__dirname, "../node_modules/electron-winstaller/vendor/7z.exe");
const cacheDir = path.resolve(process.env.LOCALAPPDATA, "electron-builder/Cache");
const archive = path.join(cacheDir, "wix.7z");
const dest = path.join(cacheDir, "wix-4.0.0.5512.2");

console.log("Extracting WiX to:", dest);
fs.mkdirSync(dest, { recursive: true });
execFileSync(sevenZip, ["x", "-y", archive, `-o${dest}`], { stdio: "inherit" });
console.log("WiX extracted successfully! Files:", fs.readdirSync(dest).slice(0, 10));
