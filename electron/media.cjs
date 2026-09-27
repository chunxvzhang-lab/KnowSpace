const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");

/**
 * PNG/SVG export and clipboard handlers: Mermaid SVG → PNG through an
 * offscreen window, whiteboard canvas export, saving raw PNG data/buffers,
 * reading files as data URLs and writing images to the system clipboard.
 *
 * context (from main.cjs): { getWindowFromEvent }
 */

/**
 * Renders an SVG document in an offscreen window and returns the PNG bytes.
 *
 * This deliberately bypasses the renderer's <canvas> pipeline. `capturePage()`
 * composites the page inside Chromium itself, so it succeeds even when the SVG
 * references resources that would "taint" a canvas and make `toBlob()` refuse
 * to run — which is exactly why exporting a board whose cards embed local or
 * remote images used to produce an SVG instead of a PNG.
 */
async function renderSvgToPngBuffer(svgMarkup, scale = 2) {
  const viewBoxMatch = /viewBox\s*=\s*"([-\d.eE]+)\s+([-\d.eE]+)\s+([\d.eE]+)\s+([\d.eE]+)"/i.exec(
    svgMarkup,
  );
  let naturalWidth = viewBoxMatch ? parseFloat(viewBoxMatch[3]) : 0;
  let naturalHeight = viewBoxMatch ? parseFloat(viewBoxMatch[4]) : 0;

  if (!(naturalWidth > 0)) {
    const wm = /\bwidth\s*=\s*"([\d.]+)/i.exec(svgMarkup);
    naturalWidth = wm ? parseFloat(wm[1]) : 1600;
  }
  if (!(naturalHeight > 0)) {
    const hm = /\bheight\s*=\s*"([\d.]+)/i.exec(svgMarkup);
    naturalHeight = hm ? parseFloat(hm[1]) : 1200;
  }

  // Same pixel budget the renderer enforces, so huge boards stay affordable.
  const maxByPixels = Math.sqrt(24000000 / (naturalWidth * naturalHeight));
  const safeScale = Math.max(1, Math.min(scale, 3.5, maxByPixels));
  const targetWidth = Math.max(320, Math.min(Math.round(naturalWidth * safeScale), 4800));
  const targetHeight = Math.max(240, Math.min(Math.round(naturalHeight * safeScale), 4800));

  const offscreenWin = new BrowserWindow({
    width: targetWidth,
    height: targetHeight,
    show: false,
    webPreferences: { offscreen: true, contextIsolation: false },
  });

  try {
    const pageHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
  svg { display: block; shape-rendering: geometricPrecision; text-rendering: geometricPrecision; }
</style></head><body>${svgMarkup}</body></html>`;

    // Written through document.write rather than a data: URL so that very
    // large boards (inlined base64 images) are not limited by URL length.
    await offscreenWin.loadURL("about:blank");
    await offscreenWin.webContents.executeJavaScript(
      `document.open();document.write(${JSON.stringify(pageHtml)});document.close();true;`,
    );
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Pin the drawing to the exact capture resolution
    await offscreenWin.webContents.executeJavaScript(`
      (() => {
        const svg = document.querySelector('svg');
        if (!svg) return false;
        svg.setAttribute('width', '${targetWidth}');
        svg.setAttribute('height', '${targetHeight}');
        svg.style.width = '${targetWidth}px';
        svg.style.height = '${targetHeight}px';
        return true;
      })()
    `);
    await new Promise((resolve) => setTimeout(resolve, 250));

    const image = await offscreenWin.webContents.capturePage({
      x: 0,
      y: 0,
      width: targetWidth,
      height: targetHeight,
    });
    return image.toPNG();
  } finally {
    if (offscreenWin && !offscreenWin.isDestroyed()) offscreenWin.destroy();
  }
}

function registerMediaHandlers(context) {
  ipcMain.handle("bookmd:save-png-data", async (event, request = {}) => {
    const targetWin = context.getWindowFromEvent(event);
    const { dataUrl, filename = "mermaid-diagram" } = request;
    if (!dataUrl) return { success: false, message: "缺少图片数据" };

    const cleanFilename = (filename || "mermaid-diagram").replace(/\.(svg|png)$/i, "");
    const defaultPath = path.join(app.getPath("downloads"), `${cleanFilename}.png`);

    const saveResult = await dialog.showSaveDialog(targetWin || undefined, {
      title: "导出 Mermaid 架构图为 PNG 高清图片",
      defaultPath,
      filters: [
        { name: "PNG 高清图片 (*.png)", extensions: ["png"] },
        { name: "所有文件 (*.*)", extensions: ["*"] },
      ],
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { canceled: true };
    }

    try {
      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      await fs.promises.writeFile(saveResult.filePath, buffer);
      return { success: true, filePath: saveResult.filePath };
    } catch (err) {
      console.error("Failed to write PNG file:", err);
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle("bookmd:read-file-as-data-url", async (event, request = {}) => {
    const { filePath } = request;
    if (!filePath || typeof filePath !== "string") {
      return { success: false, message: "缺少文件路径" };
    }

    try {
      const data = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const mime =
        ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "gif"
            ? "image/gif"
            : ext === "webp"
              ? "image/webp"
              : ext === "svg"
                ? "image/svg+xml"
                : ext === "bmp"
                  ? "image/bmp"
                  : "image/png";
      return { success: true, dataUrl: `data:${mime};base64,${data.toString("base64")}` };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle("bookmd:save-png-buffer", async (event, request = {}) => {
    const targetWin = context.getWindowFromEvent(event);
    const { buffer, filename = "KnowSpace白板" } = request;
    if (!buffer) return { success: false, message: "缺少图片数据" };

    const cleanFilename = (filename || "KnowSpace白板").replace(/\.(svg|png)$/i, "");
    const defaultPath = path.join(app.getPath("downloads"), `${cleanFilename}.png`);

    const saveResult = await dialog.showSaveDialog(targetWin || undefined, {
      title: "导出白板为 PNG 高清图片",
      defaultPath,
      filters: [
        { name: "PNG 高清图片 (*.png)", extensions: ["png"] },
        { name: "所有文件 (*.*)", extensions: ["*"] },
      ],
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { canceled: true };
    }

    try {
      // The renderer sends a plain ArrayBuffer (arriving as a Uint8Array here),
      // so no base64 decoding is needed and peak memory stays flat.
      const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      await fs.promises.writeFile(saveResult.filePath, data);
      return { success: true, filePath: saveResult.filePath };
    } catch (err) {
      console.error("Failed to write PNG file:", err);
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle("bookmd:export-svg-as-png", async (event, request = {}) => {
    const targetWin = context.getWindowFromEvent(event);
    const { svgHtml, theme = "twitter", filename = "mermaid-diagram" } = request;
    if (!svgHtml) return { success: false, message: "缺少 SVG 源码" };

    const cleanFilename = (filename || "mermaid-diagram").replace(/\.(svg|png)$/i, "");
    const defaultPath = path.join(app.getPath("downloads"), `${cleanFilename}.png`);

    const saveResult = await dialog.showSaveDialog(targetWin || undefined, {
      title: "导出 Mermaid 架构图为 PNG 高清图片",
      defaultPath,
      filters: [
        { name: "PNG 高清图片 (*.png)", extensions: ["png"] },
        { name: "所有文件 (*.*)", extensions: ["*"] },
      ],
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { canceled: true };
    }

    // Initial window size for measuring
    const offscreenWin = new BrowserWindow({
      width: 1920,
      height: 1080,
      show: false,
      webPreferences: {
        offscreen: true,
        contextIsolation: false,
      },
    });

    try {
      const isDark = theme === "twitter" || (theme === "system" && nativeTheme.shouldUseDarkColors);
      const bgColor = isDark ? "#000000" : "#ffffff";
      const textColor = isDark ? "#e7e9ea" : "#0f1419";

      const pageHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {
    box-sizing: border-box;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: geometricPrecision;
  }
  html, body {
    margin: 0;
    padding: 0;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background-color: ${bgColor};
    color: ${textColor};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif;
  }
  svg {
    width: 100vw;
    height: 100vh;
    display: block;
    margin: 0;
    shape-rendering: geometricPrecision;
    text-rendering: geometricPrecision;
  }
</style>
</head>
<body>
  ${svgHtml}
</body>
</html>`;

      await offscreenWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(pageHtml)}`);
      // Wait for DOM & SVG to parse
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Measure exact bounding box and update viewBox to tightly frame contents
      const metrics = await offscreenWin.webContents.executeJavaScript(`
        (() => {
          const svg = document.querySelector('svg');
          if (!svg) return { success: false, width: 1200, height: 800 };

          svg.style.margin = '0';
          svg.style.position = 'static';
          svg.style.transform = 'none';
          svg.style.maxWidth = 'none';
          svg.style.maxHeight = 'none';

          let bbox;
          try {
            bbox = svg.getBBox();
          } catch (e) {
            const vb = svg.viewBox && svg.viewBox.baseVal;
            bbox = {
              x: vb ? vb.x : 0,
              y: vb ? vb.y : 0,
              width: vb && vb.width ? vb.width : (svg.clientWidth || 1200),
              height: vb && vb.height ? vb.height : (svg.clientHeight || 800),
            };
          }

          const pad = Math.max(20, Math.round(Math.min(bbox.width, bbox.height) * 0.035));
          const finalX = bbox.x - pad;
          const finalY = bbox.y - pad;
          const finalWidth = Math.max(Math.ceil(bbox.width + pad * 2), 100);
          const finalHeight = Math.max(Math.ceil(bbox.height + pad * 2), 80);

          svg.setAttribute('viewBox', finalX + ' ' + finalY + ' ' + finalWidth + ' ' + finalHeight);
          svg.removeAttribute('width');
          svg.removeAttribute('height');
          svg.style.width = '100vw';
          svg.style.height = '100vh';

          return {
            success: true,
            width: finalWidth,
            height: finalHeight,
          };
        })()
      `);

      const naturalWidth = metrics?.width || 1200;
      const naturalHeight = metrics?.height || 800;

      // Compute Ultra-HD Retina resolution (2.0x to 3.5x scale)
      const scale = Math.max(2.0, Math.min(3200 / naturalWidth, 3.5));
      const targetWidth = Math.max(Math.min(Math.round(naturalWidth * scale), 4800), 600);
      const targetHeight = Math.max(Math.min(Math.round(naturalHeight * scale), 4800), 400);

      offscreenWin.setSize(targetWidth, targetHeight);
      offscreenWin.setContentSize(targetWidth, targetHeight);

      // Wait for layout to settle at high resolution
      await new Promise((resolve) => setTimeout(resolve, 200));

      const image = await offscreenWin.webContents.capturePage({
        x: 0,
        y: 0,
        width: targetWidth,
        height: targetHeight,
      });

      const pngBuffer = image.toPNG();
      await fs.promises.writeFile(saveResult.filePath, pngBuffer);
      return { success: true, filePath: saveResult.filePath };
    } catch (err) {
      console.error("Failed to render and save PNG:", err);
      return { success: false, message: err.message };
    } finally {
      if (offscreenWin && !offscreenWin.isDestroyed()) {
        offscreenWin.destroy();
      }
    }
  });

  ipcMain.handle("bookmd:export-canvas-as-png", async (event, request = {}) => {
    const targetWin = context.getWindowFromEvent(event);
    const { svg, filename = "KnowSpace白板", scale = 2 } = request;
    if (!svg) return { success: false, message: "缺少白板 SVG 数据" };

    const cleanFilename = (filename || "KnowSpace白板").replace(/\.(svg|png)$/i, "");
    const defaultPath = path.join(app.getPath("downloads"), `${cleanFilename}.png`);

    const saveResult = await dialog.showSaveDialog(targetWin || undefined, {
      title: "导出白板为 PNG 高清图片",
      defaultPath,
      filters: [
        { name: "PNG 高清图片 (*.png)", extensions: ["png"] },
        { name: "所有文件 (*.*)", extensions: ["*"] },
      ],
    });

    if (saveResult.canceled || !saveResult.filePath) return { canceled: true };

    try {
      const pngBuffer = await renderSvgToPngBuffer(svg, scale);
      await fs.promises.writeFile(saveResult.filePath, pngBuffer);
      return { success: true, filePath: saveResult.filePath };
    } catch (err) {
      console.error("离屏渲染白板 PNG 失败:", err);
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle("bookmd:copy-canvas-as-image", async (event, request = {}) => {
    const { svg, scale = 2 } = request;
    if (!svg) return { success: false, message: "缺少白板 SVG 数据" };

    try {
      const pngBuffer = await renderSvgToPngBuffer(svg, scale);
      const image = nativeImage.createFromBuffer(pngBuffer);
      if (image.isEmpty()) return { success: false, message: "生成的图片为空" };
      clipboard.writeImage(image);
      return { success: true };
    } catch (err) {
      console.error("离屏渲染并复制白板图片失败:", err);
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle("bookmd:copy-png-to-clipboard", async (event, request = {}) => {
    const { buffer } = request;
    if (!buffer) return { success: false, message: "缺少图片数据" };

    try {
      // The native clipboard does not need window focus or a user gesture, both
      // of which make navigator.clipboard.write() unreliable inside Electron.
      const image = nativeImage.createFromBuffer(
        Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer),
      );
      if (image.isEmpty()) return { success: false, message: "图片数据无效" };
      clipboard.writeImage(image);
      return { success: true };
    } catch (err) {
      console.error("写入系统剪贴板失败:", err);
      return { success: false, message: err.message };
    }
  });
}

module.exports = { registerMediaHandlers };
