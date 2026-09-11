import { describe, it, expect, beforeEach } from "vitest";
import {
  recordWebSnapshot,
  listWebSnapshots,
  readWebSnapshot,
} from "../services/webSnapshotService";

describe("webSnapshotService Sub-function Tests", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("records a web snapshot and lists it back sorted by timestamp", () => {
    const fileKey = "notes/example.md";
    const res = recordWebSnapshot(fileKey, "# Version 1 Content", "save");
    expect(res.success).toBe(true);
    expect(res.snapshotId).toBeDefined();

    const list = listWebSnapshots(fileKey);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(res.snapshotId);
    expect(list[0].filePath).toBe(fileKey);
    expect(list[0].charCount).toBe("# Version 1 Content".length);
    expect(list[0].reason).toBe("save");
  });

  it("skips recording identical content to prevent snapshot bloat", () => {
    const fileKey = "notes/dup.md";
    const first = recordWebSnapshot(fileKey, "Same Content", "auto-save");
    const second = recordWebSnapshot(fileKey, "Same Content", "auto-save");

    expect(first.snapshotId).toBe(second.snapshotId);
    expect(listWebSnapshots(fileKey)).toHaveLength(1);
  });

  it("reads a specific snapshot detail by id", () => {
    const fileKey = "notes/detail.md";
    const res = recordWebSnapshot(fileKey, "Special Content to Read", "manual");
    expect(res.snapshotId).toBeDefined();

    const detail = readWebSnapshot(fileKey, res.snapshotId!);
    expect(detail).not.toBeNull();
    expect(detail?.content).toBe("Special Content to Read");
    expect(detail?.reason).toBe("manual");
  });

  it("enforces maximum 30 snapshots limit per file", () => {
    const fileKey = "notes/limit.md";
    for (let i = 0; i < 35; i++) {
      recordWebSnapshot(fileKey, `Version content ${i}`, "edit");
    }

    const list = listWebSnapshots(fileKey);
    expect(list.length).toBeLessThanOrEqual(30);
  });
});
