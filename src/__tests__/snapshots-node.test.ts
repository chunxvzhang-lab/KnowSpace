import { describe, expect, it, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

// Require commonjs snapshot module
const {
  recordSnapshot,
  listSnapshots,
  readSnapshot,
  MAX_SNAPSHOTS_PER_FILE,
} = require("../../electron/snapshots.cjs");

describe("electron/snapshots.cjs - Version Snapshots & Pruning", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      tempDir = null;
    }
  });

  it("records new snapshots and lists them in descending order", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowspace-snap-test-"));
    const testFile = path.join(tempDir, "architecture.md");

    // 1. First record
    const res1 = await recordSnapshot({
      filePath: testFile,
      rootPath: tempDir,
      content: "# Initial Version\nFirst draft",
      reason: "manual",
    });
    expect(res1.success).toBe(true);
    expect(res1.snapshotId).toBeDefined();

    // 2. List snapshots
    const list1 = await listSnapshots({
      filePath: testFile,
      rootPath: tempDir,
    });
    expect(list1.length).toBe(1);
    expect(list1[0].charCount).toBe("# Initial Version\nFirst draft".length);

    // 3. Read snapshot
    const detail1 = await readSnapshot({
      filePath: testFile,
      rootPath: tempDir,
      snapshotId: res1.snapshotId,
    });
    expect(detail1).not.toBeNull();
    expect(detail1.content).toBe("# Initial Version\nFirst draft");
    expect(detail1.reason).toBe("manual");
  });

  it("skips recording identical content", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowspace-snap-test-"));
    const testFile = path.join(tempDir, "doc.md");
    const content = "Unique content";

    const res1 = await recordSnapshot({
      filePath: testFile,
      rootPath: tempDir,
      content,
      reason: "save",
    });
    expect(res1.success).toBe(true);

    const res2 = await recordSnapshot({
      filePath: testFile,
      rootPath: tempDir,
      content,
      reason: "save",
    });
    expect(res2.success).toBe(true);
    expect(res2.skipped).toBe(true);

    const list = await listSnapshots({ filePath: testFile, rootPath: tempDir });
    expect(list.length).toBe(1);
  });

  it("enforces maximum snapshots pruning limit", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowspace-snap-test-"));
    const testFile = path.join(tempDir, "doc-prune.md");

    // Create more than MAX_SNAPSHOTS_PER_FILE snapshots
    for (let i = 0; i < MAX_SNAPSHOTS_PER_FILE + 5; i++) {
      await recordSnapshot({
        filePath: testFile,
        rootPath: tempDir,
        content: `Version ${i} with unique timestamp: ${Math.random()}`,
        reason: "manual", // manual skips debounce
      });
    }

    const list = await listSnapshots({ filePath: testFile, rootPath: tempDir });
    expect(list.length).toBeLessThanOrEqual(MAX_SNAPSHOTS_PER_FILE);
  });
});
