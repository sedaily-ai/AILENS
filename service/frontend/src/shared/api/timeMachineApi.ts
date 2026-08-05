import { API_URL } from "@/shared/config/api";
import type { DayNews, HistoricalEvent, TimeMachineData } from "@/shared/types/timeMachine";

// ─── Fallback dummy data (API 연동 전까지 사용) ───────────────────────────────

const DUMMY_NEWS: DayNews[] = [
  { title: "코스피, 외국인 매수세에 2,650선 회복", category: "경제" },
  { title: "정부, 부동산 규제 완화 추가 방안 발표", category: "경제" },
  { title: "AI 반도체 수출 규제 강화 논의", category: "IT" },
  { title: "국내 소비자물가 전월 대비 0.2% 상승", category: "경제" },
  { title: "서울시, 한강변 개발 계획 공개", category: "사회" },
];

const STATIC_HISTORICAL_EVENTS: Record<string, HistoricalEvent[]> = {
  "01-01": [
    { year: 1990, title: "독일 통일 협상 본격화", description: "동서독 통일을 위한 본격적인 협상이 시작됐다.", category: "국제", image: "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=400&q=80" },
    { year: 1995, title: "WTO 공식 출범", description: "세계무역기구(WTO)가 GATT를 대체하며 공식 출범했다.", category: "경제", image: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=400&q=80" },
    { year: 2000, title: "Y2K 버그 무사 통과", description: "전 세계가 우려했던 밀레니엄 버그가 별다른 피해 없이 지나갔다.", category: "IT", image: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=400&q=80" },
  ],
  "03-01": [
    { year: 1919, title: "3.1 독립운동", description: "전국 각지에서 독립만세운동이 일어났다.", category: "역사", image: "https://images.unsplash.com/photo-1569163139599-0f4517e36f51?w=400&q=80" },
    { year: 2010, title: "천안함 침몰 한 달 전", description: "서해 백령도 인근에서 해군 초계함 천안함이 침몰하기 한 달 전이었다.", category: "사회", image: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&q=80" },
  ],
  "06-25": [
    { year: 1950, title: "6.25 전쟁 발발", description: "북한군이 38선을 넘어 기습 남침하며 한국전쟁이 시작됐다.", category: "역사", image: "https://images.unsplash.com/photo-1569163139599-0f4517e36f51?w=400&q=80" },
    { year: 2009, title: "마이클 잭슨 사망", description: "팝의 황제 마이클 잭슨이 심정지로 사망했다.", category: "문화", image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80" },
  ],
  "08-15": [
    { year: 1945, title: "광복절", description: "일제강점기 35년 만에 대한민국이 광복을 맞이했다.", category: "역사", image: "https://images.unsplash.com/photo-1569163139599-0f4517e36f51?w=400&q=80" },
    { year: 1995, title: "윈도우 95 출시", description: "마이크로소프트가 윈도우 95를 출시하며 PC 시대의 새 장을 열었다.", category: "IT", image: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=400&q=80" },
  ],
};

function getFallbackHistoricalEvents(dateStr: string): HistoricalEvent[] {
  const d = new Date(dateStr);
  const key = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (STATIC_HISTORICAL_EVENTS[key]) return STATIC_HISTORICAL_EVENTS[key];
  return [
    { year: d.getFullYear() - 30, title: "경제 성장률 발표", description: `${d.getFullYear() - 30}년 같은 날, 정부가 연간 경제성장률 전망치를 발표했다.`, category: "경제", image: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=400&q=80" },
    { year: d.getFullYear() - 20, title: "주요 기업 실적 발표", description: `${d.getFullYear() - 20}년 같은 날, 국내 주요 대기업들이 분기 실적을 발표했다.`, category: "경제", image: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&q=80" },
    { year: d.getFullYear() - 15, title: "IT 신기술 발표", description: `${d.getFullYear() - 15}년 같은 날, 국내외 IT 기업들이 신기술 로드맵을 공개했다.`, category: "IT", image: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=400&q=80" },
    { year: d.getFullYear() - 5, title: "사회 이슈 부각", description: `${d.getFullYear() - 5}년 같은 날, 주요 사회 이슈가 여론의 주목을 받았다.`, category: "사회", image: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=400&q=80" },
  ];
}

// ─── API 호출 ─────────────────────────────────────────────────────────────────
// TODO: 백엔드 배포 후 API_READY = true 로 변경
// API 스펙: GET /time-machine?date=YYYY-MM-DD
// Response: { news: [{ title, category, url? }], cached: bool, date: string }

const API_READY = true;

export async function fetchTimeMachineData(date: string): Promise<TimeMachineData> {
  if (!API_READY) {
    return {
      news: DUMMY_NEWS,
      historicalEvents: getFallbackHistoricalEvents(date),
    };
  }
  try {
    const res = await fetch(`${API_URL}/time-machine?date=${date}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    // API에서 받은 events를 historicalEvents로 변환
    const historicalEvents: HistoricalEvent[] = (data.events ?? []).map((ev: any) => ({
      year: ev.year,
      title: ev.title,
      description: ev.description ?? "",
      category: "역사",
      images: ev.images ?? [],
    }));
    
    return {
      news: data.news ?? [],
      historicalEvents: historicalEvents.length > 0 ? historicalEvents : getFallbackHistoricalEvents(date),
    };
  } catch {
    return {
      news: DUMMY_NEWS,
      historicalEvents: getFallbackHistoricalEvents(date),
    };
  }
}
