import type { Metadata } from 'next';
import { StaticPageShell } from '@/shared/ui/StaticPageShell';

export const metadata: Metadata = {
  title: '회사소개 — AI LENS',
  description: '1960년 창간한 서울경제신문이 만드는 AI 경제 뉴스 서비스, AI LENS를 소개합니다.',
  alternates: { canonical: 'https://ailens.sedaily.ai/about' },
  robots: { index: true, follow: true },
};

const h2: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: '#111827',
  marginTop: 32,
  marginBottom: 10,
};

const h3: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 700,
  color: '#374151',
  marginTop: 16,
  marginBottom: 3,
};

const awardTable: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  fontSize: 13.5,
};

const categoryGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: 12,
  fontSize: 13,
};

export default function AboutPage() {
  return (
    <StaticPageShell title="회사소개">
      <p>
        AI LENS는 1960년 창간한 대한민국 최초의 경제 전문지 <strong>서울경제신문</strong>이
        만드는 AI 경제 뉴스 서비스입니다. 그날의 핵심 경제 이슈를 AI가 정리해 &ldquo;오늘의 한
        통&rdquo;으로 전하고, 트렌드·칼럼·웹툰·단어장 등 경제를 가볍게 접할 수 있는 콘텐츠를
        함께 제공합니다.
      </p>

      <h2 style={h2}>수상 및 인정</h2>
      <p>
        서울경제신문은 WAN-IFRA(세계신문협회) Digital Media Awards에서 AI 저널리즘·뉴스레터·
        디지털 프로덕트 혁신 부문에 걸쳐 여러 차례 수상·본선에 올랐습니다.
      </p>
      <div style={awardTable}>
        <div>
          <strong>APAC Gold — Best AI-driven News Product, Format or Strategy</strong>
          <br />
          WAN-IFRA Digital Media Awards APAC 2026 · AI LENS
        </div>
        <div>
          <strong>APAC Gold — Best Newsletter</strong>
          <br />
          WAN-IFRA Digital Media Awards APAC 2026 · AI PRISM
        </div>
        <div>
          <strong>APAC Silver — Most Innovative Digital Product</strong>
          <br />
          WAN-IFRA Digital Media Awards APAC 2026 · AI NOVA
        </div>
        <div>
          <strong>Finalist — Best AI-driven News Product, Format or Strategy</strong>
          <br />
          WAN-IFRA Digital Media Awards 2026 · AI LENS
        </div>
        <div>
          <strong>Finalist — Best Newsletter</strong>
          <br />
          WAN-IFRA Digital Media Awards 2026 · AI PRISM
        </div>
        <div>
          <strong>Winner — AI LINK</strong>
          <br />
          WAN-IFRA Digital Media Awards 2026
        </div>
      </div>
      <p style={{ marginTop: 10 }}>
        Best AI-driven News Product 부문 Gold는 지금 보고 계신 AI LENS가, Best Newsletter
        부문 Gold는 서울경제신문의 영문 뉴스레터 AI PRISM이 받았습니다. Most Innovative
        Digital Product 부문 Silver는 AI NOVA에 돌아갔습니다 — 한국 경제 저널리즘을
        디지털로 확장하려는 서울경제신문의 투자가 인정받은 결과입니다.
      </p>

      <h2 style={h2}>운영 방식 — AI가 돕고, 사람이 검수합니다</h2>
      <p>
        서울경제신문 기자들이 취재한 원본 기사를 바탕으로 AI가 요약·재구성한 초안을 작성하고,
        편집팀이 검수해 발행합니다. 매일 쏟아지는 경제 이슈를 놓치지 않고 &ldquo;오늘의 한
        통&rdquo;으로 정리해 전하는 것이 목표이며, 원하시면 텍스트 대신 팟캐스트(오디오)로도
        들을 수 있습니다.
      </p>

      <h2 style={h2}>연혁</h2>
      <p>
        1960년 창간한 서울경제신문은 대한민국 최초의 경제 전문지입니다. 60년이 넘는 시간 동안
        한국이 개발도상국에서 세계적 경제 강국으로 성장하는 과정을 현장에서 기록해 왔으며, 경제·
        금융시장·기업·국제 경제 뉴스를 폭넓게 다루는 경제 저널리즘의 선두주자로 자리잡았습니다.
      </p>

      <h2 style={h2}>비전</h2>
      <p>
        <strong>신뢰의 저널리즘</strong> — 정확한 보도로 경제 저널리즘의 기준을 세우고, 한국
        경제의 성장을 함께 이끕니다.
        <br />
        <strong>혁신의 저널리즘</strong> — AI 등 새로운 기술을 통해 미디어의 형식과 경험을
        끊임없이 재구성합니다.
        <br />
        <strong>다음을 여는 저널리즘</strong> — 한국 경제의 다음 장을 준비하는 시선으로 기사를
        씁니다.
      </p>

      <h2 style={h2}>다루는 주제</h2>
      <p>서울경제신문 취재망을 바탕으로 AI LENS가 정리하는 이슈 영역입니다.</p>
      <div style={categoryGrid}>
        <div><strong>경제</strong><br />거시경제·금리·물가</div>
        <div><strong>IT·과학</strong><br />반도체·AI·스타트업</div>
        <div><strong>정치</strong><br />정책·입법·행정</div>
        <div><strong>사회</strong><br />노동·교육·인구</div>
        <div><strong>문화</strong><br />라이프스타일·트렌드</div>
        <div><strong>스포츠</strong><br />국내외 스포츠 이슈</div>
        <div><strong>국제</strong><br />세계 경제·외교·무역</div>
      </div>

      <h2 style={h2}>회사 정보</h2>
      <h3 style={h3}>상호</h3>
      <p>서울경제신문 (Seoul Economic Daily Co., Ltd.)</p>
      <h3 style={h3}>창간</h3>
      <p>1960년</p>
      <h3 style={h3}>대표자</h3>
      <p>손동영</p>
      <h3 style={h3}>주소</h3>
      <p>서울특별시 종로구 율곡로 6 트윈트리타워 B동 14~16층</p>
      <h3 style={h3}>전화</h3>
      <p>02-724-8600</p>
      <h3 style={h3}>등록</h3>
      <p>
        신문 등록번호 서울 가 00224 (1988.05.13)<br />
        인터넷신문 등록번호 서울 아04065 (2016.04.26)
      </p>
      <h3 style={h3}>관련 사이트</h3>
      <p>
        <a href="https://www.sedaily.com" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
          sedaily.com
        </a>
        {' (한글)'} ·{' '}
        <a href="https://en.sedaily.com" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
          en.sedaily.com
        </a>
        {' (English)'}
      </p>
    </StaticPageShell>
  );
}
