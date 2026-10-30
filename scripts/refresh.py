"""Read public announcement pages. Never infer appointment ranks from text."""
from __future__ import annotations
import hashlib,json,re,sys,concurrent.futures,os
from datetime import datetime,timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.parse import urljoin,urlparse,unquote,urlencode
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
KEYWORDS=re.compile(r'ขึ้นบัญชี|เรียก|รายชื่อ|ผลการ|สอบ|บรรจุ|กำหนด|สมัคร|นักทรัพยากร|นักพัฒนา|นักวิชาการ|รายงานตัว|ความคืบหน้า|ขอใช้บัญชี')
class Node:
 def __init__(self,tag='',attrs=(),parent=None):self.tag=tag;self.attrs=dict(attrs);self.parent=parent;self.children=[]
 def text(self):return ''.join(c if isinstance(c,str) else c.text() for c in self.children)
class Document(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.root=Node('root');self.stack=[self.root];self.anchors=[];self.frames=[]
 def handle_starttag(self,tag,attrs):
  node=Node(tag,attrs,self.stack[-1]);self.stack[-1].children.append(node)
  if tag=='a':self.anchors.append(node)
  if tag in ('frame','iframe'):self.frames.append(node)
  if tag not in ('area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'):self.stack.append(node)
 def handle_endtag(self,tag):
  for i in range(len(self.stack)-1,0,-1):
   if self.stack[i].tag==tag:self.stack=self.stack[:i];break
 def handle_data(self,data):
  if self.stack[-1].tag not in ('script','style'):self.stack[-1].children.append(data)
def compact(s):return re.sub(r'\s+',' ',s).strip()
def extract(body,source):
 doc=Document();doc.feed(body);items=[];seen=set();base=source['source']
 for a in doc.anchors:
  href=a.attrs.get('href','').strip()
  if not href or href.startswith(('#','javascript:','mailto:','tel:')):continue
  absolute=urljoin(base,href);p=urlparse(absolute)
  if p.scheme!='https' or not p.hostname:continue
  title=compact(a.text())
  is_doc=bool(re.search(r'\.(pdf|docx?)(?:[?#]|$)',href,re.I))
  if is_doc or len(title)<20:
   parent=a.parent
   for _ in range(3):
    if parent is None:break
    text=compact(parent.text())
    if 25<=len(text)<=1000:title=text;break
    parent=parent.parent
  if len(title)<10 or not KEYWORDS.search(title):continue
  if not is_doc and (re.search(r'category|table-list|list-label|module/view',absolute,re.I) or 'ติดต่อสอบถาม' in title or 'เกี่ยวกับกรม' in title):continue
  if not is_doc and not (re.search(r'ประกาศ|รายชื่อ|สอบ|ขึ้นบัญชี|เรียก|บรรจุ|สมัคร',title) and re.search(r'news|announce|content|view|article|2569|2026',absolute,re.I)):continue
  if len(title)>700:continue
  item_id=hashlib.sha256((source['id']+'|'+absolute).encode()).hexdigest()[:20]
  if item_id in seen:continue
  seen.add(item_id)
  destination=base if 'thaijobjob.com' in p.hostname and is_doc else absolute
  published='';match=re.search(r'news_(\d{1,2})-(\d{1,2})-(25\d{2})',unquote(href))
  if match:
   d,m,y=map(int,match.groups())
   try:published=f'{y-543:04d}-{m:02d}-{d:02d}';datetime.fromisoformat(published)
   except ValueError:published=''
  items.append({'id':item_id,'agencyId':source['id'],'agency':source['agency'],'title':title[:500],'url':destination,'document':unquote(p.path.rsplit('/',1)[-1]) if is_doc else '', 'published':published,'evidence':'official-page','reviewRequired':True})
 return items[:60]
def read_page(url):
 req=Request(url,headers={'User-Agent':'ExamPathTracker/2.0 (public government announcement reader)','Accept':'text/html,application/xhtml+xml'})
 try:
  if os.environ.get('SITE_MONITOR_ACCESS') and urlparse(url).hostname.endswith('.thaijobjob.com'):raise ValueError('Use verified Site network for this source')
  with urlopen(req,timeout=12) as response:
   raw=response.read(3_000_001)
   if len(raw)>3_000_000:raise ValueError('หน้าเว็บใหญ่เกินขอบเขตที่ตรวจ')
   if 'html' not in response.headers.get('Content-Type',''):raise ValueError('ต้นทางไม่ได้ส่งหน้า HTML')
   return raw.decode(response.headers.get_content_charset() or 'utf-8',errors='replace')
 except Exception:
  endpoint=os.environ.get('SITE_MONITOR_URL','')
  access=os.environ.get('SITE_MONITOR_ACCESS','')
  if not endpoint or not access:raise
  relay=Request(endpoint+'?'+urlencode({'url':url}),headers={'OAI-Sites-Authorization':'Bearer '+access,'Accept':'application/json'})
  with urlopen(relay,timeout=25) as response:result=json.loads(response.read(4_000_000))
  if result.get('url')!=url or not isinstance(result.get('html'),str):raise ValueError('ต้นทางสำรองส่งข้อมูลไม่ตรง URL')
  return result['html']
def discover(source):
 if source.get('monitorSources'):
  items=[]
  source_host=urlparse(source['source']).hostname or ''
  official_domain=OFFICIAL_DOMAINS.get(source['id'],'')
  for target in source['monitorSources']:
   target_host=urlparse(target).hostname or ''
   is_valid=(target_host==source_host or (official_domain and (target_host==official_domain or target_host.endswith('.'+official_domain))) or target_host.endswith('.go.th'))
   if not is_valid:raise ValueError('แหล่งติดตามต้องเป็นหน่วยงานเดียวกัน')
   items.extend(extract(read_page(target),{**source,'source':target}))
  return list({item['id']:item for item in items}.values())[:100]
 body=read_page(source['source']);items=extract(body,source)
 if items:return items
 doc=Document();doc.feed(body)
 for frame in doc.frames[:1]:
  frame_url=urljoin(source['source'],frame.attrs.get('src',''))
  if urlparse(frame_url).hostname!=urlparse(source['source']).hostname:continue
  landing=read_page(frame_url);landing_source={**source,'source':frame_url};landing_doc=Document();landing_doc.feed(landing)
  links=[]
  for anchor in landing_doc.anchors:
   target=urljoin(frame_url,anchor.attrs.get('href',''))
   if urlparse(target).hostname==urlparse(frame_url).hostname and re.search(r'/20\d{4,6}/index\.php',target) and target not in links:links.append(target)
  failures=[]
  for target in links[:4]:
   try:items.extend(extract(read_page(target),{**source,'source':target}))
   except Exception as error:failures.append(str(error))
  if items:return list({item['id']:item for item in items}.values())[:100]
 return items

OFFICIAL_DOMAINS={
 'diprom':'dip.go.th',
 'msdhs':'hrm.m-society.go.th',
 'nia':'nia.go.th',
 'doe':'doe.go.th',
 'moj':'moj.go.th',
 'opsmoac-policy-2569':'opsmoac.go.th',
 'ombudsman-academic-2569':'ombudsman.go.th',
 'ddpm-policy-account':'disaster.go.th',
 'dol-computer-2569':'dol.go.th',
 'mhesi':'ops.go.th',
 'mdes':'mdes.go.th',
 'obec':'obec.go.th',
 'cgd':'cgd.go.th',
 'oncb':'oncb.go.th',
 'dmh':'dmh.go.th',
 'ddc':'ddc.moph.go.th',
 'drr':'drr.go.th',
 'sao':'audit.go.th',
 'dopa':'dopa.go.th',
 'doh':'doh.go.th',
 'dla':'dla.go.th',
 'ocsc':'ocsc.go.th'
}

def index_leads(source):
 domain=OFFICIAL_DOMAINS.get(source['id'])
 if not domain:return []
 position=source['position'].replace('ปฏิบัติการ','').replace('ปฏิบัติงาน','')
 query=f'site:{domain} "{position}" ("ขึ้นบัญชี" OR "รายชื่อ" OR "เรียก" OR "สอบ" OR "บรรจุ" OR "รายงานตัว")'
 url='https://www.bing.com/search?'+urlencode({'q':query,'format':'rss'})
 req=Request(url,headers={'User-Agent':'ExamPathTracker/1.0 (public government search-index leads)'})
 with urlopen(req,timeout=18) as response:raw=response.read(2_000_001)
 if len(raw)>2_000_000:raise ValueError('ผลค้นใหญ่เกินขอบเขต')
 doc=ET.fromstring(raw);items=[]
 for item in doc.findall('.//item')[:30]:
  title=compact(item.findtext('title') or '');link=(item.findtext('link') or '').strip();host=urlparse(link).hostname or ''
  description=compact(item.findtext('description') or '')
  if urlparse(link).scheme!='https' or not (host==domain or host.endswith('.'+domain)):continue
  if position not in title+' '+description:continue
  if not KEYWORDS.search(title+' '+description):continue
  item_id=hashlib.sha256((source['id']+'|'+link).encode()).hexdigest()[:20]
  items.append({'id':item_id,'agencyId':source['id'],'agency':source['agency'],'title':title[:500],'url':link,'document':'','published':'','evidence':'search-index-lead','reviewRequired':True})
 return items

def fetch(source,now,previous):
 url=source['source'];old=next((s for s in previous.get('sources',[]) if s['id']==source['id']),{})
 status={'id':source['id'],'agency':source['agency'],'url':url,'checkedAt':now,'status':'error','lastSuccess':old.get('lastSuccess','')}
 try:
  items=discover(source)
  if not items:raise ValueError('เข้าถึงหน้าเว็บได้ แต่ยังอ่านรายการประกาศไม่ได้ อาจเปลี่ยนรูปแบบหรือแสดงด้วยสคริปต์')
  status.update(status='ok',lastSuccess=now,message=f'อ่านรายการประกาศได้ {len(items)} รายการ ยังต้องตรวจตำแหน่งและปีบัญชี')
  return status,items
 except Exception as error:
  status['message']=str(error).split('\n')[0][:180]
  try:
   leads=index_leads(source)
   if leads:
    status.update(status='index',message='ต้นทางเข้าถึงไม่ได้ พบผลค้นสำรอง '+str(len(leads))+' รายการ ต้องเปิดต้นฉบับตรวจอีกครั้ง; '+status['message'],indexCheckedAt=now)
    return status,leads
  except Exception as index_error:status['message']+='; ดัชนีสำรอง: '+str(index_error)[:80]
  return status,[]

def refresh():
 now=datetime.now(timezone.utc).isoformat();destination=ROOT/'public/data/announcements.json'
 try:previous=json.loads(destination.read_text(encoding='utf-8-sig'))
 except (OSError,ValueError):previous={'sources':[],'items':[]}
 sources=json.loads((ROOT/'public/data/accounts.json').read_text(encoding='utf-8-sig'))['records']
 sources=[r for r in sources if not r.get('archived')]
 waiting_only='--waiting-only' in sys.argv or os.environ.get('REFRESH_WAITING_ONLY')=='true'
 if waiting_only:
  waiting_keywords=re.compile(r'รอผล|รอสอบ|รอกำหนด')
  sources=[r for r in sources if r.get('status') in ('รอผลสอบ','รอสอบภาค ข','รอกำหนดการ','รอสอบ') or waiting_keywords.search(r.get('status','')) or r.get('called') is None]
 old_items={i['id']:i for i in previous.get('items',[])};statuses=[];found=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
  futures=[pool.submit(fetch,s,now,previous) for s in sources]
  for future in futures:
   status,items=future.result();statuses.append(status)
   for item in items:
    old=old_items.get(item['id'],{});item['firstSeen']=old.get('firstSeen',now);item['lastSeen']=now
    item['changedAt']=now if old and old.get('title')!=item['title'] else old.get('changedAt','')
    found.append(item)
   if status['status']!='ok':print('::warning::'+status['agency']+': '+status['message'])
   print(status['id'],status['status'],len(items))
 found_ids={i['id'] for i in found}
 retained=[i for i in previous.get('items',[]) if i['id'] not in found_ids]
 all_items=found+retained
 all_items.sort(key=lambda i:(i.get('published',''),i.get('firstSeen','')),reverse=True)
 prev_source_map={s['id']:s for s in previous.get('sources',[])}
 for st in statuses:prev_source_map[st['id']]=st
 merged_statuses=list(prev_source_map.values())
 result={'schemaVersion':1,'checkedAt':now,'schedule':'every 10 minutes (waiting agencies)' if waiting_only else 'every 1 hour','sources':merged_statuses,'items':all_items[:400],'rankUpdates':[],'note':'Automatic announcement discovery only. Appointment ranks require human verification.'}
 destination.parent.mkdir(parents=True,exist_ok=True);temp=destination.with_suffix('.tmp');temp.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(destination)
 ok=sum(s['status']=='ok' for s in statuses)
 print(f'Checked {len(statuses)} sources; {ok} readable; {len(found)} announcements. No personal records modified.')
 if summary:=__import__('os').environ.get('GITHUB_STEP_SUMMARY'):
  with open(summary,'a',encoding='utf-8') as f:
   f.write(f'## Announcement refresh\n\nChecked at {now}: {ok}/{len(statuses)} sources readable; {len(found)} announcements.\n\nNo appointment ranks were inferred. Failed sources are shown on the website.\n')
 return result

if __name__=='__main__':refresh()
