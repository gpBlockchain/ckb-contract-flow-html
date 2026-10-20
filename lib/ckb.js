// Zero-dependency CKB helpers: blake2b (ckb-default-hash), molecule parsing, script hash, RPC, tx analysis.
// Works in browser (window.CKB) and Node (module.exports).
(function (root) {
'use strict';
// ---------- hex ----------
const hexToBytes = h => { h = h.replace(/^0x/, ''); if (h.length % 2) throw new Error('odd hex'); const b = new Uint8Array(h.length / 2); for (let i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16); return b; };
const bytesToHex = b => '0x' + Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const concat = (...a) => { const n = a.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const u32le = n => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
const readU32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const leToBig = b => { let x = 0n; for (let i = b.length - 1; i >= 0; i--) x = (x << 8n) | BigInt(b[i]); return x; };

// ---------- blake2b (RFC 7693, BigInt) ----------
const M64 = (1n << 64n) - 1n;
const IV = ['6a09e667f3bcc908', 'bb67ae8584caa73b', '3c6ef372fe94f82b', 'a54ff53a5f1d36f1', '510e527fade682d1', '9b05688c2b3e6c1f', '1f83d9abfb41bd6b', '5be0cd19137e2179'].map(h => BigInt('0x' + h));
const SIGMA = [[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],[14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3],[11,8,12,0,5,2,15,13,10,14,3,6,7,1,9,4],[7,9,3,1,13,12,11,14,2,6,5,10,4,0,15,8],[9,0,5,7,2,4,10,15,14,1,11,12,6,8,3,13],[2,12,6,10,0,11,8,3,4,13,7,5,15,14,1,9],[12,5,1,15,14,13,4,10,0,7,6,3,9,2,8,11],[13,11,7,14,12,1,3,9,5,0,15,4,8,6,2,10],[6,15,14,9,11,3,0,8,12,2,13,7,1,4,10,5],[10,2,8,4,7,6,1,5,15,11,9,14,3,12,13,0]];
const rotr = (x, n) => ((x >> BigInt(n)) | (x << BigInt(64 - n))) & M64;
function compress(h, block, t, last) {
  const m = []; for (let i = 0; i < 16; i++) m.push(leToBig(block.subarray(i * 8, i * 8 + 8)));
  const v = h.concat(IV); v[12] ^= t & M64; v[13] ^= t >> 64n; if (last) v[14] ^= M64;
  const G = (a, b, c, d, x, y) => { v[a] = (v[a] + v[b] + x) & M64; v[d] = rotr(v[d] ^ v[a], 32); v[c] = (v[c] + v[d]) & M64; v[b] = rotr(v[b] ^ v[c], 24); v[a] = (v[a] + v[b] + y) & M64; v[d] = rotr(v[d] ^ v[a], 16); v[c] = (v[c] + v[d]) & M64; v[b] = rotr(v[b] ^ v[c], 63); };
  for (let r = 0; r < 12; r++) { const s = SIGMA[r % 10]; G(0,4,8,12,m[s[0]],m[s[1]]); G(1,5,9,13,m[s[2]],m[s[3]]); G(2,6,10,14,m[s[4]],m[s[5]]); G(3,7,11,15,m[s[6]],m[s[7]]); G(0,5,10,15,m[s[8]],m[s[9]]); G(1,6,11,12,m[s[10]],m[s[11]]); G(2,7,8,13,m[s[12]],m[s[13]]); G(3,4,9,14,m[s[14]],m[s[15]]); }
  for (let i = 0; i < 8; i++) h[i] ^= v[i] ^ v[i + 8];
}
function blake2b(data, outLen = 32, personal = 'ckb-default-hash') {
  const p = new Uint8Array(64); p[0] = outLen; p[1] = 0; p[2] = 1; p[3] = 1;
  if (personal) { const pb = typeof personal === 'string' ? new TextEncoder().encode(personal) : personal; p.set(pb.subarray(0, 16), 48); }
  const h = IV.map((x, i) => x ^ leToBig(p.subarray(i * 8, i * 8 + 8)));
  let t = 0n; const n = data.length; let off = 0;
  while (n - off > 128) { t += 128n; compress(h, data.subarray(off, off + 128), t, false); off += 128; }
  const last = new Uint8Array(128); last.set(data.subarray(off)); t += BigInt(n - off); compress(h, last, t, true);
  const out = new Uint8Array(64); h.forEach((x, i) => { for (let j = 0; j < 8; j++) out[i * 8 + j] = Number((x >> BigInt(8 * j)) & 255n); });
  return out.subarray(0, outLen);
}
const ckbHash = b => bytesToHex(blake2b(b));
const blake160 = b => bytesToHex(blake2b(b).subarray(0, 20));

// ---------- molecule ----------
function parseTable(b, nFields) { // returns array of field slices
  if (b.length < 4) throw new Error('table too short');
  const total = readU32(b, 0); if (total !== b.length) throw new Error(`table size ${total} ≠ ${b.length}`);
  if (total === 4) return [];
  const first = readU32(b, 4); const cnt = first / 4 - 1;
  if (first % 4 || first < 8 || first > total) throw new Error('bad header');
  const offs = []; for (let i = 0; i < cnt; i++) offs.push(readU32(b, 4 + i * 4)); offs.push(total);
  for (let i = 0; i < cnt; i++) if (offs[i] > offs[i + 1]) throw new Error('bad offsets');
  if (nFields != null && cnt < nFields) throw new Error(`fields ${cnt} < ${nFields}`);
  return offs.slice(0, cnt).map((o, i) => b.subarray(o, offs[i + 1]));
}
function parseBytes(b) { if (b.length < 4) throw new Error('bytes too short'); const n = readU32(b, 0); if (n + 4 !== b.length) throw new Error('bytes len mismatch'); return b.subarray(4); }
// WitnessArgs { lock: BytesOpt, input_type: BytesOpt, output_type: BytesOpt }
function parseWitnessArgs(hex) {
  const b = hexToBytes(hex); const f = parseTable(b, 3); if (f.length !== 3) throw new Error('WitnessArgs must have 3 fields');
  const opt = x => x.length === 0 ? null : bytesToHex(parseBytes(x));
  return { lock: opt(f[0]), input_type: opt(f[1]), output_type: opt(f[2]) };
}
const HASH_TYPE = { data: 0, type: 1, data1: 2, data2: 4 };
function serializeScript(s) {
  const code = hexToBytes(s.code_hash), ht = new Uint8Array([HASH_TYPE[s.hash_type]]), a = hexToBytes(s.args);
  if (ht[0] === undefined) throw new Error('unknown hash_type ' + s.hash_type);
  const args = concat(u32le(a.length), a); const h = 16, o0 = h, o1 = o0 + 32, o2 = o1 + 1, tot = o2 + args.length;
  return concat(u32le(tot), u32le(o0), u32le(o1), u32le(o2), code, ht, args);
}
const scriptHash = s => ckbHash(serializeScript(s));

// ---------- known scripts (RFC 0024 / 0025 / 0052; multisig v2 from ckb-sdk / ccc) ----------
const KNOWN = [
  { id: 'secp256k1_blake160', code_hash: '0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8', hash_type: 'type', kind: 'lock', src: 'RFC 0024' },
  { id: 'multisig_legacy', code_hash: '0x5c5069eb0857efc65e1bca0c07df34c31663b3622fd3876c876320fc9634e2a8', hash_type: 'type', kind: 'lock', src: 'RFC 0024' },
  { id: 'multisig_v2', code_hash: '0x36c971b8d41fbd94aabca77dc75e826729ac98447b46f91e00796155dddb0d29', hash_type: 'data1', kind: 'lock', src: 'ckb-sdk MultisigScript::V2 / ccc' },
  { id: 'nervos_dao', code_hash: '0x82d76d1b75fe2fd9a27dfbaa65a039221a380d76c926f378d3f81cf3e7e13f2e', hash_type: 'type', kind: 'type', src: 'RFC 0024' },
  { id: 'sudt', code_hash: '0x5e7a36a77e68eecc013dfa2fe6a23f3b6c344b04005808694ae6dd45eea4cfd5', hash_type: 'type', kind: 'type', net: 'mainnet', src: 'RFC 0025' },
  { id: 'sudt', code_hash: '0xc5e5dcf215925f7ef4dfaf5f4b4f105bc321c02776d6e7d52a1db3fcd9d011a4', hash_type: 'type', kind: 'type', net: 'testnet', src: 'RFC 0025' },
  { id: 'xudt', code_hash: '0x50bd8d6680b8b9cf98b73f3c08faf8b2a21914311954118ad6609be6e78a1b95', hash_type: 'data1', kind: 'type', src: 'RFC 0052' },
];
const identify = s => s ? (KNOWN.find(k => k.code_hash === s.code_hash && k.hash_type === s.hash_type) || null) : null;

// ---------- RPC ----------
async function rpc(url, method, params, fetchImpl) {
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  let res;
  try { res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }) }); }
  catch (e) { const err = new Error('NETWORK_OR_CORS: ' + e.message); err.code = 'CORS'; throw err; }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json(); if (j.error) throw new Error(`RPC ${method}: ${j.error.message || JSON.stringify(j.error)}`);
  return j.result;
}

// ---------- epoch / since ----------
const parseEpoch = v => { v = BigInt(v); return { number: v & 0xffffffn, index: (v >> 24n) & 0xffffn, length: (v >> 40n) & 0xffffn }; };
const fmtEpoch = e => `${e.number}+${e.index}/${e.length}`;
function parseSince(hex) {
  const v = BigInt(hex); if (v === 0n) return { raw: hex, none: true };
  const flags = Number(v >> 56n), rel = (flags & 0x80) !== 0, metric = ['block', 'epoch', 'timestamp', 'invalid'][(flags >> 5) & 3], val = v & ((1n << 56n) - 1n);
  return { raw: hex, flags, relative: rel, metric, value: val, epoch: metric === 'epoch' ? parseEpoch(val) : null };
}
const epochCmp = (a, b) => { if (a.number !== b.number) return a.number < b.number ? -1 : 1; const x = a.index * b.length, y = b.index * a.length; return x === y ? 0 : x < y ? -1 : 1; };

// ---------- analysis ----------
function parseMultisigLock(lockHex) {
  const b = hexToBytes(lockHex); if (b.length < 4) return { error: 'lock < 4 bytes (-22)' };
  const S = b[0], R = b[1], M = b[2], N = b[3];
  const scriptLen = 4 + 20 * N, need = scriptLen + 65 * M;
  const r = { S, R, M, N, pubkeyHashes: [], signatures: [], length: b.length, expectedLength: need };
  for (let i = 0; i < N && 4 + 20 * (i + 1) <= b.length; i++) r.pubkeyHashes.push(bytesToHex(b.subarray(4 + 20 * i, 24 + 20 * i)));
  for (let i = 0; i < M && scriptLen + 65 * (i + 1) <= b.length; i++) r.signatures.push(bytesToHex(b.subarray(scriptLen + 65 * i, scriptLen + 65 * (i + 1))));
  if (b.length >= scriptLen) { r.multisigScript = bytesToHex(b.subarray(0, scriptLen)); r.scriptBlake160 = blake160(b.subarray(0, scriptLen)); }
  return r;
}

async function fetchTxBundle(url, txHash, fetchImpl) {
  const call = (m, p) => rpc(url, m, p, fetchImpl);
  const tv = await call('get_transaction', [txHash]); if (!tv || !tv.transaction) throw new Error('transaction not found');
  const tx = tv.transaction; const prevCache = {}, headers = {};
  const getTx = async h => prevCache[h] || (prevCache[h] = await call('get_transaction', [h]));
  const inputs = [];
  for (const inp of tx.inputs) {
    const op = inp.previous_output;
    if (/^0x0+$/.test(op.tx_hash)) { inputs.push({ input: inp, cellbase: true }); continue; }
    const p = await getTx(op.tx_hash); const idx = parseInt(op.index, 16);
    inputs.push({ input: inp, output: p.transaction.outputs[idx], data: p.transaction.outputs_data[idx], blockHash: p.tx_status.block_hash });
  }
  const want = new Set(tx.header_deps); if (tv.tx_status.block_hash) want.add(tv.tx_status.block_hash);
  for (const i of inputs) if (i.output && i.output.type && identify(i.output.type) && identify(i.output.type).id === 'nervos_dao' && i.blockHash) want.add(i.blockHash);
  for (const h of want) headers[h] = await call('get_header', [h]);
  return { txHash, tx, status: tv.tx_status, inputs, headers };
}

function analyze(bundle) {
  const { tx, inputs, headers } = bundle; const checks = []; const groups = [];
  const outs = tx.outputs.map((o, i) => ({ index: i, output: o, data: tx.outputs_data[i] }));
  const key = s => s ? scriptHash(s) : null;
  // lock groups (inputs only), type groups (inputs + outputs)
  const lockG = new Map(), typeG = new Map();
  inputs.forEach((x, i) => { if (!x.output) return; const k = key(x.output.lock); if (!lockG.has(k)) lockG.set(k, { kind: 'lock', script: x.output.lock, hash: k, inputs: [], outputs: [] }); lockG.get(k).inputs.push(i);
    if (x.output.type) { const t = key(x.output.type); if (!typeG.has(t)) typeG.set(t, { kind: 'type', script: x.output.type, hash: t, inputs: [], outputs: [] }); typeG.get(t).inputs.push(i); } });
  outs.forEach(o => { if (o.output.type) { const t = key(o.output.type); if (!typeG.has(t)) typeG.set(t, { kind: 'type', script: o.output.type, hash: t, inputs: [], outputs: [] }); typeG.get(t).outputs.push(o.index); }
    const lk = key(o.output.lock); if (lockG.has(lk)) lockG.get(lk).outputs.push(o.index); });
  const wa = tx.witnesses.map(w => { if (!w || w === '0x') return { raw: w, empty: true }; try { return { raw: w, args: parseWitnessArgs(w) }; } catch (e) { return { raw: w, error: e.message }; } });
  const hdr = h => headers[h];
  const C = (g, ok, zh, en, code) => g.checks.push({ ok, zh, en, code });
  for (const g of [...lockG.values(), ...typeG.values()]) {
    g.known = identify(g.script); g.checks = []; g.parsed = {};
    if (g.kind === 'lock') {
      g.witnessIndex = g.inputs[0]; const w = wa[g.witnessIndex];
      g.parsed.witness = w;
      if (g.known && /multisig/.test(g.known.id)) {
        const args = hexToBytes(g.script.args);
        C(g, args.length === 20 || args.length === 28, 'args 长度为 20 或 28', 'args length is 20 or 28', '-1');
        if (args.length === 28) {
          const lim = parseSince(bytesToHex(args.subarray(20)).replace(/^0x/, '0x').replace(/^0x(..)(..)(..)(..)(..)(..)(..)(..)$/, '0x$8$7$6$5$4$3$2$1'));
          g.parsed.argsSince = lim;
          for (const i of g.inputs) { const s = parseSince(inputs[i].input.since);
            C(g, s.flags === lim.flags, `input[${i}].since flags 与 args 相同`, `input[${i}].since flags equal args`, '-23');
            if (s.flags === lim.flags) C(g, lim.metric === 'epoch' && !lim.relative ? epochCmp(s.epoch, lim.epoch) >= 0 : s.value >= lim.value, `input[${i}].since ≥ args since`, `input[${i}].since ≥ args since`, '-24'); }
        }
        if (w && w.args && w.args.lock) {
          const m = parseMultisigLock(w.args.lock); g.parsed.multisig = m;
          if (!m.error) {
            C(g, m.S === 0, 'S = 0', 'S = 0', '-41'); C(g, m.N > 0, 'N > 0', 'N > 0', '-42'); C(g, m.M > 0 && m.M <= m.N, '0 < M ≤ N', '0 < M ≤ N', '-43'); C(g, m.R <= m.M, 'R ≤ M', 'R ≤ M', '-44');
            C(g, m.length === m.expectedLength, `lock 长度 ${m.length} = 4+20·N+65·M = ${m.expectedLength}`, `lock length ${m.length} = 4+20·N+65·M = ${m.expectedLength}`, '-22');
            if (m.scriptBlake160) C(g, m.scriptBlake160 === bytesToHex(args.subarray(0, 20)), 'blake160(multisig_script) = args[0..20]', 'blake160(multisig_script) = args[0..20]', '-51');
          } else C(g, false, m.error, m.error, '-22');
        } else C(g, false, 'witness 为合法 WitnessArgs 且 lock 非空', 'witness is a valid WitnessArgs with non-empty lock', '-2');
        C(g, null, '签名校验（未检查）', 'signature verification (not checked)', '-52');
      } else if (g.known && g.known.id === 'secp256k1_blake160') {
        C(g, hexToBytes(g.script.args).length === 20, 'args 为 20 字节 blake160(pubkey)', 'args is 20-byte blake160(pubkey)', '-1');
        C(g, !!(w && w.args && w.args.lock && hexToBytes(w.args.lock).length === 65), 'witness.lock 为 65 字节签名', 'witness.lock is a 65-byte signature', '-22 / -2');
        C(g, null, '签名校验（未检查）', 'signature verification (not checked)', '-31');
      }
    } else if (g.known && g.known.id === 'nervos_dao') {
      C(g, g.script.args === '0x', 'type.args 为空', 'type.args is empty', '-2');
      g.parsed.dao = [];
      const daoIn = new Set(g.inputs);
      for (const i of g.inputs) {
        const it = inputs[i]; const bn = BigInt('0x' + (it.data.length === 18 ? it.data.slice(2).match(/../g).reverse().join('') : '0'));
        if (bn === 0n) { // phase 1
          const o = tx.outputs[i], od = tx.outputs_data[i]; const dh = hdr(it.blockHash);
          const ent = { input: i, phase: 1, depositBlock: dh ? BigInt(dh.number) : null };
          g.parsed.dao.push(ent);
          C(g, !!o && !!o.type && key(o.type) === g.hash, `output[${i}] 为同一 DAO type`, `output[${i}] has the same DAO type`, '-20');
          C(g, !!o && o.capacity === it.output.capacity, `output[${i}].capacity = input[${i}].capacity`, `output[${i}].capacity = input[${i}].capacity`, '-20');
          const stored = od && od.length === 18 ? BigInt('0x' + od.slice(2).match(/../g).reverse().join('')) : null;
          C(g, dh && stored === BigInt(dh.number), `output[${i}].data = 存款区块号 ${dh ? BigInt(dh.number) : '?'}`, `output[${i}].data = deposit block number ${dh ? BigInt(dh.number) : '?'}`, '-20');
          C(g, tx.header_deps.includes(it.blockHash), `header_deps 含存款区块 ${it.blockHash.slice(0, 10)}…`, `header_deps includes deposit block ${it.blockHash.slice(0, 10)}…`, 'syscall');
        } else { // phase 2
          const w = wa[i]; const ent = { input: i, phase: 2, depositBlock: bn };
          g.parsed.dao.push(ent);
          let k = null; if (w && w.args && w.args.input_type && hexToBytes(w.args.input_type).length === 8) k = Number(leToBig(hexToBytes(w.args.input_type)));
          C(g, k != null, `witness[${i}].input_type 为 8 字节 (k=${k})`, `witness[${i}].input_type is 8 bytes (k=${k})`, '-11');
          const D = k != null && tx.header_deps[k] ? hdr(tx.header_deps[k]) : null; const W = hdr(it.blockHash);
          C(g, !!D && BigInt(D.number) === bn, `header_deps[k].number = data (${bn})`, `header_deps[k].number = data (${bn})`, '-14');
          C(g, tx.header_deps.includes(it.blockHash), 'header_deps 含 withdraw 区块 W', 'header_deps includes withdraw block W', 'syscall');
          if (D && W) {
            const de = parseEpoch(D.epoch), we = parseEpoch(W.epoch);
            C(g, epochCmp(we, de) > 0, `W epoch ${fmtEpoch(we)} 晚于 D ${fmtEpoch(de)}`, `W epoch ${fmtEpoch(we)} later than D ${fmtEpoch(de)}`, '-14');
            let dep = we.number - de.number; if (we.index * de.length > de.index * we.length) dep++;
            const lock = (dep + 179n) / 180n * 180n; const minS = { number: de.number + lock, index: de.index, length: de.length };
            const s = parseSince(it.input.since);
            C(g, s.flags === 0x20, 'since 为绝对 epoch (0x20)', 'since is absolute epoch (0x20)', '-17');
            C(g, s.flags === 0x20 && epochCmp(s.epoch.length === 0n ? { number: s.epoch.number, index: 0n, length: 1n } : s.epoch, minS) >= 0, `since ≥ ${fmtEpoch(minS)}（lock ${lock} epochs）`, `since ≥ ${fmtEpoch(minS)} (lock ${lock} epochs)`, '-17');
            const arD = leToBig(hexToBytes(D.dao).subarray(8, 16)), arW = leToBig(hexToBytes(W.dao).subarray(8, 16));
            ent.D = { number: BigInt(D.number), epoch: fmtEpoch(de), ar: arD }; ent.W = { number: BigInt(W.number), epoch: fmtEpoch(we), ar: arW }; ent.minSince = fmtEpoch(minS); ent.lockEpochs = lock; ent.capacity = BigInt(it.output.capacity);
            ent.occupiedNote = 'occupied = 8 + data + lock + type (bytes) × 1e8';
            const occ = occupied(it.output, it.data); ent.occupied = occ;
            ent.maxWithdraw = occ + (ent.capacity - occ) * arW / arD;
          }
        }
      }
      for (const j of g.outputs) if (!daoIn.has(j) || (inputs[j] && inputs[j].data !== '0x0000000000000000')) {
        const isP1 = daoIn.has(j) && inputs[j] && inputs[j].data === '0x0000000000000000';
        if (!isP1) { g.parsed.dao.push({ output: j, phase: 0 }); C(g, tx.outputs_data[j] === '0x0000000000000000', `新存款 output[${j}].data = 8 字节 0`, `new deposit output[${j}].data = 8 zero bytes`, '-19'); }
      }
    } else if (g.known && (g.known.id === 'sudt' || g.known.id === 'xudt')) {
      const amt = d => { const b = hexToBytes(d); return b.length >= 16 ? leToBig(b.subarray(0, 16)) : null; };
      g.parsed.amounts = { in: g.inputs.map(i => [i, amt(inputs[i].data)]), out: g.outputs.map(j => [j, amt(tx.outputs_data[j])]) };
      const ownerArgs = hexToBytes(g.script.args).subarray(0, 32);
      if (g.known.id === 'sudt') C(g, hexToBytes(g.script.args).length === 32, 'args 为 32 字节', 'args is 32 bytes', '-1');
      const owner = inputs.some(x => x.output && scriptHash(x.output.lock) === bytesToHex(ownerArgs));
      g.parsed.ownerMode = owner;
      const all = [...g.parsed.amounts.in, ...g.parsed.amounts.out];
      C(g, all.every(([, a]) => a != null), 'data ≥ 16 字节', 'data ≥ 16 bytes', g.known.id === 'sudt' ? '-2' : null);
      const si = g.parsed.amounts.in.reduce((s, [, a]) => s + (a || 0n), 0n), so = g.parsed.amounts.out.reduce((s, [, a]) => s + (a || 0n), 0n);
      g.parsed.sum = { in: si, out: so };
      if (owner) C(g, true, 'owner 模式（存在 lock hash = args 的输入），不检查数量', 'owner mode (an input lock hash = args); amounts not checked', null);
      else C(g, si >= so, `Σin ${si} ≥ Σout ${so}`, `Σin ${si} ≥ Σout ${so}`, g.known.id === 'sudt' ? '-52' : null);
      if (g.known.id === 'xudt') C(g, null, 'xUDT 扩展脚本（未检查）', 'xUDT extension scripts (not checked)', null);
    }
  }
  // tx-level
  const inCap = inputs.reduce((s, x) => s + (x.output ? BigInt(x.output.capacity) : 0n), 0n), outCap = tx.outputs.reduce((s, o) => s + BigInt(o.capacity), 0n);
  let daoBonus = 0n; for (const g of typeG.values()) if (g.parsed.dao) for (const e of g.parsed.dao) if (e.maxWithdraw != null) daoBonus += e.maxWithdraw - e.capacity;
  checks.push({ ok: outCap <= inCap + daoBonus, zh: `Σ输出 capacity ${outCap} ≤ Σ输入 ${inCap} + DAO 补贴 ${daoBonus}`, en: `Σ output capacity ${outCap} ≤ Σ input ${inCap} + DAO compensation ${daoBonus}`, code: daoBonus ? '-15' : 'consensus' });
  checks.push({ ok: tx.outputs.length === tx.outputs_data.length, zh: 'outputs_data 数量 = outputs 数量', en: 'outputs_data count = outputs count', code: 'consensus' });
  return { groups: [...lockG.values(), ...typeG.values()], witnesses: wa, checks, outs, fee: inCap + daoBonus - outCap };
}
function occupied(out, data) { // bytes: capacity(8) + data + lock(32+1+args) + type
  const sz = s => s ? 33 + hexToBytes(s.args).length : 0;
  return BigInt(8 + hexToBytes(data).length + sz(out.lock) + sz(out.type)) * 100000000n;
}
const api = { hexToBytes, bytesToHex, blake2b, ckbHash, blake160, parseTable, parseBytes, parseWitnessArgs, serializeScript, scriptHash, KNOWN, identify, rpc, parseEpoch, fmtEpoch, parseSince, epochCmp, parseMultisigLock, fetchTxBundle, analyze, occupied };
root.CKB = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
