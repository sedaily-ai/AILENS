// 에디터 말투 문구(순수 데이터·함수). 사실 문장은 기사에서 그대로 쓰고, 이 파일은 인사·질문 소개·풀이 도입·형식 안내의 "말투"만 담당한다.
// 에디터 8명을 성격 그룹(NT·ST=분석형, NF=이야기형, SF=친근형) 3가지 말투로 묶었다. 콘텐츠 담당 검수 후 에디터별로 더 나눌 수 있다.
export type Voice = 'analyst' | 'story' | 'friend';
export type Moment = 'commute' | 'lunch' | 'evening' | 'night' | 'weekend' | 'day';
export type SituationKey = 'commute' | 'lunch' | 'evening' | 'weekend';

export function voiceOf(group: 'NT' | 'NF' | 'ST' | 'SF' | string): Voice {
  if (group === 'NF') return 'story';
  if (group === 'SF') return 'friend';
  return 'analyst';
}

/** 오늘 설정의 상황이 있으면 그 상황, 없으면 시각으로 정한다(주말은 요일 우선). */
export function momentOf(now: Date, situation?: SituationKey | null): Moment {
  if (situation) return situation;
  const day = now.getDay();
  if (day === 0 || day === 6) return 'weekend';
  const h = now.getHours();
  if (h >= 22 || h < 5) return 'night';
  if (h >= 6 && h < 10) return 'commute';
  if (h >= 11 && h < 14) return 'lunch';
  if (h >= 17 && h < 22) return 'evening';
  return 'day';
}

const OPENING: Record<Voice, Record<Moment, string>> = {
  analyst: {
    commute: '출근길이시죠? 이어폰 끼고 5분만, 숫자부터 짚어 볼게요.',
    lunch: '점심 드셨어요? 오전에 있었던 일을 핵심만 정리해 드릴게요.',
    evening: '오늘 하루 고생하셨어요. 장 마감 뒤 확인된 것부터 볼까요?',
    night: '자기 전에 오늘 소식을 한 번 정리해 볼까요? 짧게 갈게요.',
    weekend: '주말에는 조금 깊게 볼까요? 이번 주 흐름을 구조로 짚어 드릴게요.',
    day: '지금 꼭 알아야 할 것만 골라 왔어요. 질문부터 눌러 보세요.',
  },
  story: {
    commute: '출근길이시죠? 오늘은 사람 이야기부터 같이 읽어 봐요.',
    lunch: '점심 시간이네요. 가볍게 한 가지 이야기만 듣고 가요.',
    evening: '오늘 하루는 어땠어요? 오늘 있었던 일을 이야기처럼 풀어 드릴게요.',
    night: '자기 전에, 오늘의 이야기를 차분히 들려 드릴게요.',
    weekend: '여유로운 주말이에요. 숫자 뒤에 있는 사람들의 이야기를 해 볼까요?',
    day: '오늘은 어떤 이야기가 궁금하세요? 질문을 골라 보세요.',
  },
  friend: {
    commute: '출근길이죠? 어려운 말은 빼고 쉽게 풀어 드릴게요.',
    lunch: '점심 먹고 한 가지만 가볍게 알아 가요.',
    evening: '오늘 하루도 수고했어요. 궁금한 것부터 편하게 눌러 보세요.',
    night: '자기 전에 오늘 소식, 부담 없이 같이 정리해요.',
    weekend: '주말엔 천천히 봐요. 궁금했던 것부터 하나씩 풀어 볼게요.',
    day: '요즘 뭐가 궁금하세요? 쉽게 알려 드릴게요.',
  },
};
export const openingLine = (voice: Voice, moment: Moment): string => OPENING[voice][moment];

const ANSWER_LEAD: Record<Voice, string> = {
  analyst: '핵심만 정리해 드릴게요.',
  story: '이렇게 풀어 볼게요.',
  friend: '쉽게 말해 볼게요.',
};
export const answerLead = (voice: Voice): string => ANSWER_LEAD[voice];

const NEXT_LEAD: Record<Voice, string> = {
  analyst: '이어서 이렇게도 볼 수 있어요.',
  story: '다른 방식으로도 들려 드릴까요?',
  friend: '다른 걸로도 볼래요?',
};
export const nextLead = (voice: Voice): string => NEXT_LEAD[voice];

/** 형식 캐러셀의 순서와 한 줄 안내. 지금 맞는 형식이 맨 앞에 온다. 인덱스는 기사 화면의 형식 순서와 같다(레터 0·웹툰 1·팟캐스트 2·영상 3). */
export interface FormatCard {
  index: 0 | 1 | 2 | 3;
  label: string;
  line: string;
}
const FORMATS: Record<0 | 1 | 2 | 3, { label: string; base: string }> = {
  0: { label: '읽기', base: '차분히 읽는 레터' },
  1: { label: '웹툰', base: '컷으로 쉽게 보는 웹툰' },
  2: { label: '듣기', base: '귀로 듣는 오늘의 기사' },
  3: { label: '영상', base: '한눈에 보는 영상' },
};
const ORDER: Record<Moment, Array<0 | 1 | 2 | 3>> = {
  commute: [2, 0, 1, 3],
  lunch: [1, 3, 0, 2],
  evening: [0, 1, 3, 2],
  night: [2, 0, 1, 3],
  weekend: [0, 1, 3, 2],
  day: [0, 1, 2, 3],
};
const HINT: Record<Moment, Partial<Record<0 | 1 | 2 | 3, string>>> = {
  commute: { 2: '이동 중엔 귀로 듣기' },
  lunch: { 1: '점심엔 한 컷씩 가볍게' },
  evening: { 0: '퇴근 후엔 차분히 읽기' },
  night: { 2: '자기 전엔 소리로 정리' },
  weekend: { 0: '주말엔 깊이 있게' },
  day: {},
};
export function formatCards(moment: Moment): FormatCard[] {
  return ORDER[moment].map((index) => ({ index, label: FORMATS[index].label, line: HINT[moment][index] ?? FORMATS[index].base }));
}
