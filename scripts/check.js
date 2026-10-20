// tag balance + bilingual coverage (no jsdom)
const fs=require('fs');const VOID=new Set(['meta','br','input','img','hr','link']);let bad=0;
for(const f of fs.readdirSync('out')){const h=fs.readFileSync('out/'+f,'utf8');
 const body=h.replace(/<button id="lang"[\s\S]*?<\/button>/,'').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<style[\s\S]*?<\/style>/g,'').replace(/<title>[\s\S]*?<\/title>/,'').replace(/<!DOCTYPE[^>]*>/,'');
 const st=[];let mis=0,zhOut=0,enOnly=0,zhCnt=0,enCnt=0;const re=/<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;let m;
 while(m=re.exec(body)){
  if(m[2]){const t=m[2].toLowerCase();if(VOID.has(t))continue;
   if(m[1]){const x=st.pop();if(!x||x.t!==t)mis++}else{const l=(m[3].match(/data-l="(\w+)"/)||[])[1];st.push({t,l});if(l==='zh')zhCnt++;if(l==='en')enCnt++}}
  else{const txt=m[4];const langs=st.map(s=>s.l).filter(Boolean);
   if(/[\u4e00-\u9fff]/.test(txt)&&!langs.includes('zh')){zhOut++;console.log(f,'CJK outside zh:',txt.trim().slice(0,60))}
   if(langs.includes('en')&&/[\u4e00-\u9fff]/.test(txt)){enOnly++;console.log(f,'CJK in en:',txt.trim().slice(0,60))}}}
 if(st.length)mis+=st.length;
 const ok=!mis&&!zhOut&&!enOnly&&zhCnt===enCnt;if(!ok)bad++;
 console.log(f.padEnd(14),'tags',mis?'BAD':'ok','zh/en spans',zhCnt,enCnt,ok?'OK':'FAIL');}
process.exit(bad?1:0);
