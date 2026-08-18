# 2026-08-18 프론트엔드 구조 리팩토링 + /letters·/column 아카이브 정리

작성: Claude Code
관련: service/frontend, 커밋 3b9bccb / 74a18ca / 323d004 / c38d323 / e21375c

## 배경

기존 GEO/SEO 작업(사이트맵 14일 제한 수정 등)을 마친 뒤, 사용자가 여러 큰
파일(`ArchiveTab.tsx`, `shared/lib/`, `src/app/`)을 가리키며 "리팩토링/폴더화
할 게 없는지" 순서대로 물어봐서 구조 정리를 이어갔다. 마지막엔 `(content)`
라우트 그룹을 보다가 "여기서 안쓰기로 한 콘텐츠 채널이 있지 않나요?"라는
질문으로 `/letters`, `/column` 아카이브 목록 페이지가 nav 개편 이후 사실상
도달 불가능해진 걸 발견 → 삭제 및 리다이렉트 처리로 이어졌다.

## 한 것

- **shared 컴포넌트 추출**: 소셜 공유 아이콘·버튼, 폰트 크기 조절, 인쇄 버튼을
  `shared/ui/`로 승격해 `LensViewClient.tsx`/`LetterDetailClient.tsx`의 중복
  ~400줄 제거.
- **`ArchiveTab.tsx` 분리**: 893줄 → 307줄. 7개 하위 컴포넌트로 분리. 그 과정에서
  삭제 버튼이 서버 동기화 없이 로컬 상태만 지우는 실제 버그를 발견했으나(고쳐진
  `handleDelete`가 있는데 어떤 버튼에도 연결 안 돼 있었음) 순수 구조 리팩토링
  범위를 벗어나 고치지 않고 죽은 코드만 삭제.
- **`shared/lib/` 폴더화**: 22개 파일을 `api/`, `chat/`, `seo/`, `tracking/`,
  그리고 새 `shared/hooks/`로 재배치(78개 파일의 import 경로 일괄 수정).
- **`src/app/` 라우트 그룹화**: 30개 플랫 라우트 폴더를 `(economy)/`,
  `(content)/`, `(company)/`, `(auth)/` 4개 그룹으로 재배치 — Next.js 라우트
  그룹은 URL에 영향 없음, 166페이지 빌드 결과·24개 이동 URL 전부 라이브 curl로
  동일함을 확인.
- **`/letters`, `/column` 아카이브 목록 페이지 삭제**: 2026-08-17 상단 탭 개편
  (형식 기준 → 증시/부동산/산업/금융/국제/재테크 6개 카테고리 기준) 이후 두
  페이지 다 nav 진입점이 없어 사이트 안 어디서도 링크되지 않는 상태였음(과거
  링크하던 `ColumnPreviewSection` 등은 이전 Phase 4 정리에서 이미 삭제됨).
  `/letters/[id]`(개별 레터 상세)·`/letters/view`는 그대로 유지.
  - `next.config.ts`에 `/letters`, `/column` → `/archive` 영구 리다이렉트
    추가(`:path*` 없이 정확한 경로만 — 하위 라우트는 영향 없음).
  - `sitemap.ts` STATIC_ROUTES에서 두 항목 제거.
  - `letters/[id]/page.tsx`의 BreadcrumbList JSON-LD가 `/letters` 대신
    `/archive`를 바로 가리키도록 수정(리다이렉트 홉 제거).
  - `headerTabs.ts` 주석, `llms.txt`, `AnnouncementBar.tsx`, `SiteFooter.tsx`의
    잔여 링크·설명 정리.
  - 라이브 확인: `/letters`·`/column` → 308 → `/archive`, `/letters/view`·
    `/letters/{id}` → 200 정상.

## 결정

- 라우트 폴더명(`letters`, `column` 등) 자체는 URL과 직결되므로 이번 세션
  내내 그대로 뒀고, 그룹화는 순수히 Next.js route group(괄호 폴더)만 사용.
- `/letters`·`/column`은 "폐기"가 아니라 "성격이 카테고리 6개로 흡수"된 것으로
  판단해 `/archive`로 리다이렉트(410/404 대신) — 검색엔진에 이미 색인된 URL의
  자산을 보존.
- `ArchiveTab.tsx`에서 발견한 삭제 버튼 버그는 별도 논의 없이 고치지 않음
  (동작 변경은 순수 리팩토링 범위 밖).

## 다음

- `ArchiveTab.tsx`의 삭제 버튼이 서버에 실제로 반영 안 되는 버그 — 별도로
  다뤄야 함(사용자에게 이미 보고했으나 미해결).
- `LetterDetailClient.tsx`(1697줄) 등 `app/` 아래 남은 대형 `*Client.tsx`
  파일들의 FSD 정리는 이번 세션에서 다루지 않음.
