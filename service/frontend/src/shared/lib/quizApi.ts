// CMS에서 직접 출제한 "단어 퀴즈" — 전용 Lambda(sedaily-mbti-v2-quiz-dev)
// GET /api/quiz/today · POST /api/quiz/attempt. 비어있으면 호출부가 기존
// 레터 키워드 기반 자동생성 로직으로 폴백한다(WordsPreviewSection.tsx).
//
// 2026-08-09 — 발행일이 오늘과 정확히 일치하는 것 하나만 내려주던 걸,
// "여러 개를 동시에 노출하고 싶다, 발행/내리기가 곧 노출 체크박스"
// 요청으로 바꿨다 — 발행된 것 전부(최대 4개)를 배열로 받는다.
import { API_URL } from '@/shared/config/apiClient';

export interface TodayQuiz {
  id: string;
  term: string;
  explain: string;
  /** 오답 3개 — 관리자가 직접 입력(admin/frontend /quiz/edit). */
  options: string[];
}

export async function fetchActiveQuizzes(): Promise<TodayQuiz[]> {
  try {
    const res = await fetch(`${API_URL}/api/quiz/today`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.quizzes) ? data.quizzes : [];
  } catch {
    return [];
  }
}

// 실패해도 UI에 영향 없게 fire-and-forget으로 호출한다(호출부 참조) — 응답
// 집계는 익명 카운터일 뿐이라 실패해도 재시도하지 않는다.
export async function postQuizAttempt(quizId: string, correct: boolean): Promise<void> {
  try {
    await fetch(`${API_URL}/api/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quiz_id: quizId, correct }),
    });
  } catch {
    // 무시 — GA4 trackEvent가 이미 기록됨(WordsPreviewSection.tsx)
  }
}
