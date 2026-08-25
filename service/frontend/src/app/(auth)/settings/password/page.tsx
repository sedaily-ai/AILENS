import type { Metadata } from 'next';
import { PasswordSettingsClient } from './PasswordSettingsClient';

export const metadata: Metadata = {
  title: '비밀번호 변경',
  robots: { index: false },
};

export default function PasswordSettingsPage() {
  return <PasswordSettingsClient />;
}
