import unittest
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from refresh import check_schedule_transition

class RefreshScheduleTransitionTest(unittest.TestCase):
 def test_schedule_transition_after_nov_6(self):
  with tempfile.NamedTemporaryFile(mode='w+', delete=False, suffix='.yml') as f:
   f.write("name: Test\non:\n  schedule:\n    - cron: '*/10 1-13 * * 1-5'\n    - cron: '0 14 * * 1-5'\n  workflow_dispatch:\n")
   f_path = f.name
  try:
   tz_bkk = timezone(timedelta(hours=7))
   before = datetime(2026, 11, 6, 23, 59, tzinfo=tz_bkk)
   res_before = check_schedule_transition(now_dt=before, wf_path=f_path, auto_commit=False)
   self.assertFalse(res_before)
   self.assertIn("*/10 1-13", Path(f_path).read_text(encoding='utf-8'))

   after = datetime(2026, 11, 7, 0, 1, tzinfo=tz_bkk)
   res_after = check_schedule_transition(now_dt=after, wf_path=f_path, auto_commit=False)
   self.assertTrue(res_after)
   content_after = Path(f_path).read_text(encoding='utf-8')
   self.assertNotIn("*/10 1-13", content_after)
   self.assertIn("0 1,5,9,13 * * *", content_after)
  finally:
   Path(f_path).unlink(missing_ok=True)

if __name__ == '__main__':
 unittest.main()
