# M0-b 공유코드 승격 순서 — 의존 그래프 기반

작성: 2026-10-13. 짝: `모노레포-정석구조-설계.md`. 목적: shared/* 를 `@ailens/*` 패키지로 옮길 때 **의존 그래프 역순(잎→뿌리)**으로 끊어, 각 단계가 미해결 import 없이 독립 검증·커밋되게 한다.

## 결론 먼저

- 순서: **URL헬퍼 → constants → api-client → content/date**. 이 역순이라야 각 단계에서 "옮기는 모듈이 아직 shared 에 남은 것을 참조"하는 일이 없다.
- api↔content 는 진짜 순환이 아니다. api 가 쓰는 content 쪽(letterHref·lensUrl·displayHeadline)은 api 를 안 쓴다. 이 3개를 먼저 떼면 간선이 끊긴다.

## 실측 의존 그래프 (2026-10-13)

```
apiClient.ts         무의존(순수 바닥층)
auth/authFetch  →    auth/amplifyLoader (auth 내부 완결)
constants/*          대부분 순수. lensUrl 이 econCategories 참조

api/* (9개)     →    @/shared/config/apiClient (바닥)
                →    @/shared/lib/auth/authFetch
                →    content/{letterHref, lensUrl, displayHeadline}   ← 이 간선이 문제
                     (todayLettersApi 하나가 씀)

content/* (10개)
  순수잎: letterHref(무의존), displayHeadline(무의존), lensUrl(constants만)
  api의존: compareCard, archiveItems, homeFeedTrim, topArticle  → @/shared/lib/api
  date의존: archiveItems → date

date/* (5개)    →    constants/timeline
```

핵심: **api → content(순수 URL헬퍼 3개)** 는 단방향. **content(compareCard 등) → api** 도 단방향. 둘은 content 내부의 서로 다른 파일이라, URL헬퍼 3개를 먼저 domain 으로 빼면 패키지 간 순환이 생기지 않는다.

## 승격 순서 (각 단계 = 독립 PR, 타입체크 필수, content/date 단계는 full build)

1. **[완료] poll, types → @ailens/domain** (잎, 검증·빌드 끝)
2. **URL헬퍼 3개 → @ailens/domain**: letterHref, displayHeadline, lensUrl(+constants 의존분 처리). api 가 이걸 domain 에서 가져오게 바꾸면 api→content 간선 소멸.
3. **constants → @ailens/domain(또는 @ailens/config)**: econCategories, lensPerspectives, timeline 등. date·lensUrl 의 constants 의존 해소.
4. **api-client → @ailens/api-client**: shared/lib/api 9개 + shared/config/apiClient. 이 시점엔 api 의 모든 의존(apiClient·auth·URL헬퍼·constants)이 이미 패키지화돼 미해결 import 없음. auth 는 @ailens/auth 로 함께/선행.
5. **content/date 나머지 → @ailens/domain**: compareCard·archiveItems·homeFeedTrim·topArticle(이제 api 를 @ailens/api-client 에서 가져옴), date 전부.

## 왜 "밀어붙이기"로 한 번에 안 하나

- api 를 통째로 옮기면 content URL헬퍼 3개가 따라와야 하고, 그 상태로 content 의 api 의존 파일이 남으면 패키지 경계를 넘는 순환이 생긴다.
- 76개(api) + 55개(content) + 36개(date) import 를 한 PR 에 몰면 라이브 웹 빌드가 한 번에 깨질 위험. 단계마다 타입체크+build 로 끊어야 롤백 지점이 생긴다.
- 메모리 TIGHT 환경에서 full build 는 단계당 1회로 제한해야 안전(힙 2560MB 로 성공 확인).

## 안 하는 것

- 의존 그래프를 무시한 "통째 이동".
- URL헬퍼 분리 없이 api 를 옮겨 패키지 간 순환 만들기.
- 단계 생략한 대형 단일 PR.
