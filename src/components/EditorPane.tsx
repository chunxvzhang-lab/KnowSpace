import { memo, useEffect, useRef, useState } from "react";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  HighlightStyle,
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { autocompletion, closeBrackets, closeBracketsKeymap, startCompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import type { ThemeMode } from "../core/types";
import { matchSlashCommands, getCommandTemplate } from "../services/slashCommands";
import { EditorContextMenu } from "./EditorContextMenu";

export type WikiLinkTarget = {
  id?: string;
  title: string;
  relativePath?: string;
  absolutePath?: string;
};

type EditorPaneProps = {
  value: string;
  onChange: (value: string) => void;
  theme: ThemeMode;
  fontScale?: number;
  readOnly?: boolean;
  typewriterMode?: boolean;
  currentFilePath?: string;
  wikiLinkTargets?: WikiLinkTarget[];
  onSave?: () => void;
  onScroll?: (view: EditorView) => void;
  onSelectionChange?: (view: EditorView) => void;
  onEditorViewReady?: (view: EditorView | null) => void;
  onExtractToNote?: (selectedText: string, suggestedTitle: string) => void;
  onSendToFlash?: (text: string) => void;
  onPrint?: () => void;
  onToggleMindmap?: () => void;
  onRevealInToc?: () => void;
};

// Rich, high-contrast syntax highlighting for Light Theme (Warm Orange-Yellow Accent)
const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "#1f2328", fontWeight: "700" },
  { tag: tags.heading1, color: "#d97706", fontWeight: "800" },
  { tag: tags.heading2, color: "#1f2328", fontWeight: "700" },
  { tag: tags.heading3, color: "#1f2328", fontWeight: "600" },
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword], color: "#cf222e", fontWeight: "600" },
  { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: "#cf222e" },
  { tag: [tags.propertyName], color: "#116329" },
  { tag: [tags.variableName, tags.definition(tags.variableName)], color: "#953800" },
  { tag: [tags.function(tags.variableName), tags.labelName], color: "#8250df" },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: "#0550ae" },
  { tag: [tags.definition(tags.typeName), tags.typeName], color: "#953800" },
  { tag: [tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: "#0550ae", fontWeight: "600" },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.special(tags.string)], color: "#0550ae" },
  { tag: [tags.meta, tags.comment], color: "#6e7781", fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "#d97706", textDecoration: "underline" },
  { tag: tags.monospace, color: "#c2410c", backgroundColor: "rgba(245, 158, 11, 0.12)", borderRadius: "3px" },
  { tag: [tags.string, tags.inserted], color: "#0a3069" },
  { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: "#0550ae", fontWeight: "600" },
  { tag: tags.invalid, color: "#cf222e" },
]);

// Monochrome, book-press typography highlighting for E-ink Theme
const einkHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "#111111", fontWeight: "700" },
  { tag: tags.heading1, color: "#000000", fontWeight: "800", textDecoration: "underline" },
  { tag: tags.heading2, color: "#1a1a1a", fontWeight: "700" },
  { tag: tags.heading3, color: "#222222", fontWeight: "600" },
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword], color: "#111111", fontWeight: "700" },
  { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: "#222222", fontWeight: "600" },
  { tag: [tags.propertyName], color: "#1a1a1a" },
  { tag: [tags.variableName, tags.definition(tags.variableName)], color: "#262626" },
  { tag: [tags.function(tags.variableName), tags.labelName], color: "#111111", fontWeight: "600" },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: "#333333", fontWeight: "600" },
  { tag: [tags.definition(tags.typeName), tags.typeName], color: "#111111", fontWeight: "600" },
  { tag: [tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: "#222222" },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.special(tags.string)], color: "#333333" },
  { tag: [tags.meta, tags.comment], color: "#666666", fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700", color: "#000000" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "#111111", textDecoration: "underline" },
  { tag: tags.monospace, color: "#1a1a1a", backgroundColor: "rgba(0, 0, 0, 0.05)", borderRadius: "3px" },
  { tag: [tags.string, tags.inserted], color: "#3a3a3a", fontStyle: "italic" },
  { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: "#111111", fontWeight: "600" },
  { tag: tags.invalid, color: "#555555", textDecoration: "underline wavy" },
]);

function buildCustomTheme(theme: ThemeMode, fontScale: number, typewriterMode = false) {
  const isDarkMode =
    theme === "twitter" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  const isEink = theme === "eink";

  const accentColor = isDarkMode ? "#1d9bf0" : isEink ? "#1a1a1a" : "#d97706";
  const activeLineIndicator = isDarkMode ? "#1d9bf0" : isEink ? "#9c9586" : "#d97706";
  const bgColor = isDarkMode ? "#000000" : isEink ? "#f8f6f0" : "#ffffff";
  const textColor = isDarkMode ? "#f1f5f9" : isEink ? "#1a1a1a" : "#1f2328";
  const gutterBg = isDarkMode ? "#0a0d12" : isEink ? "#ede8df" : "#ffffff";
  const gutterColor = isDarkMode ? "#71767b" : isEink ? "#7c776e" : "#64748b";
  const gutterBorder = isDarkMode ? "1px solid rgba(255, 255, 255, 0.08)" : isEink ? "1px solid #d5cfc0" : "1px solid #e2e8f0";
  const activeLineBg = isDarkMode
    ? "rgba(29, 155, 240, 0.16) !important"
    : isEink
    ? "#ded9cd !important"
    : "rgba(245, 158, 11, 0.10) !important";
  const activeGutterBg = isDarkMode
    ? "rgba(29, 155, 240, 0.22) !important"
    : isEink
    ? "#ded9cd !important"
    : "rgba(245, 158, 11, 0.16) !important";
  const activeGutterColor = isDarkMode
    ? "#1d9bf0 !important"
    : isEink
    ? "#1a1a1a !important"
    : "#d97706 !important";
  const selectionBg = isDarkMode
    ? "rgba(29, 155, 240, 0.35) !important"
    : isEink
    ? "rgba(0, 0, 0, 0.10) !important"
    : "rgba(245, 158, 11, 0.25) !important";
  const matchBg = isDarkMode
    ? "rgba(29, 155, 240, 0.25) !important"
    : isEink
    ? "#d5cebf !important"
    : "rgba(245, 158, 11, 0.18) !important";
  const matchOutline = isDarkMode
    ? "1px solid rgba(29, 155, 240, 0.6) !important"
    : isEink
    ? "1px solid #a8a090 !important"
    : "1px solid rgba(217, 119, 6, 0.45) !important";

  return EditorView.theme(
    {
      "&": {
        height: "100%",
        fontSize: `${14 * fontScale}px`,
        fontFamily: '"Cascadia Code", "Fira Code", Consolas, "Courier New", monospace',
        backgroundColor: bgColor,
        color: textColor,
      },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily: '"Cascadia Code", "Fira Code", Consolas, "Courier New", monospace',
        lineHeight: "1.65",
      },
      ".cm-content": {
        padding: "16px 14px",
        paddingBottom: typewriterMode ? "50vh" : "16px",
        caretColor: accentColor,
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: `${accentColor} !important`,
        borderLeftWidth: "2.5px !important",
      },
      ".cm-gutters": {
        backgroundColor: gutterBg,
        color: gutterColor,
        borderRight: gutterBorder,
        paddingRight: "6px",
      },
      ".cm-activeLine": {
        backgroundColor: activeLineBg,
        boxShadow: `inset 3.5px 0 0 0 ${activeLineIndicator} !important`,
      },
      ".cm-activeLineGutter": {
        backgroundColor: activeGutterBg,
        color: activeGutterColor,
        fontWeight: "bold",
      },
      ".cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground, ::selection": {
        backgroundColor: selectionBg,
      },
      ".cm-selectionMatch": {
        backgroundColor: matchBg,
        outline: matchOutline,
      },
    },
    { dark: isDarkMode }
  );
}

function resolveHighlightExtensions(theme: ThemeMode, customBaseTheme: Extension): Extension[] {
  const isDarkMode =
    theme === "twitter" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches);

  if (isDarkMode) {
    return [oneDark, customBaseTheme];
  }
  if (theme === "eink") {
    return [customBaseTheme, syntaxHighlighting(einkHighlightStyle), syntaxHighlighting(defaultHighlightStyle, { fallback: true })];
  }
  return [customBaseTheme, syntaxHighlighting(lightHighlightStyle), syntaxHighlighting(defaultHighlightStyle, { fallback: true })];
}

export const EditorPane = memo(function EditorPane({
  value,
  onChange,
  theme,
  fontScale = 1,
  readOnly = false,
  typewriterMode = false,
  currentFilePath,
  wikiLinkTargets,
  onSave,
  onScroll,
  onSelectionChange,
  onEditorViewReady,
  onExtractToNote,
  onSendToFlash,
  onPrint,
  onToggleMindmap,
  onRevealInToc,
}: EditorPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const themeCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());
  const fontSizeCompartment = useRef(new Compartment());
  const typewriterRafRef = useRef<number | null>(null);
  const currentFilePathRef = useRef(currentFilePath);
  currentFilePathRef.current = currentFilePath;
  const wikiLinkTargetsRef = useRef<WikiLinkTarget[]>(wikiLinkTargets ?? []);
  wikiLinkTargetsRef.current = wikiLinkTargets ?? [];
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onScrollRef = useRef(onScroll);
  onScrollRef.current = onScroll;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onEditorViewReadyRef = useRef(onEditorViewReady);
  onEditorViewReadyRef.current = onEditorViewReady;
  const typewriterModeRef = useRef(typewriterMode);
  typewriterModeRef.current = typewriterMode;

  const saveAndInsertImage = (file: File, view: EditorView) => {
    const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;
    if (!desktop?.savePastedImage) return;

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        if (!base64) return;

        const originalName = file.name || "pasted_image";
        const ext = file.type ? file.type.replace("image/", "") : "png";

        const res = await desktop.savePastedImage?.({
          currentFilePath: currentFilePathRef.current,
          bufferBase64: base64,
          originalName,
          ext,
        });

        if (res?.success && res.relativePath) {
          const insertText = `![${res.fileName || "image"}](${res.relativePath})\n`;
          const selection = view.state.selection.main;
          view.dispatch({
            changes: {
              from: selection.from,
              to: selection.to,
              insert: insertText,
            },
            selection: { anchor: selection.from + insertText.length },
          });
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Failed to process pasted image:", err);
    }
  };

  const isDarkMode =
    theme === "twitter" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches);

  const lastInternalValueRef = useRef(value);

  const triggerSmoothTypewriterScroll = (view: EditorView) => {
    if (!typewriterModeRef.current) return;
    if (!view.state.selection.main.empty) return;

    if (typewriterRafRef.current !== null) {
      cancelAnimationFrame(typewriterRafRef.current);
    }

    typewriterRafRef.current = requestAnimationFrame(() => {
      typewriterRafRef.current = null;
      try {
        const head = view.state.selection.main.head;
        const coords = view.coordsAtPos(head);
        if (!coords) return;

        const scroller = view.scrollDOM;
        const scrollerRect = scroller.getBoundingClientRect();
        const currentLineCenter = (coords.top + coords.bottom) / 2;
        const desiredLineCenter = scrollerRect.top + scrollerRect.height * 0.45;
        const diff = currentLineCenter - desiredLineCenter;

        // Smoothly adjust when moving across lines (diff > 6px) to avoid micro-jitter during horizontal typing
        if (Math.abs(diff) > 6) {
          const targetScrollTop = Math.max(0, scroller.scrollTop + diff);
          scroller.scrollTo({
            top: targetScrollTop,
            behavior: "smooth",
          });
        }
      } catch {
        // ignore detached DOM errors
      }
    });
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const customBaseTheme = buildCustomTheme(theme, fontScale, typewriterMode);

    // Helper: toggle an inline markdown marker (e.g. ** for bold, * for italic)
    const toggleInlineFormat = (view: EditorView, marker: string): boolean => {
      const state = view.state;
      const sel = state.selection.main;
      const doc = state.doc;

      if (!sel.empty) {
        const selectedText = state.sliceDoc(sel.from, sel.to);
        // Case 1: selection itself starts/ends with marker → unwrap
        if (
          selectedText.startsWith(marker) &&
          selectedText.endsWith(marker) &&
          selectedText.length >= marker.length * 2
        ) {
          const inner = selectedText.slice(marker.length, selectedText.length - marker.length);
          view.dispatch({
            changes: { from: sel.from, to: sel.to, insert: inner },
            selection: { anchor: sel.from, head: sel.from + inner.length },
          });
          return true;
        }
        // Case 2: markers sit just outside the selection → unwrap outer markers
        const preFrom = Math.max(0, sel.from - marker.length);
        const postTo = Math.min(doc.length, sel.to + marker.length);
        if (doc.sliceString(preFrom, sel.from) === marker && doc.sliceString(sel.to, postTo) === marker) {
          view.dispatch({
            changes: [
              { from: preFrom, to: sel.from, insert: "" },
              { from: sel.to, to: postTo, insert: "" },
            ],
            selection: { anchor: preFrom, head: preFrom + selectedText.length },
          });
          return true;
        }
        // Case 3: wrap selection
        const wrapped = `${marker}${selectedText}${marker}`;
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: wrapped },
          selection: { anchor: sel.from + marker.length, head: sel.from + marker.length + selectedText.length },
        });
        return true;
      }

      // No selection: check if cursor is inside existing markers on this line
      const line = doc.lineAt(sel.from);
      const lineText = line.text;
      const colOffset = sel.from - line.from;
      const esc = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`${esc}([\\s\\S]*?)${esc}`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(lineText)) !== null) {
        const mStart = m.index;
        const mEnd = m.index + m[0].length;
        if (colOffset >= mStart && colOffset <= mEnd) {
          // Cursor is inside → unwrap
          const absStart = line.from + mStart;
          const absEnd = line.from + mEnd;
          const inner = m[1];
          view.dispatch({
            changes: { from: absStart, to: absEnd, insert: inner },
            selection: { anchor: absStart, head: absStart + inner.length },
          });
          return true;
        }
      }

      // Insert placeholder wrapped with markers
      const placeholder = "文字";
      const insert = `${marker}${placeholder}${marker}`;
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert },
        selection: { anchor: sel.from + marker.length, head: sel.from + marker.length + placeholder.length },
      });
      return true;
    };

    const saveKeyBinding = keymap.of([
      {
        key: "Mod-s",
        run: () => {
          if (onSaveRef.current) {
            onSaveRef.current();
            return true;
          }
          return false;
        },
      },
      {
        key: "Mod-b",
        run: (view) => toggleInlineFormat(view, "**"),
      },
      {
        key: "Mod-i",
        run: (view) => toggleInlineFormat(view, "*"),
      },
    ]);

    lastInternalValueRef.current = value;
    const initialCursorPos = 0;

    const wikiLinkCompletionSource = (context: CompletionContext): CompletionResult | null => {
      const word = context.matchBefore(/(!?\[\[)([^\]\n|]*)/);
      if (!word) return null;

      const prefix = word.text.startsWith("![[") ? "![[" : "[[";
      const rawQuery = word.text.slice(prefix.length).trim();
      const queryLower = rawQuery.toLowerCase();

      // Autocomplete for block references [[#^... or [[doc#^...
      if (rawQuery.includes("#^")) {
        const [docPart, blockQuery] = rawQuery.split("#^");
        const blockClean = (blockQuery || "").toLowerCase();
        const blockMatches: { id: string; snippet: string }[] = [];
        const totalLines = context.state.doc.lines;
        for (let i = 1; i <= totalLines; i++) {
          const lineText = context.state.doc.line(i).text;
          const m = lineText.match(/\s\^([a-zA-Z0-9_-]+)$/);
          if (m) {
            const blockId = m[1];
            if (!blockClean || blockId.toLowerCase().includes(blockClean)) {
              const snippet = lineText.replace(/\s\^([a-zA-Z0-9_-]+)$/, "").trim();
              blockMatches.push({ id: blockId, snippet: snippet.slice(0, 40) });
            }
          }
        }

        if (blockMatches.length > 0) {
          return {
            from: word.from + prefix.length,
            options: blockMatches.map((b) => ({
              label: (docPart ? `${docPart}#^` : "#^") + b.id,
              detail: b.snippet,
              type: "keyword",
              apply: (view: EditorView, completion: any, from: number, to: number) => {
                const docAfter = view.state.sliceDoc(to, to + 2);
                const needsClosing = docAfter !== "]]";
                const insert = completion.label + (needsClosing ? "]]" : "");
                view.dispatch({
                  changes: { from, to, insert },
                  selection: { anchor: from + insert.length },
                });
              },
            })),
            filter: false,
          };
        }
      }

      const targets = wikiLinkTargetsRef.current;
      const matched = targets.filter((t) => {
        if (!queryLower) return true;
        const titleLower = t.title.toLowerCase();
        const pathLower = (t.relativePath || "").toLowerCase();
        return titleLower.includes(queryLower) || pathLower.includes(queryLower);
      });

      return {
        from: word.from + prefix.length,
        options: matched.map((t) => ({
          label: t.title,
          detail: t.relativePath || undefined,
          type: "file",
          apply: (view: EditorView, completion: any, from: number, to: number) => {
            const docAfter = view.state.sliceDoc(to, to + 2);
            const needsClosing = docAfter !== "]]";
            const insert = completion.label + (needsClosing ? "]]" : "");
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: from + insert.length },
            });
          },
        })),
        filter: false,
      };
    };

    const slashCommandCompletionSource = (context: CompletionContext): CompletionResult | null => {
      // Trigger when user types / at line start or anywhere in paragraph (beginning, middle, end)
      const word = context.matchBefore(/\/([a-zA-Z0-9_\u4e00-\u9fa5-]*)$/);
      if (!word) return null;

      // Smart avoidance: do not trigger on URLs (http://, https://), code comments (//), or escape slashes (\/)
      if (word.from > 0) {
        const charBefore = context.state.doc.sliceString(word.from - 1, word.from);
        if (charBefore === "/" || charBefore === ":" || charBefore === "\\") {
          return null;
        }
      }

      const query = word.text.slice(1);
      const matchedCommands = matchSlashCommands(query);
      if (matchedCommands.length === 0) return null;

      return {
        from: word.from,
        to: context.pos,
        options: matchedCommands.map((cmd) => {
          const { text, cursorOffset } = getCommandTemplate(cmd);
          return {
            label: `/${cmd.keywords[0] || cmd.id}`,
            displayLabel: `${cmd.icon} ${cmd.title}`,
            detail: cmd.description,
            type: "keyword",
            boost: cmd.category === "排版与标题" ? 99 : 50,
            apply: (view: EditorView, _completion: any, from: number, to: number) => {
              view.dispatch({
                changes: { from, to, insert: text },
                selection: { anchor: from + cursorOffset },
              });
              if (cmd.id === "wikilink") {
                // Instantly popup wikilink completion popup for seamless note selection
                window.setTimeout(() => {
                  try {
                    startCompletion(view);
                  } catch {}
                }, 25);
              }
            },
          };
        }),
        filter: false,
      };
    };

    const state = EditorState.create({
      doc: value,
      selection: { anchor: initialCursorPos, head: initialCursorPos },
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({
          override: [wikiLinkCompletionSource, slashCommandCompletionSource],
        }),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        markdown(),
        EditorView.lineWrapping,
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
        ]),
        saveKeyBinding,
        themeCompartment.current.of(resolveHighlightExtensions(theme, customBaseTheme)),
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
        fontSizeCompartment.current.of(
          EditorView.theme({
            "&": { fontSize: `${14 * fontScale}px` },
          })
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const docString = update.state.doc.toString();
            lastInternalValueRef.current = docString;
            onChangeRef.current(docString);
          }
          if (update.selectionSet || update.docChanged) {
            onSelectionChangeRef.current?.(update.view);

            if (typewriterModeRef.current && update.view.state.selection.main.empty) {
              triggerSmoothTypewriterScroll(update.view);
            }
          }
        }),
        EditorView.domEventHandlers({
          paste(event, view) {
            const clipboardData = event.clipboardData;
            if (!clipboardData) return false;
            const items = clipboardData.items;
            if (!items) return false;

            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              if (item.type && item.type.startsWith("image/")) {
                event.preventDefault();
                const file = item.getAsFile();
                if (file) {
                  saveAndInsertImage(file, view);
                  return true;
                }
              }
            }
            return false;
          },
          drop(event, view) {
            const dataTransfer = event.dataTransfer;
            if (!dataTransfer || !dataTransfer.files || dataTransfer.files.length === 0) {
              return false;
            }
            const files = Array.from(dataTransfer.files);
            const imageFiles = files.filter(
              (f) => f.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(f.name)
            );
            if (imageFiles.length > 0) {
              event.preventDefault();
              imageFiles.forEach((file) => {
                saveAndInsertImage(file, view);
              });
              return true;
            }
            return false;
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    onEditorViewReadyRef.current?.(view);

    const onScroll = () => {
      onScrollRef.current?.(view);
    };

    view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (typewriterRafRef.current !== null) {
        cancelAnimationFrame(typewriterRafRef.current);
      }
      view.scrollDOM.removeEventListener("scroll", onScroll);
      onEditorViewReadyRef.current?.(null);
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Update document content if changed from outside (e.g. reload or undo), preserving cursor position
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (value === lastInternalValueRef.current && value === currentDoc) {
      return;
    }
    if (value !== currentDoc) {
      lastInternalValueRef.current = value;
      const currentSelection = view.state.selection.main;
      const targetPos = Math.min(currentSelection.head, value.length);
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
        selection: { anchor: targetPos, head: targetPos },
      });
    }
  }, [value]);

  // Update theme and typewriter mode dynamically
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const customBaseTheme = buildCustomTheme(theme, fontScale, typewriterMode);
    view.dispatch({
      effects: themeCompartment.current.reconfigure(resolveHighlightExtensions(theme, customBaseTheme)),
    });
    if (typewriterMode) {
      triggerSmoothTypewriterScroll(view);
    }
  }, [theme, isDarkMode, fontScale, typewriterMode]);

  // Update font scale dynamically
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: fontSizeCompartment.current.reconfigure(
        EditorView.theme({
          "&": { fontSize: `${14 * fontScale}px` },
        })
      ),
    });
  }, [fontScale]);

  // Update readonly state
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  return (
    <div
      ref={containerRef}
      className="editor-pane-container"
      data-testid="codemirror-editor"
      style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative" }}
      onContextMenu={(e) => {
        e.preventDefault();
        const view = viewRef.current;
        if (view) {
          const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
          if (pos !== null) {
            const sel = view.state.selection.main;
            const isInsideSelection = !sel.empty && pos >= sel.from && pos <= sel.to;
            if (!isInsideSelection) {
              view.dispatch({ selection: { anchor: pos, head: pos } });
            }
          }
        }
        setContextMenuPos({ x: e.clientX, y: e.clientY });
      }}
    >
      {contextMenuPos && viewRef.current && (
        <EditorContextMenu
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          onClose={() => setContextMenuPos(null)}
          view={viewRef.current}
          currentFilePath={currentFilePath}
          onExtractToNote={onExtractToNote}
          onSendToFlash={onSendToFlash}
          onPrint={onPrint}
          onToggleMindmap={onToggleMindmap}
          onRevealInToc={onRevealInToc}
        />
      )}
    </div>
  );
});
