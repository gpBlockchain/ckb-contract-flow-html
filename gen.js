#!/usr/bin/env node
// Zero-dependency generator / 零依赖生成器
//   node gen.js specs/dao.json [out/dao.html]
//   node gen.js --all [out]   (builds contracts/*/spec.json + tx.html + index.html)
// 任意文本字段可为字符串（语言无关）或 {"zh": "...", "en": "..."}。
'use strict';
const fs = require('fs'), path = require('path');
const META = require('./lib/meta.js');
let _mh; const MH = () => _mh || (_mh = require('./lib/meta-html.js')(T, esc));
const pluginOf = id => { try { return require('./lib/contracts.js').loadAll().PLUGINS.find(p => p.id === id); } catch (e) { return null; } };

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// {{text}} → highlight
const hl = s => esc(s).replace(/\{\{([\s\S]*?)\}\}(?!\})/g, '<span class="hl">$1</span>');
const isI18n = x => x && typeof x === 'object' && !Array.isArray(x) && ('zh' in x || 'en' in x);
// render text: bilingual → two spans; plain string → as is
const T = (x, f = hl) => x == null ? '' : isI18n(x)
  ? `<span data-l="zh">${f(x.zh != null ? x.zh : x.en)}</span><span data-l="en">${f(x.en != null ? x.en : x.zh)}</span>` : f(x);
const plain = (x, lang) => x == null ? '' : isI18n(x) ? (x[lang] != null ? x[lang] : x.zh || x.en) : String(x);
const UI = {
  limits: { zh: '限制', en: 'Constraints' },
  contracts: { zh: '合约', en: 'Contracts' },
  none: { zh: '（无）', en: '(none)' },
  defTitle: { zh: 'CKB 合约约束', en: 'CKB Contract Constraints' },
  txTitle: { zh: '链上交易解码器', en: 'On-chain Transaction Decoder' },
  indexTitle: { zh: 'CKB 合约 Cell 流转约束', en: 'CKB Contract Cell-Flow Constraints' },
  indexSub: { zh: '把每个 CKB 合约拆成状态转换：输入 Cell → 输出 Cell，高亮被约束的字段，逐条列出条件与错误码。', en: 'Every CKB contract broken into state transitions: input cells → output cells, constrained fields highlighted, each condition listed with its error code.' },
  txSub: { zh: '输入交易 hash，解码为 cell 流转卡片并做无签名约束检查', en: 'Enter a tx hash to decode it into cell-flow cards with signature-free constraint checks' },
  examples: { zh: '真实交易', en: 'Real transactions' },
  examplesSub: { zh: '在解码器里打开，看这些规则在链上交易中的实际检查结果。', en: 'Open one in the decoder to see these rules checked against a real on-chain transaction.' },
  openDecoder: { zh: '在解码器中打开', en: 'Open in decoder' },
  lgIn: { zh: '输入：交易消耗的 Cell', en: 'Inputs: cells the transaction consumes' },
  lgOut: { zh: '输出：交易创建的 Cell', en: 'Outputs: cells it creates' },
  lgHl: { zh: '脚本会检查的字段', en: 'a field the script checks' },
  lgErr: { zh: '条件不满足时脚本返回的错误码', en: 'error code the script returns when the condition fails' },
  notFound: { zh: '页面不存在', en: 'Page not found' },
};
// public site root (GitHub Pages) for canonical / Open Graph / sitemap URLs; forks can set SITE_URL
const SITE = (process.env.SITE_URL || 'https://gpblockchain.github.io/ckb-contract-flow-html/').replace(/\/?$/, '/');
const RPC = { mainnet: 'https://mainnet.ckb.dev/rpc', testnet: 'https://testnet.ckb.dev/rpc' };
const attr = s => esc(s).replace(/"/g, '&quot;');
// shared inline icons (paths closed explicitly: scripts/check.js balances every tag)
const ARROW = '<div class="arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></div>';
const GO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>';
const EXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"></path></svg>';
// "how to read" strip: [sample html, bilingual text] pairs
const legend = (items, cls = '') => `<div class="legend${cls}">${items.map(([x, t]) => `<span class="lg">${x}<span>${T(t, esc)}</span></span>`).join('')}</div>`;
const FLOW_LEGEND = legend([['<i class="sw sw-in"></i>', UI.lgIn], ['<i class="sw sw-out"></i>', UI.lgOut],
  [`<span class="hl">${T({ zh: '字段', en: 'field' }, esc)}</span>`, UI.lgHl], ['<span class="e">-2</span>', UI.lgErr]]);

// Fill template.html. Every page goes through here, so no placeholder is left behind.
function page({ docTitle, desc, file, crumb = '', title, subtitle = '', cards = '', footer = '', head = '' }) {
  const url = file == null ? '' : SITE + (file === 'index.html' ? '' : file);
  const meta = [`<meta name="description" content="${attr(desc)}">`, url && `<link rel="canonical" href="${attr(url)}">`,
    '<meta property="og:type" content="website">', '<meta property="og:site_name" content="CKB Contract Flow">',
    `<meta property="og:title" content="${attr(docTitle)}">`, `<meta property="og:description" content="${attr(desc)}">`, url && `<meta property="og:url" content="${attr(url)}">`,
    `<meta property="og:image" content="${attr(SITE)}og.png">`, '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">', head].filter(Boolean).join('\n');
  return fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8')
    .replace('{{DOC_TITLE}}', () => esc(docTitle)).replace('{{HEAD}}', () => meta).replace('{{CRUMB}}', () => crumb)
    .replace('{{TITLE}}', () => T(title, esc)).replace('{{SUBTITLE}}', () => subtitle)
    .replace('{{CARDS}}', () => cards).replace('{{FOOTER}}', () => footer);
}
const bi = x => plain(x, 'zh') === plain(x, 'en') ? plain(x, 'en') : plain(x, 'zh') + ' / ' + plain(x, 'en');
const testsOf = id => { const f = path.join(__dirname, 'contracts', id, 'tests.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []; };

function loadSpec(file) {
  const txt = fs.readFileSync(file, 'utf8');
  if (/\.ya?ml$/i.test(file)) return parseYaml(txt);
  return JSON.parse(txt);
}

// 极简 YAML 子集（缩进映射 / "- " 列表 / 标量 / "|" 多行块）。复杂需求请用 JSON。
function parseYaml(src) {
  const lines = src.replace(/\t/g, '  ').split('\n').filter(l => !/^\s*(#.*)?$/.test(l) || /^\s*$/.test(l) && false);
  let i = 0;
  const ind = l => l.match(/^ */)[0].length;
  const scalar = v => {
    v = v.trim();
    if (/^".*"$/.test(v)) return JSON.parse(v);
    if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
    if (v === 'null' || v === '~') return null;
    if (v === 'true') return true; if (v === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    return v;
  };
  function block(level) {
    const out = [];
    while (i < lines.length && (lines[i].trim() === '' || ind(lines[i]) > level)) { out.push(lines[i].slice(level + 1 > 0 ? Math.min(ind(lines[i]), level + 2) : 0)); i++; }
    return out.join('\n').replace(/\n+$/, '');
  }
  function node(level) {
    if (i >= lines.length) return null;
    const isList = lines[i].trimStart().startsWith('- ') || lines[i].trim() === '-';
    if (isList) {
      const arr = [];
      while (i < lines.length && ind(lines[i]) === level && /^\s*-( |$)/.test(lines[i])) {
        const rest = lines[i].trimStart().slice(1).trim();
        if (!rest) { i++; arr.push(node(ind(lines[i]))); continue; }
        if (/^[^"'][^:]*:( |$)/.test(rest)) { // 列表项为映射
          lines[i] = ' '.repeat(level + 2) + rest;
          arr.push(map(level + 2));
        } else { i++; arr.push(scalar(rest)); }
      }
      return arr;
    }
    return map(level);
  }
  function map(level) {
    const obj = {};
    while (i < lines.length && ind(lines[i]) === level && !/^\s*- /.test(lines[i])) {
      const m = lines[i].trim().match(/^([^:]+):\s*(.*)$/);
      if (!m) throw new Error('YAML 解析失败: ' + lines[i]);
      i++;
      const k = m[1].trim(), v = m[2];
      if (v === '|') obj[k] = block(level);
      else if (v === '') {
        while (i < lines.length && lines[i].trim() === '') i++;
        obj[k] = i < lines.length && ind(lines[i]) > level ? node(ind(lines[i])) :
          (i < lines.length && ind(lines[i]) === level && /^\s*- /.test(lines[i]) ? node(level) : null);
      } else obj[k] = scalar(v);
    }
    return obj;
  }
  for (let j = 0; j < lines.length; j++) lines[j] = lines[j].replace(/\s+#.*$/, m => /["']/.test(m) ? m : '');
  lines.splice(0, lines.length, ...lines.filter(l => !/^\s*#/.test(l)));
  while (i < lines.length && lines[i].trim() === '') i++;
  return node(ind(lines[i] || ''));
}

// Byte-layout box / 字节布局 box：{ label, layout:[{name,size,color,flex,role,cons,err}], hex?:[[k,v]], note? }
const col = (f, i) => f.color != null ? f.color : i % 8;
const layoutBox = b => `<div class="layout"><span class="n">${T(b.label)}</span>
<div class="strip">${b.layout.map((f, i) => `<div class="seg c${col(f, i)}" style="flex:${f.flex || 1}"><b>${T(f.name, esc)}</b><small>${T(f.size, esc)}</small></div>`).join('')}</div>
<ul class="fields">${b.layout.filter(f => f.role || f.cons || f.err).map(f => `<li><span class="fk"><span class="dot c${col(f, b.layout.indexOf(f))}"></span><b>${T(f.name, esc)}</b><span class="sz">${T(f.size, esc)}</span></span><span class="fd">${T(f.role)}${f.cons ? `<span class="cons">${T(f.cons)}</span>` : ''}</span><span class="e">${f.err ? T(f.err, esc) : ''}</span></li>`).join('')}</ul>
${b.hex ? `<div class="hex">${b.hex.map(h => `<div><span class="hk">${T(h[0], esc)}</span><span class="hv">${T(h[1])}</span></div>`).join('')}</div>` : ''}
${b.note ? `<div class="note">${T(b.note)}</div>` : ''}</div>`;
const box = b => b.layout ? layoutBox(b) : `<div class="cell"><span class="n">${T(b.label)}</span>${T(b.body)}</div>`;
const none = `<div class="none">${T(UI.none, esc)}</div>`;

function render(spec, id) {
  const meta = id ? META.load(id) : null, plugin = id ? pluginOf(id) : null;
  const head = meta ? MH().chips(META.tagsOf(meta, plugin)) + MH().credit(meta) : '';
  const prov = meta ? `<div class="card">${MH().provenance(meta)}</div>` : '';
  const ts = spec.transitions || [];
  const crumb = id ? `<nav class="crumb"><a href="index.html">${T(UI.contracts, esc)}</a><span aria-hidden="true">/</span><code>${esc(id)}</code></nav>` : '';
  const exs = id ? testsOf(id) : [], mh = MH();
  const toc = ts.length > 1 || exs.length ? `<nav class="toc">${ts.map((t, i) => `<a href="#t${i + 1}"><span class="tg">${T(t.tag, esc)}</span>${T(t.title, esc)}</a>`).join('')}${exs.length ? `<a href="#txs"><span class="tg">tx</span>${T(UI.examples, esc)}<span class="cnt">${exs.length}</span></a>` : ''}</nav>` : '';
  // real txs from tests.json → open in the decoder (deep link) or the explorer
  const examples = exs.length ? `<div class="card" id="txs"><h2>${T(UI.examples, esc)}<span class="cnt">${exs.length}</span></h2><p class="small">${T(UI.examplesSub, esc)}</p>
<ul class="txl">${exs.map(t => { const net = t.net || 'mainnet'; return `<li><a class="txa" href="${attr('tx.html#' + new URLSearchParams({ tx: t.tx, rpc: RPC[net] }))}"><span class="txn">${esc(t.name || t.tx)}</span><code>${esc(mh.short(t.tx))}</code>${mh.chip(net)}<span class="go">${T(UI.openDecoder, esc)}${GO}</span></a><a class="exp" href="${attr(mh.EXP[net] + '/transaction/' + t.tx)}" target="_blank" rel="noopener" title="CKB Explorer" aria-label="CKB Explorer">${EXT}</a></li>`; }).join('')}</ul></div>` : '';
  const cards = ts.map((t, i) => `
<div class="card" id="t${i + 1}">
<h2><span class="tg">${T(t.tag, esc)}</span>${T(t.title, esc)}</h2>
<div class="flow">
<div class="col cin"><div class="colh">${T({ zh: 'Inputs 输入', en: 'Inputs' }, esc)}</div>${(t.inputs || []).map(box).join('\n') || none}</div>
${ARROW}
<div class="col cout"><div class="colh">${T({ zh: 'Outputs 输出', en: 'Outputs' }, esc)}</div>${(t.outputs || []).map(box).join('\n') || none}</div>
</div>
${(t.sections || []).map(sc => `<div class="sec"><h3>${T(sc.title, esc)}</h3><div class="secgrid">${(sc.boxes || []).map(box).join('\n')}</div></div>`).join('\n')}
${(t.layouts || []).map(layoutBox).join('\n')}
${(t.extras || []).map(x => `<div class="extra">${T(x)}</div>`).join('\n')}
${t.limits && t.limits.length ? `<div class="limits"><h3>${T(UI.limits, esc)}</h3><ul>
${t.limits.map(l => `<li><b>${T(l.field, esc)}</b><span class="lc">${T(l.cond)}${l.note ? `<span class="note">${T(l.note)}</span>` : ''}</span><span class="e">${l.err != null && l.err !== '' ? T(l.err, esc) : ''}</span></li>`).join('\n')}
</ul></div>` : ''}
</div>`).join('\n');
  const title = spec.title || UI.defTitle, n = ts.length;
  return page({ docTitle: bi(title), file: id ? id + '.html' : null, crumb, title, subtitle: T(spec.subtitle) + head,
    desc: `${plain(title, 'zh')}：${n} 个状态转换的输入/输出 Cell、被检查的字段与错误码。 ${plain(title, 'en')}: input/output cells, checked fields and error codes for ${n} state transition${n === 1 ? '' : 's'}.`,
    cards: toc + FLOW_LEGEND + cards + examples + prov,
    footer: spec.notes ? `<div class="notes"><div>${(Array.isArray(spec.notes) ? spec.notes : [spec.notes]).map(n => T(n)).join('<br>')}</div></div>` : '' });
}

function build(inFile, outFile, id) {
  const spec = loadSpec(inFile);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, render(spec, id));
  console.log(`${inFile} -> ${outFile}`);
  return spec;
}

// On-chain tx decoder page (same look & toggle)
function buildTx(outFile) {
  const extra = fs.readFileSync(path.join(__dirname, 'tx-template.html'), 'utf8');
  const css = extra.slice(extra.indexOf('<style>'), extra.indexOf('</style>') + 8);
  const lib = fs.readFileSync(path.join(__dirname, 'lib/ckb.js'), 'utf8'), app = fs.readFileSync(path.join(__dirname, 'tx-app.js'), 'utf8');
  const C = require('./lib/contracts.js');
  const EX = C.list().filter(c => c.tests).flatMap(c => JSON.parse(fs.readFileSync(c.tests, 'utf8')).map(t => [t.tx, t.name || c.id, t.net || 'mainnet', c.id])).filter((x, i, a) => a.findIndex(y => y[0] === x[0]) === i);
  const EXG = {}; for (const [h, n, net, id] of EX) (EXG[id] = EXG[id] || []).push(`<a href="#" class="ex" data-h="${h}" data-net="${net}">${esc(n)}</a>`);
  const METAHTML = Object.fromEntries(C.list().map(c => { const m = META.load(c.id); return m ? [c.id, MH().chips(META.tagsOf(m, pluginOf(c.id))) + MH().credit(m) + MH().provenance(m, { compact: true })] : null; }).filter(Boolean));
  const plugins = C.ordered().map(c => `// ---- contracts/${c.id}/plugin.js ----\n` + fs.readFileSync(c.plugin, 'utf8')).join('\n');
  const ids = C.ordered().map(c => c.id);
  const form = `<div class="card dec"><div class="bar">
<select id="net" aria-label="RPC"><option value="${RPC.mainnet}">mainnet · ${RPC.mainnet}</option><option value="${RPC.testnet}">testnet · ${RPC.testnet}</option><option value="custom">custom RPC</option></select>
<input id="hash" placeholder="0x… tx hash" aria-label="tx hash" spellcheck="false" autocomplete="off"><button class="btn" id="go">${T({ zh: '解码', en: 'Decode' }, esc)}${GO}</button></div>
<input id="custom" class="inp" style="display:none" placeholder="http://127.0.0.1:8114" aria-label="custom RPC" spellcheck="false">
<details class="exs"><summary>${T({ zh: '示例交易', en: 'Example transactions' }, esc)}<span class="cnt">${EX.length}</span></summary><div class="exl">${Object.entries(EXG).map(([id, xs]) => `<div class="exg"><code>${esc(id)}</code><div>${xs.join('')}</div></div>`).join('')}</div></details>
${legend([['<span class="ic ok">✓</span>', { zh: '检查通过', en: 'check passed' }], ['<span class="ic bad">✗</span>', { zh: '检查不通过', en: 'check failed' }], ['<span class="ic unk">○</span>', { zh: '未检查（签名不校验）', en: 'not checked (signatures are NOT verified)' }]], ' lg-tx')}
<p class="small dnote">${T({ zh: '按 lock / type script hash 分组；数据仅从你选择的 RPC 读取。', en: 'Grouped by lock / type script hash; data is read only from the RPC you choose.' })}</p>
<details class="more"><summary>${T({ zh: '已加载插件', en: 'Loaded plugins' }, esc)}<span class="cnt">${ids.length}</span></summary><p class="plg">${ids.map(x => `<code>${esc(x)}</code>`).join(' ')}</p></details></div>
<div id="result"></div>`;
  const html = page({ docTitle: bi(UI.txTitle), desc: UI.txSub.zh + '。 ' + UI.txSub.en + '.', file: 'tx.html', title: UI.txTitle, subtitle: T(UI.txSub), cards: form })
    .replace('</style>', () => css.replace('<style>', '').replace('</style>', '') + '</style>');
  const pages = C.list().filter(c => c.spec).map(c => c.id); // decoder links a recognized script to its constraints page
    const scripts = `<script>window.CKB_META_HTML=${JSON.stringify(METAHTML).replace(/</g, '\\u003c')};window.CKB_PAGES=${JSON.stringify(pages)};</script><script>\n${lib.replace(/<\/script/gi, '<\\/script')}\n</script><script>\n${plugins.replace(/<\/script/gi, '<\\/script')}\n</script><script>\n${app.replace(/<\/script/gi, '<\\/script')}\n</script>`;
  const html2 = html.replace('</body>', () => scripts + '</body>');
  fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, html2); console.log(`(tx decoder) -> ${outFile}`);
}

function main() {
  const a = process.argv.slice(2);
  if (!a.length) { console.error('Usage / 用法: node gen.js <spec.json|yaml> [out.html]\n                 node gen.js --all [outDir=out]   (discovers contracts/*/spec.json)'); process.exit(1); }
  if (a[0] === '--all') {
    const od = a[1] || 'out', items = [];
    for (const c of require('./lib/contracts.js').list()) if (c.spec) items.push([c.id, build(c.spec, path.join(od, c.id + '.html'), c.id).title || c.id]);
    buildTx(path.join(od, 'tx.html'));
    items.push(['tx', UI.txTitle]);
    const mh = MH(), counts = {}, st = {};
    const cards = items.filter(([n]) => n !== 'tx').map(([n, t]) => { const m = META.load(n) || {}, tags = META.tagsOf(m, pluginOf(n));
      (m.contributors || []).forEach(u => counts[u] = (counts[u] || 0) + 1); st[mh.status(m)] = (st[mh.status(m)] || 0) + 1;
      const text = [n, plain(t, 'zh'), plain(t, 'en'), ...tags.map(x => META.TAX.tags[x] ? META.TAX.tags[x].zh + ' ' + META.TAX.tags[x].en : x)].join(' ').toLowerCase();
      return `<li class="ci" data-tags="${esc(tags.join(' '))}" data-text="${esc(text)}"><a href="${n}.html">${T(t, esc)}</a>${mh.badge(m)}<div class="mono">${esc(n)}</div>${mh.chips(tags)}${(m.contributors || []).length ? `<div class="avs">${m.contributors.map(mh.avatar).join('')}</div>` : ''}</li>`; }).join('');
    const groups = Object.entries(META.TAX.groups).map(([g, d]) => `<div class="fg"><b>${T(d.label, esc)}</b>${Object.entries(META.TAX.tags).filter(([, x]) => x.group === g).map(([k, x]) => `<button class="tag g-${g}" data-f="${k}" data-g="${g}" aria-pressed="false">${T({ zh: x.zh, en: x.en }, esc)}</button>`).join('')}</div>`).join('');
    const people = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const hero = `<section class="hero"><div class="hero-h"><span class="hero-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"></path><path d="M8 9h5M8 12h8M8 15h6"></path></svg></span>
<div><h2>${T(UI.txTitle, esc)}</h2><p>${T({ zh: '粘贴交易 hash，一键拆成 cell 流转卡片，并按合约规则逐条检查', en: 'Paste a tx hash to split it into cell-flow cards and check each contract rule' }, esc)}</p></div></div>
<div class="bar"><input id="hx" placeholder="0x… tx hash" aria-label="tx hash" spellcheck="false" autocomplete="off"><select id="hn" aria-label="network"><option value="${RPC.mainnet}">mainnet</option><option value="${RPC.testnet}">testnet</option></select><button class="btn" id="hg">${T({ zh: '解码', en: 'Decode' }, esc)}${GO}</button></div>
<a class="hero-link" href="tx.html">${T({ zh: '打开完整解码器 →', en: 'Open full decoder →' }, esc)}</a></section>
<script>(function(){var i=document.getElementById('hx'),n=document.getElementById('hn');function g(){var h=i.value.trim();if(!h)return i.focus();location.href='tx.html#'+new URLSearchParams({tx:h,rpc:n.value})}document.getElementById('hg').onclick=g;i.onkeydown=function(e){if(e.key==='Enter')g()}})();</script>`;
    const list = hero + `<section class="browse"><div class="sh"><h2>${T(UI.contracts, esc)}</h2></div>
<div class="card fpanel"><div class="search"><input id="q" class="inp" type="search" placeholder="search / 搜索 (id, name, tag)" aria-label="search" autocomplete="off" spellcheck="false"><kbd class="kbd">/</kbd></div>
<div class="filters">${groups}</div><div id="projsel">${Object.keys(mh.PROJ).filter(k => META.TAX.tags[k]).map(mh.projectPanel).join('')}</div></div>
<div class="cntrow"><span id="cnt"></span><button id="copylink" class="copyl" type="button" title="copy a link to this filtered view">${T({ zh: '复制链接', en: 'Copy link' }, esc)}<span class="okm">${T({ zh: ' ✓ 已复制', en: ' ✓ copied' }, esc)}</span></button></div>
${legend(Object.keys(mh.BADGE).filter(s => st[s]).map(s => [mh.badgeOf(s), { zh: mh.MEANING[s][0], en: mh.MEANING[s][1] }]), ' lg-b')}<ul class="cards">${cards}</ul></section>
<div class="card" id="skill"><h2>${T({ zh: '一句话让 AI 生成', en: 'One sentence to your AI agent' }, esc)}</h2><p class="small">${T({ zh: '填入合约仓库 URL 或本地路径，复制这句话发给任意 coding agent（Claude Code / Cursor / Codex…），无需安装。', en: 'Fill in a contract repo URL or local path, copy the sentence and paste it to any coding agent (Claude Code / Cursor / Codex…). No install needed.' }, esc)}</p>
<input id="sku" class="inp" placeholder="https://github.com/owner/repo  or  /path/to/local/repo" aria-label="repo url" spellcheck="false">
<div class="code"><pre id="skp"></pre><button id="skc" class="copyl" type="button">${T({ zh: '复制', en: 'Copy' }, esc)}<span class="okm"> ✓</span></button></div>
<details class="more"><summary>${T({ zh: '可选：安装为 skill', en: 'Optional: install as a skill' }, esc)}</summary><pre>npx skills add gpBlockchain/ckb-contract-flow-html -g -y -a claude-code cursor codex
curl -fsSL https://raw.githubusercontent.com/gpBlockchain/ckb-contract-flow-html/main/install.sh | sh
/plugin marketplace add gpBlockchain/ckb-contract-flow-html   (Claude Code)</pre><a href="https://github.com/gpBlockchain/ckb-contract-flow-html/blob/main/skills/ckb-contract-flow/SKILL.md">SKILL.md →</a></details></div>
<script>(function(){var R='https://raw.githubusercontent.com/gpBlockchain/ckb-contract-flow-html/main/skills/ckb-contract-flow/SKILL.md',u=document.getElementById('sku'),p=document.getElementById('skp'),c=document.getElementById('skc');function f(){var v=u.value.trim(),zh=document.documentElement.getAttribute('data-lang')==='zh',r=v||(zh?'<合约仓库 URL 或本地路径>':'<contract repo URL or local path>');p.textContent=zh?'阅读 '+R+' 并按其步骤为 '+r+' 生成合约 cell 流转 HTML':'Read '+R+' and follow it to generate a cell-flow HTML for '+r}u.oninput=f;f();document.addEventListener('click',function(e){if(e.target.id!=='skc')setTimeout(f,0)});c.onclick=function(){f();if(navigator.clipboard)navigator.clipboard.writeText(p.textContent).then(function(){c.setAttribute('data-ok','1');setTimeout(function(){c.removeAttribute('data-ok')},1500)})}})();</script>
<div class="card"><h2>${T({ zh: '贡献者', en: 'Contributors' }, esc)}</h2>${people.length ? `<ul class="people">${people.map(([u, k]) => `<li>${mh.avatar(u)}<a href="https://github.com/${esc(u)}">@${esc(u)}</a><span class="k">${k}</span></li>`).join('')}</ul>` : ''}
<div class="small">${T({ zh: '欢迎贡献新合约：见 docs/ADD_CONTRACT.md，并在 meta.json 的 contributors 中加上你的 GitHub 用户名。', en: 'New contracts welcome: see docs/ADD_CONTRACT.md and add your GitHub username to contributors in meta.json.' }, esc)}</div></div>
<script>(function(){var on={},q=document.getElementById('q'),li=[].slice.call(document.querySelectorAll('.ci')),cnt=document.getElementById('cnt'),bs=[].slice.call(document.querySelectorAll('.filters button'));
// URL sync: ?<group>=a,b (project values without the "p-" prefix) &q=text; location.hash is left untouched
var pre=function(g){return g==='project'?'p-':''};
function panels(){var ps=on.project||[];[].forEach.call(document.querySelectorAll('#projsel .projp'),function(p){p.hidden=ps.indexOf(p.getAttribute('data-projp'))<0})}
function run(){var s=(q.value||'').toLowerCase().trim(),n=0;li.forEach(function(e){var t=' '+e.getAttribute('data-tags')+' ',ok=Object.keys(on).every(function(g){var a=on[g];return !a.length||a.some(function(k){return t.indexOf(' '+k+' ')>=0})})&&(!s||e.getAttribute('data-text').indexOf(s)>=0);e.style.display=ok?'':'none';if(ok)n++});cnt.textContent=n+' / '+li.length;panels()}
function toURL(){var u=new URLSearchParams();Object.keys(on).sort().forEach(function(g){if(on[g].length)u.set(g,on[g].map(function(k){return k.slice(pre(g).length)}).join(','))});var s=(q.value||'').trim();if(s)u.set('q',s);var qs=u.toString();try{history.replaceState(history.state,'',location.pathname+(qs?'?'+qs:'')+location.hash)}catch(e){}}
function fromURL(){var u=new URLSearchParams(location.search);on={};bs.forEach(function(b){var g=b.getAttribute('data-g'),k=b.getAttribute('data-f'),v=(u.get(g)||'').split(',').filter(Boolean).map(function(x){return pre(g)+x}),a=v.indexOf(k)>=0;if(a)(on[g]=on[g]||[]).push(k);b.setAttribute('aria-pressed',a)});q.value=u.get('q')||'';run()}
bs.forEach(function(b){b.onclick=function(){var g=b.getAttribute('data-g'),k=b.getAttribute('data-f'),a=on[g]=on[g]||[],i=a.indexOf(k);if(i>=0)a.splice(i,1);else a.push(k);b.setAttribute('aria-pressed',i<0);run();toURL()}});
q.oninput=function(){run();toURL()};window.addEventListener('popstate',fromURL);
document.addEventListener('keydown',function(e){var t=e.target;if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName||'')&&!t.isContentEditable){e.preventDefault();q.focus()}});
var cp=document.getElementById('copylink');if(cp)cp.onclick=function(){var url=location.href,done=function(){cp.setAttribute('data-ok','1');setTimeout(function(){cp.removeAttribute('data-ok')},1500)};if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(done,function(){prompt('URL',url)});else prompt('URL',url)};
fromURL()})();</script>`;
    fs.writeFileSync(path.join(od, 'index.html'), page({ docTitle: bi(UI.indexTitle), desc: UI.indexSub.zh + ' ' + UI.indexSub.en, file: 'index.html',
      title: UI.indexTitle, subtitle: `<p class="lead">${T(UI.indexSub, esc)}</p>`, cards: list }));
    // GitHub Pages serves 404.html for any missing path, at any depth: <base> keeps the relative links working
    fs.writeFileSync(path.join(od, '404.html'), page({ docTitle: bi(UI.notFound), desc: UI.notFound.zh + ' / ' + UI.notFound.en, file: null,
      head: `<meta name="robots" content="noindex">\n<base href="${attr(SITE)}">`, title: UI.notFound,
      subtitle: `<p class="lead">${T({ zh: '链接可能已失效，或者合约改了名字。可以在首页搜一下：', en: 'The link may be broken, or the contract was renamed. Try searching the index:' }, esc)}</p>`,
      cards: `<div class="card nf"><div class="bar"><input id="nq" placeholder="id / name / tag" aria-label="search" spellcheck="false" autocomplete="off"><button class="btn" id="ng">${T({ zh: '搜索', en: 'Search' }, esc)}${GO}</button></div>
<div class="nf-a"><a class="copyl" href="index.html">${T({ zh: '返回首页', en: 'Back to the index' }, esc)}</a><a class="copyl" href="tx.html">${T(UI.txTitle, esc)}</a></div></div>
<script>(function(){var q=document.getElementById('nq'),w='';try{w=decodeURIComponent(location.pathname.split('/').pop()||'').replace(/\.html?$/i,'')}catch(e){}if(w&&w!=='404')q.value=w;function s(){location.href=new URL('index.html'+(q.value.trim()?'?q='+encodeURIComponent(q.value.trim()):''),document.baseURI).href}document.getElementById('ng').onclick=s;q.onkeydown=function(e){if(e.key==='Enter')s()}})();</script>` }));
    const urls = ['', 'tx.html', ...items.filter(([n]) => n !== 'tx').map(([n]) => n + '.html')];
    fs.writeFileSync(path.join(od, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${esc(SITE + u)}</loc></url>`).join('\n')}\n</urlset>\n`);
    fs.copyFileSync(path.join(__dirname, 'assets', 'og.png'), path.join(od, 'og.png')); // Open Graph image (source: assets/og.html)
  } else {
    build(a[0], a[1] || path.join('out', path.basename(a[0]).replace(/\.(json|ya?ml)$/i, '') + '.html'));
  }
}
if (require.main === module) main();
module.exports = { render, parseYaml, T, buildTx };
