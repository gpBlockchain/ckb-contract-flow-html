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
// cells / witnesses as rows, same slots and hints as the contract pages
const H={since:['最早何时能花','earliest spend time'],capacity:['装了多少 CKB','how much CKB'],lock:['谁能花','who can spend'],type:['遵守的规则','rules it follows'],data:['存的数据','stored data']};
const WH={lock:['解锁证明（如签名）','unlock proof (e.g. signature)'],input_type:['给输入的 type 用',"for the input's type"],output_type:['给输出的 type 用',"for the output's type"]};
const R=(k,h,v,cls)=>`<div class="sr${cls?' '+cls:''}"><div class="sk"><code>${k}</code>${h?`<small>${B(h[0],h[1])}</small>`:''}</div><div class="sv">${v}</div></div>`;
const dim='<span class="dim">—</span>';
const bytes=d=>d&&d!=='0x'?`${esc(short(d))} <small class="dim">${(d.length-2)/2}B</small>`:dim;
const scriptRows=s=>s?`<div class="sub">${R('codeHash',null,nm(s)+esc(short(s.code_hash)))}${R('hashType',null,esc(s.hash_type))}${R('args',null,bytes(s.args))}</div>`:dim;
const sinceS=x=>{const s=C.parseSince(x.input.since);return s.none?'':`<span class="hl">${esc(x.input.since)}</span> <small>(${s.epoch?'epoch '+C.fmtEpoch(s.epoch):s.metric} ${s.relative?'rel':'abs'})</small>`};
const cellCard=(label,o,d,since)=>`<div class="cell"><div class="cl">${label}</div><div class="srs">${since?R('since',H.since,since,'hit'):''}${R('capacity',H.capacity,ckb(o.capacity))}${R('lock',H.lock,scriptRows(o.lock))}${R('type',H.type,o.type?scriptRows(o.type):dim,o.type?'':'miss')}${R('data',H.data,bytes(d),d&&d!=='0x'?'':'miss')}</div></div>`;
const wv=v=>v==null?dim:bytes(v);
const witCard=(i,w,use)=>`<div class="cell"><div class="cl">witness[${i}] ${use}</div>${w&&w.args?`<div class="stn">WitnessArgs</div><div class="srs">${['lock','input_type','output_type'].map(k=>R(k,WH[k],wv(w.args[k]),w.args[k]==null?'miss':'')).join('')}</div>`:`<div class="code">${w?(w.empty?B('空','empty'):B('不是 WitnessArgs：','not WitnessArgs: ')+esc(w.error||'')+` <small class="dim">${(w.raw.length-2)/2}B</small>`):B('缺失','missing')}</div>`}</div>`;
const lane=(cls,h,body,b)=>`<div class="lane ${cls}"><div class="lh">${h}</div><div class="${b||'lb'}">${body}</div></div>`;
const errB=c=>c?`<span class="e">${c==='consensus'?B('共识规则','consensus rule'):B('错误码 ','error ')+esc(c)}</span>`:'';
const chk=list=>`<ul class="chk">${list.map(c=>`<li class="${c.ok===null?'unk':c.ok?'ok':'bad'}"><span class="cki">${c.ok===null?'○':c.ok?'✓':'✗'}</span><span>${B(esc(c.zh),esc(c.en))}</span>${errB(c.code)}</li>`).join('')}</ul>`;
const legend=`<div class="chkl"><span>✓ ${B('通过','pass')}</span><span>✗ ${B('没通过','fail')}</span><span>○ ${B('未检查（如签名，上链时由节点验证）','not checked (e.g. signatures, verified by nodes on chain)')}</span></div>`;
const STATUS={committed:['已上链','committed'],pending:['等待打包','pending'],proposed:['已提议','proposed'],rejected:['已拒绝','rejected'],unknown:['未知','unknown']};
const fact=(zh,en,v)=>`<div class="fact"><dt>${B(zh,en)}</dt><dd>${v}</dd></div>`;
const th=(k,h)=>`<th>${k}${h?`<small>${B(h[0],h[1])}</small>`:''}</th>`;
// which witness each script group reads: a lock group at its first input; a type group at its first input (input_type) and first output (output_type)
const reads=(a,w)=>a.groups.flatMap((g,k)=>{const ln=f=>`${f} · <a href="#g${k}">${pname(g.script)}</a>`;
  return g.kind==='lock'?(g.witnessIndex===w?[ln('lock')]:[]):[g.inputs[0]===w?ln('input_type'):'',g.outputs[0]===w?ln('output_type'):''].filter(Boolean)});
// the whole transaction in stored order: references, inputs → outputs, witnesses
function overview(bundle,a){
  const {tx,inputs}=bundle,gid=new Map(a.groups.map((g,k)=>[g.hash,k])),DEPS=window.CKB_DEPS||{};
  const sname=s=>{if(!s)return dim;const k=gid.get(C.scriptHash(s));return k!=null?`<a href="#g${k}">${pname(s)}</a>`:pname(s)};
  const anySince=inputs.some(x=>!C.parseSince(x.input.since).none),head=`<tr>${th('#')}${th('capacity',H.capacity)}${th('lock',H.lock)}${th('type',H.type)}${th('data',H.data)}`;
  // td(key, html): the key labels the cell when narrow screens stack each row into a small card; [zh, en] for a bilingual key
  const td=(k,v,c)=>`<td${typeof k==='string'?` data-k="${k}"`:k?` data-zh-k="${k[0]}" data-en-k="${k[1]}"`:''}${c?` class="${c}"`:''}><span>${v}</span></td>`,ix=i=>`<td class="ix">${i}</td>`;
  const row=(i,o,d,x)=>`<tr>${ix(i)}${td('capacity',ckb(o.capacity),'nw')}${td('lock',sname(o.lock))}${td('type',sname(o.type))}${td('data',bytes(d))}${x?td('since',sinceS(x)||dim):''}</tr>`;
  const ins=inputs.map((x,i)=>x.output?row(i,x.output,x.data,anySince&&x):`<tr>${ix(i)}<td colspan="${anySince?5:4}">${B('cellbase（出块奖励，没有前序 Cell）','cellbase (block reward, no previous cell)')}</td></tr>`).join('');
  const outs=tx.outputs.map((o,j)=>row(j,o,tx.outputs_data[j])).join('');
  const deps=tx.cell_deps.map((d,i)=>{const n=parseInt(d.out_point.index,16),p=DEPS[d.out_point.tx_hash+':'+n];return `<tr>${ix(i)}${td('out_point',`${esc(short(d.out_point.tx_hash))}:${n}`,'nw')}${td('dep_type',esc(d.dep_type),'nw')}${td(['提供','provides'],p?p.map(L).join(' · '):dim)}</tr>`}).join('');
  const hdeps=tx.header_deps.map((h,i)=>`<tr>${ix(i)}${td('block',esc(short(h)))}</tr>`).join('');
  const wits=a.witnesses.map((w,i)=>`<tr>${ix(i)}${w.args?['lock','input_type','output_type'].map(k=>td(k,wv(w.args[k]))).join(''):`<td colspan="3">${w.empty?B('空','empty'):B('不是 WitnessArgs','not WitnessArgs')+` <small class="dim">${(w.raw.length-2)/2}B</small>`}</td>`}${td(['谁来读','read by'],reads(a,i).join('<br>')||dim)}</tr>`).join('');
  return `<section class="card txo"><div class="sh"><h2>${B('交易结构','Transaction structure')}</h2><span class="small">${B('按交易里实际存放的顺序；点脚本名跳到下面对应的分组','in the order stored in the transaction; click a script name to jump to its group below')}</span></div>
${lane('l-dep',`<b>${B('引用 · cell_deps / header_deps','References · cell_deps / header_deps')}</b><small>${B('交易要读取、但不会花掉','read by the transaction, not spent')}</small>`,`<div class="tw"><table class="ot"><tr>${th('#')}${th('cell_deps')}${th('dep_type')}${th(B('提供','provides'))}</tr>${deps}</table></div>${hdeps?`<div class="tw"><table class="ot"><tr>${th('#')}${th('header_deps')}</tr>${hdeps}</table></div>`:''}`,'lbt')}
${lane('l-in',`<b>${B(`交易前 · inputs（${inputs.length}）`,`Before · inputs (${inputs.length})`)}</b><small>${B('会被花掉的 Cell','cells spent')}</small>`,`<div class="tw"><table class="ot">${head}${anySince?th('since',H.since):''}</tr>${ins}</table></div>`,'lbt')}
<div class="varr" aria-hidden="true"><span>↓</span></div>
${lane('l-out',`<b>${B(`交易后 · outputs（${tx.outputs.length}）`,`After · outputs (${tx.outputs.length})`)}</b><small>${B('新生成的 Cell','cells created')}</small>`,`<div class="tw"><table class="ot">${head}</tr>${outs}</table></div>`,'lbt')}
${lane('l-wit',`<b>${B(`见证 · witnesses（${a.witnesses.length}）`,`Witnesses (${a.witnesses.length})`)}</b><small>${B('通常按序号与 inputs 对应；最后一列是读取它的脚本组','usually aligned with inputs by position; the last column shows which script group reads it')}</small>`,`<div class="tw"><table class="ot"><tr>${th('#')}${th('lock',WH.lock)}${th('input_type',WH.input_type)}${th('output_type',WH.output_type)}${th(B('谁来读','read by'))}</tr>${wits}</table></div>`,'lbt')}</section>`;
}
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
<div class="rules"><h3>${B('交易整体检查','Transaction-level checks')}</h3>${chk(a.checks)}${legend}</div></section>${overview(bundle,a)}`;
  a.groups.forEach((g,k)=>{
    const lock=g.kind==='lock';
    const ins=g.inputs.map(i=>{const x=inputs[i];return cellCard(`input[${i}]`,x.output,x.data,sinceS(x))}).join('');
    const outs=g.outputs.map(j=>cellCard(`output[${j}]`,tx.outputs[j],tx.outputs_data[j])).join('')||`<div class="small">${B('（没有对应的输出）','(no matching outputs)')}</div>`;
    // witnesses this group reads (see reads())
    const wi=lock?[g.witnessIndex]:[...new Set([g.inputs[0],g.outputs[0]].filter(x=>x!=null))];
    const wits=wi.map(i=>witCard(i,a.witnesses[i],lock?B('（解锁本组）','(unlocks this group)'):B(`（本组读 ${g.inputs[0]===i?'input_type':''}${g.inputs[0]===i&&g.outputs[0]===i?' / ':''}${g.outputs[0]===i?'output_type':''}）`,`(this group reads ${g.inputs[0]===i?'input_type':''}${g.inputs[0]===i&&g.outputs[0]===i?' / ':''}${g.outputs[0]===i?'output_type':''})`))).join('');
    const extra=hexRows(g.parsed.fields)+(g.parsed.layouts||[]).map(layoutHtml).join('');
    h+=`<section class="card grp" id="g${k}"><div class="sh"><span class="kind k-${g.kind}">${lock?B('Lock 脚本','Lock script'):B('Type 脚本','Type script')}</span><h2>${pname(g.script)}</h2><span class="tagp">${g.inputs.length} → ${g.outputs.length}</span></div>
<p class="gx">${lock?B(`这些 Cell 用的是同一把锁：要花掉它们，通常需要 witness[${g.witnessIndex}] 里的证明（例如签名）。`,`These cells share one lock: spending them usually needs the proof in witness[${g.witnessIndex}] (e.g. a signature).`):B('这些 Cell 用的是同一个 type 脚本：交易前后都要符合它的规则。','These cells share one type script: its rules must hold for the cells before and after.')}</p>
<div class="kv"><span class="kl">script hash</span>${g.hash}</div>${(g.plugin&&(window.CKB_META_HTML||{})[g.plugin.id])||''}
<div class="flow"><div class="col cin"><div class="colh"><b>${B('交易前 · 输入','Before · inputs')}</b></div>${ins||`<div class="small">${B('（没有输入）','(no inputs)')}</div>`}</div><div class="arrow" aria-hidden="true"><span>→</span></div><div class="col cout"><div class="colh"><b>${B('交易后 · 输出','After · outputs')}</b></div>${outs}</div></div>
${wits?lane('l-wit',`<b>${B('见证 · witnesses','Witnesses')}</b><small>${B('本组用到的见证','the witnesses this group uses')}</small>`,wits):''}${extra?`<div class="lays"><h3>${B('解析出的字段','Parsed fields')}</h3>${extra}</div>`:''}
<div class="rules"><h3>${B('检查','Checks')}</h3>${g.checks.length?chk(g.checks):`<div class="small">${B('未知脚本：没有可检查的规则','unknown script: no rules to check')}</div>`}</div></section>`;
  });
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
