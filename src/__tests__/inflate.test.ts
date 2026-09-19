import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { inflateRaw } from "../core/inflate";

/**
 * The DEFLATE decoder, checked against the platform's own.
 *
 * DEFLATE is compressed with `node:zlib` and decompressed with the code under
 * test, which is a stronger check than any amount of reading it: zlib is the
 * reference implementation, it picks its block types by itself — stored, fixed
 * Huffman, dynamic Huffman, sometimes several in one stream — and it will happily
 * produce input this code has never seen. Comparing the output byte for byte is
 * the whole assertion.
 *
 * The one thing zlib will not produce on demand is a stored block, so that case is
 * built by hand below rather than hoped for.
 */

const encoder = new TextEncoder();

function inflate(compressed: Uint8Array): Uint8Array {
  const result = inflateRaw(compressed);
  if (!result.ok) throw new Error(`本该能解压：${result.message}`);
  return result.bytes;
}

/** Compresses with zlib and decompresses with the code under test. */
function roundTrip(text: string, options: { level?: number } = {}): Uint8Array {
  const original = encoder.encode(text);
  return inflate(new Uint8Array(deflateRawSync(original, options)));
}

function expectSameBytes(actual: Uint8Array, expected: Uint8Array) {
  expect(Array.from(actual)).toEqual(Array.from(expected));
}

describe("解压 raw DEFLATE", () => {
  it("空输入", () => {
    expectSameBytes(roundTrip(""), new Uint8Array());
  });

  it("一句话，与一句中文", () => {
    // UTF-8: the decoder copies bytes and never has an opinion about what they
    // mean, but this is the shape the real input takes.
    for (const text of ["hello", "hello hello hello", "这是一段中文，用来看看多字节字符。", "a"]) {
      expectSameBytes(roundTrip(text), encoder.encode(text));
    }
  });

  it("重复的长文本：回引与重叠的复制", () => {
    // Long runs are spelled as back-references, and a run may copy bytes it is
    // writing at the same time — the case where a naive copy goes wrong.
    const text = "abcabcabc".repeat(2000);
    expectSameBytes(roundTrip(text), encoder.encode(text));
  });

  it("随机文本：动态哈夫曼", () => {
    // Not compressible, so zlib reaches for a dynamic block with a long table.
    let seed = 12345;
    const random = Array.from({ length: 20000 }, () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return String.fromCharCode(32 + (seed % 95));
    }).join("");

    expectSameBytes(roundTrip(random), encoder.encode(random));
  });

  it("大文本：输出会不断长大", () => {
    const text = "这是一份大纲里的一个主题。".repeat(20000);
    expectSameBytes(roundTrip(text, { level: 6 }), encoder.encode(text));
  });

  it("存下来的块（stored）：由手工构造，才一定覆盖得到", () => {
    // zlib will not emit one on request, and a stored block is the case a decoder
    // written only against compressed data never sees.
    const data = encoder.encode("stored blocks are just bytes");
    const stored = new Uint8Array(5 + data.length);
    stored[0] = 0b00000001; // final block, type 00
    stored[1] = data.length & 0xff;
    stored[2] = (data.length >> 8) & 0xff;
    stored[3] = ~data.length & 0xff;
    stored[4] = (~data.length >> 8) & 0xff;
    stored.set(data, 5);

    expectSameBytes(inflate(stored), data);
  });

  it("多个块连在一起：一直到最后一个才停", () => {
    // zlib splits a large input into several blocks; the decoder has to keep going
    // until the block that says it is the last one.
    const text = `${"第一段。".repeat(5000)}${"第二段。".repeat(5000)}`;
    const compressed = new Uint8Array(deflateRawSync(encoder.encode(text), { level: 1, chunkSize: 1024 }));

    expectSameBytes(inflate(compressed), encoder.encode(text));
  });

  it("坏数据说的是哪里不对，而不是崩掉", () => {
    const good = new Uint8Array(deflateRawSync(encoder.encode("hello hello hello")));

    const truncated = inflateRaw(good.slice(0, Math.floor(good.length / 2)));
    expect(truncated.ok).toBe(false);

    // BFINAL set, BTYPE 11 — a block type that does not exist.
    const reserved = inflateRaw(new Uint8Array([0b00000111, 0, 0, 0]));
    expect(reserved.ok).toBe(false);
    if (!reserved.ok) expect(reserved.message).toContain("块类型");

    // A stored block whose two lengths do not agree is the format's own checksum.
    const mismatched = inflateRaw(new Uint8Array([0b00000001, 3, 0, 0, 0, 1, 2, 3]));
    expect(mismatched.ok).toBe(false);
    if (!mismatched.ok) expect(mismatched.message).toContain("长度");
  });

  it("空字节流不算合法", () => {
    expect(inflateRaw(new Uint8Array()).ok).toBe(false);
  });
});
