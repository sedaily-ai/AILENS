'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { toPng } from 'html-to-image';
import { useLang } from '@saju/shared/lib/LangContext';
import { BRANCHES, findGapjaByOhAndZodiac, type Oh, type GapjaCharacter } from '@saju/shared/lib/gapja';
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

/** 동물별 주의 포인트 태그 */
const ZODIAC_CAUTION_TRAITS: Record<string, { ko: string[]; en: string[] }> = {
  '쥐': { ko: ['계산적', '변덕스러움', '의심 많음'], en: ['Calculating', 'Moody', 'Suspicious'] },
  '소': { ko: ['고집 셈', '변화 거부', '답답함'], en: ['Stubborn', 'Resistant', 'Frustrating'] },
  '호랑이': { ko: ['독선적', '충돌 잦음', '통제욕'], en: ['Overbearing', 'Combative', 'Controlling'] },
  '토끼': { ko: ['우유부단', '회피형', '감정 기복'], en: ['Indecisive', 'Avoidant', 'Moody'] },
  '용': { ko: ['자기중심', '압도적', '타협 불가'], en: ['Self-centered', 'Overwhelming', 'Inflexible'] },
  '뱀': { ko: ['의심 많음', '집착', '냉소적'], en: ['Suspicious', 'Possessive', 'Cynical'] },
  '말': { ko: ['충동적', '산만함', '끈기 부족'], en: ['Impulsive', 'Scattered', 'Impatient'] },
  '양': { ko: ['우유부단', '의존적', '소극적'], en: ['Indecisive', 'Dependent', 'Passive'] },
  '원숭이': { ko: ['가벼움', '신뢰 부족', '변덕'], en: ['Flippant', 'Unreliable', 'Fickle'] },
  '닭': { ko: ['잔소리', '완벽주의', '비판적'], en: ['Nagging', 'Perfectionist', 'Critical'] },
  '개': { ko: ['의심 많음', '예민함', '방어적'], en: ['Distrustful', 'Sensitive', 'Defensive'] },
  '돼지': { ko: ['안일함', '우유부단', '경계 부족'], en: ['Complacent', 'Indecisive', 'Gullible'] },
};

interface Props {
  avoidZodiacs: string[];
  avoidOh?: string;
}

/** 개별 갑자 캐릭터 카드 (경고 스타일) */
function CharacterCard({
  zodiac,
  avoidOh,
  lang,
  t,
}: {
  zodiac: string;
  avoidOh: string;
  lang: string;
  t: (ko: string, en: string) => string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [hasImg, setHasImg] = useState(false);

  const branch = findBranch(zodiac);
  if (!branch) return null;

  // 오행 + 띠로 60갑자 캐릭터 매핑
  const character = findGapjaByOhAndZodiac(avoidOh as Oh, branch.zodiacKo);
  const gapjaId = character?.id || '';
  const imgSrc = gapjaId ? `/saju/characters/${gapjaId}.png` : '';

  const stemInfo = character ? CHEONGAN_DATA[character.stem.hanja] : null;
  const characterName = stemInfo && character
    ? `${character.stem.ko}${character.branch.ko}(${character.id}) · ${stemInfo.상징.split(',')[0].trim()}`
    : gapjaId;

  const traits = ZODIAC_CAUTION_TRAITS[zodiac];

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
      link.download = `incompatible-${gapjaId || zodiac}-${Date.now()}.png`;
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
          border: '1px solid #FEE2E2',
          position: 'relative',
        }}
      >
        {/* 캐릭터 이미지 — 카드 상단 가득 채움 */}
        <div
          style={{
            width: '100%',
            flex: 1,
            background: 'linear-gradient(145deg, #FEF2F2 0%, #FFFFFF 100%)',
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
            <div style={{ fontSize: 36, fontWeight: 700, color: '#DC2626' }}>
              {gapjaId || branch.emoji}
            </div>
          )}
        </div>

        {/* 하단 정보 */}
        <div style={{ width: '100%', padding: '10px 8px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#1A1A1A', marginBottom: 2 }}>
            {characterName || zodiacLabel}
          </div>
          {traits && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', marginTop: 4 }}>
              {(lang === 'en' ? traits.en : traits.ko).slice(0, 3).map((trait, i) => (
                <span
                  key={i}
                  style={{
                    background: '#FEF2F2',
                    color: '#B91C1C',
                    fontSize: 8.5,
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: 5,
                    border: '1px solid #FECACA',
                  }}
                >
                  {trait}
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

export function IncompatibleAnimalsSection({ avoidZodiacs, avoidOh }: Props) {
  const { t, lang } = useLang();

  if (avoidZodiacs.length === 0) return null;

  // avoidOh가 없으면 기본값 사용 (금)
  const oh = avoidOh || '금';

  return (
    <div className="mb-4">
      <div className="px-1 pt-2 pb-3">
        <div className="flex gap-2.5 justify-center">
          {avoidZodiacs.slice(0, 2).map((zodiac) => (
            <CharacterCard
              key={zodiac}
              zodiac={zodiac}
              avoidOh={oh}
              lang={lang}
              t={t}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
