import { deflateRawSync } from "node:zlib";

/**
 * Building ZIP archives for tests, byte by byte.
 *
 * Written out rather than borrowed from an archiver because what has to be covered
 * is the shapes a real writer produces *without* being tidy about it — a comment
 * after the directory, sizes left at zero in the local header because the writer
 * streamed the entry, an entry stored rather than compressed — and there is no way
 * to ask an archiver for those on purpose.
 *
 * Shared by the two tests that need an archive: the reader's own, and the import
 * that reads an `.xmind`, which is an archive holding one JSON file.
 */

/**
 * CRC-32 the slow way, so the reader's table is not checked against itself.
 *
 * The same algorithm, deliberately: a second *idea* of what CRC-32 is would only
 * test which of the two was right, while the table is the part that can be built
 * wrong. The algorithm itself is pinned by the standard's check value in the test.
 */
export function slowCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntrySpec {
  name: string;
  data: Uint8Array;
  /** Compress it, as a real archiver would for anything that is not tiny. */
  deflate?: boolean;
  /** Write zeroes in the local header, as a streaming writer does. */
  streamed?: boolean;
}

export function buildZip(entries: ZipEntrySpec[], comment = ""): Uint8Array {
  const encoder = new TextEncoder();
  const bytes: number[] = [];
  const push16 = (value: number) => bytes.push(value & 0xff, (value >> 8) & 0xff);
  const push32 = (value: number) =>
    bytes.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff);

  const directory: { entry: ZipEntrySpec; offset: number; stored: Uint8Array; checksum: number }[] = [];

  for (const entry of entries) {
    const raw = entry.deflate ? new Uint8Array(deflateRawSync(entry.data)) : entry.data;
    const checksum = slowCrc32(entry.data);
    const offset = bytes.length;
    const nameBytes = encoder.encode(entry.name);

    push32(0x04034b50);
    push16(20); // version needed
    push16(entry.streamed ? 0x0008 : 0); // flags: bit 3 means the sizes come later
    push16(entry.deflate ? 8 : 0); // method
    push16(0); // time
    push16(0); // date
    push32(checksum);
    // A streaming writer does not know these yet, so it writes zeroes.
    push32(entry.streamed ? 0 : raw.length);
    push32(entry.streamed ? 0 : entry.data.length);
    push16(nameBytes.length);
    push16(0); // extra
    bytes.push(...nameBytes);
    bytes.push(...raw);

    directory.push({ entry, offset, stored: raw, checksum });
  }

  const directoryOffset = bytes.length;
  for (const item of directory) {
    const nameBytes = encoder.encode(item.entry.name);
    push32(0x02014b50);
    push16(20); // version made by
    push16(20); // version needed
    push16(0); // flags
    push16(item.entry.deflate ? 8 : 0);
    push16(0);
    push16(0);
    push32(item.checksum);
    push32(item.stored.length);
    push32(item.entry.data.length);
    push16(nameBytes.length);
    push16(0); // extra
    push16(0); // comment
    push16(0); // disk
    push16(0); // internal attributes
    push32(0); // external attributes
    push32(item.offset);
    bytes.push(...nameBytes);
  }
  const directorySize = bytes.length - directoryOffset;

  push32(0x06054b50);
  push16(0);
  push16(0);
  push16(directory.length);
  push16(directory.length);
  push32(directorySize);
  push32(directoryOffset);
  push16(comment.length);
  bytes.push(...encoder.encode(comment));

  return Uint8Array.from(bytes);
}

/** An `.xmind` is an archive holding one `content.json`. */
export function buildXmind(content: unknown, extra: ZipEntrySpec[] = []): Uint8Array {
  return buildZip([
    { name: "content.json", data: new TextEncoder().encode(JSON.stringify(content)), deflate: true },
    { name: "metadata.json", data: new TextEncoder().encode("{}") },
    ...extra,
  ]);
}
