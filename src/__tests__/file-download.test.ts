import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFile } from "../services/fileDownload";

/**
 * Handing a file to the reader.
 *
 * jsdom has no object URLs and cannot navigate, so both ends of this are observed
 * rather than performed: the blob handed to `createObjectURL` is what the browser
 * would have saved, and the anchor's own `download` is the name it would have been
 * saved under.
 *
 * The one that matters most is the copy. A `Uint8Array` is often a window onto a
 * larger buffer — a slice of a decoded archive, a view into canvas pixels — and a
 * file built from the buffer instead of the view arrives with whatever else was in
 * it. That is a bug with no visible symptom except a corrupt file, which is exactly
 * the kind a helper exists to have once.
 */

function installStubs() {
  const saved: { blob: Blob; url: string }[] = [];
  const revoked: string[] = [];
  const names: string[] = [];

  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    names.push(this.download);
  });
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: (blob: Blob) => {
      const url = `blob:test-${saved.length}`;
      saved.push({ blob, url });
      return url;
    },
    revokeObjectURL: (url: string) => {
      revoked.push(url);
    },
  });

  return { saved, revoked, names };
}

describe("把一个文件交给读者", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("字节被按视图拷出来：窗口之外的东西不跟着走", async () => {
    const { saved, names } = installStubs();

    // Three bytes that are a window onto a nine-byte buffer. The naive
    // implementation hands over the whole buffer and the file is three times the
    // size it should be, with two bytes of somebody else's data in front.
    const buffer = new Uint8Array([9, 9, 1, 2, 3, 9, 9, 9, 9]);
    downloadFile({
      fileName: "窗口.bin",
      data: new Uint8Array(buffer.buffer, 2, 3),
      mime: "application/octet-stream",
    });

    expect(saved).toHaveLength(1);
    expect(saved[0].blob.size).toBe(3);
    expect(new Uint8Array(await saved[0].blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(names).toEqual(["窗口.bin"]);
  });

  it("文字与现成的 Blob 内容都照传", async () => {
    const { saved } = installStubs();

    downloadFile({ fileName: "a.opml", data: "<opml/>", mime: "text/x-opml+xml;charset=utf-8" });
    // A blob the caller already had — the rasterised PNG arrives this way — is
    // wrapped rather than forwarded, so that the type on the file is always the one
    // the caller named, whatever the blob it came in was labelled.
    const png = new Blob([new Uint8Array([1, 2])], { type: "image/png" });
    downloadFile({ fileName: "b.png", data: png, mime: "image/png" });

    expect(saved.map((entry) => entry.blob.type)).toEqual([
      "text/x-opml+xml;charset=utf-8",
      "image/png",
    ]);
    expect(new TextDecoder().decode(await saved[0].blob.arrayBuffer())).toBe("<opml/>");
    expect(new Uint8Array(await saved[1].blob.arrayBuffer())).toEqual(new Uint8Array([1, 2]));
  });

  it("链接点过就用掉：URL 被回收，锚点不留在文档里", () => {
    const { saved, revoked } = installStubs();

    downloadFile({ fileName: "c.xmind", data: new Uint8Array([80, 75]), mime: "application/zip" });

    // A URL that is never revoked is a file the browser keeps in memory for the
    // life of the page, and an anchor left behind is a node in a document the
    // reader has already been given the file from.
    expect(revoked).toEqual([saved[0].url]);
    expect(document.querySelectorAll("a")).toHaveLength(0);
  });

  it("名字为空也照做，不替读者改名字", () => {
    // Whatever the caller worked out is what the file is called; this is not the
    // layer that gets to have an opinion, and a silent rename here would be
    // impossible to trace from the menu that asked for it.
    const { names } = installStubs();

    downloadFile({ fileName: "", data: "", mime: "text/plain" });

    expect(names).toEqual([""]);
  });
});
