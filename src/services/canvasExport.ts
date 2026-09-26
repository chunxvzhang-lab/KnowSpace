/**
 * Canvas export: SVG generation, PNG rasterisation, download and clipboard.
 *
 * Every DOM and Electron-bridge call in the canvas layer lives here, which is
 * what lets the other canvas modules be tested without a browser.
 *
 * Extracted from canvasService during the R2 split — see
 * the R2 canvas split. Code is byte-identical to the original.
 */

import type { CanvasData, CanvasGroupNode, CanvasNode } from "../types/canvasTypes";
import { renderCardMarkdown } from "./markdown";
import { serializeSvgForExport } from "./svgExport";
import { getCanvasThemeColors, normalizeExportTheme } from "./canvasTheme";
import { CANVAS_COLOR_PALETTES, getMediaFileType } from "./canvasPrimitives";
import {
  computeBoundingBox,
  getNodeAnchorPoint,
  getOptimalAnchorSides,
  projectPointOntoRing,
} from "./canvasGeometry";
import { computeEdgePath, computeEdgeMidpoint } from "./canvasRouting";
import { computeSourceDisplayColorMap, getEffectiveEdgeColorKey } from "./canvasColor";

/**
 * Options for exporting infinite canvas as image
 */
export interface CanvasExportOptions {
  title?: string;
  theme?: string;
  background?: "theme" | "white" | "transparent";
  padding?: number;
  scale?: number;
}

function escapeSvgXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generates an ultra-crisp, standalone SVG vector representation of the canvas
 */
export function exportCanvasToSvg(
  data: CanvasData,
  options?: CanvasExportOptions
): string {
  // The very same palette the on-screen renderer uses, so the exported image
  // matches what the user is looking at. This used to be a hand-maintained
  // copy that had drifted: the light theme exported on a #f8fafc backdrop
  // instead of #ffffff, e-ink lost its paper tone, and the dot grid never
  // matched in any theme.
  const themePalette = getCanvasThemeColors(normalizeExportTheme(options?.theme));
  const isDark = themePalette.isDark;
  const isEink = themePalette.isEink;

  const bbox = computeBoundingBox(data.nodes);
  const pad = options?.padding ?? 48;
  const minX = bbox.minX - pad;
  const minY = bbox.minY - pad;
  const width = Math.max(800, Math.ceil(bbox.width + pad * 2));
  const height = Math.max(600, Math.ceil(bbox.height + pad * 2));

  const bgColor =
    options?.background === "transparent"
      ? "none"
      : options?.background === "white"
      ? "#ffffff"
      : themePalette.canvasBg;

  const cardBg = themePalette.cardBg;
  const cardText = themePalette.cardText;
  const cardBorder = themePalette.cardBorder;
  const defaultEdgeColor = themePalette.edgeColor;
  const dotColor = themePalette.dotColor;

  const nodeMap = new Map<string, CanvasNode>(data.nodes.map((n) => [n.id, n]));

  // Build a source-aware color map so SVG export is byte-identical to the
  // on-screen renderer (which reconciles color collisions inside containers
  // and across the canvas via the same logic).
  const sourceDisplayColorMap = computeSourceDisplayColorMap(data.nodes, data.edges);
  // Pre-collect any hex colors that actually appear on edges so we register
  // matching arrow markers up-front in <defs>.
  const exportHexColors = new Set<string>();
  for (const edge of data.edges) {
    const effectiveColorKey = edge.color || (edge.fromNode ? sourceDisplayColorMap.get(edge.fromNode) : undefined);
    if (effectiveColorKey && effectiveColorKey.startsWith("#")) {
      exportHexColors.add(effectiveColorKey);
    }
  }

  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">`
  );

  // Definitions (Filters, Grid Pattern, Arrow Markers)
  lines.push(`  <defs>`);
  lines.push(`    <filter id="card-shadow" x="-8%" y="-8%" width="120%" height="120%">`);
  lines.push(`      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="rgba(0,0,0,0.18)" />`);
  lines.push(`    </filter>`);
  if (bgColor !== "none") {
    lines.push(`    <pattern id="canvas-dots" width="28" height="28" patternUnits="userSpaceOnUse">`);
    lines.push(`      <circle cx="2" cy="2" r="1.2" fill="${dotColor}" />`);
    lines.push(`    </pattern>`);
  }
  // Arrow markers for each palette color
  Object.entries(CANVAS_COLOR_PALETTES).forEach(([k, c]) => {
    lines.push(
      `    <marker id="arrow-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="${c.stroke}" /></marker>`
    );
  });
  // Arrow markers for any custom hex colors that may appear on edges
  exportHexColors.forEach((hex) => {
    lines.push(
      `    <marker id="arrow-${hex.replace("#", "hex-")}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="${hex}" /></marker>`
    );
  });
  lines.push(
    `    <marker id="arrow-default" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="${defaultEdgeColor}" /></marker>`
  );
  lines.push(`  </defs>`);

  // ── Embedded stylesheet ──────────────────────────────────────────────────
  // Mirrors the on-screen card styling so the exported image reproduces every
  // visible element (header tint, origin badge, rich Markdown body, …).
  lines.push(`  <style><![CDATA[`);
  lines.push(`    .ks-card{width:100%;height:100%;box-sizing:border-box;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;background:${themePalette.cardBg};box-shadow:${themePalette.cardShadow};font-family:system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;}`);
  lines.push(`    .ks-hdr{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 10px;font-size:11px;font-weight:600;border-bottom:1px solid ${themePalette.cardHeaderBorder};flex-shrink:0;}`);
  lines.push(`    .ks-title{display:inline-flex;align-items:center;gap:4px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}`);
  lines.push(`    .ks-badge{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;white-space:nowrap;flex-shrink:0;}`);
  lines.push(`    .ks-body{flex:1;padding:8px 12px;overflow:hidden;font-size:13px;line-height:1.6;color:${themePalette.cardText};}`);
  lines.push(`    .ks-body > *:first-child{margin-top:0;}`);
  lines.push(`    .ks-body > *:last-child{margin-bottom:0;}`);
  lines.push(`    .ks-body h1{font-size:17px;font-weight:700;margin:0 0 8px;}`);
  lines.push(`    .ks-body h2{font-size:15.5px;font-weight:700;margin:0 0 8px;}`);
  lines.push(`    .ks-body h3{font-size:14px;font-weight:700;margin:0 0 6px;}`);
  lines.push(`    .ks-body h4,.ks-body h5,.ks-body h6{font-size:13px;font-weight:700;margin:0 0 6px;}`);
  lines.push(`    .ks-body p{margin:0 0 6px;}`);
  lines.push(`    .ks-body ul,.ks-body ol{margin:0 0 6px;padding-left:20px;}`);
  lines.push(`    .ks-body li{margin:2px 0;}`);
  lines.push(`    .ks-body li.task-list-item{list-style:none;margin-left:-18px;}`);
  lines.push(`    .ks-body code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;padding:1px 4px;border-radius:4px;background:${themePalette.codeBg};}`);
  lines.push(`    .ks-body pre{padding:8px 10px;border-radius:6px;overflow:hidden;background:${themePalette.codeBg};margin:0 0 6px;}`);
  lines.push(`    .ks-body pre code{padding:0;background:none;}`);
  lines.push(`    .ks-body blockquote{margin:0 0 6px;padding-left:10px;border-left:3px solid ${themePalette.quoteBorder};opacity:.88;}`);
  lines.push(`    .ks-body a{color:${defaultEdgeColor};text-decoration:underline;}`);
  lines.push(`    .ks-body table{border-collapse:collapse;font-size:12px;}`);
  lines.push(`    .ks-body th,.ks-body td{border:1px solid ${themePalette.cardBorder};padding:2px 6px;}`);
  lines.push(`    .ks-body hr{border:none;border-top:1px solid ${themePalette.cardBorder};margin:8px 0;}`);
  lines.push(`    .ks-body img{max-width:100%;}`);
  lines.push(`  ]]></style>`);

  // Background Rect
  if (bgColor !== "none") {
    lines.push(`  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${bgColor}" />`);
    lines.push(`  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#canvas-dots)" />`);
  }

  // 1. Group Containers Layer
  data.nodes
    .filter((n): n is CanvasGroupNode => n.type === "group")
    .forEach((g) => {
      // Mirrors the on-screen renderer: a custom palette colour wins, otherwise
      // fall back to the theme's own group tones. This used to hard-code the
      // sky-blue palette entry, so an untinted group looked nothing like the
      // one on screen — most visibly in the e-ink theme.
      const pal = g.color && CANVAS_COLOR_PALETTES[g.color] ? CANVAS_COLOR_PALETTES[g.color] : undefined;
      const groupFill = pal ? pal.bg : themePalette.groupBg;
      const groupStroke = pal ? pal.stroke : themePalette.groupBorder;
      lines.push(`  <g class="canvas-group" data-id="${g.id}">`);
      lines.push(
        `    <rect x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" rx="16" fill="${groupFill}" stroke="${groupStroke}" stroke-width="2" stroke-dasharray="6,6" />`
      );
      // Group title header
      lines.push(
        `    <path d="M ${g.x} ${g.y + 32} L ${g.x} ${g.y + 14} Q ${g.x} ${g.y} ${g.x + 14} ${g.y} L ${g.x + g.width - 14} ${g.y} Q ${g.x + g.width} ${g.y} ${g.x + g.width} ${g.y + 14} L ${g.x + g.width} ${g.y + 32} Z" fill="${groupStroke}" />`
      );
      lines.push(
        `    <text x="${g.x + 14}" y="${g.y + 19}" fill="#ffffff" font-family="system-ui, sans-serif" font-size="13" font-weight="600" dominant-baseline="central">📁 ${escapeSvgXml(g.label || "分组容器")}</text>`
      );
      lines.push(`  </g>`);
    });

  // 2. Connection Edges Layer
  data.edges.forEach((edge) => {
    const from = nodeMap.get(edge.fromNode);
    const to = nodeMap.get(edge.toNode);
    if (!from || !to) return;

    const optSides = getOptimalAnchorSides(from, to);
    const fromSide = edge.fromSide || optSides.fromSide;
    const toSide = edge.toSide || optSides.toSide;
    const p1 = getNodeAnchorPoint(from, fromSide);
    const p2 = getNodeAnchorPoint(to, toSide);
    // A grid edge is always a straight orthogonal segment, so stale arc
    // metadata (if any) is ignored — matching the on-screen renderer exactly.
    const ringArc =
      !edge.gridPath && edge.ringCenter && edge.ringRadius
        ? { center: edge.ringCenter, radius: edge.ringRadius }
        : undefined;
    const exportStyle = edge.gridPath ? "straight" : edge.style;
    const obstacles = data.nodes.filter((n) => n.id !== edge.fromNode && n.id !== edge.toNode);
    const pathD = computeEdgePath(p1, fromSide, p2, toSide, exportStyle, edge.stepOffset, ringArc, obstacles);

    // Mirror the on-screen renderer's color resolution: prefer the
    // edge's own explicit color, then fall back to source-aware display color.
    const effectiveColorKey = getEffectiveEdgeColorKey(edge, data.edges, data.nodes, sourceDisplayColorMap);
    const edgeColor =
      effectiveColorKey && CANVAS_COLOR_PALETTES[effectiveColorKey]
        ? CANVAS_COLOR_PALETTES[effectiveColorKey].stroke
        : effectiveColorKey && effectiveColorKey.startsWith("#")
        ? effectiveColorKey
        : defaultEdgeColor;

    const markerRef = effectiveColorKey
      ? CANVAS_COLOR_PALETTES[effectiveColorKey]
        ? `arrow-${effectiveColorKey}`
        : effectiveColorKey.startsWith("#")
        ? `arrow-${effectiveColorKey.replace("#", "hex-")}`
        : "arrow-default"
      : "arrow-default";
    const markerEnd = edge.toEnd === "arrow" ? `url(#${markerRef})` : "none";
    const markerStart = edge.fromEnd === "arrow" ? `url(#${markerRef})` : "none";

    lines.push(`  <g class="canvas-edge" data-id="${edge.id}">`);
    lines.push(
      `    <path d="${pathD}" fill="none" stroke="${edgeColor}" stroke-width="2" stroke-linecap="round" marker-end="${markerEnd}" marker-start="${markerStart}" />`
    );
    if (edge.fromEnd !== "arrow") {
      // On a ring the origin dot must sit on the circle too, not on the raw
      // card anchor point.
      const originPoint = ringArc ? projectPointOntoRing(p1, ringArc) : p1;
      lines.push(
        `    <circle cx="${originPoint.x}" cy="${originPoint.y}" r="3.5" fill="${edgeColor}" stroke="${isDark ? "#0f172a" : "#ffffff"}" stroke-width="1.2" />`
      );
    }

    // 3. Edge Label Badges
    if (edge.label && edge.label.trim()) {
      const rawMid = computeEdgeMidpoint(p1, fromSide, p2, toSide, exportStyle, edge.stepOffset, ringArc, obstacles);
      const labelText = escapeSvgXml(edge.label.trim());
      const shape = edge.labelShape || "pill";
      const charWidth = 11.5;
      const labelWidth = Math.max(54, edge.label.length * charWidth + 18);
      const labelHeight = 24;
      const labelX = rawMid.x - labelWidth / 2;
      const labelY = rawMid.y - labelHeight / 2;
      const labelBg = themePalette.edgeLabelBg;

      lines.push(`    <g class="canvas-edge-label" transform="translate(${rawMid.x}, ${rawMid.y})">`);
      if (shape === "diamond") {
        const halfW = (labelWidth + 18) / 2;
        const halfH = 14;
        lines.push(
          `      <polygon points="0,${-halfH} ${halfW},0 0,${halfH} ${-halfW},0" fill="${labelBg}" stroke="${edgeColor}" stroke-width="1.5" />`
        );
      } else if (shape === "rect") {
        lines.push(
          `      <rect x="${-labelWidth / 2}" y="${-labelHeight / 2}" width="${labelWidth}" height="${labelHeight}" rx="4" fill="${labelBg}" stroke="${edgeColor}" stroke-width="1.5" />`
        );
      } else {
        // pill
        lines.push(
          `      <rect x="${-labelWidth / 2}" y="${-labelHeight / 2}" width="${labelWidth}" height="${labelHeight}" rx="12" fill="${labelBg}" stroke="${edgeColor}" stroke-width="1.5" />`
        );
      }
      lines.push(
        `      <text x="0" y="0" fill="${themePalette.edgeLabelText}" font-family="system-ui, sans-serif" font-size="11.5" font-weight="600" text-anchor="middle" dominant-baseline="central">${labelText}</text>`
      );
      lines.push(`    </g>`);
    }
    lines.push(`  </g>`);
  });

  // 4. Cards Layer — rendered through foreignObject so the exported image
  // reproduces exactly what the user sees on screen: tinted header, origin
  // badge, full rich Markdown body, file/link layouts, task checkboxes, etc.
  const outgoingCountMap = new Map<string, number>();
  for (const e of data.edges) {
    if (e.fromNode) {
      outgoingCountMap.set(e.fromNode, (outgoingCountMap.get(e.fromNode) ?? 0) + 1);
    }
  }

  data.nodes
    .filter((n) => n.type !== "group")
    .forEach((card) => {
      const pal =
        card.color && CANVAS_COLOR_PALETTES[card.color]
          ? CANVAS_COLOR_PALETTES[card.color]
          : undefined;

      const outgoingCount = outgoingCountMap.get(card.id) ?? 0;
      const isOneToManySource = outgoingCount >= 2;
      const sourceColorKey = sourceDisplayColorMap.get(card.id);
      const sourcePal =
        sourceColorKey && CANVAS_COLOR_PALETTES[sourceColorKey]
          ? CANVAS_COLOR_PALETTES[sourceColorKey]
          : undefined;

      // Border priority mirrors CanvasView:
      // one-to-many source color > node color > default border
      const borderStroke =
        isOneToManySource && sourcePal ? sourcePal.stroke : pal ? pal.stroke : cardBorder;
      const borderWidth = (isOneToManySource && sourcePal) || pal ? 2 : 1;
      const headerBg = pal ? pal.bg : themePalette.cardHeaderBg;

      // Header icon + label — identical wording to the on-screen card
      let headerIcon = "📝";
      let headerLabel = "便签卡片";
      const mediaType = card.type === "file" ? getMediaFileType(card.file) : card.type === "link" ? getMediaFileType(card.url) : "other";

      if (card.type === "file") {
        if (mediaType === "image") {
          headerIcon = "🖼️";
          headerLabel = card.file.split(/[/\\]/).pop() || card.file;
        } else if (mediaType === "audio") {
          headerIcon = "🎵";
          headerLabel = card.file.split(/[/\\]/).pop() || card.file;
        } else if (mediaType === "video") {
          headerIcon = "🎬";
          headerLabel = card.file.split(/[/\\]/).pop() || card.file;
        } else if (mediaType === "pdf") {
          headerIcon = "📑";
          headerLabel = card.file.split(/[/\\]/).pop() || card.file;
        } else {
          headerIcon = "📄";
          headerLabel = card.file;
        }
      } else if (card.type === "link") {
        headerIcon = "🔗";
        headerLabel = "外部参考";
      }

      // Body content
      let bodyHtml = "";
      if (card.type === "text") {
        bodyHtml = renderCardMarkdown(card.text);
      } else if (card.type === "file") {
        if (mediaType === "image") {
          bodyHtml = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;background:rgba(0,0,0,0.03);border-radius:6px;"><img src="${escapeSvgXml(card.file)}" alt="${escapeSvgXml(headerLabel)}" style="max-width:100%;max-height:100%;object-fit:contain;" /></div>`;
        } else if (mediaType === "audio") {
          bodyHtml = `<div style="padding:12px;display:flex;flex-direction:column;gap:6px;"><span style="font-weight:600;font-size:12px;">🎵 ${escapeSvgXml(headerLabel)}</span><span style="font-size:11px;opacity:0.7;">音频媒体资源</span></div>`;
        } else if (mediaType === "video") {
          bodyHtml = `<div style="padding:12px;display:flex;flex-direction:column;gap:6px;"><span style="font-weight:600;font-size:12px;">🎬 ${escapeSvgXml(headerLabel)}</span><span style="font-size:11px;opacity:0.7;">视频媒体资源</span></div>`;
        } else if (mediaType === "pdf") {
          bodyHtml = `<div style="padding:12px;display:flex;flex-direction:column;gap:6px;"><span style="font-weight:600;font-size:12px;">📑 ${escapeSvgXml(headerLabel)}</span><span style="font-size:11px;opacity:0.7;">PDF 文档资源</span></div>`;
        } else {
          bodyHtml =
            `<p style="margin:0 0 6px 0;font-weight:600;">${escapeSvgXml(card.file)}</p>` +
            `<p style="margin:0;opacity:0.7;font-size:11.5px;">库内 Markdown 文档卡片。点击右上角图标可在主阅读区全屏打开。</p>`;
        }
      } else {
        bodyHtml = `<a href="${escapeSvgXml(card.url)}">${escapeSvgXml(card.url)}</a>`;
      }

      // "🌱 发起源 · N" hub badge
      let badgeHtml = "";
      if (isOneToManySource) {
        const badgeBg = sourcePal ? sourcePal.bg : "rgba(16, 185, 129, 0.15)";
        const badgeFg = sourcePal ? sourcePal.stroke : "#10b981";
        badgeHtml = `<span class="ks-badge" style="background:${badgeBg};color:${badgeFg};border:1px solid ${badgeFg};">🌱 发起源 · ${outgoingCount}</span>`;
      }

      lines.push(`  <g class="canvas-card" data-id="${card.id}">`);
      lines.push(
        `    <foreignObject x="${card.x}" y="${card.y}" width="${card.width}" height="${card.height}">`
      );
      lines.push(
        `      <div xmlns="http://www.w3.org/1999/xhtml" class="ks-card" style="border:${borderWidth}px solid ${borderStroke};">`
      );
      lines.push(
        `        <div class="ks-hdr" style="background:${headerBg};color:${themePalette.cardHeaderText};">` +
          `<span class="ks-title">${headerIcon} ${escapeSvgXml(headerLabel)}</span>${badgeHtml}</div>`
      );
      lines.push(`        <div class="ks-body">${bodyHtml}</div>`);
      lines.push(`      </div>`);
      lines.push(`    </foreignObject>`);
      lines.push(`  </g>`);
    });

  lines.push(`</svg>`);
  return lines.join("\n");
}

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
export function resolveExportScale(
  width: number,
  height: number,
  requested: number
): number {
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  let scale = Math.max(0.1, requested);

  if (safeW * scale > MAX_EXPORT_EDGE) scale = MAX_EXPORT_EDGE / safeW;
  if (safeH * scale > MAX_EXPORT_EDGE) scale = Math.min(scale, MAX_EXPORT_EDGE / safeH);

  const maxByPixels = Math.sqrt(MAX_EXPORT_PIXELS / (safeW * safeH));
  if (scale > maxByPixels) scale = maxByPixels;

  return Math.max(0.1, scale);
}

function loadImageForExport(url: string): Promise<HTMLImageElement> {
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

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
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
    const desktop = window.knowSpaceDesktop ?? window.bookMDDesktop;
    if (desktop?.readFileAsDataUrl) {
      try {
        const res = await desktop.readFileAsDataUrl({ filePath: localPath });
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
          blobToDataUrl(blob).then(finish).catch(() => finish(null));
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

/**
 * Attributes that HTML allows to stand alone but XML requires to carry a
 * value. markdown-it's task lists emit `<input type="checkbox" checked
 * disabled>`, and `checked` alone is a hard XML parse error — self-closing the
 * tag does not help.
 */
const HTML_BOOLEAN_ATTR_RE =
  /(\s)(checked|disabled|selected|readonly|required|multiple|autofocus|hidden|open|reversed|novalidate|formnovalidate|ismap|loop|muted|controls|default|defer|async|allowfullscreen|itemscope|scoped)(?=[\s/>]|$)/gi;

const SVG_OR_HTML_TAG_RE = /<([a-zA-Z][\w:-]*)((?:\s+[^<>]*?)?)(\/?)>/g;

/** Rewrites `disabled` into `disabled="disabled"` so the markup parses as XML. */
export function valueBooleanAttributes(svgString: string): string {
  return svgString.replace(
    SVG_OR_HTML_TAG_RE,
    (full, tag: string, attrs: string, selfClose: string) => {
      if (!attrs) return full;
      const fixed = attrs.replace(
        HTML_BOOLEAN_ATTR_RE,
        (_match, whitespace: string, name: string) => `${whitespace}${name}="${name}"`
      );
      return fixed === attrs ? full : `<${tag}${fixed}${selfClose}>`;
    }
  );
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
    targets.map(async (t) => ({ ...t, dataUrl: await readUrlAsDataUrl(t.url) }))
  );

  for (const t of resolved) {
    if (t.attr === "style") {
      const style = t.el.getAttribute("style") ?? "";
      t.el.setAttribute(
        "style",
        t.dataUrl
          ? style.replace(t.url, t.dataUrl)
          : style.replace(/url\([^)]*\)/gi, "none")
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
    })
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
  return svgString
    .replace(SVG_IMAGE_TAG_RE, "")
    .replace(SVG_CSS_URL_RE, "none");
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
  options?: CanvasExportOptions
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
      throw new Error("白板包含无法内联的外部图片，浏览器安全策略阻止了图片导出");
    }
    try {
      return await rasterise(stripped);
    } catch (retryErr) {
      if (isTaintedCanvasError(retryErr)) {
        throw new Error("白板包含无法内联的外部图片，浏览器安全策略阻止了图片导出");
      }
      throw retryErr;
    }
  }
}

export async function exportCanvasToPng(
  data: CanvasData,
  options?: CanvasExportOptions
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
  options?: CanvasExportOptions
): Promise<CanvasDownloadResult> {
  const cleanName = filename.replace(/\.(png|svg|canvas)$/i, "");

  const saveSvg = (): void => {
    // Run the same well-formed-XML pass used by the rasteriser, so the saved
    // .svg file actually opens in a browser or Illustrator. Without it the
    // unclosed tags and valueless boolean attributes from the card HTML
    // produce a file most viewers reject.
    const svgContent = serializeSvgForExport(valueBooleanAttributes(exportCanvasToSvg(data, options)));
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

  const desktop =
    typeof window !== "undefined"
      ? window.knowSpaceDesktop ?? window.bookMDDesktop
      : undefined;

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

  if (!blob && desktop?.exportCanvasAsPng) {
    const res = await desktop.exportCanvasAsPng({
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
  if (desktop?.savePngBuffer) {
    const buffer = await blob.arrayBuffer();
    const res = await desktop.savePngBuffer({
      buffer,
      filename: `${cleanName}.png`,
    });
    if (res?.canceled) return "canceled";
    if (res?.success) return "png";
    throw new Error(res?.message || "保存图片失败");
  }

  // Legacy bridge without the buffer API
  if (desktop?.savePngData && blob.type === "image/png") {
    const dataUrl = await blobToDataUrl(blob);
    const res = await desktop.savePngData({ dataUrl, filename: `${cleanName}.png` });
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
  options?: CanvasExportOptions
): Promise<boolean> {
  const desktop =
    typeof window !== "undefined"
      ? window.knowSpaceDesktop ?? window.bookMDDesktop
      : undefined;

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
    if (desktop?.copyPngToClipboard) {
      try {
        const res = await desktop.copyPngToClipboard({ buffer: await blob.arrayBuffer() });
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
  if (desktop?.copyCanvasAsImage) {
    try {
      const svg = serializeSvgForExport(valueBooleanAttributes(exportCanvasToSvg(data, options)));
      const res = await desktop.copyCanvasAsImage({ svg, scale: 2 });
      if (res?.success) return true;
      console.warn("离屏渲染复制失败:", res?.message);
    } catch (err) {
      console.warn("离屏渲染复制异常:", err);
    }
  }

  return false;
}
