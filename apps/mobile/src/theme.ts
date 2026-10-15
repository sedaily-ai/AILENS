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

/** 웹 BRAND_ACCENTS / LENS_PERSPECTIVES 와 같은 형식별 색(읽기·웹툰·듣기·영상). */
export const formatColors = {
  letter: { accent: '#7c3aed', tint: '#f0edf7' },
  webtoon: { accent: '#e11d48', tint: '#fdeeee' },
  podcast: { accent: '#059669', tint: '#e6f4ef' },
  video: { accent: '#d97706', tint: '#f7f0e3' },
} as const;

/** 웹 READING_ACCENT — 읽기 지면(레터 본문·요약 카드·소제목 번호)의 포인트색. */
export const READING_ACCENT = '#5b8def';
