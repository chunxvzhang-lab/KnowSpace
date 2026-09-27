const { ipcMain } = require("electron");
const { saveMarkdownFile } = require("./markdown-files.cjs");
const { recordSnapshot, listSnapshots, readSnapshot } = require("./snapshots.cjs");

/**
 * Local version history handlers: listing, reading, reverting and manually
 * creating snapshots. A revert is a forced save of the snapshot content plus a
 * new snapshot recording the revert, so the history itself stays continuous.
 *
 * This module needs nothing from main.cjs's lifecycle state.
 */

function registerHistoryHandlers() {
  // Local Version History & Snapshot APIs
  ipcMain.handle("bookmd:list-snapshots", async (_event, params = {}) => {
    if (!params || !params.filePath) return [];
    return await listSnapshots({
      filePath: params.filePath,
      rootPath: params.rootPath,
    });
  });

  ipcMain.handle("bookmd:read-snapshot", async (_event, params = {}) => {
    if (!params || !params.filePath || !params.snapshotId) return null;
    return await readSnapshot({
      filePath: params.filePath,
      rootPath: params.rootPath,
      snapshotId: params.snapshotId,
    });
  });

  ipcMain.handle("bookmd:revert-snapshot", async (_event, params = {}) => {
    if (!params || !params.filePath || !params.snapshotId) {
      return { success: false, message: "参数无效" };
    }
    const snap = await readSnapshot({
      filePath: params.filePath,
      rootPath: params.rootPath,
      snapshotId: params.snapshotId,
    });
    if (!snap || typeof snap.content !== "string") {
      return { success: false, message: "无法读取目标快照内容" };
    }

    const saveRes = await saveMarkdownFile({
      absolutePath: params.filePath,
      content: snap.content,
      force: true,
    });

    if (saveRes.success) {
      await recordSnapshot({
        filePath: params.filePath,
        rootPath: params.rootPath,
        content: snap.content,
        reason: `revert (${params.snapshotId})`,
      });
    }

    return saveRes;
  });

  ipcMain.handle("bookmd:create-manual-snapshot", async (_event, params = {}) => {
    if (!params || !params.filePath || typeof params.content !== "string") {
      return { success: false, message: "参数无效" };
    }
    return await recordSnapshot({
      filePath: params.filePath,
      rootPath: params.rootPath,
      content: params.content,
      reason: "manual",
    });
  });
}

module.exports = { registerHistoryHandlers };
