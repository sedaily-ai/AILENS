// 링크 공유 한 번의 결과를 정한다. 기사 '공유'(ArticleShareButton·ArticleToolRail)와 레터 상세 '공유'
// (features/letter/components/detail/ReadingTools.tsx)가 useArticleShare를 거쳐 같이 쓴다:
// 터치 기기는 기기 공유 창, 그 밖에는 링크 복사. 공유 창을 닫은 경우(취소)와 복사 실패는 성공으로 표시하지 않는다.

export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'failed';

export interface ShareEnv {
  /** navigator.share. 없으면 기기 공유를 시도하지 않는다. */
  share?: (data: { title: string; url: string }) => Promise<void>;
  /** navigator.clipboard.writeText. 없으면 복사 실패다. */
  copy?: (text: string) => Promise<void>;
  /** 터치 기기(pointer: coarse)인지. 컴퓨터는 공유 창보다 링크 복사가 예측하기 쉬워 복사한다. */
  touch: boolean;
}

const isAbort = (error: unknown) => typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';

export async function shareLink(data: { title: string; url: string }, env: ShareEnv): Promise<ShareOutcome> {
  if (env.touch && env.share) {
    try {
      await env.share(data);
      return 'shared';
    } catch (error) {
      // 사용자가 공유 창을 닫았다. 아무것도 하지 않는다(복사도, 성공 안내도 하지 않는다).
      if (isAbort(error)) return 'cancelled';
      // 그 밖의 실패(권한·지원 문제)는 링크 복사로 넘어간다.
    }
  }
  if (!env.copy) return 'failed';
  try {
    await env.copy(data.url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** 결과 안내 문구. 취소는 안내하지 않는다. */
export const SHARE_MESSAGE: Record<ShareOutcome, string> = {
  shared: '공유했어요',
  cancelled: '',
  copied: '링크를 복사했어요',
  failed: '링크를 복사하지 못했어요. 주소창의 링크를 직접 복사해 주세요.',
};

export function browserShareEnv(): ShareEnv {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return {
    share: typeof nav?.share === 'function' ? (data) => nav.share(data) : undefined,
    copy: typeof nav?.clipboard?.writeText === 'function' ? (text) => nav.clipboard.writeText(text) : undefined,
    touch: typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
  };
}
