import type { SnapshotItem, SnapshotDetail } from "../types/desktop";

const STORAGE_PREFIX = "knowspace.snapshots.";
const MAX_WEB_SNAPSHOTS = 30;

function getStorageKey(fileKey: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(fileKey)}`;
}

export function listWebSnapshots(fileKey: string): SnapshotItem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(fileKey));
    if (!raw) return [];
    const list: SnapshotDetail[] = JSON.parse(raw);
    return list.map((item) => ({
      id: item.id,
      timestamp: item.timestamp,
      filePath: item.filePath,
      hash: item.hash,
      charCount: item.charCount,
      lineCount: item.content.split(/\r?\n/).length,
      diffAdded: 0,
      diffRemoved: 0,
      charDelta: 0,
      reason: item.reason,
    })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch {
    return [];
  }
}

export function readWebSnapshot(fileKey: string, snapshotId: string): SnapshotDetail | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(getStorageKey(fileKey));
    if (!raw) return null;
    const list: SnapshotDetail[] = JSON.parse(raw);
    return list.find((item) => item.id === snapshotId) || null;
  } catch {
    return null;
  }
}

export function recordWebSnapshot(
  fileKey: string,
  content: string,
  reason: string = "save"
): { success: boolean; snapshotId?: string } {
  if (typeof localStorage === "undefined") return { success: false };
  try {
    const key = getStorageKey(fileKey);
    const raw = localStorage.getItem(key);
    let list: SnapshotDetail[] = raw ? JSON.parse(raw) : [];

    const now = new Date();
    const timestamp = now.toISOString();
    const snapshotId = `web_${now.getTime()}_${Math.random().toString(36).slice(2, 6)}`;

    // Skip identical content
    if (list.length > 0 && list[0].content === content) {
      return { success: true, snapshotId: list[0].id };
    }

    const newSnapshot: SnapshotDetail = {
      id: snapshotId,
      timestamp,
      filePath: fileKey,
      content,
      hash: snapshotId,
      charCount: content.length,
      reason,
    };

    list.unshift(newSnapshot);
    if (list.length > MAX_WEB_SNAPSHOTS) {
      list = list.slice(0, MAX_WEB_SNAPSHOTS);
    }

    localStorage.setItem(key, JSON.stringify(list));
    return { success: true, snapshotId };
  } catch {
    return { success: false };
  }
}
