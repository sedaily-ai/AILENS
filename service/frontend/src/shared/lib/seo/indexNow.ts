import { SITE_URL } from '@/shared/constants/site';

// IndexNow(2026-10-04, SEO·GEO 쿡북 R04 "기사 단위 즉시 핑") — 글이 발행·수정되면 Bing·Yandex·네이버(IndexNow 참여) 등에 바뀐 주소를 바로 알린다.
// 사이트맵만으로는 크롤러가 다시 오기 전까지 새 글을 모른다. Bing 색인은 ChatGPT Search·Copilot 인용에도 간접 영향을 준다.
// 키 파일(public/{KEY}.txt, 내용=키)이 사이트에 있어야 검증된다 — 키는 비밀이 아니다(공개 파일로 소유를 증명하는 방식).
export const INDEXNOW_KEY = '6e5571d2762101a275feb8013d1f9f20';

/** 바뀐 주소들을 IndexNow에 알린다. 실패해도 조용히 넘어간다(발행 흐름을 막지 않는다). 운영 빌드에서만 보낸다. */
export async function pingIndexNow(paths: string[]): Promise<void> {
  if (process.env.NODE_ENV !== 'production' || paths.length === 0) return;
  const host = new URL(SITE_URL).host;
  try {
    await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: [...new Set(paths)].slice(0, 100).map((p) => (p.startsWith('http') ? p : `${SITE_URL}${p}`)),
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // 알림 실패는 무시 — 다음 발행 때 다시 보낸다.
  }
}
