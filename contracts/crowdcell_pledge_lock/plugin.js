// CROWDCELL_PLEDGE_LOCK — alesfer001/CrowdCell contracts/pledge-lock/src/main.rs @2fd13f6 (testnet only, community)
(function (R) {
  const H = R.hexToBytes, X = R.bytesToHex, CKB = 100000000n, FEE = CKB, GRACE = 1944000n;
  const amt = (cap, data) => { const d = H(data || '0x'); if (d.length < 72) return cap; const a = R.leToBig(d.subarray(64, 72)); return a <= cap ? a : cap; };
  function parse(g, ctx) { const a = H(g.script.args), p = { ok: a.length >= 72 };
    if (p.ok) { p.campaign = X(a.subarray(0, 32)); p.deadline = R.leToBig(a.subarray(32, 40)); p.backer = X(a.subarray(40, 72)); }
    p.since = BigInt(ctx.inputs[g.inputs[0]].input.since);
    p.cap = 0n; p.amount = 0n; for (const i of g.inputs) { const c = BigInt(ctx.inputs[i].output.capacity); p.cap += c; p.amount += amt(c, ctx.inputs[i].data); }
    p.path = p.since === 0n ? 'merge' : 'settle';
    p.fields = p.ok ? [[{ zh: '路径', en: 'path' }, p.since === 0n ? { zh: '合并（since = 0）', en: 'merge (since = 0)' } : { zh: '截止后结算', en: 'settle after deadline' }], ['campaign_type_script_hash', p.campaign], ['deadline_block', p.deadline.toString()], ['backer_lock_hash', p.backer], [{ zh: 'Σ amount / Σ capacity', en: 'Σ amount / Σ capacity' }, `${Number(p.amount) / 1e8} / ${Number(p.cap) / 1e8} CKB`]] : [['args', '(< 72B)']];
    if (p.ok) p.layouts = [{ label: { zh: 'lock args', en: 'lock args' }, layout: [{ name: 'campaign_type_script_hash', size: '32B', color: 1, flex: 4 }, { name: 'deadline_block', size: '8B', color: 2, flex: 2 }, { name: 'backer_lock_hash', size: '32B', color: 3, flex: 4 }], hex: [['campaign_type_script_hash', p.campaign], ['deadline_block', X(a.subarray(32, 40))], ['backer_lock_hash', p.backer]] }];
    return p; }
  function check(g, ctx, p) {
    if (!p.ok) return [R.check(false, 'args ≥ 72 字节', 'args ≥ 72 bytes', 10)];
    const r = [R.check(true, 'args ≥ 72 字节', 'args ≥ 72 bytes', 10)], outs = ctx.tx.outputs, od = ctx.tx.outputs_data;
    if (p.path === 'merge') { const same = outs.map((o, j) => j).filter(j => R.scriptHash(outs[j].lock) === g.hash);
      r.push(R.check(g.inputs.length >= 2, 'since = 0：group 输入 ≥ 2（合并）', 'since = 0: ≥ 2 group inputs (merge)', 40));
      if (g.inputs.length < 2) return r;
      r.push(R.check(same.length === 1, '恰好 1 个同 lock 输出', 'exactly one output with the same lock', same.length ? 42 : 41)); if (same.length !== 1) return r;
      const j = same[0], t0 = ctx.inputs[g.inputs[0]].output.type, th = t0 ? R.scriptHash(t0) : null;
      r.push(R.check(BigInt(outs[j].capacity) === p.cap, '输出 capacity = Σ输入 capacity', 'output capacity = Σ input capacity', 43),
        R.check(th !== null && g.inputs.every(i => ctx.inputs[i].output.type && R.scriptHash(ctx.inputs[i].output.type) === th) && outs[j].type && R.scriptHash(outs[j].type) === th, '输入与输出 type 相同且非空', 'inputs and output share one non-empty type', 45));
      const ds = g.inputs.map(i => H(ctx.inputs[i].data)), dout = H(od[j]);
      const okd = ds.every(d => d.length >= 72) && dout.length >= 72;
      r.push(R.check(okd && ds.reduce((s, d) => s + R.leToBig(d.subarray(64, 72)), 0n) === R.leToBig(dout.subarray(64, 72)), 'data ≥ 72B 且 amount 之和相等', 'data ≥ 72B and amount sums equal', 46));
      return r; }
    const absBlock = (p.since >> 56n) === 0n;
    r.push(R.check(absBlock, 'since 为绝对区块号（标志字节 0）', 'since is an absolute block number (flag byte 0)', 12)); if (!absBlock) return r;
    r.push(R.check(p.since >= p.deadline, `since ${p.since} ≥ deadline ${p.deadline}`, `since ${p.since} ≥ deadline ${p.deadline}`, 13));
    const pc = g.script.code_hash, mixed = ctx.inputs.some(x => x.output && x.output.lock.code_hash === pc && R.scriptHash(x.output.lock) !== g.hash);
    r.push(R.check(!mixed, '未混入其他 pledge-lock group', 'no other pledge-lock group in inputs', 34));
    r.push(R.NOT_CHECKED('cell_deps 中 campaign 的状态未离线解析（Active → 20；缺失且未过宽限期 → 21）', 'campaign status in cell_deps not resolved offline (Active → 20; missing within grace → 21)', '20 / 21'));
    const toBacker = outs.reduce((s, o) => s + (R.scriptHash(o.lock) === p.backer ? BigInt(o.capacity) : 0n), 0n), need = p.cap > FEE ? p.cap - FEE : 0n;
    if (toBacker >= need) r.push(R.check(true, `退款条件满足：给认捐人 ${toBacker} ≥ Σcapacity − 1 CKB（Failed${p.since >= p.deadline + GRACE ? ' 或宽限期后' : ''}）`, `refund condition met: to backer ${toBacker} ≥ Σcapacity − 1 CKB (Failed${p.since >= p.deadline + GRACE ? ' or after grace' : ''})`, 32));
    else r.push(R.NOT_CHECKED(`按释放路径：需给创建者 ≥ Σamount ${p.amount}，给认捐人 ≥ ${p.cap - p.amount} − 1 CKB（创建者 lock hash 在 campaign cell_dep 中，未解析）；当前给认捐人 ${toBacker}`, `release path: creator needs ≥ Σamount ${p.amount}, backer ≥ ${p.cap - p.amount} − 1 CKB (creator lock hash is in the campaign cell_dep, not resolved); backer currently gets ${toBacker}`, 32));
    return r; }
  R.register({ id: 'crowdcell_pledge_lock', kind: 'lock', name: { zh: 'CrowdCell 认捐 lock', en: 'CrowdCell pledge lock' },
    match: [{ code_hash: '0xc28d8042a1cf39d02db0cbc769a26faad80b39563c2d2de40536ddb66ae3a525', hash_type: 'data2', net: 'testnet', src: 'alesfer001/CrowdCell README + deployment/deployed-contracts-testnet.json (hash_type data2: off-chain/frontend/src/lib/constants.ts)', deps: { testnet: { tx_hash: '0x1dc0f07d3acd90823932aca7034209cbf5d1bd8ba5c9310ea9bb55b7c0a0beb2', index: '0x0' } } }], parse, check });
})((typeof CKB !== "undefined" ? CKB : require("../../lib/ckb.js")));
