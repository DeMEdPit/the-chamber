// SPDX-License-Identifier: MIT
// The scan: what a program file needs, read from its bytes, so the firmware
// switch can decide for it (AUTO) and the page can say what it saw. Byte
// patterns only, the way the scan that settled notebook F-025 reads them: a
// CLEAN result is sound, because no direct call into a ROM exists in the
// bytes; a DIRTY result is a list of candidates, because a C64 program
// interleaves code and data and a sprite can hold any three bytes. Indirect
// jumps, self-modifying code and computed addresses are invisible here. The
// page says so, and the switch stays the visitor's.

/** The KERNAL jump table, $FF81 to $FFF3: the routines a program may call by name. */
export const KERNAL_NAMES = {
  0x81: 'CINT', 0x84: 'IOINIT', 0x87: 'RAMTAS', 0x8A: 'RESTOR', 0x8D: 'VECTOR', 0x90: 'SETMSG', 0x93: 'SECOND', 0x96: 'TKSA',
  0x99: 'MEMTOP', 0x9C: 'MEMBOT', 0x9F: 'SCNKEY', 0xA2: 'SETTMO', 0xA5: 'ACPTR', 0xA8: 'CIOUT', 0xAB: 'UNTLK', 0xAE: 'UNLSN',
  0xB1: 'LISTEN', 0xB4: 'TALK', 0xB7: 'READST', 0xBA: 'SETLFS', 0xBD: 'SETNAM', 0xC0: 'OPEN', 0xC3: 'CLOSE', 0xC6: 'CHKIN',
  0xC9: 'CHKOUT', 0xCC: 'CLRCHN', 0xCF: 'CHRIN', 0xD2: 'CHROUT', 0xD5: 'LOAD', 0xD8: 'SAVE', 0xDB: 'SETTIM', 0xDE: 'RDTIM',
  0xE1: 'STOP', 0xE4: 'GETIN', 0xE7: 'CLALL', 0xEA: 'UDTIM', 0xED: 'SCREEN', 0xF0: 'PLOT', 0xF3: 'IOBASE',
};
const JSR = 0x20, JMP = 0x4C, JMPI = 0x6C;
const READS = new Set([0xAD, 0xAE, 0xAC, 0x2C, 0xCD, 0x2D, 0x4D, 0x0D]);   // LDA LDX LDY BIT CMP AND EOR ORA, absolute
const WRITES = new Set([0x8D, 0x8E, 0x8C, 0x9D, 0x99]);                   // STA STX STY absolute, STA absolute indexed
const KEYS = ['GETIN', 'CHRIN', 'SCNKEY', 'STOP'];                        // the routines a program calls to read the keyboard

export const hex4 = (n) => '$' + n.toString(16).padStart(4, '0');
const times = (n) => `${n} time${n === 1 ? '' : 's'}`;

/** The BASIC lines from $0801, walked by their links: how many, whether a SYS token appears, where the chain ends; null when the bytes are not a line chain. */
function basicLines(b, load) {
  if (load !== 0x0801) return null;
  let i = 0, lines = 0, sys = false;
  while (i + 2 <= b.length) {
    const link = b[i] | (b[i + 1] << 8);
    if (link === 0) return { lines, sys, end: i + 2 };
    if (i + 4 > b.length) return null;
    const next = link - load;
    if (next <= i + 4 || next > b.length || b[next - 1] !== 0) return null;
    for (let j = i + 4; j < next - 1; j++) if (b[j] === 0x9E) sys = true;
    lines++; i = next;
  }
  return null;
}

/** The SYS address in a BASIC stub, read exactly as the emulator's inject-and-run reads it (the first thirty bytes of the file, digits after the token); null when there is none, in which case a bare machine starts nothing. */
function stubEntry(file) {
  let sysAt = 0, start = 0;
  for (let i = 4; i < 30 && i < file.length; i++) {
    if (file[i] === 0x9E) sysAt = i;
    else if (sysAt !== 0 && file[i] !== 0x20) {
      if (file[i] === 0) break;
      if (file[i] >= 0x30 && file[i] <= 0x39) start = start * 10 + (file[i] - 0x30);
    }
  }
  return start || null;
}

/** The facts about a .prg: its range, its stub, whether it is a BASIC program, its calls into the ROMs, its interrupt vectors, whether it banks the ROMs out, what it reads and whether it writes the SID. */
export function scanProgram(file) {
  const load = file[0] | (file[1] << 8), b = file.subarray(2), end = load + b.length - 1;
  const lives = (lo, hi) => load <= hi && end >= lo;   // the program occupies part of that window, so a call into it is its own code
  const kernal = { calls: 0, table: 0, internal: 0, names: [] }, basic = { calls: 0 };
  const names = new Set();
  let joystick = 0, keyboard = 0, sid = 0, banks = 0, vecKernal = 0, vecRaw = 0;
  for (let i = 0; i + 2 < b.length; i++) {
    const op = b[i], lo = b[i + 1], hi = b[i + 2];
    if (op === JSR || op === JMP || op === JMPI) {
      if (hi >= 0xE0 && !lives(0xE000, 0xFFFF)) {
        kernal.calls++;
        if (hi === 0xFF && KERNAL_NAMES[lo]) { kernal.table++; names.add(KERNAL_NAMES[lo]); } else kernal.internal++;
      } else if (hi >= 0xA0 && hi <= 0xBF && !lives(0xA000, 0xBFFF)) basic.calls++;
    }
    if (hi === 0xDC && lo === 0x00 && READS.has(op)) joystick++;
    if (hi === 0xDC && lo === 0x01 && READS.has(op)) keyboard++;
    if (hi === 0xD4 && lo <= 0x1C && WRITES.has(op)) sid++;
    if (op === 0x8D && hi === 0x03 && lo >= 0x14 && lo <= 0x19) vecKernal++;
    if (op === 0x8D && hi === 0xFF && lo >= 0xFA) vecRaw++;
  }
  for (let i = 0; i + 1 < b.length; i++) if (b[i + 1] === 0x01 && (b[i] === 0x85 || b[i] === 0x86 || b[i] === 0x84)) banks++;
  kernal.names = [...names];
  const lines = basicLines(b, load);
  const basicProgram = lines && lines.lines > 0 && !lines.sys && lines.end >= b.length - 2 ? lines.lines : 0;
  return { load, end, bytes: b.length, entry: stubEntry(file), basicProgram, kernal, basic, joystick, keyboard, sid, banks, vectors: { kernal: vecKernal, raw: vecRaw } };
}

/** Whether the file needs the firmware, and why, in words. A program needs it when it is BASIC, calls into a ROM, hooks the KERNAL's interrupt vectors, or has no stub a bare machine can start it by. */
export function needsOf(scan) {
  const reasons = [];
  let firmware = false;
  // a program that banks the ROMs out itself and sets the raw interrupt vectors, with a stub to start it and no call
  // into the KERNAL's jump table, drives the chips itself; candidate calls into ROM internals in such a program are
  // read as data, which is what a demo's graphics and music are
  const bareMetal = scan.banks > 0 && scan.vectors.raw > 0 && scan.vectors.kernal === 0 && scan.kernal.table === 0 && !scan.basicProgram && !!scan.entry;
  if (bareMetal) {
    reasons.push('no call into the KERNAL\'s jump table', 'banks the ROMs out itself', 'sets the raw interrupt vectors');
    const data = scan.kernal.internal + scan.basic.calls;
    if (data) reasons.push(`its ${data} candidate call${data === 1 ? '' : 's'} into ROM internals read as data`);
    return { firmware: false, why: reasons.join(', ') };
  }
  if (scan.basicProgram) { firmware = true; reasons.push(`a BASIC program of ${scan.basicProgram} line${scan.basicProgram === 1 ? '' : 's'}`); }
  if (scan.kernal.calls) {
    firmware = true;
    reasons.push(`calls the KERNAL ${times(scan.kernal.calls)}${scan.kernal.names.length ? ' (' + scan.kernal.names.join(', ') + ')' : ''}${scan.kernal.internal ? `, ${scan.kernal.internal} of them into its internals, which OpenROMs need not match` : ''}`);
  }
  if (scan.basic.calls) { firmware = true; reasons.push(`calls the BASIC ROM ${times(scan.basic.calls)}`); }
  if (scan.vectors.kernal) { firmware = true; reasons.push('hooks the KERNAL\'s interrupt vectors'); }
  if (!scan.basicProgram && !scan.entry) {
    firmware = true;
    reasons.push(scan.load === 0x0801 ? 'no SYS in its BASIC stub, so READY must RUN it' : `loads at ${hex4(scan.load)} with no BASIC stub, so READY is needed to start it`);
  }
  if (!firmware) {
    reasons.push('no call into a ROM');
    if (scan.banks) reasons.push('banks the ROMs out itself');
    if (scan.vectors.raw) reasons.push('sets the raw interrupt vectors');
  }
  return { firmware, why: reasons.join(', ') };
}

/** Which input the file reads: the stick when it reads port 2, the keyboard when it reads the matrix or asks the KERNAL for keys or sits at READY, the stick otherwise, as the programs of the series do. */
export function inputOf(scan, firmware) {
  if (scan.joystick) return { input: 'joystick', why: 'the file reads port 2' };
  if (scan.keyboard) return { input: 'keyboard', why: 'the file reads the keyboard matrix' };
  if (scan.kernal.names.some((n) => KEYS.includes(n))) return { input: 'keyboard', why: 'the file asks the KERNAL for keys' };
  if (firmware) return { input: 'keyboard', why: 'READY wants typing' };
  return { input: 'joystick', why: 'nothing reads port 2 or the matrix; the stick, as for the series' };
}

/** The scan as one line for NOW PLAYING. */
/** Whether a program asks the KERNAL to load more (SETLFS, SETNAM and LOAD, or OPEN after SETLFS): a multi-load program, which
 *  stops where it asks the drive on a machine that has none. Byte patterns, like the rest of the scan. */
export function loadsMore(scan) {
  const n = scan.kernal.names;
  return n.includes('LOAD') || (n.includes('SETLFS') && (n.includes('OPEN') || n.includes('CHKIN')));
}
export function scanWords(scan) {
  const parts = [`loads at ${hex4(scan.load)} to ${hex4(scan.end)}`];
  if (scan.entry) parts.push(`SYS ${scan.entry} in its stub`);
  if (scan.basicProgram) parts.push(`a BASIC program of ${scan.basicProgram} line${scan.basicProgram === 1 ? '' : 's'}`);
  parts.push(scan.kernal.calls ? `calls the KERNAL ${times(scan.kernal.calls)}${scan.kernal.names.length ? ' (' + scan.kernal.names.join(', ') + ')' : ''}` : 'no call into the KERNAL');
  if (scan.kernal.internal) parts.push(`${scan.kernal.internal} into its internals`);
  if (scan.basic.calls) parts.push(`calls the BASIC ROM ${times(scan.basic.calls)}`);
  if (scan.vectors.kernal) parts.push('hooks the KERNAL\'s interrupt vectors');
  if (scan.vectors.raw) parts.push('sets the raw interrupt vectors');
  if (scan.banks) parts.push('banks the ROMs out itself');
  parts.push(scan.joystick ? 'reads port 2' : scan.keyboard ? 'reads the keyboard matrix' : 'reads neither port 2 nor the matrix');
  parts.push(scan.sid ? 'writes the SID' : 'no write to the SID');
  return parts.join(' · ');
}
