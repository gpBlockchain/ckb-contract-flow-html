#!/usr/bin/env node
// 零依赖生成器：node gen.js specs/dao.json [out/dao.html]
// 也支持一次构建全部：node gen.js --all specs out
'use strict';
const fs = require('fs'), path = require('path');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// {{text}} → 高亮；其余转义
const hl = s => esc(s).replace(/\{\{([\s\S]*?)\}\}(?!\})/g, '<span class="hl">$1</span>');

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

// 字节布局 box：{ label, layout:[{name,size,color,role,cons,err}], hex?, note? }
const layoutBox = b => `<div class="layout"><span class="n">${hl(b.label || '')}</span>
<div class="strip">${b.layout.map((f, i) => `<div class="seg c${f.color != null ? f.color : i % 6}" style="flex:${f.flex || 1}"><b>${esc(f.name)}</b><small>${esc(f.size)}</small></div>`).join('')}</div>
<ul class="fields">${b.layout.map((f, i) => `<li><span class="dot c${f.color != null ? f.color : i % 6}"></span><b>${esc(f.name)}</b> <span class="sz">${esc(f.size)}</span>　${hl(f.role || '')}${f.cons ? `　<span class="cons">${hl(f.cons)}</span>` : ''}${f.err ? ` <span class="e">(${esc(f.err)})</span>` : ''}</li>`).join('')}</ul>
${b.hex ? `<div class="hex">${b.hex.map(h => `<div><span class="hk">${esc(h[0])}</span>${hl(h[1])}</div>`).join('')}</div>` : ''}
${b.note ? `<div class="note">${hl(b.note)}</div>` : ''}</div>`;
const box = b => b.layout ? layoutBox(b) : `<div class="cell"><span class="n">${hl(b.label || '')}</span>${hl(b.body || '')}</div>`;

function render(spec) {
  const cards = (spec.transitions || []).map(t => `
<div class="card">
<h2><span>${esc(t.tag || '')}</span>${esc(t.title || '')}</h2>
<div class="flow">
<div class="col">${(t.inputs || []).map(box).join('\n')}</div>
<div class="arrow">➜</div>
<div class="col">${(t.outputs || []).map(box).join('\n')}</div>
</div>
${(t.layouts || []).map(layoutBox).join('\n')}
${(t.extras || []).map(x => `<div class="extra">${hl(x)}</div>`).join('\n')}
${t.limits && t.limits.length ? `<div class="limits"><h3>限制</h3><ul>
${t.limits.map(l => `<li><b>${esc(l.field)}</b>${/^[≤≥=<>]/.test(l.cond) ? ' ' : '：'}${hl(l.cond)}${l.err != null && l.err !== '' ? ` <span class="e">(${esc(l.err)})</span>` : ''}${l.note ? ` <span class="note">（${hl(l.note)}）</span>` : ''}</li>`).join('\n')}
</ul></div>` : ''}
</div>`).join('\n');
  const tpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
  return tpl.replace(/\{\{TITLE\}\}/g, esc(spec.title || 'CKB 合约约束'))
            .replace('{{SUBTITLE}}', hl(spec.subtitle || ''))
            .replace('{{CARDS}}', cards)
            .replace('{{FOOTER}}', spec.notes ? `<div class="sub">${(Array.isArray(spec.notes) ? spec.notes : [spec.notes]).map(hl).join('<br>')}</div>` : '');
}

function build(inFile, outFile) {
  const html = render(loadSpec(inFile));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  console.log(`${inFile} -> ${outFile}`);
}

function main() {
const a = process.argv.slice(2);
if (!a.length) { console.error('用法: node gen.js <spec.json|yaml> [out.html]\n      node gen.js --all [specsDir=specs] [outDir=out]'); process.exit(1); }
if (a[0] === '--all') {
  const sd = a[1] || 'specs', od = a[2] || 'out', items = [];
  for (const f of fs.readdirSync(sd).filter(f => /\.(json|ya?ml)$/i.test(f)).sort()) {
    const name = f.replace(/\.(json|ya?ml)$/i, ''); build(path.join(sd, f), path.join(od, name + '.html'));
    items.push([name, loadSpec(path.join(sd, f)).title || name]);
  }
  fs.writeFileSync(path.join(od, 'index.html'), `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>CKB 合约 Cell 流转约束</title><style>body{font:18px/1.9 -apple-system,"PingFang SC",sans-serif;max-width:800px;margin:60px auto;padding:0 24px}a{color:#2f6fed}</style></head><body><h1>CKB 合约 Cell 流转约束</h1><ul>${items.map(([n, t]) => `<li><a href="${n}.html">${esc(t)}</a></li>`).join('')}</ul></body></html>`);
} else {
  const out = a[1] || path.join('out', path.basename(a[0]).replace(/\.(json|ya?ml)$/i, '') + '.html');
  build(a[0], out);
}
}
if (require.main === module) main();
module.exports = { render, parseYaml };
