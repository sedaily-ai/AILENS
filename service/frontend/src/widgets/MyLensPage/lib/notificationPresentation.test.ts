import { describe, expect, it } from 'vitest';
import { notificationStatus, pushEnabled, visiblePushDevices } from './notificationPresentation';
import type { NotificationState } from './notificationsApi';

const state: Pick<NotificationState,'config'|'delivery'> = {
  config: { mode:'dry_run', supported:true, policy_version:'v1', vapid_public_key:null },
  delivery: { mode:'dry_run', status:'ready', active_subscriptions:1, blocked_reasons:[], last_sent_at:null, last_simulated_at:null },
};

describe('출시 알림 표시', () => {
  it('dry_run과 live 구성 미완료 상태를 실제 발송 준비로 표시하지 않는다', () => {
    expect(pushEnabled(state)).toBe(false);
    expect(notificationStatus(state)).toBe('알림 발송은 아직 활성화되지 않았어요.');
    const blocked={...state,config:{...state.config,mode:'live' as const,supported:false}};
    expect(pushEnabled(blocked)).toBe(false);
    expect(notificationStatus(blocked)).toBe(notificationStatus(state));
  });
  it('조회 실패·일시 중지·실제 발송 가능 상태를 구분한다', () => {
    const live={...state,config:{...state.config,mode:'live' as const}};
    expect(notificationStatus()).toContain('확인');
    expect(notificationStatus(live)).toContain('준비가 됐어요');
    expect(notificationStatus({...live,delivery:{...live.delivery,status:'paused'}})).toContain('일시 중지');
  });
  it('실제 활성 구독만 공개하고 모의 구독은 개발 환경에서만 표시한다', () => {
    const devices={subscriptions:[{id:'synthetic',active:true,simulated:true},{id:'native',active:true,simulated:false},{id:'expired',active:false,simulated:false}]};
    expect(visiblePushDevices(devices).map(s=>s.id)).toEqual(['native']);
    expect(visiblePushDevices(devices,true).map(s=>s.id)).toEqual(['synthetic','native']);
  });
});
