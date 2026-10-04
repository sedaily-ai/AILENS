import { useVideoConfig } from 'remotion';
import { BASE_UNIT } from '../styles/tokens';

// vertical(1080x1920)과 horizontal(1920x1080) 모두 짧은 변이 1080이라
// 이 스케일을 곱해두면 두 포맷에서 동일한 디자인 밀도를 유지할 수 있다.
export const useScale = (): number => {
  const { width, height } = useVideoConfig();
  return Math.min(width, height) / BASE_UNIT;
};

// 세로(쇼츠)면 왼쪽 정렬 에디토리얼 배치, 가로(웹 롱폼)면 가운데 정렬 배치(2026-10-03).
export const useIsVertical = (): boolean => {
  const { width, height } = useVideoConfig();
  return height > width;
};
