import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { lensFormatAt } from '@/shared/constants/lensPerspectives';

// 형식 패널 보조 로직 — 실측 재생시간 계산(clock/readMinutes/formatAmount)과 데모 샘플.

/**
 * 재생 길이 표기 — 실측값만 쓴다.
 * <audio>/<video>의 loadedmetadata에서 받은 duration만 표시하고, 아직 모르면 길이 자리를 비워둔다(포맷 이름만 보여준다).
 * 추정치는 화면 표기와 실제 재생 길이를 어긋나게 하므로 지어낸 숫자는 쓰지 않는다.
 */
function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 레터 예상 읽기 시간. 한글 묵독 속도를 분당 500자로 잡는다(보수적 추정 — 경제 기사는 수치·고유명사가 많아 통상 600~700자보다 느리다).
 * 추정치이므로 문구에서도 "약 N분"으로 표기한다.
 */
export function readMinutes(chars: number): number {
  return Math.max(1, Math.round(chars / 500));
}

/**
 * 형식 탭에 붙는 실제 분량 — 이 기사를 이 형식으로 보면 얼마나 되는지(약 2분 / 8컷 / 3:24 / 준비 중).
 * 선택 시점에 네 형식의 분량을 나란히 보여주고, "준비 중"도 고르기 전에 알린다.
 * 오디오·영상 길이는 loadedmetadata 전까지 알 수 없으므로 그때까지 "음성"/"영상"으로만 쓴다(clock() 참조).
 */
export function formatAmount(
  lens: CmsLens,
  i: number,
  durSec: number | undefined,
): { text: string; spoken: string } {
  const l = (lens.lenses ?? [])[i];
  const nope = { text: '준비 중', spoken: '준비 중' };
  if (!l) return nope;
  const format = lensFormatAt(i);

  if (format === 'letter') {
    const paras =
      articleFormatSample(lens.id, 'letter') ?? (l.paragraphs && l.paragraphs.length > 0 ? l.paragraphs : null);
    const chars = (paras ?? l.bullets).join('').length;
    if (chars === 0) return nope;
    const m = readMinutes(chars);
    return { text: `약 ${m}분`, spoken: `약 ${m}분 분량` };
  }

  if (format === 'webtoon') {
    const cuts = l.images?.length ?? 0;
    return cuts > 0 ? { text: `${cuts}컷`, spoken: `${cuts}컷` } : nope;
  }

  // 오디오·영상은 파일에서 길이를 읽어야 안다. 아직 없으면 "⋯"만 둔다. 형식 이름 반복("영상 · 영상")이나 "--:--"(없는 플레이어 상태 흉내), 지어낸 길이는 쓰지 않는다.
  // 스크린리더에는 "길이 확인 중"으로 읽힌다.
  const url = format === 'podcast' ? l.media_url : l.video_url;
  if (!url) return nope;
  if (!durSec) return { text: '⋯', spoken: '길이 확인 중' };
  const m = Math.floor(durSec / 60);
  const s = durSec % 60;
  return { text: clock(durSec), spoken: s === 0 ? `${m}분` : `${m}분 ${s}초` };
}

/**
 * 완성감 있는 데모 샘플 — `lens.id`(기사 slug) 키 기준으로 특정 기사에만 적용하고, 나머지 기사는 CMS 데이터를 그대로 쓴다.
 * 원본 기사 전문의 사실만 근거로 포맷별(카드뉴스·영상·팟캐스트·레터) 각본으로 재구성했으며 변조는 없다. 프로덕션에도 노출된다.
 */
export const ARTICLE_FORMAT_SAMPLES: Record<
  string,
  {
    summary?: string[];
    letter?: string[];
    webtoonHeadline?: string;
    webtoon?: string[];
    podcast?: string[];
    video?: string[];
  }
> = {
  '2026-08-14-쏘카-테슬라-800대-더-늘린다-전기차-비중-14-로': {
    // 상단 "핵심 요약" — AI LENS 편집장 프롬프트의 "⚡ 30초 핵심"에 해당.
    summary: [
      '쏘카가 연말까지 전기차 비중을 14%로 끌어올려요 — 테슬라 모델Y 800여대와 BYD 아토3 100여대를 9월 말까지 추가해요.',
      '전기차 운영 대수는 지난해보다 59% 늘었고, 대당 수익성도 내연기관차보다 53% 높아요.',
      '이달 28일까지 모델Y 24시간 이상 대여 시 70% 할인, 한 달 전 예약하면 얼리버드 혜택도 있어요.',
    ],
    // 레터(원인) — "왜 이렇게 됐을까"에 맞춰 이용 데이터 중심 서사.
    letter: [
      '쏘카가 전기차를, 그중에서도 테슬라를 이렇게까지 늘리는 이유는 이용 데이터에 있어요. 올해 2분기 전기차 예약은 한 번 빌리면 평균 27시간을 썼는데, 이건 내연기관차의 두 배예요.',
      '게다가 전기차로 다닌 거리의 84%가 100km를 넘었고, 차 한 대 유지관리비도 내연기관차보다 34% 낮았어요. 대당 수익성은 오히려 53% 더 높았고요.',
      '쏘카는 올해 기아 EV3·EV4 롱레인지, 현대차 아이오닉9, 테슬라 모델S·모델X까지 들이며 운영하는 전기차 종류를 20종으로 늘려왔어요. 오래, 멀리, 싸게, 그리고 다양하게 쓰인다는 뜻이니 쏘카 입장에선 늘릴 이유가 충분한 셈이죠.',
    ],
    // 카드뉴스(공감) — "그래서 나는 뭘 타게 되나"를 사람·선택지 중심으로 쓴다(물량·일정은 영상이 다룬다).
    webtoonHeadline: '그래서 누가 이 차를 타게 될까',
    webtoon: [
      '예산 넉넉하게 쓰고 싶다면 — 새로 늘어난 모델Y·모델S·모델X, 프리미엄 \'블랙라벨\'로 예약할 수 있어요.',
      '실속 있게 타고 싶다면 — 기아 EV3, 현대 아이오닉9 같은 실속형·SUV까지 골라 탈 수 있어요.',
      '쏘카가 굴리는 전기차만 20종 — 세단부터 SUV까지, 원하는 대로 골라 타는 시대가 됐어요.',
    ],
    // 팟캐스트(실무) — "그래서 나는 뭘 해야 할까", 이용자 행동 중심 대본.
    podcast: [
      '이번 혜택은 테슬라 모델Y 한정이고, 이달 28일까지 약 3주간 진행돼요. 제주 지역은 빠져요.',
      '그 기간엔 매일 선착순 500명에게, 24시간 이상 빌리면 대여료를 70% 할인해드려요.',
      '여유가 있다면 한 달 전에 모델Y나 아이오닉9, EV9 같은 프리미엄 전기차를 예약해보세요. 2일권을 18만 9000원부터 살 수 있는 얼리버드 혜택이 있어요.',
      '안동화 쏘카 카셰어링본부장은 "예산과 목적에 따라 원하는 전기차를 이용할 수 있도록 증차를 추진했다"고 밝혔어요.',
    ],
    // 영상(숫자) — "그래서 숫자로 보면", 규모·비율 수치 중심 타임라인.
    video: [
      '이번에 늘리는 전기차, 모델Y 800여대에 BYD 아토3 100여대까지 총 900여대예요.',
      '이달 말까지 500대, 다음 달 말까지 300여대로 나눠 들어와요.',
      '기존 차량까지 합치면 쏘카가 굴리는 테슬라만 약 1000대가 돼요.',
      '전기차 운영 대수는 지난해 같은 기간보다 59% 늘었고요.',
      '대당 수익성은 내연기관차보다 53% 높았어요. 쏘카가 잡은 연말 목표는 전기차 비중 14%예요.',
    ],
  },
};

export function articleFormatSample(
  lensId: string,
  format: 'letter' | 'webtoon' | 'podcast' | 'video',
): string[] | null {
  return ARTICLE_FORMAT_SAMPLES[lensId]?.[format] ?? null;
}

// "핵심 요약" 불릿 — 실제 lens 데이터 기반이며 인용하기 쉬운 리스트·통계를 상단에 둔다(AI 답변엔진 노출에 유리).
// 우선순위는 레터(0) → 팟캐스트(2) → 영상(3) → 웹툰(1)(LENS_FORMATS 인덱스 기준). 레터는 [핵심 요약] 전용 불릿이 있어 카드만 보고도 이해된다.
// 웹툰 컷 캡션은 그림과 함께 볼 때만 뜻이 완결되므로 레터가 비었을 때의 폴백으로만 쓴다.
const SUMMARY_BULLET_FORMAT_ORDER = [0, 2, 3, 1];

export function coreSummaryBullets(lens: CmsLens): string[] {
  for (const i of SUMMARY_BULLET_FORMAT_ORDER) {
    const bullets = (lens.lenses ?? [])[i]?.bullets?.filter((b) => b && b.trim());
    if (bullets && bullets.length > 0) return bullets.slice(0, 4);
  }
  return [];
}
