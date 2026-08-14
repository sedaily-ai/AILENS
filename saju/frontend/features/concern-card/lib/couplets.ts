import type { Oh } from './ohVisual';

export interface ConcernCategory {
  id: string;
  ko: string;
  en: string;
}

export const CATEGORIES: ConcernCategory[] = [
  { id: 'career', ko: '진로', en: 'Career' },
  { id: 'relationship', ko: '관계', en: 'Relationships' },
  { id: 'money', ko: '돈', en: 'Money' },
  { id: 'mind', ko: '마음', en: 'Mind' },
];

interface Couplet { ko: [string, string]; en: [string, string]; }

/** 카테고리 × 오행 — 자연 은유 2행시 */
export const COUPLETS: Record<string, Record<Oh, Couplet>> = {
  career: {
    목: { ko: ['가지 끝은 계속 자란다', '굽어도 자라기는 한다'], en: ['The branch tip keeps growing', 'even bent, it still grows'] },
    화: { ko: ['불꽃은 방향 바뀌어도 탄다', '타오름은 멈추지 않는다'], en: ['The flame burns however it turns', 'the burning never stops'] },
    토: { ko: ['깊은 뿌리는 안 흔들린다', '옮겨도 뿌리는 남는다'], en: ['Deep roots do not shake', 'move them, and roots remain'] },
    금: { ko: ['벼려야 날이 선다', '가지치기할 때를 안다'], en: ['It must be honed to have an edge', 'and knows when to prune'] },
    수: { ko: ['물은 막혀도 길을 찾는다', '낮은 곳으로 돌아 흐른다'], en: ['Water blocked still finds a way', 'circling down to flow on'] },
  },
  relationship: {
    목: { ko: ['나무는 옆 나무와 가지를 나눈다', '햇빛은 나눠도 줄지 않는다'], en: ['Trees share branches with each other', 'sunlight shared does not run out'] },
    화: { ko: ['한 불씨가 다른 불씨에 옮겨붙는다', '더 밝아질 뿐 꺼지지 않는다'], en: ['One spark catches another', 'it only grows brighter, not out'] },
    토: { ko: ['땅은 씨앗을 가리지 않는다', '누구든 뿌리내리게 한다'], en: ['Earth does not choose its seeds', 'it lets anyone take root'] },
    금: { ko: ['맞부딪혀야 소리가 난다', '날카로움도 관계의 일부다'], en: ['Only clashing makes a sound', 'sharpness too is part of it'] },
    수: { ko: ['물줄기는 서로 만나 강이 된다', '혼자보다 멀리 간다'], en: ['Streams meet and become a river', 'going farther than alone'] },
  },
  money: {
    목: { ko: ['천천히 자란 나무가 오래 간다', '서두른 가지는 먼저 꺾인다'], en: ['A slow-grown tree lasts long', 'a rushed branch snaps first'] },
    화: { ko: ['불은 장작이 있어야 오래 탄다', '태울 것부터 마련해야 한다'], en: ['Fire needs fuel to last', 'first, gather what to burn'] },
    토: { ko: ['곳간은 채우는 만큼 든든하다', '조급함은 흙을 상하게 한다'], en: ['The store is as sound as it is filled', 'haste only spoils the soil'] },
    금: { ko: ['금은 갈고 닦아야 빛난다', '숨겨둔 것은 녹슬 뿐이다'], en: ['Gold shines only when polished', 'hidden away, it just rusts'] },
    수: { ko: ['물은 고이면 썩고 흐르면 맑다', '흐르게 두는 것도 관리다'], en: ['Still water rots, flowing stays clear', 'letting it flow is also care'] },
  },
  mind: {
    목: { ko: ['겨울에도 뿌리는 자란다', '보이지 않아도 멈추지 않았다'], en: ['Even in winter, roots grow', 'unseen, but never stopped'] },
    화: { ko: ['작은 불씨도 어둠을 밝힌다', '크기보다 꺼지지 않는 게 먼저다'], en: ['A small spark still lights the dark', 'staying lit matters more than size'] },
    토: { ko: ['땅은 흔들려도 제자리다', '무너진 게 아니라 다지는 중이다'], en: ['The ground shakes but stays in place', 'not collapsing — just settling'] },
    금: { ko: ['날카로움도 식으면 무뎌진다', '잠시 내려놓아도 된다'], en: ['Even sharpness dulls when it cools', "it's fine to set it down a while"] },
    수: { ko: ['물은 그릇 따라 모양이 바뀐다', '흔들려도 본질은 물이다'], en: ['Water takes the shape of its vessel', 'shaken, it is still water'] },
  },
};
