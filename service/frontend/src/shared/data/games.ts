// /games(GamesClient.tsx)와 홈 게임 미리보기 섹션(GamesPreviewSection.tsx)이
// 같은 목록을 쓴다 — 2026-08-21, 홈에도 섹션이 생기며 중복 정의 대신
// 여기로 뽑았다. 새 게임을 추가하려면 이 배열에만 항목을 더하면 두 곳
// 다 반영된다.
export interface Game {
  slug: string;
  title: string;
  tagline: string;
  thumb: string;
  bg: string;
  neon: string;
}

export const GAMES: Game[] = [
  {
    slug: 'cat-blanket',
    title: '고양이 이불 덮어주기',
    tagline: '추운 겨울밤, 박스 위 떨고 있는 길고양이에게 신문지 이불을',
    thumb: '/games/cat-thumb.svg',
    bg: 'linear-gradient(135deg, #1a1a3e 0%, #2d3a5a 100%)',
    neon: '#f5a623', // 따뜻한 가로등 골드
  },
  {
    slug: 'protect-newspaper',
    title: '내일 신문을 지켜라!',
    tagline: '비둘기 천국 광장에서 쏟아지는 배설물을 신문 한 장으로',
    thumb: '/games/poop-thumb.svg',
    bg: 'linear-gradient(135deg, #b0c4de 0%, #d3d3d3 100%)',
    neon: '#4a6cf7', // 신문 블루
  },
];
