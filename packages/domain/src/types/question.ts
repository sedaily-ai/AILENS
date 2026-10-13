export interface DailyQuestionItem {
  id: string;
  question?: string;
  options?: Array<{ id: string; text: string; description?: string }>;
}
