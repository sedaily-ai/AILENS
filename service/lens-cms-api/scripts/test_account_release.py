"""배포 선행 검사·메타데이터 잘못된 입력과 SQL 실패 시 중단 계약."""
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch
sys.path.insert(0, str(Path(__file__).resolve().parent))
import account_schema
import content_metadata_supply as supply


class AccountReleaseTests(unittest.TestCase):
    def test_files_are_all_ordered(self):
        self.assertEqual([p.name.split('_')[2] for p in account_schema.files()], [f'v1.{v}' for v in range(48,58)])

    def test_history_clear_checks_legacy_reading_delete_privilege(self):
        self.assertIn('DELETE', account_schema.ACCOUNT_TABLES['user_readings'].split(','))

    def test_missing_env_does_not_connect(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(account_schema.psycopg2, 'connect') as connect:
            with self.assertRaises(RuntimeError): account_schema.connection()
        connect.assert_not_called()

    def test_backup_required_before_connect(self):
        with patch.object(account_schema, 'connection') as connect:
            with self.assertRaises(RuntimeError): account_schema.apply(None)
        connect.assert_not_called()

    def test_sql_failure_stops_and_unlocks(self):
        conn=MagicMock();cur=conn.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.side_effect=[('migration_role',160000),(True,)]
        def execute(sql):
            if 'CREATE TABLE IF NOT EXISTS user_content_views' in sql:
                raise RuntimeError('fixture SQL fail')
        cur.execute.side_effect=execute
        with patch.object(account_schema, 'baseline'), patch.object(account_schema, 'connection', return_value=conn), patch.object(account_schema.subprocess, 'run'), patch.dict(os.environ, {'LENS_PG_USER':'lens_service_app','PGHOST':'fixture','LENS_PG_HOST':'fixture','PGDATABASE':'fixture','LENS_PG_DATABASE':'fixture'}):
            with self.assertRaises(RuntimeError): account_schema.apply(Path(__file__))
        statements=[c.args[0] for c in cur.execute.call_args_list]
        self.assertIn('ROLLBACK',statements)
        self.assertEqual(statements[-1],'SELECT pg_advisory_unlock(1448055)')
        self.assertFalse(any('duration_seconds' in s for s in statements))

    def test_bad_baseline_stops_before_first_ddl(self):
        with patch.object(account_schema,'connection') as connection, patch.object(account_schema,'baseline',side_effect=RuntimeError('missing baseline')), patch.object(account_schema.subprocess,'run'), patch.dict(os.environ,{'PGHOST':'fixture','LENS_PG_HOST':'fixture','PGDATABASE':'fixture','LENS_PG_DATABASE':'fixture'}):
            with self.assertRaises(RuntimeError):account_schema.apply(Path(__file__))
        self.assertEqual(connection.call_args_list,[unittest.mock.call(app=True)])

    def test_approval_is_explicit_and_no_self_links(self):
        for link in ({'target_content_key':'publication:2'}, {'target_content_key':'publication:1','editor_approved':True}):
            with self.assertRaises(ValueError): supply.validate({'content_key':'publication:1','followups':[link]})

    def test_media_rejects_iframe_and_guessed_duration(self):
        for url,duration in (('https://example.test/embed',10),('https://example.test/movie.mp4',float('nan')),('https://example.test/movie.mp4',True)):
            with self.assertRaises(ValueError): supply.validate({'content_key':'publication:1','media':[{'asset_id':1,'file_url':url,'duration_seconds':duration}]})

    def test_editor_cannot_be_inferred_for_publication(self):
        with self.assertRaises(ValueError): supply.validate({'content_key':'publication:1','editor_slugs':['editor']})
        self.assertEqual(supply.validate({'content_key':'issue_letter:1','reward_group_key':None,'editor_slugs':[]})['reward_group_key'],None)


if __name__ == '__main__': unittest.main()
