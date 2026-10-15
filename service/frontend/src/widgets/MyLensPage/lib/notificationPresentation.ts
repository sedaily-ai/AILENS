import type { NotificationState } from './notificationsApi';

export function pushEnabled(state?: Pick<NotificationState, 'config'> | null): boolean {
  return state?.config.mode === 'live' && state.config.supported;
}

export function notificationStatus(state?: Pick<NotificationState, 'config' | 'delivery'> | null): string {
  if (!state) return '알림 설정에서 발송 상태를 확인해 주세요.';
  if (!pushEnabled(state)) return '알림 발송은 아직 활성화되지 않았어요.';
  if (state.delivery.status === 'paused') return '알림을 일시 중지했어요.';
  if (state.delivery.status === 'ready') return '새 소식을 받을 준비가 됐어요.';
  return '수신 동의와 기기 연결을 확인해 주세요.';
}

export function visiblePushDevices(state: Pick<NotificationState, 'subscriptions'>, developerTools = false) {
  return state.subscriptions.filter(sub => sub.active && (!sub.simulated || developerTools));
}
