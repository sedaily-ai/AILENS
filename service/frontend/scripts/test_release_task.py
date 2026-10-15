import copy
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).parent))
from release_task import prepare


class ReleaseTaskTests(unittest.TestCase):
    def test_restoration_pins_original_digest_and_removes_read_only_fields(self):
        original={'family':'frontend','taskDefinitionArn':'previous','revision':42,'containerDefinitions':[{'name':'frontend','image':'repo:latest','environment':[{'name':'NODE_ENV','value':'production'}]}]}
        result=prepare(copy.deepcopy(original),'repo','sha256:'+'a'*64)
        self.assertEqual(result['containerDefinitions'][0]['image'],'repo@sha256:'+'a'*64)
        self.assertEqual(result['containerDefinitions'][0]['environment'],original['containerDefinitions'][0]['environment'])
        self.assertNotIn('revision',result)
        self.assertNotIn('taskDefinitionArn',result)
        self.assertEqual(original['containerDefinitions'][0]['image'],'repo:latest')

    def test_missing_digest_stops(self):
        with self.assertRaises(ValueError):prepare({},'repo','None')


if __name__=='__main__':unittest.main()
