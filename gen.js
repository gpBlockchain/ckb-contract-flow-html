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
  colon: { zh: '：', en: ': ' },
  toggle: { zh: 'EN', en: '中文' },
  defTitle: { zh: 'CKB 合约约束', en: 'CKB Contract Constraints' },
  txTitle: { zh: '链上交易解码器', en: 'On-chain Transaction Decoder' },
  indexTitle: { zh: 'CKB 合约 Cell 流转约束', en: 'CKB Contract Cell-Flow Constraints' },
};

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
const col = (f, i) => f.color != null ? f.color : i % 6;
const layoutBox = b => `<div class="layout"><span class="n">${T(b.label)}</span>
<div class="strip">${b.layout.map((f, i) => `<div class="seg c${col(f, i)}" style="flex:${f.flex || 1}"><b>${T(f.name, esc)}</b><small>${T(f.size, esc)}</small></div>`).join('')}</div>
<ul class="fields">${b.layout.filter(f => f.role || f.cons || f.err).map((f, i) => `<li><span class="dot c${col(f, b.layout.indexOf(f))}"></span><b>${T(f.name, esc)}</b> <span class="sz">${T(f.size, esc)}</span>　${T(f.role)}${f.cons ? `　<span class="cons">${T(f.cons)}</span>` : ''}${f.err ? ` <span class="e">(${esc(f.err)})</span>` : ''}</li>`).join('')}</ul>
${b.hex ? `<div class="hex">${b.hex.map(h => `<div><span class="hk">${T(h[0], esc)}</span>${T(h[1])}</div>`).join('')}</div>` : ''}
${b.note ? `<div class="note">${T(b.note)}</div>` : ''}</div>`;
const box = b => b.layout ? layoutBox(b) : `<div class="cell"><span class="n">${T(b.label)}</span>${T(b.body)}</div>`;
const sep = c => /^[≤≥=<>]/.test(plain(c, 'zh')) ? ' ' : T(UI.colon, esc);

function render(spec, id) {
  const meta = id ? META.load(id) : null, plugin = id ? pluginOf(id) : null;
  const head = meta ? MH().chips(META.tagsOf(meta, plugin)) + MH().credit(meta) : '';
  const prov = meta ? `<div class="card">${MH().provenance(meta)}</div>` : '';
  const cards = (spec.transitions || []).map(t => `
<div class="card">
<h2><span>${T(t.tag, esc)}</span>${T(t.title, esc)}</h2>
<div class="flow">
<div class="col">${(t.inputs || []).map(box).join('\n')}</div>
<div class="arrow">➜</div>
<div class="col">${(t.outputs || []).map(box).join('\n')}</div>
</div>
${(t.sections || []).map(sc => `<div class="sec"><h3>${T(sc.title, esc)}</h3><div class="secgrid">${(sc.boxes || []).map(box).join('\n')}</div></div>`).join('\n')}
${(t.layouts || []).map(layoutBox).join('\n')}
${(t.extras || []).map(x => `<div class="extra">${T(x)}</div>`).join('\n')}
${t.limits && t.limits.length ? `<div class="limits"><h3>${T(UI.limits, esc)}</h3><ul>
${t.limits.map(l => `<li><b>${T(l.field, esc)}</b>${sep(l.cond)}${T(l.cond)}${l.err != null && l.err !== '' ? ` <span class="e">(${esc(l.err)})</span>` : ''}${l.note ? ` <span class="note">(${T(l.note)})</span>` : ''}</li>`).join('\n')}
</ul></div>` : ''}
</div>`).join('\n');
  const title = spec.title || UI.defTitle;
  const tpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
  return tpl.replace('{{DOC_TITLE}}', esc(plain(title, 'zh') === plain(title, 'en') ? plain(title, 'en') : plain(title, 'zh') + ' / ' + plain(title, 'en')))
    .replace('{{TOGGLE}}', T(UI.toggle, esc))
    .replace('{{TITLE}}', T(title, esc))
    .replace('{{SUBTITLE}}', T(spec.subtitle) + head)
    .replace('{{CARDS}}', () => cards + prov)
    .replace('{{FOOTER}}', spec.notes ? `<div class="sub">${(Array.isArray(spec.notes) ? spec.notes : [spec.notes]).map(n => T(n)).join('<br>')}</div>` : '');
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
  const tpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
  const extra = fs.readFileSync(path.join(__dirname, 'tx-template.html'), 'utf8');
  const css = extra.slice(extra.indexOf('<style>'), extra.indexOf('</style>') + 8);
  const lib = fs.readFileSync(path.join(__dirname, 'lib/ckb.js'), 'utf8'), app = fs.readFileSync(path.join(__dirname, 'tx-app.js'), 'utf8');
  const C = require('./lib/contracts.js');
  const EX = C.list().filter(c => c.tests).flatMap(c => JSON.parse(fs.readFileSync(c.tests, 'utf8')).map(t => [t.tx, t.name || c.id, t.net || 'mainnet'])).filter((x, i, a) => a.findIndex(y => y[0] === x[0]) === i);
  const METAHTML = Object.fromEntries(C.list().map(c => { const m = META.load(c.id); return m ? [c.id, MH().chips(META.tagsOf(m, pluginOf(c.id))) + MH().credit(m) + MH().provenance(m, { compact: true })] : null; }).filter(Boolean));
  const plugins = C.ordered().map(c => `// ---- contracts/${c.id}/plugin.js ----\n` + fs.readFileSync(c.plugin, 'utf8')).join('\n');
  const form = `<div class="card"><div class="form">
<select id="net"><option value="https://mainnet.ckb.dev/rpc">mainnet · https://mainnet.ckb.dev/rpc</option><option value="https://testnet.ckb.dev/rpc">testnet · https://testnet.ckb.dev/rpc</option><option value="custom">${T({ zh: '自定义 RPC', en: 'custom RPC' }, esc)}</option></select>
<input id="custom" style="display:none" placeholder="http://127.0.0.1:8114">
<input id="hash" placeholder="0x… tx hash"><button class="go" id="go">${T({ zh: '解码', en: 'Decode' }, esc)}</button></div>
<div class="small">${T({ zh: '主网示例：', en: 'Mainnet examples: ' }, esc)}${EX.map(([h, n, net]) => `<a href="#" class="ex" data-h="${h}" data-net="${net}">${esc(n)}</a>`).join(' · ')}</div>
<div class="small">${T({ zh: `说明：按 lock / type script hash 分组；已加载插件：${C.ordered().map(c => c.id).join('、')}；签名不校验（标记 ○）。数据仅从你选择的 RPC 读取。`, en: `Notes: grouped by lock / type script hash; loaded plugins: ${C.ordered().map(c => c.id).join(', ')}; signatures are NOT verified (marked ○). Data is read only from the RPC you choose.` })}</div></div>
<div id="result"></div>`;
  const html = tpl.replace('{{DOC_TITLE}}', esc(UI.txTitle.zh + ' / ' + UI.txTitle.en)).replace('{{TOGGLE}}', T(UI.toggle, esc))
    .replace('{{TITLE}}', T(UI.txTitle, esc)).replace('{{SUBTITLE}}', T({ zh: '输入交易 hash，解码为 cell 流转卡片并做无签名约束检查', en: 'Enter a tx hash to decode it into cell-flow cards with signature-free constraint checks' }))
    .replace('{{CARDS}}', form).replace('{{FOOTER}}', '')
    .replace('</style>', () => css.replace('<style>', '').replace('</style>', '') + '</style>');
    const scripts = `<script>window.CKB_META_HTML=${JSON.stringify(METAHTML).replace(/</g, '\\u003c')};</script><script>\n${lib.replace(/<\/script/gi, '<\\/script')}\n</script><script>\n${plugins.replace(/<\/script/gi, '<\\/script')}\n</script><script>\n${app.replace(/<\/script/gi, '<\\/script')}\n</script>`;
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
    const tpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8'), mh = MH(), counts = {};
    const cards = items.filter(([n]) => n !== 'tx').map(([n, t]) => { const m = META.load(n) || {}, tags = META.tagsOf(m, pluginOf(n));
      (m.contributors || []).forEach(u => counts[u] = (counts[u] || 0) + 1);
      const text = [n, plain(t, 'zh'), plain(t, 'en'), ...tags.map(x => META.TAX.tags[x] ? META.TAX.tags[x].zh + ' ' + META.TAX.tags[x].en : x)].join(' ').toLowerCase();
      return `<li class="ci" data-tags="${esc(tags.join(' '))}" data-text="${esc(text)}"><a href="${n}.html">${T(t, esc)}</a> ${mh.badge(m)}<div class="mono small">${esc(n)}</div>${mh.chips(tags)}${(m.contributors || []).length ? `<div class="avs">${m.contributors.map(mh.avatar).join('')}</div>` : ''}</li>`; }).join('');
    const groups = Object.entries(META.TAX.groups).map(([g, d]) => `<div class="fg"><b>${T(d.label, esc)}</b> ${Object.entries(META.TAX.tags).filter(([, x]) => x.group === g).map(([k, x]) => `<button class="tag g-${g}" data-f="${k}" data-g="${g}" aria-pressed="false">${T({ zh: x.zh, en: x.en }, esc)}</button>`).join('')}</div>`).join('');
    const people = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const hero = `<style>.hero{background:#f5f8ff;color:#1f2937;border:1px solid #c7d2fe;border-left:4px solid #4f6bed;border-radius:12px;padding:16px;margin-bottom:16px}.hero h2{margin:0 0 4px;color:#1e3a8a;font-size:1.2em}.hero p{margin:0 0 12px;color:#4b5563;font-size:.92em}.hero .row{display:flex;gap:8px;flex-wrap:wrap}.hero input{flex:1 1 260px;min-width:0;padding:10px 12px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;font-family:monospace;font-size:14px}.hero select{padding:10px;border-radius:8px;border:1px solid #cbd5e1;background:#fff}.hero button{padding:10px 18px;border-radius:8px;border:0;background:#4f6bed;color:#fff;font-weight:600;cursor:pointer}.hero a{color:#4f6bed}</style>
<div class="hero"><h2>${T(UI.txTitle, esc)}</h2><p>${T({ zh: '粘贴交易 hash，一键拆成 cell 流转卡片，并按合约规则逐条检查', en: 'Paste a tx hash to split it into cell-flow cards and check each contract rule' }, esc)}</p>
<div class="row"><input id="hx" placeholder="0x… tx hash" aria-label="tx hash"><select id="hn"><option value="https://mainnet.ckb.dev/rpc">mainnet</option><option value="https://testnet.ckb.dev/rpc">testnet</option></select><button id="hg">${T({ zh: '解码', en: 'Decode' }, esc)}</button></div>
<div class="small" style="margin-top:8px"><a href="tx.html">${T({ zh: '打开完整解码器 →', en: 'Open full decoder →' }, esc)}</a></div></div>
<script>(function(){var i=document.getElementById('hx'),n=document.getElementById('hn');function g(){var h=i.value.trim();if(!h)return i.focus();location.href='tx.html#'+new URLSearchParams({tx:h,rpc:n.value})}document.getElementById('hg').onclick=g;i.onkeydown=function(e){if(e.key==='Enter')g()}})();</script>`;
    const list = hero + `<div class="card"><div class="form"><input id="q" type="search" placeholder="search / 搜索 (id, name, tag)" aria-label="search"></div>
<div class="filters">${groups}</div><div class="small" id="cnt"></div><ul class="cards">${cards}</ul>
</div>
<div class="card"><h2>${T({ zh: '贡献者', en: 'Contributors' }, esc)}</h2>${people.length ? `<ul class="people">${people.map(([u, k]) => `<li>${mh.avatar(u)} <a href="https://github.com/${esc(u)}">@${esc(u)}</a> · ${k}</li>`).join('')}</ul>` : ''}
<div class="small">${T({ zh: '欢迎贡献新合约：见 docs/ADD_CONTRACT.md，并在 meta.json 的 contributors 中加上你的 GitHub 用户名。', en: 'New contracts welcome: see docs/ADD_CONTRACT.md and add your GitHub username to contributors in meta.json.' }, esc)}</div></div>
<script>(function(){var on={},q=document.getElementById('q'),li=[].slice.call(document.querySelectorAll('.ci')),cnt=document.getElementById('cnt');
function run(){var s=(q.value||'').toLowerCase().trim(),n=0;li.forEach(function(e){var t=' '+e.getAttribute('data-tags')+' ',ok=Object.keys(on).every(function(g){var a=on[g];return !a.length||a.some(function(k){return t.indexOf(' '+k+' ')>=0})})&&(!s||e.getAttribute('data-text').indexOf(s)>=0);e.style.display=ok?'':'none';if(ok)n++});cnt.textContent=n+' / '+li.length}
[].forEach.call(document.querySelectorAll('.filters button'),function(b){b.onclick=function(){var g=b.getAttribute('data-g'),k=b.getAttribute('data-f'),a=on[g]=on[g]||[],i=a.indexOf(k);if(i>=0)a.splice(i,1);else a.push(k);b.setAttribute('aria-pressed',i<0);run()}});
q.oninput=run;run()})();</script>`;
    fs.writeFileSync(path.join(od, 'index.html'), tpl.replace('{{DOC_TITLE}}', esc(UI.indexTitle.zh + ' / ' + UI.indexTitle.en))
      .replace('{{TOGGLE}}', T(UI.toggle, esc)).replace('{{TITLE}}', T(UI.indexTitle, esc)).replace('{{SUBTITLE}}', '')
      .replace('{{CARDS}}', () => list).replace('{{FOOTER}}', ''));
  } else {
    build(a[0], a[1] || path.join('out', path.basename(a[0]).replace(/\.(json|ya?ml)$/i, '') + '.html'));
  }
}
if (require.main === module) main();
module.exports = { render, parseYaml, T, buildTx };
