/* UI controller: retain local edits, merge cloud revisions, and keep document ownership in the Site. */
let cloudWorking=false,cloudLast='',cloudError='',cloudSnapshot=new Map(),cloudStarted=false,cloudConnecting=false;
function markPendingChanges(){const pending=new Set(state.pendingIds||[]);for(const r of state.records)if(cloudSnapshot.get(r.id)!==JSON.stringify(r))pending.add(r.id);state.pendingIds=[...pending];cloudSnapshot=new Map(state.records.map(r=>[r.id,JSON.stringify(r)]));setTimeout(()=>syncCloud(),20)}
function persistCloudCache(){try{localStorage.setItem(KEY,JSON.stringify(state));cloudSnapshot=new Map(state.records.map(r=>[r.id,JSON.stringify(r)]))}catch{storageOK=false}}
function mountCloudBar(){
 const connected=ExamCloud.connected,hasData=state.records.some(r=>r.rank);
 const box=document.createElement('div');box.className='notice cloud-sync '+(cloudError?'warn':'');box.id='cloud-status';
 box.innerHTML=`<div><b>${connected?'☁ ใช้ข้อมูลชุดเดียวกับ ChatGPT Site':'☁ เชื่อมข้อมูลที่กรอกไว้แล้ว'}</b><p>${connected?`ซิงก์อัตโนมัติทุก 45 วินาที · ${cloudWorking?'กำลังตรวจข้อมูล…':cloudLast?'ล่าสุด '+stamp(cloudLast):'รอตรวจข้อมูล'}${(state.pendingIds||[]).length?' · มีรายการรอบันทึก':''}`:hasData?'ข้อมูลในเครื่องยังอยู่ กดเชื่อมเพื่อรวมกับข้อมูลเดิมบน ChatGPT Site':'กดเชื่อมเพื่อดึงลำดับ ประวัติ และเอกสารเดิม โดยไม่ต้องนำเข้าไฟล์'}${cloudError?'<br>'+esc(cloudError):''}</p></div><button class="btn primary" data-connect>${connected?'↻ ซิงก์ตอนนี้':'เชื่อมข้อมูลเดิม'}</button>`;
 if(cloudConnecting){box.querySelector('p').textContent='กำลังรอหน้าต่างเชื่อมข้อมูล · เข้าสู่ระบบ ChatGPT Site แล้วเปิดหน้าต่างนั้นค้างไว้';box.querySelector('button').textContent='กำลังเชื่อม…'}
 if(!connected){const help=document.createElement('p');help.className='news-meta';help.innerHTML='หากเบราว์เซอร์ไม่เปิดหน้าต่างหรือบล็อกการเชื่อมข้ามเว็บ ให้ '+link(ExamCloud.site+'/tracker/','เปิดข้อมูลออนไลน์ใน ChatGPT Site')+' ซึ่งใช้โค้ดและประกาศชุดเดียวกับหน้านี้';box.append(help)}
 $('#main').prepend(box);
 const header=document.querySelector('header .tag');if(header)header.textContent=ExamCloud.direct?'ChatGPT Site · ข้อมูลออนไลน์':connected?'GitHub Pages · เชื่อมแล้ว':'GitHub Pages';
}
async function syncCloud(){
 if(cloudWorking||!ExamCloud.connected)return;cloudWorking=true;
 const pendingAtStart=[...(state.pendingIds||[])],snapshot=state.records.map(r=>JSON.parse(JSON.stringify(r))),snapshotMap=new Map(snapshot.map(r=>[r.id,JSON.stringify(r)]));
 try{
  let result;
  for(let attempt=0;attempt<3;attempt++){
   const cloud=await ExamCloud.call('load');const records=C.mergeRecords(cloud.records||[],snapshot,pendingAtStart,baseline);
   if(JSON.stringify(records)===JSON.stringify(cloud.records)){result=cloud;break}
   try{result=await ExamCloud.call('save',{revision:cloud.revision,records});break}catch(error){if(error.status!==409||attempt===2)throw error}
  }
  if(!result)throw Error('ยังรวมข้อมูลไม่สำเร็จ จะลองอีกครั้ง');
  const remaining=new Set(state.pendingIds||[]);
  for(const id of pendingAtStart){if(JSON.stringify(state.records.find(r=>r.id===id))===snapshotMap.get(id))remaining.delete(id)}
  const editsDuring=state.records.filter(r=>JSON.stringify(r)!==snapshotMap.get(r.id)).map(r=>r.id);
  editsDuring.forEach(id=>remaining.add(id));
  state={...state,records:C.mergeRecords(result.records||[],state.records,[...remaining],baseline),cloudRevision:result.revision,pendingIds:[...remaining],cloudAt:new Date().toISOString()};
  cloudLast=state.cloudAt;cloudError='';persistCloudCache();
  docs=await listAllDocuments();
 }catch(error){cloudError=error.message+' · เก็บข้อมูลในเครื่องไว้แล้ว'}finally{cloudWorking=false;render()}
}
async function startCloud(){
 cloudSnapshot=new Map(state.records.map(r=>[r.id,JSON.stringify(r)]));cloudLast=state.cloudAt||'';
 if(cloudStarted)return;cloudStarted=true;
 window.addEventListener('exam-cloud-state',()=>{if(state.records.length)render()});
 document.addEventListener('click',async e=>{if(!e.target.closest('[data-connect]')||cloudConnecting)return;cloudConnecting=true;cloudError='';try{const connecting=ExamCloud.connect(true);render();await connecting;await syncCloud();await syncPendingDocuments();toast(cloudError||'เชื่อมข้อมูลเดิมและรวมข้อมูลแล้ว')}catch(error){cloudError=error.message}finally{cloudConnecting=false;render()}});
 try{await ExamCloud.connect(false);await syncCloud();await syncPendingDocuments()}catch{render()}
 setInterval(()=>{if(ExamCloud.connected)syncCloud()},45000);
}
async function listAllDocuments(){const local=await dbOp('readonly',s=>s.getAll());if(!ExamCloud.connected)return local;try{const remote=(await ExamCloud.call('documents')).map(d=>({...d,cloud:true,createdAt:d.uploadedAt}));const remoteIds=new Set(remote.map(d=>d.id));return [...remote,...local.filter(d=>!d.remoteId||!remoteIds.has(d.remoteId))]}catch(error){cloudError=error.message;return local}}
function fileBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('อ่านไฟล์ไม่ได้'));reader.readAsDataURL(file)})}
async function storeDocument(file,data){
 const d={id:crypto.randomUUID(),recordId:data.recordId,name:file.name,size:file.size,type:file.type,note:String(data.note||'').slice(0,1000),createdAt:new Date().toISOString(),blob:file,pendingCloud:true};
 if(ExamCloud.connected&&file.size<=6*1024*1024){try{await ExamCloud.call('upload',{recordId:d.recordId,name:d.name,mimeType:d.type,base64:await fileBase64(file),analysis:{note:d.note}});return}catch(error){cloudError=error.message+' · ไฟล์ยังเก็บในเครื่อง'}}
 await dbOp('readwrite',s=>s.put(d));
}
async function syncPendingDocuments(){if(!ExamCloud.connected)return;const local=await dbOp('readonly',s=>s.getAll());for(const d of local.filter(d=>d.pendingCloud&&!d.remoteId&&d.size<=6*1024*1024).slice(0,10)){
 try{const remote=await ExamCloud.call('upload',{recordId:d.recordId,name:d.name,mimeType:d.type,base64:await fileBase64(d.blob),analysis:{note:d.note}});await dbOp('readwrite',s=>s.put({...d,remoteId:remote.id,pendingCloud:false}))}catch(error){cloudError=error.message;break}
 }docs=await listAllDocuments();render()}
async function openStoredDocument(id){const d=docs.find(d=>d.id===id);if(!d)throw Error('ไม่พบไฟล์');let blob=d.blob;if(d.cloud){const result=await ExamCloud.call('download',{id});blob=new Blob([result.bytes],{type:result.type||d.mimeType})}if(!blob)throw Error('กรุณาเชื่อมข้อมูลก่อนเปิดไฟล์ออนไลน์');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=d.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
async function deleteStoredDocument(id){const d=docs.find(d=>d.id===id);if(d?.cloud)await ExamCloud.call('delete',{id});else await dbOp('readwrite',s=>s.delete(id));docs=await listAllDocuments()}
function roundTimeline(r){
 const official=r.rounds||[];const events=(r.events||[]).filter(e=>e.kind==='call'&&(e.count!=null||e.appointed!=null)&&!official.some(o=>o.from===e.from&&o.to>=e.to));const rounds=[...official,...events.map(e=>({id:e.id,number:null,date:e.date,from:e.from,to:e.to,called:e.count,appointed:e.appointed,source:e.source||r.source,basis:e.level||'ข้อมูลผู้ใช้'}))];
 const dates=r.dates||{};const labels={webPublication:'เผยแพร่ข่าวรับสมัคร',recruitmentAnnouncement:'ประกาศรับสมัคร (ลงนาม)',announcement:r.start?'ประกาศขึ้นบัญชี':'ประกาศรับสมัคร',exam:'สอบข้อเขียน',interview:'สอบสัมภาษณ์',firstCall:'เรียกครั้งแรก',report:'รายงานตัวครั้งแรก',appointment:'กำหนดบรรจุครั้งแรก',applicationStart:'เปิดรับสมัคร',applicationEnd:'ปิดรับสมัคร'};
 return `<div class="panel"><h3>วันสำคัญที่ตรวจพบ</h3><div class="date-grid">${Object.entries(labels).map(([key,title])=>{const d=dates[key];return `<div><small>${title}</small><b>${date(typeof d==='string'?d:d?.date)}</b>${d?.source?link(d.source,'หลักฐาน'):''}</div>`}).join('')}</div><p class="news-meta">${r.vacancies?`อัตราที่เปิดรับ ${fmt(r.vacancies)} อัตรา · `:''}“กำหนดบรรจุ” เป็นวันที่ระบุในประกาศ ไม่ใช่การยืนยันว่ามาบรรจุครบทุกคน</p></div><div class="panel"><h3>รอบเรียกและจำนวนที่เพิ่ม</h3>${rounds.length?`<div style="overflow:auto"><table><thead><tr><th>รอบ</th><th>วันที่ประกาศ</th><th>ช่วงลำดับ</th><th>เรียกเพิ่ม</th><th>บรรจุจริง</th><th>หลักฐาน</th></tr></thead><tbody>${rounds.map(round=>`<tr><td>${round.number==null?'ยังไม่ยืนยัน':fmt(round.number)}<br><small>${esc(round.basis||'')}</small></td><td>${date(round.date)}</td><td>${round.from&&round.to?fmt(round.from)+'–'+fmt(round.to):'ยังไม่ยืนยัน'}</td><td>${fmt(round.called)}</td><td>${round.appointed==null?'ยังไม่ยืนยัน':fmt(round.appointed)}</td><td>${link(round.source||r.source,'ต้นฉบับ')}</td></tr>`).join('')}</tbody></table></div>`:'<p>ยังไม่พบหลักฐานที่ยืนยันหมายเลขรอบและจำนวน ไม่ใช้ลำดับล่าสุดแทนจำนวนคนที่บรรจุ</p>'}<p class="news-meta">ล่าสุดถึงลำดับ ${fmt(C.latest(r))} ไม่ได้หมายความว่าบรรจุแล้ว ${fmt(C.latest(r))} คน · การยืมบัญชีบันทึกแยกจากบัญชีหลัก</p></div>`;
}
