# 2026-08-08 MBTI 페르소나 폐지 마무리 — shared 타입/훅 삭제 + 문서 정리

작성: Claude Code
관련: `CLAUDE.md` §MBTI Editor Personas(구 버전), `docs/README.md`

## 배경

MBTI 4-페르소나(NT/NF/ST/SF, 민철/하은/준서/소율) 컨셉 폐지 작업이 이번 세션 이전부터
단계적으로 진행돼 왔다 — 백엔드 AI 파이프라인, admin CMS 스키마, 이슈톡톡, `/editors`
라우트, 온보딩 group 선택 로직까지 이미 정리됨. 사용자가 "정리하시죠, 깔끔하게
안쓰는거 다 삭제합니다"라고 확인해 마지막 두 단계 — ① 프론트엔드 `shared/` 타입·훅
잔존물, ② 문서(CLAUDE.md·docs/) 잔존 서술 — 를 마무리했다.

## 한 것

### 1. 프론트엔드 shared 타입/훅 제거 (`service/frontend/src/`)

전체 저장소 grep으로 각 항목의 실사용 여부를 먼저 확인한 뒤 삭제:

- **완전 삭제**: `components/mbti/ArticleView.tsx`, `MbtiChatBot.tsx` (import 0곳),
  `shared/lib/elevenlabs.ts` (모듈 전체가 어디서도 import 안 됨 — 팟캐스트 재생은
  이미 `shared/lib/audioPlayer.ts`로 대체돼 있었다)
- `shared/data/mbtiGroups.ts` — 살아있는 `MbtiGroupId` 타입 하나만 남기고
  `mbtiGroups`/`mbtiGroupList`/`mbtiTypeToGroup`/`groupToDefaultMbti`/`MbtiType`/
  `MbtiGroup` 삭제 (7개 import처 전부 타입만 참조하고 런타임 값은 안 씀 확인)
- `shared/types/mbti.ts` — 죽은 `MbtiVersion`(ArticleView 전용이었음), `Persona`/
  `personaInfo`, `TextSelection`, `DnaSubTab`/`DnaViewMode` 제거. 살아있는
  `MbtiArticle`(ArchiveTab 사용, 죽은 `versions` 필드는 같이 제거), `ArchivedSentence`,
  `TabType`은 유지
- `features/news-feed/data/letterPodcasts.ts` — 죽은 `HOST_VOICE_BY_GROUP` 제거.
  `LETTER_PODCASTS`(팟캐스트 PoC 8편, 옛 id 스킴이라 영구 orphan)는 `LetterDetailClient.tsx`가
  여전히 lookup하므로 유지

**안 건드린 것** (스코프 밖으로 확인): `features/fortune/lib/personaVoice.ts`(사주
4-그룹 보이스 스타일 — 살아있는 별개 기능), `SideRail.tsx`의 사주 궁합 4-에디터
매칭(살아있음), `app/page.tsx`의 `selectedGroup="SF"` 고정 배관(이전 세션에서 이미
"다른 팀 소유, 스코프 밖"으로 명시됨).

검증: `npx tsc --noEmit`, `eslint`(수정 파일), `npm run build`(전 라우트 정상 생성) 전부 통과.

### 2. 문서 정리 (`CLAUDE.md`, `docs/`)

**아카이브 이동** (`docs/README.md`의 "낡은 문서는 지우지 말고 archive/로" 규칙 따름,
`git mv`로 히스토리 보존):
- `docs/architecture/ARTICLE_PIPELINE.md` → `docs/archive/` (v1 Step Functions 파이프라인
  설명, 2026-07-30 이미 폐기된 걸 root CLAUDE.md가 진작 "과거 기록"으로 플래그해뒀었음)
- `docs/product/persona-voice-cards.md` → `docs/archive/` (레터 에디터 4-페르소나
  voice card 정본 문서 — 페르소나 자체가 없어졌으므로 전체가 무효)
- `docs/product/letter-framework-v2.md` → `docs/archive/` ("단일 진실 원천"을 자처하던
  레터 발행 프레임워크 문서. §1 reader-persona 매칭, §4 persona×structure 매트릭스,
  §6 lifecycle(Orchestrator가 4 페르소나 생성), §11 참조 파일
  (`service/backend/v2/prompts/editor_letter/{NT,NF,ST,SF}.md` 등)까지 문서 전체 골격이
  4-페르소나 전제 — 그 프롬프트 디렉터리 자체가 이미 없음 확인 후 이동 결정)
- `docs/prompt-mbti-v2/`(4유형 레터 프롬프트 소스 + 샘플, 최상위 폴더) → `docs/archive/prompt-mbti-v2/`

**CLAUDE.md / 문서 내 stale 서술 수정** (파일이 실제로 존재하는지 하나씩 확인 후):
- `docs/README.md` — 폴더 구조에서 `prompt-mbti-v2/` 삭제, "정본 문서 빠른 링크"에서
  이동된 4개 링크 제거 + 이동 경위 한 줄 추가, `product/` 폴더 설명에서 "페르소나"
  제거(실제 남은 파일: 레터 평가·뉴스레터 2건뿐)
- `service/backend/CLAUDE.md` — `clients/mbti_transform_service.py`를 살아있는
  클래스로 서술하던 부분(실제로는 파일 자체가 없음, `article_collector.py`도 더 이상
  참조 안 함), `constants.py`의 `MBTI_GROUP_INFO`(삭제됨), `prompts/transform/
  (nt/nf/st/sf.md)`(디렉터리 자체가 없음), 루트의 `MBTI_TRANSFORM_PROMPT.md`(파일 없음)
  — 전부 실제 파일시스템 확인 후 정정
- `docs/architecture/admin-stack.md` — Admin-3 당시 "13/13 프롬프트 커버리지" 서술에
  `chatbot/{nt,nf,st,sf}` + `transform/{nt,nf,st,sf}` + `mbti_transform_service.py`가
  포함돼 있었는데 전부 이후 삭제됨 — 히스토리 기록 자체는 안 건드리고 위에 "이후 무효"
  경고만 추가(이미 이 파일에 있던 "⚠️ 폴더 이동(2026-08-08)" 패턴과 동일하게)
- `docs/product/letter-evaluation-system.md` — `persona-voice-cards.md` 참조를
  아카이브 이동 사실 + "A 계층 자체가 지금 유효한지 재확인 필요" 경고로 교체
  (문서 본문 §4 "페르소나별" 문항은 4-에디터-페르소나가 아니라 5-가상-독자 평가라
  구조적으로는 살아있을 수 있어 전체 아카이브는 안 함 — 후속 확인 필요, 아래 "다음" 참조)
- `service/backend/services/prompt_loader.py` docstring — `load_chatbot_prompt(group)`이
  이제 `default` 하나만 있다고 정정

## 결정

- 문서는 지우지 않고 `docs/archive/`로 이동 — repo 자체 컨벤션(`docs/README.md` 배치
  규칙)을 따름. 사용자가 "삭제"라고 표현했지만 코드와 달리 문서는 히스토리 가치가
  있고, 이미 정립된 팀 컨벤션이 있어 그대로 따르는 게 맞다고 판단.
- `letter-framework-v2.md` 전체 아카이브는 "일부만 수정"보다 과감한 결정이었다 —
  문서 골격 자체(북극성 미션 "네 사람이 다르게 보는지", 8개 불변 원칙 중 "페르소나
  식별 가능해야" 등)가 4-페르소나 전제라 부분 편집으로는 문서의 정합성을 못 살릴
  것으로 판단, 실제로 그 문서가 참조하던 `editor_letter/` 프롬프트 디렉터리가 이미
  없다는 것까지 확인한 후 결정.
- `letter-evaluation-system.md`는 전체 아카이브하지 않음 — 핵심(5-가상-독자 rubric
  평가)이 편집자 페르소나가 아니라 독자 페르소나 개념이라 여전히 유효할 가능성이
  높다고 판단. 단 일부 stale 교차 참조만 수정.

## 다음

- `letter-evaluation-system.md` §3~4의 "페르소나별 완독률"/"4명 누구 글인지" 류
  문항이 지금도 실제로 쓰이는 평가 관행인지 확인 필요 — 4-페르소나 폐지 후 레터가
  1일 1편 단일 에디터로 바뀐 것으로 보이는데(아래 참조), 그 실태와 이 문서의 정합성
  점검은 이번 세션 스코프 밖.
- (조사 중 발견, 이번 세션 스코프 아님) `admin/backend/repo/letters_repo.py`에
  `create()` 함수가 없다 — 코멘트가 "파이프라인이 쓰는 테이블"이라고 하는 걸 보면
  레터는 여전히 admin 밖 어떤 자동 파이프라인이 매일 생성하고, admin은 편집/soft-delete만
  하는 구조로 보인다. `docs/README.md`가 참조하는 "정본" 목록에 이 파이프라인을 설명하는
  현행 문서가 없다 — CLAUDE.md도 "전체 아키텍처 문서를 dev2 기준으로 새로 정리하는
  작업은 별도 세션"이라고 명시해뒀으니, 그 별도 세션에서 다룰 것.
