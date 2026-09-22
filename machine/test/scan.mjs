// The scan's gate: synthetic programs whose facts are known, run in Node alone.
import { scanProgram, needsOf, inputOf, scanWords } from '../scan.js';

let failures = 0;
const check = (cond, what) => { console.log((cond ? 'PASS ' : 'FAIL ') + what); if (!cond) failures++; };
const STUB = [0x01, 0x08, 0x0b, 0x08, 0x0a, 0x00, 0x9e, 0x32, 0x30, 0x36, 0x31, 0x00, 0x00, 0x00];   // 10 SYS2061
const prg = (...code) => new Uint8Array([...STUB, ...code]);

// the rig's own program: a stub, a store to the screen, no ROM: bare, the stick
let s = scanProgram(prg(0xa9, 0x01, 0x8d, 0x00, 0x04, 0x60)), n = needsOf(s), i = inputOf(s, n.firmware);
check(s.load === 0x0801 && s.entry === 2061 && s.kernal.calls === 0 && s.basicProgram === 0 && !n.firmware && n.why === 'no call into a ROM' && i.input === 'joystick', `a stub and a store: bare, the stick (${n.why}; ${i.why})`);
// CHROUT twice: the firmware, the keyboard, the routine named
s = scanProgram(prg(0xa9, 0x93, 0x20, 0xd2, 0xff, 0xa9, 0x43, 0x20, 0xd2, 0xff, 0x60)); n = needsOf(s); i = inputOf(s, n.firmware);
check(s.kernal.calls === 2 && s.kernal.table === 2 && s.kernal.names.join() === 'CHROUT' && n.firmware && n.why === 'calls the KERNAL 2 times (CHROUT)' && i.input === 'keyboard', `two calls to CHROUT: the firmware, the keyboard (${n.why})`);
// a call into the KERNAL's internals is counted and named as such
s = scanProgram(prg(0x20, 0x44, 0xe5, 0x60)); n = needsOf(s);
check(s.kernal.calls === 1 && s.kernal.internal === 1 && s.kernal.names.length === 0 && /1 of them into its internals, which OpenROMs need not match/.test(n.why), `a call to $E544: an internal, said (${n.why})`);
// a BASIC program: 10 PRINT "HI"
s = scanProgram(new Uint8Array([0x01, 0x08, 0x0c, 0x08, 0x0a, 0x00, 0x99, 0x20, 0x22, 0x48, 0x49, 0x22, 0x00, 0x00, 0x00])); n = needsOf(s); i = inputOf(s, n.firmware);
check(s.basicProgram === 1 && s.entry === null && n.firmware && n.why === 'a BASIC program of 1 line' && i.input === 'keyboard', `a BASIC program: the firmware, the keyboard (${n.why})`);
// a program at $C000 with no stub: a bare machine starts nothing, so the firmware and READY
s = scanProgram(new Uint8Array([0x00, 0xc0, 0xa9, 0x01, 0x8d, 0x00, 0x04, 0x60])); n = needsOf(s);
check(s.load === 0xc000 && s.entry === null && n.firmware && /loads at \$c000 with no BASIC stub, so READY is needed to start it/.test(n.why), `no stub at $C000: the firmware (${n.why})`);
// a stub whose SYS is beyond the thirty bytes the emulator reads: READY must RUN it
s = scanProgram(new Uint8Array([0x01, 0x08, 0x25, 0x08, 0x0a, 0x00, 0x8f, ...new Array(30).fill(0x41), 0x00, 0x00, 0x00])); n = needsOf(s);
check(s.entry === null && s.basicProgram === 1 && n.firmware, `a long first line: ${n.why}`);
// the stick: a read of port 2 wins even when the KERNAL is called
s = scanProgram(prg(0xad, 0x00, 0xdc, 0x20, 0xd2, 0xff, 0x60)); n = needsOf(s); i = inputOf(s, n.firmware);
check(s.joystick === 1 && i.input === 'joystick' && i.why === 'the file reads port 2', 'a read of $DC00: the stick');
// the keyboard: a read of the matrix
s = scanProgram(prg(0xad, 0x01, 0xdc, 0x60)); n = needsOf(s); i = inputOf(s, n.firmware);
check(s.keyboard === 1 && !n.firmware && i.input === 'keyboard', 'a read of $DC01: the keyboard, bare');
// GETIN asks the KERNAL for keys
s = scanProgram(prg(0x20, 0xe4, 0xff, 0x60)); n = needsOf(s); i = inputOf(s, n.firmware);
check(s.kernal.names.join() === 'GETIN' && i.input === 'keyboard' && i.why === 'the file asks the KERNAL for keys', 'GETIN: the keyboard');
// the SID, the banking register, the vectors
s = scanProgram(prg(0x8d, 0x04, 0xd4, 0x9d, 0x18, 0xd4, 0x8d, 0x40, 0xd4, 0xa5, 0x01, 0x29, 0xf8, 0x09, 0x05, 0x85, 0x01, 0x8d, 0xfe, 0xff, 0x60)); n = needsOf(s);
check(s.sid === 2 && s.banks === 1 && s.vectors.raw === 1 && !n.firmware && n.why === 'no call into the KERNAL\'s jump table, banks the ROMs out itself, sets the raw interrupt vectors', `the SID twice (a mirror not counted), $01 written, a raw vector: bare by the demo rule (${n.why})`);
s = scanProgram(prg(0x8d, 0x14, 0x03, 0x60)); n = needsOf(s);
check(s.vectors.kernal === 1 && n.firmware && n.why === 'hooks the KERNAL\'s interrupt vectors', 'a write to $0314: the firmware');
// a program living under the KERNAL: calls into that window are its own code, not counted
s = scanProgram(new Uint8Array([0x00, 0xe0, 0x20, 0x10, 0xe0, 0x60]));
check(s.kernal.calls === 0 && s.end === 0xe003, 'a program at $E000 calling $E010: its own code, not a KERNAL call');
// the BASIC ROM window likewise
s = scanProgram(new Uint8Array([0x00, 0xa0, 0x20, 0x10, 0xa0, 0x60]));
check(s.basic.calls === 0, 'a program at $A000 calling $A010: its own code');
s = scanProgram(prg(0x20, 0x10, 0xa0, 0x60)); n = needsOf(s);
check(s.basic.calls === 1 && n.firmware && n.why === 'calls the BASIC ROM 1 time', 'a call to $A010 from $0801: the BASIC ROM');
// the words
s = scanProgram(prg(0xad, 0x00, 0xdc, 0x8d, 0x04, 0xd4, 0x60));
check(scanWords(s) === 'loads at $0801 to $0813 · SYS 2061 in its stub · no call into the KERNAL · reads port 2 · writes the SID', `the words: ${scanWords(s)}`);
// the shape of a false positive, said in the module's own words: an operand byte that reads as JSR followed by a ROM address
s = scanProgram(prg(0x8d, 0x20, 0xd4, 0xa5, 0x01, 0x60)); n = needsOf(s);
check(s.basic.calls === 1 && n.firmware, `a write to $D420 followed by LDA $01 reads as JSR $A5D4: a candidate, counted, as the scanner warns (${n.why})`);

// a demo: banks the ROMs out, raw vectors, a stub, no jump-table call, and data that reads as calls into ROM internals: bare, said so
s = scanProgram(prg(0xa5, 0x01, 0x29, 0xf8, 0x09, 0x05, 0x85, 0x01, 0x8d, 0xfe, 0xff, 0x20, 0x44, 0xe5, 0x20, 0x10, 0xa0, 0x8d, 0x04, 0xd4, 0x60)); n = needsOf(s);
check(s.kernal.internal === 1 && s.basic.calls === 1 && !n.firmware && n.why === 'no call into the KERNAL\'s jump table, banks the ROMs out itself, sets the raw interrupt vectors, its 2 candidate calls into ROM internals read as data', `a demo's shape: bare (${n.why})`);
// the same without the banking: the candidates count, and the firmware comes
s = scanProgram(prg(0x8d, 0xfe, 0xff, 0x20, 0x44, 0xe5, 0x60)); n = needsOf(s);
check(n.firmware && /internals/.test(n.why), `without the banking the candidate counts (${n.why})`);

console.log(failures ? `${failures} FAILED` : 'all checks passed');
process.exit(failures ? 1 : 0);
