"""오케스트레이터 — 클러스터×페르소나×버전 생성 → 이진 게이트 → 페어와이즈 랭킹.
(cluster,persona) 단위를 ThreadPool 로 병렬(기본 4워커). 직렬 대비 ~3-4x 단축.
사용: python3 run.py --clusters C1_macro_policy,C5_stress_loose --versions v3.0.0,v3.2
     python3 run.py --all --workers 4
"""
import os, json, time, argparse, datetime, threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from common import ROOT, PERSONAS, load_versions, load_clusters
from generate import generate
from judge import gate, rank_pair

_lock = threading.Lock()


def do_unit(cl, cid, p, ver_ids, versions):
    """(cluster,persona) 1단위: 2버전 생성+게이트 → 페어와이즈. 스레드 안전(독립 입력)."""
    gens = {}
    tok = 0
    for v in ver_ids:
        g = generate(cl, p, v, versions[v])
        tok += g["tok_in"] + g["tok_out"]
        gt = gate(cl, g["text"], p)
        tok += gt.get("_tok", 0)
        g["gate"] = gt
        gens[v] = g
        print(f"[gen] {cid} {p} {v}  {g['chars']}자  gate={gt.get('verdict')}", flush=True)
    rk = rank_pair(cl, p, gens[ver_ids[0]]["text"], gens[ver_ids[1]]["text"],
                   ver_ids[0], ver_ids[1])
    tok += rk["_tok"]
    print(f"[rank] {cid} {p}  winner={rk['winner']} consistent={rk['position_consistent']}", flush=True)
    return ({"cluster_id": cid, "persona": p, "persona_name": PERSONAS[p],
             "versions": ver_ids,
             "gen": {v: {k: gens[v][k] for k in ("text", "chars", "gate")} for v in ver_ids},
             "rank": rk}, tok)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clusters", default="C1_macro_policy,C5_stress_loose")
    ap.add_argument("--personas", default="nt,nf,st,sf")
    ap.add_argument("--versions", default="v3.0.0,v3.2")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()

    versions = load_versions()
    clusters = load_clusters()
    cl_ids = list(clusters) if a.all else a.clusters.split(",")
    personas = a.personas.split(",")
    ver_ids = a.versions.split(",")
    assert len(ver_ids) == 2, "페어와이즈는 정확히 2개 버전"

    run_id = datetime.datetime.now().strftime("run_%Y%m%d_%H%M%S")
    out_dir = os.path.join(ROOT, "runs", run_id)
    os.makedirs(out_dir, exist_ok=True)
    units = [(clusters[cid], cid, p) for cid in cl_ids for p in personas]
    results, errors, tok = [], [], 0
    t0 = time.time()

    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        fut = {ex.submit(do_unit, cl, cid, p, ver_ids, versions): (cid, p)
               for cl, cid, p in units}
        for f in as_completed(fut):
            cid, p = fut[f]
            try:
                res, utok = f.result()
                with _lock:
                    results.append(res)
                    tok += utok
                    json.dump({"partial": True, "results": results},
                              open(os.path.join(out_dir, "results.json"), "w", encoding="utf-8"),
                              ensure_ascii=False, indent=2)
            except Exception as e:
                msg = f"{cid}/{p}: {type(e).__name__}: {str(e)[:200]}"
                print("[ERROR]", msg, flush=True)
                errors.append(msg)

    wins = {v: 0 for v in ver_ids}; ties = 0; inconsistent = 0; gate_fail = []
    for r in results:
        w = r["rank"]["winner"]
        if w == "tie": ties += 1
        else: wins[w] = wins.get(w, 0) + 1
        if not r["rank"]["position_consistent"]: inconsistent += 1
        for v in ver_ids:
            if r["gen"][v]["gate"].get("verdict") == "FAIL":
                gate_fail.append(f"{r['cluster_id']}/{r['persona']}/{v}")
    summary = {"run_id": run_id, "clusters": cl_ids, "personas": personas,
               "versions": ver_ids, "workers": a.workers, "n_pairs": len(results),
               "pairwise_wins": wins, "ties": ties,
               "position_inconsistent": inconsistent,
               "gate_fail": gate_fail, "errors": errors,
               "tokens_total": tok, "elapsed_sec": round(time.time() - t0, 1)}
    json.dump({"summary": summary, "results": results},
              open(os.path.join(out_dir, "results.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print("\n=== SUMMARY ===")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"\nsaved -> runs/{run_id}/results.json")


if __name__ == "__main__":
    main()
