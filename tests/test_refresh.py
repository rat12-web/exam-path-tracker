import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from refresh import extract
class Parsing(unittest.TestCase):
 def setUp(self):self.source={'id':'ddpm','agency':'ปภ.','source':'https://ddpm.thaijobjob.com/202605/index.php'}
 def test_relative_pdf_keeps_stable_portal_and_document_identity(self):
  rows=extract('<p><a href="news/x/news_10-08-2569_01.pdf">คลิกที่นี่เพื่ออ่าน</a> ประกาศเรียกรายงานตัวนักวิเคราะห์นโยบายและแผน</p>',self.source)
  self.assertEqual(len(rows),1);self.assertEqual(rows[0]['url'],self.source['source']);self.assertEqual(rows[0]['published'],'2026-08-10');self.assertTrue(rows[0]['reviewRequired']);self.assertNotIn('rank',rows[0])
 def test_navigation_and_javascript_not_announcements(self):
  self.assertEqual(extract('<a href="javascript:alert(1)">ประกาศสอบ</a><a href="/home">หน้าแรก</a>',self.source),[])
 def test_duplicate_documents_count_once(self):
  html='<p><a href="x.pdf">ประกาศรายชื่อผู้สอบแข่งขันได้ตำแหน่งนักพัฒนาสังคม</a></p>'
  self.assertEqual(len(extract(html+html,self.source)),1)
if __name__=='__main__':unittest.main()
