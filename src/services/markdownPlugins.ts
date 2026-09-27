import type MarkdownIt from "markdown-it";

/*
 * MarkdownIt plugins that annotate the rendered HTML: source-line mapping for
 * scroll/selection sync, `^block-id` block anchors, and `[[wikilink]]` parsing
 * with block-reference display labels. Part of the markdown service
 * re-exported by `./markdown`.
 */

export function sourceLineMappingPlugin(md: MarkdownIt) {
  md.core.ruler.push("source_line_mapping", (state) => {
    for (const token of state.tokens) {
      if (token.map) {
        if (token.nesting === 1) {
          token.attrSet("data-source-line", String(token.map[0] + 1));
          token.attrSet("data-source-line-end", String(token.map[1]));
        } else if (
          token.nesting === 0 &&
          (token.type === "fence" || token.type === "code_block" || token.type === "hr")
        ) {
          token.attrSet("data-source-line", String(token.map[0] + 1));
          token.attrSet("data-source-line-end", String(token.map[1]));
        }
      }
    }
  });

  const prevFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lineAttr = token.map
      ? ` data-source-line="${token.map[0] + 1}" data-source-line-end="${token.map[1]}"`
      : "";
    const rendered = prevFence
      ? prevFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
    if (lineAttr && rendered.startsWith("<pre")) {
      return rendered.replace("<pre", `<pre${lineAttr}`);
    }
    return rendered;
  };

  const prevCodeBlock = md.renderer.rules.code_block;
  md.renderer.rules.code_block = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lineAttr = token.map
      ? ` data-source-line="${token.map[0] + 1}" data-source-line-end="${token.map[1]}"`
      : "";
    const rendered = prevCodeBlock
      ? prevCodeBlock(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
    if (lineAttr && rendered.startsWith("<pre")) {
      return rendered.replace("<pre", `<pre${lineAttr}`);
    }
    return rendered;
  };

  const prevHr = md.renderer.rules.hr;
  md.renderer.rules.hr = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lineAttr = token.map
      ? ` data-source-line="${token.map[0] + 1}" data-source-line-end="${token.map[1]}"`
      : "";
    const rendered = prevHr
      ? prevHr(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
    if (lineAttr && rendered.startsWith("<hr")) {
      return rendered.replace("<hr", `<hr${lineAttr}`);
    }
    return rendered;
  };
}

export function blockAnchorPlugin(md: MarkdownIt): void {
  const blockRegex = /\s\^([a-zA-Z0-9_-]+)$/;
  md.core.ruler.push("block_anchor", (state) => {
    for (const blockToken of state.tokens) {
      if (blockToken.type === "inline" && blockToken.children && blockToken.children.length > 0) {
        const lastChild = blockToken.children[blockToken.children.length - 1];
        if (lastChild && lastChild.type === "text" && blockRegex.test(lastChild.content)) {
          const match = lastChild.content.match(blockRegex);
          if (match) {
            const blockId = match[1];
            // Remove the ^blockId from visible text
            lastChild.content = lastChild.content.replace(blockRegex, "").trimEnd();

            // Push anchor token
            const anchorToken = new (state.Token as any)("block_anchor", "span", 0);
            anchorToken.attrs = [
              ["id", `^${blockId}`],
              ["class", "block-anchor"],
              ["data-block-id", blockId],
              ["title", `块引用指纹: ^${blockId} (点击复制块引用)`],
            ];
            anchorToken.meta = { blockId };
            blockToken.children.push(anchorToken);
          }
        }
      }
    }
  });

  md.renderer.rules.block_anchor = (tokens, idx) => {
    const token = tokens[idx];
    const blockId = token.meta?.blockId || token.attrGet("data-block-id") || "";
    return `<span id="^${blockId}" class="block-anchor" data-block-id="${blockId}" data-tooltip="点击复制段落引用 [[#^${blockId}]]"><span class="block-anchor-symbol">⚓</span></span>`;
  };
}

function formatBlockRefDisplayLabel(target: string, label: string): string {
  if (label && label !== target) {
    // User explicitly provided custom alias: [[target|alias]]
    return label;
  }
  // Local block reference: [[#^blockId]] -> "段落引用"
  if (target.startsWith("#^")) {
    return "段落引用";
  }
  // Cross-doc block reference: [[doc#^blockId]] -> "doc > 段落引用"
  if (target.includes("#^")) {
    const [docPart] = target.split("#^");
    return `${docPart} > 段落引用`;
  }
  return label || target;
}

export function wikiLinkPlugin(md: MarkdownIt): void {
  md.inline.ruler.before("link", "wikilink", (state: any, silent: boolean) => {
    let isEmbed = false;
    let start = state.pos;
    if (
      state.src.charCodeAt(start) === 0x21 /* ! */ &&
      state.src.charCodeAt(start + 1) === 0x5b /* [ */ &&
      state.src.charCodeAt(start + 2) === 0x5b /* [ */
    ) {
      isEmbed = true;
      start += 1;
    } else if (
      state.src.charCodeAt(start) !== 0x5b /* [ */ ||
      state.src.charCodeAt(start + 1) !== 0x5b /* [ */
    ) {
      return false;
    }

    const max = state.posMax;
    const close = state.src.indexOf("]]", start + 2);
    if (close === -1 || close > max) return false;

    const raw = state.src.slice(start + 2, close);
    if (raw.includes("\n") || !raw.trim()) return false;

    if (!silent) {
      let target = raw.trim();
      let label = target;
      const pipeIdx = raw.indexOf("|");
      if (pipeIdx !== -1) {
        target = raw.slice(0, pipeIdx).trim();
        label = raw.slice(pipeIdx + 1).trim() || target;
      }

      const isBlockRef = target.includes("#^");
      const token = state.push(isEmbed ? "wikilink_embed" : "wikilink", isEmbed ? "div" : "a", 0);
      token.attrs = [
        [
          "class",
          isEmbed ? "wikilink-embed-card" : isBlockRef ? "wikilink wikilink-block" : "wikilink",
        ],
        ["href", `#wikilink:${encodeURIComponent(target)}`],
        ["data-wikilink-target", target],
        ["data-wikilink-label", label],
      ];
      token.content = label;
      token.meta = { isBlockRef, isEmbed };
    }

    state.pos = close + 2;
    return true;
  });

  md.renderer.rules.wikilink = (tokens, index) => {
    const token = tokens[index];
    const target = token.attrGet("data-wikilink-target") || "";
    const label = token.attrGet("data-wikilink-label") || target;
    const isBlockRef = token.meta?.isBlockRef || target.includes("#^");
    const escapedTarget = md.utils.escapeHtml(target);
    const escapedLabel = md.utils.escapeHtml(label);
    const encodedTarget = encodeURIComponent(target);

    if (isBlockRef) {
      const displayLabel = formatBlockRefDisplayLabel(target, label);
      const escapedDisplayLabel = md.utils.escapeHtml(displayLabel);
      return `<a class="wikilink wikilink-block" href="#wikilink:${encodedTarget}" data-wikilink-target="${escapedTarget}" data-wikilink-label="${escapedLabel}" title="跳转至段落引用: ${escapedTarget}"><span class="wikilink-bracket">[[</span><span class="wikilink-block-symbol">⚓ </span><span class="wikilink-text">${escapedDisplayLabel}</span><span class="wikilink-bracket">]]</span></a>`;
    }

    return `<a class="wikilink" href="#wikilink:${encodedTarget}" data-wikilink-target="${escapedTarget}" data-wikilink-label="${escapedLabel}" title="跳转至: ${escapedTarget}"><span class="wikilink-bracket">[[</span><span class="wikilink-text">${escapedLabel}</span><span class="wikilink-bracket">]]</span></a>`;
  };

  md.renderer.rules.wikilink_embed = (tokens, index) => {
    const token = tokens[index];
    const target = token.attrGet("data-wikilink-target") || "";
    const label = token.attrGet("data-wikilink-label") || target;
    const escapedTarget = md.utils.escapeHtml(target);
    const escapedLabel = md.utils.escapeHtml(label);
    const encodedTarget = encodeURIComponent(target);

    const displaySource = formatBlockRefDisplayLabel(target, target);
    const escapedDisplaySource = md.utils.escapeHtml(displaySource);

    return `<div class="wikilink-embed-card" data-embed-target="${escapedTarget}"><div class="embed-header"><span class="embed-tag">🔗 块级内联引用</span><a class="embed-source-link" href="#wikilink:${encodedTarget}" data-wikilink-target="${escapedTarget}" title="跳转至原出处">${escapedDisplaySource}</a></div><div class="embed-content">${escapedLabel}</div></div>`;
  };
}
