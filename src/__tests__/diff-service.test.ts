import { describe, expect, it } from "vitest";
import {
  computeLineDiff,
  computeInlineDiff,
  computeSideBySideDiff,
  computeDiffSummary,
} from "../services/diffService";

describe("diffService - LCS Line Diff & Inline Character Diff", () => {
  it("detects identical lines as equal", () => {
    const text = "Line 1\nLine 2\nLine 3";
    const diff = computeLineDiff(text, text);

    expect(diff.length).toBe(3);
    expect(diff.every((d) => d.type === "equal")).toBe(true);
    expect(diff[0].oldLineNumber).toBe(1);
    expect(diff[0].newLineNumber).toBe(1);
  });

  it("detects inserted lines", () => {
    const oldText = "Line 1\nLine 3";
    const newText = "Line 1\nLine 2 (new)\nLine 3";

    const diff = computeLineDiff(oldText, newText);

    expect(diff.length).toBe(3);
    expect(diff[0].type).toBe("equal");
    expect(diff[1].type).toBe("insert");
    expect(diff[1].text).toBe("Line 2 (new)");
    expect(diff[1].newLineNumber).toBe(2);
    expect(diff[2].type).toBe("equal");
  });

  it("detects deleted lines", () => {
    const oldText = "Line 1\nLine 2 (deprecated)\nLine 3";
    const newText = "Line 1\nLine 3";

    const diff = computeLineDiff(oldText, newText);

    expect(diff.length).toBe(3);
    expect(diff[0].type).toBe("equal");
    expect(diff[1].type).toBe("delete");
    expect(diff[1].text).toBe("Line 2 (deprecated)");
    expect(diff[1].oldLineNumber).toBe(2);
    expect(diff[2].type).toBe("equal");
  });

  it("computes character-level inline differences accurately", () => {
    const oldLine = "const count = 10;";
    const newLine = "const count = 25;";

    const { oldInline, newInline } = computeInlineDiff(oldLine, newLine);

    expect(oldInline).toEqual([
      { type: "equal", text: "const count = " },
      { type: "delete", text: "10" },
      { type: "equal", text: ";" },
    ]);

    expect(newInline).toEqual([
      { type: "equal", text: "const count = " },
      { type: "insert", text: "25" },
      { type: "equal", text: ";" },
    ]);
  });

  it("aligns lines for side-by-side dual column comparison", () => {
    const oldText = "Title\nOld Description\nFooter";
    const newText = "Title\nNew Description\nFooter";

    const rows = computeSideBySideDiff(oldText, newText);

    expect(rows.length).toBe(3);

    // Row 0: Equal
    expect(rows[0].left?.type).toBe("equal");
    expect(rows[0].right?.type).toBe("equal");
    expect(rows[0].left?.text).toBe("Title");

    // Row 1: Modified (delete left, insert right, paired on same row)
    expect(rows[1].left?.type).toBe("delete");
    expect(rows[1].left?.text).toBe("Old Description");
    expect(rows[1].right?.type).toBe("insert");
    expect(rows[1].right?.text).toBe("New Description");
    expect(rows[1].left?.inlineDiffs).toBeDefined();
    expect(rows[1].right?.inlineDiffs).toBeDefined();

    // Row 2: Equal
    expect(rows[2].left?.type).toBe("equal");
    expect(rows[2].right?.type).toBe("equal");
  });

  it("computes accurate diff summary statistics", () => {
    const oldText = "A\nB\nC";
    const newText = "A\nB modified\nC\nD new";

    const summary = computeDiffSummary(oldText, newText);

    expect(summary.totalOldLines).toBe(3);
    expect(summary.totalNewLines).toBe(4);
    expect(summary.addedLines).toBe(2); // "B modified", "D new"
    expect(summary.removedLines).toBe(1); // "B"
    expect(summary.unchangedLines).toBe(2); // "A", "C"
  });
});
