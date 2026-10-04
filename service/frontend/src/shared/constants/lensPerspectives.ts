import { BookOpen, Image, Headphones, Video, type LucideIcon } from 'lucide-react';
import { BRAND_ACCENTS } from '@/shared/data/brandAccents';

/**
 * "오늘의 이슈, 4가지 시선"(lens) 공용 토큰.
 *
 * 시선별 메타데이터는 반드시 인덱스 기준으로 찾는다. 라벨 문자열은 admin(PostForm/LensMode.tsx의
 * LENS_LABELS)이 저장한 값이 그대로 내려오고 서비스 프런트엔드는 그 taxonomy를 모르므로,
 * 문자열 매칭은 admin 문구 수정만으로 조용히 깨진다. 순서는 레터 → 웹툰 → 팟캐스트 → 영상으로 고정이다.
 *
 * `lenses` 배열이 항상 4개라는 보장은 타입에도 백엔드(_shape_lens는 패딩하지 않음)에도 없다.
 * 따라서 lensPerspectiveAt()은 범위를 벗어난 인덱스에도 항상 값을 돌려준다.
 */

export const LENS_ACCENT = '#3b82f6';

/**
 * 기사 상세 읽기 영역의 강조색. 서울경제 CI 로고 색을 밝은 파스텔로 올린 값이며, 작은 글자는 사용처에서 진하게 섞는다.
 * 읽기 영역 전체(챕터 번호·목차·완독 체크·서명·요약 번호)에 이 한 색만 쓰고, 형식 구분은 탭 아이콘이 맡는다.
 */
export const READING_ACCENT = '#5b8def';
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
  /** 소요시간 한 줄. 실측값이 아니라 편집팀의 평균 근사치다(동적 계산은 CMS에 duration 필드가 필요하다). */
  duration: string;
  /** 실제로 담겨 있는 내용(LensFormatGuide 전용). tagline이 "언제 고르는가"라면 이쪽은 "고르면 무엇을 보는가". */
  content: string;
  /**
   * 역할 캐릭터 일러스트. 선택된 시선을 크게 보여주는 자리(상세 카드 헤더, 전체 비교 모드)에만 쓴다.
   * 홈 4칸에는 쓰지 않는다(기사 사진과 주인공이 충돌하고, 375px 2x2 그리드에서 밀도가 무너지며,
   * 기사가 바뀌어도 그림이 그대로라 정보 가치가 없다).
   * 흰 배경 PNG이므로 tint 배경 위에서는 CSS `mix-blend-mode: multiply`로 흰색을 제거한다.
   */
  illustration: string;
  /** 일러스트를 못 쓰는 작은 자리(레일·홈 칩)용 아이콘. */
  icon: LucideIcon;
  color: string;
  tint: string;
  border: string;
}

// 4포맷 라벨(레터·웹툰·팟캐스트·영상). LENS_FORMATS와 이름·순서가 같다.
//
// 태그라인은 "어떤 상황에서 이 형식을 고르는가"를 한 줄로 압축한 것이다
// (근거: docs/product/4format-persona-system.md). 색·아이콘·순서는 인덱스 기준이다.
//
// 팔레트는 사이트 전역 페르소나 브랜드 컬러(BRAND_ACCENTS)를 인덱스 순서로 직접 참조해 두 체계가
// 벌어지지 않게 한다. border만 BRAND_ACCENTS에 없는 필드라 각 색상군의 Tailwind 200 셰이드로 둔다
// (현재 소비처 없음, 예비 값).
const LENS_BORDER_TINTS = ['#ddd6fe', '#fecdd3', '#a7f3d0', '#fde68a'] as const;

export const LENS_PERSPECTIVES: readonly LensPerspective[] = [
  {
    ordinal: '①',
    short: '레터',
    full: '차분히 읽고 싶은 사람',
    tagline: '구조와 흐름까지 제대로 알고 싶다면',
    duration: '2분 읽기',
    content: '배경부터 전망까지, 글 한 편으로 차근차근 읽어요',
    illustration: '/lens/role-1-newcomer.png',
    icon: BookOpen,
    color: BRAND_ACCENTS[0].accent,
    tint: BRAND_ACCENTS[0].soft,
    border: LENS_BORDER_TINTS[0],
  },
  {
    ordinal: '②',
    short: '웹툰',
    full: '그림으로 가볍게 보고 싶은 사람',
    tagline: '이야기로 스르륵 넘겨보고 싶다면',
    duration: '30초 스와이프',
    content: '8컷 만화 — 등장인물 대화를 따라가면 금방 이해돼요',
    illustration: '/lens/role-2-worker.png',
    icon: Image,
    color: BRAND_ACCENTS[1].accent,
    tint: BRAND_ACCENTS[1].soft,
    border: LENS_BORDER_TINTS[1],
  },
  {
    ordinal: '③',
    short: '팟캐스트',
    full: '귀로 듣고 싶은 사람',
    tagline: '이동 중이라 화면 볼 여유가 없다면',
    duration: '3분 청취',
    content: '출퇴근길에 틀어두세요 — 핵심만 골라 차분히 들려드려요',
    illustration: '/lens/role-3-owner.png',
    icon: Headphones,
    color: BRAND_ACCENTS[2].accent,
    tint: BRAND_ACCENTS[2].soft,
    border: LENS_BORDER_TINTS[2],
  },
  {
    ordinal: '④',
    short: '영상',
    full: '빠르게 훑고 싶은 사람',
    tagline: '3초 안에 무슨 일인지 알고 싶다면',
    duration: '15초 시청',
    content: '15초 영상 — 핵심 수치만 자막으로 콕 짚어드려요',
    illustration: '/lens/role-4-investor.png',
    icon: Video,
    color: BRAND_ACCENTS[3].accent,
    tint: BRAND_ACCENTS[3].soft,
    border: LENS_BORDER_TINTS[3],
  },
] as const;

/**
 * 시선별 출력 포맷(레터·웹툰·팟캐스트·영상). admin 프롬프트 카테고리(letters/webtoon/podcast/video)와 이름이 같다.
 * `LensViewClient.tsx`는 `l.images`/`l.media_url`/`l.video_url`이 있으면 실제 웹툰 컷·오디오·비디오를 그리고,
 * 없으면(생성 이전의 옛 글) 정적 목업으로 폴백한다. 인덱스 순서는 LENS_PERSPECTIVES와 같다.
 */
export type LensFormat = 'letter' | 'webtoon' | 'podcast' | 'video';

export const LENS_FORMATS: readonly LensFormat[] = ['letter', 'webtoon', 'podcast', 'video'] as const;

/** 범위를 벗어나도 안전하다. 시선 개수만큼 순환한다. */
export function lensFormatAt(i: number): LensFormat {
  return LENS_FORMATS[i % LENS_FORMATS.length];
}

/** 범위를 벗어나도 안전하다. lenses 길이가 4가 아닐 수 있다. */
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
 * 해시(#lens-N) 대신 쿼리를 쓴다. 해시는 브라우저가 같은 id 요소로 자동 스크롤해 상세가 히어로를 건너뛰지만,
 * 쿼리는 스크롤을 유발하지 않아 항상 최상단에서 시작하며 해당 탭만 선택된다.
 */
export function parseLensView(search: string): number | null {
  const m = /[?&]v=(\d+)/.exec(search);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1) return null;
  return n - 1;
}

/**
 * "사진 칸"에 넣을 이미지를 고른다. 텍스트 없는 순수 사진만 허용한다.
 *
 * cover_image_url은 헤드라인·날짜·라벨이 픽셀에 박힌 인스타 카드뉴스 완성형 그래픽이라 폴백으로 쓰지 않는다
 * (HTML 헤드라인과 중복되고 "사진 칸엔 사진만" 원칙이 깨진다). 사진 영역 높이가 글마다 달라 신뢰할 수 있는 크롭 규칙도 없다.
 * photo_image_url이 없으면 null을 돌려주며, 호출부는 사진 칸을 렌더하지 않는다.
 */
export function pickLensPhoto(lens: {
  photo_image_url?: string | null;
  id?: string;
}): string | null {
  const photo = (lens.photo_image_url ?? '').trim();
  if (photo) return photo;

  // 글과 맞는 사진(직접 큐레이션)은 dev/prod 구분 없이 쓴다. 지정된 기사에만 적용되므로 프로덕션 노출 리스크가 없다.
  if (lens.id) {
    const exact = DEV_EXACT_PHOTOS[lens.id];
    if (exact) return exact;
  }

  // 개발 환경 전용 미리보기. photo_image_url이 비어 있는 글에 실제 기사 사진(letters 채널 커버)을 무작위로 물려
  // 사진 배치를 확인한다. 엉뚱한 사진이 붙을 수 있어 production에서는 실행하지 않는다.
  // 글 id로 결정되므로 같은 글은 항상 같은 사진이 나온다(하이드레이션 불일치 없음).
  if (process.env.NODE_ENV === 'development' && lens.id) {
    const seed = [...lens.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    return DEV_SAMPLE_PHOTOS[seed % DEV_SAMPLE_PHOTOS.length];
  }
  return null;
}

/** 개발 환경에서 글별로 실제 사진을 지정하는 임시 맵. admin이 photo_image_url을 채우면 불필요해진다. */
const DEV_EXACT_PHOTOS: Record<string, string> = {
  '2026-08-14-쏘카-테슬라-800대-더-늘린다-전기차-비중-14-로': '/lens/sample-socar-tesla.jpg',
};

const DEV_SAMPLE_PHOTOS = [
  'https://sedaily-mbti-cms-media-dev.s3.us-east-1.amazonaws.com/media/2026/08/7508d7943ac7-rcv.yna.20260729.pyh2026072910290005700-p1.jpg',
  'https://sedaily-mbti-cms-media-dev.s3.us-east-1.amazonaws.com/media/2026/08/ce73962a4a18-news-p.v1.20260117.5ed23c7c1187459082f72ed48fb2070b-p1.jpg',
  'https://sedaily-mbti-cms-media-dev.s3.us-east-1.amazonaws.com/media/2026/08/d466cfa8159b-news-p.v1.20260811.7333b418f0b5460cb29b753baccfcaee-p1.png',
];

// 탭·칩·헤더의 역할명은 모두 인덱스 기준 고정값(LENS_PERSPECTIVES[i].short/full)을 쓴다.
// 저장된 label(질문 축)은 화면에 노출하지 않는다.
