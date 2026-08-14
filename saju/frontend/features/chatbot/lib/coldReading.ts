/**
 * 맞히기 — 명식에서 "당신은 아마…" 추정을 만든다 (규칙 기반).
 * TODO: 실시간 LLM 으로 더 정밀한 맞히기 생성 (narrative.ts 의 경계와 동일)
 */
import type { ConcernId, LangText, SajuContext } from './types';

/** 일간 오행별 핵심 기질 한 줄 */
const ILGAN_TRAIT: Record<string, LangText> = {
  목: { ko: '🌳 머릿속에 늘 뭔가 자라요. 생각 많고, 배우는 걸 좋아해요.', en: '🌳 Something is always growing in your head — curious, always learning.' },
  화: { ko: '🔥 감정이 빨리 타올라요. 열정적이고 표현이 분명해요.', en: '🔥 Your feelings catch fire fast — passionate and expressive.' },
  토: { ko: '⛰️ 쉽게 흔들리지 않아요. 묵직하게 버티고 주변을 잘 챙겨요.', en: '⛰️ Hard to shake — steady, and you look after people.' },
  금: { ko: '⚙️ 기준이 분명해요. 끊고 맺는 게 확실하고 깔끔한 걸 좋아해요.', en: '⚙️ Clear standards — decisive, you like things clean.' },
  수: { ko: '💧 속이 깊어요. 조용히 관찰하고 상황을 멀리 봐요.', en: '💧 Deep waters — you observe quietly and see far.' },
};

/** 결여 오행별 약점 한 줄 (맞히기 마지막 줄) */
const LACK_LINE: Record<string, LangText> = {
  목: { ko: '🌱 근데 — 새로 시작하는 게 늘 망설여지지 않아요?', en: "🌱 But — starting something new always makes you hesitate, doesn't it?" },
  화: { ko: '🔥 근데 — 정작 밀어붙여야 할 때 머뭇거리지 않아요?', en: '🔥 But — when it’s time to push, you hold back, right?' },
  토: { ko: '⛰️ 근데 — 마음이 자주 붕 떠서 안정이 안 되지 않아요?', en: '⛰️ But — your mind often floats, never quite settling?' },
  금: { ko: '⚙️ 근데 — 벌인 걸 끝까지 마무리하는 게 제일 어렵지 않아요?', en: "⚙️ But — finishing what you start is the hardest part, isn't it?" },
  수: { ko: '💧 근데 — 가끔 앞만 보고 달리다 혼자 지치지 않아요?', en: '💧 But — sometimes you run ahead and burn out alone?' },
};

/** 초기 맞히기 카드 (입력 직후, 일반 성향) — 3줄 */
export function initialPredict(saju: SajuContext): LangText[] {
  const lines: LangText[] = [];
  if (ILGAN_TRAIT[saju.ilganOh]) lines.push(ILGAN_TRAIT[saju.ilganOh]);

  // 2번째 줄: 신강/과다 → 여러 개 벌임 / 신약 → 자주 미룸
  if (saju.score >= 60 || saju.excess.length) {
    lines.push({ ko: '💭 한 번에 여러 걸 벌여놓고, 머릿속이 복잡한 편이에요.', en: '💭 You take on several things at once, and your head gets busy.' });
  } else {
    lines.push({ ko: '💭 신중한 만큼, 결정 앞에서 자주 머뭇거려요.', en: '💭 Careful as you are, decisions make you pause.' });
  }

  // 3번째 줄: 결여 오행 약점 (없으면 신강약 기반)
  const lack = saju.lacking.find(o => LACK_LINE[o]);
  if (lack) {
    lines.push(LACK_LINE[lack]);
  } else if (saju.score >= 60) {
    lines.push({ ko: '⚙️ 근데 — 가끔 고집이 세다는 말, 듣지 않아요?', en: "⚙️ But — people say you're stubborn sometimes, right?" });
  } else {
    lines.push({ ko: '⚙️ 근데 — 끝까지 밀고 가는 힘이 아쉽지 않아요?', en: '⚙️ But — you wish you had more follow-through, right?' });
  }
  return lines;
}

/** 매듭 안 맞히기 (3단계) — concern + 좁히기 답 + 명식으로 더 구체적으로 */
export function knotHit(concern: ConcernId, narrowAnswers: string[], saju: SajuContext): LangText {
  const lacksGold = saju.lacking.includes('금');
  const period = narrowAnswers.includes('mid') ? '2~3년' : narrowAnswers.includes('long') ? '꽤 오랜 시간' : null;

  if (concern === 'career') {
    if (period && lacksGold) {
      return {
        ko: `그 ${period} 동안, 분명 여러 개 시도는 했는데 하나도 "끝냈다" 소리는 못 하고 있지 않아요?`,
        en: `Over those ${narrowAnswers.includes('mid') ? '2–3 years' : 'years'}, you tried several things but never quite "finished" one, right?`,
      };
    }
    return { ko: '머리로는 답을 아는데, 막상 한 걸음이 안 떼지지 않아요?', en: "You know the answer in your head, but can't take the first step, right?" };
  }
  if (concern === 'money') {
    return lacksGold
      ? { ko: '들어오긴 하는데 어디로 새는지 모르게 안 모이지 않아요?', en: "It comes in, but somehow never stays, right?" }
      : { ko: '쓸 땐 괜찮다가 문득 미래가 훅 불안해지지 않아요?', en: 'Fine while spending, then the future suddenly feels shaky?' };
  }
  if (concern === 'relationship') {
    return { ko: '먼저 다가가고 싶은데, 막상 마음을 다 못 보여주지 않아요?', en: 'You want to reach out, but never quite show all of your heart?' };
  }
  // overwhelmed
  return { ko: '딱히 큰일이 난 건 아닌데, 그냥 계속 방전된 느낌이지 않아요?', en: 'Nothing big is wrong, but you just feel drained all the time?' };
}
