export type MbtiGroupId = 'NT' | 'NF' | 'ST' | 'SF'

export type MbtiType =
  | 'INTJ' | 'INTP' | 'ENTJ' | 'ENTP'
  | 'INFJ' | 'INFP' | 'ENFJ' | 'ENFP'
  | 'ISTJ' | 'ISTP' | 'ESTJ' | 'ESTP'
  | 'ISFJ' | 'ISFP' | 'ESFJ' | 'ESFP'

export interface MbtiGroup {
  id: MbtiGroupId
  name: string
  label: string
  types: MbtiType[]
  color: string
  bgClass: string
  bgLightClass: string
  textClass: string
  borderClass: string
  style: string
  icon: string
  description: string
  axis: string
}

export const mbtiGroups: Record<MbtiGroupId, MbtiGroup> = {
  NT: {
    id: 'NT',
    name: '전략형',
    label: 'NT 전략형',
    types: ['INTJ', 'INTP', 'ENTJ', 'ENTP'],
    color: '#3B82F6',
    bgClass: 'bg-blue-500',
    bgLightClass: 'bg-blue-50',
    textClass: 'text-blue-600',
    borderClass: 'border-blue-300',
    style: '애널리스트 리포트',
    icon: '📊',
    description: '데이터와 논리로 핵심을 꿰뚫는 분석형 뉴스',
    axis: '추상 + 분석',
  },
  NF: {
    id: 'NF',
    name: '가치형',
    label: 'NF 가치형',
    types: ['INFJ', 'INFP', 'ENFJ', 'ENFP'],
    color: '#8B5CF6',
    bgClass: 'bg-violet-500',
    bgLightClass: 'bg-violet-50',
    textClass: 'text-violet-600',
    borderClass: 'border-violet-300',
    style: '칼럼 / 에세이',
    icon: '💡',
    description: '의미와 가치를 찾아 깊이 읽는 인문형 뉴스',
    axis: '추상 + 감성',
  },
  ST: {
    id: 'ST',
    name: '실용형',
    label: 'ST 실용형',
    types: ['ISTJ', 'ISTP', 'ESTJ', 'ESTP'],
    color: '#22C55E',
    bgClass: 'bg-green-500',
    bgLightClass: 'bg-green-50',
    textClass: 'text-green-600',
    borderClass: 'border-green-300',
    style: '팩트시트',
    icon: '✅',
    description: '숫자와 팩트로 빠르게 파악하는 실용형 뉴스',
    axis: '구체 + 분석',
  },
  SF: {
    id: 'SF',
    name: '공감형',
    label: 'SF 공감형',
    types: ['ISFJ', 'ISFP', 'ESFJ', 'ESFP'],
    color: '#F97316',
    bgClass: 'bg-orange-500',
    bgLightClass: 'bg-orange-50',
    textClass: 'text-orange-600',
    borderClass: 'border-orange-300',
    style: '친구 톡',
    icon: '💬',
    description: '친근한 대화체로 쉽게 이해하는 공감형 뉴스',
    axis: '구체 + 감성',
  },
}

export const mbtiGroupList: MbtiGroup[] = Object.values(mbtiGroups)

export const mbtiTypeToGroup: Record<MbtiType, MbtiGroupId> = {
  INTJ: 'NT', INTP: 'NT', ENTJ: 'NT', ENTP: 'NT',
  INFJ: 'NF', INFP: 'NF', ENFJ: 'NF', ENFP: 'NF',
  ISTJ: 'ST', ISTP: 'ST', ESTJ: 'ST', ESTP: 'ST',
  ISFJ: 'SF', ISFP: 'SF', ESFJ: 'SF', ESFP: 'SF',
}

/**
 * Default 4-char MBTI for each group, used when the user picks an editor in
 * OnboardingPage but doesn't tell us their precise MBTI. The selection of
 * defaults mirrors the 4 editor personas defined in OnboardingPage.tsx
 * (민철=INTJ, 하은=INFP, 준서=ISTJ, 소율=ESFP) so picking an editor is
 * functionally equivalent to adopting that editor's MBTI.
 *
 * Phase 3 personalization (Round 5-C/D) lazy-creates the user_profiles row
 * when a 4-char MBTI accompanies the request. Without this default mapping,
 * group-only requests would never trigger the lazy-create and consolidate
 * would always report skipped_no_profile.
 *
 * Users who know their precise MBTI (and want to override INTJ → INTP, etc)
 * can adjust via a future settings page (separate round). Until then, all
 * NT users share the INTJ seed embedding — which is identical to the NT
 * group seed at the backend (Round 5-A canonical sentence is per-group),
 * so the loss of precision is cosmetic.
 */
export const groupToDefaultMbti: Record<MbtiGroupId, MbtiType> = {
  NT: 'INTJ',
  NF: 'INFP',
  ST: 'ISTJ',
  SF: 'ESFP',
}
