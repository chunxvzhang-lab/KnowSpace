import { afterEach, describe, expect, it } from "vitest";
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { slashCommandCompletionSource } from "../components/editorSlashCommands";
import { useUiStore } from "../store/useUiStore";

afterEach(() => useUiStore.getState().closeAi());

describe("Editor AI slash commands", () => {
  it("removes the typed command and opens the requested AI task without starting a request", () => {
    const view = new EditorView({ state: EditorState.create({ doc: "前文\n/AI摘要" }) });
    try {
      const result = slashCommandCompletionSource(
        new CompletionContext(view.state, view.state.doc.length, true),
      );
      const option = result?.options.find((item) => item.label === "/AI摘要");
      expect(typeof option?.apply).toBe("function");
      if (result && option && typeof option.apply === "function")
        option.apply(view, option, result.from, result.to!);
      expect(view.state.doc.toString()).toBe("前文\n");
      expect(useUiStore.getState().aiOpen).toBe(true);
      expect(useUiStore.getState().aiMode).toBe("summary");
    } finally {
      view.destroy();
    }
  });

  it("offers no commands for a read-only document or a path", () => {
    for (const state of [
      EditorState.create({ doc: "/AI摘要", extensions: [EditorState.readOnly.of(true)] }),
      EditorState.create({ doc: "notes/AI摘要" }),
    ]) {
      expect(
        slashCommandCompletionSource(new CompletionContext(state, state.doc.length, true)),
      ).toBeNull();
    }
    expect(useUiStore.getState().aiOpen).toBe(false);
  });
});
