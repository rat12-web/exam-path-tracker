'use strict';
const ASSET_BASE=new URL('./',document.currentScript.src);
const C=ExamCore,$=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n==null?'—':Number(n).toLocaleString('th-TH',{maximumFractionDigits:1});
const date=s=>s?new Date(s+'T00:00:00Z').toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'ยังไม่ทราบ';
const stamp=s=>s?new Date(s).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}):'ยังไม่เคยตรวจ';
function timeAgo(s){if(!s)return 'ยังไม่เคยตรวจ';const diff=Math.max(0,(Date.now()-new Date(s).getTime())/1000);if(diff<60)return 'เมื่อสักครู่';if(diff<3600)return `เมื่อ ${Math.floor(diff/60)} นาทีที่แล้ว`;if(diff<86400)return `เมื่อ ${Math.floor(diff/3600)} ชั่วโมงที่แล้ว`;return `เมื่อ ${Math.floor(diff/86400)} วันก่อน`}
const KEY='exam-path-pages-v1';let state={records:[],updatedAt:''},baseline=[],feed={sources:[],items:[]},openingsData=[],view='dashboard',docs=[],feedError='',storageOK=true,refreshing=false;
let openingsFilter={query:'',status:'all',education:'all',jobFamily:'all',ocsc:'all',sort:'deadline'};
function safeURL(url){try{const u=new URL(url,location.href);return u.protocol==='https:'||u.origin===location.origin?u.href:'#'}catch{return '#'}}
function link(url,label){return `<a href="${esc(safeURL(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,5000)}
function save(){markPendingChanges();const next={...state,updatedAt:new Date().toISOString()};localStorage.setItem(KEY,JSON.stringify(next));state=next;}
function notifyStorage(){if(!storageOK)return '<div class="notice warn storage-warning">เบราว์เซอร์นี้ไม่อนุญาตให้บันทึกข้อมูล กรุณาเปิดพื้นที่จัดเก็บก่อนแก้ไข และส่งออกสำรองข้อมูลไว้</div>';return ''}
function countdownText(targetDate){
 if(!targetDate)return null;
 const now=new Date();
 const target=new Date(targetDate+'T23:59:59Z');
 const diffDays=Math.ceil((target-now)/(1000*60*60*24));
 if(diffDays>0)return 'อีก '+diffDays+' วัน';
 if(diffDays===0)return 'วันนี้!';
 return 'ถึงกำหนดแล้ว';
}
function latestAnnouncement(r){
 const found=feed.items.find(i=>i.agencyId===r.id);
 if(found)return {title:found.title.replace(/^คลิกที่นี่เพื่ออ่าน\s*/,''),url:found.url,document:found.document,published:found.published};
 if(r.sourceReview?.note)return {title:r.sourceReview.note,url:r.sourceReview.url||r.source,document:r.sourceReview.document,published:r.sourceReview.checkedAt?.slice(0,10)};
 return null;
}
function announcementSnippet(r){
 const ann=latestAnnouncement(r);
 if(!ann)return '';
 return `<div class="source-review" style="border-left-color:#2859d9;background:#f8fafd;margin:10px 0;padding:8px 12px">
  <small style="color:#2859d9;font-weight:bold">📢 ประกาศล่าสุด ${ann.published?`(${date(ann.published)})`:''}</small>
  <p style="margin:4px 0;font-size:12px;line-height:1.6">${esc(ann.title)}</p>
  ${ann.document?`<p class="news-meta" style="margin:2px 0">📄 ไฟล์: ${esc(ann.document)}</p>`:''}
 </div>`;
}
function label(r,m){
 if(m.group==="moderate")return "ลุ้นรอบปลายบัญชี (ยังไม่ตัดโอกาส)";return m.gap===0?'เรียกถึงลำดับแล้ว':m.remaining===0?'ครบอายุบัญชี':({possible:'ยังพอมีลุ้นตามสมมติฐาน',watch:'ต้องเร่งจังหวะการเรียก',unlikely:'ไม่น่าถึงตามจังหวะที่ใช้',unknown:'กรอกลำดับของฉันเพื่อประเมิน'})[m.group]}
function logo(r){const resolved=r.logo||C.resolveLogo(r);if(!resolved)return '<span class="initial">↗</span>';const url=resolved.startsWith('assets/')?new URL(resolved,ASSET_BASE).href:safeURL(resolved);return `<img class="logo" src="${esc(url)}" alt="ตรา ${esc(r.agency)}" loading="lazy" onerror="this.onerror=null;if(this.src.endsWith('.webp')){this.src=this.src.replace(/\\.webp$/,'.png');}else{this.hidden=true;}">`}
function evidence(r){return `<p class="news-meta">เรียกถึง ${fmt(C.latest(r))} · ${esc(r.calledBasis||'ข้อมูลที่บันทึก')} · วันที่รับข้อมูล ${date(r.calledAt)}</p>`}
function modelText(r,m){if(!r.rank)return '<div class="summary">กรอกลำดับของฉันเพื่อแสดงระยะห่าง ความคืบหน้า และคาดการณ์ ข้อมูลนี้เก็บในเครื่องของคุณ</div>';return `<div class="summary">${r.expiry?`เหลือประมาณ ${fmt(m.remaining)} เดือน · วันสุดท้ายที่คำนวณ ${date(r.expiry)}`:'อายุไม่เกิน 2 ปี · ยังไม่พบวันเริ่มบัญชี'}<br>${m.need==null?'':`ต้องขยับเฉลี่ย ${fmt(m.need)} ลำดับ/เดือน<br>`}${m.observed==null?'ใช้ความถี่รอบเรียกสมมติทุก 6 / 3 / 2 เดือน':'อัตราที่สังเกตหลังรอบแรก '+fmt(m.observed)+' ลำดับ/เดือน'}<br>ลำดับปลายกรอบ: ช้า ${fmt(m.end[0])} · ฐาน ${fmt(m.end[1])} · เร็ว ${fmt(m.end[2])}</div>`}
function card(r){
 const m=C.plan(r);
 const isWaiting=C.latest(r)==null;
 const cd=countdownText(r.targetDate);
 const seatDisplay=r.seatNo?esc(r.seatNo):'<span class="muted" style="font-size:13px">กดแก้ไขเพื่อกรอก</span>';
 const targetDisplay=r.targetNote||(r.targetDate?date(r.targetDate):'รอประกาศ');
 const directPdf=r.pdfUrl||(r.sourceReview?.document&&r.sourceReview?.url?(r.sourceReview.url.replace(/\/[^/]*$/, '/')+r.sourceReview.document):null);

 return `<article class="card ${m.group}">
  <div class="card-head">${logo(r)}<div><h3>${esc(r.position)}</h3><div class="agency">${esc(r.agency)}</div></div></div>
  <span class="pill">${isWaiting?esc(r.status):label(r,m)}</span>

  ${isWaiting?`
  <div class="metrics">
   <div><small>เลขประจำตัวสอบ</small><strong>${seatDisplay}</strong></div>
   <div><small>กำหนดประกาศ</small><strong style="font-size:14px;line-height:1.4;margin-top:9px">${esc(targetDisplay)}</strong></div>
   <div><small>นับถอยหลัง</small><strong style="color:#2859d9">${cd||'—'}</strong></div>
  </div>
  <div class="summary">
   ${r.status==='รอสมัคร'?'สถานะส่วนตัว: รอสมัคร · ':''}
   ${r.targetNote?`เป้าหมาย: ${esc(r.targetNote)}<br>`:''}
   ยังไม่มีการขึ้นบัญชีหรือประกาศลำดับ ตรวจประกาศต้นฉบับเพื่อดูรายชื่อ
  </div>
  `:`
  <div class="metrics">
   <div><small>ลำดับของฉัน</small><strong>${fmt(r.rank)}</strong></div>
   <div><small>เรียกถึง</small><strong>${fmt(m.called)}</strong></div>
   <div><small>ระยะห่าง</small><strong>${fmt(m.gap)}</strong></div>
  </div>
  ${m.progress==null?'':`<div class="progress" role="progressbar" aria-label="ความคืบหน้าลำดับ" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${m.progress.toFixed(1)}"><i style="width:${m.progress}%"></i></div><div class="progress-label">ความคืบหน้าลำดับ ${fmt(m.progress)}% · ลำดับที่เรียกถึง ÷ ลำดับของฉัน</div>`}
  ${modelText(r,m)}
  ${evidence(r)}
  `}

  ${announcementSnippet(r)}
  ${sourceReview(r)}

  <div class="card-foot">
   <div class="actions">
    ${link(r.source,'ประกาศทางการ')}
    ${directPdf?`<a href="${esc(safeURL(directPdf))}" target="_blank" rel="noopener noreferrer" class="btn" style="padding:4px 9px;font-size:12px;background:#eef4ff;color:#1e4fb8;border-color:#bfd3fa">📄 PDF ล่าสุด ↗</a>`:''}
    ${r.hrSource?link(r.hrSource,'เว็บกองการเจ้าหน้าที่'):''}
   </div>
   <button class="btn" data-detail="${esc(r.id)}">รายละเอียด / แก้ไข</button>
  </div>
 </article>`;
}
function feedNotice(){const failed=feed.sources.filter(s=>s.status!=='ok').length,stale=!feed.checkedAt||Date.now()-new Date(feed.checkedAt).getTime()>6*3600000;return `<div class="notice ${failed||feedError||stale?'warn':''}">ตรวจแหล่งประกาศล่าสุด: <b>${stamp(feed.checkedAt)}</b> (${timeAgo(feed.checkedAt)}) · ระบบตรวจอัตโนมัติทุก 1 ชั่วโมง${failed?` · เข้าถึงไม่ได้ ${failed} แหล่ง`:''}${feedError?'<br>'+esc(feedError):''}${stale?'<br>ผลตรวจเก่ากว่า 6 ชั่วโมงหรือยังไม่มีผลล่าสุด กรุณาดูสถานะระบบ':''}<br>ประกาศใหม่ต้องตรวจตำแหน่ง ปีบัญชี และช่วงลำดับก่อนบันทึก ไม่ปรับลำดับจากข้อความที่ยังไม่ยืนยัน ${link('https://github.com/rat12-web/exam-path-tracker/actions','ดูสถานะระบบ')}</div>`}
function sourceReview(r,full=false){const info=r.sourceReview;if(!info)return '';return `<div class="source-review"><small>ทบทวนประกาศ ${stamp(info.checkedAt)}</small><p>${esc(info.note)}</p>${full?`<p class="news-meta">${esc(info.scope)}${info.document?'<br>เอกสาร: '+esc(info.document):''}</p>${link(info.url,'เปิดแหล่งที่ตรวจ')}`:''}</div>`}

function dashboard(){
 const accounts=state.records.filter(r=>!r.archived&&C.latest(r)!=null),waiting=state.records.filter(r=>!r.archived&&C.latest(r)==null),personal=accounts.filter(r=>r.rank);
 const groups=[['possible','ยังพอมีลุ้น'],['moderate','ลุ้นรอบปลายบัญชี · นักพัฒนาสังคม'],['watch','ติดตามใกล้ชิด'],['unknown','บัญชีที่ติดตาม']];
 return `<div class="page-title"><div><h1>ภาพรวมเส้นทางบรรจุ</h1><p class="muted">ติดตามลำดับด้วยข้อมูลที่ตรวจสอบได้ · บัญชีที่คุณสนใจในหน้าแรก</p></div><div class="actions"><button class="btn" data-action="openings-shortcut">✦ ค้นหาตำแหน่งงานเปิดใหม่</button><button class="btn" data-action="import">นำเข้าข้อมูลเดิม</button><button class="btn primary" data-add>＋ เพิ่มสนาม</button></div></div>${notifyStorage()}${!personal.length?'<div class="notice">เริ่มใช้งาน: กดรายละเอียดเพื่อกรอกลำดับของฉัน หรือนำเข้าไฟล์สำรองจากเว็บเดิม ลำดับส่วนตัวเชื่อมจาก ChatGPT Site และไม่เผยแพร่บน GitHub</div>':''}<div class="stats"><div class="stat"><span>ขึ้นบัญชี / ติดตาม</span><strong>${accounts.length}</strong><span>หน่วยงาน</span></div><div class="stat"><span>สอบแล้ว / รอผล</span><strong>${waiting.filter(r=>C.stage(r)==='completed').length}</strong><span>รอกำหนดการ / รอสอบ ${waiting.filter(r=>C.stage(r)==='upcoming').length} · รอสมัคร ${waiting.filter(r=>C.stage(r)==='application').length}</span></div><div class="stat"><span>ตั้งลำดับส่วนตัวแล้ว</span><strong>${personal.length}</strong><span>บัญชีในเครื่องนี้</span></div><div class="stat"><span>ประกาศที่ตรวจพบ</span><strong>${feed.items.length}</strong><span>ตรวจล่าสุด ${timeAgo(feed.checkedAt)}</span></div></div>${feedNotice()}${groups.map(([g,title])=>{const items=accounts.filter(r=>C.plan(r).group===g);return items.length?`<div class="section-title"><h2>${title}</h2><span class="muted">${items.length} บัญชี</span></div><div class="cards">${items.map(card).join('')}</div>`:''}).join('')}${[['completed','สอบแล้ว / รอผล','ยึดสถานะส่วนตัวที่บันทึกไว้'],['upcoming','รอกำหนดการ / รอสอบ','กำหนดการทางการแสดงในรายละเอียด'],['application','รอสมัคร','ยังไม่ได้สมัครตามสถานะส่วนตัว']].map(([stage,title,hint])=>{const rows=waiting.filter(r=>C.stage(r)===stage);return rows.length?`<section class="exam-stage" data-stage="${stage}"><div class="section-title"><h2>${title}</h2><span class="muted">${rows.length} สนาม · ${hint}</span></div><div class="cards">${rows.map(card).join('')}</div></section>`:''}).join('')}`;
}

function openingStatus(op){
 const today=C.today();
 if(!op.applicationStart||!op.applicationEnd)return 'unknown';
 if(today>=op.applicationStart&&today<=op.applicationEnd)return 'open';
 if(today<op.applicationStart)return 'upcoming';
 return 'closed';
}

function eduBadge(op){
 const text=((op.level||'')+' '+(op.education||'')).toLowerCase();
 if(/ปริญญาโท|ป\.โท|ชำนาญการพิเศษ/.test(text)){
  return `<span class="badge badge-edu-master">🎓 ปริญญาโท</span>`;
 }
 if(/ปริญญาตรี|ป\.ตรี|ปฏิบัติการ|ครูผู้ช่วย/.test(text)){
  return `<span class="badge badge-edu-bachelor">🎓 ปริญญาตรี</span>`;
 }
 if(/ปวส|อนุปริญญา|ปฏิบัติงาน/.test(text)){
  return `<span class="badge badge-edu-diploma">🎓 ปวส. / อนุปริญญา</span>`;
 }
 if(/ปวช|ประกาศนียบัตรวิชาชีพ(?!ชั้นสูง)|ระดับต้น|บริการ/.test(text)){
  return `<span class="badge badge-edu-vocational">🎓 ปวช.</span>`;
 }
 return `<span class="badge badge-edu">🎓 ${esc(op.level||'ทั่วไป')}</span>`;
}

function openingCard(op){
 const st=openingStatus(op);
 const isTracked=state.records.some(r=>r.id===op.id||r.id===op.recordId);
 const now=new Date();
 let badgeText='',badgeClass='';
 if(st==='open'){
  const diff=Math.max(0,Math.ceil((new Date(op.applicationEnd+'T23:59:59Z')-now)/86400000));
  badgeText=diff<=1?'วันสุดท้าย!':`ปิดรับในอีก ${diff} วัน`;
  badgeClass='badge-open';
 }else if(st==='upcoming'){
  const diff=Math.max(0,Math.ceil((new Date(op.applicationStart+'T00:00:00Z')-now)/86400000));
  badgeText=`เปิดรับในอีก ${diff} วัน`;
  badgeClass='badge-upcoming';
 }else{
  badgeText='เพิ่งปิดรับสมัคร';
  badgeClass='badge-closed';
 }
 const ocscBadge=op.ocscRequirement?.includes('ไม่ต้อง')?`<span class="badge badge-nocsc">✓ ไม่ต้องผ่าน ภาค ก.</span>`:op.ocscRequirement?.includes('ต้องผ่าน')?`<span class="badge badge-ocsc">ภาค ก. ก.พ.</span>`:`<span class="badge">${esc(op.ocscRequirement||'')}</span>`;
 return `<article class="card ${isTracked?'tracked':''}" id="op-${esc(op.id)}">
  <div class="card-head">
   ${logo(op)}
   <div>
    <h3>${esc(op.position)}</h3>
    <div class="agency">${esc(op.agency)} <small class="muted">(${esc(op.ministry||'')})</small></div>
   </div>
  </div>
  <div class="badge-group">
   <span class="badge ${badgeClass}">${badgeText}</span>
   ${eduBadge(op)}
   <span class="badge badge-family">💼 ${esc(op.jobFamily||'ทั่วไป')}</span>
   ${ocscBadge}
   ${op.vacancies?`<span class="badge">👥 ${fmt(op.vacancies)} อัตรา</span>`:''}
  </div>
  <div class="opening-dates">
   <div><b>ช่วงรับสมัคร:</b> ${date(op.applicationStart)} – ${date(op.applicationEnd)}</div>
   ${op.salary?`<div><b>เงินเดือน:</b> ${esc(op.salary)}</div>`:''}
   ${op.education?`<div><b>วุฒิที่รับ:</b> ${esc(op.education)}</div>`:''}
   ${op.highlights?`<div class="news-meta" style="margin-top:6px">✦ ${esc(op.highlights)}</div>`:''}
  </div>
  <div class="card-foot">
   <div class="actions">
    ${op.source?link(op.source,'เว็บรับสมัคร'):''}
    ${op.officialNotice&&op.officialNotice!==op.source?link(op.officialNotice,'ประกาศต้นฉบับ'):''}
   </div>
   <div>
    ${isTracked?`<button class="btn tracked" disabled>✓ อยู่ในแผนของฉันแล้ว</button>`:`<button class="btn primary" data-track-opening="${esc(op.id)}">＋ เพิ่มเข้าแผนรอสมัคร</button>`}
   </div>
  </div>
 </article>`;
}

function openings(){
 const query=openingsFilter.query.trim().toLowerCase();
 let list=openingsData.slice();
 if(query){
  list=list.filter(op=>
   (op.position||'').toLowerCase().includes(query)||
   (op.agency||'').toLowerCase().includes(query)||
   (op.education||'').toLowerCase().includes(query)||
   (op.jobFamily||'').toLowerCase().includes(query)||
   (op.ministry||'').toLowerCase().includes(query)
  );
 }
 if(openingsFilter.status!=='all'){
  list=list.filter(op=>openingStatus(op)===openingsFilter.status);
 }
 if(openingsFilter.education!=='all'){
  if(openingsFilter.education==='master'){
   list=list.filter(op=>/ปริญญาโท|ป\.โท|ชำนาญการพิเศษ/.test(op.level||'')||/ปริญญาโท|ป\.โท/.test(op.education||''));
  }else if(openingsFilter.education==='bachelor'){
   list=list.filter(op=>/ปริญญาตรี|ป\.ตรี|ปฏิบัติการ|ครูผู้ช่วย/.test(op.level||'')||/ปริญญาตรี|ป\.ตรี/.test(op.education||''));
  }else if(openingsFilter.education==='diploma'){
   list=list.filter(op=>/ปวส|อนุปริญญา|ปฏิบัติงาน/.test(op.level||'')||/ปวส|อนุปริญญา/.test(op.education||''));
  }else if(openingsFilter.education==='vocational'){
   list=list.filter(op=>/ปวช|ประกาศนียบัตรวิชาชีพ(?!ชั้นสูง)|ระดับต้น|บริการ/.test(op.level||'')||/ปวช|ประกาศนียบัตรวิชาชีพ(?!ชั้นสูง)/.test(op.education||''));
  }
 }
 if(openingsFilter.jobFamily!=='all'){
  list=list.filter(op=>(op.jobFamily||'').toLowerCase().includes(openingsFilter.jobFamily.toLowerCase()));
 }
 if(openingsFilter.ocsc!=='all'){
  if(openingsFilter.ocsc==='not-required')list=list.filter(op=>(op.ocscRequirement||'').includes('ไม่ต้อง'));
  else if(openingsFilter.ocsc==='required')list=list.filter(op=>(op.ocscRequirement||'').includes('ต้องผ่าน'));
 }
 if(openingsFilter.sort==='deadline'){
  list.sort((a,b)=>(a.applicationEnd||'9999').localeCompare(b.applicationEnd||'9999'));
 }else if(openingsFilter.sort==='start'){
  list.sort((a,b)=>(b.applicationStart||'').localeCompare(a.applicationStart||''));
 }else if(openingsFilter.sort==='vacancies'){
  list.sort((a,b)=>(b.vacancies||0)-(a.vacancies||0));
 }else if(openingsFilter.sort==='agency'){
  list.sort((a,b)=>(a.agency||'').localeCompare(b.agency||'','th'));
 }

 const openCount=openingsData.filter(o=>openingStatus(o)==='open').length;
 const upcomingCount=openingsData.filter(o=>openingStatus(o)==='upcoming').length;
 const totalVacancies=openingsData.reduce((acc,o)=>acc+(o.vacancies||0),0);
 const myTrackedCount=openingsData.filter(o=>state.records.some(r=>r.id===o.id||r.id===o.recordId)).length;

 const openList=list.filter(o=>openingStatus(o)==='open');
 const upcomingList=list.filter(o=>openingStatus(o)==='upcoming');
 const closedList=list.filter(o=>openingStatus(o)==='closed');

 return `<div class="page-title">
  <div>
   <h1>ตำแหน่งงานที่เปิดรับ (ค้นหาและจัดระเบียบ)</h1>
   <p class="muted">สำรวจตำแหน่งงานราชการล่าสุด พร้อมตัวกรองตามวุฒิ สายงาน วันเปิด-ปิดรับ และกดเพิ่มเข้าแผนในหน้าแรกได้ทันที</p>
  </div>
  <div class="actions">
   <span class="fresh-pill">ดึงข้อมูลล่าสุด: ${timeAgo(feed.checkedAt)}</span>
  </div>
 </div>
 <div class="stats">
  <div class="stat"><span>กำลังเปิดรับสมัคร</span><strong>${openCount}</strong><span>ตำแหน่งงาน</span></div>
  <div class="stat"><span>กำลังจะเปิดรับเร็วๆ นี้</span><strong>${upcomingCount}</strong><span>เตรียมตัวล่วงหน้า</span></div>
  <div class="stat"><span>อัตราว่างรวมที่ระบุ</span><strong>${fmt(totalVacancies)}</strong><span>อัตรา</span></div>
  <div class="stat"><span>อยู่ในแผนของฉันแล้ว</span><strong>${myTrackedCount}</strong><span>สนามสอบในหน้าแรก</span></div>
 </div>
 
 <div class="filter-bar">
  <div class="filter-row">
   <input type="search" id="opening-search" class="search-input" placeholder="🔍 ค้นหาชื่อตำแหน่ง / หน่วยงาน / วุฒิการศึกษา..." value="${esc(openingsFilter.query)}">
   <select id="filter-sort" class="filter-select" aria-label="เรียงลำดับ">
    <option value="deadline" ${openingsFilter.sort==='deadline'?'selected':''}>⏳ ปิดรับสมัครเร็วสุดก่อน</option>
    <option value="start" ${openingsFilter.sort==='start'?'selected':''}>📅 เปิดรับสมัครล่าสุด</option>
    <option value="vacancies" ${openingsFilter.sort==='vacancies'?'selected':''}>👥 อัตราว่างมากสุด</option>
    <option value="agency" ${openingsFilter.sort==='agency'?'selected':''}>🏛 ตามชื่อหน่วยงาน (ก-ฮ)</option>
   </select>
  </div>
  <div class="filter-row">
   <div class="filter-chips">
    <button class="chip ${openingsFilter.status==='all'?'active':''}" data-filter-status="all">ทั้งหมด (${openingsData.length})</button>
    <button class="chip ${openingsFilter.status==='open'?'active':''}" data-filter-status="open">กำลังเปิดรับสมัคร (${openCount})</button>
    <button class="chip ${openingsFilter.status==='upcoming'?'active':''}" data-filter-status="upcoming">กำลังจะเปิดรับ (${upcomingCount})</button>
    <button class="chip ${openingsFilter.status==='closed'?'active':''}" data-filter-status="closed">เพิ่งปิดรับสมัคร</button>
   </div>
   <select id="filter-edu" class="filter-select" aria-label="กรองระดับวุฒิ">
    <option value="all" ${openingsFilter.education==='all'?'selected':''}>🎓 ทุกระดับวุฒิ</option>
    <option value="master" ${openingsFilter.education==='master'?'selected':''}>🎓 ปริญญาโท (ชำนาญการพิเศษ)</option>
    <option value="bachelor" ${openingsFilter.education==='bachelor'?'selected':''}>🎓 ปริญญาตรี (ปฏิบัติการ / ครู)</option>
    <option value="diploma" ${openingsFilter.education==='diploma'?'selected':''}>🎓 ปวส. / อนุปริญญา (ปฏิบัติงาน)</option>
    <option value="vocational" ${openingsFilter.education==='vocational'?'selected':''}>🎓 ปวช. (ระดับต้น / บริการ)</option>
   </select>
   <select id="filter-family" class="filter-select" aria-label="กรองสายงาน">
    <option value="all" ${openingsFilter.jobFamily==='all'?'selected':''}>💼 ทุกสายงาน</option>
    <option value="คอมพิวเตอร์" ${openingsFilter.jobFamily==='คอมพิวเตอร์'?'selected':''}>คอมพิวเตอร์ / ดิจิทัล</option>
    <option value="บริหาร" ${openingsFilter.jobFamily==='บริหาร'?'selected':''}>บริหาร / จัดการทั่วไป / การคลัง</option>
    <option value="นโยบาย" ${openingsFilter.jobFamily==='นโยบาย'?'selected':''}>วิเคราะห์นโยบายและแผน</option>
    <option value="กฎหมาย" ${openingsFilter.jobFamily==='กฎหมาย'?'selected':''}>กฎหมาย / ตรวจสอบ / ยุติธรรม</option>
    <option value="การศึกษา" ${openingsFilter.jobFamily==='การศึกษา'?'selected':''}>การศึกษา / วิชาการ</option>
   </select>
   <select id="filter-ocsc" class="filter-select" aria-label="เงื่อนไข ก.พ.">
    <option value="all" ${openingsFilter.ocsc==='all'?'selected':''}>📋 ภาค ก. ก.พ. ทั้งหมด</option>
    <option value="required" ${openingsFilter.ocsc==='required'?'selected':''}>ต้องผ่าน ภาค ก. ก.พ.</option>
    <option value="not-required" ${openingsFilter.ocsc==='not-required'?'selected':''}>ไม่ต้องผ่าน ภาค ก. ก.พ.</option>
   </select>
   ${query||openingsFilter.status!=='all'||openingsFilter.education!=='all'||openingsFilter.jobFamily!=='all'||openingsFilter.ocsc!=='all'?`<button class="btn" id="clear-filters">ล้างตัวกรอง</button>`:''}
  </div>
 </div>

 ${list.length===0?`<div class="panel empty"><h3>ไม่พบตำแหน่งงานตามเงื่อนไขที่เลือก</h3><p class="muted">ลองเปลี่ยนคำค้นหา หรือกดล้างตัวกรองเพื่อดูตำแหน่งทั้งหมด</p><button class="btn primary" id="clear-filters-btn">ล้างตัวกรองทั้งหมด</button></div>`:''}

 ${openList.length?`<div class="section-title"><h2>🟢 กำลังเปิดรับสมัคร (${openList.length})</h2><span class="muted">กดปุ่ม + เพื่อบันทึกเข้าแผนในหน้าแรก</span></div><div class="cards">${openList.map(openingCard).join('')}</div>`:''}
 
 ${upcomingList.length?`<div class="section-title"><h2>🟡 กำลังจะเปิดรับสมัครเร็วๆ นี้ (${upcomingList.length})</h2><span class="muted">เตรียมเอกสารและคุณสมบัติล่วงหน้า</span></div><div class="cards">${upcomingList.map(openingCard).join('')}</div>`:''}

 ${closedList.length?`<div class="section-title"><h2>⚪ เพิ่งปิดรับสมัคร (${closedList.length})</h2><span class="muted">ใช้ติดตามประกาศรายชื่อผู้มีสิทธิสอบและวันเวลาสอบ</span></div><div class="cards">${closedList.map(openingCard).join('')}</div>`:''}
 `;
}

function news(){return `<div class="page-title"><div><h1>ประกาศและอัปเดต</h1><p class="muted">รายการที่พบจากหน้าทางการ ยังไม่ใช่การยืนยันว่าตรงบัญชีของคุณ</p></div><div class="actions"><span class="fresh-pill">ดึงล่าสุด: ${timeAgo(feed.checkedAt)}</span></div></div>${feedNotice()}<div class="panel"><h2>ประกาศที่ตรวจพบ</h2>${feed.items.length?feed.items.slice(0,100).map(n=>`<div class="news-row">${link(n.url,n.title)}<div class="news-meta">${esc(n.agency)} · พบครั้งแรก ${stamp(n.firstSeen)}${n.published?' · วันที่ต้นทาง '+esc(n.published):''} · ${n.evidence==='search-index-lead'?'ผลค้นสำรอง ยังไม่ได้ตรวจต้นฉบับ':'พบจากหน้าทางการ รอตรวจความเกี่ยวข้อง'}</div></div>`).join(''):'<p>ยังไม่มีรายการที่อ่านได้ เปิดแหล่งข้อมูลด้านล่างเพื่อตรวจต้นฉบับ</p>'}</div><div class="section-title"><h2>สถานะต้นทาง</h2></div><div class="source-status">${feed.sources.map(s=>`<div class="panel"><h3>${esc(s.agency)}</h3><p class="${s.status==='ok'?'ok':'bad'}">${s.status==='ok'?'อ่านรายการทางการได้':s.status==='index'?'พบผลค้นสำรอง · ต้นทางยังเข้าถึงไม่ได้':'ยังอ่านรายการไม่สำเร็จ'}</p><p class="news-meta">${esc(s.message||'')}<br>ตรวจเมื่อ ${stamp(s.checkedAt)}${s.lastSuccess?'<br>สำเร็จล่าสุด '+stamp(s.lastSuccess):''}</p>${link(s.url,'เปิดต้นทาง')}</div>`).join('')}</div>`}
function settings(){return `<h1>สำรองและตั้งค่า</h1><div class="notice">เมื่อเชื่อมแล้ว บัญชีและเอกสารใช้ฐานข้อมูลส่วนตัวเดียวกับ ChatGPT Site พร้อมสำรองในเครื่อง GitHub เก็บเฉพาะโค้ดและประกาศสาธารณะ ไม่เก็บลำดับหรือไฟล์ส่วนตัว</div><div class="source-status"><div class="panel"><h2>ข้อมูลบัญชี</h2><p>สำรองลำดับ ประวัติ และหมายเหตุเป็น JSON เอกสารแนบไม่ได้รวมในไฟล์นี้</p><div class="actions"><button class="btn primary" data-action="export">ส่งออก JSON</button><button class="btn" data-action="import">นำเข้า JSON</button></div><p class="news-meta">บันทึกส่วนตัวล่าสุด ${stamp(state.updatedAt)}</p></div><div class="panel"><h2>ข้อมูลเดิมเชื่อมอัตโนมัติ</h2><p>กดเชื่อมข้อมูลเดิมและเข้าสู่ระบบ ChatGPT Site หนึ่งครั้ง จากนั้นซิงก์ระหว่างหน้าทุก 45 วินาที เปิดหน้าต่างเชื่อมค้างไว้เมื่อใช้ GitHub Pages เอกสารเดิมยังอยู่ในฐานข้อมูลเดิม</p>${link('https://exam-path-personal-2026-r.rat-creative1.chatgpt.site/tracker/','เปิดเว็บเดิม')}</div><div class="panel"><h2>ระบบอัปเดตอัตโนมัติ (ทุก 1 ชั่วโมง)</h2><p>ตรวจประกาศและข้อมูลรับสมัครทุก 1 ชั่วโมง หน้าเว็บตรวจผลล่าสุดเมื่อเปิดอยู่ และสามารถกดปุ่ม "ตรวจอัปเดต" ด้านบนได้ทุกเวลา</p><p>ลำดับเรียกจะเปลี่ยนเมื่อบันทึกหลังตรวจประกาศแล้ว ระบบไม่เดาจากเอกสารสแกน</p>${link('https://github.com/rat12-web/exam-path-tracker/actions','สถานะงานอัตโนมัติ')}<p class="news-meta">GitHub อาจรันงานช้าและพักงานตามกำหนดเมื่อคลังสาธารณะไม่มีความเคลื่อนไหว 60 วัน ดูเวลาตรวจล่าสุดเสมอ</p></div><div class="panel"><h2>แจ้งเตือน JNP Gov Noti ผ่าน LINE OA</h2><p>รับแจ้งเตือนบัญชีที่คุณสนใจในหน้าแรกผ่านแชต LINE ส่วนตัว ทุกๆ 09:00 และ 18:00 ของทุกวัน พร้อมแจ้งเตือนทันทีเมื่อมีประกาศใหม่หรือลำดับขยับ</p><p>ใช้ LINE OA เดิมของ JNP Gov Noti ระบบไม่ส่งข่าวเก่าย้อนหลังเมื่อเริ่มเชื่อมต่อ</p>${link('https://github.com/rat12-web/gov-exam-monitor/actions/workflows/tracker-line.yml','ดูสถานะการแจ้งเตือน')}</div><div class="panel"><h2>วิธีคาดการณ์</h2><p>เมื่อมีข้อมูลอย่างน้อย 3 เดือน ใช้ (ลำดับล่าสุด − รอบแรก) ÷ อายุบัญชีเป็นอัตราฐาน กรณีช้าใช้ครึ่งหนึ่ง กรณีเร็วใช้ 1.5 เท่า</p><p>ช่วงแรกใช้รอบสมมติขนาดเท่ารอบแรกทุก 6 / 3 / 2 เดือน คำนวณถึงวันหมดอายุที่บันทึก ทั้งหมดเป็นสมมติฐาน ไม่ใช่เปอร์เซ็นต์โอกาสบรรจุ และไม่รวมยอดยืมที่ยังไม่ยืนยัน</p></div></div>`}
function documents(){return `<div class="page-title"><div><h1>เอกสารของฉัน</h1><p class="muted">เอกสารเดิมและไฟล์ใหม่ซิงก์กับ ChatGPT Site เมื่อเชื่อมแล้ว · ไฟล์ออนไลน์สูงสุด 6 MB</p></div></div><form id="doc-form" class="panel form-grid"><label>สนามสอบ<select name="recordId">${state.records.map(r=>`<option value="${esc(r.id)}">${esc(r.agency)}</option>`).join('')}</select></label><label>เลือกไฟล์<input type="file" name="file" required></label><label class="full">บันทึกเพิ่มเติม<input name="note" maxlength="1000"></label><div class="full"><button class="btn primary">บันทึกเอกสาร</button></div></form><div class="panel document-list" style="margin-top:20px">${docs.length?docs.map(d=>`<div class="news-row"><h3>${esc(d.name)}</h3><p class="news-meta">${esc(state.records.find(r=>r.id===d.recordId)?.agency||'เอกสารทั่วไป')} · ${stamp(d.createdAt)} · ${fmt(d.size/1024)} KB</p><p>${esc(d.note||d.analysis?.note||'')} · ${d.cloud?'ออนไลน์':d.pendingCloud?'ในเครื่อง · รอซิงก์':'ในเครื่อง'}</p><div class="actions"><button class="btn" data-doc-open="${esc(d.id)}">เปิด / ดาวน์โหลด</button><button class="btn" data-doc-delete="${esc(d.id)}">ลบไฟล์</button></div></div>`).join(''):'<p class="empty">ยังไม่มีไฟล์แนบ</p>'}</div>`}

function render(){
 const titles={dashboard:'ภาพรวมบัญชี',openings:'ตำแหน่งที่เปิดรับ',news:'ประกาศและอัปเดต',documents:'เอกสารของฉัน',settings:'สำรองและตั้งค่า'};
 $('#breadcrumb').textContent=titles[view];
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 $('#main').innerHTML=({dashboard,openings,news,documents,settings})[view]();
 mountCloudBar();
}

function openModal(title,html){$('#modal-title').textContent=title;$('#modal-content').innerHTML=html;$('#modal').showModal()}
function detail(id){const r=state.records.find(r=>r.id===id);if(!r)return;const m=C.plan(r);openModal(r.position,`<div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">${logo(r)}<div><p class="muted" style="margin:0">${esc(r.agency)}</p><span class="pill" style="margin:6px 0 0">${label(r,m)}</span></div></div>${modelText(r,m)}${evidence(r)}${roundTimeline(r)}${sourceReview(r,true)}<div class="forecast-grid"><div><small>ช้า · ถึงวันสุดท้าย</small><strong>${fmt(m.end[0])}</strong></div><div><small>ฐาน · ถึงวันสุดท้าย</small><strong>${fmt(m.end[1])}</strong></div><div><small>เร็ว · ถึงวันสุดท้าย</small><strong>${fmt(m.end[2])}</strong></div></div>${r.targetNote?`<div class="notice" style="margin:12px 0">🎯 กำหนดการคาดหมาย: <b>${esc(r.targetNote)}</b> (${countdownText(r.targetDate)||'ตามประกาศ'})</div>`:''}<form id="record-form" data-id="${esc(r.id)}" class="form-grid"><label>เลขประจำตัวสอบ<input type="text" name="seatNo" maxlength="50" placeholder="เช่น 67010023" value="${esc(r.seatNo||'')}"></label><label>ลำดับของฉัน<input type="number" name="rank" min="1" max="${r.total||1000000}" value="${r.rank||''}"></label><label>เรียกถึงลำดับ<input type="number" name="called" min="0" value="${C.latest(r)||''}"></label><label>วันขึ้นบัญชี<input type="date" name="start" value="${esc(r.start)}"></label><label>วันสุดท้ายของบัญชี<input type="date" name="expiry" value="${esc(r.expiry)}"></label><label>ผู้ขึ้นบัญชีทั้งหมด<input type="number" name="total" min="1" value="${r.total||''}"></label><label>จำนวนเรียกครั้งแรก<input type="number" name="initial" min="0" value="${r.initial??''}"></label><label class="full">ลิงก์หลักฐานลำดับล่าสุด<input type="url" name="callSource" value=""></label><label class="full">หมายเหตุส่วนตัว<textarea name="note" maxlength="4000">${esc(r.note)}</textarea></label><div class="full"><p class="news-meta">วันครบ 2 ปีเป็นวันสุดท้ายที่คำนวณจากวันขึ้นบัญชี บัญชีอาจยกเลิกก่อนเมื่อมีบัญชีใหม่ ต้องตรวจประกาศกำกับ</p><p id="form-error" class="error" role="alert"></p><button class="btn primary">บันทึกข้อมูล</button></div></form><div class="panel"><h3>บัญชีเก่า / การยืม</h3><p>${esc(r.researchSummary)}</p>${(r.sources||[]).map(s=>`<div class="news-row">${link(s.url,s.title)}<p class="news-meta">${esc(s.note)}</p></div>`).join('')}<p class="news-meta">ยังไม่ยืนยันการยืมออกจริงของบัญชีปัจจุบัน จึงไม่เพิ่มยอดยืมลงลำดับคาดการณ์</p></div><div class="panel"><h3>ประวัติที่บันทึกในเครื่องนี้</h3>${(r.events||[]).slice().reverse().map(e=>`<p>${date(e.date)} · ถึงลำดับ ${fmt(e.to)} · ${esc(e.level)} ${e.source?link(e.source,'หลักฐาน'):''}<br><small>${esc(e.note)}</small></p>`).join('')||'<p class="muted">ยังไม่มีรายการเพิ่ม</p>'}</div>`)}
function download(name,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function db(){return new Promise((resolve,reject)=>{const req=indexedDB.open('exam-path-documents',1);req.onupgradeneeded=()=>req.result.createObjectStore('documents',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('เปิดพื้นที่เก็บเอกสารไม่ได้'))})}
async function dbOp(mode,op){const database=await db();try{return await new Promise((resolve,reject)=>{const tx=database.transaction('documents',mode),req=op(tx.objectStore('documents'));tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(Error('บันทึกเอกสารไม่สำเร็จ พื้นที่อาจเต็ม'));tx.onabort=()=>reject(Error('ยกเลิกการบันทึกเอกสาร'))})}finally{database.close()}}

async function refreshFeed(show=true){
 if(refreshing)return;
 refreshing=true;
 $('#refresh').disabled=true;
 try{
  const res=await fetch(new URL('data/announcements.json?t='+Date.now(),ASSET_BASE),{cache:'no-store'});
  if(!res.ok)throw Error('HTTP '+res.status);
  const fresh=await res.json();
  if(!Array.isArray(fresh.sources)||!Array.isArray(fresh.items))throw Error('รูปแบบข้อมูลเปลี่ยน');
  feed=fresh;
  feedError='';
  try{localStorage.setItem(KEY+'-feed',JSON.stringify(feed))}catch{}
  // Also refresh openings in background
  try{
   const oRes=await fetch(new URL('data/openings.json?t='+Date.now(),ASSET_BASE),{cache:'no-store'});
   if(oRes.ok)openingsData=(await oRes.json()).items||openingsData;
  }catch{}
  if(show)toast('อ่านผลตรวจล่าสุดแล้ว: '+stamp(feed.checkedAt));
 }catch(e){
  feedError='อ่านผลล่าสุดไม่สำเร็จ แสดงข้อมูลเดิม: '+e.message;
  if(show)toast(feedError);
 }finally{
  refreshing=false;
  $('#refresh').disabled=false;
  const timeEl=$('#last-pulled-time');
  if(timeEl&&feed.checkedAt)timeEl.textContent='ดึงข้อมูลล่าสุด: '+stamp(feed.checkedAt);
  render();
 }
}

function trackOpening(openingId){
 const op=openingsData.find(o=>o.id===openingId);
 if(!op){toast('ไม่พบข้อมูลตำแหน่งงาน');return;}
 const existing=state.records.find(r=>r.id===op.id||r.id===op.recordId);
 if(existing){
  toast(`ตำแหน่งนี้มีอยู่ในหน้าแรกแล้ว (${existing.agency})`);
  view='dashboard';
  render();
  const cardEl=$('#main .card');
  if(cardEl)cardEl.scrollIntoView({behavior:'smooth'});
  return;
 }
 const id=op.recordId||op.id||('opening-'+Date.now());
 const newRecord=C.cleanRecord({
  id,
  agency:op.agency,
  position:op.position,
  status:'รอสมัคร',
  rank:null,
  called:null,
  total:null,
  initial:null,
  start:'',
  expiry:'',
  source:op.source||op.officialNotice||'',
  logo:op.logo||C.resolveLogo(op),
  vacancies:op.vacancies||null,
  dates:{
   applicationStart:op.applicationStart?{date:op.applicationStart,basis:'ประกาศรับสมัคร'}:null,
   applicationEnd:op.applicationEnd?{date:op.applicationEnd,basis:'ประกาศรับสมัคร'}:null,
   webPublication:op.publishedAt?{date:op.publishedAt,basis:'ข่าวทางการ'}:null
  },
  note:`เพิ่มจากตำแหน่งเปิดรับ (${op.jobFamily||''} · ${op.level||''}) ${op.highlights||''}`.trim(),
  events:[],
  history:[],
  sources:op.officialNotice?[{title:'ประกาศทางการ',url:op.officialNotice,note:op.highlights||''}]:[]
 });
 const before=state.records;
 state.records=[...before,newRecord];
 try{
  save();
  toast(`เพิ่ม "${op.position}" (${op.agency}) เข้าแผนรอสมัครในหน้าแรกแล้ว ✓`);
  render();
 }catch(err){
  state.records=before;
  toast('บันทึกไม่สำเร็จ: '+err.message);
 }
}

document.addEventListener('click',async e=>{
 const b=e.target.closest('button');
 if(!b)return;
 try{
  if(b.dataset.view){view=b.dataset.view;render();window.scrollTo(0,0)}
  if(b.dataset.action==='openings-shortcut'){view='openings';render();window.scrollTo(0,0)}
  if(b.dataset.trackOpening){trackOpening(b.dataset.trackOpening)}
  if(b.dataset.filterStatus){openingsFilter.status=b.dataset.filterStatus;render()}
  if(b.id==='clear-filters'||b.id==='clear-filters-btn'){
   openingsFilter={query:'',status:'all',education:'all',jobFamily:'all',ocsc:'all',sort:'deadline'};
   render();
  }
  if(b.dataset.detail)detail(b.dataset.detail);
  if(b.dataset.action==='export')download('exam-path-'+C.today()+'.json',JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),records:state.records},null,2));
  if(b.dataset.action==='import')$('#import-file').click();
  if(b.hasAttribute('data-add'))openModal('เพิ่มสนามสอบ',`<form id="add-form" class="form-grid"><label class="full">หน่วยงาน<input name="agency" required maxlength="200"></label><label class="full">ตำแหน่ง<input name="position" required maxlength="200"></label><label>สถานะ<select name="status"><option>รอสมัคร</option><option>รอผลสอบ</option><option>รอสอบภาค ข</option><option>ขึ้นบัญชีแล้ว</option><option>วางแผนสมัคร</option></select></label><label>ลิงก์ทางการ<input type="url" name="source"></label><div class="full"><button class="btn primary">บันทึก</button></div></form>`);
  if(b.dataset.docOpen){await openStoredDocument(b.dataset.docOpen)}
  if(b.dataset.docDelete&&confirm('ลบไฟล์ออกจากเครื่องนี้? การลบนี้ย้อนกลับไม่ได้ โปรดดาวน์โหลดสำรองไว้ก่อน')){await deleteStoredDocument(b.dataset.docDelete);render();toast('ลบไฟล์แล้ว')}
 }catch(err){toast(err.message)}
});

document.addEventListener('input',e=>{
 if(e.target.id==='opening-search'){
  openingsFilter.query=e.target.value;
  render();
  const inp=$('#opening-search');
  if(inp){inp.focus();inp.selectionStart=inp.selectionEnd=inp.value.length}
 }
});

document.addEventListener('change',e=>{
 if(e.target.id==='filter-sort'){openingsFilter.sort=e.target.value;render()}
 if(e.target.id==='filter-edu'){openingsFilter.education=e.target.value;render()}
 if(e.target.id==='filter-family'){openingsFilter.jobFamily=e.target.value;render()}
 if(e.target.id==='filter-ocsc'){openingsFilter.ocsc=e.target.value;render()}
});

document.addEventListener('submit',async e=>{
 const f=e.target;
 if(!['record-form','add-form','doc-form'].includes(f.id))return;
 e.preventDefault();
 try{
  const data=Object.fromEntries(new FormData(f));
  if(f.id==='record-form'){
   const i=state.records.findIndex(r=>r.id===f.dataset.id),old=state.records[i],r=C.cleanRecord({...old,...data,expiry:data.expiry||(data.start?C.expiry(data.start):'')});
   if((r.called||0)!==(C.latest(old)||0)){
    if(r.called<C.latest(old))throw Error('ลำดับล่าสุดต่ำกว่าประวัติเดิม กรุณาตรวจข้อมูล');
    r.calledAt=C.today();
    r.calledBasis='ผู้ใช้ตรวจและบันทึก';
    r.events=[...(old.events||[]),{id:crypto.randomUUID(),kind:'call',date:C.today(),from:r.called,to:r.called,count:null,appointed:null,level:'ข้อมูลที่ผู้ใช้แจ้ง',source:safeURL(data.callSource)==='#'?'':data.callSource,note:'จุดลำดับล่าสุดที่บันทึก ไม่ใช่จำนวนคนเรียกในรอบ วันที่นี้เป็นวันที่รับข้อมูล'}];
   }
   const before=state.records;
   state.records=state.records.map((x,j)=>j===i?r:x);
   try{save()}catch(err){state.records=before;throw err}
   $('#modal').close();
   render();
   toast('บันทึกข้อมูลในเครื่องแล้ว');
  }
  if(f.id==='add-form'){
   const r=C.cleanRecord({...data,id:crypto.randomUUID(),rank:null,called:null,total:null,initial:null,start:'',expiry:'',events:[],history:[],sources:[]});
   const before=state.records;
   state.records=[...before,r];
   try{save()}catch(err){state.records=before;throw err}
   $('#modal').close();
   render();
   toast('เพิ่มสนามแล้ว');
  }
  if(f.id==='doc-form'){
   const file=data.file;
   if(!file||!file.size)throw Error('เลือกไฟล์ก่อน');
   if(file.size>20*1024*1024)throw Error('รองรับไฟล์สูงสุด 20 MB ต่อไฟล์');
   await storeDocument(file,data);
   docs=await listAllDocuments();
   render();
   toast('บันทึกเอกสารแล้ว');
  }
 }catch(err){
  const box=$('#form-error');
  if(box)box.textContent=err.message;
  else toast(err.message);
 }
});

$('#import-file').addEventListener('change',async e=>{
 try{
  const file=e.target.files[0];
  if(!file)return;
  if(file.size>5*1024*1024)throw Error('ไฟล์สำรองใหญ่เกิน 5 MB');
  const data=JSON.parse(await file.text());
  if(!Array.isArray(data.records)||data.records.length>150)throw Error('ไฟล์ต้องมี records ไม่เกิน 150 รายการ');
  const records=data.records.map(r=>C.cleanRecord({...r,called:r.called??C.latest(r)},baseline.find(b=>b.id===r.id)||{}));
  if(new Set(records.map(r=>r.id)).size!==records.length)throw Error('รหัสบัญชีซ้ำ');
  if(!confirm('นำเข้า '+records.length+' สนามแทนรายการบัญชีในเครื่องนี้? เอกสารแนบยังคงอยู่'))return;
  const previous=state;
  state={records,updatedAt:''};
  try{save()}catch(err){state=previous;throw err}
  render();
  toast('นำเข้าข้อมูลแล้ว');
 }catch(err){
  toast('นำเข้าไม่สำเร็จ: '+err.message);
 }finally{
  e.target.value='';
 }
});

$('#close-modal').onclick=()=>$('#modal').close();
$('#refresh').onclick=()=>refreshFeed();

async function init(){
 try{
  const res=await fetch(new URL('data/accounts.json',ASSET_BASE),{cache:'no-store'});
  if(!res.ok)throw Error('อ่านข้อมูลสนามเริ่มต้นไม่ได้');
  baseline=(await res.json()).records.map(r=>C.cleanRecord(r));
  
  // Load openings catalog
  try{
   const oRes=await fetch(new URL('data/openings.json',ASSET_BASE),{cache:'no-store'});
   if(oRes.ok)openingsData=(await oRes.json()).items||[];
  }catch(e){console.warn('Cannot load openings:',e)}

  let saved;
  try{
   const probe=KEY+'-probe';
   localStorage.setItem(probe,'1');
   localStorage.removeItem(probe);
   saved=localStorage.getItem(KEY);
  }catch{storageOK=false}
  if(saved){
   try{
    const parsed=JSON.parse(saved);
    state={...parsed,records:parsed.records.map(r=>C.cleanRecord(r,baseline.find(b=>b.id===r.id)||{})),updatedAt:parsed.updatedAt||''};
   }catch{storageOK=false;toast('ข้อมูลที่เก็บไว้มีปัญหา กรุณานำเข้าไฟล์สำรอง')}
  }
  if(!state.records.length)state.records=baseline.map(r=>({...r}));
  state.records=C.migrate(state.records,baseline);
  try{docs=await dbOp('readonly',s=>s.getAll())}catch{toast('พื้นที่เอกสารไม่พร้อมใช้งาน บัญชียังเปิดได้')}
  try{feed=JSON.parse(localStorage.getItem(KEY+'-feed'))||feed}catch{}
  render();
  await refreshFeed(false);
  await startCloud();
  
  // Refresh feed every 1 hour (3,600,000 ms)
  setInterval(()=>refreshFeed(false),3600000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshFeed(false)});
 }catch(e){
  $('#main').innerHTML='<div class="notice warn">'+esc(e.message)+' กรุณาลองเปิดใหม่</div>';
 }
}

init();
