"""웹툰 캐릭터 일관성(#15) 근본 해법 — 자체 호스팅 GPU + IP-Adapter.

2026-09-09(R14~R15) — Bedrock 관리형 API로는 IP-Adapter(참조 얼굴로
인물 정체성을 고정하는 기법)를 못 쓴다. 회사가 "서버리스만 고집하지
않는다"고 확인해줘서(BangBot 계열 EC2 t3.small을 이미 상시 운영 중),
전용 GPU 인스턴스 하나를 배치 작업용으로 띄운다 — 상시 가동이 아니라
"이 모듈이 시작→쓰고→끈다"는 패턴(g5.xlarge $1.237/시간(ap-northeast-2),
하루 몇 컷 뽑는 배치 작업이라 24시간 켜둘 이유가 없다).

2026-09-16 — 컷 생성이 너무 느리다는 사용자 지적으로 g4dn.xlarge(Tesla
T4, $0.647/시간)에서 g5.xlarge(NVIDIA A10G, $1.237/시간)로 업그레이드.
같은 AMI/디스크 그대로 인스턴스 타입만 바꿨고(EBS 루트 볼륨 유지),
nvidia-smi로 새 GPU가 정상 인식되는 것까지 실측 확인했다 — 드라이버
재설치 없이 그대로 동작. A10G가 추론 속도상 T4보다 크게 빠르고 VRAM도
16GB→23GB로 늘어 여유가 생긴다. 시간당 단가는 오르지만 배치가 그만큼
빨리 끝나 컷당 실비용은 비슷하거나 나을 것으로 예상 — 실측 비교는
아직 안 함.

**중요한 한계(2026-09-09 실측)**: IP-Adapter는 한 장의 참조 이미지로
"이 사진의 인물과 닮게" 조건을 주는 기법이라, 두 사람(A+B)이 한
프레임에 같이 나오는 컷에 그대로 쓰면 둘 다 같은 얼굴로 쏠리는 문제가
있다(다중 인물 identity-lock은 InstantID 같은 별도 기법이 필요 —
이번 범위 밖). 그래서 이 모듈은 **한 명만 화면에 크게 나오는 컷
(클로즈업 등)에서만** 참조 얼굴을 적용하고, 두 사람이 같이 나오는
컷은 조건 없이(character="NONE") 생성한다 — webtoon_image.py의
translate_scene_to_photo_brief()가 반환하는 subjects("A"/"B"/"BOTH")로
호출부(pipeline.py)가 이걸 판단한다.

**인프라**: g5.xlarge(NVIDIA A10G, 2026-09-16 이전엔 g4dn.xlarge/Tesla T4)
+ AWS Deep Learning AMI(PyTorch 사전
설치) + 기존 sedaily-eng-ec2-role(SSM 권한 재사용, 새 IAM 불필요).
인바운드 없는 전용 보안그룹(SSM Session Manager로만 접근) — 이미
콘솔/CLI로 1회 생성해뒀다(GPU_INSTANCE_ID 참고, 재생성 불필요).
STOP(터미네이트 아님)으로 꺼서 디스크에 캐시된 모델 가중치·pip
패키지가 다음 실행에도 남아있게 한다 — 매번 재다운로드하면 배치마다
몇 분씩 더 걸린다.

**데이터 전달**: S3(GPU_BUCKET)로 참조 이미지·결과 이미지를 주고받는다
(SSM RunShellScript 파라미터는 큰 바이너리를 못 실어나른다 — base64
인코딩해도 명령 크기 제한에 걸림). 참조 이미지(character_ref_A/B.png)는
인스턴스 로컬 디스크(/home/ec2-user/refs/)에 캐시돼 있다.

2026-09-16 — 참조 이미지가 예전엔 인스턴스에 한 번 수동으로 올려진 뒤로
코드가 안 건드리는 고정 자산이었다. admin "이미지 실험" 패널에서 이걸
업로드/교체할 수 있게 되면서, S3(`refs/character_ref_A.png`·`_B.png`)가
정본이 됐고 `ensure_gpu_running()`이 매번(배치 시작마다) S3→로컬 디스크로
덮어쓴다(`_sync_character_refs()`) — admin이 방금 올린 사진이 다음 배치부터
반영된다. 매 컷 호출마다 다시 받는 게 아니라 "배치 시작 시 한 번"이라
"이미 캐시돼 있어 매 호출마다 다시 받지 않는다"는 성능 특성 자체는 그대로다.
"""
from __future__ import annotations

import threading
import time

GPU_REGION = "ap-northeast-2"
GPU_INSTANCE_ID = "i-02313c8c8285f9d91"  # webtoon-ipadapter-gpu (2026-09-09 생성, STOP 상태로 유지)
GPU_BUCKET = "sedaily-webtoon-ipadapter-887078546492"
_INFER_SCRIPT_S3_KEY = "ipadapter_infer.py"

# 2026-09-10 — mustknow_auto 스케줄(하루 6회, ~3시간 간격)보다 한 실행이
# 더 오래 걸리는 날엔 이전 실행이 아직 GPU를 쓰는 중에 다음 실행이
# 시작돼 동시에 여러 태스크가 같은 GPU_INSTANCE_ID를 공유하게 된다(실측:
# 2026-09-10 15/18/21시 태스크 3개 동시 실행). 이 모듈은 원래 "한 태스크가
# 켜고 그 태스크가 끈다"만 가정했어서, 먼저 끝난 태스크가 stop_gpu()를
# 부르면 아직 컷을 만들던 다른 태스크의 SendCommand가 인스턴스가
# stopping/stopped 상태라 "InvalidInstanceId"로 줄줄이 실패했다(실측
# 로그: 15시 태스크 컷2~5 연속 실패). DynamoDB 원자적 ADD로 활성 사용자
# 수를 세어, 마지막으로 빠지는 태스크만 실제로 stop_instances()를
# 부르도록 고친다 — 완벽한 분산 락은 아니고(감소·재확인 사이 극히
# 짧은 경합 창은 남는다) stop_instances() 자체가 멱등이라 최악의 경우도
# "동시성이 전혀 없던 예전"보다 항상 낫다.
GPU_LOCK_TABLE = "sedaily-lens-gpu-lock-dev"
GPU_LOCK_REGION = "us-east-1"  # 다른 파이프라인 상태 테이블(mustknow-seen 등)과 같은 리전 — GPU_REGION과 무관

_ssm_client = None
_ec2_client = None
_s3_client = None
_ddb_client = None
# 2026-09-16 — 발견 당시엔 routes/chat_ws.py에 8컷을 ThreadPoolExecutor로
# 동시에 돌리는 "전체 컷" 흐름이 있어서, 이 함수를 여러 스레드가 동시에
# 호출하는 게 실제로 일어난다는 게 드러났다(전체 컷 생성 시 컷 여러 개가
# "'NoneType' object has no attribute 'put_object'"로 실패). 그 흐름은 이후
# 컷 하나당 WebSocket 메시지(chat_ws.py::_run_cut_image_flow, 컷마다 별도
# Lambda self-invoke)로 바뀌었지만, 로컬 개발 서버(admin/backend/
# local_server.py)는 ThreadingHTTPServer라 동시 요청이 같은 프로세스의
# 스레드로 들어와 같은 경쟁 조건이 여전히 재현될 수 있다. 원래 코드는
# `_ssm_client is None`만 보고 세 전역을 순서대로 채웠는데, 한 스레드가
# _ssm_client까지만 채운 순간 다른 스레드가 그 가드를 통과해버려
# _s3_client가 아직 None인 채로 반환되는 경쟁 조건이었다 — 락으로 막는다.
_clients_lock = threading.Lock()
# GPU(g5.xlarge) 한 대의 실제 추론 자체를 직렬화 — generate_ipadapter_photo_bytes
# 내부에서 사용(아래 해당 함수 주석 참고).
_gpu_infer_lock = threading.Lock()


def _clients():
    global _ssm_client, _ec2_client, _s3_client
    if _ssm_client is None or _ec2_client is None or _s3_client is None:
        with _clients_lock:
            if _ssm_client is None or _ec2_client is None or _s3_client is None:
                import boto3  # noqa: lazy — GPU 경로를 안 쓰는 admin 실험 패널 등에서 boto3 초기화 비용 회피

                _ssm_client = boto3.client("ssm", region_name=GPU_REGION)
                _ec2_client = boto3.client("ec2", region_name=GPU_REGION)
                _s3_client = boto3.client("s3", region_name=GPU_REGION)
    return _ssm_client, _ec2_client, _s3_client


def _ddb():
    global _ddb_client
    if _ddb_client is None:
        import boto3  # noqa: lazy

        _ddb_client = boto3.client("dynamodb", region_name=GPU_LOCK_REGION)
    return _ddb_client


def _adjust_active_count(delta: int) -> int:
    """activ_count에 delta를 원자적으로 더하고 갱신된 값을 반환한다.
    아이템이 없으면 DynamoDB ADD가 0에서 시작해 새로 만든다."""
    resp = _ddb().update_item(
        TableName=GPU_LOCK_TABLE,
        Key={"instance_id": {"S": GPU_INSTANCE_ID}},
        UpdateExpression="ADD active_count :d",
        ExpressionAttributeValues={":d": {"N": str(delta)}},
        ReturnValues="UPDATED_NEW",
    )
    return int(resp["Attributes"]["active_count"]["N"])


def ensure_gpu_running(timeout_s: int = 180) -> None:
    """인스턴스가 stopped면 start하고 running+SSM 온라인까지 대기한다.
    이미 running이면 바로 리턴(중복 start_instances 호출 방지).

    2026-09-09 버그 수정 — state가 "stopping"(직전 배치가 막 stop_gpu()를
    부른 직후 등 전이 상태)일 때 start_instances도 안 부르고 그냥
    instance_running waiter를 걸었더니, waiter가 "stopped"를 터미널
    상태로 보고 즉시 실패하는 걸 실측으로 확인함(WaiterError). "running"이
    아닌 모든 상태(stopping 포함)에서 먼저 stopped를 기다린 다음
    start_instances를 부르도록 고침.

    2026-09-10 — 호출할 때마다 활성 사용자 수를 먼저 +1 해서 stop_gpu()가
    아직 쓰는 중인 다른 태스크의 GPU를 끄지 않게 한다(모듈 상단 주석
    참조). 이 함수 자체는 여러 태스크가 동시에 불러도 안전(멱등) —
    이미 running+온라인이면 바로 리턴."""
    count = _adjust_active_count(1)
    print(f"[gpu_ipadapter] 활성 사용 태스크 {count}개")
    ssm, ec2, _s3 = _clients()
    state = ec2.describe_instances(InstanceIds=[GPU_INSTANCE_ID])["Reservations"][0]["Instances"][0]["State"]["Name"]
    if state == "stopping":
        print(f"[gpu_ipadapter] {GPU_INSTANCE_ID} 정지 완료 대기 중...")
        ec2.get_waiter("instance_stopped").wait(InstanceIds=[GPU_INSTANCE_ID])
        state = "stopped"
    if state == "stopped":
        print(f"[gpu_ipadapter] {GPU_INSTANCE_ID} 기동 중...")
        ec2.start_instances(InstanceIds=[GPU_INSTANCE_ID])
    if state != "running":
        ec2.get_waiter("instance_running").wait(InstanceIds=[GPU_INSTANCE_ID])

    deadline = time.time() + timeout_s
    while time.time() < deadline:
        info = ssm.describe_instance_information(
            Filters=[{"Key": "InstanceIds", "Values": [GPU_INSTANCE_ID]}]
        )["InstanceInformationList"]
        if info and info[0]["PingStatus"] == "Online":
            print(f"[gpu_ipadapter] {GPU_INSTANCE_ID} SSM 준비 완료")
            _sync_character_refs()
            return
        time.sleep(5)
    raise TimeoutError(f"{GPU_INSTANCE_ID} SSM 온라인 대기 타임아웃({timeout_s}s)")


def _sync_character_refs() -> None:
    """S3(refs/character_ref_A/B.png)를 인스턴스 로컬 디스크(/home/ec2-user/refs/)로
    동기화한다 — 2026-09-16, admin "이미지 실험" 패널에서 인물 참조 사진을
    업로드/교체할 수 있게 되면서 추가. 예전엔 이 두 파일이 인스턴스에 한 번
    수동으로 올려진 뒤로 코드 어디서도 안 건드리는 고정 자산이었다(모듈
    상단 docstring 참고) — 지금은 S3가 정본이고, 배치를 시작할 때마다(=이
    함수가 호출될 때마다) 최신 값으로 덮어써서 admin이 방금 올린 사진이
    다음 배치부터 바로 반영되게 한다. S3에 아직 아무것도 없으면(최초 상태)
    `aws s3 cp`가 조용히 실패하고 인스턴스에 이미 있던 예전 파일이 그대로
    남는다 — 그래서 `; true`로 전체 명령 실패를 막는다(동기화 실패로 배치
    자체가 죽으면 안 됨, 다른 함수들과 같은 fail-open 원칙)."""
    cmd = (
        "mkdir -p /home/ec2-user/refs && "
        f"aws s3 cp s3://{GPU_BUCKET}/refs/character_ref_A.png /home/ec2-user/refs/character_ref_A.png ; "
        f"aws s3 cp s3://{GPU_BUCKET}/refs/character_ref_B.png /home/ec2-user/refs/character_ref_B.png ; "
        "true"
    )
    try:
        _run_ssm_command([cmd], timeout_s=60)
    except Exception as e:  # noqa: BLE001 — 동기화 실패해도 배치는 계속(위 docstring 참고)
        print(f"[gpu_ipadapter] 참조 사진 동기화 실패(무시): {e}")


def stop_gpu() -> None:
    """배치 작업이 끝나면 반드시 호출 — 안 끄면 시간당 $1.237가 계속 나간다.

    2026-09-10 — 활성 사용자 수를 먼저 -1 해서, 아직 다른 태스크가 쓰는
    중이면(count > 0) 실제 stop_instances()는 건너뛴다 — 마지막으로
    빠지는 태스크만 진짜로 끈다. 음수로 떨어지는 걸 막기 위해 0 미만이면
    0으로 보정(비정상 종료로 감소가 두 번 이상 일어난 극단적 경우 대비)."""
    count = _adjust_active_count(-1)
    if count < 0:
        _adjust_active_count(-count)  # 0으로 보정
        count = 0
    print(f"[gpu_ipadapter] 활성 사용 태스크 {count}개 남음")
    if count > 0:
        print("[gpu_ipadapter] 다른 태스크가 아직 사용 중 — stop 보류")
        return
    _ssm, ec2, _s3 = _clients()
    print(f"[gpu_ipadapter] {GPU_INSTANCE_ID} 정지 중...")
    ec2.stop_instances(InstanceIds=[GPU_INSTANCE_ID])


def _run_ssm_command(commands: list[str], timeout_s: int = 300) -> dict:
    ssm, _ec2, _s3 = _clients()
    cmd_id = ssm.send_command(
        InstanceIds=[GPU_INSTANCE_ID],
        DocumentName="AWS-RunShellScript",
        Parameters={"commands": commands},
        TimeoutSeconds=timeout_s,
    )["Command"]["CommandId"]

    deadline = time.time() + timeout_s + 30
    while time.time() < deadline:
        time.sleep(3)
        try:
            result = ssm.get_command_invocation(CommandId=cmd_id, InstanceId=GPU_INSTANCE_ID)
        except ssm.exceptions.InvocationDoesNotExist:
            continue  # 아직 인스턴스에 명령이 전파되기 전
        if result["Status"] in ("Success", "Failed", "Cancelled", "TimedOut"):
            return result
    raise TimeoutError(f"SSM 명령 {cmd_id} 대기 타임아웃")


def generate_ipadapter_photo_bytes(
    photo_brief: str, character: str, *, scale: float = 0.45, steps: int = 30, seed: int = 0
) -> bytes:
    """character: "A"|"B"(단일 인물 참조 고정) 또는 "NONE"(참조 없이, 두 사람 컷용).
    호출 전 ensure_gpu_running() 필수(이 함수는 반복 호출되므로 매번 상태
    확인하는 오버헤드를 피하려고 여기서 자동으로 부르지 않는다 — 배치
    호출부가 한 번만 켜고 여러 컷을 처리한 뒤 한 번만 끄는 패턴을 쓴다).

    brief 텍스트는 SSM 명령 파라미터로 직접 안 넘긴다 — 따옴표·개행이
    섞인 문자열을 쉘 명령 안에 인라인으로 넣으면 인용 규칙이 깨지는 걸
    실측으로 확인함(2026-09-09). 대신 S3에 작은 텍스트 파일로 올리고,
    원격 스크립트가 그 파일을 읽게 한다 — 이미지 결과를 주고받는 것과
    같은 방식으로 통일.

    scale=0.45(2026-09-09, R20 후속 실측) — 원래 기본값 0.7은 IP-Adapter-Plus가
    얼굴만이 아니라 참조 이미지의 **자세·구도까지** 강하게 전이시켜서, R20에서
    2단계 지침에 "능동적 동작"을 추가해도 실제 이미지는 계속 참조 이미지와 같은
    "테이블에 기대앉은" 자세로 나오는 문제를 실측으로 확인함(같은 브리핑
    "서서, 창가, 로우앵글"을 줘도 scale=0.7에선 앉은 자세로 나옴). scale을
    0.35~0.5로 낮추며 비교한 결과 0.45가 자세 자유도(브리핑 지시를 따름)와
    얼굴 정체성 유지의 균형점이었다 — 0.35는 자세는 완벽했지만 저해상도
    앵글에서 이목구비 유지가 살짝 불안정했고, 0.5는 여전히 앉은 자세로
    쏠리는 경향이 남아있었다."""
    ssm_client, _ec2, s3 = _clients()
    # 2026-09-16 — run_id를 photo_brief 해시로만 만들면, 같은 문구를 쓰는
    # 두 인물 합성 컷(webtoon_image.py::generate_dual_character_init_bytes가
    # _DUAL_SOLO_PROMPT_TEMPLATE라는 고정 문구를 캐릭터 A/B 각각에 매번
    # 그대로 넘김)이 여러 컷에서 동시에 호출되면 전부 같은 run_id → 같은
    # S3 키로 겹친다. "전체 컷" 동시 요청에서 실제로 재현: 컷 하나가 끝나며
    # finally에서 brief_*.txt를 지우는 순간, 같은 키를 쓰던 다른 컷의 SSM
    # 명령이 그 파일을 읽으려다 404로 실패했다. uuid로 매 호출마다 고유한
    # 키를 쓰게 해서 겹칠 수 없게 한다(내용 기반 해시는 더 이상 안 씀).
    import uuid as _uuid

    run_id = f"{character}_{_uuid.uuid4().hex[:12]}"
    brief_key = f"brief_{run_id}.txt"
    out_key = f"out_{run_id}.png"
    s3.put_object(Bucket=GPU_BUCKET, Key=brief_key, Body=photo_brief.encode("utf-8"))

    cmd = (
        "source /opt/pytorch/bin/activate && cd /home/ec2-user && "
        f"aws s3 cp s3://{GPU_BUCKET}/{brief_key} /tmp/{brief_key} && "
        f"python3 ipadapter_infer.py --character {character} --brief-file /tmp/{brief_key} "
        f"--out-key {out_key} --scale {scale} --steps {steps} --seed {seed}"
    )
    try:
        # 2026-09-16 — 발견 당시(chat_ws.py에 8컷을 ThreadPoolExecutor로 동시에
        # 돌리는 "전체 컷" 흐름이 있던 시점) GPU(g5.xlarge 한 대)에 SSM
        # RunShellScript가 동시에 여러 개 들어가 PyTorch 추론끼리 GPU를
        # 다퉈서(VRAM 경합) 전부 180초 안에 못 끝나고 타임아웃으로 실패하는
        # 걸 실측으로 확인했다("전체 컷" 요청 시 8컷 전부 "SSM 명령 대기
        # 타임아웃"). 이 락으로 GPU 추론 자체만 한 번에 하나씩 돌게
        # 직렬화한다 — Bedrock 호출·S3 업로드·QA처럼 GPU를 안 쓰는 다른
        # 작업은 여전히 병렬로 돈다.
        #
        # ⚠️ 이 락은 threading.Lock()이라 같은 프로세스(로컬 ThreadingHTTPServer
        # 동시 요청) 안에서만 유효하다. 지금은 컷 하나당 별도 self-invoke
        # Lambda(chat_ws.py::_run_cut_image_flow)라 컷 여러 개가 동시에
        # 요청되면 서로 다른 실행 환경에서 각자 자기만의 락을 얻어, 이 락이
        # 실제로 두 컷의 SSM 명령을 막아주지 못할 수 있다 — 프로덕션에서
        # 동시 컷 생성이 잦다면 DynamoDB 조건부 쓰기 등 프로세스 간 락으로
        # 바꿔야 한다(아직 실측/수정 안 함).
        with _gpu_infer_lock:
            result = _run_ssm_command([cmd], timeout_s=180)
        if result["Status"] != "Success":
            raise RuntimeError(
                f"GPU IP-Adapter 추론 실패: {result['Status']}\n"
                f"stdout: {result.get('StandardOutputContent', '')[-2000:]}\n"
                f"stderr: {result.get('StandardErrorContent', '')[-2000:]}"
            )
        import io

        buf = io.BytesIO()
        s3.download_fileobj(GPU_BUCKET, out_key, buf)
        return buf.getvalue()
    finally:
        # 성공·실패 무관하게 임시 파일은 정리 — 버킷에 계속 쌓이지 않게.
        for key in (brief_key, out_key):
            try:
                s3.delete_object(Bucket=GPU_BUCKET, Key=key)
            except Exception:
                pass
