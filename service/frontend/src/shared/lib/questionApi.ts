import { API_URL } from "@/shared/config/api";
import type { DailyQuestionItem } from "@/features/question";

export async function fetchDailyQuestions(date: string): Promise<DailyQuestionItem[]> {
  try {
    const res = await fetch(`${API_URL}/api/questions?date=${date}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.questions ?? [];
  } catch {
    return [];
  }
}

export async function saveQuestionAnswer(payload: {
  user_id: string;
  question_id: string;
  option_id: string;
  mbti: string;
}): Promise<void> {
  try {
    await fetch(`${API_URL}/api/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // fire-and-forget
  }
}
