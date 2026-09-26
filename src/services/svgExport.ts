/**
 * Utility for serializing, rasterizing, and exporting SVG/Mermaid graphics as high-res PNG images.
 */

export function serializeSvgForExport(svgInput: string | SVGElement | HTMLElement): string {
  let content: string;
  if (typeof svgInput === "string") {
    content = svgInput;
  } else if (svgInput instanceof SVGSVGElement || svgInput instanceof HTMLElement) {
    try {
      content = new XMLSerializer().serializeToString(svgInput);
    } catch {
      content = svgInput.outerHTML;
    }
  } else {
    content = String(svgInput);
  }

  // 1. Ensure XML namespaces on root <svg>
  if (!content.includes('xmlns="http://www.w3.org/2000/svg"')) {
    content = content.replace(/<svg\b([^>]*)>/i, '<svg xmlns="http://www.w3.org/2000/svg" $1>');
  }
  if (!content.includes("xmlns:xlink=") && content.includes("xlink:")) {
    content = content.replace(
      /<svg\b([^>]*)>/i,
      '<svg xmlns:xlink="http://www.w3.org/1999/xlink" $1>',
    );
  }

  // 2. Fix all HTML-style self-closing void elements inside foreignObject (<br>, <hr>, <img ...>, etc.)
  content = content.replace(
    /<(br|hr|img|input|meta|link)(\s+[^>]*)?\/?>/gi,
    (_match, tag, attrs = "") => {
      const cleanAttrs = attrs.trim();
      return cleanAttrs ? `<${tag} ${cleanAttrs} />` : `<${tag} />`;
    },
  );

  // 3. Try to validate with DOMParser if available in browser
  if (typeof DOMParser !== "undefined") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "image/svg+xml");
      const parserError = doc.querySelector("parsererror");
      if (!parserError && doc.documentElement) {
        content = new XMLSerializer().serializeToString(doc);
      }
    } catch {
      // Use regex-repaired content
    }
  }

  // 4. Ensure XML declaration header
  if (!content.trim().startsWith("<?xml")) {
    content = `<?xml version="1.0" encoding="UTF-8"?>\n` + content;
  }

  return content;
}

/**
 * Triggers browser file download helper
 */
export function triggerDownload(urlOrDataUri: string, filename: string, ext: string): void {
  const a = document.createElement("a");
  a.href = urlOrDataUri;
  const cleanName = filename.replace(/\.(svg|png)$/i, "");
  a.download = `${cleanName}${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Renders an existing in-DOM SVGSVGElement into a pixel-perfect, high-DPI PNG Data URL.
 * Automatically wraps content in precise getBBox boundaries with theme background and full styling.
 */
export async function rasterizeRenderedSvgToPng(
  svgElement: SVGSVGElement,
  theme = "twitter",
  scale = 3,
): Promise<string> {
  // 1. Measure real bounding box in the active DOM
  let bbox: { x: number; y: number; width: number; height: number };
  try {
    bbox = svgElement.getBBox();
  } catch {
    const vb = svgElement.viewBox && svgElement.viewBox.baseVal;
    bbox = {
      x: vb ? vb.x : 0,
      y: vb ? vb.y : 0,
      width: vb?.width || svgElement.clientWidth || 800,
      height: vb?.height || svgElement.clientHeight || 600,
    };
  }

  // 4% padding around the bounding box (minimum 24px)
  const pad = Math.max(24, Math.round(Math.min(bbox.width, bbox.height) * 0.04));
  const minX = bbox.x - pad;
  const minY = bbox.y - pad;
  const totalWidth = Math.max(Math.ceil(bbox.width + pad * 2), 100);
  const totalHeight = Math.max(Math.ceil(bbox.height + pad * 2), 80);

  // 2. Clone the SVG element
  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("viewBox", `${minX} ${minY} ${totalWidth} ${totalHeight}`);
  clone.setAttribute("width", `${totalWidth}`);
  clone.setAttribute("height", `${totalHeight}`);
  clone.removeAttribute("style");
  clone.style.width = `${totalWidth}px`;
  clone.style.height = `${totalHeight}px`;

  // 3. Add background rect inside the SVG
  const isDark =
    theme === "twitter" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bgRect.setAttribute("x", `${minX}`);
  bgRect.setAttribute("y", `${minY}`);
  bgRect.setAttribute("width", `${totalWidth}`);
  bgRect.setAttribute("height", `${totalHeight}`);
  bgRect.setAttribute("fill", isDark ? "#000000" : "#ffffff");
  clone.insertBefore(bgRect, clone.firstChild);

  // 4. Collect and inject all document styles (Mermaid classes, font styles)
  let cssText = "";
  if (typeof document !== "undefined") {
    try {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            cssText += rule.cssText + "\n";
          }
        } catch {
          // Ignore cross-origin stylesheet errors
        }
      }
    } catch {
      // Ignore stylesheet errors
    }
  }

  if (cssText) {
    const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
    styleEl.textContent = cssText;
    clone.appendChild(styleEl);
  }

  // 5. Serialize
  const serialized = serializeSvgForExport(clone);
  const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(serialized);

  // 6. Draw to canvas at scale
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    const timeout = setTimeout(() => {
      reject(new Error("Image rasterization timeout"));
    }, 4000);

    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(totalWidth * scale);
        canvas.height = Math.round(totalHeight * scale);

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Cannot get canvas context");
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const pngDataUrl = canvas.toDataURL("image/png");
        resolve(pngDataUrl);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err) => {
      clearTimeout(timeout);
      reject(err);
    };

    img.src = dataUrl;
  });
}

/**
 * Converts an SVG string (or SVG element) to a high-resolution PNG image and triggers download.
 *
 * @param svgInput SVG markup string or SVGSVGElement
 * @param filename File name without extension (or with .png)
 * @param targetElement Optional DOM element for measuring live rendered dimensions
 * @param scaleMultiplier Resolution multiplier (defaults to 2 for crisp 2x retina display)
 */
export async function downloadSvgAsPng(
  svgInput: string | SVGElement,
  filename: string,
  targetElement?: HTMLElement | SVGElement | null,
  scaleMultiplier = 2,
): Promise<void> {
  const cleanXml = serializeSvgForExport(svgInput);

  // 1. Determine natural width and height
  let width = 800;
  let height = 600;

  if (targetElement) {
    const rect = targetElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      width = Math.round(rect.width);
      height = Math.round(rect.height);
    }
  }

  // If width/height still need extraction, parse from viewBox or attributes
  const viewBoxMatch = cleanXml.match(
    /viewBox=["']\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*["']/i,
  );
  if (viewBoxMatch) {
    const vbWidth = parseFloat(viewBoxMatch[3]);
    const vbHeight = parseFloat(viewBoxMatch[4]);
    if (vbWidth > 0 && vbHeight > 0) {
      width = Math.round(vbWidth);
      height = Math.round(vbHeight);
    }
  } else {
    const widthMatch = cleanXml.match(/\bwidth=["']\s*([0-9.]+)(?:px)?\s*["']/i);
    const heightMatch = cleanXml.match(/\bheight=["']\s*([0-9.]+)(?:px)?\s*["']/i);
    if (widthMatch && heightMatch) {
      const w = parseFloat(widthMatch[1]);
      const h = parseFloat(heightMatch[1]);
      if (w > 0 && h > 0) {
        width = Math.round(w);
        height = Math.round(h);
      }
    }
  }

  // Ensure minimum dimensions
  width = Math.max(width, 100);
  height = Math.max(height, 60);

  // 2. Inject explicit width and height attributes into the root <svg> tag for reliable rasterization
  let rasterXml = cleanXml;
  if (!rasterXml.match(/<svg\b[^>]*\bwidth=["']/i)) {
    rasterXml = rasterXml.replace(/<svg\b/i, `<svg width="${width}"`);
  }
  if (!rasterXml.match(/<svg\b[^>]*\bheight=["']/i)) {
    rasterXml = rasterXml.replace(/<svg\b/i, `<svg height="${height}"`);
  }

  // 3. Try rasterizing to PNG, with automatic fallback
  try {
    await rasterizeSvgToPngDownload(rasterXml, width, height, filename, scaleMultiplier);
  } catch (err) {
    console.warn("PNG rasterization encountered error, downloading clean SVG fallback:", err);
    downloadSvgFile(cleanXml, filename);
  }
}

async function rasterizeSvgToPngDownload(
  svgXml: string,
  width: number,
  height: number,
  filename: string,
  scaleMultiplier: number,
): Promise<void> {
  const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgXml);

  return new Promise<void>((resolve, reject) => {
    const img = new Image();
    let timeoutId: number | null = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Rasterization image load timeout"));
    }, 4000);

    img.onload = () => {
      cleanup();
      try {
        const finalScale = Math.max(scaleMultiplier, 3);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width * finalScale);
        canvas.height = Math.round(height * finalScale);

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Canvas 2D context not available");
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // Draw image onto high-DPI canvas
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Export to Blob
        canvas.toBlob((pngBlob) => {
          if (!pngBlob) {
            try {
              const dataUri = canvas.toDataURL("image/png");
              triggerDownload(dataUri, filename, ".png");
              resolve();
            } catch (canvasErr) {
              reject(canvasErr);
            }
            return;
          }

          const pngUrl = URL.createObjectURL(pngBlob);
          triggerDownload(pngUrl, filename, ".png");
          setTimeout(() => {
            URL.revokeObjectURL(pngUrl);
            resolve();
          }, 100);
        }, "image/png");
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err) => {
      cleanup();
      reject(new Error(`Failed to load SVG for rasterization: ${err}`));
    };

    img.src = dataUrl;
  });
}

/**
 * Triggers browser file download of an SVG string as a valid .svg XML file.
 */
export function downloadSvgFile(svgContent: string | SVGElement, filename: string): void {
  const cleanXml = serializeSvgForExport(svgContent);
  const blob = new Blob([cleanXml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename, ".svg");
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 100);
}
