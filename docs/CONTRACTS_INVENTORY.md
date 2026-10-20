# CKB 合约清单 / Contracts Inventory

Status: **added** = `contracts/<id>/` has spec + plugin + tests · **todo** = not yet added · **no-source** = no public source found (match-only plugin at most)

Constant sources (official only):
- **RFC 0024** genesis scripts · **RFC 0025** sUDT · **RFC 0026** ACP · **RFC 0039** Cheque · **RFC 0042** Omnilock · **RFC 0052** xUDT — https://github.com/nervosnetwork/rfcs
- **ccc** = `ckb-devrel/ccc` `packages/core/src/client/clientPublic{Mainnet,Testnet}.advanced.ts` @ `9ffef01` (CKB DevRel official SDK)
- **spore-sdk** = `sporeprotocol/spore-sdk` `packages/core/src/config/predefined.ts`
- **rgbpp-sdk** = `utxostack/rgbpp-sdk` `packages/ckb/src/constants/index.ts`
- **iCKB** = data1 hash = blake2b(ckb-default-hash) of the release binaries in `ickb/contracts/scripts/build/release/*`, confirmed on mainnet via indexer

hash_type in parentheses. "same" = identical on both networks.

| id | Name | Mainnet code_hash | Testnet code_hash | Constant source | Source code | Status |
|---|---|---|---|---|---|---|
| secp256k1_blake160 | SECP256K1/blake160 sighash | `0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8` (type) | same | RFC 0024, ccc | nervosnetwork/ckb-system-scripts `c/secp256k1_blake160_sighash_all.c` | added |
| multisig_legacy | SECP256K1/multisig (legacy) | `0x5c5069eb0857efc65e1bca0c07df34c31663b3622fd3876c876320fc9634e2a8` (type) | same | RFC 0024, ccc | ckb-system-scripts `c/secp256k1_blake160_multisig_all.c` | added |
| multisig_v2_beta | Multisig V2 beta (PR #98) | `0xd1a9f877aed3f5e07cb9c52b61ab96d06f250ae6883cc7f0a2423db0976fc821` (type) | `0x765b3ed6ae264b335d07e73ac332bf2c0f38f8d3340ed521cb447b4c42dd5f09` (type) | ccc | ckb-system-scripts (PR #98) | added (matched by multisig_v2 plugin) |
| multisig_v2 | Multisig V2 (PR #99) | `0x36c971b8d41fbd94aabca77dc75e826729ac98447b46f91e00796155dddb0d29` (data1) | same | ccc, ckb-sdk | ckb-system-scripts (PR #99) | added |
| nervos_dao | NervosDAO | `0x82d76d1b75fe2fd9a27dfbaa65a039221a380d76c926f378d3f81cf3e7e13f2e` (type) | same | RFC 0024, ccc | ckb-system-scripts `c/dao.c` | added |
| type_id | Type ID (built-in) | `0x00000000000000000000000000000000000000000000000000545950455f4944` (type) | same | RFC 0024, ccc | nervosnetwork/ckb `script/src/type_id.rs` | added |
| sudt | sUDT | `0x5e7a36a77e68eecc013dfa2fe6a23f3b6c344b04005808694ae6dd45eea4cfd5` (type) | `0xc5e5dcf215925f7ef4dfaf5f4b4f105bc321c02776d6e7d52a1db3fcd9d011a4` (type) | RFC 0025, ccc | ckb-production-scripts `c/simple_udt.c` | added |
| xudt | xUDT | `0x50bd8d6680b8b9cf98b73f3c08faf8b2a21914311954118ad6609be6e78a1b95` (data1) | same (data1, RFC 0052); also `0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb` (type) per ccc / rgbpp-sdk | RFC 0052, ccc, rgbpp-sdk | ckb-production-scripts `c/xudt_rce.c` | added |
| acp | Anyone-can-pay | `0xd369597ff47f29fbc0d47d2e3775370d1250b85140c670e4718af712983a2354` (type) | `0x3419a1c09eb2567f6552ee7a8ecffd64155cffe0f1796e6e61ec088d740c1356` (type) | RFC 0026, ccc | ckb-production-scripts `c/anyone_can_pay.c` | added |
| cheque | Cheque lock | `0xe4d4ecc6e5f9a059bf2f7a82cca292083aebc0c421566a52484fe2ec51a9fb0c` (type) | `0x60d5f39efce409c587cb9ea359cefdead650ca128f0bd9cb3855348f98c70d5b` (type) | RFC 0039 | nervosnetwork/ckb-cheque-script | added |
| omnilock | Omnilock | `0x9b819793a64463aed77c615d6cb226eea5487ccfc0783043a587254cda2b6f26` (type) | `0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb` (type) | RFC 0042, ccc | nervosnetwork/omnilock (formerly cryptape/omnilock) | added |
| spore | Spore (v2) | `0x4a4dce1df3dffff7f8b2cd7dff7303df3b6150c9788cb75dcf6747247132b9f5` (data1) | `0x685a60219309029d01310311dba953d67029170ca4848a4ff638e57002130a0d` (data1, v2 preview); `0xbbad126377d45f90a8ee120da988a2d7332c78ba8fd679aab478a19d6c133494` (data1, v1) | spore-sdk, rgbpp-sdk | sporeprotocol/spore-contract `contracts/spore` | added |
| spore_did | Spore (v2, did) | `0xcfba73b58b6f30e70caed8a999748781b164ef9a1e218424a6fb55ebf641cb33` (type) | `0x0b1f412fbae26853ff7d082d422c2bdd9e2ff94ee8aaec11240a5b34cc6e890f` (type) | spore-sdk | sporeprotocol/spore-contract | added (matched by spore plugin) |
| cluster | Cluster (v2) | `0x7366a61534fa7c7e6225ecc0d828ea3b5366adec2b58206f2ee84995fe030075` (data1) | `0x0bbe768b519d8ea7b96d58f1182eb7e6ef96c541fbd9526975077ee09f049058` (data1, v2 preview); `0x598d793defef36e2eeba54a9b45130e4ca92822e1d193671f490950c3b856080` (data1, v1) | spore-sdk, rgbpp-sdk | spore-contract `contracts/cluster` | added |
| cluster_proxy / cluster_agent / mutant / lua | Spore extensions | — | `0x4349889bda064adab8f49f7dd8810d217917f7df28e9b2a1df0b74442399670a` / `0x923e997654b2697ee3f77052cb884e98f28799a4270fd412c3edb8f3987ca622` / `0x5ff1a403458b436ea4b2ceb72f1fa70a6507968493315b646f5302661cb68e57` / `0xed08faee8c29b7a7c29bd9d495b4b93cc207bd70ca93f7b356f39c677e7ab0fc` (data1) | spore-sdk (testnet only) | spore-contract | todo (low priority) |
| rgbpp_lock | RGB++ lock | `0xbc6c568a1a0d0a09f6844dc9d74ddb4343c32143ff25f727c59edf4fb72d6936` (type) | `0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248` (type, testnet3); signet `0xd07598deec7ce7b5665310386b4abd06a6d48843e953c5cc2112ad0d5a220364` | rgbpp-sdk | utxostack/rgbpp `contracts/rgbpp-lock` | added |
| btc_time_lock | BTC time lock | `0x70d64497a075bd651e98ac030455ea200637ee325a12ad08aff03f1a117e5a62` (type) | `0x00cdf8fab0f8ac638758ebf5ea5e4052b1d71e8a77b9f43139718621f6849326` (type, testnet3); signet `0x80a09eca26d77cea1f5a69471c59481be7404febf40ee90f886c36a948385b55` | rgbpp-sdk | utxostack/rgbpp `contracts/btc-time-lock` | added |
| unique_type | Unique cell type | `0x2c8c11c985da60b0a330c61a85507416d6382c130ba67f0c47ab071e00aec628` (data1) | `0x8e341bcfec6393dcd41e635733ff2dca00a6af546949f70c57a706c0f344df8b` (type) | ccc, rgbpp-sdk | utxostack/unique-cell | todo |
| ickb_logic | iCKB logic | `0x2a8100ab5990fa055ab1b50891702e1e895c7bd1df6322cd725c1a6115873bd3` (data1) | — | iCKB (binary hash, on-chain confirmed) | ickb/contracts `scripts/contracts/ickb_logic` | added |
| owned_owner | iCKB owned owner | `0xacc79e07d107831feef4c70c9e683dac5644d5993b9cb106dca6e74baa381bd0` (data1) | — | iCKB | ickb/contracts `scripts/contracts/owned_owner` | added |
| limit_order | iCKB limit order | `0x49dfb6afee5cc8ac4225aeea8cb8928b150caf3cd92fea33750683c74b13254a` (data1) | — | iCKB | ickb/contracts `scripts/contracts/limit_order` | added |
| joyid | JoyID lock | `0xd00c84f0ec8fd441c38bc3f87a371f547190f2fcff88e642bc5bf54b9e318323` (type) | `0xd23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac` (type) | ccc | — (not found public) | no-source (match-only plugin added) |
| nostr_lock | Nostr lock | `0x641a89ad2f77721b803cd50d01351c1f308444072d5fa20088567196c0574c68` (type) | `0x6ae5ee0cb887b2df5a9a18137315b9bdc55be8d52637b2de0624092d5f0c91d5` (type) | ccc | nervosnetwork/nostr-binding (formerly cryptape) | added |
| cota | CoTA | `0x1122a4fb54697cf2e6e3a96c9d80fd398a936559b90954c6e88eb7ba0cf652df` (type) | `0x89cd8003a0eaf8e65e0c31525b7d1d5c1becefd2ea75bb4cff87810ae37764d8` (type) | ccc | — (type script source not found public; nervina-labs/cota-smt is the SMT lib) | no-source (match-only plugin added) |
| pw_lock | PW lock | `0xbf43c3602455798c1a61a596e0d95278864c552fafe231c063b3fabf97a8febc` (type) | `0x58c5f491aba6d61678b7cf7edf4910b1f5e00ec0cde2f42e0abb4fd9aff25a63` (type) | ccc | lay2dev/pw-lock | todo |
| did_ckb | DID CKB | `0x4a06164dc34dccade5afe3e847a97b6db743e79f5477fa3295acf02849c5984a` (type) | `0x510150477b10d6ab551a509b71265f3164e9fd4137fcb5a4322f49f03092c7c5` (type) | ccc | web5fans/did-ckb | todo |
| always_success | Always success (proxy-locks) | `0x3b521cc4b552f109d092d8cc468a8048acb53c5952dbe769d2b2f9cf6e47f7f1` (data1) | same | ccc | ckb-devrel/ckb-proxy-locks | todo |
| input_type_proxy_lock | Input type proxy lock | `0x5123908965c711b0ffd8aec642f1ede329649bda1ebdca6bd24124d3796f768a` (data1) | same | ccc | ckb-proxy-locks | todo |
| output_type_proxy_lock | Output type proxy lock | `0x2df53b592db3ae3685b7787adcfef0332a611edb83ca3feca435809964c3aff2` (data1) | same | ccc | ckb-proxy-locks | todo |
| lock_proxy_lock | Lock proxy lock | `0x5d41e32e224c15f152b7e6529100ebeac83b162f5f692a5365774dad2c1a1d02` (data1) | same | ccc | ckb-proxy-locks | todo |
| single_use_lock | Single use lock | `0x8290467a512e5b9a6b816469b0edabba1f4ac474e28ffdd604c2a7c76446bbaf` (data1) | same | ccc | ckb-proxy-locks | todo |
| type_burn_lock | Type burn lock | `0xff78bae0abf17d7a404c0be0f9ad9c9185b3f88dcc60403453d5ba8e1f22f53a` (data1) | same | ccc | ckb-proxy-locks | todo |
| easy_to_discover_type | Easy-to-discover type | `0xaba4430cc7110d699007095430a1faa72973edf2322ddbfd4d1d219cacf237af` (data1) | same | ccc | ckb-proxy-locks | todo |
| time_lock | Time lock (proxy-locks) | `0x6fac4b2e89360a1e692efcddcb3a28656d8446549fb83da6d896db8b714f4451` (data1) | same | ccc | ckb-proxy-locks | todo |
| utxo_airdrop_badge / token_metadata | RGB++ airdrop badge / token metadata types | `0xf5da9003e31fa9301a3915fe304de9bdb80524b5f0d8fc325fb699317998ee7a` / `0x0c7dc8caec145b51b142e13f47fe4262c80628213d1b6c3d9c1aa6a62088804e` (type) | same | rgbpp-sdk | not located | no-source |
