"""정적 HTML 리포트 — 클러스터×버전×페르소나 나란히 + 게이트 + 페어와이즈.
사용: python3 report.py runs/<run_id>   → 해당 폴더에 index.html
S3/CloudFront 배포는 다른 프로젝트와 동일 패턴(서버 불필요)."""
import sys, os, json, html

def esc(s): return html.escape(str(s)).replace("\n", "<br>")

def build(run_dir):
    data = json.load(open(os.path.join(run_dir, "results.json"), encoding="utf-8"))
    s = data["summary"]; v1, v2 = s["versions"]
    H = [f"""<!doctype html><html lang=ko><meta charset=utf-8>
<title>MBTI 프롬프트 평가 — {s['run_id']}</title>
<style>
body{{font-family:-apple-system,Pretendard,sans-serif;margin:0;background:#f6f7f9;color:#1a1a1a}}
.wrap{{max-width:1180px;margin:0 auto;padding:32px 20px 80px}}
h1{{font-size:20px}} h2{{font-size:16px;margin-top:36px}}
.sum{{background:#fff;border-radius:14px;padding:20px 24px;box-shadow:0 1px 3px rgba(0,0,0,.06);margin:16px 0}}
.sum b{{font-size:22px}}
table{{border-collapse:collapse;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)}}
td,th{{border:1px solid #eceef0;padding:12px 14px;vertical-align:top;font-size:13px;line-height:1.7}}
th{{background:#fafbfc;font-weight:600}}
.pair{{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:10px 0 28px}}
.col{{background:#fff;border-radius:12px;padding:18px 20px;box-shadow:0 1px 3px rgba(0,0,0,.06)}}
.tag{{display:inline-block;font-size:11px;padding:2px 9px;border-radius:999px;margin-right:6px}}
.win{{background:#e7f6ec;color:#1a7f37}} .lose{{background:#f3f4f6;color:#6b7280}}
.tie{{background:#fff4e5;color:#b25f00}} .fail{{background:#fde8e8;color:#c0392b}}
.pass{{background:#e7f6ec;color:#1a7f37}}
.body{{white-space:pre-wrap;font-size:12.5px;line-height:1.85;max-height:420px;overflow:auto;background:#fbfbfc;border-radius:8px;padding:14px;margin-top:10px}}
small{{color:#6b7280}}
</style><div class=wrap>
<h1>MBTI 프롬프트 평가 — {s['run_id']}</h1>
<div class=sum>
<b>{v1}</b> {s['pairwise_wins'].get(v1,0)}승 &nbsp;·&nbsp; <b>{v2}</b> {s['pairwise_wins'].get(v2,0)}승 &nbsp;·&nbsp; 무 {s['ties']} &nbsp;|&nbsp;
페어 {s['n_pairs']} · 위치불일치 {s['position_inconsistent']} · 게이트탈락 {len(s['gate_fail'])}<br>
<small>클러스터 {', '.join(s['clusters'])} · 토큰 {s['tokens_total']:,} · {s['elapsed_sec']}s ·
방법: 블라인드 페어와이즈(위치스왑2) + 이진게이트 · Gen sonnet-4.6 / Judge opus-4.7</small>
</div>"""]

    # 매트릭스
    H.append("<h2>페어와이즈 승자 매트릭스</h2><table><tr><th>클러스터</th>"
             + "".join(f"<th>{p}</th>" for p in s["personas"]) + "</tr>")
    by = {(r["cluster_id"], r["persona"]): r for r in data["results"]}
    for cid in s["clusters"]:
        H.append(f"<tr><td><b>{cid}</b></td>")
        for p in s["personas"]:
            r = by.get((cid, p))
            if not r: H.append("<td>-</td>"); continue
            w = r["rank"]["winner"]
            cls = "tie" if w == "tie" else "win"
            cons = "" if r["rank"]["position_consistent"] else " <small>(위치불일치)</small>"
            H.append(f'<td><span class="tag {cls}">{w}</span>{cons}</td>')
        H.append("</tr>")
    H.append("</table>")

    # 본문 나란히
    for cid in s["clusters"]:
        for p in s["personas"]:
            r = by.get((cid, p))
            if not r: continue
            H.append(f"<h2>{cid} · {p} {r['persona_name']} "
                     f"<small>— 승자 {r['rank']['winner']}</small></h2><div class=pair>")
            for v in s["versions"]:
                g = r["gen"][v]; gt = g["gate"]
                gv = gt.get("verdict", "?")
                gcls = "pass" if gv == "PASS" else "fail"
                wtag = ("win" if r["rank"]["winner"] == v else
                        "tie" if r["rank"]["winner"] == "tie" else "lose")
                H.append(
                    f"<div class=col><span class='tag {wtag}'>{v}</span>"
                    f"<span class='tag {gcls}'>gate {gv}</span>"
                    f"<small>{g['chars']}자 · fact {gt.get('fact')} / 경계 {gt.get('persona_boundary')} / 환각 {gt.get('hallucination')}</small>"
                    f"<div class=body>{esc(g['text'])}</div></div>")
            H.append("</div>")
    H.append("</div></html>")
    out = os.path.join(run_dir, "index.html")
    open(out, "w", encoding="utf-8").write("".join(H))
    print("report ->", out)

if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else max(
        (os.path.join("../runs", d) for d in os.listdir("../runs")), key=os.path.getmtime))
