# ckb-contract-flow-html

[中文](#中文) | [English](#english)

---

## 中文

一键把 CKB 合约的 **Cell 流转约束** 生成极简、**中英双语** 的 HTML：每个状态转换一张卡片，`输入 Cell → 输出 Cell`，被约束的字段高亮，下方列出 `字段：条件 (错误码)`。页面右上角有 中文/EN 切换按钮，选择保存在 localStorage，默认跟随浏览器语言。

零依赖，只需 Node.js ≥ 16。

### 用法

```bash
node gen.js specs/dao.json            # -> out/dao.html
node gen.js specs/sudt.json my.html   # 指定输出
node gen.js --all specs out           # 构建全部 + out/index.html
node scripts/check.js                 # 检查标签闭合 + 双语覆盖（在仓库根目录运行）
```

| spec | 合约 |
| --- | --- |
| `specs/dao.json` | NervosDAO（`ckb-system-scripts/c/dao.c`） |
| `specs/sudt.json` | Simple UDT（RFC 0025，`simple_udt.c`） |
| `specs/multisig.json` | `secp256k1_blake160_multisig_all.c`（lock script，含字节布局） |
| `specs/example.yaml` | YAML 最小示例 |

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
- `layouts` / 带 `layout` 的 box：彩色字节条 + 字段说明（见 `specs/multisig.json`）。
- `cond` 以 `≤ ≥ = < >` 开头时不加冒号。
- 也支持 `.yaml`（简单子集），复杂内容建议 JSON。

### 用 AI 从合约源码写 spec

把下面的提示词（见 English 部分的 *AI prompt*，中英通用）连同合约源码（及 `common.h` 等 include）交给 AI，保存输出为 `specs/<name>.json`，运行 `node gen.js --all && node scripts/check.js`，然后**逐条对照源码的 `return ERROR_*` 人工核对**。

---

## English

Generate a minimal, **bilingual (Chinese/English)** HTML page describing a CKB contract's **cell-flow constraints**: one card per state transition, `input cells → output cells`, constrained fields highlighted, followed by `field: condition (error code)`. A 中文/EN toggle sits at the top right; the choice is stored in localStorage and defaults to the browser language.

Zero dependencies; Node.js ≥ 16.

### Usage

```bash
node gen.js specs/dao.json            # -> out/dao.html
node gen.js --all specs out           # build all + out/index.html
node scripts/check.js                 # tag balance + bilingual coverage (run from repo root)
```

Pushing to `main` runs `.github/workflows/pages.yml`, which builds every spec and deploys `out/` to GitHub Pages (set Settings → Pages → Source to *GitHub Actions*).

### Spec format

Any text field is either a plain string (language-neutral, e.g. code-like `Cell{ … }`) or `{"zh": "...", "en": "..."}`. Text containing Chinese must be bilingual (enforced by `scripts/check.js`). See the jsonc example in the Chinese section and the files in `specs/`. `{{...}}` highlights a constrained field; `layout` boxes render byte layouts.

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

Then save it as `specs/<name>.json`, run `node gen.js --all specs out && node scripts/check.js`, open the page, and **manually verify every `return ERROR_*` against the source**.

### Layout

```
gen.js            generator
template.html     page template ({{DOC_TITLE}} {{TOGGLE}} {{TITLE}} {{SUBTITLE}} {{CARDS}} {{FOOTER}})
specs/            spec files
scripts/check.js  tag-balance & bilingual coverage check
out/              build output (git-ignored; built by CI)
```
