/**
 * 사주 상세 해석 빌더 — 성격(性), 운(運), 재미 콘텐츠 구성
 */
import type { Pillar, ChongunResult, DaeunEntry, YeonunEntry, WolunEntry } from './engine';
import { CG_OH, JJ_OH, sipsung, unsung, buildStructureAnalysis } from './engine';
import type { StructureAnalysis } from './engine';

// ── 타입 정의 ──

export interface PersonalitySection {
  headline: string;
  temperament: string;
  temperamentSummary: string;
  strengths: string[];
  weaknesses: string[];
  strengthsWeaknessesSummary: string;
  stressPattern: string;
  stressPatternSummary: string;
  bestEnvironment: string;
  bestEnvironmentSummary: string;
}

export interface FortuneFlowSection {
  headline: string;
  overall: string;
  overallSummary: string;
  love: string;
  loveSummary: string;
  wealth: string;
  wealthSummary: string;
  career: string;
  careerSummary: string;
  health: string;
  healthSummary: string;
  relationships: string;
  relationshipsSummary: string;
}

export interface FunContentSection {
  headline: string;
  luckyItems: { color: string; number: string; item: string };
  bestMatch: string;
  cautionPeriod: string;
  dailyAdvice: string;
}

export interface DetailedFortuneData {
  personality: PersonalitySection;
  fortune: FortuneFlowSection;
  fun: FunContentSection;
}

// ── 일간별 성격 데이터 ──

const PERSONALITY_DATA: Record<string, {
  headline: string;
  temperament: string;
  stressPattern: string;
  bestEnvironment: string;
}> = {
  '甲': {
    headline: '곧게 뻗은 큰 나무, 타고난 개척자',
    temperament: '정의감이 강하고 자존심이 높은 리더형입니다. 한번 방향을 정하면 우직하게 밀고 나가는 추진력이 있으며, 새로운 길을 여는 선구자적 기질을 가졌습니다. 큰 나무가 하늘을 향해 곧게 자라듯, 목표를 향한 의지가 확고하고 어떤 역경에서도 중심을 잃지 않습니다. 타고난 리더십으로 주변 사람들을 자연스럽게 이끌며, 맡은 일에 대한 책임감이 남다릅니다. 원칙과 명예를 무엇보다 중시하는 성향으로, 한번 신뢰를 얻으면 끝까지 함께하는 의리가 있습니다.',
    stressPattern: '고집이 세져서 주변 의견을 완전히 차단하고, 혼자 모든 것을 떠안으려 합니다. 자존심이 극도로 예민해져 사소한 지적에도 크게 반응하며, "내가 다 해야 해"라는 압박에 시달립니다. 이 상태가 지속되면 주변과의 소통이 단절되고, 고립감 속에서 번아웃으로 이어질 수 있습니다. 스트레스 해소법으로는 자연 속 산책이나 목표 달성 리스트를 통한 작은 성취감 확인이 효과적입니다.',
    bestEnvironment: '주도권이 있는 환경, 명확한 목표가 있는 조직, 개척이 필요한 새로운 프로젝트가 어울립니다. 상명하달 구조보다는 자신이 방향을 설정할 수 있는 자율적 리더 포지션에서 최대 역량을 발휘합니다. 스타트업 창업, 프로젝트 리더, 신사업 개척 등이 적합합니다.',
  },
  '乙': {
    headline: '유연한 덩굴, 어디든 적응하는 생존 달인',
    temperament: '부드럽고 섬세하며 예술적 감각이 탁월합니다. 겉으로는 유순해 보이지만 내면에는 질기고 끈기 있는 생명력이 숨어 있습니다. 덩굴이 바위를 타고 오르듯, 어떤 환경에서든 적응하며 자신만의 방식으로 성장해 나갑니다. 사람 사이의 미묘한 감정을 읽는 능력이 뛰어나고, 갈등을 부드럽게 풀어내는 중재력이 있습니다. 직접적인 대립보다 우회적 접근을 선호하며, 시간이 걸리더라도 결국 원하는 것을 이루어내는 전략가적 면모가 있습니다.',
    stressPattern: '결정을 계속 미루며 우유부단해지고, 갈등을 극도로 회피합니다. 속마음을 감추다 내면에 스트레스가 폭발하듯 쌓이며, 자기 의견을 내지 못하고 남의 뜻에 끌려다니게 됩니다. "나는 왜 항상 이런가" 하는 자기 비하에 빠지기 쉽고, 타인에 대한 의존도가 높아집니다. 이때는 혼자만의 시간을 통해 진짜 원하는 것이 무엇인지 정리하는 것이 도움됩니다.',
    bestEnvironment: '협업 중심의 팀, 창작·예술적 자유가 보장되는 공간, 인간관계를 활용할 수 있는 역할이 어울립니다. 경쟁이 치열한 환경보다는 서로 도우며 성장하는 분위기에서 재능이 꽃피게 됩니다. 디자인, 상담, 중재, 마케팅 등 섬세함과 관계 능력이 빛나는 분야가 적합합니다.',
  },
  '丙': {
    headline: '세상을 비추는 태양, 열정의 아이콘',
    temperament: '밝고 화려하며 열정적입니다. 어디에 있든 존재감이 뚜렷하고, 주변 사람들에게 긍정적 에너지를 전파하는 능력이 있습니다. 태양이 만물을 차별 없이 비추듯, 누구에게나 따뜻하게 다가가며 분위기를 이끄는 천부적 재능이 있습니다. 열정이 넘쳐서 여러 일을 동시에 벌이기도 하고, 시작할 때의 추진력은 주변을 놀라게 합니다. 솔직하고 거침없는 표현력으로 사람들의 마음을 움직이는 설득력을 지녔습니다.',
    stressPattern: '감정 기복이 극심해지고 참을성이 바닥납니다. 과도한 에너지 소모로 번아웃에 빠지거나, 즉흥적 결정으로 후회할 일을 만듭니다. 주변에 화를 쏟아내거나, 반대로 갑작스럽게 의욕을 잃고 무기력해지는 양극단이 나타날 수 있습니다. 규칙적인 수면과 운동, 그리고 속도를 늦추는 연습이 가장 효과적인 해소법입니다.',
    bestEnvironment: '무대 위의 역할, 대인 접촉이 많은 업무, 에너지를 발산할 수 있는 역동적 환경이 어울립니다. 정해진 틀 안에서 반복적인 일을 하면 금방 지루해하시므로, 매일 새로운 사람을 만나거나 변화가 있는 업무가 좋습니다. 영업, 방송, 이벤트 기획, 강연 등이 적합합니다.',
  },
  '丁': {
    headline: '은은한 촛불, 내면의 열정가',
    temperament: '조용하지만 깊은 사고력과 섬세한 관찰력을 지녔습니다. 겉은 차분하나 내면에는 뜨거운 열정이 흐르며, 예의 바르고 사려 깊은 인상을 줍니다. 촛불이 어둠 속에서 중요한 것만 비추듯, 핵심을 꿰뚫는 통찰력이 있고 집중하면 놀라운 깊이를 보여줍니다. 겉으로 드러내지 않지만 내면의 열정과 사명감은 누구보다 강하며, 관심 분야에서는 한없이 파고드는 전문가적 면모가 있습니다. 세심한 배려로 가까운 사람들에게는 든든한 존재입니다.',
    stressPattern: '속마음을 더욱 감추며 자기 안에 갇힙니다. 소통을 차단하고 혼자 고민하며, 사소한 것에도 과도하게 신경을 써 예민해집니다. 마치 촛불이 바람에 흔들리듯, 내면의 불안이 커지면 잠을 못 이루거나 과도한 완벽주의에 빠집니다. 신뢰할 수 있는 사람에게 고민을 꺼내놓거나, 글쓰기를 통해 내면을 정리하면 안정을 되찾습니다.',
    bestEnvironment: '깊이 있는 연구·분석이 필요한 역할, 소규모 팀, 자율성이 보장되는 전문직이 어울립니다. 대규모 조직에서 정치적 관계를 맺기보다는, 실력으로 인정받는 환경에서 빛을 발합니다. 연구원, 전문 상담사, 작가, 애널리스트, 프로그래머 등이 적합합니다.',
  },
  '戊': {
    headline: '듬직한 큰 산, 흔들리지 않는 중심',
    temperament: '신뢰감이 있고 포용력이 큰 중재자형입니다. 안정적이고 든든하며, 주변 사람들에게 편안함과 믿음을 줍니다. 큰 산이 사계절 변하지 않고 그 자리를 지키듯, 어떤 상황에서도 중심을 잡아주는 존재입니다. 감정적 동요가 적고 침착하며, 주변 사람들 사이에서 갈등을 조율하는 자연스러운 중재자 역할을 합니다. 신뢰를 얻는 데 시간이 걸리지만, 한번 쌓인 신뢰는 오래 지속됩니다. 큰 그림을 보는 안목이 있어 장기적 계획에 강점을 보입니다.',
    stressPattern: '무기력해지며 변화에 완전히 둔감해집니다. 마치 산이 움직이지 않는 것처럼, 어떤 행동도 하기 싫어지고 문제를 방치합니다. 이 상태가 지속되면 결단을 내려야 할 순간을 놓치고, 상황이 손쓸 수 없이 커진 뒤에야 움직이게 됩니다. 가벼운 운동이나 짧은 여행 등 일상에 작은 변화를 주는 것이 무기력 해소에 효과적입니다.',
    bestEnvironment: '안정적인 조직, 중재·조율이 필요한 위치, 장기 프로젝트를 이끄는 관리 역할이 어울립니다. 급변하는 스타트업보다는 체계가 잡힌 조직에서 힘을 발휘하며, 인사·총무·경영관리·부동산 등 안정성과 신뢰가 핵심인 분야에서 빛을 발합니다.',
  },
  '己': {
    headline: '비옥한 논밭, 따뜻한 보살핌의 달인',
    temperament: '온화하고 현실적이며 실속 있는 사람입니다. 겸손하고 인내심이 강하며, 주변을 잘 보살피는 모성애가 돋보입니다. 논밭이 씨앗을 품어 결실을 맺듯, 사람과 일을 정성스럽게 가꾸는 능력이 뛰어납니다. 화려함보다 실질적 성과를 중시하고, 말보다 행동으로 보여주는 묵묵한 실력파입니다. 세밀한 관찰력으로 주변의 변화를 빠르게 감지하며, 실수를 줄이는 꼼꼼함이 있습니다. 가까운 사람에게는 헌신적이며, 든든한 뒷받침 역할을 자처합니다.',
    stressPattern: '의심이 많아지고 소심해지며, 주변의 시선에 과도하게 신경 씁니다. 자기 비하에 빠지거나 결정을 전적으로 남에게 미루며, "내가 잘못한 건 아닌가" 하는 불안에 시달립니다. 극단적으로는 아무것도 하지 않는 것이 안전하다고 느껴 모든 시도를 포기하게 됩니다. 자신의 작은 성취를 기록하고 확인하는 습관이 자존감 회복에 도움됩니다.',
    bestEnvironment: '실무 중심의 역할, 사람을 돌보는 일, 세밀한 관리가 필요한 분야가 어울립니다. 누군가를 서포트하거나 세부 사항을 완벽하게 관리하는 일에서 진가를 발휘합니다. 회계, 영양사, 비서직, 품질관리, 교육 보조 등이 적합합니다.',
  },
  '庚': {
    headline: '서리 내린 광산의 원철, 숙살의 무인',
    temperament: '가공되지 않은 거대한 원철처럼, 겉으로는 차갑고 날카로운 인상을 주지만 그 단단함을 유지하기 위해 내면에서 끊임없이 스스로를 벼리는 사람입니다. 공과 사의 경계가 명확하고 맺고 끊음이 확실하며, 한번 결정하면 뒤돌아보지 않는 숙살의 기운을 품고 있습니다. 남에게 짐이 되기 싫어 힘든 일도 혼자 꾸역꾸역 버텨내는 강인한 자존심이 있으며, 위기 상황에서 판을 뒤집는 비범한 카리스마와 절대 타협하지 않는 생존 본능이 발동합니다. 의리가 있어 한번 인연을 맺으면 끝까지 지키지만, 직설적이고 솔직해서 돌려 말하는 것을 못합니다. 그 단단함 뒤에는 상처받기 싫어 세운 방어벽이 있고, 그 성벽 내부에는 누구보다 뜨거운 열정과 순수한 의지가 가득 차 있습니다.',
    stressPattern: '비대해진 금 기운의 방어기제가 극대화되어 타인의 조언을 완전히 밀어내고 스스로를 고립시킵니다. 내면의 기준이 너무 확고해서 주변이 내 뜻대로 정돈되지 않을 때 극심한 스트레스를 받고, 차갑게 냉소하거나 날카로운 독단으로 표출됩니다. 세상이 투영하는 차가움은 사실 상처받지 않으려는 방어벽이며, 이 상태가 지속되면 관계가 경직되고 "왜 나만 이렇게 치열한 삶의 무게를 버텨야 하는가"라는 근원적 외로움에 빠집니다. 격렬한 운동으로 에너지를 물리적으로 발산하거나, 경쟁에서 벗어나 푸른 자연(목·수 기운) 속에서 쉬며 견고한 성벽을 잠시 내리는 것이 효과적입니다.',
    bestEnvironment: '실력으로 승부하는 성과 중심 환경, 명확한 책임과 권한이 주어지는 현장 중심 역할이 최적입니다. 칼날 같은 전문성을 휘두를 수 있는 법조, 의료, 공학, 금융분석, 위기관리, 심도 있는 상담업 및 기획 전문가 직무에서 타고난 재능이 빛을 발합니다. 정치적 눈치보기가 필요한 환경보다, 공과 사가 분명하고 결과로 인정받는 구조에서 탁월한 리더십과 추진력을 발휘합니다.',
  },
  '辛': {
    headline: '빛나는 보석, 완벽을 추구하는 심미안',
    temperament: '섬세하고 감수성이 풍부하며 완벽주의적입니다. 심미안이 뛰어나고 자기만의 기준이 확고하며, 예리한 분석력을 지녔습니다. 보석이 정교한 가공을 거쳐 빛나듯, 자기 자신과 자신의 산출물을 끊임없이 다듬는 장인정신이 있습니다. 취향이 확고하고 감각적 판단이 정확하며, 남들이 놓치는 디테일을 포착하는 눈이 있습니다. 외적으로는 깔끔하고 세련된 인상을 주며, 내면적으로는 자기만의 세계를 탐구하는 깊이가 있습니다.',
    stressPattern: '비판적 성향이 극대화되어 자신과 타인 모두에게 날카로워집니다. 완벽주의가 강박으로 변하며, 작은 흠에도 과민반응을 보입니다. "왜 이것밖에 안 되지"라는 자기 질책이 심해지고, 주변에도 같은 기준을 요구하며 관계가 경직됩니다. 예술 감상이나 아름다운 것에 몰입하는 시간을 통해 날카로움을 부드럽게 전환할 수 있습니다.',
    bestEnvironment: '품질·디테일이 중요한 전문 분야, 자율적으로 깊이 파고들 수 있는 환경, 미적 감각을 발휘하는 역할이 어울립니다. 대량 생산보다 소량의 정교한 결과물을 만드는 일에서 빛을 발합니다. 보석 디자이너, 편집자, UX 디자이너, 감정평가사, 품질 관리 전문가 등이 적합합니다.',
  },
  '壬': {
    headline: '넓은 바다, 자유로운 지혜의 탐험가',
    temperament: '지혜롭고 포용력이 크며 자유로운 영혼입니다. 창의적이고 진취적이며, 어떤 상황이든 흘러가듯 적응하는 대범함이 있습니다. 바다가 모든 강물을 품듯, 다양한 사람과 경험을 포용하는 넓은 그릇을 지녔습니다. 호기심이 왕성하여 한 분야에 머무르기보다 다양한 영역을 넘나들며, 독창적인 아이디어를 쏟아내는 상상력이 풍부합니다. 틀에 박힌 것을 싫어하고, 자유와 모험을 사랑하며, 낙천적 기질로 어려운 상황에서도 활로를 찾아냅니다.',
    stressPattern: '방종하거나 변덕스러워집니다. 현실을 외면하고 도피처를 찾으며, 약속을 가볍게 여기고 제멋대로 행동합니다. 책임감이 떨어져 시작만 하고 마무리를 못하는 일이 쌓이고, 주변의 신뢰를 잃게 됩니다. 이때는 작은 약속이라도 반드시 지키는 연습과, 하나의 일을 끝까지 마무리하는 경험이 자기 통제력을 회복시킵니다.',
    bestEnvironment: '자유도가 높은 역할, 창의적 기획이 필요한 분야, 다양한 경험을 쌓을 수 있는 환경이 어울립니다. 반복적이고 규격화된 업무는 피하는 것이 좋습니다. 기획자, 탐험가, 작가, 프리랜서, 해외 관련 업무, 벤처 투자 등 변화와 창의성이 핵심인 역할이 적합합니다.',
  },
  '癸': {
    headline: '고요한 이슬, 깊은 직관의 소유자',
    temperament: '조용하고 직관력이 뛰어나며 영적 감수성이 있습니다. 인내심이 강하고 은밀하게 일을 추진하며, 깊은 사고력을 지녔습니다. 이슬이 만물을 적시듯, 눈에 띄지 않지만 꼭 필요한 존재입니다. 겉으로 드러내지 않으나 내면에서 끊임없이 생각하고 분석하며, 직관적으로 본질을 꿰뚫는 통찰력이 있습니다. 감정의 깊이가 남다르고 공감 능력이 뛰어나며, 예술적·영적 분야에서 독보적 감성을 발휘합니다. 은밀하게 움직이나 결정적 순간에 정확한 판단을 내리는 능력이 있습니다.',
    stressPattern: '우울하거나 폐쇄적으로 변합니다. 세상과 소통을 완전히 차단하고, 부정적 사고에 빠져 움츠러듭니다. 모든 일의 최악의 시나리오를 상상하며 행동을 멈추고, 자기 안으로만 깊이 침잠합니다. 이때는 물가를 걷거나, 신뢰할 수 있는 한 사람에게라도 마음을 여는 것이 핵심입니다. 명상이나 일기 쓰기도 내면 정리에 도움됩니다.',
    bestEnvironment: '연구·분석 중심 역할, 조용하고 깊이 있는 업무 환경, 영감이 필요한 창작 분야. 소음과 경쟁이 심한 곳보다, 자기 페이스를 유지할 수 있는 독립적 공간에서 최고의 결과물을 냅니다. 연구원, 심리치료사, 시인, 데이터 과학자, 명상 지도사 등이 적합합니다.',
  },
};

// ── 오행별 행운 아이템 ──
const LUCKY_ITEMS: Record<string, { color: string; number: string; item: string }> = {
  '목': { color: '초록, 청록', number: '3, 8', item: '나무 소품, 화분, 녹색 액세서리' },
  '화': { color: '빨강, 보라', number: '2, 7', item: '양초, 붉은 계열 의류, 전자기기' },
  '토': { color: '노랑, 갈색', number: '5, 10', item: '도자기, 크리스탈, 흙 계열 소품' },
  '금': { color: '흰색, 금색', number: '4, 9', item: '금속 액세서리, 시계, 은 소품' },
  '수': { color: '검정, 남색', number: '1, 6', item: '수정, 물 관련 소품, 어두운 계열 의류' },
};

// ── 오행별 궁합 유형 ──
const BEST_MATCH: Record<string, string> = {
  '목': '수(水) 기운의 사주와 가장 잘 맞습니다. 물이 나무를 키우듯 끊임없이 영감과 정서적 지지를 줍니다. 서로 성장을 돕는 상생 관계로, 목 일간은 수 기운의 파트너에게서 안정감과 지혜를 얻고, 상대는 당신의 추진력에서 에너지를 받습니다. 이 조합은 시간이 갈수록 깊어지는 관계가 됩니다.',
  '화': '목(木) 기운의 사주와 최고의 궁합입니다. 나무가 불을 살리듯 활력과 재능을 끌어내 줍니다. 목 기운의 파트너가 꾸준히 연료를 공급해주어 화 일간의 열정이 지속될 수 있으며, 서로의 에너지가 상승하는 역동적 관계입니다. 함께 있을수록 서로가 더 빛나는 조합입니다.',
  '토': '화(火) 기운의 사주와 자연스럽게 어울립니다. 불이 흙을 만들듯 열정이 안정감으로 전환되는 관계입니다. 화 기운의 파트너가 토 일간에게 활력과 자극을 주고, 토는 그 에너지를 현실적 성과로 변환시킵니다. 서로의 부족한 점을 보완하며 장기적으로 단단해지는 관계입니다.',
  '금': '토(土) 기운의 사주와 깊은 신뢰를 쌓을 수 있습니다. 흙이 금을 품듯 든든하게 지지해주며, 금 일간의 날카로움을 부드럽게 감싸줍니다. 토 기운의 파트너는 안정감과 포용력으로 금 일간이 마음 놓고 자신을 표현할 수 있는 공간을 만들어줍니다. 묵직한 신뢰의 관계입니다.',
  '수': '금(金) 기운의 사주와 흐름이 맞습니다. 금이 물을 생성하듯 지혜와 자원을 제공하며, 수 일간의 깊은 사고에 구조와 틀을 선물합니다. 금 기운의 파트너가 현실적 감각을 더해주어 수 일간의 아이디어가 실현될 수 있도록 돕습니다. 함께 흘러가되 방향을 잡아주는 관계입니다.',
};

// ── 12운성별 주의 시기 ──
const CAUTION_PERIOD: Record<string, string> = {
  '장생': '새 출발의 들뜸에 빠져 기초를 소홀히 할 수 있는 시기입니다. 기반을 다지는 데 시간을 투자하세요. 새로 시작하는 것이 많아지지만, 모든 시작이 결실로 이어지지는 않습니다. 하나를 확실히 뿌리내린 후 다음으로 넘어가세요.',
  '목욕': '감정이 불안정해지기 쉬운 시기입니다. 충동적 결정을 삼가고, 중요한 계약이나 큰 지출은 한 박자 쉬고 결정하세요. 인간관계에서도 감정적 판단이 후회로 이어질 수 있으니, "하루 지나서 결정한다"는 규칙을 권합니다.',
  '관대': '자만심이 올라오기 쉬운 시기입니다. 자신감은 좋지만 겸손을 잃으면 주변이 멀어집니다. 주변의 조언에 귀를 열고, 성과에 취해 방심하지 않도록 주의하세요. 이 시기의 과신이 다음 시기의 위기를 만들 수 있습니다.',
  '건록': '과로와 번아웃을 특히 주의해야 합니다. 전성기일수록 컨디션 관리와 휴식이 중요합니다. 모든 기회를 다 잡으려 하지 말고, 정말 중요한 것에 집중하세요. 체력은 유한합니다. 지금 무리하면 다음 시기에 빚이 됩니다.',
  '제왕': '정점 이후의 하강에 대비하는 지혜가 필요한 시기입니다. 지금의 기운을 저축하듯 관리하세요. 기운이 가장 강할 때 오히려 겸양과 베풂을 실천하면, 하강기에도 주변의 도움을 받을 수 있습니다. 높은 곳에서의 한 발짝 실수가 클 수 있으니 신중하세요.',
  '쇠': '에너지 보존이 핵심인 시기입니다. 무리한 확장이나 새로운 시도보다 현재를 지키는 전략이 유리합니다. 체력과 정신력 모두 절약 모드로 전환하고, 꼭 필요한 일에만 에너지를 집중하세요. 지금은 수성(守成)의 때입니다.',
  '병': '건강과 체력 관리가 최우선인 시기입니다. 무리하지 말고 회복에 집중하세요. 만성 피로나 소화 문제 등 몸이 보내는 신호를 무시하지 마시고, 정기 검진과 충분한 수면을 챙기세요. 이 시기에 건강을 챙겨두면 다음 전환기에 빠르게 회복됩니다.',
  '사': '정체와 막힘이 느껴지는 시기입니다. 억지로 밀어붙이면 오히려 손해가 커집니다. 내면을 돌아보고 진짜 원하는 것이 무엇인지 정리하는 시간으로 삼으세요. 때로는 멈춤이 가장 빠른 전진이 됩니다.',
  '묘': '과거 회고에 빠져 현실을 놓치기 쉬운 시기입니다. 정리할 것은 정리하되 미련에 사로잡히지 마세요. 끝난 관계나 지나간 기회를 되새기며 에너지를 낭비하기보다, 현재 할 수 있는 작은 일에 집중하는 것이 운의 전환을 앞당깁니다.',
  '절': '단절과 변화의 시기입니다. 끝은 새로운 시작이므로 집착을 내려놓으세요. 관계, 직업, 환경의 변화가 올 수 있지만, 이는 더 나은 것을 위한 정리 과정입니다. 변화에 저항하기보다 자연스럽게 흐름을 타면 새 기회가 열립니다.',
  '태': '아직 준비 단계입니다. 서두르면 미완성으로 끝나니 인내심을 가지세요. 씨앗이 땅속에서 힘을 모으듯, 보이지 않는 곳에서 내실을 다지는 시간입니다. 결과가 바로 나타나지 않아도 꾸준히 준비하면 반드시 빛을 봅니다.',
  '양': '조용히 성장하는 시기입니다. 눈에 보이는 성과가 없어도 조급해하지 마세요. 내면의 역량이 차곡차곡 쌓이고 있으며, 이 시기의 학습과 경험이 다음 장생(새로운 시작)의 밑거름이 됩니다. 자기 자신에 대한 투자를 아끼지 마세요.',
};

// ── 일간 오행별 일일 조언 풀 (dayOfYear 기반 로테이션) ──
const DAILY_ADVICE: Record<string, string[]> = {
  '목': [
    '오늘은 새로운 아이디어를 메모해두세요. 작은 씨앗이 큰 나무가 됩니다.',
    '자연 속에서 산책하면 막혔던 에너지가 흐르기 시작합니다.',
    '고집을 잠시 내려놓으면 뜻밖의 길이 보입니다.',
    '오늘의 키워드는 성장. 어제보다 한 걸음이면 충분합니다.',
    '주변에 진심으로 고마운 사람에게 짧은 메시지를 보내보세요.',
    '뿌리가 깊을수록 바람에 흔들리지 않습니다. 기본기를 다지는 하루로 만들어보세요.',
    '유연함은 약함이 아닙니다. 오늘은 타협의 미덕을 시도해보세요.',
  ],
  '화': [
    '열정을 쏟되, 오늘은 마무리까지 해내는 데 집중해보세요.',
    '밝은 미소 하나가 주변의 분위기를 완전히 바꿉니다.',
    '성급한 판단은 금물입니다. 한 템포 쉬어간 뒤 결정하세요.',
    '오늘의 에너지는 창작에 쓰면 최고. 무언가를 만들어보세요.',
    '가까운 사람의 이야기를 들어주는 것만으로도 큰 선물입니다.',
    '번아웃 방지! 적절한 휴식이 내일의 열정을 만듭니다.',
    '솔직함은 강점이지만, 오늘은 한 번 걸러서 말해보세요.',
  ],
  '토': [
    '오늘은 주변을 정리정돈하면 마음까지 깔끔해집니다.',
    '믿음직한 당신, 가끔은 자기 자신도 챙겨주세요.',
    '변화를 두려워하지 마세요. 산도 계절에 따라 옷을 갈아입습니다.',
    '누군가의 고민을 들어주는 것이 오늘의 소명일 수 있습니다.',
    '작지만 확실한 성취 하나가 자신감을 높여줍니다.',
    '몸을 움직이세요. 정체된 에너지가 흐르기 시작합니다.',
    '오늘의 한끼를 정성스럽게 먹으면 마음도 채워집니다.',
  ],
  '금': [
    '날카로운 직감을 믿되, 감정은 한 박자 쉬고 표현하세요.',
    '오늘은 디테일이 승부를 결정합니다. 꼼꼼함이 무기입니다.',
    '의리를 지키되, 자기 손해만 감수하진 마세요.',
    '깔끔하게 정리되는 하루를 위해 우선순위를 명확히 하세요.',
    '비판보다 칭찬을. 오늘 한 마디의 인정이 관계를 바꿉니다.',
    '완벽하지 않아도 괜찮습니다. 80%로 충분한 일도 있어요.',
    '운동으로 날카로운 에너지를 건강하게 발산해보세요.',
  ],
  '수': [
    '직관이 말하는 대로 따라가보세요. 오늘은 감(感)이 좋은 날입니다.',
    '혼자만의 시간이 필요하다면 죄책감 없이 쉬어도 됩니다.',
    '물처럼 유연하게, 하지만 방향은 잃지 마세요.',
    '오늘 떠오르는 아이디어를 기록해두면 나중에 큰 도움이 됩니다.',
    '깊은 대화 한 번이 얕은 만남 열 번보다 값집니다.',
    '우울한 기분이 들면 물가를 걷거나 물소리를 들어보세요.',
    '현실과 꿈 사이의 균형. 오늘은 현실에 한 발 더 디디세요.',
  ],
};

// ── 성격 소제목별 한줄 요약 생성 함수들 ──

function buildTemperamentSummary(ilgan: string): string {
  const map: Record<string, string> = {
    '甲': '곧은 나무처럼 한 방향으로 밀고 나가는 리더형',
    '乙': '유연하게 적응하며 자기만의 길을 찾는 전략가',
    '丙': '어디서든 빛나는 열정과 긍정의 아이콘',
    '丁': '고요한 외면 속 깊은 열정을 품은 집중형',
    '戊': '흔들리지 않는 중심, 믿음직한 포용력의 소유자',
    '己': '따뜻한 보살핌과 세밀한 관찰력의 실력파',
    '庚': '서리 내린 원철처럼 단단하고 냉철하나, 그 안에 뜨거운 의지를 품은 숙살의 무인',
    '辛': '섬세한 감각과 완벽을 추구하는 장인 기질',
    '壬': '넓은 시야와 자유로운 사고의 탐험가',
    '癸': '섬세한 직관과 깊은 통찰의 지혜형',
  };
  return map[ilgan] || '자신만의 고유한 기질을 지닌 사주';
}

function buildStrengthsWeaknessesSummary(ilgan: string): string {
  const map: Record<string, string> = {
    '甲': '추진력은 최고, 고집은 조절이 필요한 양날의 검',
    '乙': '적응력과 감성은 강점, 우유부단함은 보완 포인트',
    '丙': '폭발적 에너지가 장점이자 관리가 필요한 부분',
    '丁': '집중력과 통찰이 빛나지만 폐쇄적 성향은 주의',
    '戊': '안정감이 강점, 변화에 대한 둔감함은 약점',
    '己': '꼼꼼함과 헌신이 장점, 자기 비하는 경계 대상',
    '庚': '결단력과 의리가 강점, 고립적 방어기제와 냉소는 조절 필요',
    '辛': '심미안과 분석력이 빛나지만 예민함은 관리 필요',
    '壬': '창의력과 포용력이 강점, 산만함은 보완 포인트',
    '癸': '직관과 인내가 돋보이지만 소심함은 극복 과제',
  };
  return map[ilgan] || '고유한 강점을 살리고 약점을 보완하는 것이 핵심';
}

function buildStressPatternSummary(ilgan: string): string {
  const map: Record<string, string> = {
    '甲': '혼자 떠안으려 하면 고립되기 쉬운 패턴',
    '乙': '갈등을 회피하다 내면에 쌓이는 타입',
    '丙': '감정 기복이 심해지며 번아웃 위험이 있는 패턴',
    '丁': '속마음을 감추며 스스로를 가두는 경향',
    '戊': '무기력해지며 행동을 멈추는 패턴',
    '己': '자기 의심에 빠져 결정을 미루는 경향',
    '庚': '내면의 방어벽이 극대화되며 고립과 냉소로 치닫는 패턴',
    '辛': '완벽주의가 강박으로 변하는 위험 구간',
    '壬': '현실 도피로 집중력이 흐트러지는 패턴',
    '癸': '불안이 커지며 자신감을 잃기 쉬운 상태',
  };
  return map[ilgan] || '스트레스 신호를 일찍 알아채는 것이 핵심';
}

function buildBestEnvironmentSummary(ilgan: string): string {
  const map: Record<string, string> = {
    '甲': '주도권과 자율성이 보장되는 환경이 최적',
    '乙': '협업과 창작의 자유가 있는 곳에서 빛나는 타입',
    '丙': '사람을 만나고 에너지를 발산할 수 있는 역동적 무대',
    '丁': '깊이 파고들 수 있는 조용하고 자율적인 공간',
    '戊': '체계적이고 안정적인 조직에서 힘을 발휘',
    '己': '세밀한 관리와 사람을 돌보는 역할이 적성',
    '庚': '공과 사가 분명하고 실력으로 인정받는 전문가 환경이 최적',
    '辛': '품질과 디테일이 중요한 전문 분야가 적합',
    '壬': '자유로운 탐색과 큰 그림을 그릴 수 있는 환경',
    '癸': '안정 속에서 전문성을 쌓을 수 있는 분야',
  };
  return map[ilgan] || '타고난 기질에 맞는 환경을 찾는 것이 성공의 열쇠';
}

// ── 소제목별 한줄 요약 생성 함수들 ──

function buildOverallSummary(structure: StructureAnalysis | null): string {
  if (!structure?.singangyak) return '흐름을 읽고 기회를 잡아가는 운세입니다';
  const lv = structure.singangyak.level;
  if (lv === '극신강' || lv === '신강') return '강한 추진력으로 성과를 만들어갈 시기';
  if (lv === '중화') return '안정 속에서 꾸준히 성장하는 흐름';
  return '도움을 받아 크게 도약할 수 있는 운';
}

function buildLoveSummary(ilgan: string, pillars: Pillar[]): string {
  const ilji = pillars[1].j;
  const iljiOh = JJ_OH[ilji];
  const ilganOh = CG_OH[ilgan];
  const diff = iljiOh && ilganOh ? (['목','화','토','금','수'].indexOf(iljiOh) - ['목','화','토','금','수'].indexOf(ilganOh) + 5) % 5 : -1;

  if (diff === 0) return '대등하고 독립적인 관계에서 빛나는 인연';
  if (diff === 1) return '자유롭고 감성적인 연애가 어울리는 사주';
  if (diff === 2) return '실속 있고 가정적인 사랑을 만드는 운';
  if (diff === 3) return '안정적이고 진중한 인연을 끌어당기는 사주';
  if (diff === 4) return '따뜻한 보살핌과 깊은 교감의 인연';
  return '마음을 열면 인연이 찾아오는 시기';
}

function buildWealthSummary(structure: StructureAnalysis | null): string {
  if (!structure?.singangyak) return '꾸준한 관리가 재물을 불리는 열쇠';
  const lv = structure.singangyak.level;
  if (lv === '극신강' || lv === '신강') return '적극적으로 기회를 잡을 수 있는 재물운';
  if (lv === '중화') return '안정적 축적으로 큰 자산을 만드는 흐름';
  return '실력을 키워 자연스러운 수입 상승을 노릴 운';
}

function buildCareerSummary(chongun: ChongunResult | null, structure: StructureAnalysis | null): string {
  const jobs = chongun?.detail?.jobs;
  if (jobs && jobs.length > 0) {
    return `${jobs[0].field} 분야에서 강점이 빛나는 커리어 운`;
  }
  if (structure?.gyeokguk) {
    return `${structure.gyeokguk.name} 격국의 특성을 살린 성장이 유리`;
  }
  return '자신만의 전문성을 쌓아갈 좋은 흐름';
}

function buildHealthSummary(ilganOh: string): string {
  const summaryMap: Record<string, string> = {
    '목': '간·눈·근육 계통 관리에 신경 쓸 시기',
    '화': '심장·혈액순환 관리가 건강의 핵심',
    '토': '위장·소화기 중심으로 관리가 필요한 운',
    '금': '폐·호흡기·피부 관리에 집중할 때',
    '수': '신장·관절 보호가 건강 운의 포인트',
  };
  return summaryMap[ilganOh] || '오행 균형을 유지하면 건강이 따라오는 운';
}

function buildRelationshipsSummary(chongun: ChongunResult | null): string {
  if (chongun?.detail?.social) return '타고난 교류 방식을 살리면 귀인이 찾아오는 운';
  return '진심을 나누는 소수의 관계가 행운을 불러오는 시기';
}

// ── 운(運) 헤드라인 생성 ──
function buildFortuneHeadline(structure: StructureAnalysis | null, ilganOh: string): string {
  if (!structure?.singangyak) return '흐름을 타고 나아가는 운의 지도';
  const level = structure.singangyak.level;
  if (level === '극신강' || level === '신강') {
    return '강한 기운을 조절하며 성과를 만들어갈 운';
  }
  if (level === '중화') {
    return '균형 잡힌 사주, 안정 속에서 기회를 잡는 운';
  }
  return '도움의 기운을 모아 성장해 나갈 운';
}

// ── 총운 빌드 ──
function buildOverallFortune(
  structure: StructureAnalysis | null,
  daeuns: DaeunEntry[],
  yeonuns: YeonunEntry[],
  ilgan: string,
): string {
  const parts: string[] = [];
  const ilganOh = CG_OH[ilgan];

  if (structure?.singangyak) {
    const lv = structure.singangyak.level;
    if (lv === '극신강' || lv === '신강') {
      parts.push('기운이 강한 사주로, 본인의 역량과 추진력이 돋보입니다. 자기 확신이 강하고 실행력이 뛰어나 목표를 향해 거침없이 나아갈 수 있습니다. 다만 과도한 자기 확신이 독이 될 수 있으니, 식상(표현)과 재성(현실) 방향으로 에너지를 풀어내는 시기가 좋은 운입니다. 관성(규율·직장) 운이 들어오는 시기에는 외부 압박이 오히려 균형을 잡아주므로, 적절한 긴장감이 있는 환경을 두려워하지 마세요.');
    } else if (lv === '중화') {
      parts.push('오행이 비교적 균형 잡힌 사주로, 큰 기복 없이 꾸준한 흐름을 탑니다. 특별히 크게 나쁜 시기도 없지만, 폭발적인 대운도 드문 안정형입니다. 기회가 오면 주저 없이 잡되, 무리한 확장보다는 안정 속 성장이 유리합니다. 대운에서 자신의 용신 오행이 들어오는 10년이 가장 큰 도약기이니, 해당 시기를 미리 파악해두세요.');
    } else {
      parts.push('외부의 도움과 환경이 중요한 사주입니다. 인성(학습·귀인)과 비겁(동료·협력) 기운이 들어오는 시기에 큰 전환점이 옵니다. 좋은 사람을 곁에 두는 것이 운의 핵심이며, 혼자 감당하려 하기보다 팀과 동료의 힘을 빌리는 전략이 유효합니다. 대운에서 인성이나 비겁 운이 도래하면 학업·자격·인맥 등에 적극 투자하세요.');
    }
  }

  if (structure?.yongsin) {
    parts.push(`용신이 ${structure.yongsin.primary}(${structure.yongsin.role})이므로, ${structure.yongsin.primary} 기운이 강해지는 계절과 시기에 운이 상승합니다.`);
  }

  return parts.join(' ');
}

// ── 애정운 ──
function buildLoveFortune(ilgan: string, pillars: Pillar[]): string {
  const ilji = pillars[1].j;
  const iljiOh = JJ_OH[ilji];
  const ilganOh = CG_OH[ilgan];
  const diff = iljiOh && ilganOh ? (['목','화','토','금','수'].indexOf(iljiOh) - ['목','화','토','금','수'].indexOf(ilganOh) + 5) % 5 : -1;

  if (diff === 0) return '배우자궁에 비겁이 있어 대등하고 독립적인 관계를 추구합니다. 서로의 자율성을 존중하는 파트너와 잘 맞으며, 의존적 관계보다 동반자적 관계에서 행복합니다. 연애 초기에는 서로의 독립성이 매력으로 작용하지만, 관계가 깊어지면 "각자의 영역"을 어디까지 인정할지에 대한 조율이 필요합니다. 상대에게 도움을 요청하는 것이 약함이 아니라 신뢰의 표현임을 기억하세요.';
  if (diff === 1) return '배우자궁에 식상이 있어 자유롭고 감성적인 연애를 원합니다. 표현력이 풍부한 관계를 좋아하며, 상대의 재능이나 매력에 끌립니다. 일상에서 소소한 즐거움을 함께 나누는 것을 중시하고, 서로의 취미와 창작 활동을 응원하는 관계에서 만족합니다. 다소 변덕스러울 수 있으니 안정감 있는 상대가 보완이 되며, "지루하지 않은 일상"을 함께 만들어가는 파트너가 이상적입니다.';
  if (diff === 2) return '배우자궁에 재성이 있어 가정적이고 실속 있는 연애를 합니다. 상대를 잘 챙기고 현실적인 계획을 함께 세워나가는 관계를 선호합니다. 물질적 안정을 중시하며, 함께 저축하고 미래를 설계하는 과정 자체를 사랑의 표현으로 여깁니다. 로맨틱한 말보다 일상의 세심한 배려로 사랑을 표현하는 타입이며, 실제로 함께 살아보면 그 장점이 더 빛나는 스타일입니다.';
  if (diff === 3) return '배우자궁에 관성이 있어 책임감 있는 인연을 만나지만, 본인의 금 기운이 강해서 배우자에게도 엄격한 기준을 들이대기 쉽습니다. 가장 편안해야 할 관계에서조차 긴장의 끈을 놓지 못하고, 내 편이라고 생각하는 사람에게 한없이 든든해지려는 마음에 도리어 상처받기도 합니다. 서로를 내 기준대로 고쳐 쓰려 하지 않고, 적절한 정서적 안전거리를 유지하며 상대의 영혼을 있는 그대로 존중할 때 부부궁이 평화롭습니다. 진지하고 격식 있는 관계를 선호하며, 상견례나 미래를 논의하는 자리에서 좋은 인상을 남기는 타입입니다.';
  if (diff === 4) return '배우자궁에 인성이 있어 정서적 지지와 따뜻한 보살핌을 주고받는 관계를 원합니다. 학구적이거나 차분한 상대에게 끌리며, 깊은 대화가 있는 관계에서 만족합니다. 외모나 조건보다 내면의 깊이와 인격에 끌리는 타입이며, 함께 성장하고 배워가는 동반자를 원합니다. 서로에게 정서적 안식처가 되어주는 관계가 가장 오래 지속됩니다.';
  return '내면에서 원하는 이상적 관계를 명확히 하면, 인연이 더 빨리 찾아옵니다. 자신이 어떤 사랑을 원하는지 구체적으로 정리해보세요.';
}

// ── 재물운 ──
function buildWealthFortune(structure: StructureAnalysis | null, ilgan: string): string {
  if (!structure?.singangyak) return '꾸준한 저축과 실속 있는 소비가 재물 운의 기본입니다. 한탕을 노리기보다 시간을 내 편으로 만드는 장기적 재테크가 유리합니다.';
  const lv = structure.singangyak.level;
  if (lv === '극신강' || lv === '신강') {
    return '신강 사주는 재성(재물)을 감당할 힘이 충분합니다. 그러나 이 사주의 재물 패턴은 흥청망청 쓰는 타입이 아니라, 철저하게 계산하고 통제하여 성곽을 쌓듯 자산을 방어하는 현금성 자산 중심의 안정적 방어 전략으로 나타납니다. "절대 무너지면 안 된다"는 강박 뒤에는 생존과 미래에 대한 근원적 두려움이 숨어 있지만, 이 철저한 절제력과 삶을 정돈하는 능력은 결국 풍요의 성곽을 지켜냅니다. 편재 운이 들어오는 시기에 부업이나 투자를 시작하면 좋은 결실을 얻을 수 있으며, 지나친 신중함으로 기회를 놓치지 않도록 "80% 확신이면 실행"하는 기준을 가져보세요.';
  }
  if (lv === '중화') {
    return '균형 잡힌 사주로 큰 재물운의 기복은 적습니다. 꾸준히 모으는 정재(正財) 스타일이 어울리며, 투기보다 실력으로 벌어들이는 구조가 유리합니다. 월급 + 부수입의 이원화 전략이 잘 맞으며, 안정적인 자산(예적금, 부동산, 인덱스 펀드 등)에 꾸준히 넣는 것이 장기적으로 큰 자산을 만듭니다. 재성 대운이 들어오면 그동안의 노력이 결실을 맺습니다.';
  }
  return '신약 사주는 무리한 재물 추구보다 인성(학습·자격증)으로 역량을 키운 뒤 자연스러운 수입 증가를 노리는 것이 좋습니다. 큰 빚이나 모험적 투자는 피하고, 자기 실력으로 안정적으로 벌 수 있는 구조를 만드는 것이 핵심입니다. 비겁 운이 들어오면 동업이나 협력을 통한 수입 기회가 생기고, 인성 운이 들어오면 공부를 통한 이직·승진으로 수입이 올라갑니다.';
}

// ── 직업운 ──
function buildCareerFortune(chongun: ChongunResult | null, structure: StructureAnalysis | null): string {
  const jobs = chongun?.detail?.jobs;
  if (jobs && jobs.length > 0) {
    const top3 = jobs.slice(0, 3).map(j => `${j.field}(${j.role}) — ${j.reason}`).join(' / ');
    const conclusion = chongun?.detail?.conclusion || '자신의 강점을 살리는 방향이 커리어 성공의 열쇠입니다.';
    return `적성에 맞는 분야: ${top3}. ${conclusion} 커리어에서 가장 중요한 것은 "나에게 맞는 역할"을 찾는 것입니다. 남들이 부러워하는 자리보다, 타고난 기질이 자연스럽게 발휘되는 환경에서 장기적 성공과 만족을 동시에 얻을 수 있습니다.`;
  }
  if (structure?.gyeokguk) {
    return `${structure.gyeokguk.name} 격국의 사주로, ${structure.gyeokguk.description} 이 격국의 특성을 살리면 커리어에서 자연스러운 차별화가 가능합니다. 무리하게 남의 방식을 따르기보다, 자신만의 스타일로 전문성을 쌓아가세요.`;
  }
  return '강한 카리스마와 전문성을 바탕으로 자신의 언어와 기술을 표출하는 직무에 최적화되어 있습니다. 칼날 같은 정확함과 깊이 있는 분석력이 요구되는 법조, 의료, 공학, 금융분석, 위기관리 컨설팅, 심도 있는 상담업 및 기획 전문가 분야에서 타고난 재능이 빛을 발합니다. 보이지 않는 무대 뒤에서 칼날을 갈며 실력을 쌓아온 시간이 결국 커리어의 버팀목이 되며, 대운의 흐름에 맞춰 이직이나 전직의 타이밍을 잡으면 더 큰 도약이 가능합니다.';
}

// ── 건강운 ──
function buildHealthFortune(structure: StructureAnalysis | null, ilganOh: string): string {
  const ohHealthMap: Record<string, string> = {
    '목': '간, 담낭, 눈, 근육 계통이 약점이 될 수 있습니다. 스트레스를 풀지 못하면 간 기능과 시력에 영향이 옵니다. 특히 화가 나거나 억울한 감정을 참을 때 간에 무리가 가므로, 감정을 건강하게 풀어내는 방법을 찾는 것이 중요합니다. 규칙적인 스트레칭과 녹색 채소 섭취를 권하며, 눈의 피로를 풀기 위해 디지털 기기 사용 시간을 관리하세요.',
    '화': '심장, 소장, 혈액순환 계통을 주의하세요. 과도한 흥분이나 수면 부족이 심혈관에 무리를 줍니다. 열정적인 성향 때문에 쉬지 않고 달리다 갑작스럽게 에너지가 바닥나는 패턴이 반복될 수 있습니다. 규칙적인 수면과 명상이 도움되며, 심장 건강을 위해 유산소 운동을 꾸준히 하되 과도한 흥분 상태의 고강도 운동은 피하세요.',
    '토': '위장, 비장, 소화기 계통이 취약합니다. 불규칙한 식사와 과식을 주의하세요. 걱정이 많아지면 소화 기능이 떨어지는 패턴이 있으므로, 마음의 평화가 곧 위장 건강입니다. 정해진 시간에 먹는 습관과 식사 후 가벼운 산책이 건강의 기본이며, 야식을 줄이고 위장에 부담이 적은 따뜻한 음식을 선택하세요.',
    '금': '폐, 대장, 피부, 호흡기를 주의하세요. 금 기운이 과하면 건조함과 경직이 몸에도 그대로 나타납니다. 감정을 억누르고 내면의 방어벽을 높이 세울수록 피부 트러블, 호흡기 문제, 어깨·목 결림이 동반되기 쉽습니다. 특히 스트레스를 삼키는 습관이 폐 기능을 약화시키고 만성 기침이나 알레르기로 이어질 수 있습니다. 목(木)과 수(水) 기운을 보충하는 것이 핵심으로, 푸른 숲에서의 산책, 충분한 수분 섭취, 깊은 복식호흡이 경직된 금 기운을 풀어줍니다. 슬픔이나 억울함을 참지 말고 건강하게 표출하는 연습이 곧 폐를 지키는 길입니다.',
    '수': '신장, 방광, 생식기, 뼈·관절을 주의하세요. 과로와 냉기에 약하며, 에너지를 과도하게 소진하면 신장 기능 저하로 이어질 수 있습니다. 하체 운동과 따뜻한 음식 섭취가 도움되며, 특히 겨울철 보온에 신경 쓰세요. 충분한 수면이 신장 회복의 핵심이므로 무리한 야근이나 밤새 활동은 자제하세요.',
  };

  let text = ohHealthMap[ilganOh] || '오행 균형을 유지하면 건강한 컨디션을 유지할 수 있습니다.';

  if (structure?.distribution) {
    if (structure.distribution.lacking.length > 0) {
      text += ` 특히 ${structure.distribution.lacking.join('·')} 기운이 부족하니, 해당 오행을 보충하는 음식과 활동을 의식적으로 챙기세요. 부족한 오행의 색상을 일상에 배치하거나, 관련 계절에 더 적극적으로 건강 관리를 하면 체력 유지에 도움이 됩니다.`;
    }
  }

  return text;
}

// ── 인간관계운 ──
function buildRelationshipFortune(chongun: ChongunResult | null, ilgan: string): string {
  if (chongun?.detail?.social) {
    return chongun.detail.social + ' 인간관계에서 가장 중요한 것은 자신의 교류 방식을 인정하고 무리하게 바꾸려 하지 않는 것입니다. 타고난 성향에 맞는 관계 맺기 방식을 존중하되, 약점을 보완하는 작은 노력을 꾸준히 하면 인간관계의 질이 눈에 띄게 올라갑니다.';
  }
  return '진심을 나눌 수 있는 소수의 관계가 넓고 얕은 인맥보다 운에 도움이 됩니다. 무리 속에서 웃고 있으면서도 문득 찾아오는 인간에 대한 염증과 공허함은, 모두에게 좋은 사람이 되려 애쓴 대가일 수 있습니다. 당신의 단단함을 있는 그대로 존중하고 지켜줄 소수의 "진짜 내 편"만을 남기는 것이 고귀한 영혼을 지키는 가장 다정한 길입니다. 계산 없이 진심으로 다가가면, 귀인은 자연스럽게 나타납니다.';
}

// ── AI 캐시 데이터 타입 (generate_parallel.py 섹션별 출력) ──
export interface ChongunCacheSections {
  headline?: string;
  temperament?: string;
  stressPattern?: string;
  bestEnvironment?: string;
  personality?: string; // 구버전 호환
  career?: string;
  wealth?: string;
  love?: string;
  relationships?: string;
  health?: string;
  improvement?: string;
  luckyColor?: string;
  luckyNumber?: string;
  luckyItem?: string;
  bestMatch?: string;
  dailyAdvice?: string;
  text?: string; // 파싱 실패 시 폴백용 단일 텍스트
}

// ── 메인 빌더 함수 ──
export function buildDetailedFortune(
  pillars: Pillar[],
  ilgan: string,
  chongun: ChongunResult | null,
  daeuns: DaeunEntry[],
  yeonuns: YeonunEntry[],
  woluns: WolunEntry[],
  cacheSections?: ChongunCacheSections | null,
): DetailedFortuneData | null {
  if (!ilgan) return null;

  const ilganOh = CG_OH[ilgan] || '';
  const structure = buildStructureAnalysis(pillars);
  const personality = PERSONALITY_DATA[ilgan];
  if (!personality) return null;

  // 일간의 12운성 (현재 연운 기준)
  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const currentYeonun = yeonuns.find(y => y.year === now.getFullYear());
  const currentUs = currentYeonun ? unsung(ilgan, currentYeonun.j) : '건록';

  // 강점/약점은 chongun detail에서 가져옴
  const strengths = chongun?.detail?.strengths || [];
  const weaknesses = chongun?.detail?.weaknesses || [];

  // ── AI 캐시가 있으면 우선 사용, 없으면 하드코딩 폴백 ──
  const cs = cacheSections;

  const personalitySection: PersonalitySection = {
    headline: cs?.headline || personality.headline,
    temperament: cs?.temperament || cs?.personality || personality.temperament,
    temperamentSummary: buildTemperamentSummary(ilgan),
    strengths: strengths.length > 0 ? strengths : ['추진력', '집중력', '성실함'],
    weaknesses: weaknesses.length > 0 ? weaknesses : ['완벽주의', '고집'],
    strengthsWeaknessesSummary: buildStrengthsWeaknessesSummary(ilgan),
    stressPattern: cs?.stressPattern || personality.stressPattern,
    stressPatternSummary: buildStressPatternSummary(ilgan),
    bestEnvironment: cs?.bestEnvironment || personality.bestEnvironment,
    bestEnvironmentSummary: buildBestEnvironmentSummary(ilgan),
  };

  const fortuneSection: FortuneFlowSection = {
    headline: buildFortuneHeadline(structure, ilganOh),
    overall: buildOverallFortune(structure, daeuns, yeonuns, ilgan),
    overallSummary: buildOverallSummary(structure),
    love: cs?.love || buildLoveFortune(ilgan, pillars),
    loveSummary: buildLoveSummary(ilgan, pillars),
    wealth: cs?.wealth || buildWealthFortune(structure, ilgan),
    wealthSummary: buildWealthSummary(structure),
    career: cs?.career || buildCareerFortune(chongun, structure),
    careerSummary: buildCareerSummary(chongun, structure),
    health: cs?.health || buildHealthFortune(structure, ilganOh),
    healthSummary: buildHealthSummary(ilganOh),
    relationships: cs?.relationships || buildRelationshipFortune(chongun, ilgan),
    relationshipsSummary: buildRelationshipsSummary(chongun),
  };

  const advicePool = DAILY_ADVICE[ilganOh] || DAILY_ADVICE['목'];
  const dailyAdvice = advicePool[dayOfYear % advicePool.length];

  const funSection: FunContentSection = {
    headline: '오늘의 행운을 잡는 작은 팁',
    luckyItems: cs?.luckyColor
      ? { color: cs.luckyColor, number: cs.luckyNumber || '', item: cs.luckyItem || '' }
      : (LUCKY_ITEMS[ilganOh] || LUCKY_ITEMS['목']),
    bestMatch: cs?.bestMatch || BEST_MATCH[ilganOh] || BEST_MATCH['목'],
    cautionPeriod: CAUTION_PERIOD[currentUs] || '무리하지 않는 것이 최고의 액땜입니다.',
    dailyAdvice: cs?.dailyAdvice || dailyAdvice,
  };

  return {
    personality: personalitySection,
    fortune: fortuneSection,
    fun: funSection,
  };
}
