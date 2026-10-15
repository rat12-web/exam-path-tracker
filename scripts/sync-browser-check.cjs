const {chromium}=require('playwright'),http=require('http'),fs=require('fs/promises'),path=require('path'),assert=require('assert/strict');
(async()=>{
 const root=path.resolve('public'),base=(await fs.readFile('public/data/accounts.json','utf8')).replace(/^\uFEFF/,'');let records=JSON.parse(base).records.map(r=>({...r,rank:r.id==='diprom'?31:r.id==='mhesi'?350:r.id==='ddpm-policy-account'?3000:r.rank,note:r.id==='diprom'?'saved cloud note':r.note})),revision=7,forceConflict=false;
 let documents=[{id:'existing-cloud-document',recordId:'diprom',name:'existing.txt',size:5,mimeType:'text/plain',uploadedAt:'2026-10-15T00:00:00Z'}];let pageOrigin,siteOrigin;
 function reply(res,status,value,type='application/json'){res.writeHead(status,{'content-type':type});res.end(type==='application/json'&&typeof value!=='string'&&!Buffer.isBuffer(value)?JSON.stringify(value):value)}
 async function body(req){let s='';for await(const chunk of req)s+=chunk;return JSON.parse(s)}
 const siteServer=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/api/records'){if(req.method==='GET')return reply(res,200,{records,revision});const b=await body(req);if(forceConflict){forceConflict=false;revision++;records=records.map(r=>r.id==='mhesi'?{...r,note:'changed in another window'}:r);return reply(res,409,{error:'conflict'})}if(b.revision!==revision)return reply(res,409,{error:'conflict'});records=b.records;revision++;return reply(res,200,{records,revision})}
  if(u.pathname==='/api/documents'){if(req.method==='GET')return reply(res,200,documents);const b=await body(req);const d={id:'new-cloud-document',name:b.name,recordId:b.recordId,size:Buffer.from(b.base64,'base64').length,mimeType:b.mimeType,uploadedAt:new Date().toISOString()};documents.push(d);return reply(res,200,d)}
  if(u.pathname.endsWith('/file'))return reply(res,200,'proof','text/plain');
  let file=u.pathname.endsWith('sync-bridge.html')?'sync-bridge.html':u.pathname.endsWith('sync-bridge.js')?'sync-bridge.js':u.pathname==='/'?'index.html':u.pathname.slice(1);
  const filename=path.resolve(root,file);if(!filename.startsWith(root+path.sep))throw Error();let data=await fs.readFile(filename);const ext=path.extname(filename);
  if(['.js','.html'].includes(ext)){let text=data.toString();if(file==='sync-bridge.js')text=text.replace('https://rat12-web.github.io',pageOrigin);if(file==='cloud-sync.js')text=text.replace('https://exam-path-personal-2026-r.rat-creative1.chatgpt.site',siteOrigin);data=text}
  reply(res,200,data,ext==='.js'?'text/javascript':ext==='.html'?'text/html':ext==='.css'?'text/css':ext==='.json'?'application/json':'image/png');
 }catch(e){reply(res,404,{error:e.message})}});
 await new Promise(r=>siteServer.listen(0,'127.0.0.1',r));siteOrigin='http://127.0.0.1:'+siteServer.address().port;
 const pageServer=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))throw Error();let data=await fs.readFile(file);const ext=path.extname(file);if(file.endsWith('cloud-sync.js'))data=data.toString().replace('https://exam-path-personal-2026-r.rat-creative1.chatgpt.site',siteOrigin);reply(res,200,data,ext==='.js'?'text/javascript':ext==='.html'?'text/html':ext==='.css'?'text/css':ext==='.json'?'application/json':'image/png')}catch{reply(res,404,{},'application/json')}});
 await new Promise(r=>pageServer.listen(0,'127.0.0.1',r));pageOrigin='http://127.0.0.1:'+pageServer.address().port;
 const browser=await chromium.launch({headless:true});try{
 const ctx=await browser.newContext(),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(pageOrigin);
 await page.getByText('☁ ใช้ข้อมูลชุดเดียวกับ ChatGPT Site',{exact:true}).waitFor();const card=page.locator('.card').filter({hasText:'กรมส่งเสริมอุตสาหกรรม'});await page.waitForFunction(()=>document.querySelector('.card')?.textContent.includes('31'));
 assert.match(await card.innerText(),/31/);assert.equal(await page.locator('.card').filter({hasText:'สำนักงานปลัดกระทรวงเกษตรและสหกรณ์'}).count(),0);assert.equal(await page.locator('.card').filter({hasText:'กรมที่ดิน'}).count(),1);
 assert.equal(await page.locator('.low-priority').count(),1);assert(await page.locator('.low-priority').evaluate(el=>el.nextElementSibling===null),'low chance must be last section');
 await card.getByRole('button',{name:'รายละเอียด / แก้ไข'}).click();assert.equal(await page.locator('textarea[name="note"]').inputValue(),'saved cloud note');await page.locator('[name="rank"]').fill('32');forceConflict=true;await page.locator('#record-form button').click();await page.locator('#modal').waitFor({state:'hidden'});
 for(let i=0;i<100&&records.find(r=>r.id==='diprom').rank!==32;i++)await new Promise(r=>setTimeout(r,100));assert.equal(records.find(r=>r.id==='diprom').rank,32);assert.equal(records.find(r=>r.id==='mhesi').note,'changed in another window');
 await page.getByRole('button',{name:'▧ เอกสารของฉัน',exact:true}).click();await page.getByRole('heading',{name:'existing.txt',exact:true}).waitFor();await page.locator('input[name="file"]').setInputFiles({name:'new-proof.txt',mimeType:'text/plain',buffer:Buffer.from('upload')});await page.getByRole('button',{name:'บันทึกเอกสาร',exact:true}).click();await page.getByRole('heading',{name:'new-proof.txt',exact:true}).waitFor();assert.equal(documents.length,2);
 const second=await ctx.newPage();await second.goto(siteOrigin);await second.waitForFunction(()=>document.querySelector('.card')?.textContent.includes('32'));assert.match(await second.locator('.card').filter({hasText:'กรมส่งเสริมอุตสาหกรรม'}).innerText(),/32/);
 assert.deepEqual(errors,[]);console.log('Cloud sync browser checks passed: existing ranks/docs load automatically, two origins share changes, conflict retry preserves other edits, low chance last, missed exam archived, DOL added.');
 }finally{await browser.close();await new Promise(r=>siteServer.close(r));await new Promise(r=>pageServer.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});

