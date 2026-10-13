import Link from 'next/link';
import { StaticPageShell } from '@/widgets/StaticPageShell';

export default function NotFound() {
  return (
    <StaticPageShell title="페이지를 찾을 수 없어요">
      <p style={{ margin: '0 0 12px', fontSize: 14, color: '#6b7280' }}>404</p>
      <p style={{ margin: 0, fontSize: 16, lineHeight: 1.8, wordBreak: 'keep-all' }}>
        주소를 다시 확인하거나 검색으로 원하는 뉴스를 찾아보세요.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 24 }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 20px', borderRadius: 999, background: '#2f5fcf', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
          홈으로 이동
        </Link>
        <Link href="/search" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 20px', borderRadius: 999, border: '1px solid #e5e7eb', color: '#111827', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
          뉴스 검색
        </Link>
      </div>
    </StaticPageShell>
  );
}
