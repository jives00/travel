/** Minimal store-only (uncompressed) ZIP writer.
 *
 * The KML export ships several small text files at once, and a zip is the only
 * one-click way to hand them over. Deliberately dependency-free and
 * Uint8Array-based (no Buffer/DOM) so it runs in the API, the browser and
 * React Native alike — the payload is a handful of KB of text, so skipping
 * deflate costs nothing and removes the only part that would need zlib.
 */

export interface ZipEntry {
  name: string;
  /** UTF-8 text; binary members aren't needed here. */
  text: string;
}

// Standard IEEE 802.3 CRC-32, table built once on first use.
let crcTable: Uint32Array | null = null;
function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  crcTable = table;
  return table;
}

export function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * UTF-8 encode, by hand rather than via TextEncoder.
 *
 * TextEncoder is a host global, not part of the ES2022 lib this package
 * compiles against, so `tsc` only found it when a full workspace install
 * happened to hoist @types/node — the filtered install the web Docker image
 * uses doesn't, and the build broke there. Encoding it here keeps the package
 * genuinely platform-free (the same reason it avoids Buffer), which also
 * matters for React Native, where TextEncoder isn't dependable either.
 */
export function utf8Bytes(value: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < value.length; i++) {
    let code = value.charCodeAt(i);
    // Combine a surrogate pair into the single code point it represents;
    // encoding each half separately would emit CESU-8, not UTF-8.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

const utf8 = utf8Bytes;

function u16(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u32(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

export function createZip(entries: ZipEntry[]): Uint8Array {
  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = utf8(entry.name);
    const data = utf8(entry.text);
    const crc = crc32(data);
    // Bit 11 flags UTF-8 file names; time/date are zeroed (no meaningful
    // mtime for a generated file, and unzip tools accept it).
    const header = [
      ...u32(0x04034b50),
      ...u16(20), // version needed
      ...u16(0x0800), // general purpose flags
      ...u16(0), // method 0 = stored
      ...u16(0), // mod time
      ...u16(0), // mod date
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(nameBytes.length),
      ...u16(0), // extra field length
    ];
    local.push(...header, ...nameBytes, ...data);

    central.push(
      ...u32(0x02014b50),
      ...u16(20), // version made by
      ...u16(20), // version needed
      ...u16(0x0800),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(nameBytes.length),
      ...u16(0), // extra
      ...u16(0), // comment
      ...u16(0), // disk number
      ...u16(0), // internal attrs
      ...u32(0), // external attrs
      ...u32(offset),
      ...nameBytes,
    );
    offset += header.length + nameBytes.length + data.length;
  }

  const end = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(central.length),
    ...u32(offset),
    ...u16(0), // comment length
  ];

  return Uint8Array.from([...local, ...central, ...end]);
}
