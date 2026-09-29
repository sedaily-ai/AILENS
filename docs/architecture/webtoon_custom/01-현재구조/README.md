# 현재구조 — 웹툰 관련 코드 전체 지도 + 실시간성 감사

[← 인덱스](../README.md)

---

작성: 2026-09-20, 코드 직접 대조로 확인(추측 없음). 갱신 시 이 문서도
같이 고칠 것.

## 파일 지도 — 4개의 독립된 배포 단위

웹툰 코드는 런타임·배포 방식이 완전히 다른 4곳에 흩어져 있다. 하나로
합칠 수 없다(각자 빌드/배포가 깨짐) — 정리·설계 모두 이 경계를 존중
해야 한다.

```text
① 발행 파이프라인 — ECS 배치(frontpage_auto/mustknow_auto, Docker,
   COPY . . 로 pipelines/ 전체를 이미지에 그대로 넣고 sys.path로 연결)
pipelines/webtoon/
├── pipeline.py          메인 오케스트레이션. IMAGE_PROVIDER 상수(아래 참고)
├── prompts.py           QA 판정 프롬프트(VALIDATE_SYSTEM) 정본
├── compose_text.py      말풍선·캡션·제목 텍스트 합성
├── build_index.py / generate_meta.py / run_batch.py / stitch.py  보조
└── assets/NotoSansKR-Bold.ttf

pipelines/common/        (이름은 "공용"이지만 아래 3개는 사실상 웹툰 전용)
├── webtoon_image.py      이미지 프롬프트 조립 + Bedrock 이미지 호출 전담(1100줄+)
├── gpu_ipadapter.py       GPU IP-Adapter 인물 고정 제어
└── gpu_scripts/ipadapter_infer.py   GPU 인스턴스(EC2)에서 도는 추론 스크립트

② admin 실험 패널 — Lambda(sedaily-mbti-admin-api-dev), flat-copy 배포
admin/backend/routes/webtoon/   (2026-09-20 신설 패키지, 구 webtoon_lab.py 분리)
├── jobs.py / generate.py / gpu.py / assets.py / stage.py / script.py
admin/backend/routes/chat_ws.py   스크립트챗랩 WebSocket(사실상 웹툰 전용)
admin/backend/routes/prompts.py   범용 프롬프트 CRUD(webtoon 포함 여러 카테고리 공유)

③ admin 프론트엔드 — Next.js, S3+CloudFront
admin/frontend/src/app/(authenticated)/webtoon/{page.tsx,edit/page.tsx}
admin/frontend/src/components/PromptChatLab/          스크립트챗랩 화면
admin/frontend/src/components/WebtoonCutGenerator/    컷 이미지 생성기
admin/frontend/src/components/WebtoonImageLab/        이미지 실험 패널(구)
admin/frontend/src/components/WebtoonStageLab/        단계별 생성 패널
admin/frontend/src/components/PostForm/Webtoon*.tsx   일반 포스트 폼의 "웹툰 모드"
admin/frontend/src/lib/webtoonImageModels.ts / webtoonImagePromptDoc.ts

④ CMS — EC2 PM2(lens-cms-api), 프롬프트 저장소, category-agnostic
service/lens-cms-api/prompts_repo.py 등   webtoon도 다른 카테고리(letters/
  podcast/quiz)와 완전히 같은 코드로 저장 — 전용 파일 없음
공개 무인증 엔드포인트: GET /api/v2/prompts/{category}/{name}
```

## admin 백엔드 라우트 지도 (2026-09-20 리팩토링 후)

`admin/backend/routes/webtoon/` 패키지 — 기능별 분리:

| 파일 | 책임 |
|---|---|
| `jobs.py` | 모든 하위 모듈이 공유하는 job 테이블 헬퍼 + 공용 폴링 라우트(`GET /{job_id}`) |
| `generate.py` | 컷 이미지 생성(모델 디스패치) + 이미지 실험실 3단계 |
| `gpu.py` | GPU(IP-Adapter) 인스턴스 켜기/끄기 |
| `assets.py` | 인물·화풍 참조 이미지 업로드·갤러리 |
| `stage.py` | 단계별 생성(번역/인물/배경/합성/화풍 독립 호출) |
| `script.py` | 스크립트+장면연출 생성(챕터추출·단일 Bedrock 호출·컷 정규화) |

`routes/chat_ws.py`(스크립트챗랩 WebSocket)와 `routes/prompts.py`(범용
CRUD, `_CATEGORY_BEDROCK` 등 여러 카테고리 공유 상수만 남음)는 패키지
밖에 그대로.

> **프롬프트 저장 → 사용 경로 (텍스트 콘텐츠 — 이미 실시간)**
>
> ```text
> admin 화면(웹툰 프롬프트 편집) → lens-cms-api PostgreSQL(prompts_repo)
>   → "published"로 저장
>         │
>         ├─ [admin 챗랩] chat_ws.py가 매 기사 처리마다 prompts_repo.get_prompt()
>         │   로 fresh 조회 → routes/webtoon/script.py::extract_chapters()로
>         │   챕터 슬라이싱 → Bedrock 호출. 캐시 없음.
>         │
>         └─ [발행 파이프라인] pipelines/common/ddb_prompt.py::load_prompt()
>             가 lens-cms-api의 공개 엔드포인트(GET /api/v2/prompts/{cat}/{name})
>             를 HTTP로 직접 호출. run_article() 1회 실행 동안만 값을 들고
>             있고(그 안에서는 재조회 안 함), 다음 실행(다음 기사)에는 다시
>             fresh 조회 — 즉 "매 기사 처리마다 최신값" = 사실상 실시간.
>             lens-cms-api 응답 실패 시에만 service/backend/prompts/<category>/
>             published.md 파일시스템 사본으로 폴백(장애 대비, 평소엔 안 탐).
> ```
>
> 같은 방식으로 **STYLE/CHARACTER_FEMALE/CHARACTER_MALE**(별도 문서
> `webtoon-image/published`)도 `webtoon_image.py::get_style()`/
> `get_fixed_characters()`가 매 이미지 생성 호출마다 fresh 조회(캐시
> 없음). **참조 이미지**(화풍 1장, 인물 A/B 각 1장)는 S3 정본 키를
> 읽는데, 화풍 이미지만 60초 TTL 캐시(`_style_reference_cache`)가 있고
> 인물 사진은 GPU 인스턴스가 기동할 때마다 로컬 디스크로 재동기화된다.
>
> **결론**: 프롬프트 텍스트·참조 이미지는 [../README.md#목표]의 요구가
> 이미 충족돼 있다.

> **이미지 모델 선택 → 사용 경로 (전혀 실시간이 아님)**
>
> ```text
> 발행 파이프라인:
>   pipelines/webtoon/pipeline.py:86
>     IMAGE_PROVIDER = "bedrock-style-transfer"   ← 코드 상수, 하드코딩
>   run_article() 안에서 이 상수값으로 if/elif 분기 — admin이 저장한
>   어떤 값도 이 분기에 영향을 주지 못한다. 바꾸려면:
>     1. 코드에서 이 줄을 수정
>     2. Docker 이미지 재빌드(ARM64, Windows Docker Desktop 필요 — 어제
>        Kiro님의 비용태깅 배포가 실제로 겪은 과정, docs/worklog/2026-09/
>        2026-09-18-image-cost-atlas4-profiles.md 참고)
>     3. ECR push, ECS task definition 새 리비전 등록
>
> admin 실험 패널:
>   admin/backend/routes/webtoon/generate.py::_generate_once()
>   요청 body의 model 파라미터로 그때그때 5개 모델(pipeline/
>   stable_image_core/sd35_large/sd_ultra/style_guide) 중 선택 —
>   **요청 단위**로만 의미가 있고, "지금부터 이 모델을 기본으로 쓴다"는
>   저장된 설정이 아니다. 매번 프론트가 드롭다운 값을 실어 보내야 한다.
> ```
>
> **결론**: 발행 파이프라인의 모델 선택은 코드 상수. admin 실험 패널의
> 모델 디스패치 로직은 이미 5개 모델을 다 다룰 수 있지만, 발행
> 파이프라인과 완전히 분리된 별도 구현이라 서로 영향을 주지 않는다
> ([정리후보 A](../02-정리후보/01-모델디스패치중복.md)).

> **파이프라인 동작 옵션(인물고정/화풍전이/QA) → 사용 경로**
>
> - 발행 파이프라인(`pipeline.py`): 이런 옵션 자체가 없다 — IMAGE_PROVIDER
>   분기 안에 고정 동작으로 짜여 있다.
> - admin 실험 패널: `apply_character_lock`/`apply_style_transfer`가
>   요청 body 파라미터로 존재(2026-09-16 도입, 체크박스로 매번 켜고
>   끔) — 이것도 저장된 설정이 아니라 요청 단위 값.
> - QA(Bedrock 비전 판정 + Rekognition 얼굴 수 검사): 2026-09-20에
>   admin 실험 패널의 pipeline 모델 외 4개 모델에서는 제거함(군중 등
>   사용자 프롬프트와 충돌하던 문제, [정리후보 E](../02-정리후보/05-QA로직이중구현.md)
>   참고) — 발행 파이프라인의 QA는 그대로 유지(다른 목적, 인물 identity 검증).
>   ⚠️ 2026-09-28 후속: 발행 파이프라인 QA도 이후 통째로 제거됐고
>   (webtoon_image.py::generate_cut_image() 독스트링), 말풍선 배치용
>   Rekognition(이 QA와는 별개 기능)도 같은 날 완전히 제거됐다 —
>   이 문단은 그 이전 시점 기록으로 남겨둔다.
