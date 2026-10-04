import type { GlanceId, MomentId } from './moments';

// 결과 화면 페르소나 16종(상황 4 × 눈이 먼저 가는 곳 4) — 그 사람의 하루 한 장면과, 간접적으로 녹인 MBTI 예시(2026-10-04).
// MBTI는 사용자가 고르는 항목이 아니라 "이런 성향이라면 특히 잘 맞아요" 정도의 예시다. 근거 데이터가 아직 없는 가설이라 단정하지 않는다.
// 장면 문구는 Scene-first(상황이 먼저 그려지게)로 쓰고, 상황이 막는 포맷(걷기·점심 소리)은 "왜 대신 이 포맷인지"가 문구 안에서 이어진다.
export interface Persona {
  life: string;
  mbti: [string, string];
}

export const PERSONAS: Record<MomentId, Record<GlanceId, Persona>> = {
  lunch: {
    text: { life: '제목부터 훑고, 필요한 문단만 골라 읽는 사람.', mbti: ['ISTJ', 'INTJ'] },
    comic: { life: '조용한 자리에서 컷을 넘기며 오늘 이슈를 이야기처럼 읽는 사람.', mbti: ['INFP', 'ISFP'] },
    sound: { life: '귀가 편하지만 점심 자리에선 소리를 못 켜서, 이어폰 낄 틈을 기다리는 사람.', mbti: ['ENFJ', 'ESFP'] },
    video: { life: '자막을 켠 영상으로 숫자와 핵심을 한눈에 챙기는 사람.', mbti: ['ENTJ', 'ESTP'] },
  },
  'commute-home': {
    text: { life: '지하철에서도 긴 글을 끝까지 읽는, 흐름과 맥락을 놓치기 싫은 사람.', mbti: ['INTJ', 'INFJ'] },
    comic: { life: '한 손은 손잡이, 한 손은 폰. 지친 퇴근길엔 컷을 넘기며 이야기로 따라잡는 사람.', mbti: ['INFP', 'ENFP'] },
    sound: { life: '퇴근길 이어폰을 끼고 눈을 쉬면서, 귀로 오늘 뉴스를 챙기는 사람.', mbti: ['ENFJ', 'ISFJ'] },
    video: { life: '서서 가는 지하철에서 자막 영상으로 핵심만 빠르게 보는 사람.', mbti: ['ENTP', 'ESTP'] },
  },
  walk: {
    text: { life: '걸으면서도 글이 궁금하지만 눈은 길에 둬야 해서, 귀로 대신 챙기는 사람.', mbti: ['ISTJ', 'INTJ'] },
    comic: { life: '걸을 땐 컷을 못 봐서, 이야기는 아껴두고 귀로 먼저 맛보는 사람.', mbti: ['INFP', 'ISFP'] },
    sound: { life: '출근길 이어폰 하나로 하루를 시작하며, 걷는 동안 세상 돌아가는 소리를 듣는 사람.', mbti: ['ESFJ', 'ENFJ'] },
    video: { life: '영상이 편하지만 걷는 중엔 못 봐서, 소리만으로 핵심을 먼저 챙기는 사람.', mbti: ['ENTJ', 'ESTP'] },
  },
  bed: {
    text: { life: '조용히 한 줄씩 읽으며 오늘을 정리하는 사람.', mbti: ['INFJ', 'ISTJ'] },
    comic: { life: '누워서 컷을 넘기며 오늘 뉴스를 이야기처럼 곱씹는 사람.', mbti: ['INFP', 'ISFP'] },
    sound: { life: '불을 끄고 눈을 감은 채 목소리로 뉴스를 듣다 잠드는 사람.', mbti: ['ISFJ', 'ENFJ'] },
    video: { life: '자막과 그래픽으로 하루 이슈를 가볍게 훑는 사람.', mbti: ['ENTP', 'ISTP'] },
  },
};
