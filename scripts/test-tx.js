// Node test: run the page's inline scripts with a stub DOM, decode real mainnet txs, check bilingual output.
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/../out/tx.html', 'utf8');
const scripts = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
global.window = globalThis; global.document = { querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute() { return 'zh' } } };
global.localStorage = { getItem: () => null, setItem() {} }; global.navigator = { language: 'zh-CN' }; global.addEventListener = () => {};
for (const s of scripts) eval(s);
const C = window.CKB, render = window.__txRender;
const RPC = process.env.RPC || 'https://mainnet.ckb.dev/rpc';
const TXS = (process.argv.slice(2).length ? process.argv.slice(2) : [...h.matchAll(/data-h="(0x[0-9a-f]{64})"/g)].map(m => m[1]));
(async () => {
  if (C.ckbHash(new Uint8Array()) !== '0x44f4c69744d5f8c55d642062949dcae49bc4e7ef43d388c5a12f42b5633d163e') throw new Error('blake2b vector');
  const g = await C.rpc(RPC, 'get_transaction', ['0xe2fb199810d49a4d8beec56718ba2593b665db9d52299a0f9e6e75416d73ff5c']);
  if (C.scriptHash(g.transaction.outputs[1].type) !== C.KNOWN[0].code_hash || C.scriptHash(g.transaction.outputs[2].type) !== C.KNOWN[3].code_hash) throw new Error('script hash vector');
  console.log('vectors ok (empty blake2b, genesis secp & DAO type-id hashes)');
  let fail = 0;
  for (const t of TXS) {
    const b = await C.fetchTxBundle(RPC, t), a = C.analyze(b), html = render(b, a);
    const all = [...a.checks, ...a.groups.flatMap(g => g.checks)];
    const bad = all.filter(c => c.ok === false), unk = all.filter(c => c.ok === null).length;
    // bilingual: strip en/zh pairs, then no CJK may remain outside zh spans
    const noZh = html.replace(/<span data-l="zh">[\s\S]*?<\/span><span data-l="en">/g, '<span data-l="en">');
    const cjk = /[\u4e00-\u9fff]/.test(noZh.replace(/<span data-l="en">/g, ''));
    console.log(t, `groups=${a.groups.length} [${a.groups.map(g => g.known ? g.known.id : 'unknown').join(',')}] checks=${all.length} failed=${bad.length} unchecked=${unk} html=${html.length}B bilingual=${!cjk}`);
    bad.forEach(c => console.log('   ✗', c.en));
    if (bad.length || cjk) fail++;
  }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
