import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";
import { loadMindmapCollapsed, saveMindmapCollapsed } from "../services/storage";

/**
 * Folded branches are remembered per document.
 *
 * The reason this is worth persisting by node id at all is that the ids are
 * derived from the document structure rather than generated fresh on each parse
 * — the root is the literal below, list items are `node-<path>-<index>` and
 * headings are `heading-<line>-<text>`. If they were random, a stored set would
 * empty itself on every reload and these tests would pass while the feature did
 * nothing in practice, because the fixtures would still line up.
 */

const SOURCE = ["- 父节点", "  - 子节点甲", "  - 子节点乙", "- 第二个分支"].join("\n");

const ROOT_ID = "root-mindmap-node";

describe("折叠状态持久化", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  describe("存储层", () => {
    it("按文档键存取折叠的节点 id", () => {
      saveMindmapCollapsed("/vault/a.md", ["node-1", "node-2"]);

      expect(loadMindmapCollapsed("/vault/a.md")).toEqual(["node-1", "node-2"]);
    });

    it("没有记录时返回空数组而不是 null", () => {
      // The caller spreads the result straight into a Set, so it has to be an
      // array rather than nothing at all.
      expect(loadMindmapCollapsed("/vault/从未打开.md")).toEqual([]);
    });

    it("全部展开时不留下记录", () => {
      saveMindmapCollapsed("/vault/a.md", ["node-1"]);
      saveMindmapCollapsed("/vault/a.md", []);

      // Everything expanded is the default, so an empty entry is dropped —
      // otherwise every document ever opened would leave a key behind.
      expect(loadMindmapCollapsed("/vault/a.md")).toEqual([]);
      expect(localStorage.getItem("bookmd.mindmap.collapsed.v1")).not.toContain("/vault/a.md");
    });

    it("不同文档互不影响", () => {
      // The whole reason the key is a path and not the title: a vault with a
      // README in every folder would otherwise share one set of folds.
      saveMindmapCollapsed("/vault/one/README.md", ["node-1"]);
      saveMindmapCollapsed("/vault/two/README.md", ["node-2"]);

      expect(loadMindmapCollapsed("/vault/one/README.md")).toEqual(["node-1"]);
      expect(loadMindmapCollapsed("/vault/two/README.md")).toEqual(["node-2"]);
    });

    it("覆盖写入时保留同键的其他文档", () => {
      saveMindmapCollapsed("/vault/a.md", ["node-1"]);
      saveMindmapCollapsed("/vault/b.md", ["node-2"]);
      saveMindmapCollapsed("/vault/a.md", ["node-3"]);

      expect(loadMindmapCollapsed("/vault/a.md")).toEqual(["node-3"]);
      expect(loadMindmapCollapsed("/vault/b.md")).toEqual(["node-2"]);
    });

    it("存储内容损坏时返回空数组", () => {
      localStorage.setItem("bookmd.mindmap.collapsed.v1", "{ 不是 JSON");

      expect(loadMindmapCollapsed("/vault/a.md")).toEqual([]);
    });
  });

  describe("组件装载", () => {
    it("打开文档时恢复折叠的分支", () => {
      saveMindmapCollapsed("/vault/a.md", [ROOT_ID]);

      render(<MindmapView title="测试" source={SOURCE} documentKey="/vault/a.md" />);

      // Folding the root hides everything under it, so the children are absent
      // from the rendered output rather than merely styled away.
      expect(screen.queryByText("父节点")).toBeNull();
    });

    it("未折叠的文档照常展开", () => {
      render(<MindmapView title="测试" source={SOURCE} documentKey="/vault/b.md" />);

      expect(screen.getByText("父节点")).toBeTruthy();
    });

    it("切换到另一篇文档时不会套用上一篇的折叠", () => {
      // The guard this pins is a real failure mode, not a hypothetical: the
      // save effect runs once with the previous document's set still in state,
      // so without it the first document's folds would be written under the
      // second document's key before the restore landed.
      saveMindmapCollapsed("/vault/a.md", [ROOT_ID]);

      const { rerender } = render(
        <MindmapView title="测试" source={SOURCE} documentKey="/vault/a.md" />
      );
      expect(screen.queryByText("父节点")).toBeNull();

      rerender(<MindmapView title="测试" source={SOURCE} documentKey="/vault/b.md" />);

      expect(screen.getByText("父节点")).toBeTruthy();
      // ...and the folds of the other document are left exactly as they were.
      expect(loadMindmapCollapsed("/vault/a.md")).toEqual([ROOT_ID]);
      expect(loadMindmapCollapsed("/vault/b.md")).toEqual([]);
    });

    it("没有文档键时正常渲染且不写存储", () => {
      // A preview with no file behind it has nowhere to file the folds, and
      // that has to be survivable rather than a crash or a stray key.
      render(<MindmapView title="测试" source={SOURCE} />);

      expect(screen.getByText("父节点")).toBeTruthy();
      expect(localStorage.getItem("bookmd.mindmap.collapsed.v1")).toBeNull();
    });

    it("丢弃树中已不存在的节点 id", () => {
      // The document may have been edited since the folds were saved. A stale
      // id would sit in storage forever without ever being read back.
      saveMindmapCollapsed("/vault/a.md", ["node-早已不存在", ROOT_ID]);

      render(<MindmapView title="测试" source={SOURCE} documentKey="/vault/a.md" />);

      // The surviving id still applies...
      expect(screen.queryByText("父节点")).toBeNull();
      // ...and the dead one is not carried forward.
      expect(loadMindmapCollapsed("/vault/a.md")).toEqual([ROOT_ID]);
    });
  });
});
