import type { Extension, Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

class BulletWidget extends WidgetType {
  toDOM() {
    const bullet = document.createElement("span");
    bullet.className = "cm-live-bullet";
    bullet.textContent = "•";
    return bullet;
  }
}

class TaskWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly readOnly: boolean,
  ) {
    super();
  }

  eq(other: TaskWidget) {
    return (
      this.checked === other.checked && this.from === other.from && this.readOnly === other.readOnly
    );
  }

  toDOM(view: EditorView) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.checked;
    checkbox.disabled = this.readOnly;
    checkbox.className = "cm-live-task";
    checkbox.setAttribute("aria-label", this.checked ? "标记为未完成" : "标记为已完成");
    checkbox.addEventListener("mousedown", (event) => event.preventDefault());
    checkbox.addEventListener("change", () => {
      if (view.state.readOnly) return;
      view.dispatch({
        changes: { from: this.from + 1, to: this.from + 2, insert: checkbox.checked ? "x" : " " },
        userEvent: "input",
      });
    });
    return checkbox;
  }

  ignoreEvent() {
    return true;
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const decorations: Range<Decoration>[] = [];
  const editingLines = state.selection.ranges.map((range) => ({
    from: state.doc.lineAt(range.from).from,
    to: state.doc.lineAt(range.empty ? range.to : Math.max(range.from, range.to - 1)).to,
  }));
  const isEditing = (from: number, to: number) =>
    editingLines.some((line) => from <= line.to && to >= line.from);
  const hide = (from: number, to: number) => {
    if (to > from) decorations.push(Decoration.replace({}).range(from, to));
  };
  const mark = (from: number, to: number, className: string) => {
    if (to > from) decorations.push(Decoration.mark({ class: className }).range(from, to));
  };
  const styledLines = new Set<string>();
  const lineStyle = (from: number, className: string) => {
    const pos = state.doc.lineAt(from).from;
    const key = `${pos}:${className}`;
    if (styledLines.has(key)) return;
    styledLines.add(key);
    decorations.push(Decoration.line({ class: className }).range(pos));
  };

  // Only decorate visible syntax. CodeMirror keeps the Markdown source and undo history intact.
  const tree = syntaxTree(state);
  for (const visible of view.visibleRanges) {
    tree.iterate({
      from: visible.from,
      to: visible.to,
      enter(node) {
        const { name, from, to } = node;
        if (name === "FencedCode" || name === "CodeBlock") {
          const first = state.doc.lineAt(Math.max(from, visible.from)).number;
          const last = state.doc.lineAt(Math.min(to, visible.to)).number;
          for (let number = first; number <= last; number++) {
            lineStyle(state.doc.line(number).from, "cm-live-codeblock");
          }
          return false;
        }
        if (name === "HTMLBlock" || name === "Image") return false;
        if (/^ATXHeading[1-6]$/.test(name)) lineStyle(from, `cm-live-h${name.at(-1)}`);
        if (name === "QuoteMark") lineStyle(from, "cm-live-quote");
        if (name === "HorizontalRule" && !isEditing(from, to)) {
          mark(from, to, "cm-live-rule");
        }
        if (isEditing(from, to)) return;

        if (name === "HeaderMark" || name === "QuoteMark") {
          hide(from, state.sliceDoc(to, to + 1) === " " ? to + 1 : to);
        } else if (name === "EmphasisMark" || name === "StrikethroughMark" || name === "CodeMark") {
          hide(from, to);
        } else if (name === "StrongEmphasis") {
          mark(from, to, "cm-live-strong");
        } else if (name === "Emphasis") {
          mark(from, to, "cm-live-emphasis");
        } else if (name === "Strikethrough") {
          mark(from, to, "cm-live-strike");
        } else if (name === "InlineCode") {
          mark(from, to, "cm-live-inline-code");
          const delimiter = state.sliceDoc(from, to).match(/^`+/)?.[0].length ?? 1;
          hide(from, from + delimiter);
          hide(to - delimiter, to);
          return false;
        } else if (name === "TaskMarker") {
          decorations.push(
            Decoration.replace({
              widget: new TaskWidget(
                state.sliceDoc(from, to).toLowerCase() === "[x]",
                from,
                state.readOnly,
              ),
            }).range(from, to),
          );
        } else if (name === "ListMark" && /^[-+*]$/.test(state.sliceDoc(from, to))) {
          if (
            /^\s+\[[ xX]\]/.test(state.doc.lineAt(to).text.slice(to - state.doc.lineAt(to).from))
          ) {
            hide(from, to);
          } else {
            decorations.push(Decoration.replace({ widget: new BulletWidget() }).range(from, to));
          }
        } else if (name === "Link" && state.sliceDoc(Math.max(0, from - 1), from) !== "[") {
          const text = state.sliceDoc(from, to);
          const labelEnd = text.indexOf("](");
          if (labelEnd > 0 && text.endsWith(")") && !text.includes("\n")) {
            hide(from, from + 1);
            hide(from + labelEnd, to);
            mark(from + 1, from + labelEnd, "cm-live-link");
            return false;
          }
        }
      },
    });

    const first = state.doc.lineAt(visible.from).number;
    const last = state.doc.lineAt(visible.to).number;
    for (let number = first; number <= last; number++) {
      const line = state.doc.line(number);
      if (isEditing(line.from, line.to)) continue;
      const inlinePattern = /\[\[([^\]\n]+)\]\]|==([^=\n]+)==/g;
      for (const match of line.text.matchAll(inlinePattern)) {
        const from = line.from + match.index;
        const to = from + match[0].length;
        const prefix = line.text.slice(0, match.index);
        if ((prefix.match(/\\+$/)?.[0].length ?? 0) % 2 === 1 || prefix.endsWith("!")) continue;
        let node = tree.resolveInner(from, 1);
        let code = false;
        do {
          if (
            ["InlineCode", "FencedCode", "CodeBlock", "HTMLBlock", "Link", "Image"].includes(
              node.name,
            )
          )
            code = true;
          if (!node.parent) break;
          node = node.parent;
        } while (!code);
        if (code) continue;
        if (match[1]) {
          const alias = match[1].lastIndexOf("|");
          hide(from, from + 2 + (alias >= 0 ? alias + 1 : 0));
          hide(to - 2, to);
          mark(from + 2 + (alias >= 0 ? alias + 1 : 0), to - 2, "cm-live-link");
        } else {
          hide(from, from + 2);
          hide(to - 2, to);
          mark(from + 2, to - 2, "cm-live-highlight");
        }
      }
    }
  }
  return Decoration.set(decorations, true);
}

export const livePreview: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        update.startState.readOnly !== update.state.readOnly ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

export const livePreviewTheme = (typewriterMode = false) =>
  EditorView.theme({
    "&": { fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif' },
    ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.85" },
    ".cm-content": {
      maxWidth: "820px",
      margin: "0 auto",
      padding: "36px clamp(20px, 5%, 48px)",
      paddingBottom: typewriterMode ? "50vh" : "36px",
      boxSizing: "border-box",
      width: "100%",
    },
    ".cm-line": { padding: "2px 0" },
    ".cm-activeLine": { backgroundColor: "transparent !important", boxShadow: "none !important" },
    ".cm-live-h1": {
      fontSize: "2em",
      fontWeight: "750",
      lineHeight: "1.4",
      paddingTop: "0.7em",
      paddingBottom: "0.3em",
    },
    ".cm-live-h2": {
      fontSize: "1.6em",
      fontWeight: "700",
      lineHeight: "1.45",
      paddingTop: "0.6em",
    },
    ".cm-live-h3": { fontSize: "1.3em", fontWeight: "650", paddingTop: "0.5em" },
    ".cm-live-h4, .cm-live-h5, .cm-live-h6": {
      fontSize: "1.1em",
      fontWeight: "650",
      paddingTop: "0.4em",
    },
    ".cm-live-quote": {
      borderLeft: "3px solid var(--accent)",
      paddingLeft: "18px",
      color: "var(--text-muted)",
    },
    ".cm-live-strong": { fontWeight: "700" },
    ".cm-live-emphasis": { fontStyle: "italic" },
    ".cm-live-strike": { textDecoration: "line-through", color: "var(--text-muted)" },
    ".cm-live-inline-code, .cm-live-codeblock": {
      fontFamily: '"Cascadia Code", Consolas, monospace',
      backgroundColor: "var(--surface-2)",
    },
    ".cm-live-inline-code": { borderRadius: "4px", padding: "2px 4px" },
    ".cm-live-codeblock": { paddingLeft: "16px", paddingRight: "16px" },
    ".cm-live-link": {
      color: "var(--accent)",
      textDecoration: "underline",
      textUnderlineOffset: "3px",
    },
    ".cm-live-highlight": { backgroundColor: "var(--accent-surface)", borderRadius: "2px" },
    ".cm-live-bullet": { color: "var(--text-muted)", padding: "0 3px" },
    ".cm-live-task": {
      accentColor: "var(--accent)",
      verticalAlign: "middle",
      cursor: "pointer",
      margin: "0 5px 0 0",
    },
    ".cm-live-rule": {
      display: "inline-block",
      width: "100%",
      height: "1px",
      overflow: "hidden",
      backgroundColor: "var(--border)",
      verticalAlign: "middle",
    },
  });
