// CROWDCELL_CAMPAIGN — alesfer001/CrowdCell contracts/campaign/src/main.rs @2fd13f6 (testnet only, community)
(function (R) {
  const H = R.hexToBytes, X = R.bytesToHex, CKB = 100000000n, MIN = 100n * CKB, FEE = CKB, GRACE = 1944000n;
  const ST = ['Active', 'Success', 'Failed'];
  function dec(hex) { const d = H(hex || '0x'); if (d.length < 65) return { err: 1 }; if (d[56] > 2) return { err: 2 };
    return { creator: X(d.subarray(0, 32)), goal: R.leToBig(d.subarray(32, 40)), deadline: R.leToBig(d.subarray(40, 48)), total: R.leToBig(d.subarray(48, 56)), status: d[56], tail: X(d.subarray(57)), len: d.length }; }
  // absolute block-number since: flag byte 0 (ckb-std is_absolute + flags_is_valid + BlockNumber)
  const sinceBlock = s => { const v = BigInt(s); return v !== 0n && (v >> 56n) === 0n ? v : null; };
  function sumPledges(cells, plc, me, enforce) { let t = 0n; for (const c of cells) { const l = c.out.lock; if (l.code_hash !== plc) continue;
      const a = H(l.args); if (a.length < 32 || X(a.subarray(0, 32)) !== me) continue;
      const d = H(c.data); if (d.length < 72) return { err: 16 }; const amt = R.leToBig(d.subarray(64, 72));
      if (enforce && amt < MIN) return { err: 23 }; if (BigInt(c.out.capacity) < amt + R.occupied(c.out, c.data)) return { err: 22 }; t += amt; }
    return { t }; }
  function parse(g, ctx) {
    const a = H(g.script.args), p = { argsOk: a.length >= 64 && X(a.subarray(32, 64)) !== '0x' + '00'.repeat(32) };
    p.plc = a.length >= 64 ? X(a.subarray(32, 64)) : null;
    p.inp = g.inputs.map(i => ({ out: ctx.inputs[i].output, data: ctx.inputs[i].data, since: ctx.inputs[i].input.since }));
    p.outp = g.outputs.map(j => ({ out: ctx.tx.outputs[j], data: ctx.tx.outputs_data[j] }));
    p.old = p.inp[0] && dec(p.inp[0].data); p.nw = p.outp[0] && dec(p.outp[0].data);
    p.path = p.inp.length && p.outp.length ? (p.nw.err ? 'bad' : p.nw.status === 0 ? 'pledge' : 'finalize') : p.outp.length ? 'create' : p.inp.length ? 'destroy' : 'none';
    const c = p.nw && !p.nw.err ? p.nw : p.old && !p.old.err ? p.old : null;
    p.fields = [[{ zh: '路径', en: 'path' }, p.path], ['pledge_lock_code_hash', p.plc || '(args < 64B)']];
    if (c) p.fields.push(['creator_lock_hash', c.creator], [{ zh: '目标', en: 'funding_goal' }, (Number(c.goal) / 1e8) + ' CKB'], ['deadline_block', c.deadline.toString()], ['total_pledged', (Number(c.total) / 1e8) + ' CKB'], ['status', ST[c.status]]);
    if (a.length >= 64) p.layouts = [{ label: { zh: 'type args', en: 'type args' }, layout: [{ name: 'type_id', size: '32B', color: 1, flex: 4 }, { name: 'pledge_lock_code_hash', size: '32B', color: 2, flex: 4 }], hex: [['type_id', X(a.subarray(0, 32))], ['pledge_lock_code_hash', p.plc]] }];
    return p; }
  function check(g, ctx, p) {
    const r = [R.NOT_CHECKED('TypeID（check_type_id）未离线校验', 'TypeID (check_type_id) not checked offline', 12),
      R.check(p.argsOk, 'args ≥ 64 字节且 pledge_lock_code_hash ≠ 0', 'args ≥ 64 bytes and pledge_lock_code_hash ≠ 0', 15),
      R.check(p.inp.length <= 1 && p.outp.length <= 1, 'group 输入、输出各至多 1 个', 'at most one group input and one group output', 21)];
    if (!p.argsOk) return r;
    const immut = (o, n) => o.creator === n.creator && o.goal === n.goal && o.deadline === n.deadline && o.len === n.len && o.tail === n.tail;
    if (p.path === 'create') { const n = p.nw;
      if (n.err) return r.concat([R.check(false, n.err === 1 ? 'data ≥ 65 字节' : 'status ∈ {0,1,2}', n.err === 1 ? 'data ≥ 65 bytes' : 'status ∈ {0,1,2}', n.err)]);
      return r.concat([R.check(n.goal > 0n, 'funding_goal > 0', 'funding_goal > 0', 3), R.check(n.deadline > 0n, 'deadline_block > 0', 'deadline_block > 0', 4),
        R.check(n.total === 0n, 'total_pledged = 0', 'total_pledged = 0', 5), R.check(n.status === 0, 'status = Active', 'status = Active', 6)]); }
    if (p.path === 'pledge' || p.path === 'finalize' || p.path === 'bad') { const o = p.old, n = p.nw;
      if (o.err || n.err) { const e = o.err || n.err; return r.concat([R.check(false, e === 1 ? 'data ≥ 65 字节' : 'status ∈ {0,1,2}', e === 1 ? 'data ≥ 65 bytes' : 'status ∈ {0,1,2}', e)]); }
      r.push(R.check(BigInt(p.outp[0].out.capacity) >= BigInt(p.inp[0].out.capacity), '输出 campaign capacity ≥ 输入', 'output campaign capacity ≥ input', 17));
      if (p.path === 'pledge') { const me = g.hash;
        const ins = ctx.inputs.filter(x => x.output).map(x => ({ out: x.output, data: x.data })), outs = ctx.tx.outputs.map((o, j) => ({ out: o, data: ctx.tx.outputs_data[j] }));
        const cr = sumPledges(outs, p.plc, me, true), cs = sumPledges(ins, p.plc, me, false);
        r.push(R.check(o.status === 0, '旧状态为 Active', 'old status is Active', 16), R.check(immut(o, n), '不可变字段与 [57..] 未改变', 'immutable fields and [57..] unchanged', 16));
        if (cr.err || cs.err) return r.concat([R.check(false, '本 campaign 的 pledge cell 合法（data ≥ 72B / amount ≥ 100 CKB / capacity ≥ amount + occupied）', "this campaign's pledge cells are valid (data ≥ 72B / amount ≥ 100 CKB / capacity ≥ amount + occupied)", cr.err || cs.err)]);
        r.push(R.check(cr.t > cs.t && n.total === o.total + cr.t - cs.t, `新 total ${n.total} = 旧 ${o.total} + Σ新建 ${cr.t} − Σ消耗 ${cs.t}（且净流入 > 0）`, `new total ${n.total} = old ${o.total} + Σcreated ${cr.t} − Σconsumed ${cs.t} (net inflow > 0)`, 16));
        return r; }
      const sb = sinceBlock(p.inp[0].since);
      r.push(R.check(sb !== null && sb >= o.deadline, `since 为绝对区块号且 ≥ deadline ${o.deadline}`, `since is an absolute block number ≥ deadline ${o.deadline}`, 10),
        R.check(o.status === 0, '旧状态为 Active', 'old status is Active', 10), R.check(immut(o, n) && o.total === n.total, '不可变字段与 total_pledged 未改变', 'immutable fields and total_pledged unchanged', 10),
        R.check(n.status === 1 ? o.total >= o.goal : o.total < o.goal, `${ST[n.status]} 与 total ${o.total} / goal ${o.goal} 相符`, `${ST[n.status]} matches total ${o.total} / goal ${o.goal}`, 18));
      return r; }
    if (p.path === 'destroy') { const o = p.old; if (o.err) return r.concat([R.check(false, 'data 可解析', 'data parses', o.err)]);
      if (o.status === 0) return r.concat([R.check(false, 'Active 不可销毁', 'Active cannot be destroyed', 13)]);
      const plIn = ctx.inputs.some(x => x.output && x.output.lock.code_hash === p.plc);
      const paid = ctx.tx.outputs.reduce((s, x) => s + (R.scriptHash(x.lock) === o.creator ? BigInt(x.capacity) : 0n), 0n), cap = BigInt(p.inp[0].out.capacity);
      const sb = sinceBlock(p.inp[0].since);
      return r.concat([R.check(!plIn, '同一交易未花费 pledge-lock cell', 'no pledge-lock cell spent in the same tx', 25),
        R.check(paid >= (cap > FEE ? cap - FEE : 0n), `付给创建者 ${paid} ≥ ${cap} − 1 CKB`, `paid to creator ${paid} ≥ ${cap} − 1 CKB`, 24),
        R.check(sb !== null && sb >= o.deadline + GRACE, 'since 为绝对区块号且 ≥ deadline + 1,944,000', 'since is an absolute block ≥ deadline + 1,944,000', 13)]); }
    return r; }
  R.register({ id: 'crowdcell_campaign', kind: 'type', name: { zh: 'CrowdCell 众筹 campaign', en: 'CrowdCell campaign' },
    match: [{ code_hash: '0x1d9b9e5959c932c0ff6486e03cd69d0e51a6b087dacf80b909c23d713bd2659c', hash_type: 'data2', net: 'testnet', src: 'alesfer001/CrowdCell README + deployment/deployed-contracts-testnet.json (hash_type data2: off-chain/frontend/src/lib/constants.ts)', deps: { testnet: { tx_hash: '0x609fbcf58825e83af21e2a5cc28d3f217d5019be75290e6f60455cf3de9ca1ba', index: '0x0' } } }], parse, check });
})((typeof CKB !== "undefined" ? CKB : require("../../lib/ckb.js")));
