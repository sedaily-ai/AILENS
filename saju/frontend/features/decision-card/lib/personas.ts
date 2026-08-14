import type { Persona } from '../types';

export const PERSONAS: Record<string, Persona> = {
  wise: {
    id: 'wise',
    name: '현명한 조언자',
    emoji: '🦉',
    tone: '깊이 있고 균형잡힌 시각으로 조언해줍니다',
  },
  bold: {
    id: 'bold',
    name: '용감한 응원자',
    emoji: '🦁',
    tone: '긍정적이고 행동적인 에너지를 북돋아줍니다',
  },
  calm: {
    id: 'calm',
    name: '차분한 관찰자',
    emoji: '🦉',
    tone: '침착함과 사유의 시간을 소중히 여깁니다',
  },
  kind: {
    id: 'kind',
    name: '따뜻한 공감자',
    emoji: '🐰',
    tone: '감정을 이해하고 위로해줍니다',
  },
};

export const personaList = Object.values(PERSONAS);
