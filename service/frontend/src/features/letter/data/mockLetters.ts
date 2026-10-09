// 모아쓰기 레터 목업 데이터(2026-10-09). 백엔드(issue_letters)가 생기기 전까지 화면을 확정하기 위한 것이다.
// 출처: 마스터DB/06_콘텐츠/레터/ 의 기획서 7종. 샘플 3편(아모레퍼시픽·종로3가·부캉이)은 작성된 본문을 그대로 옮겼고,
// 삼성전자·경매 레터는 기획서 목업에 나온 문구만으로 짧게 구성했다(mock: true — 상세에 안내 표시).
// 소스: 실제로 확인된 기사(기획서·샘플 본문에 제목·링크가 있는 것)만 링크로 두고, 확인하지 못한 항목은 placeholder("(예시)")로 표시한다. 지어낸 매체명·제목을 쓰지 않는다.
// 삼성전자 3건은 기획서 v3의 제목이고 링크는 사이트 내 검색으로 대체했다(실제 연결은 백엔드 단계에서 article_slug로).
import type { IssueLetter } from './letterTypes';

const q = (kw: string) => `/search?q=${encodeURIComponent(kw)}`;

export const MOCK_LETTERS: IssueLetter[] = [
  {
    slug: '2026-10-08-삼성전자107조',
    issueNumber: 14,
    title: '107조를 벌었는데, 왜 시장은 조용한 거예요?',
    deck: '삼성전자 사상 첫 100조 돌파. 그런데 주가는 1%대. 실적·금리·수급 세 관점으로 읽어요.',
    axisLabels: [
      { axis: 'news', label: '사상 첫 100조' },
      { axis: 'substance', label: '옵션만기일·ETF·금리 3중 노이즈' },
      { axis: 'other', label: '업종별 온도 차' },
    ],
    categories: ['시그널', '국제'],
    publishedAt: '2026-10-08',
    readMinutes: 5,
    featured: true,
    mock: true,
    summary: [
      '삼성전자가 국내 최초로 분기 영업이익 100조 원을 넘겼어요. 그런데 주가 반응은 1%대로 조용했어요.',
      '같은 시각 연준 의사록엔 추가 인상은 "연내"일 뿐 10월은 아니라는 내용이 담겼어요.',
      '실적, 금리, 수급을 같이 읽어야 이유가 보여요.',
    ],
    sections: [
      {
        axis: 'news',
        heading: '사상 첫 100조 돌파',
        keyLine: '삼성전자가 분기 영업이익 100조 원을 처음 넘겼어요.',
        paragraphs: [
          [
            '삼성전자가 3분기 영업이익 107조 4000억 원을 기록했어요. 국내 기업 최초로 분기 100조 원을 넘겼고, 4개 분기 연속 실적 신기록이에요. ',
            { text: '삼성전자 분기 영업익 107조라고? 국내 첫 100조 돌파', href: q('삼성전자 영업이익 107조') },
            ' 기사에서 숫자를 먼저 확인해 보세요.',
          ],
          ['그런데 주가 반응은 1%대로 조용했어요. 기록적인 숫자와 시장 반응 사이의 간격, 오늘 레터는 거기서 출발해요.'],
        ],
      },
      {
        axis: 'substance',
        heading: '금리·수급 노이즈',
        keyLine: '숫자만으로 주가가 움직이지 않는 날이었어요.',
        paragraphs: [
          ['이날은 옵션만기일과 ETF 자금 흐름, 금리 부담이 한꺼번에 겹친 날이었어요. 금리 5.36%와 실적 사이의 긴장 관계를 같이 봐야 해요.'],
          ['실적은 이미 시장에 알려진 기대 위에 얹히는 숫자라서, 좋은 숫자가 곧 주가 상승은 아니에요.'],
        ],
      },
      {
        axis: 'other',
        heading: '업종별 온도 차',
        keyLine: '같은 날 반도체와 금융은 반대로 움직였어요.',
        paragraphs: [
          [
            '같은 시각 연준 의사록은 ',
            { text: '추가 인상은 "연내"일 뿐 10월은 아니라고', href: q('연준 의사록 추가 인상') },
            ' 밝혔어요. 금리 전망이 업종마다 다르게 읽힌 하루였어요.',
          ],
          [
            '금융주 쪽은 ',
            { text: 'KB금융이 US뱅크보다 높다고? 설문 빼고 숫자만 봤더니', href: q('KB금융 US뱅크') },
            ' 기사에서 숫자만 따로 보면 그림이 달라져요.',
          ],
        ],
      },
    ],
    editorNote: '금리 환경이 실적 해석을 바꿔요. 오늘 숫자는 출발선이지 결론이 아니에요.',
    vote: {
      kind: 'emotion',
      question: '107조 소식을 처음 들었을 때, 어떠셨나요?',
      options: [
        { key: 'no-feel', label: '실감이 안 난다' },
        { key: 'worried', label: '걱정됐다' },
        { key: 'watch', label: '지켜봐야 한다' },
      ],
    },
    sources: [
      { title: '삼성전자 분기 영업익 107조라고? 국내 첫 100조 돌파', outlet: 'AI LENS', href: q('삼성전자 영업이익 107조'), axes: ['news', 'substance'], internal: true },
      { title: '연준 의사록, 추가 인상은 "연내"일 뿐 10월은 아니라고?', outlet: 'AI LENS', href: q('연준 의사록 추가 인상'), axes: ['other'], internal: true },
      { title: 'KB금융이 US뱅크보다 높다고? 설문 빼고 숫자만 봤더니', outlet: 'AI LENS', href: q('KB금융 US뱅크'), axes: ['other'], internal: true },
    ],
  },
  {
    slug: '2026-10-08-라네즈-필리핀',
    issueNumber: 13,
    title: '라네즈가 필리핀에서 문을 닫았는데, 이게 오히려 전략이라고요?',
    deck: '같은 달, 인도에선 조직을 키우고 필리핀에선 공식몰을 닫았어요. 두 결정을 가른 기준을 짚어요.',
    axisLabels: [
      { axis: 'news', label: '같은 달, 다른 선택' },
      { axis: 'substance', label: '숫자로 보면' },
      { axis: 'other', label: '더 큰 그림' },
    ],
    categories: ['산업'],
    publishedAt: '2026-10-08',
    readMinutes: 4,
    summary: [
      '아모레퍼시픽이 같은 달, 인도에는 프리미엄 사업부를 신설하고 필리핀에서는 라네즈 공식 온라인몰을 닫았어요.',
      '두 결정을 가른 건 매출 성장률이에요. 인도는 3년 만에 3배, 필리핀은 2년째 제자리였어요.',
      'K뷰티가 전 세계에서 고르게 뜨고 있다는 건 착각일 수 있어요. 같은 회사 안에서도 나라마다 속도와 대응이 달라요.',
    ],
    sections: [
      {
        axis: 'news',
        heading: '같은 달, 다른 선택',
        keyLine: '같은 브랜드가 한 나라에선 조직을 키우고 다른 나라에선 문을 닫았어요.',
        paragraphs: [
          [
            '아모레퍼시픽 인도법인은 최근 \'프리미엄 사업부\'를 신설했어요. 라네즈·설화수 유통과 마케팅을 전담하는 조직이에요. 인도 뷰티업계에서 15년 이상 일한 마케팅 전문가를 총괄로 데려왔어요. ',
            { text: '아모레퍼시픽 인도법인', href: 'https://ailens.sedaily.ai/industry/2026/10/08/2026-10-08-라네즈-온라인몰이-문을-닫았다고-아모레의-아시아-지도-다시-그리기' },
            ' 소식이에요.',
          ],
          ['같은 시기 필리핀법인은 9월 30일부로 라네즈 공식 온라인몰 운영을 중단했어요. 앞으로는 왓슨스·쇼피·틱톡 같은 외부 채널에서 팔아요.'],
        ],
      },
      {
        axis: 'substance',
        heading: '숫자로 보면',
        keyLine: '인도는 3년 만에 3배, 필리핀은 2년째 73억 원 그대로였어요.',
        paragraphs: [
          ['인도의 2025년 매출은 265억 원이에요. 2022년 87억 원에서 3년 만에 3배가 됐고, 순이익은 37억 원으로 2022년 적자에서 흑자로 돌아섰어요.'],
          ['필리핀은 2025년 매출 73억 원으로 전년과 같았어요. 성장이 멈춘 곳에서는 직영몰을 접고 외부 채널로 옮긴 거예요.'],
          ['그런데 \'철수\'는 아니에요. 아모레퍼시픽은 "온라인몰 중단은 현지 철수와 무관"하다고 밝혔어요. 필리핀법인은 유지되고, 청산 여부도 정해지지 않았어요. 창구가 바뀐 것이지 나간 게 아니에요.'],
        ],
      },
      {
        axis: 'other',
        heading: '더 큰 그림',
        keyLine: '중국·북미에서 하던 리밸런싱이 아시아 전역으로 넓어지고 있어요.',
        paragraphs: [
          ['아모레퍼시픽은 2023년 \'글로벌 리밸런싱\'을 선언했어요. 중국에선 오프라인 점포와 재고를 줄이고, 북미에선 세포라·아마존으로 본격 진출했어요. 2026년엔 같은 전략이 아시아 안으로 들어왔어요. 인도는 키우고, 필리핀은 효율화하는 식이에요.'],
          [
            '같은 시기 ',
            { text: '조선미녀는 브라질 약국 600곳에 진출했어요.', href: 'https://ailens.sedaily.ai/industry/2026/10/06/2026-10-06-산업-K뷰티-약국-진출-조선미녀가-브라질-약국-600곳에-들어갔다고' },
            ' 대형 브랜드가 선택을 거두는 시장에서, 다른 K뷰티 브랜드는 새 채널로 뚫고 들어가고 있어요.',
          ],
        ],
      },
    ],
    editorNote:
      '아모레퍼시픽이 필리핀에서 온라인몰을 닫은 건 브랜드가 밀려서가 아니에요. 직접 운영하는 비용이 외부 채널에 맡기는 것보다 비쌀 때 회사는 창구를 바꿔요. 채널이 넓어지면 접근성은 늘지만 브랜드가 직접 통제할 수 있는 것은 줄어들어요. 그 교환이 어떤 결과를 낳을지는 지금은 알 수 없어요.',
    vote: {
      kind: 'binary',
      question: '아모레퍼시픽의 필리핀 직영몰 종료 결정, 어떻게 보세요?',
      options: [
        { key: 'reasonable', label: '합리적인 선택', hint: '성장률 따라 자원을 재배분하고 브랜드는 유지해요' },
        { key: 'watch', label: '지켜봐야 한다', hint: '채널 통제권을 잃으면 다음 단계가 더 어려울 수 있어요' },
      ],
    },
    sources: [
      {
        title: '라네즈 온라인몰이 문을 닫았다고? 아모레의 아시아 지도 다시 그리기',
        outlet: 'AI LENS',
        href: 'https://ailens.sedaily.ai/industry/2026/10/08/2026-10-08-라네즈-온라인몰이-문을-닫았다고-아모레의-아시아-지도-다시-그리기',
        axes: ['news', 'substance'],
        internal: true,
      },
      {
        title: 'K뷰티 약국 진출, 조선미녀가 브라질 약국 600곳에 들어갔다고',
        outlet: 'AI LENS',
        href: 'https://ailens.sedaily.ai/industry/2026/10/06/2026-10-06-산업-K뷰티-약국-진출-조선미녀가-브라질-약국-600곳에-들어갔다고',
        axes: ['other'],
        internal: true,
      },
      { title: '(예시) 인도 프리미엄 사업부를 다룬 기사', outlet: '', href: '', axes: ['news'], internal: true, placeholder: true },
    ],
  },
  {
    slug: '2026-10-05-종로3가',
    issueNumber: 12,
    title: '종로3가가 "세계 1위 동네"가 됐다는데, 그 순위는 어떻게 정해질까요?',
    deck: '1위 소식만 보면 끝이지만, 이 순위가 어떻게 만들어지는지까지 보면 얘기가 달라져요.',
    axisLabels: [
      { axis: 'news', label: '선정 소식' },
      { axis: 'substance', label: '순위의 실체' },
      { axis: 'other', label: '젠트리피케이션' },
    ],
    cardTags: [
      { axis: 'news', label: '소식' },
      { axis: 'substance', label: '방법론' },
      { axis: 'other', label: '젠트리피케이션' },
    ],
    categories: ['문화'],
    publishedAt: '2026-10-05',
    readMinutes: 4,
    summary: [
      '타임아웃이 종로3가를 "2026 세계에서 가장 멋진 동네" 1위로 뽑았어요. 2021년엔 3위였어요.',
      '이 순위는 설문 투표가 아니라, 전 세계 현지 에디터 추천을 본사 편집팀이 심사하는 방식으로 만들어져요.',
      '"뜬 동네" 타이틀을 받은 뒤 임대료가 뛰어 원래 터줏대감들이 밀려나는 젠트리피케이션을 겪은 해외 동네들이 있어요.',
    ],
    sections: [
      {
        axis: 'news',
        heading: '선정 소식',
        keyLine: '종로3가, 2021년 3위에서 2026년 1위로 올라섰어요.',
        paragraphs: [
          [
            { text: '중앙일보 보도', href: 'https://www.joongang.co.kr/article/25462798' },
            '에 따르면 영국 매체 타임아웃이 발표한 "2026 세계에서 가장 멋진 동네"에서 서울 종로3가가 1위를 차지했어요. 익선동 한옥 골목과 종로3가 포장마차 거리가 특히 주목받았어요.',
          ],
          ['타임아웃 여행 에디터 Grace Beard는 "종로3가는 2021년에 우리가 뽑은 3번째로 멋진 동네였는데, 늦은 밤 야외 식사 문화와 독립 가게들이 늘면서 이번엔 1위까지 올라왔다"고 설명했어요.'],
        ],
      },
      {
        axis: 'substance',
        heading: '순위의 실체',
        keyLine: '설문조사가 아니라, 현지 에디터 추천에 본사 심사예요.',
        paragraphs: [
          ['이 순위는 생각보다 "투표"가 아니에요. 전 세계 도시마다 있는 타임아웃 소속 작가·에디터들에게 "지금 당신 도시에서 가장 멋진 동네가 어디냐"고 묻고, 그 추천들을 본사 편집팀이 음식·나이트라이프·문화·독립상점·주거성·공동체 의식 같은 기준으로 다시 심사해 순위를 정해요.'],
          ['"멋짐"은 전 세계 수백만 명의 평균적 의견이 아니라, 에디터 한 명 한 명의 눈에 비친 "지금 이 동네가 뜨고 있다"는 감각이 모인 결과예요.'],
        ],
      },
      {
        axis: 'other',
        heading: '다른 시각 — 젠트리피케이션',
        keyLine: '"뜬 동네" 타이틀 뒤엔 보통 임대료가 따라와요.',
        paragraphs: [
          ['낙후됐던 동네가 뜨면서 사람이 몰리고, 건물주가 임대료를 올리고, 결국 그 동네를 지금의 매력으로 만든 원래 가게들이 비싼 임대료를 못 견디고 떠나는 현상을 젠트리피케이션이라고 해요.'],
          ['종로3가 얘기는 아니지만, 샌프란시스코 발렌시아 스트리트나 워싱턴DC H 스트리트처럼 "최고의 바 거리"로 뽑혔던 동네들이 몇 년 뒤엔 경제적 침체 뉴스에 등장하는 역설적 상황이 생겼어요. 뜨는 것과, 그 매력을 오래 지키는 것은 완전히 다른 숙제라는 뜻이에요.'],
        ],
      },
    ],
    editorNote: '타임아웃 순위는 대중의 평균이 아니라 에디터 한 명의 감각이 쌓인 결과예요. 그 감각이 "지금 뜨고 있다"를 포착하는 데는 탁월하지만, 그 뜨는 힘이 동네 자체를 바꿔버릴 수 있다는 게 아이러니예요.',
    vote: {
      kind: 'emotion',
      question: '1위 소식을 들었을 때, 어느 쪽에 더 가까웠나요?',
      options: [
        { key: 'glad', label: '반가웠어요', hint: '가볼 이유가 생겼어요' },
        { key: 'worried', label: '걱정됐어요', hint: '떠서 변해버릴까 봐요' },
      ],
    },
    sources: [
      { title: '타임아웃 "세계에서 가장 멋진 동네" 1위에 종로3가', outlet: '중앙일보', href: 'https://www.joongang.co.kr/article/25462798', axes: ['news'], internal: false },
      { title: '(예시) 순위 선정 방식을 다룬 기사', outlet: '', href: '', axes: ['substance'], internal: false, placeholder: true },
      { title: '(예시) 젠트리피케이션을 다룬 기사', outlet: '', href: '', axes: ['other'], internal: false, placeholder: true },
    ],
  },
  {
    slug: '2026-10-02-부캉이',
    issueNumber: 11,
    title: '상어 한 마리가 주가를 10% 올렸다?!',
    deck: '부산 북항에 상어가 나타난 지 2주. 65만 명이 다녀갔고 주가도 출렁였고 AI 가짜뉴스까지 등장했어요.',
    axisLabels: [
      { axis: 'news', label: '부캉이 소동' },
      { axis: 'substance', label: '경제효과·테마주' },
      { axis: 'other', label: '가짜뉴스·동물복지' },
    ],
    cardTags: [
      { axis: 'news', label: '소식' },
      { axis: 'substance', label: '경제효과' },
      { axis: 'other', label: '가짜뉴스' },
      { axis: 'other', label: '동물복지' },
    ],
    categories: ['시그널', '사회'],
    publishedAt: '2026-10-02',
    readMinutes: 7,
    summary: [
      '부산 북항 수로에 상어 \'부캉이\'가 2주 넘게 머물고 있어요. 65만 명이 다녀갔고, 핑크퐁 주가까지 들썩였어요.',
      '부캉이는 길을 잃고 좁은 수로에 갇힌 상태예요. "새끼를 낳았다"는 소식은 AI가 만든 가짜였어요.',
      '당국이 바다로 돌려보내려 하는데, 방식을 두고 전문가와 시민 의견이 갈려요.',
    ],
    sections: [
      {
        axis: 'news',
        heading: '부캉이가 뭐예요?',
        keyLine: '부산 북항 수로에 나타난 상어에 65만 명이 다녀갔어요.',
        paragraphs: [
          ['부캉이는 부산 동구 북항 친수공원 인공 수로에 나타난 상어예요. 길이는 3.5m. 9월 18일 오전 8시 57분쯤 처음 목격됐고, 시민들이 \'부산\'과 \'상어\'를 합쳐 \'부캉이\'라는 애칭을 붙였어요.'],
          ['추석 연휴 나흘(9/24~27)간 46만 8000명이 몰렸어요. AP, DW(독일), 더 인디펜던트(영국) 같은 해외 언론도 부캉이를 다뤘어요. 9월 29일에는 부산시가 시민 투표(91% 찬성)를 거쳐 명예홍보대사로 위촉했고, 1차 구조 작전은 실패했어요.'],
        ],
      },
      {
        axis: 'substance',
        heading: '상어 한 마리의 경제학',
        keyLine: '관광객이 폭증했고, 주식시장도 반응했어요.',
        paragraphs: [
          ['9/19~28 열흘간 누적 61만 6800명이 찾았어요. 평소 하루 2000명이던 공원에 최대 14만 명이 몰렸고, 공원 주변 카페·편의점 매출이 늘었어요. 상어 모양 아이스크림 매출은 30% 올랐어요.'],
          ['더 재밌는 건 주식시장이에요. \'아기상어\' 캐릭터로 유명한 더핑크퐁컴퍼니 주가가 9월 21일 하루 만에 10% 넘게 뛰었어요. 전문가들은 이걸 \'묻지마 테마주\' 현상으로 설명해요. 실질적 연관성보다 이름이나 소재가 비슷하다는 이유만으로 투자자가 몰리는 거예요.'],
          ['2020년 미국에서는 \'줌 비디오\'가 뜨자 아무 관계 없는 \'줌 테크놀로지스\'가 티커(ZOOM)만 비슷하다는 이유로 한 달 만에 1800% 폭등했어요. 결국 미국 증권거래위원회가 거래를 정지시켰어요.'],
        ],
      },
      {
        axis: 'other',
        heading: '가짜뉴스와 퇴거 논쟁',
        keyLine: '"새끼를 낳았다"는 AI 가짜였고, 보내는 방식을 두고 의견이 갈려요.',
        paragraphs: [
          ['9월 21일 SNS에 퍼진 부캉이 새끼 사진은 AFP 팩트체크 결과 AI로 만든 가짜였어요. 구글의 AI 탐지 도구 \'SynthID\'로 분석하니 생성된 흔적이 나왔어요. 황소상어는 한 번에 10~20마리씩 낳는데 세 마리만 나타났다는 것도 앞뒤가 맞지 않아요.'],
          ['지금은 부캉이를 돌려보내는 방식이 쟁점이에요. "무리하게 몰지 말고 스스로 나갈 때까지 기다려야 한다"는 의견이 있고, 국립수산과학원은 "무태상어는 좁은 수로에서 오래 살기 어렵다"며 장기 생존이 우선이라는 입장이에요.'],
        ],
      },
    ],
    editorNote: '부캉이 소동이 재밌는 건 주가·가짜뉴스·동물복지가 하나의 상어 등장에 묶인다는 거예요. 화제성 이슈는 언제나 예상 밖의 경로로 번져요.',
    vote: {
      kind: 'binary',
      question: '부캉이, 지금 보내는 게 맞을까요?',
      options: [
        { key: 'send', label: '지금 보내야 해요', hint: '생존 우선' },
        { key: 'wait', label: '기다려줘요', hint: '강제로 몰지 말고' },
      ],
    },
    sources: [
      { title: '(예시) 상어 등장 소식을 다룬 기사', outlet: '', href: '', axes: ['news'], internal: true, placeholder: true },
      { title: '(예시) 주가·테마주를 다룬 기사', outlet: '', href: '', axes: ['substance'], internal: true, placeholder: true },
      { title: '(예시) 관광·상권 효과를 다룬 기사', outlet: '', href: '', axes: ['substance'], internal: true, placeholder: true },
      { title: '(예시) AI 가짜뉴스 팩트체크를 다룬 기사', outlet: '', href: '', axes: ['other'], internal: true, placeholder: true },
      { title: '(예시) 구조·퇴거 논쟁을 다룬 기사', outlet: '', href: '', axes: ['other'], internal: true, placeholder: true },
    ],
  },
  {
    slug: '2026-10-08-경매-25억',
    issueNumber: 10,
    title: '25억 아파트가 경매에서 5억 빠진 이유',
    deck: '낙찰가가 감정가보다 크게 내려간 배경을 소식과 실체로 짚어요.',
    axisLabels: [
      { axis: 'news', label: '경매 소식' },
      { axis: 'substance', label: '왜 5억이 빠졌나' },
    ],
    categories: ['부동산'],
    publishedAt: '2026-10-08',
    readMinutes: 3,
    mock: true,
    summary: [
      '25억 원짜리 아파트가 경매에서 5억 원 낮게 팔렸다는 소식이에요.',
      '이 레터에서는 가격이 빠진 이유를 소식과 실체 두 축으로 정리해요.',
    ],
    sections: [
      {
        axis: 'news',
        heading: '경매 소식',
        keyLine: '25억 아파트가 경매에서 5억 낮게 팔렸어요.',
        paragraphs: [['목업 카드입니다. 원본 레터가 입력되면 이 자리에 본문이 들어와요.']],
      },
      {
        axis: 'substance',
        heading: '왜 5억이 빠졌나',
        keyLine: '이유는 원본 레터 입력 후 채워져요.',
        paragraphs: [['목업 카드입니다. 소스 기사 2건과 함께 본문이 들어와요.']],
      },
    ],
    editorNote: '목업 카드라 에디터 한마디는 원본 입력 후 채워져요.',
    vote: {
      kind: 'emotion',
      question: '이 소식을 어떻게 보셨나요?',
      options: [
        { key: 'no-feel', label: '실감이 안 난다' },
        { key: 'worried', label: '걱정됐다' },
        { key: 'watch', label: '지켜봐야 한다' },
      ],
    },
    sources: [
      { title: '(예시) 경매 소식을 다룬 기사', outlet: '', href: '', axes: ['news'], internal: true, placeholder: true },
      { title: '(예시) 낙찰가율을 다룬 기사', outlet: '', href: '', axes: ['substance'], internal: true, placeholder: true },
    ],
  },
];

export function findMockLetter(slug: string): IssueLetter | undefined {
  return MOCK_LETTERS.find((l) => l.slug === slug);
}
