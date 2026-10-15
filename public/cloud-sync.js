/* Cloud access remains in the authenticated ChatGPT Site; no credential is placed in GitHub. */
(function(root){
'use strict';
const SITE='https://exam-path-personal-2026-r.rat-creative1.chatgpt.site';
const PAGES='https://rat12-web.github.io';
const direct=location.origin===SITE;
let handle=null,frame=null,nonce='',connected=direct,connecting=null;const waiting=new Map();
function changed(){root.dispatchEvent(new CustomEvent('exam-cloud-state'))}
async function directCall(method,value={}){
 let url=SITE+'/api/records',options={credentials:'same-origin',cache:'no-store'};
 if(method==='save'){options.method='PUT';options.headers={'content-type':'application/json'};options.body=JSON.stringify(value)}
 else if(method==='documents')url=SITE+'/api/documents';
 else if(method==='upload'){url=SITE+'/api/documents';options.method='POST';options.headers={'content-type':'application/json'};options.body=JSON.stringify(value)}
 else if(method==='download'){url=SITE+'/api/documents/'+encodeURIComponent(value.id)+'/file'}
 else if(method==='delete'){url=SITE+'/api/documents/'+encodeURIComponent(value.id);options.method='DELETE'}
 else if(method!=='load')throw Error('คำสั่งซิงก์ไม่รองรับ');
 const res=await fetch(url,options);if(!res.ok){let message;try{message=(await res.json()).error}catch{}const err=Error(message||'เชื่อมข้อมูลออนไลน์ไม่สำเร็จ ('+res.status+')');err.status=res.status;throw err}
 if(method==='download')return {bytes:await res.arrayBuffer(),type:res.headers.get('content-type')};
 return res.status===204?{}:res.json();
}
root.addEventListener('message',e=>{
 if(e.origin!==SITE||e.source!==handle||e.data?.channel!=='exam-sync-v2'||e.data.nonce!==nonce)return;
 if(e.data.type==='READY'){connected=true;changed();if(connecting)connecting.resolve();return}
 if(e.data.type==='RESULT'){const req=waiting.get(e.data.id);if(!req)return;clearTimeout(req.timer);waiting.delete(e.data.id);if(e.data.error){const err=Error(e.data.error);err.status=e.data.status;req.reject(err)}else req.resolve(e.data.value)}
});
function connect(interactive=false){
 if(direct){connected=true;return Promise.resolve()}
 if(connected&&handle&&!handle.closed)return Promise.resolve();
 if(connecting){if(!interactive)return connecting.promise;connecting.reject(Error('เปลี่ยนเป็นหน้าต่างเชื่อมข้อมูล'));connecting=null}
 if(frame){frame.remove();frame=null}
 nonce=crypto.randomUUID();connected=false;
 if(interactive){handle=root.open(SITE+'/tracker/sync-bridge.html','exam-path-private-sync','width=700,height=650');if(!handle)return Promise.reject(Error('กรุณาอนุญาตหน้าต่างเชื่อมข้อมูลสำหรับเว็บนี้'))}
 else{frame=document.createElement('iframe');frame.hidden=true;frame.src=SITE+'/tracker/sync-bridge.html';frame.title='เชื่อมข้อมูลส่วนตัว';document.body.append(frame);handle=frame.contentWindow}
 let timer,ping,resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});
 function stop(){clearTimeout(timer);clearInterval(ping);connecting=null}
 connecting={promise,resolve:()=>{stop();resolve()},reject:e=>{stop();reject(e)}};
 ping=setInterval(()=>{if(handle&&!handle.closed)handle.postMessage({channel:'exam-sync-v2',type:'PING',nonce},SITE)},500);
 timer=setTimeout(()=>{const current=connecting;if(current){connected=false;current.reject(Error(interactive?'ยังไม่ได้เชื่อม กรุณาเข้าสู่ระบบในหน้าต่าง ChatGPT Site แล้วกดเชื่อมอีกครั้ง':'กดเชื่อมข้อมูลเดิมเพื่อเปิดบัญชี ChatGPT Site'));changed()}},interactive?180000:8000);
 return promise;
}
async function call(method,value){if(direct)return directCall(method,value);if(!connected||!handle||handle.closed){connected=false;changed();throw Error('หน้าต่างเชื่อมข้อมูลปิดอยู่ กดเชื่อมข้อมูลเดิมอีกครั้ง')}
 return new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{waiting.delete(id);reject(Error('รอข้อมูลออนไลน์นานเกินไป ยังเก็บข้อมูลในเครื่องไว้'))},30000);waiting.set(id,{resolve,reject,timer});handle.postMessage({channel:'exam-sync-v2',type:'CALL',nonce,id,method,value},SITE)})}
root.ExamCloud={connect,call,direct,get connected(){return connected&&(direct||!!handle&&!handle.closed)},site:SITE,pages:PAGES};
})(window);
