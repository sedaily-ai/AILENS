"""웹툰 캐릭터 일관성(#15) 근본 해법 — 자체 호스팅 GPU + IP-Adapter.

2026-09-09(R14~R15) — Bedrock 관리형 API로는 IP-Adapter(참조 얼굴로
인물 정체성을 고정하는 기법)를 못 쓴다. 회사가 "서버리스만 고집하지
않는다"고 확인해줘서(BangBot 계열 EC2 t3.small을 이미 상시 운영 중),
전용 GPU 인스턴스 하나를 배치 작업용으로 띄운다 — 상시 가동이 아니라
"이 모듈이 시작→쓰고→끈다"는 패턴(g4dn.xlarge $0.647/시간, 하루 몇
컷 뽑는 배치 작업이라 24시간 켜둘 이유가 없다).

**중요한 한계(2026-09-09 실측)**: IP-Adapter는 한 장의 참조 이미지로
"이 사진의 인물과 닮게" 조건을 주는 기법이라, 두 사람(A+B)이 한
프레임에 같이 나오는 컷에 그대로 쓰면 둘 다 같은 얼굴로 쏠리는 문제가
있다(다중 인물 identity-lock은 InstantID 같은 별도 기법이 필요 —
이번 범위 밖). 그래서 이 모듈은 **한 명만 화면에 크게 나오는 컷
(클로즈업 등)에서만** 참조 얼굴을 적용하고, 두 사람이 같이 나오는
컷은 조건 없이(character="NONE") 생성한다 — webtoon_image.py의
translate_scene_to_photo_brief()가 반환하는 subjects("A"/"B"/"BOTH")로
호출부(pipeline.py)가 이걸 판단한다.

**인프라**: g4dn.xlarge(Tesla T4) + AWS Deep Learning AMI(PyTorch 사전
설치) + 기존 sedaily-eng-ec2-role(SSM 권한 재사용, 새 IAM 불필요).
인바운드 없는 전용 보안그룹(SSM Session Manager로만 접근) — 이미
콘솔/CLI로 1회 생성해뒀다(GPU_INSTANCE_ID 참고, 재생성 불필요).
STOP(터미네이트 아님)으로 꺼서 디스크에 캐시된 모델 가중치·pip
패키지가 다음 실행에도 남아있게 한다 — 매번 재다운로드하면 배치마다
몇 분씩 더 걸린다.

**데이터 전달**: S3(GPU_BUCKET)로 참조 이미지·결과 이미지를 주고받는다
(SSM RunShellScript 파라미터는 큰 바이너리를 못 실어나른다 — base64
인코딩해도 명령 크기 제한에 걸림). 참조 이미지(character_ref_A/B.png)는
인스턴스 로컬 디스크(/home/ec2-user/refs/)에 이미 캐시돼 있어 매
호출마다 다시 받지 않는다.
"""
from __future__ import annotations

import time

GPU_REGION = "ap-northeast-2"
GPU_INSTANCE_ID = "i-02313c8c8285f9d91"  # webtoon-ipadapter-gpu (2026-09-09 생성, STOP 상태로 유지)
GPU_BUCKET = "sedaily-webtoon-ipadapter-887078546492"
_INFER_SCRIPT_S3_KEY = "ipadapter_infer.py"

_ssm_client = None
_ec2_client = None
_s3_client = None


def _clients():
    global _ssm_client, _ec2_client, _s3_client
    if _ssm_client is None:
        import boto3  # noqa: lazy — GPU 경로를 안 쓰는 admin 실험 패널 등에서 boto3 초기화 비용 회피

        _ssm_client = boto3.client("ssm", region_name=GPU_REGION)
        _ec2_client = boto3.client("ec2", region_name=GPU_REGION)
        _s3_client = boto3.client("s3", region_name=GPU_REGION)
    return _ssm_client, _ec2_client, _s3_client


def ensure_gpu_running(timeout_s: int = 180) -> None:
    """인스턴스가 stopped면 start하고 running+SSM 온라인까지 대기한다.
    이미 running이면 바로 리턴(중복 start_instances 호출 방지).

    2026-09-09 버그 수정 — state가 "stopping"(직전 배치가 막 stop_gpu()를
    부른 직후 등 전이 상태)일 때 start_instances도 안 부르고 그냥
    instance_running waiter를 걸었더니, waiter가 "stopped"를 터미널
    상태로 보고 즉시 실패하는 걸 실측으로 확인함(WaiterError). "running"이
    아닌 모든 상태(stopping 포함)에서 먼저 stopped를 기다린 다음
    start_instances를 부르도록 고침."""
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
            return
        time.sleep(5)
    raise TimeoutError(f"{GPU_INSTANCE_ID} SSM 온라인 대기 타임아웃({timeout_s}s)")


def stop_gpu() -> None:
    """배치 작업이 끝나면 반드시 호출 — 안 끄면 시간당 $0.647가 계속 나간다."""
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
    run_id = f"{character}_{abs(hash(photo_brief)) % 10_000_000}_{seed}"
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
