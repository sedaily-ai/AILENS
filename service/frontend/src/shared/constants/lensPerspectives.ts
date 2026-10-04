import { BookOpen, Image, Headphones, Video, type LucideIcon } from 'lucide-react';
import { BRAND_ACCENTS } from '@/shared/data/brandAccents';

/**
 * "오늘의 이슈, 4가지 시선"(lens) 공용 토큰 — 2026-08-13.
 *
 * 원래 ACCENT/CARD_SHADOW/CARD_BORDER 세 값이 LensPreviewSection·LensViewClient·
 * LensListClient 세 파일에 각각 하드코딩돼 있었다(같은 값 손으로 세 번). 홈 티저와
 * 상세를 시선별 색·아이콘 체계로 재설계하면서 한 곳으로 모은다.
 *
 * ⚠️ 시선별 메타데이터는 반드시 **인덱스 기준**으로 찾는다. 라벨 문자열은
 * admin이 저장한 값이 그대로 내려오고(admin/frontend/src/components/
 * PostForm/LensMode.tsx의 LENS_LABELS), 서비스 프런트엔드는 그 taxonomy를
 * 모른다. 문자열 매칭은 admin에서 문구를 한 글자만 고쳐도 조용히 깨진다.
 * 순서는 admin 폼이 LENS_LABELS를 map 해서 만들기 때문에 레터 → 웹툰 →
 * 팟캐스트 → 영상으로 고정이다(2026-08-19 admin 개편 이후 — 그 전엔
 * "원인/당사자/실무/숫자"라는 독자-관점 축이었다, 아래 §LENS_PERSPECTIVES
 * 히스토리 참고).
 *
 * ⚠️ 다만 `lenses` 배열이 항상 4개라는 보장은 타입에도 백엔드에도 없다
 * (backend _shape_lens 가 패딩하지 않음 — 빈 배열이거나 question/bullets가
 * 빈 문자열일 수 있다). 그래서 lensPerspectiveAt() 은 범위를 벗어난 인덱스에도
 * 항상 뭔가를 돌려준다.
 */

export const LENS_ACCENT = '#3b82f6';

/**
 * 기사 상세 읽기 영역의 강조색(2026-10-01) — 서울경제 CI의 푸른 S 로고에서 뽑은 색(로고 본색 약 #5b7bb0)을
 * 밝은 파스텔로 올렸다(2026-10-01 사용자 피드백 — 진한 색은 어둡고 무거움). 작은 글자는 사용처에서 진하게 섞는다. 형식(레터·웹툰·팟캐스트·영상)별 색 대신 읽기 영역
 * 전체(챕터 번호·목차·완독 체크·서명·요약 번호)에 이 한 색만 쓴다 — 형식 구분은 탭 아이콘이 맡는다.
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
  /** 소요시간 한 줄(2026-09-30, 메인 리디자인 — "자투리 시간에 씹어준다"는
   * 미션을 형식 타일에서 바로 증명). 실측 값이 아니라 평균적인 소비
   * 시간을 편집팀 감각으로 붙인 근사치 — 실제 재생시간/글자수 기반 동적
   * 계산으로 바꾸려면 CMS에 duration 필드가 따로 필요하다(지금은 없음). */
  duration: string;
  /** 실제로 뭐가 담겨 있는지(2026-08-21, 첫 방문자용 가이드
   * LensFormatGuide.tsx 전용) — tagline이 "언제 고르는가"라면 이건
   * "고르면 뭘 보게 되는가". */
  content: string;
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

// 4포맷 라벨(2026-08-20 개편) — 레터·웹툰·팟캐스트·영상.
//
// 히스토리: 처음엔 사회초년생·직장인·자영업자·투자자 같은 "직업/생애단계"
// 역할이었다가(2026-08-13, 안 1), "원인/당사자/실무/숫자"라는 독자
// 관심축으로 한 번 바뀌었다(2026-08-17). 그런데 2026-08-18 "국장님 지시"로
// 네 시선의 실제 산출물이 텍스트 한 종류가 아니라 레터·웹툰·팟캐스트·영상
// 네 "형식"으로 나오게 되면서, admin의 실제 편집 축(LensMode.tsx의
// LENS_LABELS)도 2026-08-19에 형식 이름으로 통일됐다 — 그런데 이 파일(선택
// UI가 보여주는 라벨·질문·태그라인)은 그 개편에서 빠져서, "이 뉴스, 누구의
// 눈으로 볼까요?"라며 여전히 사람을 고르는 것처럼 물으면서 정작 내용은
// 형식이 다른, 프레이밍 불일치가 있었다(2026-08-20, 사용자가 실제 발행
// 글에서 직접 발견). 이번에 형식 축으로 다시 맞췄다 — LENS_FORMATS와
// 이제 이름·순서가 완전히 같다(레터→웹툰→팟캐스트→영상).
//
// 태그라인은 "어떤 상황에서 이 형식을 고르는가"(docs/product/
// 4format-persona-system.md의 소비 맥락 근거)를 한 줄로 압축한 것 — 레터는
// 집중해서 읽을 시간이 있을 때, 웹툰은 스와이프하며 감정으로 받아들이고
// 싶을 때, 팟캐스트는 이동 중이라 화면을 못 볼 때, 영상은 3초 안에 훑고
// 싶을 때.
//
// ⚠️ 색·아이콘·순서는 여전히 **인덱스 기준**(admin이 LENS_LABELS를 고정
// 순서로 저장하므로).
//
// 팔레트: 원래 기획 덱(2.5/1.3)의 navy/purple/teal/orange 자체 배정이었으나
// 2026-08-18 디자인 감사에서 사이트 전역 페르소나 브랜드 컬러
// (BRAND_ACCENTS — 민철·하은·준서·소율 = NT/NF/ST/SF, 2026-08-06 감사로
// 확정)와 따로 놀고 있다는 게 드러났다. 하드코딩 대신 BRAND_ACCENTS를
// 인덱스 순서로 직접 참조해 두 시스템이 다시 벌어질 수 없게 했다 —
// border만 BRAND_ACCENTS에 없는 필드라 각 색상군의 Tailwind 200 셰이드로
// 유지(현재 소비처 없음, 향후 대비 값). 이 부분은 형식 축으로 바뀌어도
// 그대로 유효해 안 건드렸다.
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
 * 시선별 출력 포맷(2026-08-18, 국장님 지시 — "네 시선을 텍스트만이 아니라
 * 레터·카드뉴스·팟캐스트·영상 네 형식으로 나오게 하라" — 처음엔 "카드뉴스"
 * 였다가 2026-08-19 admin 개편(LensMode.tsx)에서 실제 파이프라인 이름인
 * "웹툰"으로 통일. admin/frontend/src/lib/prompt.ts 의 프롬프트
 * 카테고리(letters/webtoon/podcast/video)와도 이제 이름이 일치한다).
 *
 * 2026-08-20 기준 갱신 — 실제 생성 파이프라인(pipelines/webtoon,
 * pipelines/podcast, pipelines/video)까지 연결돼 실 데이터가 나온다.
 * `LensViewClient.tsx`가 `l.images`/`l.media_url`/`l.video_url`이 있으면
 * 실제 웹툰 컷·오디오 플레이어·비디오를 그리고, 없으면(아직 생성 안 한
 * 옛 글) 이전처럼 정적 목업으로 폴백한다 — 실제 파일이 없을 때도 항상
 * 완성된 형태로 보이게 하려던 원래 설계 의도는 유지. 인덱스 순서는
 * LENS_PERSPECTIVES와 동일 기준(레터→웹툰→팟캐스트→영상)으로 고정.
 */
export type LensFormat = 'letter' | 'webtoon' | 'podcast' | 'video';

export const LENS_FORMATS: readonly LensFormat[] = ['letter', 'webtoon', 'podcast', 'video'] as const;

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

  // 글과 실제로 맞는 사진(직접 큐레이션한 것)이 있으면 dev/prod 가리지
  // 않고 쓴다(2026-08-18, "테슬라도 [프로덕션에] 풀어달라" 요청 — 데모
  // 기사 하나만 정확히 지정된 사진이라 무작위 샘플과 달리 프로덕션 노출
  // 리스크가 없다). 무작위 샘플은 아래에서 여전히 dev 전용으로 남긴다.
  if (lens.id) {
    const exact = DEV_EXACT_PHOTOS[lens.id];
    if (exact) return exact;
  }

  // ── 개발 환경 전용 미리보기 ────────────────────────────────────────────
  // photo_image_url 은 방금 신설한 필드라 발행된 글 전부가 비어 있다. 사진
  // 배치를 눈으로 검토할 수 있도록 로컬(dev)에서만 실제 기사 사진(letters
  // 채널 커버 — 텍스트가 박히지 않은 순수 사진)을 무작위로 물린다.
  // production 빌드에서는 이 분기가 실행되지 않으므로 운영에는 영향이 없다
  // — 무작위 매칭이라 실제 발행 글에 엉뚱한 사진이 붙을 수 있어서(예:
  // 테슬라 기사에 오토바이 사진) 위 exact 매칭과 달리 그대로 dev 전용 유지.
  // 글 id 로 결정되어 같은 글은 항상 같은 사진이 나온다(깜빡임·하이드레이션
  // 불일치 없음). admin 에서 실제 사진을 채우면 이 분기는 자연히 안 쓰인다.
  if (process.env.NODE_ENV === 'development' && lens.id) {
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
