// SPDX-License-Identifier: MIT
// A .crt image made from a hardware type and a list of CHIP packets, for the
// gates, and a 46-byte cartridge program of our own that proves a boot: CBM80
// at $8004, a black screen, C, R and T written to the screen memory, then a
// loop that counts at $02 and turns the border, so a machine can be seen to
// have started it and to be alive after.
export const PROBE = new Uint8Array([
  0x09, 0x80, 0x09, 0x80,                         // cold and warm start vectors -> $8009
  0xc3, 0xc2, 0xcd, 0x38, 0x30,                   // "CBM80"
  0x78, 0xa9, 0x00, 0x8d, 0x20, 0xd0, 0x8d, 0x21, 0xd0,   // sei ; lda #0 ; sta $d020 ; sta $d021
  0xa9, 0x03, 0x8d, 0x00, 0x04, 0xa9, 0x12, 0x8d, 0x01, 0x04, 0xa9, 0x14, 0x8d, 0x02, 0x04,   // C R T to $0400..$0402
  0xe6, 0x02, 0xee, 0x20, 0xd0, 0xa0, 0x00, 0x88, 0xd0, 0xfd, 0x4c, 0x21, 0x80,   // $8021: inc $02 ; inc $d020 ; ldy #0 ; dey ; bne ; jmp $8021
]);
const ascii = (s) => Array.from(s, (c) => c.charCodeAt(0));
export function makeCRT({ type = 0, exrom = 0, game = 0, name = 'TEST', headerLength = 0x40, chips = [] } = {}) {
  const parts = [];
  const h = new Uint8Array(0x40);
  h.set(ascii('C64 CARTRIDGE   '), 0);
  h[0x10] = headerLength >>> 24; h[0x11] = (headerLength >>> 16) & 0xff; h[0x12] = (headerLength >>> 8) & 0xff; h[0x13] = headerLength & 0xff;
  h[0x14] = 1; h[0x16] = type >> 8; h[0x17] = type & 0xff; h[0x18] = exrom; h[0x19] = game;
  h.set(ascii(name.slice(0, 31)), 0x20);
  parts.push(h);
  for (const c of chips) {
    const size = c.size || c.data.length, plen = c.plen === undefined ? 0x10 + size : c.plen;
    const p = new Uint8Array(0x10 + size).fill(0xff);
    p.set(ascii('CHIP'), 0);
    p[4] = plen >>> 24; p[5] = (plen >>> 16) & 0xff; p[6] = (plen >>> 8) & 0xff; p[7] = plen & 0xff;
    p[0xa] = (c.bank || 0) >> 8; p[0xb] = (c.bank || 0) & 0xff;
    p[0xc] = c.load >> 8; p[0xd] = c.load & 0xff;
    p[0xe] = size >> 8; p[0xf] = size & 0xff;
    if (c.data) p.set(c.data.subarray(0, size), 0x10);
    parts.push(p);
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
/** A 16K Normal cartridge carrying the probe: the plain path the machine reads. */
export const probe16K = (name = 'PROBE 16K') => makeCRT({ type: 0, name, chips: [{ bank: 0, load: 0x8000, size: 0x4000, data: PROBE }] });
/** A single-bank Magic Desk cartridge carrying the probe: the safe way to ship 8K. */
export const probeMagicDesk = (name = 'PROBE MAGIC DESK') => makeCRT({ type: 19, game: 1, name, chips: [{ bank: 0, load: 0x8000, size: 0x2000, data: PROBE }] });
