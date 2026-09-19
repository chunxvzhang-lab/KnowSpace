/**
 * Raw DEFLATE, decoded here rather than by a library (RFC 1951).
 *
 * Written because the alternative was a dependency, and the one place this app
 * needs DEFLATE is reading the `content.json` out of an `.xmind` file — an outline,
 * a few kilobytes of JSON. A decoder for the whole of DEFLATE is a few hundred
 * lines and is *specified*: every rule below is a line of the RFC, and the tests
 * check it against the platform's own zlib compressing real data, which is a
 * stronger check than any amount of reading the code would be.
 *
 * Raw DEFLATE, without the zlib header: that is the form a ZIP entry holds.
 */

export type InflateResult = { ok: true; bytes: Uint8Array } | { ok: false; message: string };

/**
 * A ceiling on what one file may expand to.
 *
 * DEFLATE can describe far more output than its input: a few hundred bytes can ask
 * for gigabytes, which a decoder will faithfully start writing. Nothing this
 * feature reads is anywhere near this size, so the limit costs nothing real and
 * turns a decompression bomb into a message.
 */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

class InflateError extends Error {}

/** The bits of a DEFLATE stream, which are read least-significant bit first. */
class BitReader {
  private readonly bytes: Uint8Array;
  private position = 0;
  /** How many bits of the current byte have been consumed, 0–7. */
  private bit = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  /** Reads `count` bits, the first one read being the least significant. */
  read(count: number): number {
    let value = 0;

    for (let index = 0; index < count; index += 1) {
      if (this.position >= this.bytes.length) {
        throw new InflateError("数据在读到一半时结束了。");
      }
      const bitValue = (this.bytes[this.position] >> this.bit) & 1;
      value |= bitValue << index;

      this.bit += 1;
      if (this.bit === 8) {
        this.bit = 0;
        this.position += 1;
      }
    }

    return value;
  }

  /** Skips to the next byte boundary, which a stored block starts on. */
  alignToByte(): void {
    if (this.bit !== 0) {
      this.bit = 0;
      this.position += 1;
    }
  }

  /** Reads whole bytes, which is how a stored block arrives. */
  readBytes(count: number): Uint8Array {
    if (this.position + count > this.bytes.length) {
      throw new InflateError("数据在读到一半时结束了。");
    }
    const slice = this.bytes.subarray(this.position, this.position + count);
    this.position += count;
    return slice;
  }
}

/**
 * A canonical Huffman decoder.
 *
 * The codes are kept as one map per code length rather than as a lookup table
 * indexed by the next fifteen bits: canonical codes are read one bit at a time
 * whatever the storage, and this is the version of that which can be checked by
 * reading it. An outline is not a place where decoding speed matters.
 *
 * Huffman codes go on the wire most-significant bit first, which is the opposite
 * of every other number in DEFLATE — so the code below is built up that way.
 */
class Huffman {
  /** By code length: the code as read so far, to the symbol it names. */
  private readonly byLength: Map<number, number>[] = [];

  constructor(lengths: number[]) {
    const counts = new Array<number>(16).fill(0);
    for (const length of lengths) {
      if (length > 0) counts[length] += 1;
    }

    // Canonical: the shortest codes come first, and within one length they are
    // numbered in the order the symbols appear.
    const nextCode = new Array<number>(16).fill(0);
    let code = 0;
    for (let bits = 1; bits <= 15; bits += 1) {
      code = (code + counts[bits - 1]) << 1;
      nextCode[bits] = code;
    }

    for (let symbol = 0; symbol < lengths.length; symbol += 1) {
      const bits = lengths[symbol];
      if (bits === 0) continue;
      if (!this.byLength[bits]) this.byLength[bits] = new Map();
      this.byLength[bits].set(nextCode[bits], symbol);
      nextCode[bits] += 1;
    }
  }

  decode(reader: BitReader): number {
    let code = 0;

    for (let bits = 1; bits <= 15; bits += 1) {
      code = (code << 1) | reader.read(1);
      const symbol = this.byLength[bits]?.get(code);
      if (symbol !== undefined) return symbol;
    }

    throw new InflateError("遇到了不合法的编码。");
  }
}

// The two tables of RFC 1951 §3.2.5: for each length and distance code, the value
// it starts at and how many extra bits follow it.
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DISTANCE_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];

/** The order the code-length code's own lengths arrive in, which is not 0…18. */
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function fixedLiteralTree(): Huffman {
  const lengths = new Array<number>(288);
  for (let symbol = 0; symbol < 288; symbol += 1) {
    lengths[symbol] = symbol <= 143 ? 8 : symbol <= 255 ? 9 : symbol <= 279 ? 7 : 8;
  }
  return new Huffman(lengths);
}

function fixedDistanceTree(): Huffman {
  return new Huffman(new Array<number>(30).fill(5));
}

/** What a block is writing into, which grows as it goes. */
class Output {
  private buffer = new Uint8Array(1024);
  private length = 0;

  push(byte: number): void {
    if (this.length === this.buffer.length) {
      this.grow();
    }
    this.buffer[this.length] = byte;
    this.length += 1;
  }

  /** The byte `distance` back, which may be one this copy just wrote. */
  byteAt(distance: number): number {
    if (distance > this.length) {
      throw new InflateError("回引越过了已经解出来的数据。");
    }
    return this.buffer[this.length - distance];
  }

  private grow(): void {
    if (this.buffer.length >= MAX_OUTPUT_BYTES) {
      throw new InflateError("解出来的数据大得不正常。");
    }
    const next = new Uint8Array(Math.min(this.buffer.length * 2, MAX_OUTPUT_BYTES));
    next.set(this.buffer);
    this.buffer = next;
  }

  take(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }
}

function inflateBlock(
  reader: BitReader,
  output: Output,
  literalTree: Huffman,
  distanceTree: Huffman
): void {
  for (;;) {
    const symbol = literalTree.decode(reader);

    if (symbol < 256) {
      output.push(symbol);
      continue;
    }
    if (symbol === 256) return;

    const lengthIndex = symbol - 257;
    if (lengthIndex >= LENGTH_BASE.length) {
      throw new InflateError("遇到了不合法的长度编码。");
    }
    const length = LENGTH_BASE[lengthIndex] + reader.read(LENGTH_EXTRA[lengthIndex]);

    const distanceSymbol = distanceTree.decode(reader);
    if (distanceSymbol >= DISTANCE_BASE.length) {
      throw new InflateError("遇到了不合法的距离编码。");
    }
    const distance = DISTANCE_BASE[distanceSymbol] + reader.read(DISTANCE_EXTRA[distanceSymbol]);

    // Byte by byte, and reading from the output as it grows: a run may overlap the
    // bytes it is copying, which is how DEFLATE spells a repeated pattern.
    for (let index = 0; index < length; index += 1) {
      output.push(output.byteAt(distance));
    }
  }
}

function dynamicTrees(reader: BitReader): { literalTree: Huffman; distanceTree: Huffman } {
  const literalCount = reader.read(5) + 257;
  const distanceCount = reader.read(5) + 1;
  const codeLengthCount = reader.read(4) + 4;

  const codeLengths = new Array<number>(19).fill(0);
  for (let index = 0; index < codeLengthCount; index += 1) {
    codeLengths[CODE_LENGTH_ORDER[index]] = reader.read(3);
  }
  const codeLengthTree = new Huffman(codeLengths);

  // The literal and distance code lengths, run-length encoded, which is where
  // almost all of a dynamic block's size goes.
  const lengths: number[] = [];
  while (lengths.length < literalCount + distanceCount) {
    const symbol = codeLengthTree.decode(reader);

    if (symbol < 16) {
      lengths.push(symbol);
      continue;
    }
    if (symbol === 16) {
      const previous = lengths[lengths.length - 1];
      if (previous === undefined) {
        throw new InflateError("重复了一段不存在的编码长度。");
      }
      const repeats = reader.read(2) + 3;
      for (let index = 0; index < repeats; index += 1) lengths.push(previous);
      continue;
    }
    const repeats = symbol === 17 ? reader.read(3) + 3 : reader.read(7) + 11;
    for (let index = 0; index < repeats; index += 1) lengths.push(0);
    if (lengths.length > literalCount + distanceCount) {
      throw new InflateError("编码长度比声明的还多。");
    }
  }

  return {
    literalTree: new Huffman(lengths.slice(0, literalCount)),
    distanceTree: new Huffman(lengths.slice(literalCount)),
  };
}

/**
 * Decodes a raw DEFLATE stream.
 *
 * Answers with a message rather than throwing: what arrives here is the inside of
 * somebody else's file, and a file that is not what it claimed to be is an
 * ordinary outcome for this feature rather than a bug in it.
 */
export function inflateRaw(bytes: Uint8Array): InflateResult {
  const reader = new BitReader(bytes);
  const output = new Output();
  const fixedLiteral = fixedLiteralTree();
  const fixedDistance = fixedDistanceTree();

  try {
    for (;;) {
      const isFinal = reader.read(1) === 1;
      const type = reader.read(2);

      if (type === 0) {
        reader.alignToByte();
        const length = reader.read(16);
        const complement = reader.read(16);
        if (length !== (~complement & 0xffff)) {
          throw new InflateError("这一段数据的长度前后对不上。");
        }
        for (const byte of reader.readBytes(length)) output.push(byte);
      } else if (type === 1) {
        inflateBlock(reader, output, fixedLiteral, fixedDistance);
      } else if (type === 2) {
        const { literalTree, distanceTree } = dynamicTrees(reader);
        inflateBlock(reader, output, literalTree, distanceTree);
      } else {
        throw new InflateError("遇到了不认识的块类型。");
      }

      if (isFinal) break;
    }
  } catch (error) {
    if (error instanceof InflateError) return { ok: false, message: error.message };
    return { ok: false, message: `解压失败：${error instanceof Error ? error.message : String(error)}` };
  }

  return { ok: true, bytes: output.take() };
}
