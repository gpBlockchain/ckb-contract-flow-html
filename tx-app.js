(function(){
const $=s=>document.querySelector(s);const C=window.CKB;
const B=(zh,en)=>`<span data-l="zh">${zh}</span><span data-l="en">${en}</span>`;
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const short=h=>h&&h.length>22?h.slice(0,12)+'…'+h.slice(-8):h;
const ckb=v=>{v=BigInt(v);const i=v/100000000n,f=(v%100000000n).toString().padStart(8,'0').replace(/0+$/,'');return i.toLocaleString('en-US')+(f?'.'+f:'')+' CKB'};
const NAME={secp256k1_blake160:'SECP256K1/blake160',multisig_legacy:B('Multisig（旧版）','Multisig (legacy)'),multisig_v2:'Multisig V2',nervos_dao:'NervosDAO',sudt:'sUDT',xudt:'xUDT'};
const nm=s=>{const k=C.identify(s);return k?`<span class="tagk">${NAME[k.id]}</span>`:`<span class="tagk tagu">${B('未知脚本','unknown script')}</span>`};
const scr=s=>s?`{ ${nm(s)}codeHash: ${short(s.code_hash)}, hashType: ${s.hash_type}, args: ${esc(short(s.args))} }`:'null';
const cellBox=(label,o,d,extra)=>`<div class="cell"><span class="n">${label}</span>Cell{\n  capacity: ${ckb(o.capacity)},\n  lock: ${scr(o.lock)},\n  type: ${scr(o.type)},\n  data: ${esc(short(d))}${extra||''}\n}</div>`;
const chk=list=>`<div class="limits"><h3>${B('检查','Checks')}</h3><ul class="chk">${list.map(c=>`<li class="${c.ok===null?'unk':c.ok?'ok':'bad'}">${c.ok===null?'○':c.ok?'✓':'✗'} ${B(esc(c.zh),esc(c.en))}${c.code?` <span class="e">(${esc(c.code)})</span>`:''}</li>`).join('')}</ul></div>`;
function render(bundle,a){
  const {tx,inputs}=bundle;let h=`<div class="card"><h2><span>TX</span>${esc(short(bundle.txHash))}</h2><div class="kv">
<div><span>hash</span> ${esc(bundle.txHash)}</div><div><span>status</span> ${esc(bundle.status.status)} ${bundle.status.block_number?'· block '+BigInt(bundle.status.block_number):''}</div>
<div><span>inputs/outputs</span> ${tx.inputs.length} / ${tx.outputs.length} · <span>header_deps</span> ${tx.header_deps.length} · <span>fee</span> ${a.fee} shannon</div></div>${chk(a.checks)}</div>`;
  for(const g of a.groups){
    const title=g.kind==='lock'?B('Lock 脚本组','Lock script group'):B('Type 脚本组','Type script group');
    const ins=g.inputs.map(i=>{const x=inputs[i];const s=C.parseSince(x.input.since);return cellBox(`input[${i}]`,x.output,x.data,s.none?'':`,\n  since: <span class="hl">${esc(x.input.since)}${s.epoch?' (epoch '+C.fmtEpoch(s.epoch)+(s.relative?' rel':' abs')+')':' ('+s.metric+(s.relative?' rel':' abs')+')'}</span>`)}).join('');
    const outs=g.outputs.map(j=>cellBox(`output[${j}]`,tx.outputs[j],tx.outputs_data[j])).join('')||`<div class="small">${B('（无对应输出）','(no matching outputs)')}</div>`;
    let extra='';
    if(g.kind==='lock'){const w=a.witnesses[g.witnessIndex];
      extra+=`<div class="cell"><span class="n">witness[${g.witnessIndex}] ${B('（解锁本组）','(unlocks this group)')}</span>${w&&w.args?`WitnessArgs{\n  lock: ${esc(short(w.args.lock||'None'))}${w.args.lock?' ('+(w.args.lock.length-2)/2+'B)':''},\n  input_type: ${esc(short(w.args.input_type||'None'))},\n  output_type: ${esc(short(w.args.output_type||'None'))}\n}`:esc(w?(w.error?'parse error: '+w.error:'empty'):'missing')}</div>`;
      const m=g.parsed.multisig;
      if(m&&!m.error)extra+=`<div class="layout"><span class="n">multisig_script</span><div class="strip"><div class="seg c0"><b>S=${m.S}</b><small>1B</small></div><div class="seg c1"><b>R=${m.R}</b><small>1B</small></div><div class="seg c2"><b>M=${m.M}</b><small>1B</small></div><div class="seg c3"><b>N=${m.N}</b><small>1B</small></div><div class="seg c4" style="flex:4"><b>pubkey_hash × ${m.pubkeyHashes.length}</b><small>20B</small></div><div class="seg c5" style="flex:4"><b>signature × ${m.signatures.length}</b><small>65B</small></div></div>
<div class="hex">${m.pubkeyHashes.map((p,i)=>`<div><span class="hk">pubkey_hash[${i}]</span>${p}${i<m.R?' <span class="hl">'+B('必须签名','must sign')+'</span>':''}</div>`).join('')}${m.signatures.map((s,i)=>`<div><span class="hk">signature[${i}]</span>${short(s)}</div>`).join('')}<div><span class="hk">blake160</span>${m.scriptBlake160}</div>${g.parsed.argsSince?`<div><span class="hk">args since</span>${esc(g.parsed.argsSince.raw)}</div>`:''}</div></div>`;
    }
    if(g.parsed.dao)extra+=g.parsed.dao.map(e=>`<div class="layout"><span class="n">${e.phase===0?B(`output[${e.output}]：新存款`,`output[${e.output}]: new deposit`):e.phase===1?B(`input[${e.input}]：提取第一阶段（存款区块 ${e.depositBlock}）`,`input[${e.input}]: withdraw phase 1 (deposit block ${e.depositBlock})`):B(`input[${e.input}]：提取第二阶段`,`input[${e.input}]: withdraw phase 2`)}</span>${e.phase===2&&e.D?`<div class="hex"><div><span class="hk">D</span>block ${e.D.number} · epoch ${e.D.epoch} · AR ${e.D.ar}</div><div><span class="hk">W</span>block ${e.W.number} · epoch ${e.W.epoch} · AR ${e.W.ar}</div><div><span class="hk">lock</span>${e.lockEpochs} epochs · min since ${e.minSince}</div><div><span class="hk">occupied</span>${ckb(e.occupied)}</div><div><span class="hk">max withdraw</span><span class="hl">${ckb(e.maxWithdraw)}</span> (${B('补贴','compensation')} ${ckb(e.maxWithdraw-e.capacity)})</div></div>`:''}</div>`).join('');
    if(g.parsed.amounts)extra+=`<div class="hex">${g.parsed.amounts.in.map(([i,v])=>`<div><span class="hk">in[${i}] amount</span>${v}</div>`).join('')}${g.parsed.amounts.out.map(([j,v])=>`<div><span class="hk">out[${j}] amount</span>${v}</div>`).join('')}<div><span class="hk">Σin / Σout</span>${g.parsed.sum.in} / ${g.parsed.sum.out}${g.parsed.ownerMode?' · owner mode':''}</div></div>`;
    h+=`<div class="card"><h2><span>${g.inputs.length} → ${g.outputs.length}</span>${title} ${nm(g.script)}</h2><div class="kv"><span>script hash</span> ${g.hash}</div>
<div class="flow"><div class="col">${ins||`<div class="small">${B('（无输入）','(no inputs)')}</div>`}</div><div class="arrow">➜</div><div class="col">${outs}</div></div>${extra}${g.checks.length?chk(g.checks):`<div class="small">${B('未知脚本：无可检查的约束','unknown script: no constraints checked')}</div>`}</div>`;
  }
  return h;
}
async function go(){
  const out=$('#result');const hash=$('#hash').value.trim();const sel=$('#net').value;const url=sel==='custom'?$('#custom').value.trim():sel;
  if(!/^0x[0-9a-fA-F]{64}$/.test(hash)){out.innerHTML=`<div class="err">${B('请输入 32 字节交易 hash（0x + 64 hex）','Enter a 32-byte tx hash (0x + 64 hex)')}</div>`;return}
  out.innerHTML=`<div class="small">${B('加载中…','Loading…')}</div>`;
  history.replaceState(null,'','#'+new URLSearchParams({tx:hash,rpc:url}));
  try{const b=await C.fetchTxBundle(url,hash);out.innerHTML=render(b,C.analyze(b))}
  catch(e){out.innerHTML=`<div class="err">${e.code==='CORS'?B(`无法访问 RPC：${esc(url)}\n可能是网络错误或该节点未开启 CORS（浏览器拦截跨域请求）。\n可改用 https://mainnet.ckb.dev/rpc / https://testnet.ckb.dev/rpc，或给自建节点加反向代理并设置 Access-Control-Allow-Origin。`,`Cannot reach RPC: ${esc(url)}\nNetwork error or the node does not allow CORS (the browser blocked the cross-origin request).\nTry https://mainnet.ckb.dev/rpc / https://testnet.ckb.dev/rpc, or put your node behind a proxy that sets Access-Control-Allow-Origin.`)+'\n\n'+esc(e.message):esc(e.message)}</div>`}
}
window.__txRender=render;
window.addEventListener('DOMContentLoaded',()=>{
  $('#net').onchange=()=>{$('#custom').style.display=$('#net').value==='custom'?'':'none'};
  $('#go').onclick=go;$('#hash').onkeydown=e=>{if(e.key==='Enter')go()};
  document.querySelectorAll('.ex').forEach(a=>a.onclick=ev=>{ev.preventDefault();$('#hash').value=a.dataset.h;$('#net').value='https://mainnet.ckb.dev/rpc';$('#net').onchange();go()});
  const p=new URLSearchParams(location.hash.slice(1));if(p.get('tx')){$('#hash').value=p.get('tx');const r=p.get('rpc');if(r){if([...$('#net').options].some(o=>o.value===r))$('#net').value=r;else{$('#net').value='custom';$('#custom').value=r}$('#net').onchange()}go()}
});
})();
