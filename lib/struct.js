// Parse a spec pseudo-struct body into fields, so cells / witnesses can be drawn as rows instead of code:
//   "Cell{\n  capacity: X,\n  type: { codeHash: DAO, args: {{0x}} }  // note\n}"
//   → { name: 'Cell', fields: [{ k, base, v, hl?, sub?, notes }], notes, post }
// {{…}} highlights become H1…H2 (their content may hold commas or braces and stays in one field).
// Top-level items may also be assertions ("{{capacity ≥ C}}", "status = 0") or bare names ("since").
// Returns null when the text is not one struct; the caller then shows it as plain code.
'use strict';
const H1 = '\u0001', H2 = '\u0002', OPEN = '([{', CLOSE = ')]}';
const KEY = '[A-Za-z_][\\w.]*(?:\\([^)]*\\)|\\[[^\\]]*\\])*';
const keyRe = new RegExp('^(' + KEY + ')\\s*:(?!:)\\s*([\\s\\S]*)$'), assertRe = new RegExp('^(' + KEY + ')\\s*(≥|≤|==|!=|=|≠|<|>|∈)\\s*([\\s\\S]*)$'), bareRe = new RegExp('^' + KEY + '$');
const wrapped = t => t.startsWith(H1) && t.endsWith(H2) && t.indexOf(H1, 1) < 0;
// closing braces left in s from i on, outside highlights and // comments
function closers(s, i) {
  let n = 0, inH = false;
  for (; i < s.length; i++) { const c = s[i];
    if (inH) { if (c === H2) inH = false; continue; } if (c === H1) { inH = true; continue; }
    if (c === '/' && s[i + 1] === '/') { const e = s.indexOf('\n', i); if (e < 0) break; i = e; continue; }
    if (c === '}') n++; }
  return n;
}
// strict: every item must be "key: value" (nested values such as { codeHash, hashType, args })
function parse(s, strict) {
  const m = s.match(/^\s*([A-Za-z_]\w*)?\s*\{/);
  if (!m) return null;
  let depth = 1, inH = false, cur = { t: '', c: [] }, end = -1;
  const segs = [];
  for (let i = m[0].length; i < s.length; i++) {
    const c = s[i];
    if (inH) { cur.t += c; if (c === H2) inH = false; continue; }
    if (c === H1) { inH = true; cur.t += c; continue; }
    if (c === '/' && s[i + 1] === '/' && /[\s,]/.test(s[i - 1] || ' ')) {
      let e = s.indexOf('\n', i); if (e < 0) e = s.length;
      let txt = s.slice(i + 2, e).trim();
      // "… // note }": a brace at the end of a comment closes the struct when nothing after it does
      const k = ((txt.match(/(\s*\})+$/) || [''])[0].match(/\}/g) || []).length, close = Math.max(0, Math.min(k, depth - closers(s, e)));
      if (close) txt = txt.replace(new RegExp('(\\s*\\}){' + close + '}$'), '').trim();
      txt = txt.replace(/,$/, '');   // "type: null  // not checked," – the field separator ended up inside the comment
      if (depth === 1) cur.c.push(txt); else cur.t += ' // ' + txt;
      if (close) { depth -= close; if (depth === 0) { end = e - 1; break; } cur.t += '}'.repeat(close); }
      i = e - 1; continue;
    }
    if (OPEN.includes(c)) { depth++; cur.t += c; continue; }
    if (CLOSE.includes(c)) { if (--depth === 0) { end = i; break; } cur.t += c; continue; }
    if (depth === 1 && (c === ',' || c === '\n')) { segs.push(cur); cur = { t: '', c: [] }; continue; }
    cur.t += c;
  }
  if (end < 0 || inH) return null;
  segs.push(cur);
  const fields = [], notes = [];
  let other = 0;
  for (const g of segs) {
    const t = g.t.trim();
    if (!t) { (fields.length ? fields[fields.length - 1].notes : notes).push(...g.c); continue; }
    let f = null, km = t.match(keyRe);
    if (km) f = { k: km[1], v: km[2] };
    else if (!strict) {
      const w = wrapped(t), u = w ? t.slice(1, -1).trim() : t, am = u.match(assertRe);
      if (am) f = { k: am[1], v: w ? H1 + am[2] + ' ' + am[3] + H2 : am[2] + ' ' + am[3] };
      else if (bareRe.test(u)) f = { k: u, v: '' };
    }
    if (!f) { other++; notes.push(t, ...g.c); continue; }
    f.v = f.v.replace(/,\s*$/, '').trim(); f.base = f.k.match(/^[A-Za-z_]\w*/)[0]; f.notes = g.c;
    const w = wrapped(f.v), inner = w ? f.v.slice(1, -1).trim() : f.v;
    if (/^([A-Za-z_]\w*\s*)?\{/.test(inner)) { const sub = parse(inner, true); if (sub && !sub.post.length) { f.sub = sub; f.hl = w; } }
    fields.push(f);
  }
  if (!fields.length || (strict ? other : other > fields.length)) return null;
  const post = s.slice(end + 1).split('\n').map(x => x.trim()).filter(Boolean).map(x => x.replace(/^\/\/\s?/, ''));
  return { name: m[1] || '', fields, notes, post };
}
const parseStruct = src => parse(String(src).replace(/\{\{([\s\S]*?)\}\}(?!\})/g, H1 + '$1' + H2), false);
module.exports = { parseStruct, H1, H2 };
