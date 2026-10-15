// 온보딩 선택 집계 API(lens-cms-api /api/v2/onboarding/*). 기기당 최신 선택 1건만 세고, 표본이 적으면 counts가 null이다.
import { CMS_API_URL } from '@/shared/config/apiClient';

export interface OnboardingDistribution {
  total: number;
  ready: boolean;
  min_sample: number;
  /** 상황(moment) → 눈이 먼저 가는 곳(glance) → 인원. ready가 false면 null. */
  counts: Record<string, Record<string, number>> | null;
}

/** 이 기기의 선택을 저장하고 저장 후 분포를 받는다. 실패하면 null — 화면은 분포 카드를 숨긴다. */
export async function recordOnboardingChoice(voterId: string, moment: string, glance: string): Promise<OnboardingDistribution | null> {
  try {
    const res = await fetch(`${CMS_API_URL}/api/v2/onboarding/choice`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Voter-Id': voterId },
      body: JSON.stringify({ moment, glance }),
    });
    return res.ok ? ((await res.json()) as OnboardingDistribution) : null;
  } catch {
    return null;
  }
}

/** 저장 없이 분포만 받는다(기기 식별자를 못 만드는 환경). 실패하면 null. */
export async function fetchOnboardingDistribution(): Promise<OnboardingDistribution | null> {
  try {
    const res = await fetch(`${CMS_API_URL}/api/v2/onboarding/distribution`);
    return res.ok ? ((await res.json()) as OnboardingDistribution) : null;
  } catch {
    return null;
  }
}
