import { describe, expect, it } from "vitest";
import { readZipEntry } from "../core/zip";
import { buildZip, slowCrc32 } from "./helpers/zipBuilder";

/**
 * Reading one entry out of a ZIP.
 *
 * The archives are built here, byte by byte, rather than borrowed: what has to be
 * covered is the shapes a real writer produces *without* being tidy about it — a
 * comment after the directory, sizes left at zero in the local header because the
 * writer streamed the entry, an entry that is stored rather than compressed — and
 * there is no way to ask an archiver for those on purpose.
 *
 * The CRC is checked two ways: against the standard's own check value, which pins
 * the algorithm, and against a table-free implementation below, which is what
 * catches a mistake in the reader's table rather than in the idea.
 */

const encoder = new TextEncoder();

function bytesOf(text: string): Uint8Array {
  return encoder.encode(text);
}

function read(bytes: Uint8Array, name: string): ReturnType<typeof readZipEntry> {
  return readZipEntry(bytes, (candidate) => candidate === name, name);
}

describe("从 ZIP 里取一项", () => {
  it("CRC32 对上标准里的那个校验值", () => {
    // The algorithm, pinned: this is the value the standard gives for the string
    // below, and it is the same one the reader's table has to produce.
    expect(slowCrc32(bytesOf("123456789"))).toBe(0xcbf43926);
  });

  it("拿得到未压缩项与压缩项", () => {
    const zip = buildZip([
      { name: "stored.txt", data: bytesOf("存下来的内容") },
      { name: "content.json", data: bytesOf('{"hello":"世界"}'), deflate: true },
    ]);

    expect(new TextDecoder().decode((read(zip, "stored.txt") as { bytes: Uint8Array }).bytes)).toBe(
      "存下来的内容"
    );
    expect(new TextDecoder().decode((read(zip, "content.json") as { bytes: Uint8Array }).bytes)).toBe(
      '{"hello":"世界"}'
    );
  });

  it("取的是名字对上的那一项，不按顺序猜", () => {
    const zip = buildZip([
      { name: "a.txt", data: bytesOf("甲") },
      { name: "content.json", data: bytesOf("乙") },
      { name: "c.txt", data: bytesOf("丙") },
    ]);

    expect(new TextDecoder().decode((read(zip, "content.json") as { bytes: Uint8Array }).bytes)).toBe("乙");
  });

  it("目录后面跟着注释也找得到", () => {
    // The record is at the end of the file unless a comment follows it, and a
    // comment may be up to 64KB — so "at the end" is not a position to compute.
    const zip = buildZip([{ name: "content.json", data: bytesOf("有注释") }], "x".repeat(300));

    expect(new TextDecoder().decode((read(zip, "content.json") as { bytes: Uint8Array }).bytes)).toBe(
      "有注释"
    );
  });

  it("本地头里的大小是零（流式写入）也照样读得出", () => {
    // The case a reader that trusts the local header gets wrong: it takes zero
    // bytes and reports success.
    const zip = buildZip([{ name: "content.json", data: bytesOf("流式写入的内容"), deflate: true, streamed: true }]);

    const result = read(zip, "content.json");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new TextDecoder().decode(result.bytes)).toBe("流式写入的内容");
  });

  it("内容被翻了一位：靠它自己的校验值挡住", () => {
    const zip = buildZip([{ name: "content.json", data: bytesOf("完好的内容") }]);
    // Same archive, one byte of the entry's data changed. Nothing else would
    // notice: it is stored, so no decompressor ever looks at it.
    const at = new TextDecoder().decode(zip).indexOf("完好的内容");
    expect(at).toBeGreaterThan(0);
    zip[at + 1] = zip[at + 1] === 0x61 ? 0x62 : 0x61;

    const result = read(zip, "content.json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("校验值");
  });

  it("不是 ZIP、没有那一项、数据不全：各说各的", () => {
    const notZip = read(bytesOf("这是一份 XML，不是压缩包"), "content.json");
    expect(notZip.ok).toBe(false);
    if (!notZip.ok) expect(notZip.message).toContain("ZIP");

    const zip = buildZip([{ name: "a.txt", data: bytesOf("甲") }]);
    const missing = read(zip, "content.json");
    expect(missing.ok).toBe(false);
    // Named, so the reader knows what the archive was missing.
    if (!missing.ok) expect(missing.message).toContain("没有 content.json");

    // The directory says where the data is, but the file stops before it.
    const cut = zip.slice(0, 40);
    expect(read(cut, "a.txt").ok).toBe(false);
  });

  it("读不了的压缩方式说清楚是哪种", () => {
    const zip = buildZip([{ name: "content.json", data: bytesOf("内容") }]);
    // Method 12 is bzip2, which this reader does not do and should say so about.
    const at = 8; // the method field of the first local header
    zip[at] = 12;
    const directoryMethod = zip.length - 22 - 46 - "content.json".length;
    zip[directoryMethod + 10] = 12;

    const result = read(zip, "content.json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("12");
  });

  it("ZIP64 明确说不支持，而不是读出差的数据", () => {
    const zip = buildZip([{ name: "content.json", data: bytesOf("内容") }]);
    // All ones in the directory's entry count is the format's way of saying the
    // real values live in a record this reader does not parse.
    const eocd = zip.length - 22;
    zip[eocd + 10] = 0xff;
    zip[eocd + 11] = 0xff;

    const result = read(zip, "content.json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("没有找到中央目录");
  });
});
