export type DiffType = "equal" | "insert" | "delete";

export interface InlineDiff {
  type: DiffType;
  text: string;
}

export interface DiffLine {
  type: DiffType;
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
  inlineDiffs?: InlineDiff[];
}

export interface SideBySideRow {
  rowId: number;
  left?: {
    lineNumber: number;
    text: string;
    type: "equal" | "delete";
    inlineDiffs?: InlineDiff[];
  };
  right?: {
    lineNumber: number;
    text: string;
    type: "equal" | "insert";
    inlineDiffs?: InlineDiff[];
  };
}

export interface DiffSummary {
  addedLines: number;
  removedLines: number;
  unchangedLines: number;
  totalOldLines: number;
  totalNewLines: number;
  charDelta: number;
}

/**
 * High-performance Longest Common Subsequence (LCS) line diff algorithm.
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText ? oldText.split(/\r?\n/) : [];
  const newLines = newText ? newText.split(/\r?\n/) : [];

  const m = oldLines.length;
  const n = newLines.length;

  // Handle edge cases
  if (m === 0 && n === 0) return [];
  if (m === 0) {
    return newLines.map((line, idx) => ({
      type: "insert",
      text: line,
      newLineNumber: idx + 1,
    }));
  }
  if (n === 0) {
    return oldLines.map((line, idx) => ({
      type: "delete",
      text: line,
      oldLineNumber: idx + 1,
    }));
  }

  // 1. Trim common prefix lines
  let start = 0;
  while (start < m && start < n && oldLines[start] === newLines[start]) {
    start++;
  }

  // 2. Trim common suffix lines
  let mEnd = m - 1;
  let nEnd = n - 1;
  while (mEnd >= start && nEnd >= start && oldLines[mEnd] === newLines[nEnd]) {
    mEnd--;
    nEnd--;
  }

  const prefixLines: DiffLine[] = [];
  for (let k = 0; k < start; k++) {
    prefixLines.push({
      type: "equal",
      text: oldLines[k],
      oldLineNumber: k + 1,
      newLineNumber: k + 1,
    });
  }

  const suffixLines: DiffLine[] = [];
  const suffixCount = m - 1 - mEnd;
  for (let k = 0; k < suffixCount; k++) {
    const oldIdx = mEnd + 1 + k;
    const newIdx = nEnd + 1 + k;
    suffixLines.push({
      type: "equal",
      text: oldLines[oldIdx],
      oldLineNumber: oldIdx + 1,
      newLineNumber: newIdx + 1,
    });
  }

  const subOld = oldLines.slice(start, mEnd + 1);
  const subNew = newLines.slice(start, nEnd + 1);
  const subM = subOld.length;
  const subN = subNew.length;

  let middleDiff: DiffLine[] = [];

  if (subM === 0 && subN === 0) {
    middleDiff = [];
  } else if (subM === 0) {
    middleDiff = subNew.map((line, idx) => ({
      type: "insert",
      text: line,
      newLineNumber: start + idx + 1,
    }));
  } else if (subN === 0) {
    middleDiff = subOld.map((line, idx) => ({
      type: "delete",
      text: line,
      oldLineNumber: start + idx + 1,
    }));
  } else {
    // Dynamic programming matrix for LCS on middle trimmed segment
    const maxMatrixCells = 4000 * 4000;
    if (subM * subN > maxMatrixCells) {
      // Fast fallback: line-by-line comparison
      middleDiff = simpleLineDiff(subOld, subNew, start, start);
    } else {
      // Standard Myers / LCS matrix on middle lines
      const dp: number[][] = Array.from({ length: subM + 1 }, () => new Array(subN + 1).fill(0));

      for (let i = 1; i <= subM; i++) {
        for (let j = 1; j <= subN; j++) {
          if (subOld[i - 1] === subNew[j - 1]) {
            dp[i][j] = dp[i - 1][j - 1] + 1;
          } else {
            dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
          }
        }
      }

      // Backtrack to construct diff for middle lines
      let i = subM;
      let j = subN;

      while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && subOld[i - 1] === subNew[j - 1]) {
          middleDiff.unshift({
            type: "equal",
            text: subOld[i - 1],
            oldLineNumber: start + i,
            newLineNumber: start + j,
          });
          i--;
          j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
          middleDiff.unshift({
            type: "insert",
            text: subNew[j - 1],
            newLineNumber: start + j,
          });
          j--;
        } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
          middleDiff.unshift({
            type: "delete",
            text: subOld[i - 1],
            oldLineNumber: start + i,
          });
          i--;
        }
      }
    }
  }

  const result: DiffLine[] = [...prefixLines, ...middleDiff, ...suffixLines];

  // Enhance consecutive delete + insert pairs with inline word diff
  enhanceInlineDiffs(result);

  return result;
}

/**
 * Fast fallback comparison for very large documents.
 */
function simpleLineDiff(oldLines: string[], newLines: string[], oldOffset = 0, newOffset = 0): DiffLine[] {
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      result.push({
        type: "equal",
        text: oldLines[i],
        oldLineNumber: oldOffset + i + 1,
        newLineNumber: newOffset + j + 1,
      });
      i++;
      j++;
    } else {
      result.push({
        type: "delete",
        text: oldLines[i],
        oldLineNumber: oldOffset + i + 1,
      });
      result.push({
        type: "insert",
        text: newLines[j],
        newLineNumber: newOffset + j + 1,
      });
      i++;
      j++;
    }
  }

  while (i < oldLines.length) {
    result.push({
      type: "delete",
      text: oldLines[i],
      oldLineNumber: oldOffset + i + 1,
    });
    i++;
  }

  while (j < newLines.length) {
    result.push({
      type: "insert",
      text: newLines[j],
      newLineNumber: newOffset + j + 1,
    });
    j++;
  }

  return result;
}

/**
 * Computes character-level inline differences between two lines.
 */
export function computeInlineDiff(oldLine: string, newLine: string): {
  oldInline: InlineDiff[];
  newInline: InlineDiff[];
} {
  if (oldLine === newLine) {
    return {
      oldInline: [{ type: "equal", text: oldLine }],
      newInline: [{ type: "equal", text: newLine }],
    };
  }

  // Find common prefix
  let prefixLen = 0;
  while (
    prefixLen < oldLine.length &&
    prefixLen < newLine.length &&
    oldLine[prefixLen] === newLine[prefixLen]
  ) {
    prefixLen++;
  }

  // Find common suffix
  let suffixLen = 0;
  while (
    suffixLen < oldLine.length - prefixLen &&
    suffixLen < newLine.length - prefixLen &&
    oldLine[oldLine.length - 1 - suffixLen] === newLine[newLine.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const prefix = oldLine.slice(0, prefixLen);
  const suffix = suffixLen > 0 ? oldLine.slice(oldLine.length - suffixLen) : "";

  const oldDiff = oldLine.slice(prefixLen, oldLine.length - suffixLen);
  const newDiff = newLine.slice(prefixLen, newLine.length - suffixLen);

  const oldInline: InlineDiff[] = [];
  const newInline: InlineDiff[] = [];

  if (prefix) {
    oldInline.push({ type: "equal", text: prefix });
    newInline.push({ type: "equal", text: prefix });
  }

  if (oldDiff) {
    oldInline.push({ type: "delete", text: oldDiff });
  }

  if (newDiff) {
    newInline.push({ type: "insert", text: newDiff });
  }

  if (suffix) {
    oldInline.push({ type: "equal", text: suffix });
    newInline.push({ type: "equal", text: suffix });
  }

  return { oldInline, newInline };
}

/**
 * Enhances consecutive delete/insert pairs with character-level diffs.
 */
function enhanceInlineDiffs(diffLines: DiffLine[]): void {
  for (let i = 0; i < diffLines.length - 1; i++) {
    if (diffLines[i].type === "delete" && diffLines[i + 1].type === "insert") {
      const { oldInline, newInline } = computeInlineDiff(diffLines[i].text, diffLines[i + 1].text);
      diffLines[i].inlineDiffs = oldInline;
      diffLines[i + 1].inlineDiffs = newInline;
    }
  }
}

/**
 * Computes side-by-side rows aligning deleted and inserted lines.
 */
export function computeSideBySideDiff(oldText: string, newText: string): SideBySideRow[] {
  const lineDiffs = computeLineDiff(oldText, newText);
  const rows: SideBySideRow[] = [];
  let rowId = 0;

  let idx = 0;
  while (idx < lineDiffs.length) {
    const item = lineDiffs[idx];

    if (item.type === "equal") {
      rows.push({
        rowId: rowId++,
        left: {
          lineNumber: item.oldLineNumber!,
          text: item.text,
          type: "equal",
        },
        right: {
          lineNumber: item.newLineNumber!,
          text: item.text,
          type: "equal",
        },
      });
      idx++;
    } else if (item.type === "delete") {
      // Lookahead for next insert to pair together side-by-side
      if (idx + 1 < lineDiffs.length && lineDiffs[idx + 1].type === "insert") {
        const nextInsert = lineDiffs[idx + 1];
        const { oldInline, newInline } = computeInlineDiff(item.text, nextInsert.text);
        rows.push({
          rowId: rowId++,
          left: {
            lineNumber: item.oldLineNumber!,
            text: item.text,
            type: "delete",
            inlineDiffs: oldInline,
          },
          right: {
            lineNumber: nextInsert.newLineNumber!,
            text: nextInsert.text,
            type: "insert",
            inlineDiffs: newInline,
          },
        });
        idx += 2;
      } else {
        rows.push({
          rowId: rowId++,
          left: {
            lineNumber: item.oldLineNumber!,
            text: item.text,
            type: "delete",
          },
        });
        idx++;
      }
    } else if (item.type === "insert") {
      rows.push({
        rowId: rowId++,
        right: {
          lineNumber: item.newLineNumber!,
          text: item.text,
          type: "insert",
        },
      });
      idx++;
    }
  }

  return rows;
}

/**
 * Computes quick numerical summary of changes between two versions.
 */
export function computeDiffSummary(oldText: string, newText: string): DiffSummary {
  const oldLines = oldText ? oldText.split(/\r?\n/) : [];
  const newLines = newText ? newText.split(/\r?\n/) : [];

  const diffLines = computeLineDiff(oldText, newText);

  let addedLines = 0;
  let removedLines = 0;
  let unchangedLines = 0;

  for (const line of diffLines) {
    if (line.type === "insert") addedLines++;
    else if (line.type === "delete") removedLines++;
    else unchangedLines++;
  }

  return {
    addedLines,
    removedLines,
    unchangedLines,
    totalOldLines: oldLines.length,
    totalNewLines: newLines.length,
    charDelta: (newText?.length || 0) - (oldText?.length || 0),
  };
}
