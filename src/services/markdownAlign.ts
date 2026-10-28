import type MarkdownIt from "markdown-it";

/*
 * Paragraph centering wired to the editor's right-click menu
 * (列表与段落排版 → 段落居中 / 取消居中).
 *
 * Why an inline marker and not a block syntax: KnowSpace documents are
 * markdown, and the established pattern for editor-inserted paragraph
 * styling here is an inline trailing marker that a core rule strips from the
 * visible text and turns into a block attribute — exactly what blockAnchor's
 * ` ^block-id` does (see markdownPlugins.blockAnchorPlugin). Centering is a
 * per-PARAGRAPH property, so the honest source form is a marker that lives on
 * the paragraph's last line: `⟪center⟫`.
 *
 * The marker is never left in the text: the core rule below removes it from
 * the inline token's last text child and, only when the paragraph really
 * ends with it, sets `text-align: center` on the block's open token when its
 * own renderer emits it (paragraph, heading, table). Everything else falls
 * back to the already-correct `data-align-center` attribute rendered by the
 * token renderer, which reader.css honours — so a centered blockquote/list
 * item still centers, without this plugin touching their renderers.
 *
 * Block segmentation stays byte-exact (markdown-blocks.test.ts identity 1):
 * the mutation only edits a token's attrs/content, never adds or removes
 * tokens or newlines, so `md.render` output is unchanged apart from the
 * attribute the plugin intends to add.
 *
 * Round-trip: `stripTrailingAlignMarker` is shared with the editor-side
 * toggle so the rendered form and the source transform agree on what "this
 * paragraph ends with the marker" means.
 */

/** The invisible-ish sentinel the menu appends to the paragraph's last line. */
export const ALIGN_CENTER_MARKER = "⟪center⟫";

/**
 * The one reader rule both the plugin and the right-click transform use to
 * recognise a centered paragraph: whitespace, then the marker, at end of line.
 */
export const TRAILING_ALIGN_MARKER_RE = new RegExp(`\\s*${ALIGN_CENTER_MARKER}\\s*$`);

/** True when `lineText` is a centered paragraph by the shared rule. */
export function hasTrailingAlignMarker(lineText: string): boolean {
  return TRAILING_ALIGN_MARKER_RE.test(lineText);
}

/** Remove a trailing marker (and the space before it) from `lineText`. */
export function stripTrailingAlignMarker(lineText: string): string {
  return lineText.replace(TRAILING_ALIGN_MARKER_RE, "");
}

/** Apply `text-align: center` through the element's own style attribute. */
function applyCenterAttr(token: { attrJoin: (name: string, value: string) => void }): void {
  token.attrJoin("style", "text-align:center");
}

/** Block-level token types whose open token is the element we center. */
const OPEN_RENDERED_TYPES = new Set(["paragraph_open", "heading_open", "table_open"]);

export function alignCenterPlugin(md: MarkdownIt): void {
  md.core.ruler.push("align_center", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i += 1) {
      const inline = tokens[i];
      if (inline.type !== "inline" || !inline.children || inline.children.length === 0) continue;
      const lastChild = inline.children[inline.children.length - 1];
      if (!lastChild || lastChild.type !== "text") continue;
      if (!hasTrailingAlignMarker(lastChild.content)) continue;

      // The marker is consumed from the visible text no matter what the
      // enclosing block is — it must never render as literal characters.
      lastChild.content = stripTrailingAlignMarker(lastChild.content).replace(/\s+$/, "");

      // The block's open token is the token right before the inline content.
      const open = i > 0 ? tokens[i - 1] : null;
      if (open && OPEN_RENDERED_TYPES.has(open.type) && open.nesting === 1) {
        applyCenterAttr(open);
      } else {
        // Fallback for any other container: the attribute travels with the
        // block; reader.css centres elements that carry it.
        if (open) open.attrJoin("data-align-center", "true");
        inline.attrJoin("data-align-center", "true");
      }
    }
  });
}
