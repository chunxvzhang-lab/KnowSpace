import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addBoundary,
  addFloatingTopic,
  addSummary,
  allTags,
  areRelated,
  boundariesIn,
  emptySidecar,
  floatingTopics,
  moveFloatingTopic,
  nextBoundaryId,
  applyImportedAnnotations,
  relationBetween,
  removeBoundary,
  setBoundaryColor,
  setBoundaryText,
  setRelationFields,
  nextFloatingId,
  nextSummaryId,
  removeFloatingTopic,
  removeSummary,
  setFloatingText,
  setSummaryText,
  summariesIn,
  iconFor,
  loadSidecar,
  linkFor,
  markersFor,
  mergeSidecar,
  noteFor,
  parseSidecar,
  parseTagInput,
  relationsFor,
  saveSidecar,
  serializeSidecar,
  setNodeIcon,
  setNodeLink,
  setNodeNote,
  setNodePriority,
  setNodeProgress,
  setNodeTags,
  sidecarIsEmpty,
  SIDECAR_SECTIONS,
  tagsFor,
  toggleRelation,
  type MindmapSidecar,
} from "../services/mindmapSidecar";

/**
 * The companion file, as the renderer sees it.
 *
 * The file itself — its name, its atomic write — is checked against a real disk
 * in markdown-files.test.ts. What is checked here is everything the renderer
 * decides: what counts as a readable companion, what happens to a file it cannot
 * read, and which of the reader's edits reach the disk at all.
 *
 * Those decisions are the feature. A second file beside a document is a promise
 * that the document cannot be damaged by it, and most of these tests are about
 * keeping that promise: garbage degrades to a plain tree, unknown sections are
 * written back rather than dropped, and merely opening a document writes
 * nothing.
 */

/** The bridge, faked locally so each test can name the exact payloads. */
function installBridge() {
  const api = {
    readMindmapSidecar: vi.fn().mockResolvedValue({ success: true, exists: false }),
    saveMindmapSidecar: vi.fn().mockResolvedValue({ success: true }),
  };
  (window as unknown as Record<string, unknown>).knowSpaceDesktop = api;
  return api;
}

function removeBridge() {
  delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
  delete (window as unknown as Record<string, unknown>).bookMDDesktop;
}

describe("导图伴生文件", () => {
  afterEach(() => {
    removeBridge();
    vi.restoreAllMocks();
  });

  describe("解析：读不懂就退化成纯树", () => {
    it("空文件与纯空白当作没有伴生文件", () => {
      expect(parseSidecar("")).toBeNull();
      expect(parseSidecar("   \n\t ")).toBeNull();
      expect(parseSidecar(null)).toBeNull();
      expect(parseSidecar(undefined)).toBeNull();
    });

    it("坏 JSON 或不是对象都不抛异常，只给 null", () => {
      // A companion is a file a person may well have edited by hand, possibly
      // while the app was open. None of these may reach the reader as a crash.
      expect(parseSidecar('{ "version": 1, "notes": {')).toBeNull();
      expect(parseSidecar("[1, 2, 3]")).toBeNull();
      expect(parseSidecar('"一段字符串"')).toBeNull();
      expect(parseSidecar("null")).toBeNull();
    });

    it("读出备注，并丢掉不是文本或空白的条目", () => {
      const sidecar = parseSidecar(
        JSON.stringify({
          version: 1,
          notes: { "node-a": "第一条备注", "node-b": "   ", "node-c": 42, "node-d": null },
        })
      );

      expect(sidecar?.notes).toEqual({ "node-a": "第一条备注" });
    });

    it("notes 不是对象时只当没有备注，文件本身仍然有效", () => {
      // Half a file is still a file: the sections below are independent, and one
      // bad section must not cost the others.
      const sidecar = parseSidecar(JSON.stringify({ version: 1, notes: "坏了" }));

      expect(sidecar).not.toBeNull();
      expect(sidecar?.notes).toEqual({});
    });

    it("不认识的段落与更高的版本都原样留着", () => {
      // The rule that makes a second file safe across versions: an older build
      // must not destroy what a newer one wrote. It writes back what it read.
      const sidecar = parseSidecar(
        JSON.stringify({ version: 7, icons: { "node-a": "star" }, notes: { "node-a": "备注" } })
      );

      expect(sidecar?.version).toBe(7);
      expect(sidecar?.icons).toEqual({ "node-a": "star" });

      const written = JSON.parse(serializeSidecar(sidecar as MindmapSidecar));
      expect(written.version).toBe(7);
      expect(written.icons).toEqual({ "node-a": "star" });
    });

    it("正文里没有的节点，备注不删", () => {
      // The tree can be shorter than the document for reasons that have nothing
      // to do with the note — a heading mid-edit, another layout. Deleting
      // someone's writing because of what a view happened to show would be
      // unrecoverable, so an orphan note is kept and simply has nowhere to show.
      const sidecar = parseSidecar(JSON.stringify({ notes: { "node-已经不在树里": "别删我" } }));

      expect(sidecar?.notes).toEqual({ "node-已经不在树里": "别删我" });
    });
  });

  describe("序列化：写出来的东西人也要能看", () => {
    it("缩进两格、结尾换行", () => {
      const sidecar = setNodeNote(emptySidecar(), "node-a", "备注");

      expect(serializeSidecar(sidecar)).toBe(
        ['{', '  "version": 1,', '  "notes": {', '    "node-a": "备注"', "  }", "}", ""].join("\n")
      );
    });

    it("没有备注时省掉 notes 段", () => {
      // A file that records nothing should be a small file: `notes: {}` on every
      // document ever opened would make "no notes" look like a decision.
      expect(serializeSidecar(emptySidecar())).toBe('{\n  "version": 1\n}\n');
    });

    it("读进来再写回去，内容一样", () => {
      const original = '{\n  "version": 1,\n  "notes": {\n    "node-a": "备注"\n  }\n}\n';

      expect(serializeSidecar(parseSidecar(original) as MindmapSidecar)).toBe(original);
    });
  });

  describe("改备注", () => {
    it("设值与清空", () => {
      const withNote = setNodeNote(emptySidecar(), "node-a", "写点什么");

      expect(noteFor(withNote, "node-a")).toBe("写点什么");
      // Only whitespace is not a note, however it was typed.
      expect(setNodeNote(withNote, "node-a", "   ").notes).toEqual({});
      expect(setNodeNote(withNote, "node-a", "").notes).toEqual({});
    });

    it("返回新的对象，不动传进来的那个", () => {
      // The view holds the loaded sidecar and the edited one at the same time,
      // to tell "there is something to save" from "this is what is on disk".
      const before = emptySidecar();
      const after = setNodeNote(before, "node-a", "备注");

      expect(before.notes).toEqual({});
      expect(after).not.toBe(before);
      expect(after.notes).not.toBe(before.notes);
    });

    it("空伴生文件的判断", () => {
      expect(sidecarIsEmpty(null)).toBe(true);
      expect(sidecarIsEmpty(emptySidecar())).toBe(true);
      // Anything a newer version wrote counts as content, even unseen, or the
      // next save could look like nothing worth writing.
      expect(sidecarIsEmpty({ ...emptySidecar(), version: 7, icons: { a: "star" } })).toBe(false);
      expect(sidecarIsEmpty(setNodeNote(emptySidecar(), "node-a", "备注"))).toBe(false);
    });
  });

  describe("图标", () => {
    it("设值与清除，一个节点只戴一个", () => {
      const starred = setNodeIcon(emptySidecar(), "node-a", "star");

      expect(iconFor(starred, "node-a")).toBe("star");

      // Choosing another replaces it rather than stacking: one icon per node is
      // the whole model, and the picker's toggle relies on it.
      const flagged = setNodeIcon(starred, "node-a", "flag");
      expect(iconFor(flagged, "node-a")).toBe("flag");

      expect(setNodeIcon(flagged, "node-a", "").icons).toEqual({});
      expect(iconFor(null, "node-a")).toBe("");
      expect(iconFor(emptySidecar(), "node-没有图标")).toBe("");
    });

    it("返回新的对象，不动传进来的那个", () => {
      const before = emptySidecar();
      const after = setNodeIcon(before, "node-a", "star");

      expect(before.icons).toEqual({});
      expect(after.icons).not.toBe(before.icons);
    });

    it("两个段落一起往返，谁也不丢", () => {
      const sidecar = setNodeIcon(setNodeNote(emptySidecar(), "node-a", "备注"), "node-b", "star");

      const written = serializeSidecar(sidecar);
      const back = parseSidecar(written) as MindmapSidecar;

      expect(back.notes).toEqual({ "node-a": "备注" });
      expect(back.icons).toEqual({ "node-b": "star" });
    });

    it("不认识的图标 id 照样存着", () => {
      // A file from a newer version may name an icon this build has never heard
      // of. Keeping the id is what gives the node its icon back when the app
      // catches up; whether anything is drawn is the icon table's decision.
      const back = parseSidecar('{ "version": 1, "icons": { "node-a": "未来的图标" } }');

      expect(iconFor(back, "node-a")).toBe("未来的图标");
    });

    it("空文件判断把这一段也算上", () => {
      expect(sidecarIsEmpty(setNodeIcon(emptySidecar(), "node-a", "star"))).toBe(false);
      expect(sidecarIsEmpty(setNodeNote(emptySidecar(), "node-a", "备注"))).toBe(false);
      expect(sidecarIsEmpty(setNodePriority(emptySidecar(), "node-a", 1))).toBe(false);
    });
  });

  describe("标记", () => {
    it("优先级与进度可以同时挂在一个节点上", () => {
      // The reason the section is one map to a small object rather than two maps
      // of numbers: a node under a deadline is both urgent and half done, and two
      // sections would mean two keys for the same node.
      const marked = setNodeProgress(setNodePriority(emptySidecar(), "node-a", 2), "node-a", 5);

      expect(markersFor(marked, "node-a")).toEqual({ priority: 2, progress: 5 });
      expect(markersFor(null, "node-a")).toEqual({});
      expect(markersFor(marked, "node-没有")).toEqual({});
    });

    it("清除一个不动另一个", () => {
      const both = setNodeProgress(setNodePriority(emptySidecar(), "node-a", 2), "node-a", 5);

      expect(markersFor(setNodePriority(both, "node-a", null), "node-a")).toEqual({ progress: 5 });
      expect(markersFor(setNodeProgress(both, "node-a", null), "node-a")).toEqual({ priority: 2 });
      // Both gone: no entry at all, like every other section here.
      const cleared = setNodeProgress(setNodePriority(both, "node-a", null), "node-a", null);
      expect(cleared.markers).toEqual({});
    });

    it("越界的值当清除，不存进去", () => {
      const base = setNodePriority(emptySidecar(), "node-a", 3);

      expect(markersFor(setNodePriority(base, "node-a", 0), "node-a")).toEqual({});
      expect(markersFor(setNodePriority(base, "node-a", 10), "node-a")).toEqual({});

      // Clearing reaches only its own mark: an out-of-range progress does not
      // take the priority down with it.
      const withProgress = setNodeProgress(base, "node-a", 4);
      expect(markersFor(setNodeProgress(withProgress, "node-a", 9), "node-a")).toEqual({
        priority: 3,
      });
    });

    it("读文件时越界的值丢掉，但同一节点上另一个标记留着", () => {
      // A value out of range is dropped rather than clamped: clamping someone's
      // "12" into a "9" would invent a judgement they never made.
      const parsed = parseSidecar(
        JSON.stringify({
          version: 1,
          markers: {
            "node-a": { priority: 3, progress: 99 },
            "node-b": { priority: 2.5 },
            "node-c": { priority: 4 },
          },
        })
      );

      expect(markersFor(parsed, "node-a")).toEqual({ priority: 3 });
      // Nothing left of that entry, so the node has no entry — not an empty one.
      expect(parsed?.markers["node-b"]).toBeUndefined();
      expect(markersFor(parsed, "node-c")).toEqual({ priority: 4 });
    });

    it("条目里不认识的字段照样留着", () => {
      // The same rule as unknown sections, one level down: a node's markers are
      // only partly this build's business.
      const parsed = parseSidecar(
        JSON.stringify({ version: 1, markers: { "node-a": { priority: 1, review: "pending" } } })
      );

      expect(markersFor(parsed, "node-a")).toEqual({ priority: 1, review: "pending" });
      expect(serializeSidecar(parsed as MindmapSidecar)).toContain('"review": "pending"');
    });

    it("三段一起往返，谁也不丢", () => {
      const sidecar = setNodeProgress(
        setNodeIcon(setNodeNote(emptySidecar(), "node-a", "备注"), "node-b", "star"),
        "node-c",
        3
      );

      const back = parseSidecar(serializeSidecar(sidecar)) as MindmapSidecar;

      expect(back.notes).toEqual({ "node-a": "备注" });
      expect(back.icons).toEqual({ "node-b": "star" });
      expect(back.markers).toEqual({ "node-c": { progress: 3 } });
    });
  });

  describe("标签", () => {
    it("输入按人真正会写的样子切开", () => {
      // A tag whose rules only accepted one separator would turn the rest of the
      // line into a single tag, which is the kind of quiet wrong that ends up in
      // a file and stays there.
      expect(parseTagInput("#api, #urgent")).toEqual(["api", "urgent"]);
      expect(parseTagInput("api urgent")).toEqual(["api", "urgent"]);
      expect(parseTagInput("接口、紧急")).toEqual(["接口", "紧急"]);
      expect(parseTagInput("  ##api  ")).toEqual(["api"]);
      expect(parseTagInput(", ,、 ")).toEqual([]);
      expect(parseTagInput("")).toEqual([]);
    });

    it("大小写不同算同一个标签，留下先写下的那个拼法", () => {
      // Compared without case so #API and #api are one tag; kept as written so
      // #KnowSpace does not become #knowspace.
      expect(parseTagInput("API api Api")).toEqual(["API"]);
      expect(parseTagInput("#KnowSpace #knowspace")).toEqual(["KnowSpace"]);
    });

    it("设、替、清，且不动传进来的那个", () => {
      const before = emptySidecar();
      const tagged = setNodeTags(before, "node-a", ["api", "紧急"]);

      expect(tagsFor(tagged, "node-a")).toEqual(["api", "紧急"]);
      expect(before.tags).toEqual({});
      expect(tagsFor(null, "node-a")).toEqual([]);
      expect(tagsFor(emptySidecar(), "node-没有")).toEqual([]);

      // A new list replaces the old one rather than adding to it: the panel
      // edits the list, not the individual tags.
      expect(tagsFor(setNodeTags(tagged, "node-a", ["别的"]), "node-a")).toEqual(["别的"]);
      expect(setNodeTags(tagged, "node-a", []).tags).toEqual({});
      expect(setNodeTags(tagged, "node-a", ["  "]).tags).toEqual({});
    });

    it("写进去的标签一定过得了同一套规则", () => {
      // Otherwise the file could hold something the panel's own rules would turn
      // down on the way back in.
      const tagged = setNodeTags(emptySidecar(), "node-a", ["#api api", " ", "#紧急"]);

      expect(tagsFor(tagged, "node-a")).toEqual(["api", "紧急"]);
    });

    it("汇总全文档的标签，按用得多排", () => {
      let sidecar = setNodeTags(emptySidecar(), "node-a", ["api", "紧急"]);
      sidecar = setNodeTags(sidecar, "node-b", ["API"]);
      sidecar = setNodeTags(sidecar, "node-c", ["文档"]);

      expect(allTags(sidecar)).toEqual([
        { tag: "api", count: 2 },
        // Ties in the order they were first seen, not by name: see `allTags`.
        { tag: "紧急", count: 1 },
        { tag: "文档", count: 1 },
      ]);
      expect(allTags(null)).toEqual([]);
    });

    it("读文件时同样过滤：非数组、非文本、空白、重复", () => {
      const parsed = parseSidecar(
        JSON.stringify({
          version: 1,
          tags: {
            "node-a": ["api", " ", 42, "#api", "紧急"],
            "node-b": "不是一个列表",
            "node-c": [],
          },
        })
      );

      expect(tagsFor(parsed, "node-a")).toEqual(["api", "紧急"]);
      expect(tagsFor(parsed, "node-b")).toEqual([]);
      expect(tagsFor(parsed, "node-c")).toEqual([]);
    });

    it("四段一起往返，谁也不丢", () => {
      let sidecar = setNodeTags(setNodeNote(emptySidecar(), "node-a", "备注"), "node-a", ["api"]);
      sidecar = setNodeIcon(sidecar, "node-b", "star");
      sidecar = setNodePriority(sidecar, "node-c", 4);

      const back = parseSidecar(serializeSidecar(sidecar)) as MindmapSidecar;

      expect(back.notes).toEqual({ "node-a": "备注" });
      expect(back.tags).toEqual({ "node-a": ["api"] });
      expect(back.icons).toEqual({ "node-b": "star" });
      expect(back.markers).toEqual({ "node-c": { priority: 4 } });
    });

    it("空文件判断把每一段都算上", () => {
      // Asserted as an agreement between the places rather than as a literal
      // list: a section added to the table and forgotten elsewhere would read as
      // "nothing here", and a literal list would only ever tell me that it had
      // gone stale.
      expect(Object.keys(emptySidecar()).sort()).toEqual([...SIDECAR_SECTIONS, "version"].sort());
      // The same agreement for parsing, which is what makes its table-driven
      // dispatch's cast safe: whatever the table says, parsing produces.
      expect(Object.keys(parseSidecar("{}") ?? {}).sort()).toEqual(
        [...SIDECAR_SECTIONS, "version"].sort()
      );
      expect(sidecarIsEmpty(setNodeTags(emptySidecar(), "node-a", ["api"]))).toBe(false);
    });
  });

  describe("链接", () => {
    it("按写下的样子存，去掉首尾空白", () => {
      // Stored as typed rather than as a parsed record: a form this build cannot
      // follow is still there, unchanged, for the build that can.
      const linked = setNodeLink(emptySidecar(), "node-a", "  [[产品设计#验收]]  ");

      expect(linkFor(linked, "node-a")).toBe("[[产品设计#验收]]");
      expect(linkFor(null, "node-a")).toBe("");
      expect(linkFor(emptySidecar(), "node-没有")).toBe("");
    });

    it("清空即删除条目", () => {
      const linked = setNodeLink(emptySidecar(), "node-a", "https://example.com");

      expect(setNodeLink(linked, "node-a", "").links).toEqual({});
      expect(setNodeLink(linked, "node-a", "   ").links).toEqual({});
    });

    it("原样存下这一版读不懂的写法", () => {
      // The reason the field is a string and not a parsed record. Whatever a
      // newer version decides `obsidian://…` or `[[a|别名]]` means, this build
      // must not have thrown it away before then.
      const stored = setNodeLink(emptySidecar(), "node-a", "[[产品设计|别名]]");

      expect(linkFor(stored, "node-a")).toBe("[[产品设计|别名]]");
      expect(parseSidecar(serializeSidecar(stored))?.links["node-a"]).toBe("[[产品设计|别名]]");
    });

    it("五段一起往返，谁也不丢", () => {
      let sidecar = setNodeLink(setNodeTags(emptySidecar(), "node-a", ["api"]), "node-a", "#验收");
      sidecar = setNodeNote(sidecar, "node-b", "备注");
      sidecar = setNodeIcon(sidecar, "node-c", "star");
      sidecar = setNodePriority(sidecar, "node-d", 2);

      const back = parseSidecar(serializeSidecar(sidecar)) as MindmapSidecar;

      expect(back.links).toEqual({ "node-a": "#验收" });
      expect(back.tags).toEqual({ "node-a": ["api"] });
      expect(back.notes).toEqual({ "node-b": "备注" });
      expect(back.icons).toEqual({ "node-c": "star" });
      expect(back.markers).toEqual({ "node-d": { priority: 2 } });
    });

    it("链接也算作内容", () => {
      // The agreement between `emptySidecar` and the section list is asserted
      // once, in the tags block; this is the part that concerns links.
      expect(sidecarIsEmpty(setNodeLink(emptySidecar(), "node-a", "#x"))).toBe(false);
    });
  });

  describe("关系线", () => {
    it("连上、再点一次断开", () => {
      const linked = toggleRelation(emptySidecar(), "node-a", "node-b");

      expect(linked.relations).toEqual([{ fromId: "node-a", toId: "node-b" }]);
      expect(areRelated(linked, "node-a", "node-b")).toBe(true);
      // Whichever way round it is asked.
      expect(areRelated(linked, "node-b", "node-a")).toBe(true);

      const unlinked = toggleRelation(linked, "node-b", "node-a");
      expect(unlinked.relations).toEqual([]);
      expect(areRelated(unlinked, "node-a", "node-b")).toBe(false);
    });

    it("存下来的对是规范顺序，所以两次点击只会有一条线", () => {
      const first = toggleRelation(emptySidecar(), "z", "a");
      const second = toggleRelation(first, "a", "z");

      expect(first.relations).toEqual([{ fromId: "a", toId: "z" }]);
      // The second call found the first one, so it removed it rather than
      // adding a second line between the same two topics.
      expect(second.relations).toEqual([]);
    });

    it("不连自己，也不接受空 id", () => {
      expect(toggleRelation(emptySidecar(), "node-a", "node-a").relations).toEqual([]);
      expect(toggleRelation(emptySidecar(), "node-a", "").relations).toEqual([]);
      expect(toggleRelation(emptySidecar(), "", "").relations).toEqual([]);
    });

    it("按节点查：连线两端的都可查", () => {
      const linked = toggleRelation(
        toggleRelation(emptySidecar(), "node-a", "node-b"),
        "node-c",
        "node-a"
      );

      expect(relationsFor(linked, "node-a")).toHaveLength(2);
      expect(relationsFor(linked, "node-b")).toEqual([{ fromId: "node-a", toId: "node-b" }]);
      expect(relationsFor(linked, "node-d")).toEqual([]);
      expect(relationsFor(null, "node-a")).toEqual([]);
    });

    it("读文件时丢掉不成对、连自己、重复的条目", () => {
      const parsed = parseSidecar(
        JSON.stringify({
          version: 1,
          relations: [
            { fromId: "a", toId: "b" },
            // The same line, written the other way round and then again.
            { fromId: "b", toId: "a" },
            { fromId: "c", toId: "c" },
            { fromId: "d" },
            { fromId: "", toId: "e" },
            "不是一个对象",
            { fromId: 1, toId: "f" },
            { fromId: "g", toId: "h" },
          ],
        })
      );

      expect(parsed?.relations).toEqual([
        { fromId: "a", toId: "b" },
        { fromId: "g", toId: "h" },
      ]);
    });

    it("relations 不是列表时当作没有", () => {
      expect(parseSidecar(JSON.stringify({ version: 1, relations: {} }))?.relations).toEqual([]);
      expect(parseSidecar(JSON.stringify({ version: 1, relations: "a-b" }))?.relations).toEqual([]);
    });

    it("七段一起往返，谁也不丢", () => {
      let sidecar = toggleRelation(emptySidecar(), "node-a", "node-b");
      sidecar = setNodeTags(sidecar, "node-c", ["api"]);
      sidecar = setNodeLink(sidecar, "node-d", "#标题");
      sidecar = setNodeIcon(sidecar, "node-e", "star");
      sidecar = setNodeNote(sidecar, "node-f", "备注");
      sidecar = setNodePriority(sidecar, "node-g", 3);
      sidecar = addFloatingTopic(sidecar, "画布上的想法", 120, -40).sidecar;

      const back = parseSidecar(serializeSidecar(sidecar)) as MindmapSidecar;

      expect(back.relations).toEqual([{ fromId: "node-a", toId: "node-b" }]);
      expect(back.tags).toEqual({ "node-c": ["api"] });
      expect(back.links).toEqual({ "node-d": "#标题" });
      expect(back.icons).toEqual({ "node-e": "star" });
      expect(back.notes).toEqual({ "node-f": "备注" });
      expect(back.markers).toEqual({ "node-g": { priority: 3 } });
      expect(back.floating).toEqual({ "floating-1": { text: "画布上的想法", x: 120, y: -40 } });
    });

    it("一条关系就算内容", () => {
      expect(sidecarIsEmpty(toggleRelation(emptySidecar(), "a", "b"))).toBe(false);
    });
  });

  describe("自由主题", () => {
    it("新建：id 递增，位置就是给的位置", () => {
      const first = addFloatingTopic(emptySidecar(), "想法", 120, -40);

      expect(first.id).toBe("floating-1");
      expect(first.sidecar.floating["floating-1"]).toEqual({ text: "想法", x: 120, y: -40 });

      const second = addFloatingTopic(first.sidecar, "另一个", 0, 0);
      expect(second.id).toBe("floating-2");
      // Numbered rather than random, so the same actions produce the same file —
      // which is what makes a diff in a version-controlled vault readable.
      expect(nextFloatingId(second.sidecar)).toBe("floating-3");
      expect(nextFloatingId(null)).toBe("floating-1");
    });

    it("拖动只改坐标，文字一动不动", () => {
      const { sidecar, id } = addFloatingTopic(emptySidecar(), "想法", 0, 0);
      const moved = moveFloatingTopic(sidecar, id, 300, 200);

      expect(moved.floating[id]).toEqual({ text: "想法", x: 300, y: 200 });
      // An id that is not there is answered with the map unchanged, so a drag
      // that outlives its topic cannot resurrect it.
      expect(moveFloatingTopic(moved, "floating-不存在", 1, 1)).toBe(moved);
    });

    it("改名；把文字清空就等于删掉", () => {
      const { sidecar, id } = addFloatingTopic(emptySidecar(), "想法", 0, 0);

      expect(setFloatingText(sidecar, id, "改过的").floating[id].text).toBe("改过的");
      // The section's own reader takes an empty topic to mean "gone"; the screen
      // says the same thing, so the two cannot disagree about it.
      expect(setFloatingText(sidecar, id, "   ").floating).toEqual({});
    });

    it("删除", () => {
      const { sidecar, id } = addFloatingTopic(emptySidecar(), "想法", 0, 0);

      expect(removeFloatingTopic(sidecar, id).floating).toEqual({});
      expect(removeFloatingTopic(sidecar, "floating-不存在")).toBe(sidecar);
    });

    it("读文件：没文字的丢、坏坐标归零、不认识的字段留着", () => {
      const parsed = parseSidecar(
        JSON.stringify({
          version: 1,
          floating: {
            "floating-1": { text: " 想法 ", x: 10, y: 20, pinned: true },
            "floating-2": { text: "   ", x: 1, y: 1 },
            "floating-3": { text: "坏坐标", x: "左边", y: null },
            "floating-4": "不是对象",
          },
        })
      );

      expect(parsed?.floating["floating-1"]).toEqual({
        text: "想法",
        x: 10,
        y: 20,
        pinned: true,
      });
      expect(parsed?.floating["floating-2"]).toBeUndefined();
      // A topic in the wrong place can be dragged; one that vanished cannot.
      expect(parsed?.floating["floating-3"]).toEqual({ text: "坏坐标", x: 0, y: 0 });
      expect(parsed?.floating["floating-4"]).toBeUndefined();
    });

    it("一个自由主题就算内容", () => {
      expect(sidecarIsEmpty(addFloatingTopic(emptySidecar(), "想法", 0, 0).sidecar)).toBe(false);
      expect(floatingTopics(emptySidecar())).toEqual([]);
      expect(floatingTopics(null)).toEqual([]);
    });
  });

  describe("关系线的设置", () => {
    it("一次改一样，别的都留着", () => {
      const joined = toggleRelation(emptySidecar(), "b", "a");

      const labelled = setRelationFields(joined, "a", "b", { label: "取决于" });
      expect(labelled.relations[0]).toEqual({ fromId: "a", toId: "b", label: "取决于" });

      const arrowed = setRelationFields(labelled, "b", "a", { arrow: "forward" });
      expect(arrowed.relations[0]).toEqual({
        fromId: "a",
        toId: "b",
        label: "取决于",
        arrow: "forward",
      });

      const coloured = setRelationFields(arrowed, "a", "b", { color: "emerald" });
      expect(coloured.relations[0].color).toBe("emerald");
      expect(coloured.relations[0].label).toBe("取决于");
    });

    it("空值就是把这一项收回默认", () => {
      let sidecar = toggleRelation(emptySidecar(), "a", "b");
      sidecar = setRelationFields(sidecar, "a", "b", { label: "写字", color: "rose" });

      const cleared = setRelationFields(sidecar, "a", "b", { label: "  ", color: "" });

      // Not an empty string left behind: absent is what "the default look" means,
      // and a file that spelled it two ways would be a file two readers disagree
      // about.
      expect(cleared.relations[0]).toEqual({ fromId: "a", toId: "b" });
    });

    it("两个主题之间没有线时，什么都不改", () => {
      const sidecar = toggleRelation(emptySidecar(), "a", "b");
      const after = setRelationFields(sidecar, "b", "c", { label: "不存在" });

      expect(after.relations).toEqual([{ fromId: "a", toId: "b" }]);
    });

    it("查询：有没有、是哪一条", () => {
      const sidecar = setRelationFields(toggleRelation(emptySidecar(), "a", "b"), "a", "b", {
        label: "取决于",
      });

      expect(relationBetween(sidecar, "b", "a")?.label).toBe("取决于");
      expect(relationBetween(sidecar, "a", "c")).toBeNull();
      expect(relationBetween(null, "a", "b")).toBeNull();
    });

    it("读文件：四项都读，不认识的值留着，坏值当没写", () => {
      const parsed = parseSidecar(
        JSON.stringify({
          version: 1,
          relations: [
            {
              fromId: "a",
              toId: "b",
              label: " 取决于 ",
              arrow: "both",
              style: "未来的形态",
              color: "violet",
              note: "更早版本没有的字段",
            },
            { fromId: "c", toId: "d", label: 7, arrow: "", color: null },
          ],
        })
      );

      expect(parsed?.relations[0]).toEqual({
        fromId: "a",
        toId: "b",
        label: "取决于",
        arrow: "both",
        // An id this build cannot place is kept: the table decides what to draw,
        // and dropping it here is what would make going back lossy.
        style: "未来的形态",
        color: "violet",
        note: "更早版本没有的字段",
      });
      // Not a string is the same as not written.
      expect(parsed?.relations[1]).toEqual({ fromId: "c", toId: "d" });
    });

    it("往返之后，设置还在", () => {
      let sidecar = toggleRelation(emptySidecar(), "a", "b");
      sidecar = setRelationFields(sidecar, "a", "b", {
        label: "取决于",
        arrow: "backward",
        style: "dotted",
        color: "sky",
      });

      const back = parseSidecar(serializeSidecar(sidecar));

      expect(back?.relations[0]).toEqual({
        fromId: "a",
        toId: "b",
        label: "取决于",
        arrow: "backward",
        style: "dotted",
        color: "sky",
      });
    });

    it("删掉自由主题时，连到它的线不动：线是读者挑过的记录", () => {
      // The same rule as a summary's span. The drawing skips a line whose
      // endpoint is missing, so this costs nothing visible — and pruning it would
      // be this module editing what the reader asked for.
      let sidecar = addFloatingTopic(emptySidecar(), "想法", 10, 20).sidecar;
      sidecar = toggleRelation(sidecar, "floating-1", "node-a");

      const after = removeFloatingTopic(sidecar, "floating-1");

      expect(after.relations).toHaveLength(1);
    });
  });

  describe("把导入的东西写进伴生文件", () => {
    it("七段一次写完，走的都是面板用的那几个 setter", () => {
      const sidecar = applyImportedAnnotations(emptySidecar(), {
        notes: { "node-a": "一段备注" },
        links: { "node-b": "https://example.com" },
        tags: { "node-c": ["api", "待办"] },
        markers: { "node-d": { priority: 3, progress: 4 } },
        relations: [{ fromId: "node-e", toId: "node-f", label: "取决于" }],
        summaries: [{ nodeIds: ["node-g", "node-h"], text: "总述" }],
        boundaries: [{ nodeIds: ["node-i"], text: "一组" }],
      });

      expect(sidecar.notes).toEqual({ "node-a": "一段备注" });
      expect(sidecar.links).toEqual({ "node-b": "https://example.com" });
      expect(sidecar.tags).toEqual({ "node-c": ["api", "待办"] });
      expect(sidecar.markers).toEqual({ "node-d": { priority: 3, progress: 4 } });
      expect(sidecar.relations).toEqual([
        { fromId: "node-e", toId: "node-f", label: "取决于" },
      ]);
      expect(sidecar.summaries["summary-1"]).toEqual({
        nodeIds: ["node-g", "node-h"],
        text: "总述",
      });
      expect(sidecar.boundaries["boundary-1"]).toEqual({ nodeIds: ["node-i"], text: "一组" });
      expect(sidecarIsEmpty(sidecar)).toBe(false);
    });

    it("空的导入什么都不做", () => {
      const before = emptySidecar();
      const after = applyImportedAnnotations(before, {
        notes: {},
        links: {},
        tags: {},
        markers: {},
        relations: [],
        summaries: [],
        boundaries: [],
      });

      expect(sidecarIsEmpty(after)).toBe(true);
      // Written through the setters rather than assembled by hand, so an import
      // cannot produce a file the app would not have produced itself.
      expect(Object.keys(after).sort()).toEqual(Object.keys(emptySidecar()).sort());
    });

    it("已经有的一条线不会被当成开关关掉", () => {
      // `toggleRelation` is a toggle: using it alone would *remove* a line that is
      // already there, and an import adds what the file had.
      const existing = toggleRelation(emptySidecar(), "node-a", "node-b");
      const after = applyImportedAnnotations(existing, {
        notes: {},
        links: {},
        tags: {},
        markers: {},
        relations: [{ fromId: "node-a", toId: "node-b" }],
        summaries: [],
        boundaries: [],
      });

      expect(after.relations).toHaveLength(1);
      expect(after.relations[0]).toEqual({ fromId: "node-a", toId: "node-b" });
    });

    it("只给了优先级就只写优先级", () => {
      const sidecar = applyImportedAnnotations(emptySidecar(), {
        notes: {},
        links: {},
        tags: {},
        markers: { "node-a": { progress: 4 }, "node-b": { priority: 2 } },
        relations: [],
        summaries: [],
        boundaries: [],
      });

      expect(sidecar.markers).toEqual({ "node-a": { progress: 4 }, "node-b": { priority: 2 } });
    });
  });

  describe("自由主题名下的标注", () => {
    it("删除主题时，写在它上面的都一起走", () => {
      let sidecar = addFloatingTopic(emptySidecar(), "想法", 10, 20).sidecar;
      sidecar = setNodeNote(sidecar, "floating-1", "写过的");
      sidecar = setNodeIcon(sidecar, "floating-1", "star");
      sidecar = setNodePriority(sidecar, "floating-1", 2);
      sidecar = setNodeTags(sidecar, "floating-1", ["api"]);
      sidecar = setNodeLink(sidecar, "floating-1", "https://example.com");

      const after = removeFloatingTopic(sidecar, "floating-1");

      // A floating topic's id is handed out by a counter and never comes back, so
      // none of this could ever be claimed again — keeping it would leave a file
      // that says it has content when what it has is orphans.
      expect(after.floating).toEqual({});
      expect(after.notes).toEqual({});
      expect(after.icons).toEqual({});
      expect(after.markers).toEqual({});
      expect(after.tags).toEqual({});
      expect(after.links).toEqual({});
      expect(sidecarIsEmpty(after)).toBe(true);
    });

    it("只清它自己的，别人的不动", () => {
      let sidecar = addFloatingTopic(emptySidecar(), "甲", 10, 20).sidecar;
      sidecar = addFloatingTopic(sidecar, "乙", 40, 60).sidecar;
      sidecar = setNodeNote(sidecar, "floating-1", "甲的");
      sidecar = setNodeNote(sidecar, "floating-2", "乙的");

      const after = removeFloatingTopic(sidecar, "floating-1");

      expect(after.notes).toEqual({ "floating-2": "乙的" });
    });

    it("删一个不存在的，什么都不变", () => {
      const sidecar = setNodeNote(
        addFloatingTopic(emptySidecar(), "想法", 10, 20).sidecar,
        "floating-1",
        "写过的"
      );

      expect(removeFloatingTopic(sidecar, "floating-不存在")).toBe(sidecar);
    });

    it("概要跨到它也不动跨度：跨度是读者挑过的清单", () => {
      // Deleting the topic shrinks the drawing on its own, since an id that
      // resolves to nothing contributes no bounds. Pruning the list would be this
      // module editing a record of what the reader picked.
      let sidecar = addFloatingTopic(emptySidecar(), "想法", 10, 20).sidecar;
      sidecar = addSummary(sidecar, ["floating-1", "node-a"], "总述").sidecar;

      const after = removeFloatingTopic(sidecar, "floating-1");

      expect(after.summaries["summary-1"].nodeIds).toEqual(["floating-1", "node-a"]);
    });
  });

  describe("概要", () => {
    it("新建：id 递增，记住它跨的是哪几个主题", () => {
      const first = addSummary(emptySidecar(), ["node-a", "node-b"]);

      expect(first.id).toBe("summary-1");
      expect(first.sidecar.summaries["summary-1"]).toEqual({
        nodeIds: ["node-a", "node-b"],
        text: "",
      });
      // Numbered rather than random, like free topics: the same actions give the
      // same file, which is what a readable diff needs.
      expect(nextSummaryId(first.sidecar)).toBe("summary-2");
    });

    it("改标签；清空文字不等于删除", () => {
      const { sidecar, id } = addSummary(emptySidecar(), ["node-a", "node-b"], "总述");

      expect(setSummaryText(sidecar, id, "改过的").summaries[id].text).toBe("改过的");
      // Unlike a free topic, whose text *is* the thing: here what was asked for
      // was the bracket, and one with nothing on it still groups.
      const emptied = setSummaryText(sidecar, id, "   ");
      expect(emptied.summaries[id]).toEqual({ nodeIds: ["node-a", "node-b"], text: "" });
    });

    it("删除，以及删除不存在的", () => {
      const { sidecar, id } = addSummary(emptySidecar(), ["node-a", "node-b"]);

      expect(removeSummary(sidecar, id).summaries).toEqual({});
      expect(removeSummary(sidecar, "summary-不存在")).toBe(sidecar);
      expect(setSummaryText(sidecar, "summary-不存在", "x")).toBe(sidecar);
    });

    it("读文件：没有跨度的丢、重复的去掉、坏条目丢、陌生字段留着", () => {
      const parsed = parseSidecar(
        JSON.stringify({
          version: 1,
          summaries: {
            "summary-1": { nodeIds: ["a", "b", "a", 7, ""], text: " 总述 ", colour: "amber" },
            "summary-2": { nodeIds: [], text: "空跨度" },
            "summary-3": { nodeIds: "a", text: "不是列表" },
            "summary-4": { text: "没有跨度" },
            "summary-5": "不是对象",
          },
        })
      );

      expect(parsed?.summaries["summary-1"]).toEqual({
        nodeIds: ["a", "b"],
        text: "总述",
        colour: "amber",
      });
      // A bracket around nothing is a drawing with no referent.
      expect(parsed?.summaries["summary-2"]).toBeUndefined();
      expect(parsed?.summaries["summary-3"]).toBeUndefined();
      expect(parsed?.summaries["summary-4"]).toBeUndefined();
      expect(parsed?.summaries["summary-5"]).toBeUndefined();
    });

    it("边界：加、改标题、换颜色、删", () => {
      const added = addBoundary(emptySidecar(), ["node-a"], "第一组");
      expect(added.id).toBe("boundary-1");
      expect(added.sidecar.boundaries["boundary-1"]).toEqual({
        nodeIds: ["node-a"],
        text: "第一组",
      });

      const titled = setBoundaryText(added.sidecar, added.id, "改过的标题");
      expect(titled.boundaries[added.id].text).toBe("改过的标题");

      const coloured = setBoundaryColor(titled, added.id, "emerald");
      expect(coloured.boundaries[added.id].color).toBe("emerald");
      // Back to the default rather than to no colour at all.
      expect(setBoundaryColor(coloured, added.id, "").boundaries[added.id].color).toBeUndefined();

      expect(removeBoundary(coloured, added.id).boundaries).toEqual({});
      expect(removeBoundary(coloured, "boundary-不存在")).toBe(coloured);
      expect(boundariesIn(null)).toEqual([]);

      // One topic is enough, so the numbering starts the same way a summary's does.
      expect(nextBoundaryId(coloured)).toBe("boundary-2");
    });

    it("读文件：颜色不是字符串就不算颜色，不认识的 id 留着", () => {
      const parsed = parseSidecar(
        JSON.stringify({
          version: 1,
          boundaries: {
            "boundary-1": { nodeIds: ["a"], text: " 标题 ", color: " violet " },
            "boundary-2": { nodeIds: ["b"], text: "", color: 7 },
            "boundary-3": { nodeIds: [], text: "空跨度" },
          },
        })
      );

      expect(parsed?.boundaries["boundary-1"]).toEqual({
        nodeIds: ["a"],
        text: "标题",
        color: "violet",
      });
      // A colour this build cannot place is a string like any other: the table
      // decides what to draw, the file remembers what the reader chose.
      expect(parsed?.boundaries["boundary-2"]).toEqual({ nodeIds: ["b"], text: "" });
      expect(parsed?.boundaries["boundary-3"]).toBeUndefined();
    });

    it("十段一起往返，谁也不丢", () => {
      let sidecar = addSummary(emptySidecar(), ["node-a", "node-b"], "总述").sidecar;
      sidecar = addBoundary(sidecar, ["node-c"], "一组").sidecar;
      sidecar = addFloatingTopic(sidecar, "画布上的想法", 120, -40).sidecar;
      sidecar = toggleRelation(sidecar, "node-c", "node-d");
      sidecar = setNodeTags(sidecar, "node-e", ["api"]);
      sidecar = setNodeLink(sidecar, "node-f", "#标题");
      sidecar = setNodeIcon(sidecar, "node-g", "star");
      sidecar = setNodeNote(sidecar, "node-h", "备注");
      sidecar = setNodePriority(sidecar, "node-i", 3);

      const back = parseSidecar(serializeSidecar(sidecar)) as MindmapSidecar;

      expect(back.summaries).toEqual({
        "summary-1": { nodeIds: ["node-a", "node-b"], text: "总述" },
      });
      expect(back.boundaries).toEqual({ "boundary-1": { nodeIds: ["node-c"], text: "一组" } });
      expect(back.floating).toEqual({ "floating-1": { text: "画布上的想法", x: 120, y: -40 } });
      expect(back.relations).toEqual([{ fromId: "node-c", toId: "node-d" }]);
      expect(back.tags).toEqual({ "node-e": ["api"] });
      expect(back.links).toEqual({ "node-f": "#标题" });
      expect(back.icons).toEqual({ "node-g": "star" });
      expect(back.notes).toEqual({ "node-h": "备注" });
      expect(back.markers).toEqual({ "node-i": { priority: 3 } });
    });

    it("一个概要就算内容", () => {
      expect(sidecarIsEmpty(addSummary(emptySidecar(), ["a", "b"]).sidecar)).toBe(false);
      expect(summariesIn(null)).toEqual([]);
    });
  });

  describe("迟到的装载", () => {
    /**
     * The race this exists for: the companion file is read while the reader is
     * already clicking things, and the read lands afterwards. Taking either side
     * alone loses something — the edit, or everything else the file held.
     */
    it("读者碰过的段落归读者，其余归文件", () => {
      let fromDisk = setNodeTags(emptySidecar(), "node-a", ["api"]);
      fromDisk = setNodeNote(fromDisk, "node-b", "文件里的备注");
      const edited = toggleRelation(emptySidecar(), "node-a", "node-b");

      const merged = mergeSidecar(fromDisk, edited, new Set(["relations"]));

      expect(merged?.relations).toEqual([{ fromId: "node-a", toId: "node-b" }]);
      expect(merged?.tags).toEqual({ "node-a": ["api"] });
      expect(merged?.notes).toEqual({ "node-b": "文件里的备注" });
    });

    it("只有一边有东西时就给那一边", () => {
      const file = setNodeNote(emptySidecar(), "node-a", "备注");

      // Nothing was edited: the file is what is on screen.
      expect(mergeSidecar(file, null, new Set())).toBe(file);
      // Nothing was on disk: the edit stands alone.
      expect(mergeSidecar(null, file, new Set(["notes"]))).toBe(file);
    });
  });

  describe("与磁盘之间", () => {
    it("没有桥、没有文档键、没有文件，都是没有伴生文件", async () => {
      removeBridge();
      expect(await loadSidecar("/vault/a.md")).toBeNull();

      const api = installBridge();
      expect(await loadSidecar(null)).toBeNull();
      expect(await loadSidecar(undefined)).toBeNull();
      expect(await loadSidecar("")).toBeNull();
      // Nothing was asked of the disk for a document with no path behind it.
      expect(api.readMindmapSidecar).not.toHaveBeenCalled();

      expect(await loadSidecar("/vault/a.md")).toBeNull();
      expect(api.readMindmapSidecar).toHaveBeenCalledWith({ documentPath: "/vault/a.md" });
    });

    it("读失败、内容坏了、桥抛异常，都只是没有备注", async () => {
      const api = installBridge();

      api.readMindmapSidecar.mockResolvedValueOnce({ success: false, message: "权限不足" });
      expect(await loadSidecar("/vault/a.md")).toBeNull();

      api.readMindmapSidecar.mockResolvedValueOnce({ success: true, exists: true, content: "{ 坏" });
      expect(await loadSidecar("/vault/a.md")).toBeNull();

      api.readMindmapSidecar.mockRejectedValueOnce(new Error("通道断了"));
      expect(await loadSidecar("/vault/a.md")).toBeNull();
    });

    it("读到的备注原样回来", async () => {
      const api = installBridge();
      api.readMindmapSidecar.mockResolvedValueOnce({
        success: true,
        exists: true,
        content: JSON.stringify({ version: 1, notes: { "node-a": "备注" } }),
      });

      const sidecar = await loadSidecar("/vault/a.md");

      expect(noteFor(sidecar, "node-a")).toBe("备注");
    });

    it("保存写的是序列化后的文本，路径是文档路径", async () => {
      const api = installBridge();
      const sidecar = setNodeNote(emptySidecar(), "node-a", "备注");

      expect(await saveSidecar("/vault/a.md", sidecar)).toBe(true);

      expect(api.saveMindmapSidecar).toHaveBeenCalledWith({
        documentPath: "/vault/a.md",
        // The path is the document's; deriving the companion's name from it is
        // the main process's job, so the renderer never names a file itself.
        content: serializeSidecar(sidecar),
      });
    });

    it("没有桥或没有文档键时不写，也不抛", async () => {
      removeBridge();
      expect(await saveSidecar("/vault/a.md", emptySidecar())).toBe(false);

      const api = installBridge();
      expect(await saveSidecar(null, emptySidecar())).toBe(false);
      expect(await saveSidecar(undefined, emptySidecar())).toBe(false);
      expect(api.saveMindmapSidecar).not.toHaveBeenCalled();
    });

    it("写失败只回答 false", async () => {
      const api = installBridge();
      api.saveMindmapSidecar.mockResolvedValueOnce({ success: false, message: "磁盘忙" });

      expect(await saveSidecar("/vault/a.md", emptySidecar())).toBe(false);

      api.saveMindmapSidecar.mockRejectedValueOnce(new Error("通道断了"));
      expect(await saveSidecar("/vault/a.md", emptySidecar())).toBe(false);
    });

    it("只是打开文档，不会写盘", async () => {
      // The rule that keeps the file trustworthy: it says what the reader wrote,
      // so nothing that only reads may write.
      const api = installBridge();
      api.readMindmapSidecar.mockResolvedValueOnce({
        success: true,
        exists: true,
        content: JSON.stringify({ version: 1, notes: { "node-a": "备注" } }),
      });

      await loadSidecar("/vault/a.md");

      expect(api.saveMindmapSidecar).not.toHaveBeenCalled();
    });
  });
});
