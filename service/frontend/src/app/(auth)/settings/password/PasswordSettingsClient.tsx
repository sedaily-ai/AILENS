'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/features/auth';
import { isPasswordValid, PASSWORD_REQUIREMENT_MESSAGE } from '@/shared/lib/auth/passwordPolicy';
import { PasswordChecklist, PasswordMismatchHint } from '@/shared/ui/form/PasswordChecklist';

// 로그인한 사용자의 비밀번호 변경. "비밀번호 찾기"(이메일 왕복, forgotPassword)와 독립적인 기능이다 — 기존 비밀번호를 요구하므로 메일이 개입하지 않고 일일 발송 한도와도 무관하다.
// LoginClient.tsx와 같은 톤(흰 배경, 검정 CTA, 절제된 라운드)을 재사용한다.

const INPUT_CLS =
  'w-full px-4 py-3 text-[14.5px] text-gray-900 placeholder-gray-400 bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5 transition-colors';
const PRIMARY_BTN =
  'w-full py-3 text-[14.5px] font-semibold text-white bg-gray-900 rounded-lg hover:bg-black disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2';

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      style={{ animation: 'ailens-spin 0.8s linear infinite' }}
      aria-hidden="true"
    >
      <path strokeLinecap="round" d="M12 3a9 9 0 1 0 9 9" />
      <style>{`@keyframes ailens-spin{to{transform:rotate(360deg)}}`}</style>
    </svg>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[12.5px] font-semibold text-gray-700 mb-2">{children}</label>;
}

export function PasswordSettingsClient() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated, changePassword } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // 로딩 중(isAuthenticated 초기값 false)에 인증 여부를 판단하면 로그인된 사용자도 잠깐 로그인 화면으로 이동한다. isLoading이 끝난 뒤에만 판단한다.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    if (newPassword !== confirmPassword) return setError('새 비밀번호가 일치하지 않습니다.');
    if (!isPasswordValid(newPassword)) return setError(PASSWORD_REQUIREMENT_MESSAGE);
    setSubmitting(true);
    const result = await changePassword(currentPassword, newPassword);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error || '비밀번호 변경에 실패했습니다.');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setSuccessMessage('비밀번호가 변경됐어요.');
  };

  if (isLoading || !isAuthenticated) {
    return <div className="min-h-screen bg-white" />;
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-gray-100 bg-white">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-[56px] flex items-center gap-4">
          <button
            onClick={() => router.back()}
            aria-label="뒤로가기"
            className="p-2 -ml-2 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="inline-flex items-center gap-2 text-[15px] font-bold text-gray-900 tracking-tight">
            <Image src="/icon.svg" alt="" width={20} height={20} priority />
            AI LENS
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 pt-12 pb-16">
        <div className="w-full max-w-[400px]">
          <div className="text-center mb-10">
            <p className="text-[10.5px] font-bold tracking-[0.22em] text-gray-400 uppercase">SETTINGS</p>
            <h1
              className="mt-2 text-[28px] font-bold text-gray-900 tracking-tight"
              style={{ fontFamily: '"Noto Serif KR", serif' }}
            >
              비밀번호 변경
            </h1>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-[13px] text-red-700">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-lg text-[13px] text-emerald-700">
              {successMessage}
            </div>
          )}

          {user?.isFederated ? (
            <div className="px-4 py-3 bg-gray-50 border border-gray-100 rounded-lg text-[13px] text-gray-600 leading-relaxed">
              구글 계정으로 로그인 중이에요. 비밀번호는 구글 계정에서 관리해주세요 — AI LENS에는 별도 비밀번호가 없습니다.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <FieldLabel>현재 비밀번호</FieldLabel>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className={INPUT_CLS}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div>
                <FieldLabel>새 비밀번호</FieldLabel>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="8자 이상"
                    className={INPUT_CLS + ' pr-12'}
                    aria-describedby="change-password-rules"
                    aria-invalid={newPassword.length > 0 && !isPasswordValid(newPassword)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-gray-500 hover:text-gray-900"
                    aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  >
                    {showPassword ? '숨기기' : '보기'}
                  </button>
                </div>
                <PasswordChecklist id="change-password-rules" password={newPassword} />
              </div>
              <div>
                <FieldLabel>새 비밀번호 확인</FieldLabel>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="비밀번호 한 번 더"
                  className={INPUT_CLS}
                  aria-invalid={confirmPassword.length > 0 && newPassword !== confirmPassword}
                  autoComplete="new-password"
                  required
                />
                <PasswordMismatchHint password={newPassword} confirmPassword={confirmPassword} />
              </div>
              <button type="submit" disabled={submitting} className={PRIMARY_BTN + ' mt-2'}>
                {submitting && <Spinner />}
                비밀번호 변경
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
