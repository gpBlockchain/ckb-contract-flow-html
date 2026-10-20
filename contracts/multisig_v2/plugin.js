// @requires multisig_legacy
// secp256k1_blake160_multisig_all V2 (ckb-system-scripts PR #99, improved optional-since handling).
// Same witness layout as legacy; reuses R.multisig from contracts/multisig_legacy/plugin.js (loaded first).
(function (R) {
  if (!R.multisig && typeof require !== 'undefined') require('../multisig_legacy/plugin.js');
  if (!R.multisig) throw new Error('multisig_v2 requires multisig_legacy plugin');
  R.register({ id: 'multisig_v2', kind: 'lock', name: 'Multisig V2',
    match: [{ code_hash: '0x36c971b8d41fbd94aabca77dc75e826729ac98447b46f91e00796155dddb0d29', hash_type: 'data1', src: 'ckb-sdk MultisigScript::V2; ckb-devrel/ccc (mainnet & testnet)' }],
    parse: R.multisig.parse, check: R.multisig.check });
})((typeof CKB !== "undefined" ? CKB : require("../../lib/ckb.js")));
