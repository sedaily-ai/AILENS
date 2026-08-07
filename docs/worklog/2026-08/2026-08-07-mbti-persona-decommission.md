# 2026-08-07 MBTI 4-페르소나 구조 전면 폐지

작성: Claude Code
관련: `f84fd06` chore(mbti): 사이트 전역 MBTI 4-페르소나 구조 폐지, `18db88a`, `12be40d`

## 배경

MBTI 페르소나(NT/민철, NF/하은, ST/준서, SF/소율) 기반 AI 리라이팅 파이프라인은 이미 사실상
멈춰 있었고(Transform Lambda 등은 2026-08-04에 별도로 삭제됨, CLAUDE.md "v1/v2 Parallel
Redesign" 참조), 다시 새로 설계할 예정이라 기존 4-페르소나 구조를 코드베이스 전체에서
걷어내기로 사용자가 명시적으로 결정했다 ("전체 다 없애시죠. AI 파이프라인 지금 사실상
없다고 보시면 됩니다. 다시 만들 거라서요. 걍 삭제하심 됩니다.").

## 한 것

- **백엔드**: `mbti_transform_service.py`, `persona_curation_service.py`,
  `prompts/transform/{nt,nf,st,sf}.md`, `test_model_comparison.py` 삭제. `config/constants.py`
  에서 `PERSONA_SIGNATURE_CATEGORIES`/`PERSONA_CATEGORY_L1_FALLBACK`/`MBTI_GROUPS`/
  `MBTI_GROUP_INFO` 제거, `PODCAST_VOICE_STYLES` → 단일 `DEFAULT_VOICE_STYLE`. 뉴스레터·챗봇·
  음성·유저·기사·브리핑·질문·검색 핸들러 전반의 MBTI 분기를 단일 기본 동작으로 정리.
  `timeline_handler.py`의 `personas` 모드(미배포 기능) 삭제. 240개+ pytest 통과 확인.
- **어드민**: `PostForm.tsx`/`lib/types.ts` 에서 MBTI 필드·피커 제거.
- **프론트엔드**: `todayLettersApi.ts`에서 `mbti_group`/`PERSONA_META`/`DELIVERY_HINT` 등 제거,
  letter 식별을 `{group}-{date}` 조합에서 `letter.id` 단일 키로 전환. `/editors` 라우트,
  `BriefingPage.tsx`, `useMbtiGroup.ts`, `mbtiGroupStorage.ts` 삭제. `SmartSearchOverlay.tsx`
  페르소나 선택 UI 제거하고 단일 기본 정체성으로 재작성.
  - 의도적으로 안 지운 것: `shared/data/mbtiGroups.ts`, `shared/types/mbti.ts` — `FeedPage`,
    `ArticleView`, `ArchiveTab` 등 6개 파일이 여전히 (항상 고정값으로) prop으로 참조 중이라
    기능상 죽은 코드지만 지금 지우면 타입 에러 연쇄가 커서 보류. 나중에 기회 될 때 정리.
- **후속 버그 수정 2건** (배포 후 실사이트에서 발견):
  - `18db88a`: 정사각형 아바타 슬롯에 와이드 배너 이미지(`/lens.png`)가 기본값으로 들어가
    카드가 깨져 보이던 문제 → `/icon-512.png`로 교체 (5개 파일).
  - `12be40d`: "이슈 톡톡"에는 이름 태깅된(소율/준서 등) 레터만, "이번 주 인기 칼럼"에는
    나머지 전부가 들어가야 하는데 반대로 구현되어 있던 분류 규칙 수정 + `FollowingFeed`의
    날짜 폴백 로직이 완전하지 않은 날짜에서 조기 종료되던 버그도 같이 수정.

## 결정

- `mbtiGroups.ts`/`types/mbti.ts` 완전 제거는 지금 안 한다 — 사용자 확인 완료, 기회 될 때
  opportunistic하게 정리하기로.
- `daily_letters` 테이블(레거시 페르소나 레터)은 실제로 비어 있음을 `aws dynamodb scan`으로
  직접 확인 후 정리 — 데이터 손실 리스크 없음.

## 다음

- 문서 정리 미착수: `docs/prompt-mbti-v2/`, `architecture/ARTICLE_PIPELINE.md` 등 죽은 MBTI
  파이프라인을 설명하는 문서들이 남아 있음 (TASK-14, 아직 pending).
- `shared/data/mbtiGroups.ts` / `shared/types/mbti.ts` 제거는 여전히 보류 중.
