# pipelines/video — AI LENS 영상 포맷 렌더러

기사 원문에서 나온 영상 각본 JSON(`admin/frontend`의 프롬프트 드로어 →
"영상" 채널로 생성)을 실제 mp4로 렌더링하는 독립 Remotion 프로젝트.
`docs/evaluation/4format-samples/`의 각 샘플 폴더가 이 도구로 만든 영상을
가리킨다(예: `2026-08-11-빵지순례/라운드2_산출물/영상_각본.md`).

`out/`(렌더된 mp4), `public/audio/`(TTS 캐시), `data/*.resolved.json`(TTS 해석 후 캐시)은 재생성 가능한 산출물이라 `.gitignore`에 있고 저장소에는 없다.

## 요구사항

- Node.js, `ffmpeg`(로컬 PATH에 있어야 함)
- AWS 자격 증명(Polly, S3) — 기본 음성은 Amazon Polly이며, 발행 설정에서 ElevenLabs를 고르면 해당 API 키가 필요하다.

## 명령어

```bash
npm install

# 각본 JSON → mp4 (TTS + 렌더까지 한 번에)
npm run render -- --input data/<script>.json --format horizontal --output out/<name>.mp4
# --format vertical 도 가능 (1080x1920). --skip-tts로 TTS 재합성 생략 가능(캐시 재사용)

# TTS만 먼저 확인하고 싶을 때
npm run tts:resolve -- --input data/<script>.json

# Remotion Studio로 컷 단위 미리보기
npm run dev
```

## 각본 JSON 스키마

`src/lib/schema.ts` (zod)가 정본. 컷 타입 10종(opening/stat/diagram/photo/chart/
highlight/closing/compare/donut/rank)과 각 타입별 `data` 필드는 admin 쪽 video 프롬프트
(`PROMPT#video/published`, 파일시스템 폴백은
`service/backend/prompts/video/published.md`)의 "렌더용 JSON" 출력
형식과 반드시 일치해야 한다 — 프롬프트를 고치면 이 스키마도 같이
봐야 한다(또는 반대로).

아이콘은 자유 문자열이 아니라 `src/components/Icon.tsx`의 화이트리스트
안에서만 실제로 렌더된다 — 목록에 없는 키는 조용히 물음표(HelpCircle)로
빠진다. 새 아이콘이 필요하면 lucide-react에 실제로 존재하는지 확인 후
이 파일에 추가한다.

## 배경

`docs/product/4format-persona-system.md`(영상 포맷의 소비 맥락·페르소나
근거), `docs/evaluation/4format-evaluation-system.md`(영상 rubric),
`docs/evaluation/4format-samples/README.md`(샘플 라운드 기록 방식) 참고.
