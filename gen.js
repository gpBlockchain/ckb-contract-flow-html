#!/usr/bin/env node
// Zero-dependency generator / 零依赖生成器
//   node gen.js specs/dao.json [out/dao.html]
//   node gen.js --all [out]   (builds contracts/*/spec.json + tx.html + index.html)
// 任意文本字段可为字符串（语言无关）或 {"zh": "...", "en": "..."}。
'use strict';
const fs = require('fs'), path = require('path');
const META = require('./lib/meta.js'), ST = require('./lib/struct.js');
let _mh; const MH = () => _mh || (_mh = require('./lib/meta-html.js')(T, esc));
const pluginOf = id => { try { return require('./lib/contracts.js').loadAll().PLUGINS.find(p => p.id === id); } catch (e) { return null; } };

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = s => esc(s).replace(/"/g, '&quot;');
// {{text}} → highlight
const hl = s => esc(s).replace(/\{\{([\s\S]*?)\}\}(?!\})/g, '<span class="hl">$1</span>');
// cell bodies: also dim "key:" names at line start and // comments (neither can contain braces, so {{ }} spans stay balanced)
const code = s => esc(s).replace(/^(\s*)([A-Za-z_][\w.]*)(?=\s*:)/gm, '$1<span class="ck">$2</span>')
  .replace(/(^|\s)(\/\/[^\n{}<]*)/g, '$1<span class="cc">$2</span>').replace(/\{\{([\s\S]*?)\}\}(?!\})/g, '<span class="hl">$1</span>');
const bold = s => esc(s).replace(/\{\{([\s\S]*?)\}\}/g, '<b>$1</b>');
const isI18n = x => x && typeof x === 'object' && !Array.isArray(x) && ('zh' in x || 'en' in x);
// render text: bilingual → two spans; plain string → as is
const T = (x, f = hl) => x == null ? '' : isI18n(x)
  ? `<span data-l="zh">${f(x.zh != null ? x.zh : x.en)}</span><span data-l="en">${f(x.en != null ? x.en : x.zh)}</span>` : f(x);
const plain = (x, lang) => x == null ? '' : isI18n(x) ? (x[lang] != null ? x[lang] : x.zh || x.en) : String(x);
const UI = {
  defTitle: { zh: 'CKB 合约约束', en: 'CKB Contract Constraints' },
  txTitle: { zh: '链上交易解码器', en: 'On-chain Transaction Decoder' },
  indexTitle: { zh: 'CKB 合约 Cell 流转约束', en: 'CKB Contract Cell-Flow Constraints' },
  brand: { zh: 'CKB 合约流转图', en: 'CKB Contract Flow' },
  navAll: { zh: '全部合约', en: 'All contracts' },
  navTx: { zh: '交易解码器', en: 'Tx decoder' },
  before: { zh: '交易前 · 输入', en: 'Before · inputs' }, beforeHint: { zh: '会被花掉的 Cell', en: 'cells spent' },
  after: { zh: '交易后 · 输出', en: 'After · outputs' }, afterHint: { zh: '新生成的 Cell', en: 'cells created' },
  deps: { zh: '引用 · cell_deps / header_deps', en: 'References · cell_deps / header_deps' }, depsHint: { zh: '交易要读取、但不会花掉的 Cell 和区块头', en: 'cells and block headers the transaction reads but does not spend' },
  wit: { zh: '见证 · witnesses', en: 'Witnesses' }, witHint: { zh: '签名等证明；通常按序号与 inputs 对应（每个脚本组用它第一个 input 的位置）', en: "proofs such as signatures; usually aligned with inputs by position (each script group uses its first input's index)" },
  lays: { zh: '字节布局', en: 'Byte layouts' }, laysHint: { zh: '字段里的字节怎么排', en: 'how the bytes inside a field are arranged' },
  rules: { zh: '规则', en: 'Rules' }, rulesHint: { zh: '必须全部满足，任何一条不满足，合约就拒绝这笔交易', en: 'all must hold — if any fails, the contract rejects the transaction' },
  rField: { zh: '检查对象', en: 'Checks' }, rCond: { zh: '要求', en: 'Requirement' }, rErr: { zh: '不满足时', en: 'If violated' },
  err: { zh: '错误码 ', en: 'error ' },
  none: { zh: '（本合约对这里没有限制）', en: '(no restrictions from this contract)' },
  notes: { zh: '补充说明', en: 'Notes' },
};
// glossary on every contract page: [term, zh, en]
const GLOSS = [
  ['Cell', '链上的“盒子”，装着 CKB 和数据；交易会花掉旧 Cell、生成新 Cell', 'an on-chain "box" holding CKB and data; a transaction spends old cells and creates new ones'],
  ['capacity', 'Cell 里有多少 CKB（1 CKB = 1 字节存储空间）', 'how much CKB the cell holds (1 CKB = 1 byte of storage)'],
  ['lock', '锁脚本：决定谁能花掉这个 Cell，通常要求签名', 'lock script: decides who can spend the cell, usually by requiring a signature'],
  ['type', '类型脚本：规定 Cell 怎么创建、修改、销毁', 'type script: rules for how the cell is created, changed and destroyed'],
  ['data', 'Cell 里存的数据，例如代币数量', 'data stored in the cell, e.g. a token amount'],
  ['args', '脚本参数，例如所有者公钥的哈希', "script arguments, e.g. the hash of the owner's public key"],
  ['codeHash / hashType', '指明运行哪一份合约代码', 'identify which contract code runs'],
  ['witness', '交易附带的证明，例如签名', 'proofs attached to the transaction, e.g. signatures'],
  ['WitnessArgs', '最常见的 witness 格式，有 lock / input_type / output_type 三个位置', 'the usual witness format, with three slots: lock / input_type / output_type'],
  ['since', '时间条件：这个输入最早什么时候能被花', 'time condition: the earliest time this input can be spent'],
  ['cell_deps / header_deps', '交易只读引用、不会花掉的 Cell / 区块头', 'cells / block headers the transaction reads without spending'],
  ['0 → 1', '步骤标记：交易前 → 交易后的 Cell 数量，如 0 → 1 表示新建；有的页面用 A / B 表示不同路径', 'step tag: number of cells before → after (0 → 1 = create); some pages use A / B for alternative paths'],
];

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
const errB = e => e != null && e !== '' ? `<span class="e">${T(UI.err, esc)}${T(e, esc)}</span>` : '';
const layoutBox = b => `<div class="layout"><div class="cl">${T(b.label)}</div>
<div class="strip">${b.layout.map((f, i) => `<div class="seg c${col(f, i)}" style="flex:${f.flex || 1}"><b>${T(f.name, esc)}</b><small>${T(f.size, esc)}</small></div>`).join('')}</div>
<ul class="fields">${b.layout.filter(f => f.role || f.cons || f.err).map(f => `<li><span class="dot c${col(f, b.layout.indexOf(f))}"></span><span><b>${T(f.name, esc)}</b><span class="sz">${T(f.size, esc)}</span></span><span>${T(f.role)}${f.cons ? ` <span class="cons">${T(f.cons)}</span>` : ''}${errB(f.err)}</span></li>`).join('')}</ul>
${b.hex ? `<div class="hex">${b.hex.map(h => `<div><span class="hk">${T(h[0], esc)}</span><span>${T(h[1])}</span></div>`).join('')}</div>` : ''}
${b.note ? `<div class="note">${T(b.note)}</div>` : ''}</div>`;
// Cells and witnesses as rows: lib/struct.js parses the spec's pseudo-struct bodies, and every cell lists the same slots in
// the same order so inputs and outputs line up. Slots: [key, zh hint, en hint].
const SLOT = {
  cell: [['since', '最早何时能花', 'earliest spend time'], ['capacity', '装了多少 CKB', 'how much CKB'], ['lock', '谁能花', 'who can spend'], ['type', '遵守的规则', 'rules it follows'], ['data', '存的数据', 'stored data']],
  wit: [['lock', '解锁证明（如签名）', 'unlock proof (e.g. signature)'], ['input_type', '给输入的 type 用', "for the input's type"], ['output_type', '给输出的 type 用', "for the output's type"]],
  script: [['codeHash', '哪份代码', 'which code'], ['hashType', '怎么找代码', 'how the code is found'], ['args', '参数', 'arguments']],
};
// struct.js marks highlights with H1…H2; a note line can split one, so unbalanced marks are dropped
const rv = v => { const s = esc(v); return s.split(ST.H1).length === s.split(ST.H2).length ? s.replace(/\u0001/g, '<span class="hl">').replace(/\u0002/g, '</span>') : s.replace(/[\u0001\u0002]/g, ''); };
// lang: 'zh' / 'en' inside one language copy of a bilingual body, null for a language-neutral body
const hint = (h, lang) => h ? `<small>${lang ? esc(lang === 'zh' ? h[1] : h[2]) : T({ zh: h[1], en: h[2] }, esc)}</small>` : '';
// Only what the contract restricts is drawn. A field, or a whole box, is left out when it is not highlighted and the spec itself
// calls it unrestricted ("any" / "…" / a bare name / "not checked"), unless its text still states a restriction ("must", "no", …).
// A whole box written as "…" is a cell whose contents are not spelled out, not an unrestricted one, so only "any" hides a box.
const FREE = /^(任意|any|…|\.\.\.|—|-)(?=$|[\s,;:（(])/i, FREE_BOX = /^(任意|any)(?=$|[\s,;:（(])/i;
const UNCHECKED = /not checked|not read by the script|not constrained|不检查|未检查|不读取|不受限制/i;
const MUST = /\b(no|none|must|cannot|forbidden)\b|can't|not carry|必须|不能|不可|不得|禁止|只能|不允许|没有|无该|不含|不带/i;
const freeField = f => { const v = f.v.replace(/[\u0001\u0002]/g, '').trim(), t = v + ' ' + f.notes.join(' ');
  return !f.v.includes(ST.H1) && (!v || FREE.test(v) || UNCHECKED.test(t)) && !MUST.test(t); };
const freeBody = s => { const r = ST.parseStruct(s);
  return r ? r.fields.every(freeField) && !MUST.test([...r.notes, ...r.post].join(' ')) : !s.includes('{{') && (FREE_BOX.test(s.trim()) || UNCHECKED.test(s)) && !MUST.test(s); };
const kept = b => b.layout || MUST.test(plain(b.label, 'zh') + ' ' + plain(b.label, 'en')) || !freeBody(plain(b.body, 'zh')) || !freeBody(plain(b.body, 'en'));
// restricted fields in slot order (fields outside the slots keep their source order after them)
function srows(r, slots, lang) {
  const at = f => { const k = (slots || []).findIndex(h => h[0] === f.base); return k < 0 ? slots ? slots.length : 0 : k; };
  const row = f => `<div class="sr${f.v.includes(ST.H1) ? ' hit' : ''}"><div class="sk"><code>${esc(f.k)}</code>${hint((slots || []).find(h => h[0] === f.base), lang)}</div><div class="sv">${f.sub ? `<div class="sub${f.hl ? ' shl' : ''}">${f.sub.name ? `<div class="stn">${esc(f.sub.name)}</div>` : ''}${srows(f.sub, SLOT.script, lang)}</div>` : rv(f.v)}${f.notes.map(n => `<div class="fn">${rv(n)}</div>`).join('')}</div></div>`;
  return r.fields.filter(f => !freeField(f)).map((f, i) => [at(f), i, f]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => row(x[2])).join('');
}
const slotsOf = (r, lane) => r.name === 'Cell' ? SLOT.cell
  : r.name === 'WitnessArgs' || (lane === 'wit' && !r.name && r.fields.every(f => SLOT.wit.some(h => h[0] === f.base))) ? SLOT.wit : null;
// one language copy of a box body: rows when it parses as a struct, else the code block
const sbody = lane => (s, lang) => { const r = ST.parseStruct(s); if (!r) return `<div class="code">${code(s)}</div>`;
  const rows = srows(r, slotsOf(r, lane), lang);
  return `${rows && r.name && r.name !== 'Cell' ? `<div class="stn">${esc(r.name)}</div>` : ''}${rows ? `<div class="srs">${rows}</div>` : ''}${[...r.notes, ...r.post].map(n => `<div class="fn">${rv(n)}</div>`).join('')}`; };
// bilingual block: like T() but with <div>s, and f also gets the language
const TB = (x, f) => isI18n(x) ? `<div data-l="zh">${f(x.zh != null ? x.zh : x.en, 'zh')}</div><div data-l="en">${f(x.en != null ? x.en : x.zh, 'en')}</div>` : f(x, null);
const box = (b, lane) => b.layout ? layoutBox(b) : `<div class="cell"><div class="cl">${T(b.label)}</div>${TB(b.body, sbody(lane))}</div>`;
// which part of the transaction a box belongs to: references (cell_deps / header_deps), witnesses, or the input → output flow
const P = x => plain(x, 'en');
const isWit = b => !b.layout && (/witness/i.test(P(b.label)) || /^\s*(\{\{)?\s*WitnessArgs\b/.test(P(b.body)));
const isDep = b => /^\s*(extra\s+)?(cell|header)_deps?\b/i.test(P(b.label));
const secLane = sc => /witness/i.test(P(sc.title)) ? 'wit' : /^\s*(cell|header)_deps?\b/i.test(P(sc.title)) ? 'dep' : '';
const isDepX = x => /^\s*(cell|header)_deps\s*:/.test(P(x));
const isWitL = l => /^\s*witness/i.test(P(l.label));
const lane = (cls, h, body, b = 'lb') => `<div class="lane ${cls}"><div class="lh">${h}</div><div class="${b}">${body}</div></div>`;
// extras: code-like lines ("header_deps: [ … ]") as code, prose as a note
const isCode = x => /^[\w.]+\s*:\s*[[{]/.test(plain(x, 'en'));
const extra = x => isCode(x) ? `<div class="extra"><code>${T(x, code)}</code></div>` : `<div class="tnote">${T(x)}</div>`;
const rules = ls => !ls || !ls.length ? '' : `<div class="rules"><h3>${T(UI.rules, esc)} <small>${T(UI.rulesHint, esc)}</small></h3><div class="rt">
<div class="rr rh"><span>#</span><span>${T(UI.rField, esc)}</span><span>${T(UI.rCond, esc)}</span><span>${T(UI.rErr, esc)}</span></div>
<ol class="rl">${ls.map((l, i) => `<li class="rr"><span class="rn">${i + 1}</span><span class="rf">${T(l.field, esc)}</span><span class="rc">${T(l.cond)}${l.note ? `<span class="rnote">${T(l.note)}</span>` : ''}</span><span>${errB(l.err)}</span></li>`).join('\n')}</ol></div></div>`;
const none = `<div class="small">${T(UI.none, esc)}</div>`;
// one step drawn in transaction order: references → inputs → outputs → witnesses, then byte layouts and rules
const step = (t, i) => {
  const secs = (t.sections || []).map(s => ({ ...s, boxes: (s.boxes || []).filter(kept) })).filter(s => s.boxes.length), ins = (t.inputs || []).filter(kept), outs = (t.outputs || []).filter(kept);
  const flow = b => !isWit(b) && !isDep(b), lays = (t.layouts || []).filter(l => !isWitL(l));
  const deps = [...secs.filter(s => secLane(s) === 'dep').flatMap(s => s.boxes), ...ins.filter(isDep), ...outs.filter(isDep)].map(b => box(b, 'dep'))
    .concat((t.extras || []).filter(isDepX).map(x => `<div class="extra"><code>${T(x, code)}</code></div>`));
  // witnesses sit under the column they pair with: input-indexed ones under inputs, output-indexed ones under outputs
  const wIn = [...ins.filter(isWit), ...secs.filter(s => secLane(s) === 'wit').flatMap(s => s.boxes)], wOut = outs.filter(isWit), wL = (t.layouts || []).filter(isWitL);
  const wits = wIn.length + wOut.length + wL.length ? `<div class="wl">${wIn.map(b => box(b, 'wit')).join('\n')}</div><div></div><div class="wl">${wOut.map(b => box(b, 'wit')).join('\n')}</div>${wL.map(layoutBox).join('\n')}` : '';
  return `<section class="card step" id="s${i + 1}">
<div class="sh"><span class="sn">${i + 1}</span><h2>${T(t.title, esc)}</h2>${t.tag != null ? `<span class="tagp">${T(t.tag, esc)}</span>` : ''}</div>
${deps.length ? lane('l-dep', `<b>${T(UI.deps, esc)}</b><small>${T(UI.depsHint, esc)}</small>`, deps.join('\n')) : ''}
<div class="flow">
<div class="col cin"><div class="colh"><b>${T(UI.before, esc)}</b><small>${T(UI.beforeHint, esc)}</small></div>${ins.filter(flow).map(b => box(b, 'in')).join('\n') || none}</div>
<div class="arrow" aria-hidden="true"><span>→</span></div>
<div class="col cout"><div class="colh"><b>${T(UI.after, esc)}</b><small>${T(UI.afterHint, esc)}</small></div>${outs.filter(flow).map(b => box(b, 'out')).join('\n') || none}</div>
</div>
${wits ? lane('l-wit', `<b>${T(UI.wit, esc)}</b><small>${T(UI.witHint, esc)}</small>`, wits, 'lb split') : ''}
${secs.filter(s => !secLane(s)).map(sc => `<div class="sec"><h3>${T(sc.title, esc)}</h3><div class="secgrid">${sc.boxes.map(b => box(b, isWit(b) ? 'wit' : 'sec')).join('\n')}</div></div>`).join('\n')}
${lays.length ? `<div class="lays"><h3>${T(UI.lays, esc)} <small>${T(UI.laysHint, esc)}</small></h3>${lays.map(layoutBox).join('\n')}</div>` : ''}
${(t.extras || []).filter(x => !isDepX(x)).map(extra).join('\n')}
${t.note ? `<div class="tnote">${T(t.note)}</div>` : ''}
${rules(t.limits)}
</section>`;
};
// jump list of the page's actions (skipped when there is only one)
const overview = ts => ts.length < 2 ? '' : `<nav class="ov"><h2>${T({ zh: `这个合约有 ${ts.length} 种操作，点击跳转`, en: `${ts.length} actions in this contract — click to jump` }, esc)}</h2><ol class="opl">${ts.map((t, i) => `<li><a href="#s${i + 1}"><span class="sn">${i + 1}</span>${T(t.title, esc)}${t.tag != null ? `<span class="tg">${T(t.tag, esc)}</span>` : ''}</a></li>`).join('')}</ol></nav>`;
const legend = () => `<div class="legend"><b>${T({ zh: '怎么看', en: 'How to read' }, esc)}</b>
<span class="lg"><i class="sw sw-in"></i>${T({ zh: '交易前会被花掉的 Cell', en: 'cells spent (before)' }, esc)}</span>
<span class="lg"><i class="sw sw-out"></i>${T({ zh: '交易后新生成的 Cell', en: 'cells created (after)' }, esc)}</span>
<span class="lg"><i class="sw sw-dep"></i>${T({ zh: '只读引用（cell_deps / header_deps）', en: 'read-only references (cell_deps / header_deps)' }, esc)}</span>
<span class="lg"><i class="sw sw-wit"></i>${T({ zh: '见证（签名等证明）', en: 'witnesses (signatures and other proofs)' }, esc)}</span>
<span class="lg">${T({ zh: '{{黄色}} 合约会检查的字段', en: '{{Yellow}} fields the contract checks' })}</span>
<span class="lg">${T({ zh: '只列出本合约有要求的字段（按 capacity · lock · type · data 的顺序）；没列出的，本合约不限制', en: 'only fields this contract has requirements on are listed (in capacity · lock · type · data order); anything not listed is not restricted by it' }, esc)}</span>
<span class="lg"><span class="e">${T(UI.err, esc)}</span>${T({ zh: '规则不满足时合约返回的编号', en: 'what the contract returns when a rule fails' }, esc)}</span>
<details class="gloss"><summary>${T({ zh: '术语小词典', en: 'Glossary' }, esc)}</summary><dl>${GLOSS.map(([k, zh, en]) => `<dt>${esc(k)}</dt><dd>${T({ zh, en }, esc)}</dd>`).join('')}</dl></details></div>`;
// top bar: brand, plus site links when the page is part of a --all build (cur = 'index' | 'tx' | 'contract')
const logo = `<span class="logo" aria-hidden="true"></span><span class="bt">${T(UI.brand, esc)}</span>`;
const nav = cur => !cur ? `<span class="brand">${logo}</span>` : `<a class="brand" href="index.html">${logo}</a><nav class="nav">`
  + [['index', 'index.html', UI.navAll], ['tx', 'tx.html', UI.navTx]].map(([k, h, l]) => `<a href="${h}"${k === cur ? ' aria-current="page"' : ''}>${T(l, esc)}</a>`).join('') + '</nav>';
const docTitle = t => plain(t, 'zh') === plain(t, 'en') ? plain(t, 'en') : plain(t, 'zh') + ' / ' + plain(t, 'en');
const page = ({ title, cur, header, cards }) => fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8')
  .replace('{{DOC_TITLE}}', () => esc(title)).replace('{{NAV}}', () => nav(cur)).replace('{{HEADER}}', () => header).replace('{{CARDS}}', () => cards);

function render(spec, id, site) {
  const meta = id ? META.load(id) : null, plugin = id ? pluginOf(id) : null, mh = MH();
  const tags = meta ? META.tagsOf(meta, plugin) : [], ts = spec.transitions || [], title = spec.title || UI.defTitle;
  const header = `<header class="ph">${mh.of(tags, 'kind').map(k => mh.kind(k, true)).join(' ')}
<h1>${T(title, esc)}</h1>
${spec.subtitle ? `<p class="src">${T(spec.subtitle)}</p>` : ''}
${meta ? mh.chips([...mh.of(tags, 'category'), ...mh.of(tags, 'project')]) + mh.credit(meta) : ''}
${mh.facts(meta, tags, { actions: ts.length, rules: ts.reduce((n, t) => n + (t.limits || []).length, 0) })}</header>`;
  const notes = spec.notes ? `<section class="card"><h2>${T(UI.notes, esc)}</h2><ul>${(Array.isArray(spec.notes) ? spec.notes : [spec.notes]).map(n => `<li>${T(n)}</li>`).join('')}</ul></section>` : '';
  const prov = meta ? `<section class="card">${mh.provenance(meta)}</section>` : '';
  return page({ title: docTitle(title), cur: site && 'contract', header, cards: overview(ts) + legend() + ts.map(step).join('\n') + notes + prov });
}

function build(inFile, outFile, id, site) {
  const spec = loadSpec(inFile);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, render(spec, id, site));
  console.log(`${inFile} -> ${outFile}`);
  return spec;
}

// On-chain tx decoder page (same look & toggle)
function buildTx(outFile) {
  const txTpl = fs.readFileSync(path.join(__dirname, 'tx-template.html'), 'utf8');
  const css = txTpl.slice(txTpl.indexOf('<style>') + 7, txTpl.indexOf('</style>'));
  const lib = fs.readFileSync(path.join(__dirname, 'lib/ckb.js'), 'utf8'), app = fs.readFileSync(path.join(__dirname, 'tx-app.js'), 'utf8');
  const C = require('./lib/contracts.js'), mh = MH(), list = C.list();
  const EX = list.filter(c => c.tests).flatMap(c => JSON.parse(fs.readFileSync(c.tests, 'utf8')).map(t => [t.tx, t.name || c.id, t.net || 'mainnet', c.id])).filter((x, i, a) => a.findIndex(y => y[0] === x[0]) === i);
  // featured examples first: the first test of each well-known contract
  const feat = ['nervos_dao', 'sudt', 'xudt', 'spore', 'secp256k1_blake160', 'multisig_v2', 'omnilock', 'acp', 'cheque', 'type_id'].map(id => EX.find(x => x[3] === id)).filter(Boolean);
  const exs = [...feat, ...EX.filter(x => !feat.includes(x))], ex = ([h, n, net]) => `<a href="#" class="ex tag" data-h="${h}" data-net="${net}">${esc(n)}${net === 'testnet' ? ' <small>testnet</small>' : ''}</a>`;
  const METAHTML = Object.fromEntries(list.map(c => { const m = META.load(c.id); if (!m) return null; const tags = META.tagsOf(m, pluginOf(c.id));
    return [c.id, mh.chips(tags.filter(t => !mh.of([t], 'kind').length)) + mh.credit(m) + (c.spec ? `<a class="golink" href="${c.id}.html">${T({ zh: '看这个合约的图解 →', en: 'See this contract explained →' }, esc)}</a>` : '') + mh.provenance(m, { compact: true })]; }).filter(Boolean));
  const plugins = C.ordered().map(c => `// ---- contracts/${c.id}/plugin.js ----\n` + fs.readFileSync(c.plugin, 'utf8')).join('\n');
  // known code cells ("<tx_hash>:<index>" → contract names), so the decoder can say what each cell_dep provides
  const DEPS = {};
  for (const c of list) { const m = META.load(c.id), p = pluginOf(c.id), n = p ? p.name || p.id : c.id;
    for (const d of (m && m.deployments) || []) if (d.cell_dep) { const k = d.cell_dep.out_point.tx_hash + ':' + parseInt(d.cell_dep.out_point.index, 16), a = DEPS[k] = DEPS[k] || [];
      if (!a.some(x => JSON.stringify(x) === JSON.stringify(n))) a.push(n); } }
  // <option> cannot hold language spans: static English text, swapped by the page script via data-zh-text / data-en-text
  const opt = (v, zh, en) => `<option value="${v}" data-zh-text="${attr(zh)}" data-en-text="${attr(en)}">${esc(en)}</option>`;
  const header = `<header class="ph"><h1>${T(UI.txTitle, esc)}</h1><p class="lead">${T({ zh: '粘贴一笔 CKB 交易的哈希，看看它花掉了哪些 Cell、生成了哪些 Cell，以及相关合约的规则是否都满足。', en: "Paste a CKB transaction hash to see which cells it spent, which it created, and whether each contract's rules hold." }, esc)}</p></header>`;
  const form = `<section class="card"><div class="form">
<label class="fld"><span class="fl">${T({ zh: '网络', en: 'Network' }, esc)}</span><select id="net">${opt('https://mainnet.ckb.dev/rpc', '主网 · mainnet.ckb.dev', 'Mainnet · mainnet.ckb.dev')}${opt('https://testnet.ckb.dev/rpc', '测试网 · testnet.ckb.dev', 'Testnet · testnet.ckb.dev')}${opt('custom', '自定义 RPC…', 'Custom RPC…')}</select></label>
<label class="fld" id="customf" hidden><span class="fl">RPC URL</span><input id="custom" placeholder="http://127.0.0.1:8114"></label>
<label class="fld fgrow"><span class="fl">${T({ zh: '交易哈希', en: 'Transaction hash' }, esc)}</span><input id="hash" placeholder="0x… (64 hex)" autocomplete="off" spellcheck="false"></label>
<button class="btn go" id="go" type="button">${T({ zh: '解码', en: 'Decode' }, esc)}</button></div>
<div class="exs"><b>${T({ zh: '没有哈希？点一个真实交易试试：', en: 'No hash? Try a real transaction:' }, esc)}</b><div class="tags">${exs.slice(0, 10).map(ex).join('')}</div>
${exs.length > 10 ? `<details class="more"><summary>${T({ zh: `更多示例（${exs.length - 10}）`, en: `More examples (${exs.length - 10})` }, esc)}</summary><div class="tags">${exs.slice(10).map(ex).join('')}</div></details>` : ''}</div>
<details class="more"><summary>${T({ zh: '说明', en: 'About' }, esc)}</summary><ul class="small">
<li>${T({ zh: '按 lock / type 脚本把 Cell 分组，每组一张卡片：交易前 → 交易后，再逐条检查这个合约的规则。', en: 'Cells are grouped by lock / type script, one card per group: before → after, then every rule of that contract is checked.' }, esc)}</li>
<li>${T({ zh: '不验证签名，这类检查标记为 ○（未检查）。', en: 'Signatures are NOT verified; such checks are marked ○ (not checked).' }, esc)}</li>
<li>${T({ zh: '数据只从你选择的 RPC 读取。', en: 'Data is read only from the RPC you choose.' }, esc)}</li>
<li>${T({ zh: `已支持 ${C.ordered().length} 个合约：`, en: `${C.ordered().length} contracts supported: ` }, esc)}<span class="mono">${C.ordered().map(c => c.id).join(', ')}</span></li></ul></details></section>
<div id="result"></div>`;
  const html = page({ title: UI.txTitle.zh + ' / ' + UI.txTitle.en, cur: 'tx', header, cards: form }).replace('</style>', () => css + '</style>');
  const scripts = `<script>window.CKB_META_HTML=${JSON.stringify(METAHTML).replace(/</g, '\\u003c')};window.CKB_DEPS=${JSON.stringify(DEPS).replace(/</g, '\\u003c')};</script><script>\n${lib.replace(/<\/script/gi, '<\\/script')}\n</script><script>\n${plugins.replace(/<\/script/gi, '<\\/script')}\n</script><script>\n${app.replace(/<\/script/gi, '<\\/script')}\n</script>`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, html.replace('</body>', () => scripts + '</body>')); console.log(`(tx decoder) -> ${outFile}`);
}

// card title: drop the trailing "约束" / "Constraints"
const shortTitle = t => isI18n(t) ? { zh: plain(t, 'zh').replace(/\s*(合约)?约束$/, ''), en: plain(t, 'en').replace(/\s+(Contract\s+)?Constraints$/i, '') } : String(t).replace(/\s+(Contract\s+)?Constraints$/i, '');

// index.html: hero with the cell model, decoder strip, contract catalog (search + filters), AI sentence, contributors
function buildIndex(od, items) {
  const mh = MH(), TAX = META.TAX, n = items.length, counts = {}, tagN = {};
  const all = items.map(([id, spec]) => { const m = META.load(id) || {}; return { id, spec, m, tags: META.tagsOf(m, pluginOf(id)) }; });
  all.forEach(c => c.tags.forEach(t => tagN[t] = (tagN[t] || 0) + 1));
  const card = ({ id, spec, m, tags }) => { const ops = spec.transitions || [], t = spec.title || id;
    (m.contributors || []).forEach(u => counts[u] = (counts[u] || 0) + 1);
    const text = [id, plain(t, 'zh'), plain(t, 'en'), ...ops.flatMap(o => [plain(o.title, 'zh'), plain(o.title, 'en')]), ...tags.map(x => TAX.tags[x] ? TAX.tags[x].zh + ' ' + TAX.tags[x].en : x)].join(' ').toLowerCase();
    const foot = [mh.of(tags, 'network').map(mh.name).join(' · '), ...mh.of(tags, 'maintainer').map(mh.name), ...mh.of(tags, 'source').map(mh.name)].filter(Boolean);
    return `<li class="ci" data-tags="${attr(tags.join(' '))}" data-text="${attr(text)}">
<div class="cit">${mh.of(tags, 'kind').map(k => mh.kind(k)).join('')}${mh.chips([...mh.of(tags, 'category'), ...mh.of(tags, 'project')])}</div>
<h3><a href="${id}.html">${T(shortTitle(t), esc)}</a></h3><div class="cid">${esc(id)}</div>
<ol class="ops">${ops.slice(0, 4).map(o => `<li>${T(o.title, esc)}</li>`).join('')}${ops.length > 4 ? `<li class="opm">+${ops.length - 4}</li>` : ''}</ol>
<div class="cif">${foot.join('<span aria-hidden="true">·</span>')} ${['verified', 'mismatch', 'builtin'].includes(mh.status(m)) ? mh.badge(m) : ''}${(m.contributors || []).length ? `<span class="avs">${m.contributors.map(mh.avatar).join('')}</span>` : ''}</div></li>`; };
  const cards = all.map(card).join('\n'), people = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const fb = (k, g) => `<button class="tag fb g-${g}" type="button" data-f="${k}" data-g="${g}" aria-pressed="false">${mh.name(k)} <small>${tagN[k]}</small></button>`;
  const tagsIn = g => Object.keys(TAX.tags).filter(k => TAX.tags[k].group === g && tagN[k]);
  // every mini cell shows all four slots (capacity · lock · type · data), like the contract pages
  const mc = (cap, lock) => `<div class="mc">${[['capacity', cap], ['lock', lock], ['type', ''], ['data', '']].map(([k, v]) => `<div><span>${k}</span>${v ? `<b>${v}</b>` : '<b class="dim">—</b>'}</div>`).join('')}</div>`;
  const model = `<figure class="model"><div class="mrow">
<div class="mcol m-in"><div class="mh">${T({ zh: '交易前 · 输入', en: 'Before · input' }, esc)}</div>${mc('100 CKB', T({ zh: 'Alice 的锁', en: "Alice's lock" }, esc))}</div>
<div class="marr" aria-hidden="true">→</div>
<div class="mtx"><b>${T({ zh: '合约检查规则', en: 'Contracts check the rules' }, esc)}</b><div>${T({ zh: 'witness：附上 Alice 的签名', en: "witness: carries Alice's signature" }, esc)}</div><div>${T({ zh: 'lock：签名对得上吗？', en: 'lock: does the signature match?' }, esc)} ✓</div><div class="small">${T({ zh: 'type：本例没有，有就一起检查', en: 'type: none here; checked when present' }, esc)}</div></div>
<div class="marr" aria-hidden="true">→</div>
<div class="mcol m-out"><div class="mh">${T({ zh: '交易后 · 输出', en: 'After · outputs' }, esc)}</div>${mc('60 CKB', T({ zh: 'Bob 的锁', en: "Bob's lock" }, esc))}${mc('39.99 CKB', T({ zh: 'Alice（找零）', en: 'Alice (change)' }, esc))}</div>
</div><figcaption class="mcap">${T({ zh: '例：Alice 转 60 CKB 给 Bob。花掉 1 个旧 Cell，生成 2 个新 Cell（给 Bob 的 + 找零给自己的），差额 0.01 CKB 是手续费。每个 Cell 都由 capacity · lock · type · data 四部分组成；签名放在 witness 里。每个合约页都这样画：交易前 → 交易后，加上 witness 和引用。', en: "Example: Alice sends 60 CKB to Bob. One old cell is spent and two new ones are created (Bob's, plus Alice's change); the 0.01 CKB difference is the fee. Every cell has four parts: capacity · lock · type · data; the signature travels in a witness. Every contract page is drawn this way: before → after, plus witnesses and references." }, esc)}</figcaption></figure>`;
  const header = `<section class="hero"><div><div class="eyebrow">${T(UI.indexTitle, esc)}</div>
<h1>${T({ zh: '一眼看懂 CKB 智能合约', en: 'CKB smart contracts, at a glance' }, esc)}</h1>
<p class="lead">${T({ zh: `CKB 上的资产和数据都装在一个个 {{Cell}} 里，可以把它想成“盒子”。每笔交易都会花掉一些旧 Cell、生成一些新 Cell；合约就是规定“怎样变才合法”的规则。这里把 ${n} 个合约一步步画出来：每个操作花掉什么、生成什么、检查哪些规则。`, en: `On CKB, assets and data live in {{cells}} — think of them as boxes. Every transaction spends some old cells and creates new ones; a contract is the set of rules for which changes are allowed. Here ${n} contracts are drawn step by step: what each action spends, what it creates, and which rules it checks.` }, bold)}</p>
<div class="cta"><a class="btn" href="#catalog">${T({ zh: `浏览 ${n} 个合约`, en: `Browse ${n} contracts` }, esc)}</a><a class="btn btn2" href="tx.html">${T({ zh: '解码一笔交易', en: 'Decode a transaction' }, esc)}</a></div></div>
${model}</section>`;
  const dec = `<section class="card dec"><div><h2>${T({ zh: '手上有交易哈希？', en: 'Have a transaction hash?' }, esc)}</h2><p>${T({ zh: '粘贴进来，自动拆成「交易前 → 交易后」的卡片，并逐条检查合约规则。', en: 'Paste it to split the transaction into before → after cards and check every contract rule.' }, esc)}</p></div>
<div><div class="row"><input id="hx" placeholder="0x… tx hash" aria-label="tx hash" autocomplete="off" spellcheck="false"><select id="hn" aria-label="network"><option value="https://mainnet.ckb.dev/rpc" data-zh-text="主网" data-en-text="Mainnet">Mainnet</option><option value="https://testnet.ckb.dev/rpc" data-zh-text="测试网" data-en-text="Testnet">Testnet</option></select><button class="btn" id="hg" type="button">${T({ zh: '解码', en: 'Decode' }, esc)}</button></div>
<div class="small" style="margin-top:6px"><a href="tx.html">${T({ zh: '没有哈希？打开解码器，点个示例试试 →', en: 'No hash? Open the decoder and try an example →' }, esc)}</a></div></div></section>
<script>(function(){var i=document.getElementById('hx'),n=document.getElementById('hn');function g(){var h=i.value.trim();if(!h)return i.focus();location.href='tx.html#'+new URLSearchParams({tx:h,rpc:n.value})}document.getElementById('hg').onclick=g;i.onkeydown=function(e){if(e.key==='Enter')g()}})();</script>`;
  const catalog = `<section class="card" id="catalog"><div class="cath"><h2>${T({ zh: '合约目录', en: 'Contract catalog' }, esc)}</h2><p>${T({ zh: '点开任意一个，看它的每一步操作和规则', en: 'Open any contract to see each action and its rules' }, esc)}</p></div>
<div class="search"><input id="q" type="search" placeholder="Search by name, use or id — e.g. DAO, token, NFT, wallet" data-zh-placeholder="搜索名称、用途或 id，例如 DAO、代币、NFT、钱包" data-en-placeholder="Search by name, use or id — e.g. DAO, token, NFT, wallet" aria-label="search" autocomplete="off"></div>
<div class="cats"><button class="tag" id="fall" type="button" aria-pressed="true">${T({ zh: '全部', en: 'All' }, esc)} <small>${n}</small></button>${tagsIn('category').map(k => fb(k, 'category')).join('')}</div>
<details class="more" id="more"><summary>${T({ zh: '更多筛选：类型、网络、源码、维护方、项目', en: 'More filters: kind, network, source, maintainer, project' }, esc)} <span id="mc"></span></summary>
${Object.entries(TAX.groups).filter(([g]) => g !== 'category').map(([g, d]) => `<div class="fg"><b>${T(d.label, esc)}</b>${tagsIn(g).map(k => fb(k, g)).join('')}</div>`).join('')}</details>
<div id="projsel">${Object.keys(mh.PROJ).filter(k => TAX.tags[k]).map(mh.projectPanel).join('')}</div>
<div class="cntrow"><span>${T({ zh: `显示 <b class="cn">${n}</b> / ${n} 个合约`, en: `Showing <b class="cn">${n}</b> of ${n} contracts` }, s => s)}</span><button id="clr" class="linkbtn" type="button" hidden>${T({ zh: '清除筛选', en: 'Clear filters' }, esc)}</button><button id="copylink" class="linkbtn copyl" type="button">${T({ zh: '复制当前视图的链接', en: 'Copy link to this view' }, esc)}<span class="okm">${T({ zh: ' ✓ 已复制', en: ' ✓ copied' }, esc)}</span></button></div>
<ul class="cards">${cards}</ul>
<div class="empty" id="empty" hidden>${T({ zh: '没有找到匹配的合约。', en: 'No contracts match.' }, esc)} <button class="linkbtn" type="button" data-clear>${T({ zh: '清除筛选', en: 'Clear filters' }, esc)}</button></div></section>
<script>(function(){var on={},px=0,q=document.getElementById('q'),li=[].slice.call(document.querySelectorAll('.ci')),bs=[].slice.call(document.querySelectorAll('button.fb')),fall=document.getElementById('fall'),more=document.getElementById('more'),mc=document.getElementById('mc'),clr=document.getElementById('clr'),empty=document.getElementById('empty');
// URL sync: ?<group>=a,b (project values without the "p-" prefix) &q=text; location.hash is left untouched
var pre=function(g){return g==='project'?'p-':''};
function panels(){var ps=on.project||[];[].forEach.call(document.querySelectorAll('#projsel .projp'),function(p){p.hidden=ps.indexOf(p.getAttribute('data-projp'))<0})}
function run(){var s=(q.value||'').toLowerCase().trim(),n=0,x=0;li.forEach(function(e){var t=' '+e.getAttribute('data-tags')+' ',ok=Object.keys(on).every(function(g){var a=on[g];return !a.length||a.some(function(k){return t.indexOf(' '+k+' ')>=0})})&&(!s||e.getAttribute('data-text').indexOf(s)>=0);e.hidden=!ok;if(ok)n++});
[].forEach.call(document.querySelectorAll('.cn'),function(c){c.textContent=n});
bs.forEach(function(b){b.setAttribute('aria-pressed',(on[b.getAttribute('data-g')]||[]).indexOf(b.getAttribute('data-f'))>=0)});fall.setAttribute('aria-pressed',!(on.category||[]).length);
Object.keys(on).forEach(function(g){if(g!=='category')x+=on[g].length});mc.textContent=x?'('+x+')':'';if(x&&!px)more.open=true;px=x;
empty.hidden=n>0;clr.hidden=!s&&!Object.keys(on).some(function(g){return on[g].length});panels()}
function toURL(){var u=new URLSearchParams();Object.keys(on).sort().forEach(function(g){if(on[g].length)u.set(g,on[g].map(function(k){return k.slice(pre(g).length)}).join(','))});var s=(q.value||'').trim();if(s)u.set('q',s);var qs=u.toString();try{history.replaceState(history.state,'',location.pathname+(qs?'?'+qs:'')+location.hash)}catch(e){}}
function fromURL(){var u=new URLSearchParams(location.search);on={};bs.forEach(function(b){var g=b.getAttribute('data-g'),k=b.getAttribute('data-f');if((u.get(g)||'').split(',').filter(Boolean).map(function(x){return pre(g)+x}).indexOf(k)>=0)(on[g]=on[g]||[]).push(k)});q.value=u.get('q')||'';run()}
function clear(){on={};q.value='';run();toURL()}
bs.forEach(function(b){b.onclick=function(){var g=b.getAttribute('data-g'),k=b.getAttribute('data-f'),a=on[g]=on[g]||[],i=a.indexOf(k);if(i>=0)a.splice(i,1);else a.push(k);run();toURL()}});
fall.onclick=function(){on.category=[];run();toURL()};clr.onclick=clear;empty.querySelector('[data-clear]').onclick=clear;
q.oninput=function(){run();toURL()};window.addEventListener('popstate',fromURL);
var cp=document.getElementById('copylink');if(cp)cp.onclick=function(){var url=location.href,done=function(){cp.setAttribute('data-ok','1');setTimeout(function(){cp.removeAttribute('data-ok')},1500)};if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(done,function(){prompt('URL',url)});else prompt('URL',url)};
fromURL()})();</script>`;
  const ai = `<section class="card" id="skill"><h2>${T({ zh: '一句话让 AI 生成', en: 'One sentence to your AI agent' }, esc)}</h2><p class="small">${T({ zh: '想看的合约不在上面？填入合约仓库 URL 或本地路径，复制这句话发给任意 coding agent（Claude Code / Cursor / Codex…），无需安装。', en: 'Contract not listed? Fill in a contract repo URL or local path, copy the sentence and paste it to any coding agent (Claude Code / Cursor / Codex…). No install needed.' }, esc)}</p>
<input id="sku" style="width:100%" placeholder="https://github.com/owner/repo  or  /path/to/local/repo" aria-label="repo url">
<pre class="skp" id="skp"></pre><button class="btn copyl" id="skc" type="button">${T({ zh: '复制这句话', en: 'Copy sentence' }, esc)}<span class="okm">${T({ zh: ' ✓ 已复制', en: ' ✓ copied' }, esc)}</span></button>
<details class="more"><summary>${T({ zh: '可选：安装为 skill', en: 'Optional: install as a skill' }, esc)}</summary><pre class="skp">npx skills add gpBlockchain/ckb-contract-flow-html -g -y -a claude-code cursor codex
curl -fsSL https://raw.githubusercontent.com/gpBlockchain/ckb-contract-flow-html/main/install.sh | sh
/plugin marketplace add gpBlockchain/ckb-contract-flow-html   (Claude Code)</pre><a href="https://github.com/gpBlockchain/ckb-contract-flow-html/blob/main/skills/ckb-contract-flow/SKILL.md">SKILL.md →</a></details></section>
<script>(function(){var R='https://raw.githubusercontent.com/gpBlockchain/ckb-contract-flow-html/main/skills/ckb-contract-flow/SKILL.md',u=document.getElementById('sku'),p=document.getElementById('skp'),b=document.getElementById('skc');function f(){var v=u.value.trim(),zh=document.documentElement.getAttribute('data-lang')==='zh',r=v||(zh?'<合约仓库 URL 或本地路径>':'<contract repo URL or local path>');p.textContent=zh?'阅读 '+R+' 并按其步骤为 '+r+' 生成合约 cell 流转 HTML':'Read '+R+' and follow it to generate a cell-flow HTML for '+r}u.oninput=f;f();document.addEventListener('click',function(e){if(e.target.id!=='skc')setTimeout(f,0)});b.onclick=function(){f();if(navigator.clipboard)navigator.clipboard.writeText(p.textContent).then(function(){b.setAttribute('data-ok','1');setTimeout(function(){b.removeAttribute('data-ok')},1500)})}})();</script>`;
  const contrib = `<section class="card"><h2>${T({ zh: '贡献者', en: 'Contributors' }, esc)}</h2>${people.length ? `<ul class="people">${people.map(([u, k]) => `<li>${mh.avatar(u)} <a href="https://github.com/${esc(u)}">@${esc(u)}</a> · ${k}</li>`).join('')}</ul>` : ''}
<div class="small">${T({ zh: '欢迎贡献新合约：见 docs/ADD_CONTRACT.md，并在 meta.json 的 contributors 中加上你的 GitHub 用户名。', en: 'New contracts welcome: see docs/ADD_CONTRACT.md and add your GitHub username to contributors in meta.json.' }, esc)}</div></section>`;
  fs.writeFileSync(path.join(od, 'index.html'), page({ title: UI.indexTitle.zh + ' / ' + UI.indexTitle.en, cur: 'index', header, cards: dec + catalog + ai + contrib }));
}

function main() {
  const a = process.argv.slice(2);
  if (!a.length) { console.error('Usage / 用法: node gen.js <spec.json|yaml> [out.html]\n                 node gen.js --all [outDir=out]   (discovers contracts/*/spec.json)'); process.exit(1); }
  if (a[0] === '--all') {
    const od = a[1] || 'out', items = [];
    for (const c of require('./lib/contracts.js').list()) if (c.spec) items.push([c.id, build(c.spec, path.join(od, c.id + '.html'), c.id, true)]);
    buildTx(path.join(od, 'tx.html'));
    buildIndex(od, items);
  } else {
    build(a[0], a[1] || path.join('out', path.basename(a[0]).replace(/\.(json|ya?ml)$/i, '') + '.html'));
  }
}
if (require.main === module) main();
module.exports = { render, parseYaml, T, buildTx };
