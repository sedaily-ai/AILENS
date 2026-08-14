/**
 * 시대 팩트 — "사주 위에 얹는 세상의 흐름" 데이터.
 *
 * 2026-07-09 이전엔 서울경제 뉴스 검색 API(MBTI 백엔드, chat-bedrock Lambda의 `task:'news'` 프록시
 * 경유)에서 실데이터를 가져왔으나, MBTI 사이트와 코드/인프라를 공유하지 않기로 하며 제거.
 * 현재는 아래 ERA_FACTS placeholder만 사용한다(EraFactCard가 '예시' 배지 노출).
 */
import type { ConcernId } from './types';

export interface EraFact {
  ko: string;
  en: string;
  /** 출처 라벨 — 실데이터면 '서울경제 · 날짜', placeholder 면 '예시 …' */
  source: string;
  sourceEn: string;
  /** 실데이터(기사)면 원문 링크. 없으면 placeholder(예시)로 간주 */
  url?: string;
}

export const ERA_FACTS: Record<ConcernId, EraFact[]> = {
  career: [
    { ko: '30대 직무 전환자 비중이 늘어나는 추세', en: 'Career switching in one’s 30s is trending up', source: '예시 · 서울경제 데이터 연동 예정', sourceEn: 'Sample · Sedaily data TBD' },
    { ko: '첫 직장 평균 근속은 길지 않은 편', en: 'Average tenure at a first job stays short', source: '예시 · 서울경제 데이터 연동 예정', sourceEn: 'Sample · Sedaily data TBD' },
    { ko: '“한 우물”보다 여러 경험을 선호하는 기업이 느는 흐름', en: 'More firms value varied experience over a single track', source: '예시 · 서울경제 데이터 연동 예정', sourceEn: 'Sample · Sedaily data TBD' },
  ],
  money: [
    { ko: '사회초년생의 목돈 형성 기간이 길어지는 흐름', en: 'It takes longer for young adults to build savings', source: '예시 · 서울경제 데이터 연동 예정', sourceEn: 'Sample · Sedaily data TBD' },
    { ko: '“노후 준비가 막막하다”는 응답이 높은 편', en: 'Many feel unprepared for later life', source: '예시 · 서울경제 데이터 연동 예정', sourceEn: 'Sample · Sedaily data TBD' },
  ],
  relationship: [
    { ko: '1인 가구 비중이 꾸준히 늘어나는 흐름', en: 'Single-person households keep rising', source: '예시 · 서울경제 데이터 연동 예정', sourceEn: 'Sample · Sedaily data TBD' },
    { ko: '결혼·연애의 “정해진 시기”에 대한 인식이 옅어지는 추세', en: 'The idea of a “right time” for marriage is fading', source: '예시 · 서울경제 데이터 연동 예정', sourceEn: 'Sample · Sedaily data TBD' },
  ],
  overwhelmed: [
    { ko: '번아웃을 경험했다는 응답이 높게 나타나는 흐름', en: 'Reported burnout runs high', source: '예시 · 서울경제 데이터 연동 예정', sourceEn: 'Sample · Sedaily data TBD' },
    { ko: '“쉬어가는 시기”를 택하는 사람이 느는 추세', en: 'More people choose to take a pause', source: '예시 · 서울경제 데이터 연동 예정', sourceEn: 'Sample · Sedaily data TBD' },
  ],
};

export function eraFactsFor(concern: ConcernId): EraFact[] {
  return ERA_FACTS[concern] ?? [];
}
