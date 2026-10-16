const { chromium }=require('playwright');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve('public');const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png'};
 const server=http.createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))throw Error();const data=await fs.readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(data)}catch{res.writeHead(404);res.end('Not found')}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:1366,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('.card').nth(8).waitFor();await fs.mkdir('reports',{recursive:true});await page.screenshot({path:'reports/public-preview.png'});assert.equal(await page.locator('.card').count(),9);assert.equal(await page.locator('.card').filter({hasText:'กรมที่ดิน'}).count(),1);assert.equal(await page.locator('.card').filter({hasText:'สำนักงานปลัดกระทรวงเกษตรและสหกรณ์'}).count(),0);
 assert.equal(await page.locator('[data-stage="completed"] .card').count(),3);assert.equal(await page.locator('[data-stage="upcoming"] .card').count(),1);assert.equal(await page.locator('[data-stage="application"] .card').count(),1);
 for(const agency of ['กรมที่ดิน','สำนักงานผู้ตรวจการแผ่นดิน']){const img=page.locator('.card').filter({hasText:agency}).locator('img.logo');await img.scrollIntoViewIfNeeded();await page.waitForFunction(name=>{const img=[...document.querySelectorAll('img.logo')].find(i=>i.alt.includes(name));return img?.complete&&img.naturalWidth>0},agency);assert.equal(await img.isVisible(),true)}
 const dip=page.locator('.card').filter({hasText:'กรมส่งเสริมอุตสาหกรรม'});await dip.getByRole('button',{name:'รายละเอียด / แก้ไข'}).click();
 await page.locator('[name="rank"]').fill('30');await page.locator('[name="called"]').fill('20');await page.locator('#record-form button[type="submit"],#record-form button').click();await page.locator('#modal').waitFor({state:'hidden'});
 await page.reload();await page.locator('.card').nth(8).waitFor();assert.match(await page.locator('.card').filter({hasText:'กรมส่งเสริมอุตสาหกรรม'}).innerText(),/66\.7%/);
 await page.getByRole('button',{name:'▧ เอกสารของฉัน',exact:true}).click();await page.locator('input[name="file"]').setInputFiles({name:'smoke-proof.txt',mimeType:'text/plain',buffer:Buffer.from('Local document persistence test')});await page.getByRole('button',{name:'บันทึกเอกสาร',exact:true}).click();await page.getByRole('heading',{name:'smoke-proof.txt'}).waitFor();
 await page.reload();await page.locator('.card').nth(8).waitFor();await page.getByRole('button',{name:'▧ เอกสารของฉัน',exact:true}).click();await page.getByRole('heading',{name:'smoke-proof.txt'}).waitFor();
 await page.getByRole('button',{name:'⌕ ประกาศและอัปเดต',exact:true}).click();await page.getByRole('heading',{name:'สถานะต้นทาง',exact:true}).waitFor();assert.equal(await page.locator('.source-status .panel').count(),9);
 await page.getByRole('button',{name:'▦ ภาพรวมบัญชี',exact:true}).click();await page.getByRole('heading',{name:'ภาพรวมเส้นทางบรรจุ',exact:true}).waitFor();
 await fs.mkdir('reports',{recursive:true});await page.screenshot({path:'reports/desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'mobile must not overflow horizontally');await page.screenshot({path:'reports/mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('Browser checks passed: nine agencies, saved rank/call survives reload, local file survives reload, source status, mobile layout.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
