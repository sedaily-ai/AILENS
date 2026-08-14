'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLang } from '@saju/shared/lib/LangContext';

// 임시 캐릭터 데이터 (향후 60개로 확장 예정)
export type SajuCharacter = {
  id: string;
  nameKo: string;
  nameEn: string;
  emoji: string;
  color: string;
};

const SAMPLE_CHARACTERS: SajuCharacter[] = [
  {
    id: 'raccoon',
    nameKo: '신비로운 너구리',
    nameEn: 'Mystic Raccoon',
    emoji: '🦝',
    color: '#FF6B35',
  },
  {
    id: 'lion',
    nameKo: '위엄의 사자',
    nameEn: 'Majestic Lion',
    emoji: '🦁',
    color: '#E040FB',
  },
  {
    id: 'hippo',
    nameKo: '듬직한 하마',
    nameEn: 'Steadfast Hippo',
    emoji: '🦛',
    color: '#26C6DA',
  },
  {
    id: 'orangutan',
    nameKo: '지혜로운 오랑우탄',
    nameEn: 'Wise Orangutan',
    emoji: '🦧',
    color: '#FF7043',
  },
];

// 사주 입력 여부 확인 (localStorage 기반)
function useHasSajuInput(): boolean {
  const [has, setHas] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('saju-birth-data');
      setHas(!!saved);
    } catch {
      setHas(false);
    }
  }, []);
  return has;
}

// 사용자 캐릭터 가져오기 (임시: 저장된 데이터가 있으면 배정)
function useMyCharacter(): SajuCharacter | null {
  const [char, setChar] = useState<SajuCharacter | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('saju-birth-data');
      if (saved) {
        const data = JSON.parse(saved);
        const seed = (data.year || 1990) % SAMPLE_CHARACTERS.length;
        setChar(SAMPLE_CHARACTERS[seed]);
      }
    } catch {
      setChar(null);
    }
  }, []);
  return char;
}

export function CharacterCarousel() {
  const { t, localePath } = useLang();
  const hasSaju = useHasSajuInput();
  const myCharacter = useMyCharacter();
  const [activeIdx, setActiveIdx] = useState(0);

  // 자동 슬라이드 (미입력 상태에서만)
  useEffect(() => {
    if (hasSaju && myCharacter) return;
    const id = setInterval(() => {
      setActiveIdx((i) => (i + 1) % SAMPLE_CHARACTERS.length);
    }, 3000);
    return () => clearInterval(id);
  }, [hasSaju, myCharacter]);

  return (
    <section className="relative z-10 px-5 lg:px-0 lg:min-w-0 lg:h-full">
      <div
        className="relative overflow-hidden rounded-[28px] lg:h-full"
        style={{ aspectRatio: '4 / 3', background: '#1A1A2E' }}
      >
        {/* 고정 배경 장식 */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div
            className="absolute top-[-40px] right-[-40px] w-[180px] h-[180px] rounded-full"
            style={{ background: '#34D399', opacity: 0.06 }}
          />
          <div
            className="absolute bottom-[-50px] left-[-50px] w-[160px] h-[160px] rounded-full"
            style={{ background: '#059669', opacity: 0.06 }}
          />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[240px] h-[240px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(232,183,48,0.1) 0%, transparent 70%)' }}
          />
        </div>

        {/* 슬라이드 콘텐츠 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {SAMPLE_CHARACTERS.map((char, i) => {
            const isActive = hasSaju && myCharacter
              ? char.id === myCharacter.id
              : i === activeIdx;
            return (
              <div
                key={char.id}
                className="absolute inset-0 flex flex-col items-center justify-center p-6 transition-opacity duration-500"
                style={{ opacity: isActive ? 1 : 0, pointerEvents: isActive ? 'auto' : 'none' }}
              >
                {/* 캐릭터 이모지 */}
                <span
                  className="text-[96px] leading-none mb-4 drop-shadow-[0_4px_20px_rgba(255,255,255,0.15)]"
                  role="img"
                  aria-label={t(char.nameKo, char.nameEn)}
                >
                  {char.emoji}
                </span>

                {/* 캐릭터 이름 */}
                <h2
                  className="text-[24px] font-black tracking-[-0.02em] text-center"
                  style={{ color: '#FFFFFF' }}
                >
                  {t(char.nameKo, char.nameEn)}
                </h2>

                {/* CTA or 내 캐릭터 라벨 */}
                {hasSaju && myCharacter ? (
                  <span
                    className="mt-5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-bold border border-white/20"
                    style={{ background: 'rgba(255,255,255,0.1)', color: '#FFFFFF' }}
                  >
                    {t('나의 사주 캐릭터', 'My Saju Character')}
                  </span>
                ) : (
                  <Link
                    href={localePath('/saju')}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[13px] font-bold transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-95"
                    style={{ background: '#34D399', color: '#1A1A2E' }}
                  >
                    {t('내 캐릭터는 뭘까?', "What's my character?")}
                    <span aria-hidden>→</span>
                  </Link>
                )}
              </div>
            );
          })}
        </div>

        {/* 하단 dot 인디케이터 */}
        {!(hasSaju && myCharacter) && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-5 flex gap-1.5 z-10">
            {SAMPLE_CHARACTERS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveIdx(i)}
                aria-label={`${t('캐릭터', 'Character')} ${i + 1}`}
                className="block h-2 rounded-full transition-all"
                style={{
                  width: i === activeIdx ? 20 : 8,
                  background: i === activeIdx ? '#34D399' : 'rgba(255,255,255,0.25)',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
