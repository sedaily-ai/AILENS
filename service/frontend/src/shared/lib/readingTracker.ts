/**
 * Reading Tracker - 기사 읽기 추적 유틸리티
 * localStorage 기반으로 사용자의 읽기 기록을 관리
 */

const STORAGE_KEY = 'mbti-reading-tracker';

export interface DailyReading {
  date: string; // YYYY-MM-DD
  count: number;
  articleIds: string[];
}

export interface ReadingStats {
  totalArticles: number;
  currentStreak: number;
  longestStreak: number;
  thisWeekArticles: number;
  thisMonthArticles: number;
  dailyReadings: DailyReading[];
  lastReadDate: string | null;
}

function getStorageData(): ReadingStats {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to parse reading tracker data:', e);
  }
  return {
    totalArticles: 0,
    currentStreak: 0,
    longestStreak: 0,
    thisWeekArticles: 0,
    thisMonthArticles: 0,
    dailyReadings: [],
    lastReadDate: null,
  };
}

function saveStorageData(data: ReadingStats): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save reading tracker data:', e);
  }
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

function calculateStreak(dailyReadings: DailyReading[], today: string): number {
  if (dailyReadings.length === 0) return 0;

  // Sort by date descending
  const sorted = [...dailyReadings].sort((a, b) => b.date.localeCompare(a.date));

  // Check if today or yesterday has reading
  const hasToday = sorted.some(r => r.date === today);
  const yesterday = getYesterdayDate();
  const hasYesterday = sorted.some(r => r.date === yesterday);

  if (!hasToday && !hasYesterday) return 0;

  let streak = 0;
  let currentDate = hasToday ? today : yesterday;

  for (const reading of sorted) {
    if (reading.date === currentDate && reading.count > 0) {
      streak++;
      // Move to previous day
      const date = new Date(currentDate);
      date.setDate(date.getDate() - 1);
      currentDate = date.toISOString().split('T')[0];
    } else if (reading.date < currentDate) {
      // Gap in dates, streak broken
      break;
    }
  }

  return streak;
}

function getWeekStart(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

function getMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * 기사 읽음 처리
 */
export function trackArticleRead(articleId: string): void {
  const data = getStorageData();
  const today = getTodayDate();

  // Find or create today's reading
  let todayReading = data.dailyReadings.find(r => r.date === today);

  if (!todayReading) {
    todayReading = { date: today, count: 0, articleIds: [] };
    data.dailyReadings.push(todayReading);
  }

  // Check if already read this article today
  if (!todayReading.articleIds.includes(articleId)) {
    todayReading.articleIds.push(articleId);
    todayReading.count++;
    data.totalArticles++;
  }

  data.lastReadDate = today;

  // Recalculate streak
  data.currentStreak = calculateStreak(data.dailyReadings, today);
  if (data.currentStreak > data.longestStreak) {
    data.longestStreak = data.currentStreak;
  }

  // Calculate this week articles
  const weekStart = getWeekStart();
  data.thisWeekArticles = data.dailyReadings
    .filter(r => r.date >= weekStart)
    .reduce((sum, r) => sum + r.count, 0);

  // Calculate this month articles
  const monthStart = getMonthStart();
  data.thisMonthArticles = data.dailyReadings
    .filter(r => r.date >= monthStart)
    .reduce((sum, r) => sum + r.count, 0);

  // Keep only last 90 days of data
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  const cutoff = cutoffDate.toISOString().split('T')[0];
  data.dailyReadings = data.dailyReadings.filter(r => r.date >= cutoff);

  saveStorageData(data);
}

/**
 * 읽기 통계 가져오기
 */
export function getReadingStats(): ReadingStats {
  const data = getStorageData();
  const today = getTodayDate();

  // Recalculate current values
  data.currentStreak = calculateStreak(data.dailyReadings, today);

  const weekStart = getWeekStart();
  data.thisWeekArticles = data.dailyReadings
    .filter(r => r.date >= weekStart)
    .reduce((sum, r) => sum + r.count, 0);

  const monthStart = getMonthStart();
  data.thisMonthArticles = data.dailyReadings
    .filter(r => r.date >= monthStart)
    .reduce((sum, r) => sum + r.count, 0);

  return data;
}

