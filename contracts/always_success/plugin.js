// ALWAYS_SUCCESS — ckb-devrel/ckb-proxy-locks contracts/always-success/src/main.rs (program_entry returns 0)
(function (R) {
  const H = R.hexToBytes, X = R.bytesToHex;
  const inLock = ctx => ctx.inputs.filter(x => x.output).map(x => R.scriptHash(x.output.lock));
  const inType = ctx => ctx.inputs.filter(x => x.output && x.output.type).map(x => R.scriptHash(x.output.type));
  const outType = ctx => ctx.tx.outputs.filter(o => o.type).map(o => R.scriptHash(o.type));
  const a32 = g => { const a = H(g.script.args); return a.length >= 32 ? X(a.subarray(0, 32)) : null; };
  function parse(g) { return { fields: [['args', g.script.args]] }; }
  function check() { return [R.check(true, '脚本总是返回 0：任何人都能解锁 / 任意转换', 'script always returns 0: anyone can unlock / any transition', 0)]; }
  R.register({ id: 'always_success', kind: 'lock', name: 'Always Success', match: [{ code_hash: '0x3b521cc4b552f109d092d8cc468a8048acb53c5952dbe769d2b2f9cf6e47f7f1', hash_type: 'data1', src: 'ckb-devrel/ckb-proxy-locks contracts/always-success (mainnet and testnet)' }], parse, check });
})((typeof CKB !== "undefined" ? CKB : require("../../lib/ckb.js")));
