import React from 'react';
import { useVideoConfig } from 'remotion';
import { useScale } from '../lib/layout';

// 세로/가로 포맷 모두에서 텍스트가 화면 가장자리에 잘리지 않도록 스케일 기준 여백을 둔 전체화면 flex 컨테이너.
// 세로(1080x1920)는 위 150px, 아래 250px을 쇼츠 버튼 자리로 비워 둔다(2026-10-03, 프롬프트 §7).
export const SafeArea: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => {
  const scale = useScale();
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const paddingX = 72 * scale;
  const paddingTop = (vertical ? 150 : 64) * scale;
  const paddingBottom = (vertical ? 250 : 64) * scale;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: `${paddingTop}px ${paddingX}px ${paddingBottom}px`,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      {children}
    </div>
  );
};
