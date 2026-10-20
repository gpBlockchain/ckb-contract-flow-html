# ckb-contract-flow-html

一键把 CKB 合约的 **Cell 流转约束** 生成极简 HTML：每个状态转换一张卡片，`输入 Cell → 输出 Cell`，被约束的字段高亮，下方列出 `字段：条件 (错误码)`。

零依赖，只需 Node.js ≥ 16。

## 用法

```bash
node gen.js specs/dao.json            # -> out/dao.html
node gen.js specs/sudt.json my.html   # 指定输出
node gen.js --all specs out           # 构建全部 + 生成 out/index.html
```

内置示例：

| spec | 合约 |
| --- | --- |
| `specs/dao.json` | NervosDAO（`ckb-system-scripts/c/dao.c`） |
| `specs/sudt.json` | Simple UDT（RFC 0025，`simple_udt.c`） |
| `specs/multisig.json` | `secp256k1_blake160_multisig_all.c`（lock script） |
| `specs/example.yaml` | YAML 格式最小示例 |

推送到 `main` 后，`.github/workflows/pages.yml` 会构建所有 spec 并发布到 GitHub Pages（需在仓库 Settings → Pages 中把 Source 选为 *GitHub Actions*）。

## Spec 格式

```jsonc
{
  "title": "页面标题",
  "subtitle": "来源说明",
  "transitions": [
    {
      "tag": "0 → 1",                 // 左上角标签，如 0 → 1 / 1 → 1 / 1 → 0
      "title": "存款",
      "inputs":  [ { "label": "input[i]：xxx", "body": "Cell{\n  capacity: X,\n  data: {{高亮}}\n}" } ],
      "outputs": [ { "label": "...", "body": "..." } ],
      "extras":  [ "header_deps: [ {{D}} ]" ],          // 可选，卡片下方的附加行
      "limits":  [ { "field": "data", "cond": "恰好 8 字节", "err": "-19", "note": "可选备注" } ]
    }
  ],
  "notes": ["可选，页脚说明"]
}
```

- `body` 原样按等宽字体显示（保留换行/缩进），用 `{{...}}` 标记需要高亮的被约束字段。
- `cond` 以 `≤ ≥ = < >` 开头时不加冒号。
- 也支持 `.yaml`（简单子集：映射、`- ` 列表、标量、`|` 多行块）；复杂内容请用 JSON。

## 用 AI 从合约源码写 spec（推荐流程）

1. 准备合约源码（及其 include 的 `common.h` 等），以及相关 RFC。
2. 把下面的提示词连同源码交给 AI：

```text
你是 CKB 合约审阅者。阅读下面的合约源码，输出一个符合 ckb-contract-flow-html spec 格式的 JSON：
- 按 cell 生命周期列出每种状态转换（tag 如 "0 → 1" / "1 → 1" / "1 → 0"，title 为中文动作名）。
- inputs/outputs 用 Cell{ capacity, lock, type:{codeHash, args}, data } 伪结构表示，
  witness、header_deps、since 等需要的额外结构也画成 box 或 extras；
  被合约检查的字段用 {{ }} 包起来高亮。
- limits 只写源码里**真实存在**的检查：字段、条件、对应的 return 错误码（数值），
  不要编造；源码未检查但通常由节点/共识/其他脚本保证的，写到 note 并注明“非本合约检查”。
- 错误码以源码 #define 为准（注意 common.h 里的公共定义）。
只输出 JSON。
```

3. 保存为 `specs/<name>.json`，运行 `node gen.js specs/<name>.json`，浏览器打开检查。
4. **人工核对**：逐条对照源码中的 `return ERROR_*`，确认没有遗漏/虚构；有疑问的规则写进 `note`。

## 目录

```
gen.js          生成器（零依赖）
template.html   页面模板（{{TITLE}} {{SUBTITLE}} {{CARDS}} {{FOOTER}}）
specs/          spec 文件
out/            生成结果（不入库，CI 生成）
```
