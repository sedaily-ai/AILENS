import type { ReactNode } from 'react';

/**
 * 오디오·영상 플레이어(ArticleAudioPlayer / ArticleVideoPlayer)가 공유하는 순수 포맷 함수·상수.
 * 각자 복제하면 시간 표기 버그를 고칠 때 한쪽만 고치는 사고가 나므로 공유한다.
 * 드롭다운 UI·CSS는 두 컴포넌트의 카드 톤이 미묘하게 달라 스타일 결합도가 높아 공유하지 않고 값·로직만 공유한다.
 */

/** 두 플레이어가 공유하는 배속 값 — 배속 드롭다운(listbox)의 선택지. */
export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
export const PLAYBACK_RATE_LABELS = ['0.75', '1.0', '1.25', '1.5', '2.0'] as const;

export function clock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const whole = Math.floor(sec);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 스크린리더용 — "3:24"를 기호로 읽히게 두지 않는다. */
export function spoken(sec: number): string {
  const whole = Math.max(0, Math.floor(sec));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  if (m === 0) return `${s}초`;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

/**
 * 대본 문단에서 사람 발언(직접 인용) 구간만 볼드로 표시한다.
 *
 * CMS 원문은 대개 `"...하고 밝혔습니다"`처럼 ASCII 쌍따옴표로 직접 인용을
 * 감싼다. 그 인용부호 안쪽 텍스트만 <strong>으로 감싸고, 인용부호 자체와
 * "~라고 밝혔다" 같은 서술부는 원래 굵기로 둔다 — 인용부호가 볼드면
 * "누구의 말인지"보다 "따옴표 모양"이 강조돼 버린다.
 * 정규식이 인용부호를 못 찾으면(따옴표 없는 문단) 원문 그대로 반환한다 —
 * 강제로 굵게 만들 대상을 지어내지 않는다.
 */
export function boldenQuotes(text: string): ReactNode {
  const re = /"([^"]+)"/g;
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <strong key={key} style={{ fontWeight: 700 }}>
        &quot;{m[1]}&quot;
      </strong>,
    );
    key += 1;
    last = m.index + m[0].length;
  }
  if (parts.length === 0) return text;
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
