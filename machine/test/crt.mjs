// SPDX-License-Identifier: MIT
// The cartridge reader's gate, Node alone: what the machine reads is read, and what would trap it or lie to it is
// refused with the machine's code and a sentence: an 8K Normal, a hardware type the build lacks (named), a banked
// cartridge with a packet that is not 8K or a bank beyond the arrays, a file that does not end on a packet, a header
// that is not 64 bytes, a short or unsigned file; and the scan of a cartridge's banks.
import { readCRT, CRT_LIMIT } from '../crt.js';
import { makeCRT, PROBE, probe16K, probeMagicDesk } from './make-crt.mjs';
import { scanCartridge, needsOfCartridge, cartridgeWords } from '../scan.js';

let failures = 0;
const check = (cond, what) => { console.log((cond ? 'PASS ' : 'FAIL ') + what); if (!cond) failures++; };
const refuses = (fn, code) => { try { fn(); return null; } catch (e) { return e.code === code ? e.message : `wrong code ${e.code}: ${e.message}`; } };

const k16 = readCRT(probe16K());
check(k16.typeName === 'Normal' && k16.chips.length === 1 && k16.chips[0].size === 0x4000 && k16.chips[0].load === 0x8000 && k16.size === 0x4000 && k16.title === 'PROBE 16K' && k16.exrom === 0 && k16.game === 0, `a 16K Normal cartridge reads: ${k16.typeName}, ${k16.chips.length} packet, ${k16.size} bytes, "${k16.title}"`);
const md = readCRT(makeCRT({ type: 19, game: 1, name: 'MD 2', chips: [{ bank: 0, load: 0x8000, size: 0x2000, data: PROBE }, { bank: 1, load: 0x8000, size: 0x2000 }] }));
check(md.typeName === 'Magic Desk' && md.chips.length === 2 && md.chips[1].bank === 1 && md.size === 0x4000 && md.game === 1, `a two-bank Magic Desk reads: ${md.chips.length} packets, banks ${md.chips.map((c) => c.bank).join(',')}`);
check(readCRT(probeMagicDesk()).typeName === 'Magic Desk' && readCRT(makeCRT({ type: 0, chips: [{ bank: 0, load: 0x8000, size: 0x1000, data: PROBE }] })).chips[0].size === 0x1000, 'a single-bank Magic Desk and a 4K Normal read');
check(/8K Normal cartridge/.test(refuses(() => readCRT(makeCRT({ type: 0, chips: [{ bank: 0, load: 0x8000, size: 0x2000, data: PROBE }] })), 'CRT_8K_NORMAL') || ''), 'an 8K Normal cartridge is refused CRT_8K_NORMAL, the trap named');
check(/hardware type 32 \(EasyFlash\)/.test(refuses(() => readCRT(makeCRT({ type: 32, chips: [{ bank: 0, load: 0x8000, size: 0x2000 }] })), 'CRT_TYPE_UNSUPPORTED') || ''), 'EasyFlash is refused CRT_TYPE_UNSUPPORTED by name');
check(/hardware type 61;/.test(refuses(() => readCRT(makeCRT({ type: 61, chips: [{ bank: 0, load: 0x8000, size: 0x2000 }] })), 'CRT_TYPE_UNSUPPORTED') || ''), 'an unknown type is refused by number');
check(/Magic Desk packet 0 is 16384 bytes/.test(refuses(() => readCRT(makeCRT({ type: 19, chips: [{ bank: 0, load: 0x8000, size: 0x4000 }] })), 'CRT_BANKS') || ''), 'a Magic Desk with a 16K packet is refused CRT_BANKS');
check(/bank 64; this machine holds banks up to 63/.test(refuses(() => readCRT(makeCRT({ type: 15, chips: [{ bank: 64, load: 0x8000, size: 0x2000 }] })), 'CRT_BANKS') || ''), 'a C64GS bank beyond the arrays is refused CRT_BANKS');
check(/Ocean Type 1 bank 40; this machine holds banks up to 31/.test(refuses(() => readCRT(makeCRT({ type: 5, chips: [{ bank: 0, load: 0x8000, size: 0x2000 }, { bank: 40, load: 0xa000, size: 0x2000 }] })), 'CRT_BANKS') || ''), 'an Ocean bank past the upper 16 is refused unless the cartridge is all 64');
check(/a Normal cartridge of 2 CHIP packets/.test(refuses(() => readCRT(makeCRT({ type: 0, chips: [{ bank: 0, load: 0x8000, size: 0x2000 }, { bank: 0, load: 0xa000, size: 0x2000 }] })), 'CRT_BANKS') || ''), 'a Normal cartridge in two packets is refused CRT_BANKS');
const tail = new Uint8Array(probeMagicDesk().length + 5); tail.set(probeMagicDesk());
check(/runs past the end of the file|does not end on a packet/.test(refuses(() => readCRT(tail), 'CRT_BAD_FILE') || ''), 'trailing bytes after the packets are refused for a banked cartridge');
check(/a header of 80 bytes/.test(refuses(() => readCRT(makeCRT({ headerLength: 0x50, chips: [{ bank: 0, load: 0x8000, size: 0x4000 }] })), 'CRT_BAD_FILE') || ''), 'a header that is not 64 bytes is refused');
check(/no C64 CARTRIDGE signature/.test(refuses(() => readCRT(new Uint8Array(200)), 'CRT_BAD_FILE') || ''), 'an unsigned file is refused');
check(/no CHIP signature at byte 64/.test(refuses(() => readCRT(new Uint8Array([...probe16K().subarray(0, 0x40), ...new Uint8Array(48)])), 'CRT_BAD_FILE') || ''), 'a header without a CHIP packet is refused');
check(/runs past the end/.test(refuses(() => readCRT(probe16K().subarray(0, 0x40 + 0x10 + 100)), 'CRT_BAD_FILE') || ''), 'a truncated packet is refused');
check(CRT_LIMIT === 525376 && /at most 525,376/.test(refuses(() => readCRT(new Uint8Array(CRT_LIMIT + 1)), 'FILE_TOO_LARGE') || ''), 'a file beyond the limit (64 packets of 8K and the header, 525,376 bytes) is refused FILE_TOO_LARGE');
const sc = scanCartridge(k16.chips);
const needs = needsOfCartridge(sc);
check(sc.chips === 1 && sc.kernal.table === 0 && sc.joystick === 0 && sc.sid === 0 && needs.firmware === false && /the machine's own handshake/.test(needs.why), `the probe scans as needing nothing: ${cartridgeWords(sc)}; AUTO: ${needs.why}`);
const calling = new Uint8Array(0x2000); calling.set(PROBE); calling.set([0x20, 0xd2, 0xff, 0x20, 0xe4, 0xff], 0x100);   // JSR CHROUT ; JSR GETIN
const sc2 = scanCartridge(readCRT(makeCRT({ type: 19, chips: [{ bank: 0, load: 0x8000, size: 0x2000, data: calling }] })).chips);
const needs2 = needsOfCartridge(sc2);
check(sc2.kernal.table === 2 && sc2.kernal.names.join() === 'CHROUT,GETIN' && needs2.firmware === true && /calls the KERNAL 2 times \(CHROUT, GETIN\)/.test(needs2.why), `a cartridge that calls the KERNAL needs the firmware: ${needs2.why}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
