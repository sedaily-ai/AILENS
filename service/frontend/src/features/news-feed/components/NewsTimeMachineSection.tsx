'use client';

import { useEffect, useId, useState } from 'react';
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
//
// ══ 2026-08-18 재설계 ══
// 데이터·분기 로직은 그대로 두고 표현만 바꿨다.
//
// ── (A) 톤을 홈에 맞춘다 ──
// 직전 시도에서 이 기능 내부 화면(/timeline)의 톤(크림·세리프·골드 #8a6d3f)을
// 홈 섹션에 그대로 가져왔는데 형제 섹션들과 부딪혔다(사용자 피드백: "갈색이
// 좀 그래", "글씨도 다른거에 너무 커", "다른 카테고리랑 톤앤매너 맞게").
//
// 형제 섹션(LensPreviewSection·VideoPreviewSection·WordsPreviewSection·
// WebtoonPreviewSection)을 실측한 결과 홈의 언어는 이렇다:
//   · 라벨 11~13px, 회색, letterSpacing 0.12~0.14em, 대문자
//   · h2 clamp(20px, 4.4vw, 24px) / weight 800
//   · 카드 radius 16, 헤어라인 rgba(17,24,39,0.09), 옅은 2단 그림자
//   · 본문 13 / 14 / 16px
//   · 중립 회색(#111827·#374151·#6b7280) + 파랑 액센트(#3182F6·#dbeafe)
//   · **세리프를 쓰는 홈 섹션은 하나도 없다**
// 그래서 갈색과 세리프를 걷고 위 값으로 재구성했다. 18·20px 도 없앴다.
//
// 색은 형제를 그대로 베끼지 않고 대비를 통과하는 최근값을 골랐다 —
// 형제 라벨 #9ca3af 는 2.54:1, 칩 글자 #6b7280 on #f3f4f6 은 4.39:1 로
// 각각 미달이라 #6b7280(4.83:1) / #374151(9.37:1) 로 한 단계만 진하게.
// 주요 버튼도 브랜드 #3182F6 은 흰 글씨와 3.71:1 이라 #1d4ed8(6.70:1)을 쓴다.
//
// ── (B) 재미를 어디서 내나 ──
// 이전 퀵픽은 오늘/어제/그제뿐이었다. 셋 다 **이미 아는 날**이라 눌러볼 이유가
// 없고, 생일을 넣으려면 날짜를 떠올려 8자리를 타이핑해야 했다. 그래서 이
// 섹션은 "날짜 조회 폼"처럼 보였다 — 타임머신인데 시간여행의 재미가 없었다.
//
// **"같은 날, 다른 시대"** 를 한 줄 추가했다(10년 전 오늘 / 20년 전 / 30년 전).
//   · 떠올릴 것이 없다 — 오늘 날짜만 알면 된다
//   · 1990년까지 쌓인 아카이브의 깊이가 즉시 보인다
//   · "오늘과 같은 날, 그때는?" 이라는 대조가 곧 타임머신의 재미다
// 결과 머리에는 "26년 전" 배지를 붙여 얼마나 멀리 왔는지 알려준다.
//
// ── (C) 가시성 ──
//   · 대비 미달 7건을 0건으로(기사 시각·출처·바이라인·빈 상태가 모두 2.54:1
//     이었다 — 시각은 "최신순"의 근거인데 안 읽혔다)
//   · 주요 동작이 보조와 같은 회색 칩이었다 → 파랑 채움으로 무게를 벌렸다
//   · 라벨 "펼치기" → "그날로 떠나기". 실제 동작이 이동인데다 같은 카드 안에
//     목록을 펼치는 "더보기/접기"가 따로 있어 같은 말이 두 뜻이었다
//   · 지금 보고 있는 날짜가 최근 구간 결과에 아예 없었다 → 항상 표시
//   · 터치 타겟 24~27px → 44px
//   · 목록이 클라이언트 fetch 인데 로딩 표시가 없어 첫 화면이 비었다가 툭
//     끼어들었다 → 스켈레톤
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

/* ── 홈 톤 토큰 ────────────────────────────────────────────────────
   형제 홈 섹션들이 쓰는 값. 대비는 전부 실측해 통과하는 것만 골랐다. */
const INK = '#111827'; // 17.74:1 on #fff
const BODY = '#374151'; // 10.31:1 on #fff, 9.37:1 on #f3f4f6
const MUTED = '#6b7280'; // 4.83:1 on #fff, 4.63:1 on #f9fafb
const BLUE = '#1d4ed8'; // 6.70:1 on #fff / 흰 글씨와도 6.70:1
const BLUE_TINT = '#dbeafe'; // #1d4ed8 과 5.49:1
const CHIP = '#f3f4f6';
const PANEL = '#f9fafb';
const LINE = 'rgba(17,24,39,0.09)';

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
    .slice(0, 10)
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

// "같은 날, 다른 시대" — 되감기 폭(년). 30년 전이 1996년이라 빅카인즈 하한
// (1990)에 안전하게 들어간다.
//
// 오늘/어제/그제 퀵픽은 없앴다(2026-08-18, 사용자 지적: "너무 클릭해야 할
// 요소들이 많아서 불편하지 않겠어?"). 실측 9개였다 —
//   · "오늘"은 도착 시점에 이미 선택된 상태라 누를 이유가 없었다. 실제로
//     필요한 순간은 다른 날짜를 보고 **돌아올 때**뿐이므로, 결과 머리의
//     조건부 "오늘로 돌아가기"로 옮겼다(되돌릴 대상 바로 옆).
//   · "어제·그제"는 이 아카이브의 가치(1990년까지의 깊이)와 무관하고 홈 상단
//     뉴스와 겹쳐서 자리 대비 얻는 게 적었다. 필요하면 직접 입력으로 된다.
//   · "아무 날이나"는 되감기와 같은 종류("떠올리지 않고 골라주세요")인데
//     밑줄 텍스트로 따로 떨어져 있었다 → 같은 줄 칩으로 병합.
// 결과: 무리 셋 → 둘, 도착 시 조작 요소 9개 → 6개.
const REWIND_YEARS = [10, 20, 30];

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

// N년 전 "같은 날". 2월 29일처럼 그 해에 없는 날은 28일로 당긴다
// (Date 가 3월 1일로 넘겨버리므로 월이 바뀌었는지로 판별).
function yearsAgoToday(years: number): string {
  const [y, m, d] = todayStr().split('-').map((s) => parseInt(s, 10));
  const targetY = y - years;
  const dt = new Date(targetY, m - 1, d);
  const day = dt.getMonth() === m - 1 ? d : 28;
  return `${targetY}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// 오늘로부터 몇 해 전인지(달·일까지 반영한 만 나이 계산과 같은 방식).
function fullYearsAgo(dateStr: string): number {
  const [fy, fm, fd] = dateStr.split('-').map((s) => parseInt(s, 10));
  const [ty, tm, td] = todayStr().split('-').map((s) => parseInt(s, 10));
  let n = ty - fy;
  if (tm < fm || (tm === fm && td < fd)) n -= 1;
  return n;
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
// "2026-08-18" → "2026. 8. 18. (화)"
function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return dateStr;
  const w = WEEKDAY[new Date(y, m - 1, d).getDay()] ?? '';
  return `${y}. ${m}. ${d}.${w ? ` (${w})` : ''}`;
}

export function NewsTimeMachineSection() {
  const router = useRouter();
  const headingId = useId();
  const inputId = useId();
  const [pickedDate, setPickedDate] = useState(todayStr());
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [articles, setArticles] = useState<BigKindsArticle[] | null>(null);
  const [dateDigits, setDateDigits] = useState('');
  const [rewinding, setRewinding] = useState(false);
  // 기본 5개만 보여주고 "더보기"로 나머지를 펼친다(2026-08-17, 사용자
  // 피드백: "더보기 누르게 하시죠, 한 5개만 보여주고" — 개수를 아예 줄이는
  // 대신 펼침 방식으로 바꿔 목록 전체를 잃지 않으면서도 기본 화면은 짧게
  // 유지한다).
  const VISIBLE_COUNT = 5;
  const [expanded, setExpanded] = useState(false);
  const typedDate = digitsToValidDate(dateDigits);
  // 8자리를 다 넣었는데 유효하지 않으면 알려준다 — 이전에는 typedDate 를
  // 계산만 하고 화면에 아무 신호가 없어서 잘못 입력해도 알 수 없었다.
  const typedInvalid = dateDigits.length === 8 && typedDate === null;

  const isRecent = pickedDate >= ARCHIVE_MIN_DATE;
  const isLive = pickedDate === todayStr();
  const yearsBack = fullYearsAgo(pickedDate);

  // pickedDate가 바뀌면 렌더 중 동기 조정으로 이전 목록을 지운다(React 공식
  // "Adjusting state when a prop changes" 패턴).
  const [prevPickedDate, setPrevPickedDate] = useState(pickedDate);
  if (pickedDate !== prevPickedDate) {
    setPrevPickedDate(pickedDate);
    setItems(null);
    setArticles(null);
    setExpanded(false);
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

  const pick = (date: string) => {
    setDateDigits('');
    setPickedDate(date);
  };

  const depart = () => {
    if (typedDate) setPickedDate(typedDate);
    setRewinding(true);
  };

  return (
    <section aria-labelledby={headingId} style={{ padding: 'clamp(24px, 4vw, 40px) 0 0' }}>
      <style>{`
        @keyframes ntm-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .ntm-livedot { animation: ntm-pulse 1.8s ease-in-out infinite; }
        @keyframes ntm-pageturn {
          0% { opacity: 0; transform: translateX(10px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        .ntm-pageturn { animation: ntm-pageturn 260ms ease-out; }

        /* 눈에 보이는 포커스 링 — 이전에는 아무 요소에도 없었다. */
        .ntm-focus:focus-visible { outline: 2px solid ${BLUE}; outline-offset: 2px; border-radius: 8px; }

        /* 칩 — 형제 섹션과 같은 채움 방식(#f3f4f6). 터치 타겟 44px 확보
           (이전 24px). 글자는 #374151 로 한 단계 진하게 — 형제가 쓰는
           #6b7280 은 이 배경에서 4.39:1 로 아깝게 미달한다. */
        .ntm-chip { display: inline-flex; align-items: center; justify-content: center;
          min-height: 44px; padding: 0 16px; border-radius: 999px; border: none;
          font-size: 14px; font-weight: 600; background: ${CHIP}; color: ${BODY};
          cursor: pointer; white-space: nowrap;
          transition: background .15s ease, color .15s ease; }
        .ntm-chip:hover { background: #e9ebef; color: ${INK}; }
        .ntm-chip[aria-pressed="true"] { background: ${INK}; color: #fff; font-weight: 700; }

        /* 주요 동작 — 이 섹션의 주인공. 파랑 채움으로 칩과 무게를 벌린다. */
        .ntm-go { display: inline-flex; align-items: center; justify-content: center;
          min-height: 44px; padding: 0 18px; border-radius: 999px; border: none;
          background: ${BLUE}; color: #fff; font-size: 14px; font-weight: 700;
          cursor: pointer; white-space: nowrap;
          transition: background .15s ease, transform .12s ease; }
        .ntm-go:hover { background: #1a44bd; }
        .ntm-go:active { transform: scale(.98); }

        /* 보조 동작 — 텍스트 버튼. 주요 동작과 명확히 다른 급. */
        .ntm-sub { display: inline-flex; align-items: center; justify-content: center;
          min-height: 44px; padding: 0 8px; background: none; border: none;
          font-size: 14px; font-weight: 600; color: ${MUTED}; cursor: pointer;
          text-decoration: underline; text-underline-offset: 3px; transition: color .15s ease; }
        .ntm-sub:hover { color: ${INK}; }

        .ntm-row { transition: background .14s ease; }
        .ntm-row:hover { background: ${PANEL}; }
        .ntm-row:hover .ntm-title { color: ${BLUE}; }

        @media (prefers-reduced-motion: reduce) {
          .ntm-livedot, .ntm-pageturn { animation: none; }
          .ntm-go, .ntm-chip, .ntm-sub, .ntm-row { transition: none; }
        }
      `}</style>

      {/* 헤더 — 형제 섹션과 같은 골격(라벨 → h2). 라벨만 대비 때문에 한
          단계 진하다(형제 #9ca3af 는 2.54:1). */}
      <header style={{ marginBottom: 12 }}>
        <p
          style={{
            fontSize: 13,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontWeight: 600,
            color: MUTED,
            marginBottom: 4,
          }}
        >
          타임머신
        </p>
        <div className="flex items-center" style={{ gap: 8 }}>
          <h2
            id={headingId}
            style={{
              fontSize: 'clamp(20px, 4.4vw, 24px)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: INK,
            }}
          >
            그날로 떠나요
          </h2>
          {/* "실시간 업데이트 중" 텍스트 라벨 제거(2026-08-17, 사용자 피드백:
              "실시간 업데이트 중도 굳이? AI 티나요, 자연스럽지 않은 톤") —
              점만 남긴다. 단 점은 aria-hidden 이라 보조기기에 정보가 없었으므로
              화면에 안 보이는 텍스트로 상태를 남긴다. */}
          {isLive && (
            <>
              <span
                aria-hidden
                className="ntm-livedot"
                style={{ width: 6, height: 6, borderRadius: '50%', background: BLUE, flexShrink: 0 }}
              />
              <span style={SR_ONLY}>실시간 업데이트 중</span>
            </>
          )}
        </div>
      </header>

      <div
        style={{
          borderRadius: 16,
          background: '#fff',
          border: `1px solid ${LINE}`,
          boxShadow: '0 1px 2px rgba(17,24,39,0.03), 0 3px 10px rgba(17,24,39,0.04)',
          overflow: 'hidden',
        }}
      >
        {/* ── 전환 연출 ── 종이비행기가 활강 곡선을 타고 오른쪽 끝에서 왼쪽
            끝까지 난다. 지나온 구간은 실선(파랑), 남은 구간은 점선 — 항공
            노선도 관례라 진행도가 한눈에 읽힌다. 연도 눈금은 경로 아래
            고정되어 비행기가 지나며 하나씩 켜진다.
            라벨·날짜·건너뛰기는 컴포넌트가 직접 그린다. */}
        {rewinding && (
          <div style={{ padding: 'clamp(28px, 6vw, 48px) 20px' }}>
            <TimeMachineRewind
              fromDate={todayStr()}
              toDate={pickedDate}
              onComplete={() => router.push(`/timeline/${pickedDate}`)}
            />
          </div>
        )}

        {/* ── 탑승구 ── 인트로 + 날짜 고르기를 한 덩어리로. 이전에는 회색 밴드
            두 개가 겹쳐 어디까지가 한 묶음인지 흐렸다. */}
        <div
          style={{
            display: rewinding ? 'none' : undefined,
            background: PANEL,
            borderBottom: `1px solid ${LINE}`,
            padding: 'clamp(16px, 3vw, 20px) clamp(16px, 4vw, 24px)',
            textAlign: 'center',
          }}
        >
          <div className="flex justify-center" style={{ marginBottom: 8 }}>
            <PocketWatchIcon accent={BLUE} className="w-6 h-6" />
          </div>
          <p
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: INK,
              letterSpacing: '-0.01em',
              lineHeight: 1.5,
              wordBreak: 'keep-all',
            }}
          >
            오늘이든, 내가 태어난 날이든 — 그날 세상은 이랬어요
          </p>

          {/* 되감기 — "같은 날, 다른 시대".
              오늘 날짜만 알면 되므로 떠올릴 것이 없고, 1990년까지 쌓인
              아카이브의 깊이가 즉시 보인다. 이 줄이 이 섹션의 재미를 담당한다.

              줄 이름을 따로 두지 않는다 — 칩 스스로 "10년 전 오늘"이라고
              말하므로 라벨이 없어도 뜻이 분명하고, 그만큼 요소가 줄어든다.
              마지막 "아무 날이나"는 선택 토글이 아니라 매번 다른 날짜를 뽑는
              동작이라 aria-pressed 를 붙이지 않는다. */}
          <div
            className="flex items-center justify-center"
            style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}
          >
            {REWIND_YEARS.map((n) => {
              const date = yearsAgoToday(n);
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={pickedDate === date}
                  onClick={() => pick(date)}
                  className="ntm-chip ntm-focus"
                >
                  {n}년 전 오늘
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => pick(randomDateInRange())}
              className="ntm-chip ntm-focus"
            >
              아무 날이나
            </button>
          </div>

          {/* 직접 입력 + 주요 동작 */}
          <div
            className="flex items-center justify-center"
            style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}
          >
            {/* 보이는 라벨을 붙인다 — 이전에는 placeholder 뿐이라 값을 채우면
                무엇을 넣는 칸인지 사라졌다. */}
            <label
              htmlFor={inputId}
              style={{ fontSize: 13, fontWeight: 600, color: MUTED, whiteSpace: 'nowrap' }}
            >
              날짜 직접 입력
            </label>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 44,
                padding: '0 16px',
                background: '#fff',
                border: `1px solid ${typedInvalid ? '#b91c1c' : LINE}`,
                borderRadius: 999,
              }}
            >
              <input
                id={inputId}
                type="text"
                inputMode="numeric"
                value={formatDateDigits(dateDigits)}
                onChange={(e) => setDateDigits(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                onKeyDown={(e) => {
                  // 입력 후 엔터로 바로 떠날 수 있게 — 버튼까지 이동하지 않아도 된다.
                  if (e.key === 'Enter' && typedDate) depart();
                }}
                placeholder="1999 / 11 / 17"
                maxLength={14}
                aria-invalid={typedInvalid}
                aria-describedby={typedInvalid ? `${inputId}-err` : undefined}
                className="ntm-focus"
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: 14,
                  color: INK,
                  fontFamily: 'inherit',
                  width: 112,
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </span>
            {/* 이전엔 "이동"으로 날짜를 확정한 뒤에야 "펼치기"가 그 날짜를 썼는데,
                두 번 눌러야 하는 게 헷갈린다는 실사용 피드백(2026-08-17: "19991117
                누르고 펼치기 눌렀는데 오늘 날짜가 나온다")으로 하나로 합쳤다.
                라벨은 "펼치기" → "그날로 떠나기" — 실제 동작이 이동인데다 같은
                카드의 목록 "더보기/접기"와 말이 겹쳤다(h2 "그날로 떠나요"와도
                이제 같은 말을 쓴다). */}
            <button type="button" onClick={depart} className="ntm-go ntm-focus">
              그날로 떠나기 →
            </button>
          </div>

          {typedInvalid && (
            <p
              id={`${inputId}-err`}
              role="alert"
              style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: '#b91c1c' }}
            >
              1990년 1월 1일부터 오늘 사이의 날짜를 넣어주세요.
            </p>
          )}
        </div>

        {/* 결과 — 최근 구간(2026-02-01~오늘)은 실시간 S3 지면, 그 이전은
            빅카인즈 뉴스 검색(날짜 범위) 실 데이터. 기본 5개 + "더보기"/"접기"
            (2026-08-17 피드백 3연속: "너무 많이 표출" → "5개만" → "접는 거는
            안되나?"). 첫 항목만 굵게 해 위계를 준다("리스트가 밋밋하다").

            로딩 중에는 스켈레톤을 둔다(스티어링 §4) — 이전에는
            `items !== null &&` 라서 받아오기 전까지 결과 영역이 통째로 비어
            첫 화면에 탑승구만 보이다가 목록이 툭 끼어들며 레이아웃이 튀었다. */}
        {!rewinding && (isRecent ? (
          items === null ? (
            <ResultSkeleton withTime />
          ) : (
            <div key={pickedDate} className="ntm-pageturn" style={{ padding: 'clamp(12px, 3vw, 20px)' }}>
              <ResultHeader
                date={pickedDate}
                source={isLive ? '서울경제 지면 · 실시간' : '서울경제 지면'}
                yearsBack={yearsBack}
                onBackToToday={isLive ? undefined : () => pick(todayStr())}
              />
              {items.length === 0 && <EmptyDay />}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {(expanded ? items : items.slice(0, VISIBLE_COUNT)).map((item, i) => {
                  const row = (
                    <>
                      {/* 11.5px / 2.54:1 였다 — 13px / 4.83:1. 최신순의 근거라
                          읽혀야 하는 정보다. */}
                      <span
                        className="flex-shrink-0"
                        style={{
                          width: 44,
                          fontSize: 13,
                          fontWeight: 600,
                          color: MUTED,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {item.time}
                      </span>
                      {/* 14px — 형제 홈 섹션(VideoPreviewSection·
                          LensPreviewSection)의 목록 제목과 같은 크기다.
                          16px 은 이 섹션만 유독 커 보였다(사용자 지적). */}
                      <p
                        className="ntm-title"
                        style={{
                          fontSize: 14,
                          fontWeight: i === 0 ? 700 : 500,
                          lineHeight: 1.55,
                          color: INK,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          minWidth: 0,
                          wordBreak: 'keep-all',
                          transition: 'color .14s ease',
                        }}
                      >
                        {item.title}
                      </p>
                    </>
                  );
                  const rowStyle = {
                    gap: 12,
                    padding: '12px 8px',
                    borderTop: i === 0 ? 'none' : `1px solid ${LINE}`,
                    cursor: item.href ? ('pointer' as const) : ('default' as const),
                  };
                  return item.href ? (
                    <a
                      key={item.id}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-baseline ntm-row ntm-focus"
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
              {items.length > VISIBLE_COUNT && (
                <ExpandToggle expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
              )}
            </div>
          )
        ) : articles === null ? (
          <ResultSkeleton />
        ) : (
          <div key={pickedDate} className="ntm-pageturn" style={{ padding: 'clamp(12px, 3vw, 20px)' }}>
            <ResultHeader
              date={pickedDate}
              source="빅카인즈 뉴스빅데이터 제공 · 발행 시각 정보 없음"
              yearsBack={yearsBack}
              onBackToToday={() => pick(todayStr())}
            />
            {articles.length === 0 && <EmptyDay />}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {(expanded ? articles : articles.slice(0, VISIBLE_COUNT)).map((a, i) => {
                const row = (
                  <>
                    <span
                      className="flex-shrink-0"
                      style={{
                        width: 24,
                        fontSize: 13,
                        fontWeight: 600,
                        color: MUTED,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <p
                        className="ntm-title"
                        style={{
                          fontSize: 14,
                          fontWeight: i === 0 ? 700 : 500,
                          lineHeight: 1.55,
                          color: INK,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          wordBreak: 'keep-all',
                          transition: 'color .14s ease',
                        }}
                      >
                        {a.title}
                      </p>
                      {/* 제목이 14px 로 내려오면서 스니펫도 13px 로 낮췄다 —
                          같은 크기면 제목과 본문의 위계가 사라진다. */}
                      {a.content && (
                        <p
                          style={{
                            fontSize: 13,
                            color: BODY,
                            marginTop: 4,
                            lineHeight: 1.6,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {a.content}
                        </p>
                      )}
                      {a.byline && <p style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{a.byline} 기자</p>}
                    </div>
                  </>
                );
                const rowStyle = {
                  gap: 12,
                  padding: '12px 8px',
                  borderTop: i === 0 ? 'none' : `1px solid ${LINE}`,
                  cursor: a.original_link ? ('pointer' as const) : ('default' as const),
                };
                return a.original_link ? (
                  <a
                    key={a.news_id}
                    href={a.original_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-baseline ntm-row ntm-focus"
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
            {articles.length > VISIBLE_COUNT && (
              <ExpandToggle expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

/* 결과 머리 — 지금 보고 있는 날짜를 항상 박는다.
   이전에는 최근 구간(S3) 결과에 날짜 표시가 아예 없어서, "아무 날이나"를
   누르거나 직접 입력하면(퀵픽 선택도 함께 풀린다) 이 목록이 어느 날짜인지
   알 수 없었다. 가시성의 핵심 결함이었다.

   "26년 전" 배지는 시간여행의 피드백 — 얼마나 멀리 왔는지 한눈에 보인다. */
function ResultHeader({
  date,
  source,
  yearsBack,
  onBackToToday,
}: {
  date: string;
  source: string;
  yearsBack: number;
  onBackToToday?: () => void;
}) {
  return (
    <div
      className="flex items-center"
      style={{
        flexWrap: 'wrap',
        gap: '4px 8px',
        paddingBottom: 12,
        marginBottom: 4,
        borderBottom: `1px solid ${LINE}`,
      }}
    >
      <span style={{ fontSize: 16, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>
        {formatDateLabel(date)}
      </span>
      {yearsBack >= 1 && (
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: BLUE,
            background: BLUE_TINT,
            borderRadius: 999,
            padding: '4px 8px',
            lineHeight: 1.2,
          }}
        >
          {yearsBack}년 전
        </span>
      )}
      <span style={{ fontSize: 13, color: MUTED }}>{source}</span>
      {/* 되돌리기는 되돌릴 대상 바로 옆에 둔다. 오늘을 보고 있을 때는 아예
          렌더하지 않으므로 도착 화면에서는 조작 요소가 하나도 늘지 않는다. */}
      {onBackToToday && (
        <button type="button" onClick={onBackToToday} className="ntm-sub ntm-focus" style={{ marginLeft: 'auto' }}>
          오늘로 돌아가기
        </button>
      )}
    </div>
  );
}

/* 로딩 뼈대 — 실제 행과 같은 골격(시각 열 + 제목 + 보조)으로 그린다.
   스피너를 쓰지 않는 이유는 스티어링 §4 그대로다: 레이아웃이 미리 보이면
   체감 대기가 줄고, 콘텐츠가 도착할 때 화면이 튀지 않는다.
   withTime 은 최근 구간(시각 열 44px) / 과거 구간(순번 열 24px) 차이. */
function ResultSkeleton({ withTime = false }: { withTime?: boolean }) {
  const bar = (w: string, h: number, tone: string) => (
    <span style={{ display: 'block', width: w, height: h, borderRadius: 4, background: tone }} />
  );
  return (
    <div style={{ padding: 'clamp(12px, 3vw, 20px)' }}>
      <div style={{ paddingBottom: 12, marginBottom: 4, borderBottom: `1px solid ${LINE}` }} aria-hidden>
        {bar('170px', 16, '#eceef1')}
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-baseline"
          style={{ gap: 12, padding: '12px 8px', borderTop: i === 0 ? 'none' : `1px solid ${LINE}` }}
          aria-hidden
        >
          <span className="flex-shrink-0" style={{ width: withTime ? 44 : 24 }}>
            {bar(withTime ? '36px' : '20px', 13, '#f1f3f5')}
          </span>
          {/* 바 높이는 실제 행의 글자 크기를 따라간다(제목 14, 보조 13) —
              어긋나면 데이터가 도착할 때 행 높이가 튄다. */}
          <span style={{ minWidth: 0, flex: 1 }}>
            {bar(i === 0 ? '92%' : '84%', 14, '#eceef1')}
            <span style={{ display: 'block', height: 8 }} />
            {bar('62%', 13, '#f4f6f8')}
          </span>
        </div>
      ))}
      <span style={SR_ONLY}>그날의 기사를 불러오는 중입니다</span>
    </div>
  );
}

// 빈 상태는 왜 비었는지 + 다음에 뭘 하면 되는지 알려준다(스티어링 §4).
// 이전에는 "이 날은 보관된 기사가 없어요." 한 줄이 2.54:1 로 흐릿하게만 있었다.
function EmptyDay() {
  return (
    <div style={{ textAlign: 'center', padding: '24px 8px' }}>
      <p style={{ fontSize: 16, fontWeight: 700, color: INK, marginBottom: 4 }}>
        이 날은 보관된 기사가 없어요
      </p>
      <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6 }}>
        다른 날짜를 골라보세요. 1990년부터 오늘까지 찾을 수 있어요.
      </p>
    </div>
  );
}

function ExpandToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="ntm-focus"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        minHeight: 44,
        marginTop: 4,
        background: 'none',
        border: 'none',
        borderTop: `1px solid ${LINE}`,
        fontSize: 14,
        fontWeight: 700,
        color: MUTED,
        cursor: 'pointer',
      }}
    >
      {expanded ? '접기' : '더보기'}
    </button>
  );
}
