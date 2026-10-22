---
name: ckb-contract-flow
description: >-
  Use when the user wants to view, generate or add a bilingual (zh/en) HTML page
  showing a CKB (Nervos) contract's cell state transitions and enforced
  constraints, or to decode an on-chain CKB transaction locally, with the
  ckb-contract-flow-html generator. Covers building pages locally, opening them,
  the tx decoder, and adding a new contract (spec.json / plugin.js / meta.json /
  tests.json).
---

# CKB contract cell-flow HTML (local)

Generator: https://github.com/gpBlockchain/ckb-contract-flow-html.
Source of truth for formats and the plugin API: `README.md` and `docs/ADD_CONTRACT.md` in that repo. Read them before writing a contract.

## Quick path (do this first, no questions needed)
Use the generator from a cache clone; never ask the user to clone anything.
```bash
D="${CKB_FLOW_HOME:-$HOME/.cache/ckb-contract-flow-html}"
if [ -d "$D/.git" ]; then git -C "$D" pull -q --ff-only; else git clone -q --depth 1 https://github.com/gpBlockchain/ckb-contract-flow-html "$D"; fi
cd "$D" && node gen.js --all out
```
- If the requested contract already exists in `contracts/<id>/`, open `out/<id>.html` (and `out/index.html`) for the user.
- Otherwise add it (section 5) inside `$D`, rebuild, and open `out/<id>.html`.
- Report the absolute path of the generated HTML.

## Prerequisites
- Node.js ≥ 16 (zero npm dependencies, no `npm install`) and `git`.
- Network access to a CKB RPC (default `https://mainnet.ckb.dev/rpc`, `https://testnet.ckb.dev/rpc`) for the tx decoder, `test-tx.js` and `check-deployments.js`. Page generation itself is offline.

## 1. Manual clone (optional)
```bash
git clone https://github.com/gpBlockchain/ckb-contract-flow-html
cd ckb-contract-flow-html        # run every command below from the repo root
```

## 2. Generate HTML
```bash
node gen.js --all out                               # every contracts/*/spec.json -> out/<id>.html, plus out/tx.html and out/index.html
node gen.js contracts/sudt/spec.json my.html        # one page from one spec (.json or simple .yaml)
node gen.js contracts/sudt/spec.json                # same, written to out/spec.html (named after the file)
```
`out/` is git-ignored; never commit it.

## 3. Open locally
- Directly: open `out/index.html` (or `out/<id>.html`) in a browser via `file://`.
- Or serve it: `cd out && python3 -m http.server 8000` then visit http://localhost:8000/ (any static server works, e.g. `npx serve out`).

## 4. Decode an on-chain transaction
- Browser: open `out/tx.html`, paste a tx hash, choose mainnet/testnet or a custom RPC. Deep link: `tx.html#tx=0x…&rpc=https://testnet.ckb.dev/rpc`. The public RPCs send `Access-Control-Allow-Origin: *`; a custom node needs CORS enabled.
- CLI (same decoder + checks, prints PASS/FAIL):
  ```bash
  node scripts/test-tx.js 0x<txhash>                                   # ad-hoc, mainnet
  RPC=https://testnet.ckb.dev/rpc node scripts/test-tx.js 0x<txhash>   # ad-hoc on testnet / custom RPC
  node scripts/test-tx.js <id>                                          # run contracts/<id>/tests.json
  node scripts/test-tx.js                                               # run all tests
  ```

## 5. Add a new contract
1. Check `docs/CONTRACTS_INVENTORY.md` / `contracts/` so you don't duplicate. Collect the contract source (with included headers) pinned to a commit, and deployment constants (code_hash / hash_type / network) from official sources only.
2. Scaffold: `node scripts/new-contract.js <id> --kind lock|type` (`<id>` = `[a-z0-9_]+`). Creates `contracts/<id>/{plugin.js,spec.json,tests.json,meta.json}` with TODOs.
3. `spec.json`: one card per state transition; all prose as `{"zh","en"}`; checked fields in `{{ }}`; `limits` only for checks that exist in the source, with numeric error codes; `layouts` for structured bytes.
4. `plugin.js`: `match` (verified constants with `src`), `parse`, `check`; signatures / VM-only checks as `R.NOT_CHECKED`.
5. `tests.json`: ≥1 real on-chain tx, `expect` lists plugin ids.
6. `meta.json`: tags from `contracts/tags.json`, `source` (repo, full commit, paths), optional `contributors`; then fill deployments from chain:
   `node scripts/check-deployments.js --write --only <id>` (without `--write` it only checks, exit 1 on drift).
7. Build and verify, fix until all pass:
   ```bash
   node gen.js --all out && node scripts/check.js && node scripts/test-tx.js <id>
   ```
8. Manually compare every `return ERROR_*` / `CHECK(..., ERROR_*)` in the source with the page: nothing missing, nothing invented. Unverifiable items go in a note marked unverified.
9. Optional PR: branch `contract/<id>`, commit `contracts/<id>/` (not `out/`), one contract per PR, fill the PR template.

## Troubleshooting
- `node gen.js` with no args only prints usage; pass `--all out` or a spec path.
- `check.js` fails with tag/zh-en span mismatch: some text containing Chinese is a plain string or a `{{ }}`/HTML tag is unbalanced; make it `{"zh","en"}`.
- `test-tx.js` fails `ok:false`: a `check()` returned false; compare with the source, or the `match` constant/hash_type (`data`/`data1`/`data2`/`type`) is wrong — verify on chain with `check-deployments.js --only <id>`.
- RPC / network errors: set `RPC=` / `TESTNET_RPC=` to a reachable node; in the browser make sure the node allows CORS.
- Script shows as "unknown" in tx.html: no plugin `match` for that code_hash + hash_type (+ net); regenerate with `node gen.js --all out` after adding one.
- `new-contract.js` says the directory exists: pick another id or edit the existing contract.

## Install this skill
```bash
npx skills add gpBlockchain/ckb-contract-flow-html -g -y
```
(or `curl -fsSL https://raw.githubusercontent.com/gpBlockchain/ckb-contract-flow-html/main/install.sh | sh`)

Then say: `用 ckb-contract-flow 给 <contract repo URL> 生成合约流转 HTML` / `Use ckb-contract-flow to generate a cell-flow HTML for <contract repo URL>`
