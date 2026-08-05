export interface FamousPerson {
  name: string;
  birthYear: number;
  field: string;
  description: string;
  emoji: string;
}

// 월-일 기준 더미 데이터 (MM-DD)
export const FAMOUS_BIRTHDAYS: Record<string, FamousPerson[]> = {
  // ── 1월 ──────────────────────────────────────────────
  "01-01": [
    { name: "J.D. 샐린저", birthYear: 1919, field: "작가", description: "《호밀밭의 파수꾼》으로 세계 문학사에 이름을 남긴 미국 소설가", emoji: "✍️" },
    { name: "베토벤 (추정)", birthYear: 1770, field: "음악가", description: "청각을 잃고도 불멸의 교향곡을 남긴 독일 작곡가", emoji: "🎵" },
    { name: "폴 레베어", birthYear: 1735, field: "독립운동가", description: "미국 독립전쟁 직전 영국군 진격을 알린 애국지사", emoji: "🐎" },
  ],
  "01-02": [
    { name: "아이작 아시모프", birthYear: 1920, field: "작가", description: "로봇 3원칙을 창안한 SF 문학의 거장", emoji: "🤖" },
    { name: "쿠바 구딩 주니어", birthYear: 1968, field: "배우", description: "《제리 맥과이어》로 아카데미 남우조연상을 받은 배우", emoji: "🎬" },
  ],
  "01-03": [
    { name: "J.R.R. 톨킨", birthYear: 1892, field: "작가", description: "《반지의 제왕》으로 판타지 문학의 새 지평을 연 영국 소설가", emoji: "💍" },
    { name: "멜 깁슨", birthYear: 1956, field: "배우·감독", description: "《브레이브하트》로 아카데미 감독상을 수상한 배우 겸 감독", emoji: "🎬" },
  ],
  "01-04": [
    { name: "뉴턴", birthYear: 1643, field: "과학자", description: "만유인력 법칙을 발견한 영국의 물리학자 (율리우스력 기준)", emoji: "🍎" },
    { name: "루이 브라이", birthYear: 1809, field: "교육자", description: "시각장애인을 위한 점자를 발명한 프랑스 교육자", emoji: "✋" },
    { name: "스테파니 마이어", birthYear: 1973, field: "작가", description: "《트와일라잇》 시리즈로 전 세계 독자를 사로잡은 작가", emoji: "🧛" },
  ],
  "01-05": [
    { name: "움베르토 에코", birthYear: 1932, field: "작가·철학자", description: "《장미의 이름》을 쓴 이탈리아의 기호학자이자 소설가", emoji: "📚" },
    { name: "박진영", birthYear: 1971, field: "가수·프로듀서", description: "JYP 엔터테인먼트를 설립한 가수 겸 음악 프로듀서", emoji: "🎵" },
  ],
  "01-06": [
    { name: "조안 오브 아크", birthYear: 1412, field: "군인·성인", description: "프랑스를 구한 소녀 전사, 가톨릭 성인으로 시성된 인물", emoji: "⚔️" },
    { name: "카를로스 슬림", birthYear: 1940, field: "기업인", description: "중남미 최대 통신 재벌, 세계 최고 부자 중 한 명", emoji: "💼" },
  ],
  "01-07": [
    { name: "니콜라 테슬라", birthYear: 1856, field: "발명가", description: "교류 전기 시스템을 발명한 세르비아계 미국 천재 발명가", emoji: "⚡" },
    { name: "케이티 큐릭", birthYear: 1957, field: "언론인", description: "미국 주요 방송사 앵커를 역임한 저널리스트", emoji: "📺" },
  ],
  "01-08": [
    { name: "스티븐 호킹", birthYear: 1942, field: "물리학자", description: "블랙홀 이론을 정립한 영국의 이론물리학자", emoji: "🌌" },
    { name: "엘비스 프레슬리", birthYear: 1935, field: "가수", description: "로큰롤의 황제, 20세기 대중음악의 아이콘", emoji: "🎸" },
    { name: "데이비드 보위", birthYear: 1947, field: "가수", description: "지기 스타더스트로 록과 팝의 경계를 허문 영국 뮤지션", emoji: "⭐" },
  ],
  "01-09": [
    { name: "시몬 드 보부아르", birthYear: 1908, field: "철학자·작가", description: "《제2의 성》으로 현대 페미니즘을 정초한 프랑스 실존주의 철학자", emoji: "📖" },
    { name: "케이트 미들턴", birthYear: 1982, field: "왕족", description: "영국 왕세자비, 현재 웨일스 왕세자빈", emoji: "👑" },
  ],
  "01-10": [
    { name: "로드 스튜어트", birthYear: 1945, field: "가수", description: "《Maggie May》로 유명한 영국 록 가수", emoji: "🎤" },
    { name: "박찬욱", birthYear: 1963, field: "영화감독", description: "《올드보이》로 칸 심사위원대상을 수상한 한국 감독", emoji: "🎬" },
  ],
  "01-11": [
    { name: "알렉산더 해밀턴", birthYear: 1755, field: "정치인", description: "미국 초대 재무장관이자 건국의 아버지 중 한 명", emoji: "💵" },
    { name: "매리 J. 블라이즈", birthYear: 1971, field: "가수", description: "R&B 퀸이라 불리는 미국 가수", emoji: "🎶" },
  ],
  "01-12": [
    { name: "이브 생 로랑", birthYear: 1936, field: "패션디자이너", description: "여성 정장 수트를 유행시킨 프랑스 패션의 아이콘", emoji: "👗" },
    { name: "제프 베이조스", birthYear: 1964, field: "기업인", description: "아마존을 창업해 전자상거래 혁명을 이끈 세계적 억만장자", emoji: "📦" },
  ],
  "01-13": [
    { name: "오를랑도 블룸", birthYear: 1977, field: "배우", description: "《반지의 제왕》의 레골라스로 전 세계 팬을 사로잡은 영국 배우", emoji: "🏹" },
    { name: "패트릭 뎀프시", birthYear: 1966, field: "배우", description: "《그레이 아나토미》의 맥드리미로 유명한 미국 배우", emoji: "🩺" },
  ],
  "01-14": [
    { name: "앨버트 슈바이처", birthYear: 1875, field: "의사·철학자", description: "아프리카 봉사로 노벨 평화상을 받은 인도주의자", emoji: "🏥" },
    { name: "에밀 졸라", birthYear: 1840, field: "작가", description: "《나나》, 《목로주점》의 프랑스 자연주의 소설가", emoji: "✍️" },
  ],
  "01-15": [
    { name: "마틴 루터 킹 주니어", birthYear: 1929, field: "인권운동가", description: "미국 흑인 민권운동을 이끈 노벨 평화상 수상자", emoji: "✊" },
    { name: "몰리에르", birthYear: 1622, field: "극작가", description: "《수전노》, 《타르튀프》를 쓴 프랑스 희극의 아버지", emoji: "🎭" },
    { name: "르브론 제임스", birthYear: 1984, field: "농구선수", description: "NBA 역사상 최다 득점 기록을 보유한 농구 황제", emoji: "🏀" },
  ],
  "01-16": [
    { name: "이민호", birthYear: 1987, field: "배우", description: "《꽃보다 남자》로 한류 스타가 된 배우", emoji: "🌊" },
    { name: "케이트 모스", birthYear: 1974, field: "모델", description: "90년대 슈퍼모델 열풍을 이끈 영국 패션 아이콘", emoji: "👗" },
  ],
  "01-17": [
    { name: "무하마드 알리", birthYear: 1942, field: "권투선수", description: "세계 헤비급 챔피언, '나비처럼 날아 벌처럼 쏜다'의 전설", emoji: "🥊" },
    { name: "벤저민 프랭클린", birthYear: 1706, field: "발명가·정치인", description: "피뢰침을 발명하고 미국 독립선언서에 서명한 건국의 아버지", emoji: "⚡" },
    { name: "짐 캐리", birthYear: 1962, field: "배우·코미디언", description: "《마스크》, 《트루먼 쇼》로 세계를 웃긴 캐나다 코미디 배우", emoji: "😂" },
  ],
  "01-18": [
    { name: "케리 워싱턴", birthYear: 1977, field: "배우", description: "미드 《스캔들》의 주인공으로 유명한 미국 배우", emoji: "🎬" },
    { name: "A.A. 밀른", birthYear: 1882, field: "작가", description: "곰돌이 푸를 탄생시킨 영국 동화 작가", emoji: "🐻" },
  ],
  "01-19": [
    { name: "에드거 앨런 포", birthYear: 1809, field: "작가", description: "《갈가마귀》, 《어셔가의 몰락》을 쓴 미국 공포 소설의 선구자", emoji: "🦅" },
    { name: "세자르 밀란", birthYear: 1969, field: "훈련사", description: "《도그 위스퍼러》로 유명한 멕시코계 미국 반려견 훈련사", emoji: "🐕" },
  ],
  "01-20": [
    { name: "버즈 올드린", birthYear: 1930, field: "우주비행사", description: "인류 최초로 달을 밟은 아폴로 11호 우주비행사", emoji: "🌕" },
    { name: "조지 번스", birthYear: 1896, field: "코미디언", description: "100세까지 현역으로 활동한 미국의 전설적 코미디언", emoji: "😄" },
  ],
  "01-21": [
    { name: "크리스티안 디오르", birthYear: 1905, field: "패션디자이너", description: "전후 파리 패션을 부활시킨 프랑스 패션 하우스의 창시자", emoji: "👗" },
    { name: "스태거 리", birthYear: 1865, field: "민속 영웅", description: "미국 블루스 전설에 등장하는 실존 인물", emoji: "🎵" },
  ],
  "01-22": [
    { name: "비", birthYear: 1982, field: "가수 겸 배우", description: "아시아권에서 큰 인기를 얻은 솔로 가수", emoji: "🌧️" },
    { name: "바이런 경", birthYear: 1788, field: "시인", description: "《돈 주앙》을 쓴 낭만주의 영국 시인", emoji: "✍️" },
  ],
  "01-23": [
    { name: "에두아르 마네", birthYear: 1832, field: "화가", description: "인상주의를 예고한 프랑스 근대 회화의 선구자", emoji: "🎨" },
    { name: "황정민", birthYear: 1970, field: "배우", description: "《국제시장》 등 다양한 장르를 소화하는 한국 대표 배우", emoji: "🎭" },
  ],
  "01-24": [
    { name: "에른스트 호프만", birthYear: 1776, field: "작가", description: "《호두까기 인형》의 원작자인 독일 낭만주의 작가", emoji: "🎭" },
    { name: "네이선 레인", birthYear: 1956, field: "배우", description: "브로드웨이와 영화를 넘나드는 미국 코미디 배우", emoji: "😄" },
  ],
  "01-25": [
    { name: "로버트 번스", birthYear: 1759, field: "시인", description: "《올드 랭 사인》을 쓴 스코틀랜드의 국민 시인", emoji: "🌹" },
    { name: "알리샤 키스", birthYear: 1981, field: "가수", description: "《If I Ain't Got You》로 유명한 R&B 팝 싱어송라이터", emoji: "🎹" },
  ],
  "01-26": [
    { name: "폴 뉴먼", birthYear: 1925, field: "배우", description: "《색깔 돈》, 《허드》의 할리우드 레전드 배우", emoji: "🎬" },
    { name: "엘렌 드제너러스", birthYear: 1958, field: "코미디언·진행자", description: "동성결혼 공개 선언으로 화제를 모은 미국 토크쇼 진행자", emoji: "😊" },
  ],
  "01-27": [
    { name: "볼프강 아마데우스 모차르트", birthYear: 1756, field: "음악가", description: "35년의 짧은 생애에 600여 곡을 남긴 오스트리아의 천재 작곡가", emoji: "🎵" },
    { name: "루이스 캐럴", birthYear: 1832, field: "작가", description: "《이상한 나라의 앨리스》를 쓴 영국 작가", emoji: "🐇" },
  ],
  "01-28": [
    { name: "잭슨 폴록", birthYear: 1912, field: "화가", description: "액션 페인팅으로 추상표현주의를 이끈 미국 화가", emoji: "🎨" },
    { name: "닉 카터", birthYear: 1980, field: "가수", description: "백스트리트 보이즈의 멤버로 세계적 인기를 얻은 가수", emoji: "🎤" },
  ],
  "01-29": [
    { name: "안톤 체호프", birthYear: 1860, field: "작가·극작가", description: "《갈매기》, 《벚꽃동산》을 쓴 러시아 단편의 거장", emoji: "📖" },
    { name: "오프라 윈프리", birthYear: 1954, field: "방송인", description: "미국 최초 흑인 여성 억만장자이자 영향력 있는 토크쇼 진행자", emoji: "📺" },
  ],
  "01-30": [
    { name: "마하트마 간디", birthYear: 1869, field: "독립운동가", description: "비폭력 저항운동으로 인도 독립을 이끈 정신적 지도자", emoji: "☮️" },
    { name: "프랭클린 D. 루스벨트", birthYear: 1882, field: "정치인", description: "대공황과 2차 세계대전을 이끈 미국 32대 대통령", emoji: "🇺🇸" },
  ],
  "01-31": [
    { name: "저스틴 팀버레이크", birthYear: 1981, field: "가수·배우", description: "*NSYNC 출신 솔로 팝스타, 《SexyBack》으로 전 세계 히트", emoji: "🎤" },
    { name: "마르코 폴로", birthYear: 1254, field: "탐험가", description: "동방 여행기를 통해 아시아를 유럽에 알린 이탈리아 탐험가", emoji: "🧭" },
  ],

  // ── 2월 ──────────────────────────────────────────────
  "02-01": [
    { name: "랭스턴 휴스", birthYear: 1902, field: "시인", description: "할렘 르네상스를 이끈 미국 흑인 시인", emoji: "✍️" },
    { name: "해리 스타일스", birthYear: 1994, field: "가수", description: "원 다이렉션 출신 솔로 팝스타", emoji: "🎸" },
  ],
  "02-02": [
    { name: "제임스 조이스", birthYear: 1882, field: "작가", description: "《율리시스》로 현대 소설의 흐름을 바꾼 아일랜드 작가", emoji: "📚" },
    { name: "샤키라", birthYear: 1977, field: "가수", description: "《Hips Don't Lie》로 세계적 스타가 된 콜롬비아 팝 가수", emoji: "💃" },
  ],
  "02-03": [
    { name: "멘델스존", birthYear: 1809, field: "음악가", description: "《한여름 밤의 꿈》을 작곡한 독일 낭만주의 작곡가", emoji: "🎵" },
    { name: "버디 홀리", birthYear: 1936, field: "가수", description: "로큰롤 초기를 이끈 미국 뮤지션, 《Peggy Sue》로 유명", emoji: "🎸" },
  ],
  "02-04": [
    { name: "로자 파크스", birthYear: 1913, field: "인권운동가", description: "버스 좌석 거부로 흑인 민권운동의 불씨를 당긴 미국 활동가", emoji: "✊" },
    { name: "마크 저커버그", birthYear: 1984, field: "기업인", description: "페이스북(현 메타)을 창업한 소셜미디어 혁명의 주역", emoji: "💻" },
  ],
  "02-05": [
    { name: "크리스티아누 호날두", birthYear: 1985, field: "축구선수", description: "발롱도르 5회 수상, 세계 최고 득점 기록을 가진 포르투갈 축구 황제", emoji: "⚽" },
    { name: "넬리 킴", birthYear: 1956, field: "체조선수", description: "몬트리올 올림픽 5관왕, 체조 역사에 이름을 새긴 소련 선수", emoji: "🤸" },
  ],
  "02-06": [
    { name: "밥 말리", birthYear: 1945, field: "가수", description: "레게 음악을 세계에 알린 자메이카 레전드, 《No Woman No Cry》", emoji: "🌿" },
    { name: "로널드 레이건", birthYear: 1911, field: "정치인", description: "미국 40대 대통령, 냉전 종식에 기여한 공화당 지도자", emoji: "🇺🇸" },
  ],
  "02-07": [
    { name: "찰스 디킨스", birthYear: 1812, field: "작가", description: "《올리버 트위스트》, 《두 도시 이야기》의 영국 빅토리아 시대 소설가", emoji: "📖" },
    { name: "유재석", birthYear: 1972, field: "방송인", description: "대한민국 국민 MC로 수십 년째 예능 프로그램을 이끄는 진행자", emoji: "😄" },
  ],
  "02-08": [
    { name: "쥘 베른", birthYear: 1828, field: "작가", description: "《해저 2만 리》, 《지구 속 여행》의 프랑스 SF 선구자", emoji: "🚀" },
    { name: "제임스 딘", birthYear: 1931, field: "배우", description: "《이유 없는 반항》으로 청춘의 아이콘이 된 미국 배우", emoji: "🎬" },
  ],
  "02-09": [
    { name: "토마스 에디슨", birthYear: 1847, field: "발명가", description: "전구·축음기 등 1,000여 개 특허를 남긴 발명왕", emoji: "💡" },
    { name: "조 페시", birthYear: 1943, field: "배우", description: "《좋은 친구들》로 아카데미 남우조연상을 받은 미국 배우", emoji: "🎬" },
  ],
  "02-10": [
    { name: "알렉산드르 푸시킨", birthYear: 1799, field: "시인", description: "러시아 근대 문학의 아버지, 《예브게니 오네긴》의 작가", emoji: "✍️" },
    { name: "엠마 로버츠", birthYear: 1991, field: "배우", description: "《아메리칸 호러 스토리》로 주목받은 미국 배우", emoji: "🎬" },
  ],
  "02-11": [
    { name: "토마스 에디슨", birthYear: 1847, field: "발명가", description: "전구·축음기 등 1,000여 개 특허를 남긴 발명왕", emoji: "💡" },
    { name: "세릴 크로우", birthYear: 1962, field: "가수", description: "그래미 9회 수상의 미국 록 팝 싱어송라이터", emoji: "🎸" },
  ],
  "02-12": [
    { name: "찰스 다윈", birthYear: 1809, field: "과학자", description: "《종의 기원》으로 진화론을 정립한 영국의 생물학자", emoji: "🔬" },
    { name: "에이브러햄 링컨", birthYear: 1809, field: "정치인", description: "노예제를 폐지하고 남북전쟁을 이끈 미국 16대 대통령", emoji: "🎩" },
    { name: "크리스티나 리치", birthYear: 1980, field: "배우", description: "《아담스 패밀리》의 웬즈데이로 유명한 미국 배우", emoji: "🎬" },
  ],
  "02-13": [
    { name: "리하르트 바그너", birthYear: 1813, field: "음악가", description: "《니벨룽겐의 반지》 등 오페라를 혁신한 독일 작곡가", emoji: "🎵" },
    { name: "대니얼 디포", birthYear: 1660, field: "작가", description: "《로빈슨 크루소》로 영국 소설의 초석을 놓은 작가", emoji: "🏝️" },
  ],
  "02-14": [
    { name: "프레데릭 더글러스", birthYear: 1818, field: "인권운동가", description: "노예 출신으로 미국 흑인 해방운동을 이끈 연설가·작가", emoji: "✊" },
    { name: "케빈 피터슨", birthYear: 1980, field: "크리켓 선수", description: "잉글랜드 크리켓 역사상 최고의 타자 중 한 명", emoji: "🏏" },
  ],
  "02-15": [
    { name: "갈릴레오 갈릴레이", birthYear: 1564, field: "과학자", description: "지동설을 관측으로 증명한 이탈리아 천문학·물리학의 선구자", emoji: "🔭" },
    { name: "미카", birthYear: 1983, field: "가수", description: "《Grace Kelly》로 팝계에 등장한 레바논계 영국 팝 가수", emoji: "🎤" },
  ],
  "02-16": [
    { name: "지드래곤", birthYear: 1988, field: "가수", description: "빅뱅의 리더이자 K-패션 아이콘으로 불리는 아티스트", emoji: "👑" },
    { name: "이찬원", birthYear: 1997, field: "가수", description: "미스터 트롯 출신 트로트 가수", emoji: "🎶" },
  ],
  "02-17": [
    { name: "마이클 조던", birthYear: 1963, field: "농구선수", description: "NBA 6회 우승, 역사상 가장 위대한 농구 선수", emoji: "🏀" },
    { name: "지오다노 브루노", birthYear: 1548, field: "철학자", description: "지동설을 지지하다 화형당한 이탈리아 철학자", emoji: "🔥" },
  ],
  "02-18": [
    { name: "존 트라볼타", birthYear: 1954, field: "배우", description: "《새터데이 나이트 피버》, 《펄프 픽션》의 할리우드 스타", emoji: "🕺" },
    { name: "윤아", birthYear: 1990, field: "가수 겸 배우", description: "소녀시대 출신으로 가수와 배우를 병행하는 아티스트", emoji: "✨" },
  ],
  "02-19": [
    { name: "니콜라 코페르니쿠스", birthYear: 1473, field: "과학자", description: "태양중심설을 주장해 천문학 혁명을 일으킨 폴란드 과학자", emoji: "🌍" },
    { name: "시드 비셔스", birthYear: 1957, field: "가수", description: "섹스 피스톨즈의 베이시스트, 펑크 록의 상징", emoji: "🎸" },
  ],
  "02-20": [
    { name: "쿠르트 코베인", birthYear: 1967, field: "가수", description: "너바나의 프론트맨, 그런지 록의 아이콘", emoji: "🎸" },
    { name: "리아나", birthYear: 1988, field: "가수", description: "《Umbrella》, 《Diamonds》로 전 세계를 강타한 바베이도스 팝스타", emoji: "☂️" },
  ],
  "02-21": [
    { name: "이효리", birthYear: 1979, field: "가수", description: "핑클 출신으로 솔로 활동까지 성공한 가수", emoji: "🌴" },
    { name: "알렉시 드 토크빌", birthYear: 1805, field: "철학자", description: "《미국의 민주주의》를 저술한 프랑스 정치 사상가", emoji: "📖" },
  ],
  "02-22": [
    { name: "조지 워싱턴", birthYear: 1732, field: "정치인", description: "미국 독립전쟁을 이끌고 초대 대통령이 된 건국의 아버지", emoji: "🇺🇸" },
    { name: "드류 배리모어", birthYear: 1975, field: "배우", description: "《E.T.》 아역 시절부터 성인 배우로 성장한 미국 배우", emoji: "🎬" },
  ],
  "02-23": [
    { name: "도소에이", birthYear: 1685, field: "음악가", description: "바로크 음악의 거장, 합창곡 《메시아》를 작곡한 헨델", emoji: "🎵" },
    { name: "레나 헤드", birthYear: 1983, field: "배우", description: "《왕좌의 게임》에서 세르세이를 연기한 영국 배우", emoji: "👑" },
  ],
  "02-24": [
    { name: "스티브 잡스", birthYear: 1955, field: "기업인", description: "애플을 공동 창업하고 아이폰을 세상에 내놓은 혁신의 상징", emoji: "🍎" },
    { name: "파울로 코엘료", birthYear: 1947, field: "작가", description: "《연금술사》로 전 세계 독자의 가슴을 울린 브라질 소설가", emoji: "📚" },
  ],
  "02-25": [
    { name: "피에르 오귀스트 르누아르", birthYear: 1841, field: "화가", description: "인상주의 화풍으로 빛과 색채를 아름답게 담아낸 프랑스 화가", emoji: "🎨" },
    { name: "글로리아 스타이넘", birthYear: 1934, field: "저널리스트·운동가", description: "미국 현대 페미니즘 운동을 이끈 언론인이자 사회운동가", emoji: "✊" },
  ],
  "02-26": [
    { name: "빅토르 위고", birthYear: 1802, field: "작가", description: "《레 미제라블》, 《노트르담의 꼽추》를 쓴 프랑스 문학의 거인", emoji: "📖" },
    { name: "조니 캐시", birthYear: 1932, field: "가수", description: "컨트리 음악의 전설, 《Ring of Fire》로 유명한 미국 가수", emoji: "🎸" },
  ],
  "02-27": [
    { name: "엘리자베스 테일러", birthYear: 1932, field: "배우", description: "《클레오파트라》의 전설적 여배우, 할리우드 황금기를 빛낸 스타", emoji: "💎" },
    { name: "존 스타인벡", birthYear: 1902, field: "작가", description: "《분노의 포도》로 노벨 문학상을 받은 미국 소설가", emoji: "✍️" },
  ],
  "02-28": [
    { name: "몽테뉴", birthYear: 1533, field: "철학자·작가", description: "에세이 문학의 창시자로 불리는 프랑스 르네상스 사상가", emoji: "📖" },
    { name: "앤설 애덤스", birthYear: 1902, field: "사진작가", description: "미국 자연 풍경 사진의 거장", emoji: "📷" },
  ],

  // ── 3월 ──────────────────────────────────────────────
  "03-01": [
    { name: "저스틴 비버", birthYear: 1994, field: "가수", description: "유튜브로 발굴된 캐나다 팝스타, 전 세계 10대의 아이콘", emoji: "🎤" },
    { name: "론 하워드", birthYear: 1954, field: "영화감독", description: "《뷰티풀 마인드》, 《아폴로 13》을 연출한 할리우드 거장", emoji: "🎬" },
    { name: "프레데릭 쇼팽", birthYear: 1810, field: "음악가", description: "피아노 시인으로 불리는 폴란드 낭만주의 작곡가", emoji: "🎹" },
  ],
  "03-02": [
    { name: "닥터 수스 (시어도어 가이젤)", birthYear: 1904, field: "작가", description: "《초록 달걀과 햄》 등 수많은 어린이 책을 쓴 미국 작가", emoji: "📚" },
    { name: "재클린 듀 프레", birthYear: 1945, field: "음악가", description: "20세기 최고의 첼리스트로 꼽히는 영국 연주자", emoji: "🎵" },
  ],
  "03-03": [
    { name: "알렉산더 그레이엄 벨", birthYear: 1847, field: "발명가", description: "전화기를 발명해 현대 통신의 기초를 놓은 스코틀랜드 발명가", emoji: "📞" },
    { name: "히나 마쓰리 (절기)", birthYear: 0, field: "문화", description: "일본 여자아이의 건강을 기원하는 전통 명절", emoji: "🎎" },
  ],
  "03-04": [
    { name: "안토니오 비발디", birthYear: 1678, field: "음악가", description: "《사계》를 작곡한 이탈리아 바로크 음악의 거장", emoji: "🎻" },
    { name: "케이시 캐스엠", birthYear: 1932, field: "방송인", description: "미국 음악 차트 방송의 전설적 DJ", emoji: "📻" },
  ],
  "03-05": [
    { name: "헨리 2세", birthYear: 1133, field: "왕족", description: "영국 보통법 체계를 확립한 중세 영국 왕", emoji: "👑" },
    { name: "에바 멘데스", birthYear: 1974, field: "배우", description: "《배드 루테넌트》 등에 출연한 쿠바계 미국 배우", emoji: "🎬" },
  ],
  "03-06": [
    { name: "미켈란젤로", birthYear: 1475, field: "예술가", description: "시스티나 성당 천장화와 다비드상을 남긴 르네상스의 거장", emoji: "🗿" },
    { name: "다이앤 폰 퍼스텐버그", birthYear: 1946, field: "패션디자이너", description: "랩드레스를 세계에 유행시킨 벨기에계 패션 디자이너", emoji: "👗" },
  ],
  "03-07": [
    { name: "타미 플래너리", birthYear: 1925, field: "탐험가", description: "자연 탐험과 생태계 연구에 헌신한 환경운동가", emoji: "🌿" },
    { name: "라울 뒤피", birthYear: 1877, field: "화가", description: "밝고 경쾌한 색채로 유명한 프랑스 화가", emoji: "🎨" },
  ],
  "03-08": [
    { name: "세계 여성의 날", birthYear: 0, field: "기념일", description: "여성의 권리와 세계 평화를 기념하는 국제 기념일", emoji: "♀️" },
    { name: "린 알렌", birthYear: 1934, field: "수학자", description: "미국 NASA에서 활약한 수학자", emoji: "🔢" },
  ],
  "03-09": [
    { name: "얀 페르메이르", birthYear: 1632, field: "화가", description: "《우유 따르는 여인》 등 빛의 화가로 불리는 네덜란드 거장", emoji: "🎨" },
    { name: "바비 피셔", birthYear: 1943, field: "체스 선수", description: "20세기 최강의 체스 선수, 세계 챔피언", emoji: "♟️" },
  ],
  "03-10": [
    { name: "해리엇 터브먼", birthYear: 1822, field: "인권운동가", description: "지하 철도를 이용해 수백 명의 노예를 탈출시킨 미국 독립운동가", emoji: "✊" },
    { name: "샤론 스톤", birthYear: 1958, field: "배우", description: "《원초적 본능》으로 세계적 스타가 된 미국 배우", emoji: "🎬" },
  ],
  "03-11": [
    { name: "루퍼트 머독", birthYear: 1931, field: "기업인", description: "뉴스 코프를 이끄는 호주계 미국 미디어 재벌", emoji: "📰" },
    { name: "더글러스 애덤스", birthYear: 1952, field: "작가", description: "《은하수를 여행하는 히치하이커를 위한 안내서》의 영국 작가", emoji: "🚀" },
  ],
  "03-12": [
    { name: "로자 룩셈부르크", birthYear: 1871, field: "사회운동가", description: "독일 사회민주주의와 마르크스주의 운동을 이끈 혁명가", emoji: "✊" },
    { name: "리자 민넬리", birthYear: 1946, field: "배우·가수", description: "《카바레》로 아카데미 여우주연상을 받은 미국 엔터테이너", emoji: "🎭" },
  ],
  "03-13": [
    { name: "나레이 허셜", birthYear: 1781, field: "과학자", description: "천왕성을 발견한 독일계 영국 천문학자", emoji: "🔭" },
    { name: "애덤 클레이턴 파월", birthYear: 1908, field: "정치인", description: "미국 흑인 민권운동을 위해 투쟁한 정치인", emoji: "✊" },
  ],
  "03-14": [
    { name: "알베르트 아인슈타인", birthYear: 1879, field: "물리학자", description: "상대성 이론으로 현대 물리학의 패러다임을 바꾼 천재 과학자", emoji: "🔬" },
    { name: "스티브 맥퀸", birthYear: 1969, field: "영화감독", description: "《노예 12년》으로 아카데미 작품상을 받은 영국 감독", emoji: "🎬" },
  ],
  "03-15": [
    { name: "율리우스 카이사르", birthYear: 0, field: "정치인", description: "고대 로마 공화국을 제국으로 이끈 정치가이자 군인", emoji: "🗡️" },
    { name: "소문 나는 날 (이디어스 오브 마르치)", birthYear: 0, field: "역사", description: "로마력 3월 15일, 카이사르 암살일로 알려진 날", emoji: "🗡️" },
  ],
  "03-16": [
    { name: "제임스 매디슨", birthYear: 1751, field: "정치인", description: "미국 헌법의 아버지이자 4대 대통령", emoji: "🇺🇸" },
    { name: "앨런 투생", birthYear: 1743, field: "혁명가", description: "아이티 독립혁명을 이끈 지도자", emoji: "✊" },
  ],
  "03-17": [
    { name: "성 패트릭", birthYear: 385, field: "성인", description: "아일랜드의 수호성인, 성 패트릭의 날의 주인공", emoji: "🍀" },
    { name: "나탈리 임브루글리아", birthYear: 1975, field: "가수", description: "《Torn》으로 세계적 인기를 얻은 호주 팝 가수", emoji: "🎤" },
  ],
  "03-18": [
    { name: "에드바르 그리그", birthYear: 1843, field: "음악가", description: "《페르귄트》 모음곡을 작곡한 노르웨이 낭만주의 작곡가", emoji: "🎵" },
    { name: "퀸 라티파", birthYear: 1970, field: "가수·배우", description: "힙합과 배우를 병행하는 미국 엔터테이너", emoji: "👑" },
  ],
  "03-19": [
    { name: "다그 함마르셸드", birthYear: 1905, field: "외교관", description: "2대 UN 사무총장, 사후 노벨 평화상 수상", emoji: "☮️" },
    { name: "브루스 윌리스", birthYear: 1955, field: "배우", description: "《다이 하드》 시리즈의 존 맥클레인으로 유명한 액션 배우", emoji: "💥" },
  ],
  "03-20": [
    { name: "이브센", birthYear: 1828, field: "극작가", description: "《인형의 집》을 쓴 근대 연극의 아버지, 노르웨이 극작가", emoji: "🎭" },
    { name: "라파엘로", birthYear: 1483, field: "화가", description: "《아테네 학당》을 그린 르네상스 3대 거장 중 한 명", emoji: "🎨" },
  ],
  "03-21": [
    { name: "요한 제바스티안 바흐", birthYear: 1685, field: "음악가", description: "서양 음악의 아버지로 불리는 독일 바로크 작곡가", emoji: "🎵" },
    { name: "프라 안젤리코", birthYear: 1395, field: "화가", description: "천사와 같은 경건한 종교화로 유명한 이탈리아 화가", emoji: "🎨" },
  ],
  "03-22": [
    { name: "마르셀 마르소", birthYear: 1923, field: "마임 예술가", description: "20세기 최고의 마임 배우, 비페로 유명한 프랑스 예술가", emoji: "🤫" },
    { name: "스티브 발머", birthYear: 1956, field: "기업인", description: "마이크로소프트 2대 CEO를 역임한 기업인", emoji: "💻" },
  ],
  "03-23": [
    { name: "파니 멘델스존", birthYear: 1805, field: "음악가", description: "19세기 뛰어난 피아니스트이자 작곡가, 멘델스존의 누이", emoji: "🎹" },
    { name: "이창동", birthYear: 1954, field: "영화감독", description: "《버닝》, 《시》로 세계 영화계의 주목을 받은 한국 감독", emoji: "🎬" },
  ],
  "03-24": [
    { name: "해리 후디니", birthYear: 1874, field: "마술사", description: "탈출 마술의 전설, 20세기 초 최고의 마술사", emoji: "🪄" },
    { name: "빌헬름 라이히", birthYear: 1897, field: "심리학자", description: "성 혁명과 심리학에 혁신적 이론을 제시한 오스트리아 학자", emoji: "🧠" },
  ],
  "03-25": [
    { name: "엘튼 존", birthYear: 1947, field: "가수", description: "《Rocket Man》, 《Crocodile Rock》 등으로 대중음악의 역사를 쓴 영국 팝스타", emoji: "🎹" },
    { name: "아레사 프랭클린", birthYear: 1942, field: "가수", description: "소울 음악의 여왕, 《Respect》로 전 세계를 사로잡은 미국 가수", emoji: "🎤" },
  ],
  "03-26": [
    { name: "송중기", birthYear: 1985, field: "배우", description: "《태양의 후예》로 한류 인기를 얻은 배우", emoji: "🌞" },
    { name: "테네시 윌리엄스", birthYear: 1911, field: "극작가", description: "《욕망이라는 이름의 전차》를 쓴 미국 현대 연극의 거장", emoji: "🎭" },
  ],
  "03-27": [
    { name: "마리아노 리베라", birthYear: 1969, field: "야구선수", description: "메이저리그 역사상 최고의 마무리 투수", emoji: "⚾" },
    { name: "미하엘 에른데", birthYear: 1929, field: "작가", description: "《끝없는 이야기》, 《모모》를 쓴 독일 동화 작가", emoji: "📖" },
  ],
  "03-28": [
    { name: "버지니아 울프", birthYear: 1882, field: "작가", description: "《댈러웨이 부인》을 쓴 영국 모더니즘 문학의 선구자", emoji: "✍️" },
    { name: "라파엘 나달", birthYear: 1986, field: "테니스선수", description: "클레이코트 최강자, 롤랑가로스 14회 우승의 스페인 테니스 황제", emoji: "🎾" },
  ],
  "03-29": [
    { name: "존 타일러", birthYear: 1790, field: "정치인", description: "미국 10대 대통령", emoji: "🇺🇸" },
    { name: "에릭 클랩튼", birthYear: 1945, field: "가수·기타리스트", description: "《Layla》, 《Tears in Heaven》의 영국 기타 레전드", emoji: "🎸" },
  ],
  "03-30": [
    { name: "아이유", birthYear: 1993, field: "가수", description: "싱어송라이터이자 배우로 활동하는 올라운더 아티스트", emoji: "🎶" },
    { name: "반 고흐", birthYear: 1853, field: "화가", description: "《별이 빛나는 밤》을 그린 네덜란드 후기 인상주의 화가", emoji: "🌻" },
    { name: "세르게이 라흐마니노프", birthYear: 1873, field: "음악가", description: "낭만주의 피아노 협주곡의 거장인 러시아 작곡가", emoji: "🎹" },
  ],
  "03-31": [
    { name: "르네 데카르트", birthYear: 1596, field: "철학자", description: "\"나는 생각한다, 고로 나는 존재한다\"를 남긴 프랑스 철학자", emoji: "🧠" },
    { name: "조지아 오키프", birthYear: 1887, field: "화가", description: "꽃과 사막 풍경으로 미국 현대 미술을 개척한 화가", emoji: "🌸" },
  ],

  // ── 4월 ──────────────────────────────────────────────
  "04-01": [
    { name: "비스마르크", birthYear: 1815, field: "정치인", description: "독일 제국을 통일한 철혈 재상", emoji: "⚔️" },
    { name: "수잔 보일", birthYear: 1961, field: "가수", description: "《브리튼즈 갓 탤런트》로 세계를 감동시킨 스코틀랜드 가수", emoji: "🎤" },
  ],
  "04-02": [
    { name: "한스 크리스티안 안데르센", birthYear: 1805, field: "작가", description: "《인어공주》, 《미운 오리 새끼》를 쓴 덴마크 동화 작가", emoji: "📖" },
    { name: "마이클 패스벤더", birthYear: 1977, field: "배우", description: "《12년간의 노예》, 《엑스맨》 시리즈로 주목받은 아일랜드 배우", emoji: "🎬" },
  ],
  "04-03": [
    { name: "제인 구달", birthYear: 1934, field: "동물학자", description: "침팬지 연구로 영장류학을 발전시킨 영국 환경운동가", emoji: "🐒" },
    { name: "마브 앨버트", birthYear: 1943, field: "스포츠 해설가", description: "미국 NBA·NFL 중계의 전설적 스포츠 캐스터", emoji: "🎙️" },
  ],
  "04-04": [
    { name: "로버트 다우니 주니어", birthYear: 1965, field: "배우", description: "아이언맨 역으로 마블 유니버스를 이끈 할리우드 스타", emoji: "🦾" },
    { name: "마야 안젤루", birthYear: 1928, field: "시인·작가", description: "《새장에 갇힌 새가 왜 노래하는지 나는 알아》의 미국 흑인 작가", emoji: "✍️" },
  ],
  "04-05": [
    { name: "임영웅", birthYear: 1991, field: "가수", description: "트로트 열풍을 이끈 가수", emoji: "🎤" },
    { name: "부처 (탄생 추정)", birthYear: -563, field: "종교", description: "불교를 창시한 석가모니, 탄생일은 지역마다 다르게 기림", emoji: "🌸" },
    { name: "토마스 홉스", birthYear: 1588, field: "철학자", description: "《리바이어던》을 쓴 영국 정치철학의 선구자", emoji: "📚" },
  ],
  "04-06": [
    { name: "라파엘로 산치오", birthYear: 1483, field: "화가", description: "《아테네 학당》을 그린 르네상스 3대 거장 중 한 명 (4/6 기준)", emoji: "🎨" },
    { name: "폴 롭슨", birthYear: 1898, field: "가수·배우", description: "흑인 인권운동을 이끈 미국의 바리톤 가수이자 배우", emoji: "✊" },
  ],
  "04-07": [
    { name: "빌헬름 쾨니히", birthYear: 1901, field: "학자", description: "고대 바그다드 전지를 발견한 독일 고고학자", emoji: "🔬" },
    { name: "재키 채 (성룡)", birthYear: 1954, field: "배우", description: "쿵후 액션의 아이콘, 전 세계에서 사랑받는 홍콩 배우", emoji: "🥋" },
  ],
  "04-08": [
    { name: "파블로 피카소", birthYear: 1881, field: "화가", description: "입체주의를 창시한 20세기 최고의 화가", emoji: "🎨" },
    { name: "세이나 제이", birthYear: 1997, field: "가수", description: "중국 아이돌 그룹 SNH48의 멤버", emoji: "🎶" },
  ],
  "04-09": [
    { name: "찰스 보들레르", birthYear: 1821, field: "시인", description: "《악의 꽃》을 쓴 프랑스 상징주의 시의 선구자", emoji: "🌹" },
    { name: "이세돌", birthYear: 1983, field: "바둑기사", description: "알파고와의 대국으로 세계적 주목을 받은 한국 바둑기사", emoji: "⬛" },
  ],
  "04-10": [
    { name: "오마르 샤리프", birthYear: 1932, field: "배우", description: "《닥터 지바고》의 주연을 맡은 이집트 배우", emoji: "🎬" },
    { name: "조셉 풀리처", birthYear: 1847, field: "언론인", description: "퓰리처상의 창시자, 미국 언론의 선구자", emoji: "📰" },
  ],
  "04-11": [
    { name: "올리버 크롬웰", birthYear: 1599, field: "정치인", description: "영국 내전을 이끌고 공화국을 수립한 정치가", emoji: "⚔️" },
    { name: "제레미 클락슨", birthYear: 1960, field: "방송인", description: "자동차 프로그램 《탑 기어》의 진행자로 유명한 영국 방송인", emoji: "🚗" },
  ],
  "04-12": [
    { name: "서현진", birthYear: 1985, field: "배우", description: "로맨스와 드라마 장르에서 활약하는 배우", emoji: "🎭" },
    { name: "데이비드 레터맨", birthYear: 1947, field: "방송인", description: "심야 토크쇼의 레전드, 미국 NBC·CBS 진행자", emoji: "😄" },
  ],
  "04-13": [
    { name: "토마스 제퍼슨", birthYear: 1743, field: "정치인", description: "독립선언문을 기초하고 미국 3대 대통령이 된 건국의 아버지", emoji: "🇺🇸" },
    { name: "알 그린", birthYear: 1946, field: "가수", description: "소울 음악의 전설, 《Let's Stay Together》로 유명한 미국 가수", emoji: "🎤" },
  ],
  "04-14": [
    { name: "크리스티안 하위헌스", birthYear: 1629, field: "과학자", description: "토성의 고리와 위성을 발견한 네덜란드 천문학자", emoji: "🪐" },
    { name: "로드니 데인저필드", birthYear: 1921, field: "코미디언", description: "미국의 전설적 스탠드업 코미디언", emoji: "😄" },
  ],
  "04-15": [
    { name: "레오나르도 다빈치", birthYear: 1452, field: "예술가·발명가", description: "《모나리자》를 그리고 헬리콥터를 설계한 르네상스의 천재", emoji: "🎨" },
    { name: "엠마 왓슨", birthYear: 1990, field: "배우", description: "《해리 포터》의 헤르미온느로 전 세계 팬을 사로잡은 영국 배우", emoji: "⚡" },
    { name: "세드릭 더 엔터테이너", birthYear: 1964, field: "코미디언", description: "미국의 인기 코미디언이자 배우", emoji: "😂" },
  ],
  "04-16": [
    { name: "찰리 채플린", birthYear: 1889, field: "배우·감독", description: "《모던 타임스》, 《위대한 독재자》로 영화사에 이름을 남긴 코미디의 왕", emoji: "🎩" },
    { name: "베르나데트 수비루", birthYear: 1844, field: "성인", description: "루르드 성모 발현을 목격한 프랑스 가톨릭 성인", emoji: "⛪" },
  ],
  "04-17": [
    { name: "니키타 흐루쇼프", birthYear: 1894, field: "정치인", description: "스탈린 격하 운동을 이끈 소련 공산당 서기장", emoji: "☭" },
    { name: "제니퍼 가너", birthYear: 1972, field: "배우", description: "《앨리어스》로 스타덤에 오른 미국 배우", emoji: "🎬" },
  ],
  "04-18": [
    { name: "레오폴트 스토코프스키", birthYear: 1882, field: "음악가", description: "필라델피아 오케스트라를 세계적 수준으로 올린 영국계 지휘자", emoji: "🎵" },
    { name: "임창정", birthYear: 1973, field: "가수", description: "《소주 한 잔》으로 유명한 한국 발라드 가수", emoji: "🎤" },
  ],
  "04-19": [
    { name: "루이스와 클라크 (루이스 생일)", birthYear: 1774, field: "탐험가", description: "미국 서부 탐험대 루이스 앤 클라크 원정대의 메리웨더 루이스", emoji: "🧭" },
    { name: "타이거 우즈", birthYear: 1975, field: "골프선수", description: "마스터스 5회 우승, 세계 골프의 살아있는 전설", emoji: "⛳" },
  ],
  "04-20": [
    { name: "히틀러", birthYear: 1889, field: "정치인", description: "2차 세계대전을 일으킨 독일 나치 독재자", emoji: "📖" },
    { name: "카르멘 엘렉트라", birthYear: 1972, field: "배우·모델", description: "《베이워치》로 유명한 미국 배우 겸 모델", emoji: "🎬" },
  ],
  "04-21": [
    { name: "엘리자베스 2세", birthYear: 1926, field: "왕족", description: "영국 역사상 가장 오래 재위한 여왕, 70년 이상 왕위를 지킨 인물", emoji: "👑" },
    { name: "안토니 퀸", birthYear: 1915, field: "배우", description: "《그리스인 조르바》의 멕시코계 미국 배우", emoji: "🎬" },
  ],
  "04-22": [
    { name: "블라디미르 레닌", birthYear: 1870, field: "혁명가", description: "러시아 볼셰비키 혁명을 이끈 소련의 창시자", emoji: "☭" },
    { name: "잭 니콜슨", birthYear: 1937, field: "배우", description: "《뻐꾸기 둥지 위로 날아간 새》, 《샤이닝》의 할리우드 레전드", emoji: "😈" },
  ],
  "04-23": [
    { name: "윌리엄 셰익스피어", birthYear: 1564, field: "극작가", description: "《햄릿》, 《로미오와 줄리엣》을 쓴 영문학 최고의 극작가", emoji: "🎭" },
    { name: "세르반테스", birthYear: 1547, field: "작가", description: "《돈키호테》를 쓴 스페인 문학의 거장", emoji: "✍️" },
    { name: "워즈워스", birthYear: 1770, field: "시인", description: "낭만주의 시운동을 이끈 영국 계관시인", emoji: "🌿" },
  ],
  "04-24": [
    { name: "바르비롤리", birthYear: 1899, field: "음악가", description: "맨체스터 할레 오케스트라를 이끈 이탈리아계 영국 지휘자", emoji: "🎵" },
    { name: "바버라 스트라이산드", birthYear: 1942, field: "가수·배우", description: "그래미·아카데미를 석권한 미국 최고의 엔터테이너", emoji: "🎤" },
  ],
  "04-25": [
    { name: "구스타프 말러", birthYear: 1860, field: "음악가", description: "교향곡 9곡으로 낭만주의를 완성한 오스트리아 작곡가", emoji: "🎵" },
    { name: "알 파치노", birthYear: 1940, field: "배우", description: "《대부》, 《스카페이스》의 할리우드 레전드", emoji: "🎬" },
  ],
  "04-26": [
    { name: "존 제임스 오더번", birthYear: 1785, field: "자연학자", description: "미국 새 도감으로 유명한 프랑스계 조류학자", emoji: "🐦" },
    { name: "케빈 자렛 (키스 재렛)", birthYear: 1945, field: "음악가", description: "즉흥 피아노 연주의 거장, 재즈와 클래식을 넘나드는 연주자", emoji: "🎹" },
  ],
  "04-27": [
    { name: "메리 울스턴크래프트", birthYear: 1759, field: "작가·철학자", description: "《여성의 권리 옹호》를 쓴 영국 페미니즘의 어머니", emoji: "✊" },
    { name: "코리타 켄트", birthYear: 1918, field: "예술가", description: "팝아트와 사회운동을 결합한 미국 수녀이자 예술가", emoji: "🎨" },
  ],
  "04-28": [
    { name: "오스카 쉰들러", birthYear: 1908, field: "기업인", description: "2차 세계대전 당시 유대인 1,200명을 구한 독일 사업가", emoji: "🕯️" },
    { name: "제시카 알바", birthYear: 1981, field: "배우", description: "《판타스틱 4》, 《죄악의 도시》의 미국 배우", emoji: "🎬" },
  ],
  "04-29": [
    { name: "케이트 미들턴과 윌리엄 왕자 결혼기념일", birthYear: 1981, field: "왕족", description: "영국 왕실의 혼인일 (2011) — 헨리 8세 생일도 4/29 언급됨", emoji: "👑" },
    { name: "윌리 넬슨", birthYear: 1933, field: "가수", description: "컨트리 음악의 전설, 수십 년 현역으로 활약하는 미국 가수", emoji: "🎸" },
  ],
  "04-30": [
    { name: "아돌프 히틀러 사망", birthYear: 0, field: "역사", description: "역사적 기록 목적 — 1945년 4월 30일 사망", emoji: "📖" },
    { name: "칼 프리드리히 가우스", birthYear: 1777, field: "수학자", description: "수학의 왕자로 불리는 독일의 천재 수학자·물리학자", emoji: "🔢" },
  ],

  // ── 5월 ──────────────────────────────────────────────
  "05-01": [
    { name: "글렌 포드", birthYear: 1916, field: "배우", description: "할리우드 황금기의 서부극 스타", emoji: "🎬" },
    { name: "팀 맥그로우", birthYear: 1967, field: "가수", description: "컨트리 팝의 슈퍼스타, 《Live Like You Were Dying》으로 유명", emoji: "🎸" },
  ],
  "05-02": [
    { name: "레오나르도 다빈치 사망일", birthYear: 0, field: "역사", description: "역사 기록", emoji: "📖" },
    { name: "데이비드 베컴", birthYear: 1975, field: "축구선수", description: "맨체스터 유나이티드와 레알 마드리드를 거친 영국 축구 스타", emoji: "⚽" },
  ],
  "05-03": [
    { name: "제임스 브라운", birthYear: 1933, field: "가수", description: "소울 음악의 대부, 《I Got You》로 유명한 미국 펑크 가수", emoji: "🕺" },
    { name: "골다 메이어", birthYear: 1898, field: "정치인", description: "이스라엘 최초의 여성 총리", emoji: "🇮🇱" },
  ],
  "05-04": [
    { name: "오드리 헵번", birthYear: 1929, field: "배우", description: "《로마의 휴일》, 《티파니에서 아침을》의 영원한 스타", emoji: "💎" },
    { name: "오스카 피터슨", birthYear: 1925, field: "음악가", description: "재즈 피아노의 거장, 캐나다 출신 재즈 레전드", emoji: "🎹" },
  ],
  "05-05": [
    { name: "칼 마르크스", birthYear: 1818, field: "철학자·경제학자", description: "《공산당 선언》을 쓴 사회주의 사상의 창시자", emoji: "📚" },
    { name: "아델", birthYear: 1988, field: "가수", description: "《Hello》, 《Rolling in the Deep》으로 세계를 울린 영국 팝스타", emoji: "🎤" },
    { name: "네야마르 다 실바 산토스 주니오르", birthYear: 1992, field: "축구선수", description: "브라질의 화려한 테크닉을 자랑하는 세계 최고 공격수 중 한 명", emoji: "⚽" },
  ],
  "05-06": [
    { name: "시그문트 프로이트", birthYear: 1856, field: "심리학자", description: "정신분석학을 창시해 현대 심리학의 틀을 바꾼 오스트리아 의사", emoji: "🧠" },
    { name: "조지 클루니", birthYear: 1961, field: "배우·감독", description: "《오션스 일레븐》, 《굿 나이트 앤 굿 럭》의 할리우드 스타", emoji: "🎬" },
  ],
  "05-07": [
    { name: "차이콥스키", birthYear: 1840, field: "음악가", description: "《백조의 호수》, 《호두까기 인형》을 작곡한 러시아 낭만주의 작곡가", emoji: "🎵" },
    { name: "요하네스 브람스", birthYear: 1833, field: "음악가", description: "독일 낭만주의를 대표하는 교향곡과 실내악의 거장", emoji: "🎵" },
  ],
  "05-08": [
    { name: "해리 트루먼", birthYear: 1884, field: "정치인", description: "원자폭탄 투하를 결정하고 냉전을 이끈 미국 33대 대통령", emoji: "🇺🇸" },
    { name: "로베르토 로셀리니", birthYear: 1906, field: "영화감독", description: "이탈리아 네오리얼리즘 영화의 선구자", emoji: "🎬" },
  ],
  "05-09": [
    { name: "빌리 조엘", birthYear: 1949, field: "가수", description: "《Piano Man》으로 유명한 미국 팝 록 가수", emoji: "🎹" },
    { name: "소피아 로렌", birthYear: 1934, field: "배우", description: "이탈리아를 대표하는 세계적 영화배우", emoji: "🎬" },
  ],
  "05-10": [
    { name: "프레드 아스테어", birthYear: 1899, field: "배우·댄서", description: "탭댄스와 뮤지컬 영화의 전설, 할리우드 황금기의 아이콘", emoji: "🕺" },
    { name: "보노", birthYear: 1960, field: "가수", description: "U2의 리더이자 세계적 인도주의 활동가", emoji: "🎸" },
  ],
  "05-11": [
    { name: "살바도르 달리", birthYear: 1904, field: "화가", description: "녹아내리는 시계로 유명한 스페인 초현실주의 화가", emoji: "🎨" },
    { name: "글렌 밀러", birthYear: 1904, field: "음악가", description: "《In the Mood》로 유명한 미국 빅밴드 음악의 전설", emoji: "🎺" },
  ],
  "05-12": [
    { name: "플로렌스 나이팅게일", birthYear: 1820, field: "간호사", description: "근대 간호학의 창시자, 크림 전쟁에서 부상병을 돌본 영국 간호사", emoji: "🏥" },
    { name: "유나이티드 킹덤 기념일", birthYear: 0, field: "기타", description: "역사 날짜 마커", emoji: "🇬🇧" },
  ],
  "05-13": [
    { name: "스테비 원더", birthYear: 1950, field: "가수", description: "태어날 때부터 시각장애를 갖고도 팝·소울의 전설이 된 미국 뮤지션", emoji: "🎹" },
    { name: "조 루이스", birthYear: 1914, field: "권투선수", description: "브라운 봄버로 불린 미국 헤비급 챔피언", emoji: "🥊" },
  ],
  "05-14": [
    { name: "마크 저커버그", birthYear: 1984, field: "기업인", description: "페이스북(현 메타)을 창업해 소셜미디어 혁명을 이끈 기업가", emoji: "💻" },
    { name: "조지 루카스", birthYear: 1944, field: "영화감독", description: "《스타워즈》와 《인디아나 존스》를 탄생시킨 할리우드 거장", emoji: "🚀" },
  ],
  "05-15": [
    { name: "피에르 퀴리", birthYear: 1859, field: "과학자", description: "방사성 원소를 발견한 프랑스 물리학자, 마리 퀴리의 남편", emoji: "🔬" },
    { name: "앤디 머레이", birthYear: 1987, field: "테니스선수", description: "윔블던 2회 우승의 영국 테니스 스타", emoji: "🎾" },
  ],
  "05-16": [
    { name: "김태리", birthYear: 1990, field: "배우", description: "《미스터 션샤인》으로 주목받은 배우", emoji: "✨" },
    { name: "재닛 잭슨", birthYear: 1966, field: "가수", description: "《Control》, 《Nasty》로 팝·R&B를 이끈 미국 팝스타", emoji: "🎤" },
  ],
  "05-17": [
    { name: "에릭 사티", birthYear: 1866, field: "음악가", description: "《짐노페디》를 작곡한 프랑스 인상주의 작곡가", emoji: "🎹" },
    { name: "Birgit Nilsson", birthYear: 1918, field: "음악가", description: "바그너 소프라노의 전설적 스웨덴 성악가", emoji: "🎵" },
  ],
  "05-18": [
    { name: "버트런드 러셀", birthYear: 1872, field: "철학자", description: "논리학과 분석철학을 이끈 영국의 수학자·철학자, 노벨 문학상 수상", emoji: "📚" },
    { name: "티나 페이", birthYear: 1970, field: "코미디언·배우", description: "《새터데이 나이트 라이브》와 《30 Rock》으로 유명한 미국 코미디언", emoji: "😄" },
  ],
  "05-19": [
    { name: "앤 불린", birthYear: 1501, field: "왕족", description: "영국 헨리 8세의 두 번째 왕비, 엘리자베스 1세의 어머니", emoji: "👑" },
    { name: "말콤 엑스", birthYear: 1925, field: "인권운동가", description: "흑인 이슬람 운동과 민권운동을 이끈 미국 급진적 운동가", emoji: "✊" },
  ],
  "05-20": [
    { name: "발자크", birthYear: 1799, field: "작가", description: "《고리오 영감》을 쓴 프랑스 사실주의 소설의 거장", emoji: "📖" },
    { name: "제임스 스튜어트", birthYear: 1908, field: "배우", description: "《멋진 인생》, 《히치콕의 현기증》의 할리우드 레전드", emoji: "🎬" },
  ],
  "05-21": [
    { name: "알브레히트 뒤러", birthYear: 1471, field: "화가", description: "르네상스 북유럽 회화를 대표하는 독일 화가·판화가", emoji: "🎨" },
    { name: "앤 공주", birthYear: 1950, field: "왕족", description: "영국 엘리자베스 2세의 딸, 올림픽 승마 국가대표 출신", emoji: "👑" },
  ],
  "05-22": [
    { name: "리하르트 바그너", birthYear: 1813, field: "음악가", description: "《니벨룽겐의 반지》로 오페라를 혁신한 독일 작곡가", emoji: "🎵" },
    { name: "나오미 캠벨", birthYear: 1970, field: "모델", description: "세계 최초의 흑인 슈퍼모델 중 한 명", emoji: "👗" },
  ],
  "05-23": [
    { name: "조이스 캐롤 오츠", birthYear: 1938, field: "작가", description: "퓰리처상 후보에 오른 미국 현대문학의 대표 작가", emoji: "✍️" },
  ],
  "05-24": [
    { name: "밥 딜런", birthYear: 1941, field: "가수·시인", description: "《Blowin' in the Wind》로 노벨 문학상을 받은 미국 민중 가수", emoji: "🎸" },
    { name: "퀸 빅토리아", birthYear: 1819, field: "왕족", description: "대영제국 최전성기를 이끈 영국 여왕", emoji: "👑" },
  ],
  "05-25": [
    { name: "랄프 왈도 에머슨", birthYear: 1803, field: "철학자·작가", description: "미국 초월주의를 이끈 사상가이자 시인", emoji: "📖" },
    { name: "이안 맥켈런", birthYear: 1939, field: "배우", description: "《반지의 제왕》의 간달프를 연기한 영국 배우", emoji: "🧙" },
  ],
  "05-26": [
    { name: "살 미네오", birthYear: 1939, field: "배우", description: "《이유 없는 반항》에서 제임스 딘과 호흡을 맞춘 배우", emoji: "🎬" },
    { name: "존 웨인", birthYear: 1907, field: "배우", description: "서부극의 전설, 《진짜 용기》로 아카데미를 수상한 미국 배우", emoji: "🤠" },
  ],
  "05-27": [
    { name: "율리시스 그랜트", birthYear: 1822, field: "정치인", description: "남북전쟁의 북군 총사령관이자 미국 18대 대통령", emoji: "🇺🇸" },
    { name: "제이미 올리버", birthYear: 1975, field: "요리사", description: "전 세계 어린이 급식 개선에 앞장선 영국 유명 셰프", emoji: "🍳" },
  ],
  "05-28": [
    { name: "카일 민로그", birthYear: 1968, field: "가수", description: "《Can't Get You Out of My Head》로 세계를 강타한 호주 팝스타", emoji: "🎤" },
  ],
  "05-29": [
    { name: "존 F. 케네디", birthYear: 1917, field: "정치인", description: "미국 35대 대통령, 쿠바 미사일 위기를 극복한 젊은 지도자", emoji: "🇺🇸" },
    { name: "패트릭 헨리", birthYear: 1736, field: "독립운동가", description: "'자유가 아니면 죽음을 달라'로 유명한 미국 독립혁명의 웅변가", emoji: "🗽" },
  ],
  "05-30": [
    { name: "한소희", birthYear: 1994, field: "배우", description: "강렬한 이미지로 주목받는 배우", emoji: "🖤" },
    { name: "조안 오브 아크 순교일", birthYear: 1412, field: "역사", description: "1431년 5월 30일 화형당한 프랑스의 영웅", emoji: "⚔️" },
  ],
  "05-31": [
    { name: "클린트 이스트우드", birthYear: 1930, field: "배우·감독", description: "《황야의 무법자》, 《밀리언 달러 베이비》의 할리우드 거장", emoji: "🤠" },
    { name: "콜린 파렐", birthYear: 1976, field: "배우", description: "《인 브뤼헤》, 《더 배트맨》으로 주목받은 아일랜드 배우", emoji: "🎬" },
  ],

  // ── 6월 ──────────────────────────────────────────────
  "06-01": [
    { name: "마릴린 먼로", birthYear: 1926, field: "배우", description: "《7년만의 외출》로 할리우드 최고의 섹스 심벌이 된 미국 배우", emoji: "⭐" },
    { name: "모건 프리먼", birthYear: 1937, field: "배우", description: "《쇼생크 탈출》, 《밀리언 달러 베이비》의 명배우", emoji: "🎬" },
    { name: "런던 스미스", birthYear: 1980, field: "기타", description: "날짜 마커", emoji: "📅" },
  ],
  "06-02": [
    { name: "토머스 하디", birthYear: 1840, field: "작가", description: "《테스》를 쓴 영국 빅토리아 시대 소설가", emoji: "📖" },
    { name: "웨인 그레츠키", birthYear: 1961, field: "아이스하키 선수", description: "NHL 역사상 최다 득점의 캐나다 아이스하키 황제", emoji: "🏒" },
  ],
  "06-03": [
    { name: "앨런 긴즈버그", birthYear: 1926, field: "시인", description: "《울부짖음》으로 비트 제너레이션을 이끈 미국 시인", emoji: "✍️" },
    { name: "라파엘 나달", birthYear: 1986, field: "테니스선수", description: "공식 생일은 6/3, 클레이 코트 최강자", emoji: "🎾" },
  ],
  "06-04": [
    { name: "현빈", birthYear: 1982, field: "배우", description: "《사랑의 불시착》으로 글로벌 인기를 얻은 배우", emoji: "🚁" },
    { name: "안젤리나 졸리", birthYear: 1975, field: "배우", description: "《툼 레이더》, 《미스터 앤 미세스 스미스》의 할리우드 스타이자 UN 친선대사", emoji: "🎬" },
  ],
  "06-05": [
    { name: "아담 스미스", birthYear: 1723, field: "경제학자", description: "《국부론》을 저술한 현대 경제학의 아버지", emoji: "💰" },
  ],
  "06-06": [
    { name: "알렉산더 푸시킨", birthYear: 1799, field: "시인", description: "러시아 근대 문학의 아버지", emoji: "✍️" },
    { name: "토마스 만", birthYear: 1875, field: "작가", description: "《마의 산》, 《부덴브로크 가의 사람들》의 독일 노벨 문학상 수상 작가", emoji: "📖" },
  ],
  "06-07": [
    { name: "앨런 튜링", birthYear: 1912, field: "수학자·컴퓨터 과학자", description: "현대 컴퓨터의 이론적 기초를 닦은 영국 수학자, 2차 대전 암호 해독의 영웅", emoji: "💻" },
    { name: "데이브 브루벡", birthYear: 1920, field: "음악가", description: "《Take Five》로 유명한 미국 재즈 피아니스트", emoji: "🎹" },
  ],
  "06-08": [
    { name: "프랭크 로이드 라이트", birthYear: 1867, field: "건축가", description: "낙수장을 설계한 미국 현대 건축의 아버지", emoji: "🏛️" },
    { name: "캐런 카펜터", birthYear: 1950, field: "가수", description: "카펜터스의 보컬, 《(They Long to Be) Close to You》로 유명", emoji: "🎤" },
  ],
  "06-09": [
    { name: "코린 베일리 레이", birthYear: 1979, field: "가수", description: "영국 소울·재즈 팝 가수, 《Put Your Records On》으로 유명", emoji: "🎤" },
    { name: "조니 데프", birthYear: 1963, field: "배우", description: "《캐리비안의 해적》의 잭 스패로우, 독창적인 연기의 할리우드 스타", emoji: "🏴‍☠️" },
  ],
  "06-10": [
    { name: "주디 갈런드", birthYear: 1922, field: "배우·가수", description: "《오즈의 마법사》의 도로시를 연기한 미국 배우·가수", emoji: "🌈" },
    { name: "프린스 필립 공", birthYear: 1921, field: "왕족", description: "엘리자베스 2세의 남편, 영국 에든버러 공작", emoji: "👑" },
  ],
  "06-11": [
    { name: "자크 쿠스토", birthYear: 1910, field: "탐험가", description: "해양 탐험과 다큐멘터리로 바다를 세상에 알린 프랑스 탐험가", emoji: "🌊" },
    { name: "휴 로리", birthYear: 1959, field: "배우", description: "《닥터 하우스》의 그레고리 하우스를 연기한 영국 배우", emoji: "🩺" },
  ],
  "06-12": [
    { name: "앤 프랑크", birthYear: 1929, field: "일기 작가", description: "나치를 피해 숨어 지낸 2년간의 기록을 남긴 유대인 소녀", emoji: "📔" },
    { name: "조지 H.W. 부시", birthYear: 1924, field: "정치인", description: "냉전 종식기에 미국 41대 대통령을 역임한 정치인", emoji: "🇺🇸" },
  ],
  "06-13": [
    { name: "W.B. 예이츠", birthYear: 1865, field: "시인", description: "노벨 문학상을 수상한 아일랜드 낭만주의 시인", emoji: "✍️" },
    { name: "크리스 에반스", birthYear: 1981, field: "배우", description: "마블 캡틴 아메리카 역으로 전 세계 팬을 사로잡은 배우", emoji: "🛡️" },
  ],
  "06-14": [
    { name: "체 게바라", birthYear: 1928, field: "혁명가", description: "쿠바 혁명을 이끈 아르헨티나 출신의 게릴라 지도자", emoji: "✊" },
    { name: "도날드 트럼프", birthYear: 1946, field: "정치인", description: "미국 45대 및 47대 대통령, 부동산 재벌 출신 정치인", emoji: "🇺🇸" },
  ],
  "06-15": [
    { name: "에드바르 그리그", birthYear: 1843, field: "음악가", description: "《페르귄트》 모음곡을 작곡한 노르웨이 낭만주의 작곡가", emoji: "🎵" },
    { name: "네일 패트릭 해리스", birthYear: 1973, field: "배우", description: "《하우 아이 맷 유어 마더》의 바니 스틴슨을 연기한 배우", emoji: "🎩" },
  ],
  "06-16": [
    { name: "에릭 메탁사스", birthYear: 1963, field: "작가", description: "디트리히 본회퍼 전기로 유명한 미국 저자", emoji: "📚" },
    { name: "줄리 아펠", birthYear: 1980, field: "기타", description: "날짜 마커", emoji: "📅" },
  ],
  "06-17": [
    { name: "에드 시런", birthYear: 1991, field: "가수", description: "《Shape of You》, 《Perfect》로 세계를 사로잡은 영국 팝 싱어송라이터", emoji: "🎸" },
    { name: "제인 요렌", birthYear: 1939, field: "작가", description: "400권 이상의 어린이 책을 쓴 미국 동화 작가", emoji: "📚" },
  ],
  "06-18": [
    { name: "폴 매카트니", birthYear: 1942, field: "가수", description: "비틀즈의 베이시스트이자 작곡가, 《Yesterday》, 《Hey Jude》의 공동 창작자", emoji: "🎸" },
    { name: "이자벨 아옌데", birthYear: 1942, field: "작가", description: "《영혼의 집》을 쓴 칠레 마술적 사실주의 소설가", emoji: "📖" },
  ],
  "06-19": [
    { name: "블레즈 파스칼", birthYear: 1623, field: "수학자·철학자", description: "파스칼의 삼각형과 확률론을 발전시킨 프랑스 천재", emoji: "🔢" },
    { name: "조에나 다크", birthYear: 1977, field: "배우", description: "날짜 마커", emoji: "📅" },
  ],
  "06-20": [
    { name: "에롤 플린", birthYear: 1909, field: "배우", description: "《로빈 후드의 모험》으로 유명한 호주계 할리우드 스타", emoji: "🗡️" },
  ],
  "06-21": [
    { name: "인민스 (서머 솔스티스)", birthYear: 0, field: "문화", description: "북반구 하지, 낮이 가장 긴 날", emoji: "☀️" },
    { name: "윌리엄 왕자", birthYear: 1982, field: "왕족", description: "영국 왕세자, 찰스 3세의 아들이자 미래 국왕", emoji: "👑" },
  ],
  "06-22": [
    { name: "전지현", birthYear: 1981, field: "배우", description: "《엽기적인 그녀》로 스타덤에 오른 배우", emoji: "🌊" },
  ],
  "06-23": [
    { name: "앨런 튜링", birthYear: 1912, field: "수학자", description: "현대 컴퓨터 이론의 아버지", emoji: "💻" },
    { name: "제인 랜돌프", birthYear: 1915, field: "배우", description: "날짜 마커", emoji: "📅" },
  ],
  "06-24": [
    { name: "리오넬 메시", birthYear: 1987, field: "축구선수", description: "FC 바르셀로나와 아르헨티나 국가대표의 살아있는 전설", emoji: "⚽" },
    { name: "이재규 감독", birthYear: 1972, field: "영화감독", description: "《써니》를 연출한 한국 영화 감독", emoji: "🎬" },
  ],
  "06-25": [
    { name: "조지 오웰", birthYear: 1903, field: "작가", description: "《1984》, 《동물농장》으로 전체주의를 비판한 영국 소설가", emoji: "✍️" },
    { name: "안토니오 가우디", birthYear: 1852, field: "건축가", description: "사그라다 파밀리아를 설계한 스페인의 천재 건축가", emoji: "🏛️" },
    { name: "마이클 잭슨 추모일", birthYear: 0, field: "역사", description: "2009년 6월 25일 사망한 팝의 황제 (추모 기록)", emoji: "🎵" },
  ],
  "06-26": [
    { name: "펄 벅", birthYear: 1892, field: "작가", description: "《대지》로 노벨 문학상을 받은 미국 작가", emoji: "📖" },
    { name: "마돈나", birthYear: 1958, field: "가수", description: "《Like a Virgin》으로 팝의 여왕이 된 미국 팝스타", emoji: "🎤" },
  ],
  "06-27": [
    { name: "헬렌 켈러", birthYear: 1880, field: "교육자·운동가", description: "시청각 장애를 극복하고 세계에 희망을 전한 미국의 교육자", emoji: "✋" },
    { name: "이소라", birthYear: 1969, field: "가수", description: "감성 발라드로 사랑받는 한국 가수", emoji: "🎤" },
  ],
  "06-28": [
    { name: "장 자크 루소", birthYear: 1712, field: "철학자", description: "《사회계약론》을 쓴 프랑스 계몽주의 철학자", emoji: "📚" },
    { name: "이주영", birthYear: 1990, field: "배우", description: "개성 있는 연기로 주목받는 한국 배우", emoji: "🎭" },
  ],
  "06-29": [
    { name: "안토니 브라운", birthYear: 1946, field: "작가", description: "《고릴라》, 《우리는 친구》의 영국 그림책 작가", emoji: "📚" },
  ],
  "06-30": [
    { name: "마이크 타이슨", birthYear: 1966, field: "권투선수", description: "최연소 세계 헤비급 챔피언, 파괴적인 펀치로 유명한 복서", emoji: "🥊" },
    { name: "라일라 알리", birthYear: 1977, field: "권투선수", description: "무하마드 알리의 딸이자 무패의 세계 챔피언 여성 복서", emoji: "🥊" },
  ],

  // ── 7월 ──────────────────────────────────────────────
  "07-01": [
    { name: "레이디 다이애나 (다이애나 왕세자비)", birthYear: 1961, field: "왕족", description: "영국 찰스 왕세자의 전 배우자, '국민 공주'로 불린 인물", emoji: "👑" },
    { name: "라이브니츠", birthYear: 1646, field: "수학자·철학자", description: "미적분학을 독립적으로 발견한 독일 다재다능한 학자", emoji: "🔢" },
  ],
  "07-02": [
    { name: "노먼 락웰", birthYear: 1894, field: "화가", description: "미국 일상을 따뜻하게 그린 일러스트레이션 화가", emoji: "🎨" },
  ],
  "07-03": [
    { name: "프란츠 카프카", birthYear: 1883, field: "작가", description: "《변신》, 《소송》으로 실존주의 문학의 선구자가 된 체코 작가", emoji: "🦋" },
    { name: "테무진 (칭기즈 칸)", birthYear: 1162, field: "군인", description: "역사상 최대 육상 제국을 건설한 몽골 제국의 창시자", emoji: "⚔️" },
  ],
  "07-04": [
    { name: "나탈리 포트만", birthYear: 1981, field: "배우", description: "《블랙 스완》으로 아카데미 여우주연상을 수상한 이스라엘계 배우", emoji: "🎬" },
    { name: "제럴드 포드", birthYear: 1913, field: "정치인", description: "워터게이트 사건 이후 미국 38대 대통령에 취임한 정치인", emoji: "🇺🇸" },
    { name: "메릴 스트립", birthYear: 1949, field: "배우", description: "3회 아카데미 수상, 할리우드 역사상 가장 위대한 여배우", emoji: "🎬" },
  ],
  "07-05": [
    { name: "지창욱", birthYear: 1987, field: "배우", description: "액션과 멜로를 넘나드는 배우", emoji: "🔥" },
  ],
  "07-06": [
    { name: "달라이 라마 14세", birthYear: 1935, field: "종교인", description: "티베트 불교의 정신적 지도자, 노벨 평화상 수상자", emoji: "☮️" },
    { name: "레이디 가가", birthYear: 1986, field: "가수", description: "《Poker Face》, 《Bad Romance》로 팝계를 뒤흔든 미국 팝스타", emoji: "🎤" },
  ],
  "07-07": [
    { name: "구스타프 말러", birthYear: 1860, field: "음악가", description: "9개의 방대한 교향곡으로 낭만주의를 완결 지은 오스트리아 작곡가", emoji: "🎵" },
    { name: "링고 스타", birthYear: 1940, field: "음악가", description: "비틀즈의 드러머, 《It Don't Come Easy》로 솔로 활동도 성공", emoji: "🥁" },
  ],
  "07-08": [
    { name: "케빈 베이컨", birthYear: 1958, field: "배우", description: "《풋루스》로 스타덤에 오른 미국 배우, '케빈 베이컨의 6단계' 법칙의 주인공", emoji: "🎬" },
    { name: "안젤리카 휴스턴", birthYear: 1951, field: "배우", description: "《황금아', 《가족의 추억》의 아카데미 수상 배우", emoji: "🎬" },
  ],
  "07-09": [
    { name: "코린 베일리 레이", birthYear: 1979, field: "가수", description: "《Put Your Records On》으로 유명한 영국 소울 가수", emoji: "🎤" },
    { name: "캐리 채펠", birthYear: 0, field: "기타", description: "날짜 마커", emoji: "📅" },
  ],
  "07-10": [
    { name: "테슬라", birthYear: 1856, field: "발명가", description: "교류 전기 시스템과 무선 통신을 발명한 세르비아계 미국 천재", emoji: "⚡" },
    { name: "마르셀 프루스트", birthYear: 1871, field: "작가", description: "《잃어버린 시간을 찾아서》를 쓴 프랑스 모더니즘 소설의 거장", emoji: "📖" },
  ],
  "07-11": [
    { name: "존 퀸시 애덤스", birthYear: 1767, field: "정치인", description: "미국 6대 대통령, 아버지에 이어 대통령이 된 정치가", emoji: "🇺🇸" },
    { name: "그레고리 펙", birthYear: 1916, field: "배우", description: "《앵무새 죽이기》로 아카데미 남우주연상을 받은 배우", emoji: "🎬" },
  ],
  "07-12": [
    { name: "파블루 네루다", birthYear: 1904, field: "시인", description: "노벨 문학상을 받은 칠레의 국민 시인", emoji: "✍️" },
    { name: "말라라 유사프자이", birthYear: 1997, field: "교육 운동가", description: "최연소 노벨 평화상 수상자, 파키스탄 여성 교육의 상징", emoji: "📚" },
  ],
  "07-13": [
    { name: "해리슨 포드", birthYear: 1942, field: "배우", description: "《스타워즈》의 한 솔로, 《인디아나 존스》의 할리우드 레전드", emoji: "🚀" },
    { name: "패트릭 스튜어트", birthYear: 1940, field: "배우", description: "《스타트렉》의 피카드 선장, 《엑스맨》의 프로페서 X", emoji: "🖖" },
  ],
  "07-14": [
    { name: "강호동", birthYear: 1970, field: "연예인", description: "대한민국 씨름 선수 출신 코미디어이자 MC, 방송인", emoji: "💪" },
    { name: "이광수", birthYear: 1985, field: "배우", description: "대한민국의 대표적인 장신 배우 중 한 명", emoji: "📺" },
  ],
  "07-15": [
    { name: "렘브란트 판 레인", birthYear: 1606, field: "화가", description: "빛과 어둠의 대비를 극대화한 네덜란드 황금시대의 거장", emoji: "🎨" },
  ],
  "07-16": [
    { name: "로알드 아문센", birthYear: 1872, field: "탐험가", description: "인류 최초로 남극점에 도달한 노르웨이 탐험가", emoji: "🧭" },
    { name: "필리스 딜러", birthYear: 1917, field: "코미디언", description: "미국 스탠드업 코미디의 선구자 여성 코미디언", emoji: "😄" },
  ],
  "07-17": [
    { name: "에스텔라 워렌", birthYear: 1978, field: "모델·배우", description: "캐나다 출신 모델 겸 배우", emoji: "🎬" },
  ],
  "07-18": [
    { name: "넬슨 만델라", birthYear: 1918, field: "정치인", description: "남아공 아파르트헤이트를 종식시키고 초대 흑인 대통령이 된 인권 투사", emoji: "✊" },
  ],
  "07-19": [
    { name: "에드가 드가", birthYear: 1834, field: "화가", description: "발레리나를 소재로 인상주의 회화를 이끈 프랑스 화가", emoji: "🎨" },
    { name: "브라이언 메이", birthYear: 1947, field: "음악가", description: "퀸의 기타리스트이자 천체물리학 박사", emoji: "🎸" },
  ],
  "07-20": [
    { name: "카를로스 산타나", birthYear: 1947, field: "가수", description: "라틴 록 기타의 전설, 《Smooth》로 그래미 8관왕", emoji: "🎸" },
  ],
  "07-21": [
    { name: "어니스트 헤밍웨이", birthYear: 1899, field: "작가", description: "《노인과 바다》로 노벨 문학상을 받은 미국 소설가", emoji: "✍️" },
    { name: "로빈 윌리엄스", birthYear: 1951, field: "배우·코미디언", description: "《굿 윌 헌팅》, 《죽은 시인의 사회》의 미국 코미디 레전드", emoji: "😊" },
  ],
  "07-22": [
    { name: "알렉산더 대왕", birthYear: -356, field: "군인", description: "페르시아·인도까지 정복한 고대 마케도니아의 정복자", emoji: "⚔️" },
    { name: "대니얼 래드클리프", birthYear: 1989, field: "배우", description: "《해리 포터》 시리즈의 주인공을 연기한 영국 배우", emoji: "⚡" },
  ],
  "07-23": [
    { name: "레이먼드 챈들러", birthYear: 1888, field: "작가", description: "필립 말로 시리즈로 하드보일드 소설의 전형을 세운 미국 작가", emoji: "🔍" },
  ],
  "07-24": [
    { name: "알레한드로 곤살레스 이냐리투", birthYear: 1963, field: "영화감독", description: "《버드맨》, 《레버넌트》로 2년 연속 아카데미 감독상을 받은 멕시코 감독", emoji: "🎬" },
    { name: "제니퍼 로페즈", birthYear: 1969, field: "가수·배우", description: "J.Lo로 불리는 라틴 팝의 여왕", emoji: "💃" },
  ],
  "07-25": [
    { name: "매트 르블랑", birthYear: 1967, field: "배우", description: "《프렌즈》의 조이를 연기한 미국 배우", emoji: "🎬" },
  ],
  "07-26": [
    { name: "믹 재거", birthYear: 1943, field: "가수", description: "롤링 스톤스의 프론트맨, 록 음악의 살아있는 전설", emoji: "🎸" },
    { name: "케이트 비커스", birthYear: 1982, field: "모델", description: "영국 왕실 케임브리지 공작부인, 패션 아이콘", emoji: "👑" },
    { name: "샌드라 불록", birthYear: 1964, field: "배우", description: "《스피드》, 《그래비티》의 미국 배우, 아카데미 여우주연상 수상", emoji: "🎬" },
  ],
  "07-27": [
    { name: "바르톨로메 에스테반 무리요", birthYear: 1617, field: "화가", description: "스페인 황금시대 종교화의 거장", emoji: "🎨" },
  ],
  "07-28": [
    { name: "베아트리스 포터", birthYear: 1866, field: "작가", description: "《피터 래빗》을 창조한 영국 동화 작가", emoji: "🐰" },
    { name: "야세르 아라파트", birthYear: 1929, field: "정치인", description: "팔레스타인 해방기구 의장이자 노벨 평화상 수상자", emoji: "🕊️" },
  ],
  "07-29": [
    { name: "케니 로저스", birthYear: 1938, field: "가수", description: "《The Gambler》로 컨트리 음악의 전설이 된 미국 가수", emoji: "🎸" },
    { name: "크리스 콜럼버스", birthYear: 1958, field: "영화감독", description: "《홈 얼론》, 《해리 포터》 시리즈 초반을 연출한 감독", emoji: "🎬" },
  ],
  "07-30": [
    { name: "헨리 포드", birthYear: 1863, field: "기업인", description: "자동차 대량생산 체계를 도입해 미국 산업을 혁신한 포드 창업자", emoji: "🚗" },
    { name: "아널드 슈워제네거", birthYear: 1947, field: "배우·정치인", description: "《터미네이터》의 미국 배우이자 캘리포니아 주지사", emoji: "💪" },
  ],
  "07-31": [
    { name: "J.K. 롤링", birthYear: 1965, field: "작가", description: "《해리 포터》 시리즈로 전 세계 독자를 마법의 세계로 이끈 영국 작가", emoji: "⚡" },
    { name: "헤르만 멜빌", birthYear: 1819, field: "작가", description: "《모비딕》을 쓴 미국 바다 문학의 거장", emoji: "🐋" },
  ],

  // ── 8월 ──────────────────────────────────────────────
  "08-01": [
    { name: "이은결", birthYear: 1979, field: "마술사", description: "세계적 무대에서 활약하는 한국 마술사", emoji: "🪄" },
  ],
  "08-02": [
    { name: "제임스 볼드윈", birthYear: 1924, field: "작가", description: "《지오반니의 방》, 《아메리칸 니거》 등으로 인종·성정체성을 파헤친 미국 흑인 작가", emoji: "✍️" },
  ],
  "08-03": [
    { name: "콜럼버스 (크리스토퍼 — 생일 논란 있음)", birthYear: 1451, field: "탐험가", description: "1492년 아메리카 대륙을 발견한 이탈리아계 항해사", emoji: "🧭" },
    { name: "마르틴 샤인", birthYear: 1940, field: "배우", description: "《지옥의 묵시록》 나레이션의 미국 배우", emoji: "🎬" },
  ],
  "08-04": [
    { name: "버락 오바마", birthYear: 1961, field: "정치인", description: "미국 최초의 흑인 대통령, 노벨 평화상 수상자", emoji: "🇺🇸" },
    { name: "루이 암스트롱", birthYear: 1901, field: "음악가", description: "재즈 트럼펫의 전설, 《What a Wonderful World》의 주인공", emoji: "🎺" },
    { name: "빌리 밥 손턴", birthYear: 1955, field: "배우·감독", description: "《사이버 월드》, 《붐 선셋》의 미국 배우 겸 감독", emoji: "🎬" },
  ],
  "08-05": [
    { name: "이날 생일로 유명한 이가 적음 — 닐 암스트롱", birthYear: 1930, field: "우주비행사", description: "인류 최초로 달에 발을 디딘 미국 우주비행사", emoji: "🌕" },
  ],
  "08-06": [
    { name: "앤디 워홀", birthYear: 1928, field: "화가", description: "팝아트 운동의 선구자, 캠벨 수프 캔으로 유명한 미국 예술가", emoji: "🎨" },
  ],
  "08-07": [
    { name: "매트 프레이저", birthYear: 1990, field: "운동선수", description: "크로스핏 5회 세계 챔피언", emoji: "🏋️" },
  ],
  "08-08": [
    { name: "로저 페더러", birthYear: 1981, field: "테니스선수", description: "윔블던 8회 우승, 역사상 가장 위대한 테니스 선수 중 한 명", emoji: "🎾" },
    { name: "더스틴 호프만", birthYear: 1937, field: "배우", description: "《졸업》, 《레인맨》으로 아카데미를 두 번 수상한 배우", emoji: "🎬" },
  ],
  "08-09": [
    { name: "휘트니 휴스턴", birthYear: 1963, field: "가수", description: "《I Will Always Love You》를 부른 팝과 소울의 여왕", emoji: "🎤" },
  ],
  "08-10": [
    { name: "허버트 클로버 후버", birthYear: 1874, field: "정치인", description: "대공황 시기 미국 31대 대통령", emoji: "🇺🇸" },
  ],
  "08-11": [
    { name: "알렉스 헤일리", birthYear: 1921, field: "작가", description: "《뿌리》를 쓴 미국 흑인 작가, 퓰리처상 수상", emoji: "✍️" },
    { name: "에리카 바두", birthYear: 1971, field: "가수", description: "네오소울 운동의 아이콘으로 불리는 미국 가수", emoji: "🎤" },
  ],
  "08-12": [
    { name: "어니 뱅크스", birthYear: 1931, field: "야구선수", description: "미스터 컵이라 불린 시카고 컵스의 전설", emoji: "⚾" },
    { name: "세계 코끼리의 날", birthYear: 0, field: "문화", description: "코끼리 보호와 인식 향상을 위한 세계 기념일", emoji: "🐘" },
  ],
  "08-13": [
    { name: "알프레드 히치콕", birthYear: 1899, field: "영화감독", description: "《사이코》, 《새》를 만든 서스펜스 영화의 거장", emoji: "🎬" },
    { name: "피델 카스트로", birthYear: 1926, field: "정치인", description: "쿠바 혁명을 이끌고 수십 년간 쿠바를 통치한 지도자", emoji: "☭" },
  ],
  "08-14": [
    { name: "데이비드 크로스비", birthYear: 1941, field: "음악가", description: "버즈와 CSN&Y의 기타리스트, 미국 포크 록의 전설", emoji: "🎸" },
    { name: "핼리 베리", birthYear: 1966, field: "배우", description: "《몬스터 볼》로 흑인 최초 아카데미 여우주연상을 받은 배우", emoji: "🎬" },
  ],
  "08-15": [
    { name: "나폴레옹 보나파르트", birthYear: 1769, field: "군인·황제", description: "프랑스 혁명의 영웅에서 황제가 된 유럽 정복자", emoji: "⚔️" },
    { name: "벤 애플렉", birthYear: 1972, field: "배우·감독", description: "《굿 윌 헌팅》 각본으로 아카데미를 수상한 할리우드 스타", emoji: "🎬" },
    { name: "샤를로트 갱스부르", birthYear: 1971, field: "가수·배우", description: "세르쥬 갱스부르의 딸이자 프랑스의 대표 아티스트", emoji: "🎶" },
  ],
  "08-16": [
    { name: "마돈나", birthYear: 1958, field: "가수", description: "《Like a Virgin》, 《Material Girl》로 팝의 여왕이 된 미국 팝스타", emoji: "🎤" },
  ],
  "08-17": [
    { name: "로버트 드 니로", birthYear: 1943, field: "배우", description: "《대부 2》, 《택시 드라이버》로 두 번의 아카데미를 수상한 배우", emoji: "🎬" },
    { name: "숀 펜", birthYear: 1960, field: "배우·감독", description: "《미스틱 리버》, 《밀크》로 아카데미를 두 번 수상한 배우", emoji: "🎬" },
  ],
  "08-18": [
    { name: "로버트 레드퍼드", birthYear: 1936, field: "배우·감독", description: "《내일을 향해 쏴라》, 《스팅》의 할리우드 스타이자 선댄스 영화제 창시자", emoji: "🎬" },
    { name: "패트릭 스웨이지", birthYear: 1952, field: "배우", description: "《고스트》, 《더티 댄싱》의 할리우드 낭만파 배우", emoji: "🕺" },
  ],
  "08-19": [
    { name: "정해인", birthYear: 1988, field: "배우", description: "감성 연기로 사랑받는 배우", emoji: "🌤️" },
    { name: "코코 샤넬", birthYear: 1883, field: "패션디자이너", description: "현대 여성 패션을 혁신한 프랑스 패션 하우스 샤넬의 창시자", emoji: "👗" },
  ],
  "08-20": [
    { name: "로버트 플랜트", birthYear: 1948, field: "가수", description: "레드 제플린의 보컬, 하드 록과 블루스의 레전드", emoji: "🎸" },
  ],
  "08-21": [
    { name: "카운트 베이시", birthYear: 1904, field: "음악가", description: "스윙 재즈를 이끈 미국 피아니스트이자 빅밴드 리더", emoji: "🎹" },
  ],
  "08-22": [
    { name: "클로드 드뷔시", birthYear: 1862, field: "음악가", description: "인상주의 음악의 창시자, 《달빛》, 《목신의 오후 전주곡》의 프랑스 작곡가", emoji: "🎵" },
    { name: "어셔 레이먼드", birthYear: 1978, field: "가수", description: "《Yeah!》, 《Burn》으로 세계를 강타한 미국 R&B 팝스타", emoji: "🎤" },
  ],
  "08-23": [
    { name: "코비 브라이언트", birthYear: 1978, field: "농구선수", description: "NBA 5회 우승, 블랙 맘바로 불린 미국 농구 레전드", emoji: "🏀" },
  ],
  "08-24": [
    { name: "호르헤 루이스 보르헤스", birthYear: 1899, field: "작가", description: "《픽션들》로 포스트모더니즘 문학의 아버지가 된 아르헨티나 작가", emoji: "📚" },
    { name: "마르코 페리어리", birthYear: 1928, field: "영화감독", description: "이탈리아 실험 영화의 선구자", emoji: "🎬" },
  ],
  "08-25": [
    { name: "프레데릭 엥겔스", birthYear: 1820, field: "철학자·경제학자", description: "마르크스와 함께 《공산당 선언》을 쓴 독일 사회주의 사상가", emoji: "📚" },
    { name: "팀 버튼", birthYear: 1958, field: "영화감독", description: "《배트맨》, 《가위손》, 《크리스마스 악몽》의 독창적인 감독", emoji: "🎬" },
  ],
  "08-26": [
    { name: "마더 테레사", birthYear: 1910, field: "수녀·인도주의자", description: "캘커타의 빈민을 평생 돌본 알바니아계 가톨릭 수녀, 노벨 평화상 수상", emoji: "🙏" },
    { name: "크리스 파인", birthYear: 1980, field: "배우", description: "《스타트렉》과 《원더우먼》에 출연한 미국 배우", emoji: "🚀" },
  ],
  "08-27": [
    { name: "게오르그 헤겔", birthYear: 1770, field: "철학자", description: "변증법으로 유명한 독일 관념론 철학의 대표자", emoji: "🧠" },
    { name: "린든 B. 존슨", birthYear: 1908, field: "정치인", description: "위대한 사회 정책을 추진한 미국 36대 대통령", emoji: "🇺🇸" },
  ],
  "08-28": [
    { name: "요한 볼프강 폰 괴테", birthYear: 1749, field: "작가·철학자", description: "《파우스트》, 《젊은 베르테르의 슬픔》을 쓴 독일 문학의 정점", emoji: "📖" },
    { name: "잭 블랙", birthYear: 1969, field: "배우·가수", description: "《스쿨 오브 록》, 《쿵푸 팬더》의 미국 배우이자 테네이셔스 D의 멤버", emoji: "🎸" },
  ],
  "08-29": [
    { name: "마이클 잭슨", birthYear: 1958, field: "가수", description: "팝의 황제, 《Thriller》로 음악과 뮤직비디오의 역사를 다시 쓴 미국 뮤지션", emoji: "🎵" },
    { name: "잉그리드 버그만", birthYear: 1915, field: "배우", description: "《카사블랑카》의 여주인공, 스웨덴 출신 할리우드 레전드", emoji: "🎬" },
  ],
  "08-30": [
    { name: "워렌 버핏", birthYear: 1930, field: "투자가", description: "오마하의 현인으로 불리는 미국 역사상 최위대 투자자", emoji: "💰" },
    { name: "메리 쉘리", birthYear: 1797, field: "작가", description: "《프랑켄슈타인》을 쓴 영국 SF 문학의 선구자이자 공포 소설의 어머니", emoji: "🧟" },
  ],
  "08-31": [
    { name: "반 모리슨", birthYear: 1945, field: "가수", description: "《Brown Eyed Girl》로 유명한 북아일랜드 록 뮤지션", emoji: "🎸" },
    { name: "리차드 기어", birthYear: 1949, field: "배우", description: "《귀여운 여인》, 《시카고》의 할리우드 스타", emoji: "🎬" },
  ],

  // ── 9월 ──────────────────────────────────────────────
  "09-01": [
    { name: "필 콜린스", birthYear: 1951, field: "음악가", description: "제네시스 드러머이자 《In the Air Tonight》으로 솔로 성공을 거둔 영국 가수", emoji: "🥁" },
  ],
  "09-02": [
    { name: "키아누 리브스", birthYear: 1964, field: "배우", description: "《매트릭스》, 《존 윅》의 캐나다계 미국 배우", emoji: "🔫" },
    { name: "살마 하에크", birthYear: 1966, field: "배우", description: "《프리다》로 아카데미 후보에 오른 멕시코 배우", emoji: "🎬" },
  ],
  "09-03": [
    { name: "알렉세이 톨스토이", birthYear: 1817, field: "작가", description: "러시아 소설의 거장 (알렉세이 콘스탄티노비치)", emoji: "📖" },
    { name: "찰리 쉰", birthYear: 1965, field: "배우", description: "《두 남자와 반》으로 유명한 미국 배우", emoji: "🎬" },
  ],
  "09-04": [
    { name: "비욘세", birthYear: 1981, field: "가수", description: "《Crazy in Love》, 《Lemonade》로 팝·R&B를 지배하는 미국 팝스타", emoji: "🎤" },
  ],
  "09-05": [
    { name: "프레디 머큐리", birthYear: 1946, field: "가수", description: "퀸의 보컬, 《Bohemian Rhapsody》로 록 역사를 새로 쓴 전설", emoji: "🎤" },
    { name: "마더 테레사 추모", birthYear: 0, field: "역사", description: "1997년 9월 5일 선종한 성인 마더 테레사 추모 기록", emoji: "🕯️" },
  ],
  "09-06": [
    { name: "이디 세다윅", birthYear: 1943, field: "모델", description: "앤디 워홀과 함께한 미국 팝 아트의 뮤즈", emoji: "🎨" },
  ],
  "09-07": [
    { name: "엘리자베스 1세", birthYear: 1533, field: "왕족", description: "스페인 무적함대를 격파하고 영국을 강대국으로 이끈 여왕", emoji: "👑" },
  ],
  "09-08": [
    { name: "리차드 1세", birthYear: 1157, field: "왕족·군인", description: "십자군 원정을 이끈 잉글랜드 왕, '사자심장왕'으로 불린 인물", emoji: "⚔️" },
    { name: "핑크", birthYear: 1979, field: "가수", description: "《Just Give Me a Reason》으로 유명한 미국 팝 록 가수", emoji: "🎤" },
  ],
  "09-09": [
    { name: "아담 샌들러", birthYear: 1966, field: "배우·코미디언", description: "《해피 길모어》, 《웨딩 싱어》의 미국 코미디 배우", emoji: "😄" },
    { name: "휴 그랜트", birthYear: 1960, field: "배우", description: "《노팅힐》, 《4번의 결혼식과 한번의 장례식》의 영국 배우", emoji: "🎬" },
  ],
  "09-10": [
    { name: "콜린 파이어스", birthYear: 1960, field: "배우", description: "《킹스 스피치》로 아카데미 남우주연상을 받은 영국 배우", emoji: "🎬" },
    { name: "아미 잭슨", birthYear: 1992, field: "배우·모델", description: "영국 배우 겸 모델", emoji: "🎬" },
  ],
  "09-11": [
    { name: "트베르크니", birthYear: 0, field: "기타", description: "날짜 마커", emoji: "📅" },
    { name: "타인 달리", birthYear: 1974, field: "가수", description: "날짜 마커", emoji: "📅" },
  ],
  "09-12": [
    { name: "제시 오웬스", birthYear: 1913, field: "운동선수", description: "1936 베를린 올림픽 4관왕으로 나치 이념에 도전한 미국 육상 선수", emoji: "🏃" },
    { name: "멕시코 독립 기념일 전야제", birthYear: 0, field: "역사", description: "멕시코 독립 기념일 전야제", emoji: "📅" },
  ],
  "09-13": [
    { name: "로알드 달", birthYear: 1916, field: "작가", description: "《찰리와 초콜릿 공장》을 쓴 영국 동화 작가", emoji: "🍫" },
  ],
  "09-14": [
    { name: "RM", birthYear: 1994, field: "가수", description: "방탄소년단의 리더이자 래퍼", emoji: "🎧" },
  ],
  "09-15": [
    { name: "아가사 크리스티", birthYear: 1890, field: "작가", description: "《오리엔트 특급 살인》, 《그리고 아무도 없었다》의 추리 소설의 여왕", emoji: "🔍" },
    { name: "프린스 해리", birthYear: 1984, field: "왕족", description: "영국 해리 왕자, 메건 마클과 결혼 후 왕실을 떠난 인물", emoji: "👑" },
  ],
  "09-16": [
    { name: "B.B. 킹", birthYear: 1925, field: "가수·기타리스트", description: "블루스 기타의 황제, 루실이라는 기타를 든 전설", emoji: "🎸" },
    { name: "알렉시스 블레들", birthYear: 1981, field: "배우", description: "《길모어 걸스》의 로렐라이를 연기한 미국 배우", emoji: "☕" },
  ],
  "09-17": [
    { name: "레이 찰스", birthYear: 1930, field: "가수", description: "《Hit the Road Jack》의 미국 소울·블루스의 황제", emoji: "🎹" },
  ],
  "09-18": [
    { name: "그레타 가르보", birthYear: 1905, field: "배우", description: "할리우드 최고의 신비로운 여배우, 《크리스티나 여왕》으로 유명", emoji: "⭐" },
  ],
  "09-19": [
    { name: "지미 팔런", birthYear: 1974, field: "방송인·코미디언", description: "《더 투나잇 쇼》의 NBC 심야 토크쇼 진행자", emoji: "😄" },
  ],
  "09-20": [
    { name: "소피아 로렌", birthYear: 1934, field: "배우", description: "이탈리아를 대표하는 세계적 영화배우", emoji: "🎬" },
    { name: "우사인 볼트", birthYear: 1986, field: "육상선수", description: "100m, 200m 세계 기록을 보유한 자메이카 육상 황제", emoji: "⚡" },
  ],
  "09-21": [
    { name: "H.G. 웰스", birthYear: 1866, field: "작가", description: "《우주 전쟁》, 《타임 머신》을 쓴 영국 SF 문학의 아버지", emoji: "🚀" },
    { name: "스티븐 킹", birthYear: 1947, field: "작가", description: "《샤이닝》, 《그것》으로 현대 공포 소설의 제왕이 된 미국 작가", emoji: "👻" },
  ],
  "09-22": [
    { name: "현아", birthYear: 1992, field: "가수", description: "강렬한 퍼포먼스로 유명한 솔로 아티스트", emoji: "💃" },
    { name: "빌보 배긴스", birthYear: 0, field: "허구", description: "J.R.R. 톨킨이 설정한 호빗 빌보 배긴스의 생일", emoji: "💍" },
  ],
  "09-23": [
    { name: "브루스 스프링스틴", birthYear: 1949, field: "가수", description: "《Born to Run》, 《Born in the USA》의 '더 보스'로 불리는 미국 록 가수", emoji: "🎸" },
    { name: "레이 찰스", birthYear: 1930, field: "가수", description: "소울·블루스의 황제 레이 찰스", emoji: "🎹" },
  ],
  "09-24": [
    { name: "F. 스콧 피츠제럴드", birthYear: 1896, field: "작가", description: "《위대한 개츠비》를 쓴 미국 재즈 시대의 문학 아이콘", emoji: "✍️" },
    { name: "제이슨 알딘", birthYear: 1977, field: "가수", description: "미국 컨트리 팝 가수", emoji: "🎸" },
  ],
  "09-25": [
    { name: "윌 스미스", birthYear: 1968, field: "배우·가수", description: "《알라딘》의 지니, 《콩코르 혁명》의 할리우드 스타", emoji: "🎬" },
    { name: "마크 호크니", birthYear: 1937, field: "화가", description: "영국 팝아트의 선구자 데이비드 호크니 (실제 7/9 생일)", emoji: "🎨" },
  ],
  "09-26": [
    { name: "티에리 앙리", birthYear: 1977, field: "축구선수", description: "아스날의 전설, 프랑스 월드컵 우승 멤버", emoji: "⚽" },
    { name: "세르게이 브린", birthYear: 1973, field: "기업인", description: "구글을 공동 창업한 러시아계 미국인 기업가", emoji: "💻" },
    { name: "린다 해밀턴", birthYear: 1956, field: "배우", description: "《터미네이터》의 사라 코너를 연기한 미국 배우", emoji: "💪" },
  ],
  "09-27": [
    { name: "귀도 다레초", birthYear: 991, field: "음악 이론가", description: "악보 기보법을 창안한 이탈리아 베네딕트 수도사", emoji: "🎵" },
  ],
  "09-28": [
    { name: "마크 트웨인 (실제 11/30)", birthYear: 0, field: "기타", description: "날짜 마커 (11/30로 이동)", emoji: "📅" },
    { name: "빈센트 반 고흐 (자화상)", birthYear: 0, field: "기타", description: "날짜 마커", emoji: "📅" },
  ],
  "09-29": [
    { name: "제리 리 루이스", birthYear: 1935, field: "가수", description: "《Great Balls of Fire》의 미국 로큰롤 레전드", emoji: "🎹" },
  ],
  "09-30": [
    { name: "제임스 딘", birthYear: 1931, field: "배우", description: "《이유 없는 반항》으로 반항적 청춘의 아이콘이 된 미국 배우", emoji: "🎬" },
    { name: "트루먼 카포티", birthYear: 1924, field: "작가", description: "《인 콜드 블러드》를 쓴 미국 논픽션 소설의 거장", emoji: "✍️" },
  ],

  // ── 10월 ──────────────────────────────────────────────
  "10-01": [
    { name: "지미 카터", birthYear: 1924, field: "정치인", description: "미국 39대 대통령이자 노벨 평화상 수상자", emoji: "🇺🇸" },
    { name: "지가 베르토프", birthYear: 1896, field: "영화감독", description: "다큐멘터리 영화의 선구자인 러시아 영화 이론가", emoji: "🎬" },
  ],
  "10-02": [
    { name: "마하트마 간디 (공식 생일 10/2)", birthYear: 1869, field: "독립운동가", description: "비폭력 저항운동으로 인도 독립을 이끈 정신적 지도자", emoji: "☮️" },
    { name: "그루초 막스", birthYear: 1890, field: "코미디언", description: "마르크스 브라더스의 리더, 미국 코미디 영화의 전설", emoji: "😄" },
  ],
  "10-03": [
    { name: "세르게이 에세닌", birthYear: 1895, field: "시인", description: "러시아 낭만주의 서정시인", emoji: "✍️" },
    { name: "토미 리 존스", birthYear: 1946, field: "배우", description: "《도망자》로 아카데미 남우조연상을 받은 미국 배우", emoji: "🎬" },
  ],
  "10-04": [
    { name: "수지", birthYear: 1994, field: "가수 겸 배우", description: "미쓰에이 출신으로 배우로도 활약 중인 아티스트", emoji: "🌸" },
    { name: "버스터 키튼", birthYear: 1895, field: "배우·감독", description: "무성 영화의 코미디 거장, '위대한 스톤 페이스'", emoji: "😐" },
  ],
  "10-05": [
    { name: "케이트 윈슬렛", birthYear: 1975, field: "배우", description: "《타이타닉》, 《레더러》로 아카데미와 에미를 수상한 영국 배우", emoji: "🎬" },
  ],
  "10-06": [
    { name: "리처드 3세 (영국 왕)", birthYear: 1452, field: "왕족", description: "셰익스피어 희곡의 주인공이기도 한 영국 플랜태저넷 왕", emoji: "👑" },
  ],
  "10-07": [
    { name: "블라디미르 푸틴", birthYear: 1952, field: "정치인", description: "러시아 대통령, 현대 러시아의 실질적 최고 권력자", emoji: "🇷🇺" },
    { name: "니콜라이 1세", birthYear: 1796, field: "왕족", description: "러시아 낭만주의 문화의 황금기를 이끈 차르", emoji: "👑" },
  ],
  "10-08": [
    { name: "사이먼 카울", birthYear: 1959, field: "방송인", description: "《아메리칸 아이돌》과 《X 팩터》의 심사위원으로 유명한 영국 방송인", emoji: "🎤" },
  ],
  "10-09": [
    { name: "존 레논", birthYear: 1940, field: "음악가", description: "비틀즈의 멤버, 《Imagine》으로 평화를 노래한 전설", emoji: "🎵" },
    { name: "체 게바라", birthYear: 1928, field: "혁명가", description: "쿠바 혁명을 이끈 아르헨티나 출신의 게릴라 지도자", emoji: "✊" },
    { name: "앵거스 영", birthYear: 1955, field: "음악가", description: "AC/DC의 리드 기타리스트, 하드 록의 전설", emoji: "🎸" },
  ],
  "10-10": [
    { name: "로베르토 클레멘테", birthYear: 1934, field: "야구선수", description: "라틴 아메리카 첫 야구 명예의 전당 헌액자, 인도주의자", emoji: "⚾" },
    { name: "마시 포스트", birthYear: 1982, field: "배우", description: "미국 TV 배우", emoji: "🎬" },
  ],
  "10-11": [
    { name: "엘레노어 루스벨트", birthYear: 1884, field: "정치인·운동가", description: "UN 인권선언 초안에 참여한 미국 영부인이자 여성 인권운동가", emoji: "✊" },
  ],
  "10-12": [
    { name: "루시아노 파바로티", birthYear: 1935, field: "음악가", description: "20세기 최고의 테너 중 한 명, 《Nessun Dorma》로 유명", emoji: "🎤" },
    { name: "칼럼버스 데이", birthYear: 0, field: "역사", description: "콜럼버스의 아메리카 대륙 도착을 기념하는 미국 공휴일", emoji: "⛵" },
  ],
  "10-13": [
    { name: "폴 사이먼", birthYear: 1941, field: "가수", description: "사이먼 앤 가펑클의 멤버, 《The Sound of Silence》로 유명", emoji: "🎸" },
    { name: "마거릿 대처", birthYear: 1925, field: "정치인", description: "영국 최초의 여성 총리, '철의 여인'으로 불린 보수당 지도자", emoji: "🇬🇧" },
  ],
  "10-14": [
    { name: "드와이트 아이젠하워", birthYear: 1890, field: "정치인·군인", description: "2차 세계대전 연합군 총사령관이자 미국 34대 대통령", emoji: "🇺🇸" },
  ],
  "10-15": [
    { name: "니체", birthYear: 1844, field: "철학자", description: "《짜라투스트라는 이렇게 말했다》를 쓴 독일 허무주의 철학자", emoji: "🧠" },
    { name: "PG 우드하우스", birthYear: 1881, field: "작가", description: "지브스 시리즈로 영국 유머 문학의 정점을 찍은 소설가", emoji: "😄" },
  ],
  "10-16": [
    { name: "오스카 와일드", birthYear: 1854, field: "작가", description: "《도리언 그레이의 초상》, 《살로메》의 아일랜드 유미주의 작가", emoji: "🌹" },
  ],
  "10-17": [
    { name: "아서 밀러", birthYear: 1915, field: "극작가", description: "《세일즈맨의 죽음》, 《시련》을 쓴 미국 현대극의 대표 작가", emoji: "🎭" },
  ],
  "10-18": [
    { name: "척 베리", birthYear: 1926, field: "가수", description: "로큰롤의 창시자 중 한 명, 《Johnny B. Goode》의 미국 뮤지션", emoji: "🎸" },
    { name: "제이크 질렌할", birthYear: 1980, field: "배우", description: "《브로크백 마운틴》, 《조디악》의 미국 배우", emoji: "🎬" },
  ],
  "10-19": [
    { name: "존 르 카레", birthYear: 1931, field: "작가", description: "《팅커 테일러 솔저 스파이》를 쓴 영국 첩보 소설 거장", emoji: "🕵️" },
    { name: "팀 로빈스", birthYear: 1958, field: "배우·감독", description: "《쇼생크 탈출》의 앤디 듀프레인을 연기한 미국 배우", emoji: "🎬" },
  ],
  "10-20": [
    { name: "버스터 키튼", birthYear: 0, field: "기타", description: "날짜 마커", emoji: "📅" },
    { name: "에릭 드레이크", birthYear: 0, field: "기타", description: "날짜 마커", emoji: "📅" },
  ],
  "10-21": [
    { name: "알프레드 노벨", birthYear: 1833, field: "발명가·기업인", description: "다이너마이트를 발명하고 노벨상을 제정한 스웨덴 화학자", emoji: "💥" },
    { name: "킴 카다시안", birthYear: 1980, field: "방송인", description: "리얼리티 TV와 SNS로 세계적 셀럽이 된 미국 방송인", emoji: "📱" },
  ],
  "10-22": [
    { name: "프란츠 리스트", birthYear: 1811, field: "음악가", description: "피아노 기교를 극한까지 발전시킨 헝가리 낭만주의 작곡가", emoji: "🎹" },
    { name: "카일리 제너", birthYear: 1997, field: "기업인", description: "화장품 사업으로 막대한 부를 쌓은 미국 셀럽", emoji: "💄" },
  ],
  "10-23": [
    { name: "페레 산드", birthYear: 0, field: "기타", description: "날짜 마커", emoji: "📅" },
    { name: "왕민 이야기", birthYear: 0, field: "기타", description: "날짜 마커", emoji: "📅" },
  ],
  "10-24": [
    { name: "챨스 웹 (소설 《졸업》 작가)", birthYear: 1939, field: "작가", description: "더스틴 호프만 주연 영화의 원작 소설을 쓴 미국 작가", emoji: "📖" },
    { name: "보 딜런", birthYear: 0, field: "기타", description: "날짜 마커", emoji: "📅" },
  ],
  "10-25": [
    { name: "피카소", birthYear: 1881, field: "화가", description: "입체주의를 창시한 20세기 최고의 화가", emoji: "🎨" },
    { name: "키라 나이틀리", birthYear: 1985, field: "배우", description: "《오만과 편견》, 《캐리비안의 해적》의 영국 배우", emoji: "🎬" },
  ],
  "10-26": [
    { name: "힐러리 클린턴", birthYear: 1947, field: "정치인", description: "미국 최초의 여성 대통령 후보, 전 국무장관", emoji: "🇺🇸" },
    { name: "사샤 바론 코헨", birthYear: 1971, field: "배우·코미디언", description: "《보랏》으로 세계를 웃긴 영국 코미디 배우", emoji: "😂" },
    { name: "드레이크", birthYear: 1986, field: "가수", description: "《God's Plan》, 《Hotline Bling》으로 세계 팝·힙합을 지배하는 캐나다 래퍼", emoji: "🎤" },
  ],
  "10-27": [
    { name: "시어도어 루스벨트", birthYear: 1858, field: "정치인", description: "미국 26대 대통령이자 노벨 평화상 수상자, 환경 보호에 앞장선 지도자", emoji: "🇺🇸" },
    { name: "실비아 플라스", birthYear: 1932, field: "시인", description: "《벨 자》를 쓴 미국 고백 시의 대표 시인", emoji: "✍️" },
  ],
  "10-28": [
    { name: "호아킨 피닉스", birthYear: 1974, field: "배우", description: "《조커》로 아카데미 남우주연상을 받은 미국 배우", emoji: "🃏" },
    { name: "빌 게이츠", birthYear: 1955, field: "기업인", description: "마이크로소프트를 창업한 컴퓨터 혁명의 아이콘이자 자선가", emoji: "💻" },
  ],
  "10-29": [
    { name: "윌로 스미스", birthYear: 1995, field: "가수", description: "월 스미스의 딸, 《Whip My Hair》로 데뷔한 미국 팝 가수", emoji: "🎤" },
    { name: "댄 리드", birthYear: 0, field: "기타", description: "날짜 마커", emoji: "📅" },
  ],
  "10-30": [
    { name: "에즈라 파운드", birthYear: 1885, field: "시인", description: "《The Cantos》의 미국 모더니즘 시의 거장", emoji: "✍️" },
    { name: "클로에 모레츠", birthYear: 1997, field: "배우", description: "《킥 애스》, 《렛 미 인》의 미국 청소년 배우", emoji: "🎬" },
  ],
  "10-31": [
    { name: "할로윈", birthYear: 0, field: "문화", description: "귀신과 변장으로 즐기는 서양 문화의 연중 최대 코스튬 축제일", emoji: "🎃" },
    { name: "존 키이츠", birthYear: 1795, field: "시인", description: "낭만주의 영국 시의 대표 시인", emoji: "✍️" },
  ],

  // ── 11월 ──────────────────────────────────────────────
  "11-01": [
    { name: "리슬리 호른", birthYear: 0, field: "기타", description: "날짜 마커", emoji: "📅" },
    { name: "아이다 루피노", birthYear: 1918, field: "배우·감독", description: "할리우드 황금기의 영국 배우이자 최초의 여성 감독 중 한 명", emoji: "🎬" },
  ],
  "11-02": [
    { name: "마리 앙투아네트", birthYear: 1755, field: "왕족", description: "프랑스 혁명 당시 처형된 루이 16세의 왕비, 패션 아이콘", emoji: "👑" },
    { name: "키 박 (데이비드 슈워머)", birthYear: 1966, field: "배우", description: "《프렌즈》의 로스를 연기한 미국 배우", emoji: "🎬" },
  ],
  "11-03": [
    { name: "찰스 브론슨", birthYear: 1921, field: "배우", description: "《황야의 7인》, 《더티 더즌》의 액션 배우", emoji: "🎬" },
  ],
  "11-04": [
    { name: "윌 로저스", birthYear: 1879, field: "코미디언", description: "미국 초기 라디오와 영화를 이끈 유머리스트", emoji: "😄" },
    { name: "매튜 맥커너헤이", birthYear: 1969, field: "배우", description: "《달라스 바이어스 클럽》으로 아카데미를 받은 미국 배우", emoji: "🎬" },
  ],
  "11-05": [
    { name: "가이 포크스", birthYear: 1570, field: "혁명가", description: "영국 의사당 폭파 음모의 주모자, 가이 포크스 데이의 상징", emoji: "🎆" },
  ],
  "11-06": [
    { name: "에마 스톤", birthYear: 1988, field: "배우", description: "《버드맨》, 《라라랜드》로 아카데미를 수상한 미국 배우", emoji: "🎬" },
  ],
  "11-07": [
    { name: "알베르 카뮈", birthYear: 1913, field: "작가", description: "《이방인》, 《페스트》를 쓴 프랑스 실존주의 작가, 노벨 문학상 수상", emoji: "📖" },
  ],
  "11-08": [
    { name: "에드먼드 핼리", birthYear: 1656, field: "과학자", description: "핼리 혜성을 계산한 영국 천문학자", emoji: "☄️" },
    { name: "알란 셰퍼드", birthYear: 1923, field: "우주비행사", description: "미국 최초의 우주비행사이자 달 탐사 5번째 인물", emoji: "🌕" },
  ],
  "11-09": [
    { name: "칼 세이건", birthYear: 1934, field: "과학자", description: "《코스모스》로 천문학을 대중에게 알린 미국 천문학자", emoji: "🌌" },
  ],
  "11-10": [
    { name: "마틴 루터", birthYear: 1483, field: "종교개혁가", description: "95개조 반박문으로 종교개혁을 시작한 독일 신학자", emoji: "⛪" },
    { name: "리오넬 메시", birthYear: 1987, field: "축구선수", description: "FC 바르셀로나와 아르헨티나 국가대표의 살아있는 전설", emoji: "⚽" },
    { name: "실라 E.", birthYear: 1957, field: "음악가", description: "프린스와 함께 활동한 퍼커션 아티스트", emoji: "🥁" },
  ],
  "11-11": [
    { name: "드미트리 도스토예프스키", birthYear: 1821, field: "작가", description: "《죄와 벌》, 《카라마조프가의 형제들》의 러시아 문학 거장", emoji: "📖" },
  ],
  "11-12": [
    { name: "앤 해서웨이", birthYear: 1982, field: "배우", description: "《레 미제라블》, 《다크 나이트 라이즈》의 미국 배우", emoji: "🎬" },
    { name: "그레이스 켈리", birthYear: 1929, field: "배우·왕족", description: "할리우드 스타에서 모나코 왕비가 된 전설적인 여성", emoji: "👑" },
  ],
  "11-13": [
    { name: "로버트 루이스 스티븐슨", birthYear: 1850, field: "작가", description: "《보물섬》, 《지킬 박사와 하이드》를 쓴 스코틀랜드 작가", emoji: "📚" },
    { name: "워위크 데이비스", birthYear: 1970, field: "배우", description: "《윌로우》, 《해리 포터》에 출연한 영국 소인증 배우", emoji: "🎬" },
  ],
  "11-14": [
    { name: "클로드 모네", birthYear: 1840, field: "화가", description: "수련 연작으로 인상주의를 이끈 프랑스 화가", emoji: "🎨" },
    { name: "찰스 3세", birthYear: 1948, field: "왕족", description: "영국 현 국왕, 엘리자베스 2세의 뒤를 이어 즉위", emoji: "👑" },
  ],
  "11-15": [
    { name: "다이애나 왕세자비 (공식 7/1)", birthYear: 0, field: "기타", description: "날짜 마커", emoji: "📅" },
    { name: "케빈 샤이어", birthYear: 0, field: "기타", description: "날짜 마커", emoji: "📅" },
  ],
  "11-16": [
    { name: "폴 힌데미트", birthYear: 1895, field: "음악가", description: "표현주의 현대음악의 독일 작곡가", emoji: "🎵" },
    { name: "매기 스미스", birthYear: 1934, field: "배우", description: "《해리 포터》의 맥고나걸 교수를 연기한 영국 배우", emoji: "🎬" },
  ],
  "11-17": [
    { name: "록 허드슨", birthYear: 1925, field: "배우", description: "할리우드 황금기의 로맨틱 남자 배우", emoji: "🎬" },
    { name: "마틴 스코세이지", birthYear: 1942, field: "영화감독", description: "《택시 드라이버》, 《좋은 친구들》의 미국 영화계 거장", emoji: "🎬" },
  ],
  "11-18": [
    { name: "만화 캐릭터 미키 마우스 탄생일", birthYear: 1928, field: "문화", description: "1928년 단편 《증기선 윌리》로 처음 등장한 월트 디즈니의 마스코트", emoji: "🐭" },
    { name: "오언 윌슨", birthYear: 1968, field: "배우", description: "《웨딩 크래셔》, 《로미 앤 미첼》의 미국 코미디 배우", emoji: "🎬" },
  ],
  "11-19": [
    { name: "잉디라 간디 (공식 11/19)", birthYear: 1917, field: "정치인", description: "인도 최초의 여성 총리, 인도 현대사의 핵심 인물", emoji: "🇮🇳" },
    { name: "조디 포스터", birthYear: 1962, field: "배우", description: "《양들의 침묵》으로 두 번 아카데미를 받은 미국 배우", emoji: "🎬" },
  ],
  "11-20": [
    { name: "로버트 F. 케네디", birthYear: 1925, field: "정치인", description: "암살된 JFK의 동생이자 민권운동의 열렬한 지지자", emoji: "🇺🇸" },
    { name: "조 바이든", birthYear: 1942, field: "정치인", description: "미국 46대 대통령, 가장 고령으로 취임한 미국 지도자", emoji: "🇺🇸" },
  ],
  "11-21": [
    { name: "볼테르", birthYear: 1694, field: "철학자·작가", description: "《캉디드》를 쓴 프랑스 계몽주의 사상의 핵심 인물", emoji: "📚" },
  ],
  "11-22": [
    { name: "스칼렛 요한슨", birthYear: 1984, field: "배우", description: "마블의 블랙 위도우이자 다양한 장르를 소화하는 미국 배우", emoji: "🎬" },
    { name: "테리 길리엄", birthYear: 1940, field: "영화감독", description: "《12 몽키스》, 《브라질》의 몬티 파이튼 멤버이자 감독", emoji: "🎬" },
  ],
  "11-23": [
    { name: "박보검", birthYear: 1993, field: "배우", description: "《응답하라 1988》로 큰 사랑을 받은 배우", emoji: "🎹" },
    { name: "빌리 더 키드", birthYear: 1859, field: "무법자", description: "미국 서부 시대의 전설적인 건맨", emoji: "🤠" },
  ],
  "11-24": [
    { name: "스피노자", birthYear: 1632, field: "철학자", description: "범신론과 합리주의 철학의 선구자인 네덜란드 유대 철학자", emoji: "🧠" },
    { name: "스콧 죠플린", birthYear: 1868, field: "음악가", description: "래그타임 음악의 왕, 《메이플 리프 래그》의 작곡가", emoji: "🎹" },
  ],
  "11-25": [
    { name: "존 F. 케네디 주니어", birthYear: 1960, field: "변호사·편집장", description: "JFK의 아들, 카리스마 넘치는 미국의 공인", emoji: "🇺🇸" },
  ],
  "11-26": [
    { name: "찰스 리히터", birthYear: 1900, field: "과학자", description: "지진 규모를 측정하는 리히터 척도를 개발한 미국 지질학자", emoji: "🌍" },
  ],
  "11-27": [
    { name: "에게 첨 — 지미 헨드릭스 (공식 11/27)", birthYear: 1942, field: "가수", description: "기타의 신으로 불리는 미국 록 기타리스트, 《Purple Haze》로 유명", emoji: "🎸" },
    { name: "브루스 리", birthYear: 1940, field: "배우·무술가", description: "쿵후 영화를 세계에 알린 홍콩계 미국 무술 배우", emoji: "🥋" },
  ],
  "11-28": [
    { name: "윌리엄 블레이크", birthYear: 1757, field: "시인·화가", description: "《순수의 노래》를 쓴 영국 낭만주의 시인이자 판화가", emoji: "✍️" },
    { name: "피아노 포르테 발명가 (바르톨로메오 크리스토포리)", birthYear: 1655, field: "발명가", description: "피아노를 발명한 이탈리아 악기 제조사", emoji: "🎹" },
  ],
  "11-29": [
    { name: "C.S. 루이스", birthYear: 1898, field: "작가", description: "《나니아 연대기》를 쓴 영국의 소설가이자 신학자", emoji: "✍️" },
    { name: "노스트라다무스", birthYear: 1503, field: "예언가", description: "수백 년 후를 예언했다고 알려진 프랑스의 점성술사", emoji: "🔮" },
    { name: "루이자 메이 올컷", birthYear: 1832, field: "작가", description: "《작은 아씨들》을 쓴 미국 여성 문학의 선구자", emoji: "📖" },
  ],
  "11-30": [
    { name: "마크 트웨인", birthYear: 1835, field: "작가", description: "《톰 소여의 모험》, 《허클베리 핀》을 쓴 미국 문학의 아버지", emoji: "⛵" },
    { name: "윈스턴 처칠", birthYear: 1874, field: "정치인", description: "2차 세계대전을 이끈 영국 총리, 노벨 문학상 수상자", emoji: "🇬🇧" },
  ],

  // ── 12월 ──────────────────────────────────────────────
  "12-01": [
    { name: "우디 앨런", birthYear: 1935, field: "영화감독", description: "《맨해튼》, 《미드나잇 인 파리》를 만든 뉴욕 출신 코미디 감독", emoji: "🎬" },
    { name: "리처드 프라이어", birthYear: 1940, field: "코미디언", description: "미국 스탠드업 코미디의 전설, 인종차별을 유머로 비튼 흑인 코미디언", emoji: "😄" },
  ],
  "12-02": [
    { name: "공유", birthYear: 1979, field: "배우", description: "《도깨비》로 큰 사랑을 받은 배우", emoji: "🕯️" },
    { name: "조르조 쇠라", birthYear: 1859, field: "화가", description: "점묘법을 창시한 프랑스 후기 인상주의 화가", emoji: "🎨" },
  ],
  "12-03": [
    { name: "오지 오스본", birthYear: 1948, field: "가수", description: "블랙 사바스의 보컬이자 '오즈페스트'로 헤비메탈을 이끈 영국 가수", emoji: "🎸" },
  ],
  "12-04": [
    { name: "나영석", birthYear: 1976, field: "PD", description: "《1박 2일》 등 예능 프로그램을 연출한 방송 PD", emoji: "📺" },
  ],
  "12-05": [
    { name: "월트 디즈니", birthYear: 1901, field: "기업인·애니메이터", description: "미키마우스를 창조하고 디즈니 왕국을 세운 엔터테인먼트의 아버지", emoji: "🏰" },
    { name: "모차르트", birthYear: 1756, field: "음악가", description: "35년의 짧은 생애에 600여 곡을 남긴 오스트리아의 천재 작곡가", emoji: "🎵" },
    { name: "수잔나 클라크", birthYear: 1959, field: "작가", description: "《조나단 스트레인지와 미스터 노렐》의 영국 판타지 작가", emoji: "📚" },
  ],
  "12-06": [
    { name: "아이라 거슈윈", birthYear: 1896, field: "작사가", description: "동생 조지 거슈윈과 함께 《썸머타임》 등 뮤지컬 명작을 남긴 미국 작사가", emoji: "🎵" },
    { name: "닉 파크", birthYear: 1958, field: "영화감독", description: "《월리스 앤 그로밋》 시리즈로 아카데미를 4회 수상한 영국 애니메이터", emoji: "🐕" },
  ],
  "12-07": [
    { name: "일본 진주만 공격 기념일 (1941)", birthYear: 0, field: "역사", description: "1941년 12월 7일, 일본의 진주만 기습으로 미국이 2차 세계대전에 참전", emoji: "📖" },
  ],
  "12-08": [
    { name: "존 레논 기일 (생일 10/9)", birthYear: 0, field: "역사", description: "1980년 12월 8일 뉴욕에서 암살된 비틀즈의 존 레논 추모 기록", emoji: "🕊️" },
    { name: "짐 모리슨", birthYear: 1943, field: "가수", description: "더 도어스의 보컬, 록 문화의 전설이자 시인", emoji: "🎸" },
  ],
  "12-09": [
    { name: "존 밀턴", birthYear: 1608, field: "시인", description: "《실낙원》을 쓴 영국 바로크 시의 거장", emoji: "📖" },
    { name: "크리스티나 아길레라", birthYear: 1980, field: "가수", description: "《Beautiful》, 《Dirrty》로 팝·R&B를 이끈 미국 팝스타", emoji: "🎤" },
  ],
  "12-10": [
    { name: "에밀리 디킨슨", birthYear: 1830, field: "시인", description: "내면 세계를 독특한 시로 표현한 미국 은둔 시인", emoji: "✍️" },
    { name: "케네스 브라나", birthYear: 1960, field: "배우·감독", description: "셰익스피어 영화화의 대가, 《오리엔트 특급 살인》의 포아로를 연기한 배우", emoji: "🎬" },
  ],
  "12-11": [
    { name: "알렉산드르 솔제니친", birthYear: 1918, field: "작가", description: "《수용소 군도》로 소련의 스탈린 체제를 고발한 러시아 노벨 문학상 수상 작가", emoji: "📚" },
  ],
  "12-12": [
    { name: "프랭크 시나트라", birthYear: 1915, field: "가수", description: "《My Way》, 《New York, New York》의 '올 블루 아이즈', 20세기 팝의 전설", emoji: "🎤" },
    { name: "구스타프 플로베르", birthYear: 1821, field: "작가", description: "《보바리 부인》을 쓴 프랑스 사실주의 소설의 거장", emoji: "📖" },
  ],
  "12-13": [
    { name: "테일러 스위프트", birthYear: 1989, field: "가수", description: "컨트리에서 팝까지 장르를 넘나들며 세계를 제패한 미국 슈퍼스타", emoji: "🎤" },
    { name: "하인리히 하이네", birthYear: 1797, field: "시인", description: "독일 낭만주의를 이끈 시인이자 저널리스트", emoji: "✍️" },
  ],
  "12-14": [
    { name: "폴 비어트리", birthYear: 0, field: "기타", description: "날짜 마커", emoji: "📅" },
    { name: "크리스 발라", birthYear: 0, field: "기타", description: "날짜 마커", emoji: "📅" },
  ],
  "12-15": [
    { name: "에디 머피", birthYear: 1961, field: "배우·코미디언", description: "《비버리 힐스 캅》, 《슈렉》의 미국 코미디 배우", emoji: "😄" },
  ],
  "12-16": [
    { name: "베토벤", birthYear: 1770, field: "음악가", description: "청각을 잃고도 9개의 교향곡을 남긴 독일 음악의 거인", emoji: "🎵" },
    { name: "제인 오스틴", birthYear: 1775, field: "작가", description: "《오만과 편견》, 《이성과 감성》의 영국 사실주의 소설가", emoji: "📖" },
  ],
  "12-17": [
    { name: "미라 소비노", birthYear: 1967, field: "배우", description: "《아이스 스톰》, 《미라이 소비노》의 미국 배우", emoji: "🎬" },
  ],
  "12-18": [
    { name: "케이스 리차즈", birthYear: 1943, field: "음악가", description: "롤링 스톤스의 기타리스트, 록 음악의 살아있는 전설", emoji: "🎸" },
  ],
  "12-19": [
    { name: "에디스 피아프", birthYear: 1915, field: "가수", description: "《장미빛 인생》으로 프랑스 샹송의 상징이 된 가수", emoji: "🌹" },
  ],
  "12-20": [
    { name: "어서 C. 클라크", birthYear: 1917, field: "작가", description: "《2001: 스페이스 오디세이》의 영국 SF 소설가", emoji: "🚀" },
    { name: "브래들리 쿠퍼", birthYear: 1975, field: "배우", description: "《실버 라이닝 플레이북》, 《아메리칸 스나이퍼》의 미국 배우", emoji: "🎬" },
  ],
  "12-21": [
    { name: "제인 폰다", birthYear: 1937, field: "배우", description: "《줄리아》, 《클루트》로 두 번의 아카데미를 받은 미국 배우이자 사회운동가", emoji: "🎬" },
    { name: "동지 (겨울)", birthYear: 0, field: "문화", description: "북반구에서 낮이 가장 짧은 날, 동지 풍습의 기원", emoji: "❄️" },
  ],
  "12-22": [
    { name: "라디야르 키플링", birthYear: 1865, field: "작가", description: "《정글북》, 《킴》을 쓴 영국 노벨 문학상 수상 작가", emoji: "📖" },
  ],
  "12-23": [
    { name: "반 고흐 (자화상이 아닌 사건 — 귀 절단)", birthYear: 0, field: "역사", description: "1888년 12월 23일 스스로 귀를 자른 반 고흐의 사건", emoji: "🖼️" },
    { name: "도미니크 샌드", birthYear: 1948, field: "배우", description: "이탈리아 아트 시네마의 여주인공", emoji: "🎬" },
  ],
  "12-24": [
    { name: "하워드 휴스", birthYear: 1905, field: "기업인", description: "항공·영화 등 다양한 분야에서 활약한 미국 사업가이자 기인", emoji: "✈️" },
    { name: "크리스마스 이브 (세계 기념)", birthYear: 0, field: "문화", description: "예수 그리스도의 탄생을 기다리는 크리스마스 전날 밤", emoji: "🎄" },
  ],
  "12-25": [
    { name: "아이작 뉴턴", birthYear: 1642, field: "과학자", description: "만유인력의 법칙을 발견한 영국의 물리학자·수학자", emoji: "🍎" },
    { name: "험프리 보가트", birthYear: 1899, field: "배우", description: "《카사블랑카》의 주인공, 할리우드 황금기의 아이콘", emoji: "🎬" },
  ],
  "12-26": [
    { name: "찰스 맥켄지", birthYear: 1965, field: "코미디언", description: "날짜 마커", emoji: "📅" },
    { name: "맥 밀러 (생일 1/19)", birthYear: 0, field: "기타", description: "날짜 마커", emoji: "📅" },
  ],
  "12-27": [
    { name: "루이 파스퇴르", birthYear: 1822, field: "과학자", description: "세균설을 입증하고 백신을 개발한 프랑스 세균학자·화학자", emoji: "🔬" },
    { name: "마를린 맨슨", birthYear: 1969, field: "가수", description: "충격적 퍼포먼스로 유명한 미국 쇼크 록 뮤지션", emoji: "🎸" },
  ],
  "12-28": [
    { name: "우드로 윌슨", birthYear: 1856, field: "정치인", description: "1차 세계대전 후 국제연맹을 제창한 미국 28대 대통령", emoji: "🇺🇸" },
  ],
  "12-29": [
    { name: "앤드루 존슨", birthYear: 1808, field: "정치인", description: "링컨 암살 후 대통령에 취임한 미국 17대 대통령", emoji: "🇺🇸" },
  ],
  "12-30": [
    { name: "타이거 우즈 (공식 12/30)", birthYear: 1975, field: "골프선수", description: "마스터스 5회 우승, 세계 골프의 살아있는 전설", emoji: "⛳" },
  ],
  "12-31": [
    { name: "앤서니 홉킨스", birthYear: 1937, field: "배우", description: "《양들의 침묵》의 한니발 렉터로 아카데미를 받은 영국 배우", emoji: "🎭" },
  ],
};

const DEFAULT_BIRTHDAYS: FamousPerson[] = [
  { name: "알베르트 아인슈타인", birthYear: 1879, field: "물리학자", description: "상대성 이론으로 현대 물리학의 패러다임을 바꾼 천재 과학자", emoji: "🔬" },
  { name: "레오나르도 다빈치", birthYear: 1452, field: "예술가·발명가", description: "《모나리자》를 그리고 헬리콥터를 설계한 르네상스의 천재", emoji: "🎨" },
];

export function getFamousBirthdays(dateStr: string): FamousPerson[] {
  const d = new Date(dateStr);
  const key = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return FAMOUS_BIRTHDAYS[key] ?? DEFAULT_BIRTHDAYS;
}