// Measures the three per-render/ per-open scans that were replaced with lookups.
//
// Each pair is "the shape that was there" against "the shape that is there now",
// on inputs a real vault produces. Run: node scripts/render-cost-bench.mjs

// ── 1. ChapterList.buildTree ────────────────────────────────────────────────

function makeChapters(folders, perFolder) {
  const chapters = [];
  for (let f = 0; f < folders; f++) {
    for (let i = 0; i < perFolder; i++) {
      chapters.push({ src: `资料${f}/note-${String(i).padStart(4, "0")}.md` });
    }
  }
  return chapters;
}

function buildTreeOld(chapters) {
  const root = { name: "root", path: "", children: [] };
  for (const chapter of chapters) {
    const parts = chapter.src.replace(/\\/g, "/").split("/").filter(Boolean);
    let current = root;
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/");
      let child = current.children.find((item) => item.path === path);
      if (!child) {
        child = { name: part, path, children: [] };
        current.children.push(child);
      }
      current = child;
    });
  }
  return root;
}

function buildTreeNew(chapters) {
  const root = { name: "root", path: "", children: [] };
  const childrenByPath = new Map();
  childrenByPath.set(root, new Map());
  for (const chapter of chapters) {
    const parts = chapter.src.replace(/\\/g, "/").split("/").filter(Boolean);
    let current = root;
    let path = "";
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      path = path ? path + "/" + part : part;
      const siblings = childrenByPath.get(current);
      let child = siblings.get(path);
      if (!child) {
        child = { name: part, path, children: [] };
        siblings.set(path, child);
        current.children.push(child);
        childrenByPath.set(child, new Map());
      }
      current = child;
    }
  }
  return root;
}

function countNodes(node) {
  let n = 1;
  for (const c of node.children) n += countNodes(c);
  return n;
}

// ── 2. useReviewFolders path de-duplication ─────────────────────────────────

function makePaths(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(`C:/vault/专业课/note-${i}.md`);
  return out;
}

function dedupOld(paths) {
  const out = [];
  for (const path of paths) {
    if (!out.some((seen) => seen.toLowerCase() === path.toLowerCase())) out.push(path);
  }
  return out;
}

function dedupNew(paths) {
  const seen = new Set();
  const out = [];
  for (const path of paths) {
    const key = path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(path);
  }
  return out;
}

// ── 3. DailyReviewPanel: current card + remaining count ─────────────────────

function makeQueue(n) {
  return Array.from({ length: n }, (_, i) => ({ card: { id: "card-" + i } }));
}

function scanOld(queue, rated) {
  const current = queue.find((item) => !rated.has(item.card.id));
  const remaining = queue.filter((item) => !rated.has(item.card.id)).length;
  return { current, remaining };
}

function scanNew(queue, rated) {
  let unrated = 0;
  let firstUnrated;
  for (const item of queue) {
    if (rated.has(item.card.id)) continue;
    unrated += 1;
    if (firstUnrated === undefined) firstUnrated = item;
  }
  return { current: firstUnrated, remaining: unrated };
}

function time(label, fn) {
  const t = performance.now();
  const result = fn();
  return { ms: performance.now() - t, result };
}

function row(label, input, oldFn, newFn, newMs) {
  const a = time("old", () => oldFn(input));
  const b = time("new", () => newFn(input));
  const speedup = (a.ms / Math.max(b.ms, 0.0001)).toFixed(1);
  console.log(
    label.padEnd(38) +
      " 旧 " + a.ms.toFixed(1).padStart(9) + " ms" +
      "  新 " + b.ms.toFixed(2).padStart(7) + " ms" +
      "  提速 " + speedup.padStart(7) + "x"
  );
}

console.log("=== ChapterList.buildTree（宽目录：一个文件夹下的文档数）===");
for (const perFolder of [200, 1000, 3000]) {
  const chapters = makeChapters(3, perFolder);
  row(`${(perFolder * 3)} 篇 / 3 个文件夹`, chapters, buildTreeOld, buildTreeNew);
}

console.log("");
console.log("=== useReviewFolders 路径去重 ===");
for (const n of [500, 2000, 5000]) {
  const paths = makePaths(n);
  row(`${n} 个路径`, paths, dedupOld, dedupNew);
}

console.log("");
console.log("=== DailyReviewPanel 当前卡片 + 剩余计数（每次渲染）===");
for (const n of [500, 2000, 5000]) {
  const queue = makeQueue(n);
  // Half the session done — the realistic mid-review state.
  const rated = new Set(queue.slice(0, Math.floor(n / 2)).map((item) => item.card.id));
  row(`${n} 张卡 / 已评一半`, { queue, rated }, (x) => scanOld(x.queue, x.rated), (x) => scanNew(x.queue, x.rated));
}

console.log("");
console.log("=== 一致性 ===");
{
  const chapters = makeChapters(2, 50);
  const a = countNodes(buildTreeOld(chapters));
  const b = countNodes(buildTreeNew(chapters));
  console.log("buildTree 节点数一致:", a === b, "(" + a + ")");

  const paths = makePaths(100).concat(makePaths(100));
  console.log("去重结果一致:", JSON.stringify(dedupOld(paths)) === JSON.stringify(dedupNew(paths)));

  const queue = makeQueue(100);
  const rated = new Set(queue.slice(0, 40).map((i) => i.card.id));
  const so = scanOld(queue, rated);
  const sn = scanNew(queue, rated);
  console.log("扫描结果一致:", so.remaining === sn.remaining && so.current.card.id === sn.current.card.id);
}
