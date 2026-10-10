const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Configuration and workspace-state helpers shared by main.cjs and the IPC
 * handler modules (files.cjs, capture.cjs, system.cjs).
 *
 * Nothing here touches windows or IPC: this is the config-file layer plus the
 * "which directory did the reader last act on" memory that several handler
 * groups read and update.
 */

function getAppConfig() {
  try {
    const configPath = path.join(app.getPath("userData"), "knowspace-config.json");
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
      return {
        flashShortcut: parsed.flashShortcut || "Alt+Space",
        runInBackground: parsed.runInBackground !== false,
        autoLaunch: Boolean(parsed.autoLaunch),
        flashPinned: Boolean(parsed.flashPinned),
        flashSpaceDir: typeof parsed.flashSpaceDir === "string" ? parsed.flashSpaceDir : "",
        persistentNote: typeof parsed.persistentNote === "string" ? parsed.persistentNote : "",
        flashWidth: typeof parsed.flashWidth === "number" ? parsed.flashWidth : 600,
        flashHeight: typeof parsed.flashHeight === "number" ? parsed.flashHeight : 360,
      };
    }
  } catch {}
  return {
    flashShortcut: "Alt+Space",
    runInBackground: true,
    autoLaunch: false,
    flashPinned: false,
    flashSpaceDir: "",
    persistentNote: "",
    flashWidth: 600,
    flashHeight: 360,
  };
}

function saveAppConfig(newConfig) {
  try {
    const configPath = path.join(app.getPath("userData"), "knowspace-config.json");
    let current = {};
    if (fs.existsSync(configPath)) {
      try {
        current = JSON.parse(fs.readFileSync(configPath, "utf8"));
      } catch {}
    }
    const merged = { ...current, ...newConfig };
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf8");
    return merged;
  } catch {
    return newConfig;
  }
}

function getAutoLaunch() {
  const config = getAppConfig();
  return Boolean(config.autoLaunch);
}

function saveFlashShortcut(shortcut) {
  return saveAppConfig({ flashShortcut: shortcut });
}

// The directory the reader last opened or saved into. Flash notes fall back to
// it when picking where today's minute-file lands, and pasted images use it as
// a second-choice assets root. Lifecycle code does not touch it: it belongs to
// the files and capture domains.
let lastActiveWorkspaceDir = null;

function getLastActiveWorkspaceDir() {
  return lastActiveWorkspaceDir;
}

function setLastActiveWorkspaceDir(dir) {
  lastActiveWorkspaceDir = dir;
}

function getDefaultSpaceDir() {
  let baseDir =
    lastActiveWorkspaceDir && fs.existsSync(lastActiveWorkspaceDir)
      ? lastActiveWorkspaceDir
      : path.join(app.getPath("userData"), "workspace");
  if (path.basename(baseDir).toLowerCase() === "space") {
    return baseDir;
  }
  return path.join(baseDir, "Space");
}

function resolveFlashSpaceDir() {
  const config = getAppConfig();
  if (
    config.flashSpaceDir &&
    typeof config.flashSpaceDir === "string" &&
    config.flashSpaceDir.trim()
  ) {
    const customDir = path.resolve(config.flashSpaceDir.trim());
    if (!fs.existsSync(customDir)) {
      try {
        fs.mkdirSync(customDir, { recursive: true });
      } catch (err) {
        console.warn("Could not create custom flash space dir:", err);
      }
    }
    if (fs.existsSync(customDir)) {
      return { dir: customDir, isCustom: true, defaultDir: getDefaultSpaceDir() };
    }
  }

  const defaultDir = getDefaultSpaceDir();
  if (!fs.existsSync(defaultDir)) {
    try {
      fs.mkdirSync(defaultDir, { recursive: true });
    } catch {}
  }
  return { dir: defaultDir, isCustom: false, defaultDir };
}

/**
 * "新建文档"与"资源管理器右键新建"共用的初始内容。一个概念只有一处定义：
 * 两处入口交给读者的第一份文件必须逐字节相同。
 *
 * mindmap 与渲染层 doCreateNewMindmap 的字面量保持一致（渲染层无法引用
 * electron 侧模块，改动时两边一起改）。
 */
const NEW_FILE_DEFAULTS = {
  document: "# 未命名\n\n",
  canvas: '{\n  "nodes": [],\n  "edges": []\n}',
  mindmap:
    "# 中心主题\n\n- 主要分支 1\n  - 子主题 1.1\n  - 子主题 1.2\n- 主要分支 2\n  - 子主题 2.1\n- 主要分支 3\n",
};

module.exports = {
  NEW_FILE_DEFAULTS,
  getAppConfig,
  saveAppConfig,
  getAutoLaunch,
  saveFlashShortcut,
  getLastActiveWorkspaceDir,
  setLastActiveWorkspaceDir,
  getDefaultSpaceDir,
  resolveFlashSpaceDir,
};
