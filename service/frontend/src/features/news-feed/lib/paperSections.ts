// 지면 특별 코너(홈·지난 지면의 4탭) 순수 로직 — 컴포넌트에서 분리해 단위 테스트 가능하게 했다.
// 지면별 기사는 lens.paper_section 필드("전체"/"증권"/"산업"/"시그널")로 고른다. category(증시/산업 등 일반
// 카테고리 페이지용)와는 별개이며, paper_section을 명시적으로 찍은 글만 이 코너에 뜬다. 구조 변천사는
// docs/worklog/2026-10/2026-10-05-리팩토링/LensPreviewSection_구조변천사.md 참조.
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';

export interface SectionSlot {
  key: string;
  label: string;
  paperSection: string; // lens.paper_section과 매칭 — SECTIONS[0]은 "전체"
}

// 탭 라벨 자체에 "1면"까지 표기(2026-08-21, 사용자 확인 — 처음엔 탭은
// 짧게 두고 "1면"을 배지 쪽으로 뺐었는데, 스크린샷으로 "지면 1면/증권
// 1면/산업 1면/시그널 1면 이라고 표기해주시죠"라고 재요청해 탭 라벨을
// 그대로 "OO 1면"으로 확정. 배지·빈 상태 문구는 label을 그대로 쓰므로
// 별도로 "1면"을 덧붙이지 않는다(중복 방지, 아래 참조).
export const SECTIONS: SectionSlot[] = [
  { key: 'all', label: '지면 1면', paperSection: '전체' },
  { key: 'markets', label: '증권 1면', paperSection: '증권' },
  { key: 'industry', label: '산업 1면', paperSection: '산업' },
  { key: 'signal', label: '시그널 1면', paperSection: '시그널' },
];

/** "10월 3일 금요일 지면" — 날짜가 없으면 그냥 "오늘의 지면". 요일은 UTC 정오 기준으로 계산해 시간대에 흔들리지 않는다. */
/** 탭(지면) 하나의 기사 최대 4건 — 날짜 최신 우선, 같은 날은 display_order 오름차순. */
export function pickSection(source: CmsLens[], tabIdx: number): CmsLens[] {
  const section = SECTIONS[tabIdx].paperSection;
  return source
    .filter((l) => l.paper_section === section)
    .slice()
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      const oa = a.display_order;
      const ob = b.display_order;
      if (oa != null && ob != null) return oa - ob;
      if (oa != null) return -1;
      if (ob != null) return 1;
      return 0;
    })
    .slice(0, 4);
}

export function paperTitle(iso?: string): string {
  if (!iso) return '오늘의 지면';
  const [y, m, d] = iso.split('-').map(Number);
  const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
  return `${m}월 ${d}일 ${wd}요일 지면`;
}

