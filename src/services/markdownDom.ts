import { uniqueSlug } from "../core/ids";
import type { Heading } from "../core/types";

/*
 * DOM post-processing and heading extraction over rendered markdown: heading
 * ids, relative-URL rewriting, image optimisation, and the plain-text /
 * excerpt helpers shared with `./markdownSearch`. Part of the markdown
 * service re-exported by `./markdown`.
 */

export function addHeadingIds(fragment: DocumentFragment): Heading[] {
  const seen = new Map<string, number>();
  const headings = Array.from(fragment.querySelectorAll("h1, h2, h3")).map((node) => {
    const element = node as HTMLElement;
    const text = compactWhitespace(element.textContent ?? "");
    const id = uniqueSlug(text, seen);
    element.id = id;
    element.setAttribute("data-heading-id", id);
    const rawLine = element.getAttribute("data-source-line");
    const lineNum = rawLine ? parseInt(rawLine, 10) : undefined;
    return {
      id,
      text,
      level: Number(element.tagName.slice(1)),
      line: lineNum && !Number.isNaN(lineNum) && lineNum > 0 ? lineNum : undefined,
    };
  });
  fragment.querySelectorAll("a[href^='http']").forEach((node) => {
    const anchor = node as HTMLAnchorElement;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
  });
  return headings;
}

export function extractHeadingsFromSource(source: string): Heading[] {
  const seen = new Map<string, number>();
  const headings: Heading[] = [];
  const lines = source.split("\n");
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (match) {
      const level = match[1].length;
      if (level <= 3) {
        const cleanText = match[2]
          .replace(/[*_~`]/g, "")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .trim();
        const text = compactWhitespace(cleanText || match[2]);
        const id = uniqueSlug(text, seen);
        headings.push({ id, text, level, line: i + 1 });
      }
    }
  }
  return headings;
}

export function findHeadingLineInSource(source: string, targetHeading: Heading): number {
  if (typeof targetHeading.line === "number" && targetHeading.line > 0) {
    return targetHeading.line;
  }
  const lines = source.split("\n");
  let inCodeBlock = false;
  const targetText = targetHeading.text.trim().toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{1,6})\s+(.*)$/);
    if (match) {
      const level = match[1].length;
      const rawText = match[2]
        .replace(/[*_~`]/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim()
        .toLowerCase();
      if (
        level === targetHeading.level &&
        (rawText === targetText || rawText.includes(targetText) || targetText.includes(rawText))
      ) {
        return i + 1; // 1-indexed line number
      }
    }
  }
  return -1;
}

export function rewriteRelativeUrls(fragment: DocumentFragment, baseUrl: string): void {
  fragment.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
    const src = image.getAttribute("src");
    if (src && isRelativeUrl(src)) image.setAttribute("src", new URL(src, baseUrl).toString());
  });
  fragment.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (href && isRelativeUrl(href) && !href.startsWith("#")) {
      anchor.setAttribute("href", new URL(href, baseUrl).toString());
    }
  });
}

export function optimizeImages(fragment: DocumentFragment): void {
  fragment.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
    if (!image.hasAttribute("loading")) image.setAttribute("loading", "lazy");
    if (!image.hasAttribute("decoding")) image.setAttribute("decoding", "async");
    if (!image.hasAttribute("referrerpolicy")) image.setAttribute("referrerpolicy", "no-referrer");
    if (!image.hasAttribute("draggable")) image.setAttribute("draggable", "false");
    image.classList.add("md-image");
    const parent = image.parentElement;
    if (parent && parent.tagName === "P" && isStandaloneImageParagraph(parent, image)) {
      image.classList.add("md-image-block");
    } else {
      image.classList.add("md-image-inline");
    }
  });
}

function isStandaloneImageParagraph(parent: HTMLElement, image: HTMLImageElement): boolean {
  return Array.from(parent.childNodes).every(
    (node) => node === image || (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()),
  );
}

function isRelativeUrl(value: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith("//");
}

export function extractPlainText(fragment: DocumentFragment): string {
  return compactWhitespace(fragment.textContent ?? "");
}

export function firstVisibleParagraph(container: HTMLElement): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLElement>("p, li, blockquote")).find((item) =>
      item.textContent?.trim(),
    ) ?? null
  );
}

export function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
