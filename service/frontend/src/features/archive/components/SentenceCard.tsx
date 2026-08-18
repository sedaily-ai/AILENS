import type { ArchivedSentence } from '@/shared/types/mbti';

// ── 서랍 문장 카드 — 문장 + 출처 + 복사/삭제 액션.
// ArchiveTab.tsx(893줄)가 너무 길어서 다른 독립 서브컴포넌트들과 함께
// 분리했다(2026-08-18). 원문 기사 탐색(articles.find)은 그대로 부모에
// 남기고 onNavigate 콜백만 받는다 — 이 카드는 articles 배열 전체를
// 몰라도 된다.
export function SentenceCard({
  sentence,
  index,
  isCopied,
  onCopy,
  onDelete,
  onNavigate,
}: {
  sentence: ArchivedSentence;
  index: number;
  isCopied: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onNavigate: () => void;
}) {
  const timeStr = new Date(sentence.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className="group rounded-2xl bg-gray-50 hover:bg-white hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all duration-300"
      style={{ animation: `fadeIn 0.4s ease-out ${index * 0.05}s both` }}
    >
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div className="p-5">
        {/* 문장 */}
        <div className="flex gap-3">
          <div className="w-0.5 bg-amber-300 rounded-full flex-shrink-0 mt-1" style={{ minHeight: '20px' }} />
          <p className="text-[16px] text-gray-800 leading-[1.9] flex-1">{sentence.text}</p>
        </div>

        {/* 출처 + 액션 */}
        <div className="flex items-center justify-between mt-4 pl-3.5">
          <button
            onClick={onNavigate}
            className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-blue-500 transition-colors max-w-[60%] truncate"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span className="truncate">{sentence.articleTitle}</span>
          </button>

          <div className="flex items-center gap-1">
            <span className="text-[11px] text-gray-300 mr-1">{timeStr}</span>
            <button
              onClick={onCopy}
              className={`p-1.5 rounded-lg transition-all duration-200 ${isCopied ? 'bg-blue-50 text-blue-500' : 'opacity-0 group-hover:opacity-100 hover:bg-gray-100 text-gray-400'}`}
              title="복사"
            >
              {isCopied ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-rose-50 text-gray-400 hover:text-rose-400 transition-all duration-200"
              title="삭제"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
