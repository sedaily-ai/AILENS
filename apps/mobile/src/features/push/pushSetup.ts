import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

// 알림 수신 처리 — 앱이 켜져 있을 때도 배너를 보여 주고(소리 없음), 알림을 누르면 data.slug 의 기사로 이동한다.
// (알림 payload 계약: { slug: <글 id>, format?: 0~3 } — 서버 발송 설계 services/push 와 맞춘다. 권한·토큰 관련은 settings/notifications 화면.)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function usePushNavigation() {
  const router = useRouter();
  useEffect(() => {
    const open = (data: Record<string, unknown> | undefined) => {
      const slug = typeof data?.slug === 'string' ? data.slug : null;
      if (!slug) return;
      const format = typeof data?.format === 'number' ? String(data.format) : undefined;
      router.push({ pathname: '/article/[slug]', params: format ? { slug, format } : { slug } });
    };
    // 앱이 꺼져 있다가 알림으로 시작된 경우
    void Notifications.getLastNotificationResponseAsync().then((r) => r && open(r.notification.request.content.data));
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
    return () => sub.remove();
  }, [router]);
}
