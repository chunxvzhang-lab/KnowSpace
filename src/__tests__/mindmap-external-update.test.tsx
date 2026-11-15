import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";

afterEach(cleanup);
it("clears rendered branches when an external AI edit deletes all Markdown", () => {
  const { rerender } = render(<MindmapView title="空白脑图" source={"# 计划\n\n- 旧分支"} />);
  expect(screen.getByText("旧分支")).toBeTruthy();
  rerender(<MindmapView title="空白脑图" source="" />);
  expect(screen.queryByText("旧分支")).toBeNull();
});
