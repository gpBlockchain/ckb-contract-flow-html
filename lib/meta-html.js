// HTML for tags / provenance / contributors (used by gen.js for pages, index and decoder cards)
'use strict';
const M = require('./meta.js');
const PROJ = (() => { try { return JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'contracts', 'projects.json'), 'utf8')); } catch (e) { return {}; } })();
module.exports = function (T, esc) {
  const L = (zh, en) => T({ zh, en }, esc);
  const qa = s => esc(s).replace(/"/g, '&quot;');
  // bilingual tooltip; the page script swaps title from data-zh-title / data-en-title on load and on language toggle
  const tip = (zh, en) => ` title="${qa(en)}" data-zh-title="${qa(zh)}" data-en-title="${qa(en)}"`;
  const short = h => h && h.length > 22 ? h.slice(0, 12) + '…' + h.slice(-8) : h;
  const EXP = { mainnet: 'https://explorer.nervos.org', testnet: 'https://testnet.explorer.nervos.org' };
  // [label zh, label en, tooltip zh, tooltip en]
  const BADGE = {
    verified: ['✓ 二进制已核验', '✓ binary verified', '链上部署的代码与源码仓库（记录的 commit）中的二进制或校验和一致', 'the deployed code matches a binary or checksum in the source repo at the recorded commit'],
    unverified: ['二进制未核验', 'binary unverified', '还没能把链上代码和源码仓库里的二进制对上（未做可复现编译）；这本身不代表有问题', 'the deployed code has not been matched to a binary in the source repo (no reproducible build attempted); not by itself a sign of a problem'],
    mismatch: ['⚠ 与源码不一致', '⚠ source mismatch', '链上部署的代码与源码不一致', 'the deployed code does not match the source'],
    'no-source': ['无公开源码', 'no public source', '没有可以对照的公开源码', 'there is no public source to compare against'],
    builtin: ['CKB 内置', 'built into CKB', 'CKB 节点内置实现，没有单独部署的代码 Cell', 'implemented inside the CKB node; there is no code cell'],
  };
  // what a Lock / Type script does, in one line
  const KIND = { lock: ['决定谁能花这个 Cell', 'decides who can spend the cell'], type: ['规定 Cell 怎么创建、修改、销毁', 'rules for how the cell is created, changed and destroyed'] };
  const name = t => { const d = M.TAX.tags[t]; return d ? T({ zh: d.zh, en: d.en }, esc) : esc(t); };
  const of = (tags, g) => tags.filter(t => M.TAX.tags[t] && M.TAX.tags[t].group === g);
  const kind = (t, long) => KIND[t] ? `<span class="kind k-${t}"${tip(KIND[t][0], KIND[t][1])}>${name(t)}${long ? `<i>· ${L(KIND[t][0], KIND[t][1])}</i>` : ''}</span>` : '';
  const chip = t => { const d = M.TAX.tags[t]; return d ? `<span class="tag g-${d.group}" data-tag="${esc(t)}"${PROJ[t] ? ' role="button" tabindex="0" aria-expanded="false"' + tip('项目信息', 'project info') : ''}>${name(t)}</span>` : ''; };
  // project registry (contracts/projects.json): clickable project chip toggles a panel with the project's official links
  const PF = [['website', '官网', 'Website'], ['docs', '文档', 'Docs'], ['github', 'GitHub', 'GitHub'], ['talk', 'Nervos Talk 帖子', 'Nervos Talk thread'], ['talk_profile', 'Nervos Talk 作者', 'Nervos Talk author'], ['x', 'X', 'X'], ['discord', 'Discord', 'Discord']];
  const projectPanel = t => { const p = PROJ[t], d = M.TAX.tags[t]; if (!p || !d) return '';
    const rows = PF.filter(([k]) => p[k]).map(([k, zh, en]) => `<li><span class="pk">${L(zh, en)}</span><a href="${esc(p[k])}" rel="noopener" target="_blank">${esc(p[k].replace(/^https?:\/\//, ''))}</a></li>`).join('');
    return `<div class="projp" data-projp="${esc(t)}" hidden><b>${esc(p.name || d.en)}</b>${p.desc ? ` · ${T(p.desc, esc)}` : ''}<ul>${rows}</ul>${p.author ? `<div class="small">${L('作者：', 'Author: ')}${esc(p.author)}</div>` : ''}<div class="small">${L('来源：', 'Source: ')}${esc(p.source || '')}</div></div>`; };
  const chips = tags => `<div class="tags">${tags.map(chip).join('')}</div>${tags.filter(t => PROJ[t]).map(projectPanel).join('')}`;
  const status = meta => (meta && meta.source && meta.source.binary && meta.source.binary.status) || (meta && meta.source && meta.source.status) || 'unverified';
  const badge = meta => { const s = status(meta), b = BADGE[s] || [s, s, s, s]; return `<span class="badge b-${esc(s)}"${tip(b[2], b[3])}>${L(b[0], b[1])}</span>`; };
  const avatar = u => `<a class="av" href="https://github.com/${esc(u)}" title="@${esc(u)}"><img loading="lazy" width="20" height="20" alt="@${esc(u)}" src="https://github.com/${esc(u)}.png?size=40"></a>`;
  const credit = meta => meta && meta.contributors && meta.contributors.length ? `<div class="credit">${L('贡献者：', 'Contributed by ')}${meta.contributors.map(u => `${avatar(u)} <a href="https://github.com/${esc(u)}">@${esc(u)}</a>`).join(', ')}</div>` : '';
  // at-a-glance facts row for a contract page header
  function facts(meta, tags, n) {
    const f = (zh, en, v) => `<div class="fact"><dt>${L(zh, en)}</dt><dd>${v}</dd></div>`, list = g => of(tags, g).map(name).join(' · ') || '—';
    return `<dl class="facts">${f('操作', 'Actions', n.actions)}${f('规则', 'Rules', n.rules)}${meta ? f('网络', 'Network', list('network')) + f('维护方', 'Maintainer', list('maintainer')) + f('源码', 'Source', list('source') + badge(meta)) : ''}</dl>`;
  }
  const tx = (net, h) => `<a href="${EXP[net]}/transaction/${esc(h)}">${esc(short(h))}</a>`;
  function provenance(meta, { compact = false } = {}) {
    if (!meta) return '';
    const s = meta.source || {}, b = s.binary || {};
    const src = s.repo ? `<a href="${esc(s.repo)}/tree/${esc(s.commit || s.tag)}">${esc(s.repo.replace('https://github.com/', ''))}@${esc((s.commit || s.tag || '').slice(0, 8))}</a>`
      + (s.paths || []).map(p => ` · <a href="${esc(s.repo)}/blob/${esc(s.commit || s.tag)}/${esc(p)}">${esc(p)}</a>`).join('')
      : s.local ? L('本地源码', 'local source') + ` @${esc(s.commit === 'uncommitted' ? 'uncommitted' : (s.commit || '').slice(0, 8))}` + (s.paths || []).map(p => ` · ${esc(p)}`).join('') : L('无公开源码', 'no public source');
    const rows = (meta.deployments || []).map(d => d.builtin ? `<tr><td>${name(d.network)}</td><td colspan="5">${esc(short(d.code_hash))} (${esc(d.hash_type)}) — ${L('CKB 内置，无 code cell', 'built into CKB, no code cell')}</td></tr>`
      : `<tr><td>${name(d.network)}</td><td><code>${esc(compact ? short(d.code_hash) : d.code_hash)}</code> <small>${esc(d.hash_type)}</small></td>`
      + `<td>${d.cell_dep ? tx(d.network, d.cell_dep.out_point.tx_hash) + ':' + parseInt(d.cell_dep.out_point.index, 16) + ` <small>${esc(d.cell_dep.dep_type)}</small>` : '—'}</td>`
      + `<td>${d.type_script ? `<code>${esc(short(d.type_script.args))}</code>` : '—'}</td><td><code>${esc(short(d.data_hash || '—'))}</code></td>`
      + `<td>${d.deploy_tx ? tx(d.network, d.deploy_tx) + (d.deploy_block != null ? ` <small>#${d.deploy_block}</small>` : '') : '—'}</td></tr>`).join('');
    const ev = (b.per || []).filter(x => x.evidence && x.evidence.length).map(x => `${esc(short(x.data_hash))}: ${esc(x.evidence.join('; '))}`).join('<br>');
    return `<details class="prov"${compact ? '' : ' open'}><summary>${L('部署与来源', 'Deployments & source')} ${badge(meta)}</summary>
<div class="small">${L('这个合约部署在链上的位置，以及页面所依据的源码。', 'Where this contract is deployed on chain, and the source code this page was written from.')}</div>
<div class="kv"><span class="kl">${L('源码', 'source')}</span>${src}${s.commit_note ? ` <small>(${esc(s.commit_note)})</small>` : ''}</div>
<div class="kv"><span class="kl">${L('二进制核验', 'binary check')}</span>${badge(meta)} <small>${esc(b.note || '')}</small>${ev ? `<br><small>${ev}</small>` : ''}</div>
${rows ? `<div class="tbl"><table><tr><th>${L('网络', 'network')}</th><th>code_hash</th><th>cell_dep</th><th>type_id args</th><th>${L('数据哈希', 'data hash')}</th><th>${L('部署交易', 'deploy tx')}</th></tr>${rows}</table></div>` : `<div class="small">${L('未在链上找到部署', 'no on-chain deployment resolved')}</div>`}
${meta.checked_at ? `<div class="small">${L('链上数据核对于 ', 'on-chain data checked ')}${esc(meta.checked_at)}</div>` : ''}</details>`;
  }
  return { chip, chips, projectPanel, PROJ, badge, status, avatar, credit, provenance, kind, facts, name, of, tip };
};
