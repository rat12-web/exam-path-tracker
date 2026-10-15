'use strict';
const ALLOWED='https://rat12-web.github.io';let sessionNonce='',client=null;
async function run(method,value={}){
 let url='/api/records',opts={credentials:'same-origin',cache:'no-store'};
 if(method==='save'){if(!Array.isArray(value.records)||value.records.length>150)throw Error('ข้อมูลบัญชีไม่ถูกต้อง');opts={...opts,method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(value)}}
 else if(method==='documents')url='/api/documents';
 else if(method==='upload'){if(typeof value.base64!=='string'||value.base64.length>9*1024*1024)throw Error('ไฟล์ใหญ่เกิน 6 MB');url='/api/documents';opts={...opts,method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)}}
 else if(['download','delete'].includes(method)){if(!/^[a-zA-Z0-9-]{1,120}$/.test(value.id||''))throw Error('รหัสเอกสารไม่ถูกต้อง');url='/api/documents/'+encodeURIComponent(value.id)+(method==='download'?'/file':'');if(method==='delete')opts.method='DELETE'}
 else if(method!=='load')throw Error('คำสั่งไม่รองรับ');
 const res=await fetch(url,opts);if(!res.ok){let message;try{message=(await res.json()).error}catch{}const error=Error(message||'เชื่อมข้อมูลไม่ได้ ('+res.status+')');error.status=res.status;throw error}
 if(method==='download')return {bytes:await res.arrayBuffer(),type:res.headers.get('content-type')};return res.status===204?{}:res.json();
}
window.addEventListener('message',async e=>{
 if(e.origin!==ALLOWED||e.data?.channel!=='exam-sync-v2'||typeof e.data.nonce!=='string')return;
 if(e.source!==window.opener&&e.source!==window.parent)return;
 if(e.data.type==='PING'){
  if(client&&client!==e.source)return;client=e.source;sessionNonce=e.data.nonce;
  client.postMessage({channel:'exam-sync-v2',type:'READY',nonce:sessionNonce},ALLOWED);document.getElementById('status').textContent='เชื่อมกับ GitHub Pages แล้ว ข้อมูลใช้ฐานเดียวกับ ChatGPT Site';return;
 }
 if(e.source!==client||e.data.nonce!==sessionNonce||e.data.type!=='CALL'||typeof e.data.id!=='string')return;
 try{const value=await run(e.data.method,e.data.value);client.postMessage({channel:'exam-sync-v2',type:'RESULT',id:e.data.id,nonce:sessionNonce,value},ALLOWED)}catch(error){document.getElementById('status').textContent=error.message;client.postMessage({channel:'exam-sync-v2',type:'RESULT',id:e.data.id,nonce:sessionNonce,error:error.message,status:error.status},ALLOWED)}
});
