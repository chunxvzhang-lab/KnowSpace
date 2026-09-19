/**
 * Handing a file to the reader.
 *
 * The same eight lines every export used to carry for itself — build a blob, mint
 * a URL, click an anchor, take the anchor away, revoke the URL — written once
 * because seven copies of a sequence is seven chances to get one of them wrong,
 * and the failure is silent: a file that never arrives, or one with the wrong name
 * on it, in one menu row out of six.
 *
 * Nothing here is mind-map specific, and nothing here is tested through the menu
 * that happens to call it: the menu rows and their handlers are checked elsewhere,
 * and this is checked by what it does to the document.
 */

/** A blob to hand over: text, bytes, or something that is already a blob. */
export type DownloadData = string | Uint8Array | Blob;

export interface DownloadOptions {
  fileName: string;
  data: DownloadData;
  mime: string;
}

/**
 * A block for a Blob, out of whatever was given.
 *
 * Bytes are **copied** rather than passed through, and that is not tidiness: a
 * `Uint8Array` may be a window onto a larger buffer — a slice of a decoded file,
 * a view into a canvas' pixels — and the file would then carry whatever else was
 * in the buffer. The copy is exact by construction, so nothing downstream has to
 * know which kind of array it got.
 */
function toBlobPart(data: DownloadData): BlobPart {
  if (typeof data === "string" || data instanceof Blob) return data;
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

/** Saves these bytes under this name, opened with this type. */
export function downloadFile({ fileName, data, mime }: DownloadOptions): void {
  const blob = new Blob([toBlobPart(data)], { type: mime });
  const url = URL.createObjectURL(blob);

  // An anchor that is in the document, clicked, and taken out again: a detached
  // one is not followed by every engine, and leaving it behind is a node in the
  // reader's DOM for a file they already have.
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // The URL is released as soon as the click is over. Nothing fetches it later:
  // the browser has taken what it needs by the time the click returns.
  URL.revokeObjectURL(url);
}
