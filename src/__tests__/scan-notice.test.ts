import { describe, expect, it } from "vitest";

import { describeScanTruncation, describeScanUnreadable } from "../core/scanNotice";

/**
 * The sentences the tree and the review's folder rows put on screen when a scan
 * did not see everything.
 *
 * Worth testing on its own because the failure it guards against is silent: a
 * directory that cannot be opened yields no entries, so without a notice the
 * reader sees a folder with fewer documents than it has and concludes they were
 * deleted. The wording has to name the right cause, because "permission denied"
 * and "it moved" are fixed in completely different ways.
 */

describe("describeScanUnreadable", () => {
  it("says nothing when there is nothing to report", () => {
    expect(describeScanUnreadable(null)).toBeNull();
    expect(describeScanUnreadable(undefined)).toBeNull();
    expect(describeScanUnreadable({ count: 0, samples: [], reason: "EACCES" })).toBeNull();
  });

  it("names the folder and the count for a permission failure", () => {
    const notice = describeScanUnreadable({
      count: 3,
      samples: ["C:/vault/私密/子目录"],
      reason: "EACCES",
    });
    expect(notice).toContain("3");
    expect(notice).toContain("子目录");
    expect(notice).toContain("权限");
  });

  it("treats EPERM as a permission failure too", () => {
    const notice = describeScanUnreadable({ count: 1, samples: ["C:/vault/x"], reason: "EPERM" });
    expect(notice).toContain("权限");
  });

  it("distinguishes a folder that is gone from one that cannot be read", () => {
    const notice = describeScanUnreadable({ count: 2, samples: ["C:/vault/旧的"], reason: "ENOENT" });
    expect(notice).toContain("已不存在");
    expect(notice).not.toContain("权限");
  });

  it("explains a link loop and a non-directory path separately", () => {
    expect(describeScanUnreadable({ count: 1, samples: [], reason: "ELOOP" })).toContain("循环");
    expect(describeScanUnreadable({ count: 1, samples: [], reason: "ENOTDIR" })).toContain("不是目录");
  });

  it("still produces a sentence when no example path travelled with the marker", () => {
    const notice = describeScanUnreadable({ count: 4, samples: [], reason: "EACCES" });
    expect(notice).toContain("4");
    expect(notice).toContain("部分目录");
  });
});

describe("describeScanTruncation", () => {
  it("says nothing for a scan that ran to completion", () => {
    expect(describeScanTruncation(null)).toBeNull();
    expect(describeScanTruncation(undefined)).toBeNull();
  });

  it("reports the file ceiling with the count it did list", () => {
    const notice = describeScanTruncation({ reason: "files", seen: 50000, remainingDirs: 12 });
    expect(notice).toContain("50000");
    expect(notice).toContain("12");
  });

  it("names the folder the depth limit stopped at", () => {
    const notice = describeScanTruncation({ reason: "depth", seen: 10, at: "C:/vault/a/b/c" });
    expect(notice).toContain("C:/vault/a/b/c");
    expect(notice).toContain("层级");
  });

  it("reports a timeout as a timeout", () => {
    expect(describeScanTruncation({ reason: "time", seen: 800 })).toContain("超时");
  });

  it("omits the queued-directory clause when the count is not known", () => {
    const notice = describeScanTruncation({ reason: "files", seen: 100 });
    expect(notice).toContain("100");
    expect(notice).not.toContain("未扫描");
  });
});
