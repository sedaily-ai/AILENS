# 일반 카테고리 선정 실험 하네스

`docs/evaluation/harness/`(MBTI 레터 품질 페어와이즈 평가)와 목적이
다르다 — 이건 "생성된 텍스트가 좋은가"가 아니라 **"선정 로직이 실제
운영 조건에서 규칙을 지키는가"**를 여러 날짜에 걸쳐 빠르게 반복
확인하는 도구다. `docs/prompt/selection/`(프롬프트 버전 이력)의 각
가설을 검증할 때 쓴다.

## 원칙

MBTI 하네스와 같은 원칙(README 참고): 목적은 "평가 인프라 구축"이
아니라 "프롬프트 반복 속도". 무겁게 안 만든다 — 페어와이즈 judge·
동결 클러스터 같은 장치 없이, **그냥 실제 날짜 데이터로 돌려서 규칙
위반을 눈으로 바로 본다.**

## 사용법

```bash
cd docs/evaluation/selection-harness
AWS_PROFILE=default python3 run.py --dates 20260918 20260919 20260920
AWS_PROFILE=default python3 run.py --recent 10   # 최근 10일 자동
```

`selection_prompt.md`(런타임 정본, `pipelines/mustknow_auto/`)를 그대로
읽어서 쓴다 — 프롬프트를 고치면 이 스크립트도 자동으로 새 버전으로
돈다. 프롬프트 자체를 실험용으로 바꾸고 싶으면 `pipelines/mustknow_auto/
selection_prompt.md`를 고치고 돌린 뒤, 결과가 마음에 들면 `docs/prompt/
selection/`에 새 버전 파일로 남긴다(`_TEMPLATE.md` 참고).

## 결과

- `runs/<date>/result.json` — 그 날짜 원본 응답 전체(today_context,
  candidates_total, excluded_count, excluded_reasons, selected)
- `runs/summary.md` — 실행마다 append되는 요약 표(날짜/선정건수/
  카테고리분포/최대쏠림/today_context 요약). **여러 버전을 비교하려면
  이 파일에서 시간순으로 스크롤하면 된다.**
- `runs/`는 git 추적 안 함(`docs/evaluation/.gitignore`) — 대용량 실행
  산출물이라 로컬에만 쌓인다. 남길 가치 있는 발견은 `docs/prompt/
  selection/`의 버전 파일 "검증" 섹션에 옮겨 적을 것.

## 로직은 run.py의 사본이다 — 갱신 주의

`_tab_of()`/사전필터 로직은 `pipelines/mustknow_auto/run.py`의 실제
로직을 복사해온 것이다(seen 테이블 제외 로직만 뺐다 — 이 실험은 매번
"그날 전체"를 새로 평가하는 게 목적이라 seen 여부와 무관해야 함).
run.py 쪽 로직이 바뀌면 여기도 같이 갱신해야 결과가 신뢰할 수 있다.

## 알려진 첫 발견 (2026-09-28, 스모크 테스트 2건)

9/25·9/26 두 날짜 다 "최대쏠림 6건"으로, 프롬프트 규칙("한 카테고리
5건 초과 금지")을 LLM이 자체적으로 못 지켰다. 자체검증 지시는 강제력이
없다는 뜻 — 다음 가설: **다양성 규칙도 `max_count`처럼 클라이언트
사이드 하드컷이 필요하다**(코드 반영 검토 대상, `docs/prompt/selection/`
다음 버전에서 다룰 것).
