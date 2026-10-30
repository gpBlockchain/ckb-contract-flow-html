(function(){
const $=s=>document.querySelector(s);const C=window.CKB;
const B=(zh,en)=>`<span data-l="zh">${zh}</span><span data-l="en">${en}</span>`;
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const short=h=>h&&h.length>22?h.slice(0,12)+'…'+h.slice(-8):h;
const ckb=v=>{v=BigInt(v);const i=v/100000000n,f=(v%100000000n).toString().padStart(8,'0').replace(/0+$/,'');return i.toLocaleString('en-US')+(f?'.'+f:'')+' CKB'};
const L=x=>x==null?'':typeof x==='object'?B(esc(x.zh!=null?x.zh:x.en),esc(x.en!=null?x.en:x.zh)):esc(x);
const pname=s=>{const p=C.identify(s);return p?L(p.name||p.id):B('未知脚本','unknown script')};
const nm=s=>{const p=C.identify(s);return p?`<span class="tagk">${L(p.name||p.id)}</span>`:`<span class="tagk tagu">${B('未知脚本','unknown script')}</span>`};
const hexRows=rows=>rows&&rows.length?`<div class="hex">${rows.map(([k,v])=>`<div><span class="hk">${L(k)}</span><span>${L(v)}</span></div>`).join('')}</div>`:'';
const layoutHtml=l=>`<div class="layout"><div class="cl">${L(l.label)}</div>${l.layout?`<div class="strip">${l.layout.map((f,i)=>`<div class="seg c${f.color!=null?f.color:i%6}" style="flex:${f.flex||1}"><b>${L(f.name)}</b><small>${L(f.size)}</small></div>`).join('')}</div>`:''}${hexRows(l.hex)}</div>`;
const scr=s=>s?`{ ${nm(s)}codeHash: ${short(s.code_hash)}, hashType: ${s.hash_type}, args: ${esc(short(s.args))} }`:'null';
const K=k=>`<span class="ck">${k}</span>: `;
const cellBox=(label,o,d,extra)=>`<div class="cell"><div class="cl">${label}</div><div class="code">${K('capacity')}${ckb(o.capacity)}\n${K('lock')}${scr(o.lock)}\n${K('type')}${scr(o.type)}\n${K('data')}${esc(short(d))}${extra||''}</div></div>`;
const errB=c=>c?`<span class="e">${c==='consensus'?B('共识规则','consensus rule'):B('错误码 ','error ')+esc(c)}</span>`:'';
const chk=list=>`<ul class="chk">${list.map(c=>`<li class="${c.ok===null?'unk':c.ok?'ok':'bad'}"><span class="cki">${c.ok===null?'○':c.ok?'✓':'✗'}</span><span>${B(esc(c.zh),esc(c.en))}</span>${errB(c.code)}</li>`).join('')}</ul>`;
const legend=`<div class="chkl"><span>✓ ${B('通过','pass')}</span><span>✗ ${B('没通过','fail')}</span><span>○ ${B('未检查（如签名，上链时由节点验证）','not checked (e.g. signatures, verified by nodes on chain)')}</span></div>`;
const STATUS={committed:['已上链','committed'],pending:['等待打包','pending'],proposed:['已提议','proposed'],rejected:['已拒绝','rejected'],unknown:['未知','unknown']};
const fact=(zh,en,v)=>`<div class="fact"><dt>${B(zh,en)}</dt><dd>${v}</dd></div>`;
function render(bundle,a){
  const {tx,inputs}=bundle,all=[...a.checks,...a.groups.flatMap(g=>g.checks)],bad=all.filter(c=>c.ok===false).length,unk=all.filter(c=>c.ok===null).length,ug=a.groups.filter(g=>!g.plugin).length;
  const s=bundle.status.status,st=STATUS[s]||[esc(s),esc(s)];
  // one-line verdict first: did every rule we can check pass?
  const sub=[unk?B(`另有 ${unk} 项未检查（如签名）`,`${unk} not checked (e.g. signatures)`):'',ug?B(`${ug} 组是未知脚本，没有检查`,`${ug} unknown script group${ug>1?'s':''}, not checked`):''].filter(Boolean).join(' · ');
  const verdict=bad?`<div class="verdict bad"><span>✗ ${B(`有 ${bad} 项检查没通过`,`${bad} check${bad>1?'s':''} failed`)}</span><small>${B('见下方标红的行','see the rows marked in red below')}</small></div>`
    :`<div class="verdict ok"><span>✓ ${B(`能检查的 ${all.length-unk} 项规则全部通过`,`All ${all.length-unk} checkable rules pass`)}</span>${sub?`<small>${sub}</small>`:''}</div>`;
  let h=`<section class="card txsum">${verdict}<div class="sh"><h2>${B('交易','Transaction')} <span class="mono">${esc(short(bundle.txHash))}</span></h2></div>
<dl class="facts">${fact('状态','Status',B(st[0],st[1])+(bundle.status.block_number?` · #${BigInt(bundle.status.block_number).toLocaleString('en-US')}`:''))}${fact('输入 → 输出','Inputs → outputs',`${tx.inputs.length} → ${tx.outputs.length}`)}${fact('手续费','Fee',ckb(a.fee))}${fact('脚本组','Script groups',a.groups.length)}</dl>
<div class="kv" style="margin-top:12px"><span class="kl">hash</span>${esc(bundle.txHash)}</div><div class="kv"><span class="kl">header_deps</span>${tx.header_deps.length} · <span class="kl">cell_deps</span>${(tx.cell_deps||[]).length} · <span class="kl">fee</span>${a.fee} shannon</div>
<div class="rules"><h3>${B('交易整体检查','Transaction-level checks')}</h3>${chk(a.checks)}${legend}</div></section>`;
  for(const g of a.groups){
    const lock=g.kind==='lock';
    const ins=g.inputs.map(i=>{const x=inputs[i];const s=C.parseSince(x.input.since);return cellBox(`input[${i}]`,x.output,x.data,s.none?'':`\n${K('since')}<span class="hl">${esc(x.input.since)}${s.epoch?' (epoch '+C.fmtEpoch(s.epoch)+(s.relative?' rel':' abs')+')':' ('+s.metric+(s.relative?' rel':' abs')+')'}</span>`)}).join('');
    const outs=g.outputs.map(j=>cellBox(`output[${j}]`,tx.outputs[j],tx.outputs_data[j])).join('')||`<div class="small">${B('（没有对应的输出）','(no matching outputs)')}</div>`;
    let extra='';
    if(lock){const w=a.witnesses[g.witnessIndex];
      extra+=`<div class="sec"><div class="cell"><div class="cl">witness[${g.witnessIndex}] ${B('（解锁本组）','(unlocks this group)')}</div><div class="code">${w&&w.args?`${K('lock')}${esc(short(w.args.lock||'None'))}${w.args.lock?' ('+(w.args.lock.length-2)/2+'B)':''}\n${K('input_type')}${esc(short(w.args.input_type||'None'))}\n${K('output_type')}${esc(short(w.args.output_type||'None'))}`:esc(w?(w.error?'parse error: '+w.error:'empty'):'missing')}</div></div></div>`;
    }
    extra+=hexRows(g.parsed.fields)+(g.parsed.layouts||[]).map(layoutHtml).join('');
    h+=`<section class="card grp"><div class="sh"><span class="kind k-${g.kind}">${lock?B('Lock 脚本','Lock script'):B('Type 脚本','Type script')}</span><h2>${pname(g.script)}</h2><span class="tagp">${g.inputs.length} → ${g.outputs.length}</span></div>
<p class="gx">${lock?B(`这些 Cell 用的是同一把锁：要花掉它们，通常需要 witness[${g.witnessIndex}] 里的证明（例如签名）。`,`These cells share one lock: spending them usually needs the proof in witness[${g.witnessIndex}] (e.g. a signature).`):B('这些 Cell 用的是同一个 type 脚本：交易前后都要符合它的规则。','These cells share one type script: its rules must hold for the cells before and after.')}</p>
<div class="kv"><span class="kl">script hash</span>${g.hash}</div>${(g.plugin&&(window.CKB_META_HTML||{})[g.plugin.id])||''}
<div class="flow"><div class="col cin"><div class="colh"><b>${B('交易前 · 输入','Before · inputs')}</b></div>${ins||`<div class="small">${B('（没有输入）','(no inputs)')}</div>`}</div><div class="arrow" aria-hidden="true"><span>→</span></div><div class="col cout"><div class="colh"><b>${B('交易后 · 输出','After · outputs')}</b></div>${outs}</div></div>${extra}
<div class="rules"><h3>${B('检查','Checks')}</h3>${g.checks.length?chk(g.checks):`<div class="small">${B('未知脚本：没有可检查的规则','unknown script: no rules to check')}</div>`}</div></section>`;
  }
  return h;
}
async function go(){
  const out=$('#result');const hash=$('#hash').value.trim();const sel=$('#net').value;const url=sel==='custom'?$('#custom').value.trim():sel;
  if(!/^0x[0-9a-fA-F]{64}$/.test(hash)){out.innerHTML=`<div class="err">${B('请输入 32 字节交易 hash（0x + 64 位十六进制）','Enter a 32-byte tx hash (0x + 64 hex)')}</div>`;return}
  out.innerHTML=`<div class="card small">${B('加载中…','Loading…')}</div>`;
  history.replaceState(null,'','#'+new URLSearchParams({tx:hash,rpc:url}));
  try{const b=await C.fetchTxBundle(url,hash);out.innerHTML=render(b,C.analyze(b));if(out.getBoundingClientRect().top>innerHeight*.6)out.scrollIntoView({behavior:'smooth'})}
  catch(e){out.innerHTML=`<div class="err">${e.code==='CORS'?B(`无法访问 RPC：${esc(url)}\n可能是网络错误或该节点未开启 CORS（浏览器拦截跨域请求）。\n可改用 https://mainnet.ckb.dev/rpc / https://testnet.ckb.dev/rpc，或给自建节点加反向代理并设置 Access-Control-Allow-Origin。`,`Cannot reach RPC: ${esc(url)}\nNetwork error or the node does not allow CORS (the browser blocked the cross-origin request).\nTry https://mainnet.ckb.dev/rpc / https://testnet.ckb.dev/rpc, or put your node behind a proxy that sets Access-Control-Allow-Origin.`)+'\n\n'+esc(e.message):esc(e.message)}</div>`}
}
window.__txRender=render;
window.addEventListener('DOMContentLoaded',()=>{
  $('#net').onchange=()=>{$('#customf').hidden=$('#net').value!=='custom'};
  $('#go').onclick=go;$('#hash').onkeydown=e=>{if(e.key==='Enter')go()};
  document.querySelectorAll('.ex').forEach(a=>a.onclick=ev=>{ev.preventDefault();$('#hash').value=a.dataset.h;$('#net').value=a.dataset.net==='testnet'?'https://testnet.ckb.dev/rpc':'https://mainnet.ckb.dev/rpc';$('#net').onchange();go()});
  const p=new URLSearchParams(location.hash.slice(1));if(p.get('tx')){$('#hash').value=p.get('tx');const r=p.get('rpc');if(r){if([...$('#net').options].some(o=>o.value===r))$('#net').value=r;else{$('#net').value='custom';$('#custom').value=r}$('#net').onchange()}go()}
});
})();
