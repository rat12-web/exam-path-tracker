import json,sys,unittest
from pathlib import Path
from urllib.error import HTTPError,URLError
from email.message import Message
from datetime import datetime,timezone,timedelta
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from notify_line import plan,baseline,push,fingerprint,check_daily_digest,TZ_BANGKOK

class NotifyLine(unittest.TestCase):
 def setUp(self):
  self.record={'id':'a','agency':'Agency','position':'นักวิชาการปฏิบัติการ','source':'https://example.thaijobjob.com/202606/index.php','called':5}
  self.item={'id':'n','agencyId':'a','title':'ประกาศกำหนดวันสอบ นักวิชาการปฏิบัติการ','url':self.record['source'],'document':'news.pdf','evidence':'official-page','firstSeen':'2026-10-16'}
  self.feed={'sources':[{'id':'a','status':'ok'}],'items':[self.item]}
 def test_baseline_does_not_flood_historical_news(self):
  events,_,_=plan(self.feed,[self.record],baseline(self.feed,[self.record]));self.assertEqual(events,[])
 def test_new_announcement_requires_review_and_same_campaign(self):
  events,_,_=plan(self.feed,[self.record],{});self.assertEqual(len(events),1);self.assertIn('ยังไม่ยืนยันลำดับเรียกใหม่',events[0]['text'])
  self.item['url']='https://example.thaijobjob.com/202501/index.php';self.assertEqual(plan(self.feed,[self.record],{})[0],[])
 def test_archived_exams_search_leads_and_navigation_do_not_alert(self):
  self.assertEqual(plan(self.feed,[{**self.record,'archived':True}],{})[0],[])
  self.item['evidence']='search-index-lead';self.assertEqual(plan(self.feed,[self.record],{})[0],[])
  self.item.update(evidence='official-page',document='',title='หน้ารวมประกาศ');self.assertEqual(plan(self.feed,[self.record],{})[0],[])
 def test_failed_source_retains_unseen_item_until_recovery(self):
  self.feed['sources'][0]['status']='error';events,seen,_=plan(self.feed,[self.record],{});self.assertEqual(events,[]);self.assertNotIn('n',seen)
 def test_rank_change_and_title_change_alert_once(self):
  state=baseline(self.feed,[self.record]);self.record['called']=7
  events,_,_=plan(self.feed,[self.record],state);self.assertEqual(len(events),1);self.assertIn('จาก 5 เป็น 7',events[0]['text'])
  state['called']['a']=7;self.item['title']+=' ฉบับแก้ไข';self.assertEqual(len(plan(self.feed,[self.record],state)[0]),1)
 def test_daily_digest_at_09_and_18(self):
  dt_09=datetime(2026,10,21,9,15,tzinfo=TZ_BANGKOK)
  text,key,digests=check_daily_digest([self.record],{},now=dt_09)
  self.assertIsNotNone(text)
  self.assertEqual(key,'digest:2026-10-21_09:00')
  self.assertIn('Agency',text)
  self.assertIn('09:00 น.',text)
  # Duplicate check
  text_dup,key_dup,_=check_daily_digest([self.record],{'digests':digests},now=dt_09)
  self.assertIsNone(text_dup)
  # 18:00 check
  dt_18=datetime(2026,10,21,18,5,tzinfo=TZ_BANGKOK)
  text_18,key_18,digests_18=check_daily_digest([self.record],{'digests':digests},now=dt_18)
  self.assertIsNotNone(text_18)
  self.assertEqual(key_18,'digest:2026-10-21_18:00')
  # Non-slot hour (14:00)
  dt_14=datetime(2026,10,21,14,30,tzinfo=TZ_BANGKOK)
  text_14,_,_=check_daily_digest([self.record],{},now=dt_14)
  self.assertIsNone(text_14)
 def test_retry_uses_same_key_and_does_not_log_credentials(self):
  calls=[]
  class Success:
   status=200
   def __enter__(self):return self
   def __exit__(self,*args):pass
  def transport(req,timeout):
   calls.append(req)
   if len(calls)==1:raise URLError('temporary')
   return Success()
  push('private-token','U'+'a'*32,'news','event-1',opener=transport,sleep=lambda _:None)
  self.assertEqual(len(calls),2);self.assertEqual(calls[0].get_header('X-line-retry-key'),calls[1].get_header('X-line-retry-key'))
  self.assertEqual(json.loads(calls[0].data)['to'],'U'+'a'*32)
 def test_accepted_retry_is_success_but_invalid_token_is_not(self):
  headers=Message();headers['x-line-accepted-request-id']='accepted'
  def accepted(req,timeout):raise HTTPError(req.full_url,409,'Conflict',headers,None)
  push('token','U'+'a'*32,'news','event',opener=accepted)
  def rejected(req,timeout):raise HTTPError(req.full_url,401,'private body with credentials',Message(),None)
  with self.assertRaisesRegex(RuntimeError,'HTTP 401'):push('token','U'+'a'*32,'news','event',opener=rejected)

if __name__=='__main__':unittest.main()