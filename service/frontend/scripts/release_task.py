"""ECS task 입력 생성만 수행. 가변 latest 대신 실행/배포 이미지 digest를 고정한다."""
import argparse
import json
from pathlib import Path
import re

READ_ONLY = {'taskDefinitionArn','revision','status','requiresAttributes','compatibilities','registeredAt','registeredBy','deregisteredAt'}


def prepare(definition, repository, digest):
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', digest):
        raise ValueError('확인한 이미지 digest 필요')
    definition = {key:value for key,value in definition.items() if key not in READ_ONLY}
    containers = definition['containerDefinitions']
    if len(containers)!=1 or containers[0]['name']!='frontend':
        raise ValueError('단일 frontend 컨테이너 정의 필요')
    containers[0] = {**containers[0], 'image':repository+'@'+digest}
    return definition


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--definition',type=Path,required=True)
    parser.add_argument('--repository',required=True)
    parser.add_argument('--digest',required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    try:
        data=json.loads(args.definition.read_text())
        result=prepare(data.get('taskDefinition',data),args.repository,args.digest)
        if not str(args.output).startswith('/tmp/'):
            raise ValueError('task 산출물은 /tmp에만 저장하세요')
        args.output.write_text(json.dumps(result))
        args.output.chmod(0o600)
    except (ValueError,KeyError) as exc:
        raise SystemExit(str(exc)) from None
