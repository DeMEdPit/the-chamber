// SPDX-License-Identifier: MIT
// The disk image reader's gate, Node alone: the four sizes, the sector arithmetic, the BAM's words, the directory in
// order with its types and block counts, a file's bytes back exactly along a chain of one sector and of three, the
// empty image, and the refusals (a wrong size, a directory that loops, a file chain off the disk).
import { parseD64, readFile, sectorOffset, sectorsOn, petscii, D64_SIZES } from '../d64.js';
import { makeD64 } from './make-d64.mjs';

let failures = 0;
const check = (cond, what) => { console.log((cond ? 'PASS ' : 'FAIL ') + what); if (!cond) failures++; };
const refuses = (fn, code) => { try { fn(); return null; } catch (e) { return e.code === code ? e.message : `wrong code ${e.code}: ${e.message}`; } };

check(sectorOffset(1, 0) === 0 && sectorOffset(18, 0) === 357 * 256 && sectorOffset(18, 1) === 358 * 256 && sectorOffset(36, 0) === 683 * 256, 'the sector arithmetic: track 18 begins at sector 357, track 36 at 683');
check(sectorsOn(17) === 21 && sectorsOn(18) === 19 && sectorsOn(25) === 18 && sectorsOn(31) === 17 && sectorsOn(40) === 17, 'the sectors on a track: 21, 19, 18, 17');
check(petscii(new Uint8Array([0x48, 0x45, 0x4c, 0x4c, 0x4f, 0xa0, 0xa0])) === 'HELLO' && petscii(new Uint8Array([0xc1, 0x31, 0x20, 0x2d, 0x5b])) === 'A1 -[', 'PETSCII names read as the machine shows them, the padding dropped');

const small = new Uint8Array([0x01, 0x08, 0x0b, 0x08, 0x0a, 0x00, 0x9e, 0x32, 0x30, 0x36, 0x31, 0x00, 0x00, 0x00, 0xa9, 0x04, 0x8d, 0x00, 0x04, 0x60]);
const long = new Uint8Array(602); long[0] = 0x00; long[1] = 0x20; long.fill(0xea, 2);
const disk = makeD64({ name: 'CHAMBER TEST', id: 'C6', files: [{ name: 'HELLO', type: 'PRG', bytes: small }, { name: 'NOTES', type: 'SEQ', bytes: new Uint8Array([0x48, 0x49]) }, { name: 'LONG', type: 'PRG', bytes: long, locked: true }] });
check(disk.length === 174848 && D64_SIZES[disk.length].tracks === 35, 'the maker makes a 35-track image of 174,848 bytes');
const d = parseD64(disk);
check(d.name === 'CHAMBER TEST' && d.id === 'C6' && d.dos === '2A' && d.tracks === 35 && d.errorBytes === false, `the BAM's words: "${d.name}" ${d.id} ${d.dos}`);
check(d.entries.length === 3 && d.entries.map((e) => `${e.name}:${e.typeName}:${e.blocks}:${e.locked ? 'L' : '-'}`).join() === 'HELLO:PRG:1:-,NOTES:SEQ:1:-,LONG:PRG:3:L', `the directory in order with types and blocks (${d.entries.map((e) => e.name + ' ' + e.typeName + ' ' + e.blocks).join(', ')})`);
check(d.entries[0].track === 1 && d.entries[0].sector === 0 && d.entries[2].track === 1 && d.entries[2].sector === 2, 'the entries point at their first sectors');
const back = readFile(disk, d.entries[0]);
check(back.length === 20 && back.every((b, i) => b === small[i]), 'a one-sector file comes back byte for byte, its load address first');
const backLong = readFile(disk, d.entries[2]);
check(backLong.length === 602 && backLong[0] === 0 && backLong[1] === 0x20 && backLong.every((b, i) => b === long[i]), 'a three-sector file comes back byte for byte along its chain, the last sector cut at its used count');
const empty = parseD64(new Uint8Array(174848));
check(empty.entries.length === 0 && empty.name === '' && empty.id === '', 'an all-zero image has an empty directory and no name');
const withErrors = makeD64({ name: 'E', files: [{ name: 'X', bytes: small }], errorBytes: true });
const forty = makeD64({ name: 'F', files: [{ name: 'X', bytes: small }], tracks: 40, errorBytes: true });
check(withErrors.length === 175531 && parseD64(withErrors).entries[0].name === 'X' && forty.length === 197376 && parseD64(forty).tracks === 40 && readFile(forty, parseD64(forty).entries[0]).length === 20, 'the sizes with error bytes and the 40-track shape read the same');
check(/not a \.d64 image/.test(refuses(() => parseD64(new Uint8Array(1000)), 'D64_BAD_SIZE') || ''), 'a wrong size is refused D64_BAD_SIZE');
const loop = disk.slice(); loop[sectorOffset(18, 1)] = 18; loop[sectorOffset(18, 1) + 1] = 1;
check(/runs in a loop/.test(refuses(() => parseD64(loop), 'D64_BAD_CHAIN') || ''), 'a directory that loops is refused D64_BAD_CHAIN');
const off = disk.slice(); off[sectorOffset(1, 0)] = 99;
check(/track 99/.test(refuses(() => readFile(off, d.entries[0]), 'D64_BAD_CHAIN') || ''), 'a file chain off the disk is refused D64_BAD_CHAIN');
const fileLoop = disk.slice(); fileLoop[sectorOffset(1, 2)] = 1; fileLoop[sectorOffset(1, 2) + 1] = 2;
check(/runs in a loop/.test(refuses(() => readFile(fileLoop, d.entries[2]), 'D64_BAD_CHAIN') || ''), 'a file chain that loops is refused D64_BAD_CHAIN');
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
