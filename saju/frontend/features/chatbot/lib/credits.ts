/**
 * 자유 입력(LLM 질문) 무료 크레딧 — 로컬 전용 UX 가드.
 *
 * 로그인이 없으므로 보안 장치가 아니라 '정직한 사용자' 절제를 위한 넛지다.
 * (실제 비용 폭주는 백엔드 Lambda 의 글로벌 일일 킬스위치가 막는다.)
 * localStorage 에 {date, used} 를 저장하고 KST 자정 기준으로 매일 리셋한다.
 */
const KEY = 'saju_chat_credit';

/** 하루 무료 자유 질문 횟수 */
export const DAILY_FREE = 10;

function todayKST(): string {
  // 로컬 타임존과 무관하게 UTC+9 로 보정한 날짜
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 10);
}

function read(): { date: string; used: number } {
  const fresh = { date: todayKST(), used: 0 };
  if (typeof window === 'undefined') return fresh;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as { date?: unknown; used?: unknown };
      if (v && v.date === fresh.date && typeof v.used === 'number') {
        return { date: fresh.date, used: v.used };
      }
    }
  } catch {
    /* 파싱 실패 시 초기화 */
  }
  return fresh;
}

/** 오늘 남은 무료 질문 수 */
export function creditsLeft(): number {
  return Math.max(0, DAILY_FREE - read().used);
}

/** 1회 차감 후 남은 수 반환 */
export function spendCredit(): number {
  const cur = read();
  const next = { date: cur.date, used: cur.used + 1 };
  try {
    if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 저장 실패는 무시 */
  }
  return Math.max(0, DAILY_FREE - next.used);
}
