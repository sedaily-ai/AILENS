export const NOTIFICATION_STORAGE_KEY = 'lens-dashboard-notification-draft-v1';
export const NOTIFICATION_TIMEZONES = ['Asia/Seoul', 'America/New_York', 'Europe/London', 'UTC'] as const;

export type NotificationPreferences = {
  version: 1;
  briefing: boolean;
  followups: boolean;
  weekly: boolean;
  frequency: 'daily' | 'threeDays';
  time: string;
  timezone: typeof NOTIFICATION_TIMEZONES[number];
  weeklyDay: number;
  paused: boolean;
  categorySource: boolean;
  keywordSource: boolean;
  sentenceSource: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  version: 1, briefing: false, followups: false, weekly: false,
  frequency: 'daily', time: '08:00', timezone: 'Asia/Seoul', weeklyDay: 1, paused: false,
  categorySource: true, keywordSource: true, sentenceSource: false,
};

export function notificationPreferenceError(value: NotificationPreferences): string | null {
  if (!/^(?:0[8-9]|1\d|20):[0-5]\d$/.test(value.time)) return '알림 시간은 방해 금지 시간을 피해 08:00~20:59 사이로 골라주세요.';
  return null;
}

// 로컬 초안은 동의·구독·실제 발송 상태가 아니다. 손상되거나 다른 버전인 저장값은 복원하지 않는다.
export function parseNotificationPreferences(raw: string | null): NotificationPreferences | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const item = value as Record<string, unknown>;
    if (item.version !== 1 || ['briefing', 'followups', 'weekly', 'paused'].some((key) => typeof item[key] !== 'boolean') ||
      !['daily', 'threeDays'].includes(String(item.frequency)) || typeof item.time !== 'string' ||
      !NOTIFICATION_TIMEZONES.some((zone) => zone === item.timezone) || typeof item.weeklyDay !== 'number' ||
      !Number.isInteger(item.weeklyDay) || item.weeklyDay < 0 || item.weeklyDay > 6) return null;
    if (['categorySource', 'keywordSource', 'sentenceSource'].some((key) => item[key] !== undefined && typeof item[key] !== 'boolean')) return null;
    const preferences: NotificationPreferences = {
      version: 1, briefing: item.briefing as boolean, followups: item.followups as boolean,
      weekly: item.weekly as boolean, paused: item.paused as boolean,
      frequency: item.frequency as NotificationPreferences['frequency'], time: item.time,
      timezone: item.timezone as NotificationPreferences['timezone'], weeklyDay: item.weeklyDay,
      categorySource: item.categorySource as boolean | undefined ?? true,
      keywordSource: item.keywordSource as boolean | undefined ?? true,
      sentenceSource: item.sentenceSource as boolean | undefined ?? false,
    };
    return notificationPreferenceError(preferences) ? null : preferences;
  } catch { return null; }
}

/** PostgreSQL JSONB의 필드 순서가 달라도 같은 설정으로 판단한다. */
export function notificationPreferencesEqual(a: NotificationPreferences | null | undefined, b: NotificationPreferences | null | undefined): boolean {
  return !!a && !!b && (Object.keys(DEFAULT_NOTIFICATION_PREFERENCES) as (keyof NotificationPreferences)[]).every(key => a[key] === b[key]);
}
