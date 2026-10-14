import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFERENCES as defaults, notificationPreferenceError, parseNotificationPreferences } from './notificationPreferences';

describe('개인화 알림의 브라우저 초안 경계', () => {
  it('기존 초안은 보존하고 저장 문장 기반 발송을 자동 선택하지 않는다', () => {
    const old: Record<string, unknown> = { ...defaults };
    delete old.categorySource; delete old.keywordSource; delete old.sentenceSource;
    expect(parseNotificationPreferences(JSON.stringify(old))).toEqual(defaults);
    expect(notificationPreferenceError({ ...defaults, briefing: true, categorySource: false, keywordSource: false, sentenceSource: false })).toContain('관심 기록');
  });
  it('새 방문에는 모든 유형이 꺼져 있고 수신 동의 필드를 만들지 않는다', () => {
    expect([defaults.briefing, defaults.followups, defaults.weekly, defaults.paused]).toEqual([false, false, false, false]);
    expect(parseNotificationPreferences(null)).toBeNull();
    expect(Object.keys(defaults)).not.toContain('consented');
  });
  it('방해 금지 구간과 잘못된 시각을 거부하고 발송 가능 구간의 경계를 허용한다', () => {
    for (const time of ['00:00', '07:59', '21:00', '23:59', '', '08:60', '8:00', '20:59:30']) {
      expect(notificationPreferenceError({ ...defaults, time })).not.toBeNull();
      expect(parseNotificationPreferences(JSON.stringify({ ...defaults, time }))).toBeNull();
    }
    for (const time of ['08:00', '12:30', '20:59']) expect(notificationPreferenceError({ ...defaults, time })).toBeNull();
  });
  it('중지해도 선택 유형과 요일·시간대를 복원하고 알 수 없는 동의 필드는 버린다', () => {
    const draft = { ...defaults, briefing: true, weekly: true, paused: true, frequency: 'threeDays', time: '18:30', timezone: 'America/New_York', weeklyDay: 5 };
    expect(parseNotificationPreferences(JSON.stringify({ ...draft, consented: true, pushToken: 'not-an-actual-token' }))).toEqual(draft);
  });
  it('손상된 저장·지원하지 않는 버전과 타입을 복원하지 않는다', () => {
    for (const raw of ['{', 'null', '[]', '42', '{}']) expect(parseNotificationPreferences(raw)).toBeNull();
    for (const patch of [{ version: 2 }, { briefing: 'true' }, { weeklyDay: 7 }, { weeklyDay: -1 }, { weeklyDay: 1.5 }, { weeklyDay: '1' }, { timezone: 'Invalid/Zone' }, { frequency: 'hourly' }]) {
      expect(parseNotificationPreferences(JSON.stringify({ ...defaults, ...patch }))).toBeNull();
    }
  });
});
