const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../public/core.js');
const records=require('../public/data/accounts.json').records;
test('exam stages keep completed, scheduled, and not-yet-applied records separate',()=>{
 assert.equal(C.stage(records.find(r=>r.id==='doe')),'completed');
 assert.equal(C.stage(records.find(r=>r.id==='moj')),'completed');
 assert.equal(C.stage(records.find(r=>r.id==='nia')),'completed');
 assert.equal(C.stage(records.find(r=>r.id==='ombudsman-academic-2569')),'upcoming');
 assert.equal(C.stage(records.find(r=>r.id==='dol-computer-2569')),'archived');
 assert.equal(C.stage({status:'รอสมัคร',dates:{exam:{date:'2025-01-01'}}}),'application');
 assert.equal(C.stage({status:'รอผลสอบ',archived:true}),'archived');
});
test('new official logos replace stale cloud URLs without changing personal exam status',()=>{
 const original={...records.find(r=>r.id==='ombudsman-academic-2569'),logo:'https://old.invalid/logo.png',researchVersion:'old',status:'สอบแล้ว / รอผล',note:'my note'};
 const migrated=C.migrate([original],records).find(r=>r.id===original.id);
 assert.equal(migrated.logo,'assets/ombudsman.png');assert.equal(migrated.status,original.status);assert.equal(migrated.note,'my note');assert(migrated.sourceReview);
});
test('public defaults contain no personal ranks',()=>{assert.equal(records.filter(r=>!r.archived).length,8);assert(records.every(r=>r.rank===null));assert.equal(records.find(r=>r.id==='mhesi').called,15);assert.equal(records.find(r=>r.id==='ddpm-policy-account').called,75)});
test('two-year expiry and rank progress are distinct from probability',()=>{assert.equal(C.expiry('2026-01-30'),'2028-01-29');const r={...records.find(r=>r.id==='msdhs'),rank:187};const p=C.plan(r,'2026-10-05');assert.equal(p.gap,127);assert(Math.abs(p.progress-60/187*100)<1e-9);assert.equal(p.group,'watch');assert.deepEqual(p.end,[108,156,205]);});
test('latest event excludes unverified news and persists across JSON round trip',()=>{const r={...records[0],rank:42,events:[{kind:'call',to:20,level:'ข้อมูลที่ผู้ใช้แจ้ง'},{kind:'call',to:150,level:'ข่าวรอตรวจสอบ'}]};const stored=C.cleanRecord(JSON.parse(JSON.stringify(r)));assert.equal(C.latest(stored),20);assert.equal(C.plan(stored,'2026-10-15').gap,22)});
test('expiry stops projection and sparse evidence uses explicit assumptions',()=>{const r={...records[0],rank:42};const p=C.plan(r,'2029-01-01');assert.equal(p.remaining,0);assert.deepEqual(p.end,[11,11,11]);assert.equal(p.group,'unlikely');assert.equal(C.plan(r,'2026-10-05').observed,null)});
test('bad imports cannot silently corrupt account data',()=>{const r={...records[0],rank:42};assert.throws(()=>C.cleanRecord({...r,rank:162}));assert.throws(()=>C.cleanRecord({...r,start:'2026-02-30'}));assert.throws(()=>C.cleanRecord({...r,called:-1}));assert.throws(()=>C.cleanRecord({...r,expiry:'2025-01-01'}));assert.throws(()=>C.cleanRecord({...r,id:'../bad'}))});

test('migration archives missed exam, preserves personal history, and adds DOL without resetting ranks',()=>{const original={...records[0],rank:42,note:'personal note',events:[{id:'x',kind:'call',to:20,level:'ข้อมูลที่ผู้ใช้แจ้ง'}]};const migrated=C.migrate([original],records);assert.equal(migrated.find(r=>r.id===original.id).rank,42);assert.equal(migrated.find(r=>r.id===original.id).note,'personal note');assert.equal(C.latest(migrated.find(r=>r.id===original.id)),20);assert(migrated.find(r=>r.id==='opsmoac-policy-2569').archived);assert.equal(migrated.find(r=>r.id==='dol-computer-2569').status,'ยกเลิกติดตาม');assert(migrated.find(r=>r.id==='dol-computer-2569').archived);assert.deepEqual(C.migrate(migrated,records),migrated)});
test('cloud merge retains both event histories and explicit pending rank edits',()=>{const c={...records[0],rank:42,events:[{id:'cloud',kind:'call',to:20,level:'ประกาศทางการ'}]},l={...records[0],rank:41,note:'offline change',events:[{id:'local',kind:'call',to:22,level:'ข้อมูลที่ผู้ใช้แจ้ง'}]};const merged=C.mergeRecords([c],[l],[l.id],records).find(r=>r.id===l.id);assert.equal(merged.rank,41);assert.equal(merged.events.length,2);assert.equal(C.latest(merged),22);assert.equal(C.mergeRecords([c],[{...l,rank:null}],[],records).find(r=>r.id===l.id).rank,42)});

test('openings catalog has 29 unique single-position items with 100% valid logo resolution',()=>{
 const openings=require('../public/data/openings.json').items;
 assert.equal(openings.length,29);
 const ids=new Set();
 for(const op of openings){
  assert(op.id&&!ids.has(op.id),'Each opening must have unique id: '+op.id);
  ids.add(op.id);
  assert(op.position&&op.position.length>2,'Must have position title');
  assert(op.agency&&op.agency.length>2,'Must have agency name');
  const logo=C.resolveLogo(op);
  assert(logo&&logo.startsWith('assets/'),'Must resolve to official asset logo: '+op.agency);
 }
});

test('msdhs is promoted to moderate instead of unlikely and campaign links are direct',()=>{
 const msdhs = records.find(r=>r.id==='msdhs');
 assert.equal(msdhs.priorityTier, 'moderate');
 const slowPlan = C.plan({...msdhs, rank: 999}, '2026-10-30');
 assert.equal(slowPlan.group, 'moderate');
 const regularSlow = C.plan({...records.find(r=>r.id==='diprom'), rank: 999}, '2026-10-30');
 assert.equal(regularSlow.group, 'unlikely');

 const doe = records.find(r=>r.id==='doe');
 assert(doe.source.includes('202605'), 'DOE campaign must be direct to May 2569');
 assert(doe.pdfUrl.endsWith('.pdf'), 'DOE must have direct PDF link');
 assert(doe.hrSource.includes('doe.go.th'), 'DOE must have HR division source');

 const nia = records.find(r=>r.id==='nia');
 assert(nia.source.includes('202603'), 'NIA campaign must be direct to March 2569');
 assert(nia.pdfUrl.endsWith('.pdf'), 'NIA must have direct PDF link');
 assert(nia.hrSource.includes('nia.go.th'), 'NIA must have HR division source');

 const moj = records.find(r=>r.id==='moj');
 assert.equal(moj.targetDate, '2026-11-06');
 assert(moj.pdfUrl.endsWith('.pdf'));

 const cleaned = C.cleanRecord({
  id: 'test',
  agency: 'Test Agency',
  position: 'Test Pos',
  seatNo: '67010023',
  targetDate: '2026-10-31',
  targetNote: 'ประกาศผลภายในเดือนตุลาคม',
  pdfUrl: 'https://example.com/test.pdf',
  hrSource: 'https://example.com/hr'
 });
 assert.equal(cleaned.seatNo, '67010023');
 assert.equal(cleaned.targetDate, '2026-10-31');
 assert.equal(cleaned.targetNote, 'ประกาศผลภายในเดือนตุลาคม');
 assert.equal(cleaned.pdfUrl, 'https://example.com/test.pdf');
 assert.equal(cleaned.hrSource, 'https://example.com/hr');
});
