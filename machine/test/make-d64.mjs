// SPDX-License-Identifier: MIT
// A .d64 image made from a name and a list of files, for the gates: the BAM's
// name, id and DOS type at track 18 sector 0, the directory from 18/1, the
// files' sectors on the tracks before 18 in order, each chain ended with the
// count of bytes used. No interleave, no free-block map: enough for a parser
// and a page to read, not for a drive.
import { sectorOffset, sectorsOn } from '../d64.js';

const TYPE_BYTES = { DEL: 0x80, SEQ: 0x81, PRG: 0x82, USR: 0x83, REL: 0x84 };
const pet = (s, n) => { const out = new Uint8Array(n).fill(0xa0); for (let i = 0; i < Math.min(n, s.length); i++) out[i] = s.charCodeAt(i) & 0x7f; return out; };

export function makeD64({ name = 'DISK', id = 'ID', files = [], tracks = 35, errorBytes = false } = {}) {
  const sectors = Array.from({ length: tracks }, (_, i) => sectorsOn(i + 1)).reduce((a, b) => a + b, 0);
  const img = new Uint8Array(sectors * 256 + (errorBytes ? sectors : 0));
  const bam = sectorOffset(18, 0);
  img[bam] = 18; img[bam + 1] = 1; img[bam + 2] = 0x41;
  img.set(pet(name, 16), bam + 0x90);
  img.set(pet(id, 2), bam + 0xa2);
  img[bam + 0xa5] = 0x32; img[bam + 0xa6] = 0x41;   // "2A"
  let t = 1, s = 0;
  const nextFree = () => { const at = [t, s]; s++; if (s >= sectorsOn(t)) { s = 0; t++; if (t === 18) t = 19; } return at; };
  const dir = sectorOffset(18, 1);
  img[dir] = 0; img[dir + 1] = 0xff;
  files.forEach((f, i) => {
    if (i >= 8) throw new Error('make-d64 writes one directory sector: eight files at most');
    const bytes = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes);
    const chunks = [];
    for (let p = 0; p < bytes.length || chunks.length === 0; p += 254) chunks.push(bytes.subarray(p, p + 254));
    const places = chunks.map(() => nextFree());
    chunks.forEach((chunk, k) => {
      const off = sectorOffset(...places[k]);
      if (k + 1 < chunks.length) { img[off] = places[k + 1][0]; img[off + 1] = places[k + 1][1]; } else { img[off] = 0; img[off + 1] = chunk.length + 1; }
      img.set(chunk, off + 2);
    });
    const e = dir + i * 32;
    img[e + 2] = TYPE_BYTES[f.type || 'PRG'] | (f.locked ? 0x40 : 0);
    img[e + 3] = places[0][0]; img[e + 4] = places[0][1];
    img.set(pet(f.name, 16), e + 5);
    img[e + 30] = chunks.length & 0xff; img[e + 31] = chunks.length >> 8;
  });
  return img;
}
