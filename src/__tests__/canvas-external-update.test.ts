import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useCanvasDocument } from "../components/canvas/useCanvasDocument";

afterEach(cleanup);
it("keeps a saved empty board empty when reopened after deleting the last AI card", () => {
  const { result } = renderHook(() =>
    useCanvasDocument({
      source: '{"nodes":[],"edges":[]}',
      title: "空白板",
      editable: true,
      editingNodeIdRef: { current: null },
      editingTextRef: { current: "" },
      setEditingNodeId: vi.fn(),
      setContextMenu: vi.fn(),
      selectedNodeIdsRef: { current: new Set<string>() },
      selectedEdgeIdsRef: { current: new Set<string>() },
    }),
  );
  expect(result.current.data).toEqual({ nodes: [], edges: [] });
});
it("restores an empty board when an AI insertion is undone through the document source", () => {
  const source = JSON.stringify({
    nodes: [{ id: "ai", type: "text", text: "AI 卡片", x: 0, y: 0, width: 340, height: 220 }],
    edges: [],
  });
  const { result, rerender } = renderHook(
    ({ value }) =>
      useCanvasDocument({
        source: value,
        title: "白板",
        editable: true,
        onSourceChange: vi.fn(),
        editingNodeIdRef: { current: null },
        editingTextRef: { current: "" },
        setEditingNodeId: vi.fn(),
        setContextMenu: vi.fn(),
        selectedNodeIdsRef: { current: new Set<string>() },
        selectedEdgeIdsRef: { current: new Set<string>() },
      }),
    { initialProps: { value: source } },
  );
  expect(result.current.data.nodes).toHaveLength(1);
  rerender({ value: '{"nodes":[],"edges":[]}' });
  expect(result.current.data).toEqual({ nodes: [], edges: [] });
});
