(function(root){
'use strict';
const monthDays=30.4375;
function day(s){return s?new Date(s+'T00:00:00Z'):null}
function iso(d){return d.toISOString().slice(0,10)}
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function expiry(start){if(!start)return '';const d=day(start);d.setUTCFullYear(d.getUTCFullYear()+2);d.setUTCDate(d.getUTCDate()-1);return iso(d)}
function latest(r){const ev=(r.events||[]).filter(e=>e.kind==='call'&&e.level!=='ข่าวรอตรวจสอบ'&&Number.isInteger(e.to)).map(e=>e.to);return Math.max(r.called||0,...ev)||null}
function stage(r){
 if(r.archived)return 'archived';
 if(latest(r)!=null)return 'account';
 if(/รอสมัคร|วางแผนสมัคร/.test(r.status||''))return 'application';
 if(/รอผล|สอบแล้ว/.test(r.status||''))return 'completed';
 return 'upcoming';
}
function plan(r,asOf=today()){
 const called=latest(r),gap=r.rank&&called!=null?Math.max(0,r.rank-called):null;
 const elapsed=r.start?Math.max(0,(day(asOf)-day(r.start))/86400000/monthDays):null,remaining=r.expiry?Math.max(0,(day(r.expiry)-day(asOf))/86400000/monthDays):null;
 const observed=elapsed>=3&&called!=null?Math.max(0,called-(r.initial||0))/elapsed:null;
 const rates=observed==null?[(r.initial||0)/6,(r.initial||0)/3,(r.initial||0)/2]:[observed*.5,observed,observed*1.5];
 const horizon=remaining??24,end=rates.map(rate=>Math.min(r.total||1000000,Math.floor((called||0)+rate*horizon)));
 let group=!r.rank||called==null?'unknown':remaining===0?'unlikely':gap===0||end[1]>=r.rank?'possible':end[2]>=r.rank?'watch':'unlikely';
 if(group==='unlikely'&&(r.id==='msdhs'||r.priorityTier==='moderate'||/นักพัฒนาสังคม/.test(r.position||''))){group='moderate';}
 return {called,gap,elapsed,remaining,observed,rates,horizon,end,group,progress:r.rank&&called!=null?Math.min(100,called/r.rank*100):null,need:remaining>0&&gap!=null?gap/remaining:null};
}
const OFFICIAL_LOGOS=[
 ['ombudsman','assets/ombudsman.png'],
 ['ผู้ตรวจการแผ่นดิน','assets/ombudsman.png'],
 ['diprom','assets/diprom.webp'],
 ['อุตสาหกรรม','assets/diprom.webp'],
 ['msdhs','assets/msdhs.webp'],
 ['พัฒนาสังคม','assets/msdhs.webp'],
 ['nia','assets/nia.webp'],
 ['ข่าวกรอง','assets/nia.webp'],
 ['mhesi','assets/mhesi.webp'],
 ['อุดมศึกษา','assets/mhesi.webp'],
 ['doe','assets/doe.webp'],
 ['จัดหางาน','assets/doe.webp'],
 ['moj','assets/moj.webp'],
 ['ยุติธรรม','assets/moj.webp'],
 ['opsmoac','assets/opsmoac.webp'],
 ['เกษตร','assets/opsmoac.webp'],
 ['ddpm','assets/ddpm.webp'],
 ['บรรเทาสาธารณภัย','assets/ddpm.webp'],
 ['dol','assets/dol.webp'],
 ['ที่ดิน','assets/dol.webp'],
 ['drr','assets/drr.webp'],
 ['ทางหลวงชนบท','assets/drr.webp'],
 ['dmh','assets/dmh.webp'],
 ['สุขภาพจิต','assets/dmh.webp'],
 ['ddc','assets/ddc.webp'],
 ['ควบคุมโรค','assets/ddc.webp'],
 ['mdes','assets/mdes.webp'],
 ['ดิจิทัล','assets/mdes.webp'],
 ['obec','assets/obec.webp'],
 ['การศึกษาขั้นพื้นฐาน','assets/obec.webp'],
 ['สพฐ','assets/obec.webp'],
 ['oncb','assets/oncb.webp'],
 ['ป.ป.ส.','assets/oncb.webp'],
 ['cgd','assets/cgd.webp'],
 ['บัญชีกลาง','assets/cgd.webp'],
 ['sao','assets/sao.webp'],
 ['สตง','assets/sao.webp'],
 ['ตรวจเงินแผ่นดิน','assets/sao.webp'],
 ['ocsc','assets/ocsc.webp'],
 ['ก.พ.','assets/ocsc.webp'],
 ['doh','assets/doh.webp'],
 ['ทางหลวง','assets/doh.webp'],
 ['dopa','assets/dopa.webp'],
 ['การปกครอง','assets/dopa.webp'],
 ['dla','assets/dla.webp'],
 ['ปกครองท้องถิ่น','assets/dla.webp']
];
function resolveLogo(r){
 if(r && r.logo && r.logo.startsWith('assets/')) return r.logo;
 const text=(String(r?.agency||'')+' '+String(r?.id||'')+' '+String(r?.source||'')).toLowerCase();
 for(const [k,logo] of OFFICIAL_LOGOS){if(text.includes(k.toLowerCase()))return logo}
 return r?.logo||'';
}
function cleanRecord(r,baseline={}){
 if(!r||typeof r!=='object'||Array.isArray(r))throw Error('ข้อมูลบัญชีไม่ถูกต้อง');
 const id=String(r.id||'');if(!/^[a-zA-Z0-9-]{1,80}$/.test(id))throw Error('รหัสบัญชีไม่ถูกต้อง');
 const out={...baseline,...r};
 out.logo=resolveLogo(out);
 for(const k of ['rank','total','initial','called']){out[k]=out[k]===''||out[k]==null?null:Number(out[k]);if(out[k]!=null&&(!Number.isInteger(out[k])||out[k]<0||out[k]>1000000))throw Error('ตัวเลขบัญชีไม่ถูกต้อง');}
 if(out.rank===0||out.total===0)throw Error('ลำดับและจำนวนบัญชีต้องมากกว่า 0');
 if(out.rank&&out.total&&out.rank>out.total)throw Error('ลำดับเกินจำนวนผู้ขึ้นบัญชี');
 for(const k of ['start','expiry','calledAt']){if(out[k]&&(!/^\d{4}-\d{2}-\d{2}$/.test(out[k])||!Number.isFinite(day(out[k]).getTime())||iso(day(out[k]))!==out[k]))throw Error('วันที่ไม่ถูกต้อง');}
 if(out.start&&out.expiry&&out.expiry<out.start)throw Error('วันหมดอายุก่อนวันขึ้นบัญชี');
 if(out.called&&out.total&&out.called>out.total)throw Error('ลำดับเรียกเกินจำนวนบัญชี');
 out.events=Array.isArray(out.events)?out.events:[];out.history=Array.isArray(out.history)?out.history:[];
 out.agency=String(out.agency||'').slice(0,200);out.position=String(out.position||'').slice(0,200);out.note=String(out.note||'').slice(0,4000);
 if(!out.agency||!out.position)throw Error('กรอกชื่อหน่วยงานและตำแหน่ง');
 if(JSON.stringify(out).length>100000)throw Error('ข้อมูลบัญชียาวเกินกำหนด');return out;
}

function uniqueRows(a=[],b=[]){const map=new Map();for(const row of [...a,...b]){if(!row||typeof row!=='object')continue;const key=row.id||JSON.stringify(row);map.set(key,{...(map.get(key)||{}),...row})}return [...map.values()]}
function mergeRecords(cloud,local,pending=[],defaults=[]){
 const dirty=new Set(pending),map=new Map(cloud.map(r=>[r.id,{...r}]));
 for(const r of local){const c=map.get(r.id);if(!c){map.set(r.id,{...r});continue}
 const merged=dirty.has(r.id)?{...c,...r}:{...r,...c};
 // Missing baseline values never erase a saved personal rank or notes.
 merged.rank=dirty.has(r.id)?r.rank:(c.rank??r.rank??null);
 merged.note=dirty.has(r.id)?r.note:(c.note||r.note||'');
 merged.events=uniqueRows(r.events,c.events);merged.history=uniqueRows(r.history,c.history);merged.milestones=uniqueRows(r.milestones,c.milestones);
 merged.called=Math.max(latest(c)||0,latest(r)||0)||null;
 map.set(r.id,merged);
 }
 return migrate([...map.values()],defaults);
}
function migrate(records,defaults){
 const map=new Map(records.map(r=>[r.id,r]));
 for(const b of defaults){const r=map.get(b.id);if(!r){map.set(b.id,cleanRecord({...b}));continue}
 const copy={...b,...r,source:r.source||b.source||'',logo:r.logo||b.logo||'',sources:uniqueRows(r.sources,b.sources)};
 if(b.researchVersion&&r.researchVersion!==b.researchVersion){
  copy.dates={...(r.dates||{}),...(b.dates||{})};copy.rounds=uniqueRows(r.rounds,b.rounds);copy.researchVersion=b.researchVersion;
  copy.sources=uniqueRows(r.sources,b.sources);copy.researchSummary=b.researchSummary||r.researchSummary;
  copy.logo=b.logo||resolveLogo(copy);
  copy.checkedAt=b.checkedAt||r.checkedAt;
  if(b.sourceReview)copy.sourceReview=b.sourceReview;
 }
 copy.called=Math.max(latest(r)||0,b.called||0)||null;
 if(!copy.start&&b.start)copy.start=b.start;if(!copy.expiry&&copy.start)copy.expiry=expiry(copy.start);
 map.set(b.id,cleanRecord(copy));
 }
 const withdrawn=map.get('opsmoac-policy-2569');if(withdrawn)map.set(withdrawn.id,{...withdrawn,status:'ถอนตัว',archived:true,archiveReason:'ไม่ได้ไปสอบ · นำออกตามคำขอ 15 ต.ค. 2569'});
 const dol=map.get('dol-computer-2569');if(dol)map.set(dol.id,{...dol,status:'ยกเลิกติดตาม',archived:true,notify:false,archiveReason:'ลบออกจากที่สนใจตามคำขอ'});
 const mh=map.get('mhesi');if(mh)mh.notify=false;
 const dd=map.get('ddpm-policy-account');if(dd)dd.notify=false;
 return [...map.values()];
}
const api={today,expiry,latest,plan,stage,cleanRecord,uniqueRows,mergeRecords,migrate,resolveLogo,OFFICIAL_LOGOS};
if(typeof module!=='undefined')module.exports=api;else root.ExamCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
