import { continueRender, delayRender, staticFile } from 'remotion';

// 한글 폰트(Noto Sans KR)를 public/fonts/에 번들해 FontFace API로 직접 로드한다. 폰트 파일 없이
// font-family 이름만 쓰면, 헤드리스 Linux(Fargate) Chromium에는 macOS/Windows 전용 폴백 폰트가 없어
// 한글이 단어마다 네모 박스로 깨지거나 멀쩡하게 나오는 식으로 들쭉날쭉해진다.
// delayRender/continueRender로 로드가 끝날 때까지 프레임 캡처를 미룬다(없으면 폰트가 붙기 전
// 프레임이 캡처될 수 있다 — Remotion 공식 문서의 커스텀 폰트 로딩 패턴).
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
