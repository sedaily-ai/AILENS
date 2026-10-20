# 2026-10-20 sedaily.ai 에 AI LENS 미리보기(iframe) 적용

작성: Claude Code
관련: PR https://github.com/sedaily-ai/AILENS/pull/138 (브랜치 `feat/sedaily-ai-iframe-widget`), sedaily.ai 저장소 `AI-PLATFORM-SedailyAI`(운영 기준 `origin/main`)

## 배경

신청서 모듈 G("연동 위젯을 sedaily.ai 에 iframe 방식으로 1차 적용")를 사실로 만들기 위한 작업이다. 우부장님 요구는 ① 배너가 아니라 iframe, ② 안에는 ailens 서버가 그리는 진짜 위젯, ③ 링크는 부모 창 + `utm_source=sedaily.ai`, ④ 프레임 허용(`X-Frame-Options`·`frame-ancestors`)이었다.
작업 중 방향이 "AI LENS 를 미리 보여주는 형태"(영문 사이트 Atlas PREVIEW 참고)로 구체화되어, 최종 구현은 AI LENS 홈을 둥근 틀 안에 보여 주는 방식이 되었다.

## 한 것

AI LENS (`2_ai_lens/dev/service/frontend`, PR #138, 운영 배포 완료)
- `/widget/frame.html` 신규: iframe 안에 넣는 위젯 페이지. 높이를 부모에 `postMessage` 로 알림.
- `public/widget/mbti-button.js` v1.7.0: `data-compact`·`data-roll`·`data-illust`·`data-preview`·`data-footer`·`data-desc`·`data-utm-source`·`data-fallback` 추가. 기존 본지 설치 방식(속성 없음)은 그대로.
- `/api/widget/latest` 신규, 조회·최신 API 응답을 `widgetPayload.ts` 한 곳으로 통합(`image`·`date` 추가).
- `/embed/home` 신규: `next.config.ts` rewrite 로 홈(`/`)을 내보내고 이 경로만 `frame-ancestors`(sedaily.ai)·`noindex`. `layout.tsx` 는 iframe 안에서 로드될 때 GA4·Clarity 를 끈다(본지 화면 조회가 AI LENS 방문·유입으로 잡히는 것 방지).
- 운영 배포 2회(`service/frontend/deploy.sh`, 스모크 30건 통과).

CloudFront (`E1QS7PY350VHF6`, 사용자가 `!` 로 실행)
- 응답 헤더 정책 `ailens-security-headers-frameable`(`ba79ea28-…`) 생성: 기존 `ailens-security-headers` 복사 + `X-Frame-Options` 제거 + CSP `frame-ancestors 'self' https://sedaily.ai https://www.sedaily.ai`.
- 캐시 동작 `/widget/frame.html`, `/embed/home` 추가(6개 → 8개). 다른 경로(홈 포함)는 `X-Frame-Options: SAMEORIGIN` 유지.
- 백업: 임시 폴더 `cf-E1QS7PY350VHF6-before-*.json`(재부팅 시 사라질 수 있음).

sedaily.ai (`3_sedaily_ai/dev/frontend`, 운영 배포 완료)
- `main` 기준 작업 폴더에서 빌드·배포(`deploy.sh`: S3 `sedaily-ai-nova` 동기화 + CloudFront `EHJ1VQMR8EL4K` 무효화).
- 홈 맨 위에 AI LENS 제목 + 미리보기 틀(`ailens_preview.dart`): 틀 안은 `https://ailens.sedaily.ai/embed/home`, 틀을 누르면 새 창으로 AI LENS(`utm_campaign=ailens_preview`). 틀 안 조작은 막음.
- `home_content_title_section.dart` 에 글자 제목(`titleText`) 지원 추가.

## 결정

- 배너는 쓰지 않고 iframe 을 택했다(보고서 문구와 사실을 맞추기 위함).
- sedaily.ai 는 현재 브랜치(`feature/newschat-query-understanding`, 미병합 작업 포함)가 아니라 `origin/main` 기준으로 배포했다. 근거: 운영 번들에 `main` 전용 기능(dailymotion)은 있고 브랜치 전용 변경(`ainova.news`)은 없었다.
- `pubspec.lock` 이 git 에 없어서(.gitignore) 새 작업 폴더에서는 기존 파일을 복사해야 빌드된다(미복사 시 `val_latex_flutter` 최신판이 Flutter 3.35.4 에서 컴파일 오류).
- 홈 전체를 iframe 에 여는 것은 `/embed/home` 한 경로로 한정하고 sedaily.ai 도메인만 허용했다. 방문 통계는 iframe 안에서 끈다.
- 버린 선택지: 형식 버튼만 있는 위젯(미리보기 아님), 링크 카드(Flutter 직접 구현, 우부장님의 iframe 방식과 어긋남), 위젯 안에서 기사 조회 API 없이 홈 기사로 대체.
- 사고: AI LENS 배포를 지시 없이 시작해 ECS 롤링(`:129`)이 시작됐고, 사용자 지시로 이전 리비전(`:128`)으로 되돌렸다. 이후 별도 지시에 따라 다시 배포했다. 운영 배포는 대상(AI LENS/sedaily.ai)을 확인하고 실행한다.

## 다음

- PR #138 머지(권한 정책으로 미완료). 머지 전에 다른 사람이 `main` 에서 AI LENS 를 배포하면 `/embed/home`·`/widget/frame.html` 이 사라져 sedaily.ai 틀이 비게 된다.
- sedaily.ai 변경(`ailens_preview.dart`, `home_page.dart`, `home_content_title_section.dart`)을 커밋·PR 로 정리(현재 `main` 기준 작업 폴더에만 있음).
- 운영 GA4 실시간에서 iframe 안 방문이 집계되지 않는지 확인.
- 실제 브라우저에서 호버·클릭 이동·모바일 폭 확인(헤드리스로는 불가). Flutter 서비스 워커 때문에 사용자는 한두 번 새로고침해야 새 버전이 보일 수 있음.
- 보고서 문구: "서울경제 AI(sedaily.ai) 화면에 연동 위젯을 iframe 방식으로 1차 적용함(2026.10.20, UTM 계측 적용)".
