import type { Metadata } from 'next';
import { StaticPageShell } from '@/shared/ui/StaticPageShell';

export const metadata: Metadata = {
  title: '이용약관 — AI LENS',
  description: 'AI LENS(서울경제신문)의 이용약관.',
  alternates: { canonical: 'https://ailens.sedaily.ai/terms' },
  robots: { index: true, follow: true },
};

const h2: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: '#111827',
  marginTop: 32,
  marginBottom: 10,
};

export default function TermsPage() {
  return (
    <StaticPageShell title="이용약관" updated="2026-08-07">
      <h2 style={h2}>제1조 (목적)</h2>
      <p>
        이 약관은 서울경제신문(이하 &ldquo;회사&rdquo;)이 제공하는 AI LENS 서비스(ailens.sedaily.ai, 이하
        &ldquo;서비스&rdquo;)의 이용조건 및 절차, 회사와 이용자의 권리·의무 및 책임사항을 규정함을 목적으로
        합니다.
      </p>

      <h2 style={h2}>제2조 (운영자 정보)</h2>
      <p>
        상호: 서울경제신문<br />
        대표자: 손동영<br />
        사업자등록번호: 208-81-10310<br />
        신문 등록번호: 서울 가 00224 (1988.05.13)<br />
        인터넷신문 등록번호: 서울 아04065 (2016.04.26)<br />
        주소: 서울특별시 종로구 율곡로 6 트윈트리타워 B동 14~16층<br />
        대표전화: 02-724-8600
      </p>

      <h2 style={h2}>제3조 (약관의 효력 및 변경)</h2>
      <p>
        이 약관은 서비스 화면에 게시함으로써 효력이 발생합니다. 회사는 관계 법령을 위배하지 않는
        범위에서 약관을 변경할 수 있으며, 변경된 약관은 게시와 동시에 효력이 발생합니다.
      </p>

      <h2 style={h2}>제4조 (저작권)</h2>
      <p>
        서비스에 게시되는 콘텐츠(레터·요약·이미지·웹툰 등)에 대한 저작권은 회사에 있습니다. 이용자는
        개인적·비상업적 목적의 열람 및 공유(링크 공유 포함) 외의 목적으로 무단 복제·배포·2차 저작물
        작성을 할 수 없으며, 별도 이용을 원하는 경우 사전에 회사의 서면 동의를 받아야 합니다.
      </p>

      <h2 style={h2}>제5조 (서비스 이용)</h2>
      <p>
        이용자는 관계 법령 및 이 약관을 준수해야 하며, 다음 행위를 해서는 안 됩니다.
      </p>
      <ul style={{ paddingLeft: 20, marginTop: 4 }}>
        <li>서비스 운영을 방해하는 행위(과도한 트래픽 유발, 자동화된 대량 수집 등)</li>
        <li>타인의 계정을 무단으로 사용하는 행위</li>
        <li>서비스를 이용해 얻은 정보를 회사의 사전 동의 없이 복제·유통·상업적으로 이용하는 행위</li>
      </ul>

      <h2 style={h2}>제6조 (콘텐츠에 대한 면책)</h2>
      <p>
        서비스가 제공하는 콘텐츠는 AI가 원본 기사를 재구성해 생성하며, 투자 판단의 근거가 되는 조언이
        아닙니다. 회사는 콘텐츠의 정확성·완전성·최신성을 보장하지 않으며, 중요한 의사결정 전에는 원문
        확인 등 이용자의 독자적인 검증을 권장합니다. 사주·운세 콘텐츠는 재미와 참고 목적으로 제공되며
        과학적 사실로 보증하지 않습니다.
      </p>

      <h2 style={h2}>제7조 (외부 링크)</h2>
      <p>
        서비스는 원본 기사 등 외부 사이트로 연결되는 링크를 포함할 수 있으며, 회사는 연결된 외부
        사이트의 콘텐츠나 개인정보 처리에 대해 책임지지 않습니다.
      </p>

      <h2 style={h2}>제8조 (책임의 제한)</h2>
      <p>
        회사는 천재지변, 서비스 장애 등 불가항력으로 인한 서비스 제공 중단에 대해 책임을 지지 않으며,
        이용자가 서비스를 통해 얻은 정보를 근거로 한 판단·행위에 대해 책임을 지지 않습니다.
      </p>

      <h2 style={h2}>제9조 (준거법 및 관할)</h2>
      <p>이 약관은 대한민국 법령에 따르며, 서비스 이용과 관련한 분쟁은 서울중앙지방법원을 관할 법원으로 합니다.</p>

      <h2 style={h2}>제10조 (문의)</h2>
      <p>
        이메일: <a href="mailto:webmaster@sedaily.com" style={{ textDecoration: 'underline' }}>webmaster@sedaily.com</a>
        {' · '}전화: 02-724-8600
      </p>
    </StaticPageShell>
  );
}
