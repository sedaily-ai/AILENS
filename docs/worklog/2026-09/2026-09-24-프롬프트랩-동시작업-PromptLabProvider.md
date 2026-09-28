# 프롬프트 실험 4탭 진짜 동시작업 — PromptLabProvider 아키텍처 전환 (2026-09-24)

## 문제 발견

- "대화 다른 곳에 머물러도 될 수 있게" 요청 — 탭 전환 시 웹소켓 연결·채팅 상태·영상 카드가 매번 초기화됨

## 문제 정의

- `PromptLab.tsx`가 4개 페이지(webtoon/podcast/video/posts) 각각에 독립 마운트되고, 탭 전환이 `key={category}` 방식이라 탭을 바꾸면 이전 탭 컴포넌트 전체가 언마운트됨
- 언마운트되면 `PromptChatLab.tsx`/`PromptTextLab.tsx`가 각자 갖고 있던 `useAdminChatSocket()` 웹소켓 연결과 내부 state(채팅 메시지, 생성 중인 카드)가 전부 소실
- 포커스 모드(`/posts/edit`)와 일반 모드가 각자 다른 `AuthGuard`로 감싼 별개 트리라 페이지 이동만으로도 같은 문제 발생

## 왜 그렇게 했는지

- `PromptChatLab.tsx`/`PromptTextLab.tsx` 내부는 이미 독립 웹소켓 연결을 스스로 갖고 있어 마운트만 유지하면 연결도 자동 유지됨을 확인 — 내부 로직은 손대지 않고 바깥 마운트/언마운트 정책만 바꾸는 것으로 범위를 좁힘
- 새 전역 상태관리 라이브러리 대신 Context(`Toast.tsx`가 유일한 선례) 패턴으로 `PromptLabProvider.tsx` 신설 — 기존 저장소 관례를 그대로 따름
- 단일 웹소켓 연결로 통합하는 대신 "카테고리당 연결 1개, 최대 4개" 유지를 선택 — 백엔드 `text_chunk`/`text_done` 푸시에 카테고리 식별자가 없어 통합하려면 백엔드까지 바꿔야 하는데, 내부 관리자 도구 트래픽 규모상 그럴 실익이 낮다고 판단

## 어떻게 달라졌는지

| | 이전 | 이후 |
|---|---|---|
| 탭 전환 | `key={category}` — 매번 리마운트, 상태 전부 소실 | 방문한 탭만 마운트 유지, 비활성 탭은 CSS `hidden`으로만 숨김 |
| 포커스 모드 이동 | 별도 `AuthGuard` 트리, 상태 소실 | `AuthGuard`+`PromptLabProvider` 단일 트리, 상태 유지 |
| 페이지별 상태 소유자 | 4개 페이지 각자 로컬 `panelOpen` | `PromptLabProvider`(Context) 단일 소유, `usePromptLab().open()` 호출로 교체 |
| 영상 카드 새로고침 대비 | 없음 | localStorage 백업 + `renderStatus`=rendering 시 폴링 자동 재개 |

- 부수 발견: 탭 상시 마운트 구조로 바뀌며 `GET /admin/elevenlabs/options`가 4곳(팟캐/영상 각각의 음성 카드+발행 설정 패널)에서 독립 호출되는 것이 드러남(탭 2개만 열어도 중복 조회 최소 2회, ElevenLabs 선택 시 최대 4회) — 신규 캐싱 로직 대신 기존 `cachedGet`(대시보드용, 메모리+sessionStorage, 60초 TTL)으로 감싸 호출부 무변경으로 해결. `getCurrentModel`도 동일 적용
- `?panel=chat` URL 동기화는 "실시간 반영"에서 "새로고침 시 최초 1회 복원"으로 의도적으로 축소 — Provider가 상태 소유자가 된 이상 4페이지 각자의 필터(status/dateRange/search/page/channel)와 얽는 복잡도 대비 실익이 낮다고 판단
- 관리자 프론트엔드 + ECS 이미지(리비전 67) 배포 완료

## 다음

- 직후 사용자 지적("생성했던 음성·영상·웹툰이 대화 나갔다 오면 사라짐")으로 생성물-대화저장 작업으로 이어짐(같은 날 별도 기록)
