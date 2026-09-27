import { useCallback, type RefObject } from "react";
import type { MindmapNode, ThemeMode } from "../../core/types";
import type { MindmapSidecar } from "../../services/mindmapSidecar";
import type { MindmapLayoutResult } from "../../services/mindmapLayout";
import type { Bounds } from "../../core/mindmapBounds";
import { buildStandaloneMindmapSvg } from "../../services/mindmapSvgExport";
import {
  exportMindmapToOpml,
  exportMindmapToFreeMind,
  exportMindmapToXmind,
  exportMindmapToMarkdownOutline,
} from "../../services/mindmapService";
import { downloadFile } from "../../services/fileDownload";

/**
 * Whether the app's own chrome is dark.
 *
 * Only the exports need it, and only as the fallback for a node that has no
 * colour of its own: a map written to a file has no stylesheet behind it, so
 * "transparent" would mean "whatever the program opening it decides".
 */
function isDarkUi(theme: ThemeMode): boolean {
  return (
    theme === "twitter" ||
    (theme === "system" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches)
  );
}

/**
 * The export/print domain of the mindmap: the seven ways a map leaves the app
 * as a file or a printed page — PNG, SVG, print/PDF, OPML, FreeMind, XMind and
 * the Markdown outline.
 *
 * Extracted from MindmapView (batch 3, wave 2a of the decomposition). `isDarkUi`
 * moved with the two image exports, whose dark fallback is its only reader
 * (the node layer works out its own contrast from each node's fill instead).
 * Nothing here needs `editable` or `documentKey`: an export is a read of what
 * is already on screen and in the companion file.
 */
type UseMindmapExportParams = {
  /** The document title — every export's file name and the print job's title. */
  title: string;
  /** The tree, serialised by the four text exporters. */
  tree: MindmapNode;
  /** The app theme; the image exports use it as the dark fallback for unstyled nodes. */
  theme: ThemeMode;
  /** The on-screen SVG, rebuilt into a standalone file by the image exports. */
  svgRef: RefObject<SVGSVGElement | null>;
  /** The laid-out map, carried for the PNG export's guard. */
  layout: MindmapLayoutResult;
  /** The bounds anything framing the canvas uses — floating topics included. */
  frameBounds: Bounds;
  /** The folded ids; the FreeMind exporter writes them as FOLDED attributes. */
  collapsedIds: Set<string>;
  /** The companion file, whose annotations ride along on the exports that have a home for them. */
  sidecar: MindmapSidecar | null;
};

export function useMindmapExport({
  title,
  tree,
  theme,
  svgRef,
  layout,
  frameBounds,
  collapsedIds,
  sidecar,
}: UseMindmapExportParams) {
  // Export as PNG (100% Transparent Background, correct node & text fills, zero black blocks)
  const handleExportPng = useCallback(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !layout) return;

    // The canvas cannot be written out as it is: the pan and zoom, the
    // interactive-only elements and the stylesheet colours all have to be
    // resolved first. That is one function, shared with the SVG export — the PNG
    // below is that SVG rasterised, so the two formats cannot drift apart.
    const built = buildStandaloneMindmapSvg(svgEl, {
      bounds: frameBounds,
      dark: isDarkUi(theme),
    });
    if (!built) return;

    const { svg: svgString, width: exportWidth, height: exportHeight } = built;

    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // How many device pixels each layout pixel gets in the file.
      //
      // This used to be `devicePixelRatio`, which made the exported image depend on the
      // monitor the export happened on: on a 1× display a 1200px map became a 1200px
      // file, and zooming into it was blurry — the picture was already at 100%. An
      // export is a document rather than a screenshot, so its resolution is a decision:
      // three device pixels per layout pixel, capped so a very large map cannot ask for
      // a canvas the browser refuses to allocate (and refuses silently, which would be
      // worse than a soft image).
      const MAX_SIDE = 12000;
      const scale = Math.max(1, Math.min(3, MAX_SIDE / Math.max(exportWidth, exportHeight, 1)));
      canvas.width = Math.max(1, Math.round(exportWidth * scale));
      canvas.height = Math.max(1, Math.round(exportHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.scale(scale, scale);
      // Transparent background: clearRect without any fillRect
      ctx.clearRect(0, 0, exportWidth, exportHeight);
      ctx.drawImage(img, 0, 0, exportWidth, exportHeight);

      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return;
        downloadFile({
          fileName: `${title || "mindmap"}-思维导图.png`,
          data: pngBlob,
          mime: "image/png",
        });
        // The URL the image was loaded from, not a download's: it is ours to give
        // back now that the canvas has the pixels.
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    img.src = url;
  }, [layout, title, theme, frameBounds, svgRef]);

  /**
   * Export as SVG.
   *
   * The same string the PNG is rasterised from, written out as it is — so a
   * vector file costs one download and no second implementation. Text stays
   * text, which is the reason to want one: the file can be opened in an
   * illustration program and edited, or printed at any size.
   */
  const handleExportSvg = useCallback(() => {
    const built = buildStandaloneMindmapSvg(svgRef.current, {
      bounds: frameBounds,
      dark: isDarkUi(theme),
    });
    if (!built) return;

    downloadFile({
      fileName: `${title || "mindmap"}-思维导图.svg`,
      data: built.svg,
      mime: "image/svg+xml;charset=utf-8",
    });
    // The original deps array carried a loose `layout` entry this body never
    // read; exhaustive-deps (an error in new files) does not allow it, and
    // dropping it only changes when the callback identity refreshes.
  }, [title, theme, frameBounds, svgRef]);

  /**
   * Print the map, which is also how a PDF comes out of it.
   *
   * The application already owns this path — a print stylesheet and the main
   * process's `printToPdf` — so a map does not need a converter of its own, and
   * asking the operating system for a PDF costs no dependency. Landscape is
   * asked for because a map is wider than it is tall; the reader can still change
   * it in the dialog.
   *
   * The view box the page is drawn with is swapped in by the effect above, on the
   * event Electron fires while printing — the same event a browser fires for
   * Ctrl+P, which is the fallback when there is no bridge.
   */
  const handlePrintPdf = useCallback(() => {
    const bridge = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;

    if (bridge?.system.printToPdf) {
      void bridge.system.printToPdf({ title: `${title || "mindmap"}-思维导图`, landscape: true });
      return;
    }
    window.print();
  }, [title]);

  const handleExportOpml = useCallback(() => {
    downloadFile({
      fileName: `${title || "mindmap"}.opml`,
      data: exportMindmapToOpml(tree, title, sidecar),
      mime: "text/x-opml+xml;charset=utf-8",
    });
  }, [tree, title, sidecar]);

  const handleExportFreeMind = useCallback(() => {
    // Collapsed state lives here, not on the tree, so the exporter has to be
    // told about it — without this the FOLDED attribute was never written.
    downloadFile({
      fileName: `${title || "mindmap"}.mm`,
      data: exportMindmapToFreeMind(tree, collapsedIds, sidecar),
      mime: "application/x-freemind;charset=utf-8",
    });
  }, [tree, title, collapsedIds, sidecar]);

  /**
   * The map as an `.xmind` file, which is also the one export the app can read.
   *
   * Bytes rather than text, because the format is a ZIP: the same download the
   * other exports use, with a different type on the blob. Everything the companion
   * file holds that XMind has a counterpart for goes with it — the tree alone would
   * be the smaller half of the map.
   */
  const handleExportXmind = useCallback(() => {
    downloadFile({
      fileName: `${title || "mindmap"}.xmind`,
      data: exportMindmapToXmind(tree, { sidecar, sheetTitle: tree.text || title }),
      mime: "application/zip",
    });
  }, [tree, sidecar, title]);

  const handleExportMarkdownOutline = useCallback(() => {
    downloadFile({
      fileName: `${title || "mindmap"}-outline.md`,
      data: exportMindmapToMarkdownOutline(tree),
      mime: "text/markdown;charset=utf-8",
    });
  }, [tree, title]);

  return {
    handleExportPng,
    handleExportSvg,
    handlePrintPdf,
    handleExportOpml,
    handleExportFreeMind,
    handleExportXmind,
    handleExportMarkdownOutline,
  };
}
