import { continueRender, delayRender, staticFile } from 'remotion';

// 2026-08-23 — 실제 렌더 산출물에서 한글이 군데군데 깨진(글자가 네모 박스로
// 나옴) 사고를 조사하다 발견: 이 프로젝트는 처음부터 폰트를 실제로 로드한
// 적이 없었다. styles/tokens.ts의 FONT_FAMILY는 'Pretendard'를 1순위로
// 쓰는데, 어디에도 @font-face나 font 파일이 없어서 브라우저가 그 이름을
// 못 찾고 다음 폴백으로 넘어간다 — 폴백 목록(-apple-system, 'Apple SD
// Gothic Neo', 'Malgun Gothic')은 전부 macOS/Windows 전용이라 헤드리스
// Linux(Fargate 컨테이너) Chromium엔 하나도 없다. 결국 마지막 sans-serif
// 제네릭으로 떨어지는데, 이게 어떤 한글 글리프를 우연히 커버하는지는
// 컨테이너 환경마다/렌더마다 달라서 — 어떤 단어는 되고 어떤 단어는 깨지는
// 지금 같은 들쭉날쭉한 증상이 나온다(실제로 같은 영상 안에서 "총량회
// 관리"는 렌더되고 브랜드 태그 텍스트는 네모 박스로 나옴).
//
// 고침: 실제 폰트 파일(Noto Sans KR, Google Fonts — 웹툰 컷 텍스트 합성
// 때 쓴 것과 같은 출처)을 public/fonts/에 직접 번들해서 FontFace API로
// 로드하고, Remotion의 delayRender/continueRender로 로드가 끝날 때까지
// 프레임 캡처를 미룬다(이게 없으면 폰트가 아직 안 붙은 프레임이 먼저
// 캡처될 수 있음 — Remotion 공식 문서가 커스텀 폰트 로딩 시 필수로
// 안내하는 패턴).
const WEIGHTS: Array<{ weight: string; file: string }> = [
  { weight: '400', file: 'NotoSansKR-400.ttf' },
  { weight: '500', file: 'NotoSansKR-500.ttf' },
  { weight: '600', file: 'NotoSansKR-600.ttf' },
  { weight: '700', file: 'NotoSansKR-700.ttf' },
  { weight: '800', file: 'NotoSansKR-800.ttf' },
];

let loaded = false;

export function ensureKoreanFontLoaded(): void {
  if (loaded) return;
  loaded = true;

  const handle = delayRender('Noto Sans KR 폰트 로딩');

  Promise.all(
    WEIGHTS.map(async ({ weight, file }) => {
      const face = new FontFace('Noto Sans KR', `url(${staticFile(`fonts/${file}`)})`, { weight });
      const loadedFace = await face.load();
      (document.fonts as FontFaceSet).add(loadedFace);
    }),
  )
    .then(() => continueRender(handle))
    .catch((err) => {
      console.error('[fonts] Noto Sans KR 로딩 실패 — 폴백 폰트로 렌더됨', err);
      continueRender(handle);
    });
}
