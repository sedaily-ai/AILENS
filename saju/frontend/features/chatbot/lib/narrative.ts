/**
 * 얹기(4) · 매듭짓기(5) 서술 생성.
 *
 * ★ LLM 호출 경계 ★
 * 최종적으로는 이 두 함수를 실시간 LLM(서울경제/Bedrock 엔드포인트) 호출로 대체한다.
 * 지금은 명식(SajuContext) + 좁히기 답 + 누적 고민을 받아 템플릿으로 합성한다 (비용 $0).
 * TODO: replace buildOverlay/buildKnot internals with a realtime LLM call.
 */
import { OH_HJ } from '@saju/features/fortune/lib/engine';
import type { ConcernId, LangText, SajuContext } from './types';
import { CONCERN_MAP } from './concerns';

/** 대운 오행 → 지금이 어떤 '때'인지 한 줄 */
const DAEUN_PHASE: Record<string, LangText> = {
  수: { ko: '흡수하는 때예요. 쌓이기만 하고 안 터지는 느낌이 자연스러워요.', en: 'a time of absorbing — it’s natural to feel things pile up without breaking out.' },
  목: { ko: '뻗어나가는 때예요. 새로 벌이고 키우기 좋은 시기예요.', en: 'a time of growth — good for starting and expanding.' },
  화: { ko: '드러나는 때예요. 성과와 표현이 밖으로 나오는 시기예요.', en: 'a time of showing — results and expression come outward.' },
  금: { ko: '깎아 정리하는 때예요. 방향을 정하고 끊어낼 힘이 들어와요.', en: 'a time of pruning — the power to choose a direction and cut comes in.' },
  토: { ko: '다지는 때예요. 자리를 잡고 안정시키는 시기예요.', en: 'a time of grounding — settling in and stabilizing.' },
};

const ohHj = (oh: string) => (oh ? `${oh}(${OH_HJ[oh] ?? ''})` : '');

/** 4단계 얹기 — 사주 시기 서술 + 시대 팩트로 넘어가는 한 줄. (EraFactCard 는 ChatTab 이 이어 렌더) */
export function buildOverlay(concern: ConcernId, saju: SajuContext): LangText[] {
  const phase = DAEUN_PHASE[saju.currentDaeunOh];
  const out: LangText[] = [];
  if (phase) {
    out.push({
      ko: `당신 사주에서 지금은 **${ohHj(saju.currentDaeunOh)} 대운** — ${phase.ko}`,
      en: `Right now you're in a **${ohHj(saju.currentDaeunOh)} luck cycle** — ${phase.en}`,
    });
  }
  out.push({
    ko: '제자리 같지만, 사실 채우는 중이에요. 그리고 지금, 세상도 이렇게 흐르고 있어요 👇',
    en: "It looks like standing still, but you're filling up. And the world is moving like this too 👇",
  });
  return out;
}

/** 5단계 매듭짓기 — 재해석 한 줄 + 행동 하나. (위로 멘트 없이) prior 있으면 연결 우선 */
export function buildKnot(concern: ConcernId, saju: SajuContext, prior: ConcernId[]): LangText[] {
  const out: LangText[] = [];

  // 누적·연결: 앞서 다른 고민을 꺼냈다면, 같은 뿌리로 엮는다
  if (prior.length) {
    const last = CONCERN_MAP[prior[prior.length - 1]];
    const root = saju.lacking[0] ? ohHj(saju.lacking[0]) : ohHj(saju.ilganOh);
    out.push({
      ko: `아까 ${last.label.ko} 얘기했잖아요 — 사실 이것도 같은 뿌리예요. 둘 다 당신한테 부족한 ${root}에서 와요. 하나를 정리하면 둘 다 풀려요.`,
      en: `Earlier you mentioned ${last.label.en} — this shares the same root. Both come from the ${root} you lack. Resolve one and both ease.`,
    });
  }

  const reframe = REFRAME[concern];
  out.push(reframe.line);

  // 다음 대운이 '금(정리)' 이면 방향의 힘이 곧 들어온다는 한 줄 덧붙임
  if (saju.nextDaeunOh === '금' && saju.nextDaeunAge) {
    out.push({
      ko: `사주로는 곧(${saju.nextDaeunAge}세 ${ohHj('금')} 대운) 방향을 정하는 힘이 들어와요.`,
      en: `Soon (age ${saju.nextDaeunAge}, a 金 cycle) the power to set a direction arrives.`,
    });
  }

  out.push(reframe.action);
  return out;
}

const REFRAME: Record<ConcernId, { line: LangText; action: LangText }> = {
  career: {
    line: { ko: '정리하면 — 당신의 지난 시간은 **“못 끝낸 시간”이 아니라 “아직 안 깎인 시간”**이에요.', en: 'In short — your past time wasn’t “unfinished,” it was “not yet pruned.”' },
    action: { ko: '지금 할 건 하나예요. 벌인 것 중 딱 하나만 골라 끝까지.', en: 'One thing to do now: pick just one of them and finish it.' },
  },
  money: {
    line: { ko: '정리하면 — 지금은 **“못 모으는 때”가 아니라 “그릇을 키우는 때”**예요.', en: 'In short — this isn’t “failing to save,” it’s “widening the vessel.”' },
    action: { ko: '큰 계획보다, 새는 구멍 하나만 이번 달에 막아보세요.', en: 'Skip the grand plan — plug just one leak this month.' },
  },
  relationship: {
    line: { ko: '정리하면 — 혼자인 게 아니라 **“아직 안 맞물린 때”**예요.', en: 'In short — you’re not alone, you’re just “not yet in sync.”' },
    action: { ko: '넓히려 말고, 이미 곁의 한 사람에게 마음 한 뼘만 더 내보세요.', en: 'Don’t widen the net — open up one notch more to someone already near.' },
  },
  overwhelmed: {
    line: { ko: '정리하면 — 게으른 게 아니라 **“채우는 시기”**를 지나는 중이에요.', en: 'In short — you’re not lazy, you’re passing through a “refilling” season.' },
    action: { ko: '더 하려 말고, 이번 주엔 비우는 일 하나만 정해보세요.', en: 'Don’t add more — pick one thing to drop this week.' },
  },
};
