/**
 * 팔괘(八卦) — 주역의 8가지 기본 괘. 64괘의 토대가 되는 단위로,
 * 이번 v0 주역점은 64괘 전체 대신 팔괘 하나를 뽑는 가벼운 형태로 시작한다.
 */

export interface Trigram {
  id: string;
  hanja: string;
  ko: string;
  /** 아래(1효)→위(3효) 순서, true=양효(─), false=음효(- -) */
  lines: [boolean, boolean, boolean];
  nature: string;
  keyword: string;
  meaning: string;
}

export const TRIGRAMS: Trigram[] = [
  {
    id: 'geon', hanja: '乾', ko: '건',
    lines: [true, true, true],
    nature: '하늘',
    keyword: '강건함',
    meaning: '멈추지 않는 힘. 지금은 밀어붙일 때입니다.',
  },
  {
    id: 'tae', hanja: '兌', ko: '태',
    lines: [true, true, false],
    nature: '못(澤)',
    keyword: '기쁨',
    meaning: '고인 물이 아니라 흐르는 기쁨. 마음을 나눌수록 커집니다.',
  },
  {
    id: 'li', hanja: '離', ko: '리',
    lines: [true, false, true],
    nature: '불',
    keyword: '밝음',
    meaning: '겉으로 드러날 때. 숨기지 말고 밝혀야 풀립니다.',
  },
  {
    id: 'jin', hanja: '震', ko: '진',
    lines: [true, false, false],
    nature: '우레',
    keyword: '움직임',
    meaning: '갑작스러운 변화가 옵니다. 놀라지 말고 먼저 움직이세요.',
  },
  {
    id: 'son', hanja: '巽', ko: '손',
    lines: [false, true, true],
    nature: '바람',
    keyword: '순응',
    meaning: '틈을 파고드는 바람처럼, 정면 승부보다 스며드는 쪽이 낫습니다.',
  },
  {
    id: 'gam', hanja: '坎', ko: '감',
    lines: [false, true, false],
    nature: '물',
    keyword: '험난',
    meaning: '골짜기를 지나는 물처럼, 지금은 버티며 흘러갈 때입니다.',
  },
  {
    id: 'gan', hanja: '艮', ko: '간',
    lines: [false, false, true],
    nature: '산',
    keyword: '멈춤',
    meaning: '산처럼 멈춰 서야 할 때. 조급함이 오히려 일을 그르칩니다.',
  },
  {
    id: 'gon', hanja: '坤', ko: '곤',
    lines: [false, false, false],
    nature: '땅',
    keyword: '유순',
    meaning: '모든 것을 받아들이는 땅처럼, 지금은 앞서기보다 품을 때입니다.',
  },
];

export function drawRandomTrigram(): Trigram {
  return TRIGRAMS[Math.floor(Math.random() * TRIGRAMS.length)];
}
