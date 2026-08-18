import { GraduationCap, Briefcase, Store, TrendingUp, type LucideIcon } from 'lucide-react';
import { BRAND_ACCENTS } from '@/shared/data/brandAccents';

/**
 * "오늘의 이슈, 4가지 시선"(lens) 공용 토큰 — 2026-08-13.
 *
 * 원래 ACCENT/CARD_SHADOW/CARD_BORDER 세 값이 LensPreviewSection·LensViewClient·
 * LensListClient 세 파일에 각각 하드코딩돼 있었다(같은 값 손으로 세 번). 홈 티저와
 * 상세를 시선별 색·아이콘 체계로 재설계하면서 한 곳으로 모은다.
 *
 * ⚠️ 시선별 메타데이터는 반드시 **인덱스 기준**으로 찾는다. 라벨 문자열
 * ("시선 ① — 원인이 궁금한 사람")은 admin이 저장한 값이 그대로 내려오고
 * (admin/frontend/src/components/PostForm/LensMode.tsx:16-27 의 LENS_LABELS),
 * 서비스 프런트엔드는 그 taxonomy를 모른다. 문자열 매칭은 admin에서 문구를
 * 한 글자만 고쳐도 조용히 깨진다. 순서는 admin 폼이 LENS_LABELS를 map 해서
 * 만들기 때문에 원인 → 사람 → 내 일 → 숫자로 고정이다.
 *
 * ⚠️ 다만 `lenses` 배열이 항상 4개라는 보장은 타입에도 백엔드에도 없다
 * (backend _shape_lens 가 패딩하지 않음 — 빈 배열이거나 question/bullets가
 * 빈 문자열일 수 있다). 그래서 lensPerspectiveAt() 은 범위를 벗어난 인덱스에도
 * 항상 뭔가를 돌려준다.
 */

export const LENS_ACCENT = '#3b82f6';
export const LENS_CARD_BORDER = '1px solid rgba(0,0,0,0.06)';
export const LENS_CARD_SHADOW = '0 1px 2px rgba(17,24,39,0.03), 0 3px 10px rgba(17,24,39,0.04)';

export interface LensPerspective {
  /** 화면에 크게 박는 서수. */
  ordinal: string;
  /** 칩·탭처럼 좁은 자리에 쓰는 역할 이름. */
  short: string;
  /** 카드 헤더 등 넓은 자리에 쓰는 역할 이름(부가 설명 포함). */
  full: string;
  /** "이 역할에게 뭘 주는가" — 덱의 payoff 캡션에 해당. */
  tagline: string;
  /**
   * 역할 캐릭터 일러스트(2026-08-14). 기획 덱의 PRISM 라인아트를 인물별로
   * 크롭한 것. **선택된 시선을 크게 보여주는 자리에만** 쓴다(상세 카드 헤더,
   * 전체 비교 모드) — 홈 4칸에는 넣지 않는다: 기사 사진과 주인공이 충돌하고,
   * 375px 2×2 그리드에서 밀도가 무너지며, 기사가 바뀌어도 그림은 그대로여서
   * 정보 가치가 없다.
   *
   * 흰 배경 PNG 라서 tint 배경 위에서는 CSS `mix-blend-mode: multiply` 로
   * 흰색을 날려 쓴다(알파 채널 없이 해결).
   */
  illustration: string;
  /** 일러스트를 못 쓰는 작은 자리(레일·홈 칩)용 아이콘. */
  icon: LucideIcon;
  color: string;
  tint: string;
  border: string;
}

// 관심축 4종(2026-08-17 워딩 개편) — 원인·공감·실무·숫자.
// 이전엔 사회초년생·직장인·자영업자·투자자 같은 "직업/생애단계" 역할로
// 라벨링했었는데(2026-08-13, 안 1) 그건 실제 편집팀이 admin에서 매 기사마다
// 채우는 축(admin/frontend/src/components/PostForm/LensMode.tsx의
// LENS_LABELS — 원인이 궁금한 사람/사람이 먼저 보이는 사람/내 일이 걱정되는
// 사람/숫자부터 찾는 사람)과 맞지 않는 임의 라벨이었다. "관심사가 뭔지"로
// 축을 바꿔서 편집팀 라벨과 실제로 정렬시켰다 — full은 그 admin 라벨을
// 그대로 옮긴 것.
//
// short는 "~파" 접미사 없이 키워드만 — 접미사를 붙이면 무리/집단(파벌)
// 느낌이 나서(사용자 피드백) 뺐다. MBTI 유형 코드(NT/NF/ST/SF)도 쓰지
// 않는다 — 올드하다는 판단(사용자 피드백, 2026-08-17).
//
// ⚠️ 색·아이콘·순서는 여전히 **인덱스 기준**(admin이 LENS_LABELS를 고정
// 순서로 저장하므로).
//
// 팔레트: 원래 기획 덱(2.5/1.3)의 navy/purple/teal/orange 자체 배정이었으나
// 2026-08-18 디자인 감사에서 사이트 전역 페르소나 브랜드 컬러
// (BRAND_ACCENTS — 민철·하은·준서·소율 = NT/NF/ST/SF, 2026-08-06 감사로
// 확정)와 따로 놀고 있다는 게 드러났다. "이 뉴스, 누구의 눈으로 볼까요?"도
// 개념적으로 같은 "네 가지 관점"인데 색만 겉돌았던 것 — BRAND_ACCENTS를
// 새로 만들 때 잡으려던 바로 그 문제(섹션마다 색을 즉흥적으로 짓는 것)를
// 이 기능만 비껴가 있었다. 하드코딩 대신 BRAND_ACCENTS를 인덱스 순서로
// 직접 참조해 두 시스템이 다시 벌어질 수 없게 했다 — border만 BRAND_ACCENTS에
// 없는 필드라 각 색상군의 Tailwind 200 셰이드로 유지(현재 소비처 없음,
// 향후 대비 값).
const LENS_BORDER_TINTS = ['#ddd6fe', '#fecdd3', '#a7f3d0', '#fde68a'] as const;

export const LENS_PERSPECTIVES: readonly LensPerspective[] = [
  {
    ordinal: '①',
    short: '원인',
    full: '원인이 궁금한 사람',
    tagline: '왜 이렇게 됐을까',
    illustration: '/lens/role-1-newcomer.png',
    icon: GraduationCap,
    color: BRAND_ACCENTS[0].accent,
    tint: BRAND_ACCENTS[0].soft,
    border: LENS_BORDER_TINTS[0],
  },
  {
    ordinal: '②',
    // "공감"→"당사자"(2026-08-18) — 부제("그래서 누가 어떻게 됐을까")가
    // "누가 영향을 받았나"를 가리키는데 "공감"은 감정적 반응 쪽으로 읽혀
    // 라벨과 부제 사이에 거리가 있다는 피드백. "당사자"는 admin의 원래
    // 축("사람이 먼저 보이는 사람")과 부제 둘 다에 직접 붙는다.
    short: '당사자',
    full: '사람이 먼저 보이는 사람',
    tagline: '그래서 누가 어떻게 됐을까',
    illustration: '/lens/role-2-worker.png',
    icon: Briefcase,
    color: BRAND_ACCENTS[1].accent,
    tint: BRAND_ACCENTS[1].soft,
    border: LENS_BORDER_TINTS[1],
  },
  {
    ordinal: '③',
    short: '실무',
    full: '내 일이 걱정되는 사람',
    tagline: '그래서 나는 뭘 해야 할까',
    illustration: '/lens/role-3-owner.png',
    icon: Store,
    color: BRAND_ACCENTS[2].accent,
    tint: BRAND_ACCENTS[2].soft,
    border: LENS_BORDER_TINTS[2],
  },
  {
    ordinal: '④',
    short: '숫자',
    full: '숫자부터 찾는 사람',
    tagline: '그래서 숫자로 보면',
    illustration: '/lens/role-4-investor.png',
    icon: TrendingUp,
    color: BRAND_ACCENTS[3].accent,
    tint: BRAND_ACCENTS[3].soft,
    border: LENS_BORDER_TINTS[3],
  },
] as const;

/**
 * 시선별 출력 포맷 목업(2026-08-18, 국장님 지시 — "네 시선을 텍스트만이
 * 아니라 레터·카드뉴스·팟캐스트·영상 네 형식으로 나오게 하라").
 *
 * 아직 실제 생성 파이프라인과 연결되지 않은 **개념 목업**이다 — 카드뉴스는
 * 이 서비스 프론트엔드에 라우트/컴포넌트가 아예 없고, 팟캐스트는 API
 * 클라이언트(shared/lib/podcastApi.ts)만 있고 UI는 오늘(2026-08-18) 레터
 * 상세에서 제거됐다("대부분 오디오가 없어 빈 회색 카드로 보임" — 동일한
 * 함정을 여기서도 반복하지 않도록, 실제 데이터가 없을 때도 항상 완성된
 * 형태로 보이는 정적 목업으로만 그린다). 인덱스 순서는 LENS_PERSPECTIVES와
 * 동일 기준(원인→공감→실무→숫자)으로 고정.
 */
export type LensFormat = 'letter' | 'cardnews' | 'podcast' | 'video';

export const LENS_FORMATS: readonly LensFormat[] = ['letter', 'cardnews', 'podcast', 'video'] as const;

/** 범위를 벗어나도 안전 — 시선 개수만큼 순환. */
export function lensFormatAt(i: number): LensFormat {
  return LENS_FORMATS[i % LENS_FORMATS.length];
}

/** 범위를 벗어나도 안전 — lenses 길이가 4가 아닐 수 있다. */
export function lensPerspectiveAt(i: number): LensPerspective {
  return LENS_PERSPECTIVES[i] ?? LENS_PERSPECTIVES[i % LENS_PERSPECTIVES.length] ?? LENS_PERSPECTIVES[0];
}

/** 홈 티저 칩 → 상세 딥링크(/lens/{id}#lens-2)에서 쓰는 앵커 id. */
export function lensPanelId(i: number): string {
  return `lens-${i + 1}`;
}

export function lensTabId(i: number): string {
  return `lens-tab-${i + 1}`;
}

/**
 * 딥링크 파라미터 "?v=2" → 1 (0-based). 못 읽으면 null.
 *
 * 해시(#lens-N) 대신 쿼리를 쓴다(2026-08-13) — 해시를 쓰면 브라우저가 같은
 * id 요소(패널)로 자동 스크롤해서 상세가 히어로를 건너뛰고 중간부터 보인다.
 * 쿼리는 스크롤을 유발하지 않으므로 어느 시선으로 들어와도 항상 최상단부터
 * 랜딩하면서 해당 탭만 선택된다.
 */
export function parseLensView(search: string): number | null {
  const m = /[?&]v=(\d+)/.exec(search);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1) return null;
  return n - 1;
}

/**
 * "사진 칸"에 넣을 이미지를 고른다 — 텍스트 없는 순수 사진만 허용.
 *
 * cover_image_url 은 인스타 카드뉴스 완성형 그래픽이라 헤드라인·날짜·"lens"
 * 라벨이 이미지 픽셀에 박혀 있다(실측: 1080x1350, 광고 문구나 인포그래픽 표가
 * 사진 영역에까지 들어간 커버도 있었다). 그래서 사진 칸의 폴백으로 쓰지 않는다 —
 * 쓰면 우리 HTML 헤드라인과 글자가 중복되고, "사진 칸엔 사진만" 원칙도 깨진다.
 *
 * 카드 위쪽만 잘라 쓰는 방법도 검토했지만, 사진 영역 높이가 글마다 다르고
 * (54%~72%) 그 안에도 텍스트가 있어서 신뢰할 수 있는 크롭 규칙이 없다.
 *
 * 따라서 photo_image_url 이 없으면 null 을 돌려주고, 호출부는 사진 칸을 아예
 * 렌더하지 않는다(텍스트만으로도 카드가 성립하도록 설계돼 있다).
 */
export function pickLensPhoto(lens: {
  photo_image_url?: string | null;
  id?: string;
}): string | null {
  const photo = (lens.photo_image_url ?? '').trim();
  if (photo) return photo;

  // ── 개발 환경 전용 미리보기 ────────────────────────────────────────────
  // photo_image_url 은 방금 신설한 필드라 발행된 글 전부가 비어 있다. 사진
  // 배치를 눈으로 검토할 수 있도록 로컬(dev)에서만 실제 기사 사진(letters
  // 채널 커버 — 텍스트가 박히지 않은 순수 사진)을 샘플로 물린다.
  // production 빌드에서는 이 분기가 실행되지 않으므로 운영에는 영향이 없다.
  // 글 id 로 결정되어 같은 글은 항상 같은 사진이 나온다(깜빡임·하이드레이션
  // 불일치 없음). admin 에서 실제 사진을 채우면 이 분기는 자연히 안 쓰인다.
  if (process.env.NODE_ENV === 'development' && lens.id) {
    // 글과 실제로 맞는 사진이 있으면 그걸 먼저 쓴다. 무작위 샘플이 붙으면
    // "기사 사진이 잘못 들어갔다"고 읽히기 때문(테슬라 기사에 오토바이 사진).
    const exact = DEV_EXACT_PHOTOS[lens.id];
    if (exact) return exact;
    const seed = [...lens.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    return DEV_SAMPLE_PHOTOS[seed % DEV_SAMPLE_PHOTOS.length];
  }
  return null;
}

/**
 * 개발 환경에서 글별로 실제 사진을 지정하는 임시 맵.
 * 카드 그래픽(cover_image_url)의 사진 영역에서 텍스트가 없는 부분만 잘라
 * public/lens/ 에 넣은 것이다. admin 이 photo_image_url 을 채우면 불필요해진다.
 */
const DEV_EXACT_PHOTOS: Record<string, string> = {
  '2026-08-14-쏘카-테슬라-800대-더-늘린다-전기차-비중-14-로': '/lens/sample-socar-tesla.jpg',
};

const DEV_SAMPLE_PHOTOS = [
  'https://sedaily-mbti-cms-media-dev.s3.us-east-1.amazonaws.com/media/2026/08/7508d7943ac7-rcv.yna.20260729.pyh2026072910290005700-p1.jpg',
  'https://sedaily-mbti-cms-media-dev.s3.us-east-1.amazonaws.com/media/2026/08/ce73962a4a18-news-p.v1.20260117.5ed23c7c1187459082f72ed48fb2070b-p1.jpg',
  'https://sedaily-mbti-cms-media-dev.s3.us-east-1.amazonaws.com/media/2026/08/d466cfa8159b-news-p.v1.20260811.7333b418f0b5460cb29b753baccfcaee-p1.png',
];

// 역할 체계로 전환하면서(2026-08-13, 안 1) 저장된 라벨에서 짧은 이름을
// 뽑던 stripLensLabel/shortLensLabel 은 제거했다 — 이제 탭·칩·헤더의
// 역할명은 전부 인덱스 기준 고정값(LENS_PERSPECTIVES[i].short/full)을 쓴다.
// 저장된 label(질문 축)은 화면에 노출하지 않는다.
