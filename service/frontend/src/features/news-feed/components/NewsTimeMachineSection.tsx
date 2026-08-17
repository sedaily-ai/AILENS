'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/shared/config/apiClient';
import { kstTodayStr } from '@/shared/lib/date';
import { PocketWatchIcon } from '@/shared/ui/icons/HandDrawnIcons';
import { TimeMachineRewind } from '@/shared/ui/TimeMachineRewind';

// 통합 타임머신 섹션(2026-08-17) — 원래 "그날의 지면"(TimelinePreviewSection,
// 최근 몇 달치 서울경제 실시간 지면)과 "생일 뉴스 타임머신"
// (BirthdayTimeMachineSection, 빅카인즈 1990~ 이슈)이 홈에 나란히 있었는데,
// 둘 다 "날짜 고르면 그날 뉴스" 패턴이 똑같아 보여서(사용자 확인:
// "통합해야죠. 두 개 다 있으면 안 됩니다") 하나로 합쳤다.
//
// 데이터 소스 분기: 최근 날짜(2026-02-01~오늘)는 실시간 S3 지면
// (fetchDayArticles, 3분 자동 폴링), 그 이전(1990-01-01~)은 백엔드
// (handlers/time_machine_handler.py, sedaily-mbti-time-machine-dev Lambda)가
// SSM에 보관된 키로 빅카인즈 뉴스 검색(날짜 범위 + provider=서울경제)을
// 호출해 돌려주는 실제 기사(제목·본문 스니펫·원본 링크) — 처음엔
// issue_ranking(토픽+키워드만)을 썼는데, 그 API의 news_cluster로 기사
// 상세를 찾으면 신뢰도가 낮아서(같은 ID인데도 0건/서버오류가 섞여 나옴,
// 심지어 당일 날짜조차 그랬음) 날짜 범위 직접 검색으로 교체했다(2026-08-17).
// 다만 발행 "시각"은 이 API가 어느 시대 기사든 항상 자정 고정이라 주지
// 않아서, 시간 대신 순번으로 표시한다.
interface TimelineItem {
  id: string;
  time: string;
  title: string;
  href: string | null;
}

interface S3ArticleListItem {
  news_id: string;
  title: string;
  published_at: string;
  original_link?: string;
}

interface BigKindsArticle {
  news_id: string;
  title: string;
  content: string;
  byline: string;
  original_link: string | null;
}

const todayStr = kstTodayStr;

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
}

async function fetchDayArticles(dateStr: string): Promise<TimelineItem[]> {
  const res = await fetch(`${API_URL}/s3-articles?date=${dateStr.replaceAll('-', '')}&limit=30`);
  if (!res.ok) throw new Error(`s3-articles ${res.status}`);
  const data: { articles?: S3ArticleListItem[] } = await res.json();
  const list = data.articles ?? [];
  return list
    .slice()
    .filter((a) => !a.title.includes('[시그널]'))
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .slice(0, 8)
    .map((a) => ({
      id: a.news_id,
      time: formatTime(a.published_at),
      title: a.title,
      href: a.original_link ?? null,
    }));
}

async function fetchBigkindsArticles(dateStr: string): Promise<BigKindsArticle[]> {
  const res = await fetch(`${API_URL}/time-machine?date=${dateStr}`);
  if (!res.ok) throw new Error(`time-machine ${res.status}`);
  const data: { articles?: BigKindsArticle[] } = await res.json();
  return data.articles ?? [];
}

const QUICK_PICKS = ['오늘', '어제', '그제'];

// S3 지면 아카이브가 실제로 커버하는 최소 날짜(2026-08-17 실측). 이보다
// 이전은 실시간 지면 데이터가 없어 빅카인즈 예시로 대체한다.
const ARCHIVE_MIN_DATE = '2026-02-01';
// 빅카인즈 issue_ranking이 공식 지원하는 최소 날짜(OpenAPI 사용자지침서
// V1.5 §4 "제공되는 조회일자는 1990-01-01부터").
const BIGKINDS_MIN_DATE = '1990-01-01';

// 숫자만 쭉 입력해도 "YYYY / MM / DD"로 보이게 포맷 — 네이티브 <input type="date">는
// 브라우저/로케일마다 필드 순서(월/일/년 vs 년/월/일)가 달라 "19991117"처럼 8자리를
// 그대로 입력하면 엉뚱한 날짜로 조합되는 문제가 있었다(2026-08-17 실사용 확인:
// 사용자가 "19991117 했는데 안 나온다"). SideRail 사주 궁합 위젯과 같은 패턴으로
// 교체해 입력 순서를 항상 년→월→일로 고정한다.
function formatDateDigits(digits: string): string {
  if (digits.length < 5) return digits;
  return `${digits.slice(0, 4)} / ${digits.slice(4, 6)}${digits.length >= 7 ? ` / ${digits.slice(6)}` : ''}`;
}

// 8자리가 실제 존재하는 달력 날짜인지(윤년·31일 없는 달 등) 확인하고, 서비스가
// 지원하는 범위(1990-01-01~오늘) 안인지까지 확인한 뒤에만 날짜 문자열을 돌려준다.
function digitsToValidDate(digits: string): string | null {
  if (digits.length !== 8) return null;
  const y = parseInt(digits.slice(0, 4), 10);
  const m = parseInt(digits.slice(4, 6), 10);
  const d = parseInt(digits.slice(6, 8), 10);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  const candidate = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  if (candidate < BIGKINDS_MIN_DATE || candidate > todayStr()) return null;
  return candidate;
}

// 랜덤 범위는 빅카인즈 백엔드가 실제로 지원하는 전체 구간(1990-01-01~오늘).
function randomDateInRange(): string {
  const start = new Date(BIGKINDS_MIN_DATE).getTime();
  const end = Date.now();
  const picked = new Date(start + Math.random() * (end - start));
  const y = picked.getFullYear();
  const m = String(picked.getMonth() + 1).padStart(2, '0');
  const d = String(picked.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function NewsTimeMachineSection() {
  const router = useRouter();
  const [pickedDate, setPickedDate] = useState(todayStr());
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [articles, setArticles] = useState<BigKindsArticle[] | null>(null);
  const [dateDigits, setDateDigits] = useState('');
  const [rewinding, setRewinding] = useState(false);
  const typedDate = digitsToValidDate(dateDigits);

  const isRecent = pickedDate >= ARCHIVE_MIN_DATE;
  const isLive = pickedDate === todayStr();

  // pickedDate가 바뀌면 렌더 중 동기 조정으로 이전 목록을 지운다(React 공식
  // "Adjusting state when a prop changes" 패턴).
  const [prevPickedDate, setPrevPickedDate] = useState(pickedDate);
  if (pickedDate !== prevPickedDate) {
    setPrevPickedDate(pickedDate);
    setItems(null);
    setArticles(null);
  }

  useEffect(() => {
    let cancelled = false;

    if (isRecent) {
      const load = (silent: boolean) => {
        fetchDayArticles(pickedDate)
          .then((rows) => {
            if (!cancelled) setItems(rows);
          })
          .catch(() => {
            if (!cancelled && !silent) setItems([]);
          });
      };
      load(false);

      let intervalId: ReturnType<typeof setInterval> | undefined;
      if (isLive) {
        intervalId = setInterval(() => load(true), 3 * 60 * 1000);
      }
      return () => {
        cancelled = true;
        if (intervalId) clearInterval(intervalId);
      };
    }

    fetchBigkindsArticles(pickedDate)
      .then((rows) => {
        if (!cancelled) setArticles(rows);
      })
      .catch(() => {
        if (!cancelled) setArticles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pickedDate, isRecent, isLive]);

  return (
    <section style={{ padding: 'clamp(28px, 4vw, 40px) 0 0' }}>
      <style>{`
        @keyframes ntm-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .ntm-livedot { animation: ntm-pulse 1.8s ease-in-out infinite; }
        @keyframes ntm-pageturn {
          0% { opacity: 0; transform: translateX(10px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        .ntm-pageturn { animation: ntm-pageturn 260ms ease-out; }
      `}</style>

      <header style={{ marginBottom: 14 }}>
        <p
          className="text-gray-400"
          style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}
        >
          타임머신
        </p>
        <div className="flex items-center" style={{ gap: 8 }}>
          <h2 className="text-gray-900" style={{ fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            그날로 떠나요
          </h2>
          {isLive && (
            <span className="inline-flex items-center" style={{ gap: 5 }}>
              <span aria-hidden className="ntm-livedot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#8a6d3f', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#8a6d3f', letterSpacing: '0.02em' }}>
                실시간 업데이트 중
              </span>
            </span>
          )}
        </div>
      </header>

      <div
        style={{
          borderRadius: 14,
          background: '#fff',
          border: '1px solid #f1efe9',
          boxShadow: '0 1px 2px rgba(17,24,39,0.03), 0 3px 10px rgba(17,24,39,0.04)',
          overflow: 'hidden',
        }}
      >
        {rewinding && (
          <div style={{ padding: 'clamp(24px, 5vw, 40px) 20px' }}>
            <TimeMachineRewind
              fromDate={todayStr()}
              toDate={pickedDate}
              onComplete={() => router.push(`/timeline/${pickedDate}`)}
            />
          </div>
        )}

        {/* 인트로 — "오늘 뭐 있었지"와 "내 생일엔 뭐 있었지"를 한 카피로. */}
        <div style={{ display: rewinding ? 'none' : undefined, textAlign: 'center', padding: 'clamp(20px, 4vw, 28px) clamp(16px, 4vw, 24px) 4px', background: '#fdfcf9' }}>
          <div className="flex justify-center" style={{ marginBottom: 8 }}>
            <PocketWatchIcon accent="#8a6d3f" className="w-8 h-8" />
          </div>
          <p
            style={{
              fontFamily: '"Noto Serif KR", serif',
              fontSize: 'clamp(16px, 3.2vw, 19px)',
              fontWeight: 700,
              color: '#2a2622',
              letterSpacing: '-0.02em',
            }}
          >
            오늘이든, 내가 태어난 날이든 — 그날 세상은 이랬어요
          </p>
        </div>

        {/* 날짜 컨트롤 툴바 */}
        <div
          style={{
            display: rewinding ? 'none' : 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: 6,
            padding: '14px clamp(14px, 3vw, 20px)',
            background: '#fdfcf9',
            borderBottom: '1px solid #f1efe9',
          }}
        >
          {QUICK_PICKS.map((label, i) => {
            const [ty, tm, td] = todayStr().split('-').map((s) => parseInt(s, 10));
            const dateForPick = new Date(Date.UTC(ty, tm - 1, td - i)).toISOString().slice(0, 10);
            const active = pickedDate === dateForPick;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setPickedDate(dateForPick)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  border: 'none',
                  background: active ? '#2a2622' : '#f3f0e8',
                  color: active ? '#fff' : '#78716c',
                  cursor: 'pointer',
                  transition: 'background .15s, color .15s',
                }}
              >
                {label}
              </button>
            );
          })}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '6px 10px',
              background: '#fff',
              border: '1px solid #e6e0d4',
              borderRadius: 9999,
            }}
          >
            <input
              type="text"
              inputMode="numeric"
              value={formatDateDigits(dateDigits)}
              onChange={(e) => setDateDigits(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
              placeholder="1999 / 11 / 17"
              maxLength={14}
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 12.5,
                color: '#2a2622',
                fontFamily: 'inherit',
                width: 108,
                fontVariantNumeric: 'tabular-nums',
              }}
            />
          </div>
          {/* 이전엔 "이동"으로 날짜를 확정한 뒤에야 "펼치기"가 그 날짜를 썼는데,
              두 번 눌러야 하는 게 헷갈린다는 실사용 피드백(2026-08-17: "19991117
              누르고 펼치기 눌렀는데 오늘 날짜가 나온다")으로 하나로 합쳤다 —
              입력창에 유효한 날짜가 타이핑돼 있으면 그걸 바로 쓰고, 없으면
              퀵픽/랜덤으로 골라둔 날짜를 쓴다. */}
          <button
            type="button"
            onClick={() => {
              if (typedDate) setPickedDate(typedDate);
              setRewinding(true);
            }}
            style={{
              padding: '6px 12px',
              borderRadius: 9999,
              border: 'none',
              background: '#f3f0e8',
              color: '#78716c',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            펼치기
          </button>
          {/* "생일이 기억 안 나거나 그냥 궁금해서" 눌러보는 진입점
              (2026-08-17 피드백) — 빅카인즈가 실제 지원하는 범위 전체에서 뽑는다. */}
          <button
            type="button"
            onClick={() => setPickedDate(randomDateInRange())}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: '#96876f',
              padding: '5px 6px',
            }}
          >
            🎲 아무 날이나
          </button>
        </div>

        {/* 결과 — 최근 구간(2026-02-01~오늘)은 실시간 S3 지면, 그 이전은
            빅카인즈 뉴스 검색(날짜 범위) 실 데이터. 홈은 미리보기라 상위
            8개만 — 전체는 "펼치기"(/timeline/{날짜})에서. */}
        {!rewinding && (isRecent ? (
          items !== null && (
            <div key={pickedDate} className="ntm-pageturn" style={{ padding: 'clamp(14px, 3vw, 20px)' }}>
              {items.length === 0 && (
                <p style={{ textAlign: 'center', padding: '20px 8px', fontSize: 13, color: '#a8a29e' }}>
                  이 날은 보관된 기사가 없어요.
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {items.map((item, i) => {
                  const row = (
                    <>
                      <span
                        className="flex-shrink-0"
                        style={{ width: 44, fontSize: 11.5, fontWeight: 700, color: '#96876f', fontVariantNumeric: 'tabular-nums' }}
                      >
                        {item.time}
                      </span>
                      <p
                        className="text-gray-800"
                        style={{
                          fontSize: 14,
                          lineHeight: 1.5,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          minWidth: 0,
                        }}
                      >
                        {item.title}
                      </p>
                    </>
                  );
                  const rowStyle = {
                    gap: 12,
                    padding: '10px 6px',
                    borderTop: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.06)',
                    cursor: item.href ? ('pointer' as const) : ('default' as const),
                  };
                  return item.href ? (
                    <a
                      key={item.id}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-baseline transition-colors hover:bg-gray-50"
                      style={rowStyle}
                    >
                      {row}
                    </a>
                  ) : (
                    <div key={item.id} className="flex items-baseline" style={rowStyle}>
                      {row}
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : (
          articles !== null && (
            <div key={pickedDate} className="ntm-pageturn" style={{ padding: 'clamp(14px, 3vw, 20px)' }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#78716c' }}>{pickedDate}자 서울경제</span>
                <span style={{ fontSize: 11, color: '#a8a29e' }}>빅카인즈 뉴스빅데이터 제공 · 발행 시각 정보 없음</span>
              </div>
              {articles.length === 0 && (
                <p style={{ textAlign: 'center', padding: '20px 8px', fontSize: 13, color: '#a8a29e' }}>
                  이 날은 보관된 기사가 없어요.
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {articles.slice(0, 8).map((a, i) => {
                  const row = (
                    <>
                      <span
                        className="flex-shrink-0"
                        style={{ width: 22, fontSize: 11.5, fontWeight: 700, color: '#c4b48f', fontVariantNumeric: 'tabular-nums' }}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <p
                          className="text-gray-800"
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            lineHeight: 1.5,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {a.title}
                        </p>
                        {a.content && (
                          <p
                            style={{
                              fontSize: 12,
                              color: '#96876f',
                              marginTop: 3,
                              lineHeight: 1.5,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {a.content}
                          </p>
                        )}
                        {a.byline && (
                          <p style={{ fontSize: 11, color: '#b3aa99', marginTop: 3 }}>{a.byline} 기자</p>
                        )}
                      </div>
                    </>
                  );
                  const rowStyle = {
                    gap: 10,
                    padding: '10px 6px',
                    borderTop: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.06)',
                    cursor: a.original_link ? ('pointer' as const) : ('default' as const),
                  };
                  return a.original_link ? (
                    <a
                      key={a.news_id}
                      href={a.original_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-baseline transition-colors hover:bg-gray-50"
                      style={rowStyle}
                    >
                      {row}
                    </a>
                  ) : (
                    <div key={a.news_id} className="flex items-baseline" style={rowStyle}>
                      {row}
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ))}
      </div>
    </section>
  );
}
