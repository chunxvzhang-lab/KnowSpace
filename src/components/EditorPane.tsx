import { memo, useEffect, useRef, useState } from "react";
import { EditorState, Compartment, Annotation, Prec, type Extension } from "@codemirror/state";
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
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import type { ThemeMode } from "../core/types";
import { slashCommandCompletionSource } from "./editorSlashCommands";
import { EditorContextMenu } from "./EditorContextMenu";
import { listContinueKeymap } from "./editorListContinue";
import { livePreview, livePreviewTheme } from "./editorLivePreview";
import { useUiStore } from "../store/useUiStore";

const externalDocumentUpdate = Annotation.define<boolean>();

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
  livePreviewMode?: boolean;
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
  {
    tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword],
    color: "#cf222e",
    fontWeight: "600",
  },
  { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: "#cf222e" },
  { tag: [tags.propertyName], color: "#116329" },
  { tag: [tags.variableName, tags.definition(tags.variableName)], color: "#953800" },
  { tag: [tags.function(tags.variableName), tags.labelName], color: "#8250df" },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: "#0550ae" },
  { tag: [tags.definition(tags.typeName), tags.typeName], color: "#953800" },
  {
    tag: [tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace],
    color: "#0550ae",
    fontWeight: "600",
  },
  {
    tag: [
      tags.operator,
      tags.operatorKeyword,
      tags.url,
      tags.escape,
      tags.regexp,
      tags.special(tags.string),
    ],
    color: "#0550ae",
  },
  { tag: [tags.meta, tags.comment], color: "#6e7781", fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "#d97706", textDecoration: "underline" },
  {
    tag: tags.monospace,
    color: "#c2410c",
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderRadius: "3px",
  },
  { tag: [tags.string, tags.inserted], color: "#0a3069" },
  {
    tag: [tags.atom, tags.bool, tags.special(tags.variableName)],
    color: "#0550ae",
    fontWeight: "600",
  },
  { tag: tags.invalid, color: "#cf222e" },
]);

// Monochrome, book-press typography highlighting for E-ink Theme
const einkHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "#111111", fontWeight: "700" },
  { tag: tags.heading1, color: "#000000", fontWeight: "800", textDecoration: "underline" },
  { tag: tags.heading2, color: "#1a1a1a", fontWeight: "700" },
  { tag: tags.heading3, color: "#222222", fontWeight: "600" },
  {
    tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword],
    color: "#111111",
    fontWeight: "700",
  },
  {
    tag: [tags.name, tags.deleted, tags.character, tags.macroName],
    color: "#222222",
    fontWeight: "600",
  },
  { tag: [tags.propertyName], color: "#1a1a1a" },
  { tag: [tags.variableName, tags.definition(tags.variableName)], color: "#262626" },
  { tag: [tags.function(tags.variableName), tags.labelName], color: "#111111", fontWeight: "600" },
  {
    tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)],
    color: "#333333",
    fontWeight: "600",
  },
  { tag: [tags.definition(tags.typeName), tags.typeName], color: "#111111", fontWeight: "600" },
  {
    tag: [tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace],
    color: "#222222",
  },
  {
    tag: [
      tags.operator,
      tags.operatorKeyword,
      tags.url,
      tags.escape,
      tags.regexp,
      tags.special(tags.string),
    ],
    color: "#333333",
  },
  { tag: [tags.meta, tags.comment], color: "#666666", fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700", color: "#000000" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "#111111", textDecoration: "underline" },
  {
    tag: tags.monospace,
    color: "#1a1a1a",
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    borderRadius: "3px",
  },
  { tag: [tags.string, tags.inserted], color: "#3a3a3a", fontStyle: "italic" },
  {
    tag: [tags.atom, tags.bool, tags.special(tags.variableName)],
    color: "#111111",
    fontWeight: "600",
  },
  { tag: tags.invalid, color: "#555555", textDecoration: "underline wavy" },
]);

function buildCustomTheme(theme: ThemeMode, fontScale: number, typewriterMode = false) {
  const isDarkMode =
    theme === "twitter" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  const accentColor = "var(--accent)";
  const activeLineIndicator = "var(--border-hover)";
  const bgColor = "var(--surface)";
  const textColor = "var(--text)";
  const gutterBg = "var(--surface)";
  const gutterColor = "var(--text-muted)";
  const gutterBorder = "1px solid var(--border)";
  const activeLineBg = "var(--surface-2) !important";
  const activeGutterBg = "var(--surface-2) !important";
  const activeGutterColor = "var(--text) !important";
  const selectionBg = "color-mix(in srgb, var(--accent) 18%, transparent) !important";
  const matchBg = "color-mix(in srgb, var(--accent) 12%, transparent) !important";
  const matchOutline = "1px solid var(--border-hover) !important";

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
    { dark: isDarkMode },
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
    return [
      customBaseTheme,
      syntaxHighlighting(einkHighlightStyle),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    ];
  }
  return [
    customBaseTheme,
    syntaxHighlighting(lightHighlightStyle),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  ];
}

export const EditorPane = memo(function EditorPane({
  value,
  onChange,
  theme,
  fontScale = 1,
  readOnly = false,
  livePreviewMode = false,
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
  const editingModeCompartment = useRef(new Compartment());
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
  const pendingImageRanges = useRef(new Set<{ from: number; to: number }>());

  const saveAndInsertImage = (file: File, view: EditorView) => {
    if (view.state.readOnly) return;
    const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;
    if (!desktop?.capture.savePastedImage) return;
    const filePath = currentFilePathRef.current;
    const range = { from: view.state.selection.main.from, to: view.state.selection.main.to };
    pendingImageRanges.current.add(range);
    const reportFailure = () => useUiStore.getState().notify("图片插入失败，请重试。");

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        if (viewRef.current !== view || view.state.readOnly) {
          pendingImageRanges.current.delete(range);
          return;
        }
        const base64 = reader.result as string;
        if (!base64) {
          pendingImageRanges.current.delete(range);
          reportFailure();
          return;
        }

        const originalName = file.name || "pasted_image";
        const ext = file.type ? file.type.replace("image/", "") : "png";

        try {
          const res = await desktop.capture.savePastedImage?.({
            currentFilePath: filePath,
            bufferBase64: base64,
            originalName,
            ext,
          });

          if (
            viewRef.current !== view ||
            view.state.readOnly ||
            currentFilePathRef.current !== filePath
          )
            return;
          if (res?.success && res.relativePath) {
            const insertText = `![${res.fileName || "image"}](${res.relativePath})\n`;
            pendingImageRanges.current.delete(range);
            view.dispatch({
              changes: {
                from: range.from,
                to: range.to,
                insert: insertText,
              },
              userEvent: "input.paste",
            });
          } else reportFailure();
        } catch (error) {
          console.error("Failed to save pasted image:", error);
          if (viewRef.current === view) reportFailure();
        } finally {
          pendingImageRanges.current.delete(range);
        }
      };
      reader.onerror = () => {
        pendingImageRanges.current.delete(range);
        reportFailure();
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Failed to process pasted image:", err);
      pendingImageRanges.current.delete(range);
      reportFailure();
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
      if (state.readOnly) return true;
      const sel = state.selection.main;
      const doc = state.doc;

      if (!sel.empty) {
        const selectedText = state.sliceDoc(sel.from, sel.to);
        // Case 1: selection itself starts/ends with marker → unwrap
        if (
          selectedText.startsWith(marker) &&
          selectedText.endsWith(marker) &&
          (marker !== "*" ||
            ((selectedText.match(/^\*+/)?.[0].length ?? 0) % 2 === 1 &&
              (selectedText.match(/\*+$/)?.[0].length ?? 0) % 2 === 1)) &&
          selectedText.length >= marker.length * 2
        ) {
          const inner = selectedText.slice(marker.length, selectedText.length - marker.length);
          view.dispatch({
            userEvent: "input.format",
            changes: { from: sel.from, to: sel.to, insert: inner },
            selection: { anchor: sel.from, head: sel.from + inner.length },
          });
          return true;
        }
        // Case 2: markers sit just outside the selection → unwrap outer markers
        const preFrom = Math.max(0, sel.from - marker.length);
        const postTo = Math.min(doc.length, sel.to + marker.length);
        if (
          doc.sliceString(preFrom, sel.from) === marker &&
          doc.sliceString(sel.to, postTo) === marker &&
          (marker !== "*" ||
            ((state.sliceDoc(0, sel.from).match(/\*+$/)?.[0].length ?? 0) % 2 === 1 &&
              (state.sliceDoc(sel.to).match(/^\*+/)?.[0].length ?? 0) % 2 === 1))
        ) {
          view.dispatch({
            userEvent: "input.format",
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
          userEvent: "input.format",
          changes: { from: sel.from, to: sel.to, insert: wrapped },
          selection: {
            anchor: sel.from + marker.length,
            head: sel.from + marker.length + selectedText.length,
          },
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
            userEvent: "input.format",
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
        userEvent: "input.format",
        changes: { from: sel.from, to: sel.to, insert },
        selection: {
          anchor: sel.from + marker.length,
          head: sel.from + marker.length + placeholder.length,
        },
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
      {
        key: "Mod-Shift-=",
        run: (view) => toggleInlineFormat(view, "^"),
      },
      {
        key: "Mod-=",
        run: (view) => toggleInlineFormat(view, "~"),
      },
    ]);

    lastInternalValueRef.current = value;
    const initialCursorPos = 0;

    const wikiLinkCompletionSource = (context: CompletionContext): CompletionResult | null => {
      if (context.state.readOnly) return null;
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

    const state = EditorState.create({
      doc: value,
      selection: { anchor: initialCursorPos, head: initialCursorPos },
      extensions: [
        // CodeMirror readOnly is advisory; custom commands can still dispatch changes.
        EditorState.transactionFilter.of((transaction) =>
          transaction.startState.readOnly &&
          transaction.docChanged &&
          !transaction.annotation(externalDocumentUpdate)
            ? []
            : transaction,
        ),
        editingModeCompartment.current.of(
          livePreviewMode
            ? [livePreview, livePreviewTheme(typewriterMode)]
            : [lineNumbers(), highlightActiveLineGutter(), foldGutter()],
        ),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        listContinueKeymap,
        autocompletion({
          override: [wikiLinkCompletionSource, slashCommandCompletionSource],
        }),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        markdown({ base: markdownLanguage }),
        EditorView.lineWrapping,
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
        ]),
        Prec.high(saveKeyBinding),
        themeCompartment.current.of(resolveHighlightExtensions(theme, customBaseTheme)),
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
        fontSizeCompartment.current.of(
          EditorView.theme({
            "&": { fontSize: `${(livePreviewMode ? 16 : 14) * fontScale}px` },
          }),
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            for (const range of pendingImageRanges.current) {
              range.from = update.changes.mapPos(range.from, 1);
              range.to = Math.max(range.from, update.changes.mapPos(range.to, -1));
            }
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
            if (view.state.readOnly) return false;
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
            if (view.state.readOnly) return false;
            const dataTransfer = event.dataTransfer;
            if (!dataTransfer || !dataTransfer.files || dataTransfer.files.length === 0) {
              return false;
            }
            const files = Array.from(dataTransfer.files);
            const imageFiles = files.filter(
              (f) => f.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(f.name),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editor view is constructed once at mount; value/theme/fontScale/readOnly/typewriterMode changes are applied to the live view by the dedicated follow-up effects below
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
        annotations: externalDocumentUpdate.of(true),
      });
    }
  }, [value]);

  // Update theme and typewriter mode dynamically
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const customBaseTheme = buildCustomTheme(theme, fontScale, typewriterMode);
    view.dispatch({
      effects: themeCompartment.current.reconfigure(
        resolveHighlightExtensions(theme, customBaseTheme),
      ),
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
          "&": { fontSize: `${(livePreviewMode ? 16 : 14) * fontScale}px` },
        }),
      ),
    });
  }, [fontScale, livePreviewMode]);

  // Update readonly state
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: editingModeCompartment.current.reconfigure(
        livePreviewMode
          ? [livePreview, livePreviewTheme(typewriterMode)]
          : [lineNumbers(), highlightActiveLineGutter(), foldGutter()],
      ),
    });
  }, [livePreviewMode, typewriterMode]);

  return (
    <div
      ref={containerRef}
      className={`editor-pane-container ${livePreviewMode ? "is-live-preview" : ""}`}
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
