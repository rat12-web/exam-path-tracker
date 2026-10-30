"""Send public tracker changes and daily digests to configured personal LINE account.

Secrets come only from runner environment variables. No broadcast or webhook.
"""
from __future__ import annotations
import hashlib,json,os,re,sys,time,uuid
from datetime import datetime,timezone,timedelta
from pathlib import Path
from urllib.error import HTTPError,URLError
from urllib.request import Request,urlopen

ROOT=Path(__file__).resolve().parents[1]
PAGE='https://rat12-web.github.io/exam-path-tracker/'
API='https://api.line.me/v2/bot/message/push'
STATE=Path(os.environ.get('LINE_STATE_PATH',str(ROOT/'.line-notification-state.json')))
IMPORTANT=re.compile(r'ขึ้นบัญชี|ยกเลิกบัญชี|เรียก|รายงานตัว|บรรจุ|กำหนด|เลื่อน|ความคืบหน้า|รายชื่อ|ผลการ')
CALLING_PATTERN=re.compile(r'เรียก(บรรจุ|ตัว|รายงานตัว|เพิ่มเติม)|รายงานตัว|บรรจุและแต่งตั้ง|หนังสือเรียกตัว|เรียกผู้สอบแข่งขันได้')
TZ_BANGKOK=timezone(timedelta(hours=7))

def digest(value):
 return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True).encode()).hexdigest()

def fingerprint(item):
 return digest([item.get(k,'') for k in ('title','url','document','published')])

def relevant(item,record,source_ok):
 if record.get('archived') or not source_ok or item.get('evidence')!='official-page':return False
 title=item.get('title','')
 if not IMPORTANT.search(title) or not item.get('document') and not re.search(r'/\d{4,}[-/]',item.get('url','')):return False
 source=record['source']
 # Root portals cover several recruitment years. Restrict LINE to the active campaign.
 if '.thaijobjob.com/' in source:
  reviewed=record.get('sourceReview',{}).get('url',source)
  campaign=source if not source.endswith('.com/') else reviewed if reviewed!=source else next(iter(record.get('monitorSources',[])),source)
  if item.get('url')!=campaign:return False
 position=re.sub(r'ปฏิบัติการ|ปฏิบัติงาน','',record.get('position',''))
 return bool(position and position in title or re.search(r'ขึ้นบัญชี|เรียก|รายงานตัว|กำหนด|เลื่อน|ความคืบหน้า|รายชื่อผู้สอบแข่งขันได้',title))

def plan(feed,records,state):
 active={r['id']:r for r in records if not r.get('archived')}
 healthy={s['id'] for s in feed.get('sources',[]) if s.get('status')=='ok'}
 seen=dict(state.get('seen',{}));called=dict(state.get('called',{}));events=[]
 for item in sorted(feed.get('items',[]),key=lambda i:(i.get('firstSeen',''),i.get('id',''))):
  id=item.get('id');record=active.get(item.get('agencyId'))
  if not id or not record:continue
  if record['id'] not in healthy:continue
  value=fingerprint(item)
  if seen.get(id)==value:continue
  if relevant(item,record,record['id'] in healthy):
   is_calling = bool(CALLING_PATTERN.search(item.get('title','')))
   header = '🚨 พบประกาศเรียกตัว / รายงานตัว!' if is_calling else '📢 อัปเดตประกาศใหม่'
   clean_title = re.sub(r'^คลิกที่นี่เพื่ออ่าน\s*', '', item.get('title',''))[:280]
   text = (f'{header}\n{record["agency"]}\n{clean_title}\n'
    + (f'เอกสาร: {item["document"]}\n' if item.get('document') else '')
    + 'รอตรวจตำแหน่งและปีบัญชี ยังไม่ยืนยันลำดับเรียกใหม่\n'
    + f'{item["url"]}\nดูบัญชี: {PAGE}')
   events.append({'key':'news:'+id+':'+value,'text':text,'seen':{id:value}})
  else:seen[id]=value
 for id,record in active.items():
  current=record.get('called')
  if current is not None and id in called and current!=called[id]:
   text=('ลำดับติดตามมีการปรับปรุง\n'+record['agency']+'\nจาก '+str(called[id])+' เป็น '+str(current)
    +'\nที่มา: '+record.get('calledBasis','ข้อมูลที่บันทึก')+'\nโปรดตรวจหลักฐาน ไม่ใช่จำนวนบรรจุจริง\n'+PAGE)
   events.append({'key':'rank:'+id+':'+str(called[id])+':'+str(current),'text':text,'called':{id:current}})
  elif id not in called:called[id]=current
 return events,seen,called

def check_daily_digest(records,state,now=None,feed=None):
 """Compile daily digest at 09:00 and 18:00 Bangkok time for important dashboard records."""
 if now is None:now=datetime.now(TZ_BANGKOK)
 today_str=now.strftime('%Y-%m-%d');thai_date_str=now.strftime('%d/%m/%Y');current_hour=now.hour
 digests=dict(state.get('digests',{}))
 force=os.environ.get('LINE_FORCE_DIGEST')=='true'
 slot=None
 if current_hour==9 or (force and current_hour<14):slot='09:00'
 elif current_hour==18 or (force and current_hour>=14):slot='18:00'
 if not slot and not force:return None,None,digests
 if not slot:slot=f'{current_hour:02d}:00'
 digest_key=f'{today_str}_{slot}'
 if digest_key in digests and not force:return None,None,digests
 active=[r for r in records if not r.get('archived')]
 lines=[
  f'📋 สรุปสถานะบัญชีหน้าแรก ({slot} น.)',
  f'🗓️ วันที่ {thai_date_str} (ติดตาม {len(active)} หน่วยงาน)',
  '─────────────────'
 ]
 calling_found = []
 if feed and isinstance(feed.get('items'), list):
  for item in feed['items']:
   if CALLING_PATTERN.search(item.get('title','')):
    calling_found.append(item)
 if calling_found:
  lines.append('🚨 ประกาศเรียกตัว / รายงานตัวล่าสุด:')
  for c in calling_found[:3]:
   clean_t=re.sub(r'^คลิกที่นี่เพื่ออ่าน\s*','',c.get('title',''))[:60]
   lines.append(f"   • {c.get('agency','')}: {clean_t}...")
  lines.append('─────────────────')
 else:
  lines.append('✓ รายงาน: ยังไม่พบประกาศเรียกตัวใหม่')
  lines.append('─────────────────')

 for idx,r in enumerate(active,1):
  agency=r.get('agency','หน่วยงาน')
  pos=r.get('position','')
  called=r.get('called')
  status=r.get('status','รอเรียก')
  target_note=r.get('targetNote')
  target_date=r.get('targetDate')
  if called is not None:
   status_line=f'เรียกถึง: ลำดับที่ {called} | สถานะ: {status}'
  elif target_date:
   try:
    cd_diff=(datetime.strptime(target_date, '%Y-%m-%d').date() - now.date()).days
    cd_str=f'อีก {cd_diff} วัน' if cd_diff > 0 else 'ถึงกำหนดแล้ว' if cd_diff == 0 else 'เลยกำหนด'
   except Exception:
    cd_str='รอประกาศ'
   status_line=f'เป้าหมาย: {target_note or target_date} ({cd_str})'
  elif target_note:
   status_line=f'เป้าหมาย: {target_note}'
  else:
   status_line=f'สถานะ: {status}'

  lines.append(f'{idx}. {agency}')
  lines.append(f'   • {pos}')
  lines.append(f'   • {status_line}')

 lines.extend(['─────────────────',f'🌐 ดูรายละเอียดทั้งหมด: {PAGE}'])
 digests[digest_key]=datetime.now(timezone.utc).isoformat()
 return '\n'.join(lines),'digest:'+digest_key,digests

def push(token,recipient,text,event_key,opener=urlopen,sleep=time.sleep):
 retry=str(uuid.uuid5(uuid.NAMESPACE_URL,recipient+'|'+event_key))
 body=json.dumps({'to':recipient,'messages':[{'type':'text','text':text}],'notificationDisabled':False},ensure_ascii=False).encode()
 for attempt in range(3):
  request=Request(API,data=body,method='POST',headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','X-Line-Retry-Key':retry})
  try:
   with opener(request,timeout=20) as response:
    if response.status!=200:raise RuntimeError('LINE ตอบสถานะที่ไม่คาดหมาย')
   return
  except HTTPError as error:
   if error.code==409 and error.headers.get('x-line-accepted-request-id'):return
   if error.code<500:raise RuntimeError('LINE ปฏิเสธคำขอ (HTTP '+str(error.code)+') ตรวจ token, ผู้รับ และโควตาใน LINE Developers') from None
  except (URLError,TimeoutError,OSError):pass
  if attempt<2:sleep(2**attempt)
 raise RuntimeError('ยังยืนยันการส่ง LINE ไม่ได้ จะลองใหม่ด้วย retry key เดิม')

def save(state,path=STATE):
 state['updatedAt']=datetime.now(timezone.utc).isoformat()
 path.parent.mkdir(parents=True,exist_ok=True)
 temp=path.with_suffix('.tmp');temp.write_text(json.dumps(state,ensure_ascii=False),encoding='utf8');temp.replace(path)

def verify_bot(token,expected):
 if not expected:return
 request=Request('https://api.line.me/v2/bot/info',headers={'Authorization':'Bearer '+token})
 try:
  with urlopen(request,timeout=20) as response:info=json.loads(response.read(100000))
 except Exception:raise RuntimeError('ยังยืนยัน LINE OA เดิมไม่ได้ ตรวจ token และการเชื่อมต่อ') from None
 print('ชื่อ OA ในการเชื่อมต่อเดิม: '+str(info.get('displayName',''))[:100])
 normalize=lambda s:''.join(c for c in str(s).casefold() if c.isalnum())
 if normalize(info.get('displayName'))!=normalize(expected):raise RuntimeError('ชื่อ LINE OA ไม่ตรงกับ '+expected+' จึงยังไม่ส่งข้อความ')
 print('ยืนยัน LINE OA: '+expected)

def baseline(feed,records):
 return {'seen':{i['id']:fingerprint(i) for i in feed.get('items',[]) if i.get('id')},'called':{r['id']:r.get('called') for r in records if not r.get('archived')},'digests':{}}

def summary(message):
 print(message)
 if path:=os.environ.get('GITHUB_STEP_SUMMARY'):
  with open(path,'a',encoding='utf8') as f:f.write('## LINE OA\n\n'+message+'\n')

def main():
 feed=json.loads((ROOT/'public/data/announcements.json').read_text(encoding='utf-8-sig'))
 records=json.loads((ROOT/'public/data/accounts.json').read_text(encoding='utf-8-sig'))['records']
 excluded=set(filter(None,os.environ.get('LINE_EXCLUDE_AGENCIES','').split(',')))
 records=[r for r in records if r['id'] not in excluded]
 try:state=json.loads(STATE.read_text(encoding='utf8'))
 except FileNotFoundError:state={}
 token=os.environ.get('LINE_CHANNEL_ACCESS_TOKEN','').strip();recipient=os.environ.get('LINE_RECIPIENT_ID','').strip()
 if not token or not recipient:
  if not state.get('connected'):save({**baseline(feed,records),'connected':False})
  summary('ยังไม่เชื่อม LINE: เพิ่ม LINE_CHANNEL_ACCESS_TOKEN และ LINE_RECIPIENT_ID ใน GitHub Actions secrets; ยังไม่มีการส่งข้อความ')
  return
 if not re.fullmatch(r'U[0-9a-fA-F]{32}',recipient):raise RuntimeError('LINE_RECIPIENT_ID ต้องเป็น Your user ID สำหรับแชตส่วนตัว รูปแบบ U ตามด้วยเลขฐานสิบหก 32 ตัว')
 if '\n' in token or '\r' in token:raise RuntimeError('Channel access token มีอักขระขึ้นบรรทัดใหม่')
 recipient_hash=digest(recipient)
 if not state.get('connected') or state.get('recipientHash')!=recipient_hash:
  verify_bot(token,os.environ.get('LINE_EXPECTED_BOT_NAME',''))
  push(token,recipient,'เชื่อมแจ้งเตือนเว็บเส้นทางบรรจุแล้ว\nใช้ LINE OA เดิม '+os.environ.get('LINE_EXPECTED_BOT_NAME','')+'\nแจ้งเตือนสรุปประจำวันทุก 09.00 และ 18.00 น.\nและแจ้งทันทีเมื่อมีประกาศใหม่หรือข้อมูลเปลี่ยนแปลง\n'+PAGE,'connected:'+recipient_hash)
  save({**baseline(feed,records),'connected':True,'recipientHash':recipient_hash})
  summary('LINE รับคำขอส่งข้อความยืนยันการเชื่อมแล้ว; ตั้งข้อมูลปัจจุบันเป็นฐาน ไม่ส่งข่าวเก่าย้อนหลัง')
  return
 if os.environ.get('LINE_SEND_TEST')=='true':
  verify_bot(token,os.environ.get('LINE_EXPECTED_BOT_NAME',''))
  push(token,recipient,'ทดสอบแจ้งเตือนเส้นทางบรรจุ\nระบบส่งผ่าน LINE OA เข้าแชตส่วนตัว\n'+PAGE,'test:'+os.environ.get('GITHUB_RUN_ID','manual'))

 # 1. Daily digest at 09:00 and 18:00
 digest_text,digest_key,new_digests=check_daily_digest(records,state,feed=feed)
 if digest_text:
  verify_bot(token,os.environ.get('LINE_EXPECTED_BOT_NAME',''))
  push(token,recipient,digest_text,digest_key)
  state['digests']=new_digests
  save(state)
  summary(f'LINE ส่งสรุปสถานะประจำวัน ({digest_key}) เรียบร้อย')

 # 2. Event-driven immediate updates (announcements or rank changes)
 events,seen,called=plan(feed,records,state)
 state.update(seen=seen,called=called);save(state)
 for event in events[:8]:
  push(token,recipient,event['text'],event['key'])
  state['seen'].update(event.get('seen',{}));state['called'].update(event.get('called',{}));save(state)
 if events:
  summary('LINE รับคำขอแจ้งเตือน '+str(min(8,len(events)))+' รายการ'+(' · ที่เหลือจะส่งในรอบถัดไป' if len(events)>8 else ''))
 else:
  summary('ไม่มีประกาศใหม่หรือการเปลี่ยนแปลงลำดับในรอบนี้')

if __name__=='__main__':
 try:main()
 except Exception as error:
  message=str(error) if isinstance(error,RuntimeError) else 'อ่านข้อมูลแจ้งเตือนไม่สำเร็จ ประวัติเดิมยังเก็บไว้'
  summary(message);sys.exit(1)