"""계정 HTTP API 준비. AWS 호출은 CLI 실행 시만 수행; 기본 preflight는 읽기 전용."""
import argparse
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]


def resources():
    return dict(line.split('=', 1) for line in (ROOT / 'config/resources.env').read_text().splitlines()
                if line and not line.startswith('#') and '=' in line)


R = {key: value.strip('"') for key, value in resources().items()}
REGION = R['AWS_REGION']


def aws(service, operation, **params):
    command = ['aws', service, operation, '--region', REGION, '--output', 'json']
    for key, value in params.items():
        command += ['--' + key.replace('_', '-'), json.dumps(value) if isinstance(value, (dict, list)) else str(value)]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        # AWS의 원문 오류/환경값을 로그로 내보내지 않는다.
        missing = 'ResourceNotFoundException' in result.stderr
        if missing and operation in ('get-function-configuration', 'get-policy'):
            return None
        raise RuntimeError(f'AWS {service}/{operation} 실패; 권한·리소스·CLI 설정 확인')
    return json.loads(result.stdout or '{}')


def source_arn(function):
    suffix = 'v2/me/*' if function == R['ACCOUNT_DASHBOARD_FUNCTION'] else 'archive*'
    return f"arn:aws:execute-api:{REGION}:{R['AWS_ACCOUNT_ID']}:{R['SERVICE_HTTP_API_ID']}/{R['SERVICE_HTTP_API_STAGE']}/*/api/{suffix}"


def permission(function):
    raw = aws('lambda', 'get-policy', function_name=function)
    policy = json.loads(raw['Policy']) if raw else {'Statement': []}
    existing = next((item for item in policy['Statement'] if item['Sid'] == 'lens-account-http-api'), None)
    if existing and (existing.get('Condition', {}).get('ArnLike', {}).get('AWS:SourceArn') != source_arn(function)
                     or existing.get('Action') != 'lambda:InvokeFunction'
                     or existing.get('Principal', {}).get('Service') != 'apigateway.amazonaws.com'):
        raise RuntimeError('기존 invoke permission 불일치 — 변경 전에 중단')
    return existing


def preflight():
    if aws('sts', 'get-caller-identity')['Account'] != R['AWS_ACCOUNT_ID']:
        raise RuntimeError('AWS 계정 불일치')
    api = aws('apigatewayv2', 'get-api', api_id=R['SERVICE_HTTP_API_ID'])
    if api['ProtocolType'] != 'HTTP':
        raise RuntimeError('HTTP API만 지원')
    stage = aws('apigatewayv2', 'get-stage', api_id=R['SERVICE_HTTP_API_ID'], stage_name=R['SERVICE_HTTP_API_STAGE'])
    if not stage.get('AutoDeploy'):
        raise RuntimeError('AutoDeploy stage 필요; 수동 stage 변경은 별도 확인')
    archive = aws('lambda', 'get-function-configuration', function_name=R['ACCOUNT_ARCHIVE_FUNCTION'])
    dashboard = aws('lambda', 'get-function-configuration', function_name=R['ACCOUNT_DASHBOARD_FUNCTION'])
    for cfg in (archive, dashboard):
        if cfg is None:
            if cfg is archive:
                raise RuntimeError('기존 archive 함수 없음')
            continue
        if cfg.get('Runtime') != 'python3.11' or cfg.get('Architectures', ['x86_64']) != ['x86_64'] or any(value for key,value in cfg.items() if key.startswith('Durable')):
            raise RuntimeError('Python 3.11 x86_64 일반 Lambda 필요')
        env = cfg.get('Environment', {}).get('Variables', {})
        for key in ('LENS_CMS_API_URL', 'LENS_CMS_API_TOKEN', 'COGNITO_REGION', 'COGNITO_USER_POOL_ID', 'COGNITO_APP_CLIENT_ID'):
            if not env.get(key):
                raise RuntimeError(f'Lambda 환경변수 누락: {key}')
        if cfg.get('LastUpdateStatus') not in (None, 'Successful'):
            raise RuntimeError('Lambda 이전 갱신 완료 필요')
    if dashboard:
        keys = ('LENS_CMS_API_URL', 'LENS_CMS_API_TOKEN', 'COGNITO_REGION', 'COGNITO_USER_POOL_ID', 'COGNITO_APP_CLIENT_ID')
        if any(dashboard['Environment']['Variables'][key] != archive['Environment']['Variables'][key] for key in keys):
            raise RuntimeError('archive/dashboard 내부 연결·Cognito 환경 불일치')
        arn = f"arn:aws:lambda:{REGION}:{R['AWS_ACCOUNT_ID']}:function:{R['ACCOUNT_DASHBOARD_FUNCTION']}"
        if aws('lambda', 'list-tags', resource=arn)['Tags'].get('Service') != 'lens':
            raise RuntimeError('dashboard Service=lens 태그 확인 실패')
    for name,cfg in ((R['ACCOUNT_ARCHIVE_FUNCTION'],archive),(R['ACCOUNT_DASHBOARD_FUNCTION'],dashboard)):
        if cfg is not None:
            permission(name)
    # 목록 조회 권한 오류도 첫 변경 전에 확인한다.
    aws('apigatewayv2', 'get-routes', api_id=R['SERVICE_HTTP_API_ID'])
    aws('apigatewayv2', 'get-integrations', api_id=R['SERVICE_HTTP_API_ID'])
    if dashboard and dashboard.get('Handler') != 'handlers.user.dashboard.lambda_handler':
        raise RuntimeError('동일 이름의 dashboard 함수 handler 불일치 — 덮어쓰기 중단')
    if not os.environ.get('ACCOUNT_RELEASE_BACKUP_DIR', '').startswith('/tmp/'):
        raise RuntimeError('ACCOUNT_RELEASE_BACKUP_DIR=/tmp/<전용백업경로> 필요')
    return api, archive, dashboard


def snapshot(api, archive, dashboard):
    folder = Path(os.environ['ACCOUNT_RELEASE_BACKUP_DIR'])
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    folder.chmod(0o700)
    # 최초 스냅샷 보존: 재실행이 롤백 기준을 덮어쓰지 않는다.
    target = folder / 'before.json'
    if not target.exists():
        data = {'api': api, 'archive': archive, 'dashboard': dashboard,
                'routes': aws('apigatewayv2', 'get-routes', api_id=R['SERVICE_HTTP_API_ID']),
                'integrations': aws('apigatewayv2', 'get-integrations', api_id=R['SERVICE_HTTP_API_ID']),
                'policies': {name:aws('lambda','get-policy',function_name=name) for name,cfg in ((R['ACCOUNT_ARCHIVE_FUNCTION'],archive),(R['ACCOUNT_DASHBOARD_FUNCTION'],dashboard)) if cfg is not None}}
        with target.open('x') as handle:
            target.chmod(0o600)
            json.dump(data, handle)
    # 현재 배포된 코드의 presigned URL은 저장하지 않는다.
    import urllib.request
    for name in (R['ACCOUNT_ARCHIVE_FUNCTION'], R['ACCOUNT_DASHBOARD_FUNCTION']):
        if name == R['ACCOUNT_DASHBOARD_FUNCTION'] and dashboard is None:
            continue
        zip_path = folder / f'{name}.zip'
        if not zip_path.exists():
            function = aws('lambda', 'get-function', function_name=name)
            with urllib.request.urlopen(function['Code']['Location'], timeout=30) as response:
                data = response.read()
                temporary = zip_path.with_suffix('.partial')
                with temporary.open('wb') as handle:
                    temporary.chmod(0o600)
                    handle.write(data)
                temporary.replace(zip_path)


def ensure():
    api, archive, dashboard = preflight()
    snapshot(api, archive, dashboard)
    if dashboard is None:
        # archive의 기존 IAM/VPC/내부 인증 계약 재사용. 별도 역할/권한 자동 확대 없음.
        params = dict(function_name=R['ACCOUNT_DASHBOARD_FUNCTION'], runtime='python3.11',
                      role=archive['Role'], handler='handlers.user.dashboard.lambda_handler',
                      code={'S3Bucket': R['SERVICE_LAMBDA_PACKAGE_BUCKET'], 'S3Key': 'lambda_package.zip'},
                      timeout=30, memory_size=512, architectures=['x86_64'],
                      environment={'Variables': archive['Environment']['Variables']},
                      tags={'Service': 'lens', 'Project': 'Sedaily-LENS', 'Environment': 'dev', 'CostCenter': 'sedaily-ai'})
        vpc = archive.get('VpcConfig', {})
        if vpc.get('SubnetIds'):
            params['vpc_config'] = {key: vpc[key] for key in ('SubnetIds', 'SecurityGroupIds')}
        aws('lambda', 'create-function', **params)
        subprocess.run(['aws', 'lambda', 'wait', 'function-active-v2', '--function-name', R['ACCOUNT_DASHBOARD_FUNCTION'], '--region', REGION], check=True)
    arn = f"arn:aws:lambda:{REGION}:{R['AWS_ACCOUNT_ID']}:function:{R['ACCOUNT_DASHBOARD_FUNCTION']}"
    if aws('lambda', 'list-tags', resource=arn)['Tags'].get('Service') != 'lens':
        raise RuntimeError('dashboard Service=lens 태그 확인 실패')


def apply():
    api, archive, dashboard = preflight()
    if dashboard is None:
        raise RuntimeError('dashboard 함수 생성/코드 갱신 먼저 필요')
    api_id = R['SERVICE_HTTP_API_ID']
    integrations = aws('apigatewayv2', 'get-integrations', api_id=api_id)['Items']
    routes = aws('apigatewayv2', 'get-routes', api_id=api_id)['Items']
    for function, paths in ((R['ACCOUNT_DASHBOARD_FUNCTION'], ('/api/v2/me/{proxy+}',)),
                            (R['ACCOUNT_ARCHIVE_FUNCTION'], ('/api/archive', '/api/archive/{proxy+}'))):
        arn = f"arn:aws:lambda:{REGION}:{R['AWS_ACCOUNT_ID']}:function:{function}"
        integration = next((item for item in integrations if item.get('IntegrationUri') == arn and item.get('PayloadFormatVersion') == '2.0'), None)
        if integration is None:
            integration = aws('apigatewayv2', 'create-integration', api_id=api_id, integration_type='AWS_PROXY', integration_uri=arn, payload_format_version='2.0', timeout_in_millis=30000)
        # 기존 permission은 statement ID와 내용을 확인해 재사용한다.
        sid = 'lens-account-http-api'
        existing = permission(function)
        if not existing:
            aws('lambda', 'add-permission', function_name=function, statement_id=sid, action='lambda:InvokeFunction', principal='apigateway.amazonaws.com', source_arn=source_arn(function))
        keys = {'ANY ' + path for path in paths}
        for item in routes:
            path = item['RouteKey'].partition(' ')[2]
            if any(path == prefix or path.startswith(prefix + '/') for prefix in (('/api/v2/me',) if function == R['ACCOUNT_DASHBOARD_FUNCTION'] else ('/api/archive',))):
                keys.add(item['RouteKey'])
        for key in sorted(keys):
            route = next((item for item in routes if item['RouteKey'] == key), None)
            params = dict(api_id=api_id, target='integrations/' + integration['IntegrationId'], authorization_type='NONE')
            # Cognito ID token 서명 검증은 handler에서 수행한다.
            if route:
                aws('apigatewayv2', 'update-route', route_id=route['RouteId'], **params)
            else:
                aws('apigatewayv2', 'create-route', route_key=key, **params)
    cors = api.get('CorsConfiguration', {})
    cors['AllowOrigins'] = sorted(set(cors.get('AllowOrigins', [])) | {'https://ailens.sedaily.ai'})
    cors['AllowMethods'] = sorted(set(cors.get('AllowMethods', [])) | {'GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'})
    cors['AllowHeaders'] = sorted(set(cors.get('AllowHeaders', [])) | {'authorization', 'content-type'})
    aws('apigatewayv2', 'update-api', api_id=api_id, cors_configuration=cors)


def rollback():
    folder = Path(os.environ.get('ACCOUNT_RELEASE_BACKUP_DIR', ''))
    if not str(folder).startswith('/tmp/'):
        raise RuntimeError('원래 ACCOUNT_RELEASE_BACKUP_DIR 필요')
    before = json.loads((folder / 'before.json').read_text())
    if aws('sts','get-caller-identity')['Account'] != R['AWS_ACCOUNT_ID']:
        raise RuntimeError('AWS 계정 불일치')
    restores = [(R['ACCOUNT_ARCHIVE_FUNCTION'],before['archive']), (R['ACCOUNT_DASHBOARD_FUNCTION'],before['dashboard'])]
    for name, cfg in restores:
        if cfg and not (folder / f'{name}.zip').is_file():
            raise RuntimeError('원래 코드 백업 누락 — 롤백 중단')
    api_id = R['SERVICE_HTTP_API_ID']
    original = {r['RouteKey']:r for r in before['routes']['Items']}
    for route in aws('apigatewayv2','get-routes',api_id=api_id)['Items']:
        path=route['RouteKey'].partition(' ')[2]
        if not any(path==prefix or path.startswith(prefix+'/') for prefix in ('/api/v2/me','/api/archive')):
            continue
        saved=original.get(route['RouteKey'])
        if saved:
            params=dict(api_id=api_id,route_id=route['RouteId'],target=saved['Target'],authorization_type=saved.get('AuthorizationType','NONE'))
            if saved.get('AuthorizerId'):params['authorizer_id']=saved['AuthorizerId']
            if saved.get('AuthorizationScopes'):params['authorization_scopes']=saved['AuthorizationScopes']
            aws('apigatewayv2','update-route',**params)
        else:
            aws('apigatewayv2','delete-route',api_id=api_id,route_id=route['RouteId'])
    if before['api'].get('CorsConfiguration'):
        aws('apigatewayv2','update-api',api_id=api_id,cors_configuration=before['api']['CorsConfiguration'])
    else:
        aws('apigatewayv2','delete-cors-configuration',api_id=api_id)
    for name, cfg in restores:
        if not cfg:continue
        aws('lambda','update-function-code',function_name=name,zip_file='fileb://'+str(folder/f'{name}.zip'))
        subprocess.run(['aws','lambda','wait','function-updated','--function-name',name,'--region',REGION],check=True)
        aws('lambda','update-function-configuration',function_name=name,handler=cfg['Handler'],environment={'Variables':cfg['Environment']['Variables']})
        subprocess.run(['aws','lambda','wait','function-updated','--function-name',name,'--region',REGION],check=True)
    print('코드·기존 경로·CORS 복구. 신규 미연결 함수/통합은 보존하며 별도 정리 대상입니다.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=('preflight', 'ensure', 'apply', 'rollback'))
    args = parser.parse_args()
    try:
        globals()[args.command]()
        print(f'{args.command}: OK (운영 인증/기기 수신 인수는 별도)')
    except Exception as exc:
        raise SystemExit(str(exc)) from None
