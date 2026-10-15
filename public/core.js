(function(root){
'use strict';
const monthDays=30.4375;
function day(s){return s?new Date(s+'T00:00:00Z'):null}
function iso(d){return d.toISOString().slice(0,10)}
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function expiry(start){if(!start)return '';const d=day(start);d.setUTCFullYear(d.getUTCFullYear()+2);d.setUTCDate(d.getUTCDate()-1);return iso(d)}
function latest(r){const ev=(r.events||[]).filter(e=>e.kind==='call'&&e.level!=='ข่าวรอตรวจสอบ'&&Number.isInteger(e.to)).map(e=>e.to);return Math.max(r.called||0,...ev)||null}
function plan(r,asOf=today()){
 const called=latest(r),gap=r.rank&&called!=null?Math.max(0,r.rank-called):null;
 const elapsed=r.start?Math.max(0,(day(asOf)-day(r.start))/86400000/monthDays):null,remaining=r.expiry?Math.max(0,(day(r.expiry)-day(asOf))/86400000/monthDays):null;
 const observed=elapsed>=3&&called!=null?Math.max(0,called-(r.initial||0))/elapsed:null;
 const rates=observed==null?[(r.initial||0)/6,(r.initial||0)/3,(r.initial||0)/2]:[observed*.5,observed,observed*1.5];
 const horizon=remaining??24,end=rates.map(rate=>Math.min(r.total||1000000,Math.floor((called||0)+rate*horizon)));
 const group=!r.rank||called==null?'unknown':remaining===0?'unlikely':gap===0||end[1]>=r.rank?'possible':end[2]>=r.rank?'watch':'unlikely';
 return {called,gap,elapsed,remaining,observed,rates,horizon,end,group,progress:r.rank&&called!=null?Math.min(100,called/r.rank*100):null,need:remaining>0&&gap!=null?gap/remaining:null};
}
function cleanRecord(r,baseline={}){
 if(!r||typeof r!=='object'||Array.isArray(r))throw Error('ข้อมูลบัญชีไม่ถูกต้อง');
 const id=String(r.id||'');if(!/^[a-zA-Z0-9-]{1,80}$/.test(id))throw Error('รหัสบัญชีไม่ถูกต้อง');
 const out={...baseline,...r};
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
const api={today,expiry,latest,plan,cleanRecord};if(typeof module!=='undefined')module.exports=api;else root.ExamCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
