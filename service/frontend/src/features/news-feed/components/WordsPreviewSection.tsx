'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { GoodJobStampIcon } from '@/shared/ui/icons/HandDrawnIcons';
import { fetchFollowingWordTerms, type Term } from '../lib/wordsTerms';
import { fetchActiveQuizzes, postQuizAttempt, type TodayQuiz } from '@/shared/lib/quizApi';

// Math.random() 대신 seed로 결정되는 PRNG(mulberry32) — 빌드타임 서버 렌더와
// 클라이언트 최초 hydration이 같은 seed로 정확히 같은 순서를 내야 hydration
// mismatch가 안 난다(2026-08-07, 홈 SSG 감사로 initialTerms 서버 프리페치를
// 추가하며 발견). qIndex(질문 자체는 날짜로 이미 결정됨)를 seed로 쓴다.
function seededRandom(seed: number): () => number {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const rand = seededRandom(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface QuizCardData {
  answer: Term;
  choices: Term[];
  quizId: string | null;
}

interface Props {
  // 빌드타임(app/page.tsx)에 fetchCmsPosts('letters', undefined, 50)에서 뽑은
  // 키워드 목록 — 정적 HTML에 실제 퀴즈가 바로 박히게 한다(2026-08-07, 홈 SSG
  // 감사). shuffle을 seed 기반으로 쓴다(위 참조, hydration mismatch 방지).
  initialTerms?: Term[];
}

// 카드 4개를 그냥 나열하는 건 "그냥 정보"라 심심하다는 피드백(2026-08-06) —
// 빈칸 채우기 퀴즈로 바꿨다. 듀오링고 실제 패턴(단일 채도 높은 브랜드 컬러,
// 아래쪽이 두꺼운 눌리는 버튼, 클릭마다 바운스/흔들림 모션)을 참고했다.
//
// 2026-08-09 — 두 가지를 바꿨다: (1) 오답을 레터 키워드 풀에서 자동으로
// 뽑던 걸 없애고 관리자가 직접 쓰게 했다("보기는 어떻게 넣는거죠" — 무관한
// 용어가 섞여 학습 효과가 없다는 지적). (2) 발행일이 오늘과 정확히 일치하는
// 문제 하나만 내려주던 걸, 발행된 것 전부(최대 4개)를 동시에 보여주도록
// 바꿨다("여러 개 노출하고 싶다, 발행/내리기가 곧 노출 체크박스" 요청) —
// 새 필드 없이 기존 발행 상태를 그대로 "노출 여부"로 쓴다.
export function WordsPreviewSection({ initialTerms }: Props) {
  const [terms, setTerms] = useState<Term[] | null>(initialTerms ?? null);
  // undefined = 아직 응답 안 옴, [] = CMS 퀴즈 없음(정상 — 자동생성으로 대체).
  const [cmsQuizzes, setCmsQuizzes] = useState<TodayQuiz[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    // 둘 다 온 뒤에 카드를 확정한다 — CMS 응답을 기다리지 않고 자동생성
    // 카드부터 보여줬다가 뒤늦게 CMS 카드로 바뀌면, 그 사이 이미 답을 고른
    // 사용자 입장에선 문제가 손 밑에서 바뀌는 셈이라 피한다.
    Promise.all([fetchFollowingWordTerms(), fetchActiveQuizzes()]).then(([deduped, quizzes]) => {
      if (cancelled) return;
      setTerms(deduped);
      setCmsQuizzes(quizzes);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 오답 3개를 뽑을 풀이 최소 4개는 있어야 한다 — 그 아래로는 자동생성 카드를
  // 아예 안 만든다(무관한 용어를 억지로 채우지 않는다).
  const pool = terms !== null && terms.length >= 4 ? terms : null;

  const cards = useMemo((): QuizCardData[] | undefined => {
    if (cmsQuizzes === undefined) return undefined; // 아직 로딩 중
    const fromCms = cmsQuizzes
      .filter((q) => q.options.length >= 3)
      .map((q, i): QuizCardData => {
        const answer: Term = { term: q.term, explain: q.explain };
        const distractors = q.options.slice(0, 3).map((term) => ({ term, explain: '' }));
        return { answer, choices: shuffle([answer, ...distractors], i * 2 + 9), quizId: q.id };
      });
    if (fromCms.length > 0) return fromCms;
    if (!pool) return [];
    const qIndex = new Date().getDate() % pool.length;
    const answer = pool[qIndex];
    const distractors = shuffle(pool.filter((_, i) => i !== qIndex), qIndex + 1).slice(0, 3);
    return [{ answer, choices: shuffle([answer, ...distractors], qIndex + 2), quizId: null }];
  }, [cmsQuizzes, pool]);

  if (terms === null || cards === undefined || cards.length === 0) return null; // 로딩 중이거나 낼 문제가 없으면 자리 안 차지

  return (
    <section style={{ padding: 'clamp(28px, 4vw, 40px) 0 0' }}>
      <style>{`
        @keyframes wqPop {
          0% { transform: scale(0.3) rotate(-10deg); opacity: 0; }
          65% { transform: scale(1.18) rotate(4deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes wqShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-7px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(3px); }
        }
        .wq-pop { animation: wqPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        .wq-shake { animation: wqShake 0.4s ease; }
        .wq-btn { transition: transform 0.08s ease, border-bottom-width 0.08s ease, background 0.15s ease, border-color 0.15s ease; }
        .wq-btn:not(:disabled):hover { filter: brightness(0.98); }
        .wq-btn:not(:disabled):active { transform: translateY(3px); border-bottom-width: 2px !important; }
        .wq-arrow { transition: background 0.15s ease, transform 0.08s ease; }
        .wq-arrow:not(:disabled):hover { background: #fbe6ae; }
        .wq-arrow:not(:disabled):active { transform: scale(0.9); }
        .wq-dot { transition: background 0.15s ease, width 0.15s ease; }
      `}</style>

      <header style={{ marginBottom: 14 }}>
        <p
          className="text-gray-400"
          style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}
        >
          단어 퀴즈
        </p>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          {/* 섹션 제목 타이포 통일(2026-08-06) — 홈 화면 섹션 제목을 전부
              Pretendard Bold로(웹툰만 튀어 보이던 문제). */}
          <h2 className="text-gray-900" style={{ fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            오늘의 단어 퀴즈
          </h2>
          <Link
            href="/words"
            className="flex-shrink-0 text-gray-400 hover:text-gray-900 transition-colors"
            style={{ fontSize: 13, fontWeight: 500 }}
          >
            용어 해설 전체 보기 →
          </Link>
        </div>
      </header>

      <QuizCarousel cards={cards} />
    </section>
  );
}

// 여러 문제를 한 번에 다 펼치지 않고 화살표로 하나씩 넘겨 본다(2026-08-09,
// "화살표로 넘기듯이 해야죠, 한번에 펼쳐서 보여주지 말고" 요청). 답을 고른
// 상태는 문제(카드 key)별로 부모가 들고 있다 — 뒤로 넘겨서 이미 푼 문제로
// 돌아가도 정답 표시가 그대로 남아있게.
function QuizCarousel({ cards }: { cards: QuizCardData[] }) {
  const [index, setIndex] = useState(0);
  const [pickedByKey, setPickedByKey] = useState<Record<string, string>>({});
  const total = cards.length;
  const safeIndex = Math.min(index, total - 1);
  const card = cards[safeIndex];
  const key = card.quizId ?? `auto-${safeIndex}`;

  return (
    <div>
      <QuizCard card={card} picked={pickedByKey[key] ?? null} onPick={(term) => setPickedByKey((p) => ({ ...p, [key]: term }))} />

      {total > 1 && (
        <div className="flex items-center justify-center" style={{ gap: 10, marginTop: 12 }}>
          <button
            type="button"
            aria-label="이전 문제"
            disabled={safeIndex === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="wq-arrow flex items-center justify-center flex-shrink-0"
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              color: '#c2660a',
              cursor: safeIndex === 0 ? 'default' : 'pointer',
              opacity: safeIndex === 0 ? 0.3 : 1,
              pointerEvents: safeIndex === 0 ? 'none' : 'auto',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>

          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#c2660a', fontVariantNumeric: 'tabular-nums' }}>
            {safeIndex + 1}/{total}
          </span>

          <div className="flex items-center" style={{ gap: 6 }}>
            {cards.map((c, i) => (
              <button
                key={c.quizId ?? `auto-${i}`}
                type="button"
                aria-label={`${i + 1}번째 문제로 이동`}
                onClick={() => setIndex(i)}
                className="wq-dot"
                style={{
                  width: i === safeIndex ? 18 : 6,
                  height: 6,
                  borderRadius: 999,
                  border: 'none',
                  background: i === safeIndex ? '#e79c1a' : '#f0dca8',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>

          <button
            type="button"
            aria-label="다음 문제"
            disabled={safeIndex === total - 1}
            onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
            className="wq-arrow flex items-center justify-center flex-shrink-0"
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              color: '#c2660a',
              cursor: safeIndex === total - 1 ? 'default' : 'pointer',
              opacity: safeIndex === total - 1 ? 0.3 : 1,
              pointerEvents: safeIndex === total - 1 ? 'none' : 'auto',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

function QuizCard({
  card,
  picked,
  onPick,
}: {
  card: QuizCardData;
  picked: string | null;
  onPick: (term: string) => void;
}) {
  const answered = picked !== null;
  const correct = picked === card.answer.term;

  return (
    <div style={{ borderRadius: 18, background: '#fef3d7', padding: 'clamp(16px, 3vw, 22px)' }}>
      <p style={{ fontSize: 12.5, fontWeight: 800, color: '#c2660a', marginBottom: 8, letterSpacing: '-0.005em' }}>
        다음 설명에 맞는 단어는?
      </p>
      <p
        style={{
          fontSize: 15.5,
          fontWeight: 700,
          color: '#6b3d0a',
          lineHeight: 1.6,
          marginBottom: 18,
        }}
      >
        &ldquo;{card.answer.explain}&rdquo;
      </p>

      <div className="grid grid-cols-2" style={{ gap: 10, marginBottom: answered ? 16 : 0 }}>
        {card.choices.map((c) => {
          const isAnswer = c.term === card.answer.term;
          const isPicked = picked === c.term;
          let bg = '#fff';
          let border = '#f4c95d';
          let borderBottom = '#f0b433';
          let color = '#7c4a03';
          if (answered && isAnswer) {
            bg = '#ecfdf3';
            border = '#5fce7e';
            borderBottom = '#22a34a';
            color = '#166a33';
          } else if (answered && isPicked && !isAnswer) {
            bg = '#fef0ef';
            border = '#f3958f';
            borderBottom = '#e0554d';
            color = '#a63a32';
          }
          const wrongPicked = answered && isPicked && !isAnswer;
          return (
            <button
              key={c.term}
              type="button"
              disabled={answered}
              onClick={() => {
                onPick(c.term);
                // CMS가 낸 문제일 때만 응답을 집계한다 — 자동생성 문제는
                // 저장된 id가 없어 집계 대상이 아니다. 실패해도 UI엔 영향
                // 없음(fire-and-forget).
                if (card.quizId) {
                  void postQuizAttempt(card.quizId, c.term === card.answer.term);
                }
              }}
              className={`wq-btn${wrongPicked ? ' wq-shake' : ''}`}
              style={{
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 800,
                color,
                textAlign: 'left',
                background: bg,
                border: `2px solid ${border}`,
                borderBottom: `4px solid ${borderBottom}`,
                borderRadius: 12,
                padding: '12px 14px',
                cursor: answered ? 'default' : 'pointer',
              }}
            >
              {c.term}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="flex items-center" style={{ gap: 8 }}>
          {correct ? (
            <div key={card.answer.term} className="flex items-center wq-pop" style={{ gap: 8 }}>
              <GoodJobStampIcon accent="#ea9b0e" className="w-8 h-8 flex-shrink-0" />
              <span style={{ fontSize: 14, fontWeight: 800, color: '#a3580a' }}>
                잘했어요! 정답은 {card.answer.term}이에요.
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 13, color: '#8a5a1a' }}>
              아쉬워요, 정답은 <b>{card.answer.term}</b>이었어요.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
