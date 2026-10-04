import type { Metadata } from 'next';
import { StaticPageShell } from '@/widgets/StaticPageShell';
import { SITE_URL } from '@/shared/constants/site';

export const metadata: Metadata = {
  title: '개인정보처리방침',
  description: 'AI LENS(서울경제신문)의 개인정보처리방침입니다. 수집하는 개인정보 항목과 이용 목적, 보유 기간, 이용자의 권리와 보호 조치를 안내합니다.',
  alternates: { canonical: `${SITE_URL}/privacy` },
  robots: { index: true, follow: true },
};

const h2: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: '#111827',
  marginTop: 32,
  marginBottom: 10,
};

const ul: React.CSSProperties = { paddingLeft: 20, marginTop: 4, marginBottom: 4 };

export default function PrivacyPage() {
  return (
    <StaticPageShell title="개인정보처리방침" updated="2026-08-07">
      <p>
        서울경제신문(이하 &ldquo;회사&rdquo;)은 AI LENS(ailens.sedaily.ai, 이하 &ldquo;서비스&rdquo;)를 운영하며,
        「개인정보보호법」 등 관계 법령에 따라 이용자의 개인정보를 보호하고 이와 관련한 고충을
        신속하게 처리할 수 있도록 다음과 같이 개인정보처리방침을 수립·공개합니다.
      </p>

      <h2 style={h2}>1. 수집하는 개인정보 항목</h2>
      <p>서비스는 다음과 같은 경우에 개인정보를 수집합니다.</p>
      <ul style={ul}>
        <li><strong>회원가입·로그인 시</strong>: 이메일 주소, 비밀번호(암호화 저장). 구글·카카오 소셜 로그인 이용 시 각 서비스가 제공하는 이메일·이름·프로필 식별자.</li>
        <li><strong>뉴스레터 구독 시</strong>: 이메일 주소.</li>
        <li><strong>서비스 이용 과정에서 자동 수집</strong>: 읽은 글 목록·문장 저장(&ldquo;내 서랍&rdquo;) 등 이용 기록, 접속 IP, 브라우저·기기 정보, 쿠키, 접속 일시.</li>
        <li><strong>문의 시</strong>: 이메일 주소, 문의 내용.</li>
      </ul>
      <p style={{ marginTop: 8 }}>
        서비스 내 사주 콘텐츠(생년월일시 입력)는 별도 계정 정보와 연결해 저장하지 않으며, 결과 계산을
        위해 일시적으로만 사용됩니다.
      </p>

      <h2 style={h2}>2. 개인정보의 수집·이용 목적</h2>
      <ul style={ul}>
        <li>회원 식별 및 서비스 제공(로그인, 읽기 기록·저장 문장 동기화)</li>
        <li>뉴스레터 등 콘텐츠 발송</li>
        <li>서비스 품질 개선, 이용 통계 분석(Google Analytics)</li>
        <li>문의·불편사항 처리 및 고지사항 전달</li>
        <li>부정 이용 방지 및 법령상 의무 이행</li>
      </ul>

      <h2 style={h2}>3. 개인정보의 보유·이용 기간</h2>
      <p>
        회원 탈퇴 또는 뉴스레터 구독 해지 시 지체 없이 파기합니다. 다만 관계 법령(전자상거래법,
        통신비밀보호법 등)에서 별도 보관을 정한 경우 해당 기간 동안 보관합니다. 이용 기록·접속 로그는
        수집일로부터 최대 12개월간 보관 후 파기합니다.
      </p>

      <h2 style={h2}>4. 개인정보의 제3자 제공 및 처리위탁</h2>
      <p>
        회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만 서비스 운영을 위해
        아래와 같이 개인정보 처리를 위탁하고 있습니다.
      </p>
      <ul style={ul}>
        <li>Amazon Web Services, Inc.(AWS) — 서버·데이터베이스 인프라 운영(회원 인증, 데이터 저장)</li>
        <li>Google LLC — 로그인(OAuth), 방문 통계 분석(Google Analytics)</li>
        <li>Kakao Corp. — 로그인(OAuth)</li>
      </ul>
      <p style={{ marginTop: 8 }}>법령에 근거하거나 수사기관의 적법한 요청이 있는 경우를 제외하고 제3자에게 제공하지 않습니다.</p>

      <h2 style={h2}>5. 이용자의 권리</h2>
      <p>
        이용자는 언제든지 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요청할 수 있습니다.
        아래 &ldquo;문의&rdquo; 채널로 연락 주시면 지체 없이 조치합니다.
      </p>

      <h2 style={h2}>6. 쿠키의 운영 및 거부</h2>
      <p>
        서비스는 이용 통계 분석(Google Analytics)을 위해 쿠키를 사용합니다. 이용자는 브라우저 설정을
        통해 쿠키 저장을 거부할 수 있으며, 이 경우 일부 서비스 이용에 어려움이 있을 수 있습니다.
      </p>

      <h2 style={h2}>7. 개인정보의 안전성 확보 조치</h2>
      <p>
        비밀번호 암호화 저장, 접근 권한 관리, AWS 인프라의 전송 구간 암호화(HTTPS) 등 기술적·관리적
        조치를 시행하고 있습니다.
      </p>

      <h2 style={h2}>8. 아동의 개인정보</h2>
      <p>서비스는 만 14세 미만 아동을 대상으로 하지 않으며, 이를 알면서 개인정보를 수집하지 않습니다.</p>

      <h2 style={h2}>9. 개인정보처리방침의 변경</h2>
      <p>
        이 방침은 법령·서비스 변경에 따라 수정될 수 있으며, 변경 시 이 페이지를 통해 고지합니다.
      </p>

      <h2 style={h2}>10. 개인정보 보호책임자 및 문의처</h2>
      <p>
        서울경제신문<br />
        대표: 손동영<br />
        주소: 서울특별시 종로구 율곡로 6 트윈트리타워 B동 14~16층<br />
        대표전화: 02-724-8600<br />
        이메일: <a href="mailto:webmaster@sedaily.com" style={{ textDecoration: 'underline' }}>webmaster@sedaily.com</a>
      </p>
    </StaticPageShell>
  );
}
