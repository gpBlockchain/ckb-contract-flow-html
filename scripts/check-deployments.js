#!/usr/bin/env node
// Deployment + source provenance.
//   node scripts/check-deployments.js            check every contracts/<id>/meta.json against chain + upstream; exit 1 on drift
//   node scripts/check-deployments.js --write    (re)resolve deployments from chain and write them into meta.json
//   options: --only <id,...>   --report <file.md>  (markdown summary, used by the weekly workflow)
// Needs network access to CKB public RPC; upstream commit checks use `gh api` if available, else the public GitHub API.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const C = require('../lib/contracts.js'), CKB = C.loadAll(), D = require('./deployments-lib.js');
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const WRITE = args.includes('--write'), ONLY = opt('--only') ? opt('--only').split(',') : null, REPORT = opt('--report');
const NETS = ['mainnet', 'testnet'];
function gh(p) {
  try { return JSON.parse(cp.execFileSync('gh', ['api', p], { stdio: ['ignore', 'pipe', 'ignore'] }).toString()); }
  catch (e) { try { return JSON.parse(cp.execFileSync('curl', ['-sfL', 'https://api.github.com/' + p]).toString()); } catch (e2) { return null; } }
}
const repoOf = url => url && url.replace(/^https:\/\/github.com\//, '').replace(/\.git$/, '');
// verified = deployed data hash equals the blake2b of a binary in the repo at the recorded commit, or is listed in a checksum / deployment file there
function verifyBinary(src, hashes, builtin) {
  if (!src || !src.repo || !src.commit) return { status: 'no-source' };
  if (!hashes.length && builtin) return { status: 'builtin', note: 'no code cell (built into CKB)' };
  const repo = repoOf(src.repo), tree = gh(`repos/${repo}/git/trees/${src.commit}?recursive=1`);
  if (!tree || !tree.tree) return { status: 'unverified', note: 'repo tree not readable' };
  const want = new Set(hashes.map(h => h.toLowerCase())), found = {};
  const text = tree.tree.filter(t => t.type === 'blob' && t.size < 300000 && /(checksum|sha256|hashes|deployment|info\.json|README\.md$)/i.test(t.path)).slice(0, 40);
  const bins = tree.tree.filter(t => t.type === 'blob' && t.size < 3000000 && /(^|\/)(build\/release|deps|specs\/cells|binaries)\//.test(t.path) && !/\.(c|h|rs|md|txt|toml|json|sh|py|js|ts|mol|lock)$/i.test(t.path)).slice(0, 60);
  for (const t of text) { const b = gh(`repos/${repo}/git/blobs/${t.sha}`); if (!b) continue; const s = Buffer.from(b.content, 'base64').toString('utf8').toLowerCase();
    for (const h of want) if (s.includes(h.slice(2))) (found[h] = found[h] || []).push('listed in ' + t.path); }
  for (const t of bins) { const b = gh(`repos/${repo}/git/blobs/${t.sha}`); if (!b) continue; const h = D.dataHash('0x' + Buffer.from(b.content, 'base64').toString('hex'));
    if (want.has(h)) (found[h] = found[h] || []).push('blake2b of ' + t.path); }
  if (!hashes.length) return builtin ? { status: 'builtin', note: 'no code cell (built into CKB)' } : { status: 'unverified', note: 'no deployment resolved on chain' };
  // strong evidence: a binary at the commit hashes to it, or a checksum file at the commit lists it. A deployment record only shows it was deployed from this repo.
  const strong = e => /^blake2b of /.test(e) || /checksum|sha256sum/i.test(e);
  const per = hashes.map(h => { const ev = found[h.toLowerCase()] || []; return { data_hash: h, evidence: ev, matches_commit: ev.some(strong) }; });
  const all = per.every(x => x.matches_commit), rec = per.every(x => x.evidence.length);
  return { status: all ? 'verified' : 'unverified', per, note: all ? 'deployed data hash matches a binary / checksum in the repo at the recorded commit'
    : rec ? 'hash appears in the repo only as a deployment record or doc, which does not prove the recorded commit builds this binary (reproducible build not attempted)'
    : 'no binary or checksum at the recorded commit matched the deployed data hash (reproducible build not attempted)' };
}
async function resolveAll(c, meta) {
  const p = CKB.PLUGINS.find(x => x.id === c.id), tests = c.tests ? JSON.parse(fs.readFileSync(c.tests, 'utf8')) : [], out = [];
  for (const m of p.match) for (const net of m.net ? [m.net] : NETS) {
    let r = null; try { r = await D.resolve(net, m, p.kind, tests); } catch (e) { r = { error: e.message }; }
    if (r) out.push({ network: net, code_hash: m.code_hash, hash_type: m.hash_type, constant_source: m.src || null, ...r });
  }
  return out;
}
(async () => {
  const lines = [], drift = [];
  for (const c of C.list()) {
    if (ONLY && !ONLY.includes(c.id)) continue;
    const mp = path.join(c.dir, 'meta.json'); if (!fs.existsSync(mp)) { drift.push(`${c.id}: missing meta.json`); continue; }
    const meta = JSON.parse(fs.readFileSync(mp, 'utf8')), now = await resolveAll(c, meta);
    if (WRITE) {
      meta.deployments = now.map(d => { const o = { ...d }; delete o.seen_in_tx; delete o.live; return o; });
      const hashes = [...new Set(now.filter(d => d.data_hash).map(d => d.data_hash))];
      meta.source = { ...meta.source, binary: verifyBinary(meta.source, hashes, now.length > 0 && now.every(d => d.builtin)) };
      meta.checked_at = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(mp, JSON.stringify(meta, null, 2) + '\n'); console.log(`${c.id}: ${now.length} deployment(s), binary ${meta.source.binary.status}`); continue;
    }
    for (const old of meta.deployments || []) {
      const cur = now.find(d => d.network === old.network && d.code_hash === old.code_hash && d.hash_type === old.hash_type);
      const tag = `${c.id} [${old.network} ${old.code_hash.slice(0, 10)}…/${old.hash_type}]`;
      if (!cur) { drift.push(`${tag}: deployment no longer resolvable`); continue; }
      if (cur.builtin) continue;
      if (old.data_hash && cur.data_hash !== old.data_hash) drift.push(`${tag}: data hash changed ${old.data_hash} → ${cur.data_hash} (script upgraded via type_id?)`);
      if (old.code_cell && cur.code_cell && (old.code_cell.tx_hash !== cur.code_cell.tx_hash || old.code_cell.index !== cur.code_cell.index)) drift.push(`${tag}: code cell moved to ${cur.code_cell.tx_hash}:${cur.code_cell.index}`);
      if (JSON.stringify(old.type_script) !== JSON.stringify(cur.type_script)) drift.push(`${tag}: type_id script changed`);
    }
    const s = meta.source || {};
    if (s.repo && s.commit) { const head = gh(`repos/${repoOf(s.repo)}/commits/HEAD`);
      if (head && head.sha && head.sha !== s.commit) { const cmp = gh(`repos/${repoOf(s.repo)}/compare/${s.commit}...${head.sha}`);
        const touched = cmp && cmp.files ? cmp.files.filter(f => (s.paths || []).some(p => f.filename.startsWith(p))).map(f => f.filename) : null;
        lines.push(`- ${c.id}: upstream ${repoOf(s.repo)} is ${cmp ? cmp.ahead_by : '?'} commit(s) ahead of recorded ${s.commit.slice(0, 8)}` + (touched && touched.length ? ` — **source paths changed**: ${touched.join(', ')}` : ''));
        if (touched && touched.length) drift.push(`${c.id}: outdated — upstream changed ${touched.join(', ')} since ${s.commit.slice(0, 8)}`); } }
    console.log(`${c.id}: checked ${now.length}`);
  }
  if (WRITE) return;
  const md = `# Deployment / source drift report\n\n${drift.length ? '## Drift\n' + drift.map(d => '- ' + d).join('\n') : 'No on-chain drift.'}\n\n## Upstream\n${lines.join('\n') || 'All recorded commits are upstream HEAD.'}\n`;
  if (REPORT) fs.writeFileSync(REPORT, md); console.log(md);
  process.exit(drift.length ? 1 : 0);
})();
