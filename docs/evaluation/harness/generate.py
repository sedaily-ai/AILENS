"""생성 — (cluster, persona, version) → 발행본. mbti-eval-sonnet-46."""
from common import converse, GEN_ARN, build_system, cluster_user_msg


def generate(cluster, persona, version_id, version_cfg):
    sysmsg = build_system(version_cfg, persona)
    user = cluster_user_msg(cluster)
    text, tin, tout = converse(GEN_ARN, sysmsg, user, max_tokens=6000, temperature=0.7)
    return {"version": version_id, "persona": persona,
            "cluster_id": cluster["cluster_id"], "text": text,
            "chars": len(text), "tok_in": tin, "tok_out": tout}
