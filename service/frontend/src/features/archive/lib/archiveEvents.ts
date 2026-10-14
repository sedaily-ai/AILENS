export const ARCHIVE_CHANGED_EVENT = 'lens-archive-changed';

/** 계정 문장 저장·삭제 성공 뒤, 같은 화면의 서랍을 다시 조회한다. */
export function notifyArchiveChanged(owner: string) {
  window.dispatchEvent(new CustomEvent(ARCHIVE_CHANGED_EVENT, { detail: { owner } }));
}
