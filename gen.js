#!/usr/bin/env node
// Zero-dependency generator / 零依赖生成器
//   node gen.js specs/dao.json [out/dao.html]
//   node gen.js --all [specs] [out]
// 任意文本字段可为字符串（语言无关）或 {"zh": "...", "en": "..."}。
'use strict';
const fs = require('fs'), path = require('path');

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

function render(spec) {
  const cards = (spec.transitions || []).map(t => `
<div class="card">
<h2><span>${T(t.tag, esc)}</span>${T(t.title, esc)}</h2>
<div class="flow">
<div class="col">${(t.inputs || []).map(box).join('\n')}</div>
<div class="arrow">➜</div>
<div class="col">${(t.outputs || []).map(box).join('\n')}</div>
</div>
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
    .replace('{{SUBTITLE}}', T(spec.subtitle))
    .replace('{{CARDS}}', cards)
    .replace('{{FOOTER}}', spec.notes ? `<div class="sub">${(Array.isArray(spec.notes) ? spec.notes : [spec.notes]).map(n => T(n)).join('<br>')}</div>` : '');
}

function build(inFile, outFile) {
  const spec = loadSpec(inFile);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, render(spec));
  console.log(`${inFile} -> ${outFile}`);
  return spec;
}

// On-chain tx decoder page (same look & toggle)
function buildTx(outFile) {
  const tpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
  const extra = fs.readFileSync(path.join(__dirname, 'tx-template.html'), 'utf8');
  const css = extra.slice(extra.indexOf('<style>'), extra.indexOf('</style>') + 8);
  const lib = fs.readFileSync(path.join(__dirname, 'lib/ckb.js'), 'utf8'), app = fs.readFileSync(path.join(__dirname, 'tx-app.js'), 'utf8');
  const EX = [['0xbaa72648c975a63097ae1500336475d70aa7ba8f0daf71405f883bd2b6e55dbb', 'DAO phase 2'], ['0x44d70abd4ed8c73c9ec7a6039aa1e35a22ef1455758c45b70bfef5a5fce93838', 'DAO phase 1'],
    ['0x80136926c075b54911f6cdf420ab6fb47e1b6f39367c2b0eb1583a23e5bcd71f', 'multisig legacy 7/12'], ['0x1a4d5e3838d72dda8b3aa1119116e7c82bedb22098b15500b57c72f4bf119470', 'multisig v2 2/3'],
    ['0xf7e4ead2242e204ff2e4797e6f3170dc289445593127896099867bacc0c01ecb', 'sUDT'], ['0xdcc1d1f0289a0df2ce56094bc0fe873baa03bf5d361545aa908c49778fe11429', 'xUDT']];
  const form = `<div class="card"><div class="form">
<select id="net"><option value="https://mainnet.ckb.dev/rpc">mainnet · https://mainnet.ckb.dev/rpc</option><option value="https://testnet.ckb.dev/rpc">testnet · https://testnet.ckb.dev/rpc</option><option value="custom">${T({ zh: '自定义 RPC', en: 'custom RPC' }, esc)}</option></select>
<input id="custom" style="display:none" placeholder="http://127.0.0.1:8114">
<input id="hash" placeholder="0x… tx hash"><button class="go" id="go">${T({ zh: '解码', en: 'Decode' }, esc)}</button></div>
<div class="small">${T({ zh: '主网示例：', en: 'Mainnet examples: ' }, esc)}${EX.map(([h, n]) => `<a href="#" class="ex" data-h="${h}">${n}</a>`).join(' · ')}</div>
<div class="small">${T({ zh: '说明：按 lock / type script hash 分组；识别 secp256k1_blake160、multisig（旧版/V2）、NervosDAO、sUDT、xUDT；签名不校验（标记 ○）。数据仅从你选择的 RPC 读取。', en: 'Notes: grouped by lock / type script hash; recognizes secp256k1_blake160, multisig (legacy/V2), NervosDAO, sUDT, xUDT; signatures are NOT verified (marked ○). Data is read only from the RPC you choose.' })}</div></div>
<div id="result"></div>`;
  const html = tpl.replace('{{DOC_TITLE}}', esc(UI.txTitle.zh + ' / ' + UI.txTitle.en)).replace('{{TOGGLE}}', T(UI.toggle, esc))
    .replace('{{TITLE}}', T(UI.txTitle, esc)).replace('{{SUBTITLE}}', T({ zh: '输入交易 hash，解码为 cell 流转卡片并做无签名约束检查', en: 'Enter a tx hash to decode it into cell-flow cards with signature-free constraint checks' }))
    .replace('{{CARDS}}', form).replace('{{FOOTER}}', '')
    .replace('</style>', () => css.replace('<style>', '').replace('</style>', '') + '</style>');
    const scripts = `<script>\n${lib.replace(/<\/script/gi, '<\\/script')}\n</script><script>\n${app.replace(/<\/script/gi, '<\\/script')}\n</script>`;
  const html2 = html.replace('</body>', () => scripts + '</body>');
  fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, html2); console.log(`(tx decoder) -> ${outFile}`);
}

function main() {
  const a = process.argv.slice(2);
  if (!a.length) { console.error('Usage / 用法: node gen.js <spec.json|yaml> [out.html]\n                 node gen.js --all [specsDir=specs] [outDir=out]'); process.exit(1); }
  if (a[0] === '--all') {
    const sd = a[1] || 'specs', od = a[2] || 'out', items = [];
    for (const f of fs.readdirSync(sd).filter(f => /\.(json|ya?ml)$/i.test(f)).sort()) {
      const name = f.replace(/\.(json|ya?ml)$/i, '');
      items.push([name, build(path.join(sd, f), path.join(od, name + '.html')).title || name]);
    }
    buildTx(path.join(od, 'tx.html'));
    items.push(['tx', UI.txTitle]);
    const tpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
    const list = `<div class="card"><ul class="idx">${items.map(([n, t]) => `<li><a href="${n}.html">${T(t, esc)}</a></li>`).join('')}</ul></div>`;
    fs.writeFileSync(path.join(od, 'index.html'), tpl.replace('{{DOC_TITLE}}', esc(UI.indexTitle.zh + ' / ' + UI.indexTitle.en))
      .replace('{{TOGGLE}}', T(UI.toggle, esc)).replace('{{TITLE}}', T(UI.indexTitle, esc)).replace('{{SUBTITLE}}', '')
      .replace('{{CARDS}}', list).replace('{{FOOTER}}', ''));
  } else {
    build(a[0], a[1] || path.join('out', path.basename(a[0]).replace(/\.(json|ya?ml)$/i, '') + '.html'));
  }
}
if (require.main === module) main();
module.exports = { render, parseYaml, T, buildTx };
