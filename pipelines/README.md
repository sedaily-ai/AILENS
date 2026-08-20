# pipelines/ — 4포맷 생성 파이프라인

AI LENS "4가지 시선"(레터/웹툰/팟캐스트/영상) 각 포맷을 실제로 생성하는
독립 실행 스크립트 모음. 전부 admin 프롬프트 드로어(`/lens` → 프롬프트)가
DDB에 저장한 프롬프트를 그대로 읽어서 쓴다 — 프롬프트를 admin에서 고치면
다음 실행부터 바로 반영된다(`pipelines/common/ddb_prompt.py`).

| 폴더 | 언어 | 산출물 | 비고 |
|---|---|---|---|
| `letters/` | Python | 텍스트 | GPT-4o 1회 호출 |
| `podcast/` | Python | 텍스트 + mp3 | GPT-4o + AWS Polly |
| `webtoon/` | Python | 이미지 8장 | GPT-4o(대사) + gpt-5.5 image_generation |
| `video/` | Node/Remotion | mp4 | 렌더만 담당 — 각본 JSON은 별도 생성 필요(아래 참고) |
| `common/` | Python | — | `ddb_prompt.py`(프롬프트 로드), `openai_client.py`(GPT 호출), `text_utils.py`(코드블록 벗기기). letters/podcast/webtoon이 공용으로 씀 |

## 왜 언어가 섞여 있나

`video/`만 Node/Remotion이다 — 실제 렌더링(TTS 합성 + 프레임 합성)에
Remotion(React 기반 비디오 프레임워크)을 쓰기 때문에 어쩔 수 없다. 억지로
Python으로 통일하지 않았다 — 도구에 맞는 언어를 쓰는 게 "폴더 이름
일관성"보다 우선.

## 아직 없는 것

`video/`는 렌더(2·3단계)만 있고, "기사 → 각본 JSON"(1단계, GPT 호출)은
아직 스크래치패드 1회성 스크립트로 만든다 — letters/podcast/webtoon과
달리 영속 코드가 없다. Node 프로젝트 안에 Python 스크립트를 넣는 게
어색해서 미루고 있다(TypeScript로 다시 쓰거나, `common/`을 그대로
재사용하는 작은 Python 스크립트를 `video/` 옆에 두는 두 가지 안 중 결정
안 됨) — 다음에 손볼 것.

## 배경

`docs/product/4format-samples/2026-08-11-빵지순례/라운드기록.md`(각 프롬프트
버전·문제/솔루션 이력), `docs/worklog/2026-08/2026-08-20-homepage-refresh-seo-category-pipeline-reorg.md`
(이 폴더 구조가 왜 이렇게 됐는지) 참고.
