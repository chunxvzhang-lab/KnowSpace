/**
 * Canvas export: SVG generation, PNG rasterisation, download and clipboard.
 *
 * Every DOM and Electron-bridge call in the canvas layer lives here, which is
 * what lets the other canvas modules be tested without a browser.
 *
 * This file is the single import surface for the canvas export services. The
 * SVG string builder and the XML well-formedness pass live in
 * `./canvasExportSvg`, the rasterisation primitives (scale clamp, image
 * loading, canvas→PNG encoding) in `./canvasExportRaster` — both are
 * re-exported here. The sanitisation pipeline and the delivery pipelines (PNG
 * blob, download, clipboard) stay in this file: they are the parts that
 * reference window/document, and this is the only export file on the L2
 * window/document whitelist (eslint gives NEW service files no pass).
 *
 * Extracted from canvasService during the R2 split — see
 * the R2 canvas split. Phase-1 size split: the moved code is byte-identical
 * to the original.
 */

import type { CanvasData } from "../types/canvasTypes";
import { serializeSvgForExport } from "./svgExport";
import { computeBoundingBox } from "./canvasGeometry";
import {
  exportCanvasToSvg,
  valueBooleanAttributes,
  type CanvasExportOptions,
} from "./canvasExportSvg";
import { canvasToPngBlob, loadImageForExport, resolveExportScale } from "./canvasExportRaster";

export { exportCanvasToSvg, valueBooleanAttributes } from "./canvasExportSvg";
export type { CanvasExportOptions } from "./canvasExportSvg";
export { resolveExportScale } from "./canvasExportRaster";

/** True for references that stay inside the document and can never taint it. */
function isInternalReference(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("#")) return true;
  if (/^data:/i.test(trimmed)) return true;
  if (/^(blob|about|javascript):/i.test(trimmed)) return true;
  return false;
}

/**
 * Reads a URL into a data URL. Tries `fetch` first and falls back to XHR,
 * which is the only route that reliably reaches `file://` resources on a
 * `file://` page in Electron (fetch rejects them as cross-origin).
 */

/** Converts a file:// URL into an OS path, or null when it is not one. */
function fileUrlToPath(url: string): string | null {
  if (!/^file:\/\//i.test(url)) return null;
  let p = url.slice("file://".length);
  try {
    p = decodeURIComponent(p);
  } catch {
    // keep the raw value
  }
  if (/^\/[a-zA-Z]:/.test(p)) p = p.slice(1); // file:///C:/x → C:/x
  return p.replace(/\//g, "\\");
}

/** Bound on fetching a single external resource during export. */
const RESOURCE_READ_TIMEOUT_MS = 3000;

async function readUrlAsDataUrl(url: string): Promise<string | null> {
  // Local files first: the page's security context blocks fetch/XHR on
  // file:// resources, but the main process can read them directly — this is
  // what lets card images survive instead of being dropped from the export.
  const localPath = fileUrlToPath(url);
  if (localPath && typeof window !== "undefined") {
    const desktop = window.knowSpaceDesktop;
    if (desktop?.media.readFileAsDataUrl) {
      try {
        const res = await desktop.media.readFileAsDataUrl({ filePath: localPath });
        if (res?.success && res.dataUrl) return res.dataUrl;
      } catch {
        // fall through to the network paths
      }
    }
  }

  // Every read is time-boxed: a hanging remote image must never stall the
  // whole export, it just gets dropped.
  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), RESOURCE_READ_TIMEOUT_MS)
      : null;
    try {
      const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 0) return await blobToDataUrl(blob);
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    // fall through to XHR
  }

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.responseType = "blob";
      xhr.onload = () => {
        const blob = xhr.response as Blob | null;
        if (blob && blob.size > 0) {
          blobToDataUrl(blob)
            .then(finish)
            .catch(() => finish(null));
        } else {
          finish(null);
        }
      };
      xhr.onerror = () => finish(null);
      xhr.ontimeout = () => finish(null);
      xhr.onabort = () => finish(null);
      xhr.timeout = RESOURCE_READ_TIMEOUT_MS;
      xhr.send();
    } catch {
      finish(null);
    }
  });
}

/**
 * Rewrites an exported SVG so every external resource is either inlined as a
 * data URL or removed.
 *
 * An SVG loaded through a blob URL inherits the page's security context, so a
 * single `<img src="file://…">` or cross-origin image inside it taints the
 * canvas it is drawn onto — and a tainted canvas refuses `toBlob()`, which is
 * exactly the "Tainted canvases may not be exported" failure. Inlining keeps
 * the picture; anything we cannot read is dropped so the export still succeeds
 * instead of failing outright.
 */
export async function sanitizeSvgResources(svgString: string): Promise<string> {
  // ── Step 0: make the markup well-formed XML ──────────────────────────────
  // This has to happen FIRST. Card bodies are HTML (markdown-it runs without
  // xhtmlOut), so <br>, <img> and the task-list <input> arrive unclosed. In
  // XML an unclosed <img> swallows everything that follows it, which makes the
  // whole document fail to parse — and that in turn disabled every downstream
  // safeguard: sanitizeSvgViaDom() bailed out, stripSvgImages() returned its
  // input unchanged, and Chromium's error-recovery parser still loaded the
  // external <img>, tainting the canvas so toBlob() refused to run.
  const wellFormed = serializeSvgForExport(valueBooleanAttributes(svgString));

  const viaDom = await sanitizeSvgViaDom(wellFormed);
  if (viaDom !== null) return viaDom;
  // Still not parseable (some other malformation): fall back to a textual
  // rewrite. Less precise, but it keeps the export from failing outright.
  return sanitizeSvgViaRegex(wellFormed);
}

/** Returns null when the SVG could not be parsed as XML. */
async function sanitizeSvgViaDom(svgString: string): Promise<string | null> {
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    return null;
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
  } catch {
    return null;
  }
  if (doc.getElementsByTagName("parsererror").length > 0) return null;

  const targets: Array<{ el: Element; attr: string; url: string }> = [];
  const nodes = Array.from(doc.querySelectorAll("img, image"));
  for (const el of nodes) {
    for (const attr of ["src", "href", "xlink:href"]) {
      const url = el.getAttribute(attr);
      if (url && !isInternalReference(url)) {
        targets.push({ el, attr, url });
        break;
      }
    }
  }

  // CSS background images can taint the canvas just as easily.
  for (const el of Array.from(doc.querySelectorAll("[style]"))) {
    const style = el.getAttribute("style") ?? "";
    const match = /url\((['"]?)(?!data:|#)([^'")]+)\1\)/i.exec(style);
    if (match) targets.push({ el, attr: "style", url: match[2] });
  }

  if (targets.length === 0) return svgString;

  const resolved = await Promise.all(
    targets.map(async (t) => ({ ...t, dataUrl: await readUrlAsDataUrl(t.url) })),
  );

  for (const t of resolved) {
    if (t.attr === "style") {
      const style = t.el.getAttribute("style") ?? "";
      t.el.setAttribute(
        "style",
        t.dataUrl ? style.replace(t.url, t.dataUrl) : style.replace(/url\([^)]*\)/gi, "none"),
      );
      continue;
    }

    if (t.dataUrl) {
      t.el.setAttribute(t.attr, t.dataUrl);
      if (t.attr === "href") {
        t.el.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", t.dataUrl);
      }
    } else {
      t.el.remove();
    }
  }

  try {
    return new XMLSerializer().serializeToString(doc);
  } catch {
    return null;
  }
}

const SVG_IMAGE_TAG_RE =
  /<(?:img|image)\b[^>]*?\b(src|href|xlink:href)\s*=\s*(["'])(.*?)\2[^>]*?>/gi;

const SVG_CSS_URL_RE = /url\(\s*(["']?)(?!data:|#)([^'")]+)\1\s*\)/gi;

/** Textual fallback used when the SVG is not well-formed XML. */
async function sanitizeSvgViaRegex(svgString: string): Promise<string> {
  const urls = new Set<string>();
  let match: RegExpExecArray | null;

  SVG_IMAGE_TAG_RE.lastIndex = 0;
  while ((match = SVG_IMAGE_TAG_RE.exec(svgString)) !== null) {
    if (!isInternalReference(match[3])) urls.add(match[3]);
  }
  SVG_CSS_URL_RE.lastIndex = 0;
  while ((match = SVG_CSS_URL_RE.exec(svgString)) !== null) {
    if (!isInternalReference(match[2])) urls.add(match[2]);
  }
  if (urls.size === 0) return svgString;

  const resolved = new Map<string, string | null>();
  await Promise.all(
    [...urls].map(async (url) => {
      resolved.set(url, await readUrlAsDataUrl(url));
    }),
  );

  let out = svgString.replace(SVG_IMAGE_TAG_RE, (full, _attr, _quote, url) => {
    const dataUrl = resolved.get(url);
    if (dataUrl) return full.split(url).join(dataUrl);
    // Drop the element entirely — an unreadable external reference would
    // taint the canvas and abort the whole export.
    return "";
  });

  out = out.replace(SVG_CSS_URL_RE, (full, quote, url) => {
    const dataUrl = resolved.get(url);
    return dataUrl ? `url(${quote}${dataUrl}${quote})` : "none";
  });

  return out;
}

/**
 * Last-resort fallback: strips every image from the SVG. Used only when a
 * canvas still reports itself as tainted after sanitisation, so the user gets
 * a text-and-shape export rather than no file at all.
 */
function stripSvgImages(svgString: string): string {
  const viaDom = stripSvgImagesViaDom(svgString);
  if (viaDom !== null) return viaDom;

  // Textual fallback. This used to be the only path and it silently gave up
  // when the markup was not well-formed XML, which is precisely the case that
  // matters here — so now the regex always runs.
  return svgString.replace(SVG_IMAGE_TAG_RE, "").replace(SVG_CSS_URL_RE, "none");
}

/** Returns null when the SVG could not be parsed as XML. */
function stripSvgImagesViaDom(svgString: string): string | null {
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    return null;
  }
  try {
    const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
    if (doc.getElementsByTagName("parsererror").length > 0) return null;
    for (const el of Array.from(doc.querySelectorAll("img, image"))) el.remove();
    for (const el of Array.from(doc.querySelectorAll("[style]"))) {
      const style = el.getAttribute("style") ?? "";
      if (/url\(/i.test(style)) {
        el.setAttribute("style", style.replace(/url\([^)]*\)/gi, "none"));
      }
    }
    return new XMLSerializer().serializeToString(doc);
  } catch {
    return null;
  }
}

/** Detects the security error thrown when a canvas has been tainted. */
function isTaintedCanvasError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /tainted|securityerror|may not be exported|insecure/i.test(message);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("当前环境不支持图片转换"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("图片转换失败"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Rasterises the canvas into a PNG Blob.
 *
 * Returning a Blob (instead of a base64 data URL) is deliberate: a data URL
 * for a large board can exceed 80 MB of text, and every hop — the string
 * itself, the IPC structured clone, and the main-process Buffer conversion —
 * used to duplicate it, tripling peak memory and crashing the app.
 */
export async function exportCanvasToPngBlob(
  data: CanvasData,
  options?: CanvasExportOptions,
): Promise<Blob> {
  const svgString = exportCanvasToSvg(data, options);
  const bbox = computeBoundingBox(data.nodes);
  const pad = options?.padding ?? 48;
  const baseWidth = Math.max(800, Math.ceil(bbox.width + pad * 2));
  const baseHeight = Math.max(600, Math.ceil(bbox.height + pad * 2));

  const canRasterise =
    typeof document !== "undefined" &&
    typeof Image !== "undefined" &&
    typeof Blob !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function" &&
    Boolean(document.createElement("canvas").getContext?.("2d"));

  if (!canRasterise) {
    // Headless / test environment: hand back the vector so callers still get
    // a usable, if unscaled, image instead of an exception.
    return new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  }

  const scale = resolveExportScale(baseWidth, baseHeight, options?.scale ?? 2);

  // Inline every external reference (or drop what cannot be read) before the
  // SVG is loaded into an <img>. A single file:// or cross-origin resource
  // taints the canvas permanently, and a tainted canvas cannot be exported —
  // the exact "Tainted canvases may not be exported" failure users hit on
  // boards whose cards embed images.
  const safeSvg = await sanitizeSvgResources(svgString);

  const rasterise = async (svg: string): Promise<Blob> => {
    // A data: URL rather than a blob: URL — this is the form the (working)
    // mermaid export path has always used, and Chromium treats it as a fully
    // self-contained document rather than resolving its contents against the
    // page origin.
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const img = await loadImageForExport(dataUrl);

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(baseWidth * scale));
    canvas.height = Math.max(1, Math.round(baseHeight * scale));

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建 Canvas 2D 上下文");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    try {
      return await canvasToPngBlob(canvas);
    } finally {
      // Release the backing store right away — a 24 MP canvas pins ~96 MB.
      canvas.width = 0;
      canvas.height = 0;
    }
  };

  try {
    return await rasterise(safeSvg);
  } catch (err) {
    if (!isTaintedCanvasError(err)) throw err;

    // Something still slipped through (an unreachable relative path, a CSS
    // reference, a resource that loaded after we inspected it). Drop every
    // image and retry once so the user still gets a usable file rather than
    // an error dialog.
    const stripped = stripSvgImages(safeSvg);
    if (stripped === safeSvg) {
      throw new Error("白板包含无法内联的外部图片，浏览器安全策略阻止了图片导出", { cause: err });
    }
    try {
      return await rasterise(stripped);
    } catch (retryErr) {
      if (isTaintedCanvasError(retryErr)) {
        throw new Error("白板包含无法内联的外部图片，浏览器安全策略阻止了图片导出", {
          cause: retryErr,
        });
      }
      throw retryErr;
    }
  }
}

export async function exportCanvasToPng(
  data: CanvasData,
  options?: CanvasExportOptions,
): Promise<string> {
  const blob = await exportCanvasToPngBlob(data, options);
  return blobToDataUrl(blob);
}

/**
 * Triggers download of canvas as PNG or SVG file
 */
export type CanvasDownloadResult = "png" | "svg" | "canceled";

export async function downloadCanvasAsImage(
  data: CanvasData,
  filename: string,
  format: "png" | "svg" = "png",
  options?: CanvasExportOptions,
): Promise<CanvasDownloadResult> {
  const cleanName = filename.replace(/\.(png|svg|canvas)$/i, "");

  const saveSvg = (): void => {
    // Run the same well-formed-XML pass used by the rasteriser, so the saved
    // .svg file actually opens in a browser or Illustrator. Without it the
    // unclosed tags and valueless boolean attributes from the card HTML
    // produce a file most viewers reject.
    const svgContent = serializeSvgForExport(
      valueBooleanAttributes(exportCanvasToSvg(data, options)),
    );
    const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cleanName}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (format === "svg") {
    saveSvg();
    return "svg";
  }

  const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;

  const buildExportSvg = (): string =>
    serializeSvgForExport(valueBooleanAttributes(exportCanvasToSvg(data, options)));

  // PNG export. Rasterising in the renderer uses a <canvas>, which the
  // browser's security model can veto outright. If that happens we do NOT
  // silently hand back an SVG — the board is re-rendered in an offscreen
  // window in the main process instead, where capturePage() composites inside
  // Chromium and is not bound by the canvas tainting rules.
  let blob: Blob | null = null;
  try {
    blob = await exportCanvasToPngBlob(data, options);
  } catch (err) {
    console.warn("渲染进程栅格化失败，改用主进程离屏渲染:", err);
  }

  if (!blob && desktop?.media.exportCanvasAsPng) {
    const res = await desktop.media.exportCanvasAsPng({
      svg: buildExportSvg(),
      filename: `${cleanName}.png`,
      scale: 2,
    });
    if (res?.canceled) return "canceled";
    if (res?.success) return "png";
    console.warn("主进程离屏渲染同样失败:", res?.message);
  }

  if (!blob) {
    // Every rasterisation route is exhausted — hand over the vector file
    // rather than an error dialog, but report it honestly.
    saveSvg();
    return "svg";
  }

  // Preferred path: hand the raw bytes to the main process. Passing a base64
  // data URL instead meant the payload was duplicated as a string and then
  // again during IPC serialisation, which is what made big exports crash.
  if (desktop?.media.savePngBuffer) {
    const buffer = await blob.arrayBuffer();
    const res = await desktop.media.savePngBuffer({
      buffer,
      filename: `${cleanName}.png`,
    });
    if (res?.canceled) return "canceled";
    if (res?.success) return "png";
    throw new Error(res?.message || "保存图片失败");
  }

  // Legacy bridge without the buffer API
  if (desktop?.media.savePngData && blob.type === "image/png") {
    const dataUrl = await blobToDataUrl(blob);
    const res = await desktop.media.savePngData({ dataUrl, filename: `${cleanName}.png` });
    if (res?.canceled) return "canceled";
    if (res?.success) return "png";
    throw new Error(res?.message || "保存图片失败");
  }

  // Browser fallback: download straight from the Blob URL (no base64 step)
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${cleanName}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "png";
}

/**
 * Copies the canvas PNG image directly to system clipboard
 */
export async function copyCanvasImageToClipboard(
  data: CanvasData,
  options?: CanvasExportOptions,
): Promise<boolean> {
  const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;

  let blob: Blob | null = null;
  try {
    blob = await exportCanvasToPngBlob(data, options);
  } catch (err) {
    console.warn("渲染进程栅格化失败，改由主进程离屏渲染后复制:", err);
  }

  if (blob && blob.type === "image/png") {
    // The native clipboard is preferred: navigator.clipboard.write() needs the
    // window to be focused and a live user gesture, both of which are easy to
    // lose inside Electron — which is why copying used to do nothing at all.
    if (desktop?.media.copyPngToClipboard) {
      try {
        const res = await desktop.media.copyPngToClipboard({ buffer: await blob.arrayBuffer() });
        if (res?.success) return true;
      } catch (err) {
        console.warn("原生剪贴板写入失败，回退到 Web API:", err);
      }
    }

    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof ClipboardItem !== "undefined"
    ) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        return true;
      } catch (err) {
        console.warn("Web 剪贴板写入失败:", err);
      }
    }
  }

  // Last resort: let the main process render the board offscreen and put the
  // result on the clipboard itself. capturePage() is not subject to the canvas
  // tainting rules, so this still works when the renderer path was blocked.
  if (desktop?.media.copyCanvasAsImage) {
    try {
      const svg = serializeSvgForExport(valueBooleanAttributes(exportCanvasToSvg(data, options)));
      const res = await desktop.media.copyCanvasAsImage({ svg, scale: 2 });
      if (res?.success) return true;
      console.warn("离屏渲染复制失败:", res?.message);
    } catch (err) {
      console.warn("离屏渲染复制异常:", err);
    }
  }

  return false;
}
