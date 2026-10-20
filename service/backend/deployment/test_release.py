"""AWS 대신 메모리 상태 사용: 신규 생성, 재실행, 권한 실패, 패키지 누락 검증."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import account_gateway as gateway
import package

spec = importlib.util.spec_from_file_location('cms_package', HERE.parents[1] / 'lens-cms-api/scripts/package_release.py')
cms_package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cms_package)


class FakeAWS:
    def __init__(self, dashboard=True):
        env = {key: 'test-value' for key in ('LENS_CMS_API_URL', 'LENS_CMS_API_TOKEN', 'COGNITO_REGION', 'COGNITO_USER_POOL_ID', 'COGNITO_APP_CLIENT_ID')}
        cfg = {'Runtime': 'python3.11', 'Role': 'arn:aws:iam::test:role/existing', 'Environment': {'Variables': env}}
        self.configs = {gateway.R['ACCOUNT_ARCHIVE_FUNCTION']: cfg.copy()}
        if dashboard:
            self.configs[gateway.R['ACCOUNT_DASHBOARD_FUNCTION']] = {**cfg,'Handler':'handlers.user.dashboard.lambda_handler'}
        self.routes = [{'RouteId': 'old', 'RouteKey': 'GET /api/archive', 'Target': 'integrations/wrong'}]
        self.integrations = []
        self.policies = {}
        self.calls = []

    def __call__(self, service, operation, **params):
        self.calls.append((operation, params))
        if operation == 'get-caller-identity': return {'Account': gateway.R['AWS_ACCOUNT_ID']}
        if operation == 'get-api': return {'ProtocolType': 'HTTP', 'CorsConfiguration': {'AllowOrigins': ['https://existing.example']}}
        if operation == 'get-stage': return {'AutoDeploy': True}
        if operation == 'get-function-configuration': return self.configs.get(params['function_name'])
        if operation == 'get-routes': return {'Items': self.routes}
        if operation == 'get-integrations': return {'Items': self.integrations}
        if operation == 'get-policy':
            return {'Policy': json.dumps({'Statement': self.policies[params['function_name']]})} if params['function_name'] in self.policies else None
        if operation == 'create-function':
            self.configs[params['function_name']] = {**self.configs[gateway.R['ACCOUNT_ARCHIVE_FUNCTION']],'Handler':params['handler']}
            return {}
        if operation == 'list-tags': return {'Tags': {'Service': 'lens'}}
        if operation == 'create-integration':
            item = {'IntegrationId': str(len(self.integrations)), 'IntegrationUri': params['integration_uri'], 'PayloadFormatVersion': '2.0'}
            self.integrations.append(item)
            return item
        if operation == 'add-permission':
            self.policies[params['function_name']] = [{'Sid': params['statement_id'], 'Action':'lambda:InvokeFunction', 'Principal':{'Service':'apigateway.amazonaws.com'}, 'Condition': {'ArnLike': {'AWS:SourceArn': params['source_arn']}}}]
            return {}
        if operation == 'create-route':
            self.routes.append({'RouteId': str(len(self.routes)), 'RouteKey': params['route_key'], 'Target': params['target']})
            return {}
        if operation == 'update-route':
            next(r for r in self.routes if r['RouteId'] == params['route_id'])['Target'] = params['target']
            return {}
        if operation == 'update-api': return {}
        raise AssertionError(operation)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'ACCOUNT_RELEASE_BACKUP_DIR': '/tmp/lens-release-test'})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_package_contains_dashboard_without_worker_or_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            stage = Path(directory)
            package.copy_sources(stage)
            # 알림 워커는 2026-10-20 기능 다이어트로 제거했다.
            self.assertFalse((stage / 'notification_worker.py').exists())
            self.assertFalse((stage / 'services/user/notifications.py').exists())
            self.assertTrue((stage / 'handlers/user/dashboard.py').is_file())
            self.assertFalse((stage / '-.py').exists())
            self.assertFalse(any(p.name.startswith('.env') or p.name == 'tests' for p in stage.rglob('*')))

    def test_cms_contains_ordered_sql_without_worker_no_ecosystem_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'cms.tar.gz'
            cms_package.build(output)
            with tarfile.open(output) as bundle:
                names = bundle.getnames()
                self.assertEqual(bundle.getmember('main.py').mode,0o644)
                self.assertEqual(bundle.getmember('migrations').mode,0o755)
            self.assertEqual(len([n for n in names if n.startswith('migrations/lens_schema_')]), 10)  # v1.48~57
            # 알림 워커 소스·유닛과 워커 전용 CMS 모듈은 더 담지 않는다(2026-10-20 기능 다이어트).
            self.assertFalse(any(n.startswith('notification-worker') for n in names))
            for name in ('notification_inputs.py','notification_delivery_repo.py','notifications_repo.py','notification_policy.py','push_provider.py','completion_repo.py'):
                self.assertNotIn(name, names)
            self.assertIn('routes_dashboard.py', names)
            self.assertNotIn('ecosystem.config.js', names)
            self.assertFalse(any('.env' in n or '__pycache__' in n for n in names))

    def test_preflight_no_writes(self):
        fake = FakeAWS()
        with patch.object(gateway, 'aws', fake): gateway.preflight()
        self.assertFalse(any(op.startswith(('create-', 'update-', 'add-')) for op, _ in fake.calls))

    def test_wrong_runtime_stops_before_writes(self):
        fake = FakeAWS()
        fake.configs[gateway.R['ACCOUNT_ARCHIVE_FUNCTION']]['Runtime'] = 'python3.12'
        with patch.object(gateway, 'aws', fake), self.assertRaises(RuntimeError): gateway.apply()
        self.assertFalse(any(op.startswith(('create-', 'update-', 'add-')) for op, _ in fake.calls))

    def test_missing_environment_stops(self):
        fake = FakeAWS()
        fake.configs[gateway.R['ACCOUNT_ARCHIVE_FUNCTION']]['Environment']['Variables'].pop('LENS_CMS_API_TOKEN')
        with patch.object(gateway, 'aws', fake), self.assertRaises(RuntimeError): gateway.preflight()

    def test_second_function_permission_conflict_stops_before_any_write(self):
        fake=FakeAWS()
        fake.policies[gateway.R['ACCOUNT_DASHBOARD_FUNCTION']]=[{'Sid':'lens-account-http-api','Condition':{}}]
        with patch.object(gateway,'aws',fake),self.assertRaises(RuntimeError):gateway.apply()
        self.assertFalse(any(op.startswith(('create-','update-','add-')) for op,_ in fake.calls))

    def test_create_and_rerun_no_duplicate_function(self):
        fake = FakeAWS(dashboard=False)
        with patch.object(gateway, 'aws', fake), patch.object(gateway, 'snapshot'), patch.object(gateway.subprocess, 'run'):
            gateway.ensure(); gateway.ensure()
        creates = [p for op, p in fake.calls if op == 'create-function']
        self.assertEqual(len(creates), 1)
        self.assertEqual(creates[0]['tags']['Service'], 'lens')

    def test_routes_reapply_no_duplicate_and_existing_exact_route_updated(self):
        fake = FakeAWS()
        with patch.object(gateway, 'aws', fake):
            gateway.apply(); gateway.apply()
        self.assertEqual(len(fake.integrations), 2)
        self.assertEqual(len(fake.routes), 4)
        self.assertNotEqual(fake.routes[0]['Target'], 'integrations/wrong')
        cors = [p['cors_configuration'] for op, p in fake.calls if op == 'update-api'][-1]
        self.assertIn('https://existing.example', cors['AllowOrigins'])
        self.assertIn('PUT', cors['AllowMethods'])
        self.assertIn('authorization', cors['AllowHeaders'])

    def test_permission_failure_stops_before_routes(self):
        fake = FakeAWS()
        def aws(service, operation, **params):
            if operation == 'get-policy': raise RuntimeError('denied')
            return fake(service, operation, **params)
        with patch.object(gateway, 'aws', aws), self.assertRaises(RuntimeError): gateway.apply()
        self.assertFalse(any(op in ('create-route', 'update-route') for op, _ in fake.calls))


    def test_smoke_missing_private_cache_stops(self):
        import account_smoke
        with patch.object(account_smoke,'request',return_value=(401,{},b'{}')):
            with self.assertRaises(RuntimeError):account_smoke.smoke('https://example.test','fixture')

    def test_smoke_requires_authenticated_success_and_cors(self):
        import account_smoke
        def request(base,path,method='GET',token=None):
            if method=='OPTIONS':return 204,{'Access-Control-Allow-Origin':'https://ailens.sedaily.ai','Access-Control-Allow-Methods':'GET,PUT','Access-Control-Allow-Headers':'authorization,content-type'},b''
            body={'revision':1,'interests':[]} if path.endswith('/preferences') else {'scope':'account','schema_version':1,'format_preference':{'status':'unavailable'},'notifications':{'status':'unavailable'},**{key:{'status':'ready'} for key in ('preferences','saved_letters')}} if path.endswith('/dashboard') else {'sentences':[]}
            return (200 if token else 401),{'Cache-Control':'private, no-store'},json.dumps(body).encode()
        with patch.object(account_smoke,'request',side_effect=request):account_smoke.smoke('https://example.test','fixture')

    def test_rollback_restores_old_routes_and_code_from_snapshot(self):
        fake=FakeAWS()
        cfg=fake.configs[gateway.R['ACCOUNT_ARCHIVE_FUNCTION']]
        cfg['Handler']='handlers.archive_handler.lambda_handler'
        before={'api':{'CorsConfiguration':{'AllowOrigins':['https://existing.example']}},'archive':cfg,'dashboard':None,'routes':{'Items':[{'RouteKey':'GET /api/archive','Target':'integrations/original','AuthorizationType':'NONE'}]}}
        with tempfile.TemporaryDirectory(prefix='lens-rollback-',dir='/tmp') as directory:
            folder=Path(directory)
            (folder/'before.json').write_text(json.dumps(before))
            (folder/f"{gateway.R['ACCOUNT_ARCHIVE_FUNCTION']}.zip").write_bytes(b'fake backup')
            with patch.object(gateway,'aws',fake):gateway.apply()
            def aws(service,operation,**params):
                if operation in ('delete-route','update-function-code','update-function-configuration'):
                    fake.calls.append((operation,params));return {}
                return fake(service,operation,**params)
            with patch.dict(os.environ,{'ACCOUNT_RELEASE_BACKUP_DIR':directory}),patch.object(gateway,'aws',aws),patch.object(gateway.subprocess,'run'):
                gateway.rollback()
        self.assertEqual(fake.routes[0]['Target'],'integrations/original')
        self.assertEqual(len([1 for op,_ in fake.calls if op=='delete-route']),3)
        self.assertEqual([p['handler'] for op,p in fake.calls if op=='update-function-configuration'],['handlers.archive_handler.lambda_handler'])


if __name__ == '__main__': unittest.main()
