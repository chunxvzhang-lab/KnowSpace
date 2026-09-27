/**
 * Canvas export: rasterisation primitives.
 *
 * The pixel-budget scale clamp, the SVG image loader and the canvas→PNG
 * encoder used by the PNG pipeline in canvasExport.ts. No window/document
 * access, so this module runs in a plain Node environment; the DOM-carrying
 * orchestration stays in canvasExport.ts, the only export file on the L2
 * window/document whitelist (eslint gives NEW service files no pass).
 *
 * loadImageForExport and canvasToPngBlob were private helpers before the
 * split; they are exported here only so canvasExport.ts can reach them and
 * are deliberately NOT re-exported from the facade, keeping the public
 * import surface byte-stable.
 *
 * Split out of canvasExport during the phase-1 size split; the code is
 * byte-identical to the original there (which itself came from canvasService
 * in the R2 split). See canvasExport.ts for the import surface.
 */

/**
 * Rasterizes canvas SVG into a high-DPI PNG image Data URL
 */

/**
 * Hard ceiling on the rasterised pixel count. Beyond this the backing canvas
 * alone would hold ~100 MB and the subsequent PNG encode would allocate
 * roughly as much again — which is what used to crash (闪退) the renderer on
 * large boards.
 */
const MAX_EXPORT_PIXELS = 24_000_000;

/** Chromium refuses to allocate a canvas larger than 16384px on either side. */
const MAX_EXPORT_EDGE = 16_384;

/** Rasterisation watchdog; generous because big boards legitimately take a while. */
const EXPORT_RASTERISE_TIMEOUT_MS = 20_000;

/**
 * Clamps the requested export scale so the resulting bitmap always stays
 * inside both the per-side and the total-pixel limits. Without this a large
 * whiteboard exported at scale 2 would ask for a canvas the browser cannot
 * allocate, and the renderer would die instead of reporting an error.
 */
export function resolveExportScale(width: number, height: number, requested: number): number {
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  let scale = Math.max(0.1, requested);

  if (safeW * scale > MAX_EXPORT_EDGE) scale = MAX_EXPORT_EDGE / safeW;
  if (safeH * scale > MAX_EXPORT_EDGE) scale = Math.min(scale, MAX_EXPORT_EDGE / safeH);

  const maxByPixels = Math.sqrt(MAX_EXPORT_PIXELS / (safeW * safeH));
  if (scale > maxByPixels) scale = maxByPixels;

  return Math.max(0.1, scale);
}

export function loadImageForExport(url: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      img.src = "";
      reject(new Error("白板图片栅格化超时，请缩小画布范围后重试"));
    }, EXPORT_RASTERISE_TIMEOUT_MS);

    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("白板图片渲染失败"));
    };
    img.src = url;
  });
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("白板图片编码失败"));
      }, "image/png");
      return;
    }

    // Very old engines without toBlob: encode manually, byte by byte, so we
    // never build a multi-megabyte base64 string in one go.
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      resolve(new Blob([bytes], { type: "image/png" }));
    } catch (err) {
      reject(err instanceof Error ? err : new Error("白板图片编码失败"));
    }
  });
}
