/**
 * Canvas export: standalone SVG generation.
 *
 * Builds the ultra-crisp, standalone vector representation of the canvas —
 * theme palette, defs/markers, embedded stylesheet, group/edge/card layers —
 * as one string. Also hosts valueBooleanAttributes, the well-formedness pass
 * every consumer of the generated markup (rasteriser, download, clipboard,
 * offscreen render) applies before parsing it as XML.
 *
 * Pure computation — no window/document access — so it runs (and is testable)
 * in a plain Node environment; the DOM-carrying parts of the pipeline remain
 * in canvasExport.ts, the only export file on the L2 window/document
 * whitelist (eslint gives NEW service files no pass).
 *
 * Split out of canvasExport during the phase-1 size split; the code is
 * byte-identical to the original there (which itself came from canvasService
 * in the R2 split). See canvasExport.ts for the import surface.
 */

import type { CanvasData, CanvasGroupNode, CanvasNode } from "../types/canvasTypes";
import { renderCardMarkdown } from "./markdown";
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
export function exportCanvasToSvg(data: CanvasData, options?: CanvasExportOptions): string {
  // The very same palette the on-screen renderer uses, so the exported image
  // matches what the user is looking at. This used to be a hand-maintained
  // copy that had drifted: the light theme exported on a #f8fafc backdrop
  // instead of #ffffff, e-ink lost its paper tone, and the dot grid never
  // matched in any theme.
  const themePalette = getCanvasThemeColors(normalizeExportTheme(options?.theme));
  const isDark = themePalette.isDark;

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
    const effectiveColorKey =
      edge.color || (edge.fromNode ? sourceDisplayColorMap.get(edge.fromNode) : undefined);
    if (effectiveColorKey && effectiveColorKey.startsWith("#")) {
      exportHexColors.add(effectiveColorKey);
    }
  }

  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">`,
  );

  // Definitions (Filters, Grid Pattern, Arrow Markers)
  lines.push(`  <defs>`);
  lines.push(`    <filter id="card-shadow" x="-8%" y="-8%" width="120%" height="120%">`);
  lines.push(
    `      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="rgba(0,0,0,0.18)" />`,
  );
  lines.push(`    </filter>`);
  if (bgColor !== "none") {
    lines.push(
      `    <pattern id="canvas-dots" width="28" height="28" patternUnits="userSpaceOnUse">`,
    );
    lines.push(`      <circle cx="2" cy="2" r="1.2" fill="${dotColor}" />`);
    lines.push(`    </pattern>`);
  }
  // Arrow markers for each palette color
  Object.entries(CANVAS_COLOR_PALETTES).forEach(([k, c]) => {
    lines.push(
      `    <marker id="arrow-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="${c.stroke}" /></marker>`,
    );
  });
  // Arrow markers for any custom hex colors that may appear on edges
  exportHexColors.forEach((hex) => {
    lines.push(
      `    <marker id="arrow-${hex.replace("#", "hex-")}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="${hex}" /></marker>`,
    );
  });
  lines.push(
    `    <marker id="arrow-default" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="${defaultEdgeColor}" /></marker>`,
  );
  lines.push(`  </defs>`);

  // ── Embedded stylesheet ──────────────────────────────────────────────────
  // Mirrors the on-screen card styling so the exported image reproduces every
  // visible element (header tint, origin badge, rich Markdown body, …).
  lines.push(`  <style><![CDATA[`);
  lines.push(
    `    .ks-card{width:100%;height:100%;box-sizing:border-box;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;background:${themePalette.cardBg};box-shadow:${themePalette.cardShadow};font-family:system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;}`,
  );
  lines.push(
    `    .ks-hdr{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 10px;font-size:11px;font-weight:600;border-bottom:1px solid ${themePalette.cardHeaderBorder};flex-shrink:0;}`,
  );
  lines.push(
    `    .ks-title{display:inline-flex;align-items:center;gap:4px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}`,
  );
  lines.push(
    `    .ks-badge{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;white-space:nowrap;flex-shrink:0;}`,
  );
  lines.push(
    `    .ks-body{flex:1;padding:8px 12px;overflow:hidden;font-size:13px;line-height:1.6;color:${themePalette.cardText};}`,
  );
  lines.push(`    .ks-body > *:first-child{margin-top:0;}`);
  lines.push(`    .ks-body > *:last-child{margin-bottom:0;}`);
  lines.push(`    .ks-body h1{font-size:17px;font-weight:700;margin:0 0 8px;}`);
  lines.push(`    .ks-body h2{font-size:15.5px;font-weight:700;margin:0 0 8px;}`);
  lines.push(`    .ks-body h3{font-size:14px;font-weight:700;margin:0 0 6px;}`);
  lines.push(
    `    .ks-body h4,.ks-body h5,.ks-body h6{font-size:13px;font-weight:700;margin:0 0 6px;}`,
  );
  lines.push(`    .ks-body p{margin:0 0 6px;}`);
  lines.push(`    .ks-body ul,.ks-body ol{margin:0 0 6px;padding-left:20px;}`);
  lines.push(`    .ks-body li{margin:2px 0;}`);
  lines.push(`    .ks-body li.task-list-item{list-style:none;margin-left:-18px;}`);
  lines.push(
    `    .ks-body code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;padding:1px 4px;border-radius:4px;background:${themePalette.codeBg};}`,
  );
  lines.push(
    `    .ks-body pre{padding:8px 10px;border-radius:6px;overflow:hidden;background:${themePalette.codeBg};margin:0 0 6px;}`,
  );
  lines.push(`    .ks-body pre code{padding:0;background:none;}`);
  lines.push(
    `    .ks-body blockquote{margin:0 0 6px;padding-left:10px;border-left:3px solid ${themePalette.quoteBorder};opacity:.88;}`,
  );
  lines.push(`    .ks-body a{color:${defaultEdgeColor};text-decoration:underline;}`);
  lines.push(`    .ks-body table{border-collapse:collapse;font-size:12px;}`);
  lines.push(
    `    .ks-body th,.ks-body td{border:1px solid ${themePalette.cardBorder};padding:2px 6px;}`,
  );
  lines.push(
    `    .ks-body hr{border:none;border-top:1px solid ${themePalette.cardBorder};margin:8px 0;}`,
  );
  lines.push(`    .ks-body img{max-width:100%;}`);
  lines.push(`  ]]></style>`);

  // Background Rect
  if (bgColor !== "none") {
    lines.push(
      `  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${bgColor}" />`,
    );
    lines.push(
      `  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#canvas-dots)" />`,
    );
  }

  // 1. Group Containers Layer
  data.nodes
    .filter((n): n is CanvasGroupNode => n.type === "group")
    .forEach((g) => {
      // Mirrors the on-screen renderer: a custom palette colour wins, otherwise
      // fall back to the theme's own group tones. This used to hard-code the
      // sky-blue palette entry, so an untinted group looked nothing like the
      // one on screen — most visibly in the e-ink theme.
      const pal =
        g.color && CANVAS_COLOR_PALETTES[g.color] ? CANVAS_COLOR_PALETTES[g.color] : undefined;
      const groupFill = pal ? pal.bg : themePalette.groupBg;
      const groupStroke = pal ? pal.stroke : themePalette.groupBorder;
      lines.push(`  <g class="canvas-group" data-id="${g.id}">`);
      lines.push(
        `    <rect x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" rx="16" fill="${groupFill}" stroke="${groupStroke}" stroke-width="2" stroke-dasharray="6,6" />`,
      );
      // Group title header
      lines.push(
        `    <path d="M ${g.x} ${g.y + 32} L ${g.x} ${g.y + 14} Q ${g.x} ${g.y} ${g.x + 14} ${g.y} L ${g.x + g.width - 14} ${g.y} Q ${g.x + g.width} ${g.y} ${g.x + g.width} ${g.y + 14} L ${g.x + g.width} ${g.y + 32} Z" fill="${groupStroke}" />`,
      );
      lines.push(
        `    <text x="${g.x + 14}" y="${g.y + 19}" fill="#ffffff" font-family="system-ui, sans-serif" font-size="13" font-weight="600" dominant-baseline="central">📁 ${escapeSvgXml(g.label || "分组容器")}</text>`,
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
    const pathD = computeEdgePath(
      p1,
      fromSide,
      p2,
      toSide,
      exportStyle,
      edge.stepOffset,
      ringArc,
      obstacles,
    );

    // Mirror the on-screen renderer's color resolution: prefer the
    // edge's own explicit color, then fall back to source-aware display color.
    const effectiveColorKey = getEffectiveEdgeColorKey(
      edge,
      data.edges,
      data.nodes,
      sourceDisplayColorMap,
    );
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
      `    <path d="${pathD}" fill="none" stroke="${edgeColor}" stroke-width="2" stroke-linecap="round" marker-end="${markerEnd}" marker-start="${markerStart}" />`,
    );
    if (edge.fromEnd !== "arrow") {
      // On a ring the origin dot must sit on the circle too, not on the raw
      // card anchor point.
      const originPoint = ringArc ? projectPointOntoRing(p1, ringArc) : p1;
      lines.push(
        `    <circle cx="${originPoint.x}" cy="${originPoint.y}" r="3.5" fill="${edgeColor}" stroke="${isDark ? "#0f172a" : "#ffffff"}" stroke-width="1.2" />`,
      );
    }

    // 3. Edge Label Badges
    if (edge.label && edge.label.trim()) {
      const rawMid = computeEdgeMidpoint(
        p1,
        fromSide,
        p2,
        toSide,
        exportStyle,
        edge.stepOffset,
        ringArc,
        obstacles,
      );
      const labelText = escapeSvgXml(edge.label.trim());
      const shape = edge.labelShape || "pill";
      const charWidth = 11.5;
      const labelWidth = Math.max(54, edge.label.length * charWidth + 18);
      const labelHeight = 24;
      const labelBg = themePalette.edgeLabelBg;

      lines.push(
        `    <g class="canvas-edge-label" transform="translate(${rawMid.x}, ${rawMid.y})">`,
      );
      if (shape === "diamond") {
        const halfW = (labelWidth + 18) / 2;
        const halfH = 14;
        lines.push(
          `      <polygon points="0,${-halfH} ${halfW},0 0,${halfH} ${-halfW},0" fill="${labelBg}" stroke="${edgeColor}" stroke-width="1.5" />`,
        );
      } else if (shape === "rect") {
        lines.push(
          `      <rect x="${-labelWidth / 2}" y="${-labelHeight / 2}" width="${labelWidth}" height="${labelHeight}" rx="4" fill="${labelBg}" stroke="${edgeColor}" stroke-width="1.5" />`,
        );
      } else {
        // pill
        lines.push(
          `      <rect x="${-labelWidth / 2}" y="${-labelHeight / 2}" width="${labelWidth}" height="${labelHeight}" rx="12" fill="${labelBg}" stroke="${edgeColor}" stroke-width="1.5" />`,
        );
      }
      lines.push(
        `      <text x="0" y="0" fill="${themePalette.edgeLabelText}" font-family="system-ui, sans-serif" font-size="11.5" font-weight="600" text-anchor="middle" dominant-baseline="central">${labelText}</text>`,
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
      const mediaType =
        card.type === "file"
          ? getMediaFileType(card.file)
          : card.type === "link"
            ? getMediaFileType(card.url)
            : "other";

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
      let bodyHtml: string;
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
        `    <foreignObject x="${card.x}" y="${card.y}" width="${card.width}" height="${card.height}">`,
      );
      lines.push(
        `      <div xmlns="http://www.w3.org/1999/xhtml" class="ks-card" style="border:${borderWidth}px solid ${borderStroke};">`,
      );
      lines.push(
        `        <div class="ks-hdr" style="background:${headerBg};color:${themePalette.cardHeaderText};">` +
          `<span class="ks-title">${headerIcon} ${escapeSvgXml(headerLabel)}</span>${badgeHtml}</div>`,
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
        (_match, whitespace: string, name: string) => `${whitespace}${name}="${name}"`,
      );
      return fixed === attrs ? full : `<${tag}${fixed}${selfClose}>`;
    },
  );
}
