/**
 * 사주 해석 엔진 — 데이터 + 순수 계산 로직
 * DOM 의존 없음
 */
import { calculateSaju, getGapja, getSolarTermsByYear } from '@fullstackfamily/manseryeok';

// ── 매핑 데이터 ──
export const CG_OH: Record<string, string> = {'甲':'목','乙':'목','丙':'화','丁':'화','戊':'토','己':'토','庚':'금','辛':'금','壬':'수','癸':'수'};
export const JJ_OH: Record<string, string> = {'子':'수','丑':'토','寅':'목','卯':'목','辰':'토','巳':'화','午':'화','未':'토','申':'금','酉':'금','戌':'토','亥':'수'};
const H2C: Record<string, string> = {'갑':'甲','을':'乙','병':'丙','정':'丁','무':'戊','기':'己','경':'庚','신':'辛','임':'壬','계':'癸'};
const H2J: Record<string, string> = {'자':'子','축':'丑','인':'寅','묘':'卯','진':'辰','사':'巳','오':'午','미':'未','신':'申','유':'酉','술':'戌','해':'亥'};
export const OH_HJ: Record<string, string> = {'목':'木','화':'火','토':'土','금':'金','수':'水'};
const OI: Record<string, number> = {'목':0,'화':1,'토':2,'금':3,'수':4};
export const JJG: Record<string, string[]> = {
  '子':['癸'],'丑':['癸','辛','己'],'寅':['戊','丙','甲'],'卯':['乙'],
  '辰':['乙','癸','戊'],'巳':['戊','庚','丙'],'午':['丙','己','丁'],'未':['丁','乙','己'],
  '申':['戊','壬','庚'],'酉':['辛'],'戌':['辛','丁','戊'],'亥':['戊','甲','壬'],
};
const UN = ['장생','목욕','관대','건록','제왕','쇠','병','사','묘','절','태','양'];
// 12운성 포태법: 각 천간의 장생(長生) 위치 (지지 인덱스 기준)
// 양간(甲丙戊庚壬)은 순행, 음간(乙丁己辛癸)은 역행
// 戊·己는 火土同宮論에 따라 丙·丁과 동일 적용
const US: Record<string, number> = {
  '甲': 11, // 亥
  '乙': 6,  // 午
  '丙': 2,  // 寅
  '丁': 9,  // 酉
  '戊': 2,  // 寅 (火土同宮)
  '己': 9,  // 酉 (火土同宮)
  '庚': 5,  // 巳
  '辛': 0,  // 子
  '壬': 8,  // 申
  '癸': 3,  // 卯
};
const JO = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const JI: Record<string, number> = {}; JO.forEach((j,i)=>JI[j]=i);

// 60갑자
const CG10 = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const JJ12 = JO;
const CG10K = ['갑','을','병','정','무','기','경','신','임','계'];
const JJ12K = ['자','축','인','묘','진','사','오','미','신','유','술','해'];

export interface GapjaEntry { c: string; j: string; ck: string; jk: string; }
const G60: GapjaEntry[] = [];
for (let i=0;i<60;i++) G60.push({ c:CG10[i%10], j:JJ12[i%12], ck:CG10K[i%10], jk:JJ12K[i%12] });
function g60idx(c: string, j: string) { return G60.findIndex(g=>g.c===c&&g.j===j); }

// ── 기본 계산 함수 ──
export { calculateSaju, getGapja };

export function elClass(oh: string) { return oh ? `el-${oh}` : ''; }

export function unsung(c: string, j: string): string {
  if(!c||!j) return '';
  const s=US[c]; if(s===undefined) return '';
  const y=['甲','丙','戊','庚','壬'].includes(c);
  const o = y ? (JI[j]-s+12)%12 : (s-JI[j]+12)%12;
  return UN[o];
}

const SSN=[['비견','겁재'],['식신','상관'],['편재','정재'],['편관','정관'],['편인','정인']];
export function sipsung(i: string, t: string): string {
  if(!i||!t) return '';
  const m=OI[CG_OH[i]], x=OI[CG_OH[t]||JJ_OH[t]];
  if(m===undefined||x===undefined) return '';  
  const d=(x-m+5)%5;
  const mY=['乙','丁','己','辛','癸'].includes(i);
  const tY=['乙','丁','己','辛','癸','丑','卯','巳','未','酉','亥'].includes(t);
  return SSN[d][mY===tY?0:1];
}

// 십성 한 줄 풀이
export const SS_MEANING: Record<string, string> = {
  '비견': '동료·경쟁자 기운',
  '겁재': '경쟁·지출 기운',
  '식신': '표현·여유 기운',
  '상관': '재능·비판 기운',
  '편재': '활동적 재물 기운',
  '정재': '성실한 재물 기운',
  '편관': '압박·도전 기운',
  '정관': '명예·규율 기운',
  '편인': '직관·영감 기운',
  '정인': '학문·지혜 기운',
};

// 12운성 한 줄 풀이
export const US_MEANING: Record<string, string> = {
  '장생': '새로운 시작',
  '목욕': '불안정한 변화',
  '관대': '자신감·성장',
  '건록': '전성기 시작',
  '제왕': '에너지의 정점',
  '쇠': '기운이 쇠약해짐',
  '병': '쇠약한 상태',
  '사': '정체와 막힘',
  '묘': '내면의 회고',
  '절': '단절과 전환',
  '태': '잉태와 준비',
  '양': '조용한 성장',
};

export const SS_DETAIL: Record<string, string> = {
  '비견': '나와 같은 기운이 작용합니다. 동료, 형제와의 관계가 부각되고 자립심이 강해집니다. 경쟁 속에서 성장하되 독선을 경계하세요.',
  '겁재': '경쟁과 도전의 기운입니다. 재물 지출에 주의하고 승부욕을 긍정적으로 활용하세요. 공동 사업보다 단독 판단이 유리합니다.',
  '식신': '여유와 창의력의 시기입니다. 먹을 복이 있고 취미가 잘 풀리며 표현력이 좋아집니다. 안정적인 수입과 건강이 따릅니다.',
  '상관': '표현욕과 재능이 폭발하는 시기입니다. 예술, 글쓰기에 좋으나 날카로운 말로 갈등이 생길 수 있으니 언행에 주의하세요.',
  '편재': '활동적 재물운과 사교의 시기입니다. 사업 기회가 오고 인맥이 넓어지지만 과욕을 부리면 손실이 생깁니다.',
  '정재': '안정적인 재물 축적의 시기입니다. 성실한 노력이 결실을 맺고, 가정 경제가 안정됩니다. 저축과 재테크에 유리합니다.',
  '편관': '변화와 도전의 시기입니다. 갑작스러운 업무나 책임이 주어지지만, 잘 넘기면 큰 성장으로 이어집니다. 건강 관리 필요.',
  '정관': '질서와 인정의 시기입니다. 사회적 지위가 올라가고 공식적인 성과가 나타납니다. 규칙을 지키면 좋은 결과가 옵니다.',
  '편인': '직관과 영감의 시기입니다. 학문이나 연구에 몰입하기 좋고 새로운 시각이 열립니다. 다만 고독감이나 건강 이상에 주의.',
  '정인': '학습과 성장의 시기입니다. 자격증, 학위 등 배움의 결실이 맺어지고 윗사람의 도움이 있습니다. 내적 성숙의 시간.',
};

export const US_DETAIL: Record<string, string> = {
  '장생': '새로운 출발의 에너지입니다. 시작한 일이 순조롭게 성장하며 희망적인 기운이 감돕니다.',
  '목욕': '변화와 불안정의 시기입니다. 감정 기복이 심하고 유혹이 많으니 신중하게 행동하세요.',
  '관대': '자신감과 사회 활동이 최고조입니다. 적극적으로 나서면 인정받고 기회를 잡을 수 있습니다.',
  '건록': '실력이 완전히 발휘되는 시기입니다. 독립적으로 일을 추진하면 큰 성과를 거둡니다.',
  '제왕': '모든 기운이 정점에 달합니다. 리더십을 발휘하기 좋으나 정점 이후 하락에 대비하세요.',
  '쇠': '기운이 서서히 빠지는 시기입니다. 새로운 일보다 기존 일을 정리하고 체력을 관리하세요.',
  '병': '쇠약함의 시기입니다. 건강 관리에 집중하고 무리한 계획은 피하세요. 휴식이 최선입니다.',
  '사': '정체와 막힘의 시기입니다. 억지로 밀어붙이면 손해가 커지니 때를 기다리세요.',
  '묘': '내면을 돌아보는 시기입니다. 과거를 정리하고 다음을 준비하는 잠복기로 활용하세요.',
  '절': '단절과 전환의 시기입니다. 낡은 것을 과감히 버리고 새 방향을 모색하세요.',
  '태': '새로운 가능성이 잉태되는 시기입니다. 눈에 보이지 않지만 씨앗이 뿌려지고 있습니다.',
  '양': '성장을 준비하는 시기입니다. 조용하지만 확실한 발전이 이루어지고 있습니다.',
};

export interface Pillar { c: string; j: string; ck: string; jk: string; co: string; jo: string; }

export function parsePillar(hg: string, hj: string): Pillar {
  let c='',j='',ck='',jk='';
  if(hj?.length===2){c=hj[0];j=hj[1];}
  if(hg?.length===2){ck=hg[0];jk=hg[1];if(!c)c=H2C[ck]||'';if(!j)j=H2J[jk]||'';}
  return {c,j,ck,jk,co:CG_OH[c]||'',jo:JJ_OH[j]||''};
}

// ── JSON DB import ──
import cheonganDB from './cheongan_db.json';
import jijiDB from './jiji_db.json';

// ── 총운 (JSON DB 기반) ──
const CHEONGAN = cheonganDB.CHEONGAN as Record<string, { 한글: string; 음양: string; 오행: string; 상징: string; 성향: string; 키워드: string[] }>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ILGAN_DETAIL = cheonganDB.ILGAN_DETAIL as Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const JIJI = jijiDB.JIJI as Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ILJI_DETAIL = jijiDB.ILJI_DETAIL as Record<string, any>;

const WOLJI_SEASON: Record<string, { 계절: string; 기운: string }> = {};
const WOLJI_MAP: Record<string, { branch: string; season: string }> = {
  '寅': { branch: '寅', season: '봄(초춘)' }, '卯': { branch: '卯', season: '봄(중춘)' }, '辰': { branch: '辰', season: '봄(늦봄)' },
  '巳': { branch: '巳', season: '여름(초하)' }, '午': { branch: '午', season: '여름(한여름)' }, '未': { branch: '未', season: '여름(늦여름)' },
  '申': { branch: '申', season: '가을(초추)' }, '酉': { branch: '酉', season: '가을(한가을)' }, '戌': { branch: '戌', season: '가을(늦가을)' },
  '亥': { branch: '亥', season: '겨울(초동)' }, '子': { branch: '子', season: '겨울(한겨울)' }, '丑': { branch: '丑', season: '겨울(늦겨울)' },
};
for (const [key, val] of Object.entries(WOLJI_MAP)) {
  const jiji = JIJI[val.branch];
  WOLJI_SEASON[key] = { 계절: val.season, 기운: jiji ? `${jiji.상징}의 시기입니다. ${jiji.성향.split('.')[0]}.` : '' };
}

function getSeasonRelation(ilganOh: string, woljiOh: string): string {
  if (ilganOh === woljiOh) return '비화(比和) 관계로, 자기 계절을 만나 기운이 왕성합니다. 본래 기질이 강하게 발현되며 자신감이 넘칩니다.';
  const diff = (OI[woljiOh] - OI[ilganOh] + 5) % 5;
  if (diff === 1) return '식상(食傷)의 계절로, 자기 표현과 재능 발휘에 유리합니다. 창의력이 발현되고 활동적인 시기입니다.';
  if (diff === 2) return '재성(財星)의 계절로, 재물과 현실적 성과를 거두기 좋습니다. 부지런히 움직이면 결실을 얻습니다.';
  if (diff === 3) return '관성(官星)의 계절로, 규율과 책임이 따르는 시기입니다. 사회적 인정을 받을 수 있으나 압박감도 있습니다.';
  if (diff === 4) return '인성(印星)의 계절로, 학습과 성장에 유리합니다. 귀인의 도움을 받기 쉽고 내적 성숙이 이루어집니다.';
  return '';
}

function getIljuReading(cgH: string, jjH: string): string {
  if (!cgH || !jjH) return '';
  const cgOh = CG_OH[cgH]; const jjOh = JJ_OH[jjH];
  const HJ2HG_CG: Record<string, string> = {'甲':'갑','乙':'을','丙':'병','丁':'정','戊':'무','己':'기','庚':'경','辛':'신','壬':'임','癸':'계'};
  const HJ2HG_JJ: Record<string, string> = {'子':'자','丑':'축','寅':'인','卯':'묘','辰':'진','巳':'사','午':'오','未':'미','申':'신','酉':'유','戌':'술','亥':'해'};
  const diff = (OI[jjOh] - OI[cgOh] + 5) % 5;
  const descs: Record<string, string> = {
    '비겁':'일지에 자신과 같은 기운이 있어 독립심과 자주성이 강합니다. 배우자궁에 비겁이 있으니 동반자와 대등한 관계를 추구하며, 혼자서도 잘 해나가는 자립심이 있습니다.',
    '식상':'일지에 식상이 있어 표현력과 재능이 풍부합니다. 배우자궁에 식상이 있으니 자유로운 관계를 원하며, 창작이나 말로 하는 일에 재능을 보입니다.',
    '재성':'일지에 재성이 있어 현실 감각과 관리 능력이 뛰어납니다. 배우자궁에 재성이 있으니 가정적이고 실속을 중시하며, 재물을 다루는 감각이 좋습니다.',
    '관성':'일지에 관성이 있어 책임감과 자기 통제력이 강합니다. 배우자궁에 관성이 있으니 격식을 중시하고 사회적 체면을 신경 쓰며, 절제력이 있습니다.',
    '인성':'일지에 인성이 있어 학습 능력과 내적 안정감이 있습니다. 배우자궁에 인성이 있으니 배우자나 가까운 사람에게서 정서적 지지를 받으며, 사색적이고 깊이가 있습니다.',
  };
  const rel = ['비겁','식상','재성','관성','인성'][diff];
  let r = `${HJ2HG_CG[cgH]}${cgH}일간이 ${HJ2HG_JJ[jjH]}${jjH} 위에 앉아있는 일주입니다. `;
  return r + (descs[rel]||'');
}

export interface ChongunResult {
  symbol: string; yinyang: string; element: string; nature: string; keywords: string[];
  detail?: { summary: string; behavior: string; social: string; strengths: string[]; weaknesses: string[]; improvement: string; jobs: { field: string; role: string; reason: string }[]; conclusion: string };
  season?: { name: string; desc: string }; seasonRelation?: string; iljuReading?: string;
  iljiDetail?: { summary: string; strengths: string[]; weaknesses: string[]; conclusion: string };
}

export function buildChongun(ps: Pillar[]): ChongunResult | null {
  const ilgan = ps[1].c; const ilji = ps[1].j; const wolji = ps[2].j;
  if (!ilgan) return null;
  const cg = CHEONGAN[ilgan]; if (!cg) return null;
  const ilganOh = CG_OH[ilgan]; const woljiOh = wolji ? JJ_OH[wolji] : null;
  const season = wolji ? WOLJI_SEASON[wolji] : null;

  const result: ChongunResult = {
    symbol: cg.상징, yinyang: cg.음양, element: cg.오행, nature: cg.성향, keywords: cg.키워드,
  };

  // ILGAN_DETAIL 상세 해석
  const detail = ILGAN_DETAIL[ilgan];
  if (detail) {
    result.detail = {
      summary: detail.특성_총평, behavior: detail.표현_행동양식, social: detail.교류방식,
      strengths: detail.강점, weaknesses: detail.약점, improvement: detail.개선방안,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jobs: detail.추천직업.map((j: any) => ({ field: j.분야, role: j.역할, reason: j.이유 })),
      conclusion: typeof detail.종합요약 === 'string' ? detail.종합요약 : `${detail.종합요약?.강점_살리기 || ''} ${detail.종합요약?.약점_보완하기 || ''}`.trim(),
    };
  }

  if (season) {
    result.season = { name: season.계절, desc: season.기운 };
    if (woljiOh) result.seasonRelation = getSeasonRelation(ilganOh, woljiOh);
  }
  if (ilji) {
    result.iljuReading = getIljuReading(ilgan, ilji);
    // ILJI_DETAIL 상세 해석
    const ijd = ILJI_DETAIL[ilji];
    if (ijd) {
      const ijdConclusion = typeof ijd.종합요약 === 'string' ? ijd.종합요약 : `${ijd.종합요약?.강점_살리기 || ''} ${ijd.종합요약?.약점_보완하기 || ''}`.trim();
      result.iljiDetail = { summary: ijd.특성_총평, strengths: ijd.강점, weaknesses: ijd.약점, conclusion: ijdConclusion };
    }
  }
  return result;
}

// ── 오늘의 운세 (신살) ──
// ── 신살·일진 해석·카테고리 운세 데이터 (engine-data/ 서브디렉터리) ──
import {
  CHEONUL, MUNCHANG, YEOKMA, DOHWA, HWAGAE, GEOBSAL, JAESAL, SINSAL_DESC,
} from './engine-data/sinsalMap';
import type { SinsalInfo } from './engine-data/sinsalMap';
import { SS_READING, US_READING } from './engine-data/dailyReadings';
import { CATEGORY_DATA } from './engine-data/categoryFortunes';
import type { CategoryFortune } from './engine-data/categoryFortunes';

// 기존 외부 소비자 호환 — 신살 매핑과 타입은 engine.ts 경유로도 계속 import 가능
export { CHEONUL, MUNCHANG, YEOKMA, DOHWA, HWAGAE, GEOBSAL, JAESAL };
export type { SinsalInfo, CategoryFortune };

// 12운성에 의한 점수 보정
export const US_SCORE_MOD: Record<string, number> = {
  '장생': 5, '목욕': -5, '관대': 10, '건록': 15, '제왕': 10,
  '쇠': -5, '병': -10, '사': -15, '묘': -10, '절': -5, '태': 0, '양': 5,
};

function buildCategoryFortunes(ss: string, us: string, sinsal: SinsalInfo[]): CategoryFortune[] {
  const labels = ['재물운', '건강운', '연애운', '직장운', '학업운'];
  const usMod = US_SCORE_MOD[us] || 0;

  // 신살 보정
  const sinsalNames = sinsal.map(s => s.name);
  const sinsalMods: Record<string, Record<string, number>> = {
    '천을귀인': { '직장운': 10, '학업운': 5, '재물운': 5 },
    '문창귀인': { '학업운': 15, '직장운': 5 },
    '역마살': { '직장운': 5, '재물운': 5 },
    '도화살': { '연애운': 15 },
    '화개살': { '학업운': 10 },
    '겁살': { '재물운': -10, '건강운': -5 },
    '재살': { '건강운': -10, '재물운': -5 },
  };

  return labels.map(label => {
    const base = CATEGORY_DATA[label]?.[ss] || { score: 50, desc: '' };
    let score = base.score + usMod;

    // 신살 보정 적용
    for (const sn of sinsalNames) {
      const mods = sinsalMods[sn];
      if (mods?.[label]) score += mods[label];
    }

    score = Math.max(10, Math.min(95, score));
    return { label, score, desc: base.desc };
  });
}

export interface HiddenSipsung { hanja: string; ss: string; weight: '본기' | '중기' | '여기'; }

export interface TodayFortuneResult {
  dayPillar: string; dayPillarHanja: string; dayOh: string;
  ss: string;                  // 일진 천간의 십성
  us: string;                  // 일진 지지의 12운성
  ssReading: string; usReading: string;
  hiddenSipsung: HiddenSipsung[];  // 일진 지지의 지장간별 십성
  sinsal: SinsalInfo[];
  categories: CategoryFortune[];
}

export function buildTodayFortune(ps: Pillar[]): TodayFortuneResult | null {
  const ilgan = ps[1].c; const ilji = ps[1].j;
  if (!ilgan) return null;
  const now = new Date();
  const tg = getGapja(now.getFullYear(), now.getMonth()+1, now.getDate());
  const tCg = tg.dayPillarHanja[0]; const tJj = tg.dayPillarHanja[1];
  const tSS = sipsung(ilgan, tCg); const tUS = unsung(ilgan, tJj);
  const tOh = CG_OH[tCg];

  // 일진 지지의 지장간별 십성 (여기·중기·본기)
  const hidden = JJG[tJj] || [];
  const weightLabels: ('여기' | '중기' | '본기')[] =
    hidden.length === 1 ? ['본기']
    : hidden.length === 2 ? ['여기', '본기']
    : ['여기', '중기', '본기'];
  const hiddenSipsung: HiddenSipsung[] = hidden.map((h, i) => ({
    hanja: h,
    ss: sipsung(ilgan, h),
    weight: weightLabels[i],
  }));

  const sinsal: SinsalInfo[] = [];
  if (CHEONUL[ilgan]?.includes(tJj)) sinsal.push({ name: '천을귀인', ...SINSAL_DESC['천을귀인'] });
  if (MUNCHANG[ilgan]===tJj) sinsal.push({ name: '문창귀인', ...SINSAL_DESC['문창귀인'] });
  if (ilji && YEOKMA[ilji]===tJj) sinsal.push({ name: '역마살', ...SINSAL_DESC['역마살'] });
  if (ilji && DOHWA[ilji]===tJj) sinsal.push({ name: '도화살', ...SINSAL_DESC['도화살'] });
  if (ilji && HWAGAE[ilji]===tJj) sinsal.push({ name: '화개살', ...SINSAL_DESC['화개살'] });
  if (ilji && GEOBSAL[ilji]===tJj) sinsal.push({ name: '겁살', ...SINSAL_DESC['겁살'] });
  if (ilji && JAESAL[ilji]===tJj) sinsal.push({ name: '재살', ...SINSAL_DESC['재살'] });

  // ── 카테고리별 운세 (재물운, 건강운, 연애운, 직장운, 학업운) ──
  const categories = buildCategoryFortunes(tSS, tUS, sinsal);

  return {
    dayPillar: tg.dayPillar, dayPillarHanja: tg.dayPillarHanja, dayOh: tOh,
    ss: tSS, us: tUS, ssReading: SS_READING[tSS] || '', usReading: US_READING[tUS] || '',
    hiddenSipsung,
    sinsal, categories,
  };
}

// ── 올해의 운세 ──
export interface YearlyFortuneResult {
  yearPillar: string; yearPillarHanja: string; yearOh: string;
  ss: string;                  // 올해 천간의 십성
  us: string;                  // 올해 지지의 12운성
  ssReading: string; usReading: string;
  hiddenSipsung: HiddenSipsung[];  // 올해 지지의 지장간별 십성
  sinsal: SinsalInfo[];
  categories: CategoryFortune[];
  year: number;
}

// 올해 연운용 십성 해석
const SS_YEARLY_READING: Record<string, string> = {
  '비견': '올해는 나와 같은 기운이 작용하는 해입니다. 동료나 친구와의 교류가 활발하고, 자립심과 독립심이 강해집니다. 경쟁 속에서 성장하되 독선을 경계하세요.',
  '겁재': '올해는 경쟁과 도전의 기운이 흐르는 해입니다. 재물 지출에 주의하고 승부욕을 긍정적으로 활용하세요. 공동 사업보다 단독 판단이 유리할 수 있습니다.',
  '식신': '올해는 여유와 창의력이 빛나는 해입니다. 취미 활동이 잘 풀리고 표현력이 좋아집니다. 안정적인 수입과 건강이 따르니 마음껏 즐기세요.',
  '상관': '올해는 표현욕과 재능이 폭발하는 해입니다. 예술·글쓰기에 좋으나 날카로운 말로 갈등이 생길 수 있으니 언행에 주의하세요.',
  '편재': '올해는 활동적 재물운과 사교의 해입니다. 사업 기회가 오고 인맥이 넓어지지만 과욕을 부리면 손실이 생길 수 있습니다.',
  '정재': '올해는 안정적인 재물 축적의 해입니다. 성실한 노력이 결실을 맺고 가정 경제가 안정됩니다. 저축과 재테크에 유리한 한 해입니다.',
  '편관': '올해는 변화와 도전의 해입니다. 갑작스러운 업무나 책임이 주어지지만, 잘 넘기면 큰 성장으로 이어집니다. 건강 관리에 신경 쓰세요.',
  '정관': '올해는 질서와 인정의 해입니다. 사회적 지위가 올라가고 공식적인 성과가 나타납니다. 규칙을 지키면 좋은 결과가 옵니다.',
  '편인': '올해는 직관과 영감의 해입니다. 학문이나 연구에 몰입하기 좋고 새로운 시각이 열립니다. 다만 고독감이나 건강 이상에 주의하세요.',
  '정인': '올해는 학습과 성장의 해입니다. 자격증, 학위 등 배움의 결실이 맺어지고 윗사람의 도움이 있습니다. 내적 성숙의 시간입니다.',
};

// 올해 연운용 12운성 해석
const US_YEARLY_READING: Record<string, string> = {
  '장생': '올해는 새로운 출발의 에너지가 있습니다. 시작한 일이 순조롭게 성장하며 희망적인 기운이 감도는 한 해입니다.',
  '목욕': '올해는 변화와 불안정의 시기입니다. 감정 기복이 심하고 유혹이 많으니 큰 결정은 신중하게 하세요.',
  '관대': '올해는 자신감과 사회 활동이 최고조인 해입니다. 적극적으로 나서면 인정받고 기회를 잡을 수 있습니다.',
  '건록': '올해는 실력이 완전히 발휘되는 해입니다. 독립적으로 일을 추진하면 큰 성과를 거둡니다.',
  '제왕': '올해는 모든 기운이 정점에 달하는 해입니다. 리더십을 발휘하기 좋으나 정점 이후 하락에 대비하세요.',
  '쇠': '올해는 기운이 서서히 빠지는 해입니다. 새로운 일보다 기존 일을 정리하고 체력을 관리하세요.',
  '병': '올해는 쇠약함의 시기입니다. 건강 관리에 집중하고 무리한 계획은 피하세요. 휴식이 최선입니다.',
  '사': '올해는 정체와 막힘의 시기입니다. 억지로 밀어붙이면 손해가 커지니 때를 기다리세요.',
  '묘': '올해는 내면을 돌아보는 시기입니다. 과거를 정리하고 다음을 준비하는 잠복기로 활용하세요.',
  '절': '올해는 단절과 전환의 시기입니다. 낡은 것을 과감히 버리고 새 방향을 모색하세요.',
  '태': '올해는 새로운 가능성이 잉태되는 시기입니다. 눈에 보이지 않지만 씨앗이 뿌려지고 있습니다.',
  '양': '올해는 성장을 준비하는 시기입니다. 조용하지만 확실한 발전이 이루어지고 있는 한 해입니다.',
};

export function buildYearlyFortune(ps: Pillar[]): YearlyFortuneResult | null {
  const ilgan = ps[1].c; const ilji = ps[1].j;
  if (!ilgan) return null;
  const now = new Date();
  const currentYear = now.getFullYear();
  const yg = getGapja(currentYear, 7, 1); // 연주는 아무 날이나 같은 해면 동일
  const yCg = yg.yearPillarHanja[0]; const yJj = yg.yearPillarHanja[1];
  const ySS = sipsung(ilgan, yCg); const yUS = unsung(ilgan, yJj);
  const yOh = CG_OH[yCg];

  // 올해 지지의 지장간별 십성 (여기·중기·본기)
  const hidden = JJG[yJj] || [];
  const weightLabels: ('여기' | '중기' | '본기')[] =
    hidden.length === 1 ? ['본기']
    : hidden.length === 2 ? ['여기', '본기']
    : ['여기', '중기', '본기'];
  const hiddenSipsung: HiddenSipsung[] = hidden.map((h, i) => ({
    hanja: h,
    ss: sipsung(ilgan, h),
    weight: weightLabels[i],
  }));

  const sinsal: SinsalInfo[] = [];
  if (CHEONUL[ilgan]?.includes(yJj)) sinsal.push({ name: '천을귀인', ...SINSAL_DESC['천을귀인'] });
  if (MUNCHANG[ilgan]===yJj) sinsal.push({ name: '문창귀인', ...SINSAL_DESC['문창귀인'] });
  if (ilji && YEOKMA[ilji]===yJj) sinsal.push({ name: '역마살', ...SINSAL_DESC['역마살'] });
  if (ilji && DOHWA[ilji]===yJj) sinsal.push({ name: '도화살', ...SINSAL_DESC['도화살'] });
  if (ilji && HWAGAE[ilji]===yJj) sinsal.push({ name: '화개살', ...SINSAL_DESC['화개살'] });
  if (ilji && GEOBSAL[ilji]===yJj) sinsal.push({ name: '겁살', ...SINSAL_DESC['겁살'] });
  if (ilji && JAESAL[ilji]===yJj) sinsal.push({ name: '재살', ...SINSAL_DESC['재살'] });

  // 카테고리별 운세
  const categories = buildCategoryFortunes(ySS, yUS, sinsal);

  return {
    yearPillar: yg.yearPillar, yearPillarHanja: yg.yearPillarHanja, yearOh: yOh,
    ss: ySS, us: yUS, ssReading: SS_YEARLY_READING[ySS] || '', usReading: US_YEARLY_READING[yUS] || '',
    hiddenSipsung,
    sinsal, categories,
    year: currentYear,
  };
}

// ── 대운 · 연운 · 월운 ──
export interface DaeunEntry extends GapjaEntry { age: number; }
export interface DaeunResult { daeuns: DaeunEntry[]; daeunsu: number; }

// 절기(節氣) 근사 날짜 - 월별 절입일 (양력 기준 평균)
// 라이브러리 지원 범위(2020~2030) 밖 연도용 폴백
// 인월(寅)=입춘~, 묘월(卯)=경칩~, ... 축월(丑)=소한~
const JEOLGI_APPROX: [number, number][] = [
  [2, 4],   // 1: 입춘 (인월 시작)
  [3, 6],   // 2: 경칩 (묘월)
  [4, 5],   // 3: 청명 (진월)
  [5, 6],   // 4: 입하 (사월)
  [6, 6],   // 5: 망종 (오월)
  [7, 7],   // 6: 소서 (미월)
  [8, 8],   // 7: 입추 (신월)
  [9, 8],   // 8: 백로 (유월)
  [10, 8],  // 9: 한로 (술월)
  [11, 7],  // 10: 입동 (해월)
  [12, 7],  // 11: 대설 (자월)
  [1, 6],   // 12: 소한 (축월)
];

function getJeolgiApproxDates(year: number): Date[] {
  const dates: Date[] = [];
  for (const [m, d] of JEOLGI_APPROX) {
    const y = m === 1 ? year + 1 : year; // 소한은 다음해 1월
    dates.push(new Date(y, m - 1, d));
  }
  for (const [m, d] of JEOLGI_APPROX) {
    const y = m === 1 ? year : year - 1;
    dates.push(new Date(y, m - 1, d));
  }
  return dates.sort((a, b) => a.getTime() - b.getTime());
}

/** 출생 연도 기준 전/당/다음 연도의 절기(節氣) 시각을 정확히 조회.
 *  라이브러리 범위 밖이면 근사 날짜로 폴백. */
function getJeolgiDates(year: number): Date[] {
  const dates: Date[] = [];
  for (const y of [year - 1, year, year + 1]) {
    try {
      const terms = getSolarTermsByYear(y);
      for (const t of terms) {
        if (t.type !== 'jeolgi') continue;
        dates.push(new Date(t.year, t.month - 1, t.day, t.hour, t.minute));
      }
    } catch {
      // 범위 밖: 근사치 사용
      return getJeolgiApproxDates(year);
    }
  }
  return dates.sort((a, b) => a.getTime() - b.getTime());
}

export function calcDaeun(saju: ReturnType<typeof calculateSaju>, gender: string, bY: number, bM: number, bD: number): DaeunResult {
  const yCg = saju.yearPillarHanja[0];
  const mCg = saju.monthPillarHanja[0]; const mJj = saju.monthPillarHanja[1];
  const yang = ['甲','丙','戊','庚','壬'].includes(yCg);
  const fwd = (yang && gender==='남') || (!yang && gender==='여');
  const mIdx = g60idx(mCg, mJj);
  const bDate = new Date(bY, bM-1, bD);
  let daeunsu = 5;

  // 절기 기반 대운수 계산
  const jeolgiDates = getJeolgiDates(bY);
  if (fwd) {
    const next = jeolgiDates.find(d => d > bDate);
    if (next) daeunsu = Math.floor((next.getTime() - bDate.getTime()) / (1000 * 60 * 60 * 24) / 3);
  } else {
    const prev = [...jeolgiDates].reverse().find(d => d <= bDate);
    if (prev) daeunsu = Math.floor((bDate.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24) / 3);
  }

  if(daeunsu<1)daeunsu=1; if(daeunsu>10)daeunsu=10;
  const result: DaeunEntry[]=[];
  for(let i=1;i<=10;i++){const off=fwd?i:-i;const idx=((mIdx+off)%60+60)%60;result.push({age:daeunsu+(i-1)*10,...G60[idx]});}
  return {daeuns:result,daeunsu};
}

export interface YeonunEntry extends GapjaEntry { year: number; }

export function calcYeonun(): YeonunEntry[] {
  const cY = new Date().getFullYear(); const r: YeonunEntry[]=[];
  for(let y=cY+2;y>=cY-7;y--){try{const g=getGapja(y,7,1);r.push({year:y,c:g.yearPillarHanja[0],j:g.yearPillarHanja[1],ck:g.yearPillar[0],jk:g.yearPillar[1]});}catch{}}
  return r;
}

export interface WolunEntry extends GapjaEntry { month: number; }

export function calcWolun(): WolunEntry[] {
  const cY=new Date().getFullYear(); const r: WolunEntry[]=[];
  for(let m=12;m>=1;m--){try{const g=getGapja(cY,m,15);r.push({month:m,c:g.monthPillarHanja[0],j:g.monthPillarHanja[1],ck:g.monthPillar[0],jk:g.monthPillar[1]});}catch{}}
  return r;
}

// ── 시진 매핑 ──
export interface Sijin { start: number; end: number; label: string; value: number; }

export const SIJIN_LIST: Sijin[] = [
  { start:23, end:1,  label:'23:00 ~ 01:00', value:0  },
  { start:1,  end:3,  label:'01:00 ~ 03:00', value:1  },
  { start:3,  end:5,  label:'03:00 ~ 05:00', value:3  },
  { start:5,  end:7,  label:'05:00 ~ 07:00', value:5  },
  { start:7,  end:9,  label:'07:00 ~ 09:00', value:7  },
  { start:9,  end:11, label:'09:00 ~ 11:00', value:9  },
  { start:11, end:13, label:'11:00 ~ 13:00', value:11 },
  { start:13, end:15, label:'13:00 ~ 15:00', value:13 },
  { start:15, end:17, label:'15:00 ~ 17:00', value:15 },
  { start:17, end:19, label:'17:00 ~ 19:00', value:17 },
  { start:19, end:21, label:'19:00 ~ 21:00', value:19 },
  { start:21, end:23, label:'21:00 ~ 23:00', value:21 },
];

export function matchSijin(h: number, m: number): Sijin | null {
  const t = h * 60 + m;
  for (const s of SIJIN_LIST) {
    if (s.start > s.end) {
      const tAdj = t < s.start * 60 ? t + 24 * 60 : t;
      if (tAdj >= s.start * 60 && tAdj < (s.end + 24) * 60) return s;
    } else {
      if (t >= s.start * 60 && t < s.end * 60) return s;
    }
  }
  return null;
}

// ── 도시 옵션 ──
export const REGION_OPTIONS = [
  { value: '', label: '보정 안함' },
  { value: '126.98', label: '서울특별시' },
  { value: '129.03', label: '부산광역시' },
  { value: '128.60', label: '대구광역시' },
  { value: '126.70', label: '인천광역시' },
  { value: '126.85', label: '광주광역시' },
  { value: '127.38', label: '대전광역시' },
  { value: '129.31', label: '울산광역시' },
  { value: '127.03', label: '세종특별자치시' },
  { value: '127.00', label: '경기도' },
  { value: '128.21', label: '강원도' },
  { value: '127.38', label: '충청북도' },
  { value: '126.80', label: '충청남도' },
  { value: '127.15', label: '전라북도' },
  { value: '126.81', label: '전라남도' },
  { value: '128.57', label: '경상북도' },
  { value: '128.68', label: '경상남도' },
  { value: '126.57', label: '제주특별자치도' },
];

// 영문(글로벌) 도시 목록.
// `value`는 실제 경도가 아니라 "KST(자오선 135°E) 기준으로 보정되는 엔진"에
// 넣었을 때 올바른 진태양시 보정이 나오도록 환산한 값(effective longitude).
//   effective = 실제경도 + (135 - 해당도시 표준시 자오선)
// 예) New York (lon -74.01, EST 자오선 -75): -74.01 + (135-(-75)) = 135.99
export const REGION_OPTIONS_EN = [
  { value: '', label: 'No correction' },
  // East Asia
  { value: '126.98', label: 'Seoul, South Korea' },
  { value: '129.03', label: 'Busan, South Korea' },
  { value: '139.69', label: 'Tokyo, Japan' },
  { value: '135.50', label: 'Osaka, Japan' },
  { value: '131.40', label: 'Beijing, China' },
  { value: '136.47', label: 'Shanghai, China' },
  { value: '129.17', label: 'Hong Kong' },
  { value: '136.56', label: 'Taipei, Taiwan' },
  // Southeast Asia
  { value: '118.85', label: 'Singapore' },
  { value: '130.50', label: 'Bangkok, Thailand' },
  { value: '136.85', label: 'Jakarta, Indonesia' },
  { value: '135.98', label: 'Manila, Philippines' },
  { value: '135.85', label: 'Hanoi, Vietnam' },
  { value: '116.69', label: 'Kuala Lumpur, Malaysia' },
  // South / West Asia
  { value: '125.38', label: 'Mumbai, India' },
  { value: '129.71', label: 'New Delhi, India' },
  { value: '130.27', label: 'Dubai, UAE' },
  { value: '118.98', label: 'Istanbul, Turkey' },
  { value: '127.62', label: 'Moscow, Russia' },
  // Europe
  { value: '134.87', label: 'London, UK' },
  { value: '122.35', label: 'Paris, France' },
  { value: '133.40', label: 'Berlin, Germany' },
  { value: '132.50', label: 'Rome, Italy' },
  { value: '116.30', label: 'Madrid, Spain' },
  { value: '124.90', label: 'Amsterdam, Netherlands' },
  { value: '136.37', label: 'Vienna, Austria' },
  { value: '128.54', label: 'Zurich, Switzerland' },
  { value: '138.07', label: 'Stockholm, Sweden' },
  { value: '128.73', label: 'Athens, Greece' },
  // Americas
  { value: '135.99', label: 'New York, USA' },
  { value: '132.96', label: 'Washington DC, USA' },
  { value: '137.37', label: 'Chicago, USA' },
  { value: '136.76', label: 'Los Angeles, USA' },
  { value: '132.58', label: 'San Francisco, USA' },
  { value: '132.67', label: 'Seattle, USA' },
  { value: '130.62', label: 'Toronto, Canada' },
  { value: '131.88', label: 'Vancouver, Canada' },
  { value: '125.87', label: 'Mexico City, Mexico' },
  { value: '133.37', label: 'São Paulo, Brazil' },
  { value: '121.62', label: 'Buenos Aires, Argentina' },
  // Oceania
  { value: '136.21', label: 'Sydney, Australia' },
  { value: '129.96', label: 'Melbourne, Australia' },
  { value: '129.76', label: 'Auckland, New Zealand' },
  // Africa & Middle East
  { value: '136.24', label: 'Cairo, Egypt' },
  { value: '133.04', label: 'Johannesburg, South Africa' },
  { value: '126.82', label: 'Nairobi, Kenya' },
  { value: '123.38', label: 'Lagos, Nigeria' },
];

// ══════════════════════════════════════════════════════════════
// 팔자 전체 구조 분석 (오행 분포·신강약·격국·용신·합충)
// ══════════════════════════════════════════════════════════════

// 오행 상생: 목→화→토→금→수→목
// 오행 상극: 목→토→수→화→금→목
const OH_LIST = ['목', '화', '토', '금', '수'];

export interface ElementDistribution {
  counts: Record<string, number>;           // 오행별 개수 (천간+지지 본기)
  weighted: Record<string, number>;         // 지장간 가중 합산 (본기 3, 중기 2, 여기 1)
  excess: string[];                         // 과다 (≥3 또는 가중 ≥5)
  lacking: string[];                        // 결여 (0)
}

/** 팔자 8자의 오행 분포 계산.
 *  지지는 본기만 카운트하되, 가중합은 지장간(본기 3, 중기 2, 여기 1)으로 계산. */
export function calculateElementDistribution(ps: Pillar[]): ElementDistribution {
  const counts: Record<string, number> = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  const weighted: Record<string, number> = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };

  for (const p of ps) {
    if (p.c && CG_OH[p.c]) counts[CG_OH[p.c]] += 1;
    if (p.j && JJ_OH[p.j]) counts[JJ_OH[p.j]] += 1;
  }

  // 지장간 가중 (본기=3, 중기=2, 여기=1 혹은 본기만이면 3)
  for (const p of ps) {
    if (p.c && CG_OH[p.c]) weighted[CG_OH[p.c]] += 3;
    if (!p.j || !JJG[p.j]) continue;
    const hidden = JJG[p.j];
    const weights = hidden.length === 1 ? [3] : hidden.length === 2 ? [1, 3] : [1, 2, 3];
    hidden.forEach((h, i) => {
      const oh = CG_OH[h];
      if (oh) weighted[oh] += weights[i];
    });
  }

  const excess = OH_LIST.filter(o => counts[o] >= 3);
  const lacking = OH_LIST.filter(o => counts[o] === 0);
  return { counts, weighted, excess, lacking };
}

// ── 신강/신약 판정 ──
export type SinGangYakLevel = '극신강' | '신강' | '중화' | '신약' | '극신약';
export interface SinGangYakSupport {
  position: string;   // '시간'·'시지'·'월간'·'월지'·'년간'·'년지'
  char: string;
  oh: string;
  helps: boolean;     // 일간을 돕는가
}
export interface SinGangYakResult {
  level: SinGangYakLevel;
  deukryeong: boolean;  // 득령 (월지가 일간을 돕는가)
  deukji: boolean;      // 득지 (일지가 일간을 돕는가)
  deukse: number;       // 득세 (일주 제외한 6자 중 도움 개수)
  supports: SinGangYakSupport[];  // 각 자리 상세
  score: number;        // 종합 점수 (0~100)
}

/** 일간의 신강/신약 판정.
 *  득령 = 월지 단독, 득지 = 일지 단독, 득세 = 일주 제외한 나머지 6자.
 *  득세에는 월지·일지가 포함되지 않아 중복 카운트 방지. */
export function judgeSinGangYak(ps: Pillar[]): SinGangYakResult | null {
  const ilgan = ps[1].c;
  if (!ilgan) return null;
  const ilganOh = CG_OH[ilgan];
  if (!ilganOh) return null;

  const prev = OH_LIST[(OH_LIST.indexOf(ilganOh) + 4) % 5];  // 인성
  const same = ilganOh;                                       // 비겁
  const helps = (oh: string) => oh === prev || oh === same;

  // 득령: 월지 본기
  const wolji = ps[2].j;
  const woljiMain = wolji && JJG[wolji] ? JJG[wolji][JJG[wolji].length - 1] : null;
  const deukryeong = woljiMain ? helps(CG_OH[woljiMain]) : false;

  // 득지: 일지 본기
  const ilji = ps[1].j;
  const iljiMain = ilji && JJG[ilji] ? JJG[ilji][JJG[ilji].length - 1] : null;
  const deukji = iljiMain ? helps(CG_OH[iljiMain]) : false;

  // 득세: 시간·시지·월간·년간·년지 (5자) 중 도움 개수
  //       ※ 월지는 득령, 일주(일간·일지)는 득지/일간 자체로 분리
  // (일부 유파에서는 득세에 월지도 포함하지만, 중복 카운트 피하기 위해 제외)
  const positions: [number, 'c' | 'j', string][] = [
    [0, 'c', '시간'], [0, 'j', '시지'],
    [2, 'c', '월간'],
    [3, 'c', '년간'], [3, 'j', '년지'],
  ];

  const supports: SinGangYakSupport[] = [];
  let deukse = 0;
  for (const [idx, type, label] of positions) {
    const char = type === 'c' ? ps[idx].c : ps[idx].j;
    if (!char) continue;
    const oh = type === 'c' ? CG_OH[char] : JJ_OH[char];
    const h = helps(oh);
    if (h) deukse++;
    supports.push({ position: label, char, oh, helps: h });
  }

  // 점수 계산 (0~100)
  // 득령 비중 가장 크게 (월령이 사주의 중심)
  let score = 50;
  if (deukryeong) score += 25;
  else score -= 15;
  if (deukji) score += 15;
  else score -= 10;
  // 득세는 5자 중 평균 2.5 기준, 1자당 ±5
  score += (deukse - 2.5) * 5;
  score = Math.max(0, Math.min(100, Math.round(score)));

  let level: SinGangYakLevel;
  if (score >= 80) level = '극신강';
  else if (score >= 60) level = '신강';
  else if (score >= 40) level = '중화';
  else if (score >= 20) level = '신약';
  else level = '극신약';

  return { level, deukryeong, deukji, deukse, supports, score };
}

// ── 격국 판정 (월지 주지장간 기반) ──
export interface GyeokgukResult {
  name: string;           // 격국 이름
  description: string;    // 설명
  sipsung: string;        // 월지 본기의 십성
}

export function detectGyeokguk(ps: Pillar[]): GyeokgukResult | null {
  const ilgan = ps[1].c;
  const wolji = ps[2].j;
  if (!ilgan || !wolji) return null;

  const woljiMain = JJG[wolji] ? JJG[wolji][JJG[wolji].length - 1] : null;
  if (!woljiMain) return null;

  // 월간이 월지 본기와 일치하면 그 기준, 아니면 월지 본기 기준
  const monthGan = ps[2].c;
  const basis = (monthGan === woljiMain) ? monthGan : woljiMain;

  const ss = sipsung(ilgan, basis);
  if (!ss) return null;

  // 특수 격: 건록격 (월지 본기가 일간과 같은 오행·양음 = 비견)
  //        양인격 (월지가 일간의 겁재 위치 + 특정 지지)
  const gyeokMap: Record<string, { name: string; desc: string }> = {
    '비견': { name: '건록격(建祿格)', desc: '월지가 일간과 같은 기운으로 자립심과 독립성이 강한 구조.' },
    '겁재': { name: '양인격(羊刃格)', desc: '강한 경쟁심과 추진력의 구조. 과격해질 수 있으니 절제가 관건.' },
    '식신': { name: '식신격(食神格)', desc: '표현력·창의력이 빛나는 구조. 여유와 복이 따르기 쉬움.' },
    '상관': { name: '상관격(傷官格)', desc: '재능과 표현력이 두드러지는 구조. 자존심과 날카로움 주의.' },
    '편재': { name: '편재격(偏財格)', desc: '활동적 재물·사교의 구조. 큰 기회와 리스크가 공존.' },
    '정재': { name: '정재격(正財格)', desc: '성실·근면·안정적 재물의 구조. 꾸준한 축적이 강점.' },
    '편관': { name: '편관격(偏官格)', desc: '추진력과 위기 돌파력의 구조. 압박 속 성장하는 타입.' },
    '정관': { name: '정관격(正官格)', desc: '명예·규율·조직 적합형. 사회적 성취에 유리한 구조.' },
    '편인': { name: '편인격(偏印格)', desc: '직관과 영감의 구조. 학문·창작·신비 분야에 재능.' },
    '정인': { name: '정인격(正印格)', desc: '지혜와 학문의 구조. 배움·전문성·후견인의 도움이 따름.' },
  };

  const info = gyeokMap[ss];
  return { name: info.name, description: info.desc, sipsung: ss };
}

// ── 용신 간단 추천 ──
export interface YongsinResult {
  primary: string;       // 주 용신 오행
  role: string;          // 일간에게 어떤 역할인지 (재성/관성/식상/인성/비겁)
  action: string;        // 어떤 작용인지 (설기/극/생/비화)
  description: string;
  basis: string;         // 선택 근거
  supportElements: string[];  // 희신
}

/** 일간 기준 오행의 관계(십성군)와 작용 */
function elementRole(ilganOh: string, targetOh: string): { role: string; action: string } {
  if (!ilganOh || !targetOh) return { role: '', action: '' };
  const idx = OH_LIST.indexOf(ilganOh);
  const nextEl = OH_LIST[(idx + 1) % 5];
  const prevEl = OH_LIST[(idx + 4) % 5];
  const ctrlEl = OH_LIST[(idx + 2) % 5];
  const ctrldEl = OH_LIST[(idx + 3) % 5];

  if (targetOh === ilganOh) return { role: '비겁', action: '비화(기운 합세)' };
  if (targetOh === prevEl) return { role: '인성', action: '생(나를 도움)' };
  if (targetOh === nextEl) return { role: '식상', action: '설기(내가 흘려냄)' };
  if (targetOh === ctrlEl) return { role: '재성', action: '극(내가 극함)' };
  if (targetOh === ctrldEl) return { role: '관성', action: '극(나를 극함)' };
  return { role: '', action: '' };
}

/** 간단 용신 추천: 신강약 + 오행 결여 고려
 *  신강: 재(재성) → 관(관성) → 식(식상) 우선순위
 *  신약: 인(인성) → 비(비겁) 우선순위
 */
export function suggestYongsin(ps: Pillar[], sgy: SinGangYakResult, dist: ElementDistribution): YongsinResult | null {
  const ilgan = ps[1].c;
  if (!ilgan) return null;
  const ilganOh = CG_OH[ilgan];
  if (!ilganOh) return null;

  const idx = OH_LIST.indexOf(ilganOh);
  const nextEl = OH_LIST[(idx + 1) % 5];  // 식상
  const prevEl = OH_LIST[(idx + 4) % 5];  // 인성
  const ctrlEl = OH_LIST[(idx + 2) % 5];  // 재성
  const ctrldEl = OH_LIST[(idx + 3) % 5]; // 관성

  let primary: string;
  let support: string[];
  let basis: string;

  if (sgy.level === '극신강' || sgy.level === '신강') {
    // 신강: 재 → 관 → 식 우선
    const priority = [ctrlEl, ctrldEl, nextEl];
    const priorityLabels = ['재성', '관성', '식상'];
    // 원국에 어느 정도 뿌리(≥1)가 있는 것 중 우선순위 높은 오행
    const rooted = priority.find(el => dist.counts[el] >= 1);
    if (rooted) {
      primary = rooted;
      const idx2 = priority.indexOf(rooted);
      basis = `신강하여 기운을 조절할 필요. 재성→관성→식상 순위 중 원국에 존재하는 ${priorityLabels[idx2]}(${rooted}) 선택`;
    } else {
      // 뿌리 없으면 가장 우선순위 높은 것 (재성)
      primary = priority[0];
      basis = `신강하여 기운을 조절할 필요. 재성이 원국에 없지만 일반 우선 원칙에 따라 ${primary}(재성) 보충`;
    }
    support = priority.filter(c => c !== primary);
  } else if (sgy.level === '극신약' || sgy.level === '신약') {
    // 신약: 인성 → 비겁
    if (dist.counts[prevEl] === 0) {
      primary = prevEl;
      basis = `신약하여 도움 필요. 인성(${prevEl})이 원국에 없어 시급히 보충`;
    } else if (dist.counts[prevEl] <= dist.counts[ilganOh]) {
      primary = prevEl;
      basis = `신약하여 도움 필요. 인성(${prevEl}, ${dist.counts[prevEl]}개)이 비겁(${ilganOh}, ${dist.counts[ilganOh]}개) 이하로 인성 우선`;
    } else {
      primary = ilganOh;
      basis = `신약하지만 인성(${prevEl}) 충분. 비겁(${ilganOh})으로 세력 보강`;
    }
    support = primary === prevEl ? [ilganOh] : [prevEl];
  } else {
    // 중화: 결여 보충
    if (dist.lacking.length > 0) {
      primary = dist.lacking[0];
      basis = `중화된 사주. 원국 결여 오행 ${primary} 보충이 우선`;
    } else {
      primary = OH_LIST.find(o => dist.counts[o] < 2) || nextEl;
      basis = `중화된 사주. 특별한 결여 없음, 균형 유지`;
    }
    support = [prevEl, nextEl].filter(x => x !== primary);
  }

  const rel = elementRole(ilganOh, primary);
  const desc =
    sgy.level.includes('강') ? `내 기운이 강하므로 ${rel.role}(${rel.action})인 ${primary}이(가) 기운을 조절해줍니다.`
    : sgy.level.includes('약') ? `내 기운이 약하므로 ${rel.role}(${rel.action})인 ${primary}이(가) 기운을 북돋아줍니다.`
    : `균형 잡힌 구조에서 ${rel.role}(${rel.action})인 ${primary}이(가) 조화를 돕습니다.`;

  return {
    primary,
    role: rel.role,
    action: rel.action,
    description: desc,
    basis,
    supportElements: [...new Set(support)].filter(x => x !== primary),
  };
}

// ── 합·충 탐지 ──
// 천간합: 甲己, 乙庚, 丙辛, 丁壬, 戊癸
const CG_HAP: Record<string, string> = { '甲': '己', '己': '甲', '乙': '庚', '庚': '乙', '丙': '辛', '辛': '丙', '丁': '壬', '壬': '丁', '戊': '癸', '癸': '戊' };
// 지지 육합
const JJ_YUKHAP: Record<string, string> = { '子': '丑', '丑': '子', '寅': '亥', '亥': '寅', '卯': '戌', '戌': '卯', '辰': '酉', '酉': '辰', '巳': '申', '申': '巳', '午': '未', '未': '午' };
// 지지 충
const JJ_CHUNG: Record<string, string> = { '子': '午', '午': '子', '丑': '未', '未': '丑', '寅': '申', '申': '寅', '卯': '酉', '酉': '卯', '辰': '戌', '戌': '辰', '巳': '亥', '亥': '巳' };
// 삼합 국
const SAMHAP: [string, string, string, string][] = [
  ['申', '子', '辰', '水'],
  ['亥', '卯', '未', '木'],
  ['寅', '午', '戌', '火'],
  ['巳', '酉', '丑', '金'],
];

const PILLAR_NAMES = ['시주', '일주', '월주', '년주'];

export interface HapChungItem {
  type: '천간합' | '지지육합' | '지지삼합' | '지지충';
  positions: string[];       // ['시주', '일주'] 등
  chars: string;             // 예: '丁壬'
  meaning: string;           // 실생활 번역 해석
  headline: string;          // 한 줄 요약
}

// ── 주(柱) 조합별 영역 매핑 ──
// 시주 = 자녀·말년·내면의 목표·실현
// 일주 = 나 자신·배우자궁·현재 행동·정체성
// 월주 = 청년기·직장·사회·가정환경·부모
// 년주 = 초년기·조부모·뿌리·유산

interface PillarRelationTranslation {
  headline: string;
  meaning: string;
}

/** 두 주(柱) 간 관계를 합(긍정)/충(부정) 관점에서 실생활로 번역 */
function translatePillarPair(
  posA: string, posB: string,
  type: '천간합' | '지지육합' | '지지충',
): PillarRelationTranslation {
  const pair = [posA, posB].sort().join('-');
  const isPositive = type === '천간합' || type === '지지육합';

  // 주 조합별 번역 (충 기준으로 작성, 합은 반대 뉘앙스로 덮어씀)
  const CLASH_MAP: Record<string, PillarRelationTranslation> = {
    '시주-일주': {
      headline: '이상과 실행의 괴리',
      meaning: '내면의 목표(시주)와 실제 행동(일주) 사이에 간극이 반복되는 패턴. 계획은 세우지만 실행 방식이 달라지는 경험이 잦을 수 있어요.',
    },
    '월주-시주': {
      headline: '현재 기반과 미래 비전의 마찰',
      meaning: '지금의 사회적 위치·직장(월주)과 내가 꿈꾸는 미래(시주) 사이에 방향 차이. 커리어와 장기 비전을 일치시키는 작업이 필요합니다.',
    },
    '년주-시주': {
      headline: '뿌리와 미래의 거리감',
      meaning: '가문·전통(년주)과 자녀·실현하려는 것(시주) 사이의 세대·가치 차이. 물려받은 것을 어떻게 새로 해석할지가 과제.',
    },
    '월주-일주': {
      headline: '사회적 기대와 나의 방향',
      meaning: '가정환경·직장(월주)과 개인 정체성(일주)의 긴장. 부모·회사의 기대와 본인이 가고 싶은 길이 다를 수 있어요.',
    },
    '년주-일주': {
      headline: '가문 부담과 개인 자아',
      meaning: '조부모·가문의 배경(년주)과 현재의 나(일주) 사이 긴장. 집안 기대에 눌리거나 전통과 다른 길을 개척하는 경험.',
    },
    '년주-월주': {
      headline: '어릴 적 환경과 청년기 변화',
      meaning: '초년(년주)과 청년기(월주) 사이 환경·가치 전환이 큼. 이사·이직 등 성장기 변화가 많거나 세대 간 마찰 경험.',
    },
  };

  const base = CLASH_MAP[pair] || {
    headline: `${posA}↔${posB} ${isPositive ? '조화' : '긴장'}`,
    meaning: `두 영역 사이에 ${isPositive ? '연결·협력' : '마찰·변동'}의 흐름이 있습니다.`,
  };

  if (isPositive) {
    // 합: 긍정 뉘앙스로 반전
    const positivizedHeadline = base.headline
      .replace('괴리', '연결')
      .replace('마찰', '시너지')
      .replace('거리감', '연계')
      .replace('긴장', '조화')
      .replace('부담', '지원')
      .replace('변화', '이어짐');
    const positivizedMeaning = base.meaning
      .replace(/간극이 반복되는 패턴\.?/, '이 자연스럽게 이어지는 구조.')
      .replace(/방향 차이/, '흐름의 연결')
      .replace(/세대·가치 차이/, '세대 간 계승')
      .replace(/긴장/g, '조화')
      .replace(/다를 수 있어요/g, '맞물려 갑니다')
      .replace(/부담/g, '든든한 지지')
      .replace(/마찰/g, '자연스러운 전환');
    return { headline: positivizedHeadline, meaning: positivizedMeaning };
  }

  return base;
}

export function detectHapChung(ps: Pillar[]): HapChungItem[] {
  const results: HapChungItem[] = [];

  // 천간합
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      if (ps[i].c && ps[j].c && CG_HAP[ps[i].c] === ps[j].c) {
        const t = translatePillarPair(PILLAR_NAMES[i], PILLAR_NAMES[j], '천간합');
        results.push({
          type: '천간합',
          positions: [PILLAR_NAMES[i], PILLAR_NAMES[j]],
          chars: `${ps[i].c}${ps[j].c}`,
          headline: t.headline,
          meaning: t.meaning,
        });
      }
    }
  }

  // 지지 육합
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      if (ps[i].j && ps[j].j && JJ_YUKHAP[ps[i].j] === ps[j].j) {
        const t = translatePillarPair(PILLAR_NAMES[i], PILLAR_NAMES[j], '지지육합');
        results.push({
          type: '지지육합',
          positions: [PILLAR_NAMES[i], PILLAR_NAMES[j]],
          chars: `${ps[i].j}${ps[j].j}`,
          headline: t.headline,
          meaning: t.meaning,
        });
      }
    }
  }

  // 지지 충
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      if (ps[i].j && ps[j].j && JJ_CHUNG[ps[i].j] === ps[j].j) {
        const t = translatePillarPair(PILLAR_NAMES[i], PILLAR_NAMES[j], '지지충');
        results.push({
          type: '지지충',
          positions: [PILLAR_NAMES[i], PILLAR_NAMES[j]],
          chars: `${ps[i].j}${ps[j].j}`,
          headline: t.headline,
          meaning: t.meaning,
        });
      }
    }
  }

  // 지지 삼합 (3개 전부 있어야 성립)
  const branches = ps.map(p => p.j).filter(Boolean);
  for (const [a, b, c, el] of SAMHAP) {
    if (branches.includes(a) && branches.includes(b) && branches.includes(c)) {
      const domain =
        el === '水' ? '지혜·소통·학문' :
        el === '木' ? '성장·창의·개척' :
        el === '火' ? '열정·표현·사교' :
        el === '金' ? '원칙·결단·재물' : '안정·관계';
      results.push({
        type: '지지삼합',
        positions: [],
        chars: `${a}${b}${c}`,
        headline: `${el}국 완성 — 큰 흐름 형성`,
        meaning: `원국 지지가 ${el}국(${domain})을 이루어, 이 테마가 인생의 주요 동력이 되는 구조입니다.`,
      });
    }
  }

  return results;
}

// ── 종합 구조 분석 ──
export interface StructureAnalysis {
  distribution: ElementDistribution;
  singangyak: SinGangYakResult | null;
  gyeokguk: GyeokgukResult | null;
  yongsin: YongsinResult | null;
  hapChung: HapChungItem[];
  summary: string;
}

export function buildStructureAnalysis(ps: Pillar[]): StructureAnalysis | null {
  if (!ps[1]?.c) return null;

  const distribution = calculateElementDistribution(ps);
  const singangyak = judgeSinGangYak(ps);
  const gyeokguk = detectGyeokguk(ps);
  const yongsin = singangyak ? suggestYongsin(ps, singangyak, distribution) : null;
  const hapChung = detectHapChung(ps);

  const parts: string[] = [];
  if (distribution.excess.length > 0) parts.push(`${distribution.excess.join('·')} 과다`);
  if (distribution.lacking.length > 0) parts.push(`${distribution.lacking.join('·')} 결여`);
  if (singangyak) parts.push(singangyak.level);
  if (gyeokguk) parts.push(gyeokguk.name);
  const summary = parts.length > 0 ? parts.join(' · ') : '균형 잡힌 구조';

  return { distribution, singangyak, gyeokguk, yongsin, hapChung, summary };
}

// ── 일진 ↔ 원국 합충 감지 (오늘·특정 날짜와 내 사주의 관계) ──
export interface DayHapChungItem {
  type: '천간합' | '육합' | '충' | '삼합';
  with: string;           // 어느 자리와 상호작용 ('년주'·'월주'·'일주'·'시주')
  chars: string;          // 글자 조합 (예: '甲己')
  headline: string;       // 한 줄 요약
  meaning: string;        // 실생활 해석
  good: boolean | null;   // 긍정/부정/중립
}

/** 오늘 기운과 원국 각 주(柱) 사이의 상호작용을 실생활 영향으로 번역 */
function translateDayPillarInteraction(
  pillar: string,
  type: '천간합' | '육합' | '충' | '삼합',
): { headline: string; meaning: string } {
  const CHUNG: Record<string, { h: string; m: string }> = {
    '시주': {
      h: '미래 계획의 재검토',
      m: '오늘 기운이 자녀·말년·장기 목표 영역을 흔듭니다. 미뤄둔 계획이 흔들리거나 새 방향을 고민하게 될 수 있어요. 오늘 내린 장기 결정은 다음 주까지 다시 확인하세요.',
    },
    '일주': {
      h: '나 자신·배우자 영역 긴장',
      m: '오늘 기운이 나의 정체성·배우자궁과 충합니다. 연인·배우자와 사소한 감정 마찰이나 몸 컨디션 기복이 생기기 쉬우니, 즉답을 피하고 자극적인 대화는 내일로 미루세요.',
    },
    '월주': {
      h: '직장·사회적 역할 변동',
      m: '오늘 기운이 직장·사회·형제 영역을 흔듭니다. 업무 일정 변경, 동료와의 의견 차이, 가정 환경의 작은 변화가 올 수 있습니다. 우선순위를 유연하게 조정하세요.',
    },
    '년주': {
      h: '뿌리·가족 영역 진동',
      m: '오늘 기운이 조부모·부모·가문 영역과 충합니다. 가족 소식이나 세대 간 가치 차이가 부각될 수 있고, 갑작스러운 의무적 지출(경조사·가족 비용)이 발생할 수 있어요.',
    },
  };

  const HAP: Record<string, { h: string; m: string }> = {
    '시주': {
      h: '미래 계획에 순풍',
      m: '오늘 기운이 장기 목표·자녀 영역과 합을 이룹니다. 미뤄둔 계획을 다시 꺼내기 좋고, 앞날을 위한 투자·결정이 자연스럽게 연결돼요.',
    },
    '일주': {
      h: '나와 배우자 관계 조화',
      m: '오늘 기운이 나의 정체성·배우자궁과 합합니다. 연인·배우자와 유난히 마음이 잘 통하고, 본인 몸 상태도 안정적입니다. 중요한 대화나 화해에 좋은 날.',
    },
    '월주': {
      h: '직장·사회 협력 플러스',
      m: '오늘 기운과 월주가 합하여 직장에서 협업·인간관계가 매끄럽게 풀립니다. 제안·미팅·중요한 보고를 하기에 유리한 타이밍입니다.',
    },
    '년주': {
      h: '가족·뿌리와의 연결',
      m: '오늘 기운과 년주가 합하여 가족·가문 영역에 따뜻한 흐름. 부모나 오랜 친척과의 연락, 가족 기반의 작은 기회가 올 수 있어요.',
    },
  };

  if (type === '충') return { headline: CHUNG[pillar]?.h || '변동', meaning: CHUNG[pillar]?.m || '해당 영역에 변동이 있습니다.' };
  if (type === '삼합') return {
    headline: '원국과 삼합 형성 — 큰 흐름',
    meaning: '오늘의 기운이 원국의 지지 2개와 만나 삼합 국을 이룹니다. 평소보다 확장된 기회나 큰 방향 전환이 나타날 수 있어요.',
  };
  // 천간합 or 육합
  return { headline: HAP[pillar]?.h || '조화', meaning: HAP[pillar]?.m || '해당 영역에 조화·협력의 기운이 강해집니다.' };
}

/** 일진(또는 특정 날짜의 갑자)과 원국 4주 사이의 합·충 관계 탐지.
 *  @param ps 원국 pillars [시주, 일주, 월주, 년주]
 *  @param dayHanja 비교할 일진 한자 2자 (예: '甲子')
 */
export function detectDayHapChung(ps: Pillar[], dayHanja: string): DayHapChungItem[] {
  if (!dayHanja || dayHanja.length !== 2) return [];
  const dCg = dayHanja[0];
  const dJj = dayHanja[1];
  const result: DayHapChungItem[] = [];
  const labels = ['시주', '일주', '월주', '년주'];

  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    // 천간합
    if (p.c && CG_HAP[dCg] === p.c) {
      const t = translateDayPillarInteraction(labels[i], '천간합');
      result.push({
        type: '천간합', with: labels[i], chars: `${dCg}${p.c}`,
        headline: t.headline, meaning: t.meaning, good: true,
      });
    }
    // 지지 육합
    if (p.j && JJ_YUKHAP[dJj] === p.j) {
      const t = translateDayPillarInteraction(labels[i], '육합');
      result.push({
        type: '육합', with: labels[i], chars: `${dJj}${p.j}`,
        headline: t.headline, meaning: t.meaning, good: true,
      });
    }
    // 지지 충
    if (p.j && JJ_CHUNG[dJj] === p.j) {
      const t = translateDayPillarInteraction(labels[i], '충');
      result.push({
        type: '충', with: labels[i], chars: `${dJj}${p.j}`,
        headline: t.headline, meaning: t.meaning, good: false,
      });
    }
  }

  // 삼합: 오늘 지지 + 원국 지지 2개로 삼합 국 완성
  const branches = ps.map(p => p.j).filter(Boolean);
  for (const [a, b, c, el] of SAMHAP) {
    const trio = [a, b, c];
    if (!trio.includes(dJj)) continue;
    const others = trio.filter(x => x !== dJj);
    if (others.every(o => branches.includes(o))) {
      const t = translateDayPillarInteraction('', '삼합');
      result.push({
        type: '삼합', with: '원국 전체', chars: trio.join(''),
        headline: `${el}국 완성 — ${t.headline.replace('원국과 삼합 형성 — ', '')}`,
        meaning: t.meaning, good: true,
      });
    }
  }

  return result;
}

// ── 용신 득실 평가 (특정 갑자가 용신에게 유리/불리한가) ──
export type YongsinRating = 'favor' | 'neutral' | 'caution';
export interface YongsinMonthEval {
  rating: YongsinRating;
  score: number;   // -2~+2
  reason: string;
}

// ── 일일 개인화 인사이트 (원국 결핍 보충·합충 카테고리 영향) ──
export interface ElementComplement {
  lackingOh: string;      // 원국 결여 오행
  dayBranch: string;      // 오늘 지지
  hiddenGan: string;      // 보충해주는 지장간 한자
  weight: '본기' | '중기' | '여기';
  sipsung: string;        // 일간 기준 십성
  strength: '강' | '보통' | '약';  // 보충 세기 (본기=강, 중기=보통, 여기=약)
  desc: string;           // 사람 친화적 해석
}

export interface CategoryImpactNote {
  category: string;       // '재물운', '건강운', '연애운', '직장운', '학업운'
  note: string;           // 오늘 특이사항 해설
  tone: 'positive' | 'negative' | 'neutral';
}

export interface DailyInsight {
  complements: ElementComplement[];
  categoryNotes: CategoryImpactNote[];
}

/** 오늘 일진 지지의 지장간이 원국 결여 오행을 보충하는지 분석 */
function analyzeElementComplement(
  ilgan: string,
  dayJj: string,
  lacking: string[],
): ElementComplement[] {
  if (!ilgan || !dayJj || lacking.length === 0) return [];
  const hidden = JJG[dayJj] || [];
  const weights: ('여기' | '중기' | '본기')[] =
    hidden.length === 1 ? ['본기']
    : hidden.length === 2 ? ['여기', '본기']
    : ['여기', '중기', '본기'];
  const strengthMap = { '본기': '강', '중기': '보통', '여기': '약' } as const;

  const results: ElementComplement[] = [];
  hidden.forEach((h, i) => {
    const oh = CG_OH[h];
    if (!lacking.includes(oh)) return;
    const weight = weights[i];
    const strength = strengthMap[weight];
    const ss = sipsung(ilgan, h);
    const domain =
      ss === '정인' || ss === '편인' ? '학습·자기성찰' :
      ss === '식신' || ss === '상관' ? '표현·창작' :
      ss === '편재' || ss === '정재' ? '재물·실행' :
      ss === '편관' || ss === '정관' ? '책임·성취' :
      ss === '비견' || ss === '겁재' ? '관계·독립' : '활동';
    results.push({
      lackingOh: oh,
      dayBranch: dayJj,
      hiddenGan: h,
      weight,
      sipsung: ss,
      strength,
      desc: `원국에 없던 ${oh}(${ss}) 기운이 오늘 ${dayJj} 속 ${weight} ${h}로 ${strength}하게 보충됩니다. ${domain} 쪽이 평소보다 잘 풀릴 수 있어요.`,
    });
  });
  return results;
}

/** 합충이 각 카테고리에 미치는 영향을 해설 */
function analyzeCategoryImpact(dayHapChung: DayHapChungItem[]): CategoryImpactNote[] {
  const notes: CategoryImpactNote[] = [];
  // 주(柱)별 관여 카테고리 (전통적 주-영역 매핑)
  const pillarToCategories: Record<string, string[]> = {
    '시주': ['학업운'],          // 자녀·미래·실현 → 학업·자기계발
    '일주': ['연애운', '건강운'], // 나·배우자궁 → 관계·몸
    '월주': ['직장운', '학업운'], // 사회·직장 → 직장·배움
    '년주': ['재물운'],          // 가정·뿌리 → 재물·기반
  };

  for (const hc of dayHapChung) {
    const cats = pillarToCategories[hc.with] || [];
    const isGood = hc.good === true;
    for (const cat of cats) {
      let note = '';
      if (hc.type === '충') {
        if (cat === '연애운' && hc.with === '일주') {
          note = `오늘 일진이 배우자궁(일지 ${hc.chars[1]})과 충합니다. 연인과 사소한 갈등·감정 기복이 생기기 쉬우니 즉답을 피하고 한 템포 쉬어 대응하세요.`;
        } else if (cat === '건강운' && hc.with === '일주') {
          note = `일진이 일주 지지와 충하여 몸이 불안정할 수 있습니다. 평소 약한 부위에 신호가 올 수 있으니 무리하지 마세요.`;
        } else if (cat === '직장운' && hc.with === '월주') {
          note = `일진이 월주(직장궁)와 충합니다. 업무에 갑작스런 변수·일정 변경이 생길 수 있으니 우선순위를 유연하게 조정하세요.`;
        } else if (cat === '학업운' && hc.with === '월주') {
          note = `일진이 월주와 충하여 집중력이 흐트러지기 쉽습니다. 긴 학습보다 짧게 여러 번 나눠 접근하세요.`;
        } else if (cat === '재물운' && hc.with === '년주') {
          note = `일진이 년주(가정·뿌리)와 충합니다. 가족 관련 지출이나 갑작스러운 비용에 대비하세요.`;
        } else {
          note = `${hc.with}와 충하여 해당 영역에 변동·긴장이 있습니다.`;
        }
      } else if (hc.type === '천간합' || hc.type === '육합') {
        if (cat === '연애운' && hc.with === '일주') {
          note = `일진이 일주와 합을 이루어 연인·배우자와 유난히 마음이 잘 통합니다. 중요한 대화나 화해에 좋은 날.`;
        } else if (cat === '직장운' && hc.with === '월주') {
          note = `일진과 월주가 합하여 직장에서 협업·인간관계가 매끄럽게 풀립니다. 제안·미팅에 유리합니다.`;
        } else if (cat === '학업운' && (hc.with === '월주' || hc.with === '시주')) {
          note = `일진과 ${hc.with} 합으로 배움·창작에 집중력이 잘 모입니다.`;
        } else if (cat === '재물운' && hc.with === '년주') {
          note = `일진이 년주와 합하여 가족·기반과 관련된 작은 재물 기회가 생길 수 있습니다.`;
        } else {
          note = `${hc.with}와 합을 이루어 이 영역에 조화·협력의 기운이 강해집니다.`;
        }
      } else if (hc.type === '삼합') {
        note = `오늘 일진이 원국과 삼합을 이루어 전반적인 흐름이 크게 움직입니다. ${cat}에서도 평소보다 확장된 기회·변화가 나타날 수 있습니다.`;
      }
      if (note) {
        notes.push({
          category: cat,
          note,
          tone: isGood ? 'positive' : hc.good === false ? 'negative' : 'neutral',
        });
      }
    }
  }
  return notes;
}

/** 원국 + 오늘 일진을 종합해 개인화된 인사이트 생성 */
export function generateDailyInsights(
  ps: Pillar[],
  structure: StructureAnalysis | null,
  todayFortune: TodayFortuneResult | null,
): DailyInsight {
  if (!structure || !todayFortune) return { complements: [], categoryNotes: [] };
  const ilgan = ps[1].c;
  const dayJj = todayFortune.dayPillarHanja[1] || '';
  const complements = analyzeElementComplement(ilgan, dayJj, structure.distribution.lacking);
  const hapChung = detectDayHapChung(ps, todayFortune.dayPillarHanja);
  const categoryNotes = analyzeCategoryImpact(hapChung);
  return { complements, categoryNotes };
}

/** 특정 천간·지지가 용신 오행에게 어떤 영향을 주는지 평가.
 *  @param cg 천간 한자 (예: '甲')
 *  @param jj 지지 한자 (예: '子')
 *  @param yongsinOh 용신 오행 ('목'·'화'·'토'·'금'·'수')
 */
export function evaluateForYongsin(cg: string, jj: string, yongsinOh: string): YongsinMonthEval {
  if (!yongsinOh) return { rating: 'neutral', score: 0, reason: '용신 미확정' };
  const yIdx = OH_LIST.indexOf(yongsinOh);
  if (yIdx < 0) return { rating: 'neutral', score: 0, reason: '' };

  const helpOh = OH_LIST[(yIdx + 4) % 5];  // 용신을 生하는 오행 (희신)
  const harmOh = OH_LIST[(yIdx + 3) % 5];  // 용신을 剋하는 오행 (기신)

  const cgOh = CG_OH[cg] || '';
  const jjOh = JJ_OH[jj] || '';

  let score = 0;
  const reasons: string[] = [];
  for (const [oh, label] of [[cgOh, '천간'], [jjOh, '지지']]) {
    if (!oh) continue;
    if (oh === yongsinOh) { score += 1; reasons.push(`${label}이 용신(${oh})과 같음`); }
    else if (oh === helpOh) { score += 1; reasons.push(`${label}이 용신을 생함(${oh}생${yongsinOh})`); }
    else if (oh === harmOh) { score -= 1; reasons.push(`${label}이 용신을 극함(${oh}극${yongsinOh})`); }
  }

  let rating: YongsinRating;
  if (score >= 1) rating = 'favor';
  else if (score <= -1) rating = 'caution';
  else rating = 'neutral';

  return { rating, score, reason: reasons.join(' · ') || '중립' };
}