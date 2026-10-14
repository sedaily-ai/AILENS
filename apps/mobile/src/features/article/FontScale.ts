import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 본문 글자 크기(웹 ArticleFontSizeControl 대응): 작게/보통/크게/아주 크게. 이 기기에만 저장한다.
export const FONT_SCALES = [0.9, 1, 1.15, 1.3] as const;
const KEY = 'ailens:article-font-scale';

export function useFontScale() {
  const [idx, setIdx] = useState(1);
  useEffect(() => {
    void AsyncStorage.getItem(KEY)
      .then((v) => {
        const n = v == null ? NaN : Number(v);
        if (Number.isInteger(n) && n >= 0 && n < FONT_SCALES.length) setIdx(n);
      })
      .catch(() => {});
  }, []);
  const cycle = useCallback(() => {
    setIdx((i) => {
      const next = (i + 1) % FONT_SCALES.length;
      void AsyncStorage.setItem(KEY, String(next)).catch(() => {});
      return next;
    });
  }, []);
  return { scale: FONT_SCALES[idx], idx, cycle };
}
