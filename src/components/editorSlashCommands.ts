import {
  startCompletion,
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import {
  matchSlashCommands,
  getCommandTemplate,
  detectSlashTrigger,
} from "../services/slashCommands";
import { useUiStore } from "../store/useUiStore";

export function slashCommandCompletionSource(context: CompletionContext): CompletionResult | null {
  if (context.state.readOnly) return null;
  // Shared with canvas cards so URLs and paths cannot accidentally open commands.
  const line = context.state.doc.lineAt(context.pos);
  const trigger = detectSlashTrigger(line.text, context.pos - line.from);
  if (!trigger) return null;
  const matchedCommands = matchSlashCommands(trigger.query);
  if (!matchedCommands.length) return null;
  return {
    from: line.from + trigger.startIndex,
    to: context.pos,
    options: matchedCommands.map((cmd) => {
      const { text, cursorOffset } = getCommandTemplate(cmd);
      return {
        label: `/${cmd.keywords[0] || cmd.id}`,
        displayLabel: `${cmd.icon} ${cmd.title}`,
        detail: cmd.description,
        type: "keyword",
        boost: cmd.category === "排版与标题" ? 99 : 50,
        apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
          view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + cursorOffset },
          });
          if (cmd.aiMode) useUiStore.getState().openAi(cmd.aiMode);
          if (cmd.id === "wikilink") {
            window.setTimeout(() => {
              if (view.dom.isConnected && !view.state.readOnly) startCompletion(view);
            }, 25);
          }
        },
      };
    }),
    filter: false,
  };
}
