import type { PersonaId, DecisionOption } from '../types';
import { PERSONAS } from './personas';

const ELEMENT_ADVICES: Record<string, string[]> = {
  목: [
    '새로운 시작이 좋은 날입니다. 망설이지 말고 한발 앞서 나아가세요.',
    '성장의 기회가 앞에 있습니다. 도전하면 좋은 결과를 얻을 거예요.',
    '유연한 생각이 도움이 될 거 같습니다. 고정관념을 버려보세요.',
  ],
  화: [
    '감정과 직감을 믿으세요. 당신의 느낌이 맞습니다.',
    '열정적으로 임하면 주변이 따라올 거예요.',
    '밝은 에너지가 필요한 시간입니다. 당신이 빛을 발해야 할 때입니다.',
  ],
  토: [
    '안정을 먼저 생각해보세요. 서두르지 않아도 괜찮습니다.',
    '현실적인 판단이 중요합니다. 발로 디딛고 생각하세요.',
    '믿을 수 있는 것에 집중하세요. 기초가 단단하면 모든 게 쉬워집니다.',
  ],
  금: [
    '정리정돈의 시간입니다. 마음도, 주변도 깔끔하게 정리해보세요.',
    '효율성이 핵심입니다. 불필요한 것은 덜어내세요.',
    '원칙을 세우고 따르세요. 규칙이 당신을 지켜줄 거예요.',
  ],
  수: [
    '흘러가는 대로 맡겨보세요. 조용히 흐르는 물이 가장 깊습니다.',
    '깊이 있는 생각을 할 시간입니다. 명상해보세요.',
    '신중함이 미덕입니다. 다시 한번 생각해보고 결정하세요.',
  ],
};

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function generateCardContent(
  decisionText: string,
  chosenOption: DecisionOption,
  personaId: PersonaId,
  ilganOh: string = '목', // 오행 문자열 — 실제 saju_current 미저장 시 목 기본
): string {
  const persona = PERSONAS[personaId];
  if (!persona) return '선택한 페르소나를 찾을 수 없습니다.';

  const advices = ELEMENT_ADVICES[ilganOh] || ELEMENT_ADVICES['목'];

  const hash = hashCode(`${decisionText}${personaId}${chosenOption}`);
  const advice = advices[hash % advices.length];

  const optionContext: Record<DecisionOption, string> = {
    yes: '그 결정이 맞습니다.',
    no: '그렇게 판단하신 게 맞습니다.',
    maybe: '지금은 생각을 정리할 시간이 필요합니다.',
    later: '때를 기다리는 것도 현명합니다.',
  };

  const intro = optionContext[chosenOption];

  return `${intro} ${advice}`;
}
