// 웹(service/frontend)의 밝은 에디토리얼 톤을 앱에 옮긴 토큰. 웹은 Tailwind gray 스케일을 쓴다.
export const colors = {
  bg: '#ffffff',
  surface: '#f8f9fa',
  text: '#111827', // gray-900
  textSub: '#374151', // gray-700
  textMuted: '#6b7280', // gray-500
  textFaint: '#9ca3af', // gray-400
  line: '#e5e7eb', // gray-200
  brand: '#101c3d',
  beta: { bg: '#e0ebff', text: '#2563eb' },
  imagePlaceholder: '#f3f4f6',
} as const;

export const radius = { thumb: 12 } as const;
