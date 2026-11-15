import { afterEach, expect, it } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useAiPendingEdits } from "../hooks/useAiPendingEdits";
import { useUiStore } from "../store/useUiStore";

afterEach(() => {
  cleanup();
  useUiStore.setState({ aiPendingDocument: null });
});
it("tracks local drafts only until they are committed or the diagram unmounts", () => {
  const { rerender, unmount } = renderHook(({ pending }) => useAiPendingEdits("C:/a.md", pending), {
    initialProps: { pending: true },
  });
  expect(useUiStore.getState().aiPendingDocument).toBe("C:/a.md");
  rerender({ pending: false });
  expect(useUiStore.getState().aiPendingDocument).toBeNull();
  rerender({ pending: true });
  unmount();
  expect(useUiStore.getState().aiPendingDocument).toBeNull();
});
