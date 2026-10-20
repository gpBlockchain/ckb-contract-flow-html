## 合约 / Contract

- id: `contracts/<id>/`
- kind: lock / type
- 源码 / Source (pinned commit): <!-- https://github.com/…/blob/<commit>/… -->
- 部署常量来源 / Deployment constants source: <!-- RFC / official docs / official SDK -->

## 清单 / Checklist

- [ ] 来源已引用（源码 commit 链接 + code_hash/hash_type 官方来源） / Sources cited (source at a commit + official code_hash/hash_type source)
- [ ] `spec.json` 的 limits 与源码中的 `return ERROR_*` 逐条核对，无虚构 / `spec.json` limits checked against every `return ERROR_*`, nothing invented
- [ ] 所有自然语言文本为 `{"zh","en"}` / All natural-language text is bilingual `{"zh","en"}`
- [ ] `node gen.js --all out` 成功 / succeeds
- [ ] `node scripts/check.js` 通过 / passes
- [ ] `node scripts/test-tx.js <id>` 通过（`tests.json` 含至少 1 笔真实交易） / passes (`tests.json` has ≥ 1 real tx)
- [ ] 未提交 `out/` / `out/` not committed

## 说明 / Notes
<!-- 未核实或未检查的项 / unverified or unchecked items -->
