'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { toPng } from 'html-to-image';
import { useLang } from '@saju/shared/lib/LangContext';
import { BRANCHES, OH_TONE, findGapjaByOhAndZodiac, type Oh, type GapjaCharacter } from '@saju/shared/lib/gapja';
import cheonganDB from '@saju/features/fortune/lib/cheongan_db.json';

const CHEONGAN_DATA = cheonganDB.CHEONGAN as Record<string, { 한글: string; 음양: string; 오행: string; 상징: string; 성향: string; 키워드: string[] }>;

/** 띠 한글(쥐, 소 등) → BranchInfo */
function findBranch(zodiacKo: string) {
  return BRANCHES.find(
    b => b.zodiacKo === zodiacKo || b.zodiacKo.replace('띠', '') === zodiacKo,
  );
}

const ZODIAC_EN: Record<string, string> = {
  '쥐': 'Rat', '소': 'Ox', '호랑이': 'Tiger', '토끼': 'Rabbit',
  '용': 'Dragon', '뱀': 'Snake', '말': 'Horse', '양': 'Goat',
  '원숭이': 'Monkey', '닭': 'Rooster', '개': 'Dog', '돼지': 'Pig',
};

interface Props {
  idealZodiacs: string[];
  primaryOh: string;
}

/** 개별 갑자 캐릭터 카드 */
function CharacterCard({
  zodiac,
  primaryOh,
  lang,
  t,
}: {
  zodiac: string;
  primaryOh: string;
  lang: string;
  t: (ko: string, en: string) => string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [hasImg, setHasImg] = useState(false);
  const tone = OH_TONE[primaryOh as Oh] ?? OH_TONE['목'];

  const branch = findBranch(zodiac);
  if (!branch) return null;

  // 오행 + 띠로 60갑자 캐릭터 매핑
  const character = findGapjaByOhAndZodiac(primaryOh as Oh, branch.zodiacKo);
  const gapjaId = character?.id || '';
  const imgSrc = gapjaId ? `/saju/characters/${gapjaId}.png` : '';

  const stemInfo = character ? CHEONGAN_DATA[character.stem.hanja] : null;
  const characterName = stemInfo && character
    ? `${character.stem.ko}${character.branch.ko}(${character.id}) · ${stemInfo.상징.split(',')[0].trim()}`
    : gapjaId;
  const personality = stemInfo?.성향?.split('.')[0] || branch.mood;

  const zodiacLabel = lang === 'en'
    ? (ZODIAC_EN[zodiac] ?? zodiac)
    : branch.zodiacKo;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!imgSrc) return;
    const img = new Image();
    img.onload = () => setHasImg(true);
    img.onerror = () => setHasImg(false);
    img.src = imgSrc;
  }, [imgSrc]);

  const handleSave = useCallback(async () => {
    if (!cardRef.current || saving) return;
    setSaving(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#FFFFFF',
      });
      const link = document.createElement('a');
      link.download = `compatible-${gapjaId || zodiac}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('character card export failed', err);
    } finally {
      setSaving(false);
    }
  }, [saving, gapjaId, zodiac]);

  return (
    <div className="flex flex-col items-center flex-1 min-w-0">
      <div
        ref={cardRef}
        className="w-full rounded-[16px] overflow-hidden"
        style={{
          aspectRatio: '9 / 16',
          maxWidth: 200,
          background: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          border: '1px solid #F3F4F6',
          position: 'relative',
        }}
      >
        {/* 캐릭터 이미지 — 카드 상단 가득 채움 */}
        <div
          style={{
            width: '100%',
            flex: 1,
            background: `linear-gradient(145deg, ${tone.bg} 0%, #FFFFFF 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {hasImg ? (
            <img
              src={imgSrc}
              alt={`${gapjaId} ${t('캐릭터', 'character')}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ fontSize: 36, fontWeight: 700, color: tone.fg }}>
              {gapjaId || branch.emoji}
            </div>
          )}
        </div>

        {/* 하단 정보 */}
        <div style={{ width: '100%', padding: '10px 8px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#1A1A1A', marginBottom: 2 }}>
            {characterName || zodiacLabel}
          </div>
          <div style={{ fontSize: 9, color: '#9CA3AF', lineHeight: 1.4, marginBottom: 6 }}>
            {personality}
          </div>
          {stemInfo?.키워드 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center' }}>
              {stemInfo.키워드.slice(0, 3).map((kw, i) => (
                <span
                  key={i}
                  style={{
                    background: `${tone.fg}10`,
                    color: tone.fg,
                    fontSize: 8.5,
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: 5,
                  }}
                >
                  #{kw}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 저장 버튼 */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-1.5 px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-[10px] font-semibold text-gray-500 dark:text-gray-400 border-none cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
      >
        {saving ? '...' : t('저장', 'Save')}
      </button>
    </div>
  );
}

export function CompatibleAnimalsSection({ idealZodiacs, primaryOh }: Props) {
  const { t, lang } = useLang();

  if (idealZodiacs.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="px-1 pt-2 pb-3">
        <div className="flex gap-2.5 justify-center">
          {idealZodiacs.slice(0, 2).map((zodiac) => (
            <CharacterCard
              key={zodiac}
              zodiac={zodiac}
              primaryOh={primaryOh}
              lang={lang}
              t={t}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
