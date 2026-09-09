const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const crypto = require("crypto");

/**
 * Maximum number of snapshots preserved per file before pruning.
 */
const MAX_SNAPSHOTS_PER_FILE = 50;

/**
 * Minimum interval between automatic snapshots in milliseconds (30 seconds).
 * If a new auto-save occurs within this window, the latest snapshot is updated
 * rather than creating a fragmented redundant entry.
 */
const DEBOUNCE_INTERVAL_MS = 30 * 1000;

function computeHash(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16);
}

let electronApp = null;
try {
  const electron = require("electron");
  electronApp = electron.app || null;
} catch {}

function getGlobalSnapshotsRoot() {
  if (process.env.KNOWSPACE_SNAPSHOTS_DIR) {
    return process.env.KNOWSPACE_SNAPSHOTS_DIR;
  }
  if (electronApp && typeof electronApp.getPath === "function") {
    return path.join(electronApp.getPath("userData"), "snapshots");
  }
  const os = require("os");
  const baseDir =
    process.env.APPDATA ||
    (process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support")
      : path.join(os.homedir(), ".config"));
  return path.join(baseDir, "KnowSpace", "snapshots");
}

/**
 * Resolves the root snapshots directory for a given file.
 * By default, snapshots are stored centrally in the app's userData directory
 * to avoid polluting the user's workspace/desktop with unwanted folders.
 * If an existing .knowspace/snapshots directory is already present, it can be used.
 */
function resolveSnapshotsRoot(filePath, rootPath) {
  if (process.env.KNOWSPACE_SNAPSHOTS_DIR) {
    return process.env.KNOWSPACE_SNAPSHOTS_DIR;
  }

  // If running in unit test environment where electron is absent and rootPath is explicitly passed,
  // allow writing to rootPath/.knowspace/snapshots so tests remain isolated.
  if (!electronApp && rootPath && typeof rootPath === "string") {
    return path.join(rootPath, ".knowspace", "snapshots");
  }

  // If rootPath explicitly has an EXISTING .knowspace/snapshots folder, use it
  if (rootPath && typeof rootPath === "string") {
    const candidate = path.join(rootPath, ".knowspace", "snapshots");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  // Scan upwards for an EXISTING .knowspace/snapshots directory (never create one spontaneously)
  if (filePath && typeof filePath === "string") {
    let currentDir = path.dirname(path.resolve(filePath));
    while (true) {
      const candidate = path.join(currentDir, ".knowspace", "snapshots");
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
      const parent = path.dirname(currentDir);
      if (!parent || parent === currentDir) break;
      currentDir = parent;
    }
  }

  // Default: Centralized global user data directory.
  // NEVER create .knowspace or snapshot folders in the user's document/desktop directory!
  return getGlobalSnapshotsRoot();
}

/**
 * Generates a stable directory name for the file's snapshots.
 */
function getFileFolderKey(filePath) {
  const resolved = path.resolve(filePath).toLowerCase();
  const hash = crypto.createHash("sha1").update(resolved).digest("hex").slice(0, 10);
  const baseName = path.basename(filePath).replace(/[^a-zA-Z0-9_\u4e00-\u9fa5.-]/g, "_");
  return `${hash}_${baseName}`;
}

/**
 * Calculates line-level difference summary (+lines, -lines).
 */
function quickDiffSummary(oldContent, newContent) {
  const oldLines = oldContent ? oldContent.split(/\r?\n/) : [];
  const newLines = newContent ? newContent.split(/\r?\n/) : [];
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  let added = 0;
  for (const line of newLines) {
    if (!oldSet.has(line)) added++;
  }

  let removed = 0;
  for (const line of oldLines) {
    if (!newSet.has(line)) removed++;
  }

  return { added, removed, charDelta: (newContent?.length || 0) - (oldContent?.length || 0) };
}

/**
 * Records a new version snapshot for the specified markdown/canvas file.
 */
async function recordSnapshot({ filePath, rootPath, content, reason = "save" }) {
  if (!filePath || typeof content !== "string") {
    return { success: false, error: "Invalid parameters" };
  }

  try {
    const snapshotsRoot = resolveSnapshotsRoot(filePath, rootPath);
    const folderKey = getFileFolderKey(filePath);
    const fileSnapDir = path.join(snapshotsRoot, folderKey);

    await fsPromises.mkdir(fileSnapDir, { recursive: true });

    const newHash = computeHash(content);
    const files = (await fsPromises.readdir(fileSnapDir)).filter((f) => f.endsWith(".json")).sort();

    // Check last snapshot for deduplication or debouncing
    if (files.length > 0) {
      const lastFileName = files[files.length - 1];
      const lastFilePath = path.join(fileSnapDir, lastFileName);
      try {
        const lastData = JSON.parse(await fsPromises.readFile(lastFilePath, "utf8"));
        if (lastData.hash === newHash) {
          // Content unchanged, skip creating redundant snapshot
          return { success: true, skipped: true, snapshotId: lastData.id };
        }

        const lastTime = new Date(lastData.timestamp).getTime();
        const now = Date.now();
        if (reason === "save" && now - lastTime < DEBOUNCE_INTERVAL_MS) {
          // Update the recent snapshot instead of appending
          lastData.content = content;
          lastData.hash = newHash;
          lastData.charCount = content.length;
          lastData.lineCount = content.split(/\r?\n/).length;
          lastData.timestamp = new Date().toISOString();
          await fsPromises.writeFile(lastFilePath, JSON.stringify(lastData, null, 2), "utf8");
          return { success: true, updated: true, snapshotId: lastData.id };
        }
      } catch {}
    }

    // Get old content for diff stats
    let previousContent = "";
    if (files.length > 0) {
      try {
        const lastFilePath = path.join(fileSnapDir, files[files.length - 1]);
        const lastData = JSON.parse(await fsPromises.readFile(lastFilePath, "utf8"));
        previousContent = lastData.content || "";
      } catch {}
    }

    const diffStats = quickDiffSummary(previousContent, content);
    const timestamp = new Date().toISOString();
    // Safe filename format for Windows & cross-platform: 20260908_143000_123
    const safeFileTime = timestamp.replace(/[-:]/g, "").replace("T", "_").replace("Z", "");
    const snapshotId = `${safeFileTime}_${newHash.slice(0, 6)}`;
    const snapshotFile = path.join(fileSnapDir, `${snapshotId}.json`);

    const snapshotData = {
      id: snapshotId,
      timestamp,
      filePath: path.resolve(filePath),
      hash: newHash,
      charCount: content.length,
      lineCount: content.split(/\r?\n/).length,
      diffAdded: diffStats.added,
      diffRemoved: diffStats.removed,
      charDelta: diffStats.charDelta,
      reason,
      content,
    };

    await fsPromises.writeFile(snapshotFile, JSON.stringify(snapshotData, null, 2), "utf8");

    // Prune excessive snapshots if exceeding maximum count
    const updatedFiles = (await fsPromises.readdir(fileSnapDir)).filter((f) => f.endsWith(".json")).sort();
    if (updatedFiles.length > MAX_SNAPSHOTS_PER_FILE) {
      const filesToDelete = updatedFiles.slice(0, updatedFiles.length - MAX_SNAPSHOTS_PER_FILE);
      for (const file of filesToDelete) {
        await fsPromises.unlink(path.join(fileSnapDir, file)).catch(() => {});
      }
    }

    return { success: true, snapshotId };
  } catch (err) {
    console.error("Failed to record version snapshot:", err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Lists all snapshots available for the specified file (newest first).
 * Merges snapshots from both the local repository (if .knowspace exists)
 * and the global userData directory so no past history is lost.
 */
async function listSnapshots({ filePath, rootPath }) {
  if (!filePath) return [];

  try {
    const primaryRoot = resolveSnapshotsRoot(filePath, rootPath);
    const globalRoot = getGlobalSnapshotsRoot();
    const folderKey = getFileFolderKey(filePath);

    const rootsToScan = Array.from(new Set([primaryRoot, globalRoot]));
    const resultsMap = new Map();

    for (const snapRoot of rootsToScan) {
      if (!snapRoot) continue;
      const fileSnapDir = path.join(snapRoot, folderKey);
      if (!fs.existsSync(fileSnapDir)) continue;

      const files = (await fsPromises.readdir(fileSnapDir)).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        const fullPath = path.join(fileSnapDir, file);
        try {
          const data = JSON.parse(await fsPromises.readFile(fullPath, "utf8"));
          const id = data.id || file.replace(".json", "");
          if (!resultsMap.has(id)) {
            resultsMap.set(id, {
              id,
              timestamp: data.timestamp,
              filePath: data.filePath || filePath,
              hash: data.hash,
              charCount: data.charCount ?? data.content?.length ?? 0,
              lineCount: data.lineCount ?? data.content?.split(/\r?\n/).length ?? 0,
              diffAdded: data.diffAdded ?? 0,
              diffRemoved: data.diffRemoved ?? 0,
              charDelta: data.charDelta ?? 0,
              reason: data.reason || "save",
            });
          }
        } catch {}
      }
    }

    return Array.from(resultsMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (err) {
    console.error("Failed to list version snapshots:", err);
    return [];
  }
}

/**
 * Reads full content of a specific snapshot.
 * Checks both local and global snapshot roots.
 */
async function readSnapshot({ filePath, rootPath, snapshotId }) {
  if (!filePath || !snapshotId) return null;

  try {
    const primaryRoot = resolveSnapshotsRoot(filePath, rootPath);
    const globalRoot = getGlobalSnapshotsRoot();
    const folderKey = getFileFolderKey(filePath);

    const candidatePaths = [
      path.join(primaryRoot, folderKey, `${snapshotId}.json`),
      path.join(globalRoot, folderKey, `${snapshotId}.json`),
    ];

    for (const targetPath of candidatePaths) {
      if (fs.existsSync(targetPath)) {
        const data = JSON.parse(await fsPromises.readFile(targetPath, "utf8"));
        return {
          id: data.id,
          timestamp: data.timestamp,
          filePath: data.filePath,
          content: data.content || "",
          hash: data.hash,
          charCount: data.charCount,
          reason: data.reason,
        };
      }
    }

    return null;
  } catch (err) {
    console.error("Failed to read snapshot:", err);
    return null;
  }
}

module.exports = {
  recordSnapshot,
  listSnapshots,
  readSnapshot,
  resolveSnapshotsRoot,
  getFileFolderKey,
  getGlobalSnapshotsRoot,
  MAX_SNAPSHOTS_PER_FILE,
};
