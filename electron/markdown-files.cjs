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
const maxCachedSourceBytes = 4 * 1024 * 1024;
const maxCachedSources = 8;
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

module.exports = {
  markdownExtensions,
  generateStableChapterId,
  titleFromRelativePath,
  collectMarkdownFiles,
  buildDirectoryManifest,
  readMarkdownSource,
  saveMarkdownFile,
  atomicWriteFile,
  invalidateSourceCache,
  registerPath,
  isPathAllowed,
  isValidMarkdownPath,
};
