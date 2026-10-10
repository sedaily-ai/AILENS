# 프롬프트 스냅샷

4포맷(레터/웹툰/팟캐스트/영상) 실제 발행 프롬프트를 유형별 폴더에 저장해둔
것이다. 각 `<유형>/published.md`는 2026-09-24 기준 lens-cms-api
(`GET /api/v2/prompts/<category>/published`)에서 그대로 받아온 스냅샷이다.

## 주의 — 이 파일은 정본이 아니다

**정본은 Postgres(`prompt_versions` 테이블)이고, 이 폴더는 특정 시점 스냅샷일
뿐이다.** 관리자가 CMS 프롬프트 화면(`/prompts` → 각 포맷 탭)에서 저장하는
순간 발행 파이프라인에 즉시 반영되지만(저장 = 발행, 별도 draft/publish
상태 없음), 이 md 파일들은 자동으로 갱신되지 않는다. 실제 지금 쓰이는
프롬프트를 확인하려면 CMS 화면을 보거나 아래 명령으로 다시 받아야 한다.

```bash
curl -s http://13.223.179.151/api/v2/prompts/<letters|webtoon|podcast|video>/published \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['content'])"
```

## 폴더

| 유형 | 파일 | Bedrock 모델(inference profile) |
|---|---|---|
| 레터 | [`letters/published.md`](letters/published.md) | Opus 5 (`lens-letters-opus-5`, mode=system) |
| 웹툰 | [`webtoon/published.md`](webtoon/published.md) · [버전 이력](webtoon/README.md) | Sonnet 4.6 (`lens-webtoon-script-sonnet-46`, mode=webtoon_json) |
| 팟캐스트 | [`podcast/published.md`](podcast/published.md) | Sonnet 4.6 (`lens-podcast-sonnet-46`, mode=system) |
| 영상 | [`video/published.md`](video/published.md) | Sonnet 4.6 (`lens-video-sonnet-46`, mode=system) |

모델·max_tokens 등 정확한 설정값은 `admin/backend/routes/prompts.py`의
`_CATEGORY_BEDROCK` 딕셔너리가 정본이다(여기 표는 참고용).

## `selection/` — 예외, 아직 라이브 아님

`selection/`은 위 4개와 컨벤션이 다르다 — mustknow_auto "일반" 카테고리
선정 프롬프트를 재설계하는 중이라 **아직 Postgres에 발행된 적 없고**,
그래서 단일 `published.md` 스냅샷이 아니라 `docs/product/4format-pipeline/
08_BUNDLE_LETTER/`처럼 `vX.Y-YYYY-MM-DD-주제.md` 버전 이력을 쌓는다.
자세한 배경은 `selection/README.md`.

성우/음성(팟캐스트)·렌더 설정(영상)은 별도 프롬프트 카테고리가 아니라
`pipelines/common/podcast_voice.py`/`video_settings.py`가 관리하는 설정
문서라 이 폴더엔 포함하지 않았다.
