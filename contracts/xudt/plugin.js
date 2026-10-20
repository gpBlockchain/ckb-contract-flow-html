// @requires sudt
// xUDT — RFC 0052, ckb-production-scripts/c/xudt_rce.c (+ rce.h for error codes). Reuses R.udt from sudt plugin.
(function (R) {
  if (!R.udt && typeof require !== 'undefined') require('../sudt/plugin.js');
  if (!R.udt) throw new Error('xudt requires sudt plugin');
  const FLAG = { 0: 'plain', 1: 'extensions in args', 2: 'extensions in witness' };
  function parse(g, ctx) {
    const p = R.udt.amounts(g, ctx); const a = R.hexToBytes(g.script.args);
    if (a.length >= 36) { const v = Number(R.leToBig(a.subarray(32, 36))); p.flags = v; p.flagLow = v & ~0xe0000000; }
    p.fields.unshift(['owner lock hash', R.bytesToHex(a.subarray(0, 32))], ['flags', p.flags == null ? 'none (plain)' : '0x' + p.flags.toString(16).padStart(8, '0') + ' (' + (FLAG[p.flagLow] || 'invalid') + ')']);
    // owner mode variants beyond input lock (input/output type) are not evaluated here
    if (p.flags != null && (p.flags & 0x20000000)) p.owner = false;
    return p;
  }
  function check(g, ctx, p) {
    const a = R.hexToBytes(g.script.args);
    const c = [R.check(a.length >= 32, 'args ≥ 32 字节', 'args ≥ 32 bytes', -1)];
    if (p.flags != null) c.push(R.check(p.flagLow in FLAG, 'flags（去掉 owner 位）∈ {0,1,2}', 'flags (without owner bits) ∈ {0,1,2}', 44));
    if (p.flagLow === 2) c.push(R.check(a.length === 56, 'flags=2 时 args = 32 + 4 + 20 字节', 'flags=2 requires args = 32 + 4 + 20 bytes', 44));
    c.push(...R.udt.check(g, ctx, p, { data: -2, amount: -52 }));
    if (p.flagLow === 1 || p.flagLow === 2) c.push(R.NOT_CHECKED('扩展脚本（未检查）', 'extension scripts (not checked)', null));
    if (p.flags != null && (p.flags & 0xc0000000)) c.push(R.NOT_CHECKED('type-hash owner 模式（未检查）', 'type-hash owner mode (not checked)', null));
    return c;
  }
  R.register({ id: 'xudt', kind: 'type', name: 'xUDT',
    match: [{ code_hash: '0x50bd8d6680b8b9cf98b73f3c08faf8b2a21914311954118ad6609be6e78a1b95', hash_type: 'data1', src: 'RFC 0052 (Mirana & Pudge)' }], parse, check });
})((typeof CKB !== "undefined" ? CKB : require("../../lib/ckb.js")));
