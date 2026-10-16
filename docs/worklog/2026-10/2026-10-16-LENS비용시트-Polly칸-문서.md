# 2026-10-16 LENS 비용 시트에 Polly 칸 추가 — 비용 문서 반영

작성: Kiro
관련: AI-dashboard [PR #137](https://github.com/sedaily-ai/AI-dashboard/pull/137), AI-dashboard `dev_logs/2026-10-16_lens-sheet-polly-column.md`, `architecture/비용태깅_규칙.md` §7, `architecture/비용시트_파이프라인.md`

## 배경

마스터DB `LENS` 탭 1~10주차 총비용에 Amazon Polly가 한 번도 잡히지 않았다. Polly는 요청에 태그를 붙일 자리가 없어
항상 미태깅(`Not Applicable`)으로만 청구되는데, 시트 파이프라인은 `Service` 태그 비용만 읽었기 때문이다.
팟캐스트·영상 TTS를 Polly로 바꾼 2026-08-27(`7956c6c4`) 이후 주 $12~26, 1~10주차 합 $141.02(BillingON 실값).

## 한 것

- AI-dashboard에서 파이프라인이 미태깅 `Amazon Polly`를 LENS 비용으로 귀속하도록 바꾸고, 시트에 `Amazon Polly` 칸(AD·AE)을 추가했다(PR #137).
- 이 레포 문서 반영: `architecture/비용태깅_규칙.md` §7(Polly 행·설명)·§8(체크리스트), `architecture/비용시트_파이프라인.md` 사본 갱신 + §0 표에 「태그를 붙일 수 없는 서비스」 행.
- AWS 리소스 변경·Bedrock 호출은 하지 않았다.

## 결정

- Polly는 태그로 귀속할 수 없으므로 서비스명 정확 일치로 귀속한다. 같은 계정의 ENG Lambda도 Polly를 호출해(W45 CloudTrail 건수: LENS 89.2% · ENG 10.5%) 이 값은 LENS 몫의 **상한**이고, 시트 메모에 매주 그렇게 적는다.
- 미태깅 전체를 합치지 않는다 — Kiro 좌석 등이 압도적($13,063 / 10주)이다. 귀속 목록은 AI-dashboard 코드의 `UNTAGGED_TO_LENS`.
- 3~7주차 미태깅 이미지 생성(약 $366, 6주차 $239.42)은 이번 범위에서 제외했다.

## 다음

- AI-dashboard PR #137 머지 후 `Weekly LENS sheet cost` dry_run → 1~10주차 백필.
- 이 레포가 태그를 붙일 수 없는 AWS 서비스를 새로 쓰면 AI-dashboard `UNTAGGED_TO_LENS`에 서비스명 추가를 요청한다(`비용태깅_규칙.md` §8).
