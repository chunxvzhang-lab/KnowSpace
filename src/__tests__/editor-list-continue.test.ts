/**
 * Enter on a list line continues the list (editorListContinue): bullets
 * repeat, ordered numbers bump, checked boxes reset, empty items exit the
 * list. Decision is a pure function of EditorState, so these run without a
 * mounted editor. Negative pairs pin what must NOT be claimed: mid-line
 * Enter (default split), non-list lines, and multi-character selections.
 */
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { listContinueEdit } from "../components/editorListContinue";

function editAt(doc: string, pos: number, selTo = pos) {
  const state = EditorState.create({ doc, selection: { anchor: pos, head: selTo } });
  return listContinueEdit(state);
}

describe("Enter list continuation", () => {
  it("continues a bullet with the same marker and the cursor after it", () => {
    const doc = "- 苹果\n- 香蕉";
    expect(editAt(doc, doc.length)).toEqual({
      kind: "continue",
      insert: "\n- ",
      cursorOffset: 3,
    });
  });

  it("bumps an ordered marker, keeping its delimiter", () => {
    const doc = "1. 第一步\n2. 第二步";
    expect(editAt(doc, doc.length)).toEqual({
      kind: "continue",
      insert: "\n3. ",
      cursorOffset: 4,
    });
  });

  it("continues an unchecked task and resets a checked one", () => {
    const unchecked = "- [ ] 任务 A";
    expect(
      editAt(unchecked, unchecked.length)?.kind === "continue" &&
        (editAt(unchecked, unchecked.length) as { insert: string }).insert.endsWith("- [ ] "),
    ).toBe(true);

    const checked = "- [x] 已完成任务";
    const edit = editAt(checked, checked.length);
    expect(
      edit?.kind === "continue" && (edit as { insert: string }).insert.endsWith("- [ ] "),
    ).toBe(true);
  });

  it("keeps the indentation of nested items", () => {
    const doc = "  - 子项";
    const edit = editAt(doc, doc.length);
    expect(edit?.kind === "continue" && (edit as { insert: string }).insert).toBe("\n  - ");
  });

  it("exits the list when Enter lands on an empty item", () => {
    const doc = "- 苹果\n-";
    expect(editAt(doc, doc.length)).toEqual({ kind: "exit" });
  });

  it("returns null for mid-line cursor (default split), non-list lines, and selections", () => {
    const doc = "- 苹果";
    expect(editAt(doc, 2)).toBeNull(); // mid-line
    expect(editAt("普通段落", 4)).toBeNull(); // not a list
    expect(editAt("- 选区情况", 2, 4)).toBeNull(); // non-empty selection
  });
});
