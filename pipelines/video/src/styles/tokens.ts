// 2026-09-02 — 다크 네이비 톤(1차 시도, git 이력 참고)에서 화이트+에듀테크
// 톤으로 전면 교체(사용자 요청 — "흰색 배경에 에듀테크 스타일"). 브랜드
// 앰버(#FFB020)는 그대로 유지해서 정체성은 이어가되, 배경·카드·텍스트를
// 화이트 캔버스 기준으로 다시 짰다. 콴다·산타토익류 한국 에듀테크 앱들의
// 문법 — 흰 캔버스, 파스텔 톤 칩(아이콘 원·카드), 짙은 잉크 텍스트(순검정
// 아님), 비비드 단일 액센트 — 을 참고. 폰트는 안 건드림(2026-08-23 렌더
// 환경 글리프 깨짐 사고 — 아래 FONT_FAMILY 주석 참고).
export const COLORS = {
  background: '#FFFFFF',
  // 아이콘 원·카드 배경 — 짙은 남색 칩 대신 브랜드 앰버를 옅게 희석한
  // 파스텔 칩. 그 위에 올라가는 아이콘·텍스트(COLORS.text, 짙은 잉크)와
  // 대비가 충분히 남는다.
  backgroundLight: '#FFF2DA',
  // 순검정(#000) 대신 살짝 데운 잉크 톤 — 화이트 캔버스에서 순검정보다
  // 눈이 편하고, 에듀테크 UI들이 공통으로 쓰는 다크 그레이 계열과 결.
  text: '#1C1B17',
  accent: '#FFB020',
  // 예전 값(#8A97A8)은 짙은 배경 대비용이라 흰 배경에서 대비가 부족함 —
  // 화이트 캔버스 기준으로 다시 잡은 중간 톤 그레이(WCAG AA 본문 대비 충족).
  muted: '#6B6F7A',
} as const;
// 배경 그라디언트 자체는 여기 없다 — 2026-09-02 패럴랙스 추가 후
// components/BackgroundAtmosphere.tsx가 프레임에 따라 매 순간 다시
// 계산해서 그린다(정적 문자열로는 못 담는 애니메이션 값이라 이동).

// 2026-08-23 — 'Pretendard'는 실제로 로드된 적이 한 번도 없어서(어디에도
// @font-face·폰트 파일이 없었음), 헤드리스 Linux 렌더 환경에서 모든
// 폴백(-apple-system 등, macOS/Windows 전용)이 실패하고 마지막
// sans-serif 제네릭에 우연히 걸리는 글리프만 렌더돼 한글이 군데군데
// 네모 박스로 깨졌다(같은 영상 안에서도 단어별로 되고 안 되고 갈림).
// 실제로 번들+로드하는 'Noto Sans KR'(lib/fonts.ts)을 1순위로 바꿨다.
export const FONT_FAMILY =
  "'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

export const FONT_WEIGHT = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

// 두 컴포지션(1080x1920, 1920x1080) 모두 짧은 변이 1080이므로
// min(width, height) / BASE_UNIT 을 스케일 기준으로 쓰면
// 같은 px 설계값이 두 포맷에서 동일한 상대 크기로 보인다.
export const BASE_UNIT = 1080;
