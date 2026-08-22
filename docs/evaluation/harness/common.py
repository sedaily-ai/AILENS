"""공통 — Bedrock 클라이언트, 프롬프트셋 조립, 클러스터 로더."""
import os, json, glob, time, boto3
from botocore.config import Config

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # docs/evaluation/
REPO = os.path.dirname(os.path.dirname(ROOT))   # repo root (docs/evaluation 기준 2단계 상위)
ACCT, REGION = "887078546492", "us-east-1"
GEN_ARN   = f"arn:aws:bedrock:{REGION}:{ACCT}:application-inference-profile/ymxbqn4lqro1"  # mbti-eval-sonnet-46
JUDGE_ARN = f"arn:aws:bedrock:{REGION}:{ACCT}:application-inference-profile/7pr9ue3os1ro"  # mbti-eval-opus-47

PERSONAS = {"nt": "민철", "nf": "하은", "st": "준서", "sf": "소율"}
# read_timeout 기본 60s → 전체 발행본 생성(>60s)이 매번 타임아웃되던 버그 수정.
# botocore 내부 재시도는 0 (재시도는 converse() 에서 직접 처리).
_br = boto3.client("bedrock-runtime", region_name=REGION,
                   config=Config(read_timeout=300, connect_timeout=15,
                                 retries={"max_attempts": 0}))


def converse(arn, system, user, max_tokens=4000, temperature=None, cache_system=True):
    """Bedrock converse. Opus 4.7 는 temperature 미지원 → None 이면 제외.
    cache_system: 큰 system 프롬프트(~28k tok)를 prompt cache. 배치에서 같은
    system 이 반복되므로 첫 호출 후 cache read 로 비용·지연 절감."""
    cfg = {"maxTokens": max_tokens}
    if temperature is not None:
        cfg["temperature"] = temperature
    sys_blocks = [{"text": system}]
    if cache_system:
        sys_blocks.append({"cachePoint": {"type": "default"}})
    last = None
    for attempt in range(7):
        try:
            r = _br.converse(
                modelId=arn,
                system=sys_blocks,
                messages=[{"role": "user", "content": [{"text": user}]}],
                inferenceConfig=cfg,
            )
            return (r["output"]["message"]["content"][0]["text"],
                    r["usage"]["inputTokens"], r["usage"]["outputTokens"])
        except Exception as e:
            last = e
            name = type(e).__name__
            throttle = "Throttl" in name or "TooManyRequests" in str(e)
            if attempt == 6:
                raise
            # 스로틀이면 길게(12,18,27...), 그 외 짧게 백오프
            time.sleep(min(60, (8 if throttle else 2) * (1.5 ** attempt)))
    raise last


def load_versions():
    with open(os.path.join(ROOT, "harness", "versions.json"), encoding="utf-8") as f:
        return json.load(f)


def build_system(version_cfg, persona):
    """version 정의 + 페르소나 → 생성용 system 프롬프트 조립."""
    base = os.path.join(REPO, version_cfg["base_dir"], persona)
    parts = []
    for fn in (f"core_knowledge_generation.txt", f"type_voice_{persona}.txt",
               f"output_structure_{persona}.txt", "instruction.txt"):
        p = os.path.join(base, fn)
        with open(p, encoding="utf-8") as f:
            parts.append(f"===== {fn} =====\n{f.read()}")
    sys = "\n\n".join(parts)
    if version_cfg.get("overlay"):
        sys += "\n\n===== v3.1 보강 지시 (위 규칙에 우선 적용) =====\n" + version_cfg["overlay"]
    return sys


def load_clusters():
    idx = json.load(open(os.path.join(ROOT, "clusters", "clusters.json"), encoding="utf-8"))
    out = {}
    for c in idx["clusters"]:
        cid = c["cluster_id"]
        out[cid] = json.load(open(os.path.join(ROOT, "clusters", f"{cid}.json"), encoding="utf-8"))
    return out


def cluster_user_msg(cluster):
    """클러스터 4기사 → 생성 user 메시지."""
    lines = [f"다음 {len(cluster['articles'])}개 기사로 발행본을 작성하라. 핵심 3 + 참고 1 구성.\n"]
    for i, a in enumerate(cluster["articles"], 1):
        tag = "참고" if i == len(cluster["articles"]) else "핵심"
        lines.append(f"[기사 {i}/{tag}] {a['title']}\n부제: {a['subtitle']}\n본문: {a['content']}\n")
    return "\n".join(lines)


def cluster_facts(cluster):
    """심판용 — 원문 사실 대조 블록."""
    return "\n".join(f"[기사 {i}] {a['title']}\n{a['content']}"
                     for i, a in enumerate(cluster["articles"], 1))
