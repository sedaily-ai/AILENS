# 2026-08-03 뉴스레터 HTML 렌더 다듬기

작성: 문영광 + Claude Code
관련: feat/newsletter-render-polish, service/backend/v2/newsletter/render.py

## 배경

뉴스레터 샘플을 외부에 보여주기 전에 이메일 HTML 품질을 다듬었다.
기존 렌더는 레터 body 라인을 전부 동일한 <p> 로 찍어서, 섹션 헤더(■)와
Q&A 라인이 구분 없이 벽처럼 보였다.

## 한 것

- `_render_body()` 신설 — editor-pick body 의 세 라인 패턴을 구조화 렌더:
  "■ N. 제목" → 액센트 좌측 보더의 섹션 헤더, "Q. ...? A. ..." → 회색 박스 Q&A 블록
  (Q는 액센트 컬러 볼드), 나머지 → 일반 문단.
- 그룹별 액센트 컬러 도입 — frontend `mbtiGroups.ts` 와 동일 값
  (NT #3B82F6 / NF #8B5CF6 / ST #22C55E / SF #F97316). 에디터 라벨·KEY POINTS
  라벨·CTA 버튼에 적용되어 4편이 시각적으로 구분된다.
- 에디터 역할 라벨을 editorsData.ts v3 정본으로 정렬 (전략 분석 에디터 등).
- 이메일 클라이언트 호환 유지: 인라인 스타일만, hex8/그라데이션 없음.
- 테스트 5개 통과 (`v2/tests/test_newsletter.py`), 오늘자 레터 4편으로 샘플 재생성 검증
  (섹션 헤더 4개·Q&A 블록 6개 파싱 확인, ■ 기호 출력 0건).

## 결정

- 색은 그룹당 1색만, 배경은 중립 유지 — 과한 장식 없이 톤(활자·종이) 보존.
- 이름·컬러 정본은 frontend (editorsData.ts / mbtiGroups.ts). render.py 주석에 명시.

## 다음

- 실발송 전 주요 클라이언트(Gmail 웹/모바일, 네이버, Outlook) 렌더 확인.
- 발송 자동화(스케줄) 여부는 파이프라인 트랙에서 결정.
