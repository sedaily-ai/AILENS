/**
 * 고민(매듭 주제) 정의 — 열기 선택지 + 좁히기 질문 트리.
 * '깊이'는 narrow 배열 길이로 조절한다. (career 2단계, 그 외 1단계, overwhelmed 0단계)
 */
import type { ConcernId, LangText } from './types';

export interface NarrowOption { value: string; label: LangText }
export interface NarrowQuestion { prompt: LangText; options: NarrowOption[] }
export interface ConcernDef {
  id: ConcernId;
  emoji: string;
  label: LangText;   // 열기 선택지 & 유저 말풍선
  narrow: NarrowQuestion[];
}

export const CONCERNS: ConcernDef[] = [
  {
    id: 'career',
    emoji: '💼',
    label: { ko: '일·진로', en: 'Work & career' },
    narrow: [
      {
        prompt: { ko: '커리어라고 해도 결이 다 달라요. 어느 쪽에 더 가까워요?', en: 'Career comes in shades. Which is closest?' },
        options: [
          { value: 'fit', label: { ko: '이 길이 맞는지 모르겠어요', en: "Not sure this path fits me" } },
          { value: 'stuck', label: { ko: '방향은 아는데 안 풀려요', en: "I know the way but it's stuck" } },
          { value: 'move', label: { ko: '옮길까 말까 고민이에요', en: 'Thinking about moving on' } },
        ],
      },
      {
        prompt: { ko: '지금 그 길, 얼마나 됐어요?', en: 'How long have you been on it?' },
        options: [
          { value: 'new', label: { ko: '이제 막 시작했어요', en: 'Just started' } },
          { value: 'mid', label: { ko: '2~3년 됐어요', en: '2–3 years' } },
          { value: 'long', label: { ko: '꽤 오래됐어요', en: 'Quite a while' } },
        ],
      },
    ],
  },
  {
    id: 'money',
    emoji: '💰',
    label: { ko: '돈·재물', en: 'Money' },
    narrow: [
      {
        prompt: { ko: '돈 고민도 결이 달라요. 어느 쪽이에요?', en: 'Money worries differ. Which one?' },
        options: [
          { value: 'income', label: { ko: '버는 게 늘 불안해요', en: 'Income feels unstable' } },
          { value: 'keep', label: { ko: '모이질 않아요', en: "It just won't accumulate" } },
          { value: 'future', label: { ko: '미래·노후가 막막해요', en: 'The future feels uncertain' } },
        ],
      },
    ],
  },
  {
    id: 'relationship',
    emoji: '❤️',
    label: { ko: '관계·연애', en: 'Relationships' },
    narrow: [
      {
        prompt: { ko: '관계 고민, 어느 쪽에 가까워요?', en: 'Which is closest?' },
        options: [
          { value: 'lonely', label: { ko: '곁에 사람이 없어요', en: 'No one close by' } },
          { value: 'conflict', label: { ko: '자꾸 부딪혀요', en: 'We keep clashing' } },
          { value: 'doubt', label: { ko: '이 사람이 맞나 싶어요', en: 'Not sure they’re the one' } },
        ],
      },
    ],
  },
  {
    id: 'overwhelmed',
    emoji: '😮‍💨',
    label: { ko: '그냥 다 지쳤어요', en: 'Just worn out' },
    narrow: [],
  },
];

export const CONCERN_MAP: Record<ConcernId, ConcernDef> =
  Object.fromEntries(CONCERNS.map(c => [c.id, c])) as Record<ConcernId, ConcernDef>;

/** 자유 입력 → 가장 가까운 concern 라우팅 (실시간 LLM 의도분류 전 임시).
 *  TODO: LLM 의도분류로 교체 */
export function routeFreeText(text: string): ConcernId | null {
  const s = text.toLowerCase();
  const has = (...ks: string[]) => ks.some(k => s.includes(k));
  // 공부·학업·시험·외국어 등은 가장 가까운 고민인 커리어로 라우팅(교육·취업 뉴스 활용)
  if (has('일', '직장', '회사', '진로', '커리어', '이직', '취업', '취준', '공부', '학업', '시험', '자격증', '외국어', '영어', '유학', '진학', '스펙', '대학', '대학원', 'work', 'job', 'career', 'study', 'exam')) return 'career';
  if (has('돈', '재물', 'money', '돈벌', '투자', '빚', '월급', '노후', '재테크', '부동산', '주식', '저축', '대출')) return 'money';
  if (has('연애', '사랑', '관계', '결혼', '이별', '사람', '썸', '이상형', '소개팅', 'love', 'relationship')) return 'relationship';
  if (has('지쳐', '지침', '힘들', '번아웃', '우울', '스트레스', '쉬고', '쉬어', 'tired', 'burnout')) return 'overwhelmed';
  return null;
}
