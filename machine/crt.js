// SPDX-License-Identifier: MIT
// A .crt cartridge image, read as THE MACHINE reads it, for the page's words and
// for a refusal at the door before a machine is started for it. The rules are
// the machine document's (machine/src/core.html, its cartridge section), which
// checks again before the emulator is asked: a 64-byte header; a hardware type
// the 2022 build reads, Normal (0), Ocean Type 1 (5), C64GS (15) or Magic Desk
// (19); a Normal cartridge one CHIP packet of 4K or 16K, an 8K one refused
// because the build's reader traps on it; the banked three as 8K packets at a
// fixed stride, their banks within the machine's arrays. Throws {code}.
export const CRT_TYPES = Object.freeze({ 0: 'Normal', 5: 'Ocean Type 1', 15: 'C64GS', 19: 'Magic Desk' });
export const CRT_NAMES = Object.freeze({ 1: 'Action Replay', 2: 'KCS Power Cartridge', 3: 'Final Cartridge III', 4: "Simons' BASIC", 6: 'Expert Cartridge', 7: 'Fun Play', 8: 'Super Games', 9: 'Atomic Power', 10: 'Epyx Fastload', 11: 'Westermann Learning', 12: 'Rex Utility', 13: 'Final Cartridge I', 14: 'Magic Formel', 16: 'Warp Speed', 17: 'Dinamic', 18: 'Zaxxon', 20: 'Super Snapshot 5', 21: 'Comal-80', 22: 'Structured BASIC', 23: 'Ross', 24: 'Dela EP64', 25: 'Dela EP7x8', 26: 'Dela EP256', 27: 'Rex EP256', 28: 'Mikro Assembler', 29: 'Final Cartridge Plus', 30: 'Action Replay 4', 31: 'Stardos', 32: 'EasyFlash', 33: 'EasyFlash Xbank', 34: 'Capture', 35: 'Action Replay 3', 36: 'Retro Replay', 37: 'MMC64', 38: 'MMC Replay', 39: 'IDE64', 40: 'Super Snapshot 4', 41: 'IEEE-488', 42: 'Game Killer', 43: 'Prophet64', 44: 'EXOS', 45: 'Freeze Frame', 46: 'Freeze Machine', 47: 'Snapshot64', 48: 'Super Explode 5', 49: 'Magic Voice', 50: 'Action Replay 2', 51: 'MACH 5', 52: 'Diashow-Maker', 53: 'Pagefox', 54: 'Kingsoft', 55: 'Silverrock 128K', 56: 'Formel 64', 57: 'RGCD', 58: 'RR-Net MK3', 59: 'EasyCalc', 60: 'GMod2' });
export const CRT_LIMIT = 0x40 + 64 * 0x2010;
export const CRT_MAGIC = 'C64 CARTRIDGE   ';
const fail = (code, text) => Object.assign(new Error(text), { code });
const be32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const be16 = (b, i) => (b[i] << 8) | b[i + 1];
export const isCRT = (head) => head.length >= 16 && String.fromCharCode(...head.subarray(0, 16)) === CRT_MAGIC;

/** {title, type, typeName, exrom, game, chips: [{bank, load, size, data}], size}, or a throw with the machine's code. */
export function readCRT(b) {
  if (b.length > CRT_LIMIT) throw fail('FILE_TOO_LARGE', `${b.length.toLocaleString('en-US')} bytes; a cartridge is at most ${CRT_LIMIT.toLocaleString('en-US')}`);
  if (b.length < 0x50) throw fail('CRT_BAD_FILE', 'too short to be a cartridge image');
  if (!isCRT(b)) throw fail('CRT_BAD_FILE', 'no C64 CARTRIDGE signature');
  if (be32(b, 0x10) !== 0x40) throw fail('CRT_BAD_FILE', `a header of ${be32(b, 0x10)} bytes; this machine reads one of 64`);
  const type = be16(b, 0x16), typeName = CRT_TYPES[type];
  if (!typeName) throw fail('CRT_TYPE_UNSUPPORTED', `hardware type ${type}${CRT_NAMES[type] ? ` (${CRT_NAMES[type]})` : ''}; this machine has Normal, Ocean Type 1, C64GS and Magic Desk`);
  const chips = [];
  let off = 0x40;
  while (off < b.length) {
    if (off + 0x10 > b.length) throw fail('CRT_BAD_FILE', 'a CHIP packet header runs past the end of the file');
    if (String.fromCharCode(...b.subarray(off, off + 4)) !== 'CHIP') throw fail('CRT_BAD_FILE', `no CHIP signature at byte ${off}`);
    const plen = be32(b, off + 4), size = be16(b, off + 0xe), bank = be16(b, off + 0xa), load = be16(b, off + 0xc);
    if (plen < 0x10 + size || off + plen > b.length) throw fail('CRT_BAD_FILE', 'a CHIP packet runs past the end of the file');
    chips.push({ bank, load, size, plen, data: b.subarray(off + 0x10, off + 0x10 + size) });
    off += plen;
  }
  if (!chips.length) throw fail('CRT_BAD_FILE', 'no CHIP packet');
  if (type === 0) {
    if (chips.length !== 1) throw fail('CRT_BANKS', `a Normal cartridge of ${chips.length} CHIP packets; this machine reads one, of 4K or 16K`);
    if (chips[0].size === 0x2000) throw fail('CRT_8K_NORMAL', "an 8K Normal cartridge; this machine's reader allocates its banks the wrong way round for that size and traps (repack it as a 16K image or a single-bank Magic Desk)");
    if (chips[0].size !== 0x1000 && chips[0].size !== 0x4000) throw fail('CRT_BANKS', `a Normal cartridge with a ${chips[0].size}-byte CHIP; this machine reads 4K or 16K`);
  } else {
    const limit = type === 5 ? (chips.length === 64 ? 63 : 31) : 63;
    chips.forEach((c, k) => {
      if (c.size !== 0x2000 || c.plen !== 0x2010) throw fail('CRT_BANKS', `${typeName} packet ${k} is ${c.size} bytes; this machine reads 8K packets for ${typeName}`);
      if (c.bank > limit) throw fail('CRT_BANKS', `${typeName} bank ${c.bank}; this machine holds banks up to ${limit}`);
    });
    if (b.length !== 0x40 + chips.length * 0x2010) throw fail('CRT_BAD_FILE', `the file does not end on a packet; this machine reads ${typeName} packets at a fixed stride`);
  }
  let title = '';
  for (let i = 0x20; i < 0x40 && b[i]; i++) title += String.fromCharCode(b[i]);
  return { title: title.replace(/\s+$/, ''), type, typeName, exrom: b[0x18], game: b[0x19], chips: chips.map(({ bank, load, size, data }) => ({ bank, load, size, data })), size: chips.reduce((n, c) => n + c.size, 0) };
}
