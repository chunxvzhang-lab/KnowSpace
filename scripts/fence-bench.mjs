// Measures the fence-scan cost, old shape vs new shape, on realistic notes.
function makeNote(lines) {
  const out = [];
  for (let i = 0; i < lines; i++) {
    if (i % 37 === 0) out.push("```js");
    else if (i % 37 === 12) out.push("```");
    else out.push("正文第 " + i + " 行，包含 **格式** 与 `code` 以及一些中文内容。");
  }
  return out;
}

// OLD: called per line, walks everything above it.
function isInsideFenceOld(lines, index) {
  let fence = null;
  for (let i = 0; i < index; i += 1) {
    const match = /^\s*(```+|~~~+)/.exec(lines[i]);
    if (!match) continue;
    if (fence === null) fence = match[1][0];
    else if (match[1][0] === fence) fence = null;
  }
  return fence !== null;
}
function oldTotal(lines) {
  let n = 0;
  for (let pass = 0; pass < 3; pass += 1)
    for (let i = 0; i < lines.length; i++) if (isInsideFenceOld(lines, i)) n += 1;
  return n;
}

// NEW: one pass, then O(1) lookups.
function computeFenceMask(lines) {
  const mask = new Uint8Array(lines.length);
  let fence = null;
  for (let i = 0; i < lines.length; i += 1) {
    mask[i] = fence !== null ? 1 : 0;
    const match = /^\s*(```+|~~~+)/.exec(lines[i]);
    if (!match) continue;
    if (fence === null) fence = match[1][0];
    else if (match[1][0] === fence) fence = null;
  }
  return mask;
}
function newTotal(lines) {
  const mask = computeFenceMask(lines);
  let n = 0;
  for (let pass = 0; pass < 3; pass += 1)
    for (let i = 0; i < lines.length; i++) if (mask[i]) n += 1;
  return n;
}

for (const size of [500, 2000, 5000]) {
  const lines = makeNote(size);

  let t = performance.now();
  const a = oldTotal(lines);
  const oldMs = performance.now() - t;

  t = performance.now();
  const b = newTotal(lines);
  const newMs = performance.now() - t;

  const speedup = (oldMs / Math.max(newMs, 0.001)).toFixed(0);
  console.log(
    String(size).padStart(5) + " 行 | 旧 O(n^2): " + oldMs.toFixed(1).padStart(9) + " ms | 新 O(n): " +
      newMs.toFixed(2).padStart(7) + " ms | 提速 " + speedup + "x | 结果一致 " + (a === b)
  );
}
