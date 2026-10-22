// CROWDCELL_RECEIPT — alesfer001/CrowdCell contracts/receipt/src/main.rs @2fd13f6 (testnet only, community)
(function (R) {
  const H = R.hexToBytes, X = R.bytesToHex, Z = '0x' + '00'.repeat(32), FEE = 100000000n, GRACE = 1944000n;
  const dec = h => { const d = H(h || '0x'); if (d.length < 40) return null; const r = { amount: R.leToBig(d.subarray(0, 8)), backer: X(d.subarray(8, 40)), full: d.length >= 80 };
    if (r.full) { r.campaign = X(d.subarray(40, 72)); r.deadline = R.leToBig(d.subarray(72, 80)); r.dl = X(d.subarray(72, 80)); } return r; };
  function parse(g, ctx) { const a = H(g.script.args), p = { pch: a.length >= 32 ? X(a.subarray(0, 32)) : null };
    p.path = !g.inputs.length && g.outputs.length ? 'create' : g.inputs.length && !g.outputs.length ? 'destroy' : g.inputs.length ? 'modify' : 'none';
    p.r = dec(p.path === 'create' ? ctx.tx.outputs_data[g.outputs[0]] : g.inputs.length ? ctx.inputs[g.inputs[0]].data : null);
    p.fields = [[{ zh: '路径', en: 'path' }, p.path], ['pledge_code_hash (args)', p.pch || '(< 32B)']];
    if (p.r) { p.fields.push(['pledge_amount', (Number(p.r.amount) / 1e8) + ' CKB'], ['backer_lock_hash', p.r.backer]); if (p.r.full) p.fields.push(['campaign_type_hash', p.r.campaign], ['deadline_block', p.r.deadline.toString()]); }
    return p; }
  function check(g, ctx, p) {
    if (p.path === 'modify') return [R.check(false, '回执不可修改', 'receipt cannot be modified', 11)];
    if (p.path === 'create') { const r = [R.check(!!p.pch, 'args ≥ 32 字节', 'args ≥ 32 bytes', 20)]; if (!p.pch) return r;
      r.push(R.check(!!(p.r && p.r.full), 'data ≥ 80 字节', 'data ≥ 80 bytes', 10)); if (!(p.r && p.r.full)) return r;
      r.push(R.check(p.r.amount > 0n, 'pledge_amount > 0', 'pledge_amount > 0', 12), R.check(p.r.backer !== Z, 'backer_lock_hash ≠ 0', 'backer_lock_hash ≠ 0', 13));
      const outs = ctx.tx.outputs; let j = -1; for (let k = 0; k < outs.length; k++) if (outs[k].type && outs[k].type.code_hash === p.pch && H(ctx.tx.outputs_data[k]).length >= 72) { j = k; break; }
      r.push(R.check(j >= 0, '输出中有匹配的 pledge', 'a matching pledge is in outputs', 14)); if (j < 0) return r;
      const d = H(ctx.tx.outputs_data[j]), la = H(outs[j].lock.args);
      r.push(R.check(R.leToBig(d.subarray(64, 72)) === p.r.amount, '金额 = pledge amount', 'amount = pledge amount', 21), R.check(X(d.subarray(32, 64)) === p.r.backer, 'backer = pledge backer', 'backer = pledge backer', 22),
        R.check(la.length >= 72 && X(la.subarray(0, 32)) === p.r.campaign && X(la.subarray(32, 40)) === p.r.dl, 'campaign hash / deadline 与 pledge lock args 一致', 'campaign hash / deadline match the pledge lock args', 24));
      return r; }
    if (p.path === 'destroy') { if (!p.r) return [R.check(false, 'data ≥ 40 字节', 'data ≥ 40 bytes', 10)];
      const r = [], since = BigInt(ctx.inputs[g.inputs[0]].input.since);
      if (p.r.full && since !== 0n && (since >> 56n) === 0n && since >= p.r.deadline + GRACE) return [R.check(true, '宽限期已过：直接允许', 'grace period over: allowed', null)];
      if (p.r.full) r.push(R.NOT_CHECKED('campaign 是否已结算（cell_deps 中 status ≠ 0）未离线解析；若已结算则以下不需要', 'whether the campaign is settled (status ≠ 0 in cell_deps) not resolved offline; if settled the checks below are not needed', null));
      r.push(R.check(!!p.pch, 'args ≥ 32 字节', 'args ≥ 32 bytes', 20)); if (!p.pch) return r;
      const consumed = ctx.inputs.some(x => x.output && x.output.type && x.output.type.code_hash === p.pch);
      const need = p.r.amount > FEE ? p.r.amount - FEE : 0n, ok = ctx.tx.outputs.some(o => R.scriptHash(o.lock) === p.r.backer && BigInt(o.capacity) >= need);
      const settledPossible = p.r.full;
      const mk = (v, zh, en, c) => v || !settledPossible ? R.check(v, zh, en, c) : R.NOT_CHECKED(zh + '（未满足，campaign 可能已结算）', en + ' (not met; campaign may be settled)', c);
      r.push(mk(consumed, '输入中消耗了 pledge', 'a pledge is consumed in inputs', 23));
      if (consumed) r.push(mk(ok, `有单个给 backer 的输出 ≥ amount − 1 CKB（${need}）`, `one backer output ≥ amount − 1 CKB (${need})`, 15));
      return r; }
    return []; }
  R.register({ id: 'crowdcell_receipt', kind: 'type', name: { zh: 'CrowdCell 回执', en: 'CrowdCell receipt' },
    match: [{ code_hash: '0x2bac36d4cadd65b66c25557d37c2bba4f7e3c40a94ca92f3853b311887dba575', hash_type: 'data2', net: 'testnet', src: 'alesfer001/CrowdCell README + deployment/deployed-contracts-testnet.json (hash_type data2: off-chain/frontend/src/lib/constants.ts, on-chain usage)', deps: { testnet: { tx_hash: '0x63d545b60d5eb9680230f8822f597d70f76cfab5e738d9118a977836e317b967', index: '0x0' } } }], parse, check });
})((typeof CKB !== "undefined" ? CKB : require("../../lib/ckb.js")));
