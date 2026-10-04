import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { lensFormatAt } from '@/shared/constants/lensPerspectives';

// LensViewClient.tsx에서 추출(2026-08-24, God 파일 분해).
// 2026-08-24(웹툰 릴론치 PR #10 반영) — mockDuration/bridge 제거, 실측
// 재생시간 계산(clock/readMinutes/formatAmount) 추가. 아래 주석 참조.

/**
 * 재생 길이 표기 — 2026-08-21부터 **실측값만** 쓴다.
 *
 * 이전엔 mockDuration(불릿 개수 × 18초 + 15초)으로 "그럴듯한 추정치"를
 * 만들어 붙였다. 실제 오디오·영상이 붙은 뒤에도 그 추정치가 그대로
 * 노출돼서, 화면에 적힌 "1:33"과 플레이어가 재생하는 실제 길이가 서로
 * 달랐다 — 뉴스 서비스에서 지어낸 숫자를 화면에 박아두면 안 된다.
 * 이제 <audio>/<video>의 loadedmetadata에서 받은 duration만 표시하고,
 * 아직 모르면 길이 자리를 비워둔다(포맷 이름만 보여준다).
 */
function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 레터 예상 읽기 시간. 한글 묵독 속도를 분당 500자로 잡는다(보수적 추정 —
 * 통상 600~700자로 보지만 경제 기사엔 수치·고유명사가 많아 느려진다).
 * 이건 추정임을 문구에서도 "약 N분"으로 밝힌다.
 */
export function readMinutes(chars: number): number {
  return Math.max(1, Math.round(chars / 500));
}

/**
 * 형식 탭에 붙는 **실제 분량** — 이 기사를 이 형식으로 보면 얼마나 되는지
 * (약 2분 / 8컷 / 3:24 / 준비 중).
 *
 * 2026-08-21에 추가했다. 그 전 탭은 아이콘 + 이름뿐이라 넷 중 무엇을 고를
 * 근거가 화면에 없었고, 결국 하나씩 눌러 확인해야 했다. 그런데 이 서비스가
 * 다른 데서 못 보여주는 것이 바로 "같은 기사 = 네 가지 분량"이다 — 그걸
 * 선택 시점에 나란히 놓는다.
 *
 * 동시에 "준비 중"을 결정 시점으로 끌어올린다. 앞서는 형식을 고른 **뒤에야**
 * 음성이 없다는 걸 알렸는데, 고르기 전에 알려주는 게 맞다.
 *
 * 오디오·영상 길이는 loadedmetadata가 오기 전까지는 모르므로 그때까지
 * "음성"/"영상"이라고만 쓴다. 지어낸 길이는 쓰지 않는다(clock() 주석 참조).
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

  // 오디오·영상은 파일에서 길이를 읽어야 안다. 아직 안 왔으면 "⋯"만 둔다 —
  // 형식 이름을 한 번 더 쓰면("영상 · 영상") 중복이고, "--:--"는 있지도 않은
  // 플레이어 상태를 흉내내는 것이고, 지어낸 길이는 애초에 금지다.
  // 스크린리더에는 "길이 확인 중"으로 또박또박 읽힌다.
  const url = format === 'podcast' ? l.media_url : l.video_url;
  if (!url) return nope;
  if (!durSec) return { text: '⋯', spoken: '길이 확인 중' };
  const m = Math.floor(durSec / 60);
  const s = durSec % 60;
  return { text: clock(durSec), spoken: s === 0 ? `${m}분` : `${m}분 ${s}초` };
}

/**
 * 완성감 있는 데모 샘플(2026-08-18, "원소스를 프롬프트로 멀티 포맷 변환하는
 * 게 목적" — 카드뉴스·영상·팟캐스트·레터 각각에 맞는 각본으로 바꾸고, 상단에
 * 핵심 요약도 두라는 요청). 이전엔 CMS 4렌즈 불릿(짧은 카드뉴스 문장)만
 * 재활용했는데, 사용자가 원본 기사 전문(김태영 기자, 2026-08-14 06:40 입력)을
 * 직접 붙여줘서 그 전문의 사실을 근거로 포맷별로 다시 썼다 — 원문에는 있지만
 * CMS 4렌즈 불릿에는 없던 사실(500대+300대 순차 도입, 20종 라인업, 제주 제외
 * 지역 조건, 종목코드 403550 등)까지 포함해 밀도를 올렸다. 변조 없이 원문
 * 사실만 재구성. `lens.id`(기사 slug) 키 기준 — 이 특정 기사에만 적용되고
 * 나머지 기사는 지금처럼 CMS 데이터를 그대로 쓴다. 원래는 로컬 dev에서만
 * 켜지는 목업이었으나(2026-08-18 국장님 회의용 실제 프로덕션 노출로 전환
 * — "풀어달라" 요청, `NODE_ENV` 게이트 제거) 지금은 프로덕션에도 그대로
 * 노출된다.
 *
 * bridge(포맷 간 연결 문구)는 2026-08-21에 걷어냈다("다음 시선" 버튼 자체가
 * 빠졌다 — LensFormatPanel.tsx 주석 참조) — 이 상수에서도 제거.
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
    // 카드뉴스(공감) — "그래서 누가 어떻게 됐을까"는 사람·선택지 중심이어야
    // 하는데, 처음 버전은 물량·일정 숫자만 나열해 "숫자" 페르소나와 다를 게
    // 없었다(2026-08-18, 품질 체크에서 지적). 물량·일정은 영상이 이미
    // 다루니, 카드뉴스는 "그래서 나는 뭘 타게 되나"로 완전히 바꿔 겹침을
    // 없앴다.
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

// "핵심 요약" 불릿 — 실제 lens 데이터 기반(2026-08-20, GEO 개선 — 사용자
// 요청: 인용하기 쉬운 리스트·통계가 상단에 있으면 AI 답변엔진 노출에
// 유리하다는 리서치 결과 반영). 팟캐스트 불릿이 사실·수치 위주로 쓰이도록
// 설계돼 있어 1순위, 없으면 영상→웹툰→레터 순으로 폴백(LENS_FORMATS 인덱스
// 기준: 팟캐스트=2, 영상=3, 웹툰=1, 레터=0).
// 2026-09 — 레터(0)를 최우선으로 바꿨다. [핵심 요약] 블록 신설(레터
// 프롬프트, DDB PROMPT#letters/published v#4) 전까지는 레터·팟캐스트·영상
// 전부 bullets가 비어있어서 이 카드가 사실상 항상 웹툰(1) 컷 캡션이었다
// — 캡션은 그림과 같이 볼 때만 뜻이 완결되는 짧은 대사라, 그림 없이
// 텍스트만 카드로 떼어놓으면 맥락이 빠진다(기자 피드백: "질문만 던지고
// 답이 없다"). 레터는 [핵심 요약] 전용 불릿을 새로 만들어서 이 카드
// 하나만 보고도 이해되게 쓴다 — 웹툰은 레터가 비었을 때만 폴백으로 남김.
const SUMMARY_BULLET_FORMAT_ORDER = [0, 2, 3, 1];

export function coreSummaryBullets(lens: CmsLens): string[] {
  for (const i of SUMMARY_BULLET_FORMAT_ORDER) {
    const bullets = (lens.lenses ?? [])[i]?.bullets?.filter((b) => b && b.trim());
    if (bullets && bullets.length > 0) return bullets.slice(0, 4);
  }
  return [];
}
