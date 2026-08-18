import type { Metadata } from 'next';
import { StaticPageShell } from '@/widgets/StaticPageShell';

export const metadata: Metadata = {
  title: '문의',
  description: 'AI LENS(서울경제신문) 문의처 안내.',
  alternates: { canonical: 'https://ailens.sedaily.ai/contact' },
  robots: { index: true, follow: true },
};

const h2: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: '#111827',
  marginTop: 32,
  marginBottom: 10,
};

export default function ContactPage() {
  return (
    <StaticPageShell title="문의">
      <p>서비스 이용 중 궁금한 점이나 오류 제보, 제휴·광고 문의는 아래 채널로 연락해 주세요.</p>

      <h2 style={h2}>일반 문의</h2>
      <p>
        이메일:{' '}
        <a href="mailto:webmaster@sedaily.com" style={{ textDecoration: 'underline' }}>
          webmaster@sedaily.com
        </a>
        <br />
        대표전화: 02-724-8600 (대표 전화 — 한국어/영어 응대)
      </p>

      <h2 style={h2}>운영 시간</h2>
      <p>
        평일 09:00–18:00 (한국 표준시, UTC+9)<br />
        주말·공휴일 휴무
      </p>

      <h2 style={h2}>부서별 문의</h2>
      <p>
        편집(콘텐츠 오류 제보): 02-724-8600<br />
        광고·제휴: 02-724-8600<br />
        구독: 02-724-8600<br />
        디지털/웹 서비스: <a href="mailto:webmaster@sedaily.com" style={{ textDecoration: 'underline' }}>webmaster@sedaily.com</a>
      </p>

      <h2 style={h2}>오시는 길</h2>
      <p>
        서울경제신문<br />
        서울특별시 종로구 율곡로 6 트윈트리타워 B동 14~16층<br />
        지하철 1호선 종각역, 3호선 안국역 인근
      </p>

      <h2 style={h2}>소셜 채널</h2>
      <p>
        <a href="https://www.instagram.com/moneycut_._/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
          Instagram
        </a>
        {' · '}
        <a href="https://www.youtube.com/channel/UCBjKiKjXZf4aEA3WqicVhGQ" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
          YouTube
        </a>
      </p>
    </StaticPageShell>
  );
}
