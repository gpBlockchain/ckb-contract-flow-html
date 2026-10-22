// CROWDCELL_CAMPAIGN_LOCK — alesfer001/CrowdCell contracts/campaign-lock/src/main.rs @2fd13f6 (testnet only, community)
(function (R) {
  const H = R.hexToBytes;
  function parse(g, ctx) { const a = H(g.script.args), p = { ok: a.length >= 8 };
    if (p.ok) p.deadline = R.leToBig(a.subarray(0, 8)); p.since = BigInt(ctx.inputs[g.inputs[0]].input.since); p.cap = BigInt(ctx.inputs[g.inputs[0]].output.capacity);
    const outs = ctx.tx.outputs; p.carry = null;
    for (let j = 0; j < outs.length; j++) { if (R.scriptHash(outs[j].lock) !== g.hash) continue; const d = H(ctx.tx.outputs_data[j]); if (d.length < 65 || d[56] !== 0) continue; p.carry = j; break; }
    p.fields = p.ok ? [['deadline_block', p.deadline.toString()], [{ zh: '路径', en: 'path' }, p.carry !== null ? { zh: 'Active 延续（output[' + p.carry + ']）', en: 'Active carried forward (output[' + p.carry + '])' } : { zh: '截止后花费', en: 'spend after deadline' }], ['since', '0x' + p.since.toString(16)]] : [['args', '(< 8B)']];
    return p; }
  function check(g, ctx, p) { if (!p.ok) return [R.check(false, 'args ≥ 8 字节', 'args ≥ 8 bytes', 10)];
    const r = [R.check(true, 'args ≥ 8 字节', 'args ≥ 8 bytes', 10)];
    if (p.carry !== null) { const c = BigInt(ctx.tx.outputs[p.carry].capacity); r.push(R.check(c >= p.cap, `延续的 Active campaign capacity ${c} ≥ 输入 ${p.cap}`, `carried Active campaign capacity ${c} ≥ input ${p.cap}`, 15)); return r; }
    const abs = (p.since >> 56n) === 0n;
    r.push(R.check(abs, 'since 为绝对区块号', 'since is an absolute block number', 12));
    if (abs) r.push(R.check(p.since >= p.deadline, `since ${p.since} ≥ deadline ${p.deadline}`, `since ${p.since} ≥ deadline ${p.deadline}`, 13));
    return r; }
  R.register({ id: 'crowdcell_campaign_lock', kind: 'lock', name: { zh: 'CrowdCell campaign lock', en: 'CrowdCell campaign lock' },
    match: [{ code_hash: '0xb6e2b333d0f38a89c70cde6558670b771244695d33daa1fa62385017476401bf', hash_type: 'data2', net: 'testnet', src: 'alesfer001/CrowdCell README + deployment/deployed-contracts-testnet.json (hash_type data2: off-chain/frontend/src/lib/constants.ts, on-chain usage)', deps: { testnet: { tx_hash: '0xc4e8aaaefd921550daa21222cebeccaad7fd5d178d4df567d94c9248a5c149b6', index: '0x0' } } }], parse, check });
})((typeof CKB !== "undefined" ? CKB : require("../../lib/ckb.js")));
