import { inflateRaw } from "./inflate";

/**
 * Reading one entry out of a ZIP, for the `.xmind` files this app imports.
 *
 * Written rather than depended on for the same reason the DEFLATE decoder was: the
 * need is one file inside one archive, and the format's rules are a few hundred
 * lines of offsets. What it does *not* do is take the format lightly — the two
 * places a ZIP reader usually gets it wrong are both handled below, and both
 * because the file in the wild has no obligation to be tidy.
 */

export type ZipResult = { ok: true; bytes: Uint8Array } | { ok: false; message: string };

/** Values taken from the central directory, which is the authoritative copy. */
const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_ENTRY = 0x04034b50;

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  // `>>> 0` because the top bit would otherwise make this negative, and every
  // offset in a ZIP is unsigned.
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

/**
 * Where the central directory starts, and how many entries it holds.
 *
 * Found by scanning backwards for the record's signature: it is at the end of the
 * file, but a ZIP may carry a comment after it — up to 64KB of one — so "at the
 * end" is not a position that can be computed.
 */
function readDirectoryLocation(bytes: Uint8Array): { offset: number; count: number } | null {
  if (bytes.length < 22) return null;

  // The comment is at most 65535 bytes, so the record cannot start earlier than
  // this; the loop stops there rather than reading the whole file.
  const earliest = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= earliest; offset -= 1) {
    if (readUint32(bytes, offset) !== END_OF_DIRECTORY) continue;

    const count = readUint16(bytes, offset + 10);
    const directoryOffset = readUint32(bytes, offset + 16);
    // All ones means the real values are in a ZIP64 record this does not read.
    if (count === 0xffff || directoryOffset === 0xffffffff) return null;
    return { offset: directoryOffset, count };
  }

  return null;
}

/** An entry to write: a name, and the bytes it holds. */
export interface ZipEntryInput {
  name: string;
  bytes: Uint8Array;
}

/**
 * Builds a ZIP holding these entries.
 *
 * Every entry is **stored**, not deflated. A ZIP may hold uncompressed entries —
 * that is part of the format, not a shortcut through it — and the alternative was
 * writing a compressor, which is a considerably larger thing than the feature
 * needs. What it costs is size: an outline is a few kilobytes of JSON, and the
 * kind of file this sits beside in a folder is already holding photographs.
 *
 * No data descriptors, no ZIP64, and no comment: all three are things a reader has
 * to cope with, and a writer that does not produce them is a reader's easier day.
 */
export function writeZip(entries: ZipEntryInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const bytes: number[] = [];
  const push16 = (value: number) => bytes.push(value & 0xff, (value >> 8) & 0xff);
  const push32 = (value: number) =>
    bytes.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff);

  const written: { name: string; bytes: Uint8Array; offset: number; checksum: number }[] = [];

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const checksum = crc32(entry.bytes);
    const offset = bytes.length;

    push32(0x04034b50);
    push16(20); // version needed
    push16(0); // flags: no descriptor follows, the sizes are here
    push16(0); // method: stored
    push16(0); // time
    push16(0); // date
    push32(checksum);
    push32(entry.bytes.length);
    push32(entry.bytes.length);
    push16(nameBytes.length);
    push16(0); // extra
    bytes.push(...nameBytes);
    bytes.push(...entry.bytes);

    written.push({ name: entry.name, bytes: entry.bytes, offset, checksum });
  }

  const directoryOffset = bytes.length;
  for (const entry of written) {
    const nameBytes = encoder.encode(entry.name);
    push32(0x02014b50);
    push16(20); // version made by
    push16(20); // version needed
    push16(0); // flags
    push16(0); // method
    push16(0); // time
    push16(0); // date
    push32(entry.checksum);
    push32(entry.bytes.length);
    push32(entry.bytes.length);
    push16(nameBytes.length);
    push16(0); // extra
    push16(0); // comment
    push16(0); // disk
    push16(0); // internal attributes
    push32(0); // external attributes
    push32(entry.offset);
    bytes.push(...nameBytes);
  }

  push32(0x06054b50);
  push16(0);
  push16(0);
  push16(written.length);
  push16(written.length);
  push32(bytes.length - directoryOffset);
  push32(directoryOffset);
  push16(0); // comment length

  return Uint8Array.from(bytes);
}

/** One entry as the central directory describes it. */
interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  checksum: number;
  headerOffset: number;
}

/**
 * CRC-32, which is what a ZIP entry carries to say its bytes arrived intact.
 *
 * Worth the fifteen lines rather than not checking: a bit flipped in an entry that
 * is *stored* — not compressed, so nothing else would notice — would otherwise be
 * handed on as if it were the file's content, and the reader's outline would be
 * quietly wrong. With the check, a damaged archive is a message.
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let byte = 0; byte < 256; byte += 1) {
    let value = byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[byte] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Every entry in the archive.
 *
 * Names are read as UTF-8 whatever the flag says: the flag exists because some
 * writers predate UTF-8, and in practice a name that is not UTF-8 is a name that
 * cannot be matched against the one thing this app is looking for anyway.
 */
function readDirectory(bytes: Uint8Array): ZipEntry[] | null {
  const location = readDirectoryLocation(bytes);
  if (!location) return null;

  const decoder = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];
  let offset = location.offset;

  for (let index = 0; index < location.count; index += 1) {
    if (offset + 46 > bytes.length || readUint32(bytes, offset) !== DIRECTORY_ENTRY) {
      // The count and the data disagree. What was read so far is still usable, so
      // the listing stops here rather than failing: a writer that miscounted its
      // own entries should not cost the reader their file, and an entry that was
      // not listed simply is not found.
      break;
    }

    const method = readUint16(bytes, offset + 10);
    const checksum = readUint32(bytes, offset + 16);
    const compressedSize = readUint32(bytes, offset + 20);
    const uncompressedSize = readUint32(bytes, offset + 24);
    const nameLength = readUint16(bytes, offset + 28);
    const extraLength = readUint16(bytes, offset + 30);
    const commentLength = readUint16(bytes, offset + 32);
    const headerOffset = readUint32(bytes, offset + 42);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    entries.push({ name, method, compressedSize, uncompressedSize, checksum, headerOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * The bytes of the first entry whose name satisfies `wanted`.
 *
 * The sizes come from the central directory rather than from the entry's own
 * header, and that is not a detail: when a writer streams an entry it does not yet
 * know the sizes, so it writes zeroes in the local header and puts the real ones in
 * a data descriptor *after* the data. A reader that trusted the local header would
 * take zero bytes and report success.
 */
export function readZipEntry(
  bytes: Uint8Array,
  wanted: (name: string) => boolean,
  /** What is being looked for, by name — this ends up in the message. */
  label: string
): ZipResult {
  const directory = readDirectory(bytes);
  if (!directory || directory.length === 0) {
    return { ok: false, message: "这个文件不是一个 ZIP 包（没有找到中央目录）。" };
  }

  const entry = directory.find((candidate) => wanted(candidate.name));
  if (!entry) {
    // Named rather than called "the entry": for a reader, "there is no content.json
    // in this archive" is news they can act on, and "the entry is missing" is not.
    return { ok: false, message: `这个 ZIP 包里没有 ${label}。` };
  }
  if (entry.compressedSize === 0xffffffff || entry.headerOffset === 0xffffffff) {
    return { ok: false, message: "这个 ZIP 包用了 ZIP64，暂不支持。" };
  }
  if (entry.headerOffset + 30 > bytes.length || readUint32(bytes, entry.headerOffset) !== LOCAL_ENTRY) {
    return { ok: false, message: "这个 ZIP 包的目录指向了不存在的数据。" };
  }

  // The local header repeats the name and may carry an extra field of its own, so
  // the data does not begin at a fixed offset from the header.
  const nameLength = readUint16(bytes, entry.headerOffset + 26);
  const extraLength = readUint16(bytes, entry.headerOffset + 28);
  const start = entry.headerOffset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;

  if (end > bytes.length) {
    return { ok: false, message: "这个 ZIP 包的数据不完整。" };
  }
  const data = bytes.subarray(start, end);

  let contents: Uint8Array;

  if (entry.method === 0) {
    contents = data.slice();
  } else if (entry.method === 8) {
    const inflated = inflateRaw(data);
    if (!inflated.ok) return inflated;
    // The size the directory promised, checked against what came out: a wrong
    // answer here means the archive and its contents disagree, which is worth
    // saying rather than passing on as if it were data.
    if (entry.uncompressedSize !== 0xffffffff && inflated.bytes.length !== entry.uncompressedSize) {
      return {
        ok: false,
        message: `解出来的数据长度对不上（目录说 ${entry.uncompressedSize}，实际 ${inflated.bytes.length}）。`,
      };
    }
    contents = inflated.bytes;
  } else {
    return { ok: false, message: `这个 ZIP 项用的压缩方式（${entry.method}）读不了。` };
  }

  // The entry's own check on itself, and the only one that catches a bit flipped
  // inside an entry that was stored rather than compressed.
  if (entry.checksum !== 0 && crc32(contents) !== entry.checksum) {
    return { ok: false, message: "这个 ZIP 项的内容与它自己的校验值对不上（文件可能损坏了）。" };
  }

  return { ok: true, bytes: contents };
}
