import type { ManifestScanTruncation, ManifestScanUnreadable } from "./types";

/**
 * Turns a truncated directory scan into a sentence for the reader.
 *
 * Two places show a count of documents that may be short of the truth — the
 * document tree and the review's folder rows — and both have to qualify it. The
 * wording lives here rather than in each of them so the two cannot drift into
 * disagreeing about what the same marker means.
 *
 * Returns null for a scan that ran to completion, which is the common case and
 * the one that must stay silent.
 */
export function describeScanTruncation(
  truncated: ManifestScanTruncation | null | undefined,
): string | null {
  if (!truncated) return null;

  if (truncated.reason === "time") {
    return `目录过大，扫描超时，仅列出了前 ${truncated.seen} 篇。`;
  }

  if (truncated.reason === "depth") {
    const where = truncated.at ? `「${truncated.at}」` : "部分子目录";
    return `文件层级过深，${where}以下的文档未列出。`;
  }

  const remaining =
    truncated.remainingDirs && truncated.remainingDirs > 0
      ? `，还有 ${truncated.remainingDirs} 个目录未扫描`
      : "";
  return `文件数量达到上限，仅列出了前 ${truncated.seen} 篇${remaining}。`;
}

/** The last path segment, whichever separator produced it. */
function lastSegment(targetPath: string): string {
  return targetPath.split(/[\\/]/).filter(Boolean).pop() ?? targetPath;
}

/**
 * Turns a set of unreadable directories into a sentence.
 *
 * Says what the reader can act on: how many, and one example to recognise. The
 * errno decides the advice, because "permission denied" and "it is not there any
 * more" are fixed in completely different ways.
 *
 * Returns null when there is nothing to report, which is the common case.
 */
export function describeScanUnreadable(
  unreadable: ManifestScanUnreadable | null | undefined,
): string | null {
  if (!unreadable || unreadable.count === 0) return null;

  const where = unreadable.samples.length > 0 ? `「${lastSegment(unreadable.samples[0])}」` : "部分目录";

  if (unreadable.reason === "ENOENT") {
    return `有 ${unreadable.count} 个目录已不存在（${where} 等），可能已被移动或删除。`;
  }
  if (unreadable.reason === "ELOOP") {
    return `有 ${unreadable.count} 个目录的链接形成了循环（${where} 等），其中的文档未列出。`;
  }
  if (unreadable.reason === "ENOTDIR") {
    return `有 ${unreadable.count} 个路径不是目录（${where} 等），其中的文档未列出。`;
  }
  return `有 ${unreadable.count} 个目录没有读取权限（${where} 等），其中的文档未列出。`;
}
