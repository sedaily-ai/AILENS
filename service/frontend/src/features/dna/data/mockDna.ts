import type { MbtiGroupId } from '@/shared/data/mbtiGroups';

export interface KeywordStat {
  term: string;
  count: number;
}

export interface HourStat {
  hour: number;     // 0-23
  weight: number;   // 0-1
}

export interface PerspectiveShare {
  group: MbtiGroupId;
  name: string;
  archetype: string;
  percent: number;
  accent: string;
  soft: string;
}

export const MOCK_DNA_STATS = {
  totalLetters: 12,
  totalMinutes: 47,
  totalKeywords: 26,
};

export const MOCK_TOP_KEYWORDS: KeywordStat[] = [
  { term: '해양수도',       count: 7 },
  { term: '4년 골든타임',   count: 6 },
  { term: 'SMR',           count: 5 },
  { term: 'FOMC',          count: 5 },
  { term: 'HBM',           count: 4 },
  { term: 'AI 벨트',        count: 4 },
  { term: '인구소멸',       count: 3 },
  { term: 'MSCI',          count: 3 },
  { term: '두산에너빌리티', count: 3 },
  { term: '점도표',         count: 2 },
];

// 시간대(0-23시) 펴본 빈도
export const MOCK_HOUR_PATTERN: HourStat[] = Array.from({ length: 24 }).map((_, h) => {
  // mock — 출근길(7-8), 점심(12-13), 자기 전(22-23) 패턴
  let weight = 0;
  if (h === 7) weight = 0.85;
  else if (h === 8) weight = 0.6;
  else if (h === 12) weight = 0.45;
  else if (h === 13) weight = 0.3;
  else if (h === 22) weight = 0.7;
  else if (h === 23) weight = 0.4;
  else if (h === 18 || h === 19) weight = 0.15;
  return { hour: h, weight };
});

export const MOCK_PERSPECTIVE_SHARE: PerspectiveShare[] = [
  { group: 'ST', name: '준서', archetype: '실용주의자', percent: 64, accent: '#059669', soft: '#d1fae5' },
  { group: 'NT', name: '민철', archetype: '분석가',     percent: 18, accent: '#7c3aed', soft: '#ede9fe' },
  { group: 'NF', name: '하은', archetype: '이야기꾼',   percent: 12, accent: '#e11d48', soft: '#ffe4e6' },
  { group: 'SF', name: '소율', archetype: '공감러',     percent: 6,  accent: '#d97706', soft: '#fef3c7' },
];
