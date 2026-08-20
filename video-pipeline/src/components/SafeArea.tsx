import React from 'react';
import { useScale } from '../lib/layout';

// 세로/가로 포맷 모두에서 텍스트가 화면 가장자리에 잘리지 않도록
// 스케일 기준 여백을 둔 전체화면 flex 컨테이너.
export const SafeArea: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => {
  const scale = useScale();
  const paddingX = 72 * scale;
  const paddingY = 64 * scale;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: `${paddingY}px ${paddingX}px`,
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
