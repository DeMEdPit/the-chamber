// SPDX-License-Identifier: MIT
// A test server for the machine: the site's files as static files, and a
// stand-in for Ethereum mainnet at /rpc that answers exactly the reads the
// standalone machine document makes, from the site's own copies of the chain
// state (machine/parts/, proven against their manifest by the build):
//   eth_getCode  for nopsta's four 2022 emulator contracts and the three ROM
//                blobs of pressing 1, framed as STOP || bytes;
//   eth_call     for Release.roms(), ROMSet.kernal()/basic()/chargen() and
//                the three *_SHA256() constants.
// Nothing here is a test of the chain; it is a test of the documents against
// bytes already proven equal to the chain's.
//
//   node machine/test/serve.mjs [port]      (default 8260)
//   http://127.0.0.1:<port>/machine/standalone.html?rpc=http://127.0.0.1:<port>/rpc
//   http://127.0.0.1:<port>/machine/test/harness.html

import { createServer, request as httpRequest } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..', '..');
const PARTS = join(ROOT, 'machine', 'parts');
export const MANIFEST = JSON.parse(readFileSync(join(PARTS, 'MANIFEST.json'), 'utf8'));

const word = (hex) => '0x' + hex.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const code = {}, sha = {}, blobOf = {};
let romset = null, root = null;
for (const p of MANIFEST.parts) {
  const bytes = readFileSync(join(PARTS, p.file));
  code[p.chain.address.toLowerCase()] = '0x00' + bytes.toString('hex');
  sha[p.file] = createHash('sha256').update(bytes).digest('hex');
  blobOf[p.file] = p.chain.address.toLowerCase();
  if (p.chain.romset) { romset = p.chain.romset.toLowerCase(); root = p.chain.root.toLowerCase(); }
}
export const ROMSET = romset;
const fw = MANIFEST.firmware;
const CALLS = {
  [root]: { '0x9670b2c4': word(romset) },
  [romset]: {
    '0xc9d4a352': word(blobOf[fw.kernal]), '0x15e8b345': word(blobOf[fw.basic]), '0x57e0538e': word(blobOf[fw.chargen]),
    '0x0aa0f7b1': '0x' + sha[fw.kernal], '0xa4e3a60f': '0x' + sha[fw.basic], '0x4730b6ac': '0x' + sha[fw.chargen],
  },
};

function rpc(req) {
  const { id, method, params } = req;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const err = (message) => ({ jsonrpc: '2.0', id, error: { code: -32000, message } });
  switch (method) {
    case 'eth_chainId': return ok('0x1');
    case 'eth_getCode': return ok(code[String(params[0]).toLowerCase()] || '0x');
    case 'eth_call': {
      const to = String(params[0].to || '').toLowerCase();
      const sel = String(params[0].data || '').slice(0, 10).toLowerCase();
      const t = CALLS[to];
      if (!t || !t[sel]) return err('execution reverted (mock: unknown call ' + to + ' ' + sel + ')');
      return ok(t[sel]);
    }
    default: return err('mock: method not served: ' + method);
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.bin': 'application/octet-stream', '.rom': 'application/octet-stream', '.prg': 'application/octet-stream',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

/**
 * start(port, { catalogue, rpcUpstream }): with `catalogue`, that file is served at
 * /machine/catalogue.json instead of the committed one; with `rpcUpstream`, /rpc is
 * forwarded to that URL (a stand-in node built by machine/test/synthetic.py). Both are
 * for the page's gate; without them this is the stand-in mainnet built from the copies.
 */
export function start(port = 8260, opts = {}) {
  const server = createServer((q, r) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };
    if (q.method === 'OPTIONS') { r.writeHead(204, cors); r.end(); return; }
    const url = new URL(q.url, 'http://x');
    if (url.pathname === '/rpc' && opts.rpcUpstream) {
      let body = '';
      q.on('data', (c) => (body += c));
      q.on('end', () => {
        const up = new URL(opts.rpcUpstream);
        const req = httpRequest({ hostname: up.hostname, port: up.port, path: up.pathname, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => {
          let out = '';
          res.on('data', (c) => (out += c));
          res.on('end', () => { r.writeHead(200, { 'content-type': 'application/json', ...cors }); r.end(out); });
        });
        req.on('error', (e) => { r.writeHead(502, cors); r.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'upstream: ' + e.message } })); });
        req.end(body);
      });
      return;
    }
    if (url.pathname === '/machine/catalogue.json' && opts.catalogue) {
      r.writeHead(200, { 'content-type': 'application/json', ...cors });
      r.end(readFileSync(opts.catalogue));
      return;
    }
    if (url.pathname === '/rpc') {
      let body = '';
      q.on('data', (c) => (body += c));
      q.on('end', () => {
        let out;
        try { const j = JSON.parse(body); out = Array.isArray(j) ? j.map(rpc) : rpc(j); }
        catch (e) { out = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }; }
        r.writeHead(200, { 'content-type': 'application/json', ...cors });
        r.end(JSON.stringify(out));
      });
      return;
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, p);
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { r.writeHead(404); r.end('not found'); return; }
    r.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', ...cors });
    r.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.argv[2] || 8260);
  await start(port);
  console.log(`mock mainnet at http://127.0.0.1:${port}/rpc`);
  console.log(`standalone:  http://127.0.0.1:${port}/machine/standalone.html?rpc=${encodeURIComponent('http://127.0.0.1:' + port + '/rpc')}`);
  console.log(`harness:     http://127.0.0.1:${port}/machine/test/harness.html`);
}
