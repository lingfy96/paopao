import sys,unittest,tempfile,os
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'../backend'))
import app
class ApiTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();app.DB=self.tmp.name+'/movies.db';self.client=app.app.test_client()
 def tearDown(self):self.tmp.cleanup()
 def test_catalog(self):self.assertEqual(len(self.client.get('/api/movies').json),100)
 def test_recommend(self):
  r=self.client.post('/api/recommend',json={'mode':'mood','mood':'有点 emo','profile':{'tags':['治愈'],'blacklist':['马特·达蒙']}});self.assertEqual(r.status_code,200);self.assertNotIn('马特·达蒙',r.json['movie']['actors']);self.assertEqual(r.json['source'],'local')
 def test_empty(self):self.assertEqual(self.client.post('/api/recommend',json={'mode':'random','text':'1分钟以内'}).status_code,422)
 def test_random(self):self.assertEqual(self.client.get('/api/movies/random?blacklist=恐怖').status_code,200)
 def test_bad_input(self):self.assertEqual(self.client.post('/api/recommend',json={'mode':'mood','profile':{'tags':'wrong'}}).status_code,400)
