# 2026-08-23 자동 파이프라인 실가동 모니터링에서 발견한 버그 3건

작성: Claude Code
관련: pipelines/mustknow_auto/run.py, pipelines/webtoon/pipeline.py,
pipelines/video/generate_script.py,
docs/worklog/2026-08/2026-08-23-mustknow-auto-tts-and-go-live.md

## 배경

같은 날 `mustknow_auto`가 하루 6회 자동 실행을 시작한 직후, 사용자가
"자동 파이프라인은 잘된건가?"를 반복해서 물으며 실제 CloudWatch 로그와
DynamoDB 상태를 직접 확인하게 됐다. 그 과정에서 로그·데이터를 직접
들여다보다 발견한 실제 프로덕션 버그 3건을 정리한다.

## 한 것

1. **Bedrock JSON 파싱이 코드블록 형식에 취약**: `webtoon/pipeline.py`의
   `_extract_json_block`(및 동일 패턴의 `video/generate_script.py`
   `extract_json_block`)이 ` ```json ` 펜스가 있는 경우만 파싱했는데,
   실제로 15:00 KST 실행에서 Claude가 가끔 펜스 없이 응답해 기사 2건
   (`20082215`, `20082229`)의 웹툰 2단계(장면연출)가
   `ValueError: Bedrock 응답에서 JSON 코드블록을 찾지 못했습니다`로
   실패했다. 펜스 → 펜스없는 코드블록(`{`로 시작) → 원문 전체를 그대로
   JSON으로 → 첫 `{`~마지막 `}` 구간, 순서로 폴백하도록 다시 짰다.
2. **"AI 프리즘" 다이제스트 칼럼이 4포맷 변환 대상에 섞임**: 사용자가
   실제 기사 URL을 들고 "프리즘 기사는 변환에 사용 안 하는 기사"라고
   지적. `subTitle`이 `"■AI 프리즘 [카테고리] 뉴스"`로 시작하는 게
   고유 마커임을 실제 XML로 확인(일반 기사가 쓰는 범용 "■" 요약 접두어와
   겹치지 않음을 30여 건 샘플로 검증). `mustknow_auto/run.py`의 사전필터
   체인에 `fresh = [a for a in fresh if "AI 프리즘" not in a["sub_title"]]`
   추가.
3. **일요일에도 지면특별코너 4탭을 시도함**: "오늘은 일요일이라.. 지면
   안나오거덩... 일요일은.. 일반기사만.. 돌려야함요." — 지면특별코너
   4탭(전체/증권/산업/시그널)은 신문 지면이 있다는 전제인데 일요일엔
   지면 자체가 없다. `main()`에 `is_sunday = datetime.now(KST).weekday()
   == 6` 체크를 추가해, 일요일엔 "전체" 지면1면 조회·루프와
   "증권/산업/시그널" 루프를 통째로 건너뛰고 상시 배치 채점 + "일반"
   경로만 돈다. 실제 실행 로그에 "(일요일 — 지면특별코너 4탭 전부 스킵,
   일반만 처리)" 문구로 확인.
4. **(이 파일 이후 작업) `_mark_seen`이 발행 성공 여부와 무관하게
   무조건 호출됨**: 위 1번 버그로 실패한 두 기사(`20082215`,
   `20082229`)가 `sedaily-lens-mustknow-seen-dev`에 점수와 함께 seen으로
   영구 마킹된 걸 DDB 직접 조회로 확인 — 즉 1번 버그를 고쳐도 이 두
   기사는 다시는 재시도되지 않는 상태였다. 원인은 `_try_publish()`가
   내부에서 예외를 잡아 `results["failed"]`로만 기록하고 호출부엔 아무
   것도 알려주지 않아서, `main()`의 3개 호출부(전체/증권-산업-시그널/
   일반)가 성공 여부와 상관없이 곧바로 `_mark_seen(...)`을 불렀기
   때문. `_try_publish()`가 상태 문자열("skipped_duplicate"/실제
   status/"failed")을 반환하도록 바꾸고, 3개 호출부 전부
   `status != "failed"`일 때만 `_mark_seen`을 호출하도록 수정.
   막힌 두 기사(`20082215`, `20082229`)는 `sedaily-lens-mustknow-seen-dev`
   에서 직접 `delete-item`으로 제거해 재시도 가능 상태로 복구.
   같은 날 이미 만들어 뒀던 `frontpage_auto/run.py`는 이 문제와 무관함을
   확인 — 거기는 별도 seen 캐시 없이 매 실행마다 CMS 테이블에
   `_already_published()`로 직접 조회하는 구조라 실패한 기사가 자동으로
   다음 실행에서 재시도된다.
- 공유 Docker 이미지 재빌드·ECR push, `frontpage_auto` 태스크 정의 새
  리비전(7) 등록 (`mustknow_auto`는 `:latest` 태그를 그대로 참조해서
  별도 리비전 불필요).
- `mustknow_auto` 태스크 수동 1회 재실행(`run-task`)으로 복구된 두 기사가
  실제로 재시도·발행되는지 확인.

## 다음

- 이번 수동 실행 결과(발행 건수, 두 기사의 최종 처리 여부)를 사용자에게
  보고.
- 며칠 더 자동 실행 로그를 관찰해 이 세 버그류(JSON 파싱, 프리즘 필터,
  일요일 가드, seen 마킹 타이밍)가 재발하지 않는지 확인.
