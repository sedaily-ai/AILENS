// H5 게임 목록 단일 출처. /games(GamesClient.tsx)와 홈 미리보기(GamesPreviewSection.tsx)가 같은 목록을 쓰며, `src`(플레이 진입 HTML)도 여기에 둔다.
// page 모듈(`app/(content)/games/play/[slug]/page.tsx`)에서 임의 이름(`GAMES`)을 export하면 Next.js가 허용하지 않아 프로덕션 빌드 타입 검사가 실패하고,
// sitemap.ts·games/page.tsx가 그 page 모듈을 import하는 것은 app → app 참조라 FSD boundaries 규칙(eslint.config.mjs) 위반이기도 하다.
// 새 게임을 추가하려면 아래 배열에만 항목을 더한다. 카드(/games, 홈 미리보기), 라우트(generateStaticParams·메타데이터·JSON-LD), sitemap이 모두 이 배열에서 파생된다.
export interface Game {
  slug: string;
  title: string;
  tagline: string;
  thumb: string;
  bg: string;
  neon: string;
  /** public/ 아래 게임 진입 HTML. `/games/play/[slug]` 가 iframe src 로 쓴다. */
  src: string;
}

export const GAMES: Game[] = [
  {
    slug: 'cat-blanket',
    title: '고양이 이불 덮어주기',
    tagline: '추운 겨울밤, 박스 위 떨고 있는 길고양이에게 신문지 이불을',
    thumb: '/games/cat-thumb.svg',
    bg: 'linear-gradient(135deg, #1a1a3e 0%, #2d3a5a 100%)',
    neon: '#f5a623', // 따뜻한 가로등 골드
    src: '/games/cat-blanket/index.html',
  },
  {
    slug: 'protect-newspaper',
    title: '내일 신문을 지켜라!',
    tagline: '비둘기 천국 광장에서 쏟아지는 배설물을 신문 한 장으로',
    thumb: '/games/poop-thumb.svg',
    bg: 'linear-gradient(135deg, #b0c4de 0%, #d3d3d3 100%)',
    neon: '#4a6cf7', // 신문 블루
    src: '/games/protect-newspaper/index.html',
  },
];

/**
 * 슬러그 → 게임. `/games/play/[slug]` 가 O(1) 조회에 쓴다.
 *
 * 배열이 정본이고 이건 파생값이다 — 새 게임을 추가할 때 여기는 손대지 않는다.
 */
export const GAMES_BY_SLUG: Record<string, Game> = Object.fromEntries(
  GAMES.map((g) => [g.slug, g]),
);
