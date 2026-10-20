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

function main() {
  const a = process.argv.slice(2);
  if (!a.length) { console.error('Usage / 用法: node gen.js <spec.json|yaml> [out.html]\n                 node gen.js --all [specsDir=specs] [outDir=out]'); process.exit(1); }
  if (a[0] === '--all') {
    const sd = a[1] || 'specs', od = a[2] || 'out', items = [];
    for (const f of fs.readdirSync(sd).filter(f => /\.(json|ya?ml)$/i.test(f)).sort()) {
      const name = f.replace(/\.(json|ya?ml)$/i, '');
      items.push([name, build(path.join(sd, f), path.join(od, name + '.html')).title || name]);
    }
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
module.exports = { render, parseYaml, T };
