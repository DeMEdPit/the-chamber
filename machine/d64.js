// SPDX-License-Identifier: MIT
// A .d64 disk image, read for its directory and for the bytes of one file. The
// four sizes a .d64 comes in are known by their byte counts (35 or 40 tracks,
// with or without the block of error bytes at the end). The directory is the
// chain of sectors from track 18 sector 1; a file is the chain from its first
// sector, 254 bytes of data a sector, the last sector saying how many of its
// bytes are used. A PRG file's bytes begin with its load address, so what this
// returns is what a .prg file holds. Nothing here touches a machine or a drive:
// the machine has no drive (nopsta's build has nothing behind its serial bus),
// which is why a program is picked from a disk here and run alone.
export const D64_SIZES = Object.freeze({
  174848: { tracks: 35, errorBytes: false },
  175531: { tracks: 35, errorBytes: true },
  196608: { tracks: 40, errorBytes: false },
  197376: { tracks: 40, errorBytes: true },
});
export const TYPES = ['DEL', 'SEQ', 'PRG', 'USR', 'REL'];
const DIR_TRACK = 18;
const fail = (code, text) => Object.assign(new Error(text), { code });

/** Sectors on a track: 21 on 1 to 17, 19 on 18 to 24, 18 on 25 to 30, 17 from 31. */
export const sectorsOn = (track) => (track <= 17 ? 21 : track <= 24 ? 19 : track <= 30 ? 18 : 17);
/** The byte offset of a sector in the image. */
export function sectorOffset(track, sector) {
  let n = 0;
  for (let t = 1; t < track; t++) n += sectorsOn(t);
  return (n + sector) * 256;
}

/** PETSCII to text, as the machine shows it in its first character set: letters upper case, the padding dropped. */
export function petscii(bytes) {
  let out = '';
  for (const b of bytes) {
    if (b === 0xa0 || b === 0x00) continue;
    if ((b >= 0x41 && b <= 0x5a) || (b >= 0xc1 && b <= 0xda)) out += String.fromCharCode((b & 0x1f) + 0x40);
    else if (b >= 0x61 && b <= 0x7a) out += String.fromCharCode(b - 0x20);
    else if (b >= 0x20 && b <= 0x3f) out += String.fromCharCode(b);
    else if (b === 0x5b) out += '[';
    else if (b === 0x5c) out += '£';
    else if (b === 0x5d) out += ']';
    else out += '?';
  }
  return out.replace(/\s+$/, '');
}

/**
 * The disk's shape, name and directory. Returns {tracks, errorBytes, name, id, dos, entries};
 * an entry is {index, name, type, typeName, closed, locked, track, sector, blocks}.
 * Throws {code} D64_BAD_SIZE or D64_BAD_CHAIN.
 */
export function parseD64(bytes) {
  const shape = D64_SIZES[bytes.length];
  if (!shape) throw fail('D64_BAD_SIZE', `${bytes.length.toLocaleString('en-US')} bytes is not a .d64 image (174,848 or 175,531 bytes for 35 tracks, 196,608 or 197,376 for 40)`);
  const check = (t, s, what) => {
    if (t < 1 || t > shape.tracks || s < 0 || s >= sectorsOn(t)) throw fail('D64_BAD_CHAIN', `${what} points to track ${t} sector ${s}, which the image does not have`);
  };
  const bam = sectorOffset(DIR_TRACK, 0);
  const name = petscii(bytes.subarray(bam + 0x90, bam + 0xa0));
  const id = petscii(bytes.subarray(bam + 0xa2, bam + 0xa4));
  const dos = petscii(bytes.subarray(bam + 0xa5, bam + 0xa7));
  const entries = [];
  const seen = new Set();
  let t = DIR_TRACK, s = 1;
  while (t !== 0) {
    check(t, s, 'the directory');
    const key = t * 64 + s;
    if (seen.has(key)) throw fail('D64_BAD_CHAIN', 'the directory chain runs in a loop');
    seen.add(key);
    const off = sectorOffset(t, s);
    for (let i = 0; i < 8; i++) {
      const e = off + i * 32;
      const type = bytes[e + 2];
      if (type === 0) continue;
      const kind = type & 7;
      entries.push({ index: entries.length, name: petscii(bytes.subarray(e + 5, e + 21)), type: kind, typeName: TYPES[kind] || `type ${kind}`,
        closed: !!(type & 0x80), locked: !!(type & 0x40), track: bytes[e + 3], sector: bytes[e + 4], blocks: bytes[e + 30] | (bytes[e + 31] << 8) });
    }
    t = bytes[off]; s = bytes[off + 1];
  }
  return { tracks: shape.tracks, errorBytes: shape.errorBytes, name, id, dos, entries };
}

/** A file's bytes, read along its chain of sectors. Throws D64_BAD_CHAIN, or FILE_TOO_LARGE past the limit. */
export function readFile(bytes, entry, limit = 65538) {
  const shape = D64_SIZES[bytes.length];
  if (!shape) throw fail('D64_BAD_SIZE', 'not a .d64 image');
  const parts = [];
  const seen = new Set();
  let t = entry.track, s = entry.sector, total = 0;
  while (t !== 0) {
    if (t < 1 || t > shape.tracks || s < 0 || s >= sectorsOn(t)) throw fail('D64_BAD_CHAIN', `${entry.name}'s chain points to track ${t} sector ${s}, which the image does not have`);
    const key = t * 64 + s;
    if (seen.has(key)) throw fail('D64_BAD_CHAIN', `${entry.name}'s chain runs in a loop`);
    seen.add(key);
    const off = sectorOffset(t, s);
    const next = bytes[off], nextSector = bytes[off + 1];
    const used = next === 0 ? Math.max(0, nextSector - 1) : 254;   // in the last sector the second byte is the index of the last byte used
    parts.push(bytes.subarray(off + 2, off + 2 + used));
    total += used;
    if (total > limit) throw fail('FILE_TOO_LARGE', `${entry.name} runs past ${limit.toLocaleString('en-US')} bytes; a program is at most 65,536 bytes after its load address`);
    t = next; s = nextSector;
  }
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}
