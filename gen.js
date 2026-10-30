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

// ---- Optional "at a glance" mode (opt-in; pages without these fields render exactly as before) ----
// spec.summary: i18n one sentence · spec.flow: [{label, change}] · spec.unchecked: [i18n]
// transition.plain: i18n one line · transition.diff: [{field, from, to}] (to omitted or equal → unchanged)
// limit.group: "core" | "structure" | "tech" · cell body [[text]] → dimmed (unchanged)
const isGlance = s => !!(s && (s.summary || s.flow || s.unchecked || s.api));
// spec.api: API-doc view. {endpoints:[{id, name, desc, params:[{name,type,desc}], inputs:[{name, conds:[i18n]}], returns:[{name, fields:[{k,v}|{k,from,to}]}], errors:[[code, i18n]]}], unsupported:[{name, desc, err}], codes:{code: NAME}}
const ACSS = `<style>
.aidx{background:#fff;border:1px solid #e3e7ef;border-radius:14px;padding:10px 16px;margin-bottom:22px}.aidx h3{margin:4px 0 8px;font-size:15px;color:#4a5f9c}
.aidx a{display:grid;grid-template-columns:minmax(0,max-content) minmax(0,1fr);column-gap:12px;align-items:baseline;padding:6px 0;border-top:1px dashed #eef0f4;color:inherit;text-decoration:none}.aidx a:first-of-type{border-top:0}.aidx a:hover code{background:#dfe8ff}
.aidx code,.aep h2 code{font:600 14px Menlo,monospace;background:#eef3ff;color:#3b55a8;border-radius:6px;padding:2px 8px;overflow-wrap:anywhere}.aidx .d{font-size:15px;color:#445;overflow-wrap:anywhere}.aidx .no code{background:#f3f4f6;color:#8a8f98;text-decoration:line-through}.aidx .no .d{color:#8a8f98}
.aep{scroll-margin-top:12px}.aep h2{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.aep .ad{font-size:16px;color:#445;margin:-4px 0 12px}
.asec{margin-top:12px}.asec>h4{margin:0 0 6px;font:600 13px system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase}
.asec.p>h4{color:#6b4fb0}.asec.i>h4{color:#c2410c}.asec.r>h4{color:#15803d}.asec.e>h4{color:#b4473f}
.atab{width:100%;border-collapse:collapse;font-size:14px;table-layout:fixed}.atab td,.atab th{border-top:1px solid #eef0f4;padding:6px 8px;vertical-align:top;text-align:left;overflow-wrap:anywhere;word-break:break-word}.atab th{font-weight:600;color:#666;font-size:12px;background:#fafbfc}
.asec.p .atab{background:#faf8fe}.asec.p .acell{background:#faf8fe;border:1px solid #e4dcf5}.atab .k{font-family:Menlo,monospace;color:#5b3f99;width:28%}.atab .t{font-family:Menlo,monospace;color:#777;width:22%}
.acell{border-radius:10px;padding:8px 12px;margin-bottom:8px;font:14px/1.6 Menlo,monospace}.asec.i .acell{background:#fff7ed;border:1px solid #fed7aa}.asec.r .acell{background:#f0fdf4;border:1px solid #bbf7d0}
.acell .n{display:block;font:600 13px system-ui,sans-serif;color:#555;margin-bottom:2px}.acell ul{margin:0;padding-left:18px;font:14px/1.6 system-ui,sans-serif}
.af{display:grid;grid-template-columns:minmax(70px,max-content) minmax(0,1fr);column-gap:10px}.af .v{overflow-wrap:anywhere}.af.same{color:#a0a6b1}.af.chg{font-weight:600}.af .old{background:#fdecec;color:#a04040;border-radius:4px;padding:0 4px}.af .new{background:#d9f2e1;color:#146c35;border-radius:4px;padding:0 4px}
.asec.e .atab .c{width:16%;font-family:Menlo,monospace}.asec.e .atab .c b{color:#b4473f}.asec.e .atab .c span{display:block;font-size:11px;color:#999}
details.ax{margin:2px 0}details.ax>summary{list-style:none;cursor:pointer;border-radius:6px}details.ax>summary::-webkit-details-marker{display:none}
details.ax>summary .kk{color:#3b55a8;border-bottom:1px dashed #8aa2e0;white-space:nowrap}details.ax>summary .kk:after{content:' ▸';font-size:11px}details.ax[open]>summary .kk:after{content:' ▾'}details.ax>summary:hover{background:#eef3ff}
.sp{margin:6px 0 10px;background:#fff;border:1px solid #dbe3f5;border-left:3px solid #8aa2e0;border-radius:10px;padding:8px 10px;font:13px/1.55 system-ui,sans-serif;color:#334}.sp .st{font-weight:600;color:#4a5f9c;margin-bottom:4px;overflow-wrap:anywhere}
.sp table{width:100%;border-collapse:collapse;table-layout:fixed}.sp td,.sp th{border-top:1px solid #eef0f4;padding:4px 6px;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}.sp th{font-size:11px;color:#777;background:#fafbfc}.sp .o{width:12%;font-family:Menlo,monospace}.sp .l{width:10%;font-family:Menlo,monospace}.sp .y{width:18%;font-family:Menlo,monospace;color:#666}
.sp .nm{font-family:Menlo,monospace;font-weight:600;border-radius:4px;padding:0 4px}.sp .hx{margin-top:6px;font:12px/1.8 Menlo,monospace;overflow-wrap:anywhere;word-break:break-all}.sp .hx span{border-radius:3px;padding:1px 2px}.sp .hxl{font-size:11px;color:#888}
.c0{background:#e6efff}.c1{background:#e3f5e8}.c2{background:#fdf0dc}.c3{background:#f3e8fb}.c4{background:#fde7ea}.c5{background:#e2f4f6}.c6{background:#f1f1e0}
@media (max-width:760px){.sp{padding:6px 6px;margin-left:0;margin-right:0}.sp table,.sp tbody{display:block}.sp tr{display:grid;grid-template-columns:max-content max-content minmax(0,1fr);column-gap:8px;border-top:1px solid #eef0f4;padding:3px 0}.sp tr:first-child{display:none}.sp td{border:0;padding:0 2px;width:auto!important}.sp td.y{display:block;color:#888}.sp td:last-child{grid-column:1/-1}.sp td.o:before{content:'@'}.sp td.l:after{content:'B'}}
details.aall{margin-top:8px}details.aall>summary{cursor:pointer;color:#555;font-size:15px;padding:6px 0}
@media (max-width:760px){.atab .k{width:34%}.atab .t{display:none}.asec.e .atab .c{width:24%}.aidx a{grid-template-columns:1fr;row-gap:2px}}
</style>`;
let STR = {};
const pv = p => { const t = p.type ? p.type + ' · ' : '', d = p.desc || ''; return typeof d === 'object' ? { zh: t + d.zh, en: t + d.en } : t + d; };
const AXT = { off: { zh: '偏移', en: 'Offset' }, len: { zh: '长度', en: 'Len' }, ty: { zh: '类型', en: 'Type' }, mean: { zh: '字段 / 含义', en: 'Field / meaning' }, hex: { zh: '示例 hex（颜色对应上表）', en: 'Example hex (colors match the table)' } };
function sPanel(id, d = 0) {
  const s = STR[id]; if (!s || d > 5) return '';
  return `<div class="sp"><div class="st">${T(s.name, esc)}${s.size ? ` · ${T(s.size, esc)}` : ''}</div>${s.desc ? `<div>${T(s.desc)}</div>` : ''}
<table><tr><th class="o">${T(AXT.off, esc)}</th><th class="l">${T(AXT.len, esc)}</th><th class="y">${T(AXT.ty, esc)}</th><th>${T(AXT.mean, esc)}</th></tr>${s.rows.map((r, i) => `<tr><td class="o">${esc(r.off)}</td><td class="l">${esc(r.len)}</td><td class="y">${T(r.type, esc)}</td><td><span class="nm c${i % 7}">${esc(r.name)}</span> ${T(r.desc)}${r.ref && STR[r.ref] ? `<details class="ax"><summary><span class="kk">${esc(r.name)}</span> = ${T(STR[r.ref].name, esc)}</summary>${sPanel(r.ref, d + 1)}</details>` : ''}</td></tr>`).join('')}</table>
${s.rows.some(r => r.hex) ? `<div class="hx"><div class="hxl">${T(AXT.hex, esc)}${s.ex ? ' · ' + T(s.ex, esc) : ''}</div>${s.rows.map((r, i) => r.hex ? `<span class="c${i % 7}" title="${esc(r.name)}">${esc(r.hex)}</span>` : '').join('')}</div>` : ''}</div>`;
}
const axWrap = (f, inner, cls) => f.s && STR[f.s] ? `<details class="ax"><summary class="${cls}">${inner}</summary>${sPanel(f.s)}</details>` : `<div class="${cls}">${inner}</div>`;
const kk = f => f.s && STR[f.s] ? `<span class="kk">${T(f.k, esc)}</span>` : `<span>${T(f.k, esc)}</span>`;
const aField = f => f.to != null ? (JSON.stringify(f.to) === JSON.stringify(f.from) ? axWrap(f, `${kk(f)}<span class="v">${T(f.from)} · ${T(GUI.same, esc)}</span>`, 'af same') : axWrap(f, `${kk(f)}<span class="v"><span class="old">${T(f.from)}</span> → <span class="new">${T(f.to)}</span></span>`, 'af chg'))
  : axWrap(f, `${kk(f)}<span class="v">${T(f.v)}</span>`, 'af same');
const AUI = { idx: { zh: '接口一览', en: 'Endpoints' }, p: { zh: '参数 Params（witness）', en: 'Params (witness)' }, i: { zh: '输入 Inputs', en: 'Inputs' }, r: { zh: '返回 Returns（输出 cell）', en: 'Returns (output cells)' }, e: { zh: '错误 Errors', en: 'Errors' },
  name: { zh: '字段', en: 'Field' }, type: { zh: '类型', en: 'Type' }, desc: { zh: '说明', en: 'Description' }, code: { zh: '错误码', en: 'Code' }, why: { zh: '触发原因', en: 'Trigger' }, no: { zh: '不支持', en: 'Not supported' }, none: { zh: '无', en: 'none' },
  all: { zh: '完整约束、字节布局与编码细节（点击展开）', en: 'Full constraints, byte layouts & encoding (click to expand)' } };
function apiDoc(a) {
  STR = a.structs || {};
  const C = a.codes || {}, eps = a.endpoints || [];
  const idx = `<div class="aidx"><h3>${T(AUI.idx, esc)}</h3>${eps.map(e => `<a href="#api-${esc(e.id)}"><code>${esc(e.name)}</code><span class="d">${T(e.desc)}</span></a>`).join('')}${(a.unsupported || []).map(u => `<a class="no"><code>${esc(u.name)}</code><span class="d">${T(AUI.no, esc)} · ${T(u.desc)}${u.err ? ` (${esc(u.err)})` : ''}</span></a>`).join('')}</div>`;
  const ep = e => `<div class="card aep" id="api-${esc(e.id)}"><h2><code>${esc(e.name)}</code>${e.title ? T(e.title, esc) : ''}</h2><div class="ad">${T(e.desc)}</div>
<div class="asec p"><h4>${T(AUI.p, esc)}</h4>${(e.params || []).length ? `<div class="acell pp">${e.params.map(p => aField({ k: p.name, v: pv(p), s: p.s })).join('')}</div>` : `<div class="af same">${T(AUI.none, esc)}${e.noParams ? ' · ' + T(e.noParams) : ''}</div>`}</div>
<div class="asec i"><h4>${T(AUI.i, esc)}</h4>${(e.inputs || []).map(c => `<div class="acell"><span class="n">${T(c.name)}</span>${(c.fields || []).map(aField).join('')}<ul>${(c.conds || []).map(x => `<li>${T(x)}</li>`).join('')}</ul></div>`).join('')}</div>
<div class="asec r"><h4>${T(AUI.r, esc)}</h4>${(e.returns || []).map(c => `<div class="acell"><span class="n">${T(c.name)}</span>${(c.fields || []).map(aField).join('')}</div>`).join('')}</div>
<div class="asec e"><h4>${T(AUI.e, esc)}</h4><table class="atab"><tr><th class="c">${T(AUI.code, esc)}</th><th>${T(AUI.why, esc)}</th></tr>${(e.errors || []).map(([c, w]) => `<tr><td class="c"><b>${esc(c)}</b>${C[c] ? `<span>${esc(C[c])}</span>` : ''}</td><td>${T(w)}</td></tr>`).join('')}</table></div></div>`;
  return ACSS + idx + eps.map(ep).join('\n');
}
const hlG = s => hl(s).replace(/\[\[([\s\S]*?)\]\](?!\])/g, '<span class="dim">$1</span>');
const GUI = {
  changes: { zh: '变化一览', en: 'What changes' }, same: { zh: '不变', en: 'unchanged' },
  details: { zh: '字节布局与编码细节（点击展开）', en: 'Byte layouts & encoding details (click to expand)' },
  unchecked: { zh: '⚠ 脚本本身不检查 / 解码器未校验', en: '⚠ Not checked by the script / not verified by the decoder' },
  groups: { core: { zh: '核心规则', en: 'Core rules' }, structure: { zh: '结构规则', en: 'Structure rules' }, tech: { zh: '技术细节', en: 'Technical details' } },
};
const GCSS = `<style>
.gsum{background:#f5f8ff;border:1px solid #dbe3f5;border-left:4px solid #8aa2e0;border-radius:12px;padding:14px 18px;margin:-16px 0 20px;font-size:19px;color:#334}
.gflow{display:flex;flex-wrap:wrap;align-items:stretch;gap:8px;margin-bottom:28px}.gstep{flex:1 1 180px;background:#fff;border:1px solid #e3e7ef;border-radius:12px;padding:10px 14px;min-width:0}.gstep b{display:block;color:#4a5f9c;font-size:15px}.gstep span.c{font:14px/1.6 Menlo,monospace;color:#555;overflow-wrap:anywhere}.garr{align-self:center;color:#9aa5bd;font-size:22px}
.gwarn{background:#fffaf0;border:1px solid #f3dcb0;border-left:4px solid #d9a441;border-radius:12px;padding:12px 18px;margin-bottom:32px}.gwarn h3{margin:0 0 6px;font-size:17px;color:#8a5a12}.gwarn ul{margin:0;padding-left:20px}.gwarn li{margin:4px 0;font-size:16px}
.gplain{background:#f7f9fc;border:1px solid #e3e7ef;border-radius:10px;padding:10px 16px;margin:-8px 0 18px;font-size:17px;color:#334}
.gdiff{margin-top:16px;border:1px solid #e3e7ef;border-radius:12px;padding:10px 14px;background:#fcfcfd}.gdiff h3{margin:0 0 6px;font-size:15px;color:#555}.gdiff .r{display:grid;grid-template-columns:minmax(90px,max-content) minmax(0,1fr);column-gap:14px;padding:3px 0;font:14px/1.6 Menlo,monospace;border-top:1px dashed #eef0f4}.gdiff .r:first-of-type{border-top:0}.gdiff .r.same{color:#a0a6b1}.gdiff .r.chg .v{color:#8a4b08}.gdiff .v{overflow-wrap:anywhere}.gdiff .old{background:#fdecec;border-radius:4px;padding:0 4px}.gdiff .new{background:#e8f6ec;border-radius:4px;padding:0 4px}
.dim{color:#a0a6b1}
details.gdet{margin-top:18px;border:1px solid #e3e7ef;border-radius:12px;padding:8px 14px;background:#fcfcfd}details.gdet>summary{cursor:pointer;color:#555;font-size:15px}
.glim h4{margin:12px 0 4px;font-size:15px;color:#4a5f9c}.glim details>summary{cursor:pointer;font-size:15px;color:#4a5f9c;font-weight:600;margin-top:12px}.glim .e{font-size:13px;opacity:.75}
@media (max-width:760px){.gsum{font-size:16px;margin-top:-24px}.gflow{flex-direction:column}.gstep{flex:none}.garr{transform:rotate(90deg)}.gplain{font-size:15px}
 .glance .strip{flex-direction:column}.glance .seg{min-width:0;flex:none!important;text-align:left;display:flex;gap:10px;align-items:baseline}.glance .seg b{display:inline}
 .gdiff .r{grid-template-columns:1fr}}
</style>`;
const limLi = l => `<li><b>${T(l.field, esc)}</b>${sep(l.cond)}${T(l.cond)}${l.err != null && l.err !== '' ? ` <span class="e">(${esc(l.err)})</span>` : ''}${l.note ? ` <span class="note">(${T(l.note)})</span>` : ''}</li>`;
function glanceTop(spec) {
  return GCSS + (spec.summary ? `<div class="gsum">${T(spec.summary)}</div>` : '')
    + (spec.api ? apiDoc(spec.api) : '')
    + (!spec.api && spec.flow ? `<div class="gflow">${spec.flow.map(st => `<div class="gstep"><b>${T(st.label, esc)}</b><span class="c">${T(st.change)}</span></div>`).join('<div class="garr">➜</div>')}</div>` : '')
    + (spec.unchecked ? `<div class="gwarn"><h3>${T(GUI.unchecked, esc)}</h3><ul>${spec.unchecked.map(u => `<li>${T(u)}</li>`).join('')}</ul></div>` : '');
}
function glanceCard(t) {
  const gbox = b => b.layout ? layoutBox(b) : `<div class="cell"><span class="n">${T(b.label)}</span>${T(b.body, hlG)}</div>`;
  const diff = t.diff && t.diff.length ? `<div class="gdiff"><h3>${T(GUI.changes, esc)}</h3>${t.diff.map(d => {
    const same = d.to == null || JSON.stringify(d.to) === JSON.stringify(d.from);
    return `<div class="r ${same ? 'same' : 'chg'}"><span>${T(d.field, esc)}</span><span class="v">${same ? `${T(d.from)} · ${T(GUI.same, esc)}` : `<span class="old">${T(d.from)}</span> → <span class="new">${T(d.to)}</span>`}</span></div>`; }).join('')}</div>` : '';
  const L = t.limits || [], by = g => L.filter(l => (l.group || 'tech') === g);
  const lim = L.length ? `<div class="limits glim"><h3>${T(UI.limits, esc)}</h3>
${by('core').length ? `<h4>${T(GUI.groups.core, esc)}</h4><ul>${by('core').map(limLi).join('\n')}</ul>` : ''}
${['structure', 'tech'].filter(g => by(g).length).map(g => `<details><summary>${T(GUI.groups[g], esc)}（${by(g).length}）</summary><ul>${by(g).map(limLi).join('\n')}</ul></details>`).join('\n')}</div>` : '';
  const det = (t.layouts || []).length || (t.extras || []).length || t.note ? `<details class="gdet"><summary>${T(GUI.details, esc)}</summary>
${(t.layouts || []).map(layoutBox).join('\n')}${(t.extras || []).map(x => `<div class="extra">${T(x)}</div>`).join('\n')}${t.note ? `<div class="note" style="margin-top:12px">${T(t.note)}</div>` : ''}</details>` : '';
  return `
<div class="card">
<h2><span>${T(t.tag, esc)}</span>${T(t.title, esc)}</h2>
${t.plain ? `<div class="gplain">${T(t.plain)}</div>` : ''}
<div class="flow">
<div class="col cin"><div class="colh">${T({ zh: 'Inputs 输入', en: 'Inputs' }, esc)}</div>${(t.inputs || []).map(gbox).join('\n')}</div>
<div class="arrow">➜</div>
<div class="col cout"><div class="colh">${T({ zh: 'Outputs 输出', en: 'Outputs' }, esc)}</div>${(t.outputs || []).map(gbox).join('\n')}</div>
</div>
${diff}
${lim}
${det}
</div>`;
}

function render(spec, id) {
  const meta = id ? META.load(id) : null, plugin = id ? pluginOf(id) : null;
  const head = meta ? MH().chips(META.tagsOf(meta, plugin)) + MH().credit(meta) : '';
  const prov = meta ? `<div class="card">${MH().provenance(meta)}</div>` : '';
  const cards = isGlance(spec) ? '<div class="glance">' + glanceTop(spec) + (spec.api ? `<details class="aall"><summary>${T(AUI.all, esc)}</summary>` : '') + (spec.transitions || []).map(glanceCard).join('\n') + (spec.api ? '</details>' : '') + '</div>' : (spec.transitions || []).map(t => `
<div class="card">
<h2><span>${T(t.tag, esc)}</span>${T(t.title, esc)}</h2>
<div class="flow">
<div class="col cin"><div class="colh">${T({ zh: 'Inputs 输入', en: 'Inputs' }, esc)}</div>${(t.inputs || []).map(box).join('\n')}</div>
<div class="arrow">➜</div>
<div class="col cout"><div class="colh">${T({ zh: 'Outputs 输出', en: 'Outputs' }, esc)}</div>${(t.outputs || []).map(box).join('\n')}</div>
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
<div class="filters">${groups}</div><div id="projsel">${Object.keys(mh.PROJ).filter(k => META.TAX.tags[k]).map(mh.projectPanel).join('')}</div><div class="small cntrow"><span id="cnt"></span> <button id="copylink" class="copyl" type="button" title="copy a link to this filtered view">${T({ zh: '复制链接', en: 'Copy link' }, esc)}<span class="okm">${T({ zh: ' ✓ 已复制', en: ' ✓ copied' }, esc)}</span></button></div><ul class="cards">${cards}</ul>
</div>
<div class="card" id="skill"><h2>${T({ zh: '一句话让 AI 生成', en: 'One sentence to your AI agent' }, esc)}</h2><p class="small">${T({ zh: '填入合约仓库 URL 或本地路径，复制这句话发给任意 coding agent（Claude Code / Cursor / Codex…），无需安装。', en: 'Fill in a contract repo URL or local path, copy the sentence and paste it to any coding agent (Claude Code / Cursor / Codex…). No install needed.' }, esc)}</p>
<div class="form"><input id="sku" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #ccc;border-radius:8px" placeholder="https://github.com/owner/repo  or  /path/to/local/repo" aria-label="repo url"></div>
<pre class="mono" id="skp" style="white-space:pre-wrap"></pre><button id="skc" style="padding:6px 16px;border-radius:8px;border:1px solid #4f6bed;background:#4f6bed;color:#fff;cursor:pointer">${T({ zh: '复制', en: 'Copy' }, esc)}</button>
<details class="small"><summary>${T({ zh: '可选：安装为 skill', en: 'Optional: install as a skill' }, esc)}</summary><pre class="mono" style="white-space:pre-wrap">npx skills add gpBlockchain/ckb-contract-flow-html -g -y -a claude-code cursor codex
curl -fsSL https://raw.githubusercontent.com/gpBlockchain/ckb-contract-flow-html/main/install.sh | sh
/plugin marketplace add gpBlockchain/ckb-contract-flow-html   (Claude Code)</pre><a href="https://github.com/gpBlockchain/ckb-contract-flow-html/blob/main/skills/ckb-contract-flow/SKILL.md">SKILL.md →</a></details></div>
<script>(function(){var R='https://raw.githubusercontent.com/gpBlockchain/ckb-contract-flow-html/main/skills/ckb-contract-flow/SKILL.md',u=document.getElementById('sku'),p=document.getElementById('skp');function f(){var v=u.value.trim(),zh=document.documentElement.getAttribute('data-lang')==='zh',r=v||(zh?'<合约仓库 URL 或本地路径>':'<contract repo URL or local path>');p.textContent=zh?'阅读 '+R+' 并按其步骤为 '+r+' 生成合约 cell 流转 HTML':'Read '+R+' and follow it to generate a cell-flow HTML for '+r}u.oninput=f;f();document.addEventListener('click',function(e){if(e.target.id!=='skc')setTimeout(f,0)});document.getElementById('skc').onclick=function(){f();navigator.clipboard&&navigator.clipboard.writeText(p.textContent)}})();</script>
<div class="card"><h2>${T({ zh: '贡献者', en: 'Contributors' }, esc)}</h2>${people.length ? `<ul class="people">${people.map(([u, k]) => `<li>${mh.avatar(u)} <a href="https://github.com/${esc(u)}">@${esc(u)}</a> · ${k}</li>`).join('')}</ul>` : ''}
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
var cp=document.getElementById('copylink');if(cp)cp.onclick=function(){var url=location.href,done=function(){cp.setAttribute('data-ok','1');setTimeout(function(){cp.removeAttribute('data-ok')},1500)};if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(done,function(){prompt('URL',url)});else prompt('URL',url)};
fromURL()})();</script>`;
    fs.writeFileSync(path.join(od, 'index.html'), tpl.replace('{{DOC_TITLE}}', esc(UI.indexTitle.zh + ' / ' + UI.indexTitle.en))
      .replace('{{TOGGLE}}', T(UI.toggle, esc)).replace('{{TITLE}}', T(UI.indexTitle, esc)).replace('{{SUBTITLE}}', '')
      .replace('{{CARDS}}', () => list).replace('{{FOOTER}}', ''));
  } else {
    build(a[0], a[1] || path.join('out', path.basename(a[0]).replace(/\.(json|ya?ml)$/i, '') + '.html'));
  }
}
if (require.main === module) main();
module.exports = { render, parseYaml, T, buildTx };
