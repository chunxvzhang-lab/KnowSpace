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
const MAX_DIRECTORY_SCAN_FILES = 3000;
const MAX_DIRECTORY_SCAN_DEPTH = 6;
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

async function readDirectoryEntries(directoryPath) {
  try {
    return await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error && ["EACCES", "EPERM", "ENOENT"].includes(error.code)) return [];
    throw error;
  }
}

async function collectMarkdownFiles(rootPath, basePath) {
  // Queue stores { dirPath, depth }
  const directories = [{ dirPath: rootPath, depth: 0 }];
  const files = [];

  for (let cursor = 0; cursor < directories.length && files.length < MAX_DIRECTORY_SCAN_FILES;) {
    const batch = directories.slice(cursor, cursor + directoryScanBatchSize);
    cursor += batch.length;
    const scanned = await Promise.all(batch.map((item) => readDirectoryEntries(item.dirPath)));

    for (let index = 0; index < batch.length; index += 1) {
      const currentItem = batch[index];
      const entries = scanned[index];
      for (const entry of entries) {
        if (entry.name.startsWith(".") || ignoredDirectoryNames.has(entry.name)) continue;
        const absolutePath = path.join(currentItem.dirPath, entry.name);
        if (entry.isDirectory()) {
          if (currentItem.depth < MAX_DIRECTORY_SCAN_DEPTH) {
            directories.push({ dirPath: absolutePath, depth: currentItem.depth + 1 });
          }
        } else if (entry.isFile() && isValidMarkdownPath(entry.name)) {
          files.push({
            absolutePath,
            relativePath: path.relative(basePath, absolutePath).replaceAll(path.sep, "/"),
          });
          if (files.length >= MAX_DIRECTORY_SCAN_FILES) break;
        }
      }
      if (files.length >= MAX_DIRECTORY_SCAN_FILES) break;
    }
  }

  return files;
}

async function buildDirectoryManifest(rootPath) {
  const resolvedRoot = path.resolve(rootPath);
  registerPath(resolvedRoot);
  const files = await collectMarkdownFiles(resolvedRoot, resolvedRoot);
  files.sort((a, b) => chapterCollator.compare(a.relativePath, b.relativePath));

  const chapters = files.map((file) => {
    registerPath(file.absolutePath);
    return {
      id: generateStableChapterId(file.relativePath),
      title: titleFromRelativePath(file.relativePath),
      src: file.relativePath,
      absolutePath: file.absolutePath,
      baseUrl: pathToFileURL(path.dirname(file.absolutePath) + path.sep).toString(),
    };
  });

  return {
    id: `directory:${resolvedRoot}`,
    title: path.basename(resolvedRoot) || resolvedRoot,
    rootPath: resolvedRoot,
    chapters,
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
async function readOutlineFile(absolutePath) {
  if (typeof absolutePath !== "string" || !/\.(opml|xml|mm|xmind)$/i.test(absolutePath)) {
    return { success: false, message: "只能导入 .xmind、.mm、.opml 或 .xml 大纲文件。" };
  }

  try {
    // Bytes, encoded for the trip. Not text: an .xmind is a ZIP, and which format
    // this is has to be decided by what is inside the file — so the main process
    // hands over the bytes and the renderer, which owns the parsers, decides.
    //
    // Base64 rather than the bytes themselves: this crosses an IPC boundary, and
    // an unambiguous string cannot be mangled by however a given Electron version
    // chooses to serialize a typed array.
    const bytes = await fs.readFile(path.resolve(absolutePath));
    return { success: true, contentBase64: bytes.toString("base64"), fileName: path.basename(absolutePath) };
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
  generateStableChapterId,
  titleFromRelativePath,
  collectMarkdownFiles,
  buildDirectoryManifest,
  readMarkdownSource,
  readMarkdownSourcesBatch,
  saveMarkdownFile,
  atomicWriteFile,
  invalidateSourceCache,
  registerPath,
  isPathAllowed,
  isValidMarkdownPath,
};
