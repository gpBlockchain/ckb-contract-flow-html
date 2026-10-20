# ckb-contract-flow-html

[中文](#中文) | [English](#english)

---

## 中文

一键把 CKB 合约的 **Cell 流转约束** 生成极简、**中英双语** 的 HTML：每个状态转换一张卡片，`输入 Cell → 输出 Cell`，被约束的字段高亮，下方列出 `字段：条件 (错误码)`。页面右上角有 中文/EN 切换按钮，选择保存在 localStorage，默认跟随浏览器语言。

零依赖，只需 Node.js ≥ 16。

### 用法

```bash
node gen.js --all out                 # 构建 contracts/*/spec.json + tx.html + index.html
node gen.js contracts/sudt/spec.json my.html   # 单个 spec
node scripts/new-contract.js <id>     # 新合约骨架（见 docs/ADD_CONTRACT.md）
node scripts/test-tx.js [id|txhash…]  # 真实交易测试（contracts/*/tests.json）
node scripts/check.js                 # 检查标签闭合 + 双语覆盖（在仓库根目录运行）
```

| `contracts/<id>/` | 合约 |
| --- | --- |
| `nervos_dao` | NervosDAO（`ckb-system-scripts/c/dao.c`） |
| `secp256k1_blake160` | `secp256k1_blake160_sighash_all.c`（lock） |
| `multisig_legacy` / `multisig_v2` | `secp256k1_blake160_multisig_all.c`（lock，含字节布局） |
| `sudt` | Simple UDT（RFC 0025，`simple_udt.c`） |
| `xudt` | xUDT（RFC 0052，`xudt_rce.c`） |

每个目录：`spec.json`（静态约束页）、`plugin.js`（tx.html 解码插件）、`tests.json`（真实交易测试）。新增合约请看 **[docs/ADD_CONTRACT.md](docs/ADD_CONTRACT.md)**。YAML 示例：`docs/example-spec.yaml`。

推送到 `main` 后，`.github/workflows/pages.yml` 构建所有 spec 并发布到 GitHub Pages（需在 Settings → Pages 把 Source 设为 *GitHub Actions*）。

### Spec 格式

**任意文本字段**可以是字符串（语言无关，如 `"Cell{ capacity: X }"`），或双语对象 `{"zh": "...", "en": "..."}`。含中文的文本必须写成双语对象（`scripts/check.js` 会检查）。

```jsonc
{
  "title": { "zh": "页面标题", "en": "Page title" },
  "subtitle": { "zh": "来源说明", "en": "Source" },
  "transitions": [
    {
      "tag": "0 → 1",
      "title": { "zh": "存款", "en": "Deposit" },
      "inputs":  [ { "label": { "zh": "输入", "en": "input" }, "body": "Cell{\n  data: {{高亮/highlight}}\n}" } ],
      "outputs": [ { "label": "...", "body": { "zh": "...", "en": "..." } } ],
      "layouts": [ { "label": "...", "layout": [ { "name": "S", "size": "1B", "role": {...}, "cons": {...}, "err": "-41", "flex": 1, "color": 0 } ],
                     "hex": [["name", "0x.."]], "note": {...} } ],
      "extras":  [ "header_deps: [ {{D}} ]" ],
      "limits":  [ { "field": "data", "cond": { "zh": "恰好 8 字节", "en": "exactly 8 bytes" }, "err": "-19", "note": {...} } ]
    }
  ],
  "notes": [ { "zh": "页脚", "en": "footer" } ]
}
```

- `body` 按等宽字体原样显示；`{{...}}` 标记高亮的被约束字段。
- `layouts` / 带 `layout` 的 box：彩色字节条 + 字段说明（见 `contracts/multisig_legacy/spec.json`）。
- `cond` 以 `≤ ≥ = < >` 开头时不加冒号。
- 也支持 `.yaml`（简单子集），复杂内容建议 JSON。

### 链上交易解码器 `out/tx.html`

输入交易 hash 和 RPC（预设 mainnet `https://mainnet.ckb.dev/rpc`、testnet `https://testnet.ckb.dev/rpc`，或自定义），页面会：

- 调用 `get_transaction` 取交易，并逐个取输入的前序交易、`get_header` 取 header_deps / DAO 相关区块头；
- 用内置 blake2b（`ckb-default-hash`）计算 script hash，按 lock / type 分组成卡片（输入 → 输出），标出解锁本组的 witness 并解析 WitnessArgs（molecule）；
- 识别已知脚本：secp256k1_blake160、multisig 旧版（RFC 0024）与 V2（`0x36c9…0d29`/data1，来自 ckb-sdk / ccc）、NervosDAO、sUDT（RFC 0025）、xUDT（RFC 0052）；其他显示为“未知脚本”；
- 解析 multisig S/R/M/N/pubkey hash/签名、DAO 阶段（存款区块、D/W epoch、AR、最小 since、最大可提取）、sUDT/xUDT u128 数量，并做**无需签名**的约束检查（✓/✗），签名校验标记为 ○ 未检查；
- RPC 不可达或未开启 CORS 时给出明确提示。支持 `tx.html#tx=0x…&rpc=…` 直链。

代码：`lib/ckb.js`（blake2b、molecule、script hash、RPC、分组、插件注册表）+ `contracts/*/plugin.js`（各合约解析与检查）+ `tx-app.js`（通用渲染），由 `gen.js --all` 内联打包成单文件。测试：`node scripts/test-tx.js`（运行各 `tests.json`，需能访问 RPC，`RPC=` / `TESTNET_RPC=` 可覆盖）。

### 用 AI 从合约源码写 spec

把下面的提示词（见 English 部分的 *AI prompt*，中英通用）连同合约源码（及 `common.h` 等 include）交给 AI，或直接按 [docs/ADD_CONTRACT.md](docs/ADD_CONTRACT.md) 的完整流程，保存到 `contracts/<id>/spec.json`，运行 `node gen.js --all out && node scripts/check.js`，然后**逐条对照源码的 `return ERROR_*` 人工核对**。

---

## English

Generate a minimal, **bilingual (Chinese/English)** HTML page describing a CKB contract's **cell-flow constraints**: one card per state transition, `input cells → output cells`, constrained fields highlighted, followed by `field: condition (error code)`. A 中文/EN toggle sits at the top right; the choice is stored in localStorage and defaults to the browser language.

Zero dependencies; Node.js ≥ 16.

### Usage

```bash
node gen.js --all out                 # build contracts/*/spec.json + tx.html + index.html
node scripts/new-contract.js <id>     # scaffold a contract (see docs/ADD_CONTRACT.md)
node scripts/test-tx.js [id|txhash…]  # real-tx tests (contracts/*/tests.json)
node scripts/check.js                 # tag balance + bilingual coverage (run from repo root)
```

Pushing to `main` runs `.github/workflows/pages.yml`, which builds every spec and deploys `out/` to GitHub Pages (set Settings → Pages → Source to *GitHub Actions*).

### Spec format

Any text field is either a plain string (language-neutral, e.g. code-like `Cell{ … }`) or `{"zh": "...", "en": "..."}`. Text containing Chinese must be bilingual (enforced by `scripts/check.js`). See the jsonc example in the Chinese section and the files in `contracts/*/spec.json`. `{{...}}` highlights a constrained field; `layout` boxes render byte layouts.

### On-chain transaction decoder `out/tx.html`

Enter a tx hash and an RPC URL (presets: mainnet `https://mainnet.ckb.dev/rpc`, testnet `https://testnet.ckb.dev/rpc`, or custom). The page:

- fetches `get_transaction`, resolves every input's previous output, and calls `get_header` for header_deps / DAO blocks;
- computes script hashes with a built-in blake2b (`ckb-default-hash`), groups cells by lock / type script into input → output cards, shows which witness unlocks each lock group and parses WitnessArgs (molecule);
- recognizes secp256k1_blake160, multisig legacy (RFC 0024) and V2 (`0x36c9…0d29`/data1, from ckb-sdk / ccc), NervosDAO, sUDT (RFC 0025), xUDT (RFC 0052); anything else is shown as "unknown script";
- parses multisig S/R/M/N/pubkey hashes/signatures, DAO phase (deposit block, D/W epochs, AR, minimum since, max withdraw), sUDT/xUDT u128 amounts, and runs **signature-free** constraint checks (✓/✗); signature verification is marked ○ not checked;
- shows a clear message when the RPC is unreachable or blocks CORS. Deep links: `tx.html#tx=0x…&rpc=…`.

Code: `lib/ckb.js` (blake2b, molecule, script hash, RPC, grouping, plugin registry) + `contracts/*/plugin.js` (per-contract parse & check) + `tx-app.js` (generic rendering), inlined into a single file by `gen.js --all`. Test: `node scripts/test-tx.js` (runs every `tests.json`; needs RPC access; override with `RPC=` / `TESTNET_RPC=`). To add a contract see **[docs/ADD_CONTRACT.md](docs/ADD_CONTRACT.md)**.

### AI prompt

```text
You are a CKB smart-contract reviewer. Read the contract source below (and its included
headers such as common.h) and output ONE JSON spec for ckb-contract-flow-html:

- One transition per lifecycle step (tag like "0 → 1" / "1 → 1" / "1 → 0" / "1 → N").
- Every human-readable text field MUST be bilingual: {"zh": "<简体中文>", "en": "<technical English>"}.
  Code-like strings with no natural language (e.g. "header_deps: [ {{D}} ]") may stay plain strings.
- inputs/outputs: pseudo-structs Cell{ capacity, lock, type:{codeHash, args}, data, since };
  add witness / header_deps boxes or extras when the script reads them.
  Wrap every field the script actually checks in {{ }}.
- For structured byte data (args, witness lock, cell data), add a "layouts" box:
  [{name, size, role, cons, err}] in byte order, plus a small concrete hex example if useful.
- limits: ONLY checks that really exist in the source: field, condition, and the numeric error
  code it returns (resolve #define values, including those in common.h). Do not invent rules.
  Things not checked by this script (consensus, other scripts) go into "note", marked as such.
Output only the JSON.
```

Then save it as `contracts/<id>/spec.json` (full procedure: docs/ADD_CONTRACT.md), run `node gen.js --all out && node scripts/check.js`, open the page, and **manually verify every `return ERROR_*` against the source**.

### Layout

```
gen.js                 generator (static pages + tx.html + index)
template.html          page template
tx-template.html, tx-app.js   tx decoder UI (generic rendering)
lib/ckb.js             core: blake2b, molecule, script hash, RPC, fetching, grouping, plugin registry
lib/contracts.js       discovers contracts/*/ (Node), plugin order via // @requires
contracts/<id>/        spec.json · plugin.js · tests.json
scripts/check.js       tag balance & bilingual coverage
scripts/test-tx.js     real-tx tests
scripts/new-contract.js  scaffold a contract
docs/ADD_CONTRACT.md   how to add a contract (zh/en), plugin API, AI prompt, contributing
out/                   build output (git-ignored; built by CI)
```

## 欢迎贡献 / Contributions welcome

缺少某个合约？按 [docs/ADD_CONTRACT.md](docs/ADD_CONTRACT.md) 添加 `contracts/<id>/` 并提 PR，在 `meta.json` 的 `contributors` 里写上你的 GitHub 用户名，合约页和首页会显示你的头像与署名。

Missing a contract? Add `contracts/<id>/` following [docs/ADD_CONTRACT.md](docs/ADD_CONTRACT.md) and open a PR. Put your GitHub username in `contributors` in `meta.json` and the contract page and index will credit you with your avatar.
