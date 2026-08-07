'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { GoodJobStampIcon } from './icons/HandDrawnIcons';
import { dedupeTerms, fetchFollowingWordTerms, type Term } from '../lib/wordsTerms';

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

// 카드 4개를 그냥 나열하는 건 "그냥 정보"라 심심하다는 피드백(2026-08-06) —
// 빈칸 채우기 퀴즈로 바꿨다. 처음엔 색이 탁하고(vintage 종이톤) 정적이라
// "듀오링고처럼 친근하고 트렌디해 보이나"는 재차 피드백 — 듀오링고 실제
// 패턴(단일 채도 높은 브랜드 컬러, 아래쪽이 두꺼운 눌리는 버튼, 클릭마다
// 바운스/흔들림 모션)을 참고해 채도를 올리고 버튼에 눌리는 3D 엣지 +
// 정답/오답 모션을 더했다.
const FALLBACK: Term[] = [
  { term: '기준금리', explain: '중앙은행이 결정하는 정책금리. 시중 금리·환율·자산가격에 두루 영향을 준다.' },
  { term: 'PER', explain: '주가수익비율. 주가를 주당순이익으로 나눈 값으로, 낮을수록 저평가로 본다.' },
  { term: '환헤지', explain: '환율 변동으로 인한 손실 위험을 미리 없애두는 것. 해외 투자 시 자주 등장한다.' },
  { term: 'CPI', explain: '소비자물가지수. 물가 상승률을 가늠하는 대표 지표로, 금리 결정에 큰 영향을 준다.' },
];

interface Props {
  // 빌드타임(app/page.tsx)에 fetchCmsPosts('letters', undefined, 50)에서 뽑은
  // 키워드 목록 — 정적 HTML에 실제 퀴즈가 바로 박히게 한다(2026-08-07, 홈 SSG
  // 감사). shuffle을 seed 기반으로 바꿔 hydration mismatch를 막았다(위 참조).
  initialTerms?: Term[];
}

export function WordsPreviewSection({ initialTerms }: Props) {
  const [terms, setTerms] = useState<Term[] | null>(initialTerms ?? null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFollowingWordTerms().then((deduped) => {
      if (!cancelled) setTerms(deduped);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pool = useMemo(() => {
    if (terms === null) return null;
    const isMock = terms.length < 4;
    const list = isMock ? dedupeTerms([...terms, ...FALLBACK], 8) : terms;
    return { list, isMock };
  }, [terms]);

  // 날짜 기준으로 문제를 고정 — 새로고침해도 같은 문제, 다음 날엔 다른 문제.
  const quiz = useMemo(() => {
    if (!pool || pool.list.length === 0) return null;
    const qIndex = new Date().getDate() % pool.list.length;
    const answer = pool.list[qIndex];
    const distractors = shuffle(pool.list.filter((_, i) => i !== qIndex), qIndex + 1).slice(0, 3);
    return { answer, choices: shuffle([answer, ...distractors], qIndex + 2) };
  }, [pool]);

  if (pool === null || !quiz) return null; // 로딩 중엔 자리 안 차지

  const answered = picked !== null;
  const correct = picked === quiz.answer.term;

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
      `}</style>

      <header style={{ marginBottom: 14 }}>
        <p
          className="text-gray-400"
          style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}
        >
          Glossary
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
            단어장 전체 보기 →
          </Link>
        </div>
      </header>

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
          &ldquo;{quiz.answer.explain}&rdquo;
        </p>

        <div className="grid grid-cols-2" style={{ gap: 10, marginBottom: answered ? 16 : 0 }}>
          {quiz.choices.map((c) => {
            const isAnswer = c.term === quiz.answer.term;
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
                onClick={() => setPicked(c.term)}
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
              <div key={quiz.answer.term} className="flex items-center wq-pop" style={{ gap: 8 }}>
                <GoodJobStampIcon accent="#ea9b0e" className="w-8 h-8 flex-shrink-0" />
                <span style={{ fontSize: 14, fontWeight: 800, color: '#a3580a' }}>
                  잘했어요! 정답은 {quiz.answer.term}이에요.
                </span>
              </div>
            ) : (
              <span style={{ fontSize: 13, color: '#8a5a1a' }}>
                아쉬워요, 정답은 <b>{quiz.answer.term}</b>이었어요.
              </span>
            )}
          </div>
        )}
      </div>

      {pool.isMock && (
        <p style={{ fontSize: 11, color: '#c9b088', marginTop: 8 }}>
          레터에 쌓이는 실제 용어가 늘면 문제도 그만큼 다양해져요.
        </p>
      )}
    </section>
  );
}
