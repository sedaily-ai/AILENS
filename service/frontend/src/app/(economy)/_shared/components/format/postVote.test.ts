import { describe, expect, it } from 'vitest';
import { parseVoteChoices } from './PostVote';

describe('parseVoteChoices', () => {
  it('원형 번호로 이어진 한 문단을 보기로 쪼개고 번호 기호를 뗀다', () => {
    expect(parseVoteChoices(['① 도입 속도를 더 높이기 ② 집중위험 관리 먼저 ③ 중소형사 역량 지원'])).toEqual(['도입 속도를 더 높이기', '집중위험 관리 먼저', '중소형사 역량 지원']);
  });
  it('마지막 보기에 붙은 출처 줄("-- 자료: …")을 떼어 낸다', () => {
    const out = parseVoteChoices(['① 가 ② 나 ③ 잘 모르겠어요 -- 자료: 서울경제신문(2026년 10월 10일), 보고서 기반 기사']);
    expect(out).toEqual(['가', '나', '잘 모르겠어요']);
  });
  it('줄바꿈으로 나뉜 보기도 읽는다', () => {
    expect(parseVoteChoices(['① 가\n② 나'])).toEqual(['가', '나']);
  });
});
