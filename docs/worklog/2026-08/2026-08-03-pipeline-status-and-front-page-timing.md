# 2026-08-03 파이프라인 현황 실측 + 1면 기사 XML 타이밍 조사

작성: 문영광 + Claude Code
관련: sedaily-news-xml-storage (ap-northeast-2), v2 EventBridge 룰, docs/product/newsletter-ses-plan.md

## 배경

자동 파이프라인(수집→변환→발행) 재정비를 시작하면서, 지금 무엇이 자동으로 돌고
무엇이 끊겨 있는지 AWS 실측으로 확인했다. 이어서 1면 기사 기반 레터 파이프라인
설계에 필요한 XML 타이밍을 조사했다.

## 한 것

EventBridge 룰 상태 실측 (us-east-1, KST 기준):

| 단계 | 스케줄 | 상태 |
|---|---|---|
| v2-collector | 매일 00:00 | ENABLED, 정상 실행 중 |
| v2-selector | 매일 00:30 | ENABLED, 정상 실행 중 |
| v2-transform-trigger | 5분 폴링 | DISABLED — Lambda 마지막 실행 5월 중순 |
| v2-editor-pick (오늘 한 통) | 매일 01:00 | ENABLED, 오늘도 레터 4편 생성 확인 |
| v2-consolidate (개인화) | 매일 03:00 | DISABLED |

API 검증: `/api/v2/today-letters` 는 8/3 레터 4편 정상 반환.
반면 `/api/v2/article/{오늘기사}?mbti=NT` 는 `version_not_found` —
기사 4버전 변환은 5월 중순부터 중단 상태다.

1면 기사 XML 조사 (sedaily-news-xml-storage, 최근 4일치 + 버전 히스토리):

- `<item>` 안에 `<paper><paperNumber>1</paperNumber><paragraph>TOP|9</paragraph>` 블록 존재.
  1면 식별은 `paperNumber=1` 필터 한 줄이면 된다. 하루 200건 중 지면 기사는 17건 수준.
- D일자 지면의 1면 기사 4건은 D-1일 파일에 담긴다 (등록 17:24~17:58,
  마지막 기사 발행시각 23:24~23:34). D일 파일에는 당일 수정분(action=U)만 재등장.
- XML 파일은 5분 간격으로 하루 종일 덮어쓰기 갱신 (버저닝 ON, 일 80~119회 쓰기).
- 표본 3일 모두 1면은 정확히 4건 (TOP 1 + 일반 3). 일요일자 신문은 없음 (8/1 파일 1면 0건).

뉴스레터 샘플: 오늘자 레터 4편을 `v2/newsletter/render.py` 로 렌더링해 시연용 HTML 생성.
(스크래치 위치라 보존 필요하면 마스터DB/04_콘텐츠 로 복사할 것)

## 결정

- 1면 레터 파이프라인 트리거는 KST 00:10 / 01:10 / 02:10 3회 시도 + 처리완료 시 스킵.
  읽는 대상은 어제 파일 + 오늘 파일 둘 다 (자정 넘긴 늦은 판갈이 대비).
- 4건 선정 로직은 만들지 않는다. 1면 = 4건이 기본값. 5건 이상이면 TOP 우선 + 등록순 4건,
  3건 이하면 2·3면에서 보충, 0건(일요일자)이면 스킵.

## 다음

- transform 재가동 여부 결정 필요 — KPF 검수 기준(주요 기사 일 30~80건 4유형, 월 1,000건)과
  직결. selector top-N 을 좁혀 Opus 비용 통제하면서 재개하는 안이 유력. 재가동 전 비용 추정 먼저.
- 로컬 repo 가 배포본보다 뒤처져 있음 — 배포된 v2-front-page-dev(7/29)는
  feat/front-page-live-data 브랜치에만 있는 핸들러. 파이프라인 작업 전에 브랜치 정리 필요.
- ~~뉴스레터 에디터 세트 통일 여부~~ → 확인 결과 비이슈. 시현/지원/정훈/하은은 v1 레거시이고
  민철/하은/준서/소율(하은=NF)이 v3 정본 (커밋 e9a3513). render.py 는 이미 정본과 일치.
