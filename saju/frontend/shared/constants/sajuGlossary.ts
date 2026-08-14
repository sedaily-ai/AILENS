export interface GlossaryEntry {
  en: string;
  hanja?: string;
  desc?: string;
}

// 오행 — Five Elements
export const FIVE_ELEMENTS = {
  '목': { en: 'Wood', hanja: '木', desc: 'growth, expansion, vitality' },
  '화': { en: 'Fire', hanja: '火', desc: 'energy, expression, passion' },
  '토': { en: 'Earth', hanja: '土', desc: 'stability, accumulation, trust' },
  '금': { en: 'Metal', hanja: '金', desc: 'precision, decision, structure' },
  '수': { en: 'Water', hanja: '水', desc: 'flow, intuition, adaptability' },
} as const satisfies Record<string, GlossaryEntry>;

// 천간 — Ten Heavenly Stems (yang/yin × 5 elements)
export const HEAVENLY_STEMS = {
  '갑': { en: 'Gab (Yang Wood)', hanja: '甲', desc: 'yang Wood — tall tree' },
  '을': { en: 'Eul (Yin Wood)', hanja: '乙', desc: 'yin Wood — vine, grass' },
  '병': { en: 'Byeong (Yang Fire)', hanja: '丙', desc: 'yang Fire — sun' },
  '정': { en: 'Jeong (Yin Fire)', hanja: '丁', desc: 'yin Fire — candle, lamp' },
  '무': { en: 'Mu (Yang Earth)', hanja: '戊', desc: 'yang Earth — mountain' },
  '기': { en: 'Gi (Yin Earth)', hanja: '己', desc: 'yin Earth — field, soil' },
  '경': { en: 'Gyeong (Yang Metal)', hanja: '庚', desc: 'yang Metal — sword, axe' },
  '신': { en: 'Sin (Yin Metal)', hanja: '辛', desc: 'yin Metal — jewel, blade' },
  '임': { en: 'Im (Yang Water)', hanja: '壬', desc: 'yang Water — ocean, river' },
  '계': { en: 'Gye (Yin Water)', hanja: '癸', desc: 'yin Water — rain, dew' },
} as const satisfies Record<string, GlossaryEntry>;

// 지지 — Twelve Earthly Branches (Korean reading + zodiac animal)
export const EARTHLY_BRANCHES = {
  '자': { en: 'Ja (Rat)', hanja: '子', desc: 'yang Water — midnight' },
  '축': { en: 'Chuk (Ox)', hanja: '丑', desc: 'yin Earth — late winter' },
  '인': { en: 'In (Tiger)', hanja: '寅', desc: 'yang Wood — early spring' },
  '묘': { en: 'Myo (Rabbit)', hanja: '卯', desc: 'yin Wood — mid spring' },
  '진': { en: 'Jin (Dragon)', hanja: '辰', desc: 'yang Earth — late spring' },
  '사': { en: 'Sa (Snake)', hanja: '巳', desc: 'yin Fire — early summer' },
  '오': { en: 'O (Horse)', hanja: '午', desc: 'yang Fire — noon' },
  '미': { en: 'Mi (Goat)', hanja: '未', desc: 'yin Earth — late summer' },
  '신': { en: 'Sin (Monkey)', hanja: '申', desc: 'yang Metal — early autumn' },
  '유': { en: 'Yu (Rooster)', hanja: '酉', desc: 'yin Metal — mid autumn' },
  '술': { en: 'Sul (Dog)', hanja: '戌', desc: 'yang Earth — late autumn' },
  '해': { en: 'Hae (Pig)', hanja: '亥', desc: 'yin Water — early winter' },
} as const satisfies Record<string, GlossaryEntry>;

// 십성 — Ten Gods (individual relationship roles)
export const TEN_GODS = {
  '비견': { en: 'Peer', hanja: '比肩', desc: 'shared identity — friend, ally' },
  '겁재': { en: 'Rob Wealth', hanja: '劫財', desc: 'competing peer — sibling rivalry' },
  '식신': { en: 'Eating God', hanja: '食神', desc: 'calm creativity, craft' },
  '상관': { en: 'Hurting Officer', hanja: '傷官', desc: 'expressive talent, performance' },
  '편재': { en: 'Indirect Wealth', hanja: '偏財', desc: 'opportunistic income, deals' },
  '정재': { en: 'Direct Wealth', hanja: '正財', desc: 'salary, steady earnings' },
  '편관': { en: 'Indirect Officer', hanja: '偏官', desc: 'pressure, challenge, power' },
  '정관': { en: 'Direct Officer', hanja: '正官', desc: 'rules, position, recognition' },
  '편인': { en: 'Indirect Resource', hanja: '偏印', desc: 'intuition, unconventional learning' },
  '정인': { en: 'Direct Resource', hanja: '正印', desc: 'education, mentorship, support' },
} as const satisfies Record<string, GlossaryEntry>;

// 십성 묶음 — Ten Gods aggregated into 5 axes
export const TEN_GODS_AXIS = {
  '비겁': { en: 'Peers axis', hanja: '比劫', desc: 'self & companion — independence, networks' },
  '식상': { en: 'Output axis', hanja: '食傷', desc: 'creation & expression — talent, results' },
  '재성': { en: 'Wealth axis', hanja: '財星', desc: 'money & assets — earning, spending' },
  '관성': { en: 'Authority axis', hanja: '官星', desc: 'career & structure — title, rules' },
  '인성': { en: 'Resource axis', hanja: '印星', desc: 'learning & support — knowledge, mentors' },
} as const satisfies Record<string, GlossaryEntry>;

// 시기 단위 — Time-period scopes used across fortune readings
export const TIME_PERIODS = {
  '원국': { en: 'Birth Chart', hanja: '原局', desc: 'the natal chart from your birth time' },
  '대운': { en: 'Life Cycle', hanja: '大運', desc: 'ten-year life phase' },
  '세운': { en: 'Year Fortune', hanja: '歲運', desc: "this year's energy" },
  '월운': { en: 'Month Fortune', hanja: '月運', desc: "this month's energy" },
  '일진': { en: 'Day Fortune', hanja: '日辰', desc: "today's energy" },
  '만세력': { en: 'Saju Calendar', hanja: '萬歲曆', desc: 'tabulated birth-time pillar reference' },
} as const satisfies Record<string, GlossaryEntry>;

// 4주 — Pillar labels
export const PILLAR_LABELS = {
  '년주': { en: 'Year Pillar', hanja: '年柱', desc: 'lineage, early life' },
  '월주': { en: 'Month Pillar', hanja: '月柱', desc: 'environment, career frame' },
  '일주': { en: 'Day Pillar', hanja: '日柱', desc: 'self, partner relationship' },
  '시주': { en: 'Hour Pillar', hanja: '時柱', desc: 'children, later life' },
  '일간': { en: 'Day Stem (You)', hanja: '日干', desc: 'your core identity element' },
} as const satisfies Record<string, GlossaryEntry>;

// 상호작용 — Pillar interactions between stems/branches
export const INTERACTIONS = {
  '합': { en: 'Harmony', hanja: '合', desc: 'compatible binding, attraction' },
  '충': { en: 'Clash', hanja: '衝', desc: 'head-on conflict, sudden change' },
  '형': { en: 'Punishment', hanja: '刑', desc: 'harsh tension, friction' },
  '파': { en: 'Break', hanja: '破', desc: 'subtle rupture, undermining' },
  '해': { en: 'Harm', hanja: '害', desc: 'draining hostility, hidden damage' },
} as const satisfies Record<string, GlossaryEntry>;

// 평가 톤 — Evaluation tones used in scoring & narrative
export const EVALUATION_TONES = {
  '길': { en: 'Auspicious', hanja: '吉', desc: 'favorable, supportive timing' },
  '흉': { en: 'Caution', hanja: '凶', desc: 'unfavorable, hold back' },
  '평이': { en: 'Steady', desc: 'neutral, no strong signal' },
  '정점': { en: 'Peak', desc: 'high point — push forward' },
  '저점': { en: 'Trough', desc: 'low point — recover & prepare' },
  '상승기': { en: 'Rising Phase', desc: 'momentum building' },
  '하락기': { en: 'Falling Phase', desc: 'energy winding down' },
} as const satisfies Record<string, GlossaryEntry>;

// 12운성 — Twelve Life Stages of Day Stem energy across branches
export const TWELVE_STAGES = {
  '장생': { en: 'Birth', hanja: '長生', desc: 'fresh start, new beginnings' },
  '목욕': { en: 'Bath', hanja: '沐浴', desc: 'cleansing, instability, exposure' },
  '관대': { en: 'Coronation', hanja: '冠帶', desc: 'early growth, taking responsibility' },
  '건록': { en: 'Prosperity', hanja: '建祿', desc: 'settling in, earning your place' },
  '제왕': { en: 'Emperor', hanja: '帝旺', desc: 'full strength, prime' },
  '쇠': { en: 'Decline', hanja: '衰', desc: 'gentle waning, wisdom phase' },
  '병': { en: 'Illness', hanja: '病', desc: 'vulnerability, slow recovery' },
  '사': { en: 'Death', hanja: '死', desc: 'completion, closure' },
  '묘': { en: 'Burial', hanja: '墓', desc: 'rest, hidden potential' },
  '절': { en: 'Void', hanja: '絕', desc: 'isolation, hard reset' },
  '태': { en: 'Conception', hanja: '胎', desc: 'new seed forming' },
  '양': { en: 'Nurturing', hanja: '養', desc: 'preparation, gentle growth' },
} as const satisfies Record<string, GlossaryEntry>;

// 신살 — Sinsal (spirit influences) commonly surfaced in UI
export const SINSAL = {
  '천을귀인': { en: 'Heavenly Helper', hanja: '天乙貴人', desc: 'powerful protector, lucky benefactor' },
  '문창귀인': { en: "Scholar's Star", hanja: '文昌貴人', desc: 'academic talent, intellectual luck' },
  '역마살': { en: 'Travel Star', hanja: '驛馬煞', desc: 'movement, change, mobility' },
  '도화살': { en: 'Charm Star', hanja: '桃花煞', desc: 'attraction, popularity, romance' },
  '화개살': { en: 'Solitary Star', hanja: '華蓋煞', desc: 'introspection, art, spirituality' },
  '겁살': { en: 'Loss Star', hanja: '劫煞', desc: 'sudden setbacks, theft' },
  '재살': { en: 'Trap Star', hanja: '災煞', desc: 'obstacles, hidden danger' },
} as const satisfies Record<string, GlossaryEntry>;

// 페이지/기능명 — Feature & page names
export const FEATURE_NAMES = {
  '사주': { en: 'Saju', hanja: '四柱', desc: 'Korean Astrology — Four Pillars of Destiny' },
  '운세': { en: 'Fortune', desc: 'fortune reading' },
  '오늘의 운세': { en: "Today's Fortune", desc: 'daily reading dashboard' },
  '재운': { en: 'Wealth Fortune', hanja: '財運', desc: 'money & income outlook' },
  '재운 흐름': { en: 'Wealth Flow', desc: 'wealth fortune over time' },
  '커리어': { en: 'Career', desc: 'career outlook' },
  '커리어 흐름': { en: 'Career Flow', desc: 'career fortune over time' },
  '만세력 저장': { en: 'Save Profile', desc: 'save this birth chart for later' },
} as const satisfies Record<string, GlossaryEntry>;

// 입력 라벨 — Birth-info input form labels
export const INPUT_LABELS = {
  '양력': { en: 'Solar', desc: 'Gregorian calendar' },
  '음력': { en: 'Lunar', desc: 'lunar calendar' },
  '생년월일': { en: 'Birth Date' },
  '생시': { en: 'Birth Time' },
  '시간 모름': { en: 'Time Unknown' },
  '도시': { en: 'City', desc: 'for longitude correction' },
  '경도보정': { en: 'Longitude Correction', desc: 'adjusts solar time by your city' },
  '시진': { en: 'Sijin', hanja: '時辰', desc: 'traditional 2-hour period' },
  '성별': { en: 'Gender' },
  '남': { en: 'Male' },
  '여': { en: 'Female' },
} as const satisfies Record<string, GlossaryEntry>;
