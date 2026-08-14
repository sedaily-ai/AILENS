'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useLang } from '@saju/shared/lib/LangContext';
import { SAJU, SERIF } from '@saju/shared/ui/sajuTokens';
import { ZodiacIcon } from '@saju/shared/ui/ZodiacIcon';
import { buildGapjaList, OH_TONE, readMyDayGapjaId, type GapjaCharacter } from '../lib/gapja';

const GAPJA_LIST = buildGapjaList();
const INITIAL_VISIBLE = 9;

function matchesQuery(g: GapjaCharacter, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    g.stem.hanja, g.branch.hanja, g.stem.ko, g.branch.ko,
    g.branch.zodiacKo, g.stem.keyword,
  ].join(' ').toLowerCase();
  return haystack.includes(q);
}

export function CharacterGrid() {
  const { t } = useLang();
  const [selected, setSelected] = useState<GapjaCharacter | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const handleSelect = (g: GapjaCharacter) => {
    setSelected(g);
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 50);
  };

  useEffect(() => {
    setMyId(readMyDayGapjaId());
  }, []);

  useEffect(() => {
    if (!myId) return;
    const mine = GAPJA_LIST.find(g => g.id === myId);
    if (mine) setSelected(mine);
  }, [myId]);

  const filtered = useMemo(() => GAPJA_LIST.filter(g => matchesQuery(g, query)), [query]);
  const isSearching = query.trim().length > 0;
  const visible = isSearching ? filtered : (expanded ? GAPJA_LIST : GAPJA_LIST.slice(0, INITIAL_VISIBLE));

  return (
    <div>
      {/* 안내 — 페이지 개념 + 사용법 */}
      <div className="rounded-[18px] bg-white px-4 py-3.5 mb-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <p className="text-[12.5px] leading-relaxed" style={{ color: SAJU.inkSoft }}>
          {t(
            '태어난 날의 천간·지지 조합마다 고유한 캐릭터가 있어요. 검색으로 바로 찾거나, 아래에서 하나씩 눌러 구경해보세요.',
            'Every stem·branch combination of your birth day has its own character. Search directly, or tap through the cards below.',
          )}
        </p>
      </div>

      {selected && (
        <div ref={detailRef}>
          <CharacterDetail character={selected} isMine={selected.id === myId} />
        </div>
      )}

      {/* 검색 */}
      <div
        className="flex items-center gap-2 rounded-full pl-4 pr-3 py-2.5 mb-4"
        style={{ background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
      >
        <Search size={14} strokeWidth={2.2} style={{ color: SAJU.inkSub }} className="shrink-0" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('이름이나 띠로 검색', 'Search by name or zodiac')}
          className="flex-1 min-w-0 bg-transparent text-[13px] outline-none placeholder:text-gray-400"
          style={{ color: SAJU.ink }}
        />
      </div>

      {isSearching ? (
        <p className="px-1 mb-3 text-[11.5px]" style={{ color: SAJU.inkSub }}>
          {t(`${filtered.length}개 찾음`, `${filtered.length} found`)}
        </p>
      ) : (
        !myId && (
          <p className="px-1 mb-3 text-[11.5px]" style={{ color: SAJU.inkSub }}>
            {t('사주를 입력하면 내 캐릭터가 위에 강조돼요.', 'Enter your saju to highlight yours above.')}
          </p>
        )
      )}

      {visible.length === 0 ? (
        <p className="px-1 py-8 text-center text-[13px]" style={{ color: SAJU.inkSub }}>
          {t('일치하는 캐릭터가 없어요.', 'No matching character.')}
        </p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {visible.map(g => (
            <li key={g.id}>
              <CharacterTile
                character={g}
                isMine={g.id === myId}
                onClick={() => handleSelect(g)}
                label={t('나', 'Me')}
                ohLabel={t('기운', 'energy')}
              />
            </li>
          ))}
        </ul>
      )}

      {!isSearching && !expanded && GAPJA_LIST.length > INITIAL_VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full mt-4 flex items-center justify-center gap-1 py-3 text-[12.5px] font-semibold rounded-full transition-colors bg-white hover:bg-gray-50"
          style={{ color: SAJU.inkSoft, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
        >
          {t(`${GAPJA_LIST.length - INITIAL_VISIBLE}명 더보기`, `Show ${GAPJA_LIST.length - INITIAL_VISIBLE} more`)}
        </button>
      )}
      {!isSearching && expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="w-full mt-4 py-3 text-[12.5px] font-semibold rounded-full transition-colors"
          style={{ color: SAJU.inkSub }}
        >
          {t('접기', 'Collapse')}
        </button>
      )}
    </div>
  );
}

function CharacterTile({
  character, isMine, onClick, label, ohLabel,
}: { character: GapjaCharacter; isMine: boolean; onClick: () => void; label: string; ohLabel: string }) {
  const tone = OH_TONE[character.stem.oh];
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-full flex flex-col rounded-[22px] bg-white p-4 transition-all hover:-translate-y-0.5 hover:scale-105 active:scale-[0.98]"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
          style={{ background: tone.bg, color: tone.fg }}
        >
          {character.stem.oh} {ohLabel}
        </span>
        {isMine && (
          <span
            className="rounded-full px-2 py-0.5 text-[9.5px] font-bold text-white"
            style={{ background: SAJU.warmDeep }}
          >
            {label}
          </span>
        )}
      </div>

      <div className="flex flex-col items-center text-center">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mb-2.5 overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${tone.bg} 0%, #FFFFFF 100%)`, color: tone.fg }}
        >
          <CharacterIcon id={character.id} branch={character.branch.hanja} size={40} tone={tone} />
        </div>
        <h4 className="text-[16px] font-black" style={{ fontFamily: SERIF, color: SAJU.ink }}>
          {character.stem.ko}{character.branch.ko}
        </h4>
        <p className="text-[12.5px] font-bold mt-0.5" style={{ color: tone.fg }}>
          {character.stem.keyword}
        </p>
      </div>

      <p
        className="mt-2.5 text-[12.5px] leading-snug text-center"
        style={{
          color: SAJU.inkSub,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {character.branch.mood}
      </p>
    </button>
  );
}

/* === 천간(오행)+지지 기반 강점/약점 유추 헬퍼 === */
const STEM_STRENGTHS: Record<string, [string, string][]> = {
  '목': [['추진력이 강하다', 'Strong drive'], ['성장 지향적이다', 'Growth-oriented'], ['인내심이 있다', 'Patient and persistent']],
  '화': [['에너지가 넘친다', 'Full of energy'], ['표현력이 좋다', 'Expressive'], ['리더십이 있다', 'Natural leader']],
  '토': [['안정감을 준다', 'Gives stability'], ['신뢰도가 높다', 'Highly trustworthy'], ['포용력이 크다', 'Very embracing']],
  '금': [['결단력이 있다', 'Decisive'], ['원칙이 분명하다', 'Clear principles'], ['집중력이 뛰어나다', 'Exceptional focus']],
  '수': [['적응력이 좋다', 'Adaptable'], ['관찰력이 뛰어나다', 'Great observer'], ['창의적 사고를 한다', 'Creative thinker']],
};
const STEM_WEAKNESSES: Record<string, [string, string][]> = {
  '목': [['고집이 셀 수 있다', 'Can be stubborn'], ['양보를 어려워한다', 'Finds compromise hard']],
  '화': [['급한 성격이 있다', 'Can be impatient'], ['감정 기복이 있다', 'Emotional ups and downs']],
  '토': [['변화를 꺼린다', 'Resists change'], ['우유부단할 수 있다', 'Can be indecisive']],
  '금': [['융통성이 부족하다', 'Lacks flexibility'], ['차갑게 보일 수 있다', 'Can seem cold']],
  '수': [['우울해지기 쉽다', 'Prone to melancholy'], ['결정이 느리다', 'Slow to decide']],
};

function getStrengths(character: GapjaCharacter, t: (ko: string, en: string) => string): string[] {
  const items = STEM_STRENGTHS[character.stem.oh] ?? STEM_STRENGTHS['목'];
  return items.map(([ko, en]) => t(ko, en));
}

function getWeaknesses(character: GapjaCharacter, t: (ko: string, en: string) => string): string[] {
  const items = STEM_WEAKNESSES[character.stem.oh] ?? STEM_WEAKNESSES['목'];
  return items.map(([ko, en]) => t(ko, en));
}

function CharacterDetail({ character, isMine }: { character: GapjaCharacter; isMine: boolean }) {
  const { t } = useLang();
  const tone = OH_TONE[character.stem.oh];
  const imgSrc = `/saju/characters/${character.id}.png`;
  const [hasCustomImg, setHasCustomImg] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setHasCustomImg(true);
    img.onerror = () => setHasCustomImg(false);
    img.src = imgSrc;
  }, [imgSrc]);

  return (
    <div
      className="relative mb-4 rounded-[24px] bg-white overflow-hidden flex"
      style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
    >
      {/* 좌: 이미지 — 정사각형 */}
      <div
        className="w-[36%] shrink-0 relative overflow-hidden"
        style={{ background: tone.bg }}
      >
        {isMine && (
          <span
            className="absolute top-2.5 left-2.5 z-10 rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
            style={{ background: SAJU.warmDeep }}
          >
            {t('나', 'Me')}
          </span>
        )}
        {hasCustomImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgSrc}
            alt={`${character.stem.ko}${character.branch.ko}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ZodiacIcon branch={character.branch.hanja} size={72} />
          </div>
        )}
      </div>

      {/* 우: 모든 텍스트 정보 */}
      <div className="flex-1 min-w-0 p-4 flex flex-col justify-center text-left tracking-wide" style={{ background: tone.bg }}>
        {/* 오행 기운 */}
        <p className="text-[13px] font-black mb-2" style={{ color: tone.fg }}>
          {character.stem.oh} {t('기운', 'energy')}
        </p>

        {/* 이름 */}
        <h3 className="text-[24px] font-black leading-tight" style={{ color: SAJU.ink, fontFamily: SERIF }}>
          {character.stem.ko}{character.branch.ko}
          <span className="text-[14px] font-semibold ml-1" style={{ color: SAJU.inkSub }}>
            {character.stem.hanja}{character.branch.hanja}
          </span>
        </h3>

        {/* 키워드 */}
        <p className="text-[15px] font-bold mt-1" style={{ color: tone.fg }}>
          {character.stem.keyword}
        </p>

        {/* 한줄 설명 */}
        <p className="text-[14px] leading-relaxed mt-3 mb-3" style={{ color: SAJU.ink }}>
          &quot;{character.branch.mood}&quot;
        </p>

        {/* 강점 */}
        <div className="mb-2.5">
          <p className="text-[12px] font-bold mb-1" style={{ color: tone.fg }}>
            {t('강점', 'Strengths')}
          </p>
          <ul className="space-y-0.5">
            {getStrengths(character, t).map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[13.5px] leading-snug" style={{ color: SAJU.inkSoft }}>
                <span className="shrink-0" style={{ color: tone.fg }}>+</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 약점 */}
        <div>
          <p className="text-[12px] font-bold mb-1" style={{ color: '#9CA3AF' }}>
            {t('약점', 'Weaknesses')}
          </p>
          <ul className="space-y-0.5">
            {getWeaknesses(character, t).map((w, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[13.5px] leading-snug" style={{ color: SAJU.inkSub }}>
                <span className="shrink-0">-</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}


/** 커스텀 이미지가 있으면 이미지, 없으면 ZodiacIcon 폴백 */
function CharacterIcon({ id, branch, size, tone }: { id: string; branch: string; size: number; tone: { bg: string; fg: string } }) {
  const src = `/saju/characters/${id}.png`;
  const [hasImg, setHasImg] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setHasImg(true);
    img.onerror = () => setHasImg(false);
    img.src = src;
  }, [src]);

  if (hasImg) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={id} className="w-full h-full object-cover" />;
  }
  return <ZodiacIcon branch={branch} size={size} />;
}

/** 상세 카드 하단에 커스텀 일러스트 표시 — 이미지 존재 시에만 렌더 */
function DetailIllustration({ id }: { id: string }) {
  const src = `/saju/characters/${id}.png`;
  const [hasImg, setHasImg] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setHasImg(true);
    img.onerror = () => setHasImg(false);
    img.src = src;
  }, [src]);

  if (!hasImg) return null;

  return (
    <div className="mt-5 w-full max-w-[240px] mx-auto">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={id}
        className="w-full h-auto object-contain rounded-2xl"
      />
    </div>
  );
}
