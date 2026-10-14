import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 온보딩 선택값(이 기기에만 저장). 웹 onboardingStorage 와 같은 의미: format = 선호 형식 인덱스(레터 0·웹툰 1·팟캐스트 2·영상 3), completed = 온보딩을 마쳤거나 건너뜀.
const FORMAT_KEY = 'onboarding-format';
const COMPLETED_KEY = 'onboarding-completed';

export async function saveFormat(index: number): Promise<void> {
  try {
    await AsyncStorage.setItem(FORMAT_KEY, String(index));
  } catch {
    // 저장이 막혀도 온보딩 진행은 막지 않는다.
  }
}

export async function markOnboardingCompleted(): Promise<void> {
  try {
    await AsyncStorage.setItem(COMPLETED_KEY, '1');
  } catch {
    // 위와 같다.
  }
}

export async function getPreferredFormat(): Promise<number | null> {
  try {
    const n = Number(await AsyncStorage.getItem(FORMAT_KEY));
    return Number.isInteger(n) && n >= 0 && n <= 3 ? n : null;
  } catch {
    return null;
  }
}

/** 온보딩 완료 여부. 읽기 전(null)과 구분해 홈 카드가 깜빡이지 않게 한다. */
export function useOnboardingCompleted(): boolean | null {
  const [done, setDone] = useState<boolean | null>(null);
  useEffect(() => {
    void AsyncStorage.getItem(COMPLETED_KEY)
      .then((v) => setDone(v === '1'))
      .catch(() => setDone(true));
  }, []);
  return done;
}
