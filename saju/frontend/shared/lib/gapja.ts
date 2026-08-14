/**
 * 60갑자(六十甲子) 데이터 — 천간 10 × 지지 12 조합의 표준 60주기.
 * features/characters, features/ideal-match 양쪽에서 참조하는 공용 데이터라 shared/ 에 둔다.
 */

export type Oh = '목' | '화' | '토' | '금' | '수';

export interface StemInfo { hanja: string; ko: string; oh: Oh; keyword: string; }
export interface BranchInfo { hanja: string; ko: string; zodiacKo: string; emoji: string; mood: string; }
export interface GapjaCharacter {
  id: string;
  index: number;
  stem: StemInfo;
  branch: BranchInfo;
}

export const STEMS: StemInfo[] = [
  { hanja: '甲', ko: '갑', oh: '목', keyword: '곧은 성장형' },
  { hanja: '乙', ko: '을', oh: '목', keyword: '유연한 풀꽃형' },
  { hanja: '丙', ko: '병', oh: '화', keyword: '환한 태양형' },
  { hanja: '丁', ko: '정', oh: '화', keyword: '따뜻한 촛불형' },
  { hanja: '戊', ko: '무', oh: '토', keyword: '든든한 태산형' },
  { hanja: '己', ko: '기', oh: '토', keyword: '포근한 대지형' },
  { hanja: '庚', ko: '경', oh: '금', keyword: '단단한 강철형' },
  { hanja: '辛', ko: '신', oh: '금', keyword: '세련된 보석형' },
  { hanja: '壬', ko: '임', oh: '수', keyword: '넓은 바다형' },
  { hanja: '癸', ko: '계', oh: '수', keyword: '섬세한 이슬형' },
];

export const BRANCHES: BranchInfo[] = [
  { hanja: '子', ko: '자', zodiacKo: '쥐띠', emoji: '🐀', mood: '영민하고 감각이 빠른 밤형 인간' },
  { hanja: '丑', ko: '축', zodiacKo: '소띠', emoji: '🐂', mood: '묵묵하고 성실한 실속파' },
  { hanja: '寅', ko: '인', zodiacKo: '호랑이띠', emoji: '🐅', mood: '당당하고 리드하는 타입' },
  { hanja: '卯', ko: '묘', zodiacKo: '토끼띠', emoji: '🐇', mood: '부드럽고 감성적인 분위기' },
  { hanja: '辰', ko: '진', zodiacKo: '용띠', emoji: '🐉', mood: '스케일 크고 카리스마 있음' },
  { hanja: '巳', ko: '사', zodiacKo: '뱀띠', emoji: '🐍', mood: '차분하면서도 매력적인 타입' },
  { hanja: '午', ko: '오', zodiacKo: '말띠', emoji: '🐎', mood: '밝고 활동적이며 표현이 시원함' },
  { hanja: '未', ko: '미', zodiacKo: '양띠', emoji: '🐐', mood: '온화하고 예술 감성이 있음' },
  { hanja: '申', ko: '신', zodiacKo: '원숭이띠', emoji: '🐒', mood: '재치 있고 순발력 좋음' },
  { hanja: '酉', ko: '유', zodiacKo: '닭띠', emoji: '🐓', mood: '깔끔하고 자기관리 확실' },
  { hanja: '戌', ko: '술', zodiacKo: '개띠', emoji: '🐕', mood: '의리 있고 한결같은 타입' },
  { hanja: '亥', ko: '해', zodiacKo: '돼지띠', emoji: '🐖', mood: '여유 있고 사람 좋아하는 타입' },
];

export const OH_TONE: Record<Oh, { bg: string; fg: string }> = {
  목: { bg: '#ECFDF5', fg: '#059669' },
  화: { bg: '#FEF2F2', fg: '#DC2626' },
  토: { bg: '#FFFBEB', fg: '#A16207' },
  금: { bg: '#F5F5F5', fg: '#525252' },
  수: { bg: '#EFF6FF', fg: '#1D4ED8' },
};

/** 60갑자 표준 순서 — 천간·지지를 각각 1씩 증가시키며 60주기(LCM(10,12)) 순환 */
export function buildGapjaList(): GapjaCharacter[] {
  const list: GapjaCharacter[] = [];
  for (let i = 0; i < 60; i++) {
    const stem = STEMS[i % 10];
    const branch = BRANCHES[i % 12];
    list.push({ id: `${stem.hanja}${branch.hanja}`, index: i, stem, branch });
  }
  return list;
}

/**
 * 오행 + 띠(zodiacKo) 로 실존하는 60갑자 캐릭터 1개를 찾는다.
 * 지지 위치의 음양에 맞는 천간(같은 오행 내 2개 중 하나)을 골라 항상 유효한 조합을 반환.
 */
export function findGapjaByOhAndZodiac(oh: Oh, zodiacKo: string): GapjaCharacter | null {
  const branch = BRANCHES.find(b => b.zodiacKo === zodiacKo);
  if (!branch) return null;
  const branchIdx = BRANCHES.indexOf(branch);
  const stemCandidates = STEMS.filter(s => s.oh === oh);
  if (stemCandidates.length === 0) return null;
  const stem = stemCandidates.find(s => STEMS.indexOf(s) % 2 === branchIdx % 2) ?? stemCandidates[0];
  return buildGapjaList().find(g => g.stem.hanja === stem.hanja && g.branch.hanja === branch.hanja) ?? null;
}
