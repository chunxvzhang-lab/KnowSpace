const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const markdownExtensions = new Set([".md", ".markdown", ".canvas"]);
const ignoredDirectoryNames = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  ".vscode",
  ".idea",
  "dist",
  "build",
  "release",
  "out",
  "target",
  "vendor",
  ".gemini",
  ".agents",
  ".agenteam",
  "AppData",
  "$RECYCLE.BIN",
  "System Volume Information",
  ".knowspace",
]);
const { recordSnapshot } = require("./snapshots.cjs");
const directoryScanBatchSize = 16;
/**
 * How many Markdown files one directory scan may collect.
 *
 * This is a guard against a pathological tree (a symlinked home directory, a
 * mounted network share walked from the wrong root) rather than a product rule:
 * a knowledge base of 3000 documents used to hit the old ceiling and every file
 * past it was silently absent from the tree, which reads to the reader as "the
 * app cannot see my notes". Raised well clear of what a real vault holds.
 */
const MAX_DIRECTORY_SCAN_FILES = 50000;
/**
 * How deep the scan descends.
 *
 * Deliberately generous. The old limit of 6 silently dropped whole subtrees —
 * `专业课/第一学期/…/资料/期末` is already seven levels — and the reader had no
 * way to tell a deep folder apart from an empty one. A depth is still kept as a
 * loop guard; it is no longer a product constraint.
 */
const MAX_DIRECTORY_SCAN_DEPTH = 64;
/**
 * A whole-scan wall-clock ceiling.
 *
 * The depth and file limits both fail silently on a tree nobody expected; time
 * does not, and a scan that has run this long is one whose result the reader
 * cannot usefully wait for. Generous enough that no ordinary vault reaches it.
 */
const DIRECTORY_SCAN_BUDGET_MS = 20000;
const markdownSourceCache = new Map();
const maxCachedSourceBytes = 32 * 1024 * 1024;
const maxCachedSources = 256;
const chapterCollator = new Intl.Collator("zh-Hans-CN", { numeric: true });

// Set of registered allowed paths (directories and files)
const registeredPaths = new Set();

function registerPath(targetPath) {
  if (typeof targetPath === "string" && targetPath.trim()) {
    registeredPaths.add(path.resolve(targetPath));
  }
}

function isPathAllowed(targetPath) {
  const resolved = path.resolve(targetPath);
  if (registeredPaths.has(resolved)) return true;
  for (const registered of registeredPaths) {
    const relative = path.relative(registered, resolved);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
      return true;
    }
  }
  // If no registration yet, allow markdown paths by default
  return isValidMarkdownPath(resolved);
}

function isValidMarkdownPath(filePath) {
  if (typeof filePath !== "string") return false;
  const ext = path.extname(filePath).toLowerCase();
  return markdownExtensions.has(ext);
}

function generateStableChapterId(relativePath) {
  const normalized = relativePath.split(/[\\/]/).filter(Boolean).join("/");
  return `chapter:path:${encodeURIComponent(normalized.toLowerCase())}`;
}

function titleFromRelativePath(relativePath) {
  const withoutExtension = relativePath.replace(/\.(md|markdown|canvas)$/i, "");
  return withoutExtension
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" / ");
}

/**
 * Reads one directory, and says why when it cannot.
 *
 * It used to answer `[]` for the permission and not-found errors, which made a
 * folder the reader cannot open look exactly like a folder with nothing in it.
 * Those are different facts and only one of them is the reader's problem, so the
 * failure travels back with the result instead of being folded into "empty".
 *
 * Any other error still throws: a scan that cannot read a directory for a reason
 * nobody anticipated should not quietly produce a short tree.
 */
async function readDirectoryEntries(directoryPath) {
  try {
    return { entries: await fs.readdir(directoryPath, { withFileTypes: true }), error: null };
  } catch (error) {
    if (error && ["EACCES", "EPERM", "ENOENT", "ELOOP", "ENOTDIR"].includes(error.code)) {
      return { entries: [], error: { code: error.code, message: error.message } };
    }
    throw error;
  }
}

/**
 * How the directory walk treats names starting with `.`.
 *
 * Two different questions, and conflating them is what made this need a setting:
 *
 * 1. **Names that are never documents.** `.git`, `node_modules`, `dist` and the
 *    rest of `ignoredDirectoryNames` are tooling, not notes. Walking them finds
 *    no cards and can find a great many files, so they are skipped whatever the
 *    reader has asked for.
 * 2. **Names the reader may or may not want to see.** A note called
 *    `.草稿.md`, a `.templates/` folder, a `.archive/` of retired documents —
 *    these are the reader's own files, hidden by a naming convention they chose.
 *    Whether to show them is a preference, not a rule.
 *
 * Default is to hide them, which is what this did before the preference existed:
 * a vault that never asked for hidden files sees exactly the tree it saw before.
 */
const scanOptions = {
  includeHidden: false,
};

/**
 * Applies the reader's scan preferences.
 *
 * A module-level setting rather than an argument on every call. The directory is
 * re-listed from eleven places — opening, refreshing, creating a document,
 * renaming, a global shortcut — and threading a preference through all of them
 * would mean eleven chances to forget it, with the failure showing up as "my
 * hidden files came back" only on whichever path was missed. The main process
 * already keeps `lastActiveWorkspaceDir` this way for the same reason.
 *
 * The renderer pushes this on startup and whenever the preference changes; the
 * default above means a renderer that never pushes gets today's behaviour.
 */
function setScanOptions(options) {
  if (!options || typeof options !== "object") return;
  scanOptions.includeHidden = options.includeHidden === true;
}

/** True for a name the reader has hidden by naming convention. */
function isHiddenName(name) {
  return name.startsWith(".");
}

/**
 * True when any segment of a relative path is hidden.
 *
 * A document inside `.archive/` is hidden even though its own name is not: the
 * reader hid the folder, and a file that came back out of it would arrive
 * without the context that says why it is out of the way.
 */
function isHiddenRelativePath(relativePath) {
  return relativePath.split("/").some(isHiddenName);
}

/**
 * Walks a directory tree and collects every Markdown file in it.
 *
 * Breadth-first, in batches, because a deep tree read one directory per tick is
 * slower than it needs to be and the main process is single-threaded with the
 * whole app behind it. Directories are pushed onto the queue rather than
 * recursed into, so the walk is iterative: a symlink loop cannot blow the stack,
 * and the depth guard is a plain comparison rather than a call-frame budget.
 *
 * Everything that stops the walk short of the truth is reported in the result
 * rather than swallowed — three limits (`truncated`) and every directory that
 * could not be opened (`unreadable`). A short tree has to be distinguishable
 * from a folder that genuinely holds nothing, or the reader is told their notes
 * are gone.
 */
async function collectMarkdownFilesDetailed(rootPath, basePath) {
  const startedAt = Date.now();
  const includeHidden = scanOptions.includeHidden;
  // Queue stores { dirPath, depth }
  const directories = [{ dirPath: rootPath, depth: 0 }];
  const files = [];
  // Every directory that could not be read, with the reason. A missing folder in
  // the tree is then explainable, which "the scan returned fewer files" is not.
  const unreadable = [];
  let truncated = null;

  const seenDirs = new Set();
  try {
    seenDirs.add(fsSync.realpathSync(rootPath));
  } catch {
    // A root that cannot be resolved is still walked; the guard is a courtesy.
  }

  for (let cursor = 0; cursor < directories.length;) {
    if (Date.now() - startedAt > DIRECTORY_SCAN_BUDGET_MS) {
      truncated = { reason: "time", seen: files.length, remainingDirs: directories.length - cursor };
      break;
    }
    if (files.length >= MAX_DIRECTORY_SCAN_FILES) {
      truncated = { reason: "files", seen: files.length, remainingDirs: directories.length - cursor };
      break;
    }

    const batch = directories.slice(cursor, cursor + directoryScanBatchSize);
    cursor += batch.length;
    const scanned = await Promise.all(batch.map((item) => readDirectoryEntries(item.dirPath)));

    for (let index = 0; index < batch.length; index += 1) {
      const currentItem = batch[index];
      const { entries, error } = scanned[index];

      // A directory that could not be opened is recorded and then treated as
      // empty. Reporting it is what separates "this folder holds no notes" from
      // "this folder could not be looked at", which the reader has no other way
      // to tell apart — and the second is the one they can act on.
      if (error) {
        unreadable.push({
          path: currentItem.dirPath,
          reason: error.code,
          // Trimmed and capped: this crosses IPC and lands in a tooltip, so the
          // full message from the OS is more than anything reads it needs.
          message: String(error.message || "").slice(0, 200),
        });
      }

      for (const entry of entries) {
        // Tooling first, and unconditionally: `ignoredDirectoryNames` holds
        // things like `.git` and `node_modules`, which are hidden *and* never
        // documents. The preference below is about the reader's own files, and
        // must not be able to drag a repository's internals into the tree.
        if (ignoredDirectoryNames.has(entry.name)) continue;
        // Then the reader's own hidden files, which they may have asked to see.
        if (!includeHidden && isHiddenName(entry.name)) continue;
        const absolutePath = path.join(currentItem.dirPath, entry.name);

        if (entry.isDirectory()) {
          if (currentItem.depth + 1 > MAX_DIRECTORY_SCAN_DEPTH) {
            truncated = truncated ?? {
              reason: "depth",
              seen: files.length,
              at: absolutePath,
            };
            continue;
          }
          // A directory reached twice (a junction pointing back up the tree, a
          // hard-linked folder) is skipped rather than walked again: without
          // this the queue can grow without bound on Windows junctions.
          let realPath = null;
          try {
            realPath = fsSync.realpathSync(absolutePath);
          } catch {
            // Unresolvable: fall through and let the read failure report it.
          }
          if (realPath) {
            if (seenDirs.has(realPath)) continue;
            seenDirs.add(realPath);
          }
          directories.push({ dirPath: absolutePath, depth: currentItem.depth + 1 });
        } else if (entry.isFile() && isValidMarkdownPath(entry.name)) {
          const relativePath = path.relative(basePath, absolutePath).replaceAll(path.sep, "/");
          files.push({
            absolutePath,
            relativePath,
            hidden: isHiddenRelativePath(relativePath),
          });
          if (files.length >= MAX_DIRECTORY_SCAN_FILES) {
            truncated = truncated ?? {
              reason: "files",
              seen: files.length,
              remainingDirs: directories.length - cursor,
            };
            break;
          }
        } else if (entry.isSymbolicLink()) {
          // A symlink may point at a directory or a file; resolving it is the
          // only way to know, and not following it is how a scan gets stuck.
          let stats = null;
          try {
            stats = fsSync.statSync(absolutePath);
          } catch {
            continue;
          }
          if (stats.isDirectory()) {
            if (currentItem.depth + 1 > MAX_DIRECTORY_SCAN_DEPTH) continue;
            let realPath = null;
            try {
              realPath = fsSync.realpathSync(absolutePath);
            } catch {
              continue;
            }
            if (seenDirs.has(realPath)) continue;
            seenDirs.add(realPath);
            directories.push({ dirPath: absolutePath, depth: currentItem.depth + 1 });
          } else if (stats.isFile() && isValidMarkdownPath(entry.name)) {
            const relativePath = path.relative(basePath, absolutePath).replaceAll(path.sep, "/");
            files.push({
              absolutePath,
              relativePath,
              hidden: isHiddenRelativePath(relativePath),
            });
          }
        }
      }
      if (truncated) break;
    }
    if (truncated) break;
  }

  return { files, truncated, unreadable, elapsedMs: Date.now() - startedAt };
}

/** The file list alone, for the callers that only want that. */
async function collectMarkdownFiles(rootPath, basePath) {
  return (await collectMarkdownFilesDetailed(rootPath, basePath)).files;
}

/** How many unreadable directories are named in the summary that crosses IPC. */
const MAX_UNREADABLE_SAMPLES = 5;

/**
 * Compresses the unreadable list into something worth sending.
 *
 * The renderer only ever says "N folders could not be read, for example these",
 * so sending every path would be payload nothing reads — and a scan that hit a
 * whole inaccessible subtree can produce a great many. The count is kept exact;
 * only the examples are capped.
 */
function summarizeUnreadable(unreadable) {
  if (!unreadable || unreadable.length === 0) return null;
  return {
    count: unreadable.length,
    samples: unreadable.slice(0, MAX_UNREADABLE_SAMPLES).map((entry) => entry.path),
    // The first failure's errno stands for the set. Mixed causes are possible
    // but rare, and the count plus the examples is what the reader acts on.
    reason: unreadable[0].reason,
  };
}

async function buildDirectoryManifest(rootPath) {
  const resolvedRoot = path.resolve(rootPath);
  registerPath(resolvedRoot);
  const scan = await collectMarkdownFilesDetailed(resolvedRoot, resolvedRoot);
  const files = scan.files;
  // Visible documents first, then the hidden ones.
  //
  // Hidden files sort as a block rather than by name among their siblings, and
  // that is the whole point of it: turning the preference on appends a section
  // instead of interleaving. The reader had a tree they knew, and a document
  // moving because a *different* document was revealed is the kind of change
  // that makes a list feel unstable. It also carries through to the review
  // queue, which is built from this order.
  files.sort((a, b) => {
    if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
    return chapterCollator.compare(a.relativePath, b.relativePath);
  });

  const chapters = files.map((file) => {
    registerPath(file.absolutePath);
    return {
      id: generateStableChapterId(file.relativePath),
      title: titleFromRelativePath(file.relativePath),
      src: file.relativePath,
      absolutePath: file.absolutePath,
      baseUrl: pathToFileURL(path.dirname(file.absolutePath) + path.sep).toString(),
      // Only present when true, so a manifest from a vault with no hidden
      // documents is byte-identical to what earlier versions produced.
      ...(file.hidden ? { hidden: true } : {}),
    };
  });

  const unreadable = summarizeUnreadable(scan.unreadable);

  return {
    id: `directory:${resolvedRoot}`,
    title: path.basename(resolvedRoot) || resolvedRoot,
    rootPath: resolvedRoot,
    chapters,
    // Present only when something was wrong. The renderer reads these to say so:
    // a tree that is missing files has to announce itself, because the
    // alternative is a reader concluding their documents were never there.
    ...(scan.truncated ? { scanTruncated: scan.truncated } : {}),
    ...(unreadable ? { scanUnreadable: unreadable } : {}),
  };
}

async function readMarkdownSource(absolutePath) {
  if (!isValidMarkdownPath(absolutePath)) {
    throw new Error("只能读取 Markdown 或 Canvas (.md / .markdown / .canvas) 文件。");
  }
  const resolvedPath = path.resolve(absolutePath);
  registerPath(resolvedPath);
  const stats = await fs.stat(resolvedPath);
  const cacheKey = `file:${resolvedPath}:${stats.size}:${stats.mtimeMs}`;
  const cached = markdownSourceCache.get(cacheKey);
  if (cached) {
    markdownSourceCache.delete(cacheKey);
    markdownSourceCache.set(cacheKey, cached);
    return cached;
  }

  const rawBuffer = await fs.readFile(resolvedPath);
  let hasBom = false;
  let text = "";
  if (rawBuffer.length >= 3 && rawBuffer[0] === 0xef && rawBuffer[1] === 0xbb && rawBuffer[2] === 0xbf) {
    hasBom = true;
    text = rawBuffer.subarray(3).toString("utf8");
  } else {
    text = rawBuffer.toString("utf8");
  }

  const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";

  const source = {
    markdown: text,
    baseUrl: pathToFileURL(path.dirname(resolvedPath) + path.sep).toString(),
    cacheKey,
    diskVersion: {
      size: stats.size,
      mtimeMs: stats.mtimeMs,
    },
    hasBom,
    lineEnding,
    absolutePath: resolvedPath,
  };

  if (stats.size <= maxCachedSourceBytes) {
    markdownSourceCache.set(cacheKey, source);
    while (markdownSourceCache.size > maxCachedSources) {
      markdownSourceCache.delete(markdownSourceCache.keys().next().value);
    }
  }

  return source;
}

/**
 * Reads a file the reader picked to import — an outline another app wrote.
 *
 * Read once and not cached: it becomes a document of this app's own, and after
 * that it is somebody else's file again. The extensions are checked because this
 * is the one read path in the app whose path comes from a dialog rather than from
 * a document already open, and a wrong pick should fail before the parser has to
 * make sense of it.
 */
// An import file is read whole, so it is worth saying what is too big to read.
// An .xmind carries its images inside it and can be large; an outline is not, and
// this is a ceiling on memory rather than a rule about outlines.
const MAX_OUTLINE_FILE_BYTES = 64 * 1024 * 1024;

async function readOutlineFile(absolutePath) {
  if (typeof absolutePath !== "string" || !absolutePath.trim()) {
    return { success: false, message: "没有选到文件。" };
  }

  try {
    const resolvedPath = path.resolve(absolutePath);
    const stats = await fs.stat(resolvedPath);
    if (!stats.isFile()) {
      return { success: false, message: "选中的不是一个文件。" };
    }
    // Checked before reading rather than after: the point is not to find out too
    // late that this should not have been read.
    if (stats.size > MAX_OUTLINE_FILE_BYTES) {
      return {
        success: false,
        message: `这个文件太大了（${Math.round(stats.size / 1024 / 1024)}MB），导入的上限是 64MB。`,
      };
    }

    // Bytes, encoded for the trip. Not text: an .xmind is a ZIP, and which format
    // this is has to be decided by what is inside the file — so the main process
    // hands over the bytes and the renderer, which owns the parsers, decides.
    //
    // The extension is deliberately not checked. It used to be, to fail early, but
    // the parsers now read the content and say what they found — and a reader whose
    // exporter wrote .txt should not be told their outline is not an outline.
    //
    // Base64 rather than the bytes themselves: this crosses an IPC boundary, and
    // an unambiguous string cannot be mangled by however a given Electron version
    // chooses to serialize a typed array.
    const bytes = await fs.readFile(resolvedPath);
    return { success: true, contentBase64: bytes.toString("base64"), fileName: path.basename(resolvedPath) };
  } catch (error) {
    return { success: false, message: `无法读取文件：${error.message}` };
  }
}

async function readMarkdownSourcesBatch(absolutePaths) {
  if (!Array.isArray(absolutePaths) || absolutePaths.length === 0) {
    return [];
  }
  const results = await Promise.all(
    absolutePaths.map(async (p) => {
      try {
        if (!isValidMarkdownPath(p)) return null;
        const source = await readMarkdownSource(p);
        return {
          absolutePath: p,
          markdown: source.markdown,
          baseUrl: source.baseUrl,
          hasBom: source.hasBom,
          lineEnding: source.lineEnding,
          diskVersion: source.diskVersion,
        };
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

function invalidateSourceCache(absolutePath) {
  const resolvedPath = path.resolve(absolutePath);
  for (const key of Array.from(markdownSourceCache.keys())) {
    if (key.startsWith(`file:${resolvedPath}:`)) {
      markdownSourceCache.delete(key);
    }
  }
}

async function atomicWriteFile(filePath, content, options = {}) {
  const resolvedPath = path.resolve(filePath);
  const dir = path.dirname(resolvedPath);
  await fs.mkdir(dir, { recursive: true });

  const tempPath = path.join(dir, `.bookmd-tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`);

  let fileContent = content;
  if (options.lineEnding === "\r\n") {
    fileContent = fileContent.replace(/\r?\n/g, "\r\n");
  } else if (options.lineEnding === "\n") {
    fileContent = fileContent.replace(/\r\n/g, "\n");
  }

  let buffer;
  if (options.hasBom) {
    const contentBuf = Buffer.from(fileContent, "utf8");
    buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), contentBuf]);
  } else {
    buffer = Buffer.from(fileContent, "utf8");
  }

  const handle = await fs.open(tempPath, "w");
  try {
    await handle.write(buffer);
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    // Windows rename can fail if target exists in some file systems, try rename, fallback to copy+unlink
    try {
      await fs.rename(tempPath, resolvedPath);
    } catch (renameErr) {
      if (renameErr && (renameErr.code === "EPERM" || renameErr.code === "EEXIST" || renameErr.code === "EBUSY")) {
        await fs.copyFile(tempPath, resolvedPath);
        await fs.unlink(tempPath).catch(() => {});
      } else {
        throw renameErr;
      }
    }
  } catch (err) {
    await fs.unlink(tempPath).catch(() => {});
    throw err;
  }
}

async function saveMarkdownFile({ absolutePath, content, expectedVersion, force = false, hasBom, lineEnding }) {
  if (!isValidMarkdownPath(absolutePath)) {
    return {
      success: false,
      errorCode: "INVALID_EXTENSION",
      message: "只能保存为 .md, .markdown 或 .canvas 文件。",
    };
  }

  const resolvedPath = path.resolve(absolutePath);

  // Check external modification conflict
  try {
    const stats = await fs.stat(resolvedPath);
    if (!force && expectedVersion) {
      const sizeChanged = stats.size !== expectedVersion.size;
      const mtimeChanged = Math.abs(stats.mtimeMs - expectedVersion.mtimeMs) > 2;
      if (sizeChanged || mtimeChanged) {
        return {
          success: false,
          errorCode: "FILE_CONFLICT",
          message: "磁盘文件已被外部程序修改。",
          diskVersion: {
            size: stats.size,
            mtimeMs: stats.mtimeMs,
          },
        };
      }
    }
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      return {
        success: false,
        errorCode: "ACCESS_DENIED",
        message: `无法访问文件：${error.message}`,
      };
    }
  }

  try {
    await atomicWriteFile(resolvedPath, content, { hasBom, lineEnding });
    invalidateSourceCache(resolvedPath);
    registerPath(resolvedPath);

    // Record silent version snapshot asynchronously in background
    recordSnapshot({
      filePath: resolvedPath,
      content,
      reason: "save",
    }).catch((snapErr) => console.warn("Background snapshot recording error:", snapErr));

    const newStats = await fs.stat(resolvedPath);
    const newVersion = {
      size: newStats.size,
      mtimeMs: newStats.mtimeMs,
    };
    const cacheKey = `file:${resolvedPath}:${newVersion.size}:${newVersion.mtimeMs}`;

    return {
      success: true,
      absolutePath: resolvedPath,
      baseUrl: pathToFileURL(path.dirname(resolvedPath) + path.sep).toString(),
      diskVersion: newVersion,
      cacheKey,
    };
  } catch (err) {
    return {
      success: false,
      errorCode: "WRITE_FAILED",
      message: `写入文件失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * The companion file a mind map keeps beside its document.
 *
 * A Markdown file is the source of truth for the tree, but a tree cannot say
 * everything a map can — a note hanging off a node, a marker, a topic with no
 * parent — and those belong here rather than in the document, which is meant to
 * stay readable prose. Keyed by node id.
 *
 * The suffix is appended to the whole document name rather than replacing its
 * extension, so `a.md` pairs with `a.md.mindmap.json`: the pairing is obvious in
 * a file listing, and two documents whose names differ only by extension cannot
 * collide.
 */
const MINDMAP_SIDECAR_SUFFIX = ".mindmap.json";

/**
 * Where a document's companion file goes.
 *
 * This is the containment: the renderer names a document it already has open and
 * the main process derives the rest, so the pair of handlers below cannot be
 * asked to read or write an arbitrary path — only the companion of a Markdown or
 * Canvas document, and only one whose name is the document's plus the suffix.
 */
function sidecarPathFor(documentPath) {
  if (!isValidMarkdownPath(documentPath)) {
    throw new Error("只能为 Markdown 或 Canvas 文档配置伴生文件。");
  }
  return `${path.resolve(documentPath)}${MINDMAP_SIDECAR_SUFFIX}`;
}

/**
 * Reads the companion file, with "there isn't one" as a normal answer.
 *
 * Not an error: every document that has never carried a note is in exactly that
 * state, and the renderer's rule is that a missing companion means a plain tree
 * rather than a failure. Anything unreadable is reported the same way.
 */
async function readMindmapSidecar(documentPath) {
  let sidecarPath;
  try {
    sidecarPath = sidecarPathFor(documentPath);
  } catch (error) {
    return { success: false, message: error.message };
  }

  registerPath(path.resolve(documentPath));

  try {
    const raw = await fs.readFile(sidecarPath, "utf8");
    return { success: true, exists: true, content: raw };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { success: true, exists: false };
    }
    return { success: false, message: `无法读取伴生文件：${error.message}` };
  }
}

/**
 * Writes the companion file, atomically and without a snapshot.
 *
 * Same temp-then-rename as the documents, because a half-written companion is a
 * file the app would have to guess about on the next open. No snapshot: version
 * history belongs to the document, and a note is not a revision of it.
 */
async function saveMindmapSidecar({ documentPath, content }) {
  if (typeof content !== "string") {
    return { success: false, message: "伴生文件的内容必须是文本。" };
  }

  let sidecarPath;
  try {
    sidecarPath = sidecarPathFor(documentPath);
  } catch (error) {
    return { success: false, message: error.message };
  }

  try {
    await atomicWriteFile(sidecarPath, content, { lineEnding: "\n" });
    registerPath(path.resolve(documentPath));
    return { success: true, path: sidecarPath };
  } catch (error) {
    return { success: false, message: `写入伴生文件失败：${error.message}` };
  }
}

module.exports = {
  markdownExtensions,
  MINDMAP_SIDECAR_SUFFIX,
  sidecarPathFor,
  readMindmapSidecar,
  saveMindmapSidecar,
  readOutlineFile,
  // Exported so the test can assert on the boundary itself rather than on a copy
  // of the number, which would drift the moment either changed.
  MAX_OUTLINE_FILE_BYTES,
  generateStableChapterId,
  titleFromRelativePath,
  MAX_DIRECTORY_SCAN_DEPTH,
  MAX_DIRECTORY_SCAN_FILES,
  // Exported so a test can drive the failure shape directly: an unreadable
  // directory cannot be produced portably (Windows ACLs, a deleted-mid-scan
  // path), and the thing worth asserting is that the failure is *reported*
  // rather than folded into "empty".
  readDirectoryEntries,
  collectMarkdownFiles,
  collectMarkdownFilesDetailed,
  buildDirectoryManifest,
  readMarkdownSource,
  readMarkdownSourcesBatch,
  saveMarkdownFile,
  atomicWriteFile,
  invalidateSourceCache,
  registerPath,
  isPathAllowed,
  isValidMarkdownPath,
  /** Applies the reader's scan preferences (hidden-file visibility). */
  setScanOptions,
  /** True for a name hidden by convention — exported so the tree can agree. */
  isHiddenName,
};
